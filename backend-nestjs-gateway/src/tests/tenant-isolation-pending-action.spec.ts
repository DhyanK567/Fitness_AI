import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaService } from '../common/prisma.service';
import { ConversationService } from '../ai/conversation.service';
import { PendingActionService } from '../ai/pending-action.service';
import { ConversationOrchestrator } from '../ai/orchestrator/conversation-loop';
import { PendingActionState } from '../ai/orchestrator/confirmation-state-machine';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';

describe('Phase 2 - PostgreSQL Tenant Isolation & Pending-Action Persistence', () => {
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const TENANT_B = 'b0000000-0000-0000-0000-000000000002';
  const USER_A = 'u0000000-0000-0000-0000-000000000001';
  const USER_B = 'u0000000-0000-0000-0000-000000000002';

  describe('1. PostgreSQL RLS & Session Variables Alignment in PrismaService', () => {
    let prismaService: PrismaService;
    let mockTx: any;

    beforeEach(() => {
      mockTx = {
        $queryRaw: jest.fn().mockImplementation(async (...args: any[]) => []),
        conversation: {
          create: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
        },
        message: {
          create: jest.fn(),
        },
        pendingAction: {
          create: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      prismaService = new PrismaService();
      jest.spyOn(prismaService, '$transaction').mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });
    });

    it('should reject invalid / non-canonical tenant IDs before hitting the database', async () => {
      await expect(
        prismaService.withTenant('not-a-uuid', async () => 'ok'),
      ).rejects.toThrow('A canonical tenant UUID is required');

      await expect(
        prismaService.withTenant('tenant-123', async () => 'ok'),
      ).rejects.toThrow('A canonical tenant UUID is required');

      expect(mockTx.$queryRaw).not.toHaveBeenCalled();
    });

    it('should set BOTH app.tenant_id and app.current_tenant transaction-locally with is_local=true', async () => {
      let executedInsideTx = false;

      const result = await prismaService.withTenant(TENANT_A, async (tx) => {
        executedInsideTx = true;
        return 'executed';
      });

      expect(result).toBe('executed');
      expect(executedInsideTx).toBe(true);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);

      // Verify the query string passed to $queryRaw
      const queryCall = (mockTx.$queryRaw as any).mock.calls[0];
      const rawQueryStrings = queryCall[0];
      const queryString = Array.isArray(rawQueryStrings) ? rawQueryStrings.join('') : String(rawQueryStrings);

      // Verify both session variable settings are included in the query
      expect(queryString).toContain("set_config('app.tenant_id'");
      expect(queryString).toContain("set_config('app.current_tenant'");

      // Verify is_local parameter (true) is used to prevent connection-pool contamination
      expect(queryString).toContain('true');

      // Verify the tenant ID is passed into the query parameters
      expect(queryCall).toContain(TENANT_A);
    });

    it('should ensure connection-pool safety by wrapping work in $transaction', async () => {
      const transactionSpy = jest.spyOn(prismaService, '$transaction');

      await prismaService.withTenant(TENANT_A, async (tx) => {
        return 'done';
      });

      expect(transactionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Tenant Isolation in ConversationService', () => {
    let conversationService: ConversationService;
    let mockTx: any;
    let prismaService: PrismaService;

    beforeEach(() => {
      mockTx = {
        $queryRaw: jest.fn().mockImplementation(async () => []),
        conversation: {
          create: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
        },
        message: {
          create: jest.fn(),
        },
      };

      prismaService = new PrismaService();
      jest.spyOn(prismaService, '$transaction').mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      conversationService = new ConversationService(prismaService);
    });

    it('should create conversation with tenant context established', async () => {
      mockTx.conversation.create.mockResolvedValue({
        id: 'c-1',
        tenantId: TENANT_A,
        userId: USER_A,
        title: 'New Chat',
      });

      const conv = await conversationService.create({
        tenantId: TENANT_A,
        userId: USER_A,
        title: 'New Chat',
      });

      expect(conv.id).toBe('c-1');
      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.conversation.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_A,
          userId: USER_A,
          title: 'New Chat',
          status: 'active',
        },
      });
    });

    it('should isolate conversation reads across tenants (cross-tenant access throws 404)', async () => {
      // Tenant A can find their own conversation
      mockTx.conversation.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.tenantId === TENANT_A && where.id === 'conv-100') {
          return { id: 'conv-100', tenantId: TENANT_A, userId: USER_A };
        }
        return null;
      });

      const found = await conversationService.findById(TENANT_A, 'conv-100');
      expect(found.id).toBe('conv-100');

      // Tenant B querying the same conversation ID gets 404 NotFoundException
      await expect(
        conversationService.findById(TENANT_B, 'conv-100'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should prevent cross-tenant message injection', async () => {
      // Conversation belongs to Tenant A
      mockTx.conversation.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.tenantId === TENANT_A && where.id === 'conv-100') {
          return { id: 'conv-100', tenantId: TENANT_A };
        }
        return null; // Tenant B will find null
      });

      // Tenant B attempts to add a message to Tenant A's conversation
      await expect(
        conversationService.addMessage({
          conversationId: 'conv-100',
          tenantId: TENANT_B,
          role: 'user',
          content: 'Malicious injection attempt',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(mockTx.message.create).not.toHaveBeenCalled();
    });
  });

  describe('3. Pending-Action Persistence in PendingActionService', () => {
    let pendingActionService: PendingActionService;
    let mockTx: any;
    let prismaService: PrismaService;

    beforeEach(() => {
      mockTx = {
        $queryRaw: jest.fn().mockImplementation(async () => []),
        pendingAction: {
          create: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          findUnique: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      prismaService = new PrismaService();
      jest.spyOn(prismaService, '$transaction').mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      pendingActionService = new PendingActionService(prismaService);
    });

    it('should persist a new proposed action with a 64-character cryptographically secure token', async () => {
      mockTx.pendingAction.findFirst.mockResolvedValue(null);
      mockTx.pendingAction.create.mockImplementation(async ({ data }: any) => ({
        id: 'pa-001',
        ...data,
      }));

      const action = await pendingActionService.create({
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Rahul Sharma', phone: '9876543210' },
        proposedBy: USER_A,
        summary: 'Create member Rahul Sharma',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      expect(action.id).toBe('pa-001');
      expect(action.status).toBe('proposed');
      expect(action.confirmToken).toBeDefined();
      expect(action.confirmToken!.length).toBe(64); // 32 bytes hex = 64 characters
      expect(mockTx.pendingAction.create).toHaveBeenCalledTimes(1);
    });

    it('should prevent duplicate actions with identical idempotencyKey', async () => {
      mockTx.pendingAction.findFirst.mockResolvedValue({
        id: 'existing-action',
        idempotencyKey: 'idem-key-123',
        tenantId: TENANT_A,
      });

      await expect(
        pendingActionService.create({
          tenantId: TENANT_A,
          userId: USER_A,
          actionType: 'createMember',
          payload: { fullName: 'Test' },
          proposedBy: USER_A,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          idempotencyKey: 'idem-key-123',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockTx.pendingAction.create).not.toHaveBeenCalled();
    });

    it('should enforce cross-tenant isolation on pending actions', async () => {
      mockTx.pendingAction.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.tenantId === TENANT_A && where.id === 'pa-100') {
          return { id: 'pa-100', tenantId: TENANT_A, status: 'proposed' };
        }
        return null;
      });

      const found = await pendingActionService.findById(TENANT_A, 'pa-100');
      expect(found.id).toBe('pa-100');

      // Tenant B cannot view Tenant A's pending action
      await expect(
        pendingActionService.findById(TENANT_B, 'pa-100'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject approval if confirmation token is invalid', async () => {
      mockTx.pendingAction.findFirst.mockResolvedValue({
        id: 'pa-100',
        tenantId: TENANT_A,
        status: 'proposed',
        confirmToken: 'valid-token-1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        pendingActionService.approve(TENANT_A, 'pa-100', USER_A, 'wrong-token'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
    });

    it('should reject approval and transition to expired if action has passed expiresAt', async () => {
      mockTx.pendingAction.findFirst.mockResolvedValue({
        id: 'pa-100',
        tenantId: TENANT_A,
        status: 'proposed',
        confirmToken: 'valid-token',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      await expect(
        pendingActionService.approve(TENANT_A, 'pa-100', USER_A, 'valid-token'),
      ).rejects.toThrow(ConflictException);

      // Verify action status transitioned to 'expired'
      expect(mockTx.pendingAction.update).toHaveBeenCalledWith({
        where: { id: 'pa-100' },
        data: { status: 'expired' },
      });
    });

    it('should atomically transition status and prevent duplicate concurrent approvals', async () => {
      mockTx.pendingAction.findFirst.mockResolvedValue({
        id: 'pa-100',
        tenantId: TENANT_A,
        status: 'proposed',
        confirmToken: 'valid-token',
        expiresAt: new Date(Date.now() + 60000),
      });

      // Simulate a concurrent race condition where another request already updated status
      mockTx.pendingAction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        pendingActionService.approve(TENANT_A, 'pa-100', USER_A, 'valid-token'),
      ).rejects.toThrow(ConflictException);
    });

    it('confirmAndExecute: executes mutation strictly with frozen database arguments', async () => {
      const frozenPayload = { fullName: 'Raj Patel', phone: '9876543210' };
      const storedAction = {
        id: 'pa-exec-1',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: frozenPayload,
        status: 'proposed',
        confirmToken: 'secret-token-123',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(storedAction);
      mockTx.pendingAction.updateMany.mockResolvedValue({ count: 1 });
      mockTx.pendingAction.update.mockResolvedValue({
        ...storedAction,
        status: 'executed',
        result: { memberId: 'MEM-007' },
      });

      let executedToolName: string | undefined;
      let executedArgs: any;

      const result = await pendingActionService.confirmAndExecute(
        TENANT_A,
        'pa-exec-1',
        USER_A,
        'secret-token-123',
        async (action) => {
          // Verify the arguments passed to executor match the frozen database record
          executedToolName = action.actionType;
          executedArgs = action.payload;
          return { memberId: 'MEM-007' };
        },
      );

      expect(executedToolName).toBe('createMember');
      expect(executedArgs).toEqual(frozenPayload);
      expect(result.action.status).toBe('executed');

      // Verify confirmToken was immediately cleared in atomic update to prevent reuse
      expect(mockTx.pendingAction.updateMany).toHaveBeenCalledWith({
        where: { id: 'pa-exec-1', tenantId: TENANT_A, status: 'proposed' },
        data: expect.objectContaining({
          status: 'executing',
          confirmToken: null,
        }),
      });
    });

    it('confirmAndExecute: records failure in database if executor throws', async () => {
      const storedAction = {
        id: 'pa-exec-fail',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Failing Member' },
        status: 'proposed',
        confirmToken: 'token-fail',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(storedAction);
      mockTx.pendingAction.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        pendingActionService.confirmAndExecute(
          TENANT_A,
          'pa-exec-fail',
          USER_A,
          'token-fail',
          async () => {
            throw new Error('ERP service timeout');
          },
        ),
      ).rejects.toThrow('ERP service timeout');

      // Verify status was marked as 'failed' with error recorded in DB
      expect(mockTx.pendingAction.update).toHaveBeenCalledWith({
        where: { id: 'pa-exec-fail' },
        data: {
          status: 'failed',
          error: 'ERP service timeout',
        },
      });
    });

    it('cancel: only allows the proposer to cancel an action', async () => {
      mockTx.pendingAction.findFirst.mockResolvedValue({
        id: 'pa-cancel-1',
        tenantId: TENANT_A,
        proposedBy: USER_A,
        userId: USER_A,
        status: 'proposed',
      });
      mockTx.pendingAction.update.mockResolvedValue({
        id: 'pa-cancel-1',
        status: 'cancelled',
      });

      // Different user cannot cancel
      await expect(
        pendingActionService.cancel(TENANT_A, 'pa-cancel-1', USER_B),
      ).rejects.toThrow(ForbiddenException);

      // Proposer can cancel
      const cancelled = await pendingActionService.cancel(TENANT_A, 'pa-cancel-1', USER_A);
      expect(cancelled.status).toBe('cancelled');
    });
  });

  describe('4. End-to-End Orchestrator & Persistence Integration', () => {
    let orchestrator: ConversationOrchestrator;
    let pendingActionService: PendingActionService;
    let mockLlmGateway: any;
    let mockAuditOutbox: any;
    let mockErpService: any;
    let mockObservability: any;
    let inMemoryDb: Map<string, any>;
    let mockPrisma: any;

    beforeEach(() => {
      inMemoryDb = new Map();

      // Simulated PostgreSQL database with tenant isolation and transactions
      mockPrisma = {
        withTenant: (jest.fn() as any).mockImplementation(async (tenantId: string, work: any) => {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
            throw new Error('A canonical tenant UUID is required');
          }
          const tx = {
            $queryRaw: jest.fn(),
            pendingAction: {
              create: (jest.fn() as any).mockImplementation(async ({ data }: any) => {
                const id = 'pa-' + Math.random().toString(36).slice(2, 9);
                const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
                inMemoryDb.set(id, record);
                return record;
              }),
              findFirst: (jest.fn() as any).mockImplementation(async ({ where }: any) => {
                for (const record of inMemoryDb.values()) {
                  if (record.id === where.id && record.tenantId === where.tenantId) {
                    return record;
                  }
                }
                return null;
              }),
              findMany: (jest.fn() as any).mockImplementation(async ({ where }: any) => {
                return Array.from(inMemoryDb.values()).filter(
                  (r) => r.tenantId === where.tenantId && (!where.status || r.status === where.status),
                );
              }),
              count: (jest.fn() as any).mockImplementation(async ({ where }: any) => {
                return Array.from(inMemoryDb.values()).filter(
                  (r) => r.tenantId === where.tenantId && (!where.status || r.status === where.status),
                ).length;
              }),
              update: (jest.fn() as any).mockImplementation(async ({ where, data }: any) => {
                const existing = inMemoryDb.get(where.id);
                if (!existing) throw new NotFoundException();
                const updated = { ...existing, ...data, updatedAt: new Date() };
                inMemoryDb.set(where.id, updated);
                return updated;
              }),
              updateMany: (jest.fn() as any).mockImplementation(async ({ where, data }: any) => {
                let count = 0;
                for (const [id, r] of inMemoryDb.entries()) {
                  if (r.id === where.id && r.tenantId === where.tenantId && (!where.status || r.status === where.status)) {
                    inMemoryDb.set(id, { ...r, ...data, updatedAt: new Date() });
                    count++;
                  }
                }
                return { count };
              }),
            },
          };
          return work(tx);
        }),
      };

      pendingActionService = new PendingActionService(mockPrisma as any);

      mockLlmGateway = {
        chat: jest.fn(),
      };
      mockAuditOutbox = {
        record: (jest.fn() as any).mockResolvedValue(undefined),
      };
      mockErpService = {
        call: (jest.fn() as any).mockResolvedValue({ success: true, member_id: 'MEM-101' }),
      };
      mockObservability = {
        recordLlmCall: (jest.fn() as any).mockResolvedValue(undefined),
        recordToolCall: (jest.fn() as any).mockResolvedValue(undefined),
        recordPendingAction: (jest.fn() as any).mockResolvedValue(undefined),
      };

      orchestrator = new ConversationOrchestrator(
        mockLlmGateway,
        mockAuditOutbox,
        mockErpService,
        mockObservability,
        pendingActionService,
      );
    });

    it('should persist chat proposals in PostgreSQL and allow retrieval via pendingActionService', async () => {
      // User requests member creation
      (mockLlmGateway.chat as any).mockResolvedValue({
        content: "I will create this member. Please confirm.",
        toolCalls: [],
        pendingAction: {
          toolName: 'createMember',
          arguments: { fullName: 'Priya Sharma', phone: '+919876543210' },
        },
      });

      const response = await orchestrator.processMessage(
        {
          tenantId: TENANT_A,
          tenantCode: 'TEST',
          userId: USER_A,
          role: 'front_desk',
          correlationId: 'corr-001',
        },
        'Create member Priya Sharma, phone +919876543210',
      );

      expect(response.pendingActionId).toBeDefined();
      expect(response.confirmToken).toBeDefined();
      expect(response.requiresConfirmation).toBe(true);

      // Verify the proposal is persisted in PostgreSQL
      const list = await pendingActionService.findByTenant(TENANT_A);
      expect(list.total).toBe(1);
      expect(list.actions[0].id).toBe(response.pendingActionId);
      expect(list.actions[0].actionType).toBe('createMember');
      expect(list.actions[0].payload).toEqual({ fullName: 'Priya Sharma', phone: '+919876543210' });
      expect(list.actions[0].status).toBe('proposed');
    });

    it('should survive application restart: new orchestrator instance can confirm action from database', async () => {
      // 1. Propose action on original orchestrator
      (mockLlmGateway.chat as any).mockResolvedValue({
        content: "Please confirm creating member Amit.",
        toolCalls: [],
        pendingAction: {
          toolName: 'createMember',
          arguments: { fullName: 'Amit Verma', phone: '+919123456789' },
        },
      });

      const proposalResponse = await orchestrator.processMessage(
        {
          tenantId: TENANT_A,
          tenantCode: 'TEST',
          userId: USER_A,
          role: 'front_desk',
          correlationId: 'corr-002',
        },
        'Create member Amit Verma, phone +919123456789',
      );

      const actionId = proposalResponse.pendingActionId!;
      const token = proposalResponse.confirmToken!;

      // 2. SIMULATE APPLICATION RESTART: Create a brand new orchestrator with empty in-memory state
      const restartedOrchestrator = new ConversationOrchestrator(
        mockLlmGateway,
        mockAuditOutbox,
        mockErpService,
        mockObservability,
        pendingActionService, // Points to persistent store
      );

      // 3. Confirm action on restarted instance
      const confirmResponse = await restartedOrchestrator.confirmPendingAction(
        {
          tenantId: TENANT_A,
          tenantCode: 'TEST',
          userId: USER_A,
          role: 'front_desk',
          correlationId: 'corr-003',
        },
        actionId,
        token,
      );

      expect(confirmResponse.state).toBe(PendingActionState.SUCCEEDED);
      expect(confirmResponse.response).toContain('Action completed successfully');

      // Verify database record has been updated to 'executed'
      const updatedAction = await pendingActionService.findById(TENANT_A, actionId);
      expect(updatedAction.status).toBe('executed');
      expect(updatedAction.result).toEqual({ success: true, member_id: 'MEM-101' });

      // Verify ERP was called with the original frozen arguments
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { fullName: 'Amit Verma', phone: '+919123456789' },
        }),
      );
    });

    it('should reject a second concurrent approval attempt on the same action', async () => {
      // Propose action
      (mockLlmGateway.chat as any).mockResolvedValue({
        content: "Please confirm.",
        toolCalls: [],
        pendingAction: {
          toolName: 'createMember',
          arguments: { fullName: 'Double Confirm', phone: '+919876543210' },
        },
      });

      const proposal = await orchestrator.processMessage(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'front_desk', correlationId: 'corr-004' },
        'Create member Double Confirm, phone +919876543210',
      );

      // First confirmation succeeds
      const firstConfirm = await orchestrator.confirmPendingAction(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'front_desk', correlationId: 'corr-005' },
        proposal.pendingActionId!,
        proposal.confirmToken!,
      );
      expect(firstConfirm.state).toBe(PendingActionState.SUCCEEDED);

      // Second confirmation fails
      const secondConfirm = await orchestrator.confirmPendingAction(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'front_desk', correlationId: 'corr-006' },
        proposal.pendingActionId!,
        proposal.confirmToken!,
      );
      expect(secondConfirm.state).toBe(PendingActionState.FAILED);
      expect(secondConfirm.error).toContain('Cannot confirm action in status: executed');
    });
  });
});
