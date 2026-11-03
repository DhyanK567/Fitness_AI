import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HttpException, HttpStatus, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { AiController } from '../ai/ai.controller';
import { ConversationOrchestrator } from '../ai/orchestrator/conversation-loop';
import { PendingActionService } from '../ai/pending-action.service';
import { ToolRegistry } from '../ai/tools/tool-registry';
import { randomUUID } from 'crypto';

describe('Component 2 — Admin AI Assistant and Two-Phase Write Approvals', () => {
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const TENANT_B = 'b0000000-0000-0000-0000-000000000002';
  const USER_A = 'u0000000-0000-0000-0000-000000000001';
  const USER_B = 'u0000000-0000-0000-0000-000000000002';

  let mockErpService: any;
  let mockAuditOutbox: any;
  let mockPrisma: any;
  let mockTx: any;
  let mockConversationService: any;
  let mockPendingActionService: any;
  let mockOrchestrator: any;
  let toolRegistry: any;
  let controller: AiController;

  beforeEach(() => {
    mockErpService = {
      call: jest.fn<any>(),
    };

    mockAuditOutbox = {
      record: jest.fn<any>().mockResolvedValue({ audit: { id: 'audit-comp2-001' } }),
      recordInTransaction: jest.fn<any>().mockResolvedValue({ id: 'audit-comp2-001' }),
    };

    mockTx = {
      pendingAction: {
        findFirst: jest.fn<any>(),
        findMany: jest.fn<any>(),
        update: jest.fn<any>(),
        updateMany: jest.fn<any>(),
        create: jest.fn<any>(),
        count: jest.fn<any>(),
      },
      conversation: {
        findFirst: jest.fn<any>(),
        create: jest.fn<any>(),
      },
      message: {
        create: jest.fn<any>(),
      },
    };

    mockPrisma = {
      withTenant: jest.fn<any>().mockImplementation((tenantId: string, fn: any) => fn(mockTx)),
      pendingAction: {
        updateMany: jest.fn<any>(),
      },
    };

    mockConversationService = {
      findById: jest.fn<any>(),
      create: jest.fn<any>(),
      addMessage: jest.fn<any>().mockResolvedValue({}),
      delete: jest.fn<any>(),
    };

    mockPendingActionService = {
      create: jest.fn<any>(),
      findById: jest.fn<any>(),
      findByTenant: jest.fn<any>(),
      approve: jest.fn<any>(),
      confirmAndExecute: jest.fn<any>(),
      reject: jest.fn<any>(),
      cancel: jest.fn<any>(),
      execute: jest.fn<any>(),
    };

    mockOrchestrator = {
      processMessage: jest.fn<any>(),
      confirmPendingAction: jest.fn<any>(),
      executeApprovedAction: jest.fn<any>(),
      cancelPendingAction: jest.fn<any>(),
      callErpTool: jest.fn<any>(),
    };

    toolRegistry = {
      execute: jest.fn<any>(),
      has: jest.fn<any>().mockReturnValue(true),
      getDefinition: jest.fn<any>(),
    };

    controller = new AiController(
      mockOrchestrator,
      mockConversationService,
      mockPendingActionService,
      mockPrisma,
      mockAuditOutbox,
      toolRegistry,
    );
  });

  describe('1. Token Propagation and Action Preview in Messages (Inventory Items 1 & 28)', () => {
    it('populates confirm_token on pending_action preview when assistant proposes a write action', async () => {
      const sessionId = 'session-123';
      const actionId = 'pending-action-001';
      const secureToken = 'secure-token-abcdef123456';

      mockConversationService.findById.mockResolvedValueOnce({
        id: sessionId,
        tenantId: TENANT_A,
        userId: USER_A,
        messages: [],
      });

      mockOrchestrator.processMessage.mockResolvedValueOnce({
        response: 'Please confirm creating member Sunita Rao.',
        toolCalls: [{ id: 'tc-1', name: 'createMember', arguments: { fullName: 'Sunita Rao' } }],
        pendingActionId: actionId,
        confirmToken: secureToken,
      });

      mockPendingActionService.findById.mockResolvedValueOnce({
        id: actionId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Sunita Rao', phone: '+919876543210' },
        summary: 'Proposed createMember',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: secureToken,
      });

      const response = await controller.sendAssistantMessage(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        sessionId,
        { message: 'Create member Sunita Rao' },
      );

      expect(response.type).toBe('confirmation');
      expect(response.pending_action).toBeDefined();
      expect(response.pending_action?.id).toBe(actionId);
      expect(response.pending_action?.tool).toBe('createMember');
      expect(response.pending_action?.confirm_token).toBe(secureToken);
      expect(response.pending_action?.arguments_preview).toEqual({
        fullName: 'Sunita Rao',
        phone: '+919876543210',
      });
    });

    it('accurately reflects tool failure in tools_used status rather than claiming false success', async () => {
      const sessionId = 'session-123';

      mockConversationService.findById.mockResolvedValueOnce({
        id: sessionId,
        tenantId: TENANT_A,
        userId: USER_A,
        messages: [],
      });

      mockOrchestrator.processMessage.mockResolvedValueOnce({
        response: 'Failed to retrieve attendance report due to ERP error.',
        toolCalls: [{ id: 'tc-1', name: 'getLowAttendanceClasses', arguments: {} }],
        toolResults: [
          { toolCallId: 'tc-1', name: 'getLowAttendanceClasses', result: null, error: 'ERP connection refused' },
        ],
        error: 'ERP connection refused',
      });

      const response = await controller.sendAssistantMessage(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        sessionId,
        { message: 'Show low attendance classes' },
      );

      expect(response.tools_used).toHaveLength(1);
      expect(response.tools_used[0].name).toBe('getLowAttendanceClasses');
      expect(response.tools_used[0].status).toBe('failed');
    });

    it('correctly sets tools_used status to success when tool succeeds', async () => {
      const sessionId = 'session-123';

      mockConversationService.findById.mockResolvedValueOnce({
        id: sessionId,
        tenantId: TENANT_A,
        userId: USER_A,
        messages: [],
      });

      mockOrchestrator.processMessage.mockResolvedValueOnce({
        response: 'There are 12 expiring memberships.',
        toolCalls: [{ id: 'tc-1', name: 'getExpiringMemberships', arguments: { days: 7 } }],
        toolResults: [
          { toolCallId: 'tc-1', name: 'getExpiringMemberships', result: { count: 12 }, error: undefined },
        ],
      });

      const response = await controller.sendAssistantMessage(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        sessionId,
        { message: 'Check expiring memberships' },
      );

      expect(response.tools_used).toHaveLength(1);
      expect(response.tools_used[0].name).toBe('getExpiringMemberships');
      expect(response.tools_used[0].status).toBe('success');
    });
  });

  describe('2. Fail-Closed Authorization on Action Confirmation (Inventory Item 18)', () => {
    it('fails closed and rejects confirmation if actionType is unmapped or unknown in TOOL_PERMISSIONS', async () => {
      const pendingId = 'pa-unknown-tool';
      const token = 'token-123';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'maliciousOrUnknownToolAction',
        payload: {},
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          pendingId,
          { confirm_token: token },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
      expect(toolRegistry.execute).not.toHaveBeenCalled();
    });

    it('rejects confirmation if caller lacks permission for the specific actionType', async () => {
      const pendingId = 'pa-perm-denied';
      const token = 'token-123';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Test Member', phone: '+919876543210' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      // Role 'trainer' does NOT have 'members:create' or 'members:write'
      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'trainer' },
          pendingId,
          { confirm_token: token },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(toolRegistry.execute).not.toHaveBeenCalled();
    });
  });

  describe('3. Concurrency Protection, Replay Prevention, and Atomic Execution', () => {
    it('prevents concurrent approval race condition: second atomic update returns 409 Conflict', async () => {
      const pendingId = 'pa-concurrency-race';
      const token = 'valid-token-123';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Sunita Rao', phone: '+919876543210' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      // Simulate concurrent race: another thread already changed status to 'executing'
      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          pendingId,
          { confirm_token: token },
        ),
      ).rejects.toThrow(ConflictException);

      expect(toolRegistry.execute).not.toHaveBeenCalled();
    });

    it('invalidates confirmToken immediately during transition to executing to prevent token reuse', async () => {
      const pendingId = 'pa-token-invalidation';
      const token = 'valid-token-abc';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Sunita Rao', phone: '+919876543210' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });
      mockTx.pendingAction.update.mockResolvedValueOnce({});
      toolRegistry.execute.mockResolvedValueOnce({
        success: true,
        data: { id: 'MEM-001', record_id: 'MEM-001' },
      });

      await controller.confirmAssistantAction(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        pendingId,
        { confirm_token: token },
      );

      // Verify confirmToken was wiped to null immediately in the atomic updateMany step
      expect(mockTx.pendingAction.updateMany).toHaveBeenCalledWith({
        where: { id: pendingId, tenantId: TENANT_A, status: 'proposed' },
        data: expect.objectContaining({
          status: 'executing',
          confirmToken: null,
        }),
      });
    });

    it('fails safely with 403 when missing confirmation token', async () => {
      const pendingId = 'pa-missing-token';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Sunita Rao', phone: '+919876543210' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: 'stored-token-123',
      });

      await expect(
        controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          pendingId,
          {},
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(toolRegistry.execute).not.toHaveBeenCalled();
    });
  });

  describe('4. Execution Failure Integrity and Safe Outcome Reporting', () => {
    it('returns 200 { status: failed, error } when downstream ERP execution throws and records failure audit log', async () => {
      const pendingId = 'pa-exec-failure';
      const token = 'token-fail-test';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Sunita Rao', phone: '+919876543210' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });
      mockTx.pendingAction.update.mockResolvedValueOnce({});

      toolRegistry.execute.mockResolvedValueOnce({
        success: false,
        error: 'ERP member creation failed: Phone +919876543210 already registered to another member',
        errorCode: 'CONFLICT_DUPLICATE',
      });

      const response = await controller.confirmAssistantAction(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        pendingId,
        { confirm_token: token },
      );

      // Verify the response is explicitly failed, NEVER reporting false success
      expect(response.status).toBe('failed');
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('CONFLICT_DUPLICATE');
      expect(response.error?.message).toContain('already registered');

      // Verify DB record updated to 'failed'
      expect(mockTx.pendingAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: pendingId },
          data: expect.objectContaining({
            status: 'failed',
          }),
        }),
      );

      // Verify failure audit log recorded
      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          eventType: 'ai.action.failed',
          action: 'ai.action.confirm.error.createMember',
          resourceRef: pendingId,
        }),
      );
    });
  });

  describe('5. Cross-Tenant Denial and Isolation (Inventory Item 29)', () => {
    it('strictly isolates pending actions: Tenant B receives 404 when querying Tenant A action', async () => {
      const pendingId = 'pa-tenant-a-action';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce(null);

      await expect(
        controller.confirmAssistantAction(
          { id: USER_B, tenantId: TENANT_B, role: 'admin' },
          pendingId,
          { confirm_token: 'any-token' },
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockTx.pendingAction.findFirst).toHaveBeenCalledWith({
        where: { id: pendingId, tenantId: TENANT_B },
      });
    });

    it('strictly isolates reject endpoint: Tenant B cannot reject Tenant A action', async () => {
      const pendingId = 'pa-tenant-a-action';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce(null);

      await expect(
        controller.rejectAssistantAction(
          { id: USER_B, tenantId: TENANT_B, role: 'admin' },
          pendingId,
          { reason: 'Unauthorized attempt' },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('6. Legacy Approval & Execution Route Authorization Parity (Defect 1 & Requirement 2)', () => {
    it('enforces ownership parity: POST /pending-actions/:id/approve denies non-owner non-admin with 403', async () => {
      const pendingId = 'pa-legacy-other-user';
      const token = 'tok-legacy-123';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'User A Action' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      // User B is front_desk (not owner of action, not admin/owner)
      await expect(
        controller.approveAction(
          { id: USER_B, tenantId: TENANT_A, role: 'front_desk' },
          pendingId,
          { confirmToken: token },
        ),
      ).rejects.toThrow(new ForbiddenException('Only the requesting user can confirm this pending action'));

      expect(toolRegistry.execute).not.toHaveBeenCalled();
      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
    });

    it('enforces domain tool permission: POST /pending-actions/:id/approve denies caller lacking tool permission with 403', async () => {
      const pendingId = 'pa-legacy-no-tool-perm';
      const token = 'tok-legacy-tool-perm';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Member' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      // User A with 'trainer' role lacks 'members:create' or 'members:write'
      await expect(
        controller.approveAction(
          { id: USER_A, tenantId: TENANT_A, role: 'trainer' },
          pendingId,
          { confirmToken: token },
        ),
      ).rejects.toThrow(new ForbiddenException('PERMISSION_DENIED: User lacks required permission members:create'));

      expect(toolRegistry.execute).not.toHaveBeenCalled();
      expect(mockTx.pendingAction.updateMany).not.toHaveBeenCalled();
    });

    it('enforces expiry parity: POST /pending-actions/:id/approve rejects expired action with 410 GONE', async () => {
      const pendingId = 'pa-legacy-expired';
      const token = 'tok-expired-123';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Expired Member' },
        status: 'proposed',
        expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
        confirmToken: token,
      });
      mockTx.pendingAction.update.mockResolvedValueOnce({});

      try {
        await controller.approveAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          pendingId,
          { confirmToken: token },
        );
        throw new Error('Expected 410 HttpException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.GONE);
        expect(err.getResponse()).toMatchObject({
          error: { code: 'AI_ACTION_EXPIRED' },
        });
      }

      expect(mockTx.pendingAction.update).toHaveBeenCalledWith({
        where: { id: pendingId },
        data: { status: 'expired' },
      });
    });

    it('enforces status parity: POST /pending-actions/:id/approve rejects already decided action with 409 Conflict', async () => {
      const pendingId = 'pa-legacy-already-decided';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'executed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: 'tok-123',
      });

      await expect(
        controller.approveAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          pendingId,
          { confirmToken: 'tok-123' },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('successfully approves and executes via legacy POST /pending-actions/:id/approve with valid token', async () => {
      const pendingId = 'pa-legacy-success';
      const token = 'tok-legacy-success-123';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Ramesh Patel', phone: '+919876543210' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });
      mockTx.pendingAction.update.mockResolvedValueOnce({});

      toolRegistry.execute.mockResolvedValueOnce({
        success: true,
        data: { record_id: 'MEM-LEGACY-001' },
      });

      const response = await controller.approveAction(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        pendingId,
        { confirmToken: token },
      );

      expect(response.success).toBe(true);
      expect(response.state).toBe('succeeded');
      expect(response.recordId).toBe('MEM-LEGACY-001');
      expect(response.auditId).toBeDefined();

      // Verify atomic CAS transition wiped the token
      expect(mockTx.pendingAction.updateMany).toHaveBeenCalledWith({
        where: { id: pendingId, tenantId: TENANT_A, status: 'proposed' },
        data: expect.objectContaining({
          status: 'executing',
          approvedBy: USER_A,
          executedBy: USER_A,
          confirmToken: null,
        }),
      });
    });

    it('enforces authorization parity on POST /pending-actions/:id/reject', async () => {
      const pendingId = 'pa-legacy-reject-unauth';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
      });

      await expect(
        controller.rejectAction(
          { id: USER_B, tenantId: TENANT_A, role: 'front_desk' },
          pendingId,
          { reason: 'Unauthorized reject attempt' },
        ),
      ).rejects.toThrow(new ForbiddenException('Only the requesting user or admin can reject this action'));
    });

    it('enforces authorization parity on POST /pending-actions/:id/execute: denies caller without domain permission', async () => {
      const pendingId = 'pa-legacy-execute-no-perm';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'approved',
        expiresAt: new Date(Date.now() + 600000),
      });

      // Role 'trainer' lacks members:create
      await expect(
        controller.executeAction(
          { id: USER_A, tenantId: TENANT_A, role: 'trainer' },
          pendingId,
          {},
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(toolRegistry.execute).not.toHaveBeenCalled();
    });

    it('enforces status check on POST /pending-actions/:id/execute: only approved actions can be executed', async () => {
      const pendingId = 'pa-legacy-execute-not-approved';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: {},
        status: 'proposed', // Must be approved first
        expiresAt: new Date(Date.now() + 600000),
      });

      await expect(
        controller.executeAction(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          pendingId,
          {},
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('7. Timing-Safe Token Validation on PendingActionService (Defect 2)', () => {
    let pendingActionService: PendingActionService;

    beforeEach(() => {
      pendingActionService = new PendingActionService(mockPrisma);
    });

    it('timing-safely rejects token of differing length without throwing RangeError in approve()', async () => {
      const storedToken = '1234567890123456789012345678901234567890123456789012345678901234';
      const shortToken = 'short-token';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: 'pa-timing-1',
        tenantId: TENANT_A,
        userId: USER_A,
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: storedToken,
      });

      await expect(
        pendingActionService.approve(TENANT_A, 'pa-timing-1', USER_A, shortToken),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));
    });

    it('timing-safely rejects token of same length with mismatched bytes in approve()', async () => {
      const storedToken = 'a'.repeat(64);
      const tamperedToken = 'a'.repeat(63) + 'b'; // Single byte difference

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: 'pa-timing-2',
        tenantId: TENANT_A,
        userId: USER_A,
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: storedToken,
      });

      await expect(
        pendingActionService.approve(TENANT_A, 'pa-timing-2', USER_A, tamperedToken),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));
    });

    it('timing-safely rejects token mismatch in confirmAndExecute()', async () => {
      const storedToken = 'valid-token-hash-64chars-length-padding-00000000000000000000000000';
      const wrongToken = 'wrong-token-hash-64chars-length-padding-00000000000000000000000000';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: 'pa-timing-3',
        tenantId: TENANT_A,
        userId: USER_A,
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: storedToken,
      });

      await expect(
        pendingActionService.confirmAndExecute(
          TENANT_A,
          'pa-timing-3',
          USER_A,
          wrongToken,
          async () => ({ success: true }),
        ),
      ).rejects.toThrow(new ForbiddenException('Invalid confirmation token'));
    });
  });

  describe('8. Token Exposure Prevention & Listing Masking (Defect 3)', () => {
    it('completely omits confirmToken when non-admin, non-proposing staff queries GET /pending-actions', async () => {
      const actions = [
        {
          id: 'pa-mask-1',
          tenantId: TENANT_A,
          userId: USER_A,
          proposedBy: USER_A,
          actionType: 'createMember',
          status: 'proposed',
          confirmToken: 'super-secret-token-111',
          expiresAt: new Date(),
        },
        {
          id: 'pa-mask-2',
          tenantId: TENANT_A,
          userId: USER_B,
          proposedBy: USER_B,
          actionType: 'member_freeze',
          status: 'proposed',
          confirmToken: 'super-secret-token-222',
          expiresAt: new Date(),
        },
      ];

      mockPendingActionService.findByTenant.mockResolvedValueOnce({
        actions,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      // Caller is USER_B with role 'front_desk'
      const result = await controller.listPendingActions(
        { id: USER_B, tenantId: TENANT_A, role: 'front_desk' },
        1,
        20,
      );

      expect(result.actions).toHaveLength(2);
      expect(result.actions[0].confirmToken).toBeUndefined();
      expect(result.actions[1].confirmToken).toBeUndefined();
    });

    it('completely omits confirmToken even when privileged admin queries GET /pending-actions', async () => {
      const actions = [
        {
          id: 'pa-admin-view-1',
          tenantId: TENANT_A,
          userId: USER_A,
          proposedBy: USER_A,
          actionType: 'createMember',
          status: 'proposed',
          confirmToken: 'secret-token-admin-view',
          expiresAt: new Date(),
        },
      ];

      mockPendingActionService.findByTenant.mockResolvedValueOnce({
        actions,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await controller.listPendingActions(
        { id: USER_B, tenantId: TENANT_A, role: 'admin' },
        1,
        20,
      );

      expect(result.actions[0].confirmToken).toBeUndefined();
    });

    it('completely omits confirmToken when caller queries GET /pending-actions/:id for another user action', async () => {
      mockPendingActionService.findById.mockResolvedValueOnce({
        id: 'pa-detail-1',
        tenantId: TENANT_A,
        userId: USER_A,
        proposedBy: USER_A,
        actionType: 'createMember',
        confirmToken: 'secret-token-detail',
        expiresAt: new Date(),
      });

      const result = await controller.getPendingAction(
        { id: USER_B, tenantId: TENANT_A, role: 'front_desk' },
        'pa-detail-1',
      );

      expect(result.confirmToken).toBeUndefined();
    });

    it('completely omits confirmToken even when proposing user queries GET /pending-actions/:id', async () => {
      mockPendingActionService.findById.mockResolvedValueOnce({
        id: 'pa-detail-owner',
        tenantId: TENANT_A,
        userId: USER_A,
        proposedBy: USER_A,
        actionType: 'createMember',
        confirmToken: 'secret-token-detail-owner',
        expiresAt: new Date(),
      });

      const result = await controller.getPendingAction(
        { id: USER_A, tenantId: TENANT_A, role: 'front_desk' },
        'pa-detail-owner',
      );

      expect(result.confirmToken).toBeUndefined();
    });
  });

  describe('9. Secure Single-Use Approval Token Issuance (POST /pending-actions/:id/approval-token)', () => {
    it('issues single-use approval token to authorized administrator and records audit log', async () => {
      const pendingId = 'pa-token-issuance-001';
      const token = 'audit-issuance-token-123';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      const result = await controller.requestApprovalToken(
        { id: USER_B, tenantId: TENANT_A, role: 'admin' },
        pendingId,
      );

      expect(result.confirm_token).toBe(token);

      // Verify audit log recorded for token issuance
      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          eventType: 'ai.action.approval_token_issued',
          action: 'ai.action.approval_token_issued.createMember',
          resourceRef: pendingId,
        }),
      );
    });

    it('rejects token issuance for unauthorized caller who is not admin/owner or proposer', async () => {
      const pendingId = 'pa-unauth-token-request';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: 'secret-token-123',
      });

      await expect(
        controller.requestApprovalToken(
          { id: USER_B, tenantId: TENANT_A, role: 'front_desk' },
          pendingId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects token issuance when action is expired with 410 GONE', async () => {
      const pendingId = 'pa-expired-token-request';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        status: 'proposed',
        expiresAt: new Date(Date.now() - 10000), // Expired
        confirmToken: 'secret-token-123',
      });
      mockTx.pendingAction.update.mockResolvedValueOnce({});

      try {
        await controller.requestApprovalToken(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          pendingId,
        );
        throw new Error('Expected 410 GONE');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.GONE);
      }
    });

    it('rejects token issuance when action is already decided with 409 Conflict', async () => {
      const pendingId = 'pa-already-decided-token-request';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        status: 'executed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: 'secret-token-123',
      });

      await expect(
        controller.requestApprovalToken(
          { id: USER_A, tenantId: TENANT_A, role: 'admin' },
          pendingId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects token issuance when caller lacks domain tool permission', async () => {
      const pendingId = 'pa-no-perm-token-request';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: 'secret-token-123',
      });

      // Role 'trainer' lacks members:create
      await expect(
        controller.requestApprovalToken(
          { id: USER_A, tenantId: TENANT_A, role: 'trainer' },
          pendingId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('strictly isolates cross-tenant token request with 404', async () => {
      mockTx.pendingAction.findFirst.mockResolvedValueOnce(null);

      await expect(
        controller.requestApprovalToken(
          { id: USER_B, tenantId: TENANT_B, role: 'admin' },
          'pa-tenant-a-action',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('10. Downstream ERP Idempotency & Uncertain Execution Outcomes', () => {
    it('passes deterministic idempotencyKey to tool context during execution', async () => {
      const pendingId = 'pa-idempotency-check';
      const token = 'tok-idem-123';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Member Idem', phone: '+919876543210' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
        idempotencyKey: 'custom-idem-key-777',
      });

      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });
      mockTx.pendingAction.update.mockResolvedValueOnce({});

      toolRegistry.execute.mockResolvedValueOnce({
        success: true,
        data: { record_id: 'MEM-IDEM-001' },
      });

      await controller.confirmAssistantAction(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        pendingId,
        { confirm_token: token },
      );

      expect(toolRegistry.execute).toHaveBeenCalledWith(
        'createMember',
        expect.objectContaining({
          idempotencyKey: 'custom-idem-key-777',
          isConfirmedPendingAction: true,
        }),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('safely handles failure window where downstream ERP succeeds but DB finalization fails with EXECUTION_UNCERTAIN', async () => {
      const pendingId = 'pa-partial-fail-window';
      const token = 'tok-partial-window';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingId,
        tenantId: TENANT_A,
        userId: USER_A,
        actionType: 'createMember',
        payload: { fullName: 'Member Partial', phone: '+919876543210' },
        status: 'proposed',
        expiresAt: new Date(Date.now() + 600000),
        confirmToken: token,
      });

      // CAS succeeds
      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });

      // ERP succeeds
      toolRegistry.execute.mockResolvedValueOnce({
        success: true,
        data: { record_id: 'MEM-DOWNSTREAM-CREATED' },
      });

      // BUT PostgreSQL update to 'executed' throws DB connection error
      mockTx.pendingAction.update.mockRejectedValueOnce(new Error('PostgreSQL connection dropped'));
      // The recovery update to record uncertain state
      mockTx.pendingAction.update.mockResolvedValueOnce({});

      const response = await controller.confirmAssistantAction(
        { id: USER_A, tenantId: TENANT_A, role: 'admin' },
        pendingId,
        { confirm_token: token },
      );

      // Verifies the response returns code EXECUTION_UNCERTAIN rather than falsely claiming execution failed
      expect(response.status).toBe('failed');
      expect(response.error?.code).toBe('EXECUTION_UNCERTAIN');
      expect(response.error?.message).toContain('Downstream operation succeeded but local state update encountered an error');

      // Verifies the action was updated with executing/uncertain flag rather than plain status: 'failed'
      expect(mockTx.pendingAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: pendingId },
          data: expect.objectContaining({
            status: 'executing',
            error: expect.stringContaining('DOWNSTREAM_SUCCEEDED_DB_FINALIZATION_FAILED'),
          }),
        }),
      );
    });
  });
});
