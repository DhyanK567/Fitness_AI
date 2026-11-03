import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { Prisma } from '@prisma/client';
import {
  ConfirmationStateMachine,
  PendingActionState,
} from './orchestrator/confirmation-state-machine';

export interface CreatePendingActionInput {
  tenantId: string;
  userId: string;
  conversationId?: string;
  actionType: string;
  payload: Record<string, unknown>;
  proposedBy: string;
  summary?: string;
  expiresAt: Date;
  confirmToken?: string;
  idempotencyKey?: string;
}

export interface PendingActionQueryOptions {
  page?: number;
  limit?: number;
  status?: string;
}

export interface ExecutionResult<T = unknown> {
  action: Prisma.PendingActionGetPayload<{}>;
  result?: T;
}

export interface ActionReconcilerResult {
  resolved: boolean;
  succeeded?: boolean;
  result?: unknown;
  error?: string;
}

export type ActionReconciler = (
  action: Prisma.PendingActionGetPayload<{}>,
) => Promise<ActionReconcilerResult>;

function secureTokenEquals(supplied?: string | null, stored?: string | null): boolean {
  if (!supplied || !stored) {
    return false;
  }
  const suppliedBuf = Buffer.from(supplied, 'utf8');
  const storedBuf = Buffer.from(stored, 'utf8');
  return suppliedBuf.length === storedBuf.length && crypto.timingSafeEqual(suppliedBuf, storedBuf);
}

