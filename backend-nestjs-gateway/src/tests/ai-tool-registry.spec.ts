import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ToolRegistry } from '../ai/tools/tool-registry';
import { BaseTool, ToolContext, ToolResult } from '../ai/tools/base-tool';
import { toolByName } from '@wsos/ai-tool-definitions';
import { ConversationOrchestrator } from '../ai/orchestrator/conversation-loop';
import { AiController } from '../ai/ai.controller';
import { HttpException, HttpStatus, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';

describe('AI-04: Unified AI Tool Execution Registry Specification & Regression Tests', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111';
  const TENANT_B = '22222222-2222-2222-2222-222222222222';
  const USER_STAFF = '33333333-3333-3333-3333-333333333333';
  const USER_MEMBER = '44444444-4444-4444-4444-444444444444';

  let registry: ToolRegistry;
  let mockAuditOutbox: any;
  let mockErpService: any;
  let mockModuleRef: any;

  beforeEach(() => {
    mockAuditOutbox = {
      record: jest.fn<any>().mockResolvedValue({
        audit: { id: 'audit-log-uuid-1' },
        outbox: { id: 'outbox-log-uuid-1' },
      }),
    };

    mockErpService = {
      call: jest.fn<any>().mockResolvedValue({
        id: 'erp-record-123',
        status: 'success',
      }),
    };

    mockModuleRef = {
      get: jest.fn<any>(),
    };

    registry = new ToolRegistry(mockModuleRef, mockAuditOutbox, mockErpService);
  });

  describe('1. Explicit Tool Lookup & Safe Unknown Tool Handling', () => {
    it('returns structured failure when tool name is missing or empty', async () => {
      const result = await registry.execute('', {
        tenantId: TENANT_A,
        userId: USER_STAFF,
        role: 'admin',
        correlationId: 'corr-1',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_TOOL_NAME');
      expect(result.error).toBe('Tool name is required');
    });

    it('fails safely without crashing when an unknown tool is invoked', async () => {
      const result = await registry.execute('unknownTool_xyz', {
        tenantId: TENANT_A,
        userId: USER_STAFF,
        role: 'admin',
        correlationId: 'corr-2',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNKNOWN_TOOL');
      expect(result.error).toContain('Unknown tool: unknownTool_xyz');

      // Verifies security event was recorded
      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          action: 'security.unknown_tool',
          resourceRef: 'unknownTool_xyz',
        }),
      );
    });

    it('allows registering and discovering tools explicitly', () => {
      const dummyTool: any = {
        execute: jest.fn<any>().mockResolvedValue({ success: true, data: { test: true } }),
      };

      registry.register('customTool', dummyTool);
      expect(registry.has('customTool')).toBe(true);
      expect(registry.get('customTool')).toBe(dummyTool);
      expect(registry.getRegisteredTools()).toContain('customTool');
    });
  });

  describe('2. Server-Side Tenant Context & Cross-Tenant Access Enforcement', () => {
    it('rejects execution when tenant context is missing', async () => {
      const dummyTool: any = {
        execute: jest.fn<any>(),
      };
      registry.register('testTool', dummyTool);

      const result = await registry.execute('testTool', {
        tenantId: '',
        userId: USER_STAFF,
        role: 'admin',
        correlationId: 'corr-3',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MISSING_TENANT_CONTEXT');
      expect(result.error).toContain('Tenant context is required');
      expect(dummyTool.execute).not.toHaveBeenCalled();
    });

    it('propagates the verified context tenant ID to the underlying tool, never overridden by args', async () => {
      let receivedContext: ToolContext | undefined;
      const dummyTool: any = {
        execute: jest.fn<any>().mockImplementation(async (ctx: ToolContext) => {
          receivedContext = ctx;
          return { success: true, data: { tenant: ctx.tenantId } };
        }),
      };
      registry.register('testTool', dummyTool);

      const result = await registry.execute(
        'testTool',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-4',
        },
        { tenantId: TENANT_B, maliciousPayload: 'cross-tenant' },
      );

      expect(result.success).toBe(true);
      expect(receivedContext?.tenantId).toBe(TENANT_A);
    });
  });

  describe('3. Server-Side RBAC Authorization Enforcement', () => {
    it('rejects unauthorized roles from executing privileged tools', async () => {
      const createMemberTool: any = {
        execute: jest.fn<any>(),
      };
      registry.register('createMember', createMemberTool, toolByName('createMember'));

      // Member attempting to execute staff-only createMember tool
      const result = await registry.execute(
        'createMember',
        {
          tenantId: TENANT_A,
          userId: USER_MEMBER,
          role: 'member',
          correlationId: 'corr-5',
          isConfirmedPendingAction: true,
        },
        { fullName: 'New Member', phone: '+919876543210' },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PERMISSION_DENIED');
      expect(result.error).toContain('Access denied');
      expect(createMemberTool.execute).not.toHaveBeenCalled();

      // Verifies security audit log was written
      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          action: 'security.unauthorized_tool_access',
          actorId: USER_MEMBER,
        }),
      );
    });

    it('allows authorized staff roles (admin/owner) to execute privileged tools', async () => {
      const mockTool: any = {
        execute: jest.fn<any>().mockResolvedValue({ success: true, data: { created: true } }),
      };
      registry.register('createMember', mockTool, toolByName('createMember'));

      const result = await registry.execute(
        'createMember',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-6',
          isConfirmedPendingAction: true,
        },
        { fullName: 'Valid Member', phone: '+919876543210' },
      );

      expect(result.success).toBe(true);
      expect(mockTool.execute).toHaveBeenCalled();
    });
  });

  describe('4. Side-Effecting Tools & Pending-Action Confirmation Requirement', () => {
    it('blocks direct execution of write tools when confirmation is not present', async () => {
      const mockTool: any = {
        execute: jest.fn<any>(),
      };
      registry.register('createMember', mockTool, toolByName('createMember'));

      // Attempting direct execution without isConfirmedPendingAction
      const result = await registry.execute(
        'createMember',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-7',
          isConfirmedPendingAction: false,
        },
        { fullName: 'Unconfirmed Member', phone: '+919876543210' },
        { isConfirmedPendingAction: false },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
      expect(result.error).toContain('requires pending-action confirmation before execution');
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('allows execution of read-only tools without confirmation', async () => {
      const mockTool: any = {
        execute: jest.fn<any>().mockResolvedValue({ success: true, data: { count: 42 } }),
      };
      registry.register('getMemberCount', mockTool, toolByName('getMemberCount'));

      const result = await registry.execute(
        'getMemberCount',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-8',
        },
        { status: 'active' },
      );

      expect(result.success).toBe(true);
      expect(mockTool.execute).toHaveBeenCalled();
    });

    it('allows execution of write tools when executed via confirmed pending-action lifecycle', async () => {
      const mockTool: any = {
        execute: jest.fn<any>().mockResolvedValue({ success: true, data: { memberId: 'mem-999' } }),
      };
      registry.register('createMember', mockTool, toolByName('createMember'));

      const result = await registry.execute(
        'createMember',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-9',
          isConfirmedPendingAction: true,
        },
        { fullName: 'Confirmed Member', phone: '+919876543210' },
        { isConfirmedPendingAction: true },
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ memberId: 'mem-999' });
    });
  });

  describe('5. Prohibited Tools Enforcement', () => {
    it('strictly rejects prohibited tools (such as bookSession in Phase 1)', async () => {
      const dummyTool: any = { execute: jest.fn<any>() };
      registry.register('bookSession', dummyTool);

      const result = await registry.execute('bookSession', {
        tenantId: TENANT_A,
        userId: USER_STAFF,
        role: 'admin',
        correlationId: 'corr-10',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TOOL_PROHIBITED');
      expect(result.error).toContain('Tool bookSession is prohibited in current phase');
      expect(dummyTool.execute).not.toHaveBeenCalled();
    });
  });

  describe('6. Tool Schema Validation via Zod', () => {
    it('rejects invalid arguments when required fields are missing', async () => {
      const mockTool: any = { execute: jest.fn<any>() };
      registry.register('createMember', mockTool, toolByName('createMember'));

      // Missing phone
      const result = await registry.execute(
        'createMember',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-11',
          isConfirmedPendingAction: true,
        },
        { fullName: 'Alice' },
        { isConfirmedPendingAction: true },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_ARGUMENTS');
      expect(result.error).toContain('Invalid arguments');
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid argument types (e.g. invalid date or invalid enum)', async () => {
      const mockTool: any = { execute: jest.fn<any>() };
      registry.register('createMember', mockTool, toolByName('createMember'));

      // startDate not matching YYYY-MM-DD regex
      const result = await registry.execute(
        'createMember',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-12',
          isConfirmedPendingAction: true,
        },
        { fullName: 'Alice', phone: '+919876543210', startDate: 'invalid-date' },
        { isConfirmedPendingAction: true },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_ARGUMENTS');
      expect(mockTool.execute).not.toHaveBeenCalled();
    });
  });

  describe('7. Idempotency Preservation & Duplicate Prevention', () => {
    it('returns cached result on repeated calls with the same idempotencyKey without re-invoking tool', async () => {
      let callCount = 0;
      const mockTool: any = {
        execute: jest.fn<any>().mockImplementation(async () => {
          callCount++;
          return { success: true, data: { orderId: `order-${callCount}` } };
        }),
      };
      registry.register('createMember', mockTool, toolByName('createMember'));

      const idempotencyKey = 'unique-key-abc-123';

      // First call
      const firstResult = await registry.execute(
        'createMember',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-13',
          isConfirmedPendingAction: true,
        },
        { fullName: 'Alice', phone: '+919876543210' },
        { isConfirmedPendingAction: true, idempotencyKey },
      );

      expect(firstResult.success).toBe(true);
      expect(firstResult.data).toEqual({ orderId: 'order-1' });
      expect(callCount).toBe(1);

      // Second call with same idempotency key
      const secondResult = await registry.execute(
        'createMember',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-14',
          isConfirmedPendingAction: true,
        },
        { fullName: 'Alice', phone: '+919876543210' },
        { isConfirmedPendingAction: true, idempotencyKey },
      );

      expect(secondResult.success).toBe(true);
      expect(secondResult.data).toEqual({ orderId: 'order-1' });
      // Tool was NOT re-invoked
      expect(callCount).toBe(1);
    });

    it('isolates idempotency keys by tenant so different tenants do not share cached outcomes', async () => {
      let callCount = 0;
      const mockTool: any = {
        execute: jest.fn<any>().mockImplementation(async () => {
          callCount++;
          return { success: true, data: { invocation: callCount } };
        }),
      };
      registry.register('createMember', mockTool, toolByName('createMember'));

      const idempotencyKey = 'shared-key-xyz';

      // Tenant A
      await registry.execute(
        'createMember',
        { tenantId: TENANT_A, userId: USER_STAFF, role: 'admin', correlationId: 'corr-15', isConfirmedPendingAction: true },
        { fullName: 'Alice', phone: '+919876543210' },
        { isConfirmedPendingAction: true, idempotencyKey },
      );
      expect(callCount).toBe(1);

      // Tenant B with same idempotency key executes independently
      await registry.execute(
        'createMember',
        { tenantId: TENANT_B, userId: USER_STAFF, role: 'admin', correlationId: 'corr-16', isConfirmedPendingAction: true },
        { fullName: 'Bob', phone: '+919876543211' },
        { isConfirmedPendingAction: true, idempotencyKey },
      );
      expect(callCount).toBe(2);
    });
  });

  describe('8. Audit Trail Outcomes & PII Redaction', () => {
    it('records sanitized audit metadata without exposing raw sensitive phone/email/password', async () => {
      const mockTool: any = {
        execute: jest.fn<any>().mockResolvedValue({ success: true, data: { ok: true } }),
      };
      registry.register('createMember', mockTool, toolByName('createMember'));

      await registry.execute(
        'createMember',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-audit-1',
          isConfirmedPendingAction: true,
        },
        {
          fullName: 'Sita Sharma',
          phone: '+919876543210',
          email: 'sita.sharma@example.com',
        },
        { isConfirmedPendingAction: true },
      );

      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          action: 'ai.tool.createMember',
          resourceRef: 'createMember',
          payload: expect.objectContaining({
            toolName: 'createMember',
            success: true,
            arguments: expect.objectContaining({
              phone: '[REDACTED]',
              email: '[REDACTED]',
            }),
          }),
        }),
      );
    });

    it('records failed tool execution outcomes in audit outbox', async () => {
      const failingTool: any = {
        execute: jest.fn<any>().mockRejectedValue(new Error('ERP connection timeout')),
      };
      registry.register('getMemberCount', failingTool, toolByName('getMemberCount'));

      const result = await registry.execute('getMemberCount', {
        tenantId: TENANT_A,
        userId: USER_STAFF,
        role: 'admin',
        correlationId: 'corr-fail-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('ERP connection timeout');

      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          action: 'ai.tool.getMemberCount',
          payload: expect.objectContaining({
            success: false,
            error: 'ERP connection timeout',
          }),
        }),
      );
    });
  });

  describe('9. Fallback ERP Bridge Tool Execution', () => {
    it('executes mapped ERP methods through ErpBridgeTool conforming to BaseTool contract', async () => {
      // Simulate module init registering an ERP bridge tool for an ERP method
      await registry.onModuleInit();

      expect(registry.has('getExpiringMemberships')).toBe(true);

      const result = await registry.execute(
        'getExpiringMemberships',
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'corr-erp-1',
        },
        { daysAhead: 7 },
      );

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          body: { daysAhead: 7 },
        }),
      );
    });
  });

  describe('10. End-to-End Integration with Orchestrator & Controller', () => {
    it('ConversationOrchestrator routes tool calls through ToolRegistry', async () => {
      const mockLlmGateway: any = {
        chat: jest.fn<any>().mockResolvedValue({
          content: 'Here are the results',
          toolCalls: [
            {
              id: 'call_1',
              function: {
                name: 'getMemberCount',
                arguments: JSON.stringify({ status: 'active' }),
              },
            },
          ],
        }),
      };

      const mockObservability: any = {
        recordLlmCall: jest.fn<any>(),
      };

      const customTool: any = {
        execute: jest.fn<any>().mockResolvedValue({ success: true, data: { count: 120 } }),
      };
      registry.register('getMemberCount', customTool, toolByName('getMemberCount'));

      const orchestrator = new ConversationOrchestrator(
        mockLlmGateway,
        mockAuditOutbox,
        mockErpService,
        mockObservability,
        undefined,
        undefined,
        registry,
      );

      const response = await orchestrator.processMessage(
        {
          tenantId: TENANT_A,
          userId: USER_STAFF,
          role: 'admin',
          correlationId: 'orch-corr-1',
        },
        'How many active members do we have?',
      );

      expect(customTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_A }),
        { status: 'active' },
      );
      expect(response.response).toBeDefined();
    });

    it('AiController confirmAssistantAction executes frozen DB payload via ToolRegistry and records failure on tool failure', async () => {
      const mockTx = {
        pendingAction: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: 'pa-uuid-1',
            tenantId: TENANT_A,
            userId: USER_STAFF,
            actionType: 'createMember',
            status: 'proposed',
            confirmToken: 'tok-123',
            expiresAt: new Date(Date.now() + 600000),
            payload: { fullName: 'Sita', phone: '+919876543210' },
          }),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
          update: jest.fn<any>().mockResolvedValue({ id: 'pa-uuid-1', status: 'failed' }),
        },
      };

      const mockPrisma: any = {
        withTenant: jest.fn<any>().mockImplementation(async (tenantId: string, fn: any) => fn(mockTx)),
      };

      const failingTool: any = {
        execute: jest.fn<any>().mockResolvedValue({
          success: false,
          error: 'External ERP service unavailable',
          errorCode: 'ERP_CALL_FAILED',
        }),
      };
      registry.register('createMember', failingTool, toolByName('createMember'));

      const controller = new AiController(
        {} as any,
        {} as any,
        {} as any,
        mockPrisma,
        mockAuditOutbox,
        registry,
      );

      const result = await controller.confirmAssistantAction(
        { id: USER_STAFF, tenantId: TENANT_A, role: 'admin' },
        'pa-uuid-1',
        { confirm_token: 'tok-123' },
      );

      // Verifies contract: never reports success on tool failure!
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('External ERP service unavailable');

      // Verifies DB recorded status failed
      expect(mockTx.pendingAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
          }),
        }),
      );
    });
  });

  describe('10. createMember Name Parsing & Orchestrator Guard', () => {
    const TENANT_A = '11111111-1111-1111-1111-111111111111';
    const USER_STAFF = '33333333-3333-3333-3333-333333333333';

    let registry: ToolRegistry;
    let mockAuditOutbox: any;
    let mockErpService: any;
    let mockModuleRef: any;

    beforeEach(() => {
      mockAuditOutbox = {
        record: jest.fn<any>().mockResolvedValue({
          audit: { id: 'audit-log-uuid-1' },
          outbox: { id: 'outbox-log-uuid-1' },
        }),
      };

      mockErpService = {
        call: jest.fn<any>().mockResolvedValue({
          id: 'erp-record-123',
          status: 'success',
        }),
      };

      mockModuleRef = {
        get: jest.fn<any>(),
      };

      registry = new ToolRegistry(mockModuleRef, mockAuditOutbox, mockErpService);
    });

    it('CreateMemberTool.cleanFullName strips "named" prefix', () => {
      const tool = new (require('../ai/tools/create-member.tool').CreateMemberTool)(mockErpService);
      expect(tool['cleanFullName']('named John Doe')).toBe('John Doe');
      expect(tool['cleanFullName']('Named Jane Smith')).toBe('Jane Smith');
    });

    it('CreateMemberTool.cleanFullName strips "name is" prefix', () => {
      const tool = new (require('../ai/tools/create-member.tool').CreateMemberTool)(mockErpService);
      expect(tool['cleanFullName']('name is John Doe')).toBe('John Doe');
      expect(tool['cleanFullName']('Name Is Jane Smith')).toBe('Jane Smith');
    });

    it('CreateMemberTool.cleanFullName strips "called" prefix', () => {
      const tool = new (require('../ai/tools/create-member.tool').CreateMemberTool)(mockErpService);
      expect(tool['cleanFullName']('called John Doe')).toBe('John Doe');
      expect(tool['cleanFullName']('Called Jane Smith')).toBe('Jane Smith');
    });

    it('CreateMemberTool.cleanFullName strips "name:" prefix', () => {
      const tool = new (require('../ai/tools/create-member.tool').CreateMemberTool)(mockErpService);
      expect(tool['cleanFullName']('name: John Doe')).toBe('John Doe');
      expect(tool['cleanFullName']('Name: Jane Smith')).toBe('Jane Smith');
    });

    it('CreateMemberTool.cleanFullName does not modify clean names', () => {
      const tool = new (require('../ai/tools/create-member.tool').CreateMemberTool)(mockErpService);
      expect(tool['cleanFullName']('John Doe')).toBe('John Doe');
      expect(tool['cleanFullName']('Jane Smith')).toBe('Jane Smith');
    });

    it('ConversationOrchestrator auto-extracts fields for member creation and proposes pending action', async () => {
      const mockLlmGateway = {
        chat: jest.fn<any>().mockResolvedValue({ 
          content: '', 
          toolCalls: [] 
        }),
        estimateTokens: jest.fn<any>().mockReturnValue(100),
      };

      const mockAuditOutbox = {
        record: jest.fn<any>().mockResolvedValue({
          audit: { id: 'audit-log-uuid-1' },
          outbox: { id: 'outbox-log-uuid-1' },
        }),
      };

      const mockErpService = {
        call: jest.fn<any>().mockResolvedValue({ id: 'erp-record-123', status: 'success' }),
      };

      const mockObservability = {
        recordToolCall: jest.fn<any>().mockResolvedValue(undefined),
        recordLlmCall: jest.fn<any>().mockResolvedValue(undefined),
      };

      const orchestrator = new ConversationOrchestrator(
        mockLlmGateway,
        mockAuditOutbox,
        mockErpService,
        mockObservability,
        undefined, // no PendingActionService
        undefined, // no stateMachineInstance
        undefined, // no ToolRegistry - uses fallback mode
      );

      const context = {
        tenantId: TENANT_A,
        tenantCode: 'demo',
        userId: USER_STAFF,
        role: 'admin',
        correlationId: 'corr-1',
      };

      // The orchestrator should auto-extract fields and propose pending action
      const result = await orchestrator.processMessage(
        context,
        'Create a new member named John Doe, phone +919876543210, email john.doe@example.com',
        []
      );

      // The orchestrator proposes a pending action with clean fullName
      expect(result).toBeDefined();
      expect(result.pendingActionId).toBeDefined();
      expect(result.confirmToken).toBeDefined();
      expect(result.requiresConfirmation).toBe(true);
      expect(result.state).toBe('proposed');
      // The pending action arguments should have clean fullName
      // Note: The actual arguments are in the pendingActionId which we can't verify here
      // but the extraction logic is tested in the CreateMemberTool.cleanFullName tests
    });
  });
});

