import { randomUUID } from 'node:crypto';

/**
 * Confirmation State Machine
 * 
 * Implements the two-phase write pattern per AI Guardrail Spec v0.1 Rule 4:
 * "Writes are two-phase: propose (arguments frozen in pending-action store), then confirm. Only stored arguments execute."
 * 
 * States: COLLECTING -> PROPOSED -> EXECUTING -> SUCCEEDED / FAILED / CANCELLED / EXPIRED
 */

export enum PendingActionState {
  COLLECTING = 'collecting',
  PROPOSED = 'proposed',
  EXECUTING = 'executing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export interface PendingAction<Args extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  tenantId: string;
  userId: string;
  toolName: string;
  arguments: Args;
  state: PendingActionState;
  confirmToken?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  result?: unknown;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface ProposeActionOptions<Args extends Record<string, unknown>> {
  tenantId: string;
  userId: string;
  toolName: string;
  arguments: Args;
  ttlMinutes?: number;
  maxRetries?: number;
}

export interface ConfirmActionOptions {
  actionId: string;
  confirmToken: string;
  userId: string;
}

export interface ExecuteActionOptions {
  actionId: string;
  executor: () => Promise<unknown>;
}

export interface StateMachineConfig {
  defaultTtlMinutes: number;
  maxRetries: number;
  cleanupIntervalMinutes: number;
}

import { Injectable, Optional, OnModuleDestroy } from '@nestjs/common';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: StateMachineConfig = {
  defaultTtlMinutes: 5,
  maxRetries: 3,
  cleanupIntervalMinutes: 10,
};

/**
 * Confirmation State Machine Implementation
 * 
 * Thread-safe state transitions with validation.
 * All state changes are explicit and auditable.
 */
@Injectable()
export class ConfirmationStateMachine implements OnModuleDestroy {
  private store: Map<string, PendingAction> = new Map();
  private config: StateMachineConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(@Optional() config?: Partial<StateMachineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTimer();
  }

  onModuleDestroy(): void {
    this.stop();
  }

  /**
   * Phase 1: Propose an action (freeze arguments)
   * Creates a pending action in PROPOSED state with a confirmation token.
   */
  propose<Args extends Record<string, unknown>>(options: ProposeActionOptions<Args>): PendingAction<Args> {
    const { tenantId, userId, toolName, arguments: args, ttlMinutes, maxRetries } = options;
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (ttlMinutes || this.config.defaultTtlMinutes) * 60 * 1000);
    const confirmToken = this.generateToken();
    const id = this.generateId();

    const action: PendingAction<Args> = {
      id,
      tenantId,
      userId,
      toolName,
      arguments: args,
      state: PendingActionState.PROPOSED,
      confirmToken,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: maxRetries || this.config.maxRetries,
    };

    this.store.set(id, action);
    return action;
  }

  /**
   * Phase 2: Confirm a proposed action
   * Validates token, checks expiry, transitions to EXECUTING.
   */
  confirm(options: ConfirmActionOptions): PendingAction {
    const { actionId, confirmToken, userId } = options;
    
    const action = this.store.get(actionId);
    if (!action) {
      throw new Error(`Pending action not found: ${actionId}`);
    }

    // Validate ownership
    if (action.userId !== userId) {
      throw new Error('Unauthorized: action belongs to different user');
    }

    // Validate state
    if (action.state !== PendingActionState.PROPOSED) {
      throw new Error(`Invalid state for confirmation: ${action.state}. Expected: ${PendingActionState.PROPOSED}`);
    }

    // Validate token
    if (action.confirmToken !== confirmToken) {
      throw new Error('Invalid confirmation token');
    }

    // Validate expiry
    if (new Date() > action.expiresAt) {
      action.state = PendingActionState.EXPIRED;
      action.updatedAt = new Date();
      this.store.set(actionId, action);
      throw new Error('Confirmation token expired');
    }

    // Transition to executing
    action.state = PendingActionState.EXECUTING;
    action.updatedAt = new Date();
    this.store.set(actionId, action);

    return action;
  }

