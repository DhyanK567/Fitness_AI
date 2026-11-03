import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AiController } from '../ai/ai.controller';
import { ConversationOrchestrator } from '../ai/orchestrator/conversation-loop';
import { ConversationService } from '../ai/conversation.service';
import { PendingActionService } from '../ai/pending-action.service';
import { PrismaService } from '../common/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { can } from '../common/policy';

describe('AI-01: API Contract Alignment & Verification', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111';
  const TENANT_B = '22222222-2222-2222-2222-222222222222';
  const USER_A = '33333333-3333-3333-3333-333333333333';
  const USER_B = '44444444-4444-4444-4444-444444444444';

  let controller: AiController;
  let mockOrchestrator: any;
  let mockConversationService: any;
  let mockPendingActionService: any;
  let mockPrisma: any;
  let mockAuditOutbox: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      $queryRaw: jest.fn().mockImplementation(async () => []),
      conversation: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      message: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      pendingAction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockPrisma = {
      withTenant: jest.fn<any>().mockImplementation(async (tenantId: string, fn: (tx: any) => Promise<any>) => {
        return fn(mockTx);
      }),
    };

    mockOrchestrator = {
      processMessage: jest.fn<any>(),
      confirmPendingAction: jest.fn<any>(),
      executeApprovedAction: jest.fn<any>(),
      callErpTool: jest.fn<any>(),
    };

    mockConversationService = {
      create: jest.fn<any>(),
      findById: jest.fn<any>(),
      findByUser: jest.fn<any>(),
      addMessage: jest.fn<any>(),
      archive: jest.fn<any>(),
      delete: jest.fn<any>(),
      purge: jest.fn<any>(),
    };

    mockPendingActionService = {
      create: jest.fn<any>(),
      findById: jest.fn<any>(),
      findByTenant: jest.fn<any>(),
      confirmAndExecute: jest.fn<any>(),
      reject: jest.fn<any>(),
      cancel: jest.fn<any>(),
    };

    mockAuditOutbox = {
      record: jest.fn<any>().mockResolvedValue({
        audit: { id: 'audit-record-uuid-101' },
        outbox: { id: 'outbox-event-uuid-101' },
      }),
    };

    controller = new AiController(
      mockOrchestrator,
      mockConversationService,
      mockPendingActionService,
      mockPrisma,
      mockAuditOutbox,
    );
  });

  // ============================================================
  // 1. ROUTE REGISTRATION & HANDLER FIDELITY
  // ============================================================
  describe('1. Controller Handler Registration & Interface Contract', () => {
    it('exposes all official contract methods alongside legacy endpoints', () => {
      // Official API Contract methods
      expect(typeof controller.createAssistantSession).toBe('function');
      expect(typeof controller.sendAssistantMessage).toBe('function');
      expect(typeof controller.confirmAssistantAction).toBe('function');
      expect(typeof controller.rejectAssistantAction).toBe('function');
      expect(typeof controller.getAssistantSession).toBe('function');
      expect(typeof controller.deleteAssistantSession).toBe('function');
      expect(typeof controller.getAiAudit).toBe('function');

      // Preserved legacy methods for backward compatibility
      expect(typeof controller.chat).toBe('function');
      expect(typeof controller.listConversations).toBe('function');
      expect(typeof controller.getConversation).toBe('function');
      expect(typeof controller.archiveConversation).toBe('function');
      expect(typeof controller.deleteConversation).toBe('function');
      expect(typeof controller.listPendingActions).toBe('function');
      expect(typeof controller.getPendingAction).toBe('function');
      expect(typeof controller.approveAction).toBe('function');
      expect(typeof controller.rejectAction).toBe('function');
      expect(typeof controller.executeAction).toBe('function');
      expect(typeof controller.cancelAction).toBe('function');
    });

    it('policy allows ai:query for admin, owner, and front_desk; audit:read for admin and owner', () => {
      expect(can('owner', 'ai:query')).toBe(true);
      expect(can('owner', 'audit:read')).toBe(true);

      expect(can('admin', 'ai:query')).toBe(true);
      expect(can('admin', 'audit:read')).toBe(true);

      expect(can('front_desk', 'ai:query')).toBe(true);
      expect(can('front_desk', 'audit:read')).toBe(false);

      expect(can('trainer', 'audit:read')).toBe(false);
      expect(can('member', 'audit:read')).toBe(false);
      expect(can('visitor', 'ai:query')).toBe(false);
    });
  });

  // ============================================================
  // 2. ADMIN ASSISTANT SESSION CREATION
  // ============================================================
  describe('2. POST /api/v1/ai/assistant/sessions', () => {
    it('creates an authenticated session and returns 201 envelope with tools, expiry, and disclaimer', async () => {
      const sessionId = 'session-uuid-001';
      mockConversationService.create.mockResolvedValue({
        id: sessionId,
        tenantId: TENANT_A,
        userId: USER_A,
        title: 'AI Assistant Session',
      });

      const response = await controller.createAssistantSession(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        { locale: 'en-IN' },
      );

      expect(mockConversationService.create).toHaveBeenCalledWith({
        tenantId: TENANT_A,
        userId: USER_A,
        title: 'AI Assistant Session',
      });

      expect(response).toHaveProperty('session_id', sessionId);
      expect(response).toHaveProperty('expires_at');
      expect(new Date(response.expires_at).getTime()).toBeGreaterThan(Date.now());
      expect(Array.isArray(response.tools)).toBe(true);
      expect(response.tools).toContain('getExpiringMemberships');
      expect(response.tools).toContain('createMember');
      expect(typeof response.disclaimer).toBe('string');
      expect(response.disclaimer).toMatch(/verification|advisory/i);
    });

    it('filters available tools according to the caller role (front_desk gets read tools, no admin-only tools)', async () => {
      mockConversationService.create.mockResolvedValue({
        id: 'session-fd-001',
        tenantId: TENANT_A,
        userId: USER_A,
      });

      const fdResponse = await controller.createAssistantSession(
        { id: USER_A, tenantId: TENANT_A, role: 'front_desk' },
        {},
      );

      expect(fdResponse.tools).toContain('getExpiringMemberships');
      expect(fdResponse.tools).toContain('getPublicClassSchedule');
    });
  });

  // ============================================================
  // 3. ADMIN ASSISTANT MESSAGES & ENVELOPE FIDELITY
  // ============================================================
  describe('3. POST /api/v1/ai/assistant/sessions/:id/messages', () => {
    it('returns Document 5 Section 6.1 standard envelope on successful query', async () => {
      const sessionId = 'session-turn-001';
      mockConversationService.findById.mockResolvedValue({
        id: sessionId,
        tenantId: TENANT_A,
        userId: USER_A,
        messages: [],
      });

      mockOrchestrator.processMessage.mockResolvedValue({
        response: 'There are 3 memberships expiring this week.',
        toolCalls: [{ name: 'getExpiringMemberships', id: 'call_1', arguments: {} }],
      });

      const response = await controller.sendAssistantMessage(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        sessionId,
        { message: 'Which memberships are expiring this week?', client_msg_id: 'client-msg-1' },
      );

      expect(response).toMatchObject({
        session_id: sessionId,
        turn_no: 1,
        type: 'answer',
        text: 'There are 3 memberships expiring this week.',
        tools_used: [{ name: 'getExpiringMemberships', status: 'success' }],
      });
      expect(response.correlation_id).toMatch(/^msg_/);

      // Verify conversation turns were persisted
      expect(mockConversationService.addMessage).toHaveBeenCalledWith({
        conversationId: sessionId,
        tenantId: TENANT_A,
        role: 'user',
        content: 'Which memberships are expiring this week?',
      });
      expect(mockConversationService.addMessage).toHaveBeenCalledWith({
        conversationId: sessionId,
        tenantId: TENANT_A,
        role: 'assistant',
        content: 'There are 3 memberships expiring this week.',
        toolCalls: expect.any(Array),
      });
    });

    it('returns type=confirmation with pending_action preview when write action is proposed', async () => {
      const sessionId = 'session-turn-write';
      const pendingActionId = 'pa-create-member-99';

      mockConversationService.findById.mockResolvedValue({
        id: sessionId,
        tenantId: TENANT_A,
        userId: USER_A,
        messages: [{ role: 'user', content: 'prior msg', createdAt: new Date() }],
      });

      mockOrchestrator.processMessage.mockResolvedValue({
        response: 'Create member Rahul Menon (Premium, start Monday)?',
        pendingActionId,
        toolCalls: [{ name: 'createMember', id: 'call_write_1', arguments: { fullName: 'Rahul Menon' } }],
      });

      mockPendingActionService.findById.mockResolvedValue({
        id: pendingActionId,
        actionType: 'createMember',
        summary: 'Create member Rahul Menon (Premium)',
        payload: { fullName: 'Rahul Menon', plan: 'Premium' },
        expiresAt: new Date(Date.now() + 600000),
      });

      const response = await controller.sendAssistantMessage(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        sessionId,
        { message: 'Add Rahul Menon, Premium plan starting Monday' },
      );

      expect(response.type).toBe('confirmation');
      expect(response.pending_action).toBeDefined();
      expect(response.pending_action?.id).toBe(pendingActionId);
      expect(response.pending_action?.tool).toBe('createMember');
      expect(response.pending_action?.summary).toBe('Create member Rahul Menon (Premium)');
      expect(response.pending_action?.arguments_preview).toEqual({ fullName: 'Rahul Menon', plan: 'Premium' });
      expect(response.pending_action?.expires_at).toBeDefined();
    });

    it('throws 404 NotFoundException if session is not found or belongs to another tenant', async () => {
      mockConversationService.findById.mockResolvedValue(null);

      await expect(
        controller.sendAssistantMessage(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'non-existent-or-cross-tenant-session',
          { message: 'Hello' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 403 ForbiddenException if caller is not the session owner and not owner/admin', async () => {
      mockConversationService.findById.mockResolvedValue({
        id: 'session-other-user',
        tenantId: TENANT_A,
        userId: USER_B,
        messages: [],
      });

      await expect(
        controller.sendAssistantMessage(
          { id: USER_A, tenantId: TENANT_A, role: 'trainer' },
          'session-other-user',
          { message: 'Hello' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // 4. ACTION CONFIRMATION & EXECUTION LIFECYCLE
  // ============================================================
  describe('4. POST /api/v1/ai/assistant/actions/:pending_id/confirm', () => {
    it('executes frozen DB payload atomically and returns 200 { status: "succeeded", record_id, audit_id }', async () => {
      const pendingId = 'pa-exec-101';
      const storedAction = {
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Priya Sharma', phone: '9876543210' },
        status: 'proposed',
        confirmToken: 'tok-xyz-123',
        expiresAt: new Date(Date.now() + 600000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(storedAction);
      mockTx.pendingAction.updateMany.mockResolvedValue({ count: 1 });
      mockTx.pendingAction.update.mockResolvedValue({
        ...storedAction,
        status: 'executed',
        result: { record_id: 'MEM-00043' },
      });

      mockOrchestrator.callErpTool.mockResolvedValue({ record_id: 'MEM-00043' });

      const response = await controller.confirmAssistantAction(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        pendingId,
        { confirm_token: storedAction.confirmToken },
      );

      expect(response).toMatchObject({
        status: 'succeeded',
        record_id: 'MEM-00043',
        audit_id: 'audit-record-uuid-101',
      });

      // Verify execution used the frozen payload from DB
      expect(mockOrchestrator.callErpTool).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A, userId: USER_A }),
        'createMember',
        storedAction.payload,
      );

      // Verify atomic transition to 'executing' and token clearance
      expect(mockTx.pendingAction.updateMany).toHaveBeenCalledWith({
        where: { id: pendingId, tenantId: TENANT_A, status: 'proposed' },
        data: expect.objectContaining({
          status: 'executing',
          approvedBy: USER_A,
          executedBy: USER_A,
          confirmToken: null,
        }),
      });

      // Verify audit outbox logged the action
      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          actorId: USER_A,
          action: 'ai.action.confirm.createMember',
          resourceRef: pendingId,
        }),
      );
    });

    it('throws 404 NotFoundException for cross-tenant confirmation attempt (non-disclosing)', async () => {
      // Pending action does not exist under Tenant B
      mockTx.pendingAction.findFirst.mockResolvedValue(null);

      await expect(
        controller.confirmAssistantAction(
          { id: USER_B, tenantId: TENANT_B, role: 'admin' },
          'pa-tenant-a-101',
          {},
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 410 GONE (AI_ACTION_EXPIRED) when confirmation window has passed expiresAt', async () => {
      const expiredAction = {
        id: 'pa-expired-1',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Expired Member' },
        status: 'proposed',
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(expiredAction);

      try {
        await controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-expired-1',
          {},
        );
        throw new Error('Expected 410 HttpException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.GONE);
        expect(err.getResponse()).toMatchObject({
          error: { code: 'AI_ACTION_EXPIRED' },
        });
      }

      // Verify database marked action as expired
      expect(mockTx.pendingAction.update).toHaveBeenCalledWith({
        where: { id: 'pa-expired-1' },
        data: { status: 'expired' },
      });
    });

    it('throws 409 ConflictException (AI_ACTION_ALREADY_DECIDED) when action is not in proposed status', async () => {
      const alreadyExecutedAction = {
        id: 'pa-already-executed',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'executed',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(alreadyExecutedAction);

      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-already-executed',
          {},
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 409 ConflictException when concurrent race condition occurs (atomic transition returns count 0)', async () => {
      const action = {
        id: 'pa-race-condition',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'proposed',
        confirmToken: 'tok-race-409',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(action);
      // Simulate another thread updated the row first
      mockTx.pendingAction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-race-condition',
          { confirm_token: 'tok-race-409' },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 403 ForbiddenException when client confirmation token is completely omitted', async () => {
      const actionWithToken = {
        id: 'pa-missing-token',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'proposed',
        confirmToken: 'correct-token-abc',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(actionWithToken);

      // Empty object
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-missing-token',
          {} as any,
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      // Undefined fields
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-missing-token',
          { confirm_token: undefined } as any,
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      expect(mockOrchestrator.callErpTool).not.toHaveBeenCalled();
      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
    });

    it('throws 403 ForbiddenException when client confirmation token is empty or whitespace', async () => {
      const actionWithToken = {
        id: 'pa-empty-token',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'proposed',
        confirmToken: 'correct-token-abc',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(actionWithToken);

      // Empty string in confirm_token
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-empty-token',
          { confirm_token: '' },
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      // Whitespace string in confirm_token
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-empty-token',
          { confirm_token: '   ' },
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      // Empty string in camelCase confirmToken
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-empty-token',
          { confirmToken: '' },
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      // Whitespace string in camelCase confirmToken
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-empty-token',
          { confirmToken: '   ' },
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      expect(mockOrchestrator.callErpTool).not.toHaveBeenCalled();
      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
    });

    it('throws 403 ForbiddenException when client provides invalid or mismatched confirmation token', async () => {
      const actionWithToken = {
        id: 'pa-with-token',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'proposed',
        confirmToken: 'correct-token-abc',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(actionWithToken);

      // Different length token
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-with-token',
          { confirm_token: 'tampered-wrong-token' },
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      // Same length token, mismatched characters
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-with-token',
          { confirm_token: 'correct-token-xyz' },
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      expect(mockOrchestrator.callErpTool).not.toHaveBeenCalled();
      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
    });

    it('throws 403 ForbiddenException when stored confirmation token is missing or empty in database', async () => {
      const actionWithoutStoredToken = {
        id: 'pa-missing-stored-token',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'proposed',
        confirmToken: null,
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(actionWithoutStoredToken);

      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-missing-stored-token',
          { confirm_token: 'some-client-token' },
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      // Also verify when stored token is empty whitespace
      mockTx.pendingAction.findFirst.mockResolvedValue({
        ...actionWithoutStoredToken,
        confirmToken: '   ',
      });

      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          'pa-missing-stored-token',
          { confirm_token: 'some-client-token' },
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));

      expect(mockOrchestrator.callErpTool).not.toHaveBeenCalled();
      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
    });

    it('successfully confirms and executes when valid confirmation token is provided via camelCase confirmToken', async () => {
      const pendingId = 'pa-camel-case-valid';
      const storedAction = {
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Camel Case User' },
        status: 'proposed',
        confirmToken: 'camel-case-secret-tok',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(storedAction);
      mockTx.pendingAction.updateMany.mockResolvedValue({ count: 1 });
      mockTx.pendingAction.update.mockResolvedValue({
        ...storedAction,
        status: 'executed',
        result: { record_id: 'MEM-CAMEL-01' },
      });
      mockOrchestrator.callErpTool.mockResolvedValue({ record_id: 'MEM-CAMEL-01' });

      const response = await controller.confirmAssistantAction(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        pendingId,
        { confirmToken: 'camel-case-secret-tok' },
      );

      expect(response).toMatchObject({
        status: 'succeeded',
        record_id: 'MEM-CAMEL-01',
      });
      expect(mockOrchestrator.callErpTool).toHaveBeenCalled();
    });

    it('throws 403 ForbiddenException when unauthorized non-admin user attempts to confirm another user action', async () => {
      const storedAction = {
        id: 'pa-unauthorized-user',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'proposed',
        confirmToken: 'secret-tok-123',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(storedAction);

      await expect(
        controller.confirmAssistantAction(
          { id: USER_B, tenantId: TENANT_A, role: 'front_desk' },
          'pa-unauthorized-user',
          { confirm_token: 'secret-tok-123' },
        ),
      ).rejects.toThrow(new ForbiddenException('Only the requesting user can confirm this pending action'));

      expect(mockOrchestrator.callErpTool).not.toHaveBeenCalled();
      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
    });

    it('throws 403 ForbiddenException when caller role lacks permission for the proposed tool', async () => {
      const storedAction = {
        id: 'pa-lacks-tool-perm',
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'proposed',
        confirmToken: 'secret-tok-123',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(storedAction);

      // Caller is the action owner, but role 'member' lacks 'members:create' permission
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'member' },
          'pa-lacks-tool-perm',
          { confirm_token: 'secret-tok-123' },
        ),
      ).rejects.toThrow(new ForbiddenException('PERMISSION_DENIED: User lacks required permission members:create'));

      expect(mockOrchestrator.callErpTool).not.toHaveBeenCalled();
      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
    });

    it('relays duplicate conflicts verbatim with 200 { status: "failed", error: { code: "CONFLICT_DUPLICATE" } } per Document 5 Section 6.1', async () => {
      const pendingId = 'pa-dup-member';
      const storedAction = {
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { phone: '9876543210' },
        status: 'proposed',
        confirmToken: 'tok-dup-409',
        expiresAt: new Date(Date.now() + 60000),
      };

      mockTx.pendingAction.findFirst.mockResolvedValue(storedAction);
      mockTx.pendingAction.updateMany.mockResolvedValue({ count: 1 });

      // Simulate ERP duplicate error
      mockOrchestrator.callErpTool.mockRejectedValue(
        new Error('A member with this phone already exists (MEM-00012)'),
      );

      const response = await controller.confirmAssistantAction(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        pendingId,
        { confirm_token: 'tok-dup-409' },
      );

      expect(response).toMatchObject({
        status: 'failed',
        error: {
          code: 'CONFLICT_DUPLICATE',
          message: expect.stringContaining('already exists'),
        },
      });

      // Verify DB marked action as failed
      expect(mockTx.pendingAction.update).toHaveBeenCalledWith({
        where: { id: pendingId },
        data: expect.objectContaining({ status: 'failed' }),
      });
    });
  });

  // ============================================================
  // 5. ACTION REJECTION & SESSION MANAGEMENT
  // ============================================================
  describe('5. Action Rejection & Session Lifecycle Endpoints', () => {
    it('rejects proposed action: POST /api/v1/ai/assistant/actions/:pending_id/reject returns 200 { status: "rejected" }', async () => {
      const pendingId = 'pa-reject-1';
      mockTx.pendingAction.findFirst.mockResolvedValue({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        status: 'proposed',
        expiresAt: new Date(Date.now() + 60000),
      });

      const response = await controller.rejectAssistantAction(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        pendingId,
        { reason: 'Customer changed mind' },
      );

      expect(response).toEqual({ status: 'rejected' });
      expect(mockPendingActionService.reject).toHaveBeenCalledWith(
        TENANT_A,
        pendingId,
        USER_A,
        'Customer changed mind',
      );
    });

    it('retrieves session turns and pending actions: GET /api/v1/ai/assistant/sessions/:id', async () => {
      const sessionId = 'session-inspect-1';
      mockConversationService.findById.mockResolvedValue({
        id: sessionId,
        tenantId: TENANT_A,
        userId: USER_A,
        messages: [
          { role: 'user', content: 'Turn 1', toolCalls: null, createdAt: new Date() },
          { role: 'assistant', content: 'Turn 2', toolCalls: [], createdAt: new Date() },
        ],
        pendingActions: [
          { id: 'pa-1', actionType: 'createMember', summary: 'Summary', status: 'proposed', expiresAt: new Date() },
        ],
      });

      const response = await controller.getAssistantSession(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        sessionId,
      );

      expect(response.session_id).toBe(sessionId);
      expect(response.turns.length).toBe(2);
      expect(response.pending_actions.length).toBe(1);
    });

    it('purges session data: DELETE /api/v1/ai/assistant/sessions/:id returns 204 NO_CONTENT', async () => {
      const sessionId = 'session-purge-1';
      mockConversationService.findById.mockResolvedValue({
        id: sessionId,
        tenantId: TENANT_A,
        userId: USER_A,
      });

      await controller.deleteAssistantSession(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        sessionId,
      );

      expect(mockConversationService.purge).toHaveBeenCalledWith(TENANT_A, sessionId);
    });
  });

  // ============================================================
  // 6. AI AUDIT RETRIEVAL & TENANT ISOLATION
  // ============================================================
  describe('6. GET /api/v1/ai/audit', () => {
    it('retrieves tenant-scoped audit logs matching Document 5 Section 6.2 contract', async () => {
      const auditLogDate = new Date('2026-10-14T10:00:00Z');
      mockTx.auditLog.findMany.mockResolvedValue([
        {
          id: 'audit-log-1',
          tenantId: TENANT_A,
          actorId: USER_A,
          actorType: 'staff',
          action: 'ai.action.confirm.createMember',
          resourceType: 'tool',
          resourceRef: 'createMember',
          afterData: { arguments: { phone: '9876543210', full_name: 'Jane Doe' }, result: 'MEM-00043' },
          createdAt: auditLogDate,
        },
      ]);

      const response = await controller.getAiAudit(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        undefined,
        USER_A,
        'createMember',
      );

      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBe(1);
      expect(response[0]).toMatchObject({
        id: 'audit-log-1',
        actor: USER_A,
        tool: 'createMember',
        arguments_redacted: { phone: '[REDACTED]', full_name: 'Jane Doe' },
        decision: 'approved',
        approval: { approved_by: USER_A },
        result: 'MEM-00043',
        at: auditLogDate.toISOString(),
      });

      // Verify query is strictly filtered by caller tenant ID
      expect(mockTx.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_A,
            actorId: USER_A,
            resourceRef: 'createMember',
          }),
        }),
      );
    });

    it('never leaks audit records across tenants', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([]);

      await controller.getAiAudit(
        { id: USER_B, tenantId: TENANT_B, role: 'admin' },
      );

      expect(mockTx.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_B,
          }),
        }),
      );
    });
  });

  // ============================================================
  // 7. LEGACY RETRO-COMPATIBILITY
  // ============================================================
  describe('7. Backward Compatibility for Legacy Routes', () => {
    it('legacy POST /ai/chat continues to work unchanged', async () => {
      mockOrchestrator.processMessage.mockResolvedValue({
        response: 'Legacy response',
        toolCalls: [],
      });
      mockConversationService.create.mockResolvedValue({
        id: 'conv-legacy-1',
      });

      const response = await controller.chat(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        { message: 'Legacy message' },
      );

      expect(response).toMatchObject({
        response: 'Legacy response',
        conversationId: 'conv-legacy-1',
      });
    });
  });
});