@Injectable()
export class PendingActionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly stateMachine?: ConfirmationStateMachine,
  ) {}

  /**
   * Persist a new proposed action to PostgreSQL within the tenant transaction context.
   */
  async create(input: CreatePendingActionInput): Promise<Prisma.PendingActionGetPayload<{}>> {
    const confirmToken = input.confirmToken || crypto.randomBytes(32).toString('hex');

    return this.prisma.withTenant(input.tenantId, async (tx) => {
      // Check idempotency if a key was provided
      if (input.idempotencyKey) {
        const existing = await tx.pendingAction.findFirst({
          where: { idempotencyKey: input.idempotencyKey, tenantId: input.tenantId },
        });
        if (existing) {
          throw new ConflictException('Action with this idempotency key already exists');
        }
      }

      return tx.pendingAction.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          conversationId: input.conversationId,
          actionType: input.actionType,
          payload: input.payload as Prisma.InputJsonValue,
          proposedBy: input.proposedBy,
          summary: input.summary,
          expiresAt: input.expiresAt,
          confirmToken,
          idempotencyKey: input.idempotencyKey,
          status: 'proposed',
        },
      });
    });
  }

  /**
   * Retrieve a pending action by ID within the tenant context.
   */
  async findById(tenantId: string, id: string): Promise<Prisma.PendingActionGetPayload<{}>> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const action = await tx.pendingAction.findFirst({
        where: { id, tenantId },
      });

      if (!action) {
        throw new NotFoundException('Pending action not found');
      }

      return action;
    });
  }

  /**
   * List pending actions for a tenant with pagination and optional status filter.
   */
  async findByTenant(tenantId: string, options: PendingActionQueryOptions = {}) {
    const { page = 1, limit = 20, status } = options;
    const skip = (page - 1) * limit;

    return this.prisma.withTenant(tenantId, async (tx) => {
      const statusCondition = status
        ? status.includes(',')
          ? { in: status.split(',').map((s) => s.trim()) }
          : status
        : undefined;

      const where: Prisma.PendingActionWhereInput = {
        tenantId,
        ...(statusCondition ? { status: statusCondition } : {}),
      };

      const [actions, total] = await Promise.all([
        tx.pendingAction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        tx.pendingAction.count({ where }),
      ]);

      return {
        actions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    });
  }

  /**
   * Approve a proposed action (without executing it yet).
   * Validates confirmation token and expiry, then atomically sets status to 'approved'.
   */
  async approve(tenantId: string, actionId: string, userId: string, confirmToken: string): Promise<Prisma.PendingActionGetPayload<{}>> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const action = await tx.pendingAction.findFirst({
        where: { id: actionId, tenantId },
      });

      if (!action) {
        throw new NotFoundException('Pending action not found');
      }

      if (action.status !== 'proposed') {
        throw new ConflictException(`Cannot approve action in status: ${action.status}`);
      }

      if (new Date() > action.expiresAt) {
        await tx.pendingAction.update({
          where: { id: actionId },
          data: { status: 'expired' },
        });
        throw new ConflictException('Confirmation token expired');
      }

      if (!action.confirmToken || !secureTokenEquals(confirmToken, action.confirmToken)) {
        throw new ForbiddenException('Invalid confirmation token');
      }

      const updateResult = await tx.pendingAction.updateMany({
        where: { id: actionId, tenantId, status: 'proposed' },
        data: {
          status: 'approved',
          approvedBy: userId,
          confirmToken: null, // Clear token after use to prevent replay
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException('Action is no longer in proposed status or has already been processed');
      }

      return (await tx.pendingAction.findUnique({
        where: { id: actionId },
      }))!;
    });
  }

  /**
   * Atomic two-phase execution: confirms token, enforces expiry, transitions to 'executing',
   * runs the business mutation using the frozen database arguments, and records final state.
   */
  async confirmAndExecute<T = unknown>(
    tenantId: string,
    actionId: string,
    userId: string,
    confirmToken: string,
    executor: (action: Prisma.PendingActionGetPayload<{}>) => Promise<T>,
  ): Promise<ExecutionResult<T>> {
    // Phase 1: Validate action, token, expiry, and transition to 'executing' atomically
    const action = await this.prisma.withTenant(tenantId, async (tx) => {
      const found = await tx.pendingAction.findFirst({
        where: { id: actionId, tenantId },
      });

      if (!found) {
        throw new NotFoundException('Pending action not found');
      }

      if (found.status !== 'proposed') {
        throw new ConflictException(`Cannot confirm action in status: ${found.status}`);
      }

      if (new Date() > found.expiresAt) {
        await tx.pendingAction.update({
          where: { id: actionId },
          data: { status: 'expired' },
        });
        throw new ConflictException('Confirmation token expired');
      }

      if (!found.confirmToken || !secureTokenEquals(confirmToken, found.confirmToken)) {
        throw new ForbiddenException('Invalid confirmation token');
      }

      // Atomic lock-free state transition: only succeeds if still 'proposed'
      const updateResult = await tx.pendingAction.updateMany({
        where: { id: actionId, tenantId, status: 'proposed' },
        data: {
          status: 'executing',
          approvedBy: userId,
          executedBy: userId,
          confirmToken: null, // Invalidate token immediately
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException('Action is no longer in proposed status or has already been processed');
      }

      return found;
    });

    // Phase 2: Execute the mutation using frozen payload from DB
    try {
      const result = await executor(action);

      const executedAction = await this.prisma.withTenant(tenantId, async (tx) => {
        return tx.pendingAction.update({
          where: { id: actionId },
          data: {
            status: 'executed',
            executedAt: new Date(),
            result: result as Prisma.InputJsonValue,
          },
        });
      });

      return { action: executedAction, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.pendingAction.update({
          where: { id: actionId },
          data: {
            status: 'failed',
            error: errorMessage,
          },
        });
      });

      throw error;
    }
  }

  /**
   * Reject a pending action.
   */
  async reject(tenantId: string, actionId: string, userId: string, reason: string): Promise<Prisma.PendingActionGetPayload<{}>> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const action = await tx.pendingAction.findFirst({
        where: { id: actionId, tenantId },
      });

      if (!action) {
        throw new NotFoundException('Pending action not found');
      }

      if (!['proposed', 'approved'].includes(action.status)) {
        throw new ConflictException(`Cannot reject action in status: ${action.status}`);
      }

      return tx.pendingAction.update({
        where: { id: actionId },
        data: {
          status: 'rejected',
          rejectedBy: userId,
          rejectionReason: reason,
        },
      });
    });
  }

  /**
   * Cancel a proposed pending action.
   */
  async cancel(tenantId: string, actionId: string, userId: string): Promise<Prisma.PendingActionGetPayload<{}>> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const action = await tx.pendingAction.findFirst({
        where: { id: actionId, tenantId },
      });

      if (!action) {
        throw new NotFoundException('Pending action not found');
      }

      if (action.status !== 'proposed') {
        throw new ConflictException(`Cannot cancel action in status: ${action.status}`);
      }

      if (action.proposedBy !== userId && action.userId !== userId) {
        throw new ForbiddenException('Only the proposer can cancel this action');
      }

      return tx.pendingAction.update({
        where: { id: actionId },
        data: { status: 'cancelled' },
      });
    });
  }

  /**
   * Execute an already approved action.
   */
  async execute<T = unknown>(
    tenantId: string,
    actionId: string,
    userId: string,
    idempotencyKey?: string,
    executor?: (action: Prisma.PendingActionGetPayload<{}>) => Promise<T>,
  ): Promise<Prisma.PendingActionGetPayload<{}>> {
    const action = await this.prisma.withTenant(tenantId, async (tx) => {
      const found = await tx.pendingAction.findFirst({
        where: { id: actionId, tenantId },
      });

      if (!found) {
        throw new NotFoundException('Pending action not found');
      }

      if (found.status !== 'approved') {
        throw new ConflictException(`Can only execute approved actions, current status: ${found.status}`);
      }

      // Check idempotency
      if (idempotencyKey && found.idempotencyKey !== idempotencyKey) {
        throw new ConflictException('Idempotency key mismatch');
      }

      const updateResult = await tx.pendingAction.updateMany({
        where: { id: actionId, tenantId, status: 'approved' },
        data: {
          status: 'executing',
          executedBy: userId,
          executedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException('Action is no longer in approved status');
      }

      return found;
    });

    if (executor) {
      try {
        const result = await executor(action);
        return await this.prisma.withTenant(tenantId, async (tx) => {
          return tx.pendingAction.update({
            where: { id: actionId },
            data: {
              status: 'executed',
              executedAt: new Date(),
              result: result as Prisma.InputJsonValue,
            },
          });
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.prisma.withTenant(tenantId, async (tx) => {
          await tx.pendingAction.update({
            where: { id: actionId },
            data: {
              status: 'failed',
              error: errorMessage,
            },
          });
        });
        throw error;
      }
    }

    return this.findById(tenantId, actionId);
  }

  async markExecuted(tenantId: string, actionId: string, result: Record<string, unknown>): Promise<Prisma.PendingActionGetPayload<{}>> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.pendingAction.update({
        where: { id: actionId },
        data: {
          status: 'executed',
          executedAt: new Date(),
          result: result as Prisma.InputJsonValue,
        },
      });
    });
  }

  async markFailed(tenantId: string, actionId: string, error: string): Promise<Prisma.PendingActionGetPayload<{}>> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.pendingAction.update({
        where: { id: actionId },
        data: {
          status: 'failed',
          error,
        },
      });
    });
  }

  /**
   * Expire actions past their expiry time.
   */
  /**
   * Sweep and recover actions stuck in 'executing' state past a lock timeout.
   * Does not interpret elapsed time alone as proof of failure.
   * If a reconciler callback is provided, reconciles against authoritative external state.
   * If external state confirmed success, transitions to 'executed'.
   * If external state confirmed failure, transitions to 'failed'.
   * If outcome is unknown, preserves OUTCOME_UNCERTAIN to prevent duplicate re-execution.
   */
  async recoverStaleExecutingActions(
    tenantId?: string,
    staleTimeoutMs: number = 5 * 60 * 1000,
    reconciler?: ActionReconciler,
  ): Promise<number> {
    const staleThreshold = new Date(Date.now() - staleTimeoutMs);

    const executeInScope = async (tx: any, scopeTenantId?: string): Promise<number> => {
      const staleActions = await tx.pendingAction.findMany({
        where: {
          ...(scopeTenantId ? { tenantId: scopeTenantId } : {}),
          status: 'executing',
          updatedAt: { lt: staleThreshold },
        },
      });

      if (staleActions.length === 0) {
        return 0;
      }

      let recoveredCount = 0;

      for (const action of staleActions) {
        let reconciliation: ActionReconcilerResult = { resolved: false };

        if (reconciler) {
          try {
            reconciliation = await reconciler(action);
          } catch (err) {
            reconciliation = {
              resolved: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }

        if (reconciliation.resolved && reconciliation.succeeded) {
          // Authoritative external state confirmed operation completed successfully before crash
          const update = await tx.pendingAction.updateMany({
            where: {
              id: action.id,
              ...(scopeTenantId ? { tenantId: scopeTenantId } : {}),
              status: 'executing',
            },
            data: {
              status: 'executed',
              executedAt: action.executedAt || new Date(),
              result: (reconciliation.result || { reconciled: true }) as Prisma.InputJsonValue,
              error: null,
            },
          });
          recoveredCount += update.count;
        } else if (reconciliation.resolved && !reconciliation.succeeded) {
          // Authoritative external state confirmed operation failed downstream
          const update = await tx.pendingAction.updateMany({
            where: {
              id: action.id,
              ...(scopeTenantId ? { tenantId: scopeTenantId } : {}),
              status: 'executing',
            },
            data: {
              status: 'failed',
              error: reconciliation.error || 'Operation confirmed failed by external reconciliation',
              result: {
                reconciled: true,
                outcome: 'confirmed_failure',
                reconciledAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
          recoveredCount += update.count;
        } else {
          // Outcome remains unknown/unresolved. Do not interpret elapsed time as definitive success or simple failure.
          // Preserve explicit OUTCOME_UNCERTAIN error and structured result to prevent unsafe duplicate re-execution.
          const update = await tx.pendingAction.updateMany({
            where: {
              id: action.id,
              ...(scopeTenantId ? { tenantId: scopeTenantId } : {}),
              status: 'executing',
            },
            data: {
              status: 'failed',
              error: 'OUTCOME_UNCERTAIN: Action was executing when worker timed out or disconnected. Status must be reconciled before re-executing.',
              result: {
                outcome: 'uncertain',
                unresolved: true,
                staleTimeout: true,
                reason: reconciliation.error || 'EXTERNAL_OUTCOME_UNKNOWN',
                reconciledAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
          recoveredCount += update.count;
        }
      }

      return recoveredCount;
    };

    if (tenantId) {
      return this.prisma.withTenant(tenantId, async (tx) => executeInScope(tx, tenantId));
    }

    return executeInScope(this.prisma);
  }

  async expireOldActions(tenantId?: string): Promise<number> {
    const now = new Date();

    if (tenantId) {
      return this.prisma.withTenant(tenantId, async (tx) => {
        const result = await tx.pendingAction.updateMany({
          where: {
            tenantId,
            status: { in: ['proposed', 'executing'] },
            expiresAt: { lt: now },
          },
          data: { status: 'expired' },
        });
        return result.count;
      });
    }

    const result = await this.prisma.pendingAction.updateMany({
      where: {
        status: { in: ['proposed', 'executing'] },
        expiresAt: { lt: now },
      },
      data: { status: 'expired' },
    });

    return result.count;
  }

  canApprove(action: Prisma.PendingActionGetPayload<{}>, userId: string): boolean {
    return action.proposedBy !== userId;
  }
}