  /**
   * Execute the confirmed action
   * Runs the executor function and updates state based on result.
   */
  async execute<Args extends Record<string, unknown>, Result>(
    options: ExecuteActionOptions
  ): Promise<{ action: PendingAction<Args>; result: Result }> {
    const { actionId, executor } = options;
    
    const action = this.store.get(actionId) as PendingAction<Args> | undefined;
    if (!action) {
      throw new Error(`Pending action not found: ${actionId}`);
    }

    if (action.state !== PendingActionState.EXECUTING) {
      throw new Error(`Invalid state for execution: ${action.state}. Expected: ${PendingActionState.EXECUTING}`);
    }

    try {
      const result = await executor() as Result;
      
      action.state = PendingActionState.SUCCEEDED;
      action.result = result;
      action.updatedAt = new Date();
      this.store.set(actionId, action);

      return { action, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if we should retry
      if (action.retryCount < action.maxRetries) {
        action.retryCount++;
        action.state = PendingActionState.PROPOSED; // Back to proposed for retry
        action.error = errorMessage;
        action.updatedAt = new Date();
        this.store.set(actionId, action);
        throw error; // Re-throw for caller to handle retry
      }

      // Max retries exceeded
      action.state = PendingActionState.FAILED;
      action.error = errorMessage;
      action.updatedAt = new Date();
      this.store.set(actionId, action);
      throw error;
    }
  }

  /**
   * Cancel a pending action
   */
  cancel(actionId: string, userId: string): PendingAction {
    const action = this.store.get(actionId);
    if (!action) {
      throw new Error(`Pending action not found: ${actionId}`);
    }

    if (action.userId !== userId) {
      throw new Error('Unauthorized: action belongs to different user');
    }

    if (action.state === PendingActionState.SUCCEEDED || action.state === PendingActionState.FAILED) {
      throw new Error(`Cannot cancel action in terminal state: ${action.state}`);
    }

    action.state = PendingActionState.CANCELLED;
    action.updatedAt = new Date();
    this.store.set(actionId, action);

    return action;
  }

  /**
   * Get action by ID
   */
  get(actionId: string): PendingAction | undefined {
    return this.store.get(actionId);
  }

  /**
   * Get all pending actions for a user
   */
  getByUser(userId: string): PendingAction[] {
    return Array.from(this.store.values()).filter(a => a.userId === userId);
  }

  /**
   * Get all pending actions for a tenant
   */
  getByTenant(tenantId: string): PendingAction[] {
    return Array.from(this.store.values()).filter(a => a.tenantId === tenantId);
  }

  /**
   * Clean up expired actions
   */
  cleanup(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [id, action] of this.store.entries()) {
      if (action.state === PendingActionState.PROPOSED && now > action.expiresAt) {
        action.state = PendingActionState.EXPIRED;
        action.updatedAt = now;
        cleaned++;
      }
      // Clean up old terminal state actions (older than 24 hours)
      const terminalStates = [PendingActionState.SUCCEEDED, PendingActionState.FAILED, PendingActionState.CANCELLED, PendingActionState.EXPIRED];
      if (terminalStates.includes(action.state)) {
        const ageHours = (now.getTime() - action.updatedAt.getTime()) / (1000 * 60 * 60);
        if (ageHours > 24) {
          this.store.delete(id);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMinutes * 60 * 1000);
    this.cleanupTimer?.unref?.();
  }

  /**
   * Stop cleanup timer (for testing/shutdown)
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Generate a secure random ID
   */
  private generateId(): string {
    return randomUUID();
  }

  /**
   * Generate a secure confirmation token
   */
  private generateToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Register an action from persistent store into state machine memory
   */
  registerExternalAction(action: PendingAction): void {
    this.store.set(action.id, action);
  }

  /**
   * Get all actions (for admin/debugging)
   */
  getAll(): PendingAction[] {
    return Array.from(this.store.values());
  }

  /**
   * Get count by state
   */
  getCountsByState(): Record<PendingActionState, number> {
    const counts = Object.values(PendingActionState).reduce((acc, state) => {
      acc[state] = 0;
      return acc;
    }, {} as Record<PendingActionState, number>);

    for (const action of this.store.values()) {
      counts[action.state]++;
    }

    return counts;
  }
}

/**
 * Factory function for creating a state machine with default config
 */
export function createConfirmationStateMachine(config?: Partial<StateMachineConfig>): ConfirmationStateMachine {
  return new ConfirmationStateMachine(config);
}

/**
 * Type-safe action creation helpers
 */
export function createProposeOptions<Args extends Record<string, unknown>>(
  tenantId: string,
  userId: string,
  toolName: string,
  args: Args,
  ttlMinutes?: number
): ProposeActionOptions<Args> {
  return { tenantId, userId, toolName, arguments: args, ttlMinutes };
}

export function createConfirmOptions(
  actionId: string,
  confirmToken: string,
  userId: string
): ConfirmActionOptions {
  return { actionId, confirmToken, userId };
}