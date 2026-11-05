import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AiController } from '../ai/ai.controller';
import { ConversationOrchestrator } from '../ai/orchestrator/conversation-loop';
import { ConversationService } from '../ai/conversation.service';
import { PendingActionService } from '../ai/pending-action.service';
import { PrismaService } from '../common/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { ToolRegistry } from '../ai/tools/tool-registry';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { can } from '../common/policy';

describe('AI-05: AI Audit Log Retrieval, Filtering, and Security', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111';
  const TENANT_B = '22222222-2222-2222-2222-222222222222';
  const USER_ADMIN = '33333333-3333-3333-3333-333333333333';
  const USER_MEMBER = '44444444-4444-4444-4444-444444444444';
  const USER_FRONTDESK = '55555555-5555-5555-5555-555555555555';

  let controller: AiController;
  let mockOrchestrator: any;
  let mockConversationService: any;
  let mockPendingActionService: any;
  let mockPrisma: any;
  let mockAuditOutbox: any;
  let mockTx: any;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockTx = {
      $queryRaw: jest.fn().mockImplementation(async () => []),
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
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

    toolRegistry = new ToolRegistry(undefined, mockAuditOutbox, undefined);

    controller = new AiController(
      mockOrchestrator,
      mockConversationService,
      mockPendingActionService,
      mockPrisma,
      mockAuditOutbox,
      toolRegistry,
    );
  });

  describe('1. Authorized Retrieval & Response Schema Verification', () => {
    it('retrieves audit records for admin with documented response fields', async () => {
      const fixedDate = new Date('2026-10-15T12:00:00.000Z');
      mockTx.auditLog.findMany.mockResolvedValue([
        {
          id: 'audit-log-uuid-001',
          tenantId: TENANT_A,
          actorId: USER_ADMIN,
          actorType: 'staff',
          action: 'ai.tool.createMember',
          resourceType: 'tool',
          resourceRef: 'createMember',
          afterData: {
            toolName: 'createMember',
            arguments: { full_name: 'Jane Doe', plan: 'Gold' },
            result: { record_id: 'MEM-001' },
            decision: 'approved',
            approval: { approved_by: USER_ADMIN },
          },
          createdAt: fixedDate,
        },
      ]);

      const logs = await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
        undefined,
        USER_ADMIN,
        'createMember',
      );

      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(1);
      expect(logs[0]).toEqual({
        id: 'audit-log-uuid-001',
        actor: USER_ADMIN,
        tool: 'createMember',
        arguments_redacted: { full_name: 'Jane Doe', plan: 'Gold' },
        decision: 'approved',
        approval: { approved_by: USER_ADMIN },
        result: { record_id: 'MEM-001' },
        at: fixedDate.toISOString(),
      });
    });

    it('allows studio owner full access to audit logs', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([]);

      const logs = await controller.getAiAudit(
        { id: 'owner-uuid', tenantId: TENANT_A, tenantCode: 'TEST', role: 'owner' },
      );

      expect(Array.isArray(logs)).toBe(true);
      expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
    });

    it('resolves tool name correctly for confirm and reject actions', async () => {
      const fixedDate = new Date('2026-10-15T12:30:00.000Z');
      mockTx.auditLog.findMany.mockResolvedValue([
        {
          id: 'audit-confirm-1',
          tenantId: TENANT_A,
          actorId: USER_ADMIN,
          actorType: 'staff',
          action: 'ai.action.confirm.freezeMembership',
          resourceType: 'pending_action',
          resourceRef: 'pa-uuid-1',
          afterData: {
            arguments: { reason: 'Medical' },
            decision: 'approved',
            approval: { approved_by: USER_ADMIN },
            result: 'succeeded',
          },
          createdAt: fixedDate,
        },
        {
          id: 'audit-reject-1',
          tenantId: TENANT_A,
          actorId: USER_ADMIN,
          actorType: 'staff',
          action: 'ai.action.reject.deleteMember',
          resourceType: 'pending_action',
          resourceRef: 'pa-uuid-2',
          afterData: {
            arguments: {},
            decision: 'rejected',
            result: 'rejected',
          },
          createdAt: fixedDate,
        },
      ]);

      const logs = await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
      );

      expect(logs[0].tool).toBe('freezeMembership');
      expect(logs[0].decision).toBe('approved');
      expect(logs[0].result).toBe('succeeded');

      expect(logs[1].tool).toBe('deleteMember');
      expect(logs[1].decision).toBe('rejected');
      expect(logs[1].result).toBe('rejected');
    });
  });

  describe('2. Authentication & Authorization Enforcement', () => {
    it('throws UnauthorizedException when user or tenantId is missing', async () => {
      await expect(
        controller.getAiAudit(null as any),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        controller.getAiAudit({ id: USER_ADMIN, tenantId: '', tenantCode: 'TEST', role: 'admin' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when role lacks audit:read (member, trainer, front_desk)', async () => {
      await expect(
        controller.getAiAudit({ id: USER_MEMBER, tenantId: TENANT_A, tenantCode: 'TEST', role: 'member' }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        controller.getAiAudit({ id: 'trainer-id', tenantId: TENANT_A, tenantCode: 'TEST', role: 'trainer' }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        controller.getAiAudit({ id: USER_FRONTDESK, tenantId: TENANT_A, tenantCode: 'TEST', role: 'front_desk' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('3. Strict Tenant Isolation', () => {
    it('always scopes audit queries to the authenticated tenant, ignoring any query parameters', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([]);

      await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
        { user_id: USER_ADMIN, tool: 'createMember' } as any,
      );

      expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
      expect(mockTx.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_A,
          }),
        }),
      );
    });

    it('never leaks audit records across tenant boundaries', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([]);

      await controller.getAiAudit(
        { id: 'admin-b', tenantId: TENANT_B, tenantCode: 'TEST', role: 'admin' },
      );

      expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_B, expect.any(Function));
      expect(mockTx.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_B,
          }),
        }),
      );
    });
  });

  describe('4. Filter Validation & Query Parameter Handling', () => {
    it('supports Document 5 filter[user_id] and filter[tool] aliases', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([]);

      await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
        {
          'filter[user_id]': 'usr_target_123',
          'filter[tool]': 'member_freeze',
        } as any,
      );

      expect(mockTx.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_A,
            actorId: 'usr_target_123',
            resourceRef: 'member_freeze',
          }),
        }),
      );
    });

    it('validates ISO-8601 from date and rejects invalid formats with 400', async () => {
      await expect(
        controller.getAiAudit(
          { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          { from: 'invalid-date-string' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates ISO-8601 to date and rejects invalid formats with 400', async () => {
      await expect(
        controller.getAiAudit(
          { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          { to: 'not-a-real-date' } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects date ranges where from date is later than to date with 400', async () => {
      await expect(
        controller.getAiAudit(
          { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          {
            from: '2026-10-20T00:00:00Z',
            to: '2026-10-10T00:00:00Z',
          } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts valid date range filter and passes gte/lte to Prisma where clause', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([]);

      await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
        {
          from: '2026-10-01T00:00:00Z',
          to: '2026-10-15T23:59:59Z',
        } as any,
      );

      expect(mockTx.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_A,
            createdAt: {
              gte: new Date('2026-10-01T00:00:00Z'),
              lte: new Date('2026-10-15T23:59:59Z'),
            },
          }),
        }),
      );
    });

    it('rejects limit < 1 or > 100 or non-integer with 400', async () => {
      await expect(
        controller.getAiAudit(
          { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          { limit: 0 } as any,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getAiAudit(
          { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          { limit: 101 } as any,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getAiAudit(
          { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          { limit: 12.5 } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects page < 1 or non-integer with 400', async () => {
      await expect(
        controller.getAiAudit(
          { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          { page: 0 } as any,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getAiAudit(
          { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          { page: -5 } as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('applies deterministic pagination with cursor or offset', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([]);

      // Test offset pagination: page 3, limit 15 -> skip 30, take 15
      await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
        { page: 3, limit: 15 } as any,
      );

      expect(mockTx.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 15,
          skip: 30,
          orderBy: { createdAt: 'desc' },
        }),
      );

      // Test cursor pagination: cursor provided -> skip 1, cursor object
      await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
        { cursor: 'cursor-id-999', limit: 20 } as any,
      );

      expect(mockTx.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 1,
          cursor: { id: 'cursor-id-999' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('5. Error Handling: Empty Results vs Database Failures', () => {
    it('returns empty array when no logs match query filters without error', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([]);

      const result = await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
      );

      expect(result).toEqual([]);
    });

    it('throws honest InternalServerErrorException (code: DATABASE_ERROR) on database failure', async () => {
      mockTx.auditLog.findMany.mockRejectedValue(new Error('Connection to PostgreSQL lost'));

      await expect(
        controller.getAiAudit({ id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('6. PII & Secret Redaction Guarantee', () => {
    it('redacts passwords, tokens, API keys, and payment card details in arguments_redacted', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([
        {
          id: 'audit-leak-test',
          tenantId: TENANT_A,
          actorId: USER_ADMIN,
          actorType: 'staff',
          action: 'ai.tool.updatePaymentMethod',
          resourceType: 'tool',
          resourceRef: 'updatePaymentMethod',
          afterData: {
            arguments: {
              member_id: 'MEM-001',
              password: 'SuperSecretPassword123!',
              token: 'bearer_token_abc_xyz',
              credit_card: '4111222233334444',
              cvv: '123',
              auth_token: 'jwt_tok_secret',
              safeField: 'RegularText',
            },
            result: 'succeeded',
          },
          createdAt: new Date(),
        },
      ]);

      const logs = await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
      );

      const args = logs[0].arguments_redacted;
      expect(args.password).toBe('[REDACTED]');
      expect(args.token).toBe('[REDACTED]');
      expect(args.credit_card).toBe('[REDACTED]');
      expect(args.cvv).toBe('[REDACTED]');
      expect(args.auth_token).toBe('[REDACTED]');
      expect(args.safeField).toBe('RegularText');
      expect(args.member_id).toBe('MEM-001');
    });

    it('redacts phone numbers, email addresses, OTPs, Aadhaar, and PAN in arguments_redacted while preserving legitimate business fields', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([
        {
          id: 'audit-pii-redaction-test',
          tenantId: TENANT_A,
          actorId: USER_ADMIN,
          actorType: 'staff',
          action: 'ai.tool.createMember',
          resourceType: 'tool',
          resourceRef: 'createMember',
          afterData: {
            arguments: {
              full_name: 'Jane Doe',
              plan: 'Gold',
              phone: '+91 9876543210',
              email: 'jane.doe@example.com',
              otp: '654321',
              pan: 'ABCDE1234F',
              aadhaar: '1234 5678 9012',
              notes: 'Contact customer at 9876543210 or help@gym.com',
            },
            result: {
              record_id: 'MEM-00043',
              phone: '9876543210',
              email: 'jane.doe@example.com',
              status: 'active',
            },
          },
          createdAt: new Date(),
        },
      ]);

      const logs = await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
      );

      const args = logs[0].arguments_redacted;
      // Sensitive fields must be redacted
      expect(args.phone).toBe('[REDACTED]');
      expect(args.email).toBe('[REDACTED]');
      expect(args.otp).toBe('[REDACTED]');
      expect(args.pan).toBe('[REDACTED]');
      expect(args.aadhaar).toBe('[REDACTED]');
      // Non-sensitive business fields must be preserved
      expect(args.full_name).toBe('Jane Doe');
      expect(args.plan).toBe('Gold');
      // Embedded PII in string notes must be sanitized
      expect(args.notes).not.toContain('9876543210');
      expect(args.notes).not.toContain('help@gym.com');

      // Result object must also have sensitive keys redacted
      const res = logs[0].result as Record<string, unknown>;
      expect(res.record_id).toBe('MEM-00043');
      expect(res.status).toBe('active');
      expect(res.phone).toBe('[REDACTED]');
      expect(res.email).toBe('[REDACTED]');
    });

    it('verifies AuditOutboxService sanitizes phone, email, ssn, credentials, and payment cards at snapshot write time', async () => {
      const recordedCalls: any[] = [];
      mockTx.auditLog.create.mockImplementation(async (args: any) => {
        recordedCalls.push(args.data);
        return { id: 'audit-id-outbox-test', ...args.data };
      });
      mockTx.outboxEvent.create.mockResolvedValue({ id: 'outbox-id-1' });

      const realAuditService = new AuditOutboxService(mockPrisma);
      await realAuditService.recordInTransaction(mockTx, {
        tenantId: TENANT_A,
        correlationId: 'corr-redact-test',
        actorType: 'staff',
        actorId: USER_ADMIN,
        action: 'ai.tool.createMember',
        resourceType: 'tool',
        resourceRef: 'createMember',
        eventType: 'ai.tool.createMember',
        payload: {
          toolName: 'createMember',
          arguments: {
            full_name: 'John Doe',
            phone: '9876543210',
            email: 'john@example.com',
            password: 'secretPassword',
            credit_card: '4111222233334444',
            ssn: '123-45-6789',
          },
        },
      });

      expect(recordedCalls.length).toBe(1);
      const afterData = recordedCalls[0].afterData;
      expect(afterData).toBeDefined();
      expect(afterData.arguments.phone).toBe('[REDACTED]');
      expect(afterData.arguments.email).toBe('[REDACTED]');
      expect(afterData.arguments.password).toBe('[REDACTED]');
      expect(afterData.arguments.credit_card).toBe('[REDACTED]');
      expect(afterData.arguments.ssn).toBe('[REDACTED]');
      expect(afterData.arguments.full_name).toBe('John Doe');
    });

    it('redacts camelCase card keys (cardNumber, creditCard, cvc, paymentCard, passcode) in arguments_redacted and audit snapshots', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([
        {
          id: 'audit-card-keys-test',
          tenantId: TENANT_A,
          actorId: USER_ADMIN,
          actorType: 'staff',
          action: 'ai.tool.processPayment',
          resourceType: 'tool',
          resourceRef: 'processPayment',
          afterData: {
            arguments: {
              member_id: 'MEM-002',
              cardNumber: '4111222233334444',
              creditCard: '4222333344445555',
              paymentCard: '4333444455556666',
              cvc: '789',
              passcode: '987654',
              planName: 'Platinum Membership',
            },
            result: 'succeeded',
          },
          createdAt: new Date(),
        },
      ]);

      const logs = await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
      );

      const args = logs[0].arguments_redacted;
      expect(args.cardNumber).toBe('[REDACTED]');
      expect(args.creditCard).toBe('[REDACTED]');
      expect(args.paymentCard).toBe('[REDACTED]');
      expect(args.cvc).toBe('[REDACTED]');
      expect(args.passcode).toBe('[REDACTED]');
      expect(args.planName).toBe('Platinum Membership');
      expect(args.member_id).toBe('MEM-002');
    });

    it('redacts payment card numbers and emails inside error strings and notes while preserving diagnostic text', async () => {
      mockTx.auditLog.findMany.mockResolvedValue([
        {
          id: 'audit-error-pii-test',
          tenantId: TENANT_A,
          actorId: USER_ADMIN,
          actorType: 'staff',
          action: 'ai.action.confirm.error.createMember',
          resourceType: 'pending_action',
          resourceRef: 'pa-error-1',
          afterData: {
            arguments: {
              full_name: 'Alice Smith',
              notes: 'Failed attempt charging card 4111222233334444 for alice@gym.com',
            },
            result: 'Declined: card 4111-2222-3333-4444 expired for user alice@gym.com',
            decision: 'approved',
            approval: { approved_by: USER_ADMIN },
          },
          createdAt: new Date(),
        },
      ]);

      const logs = await controller.getAiAudit(
        { id: USER_ADMIN, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
      );

      const args = logs[0].arguments_redacted;
      expect(args.full_name).toBe('Alice Smith');
      expect(args.notes).not.toContain('4111222233334444');
      expect(args.notes).not.toContain('alice@gym.com');
      expect(args.notes).toContain('[CARD]');
      expect(args.notes).toContain('[EMAIL]');

      const resStr = logs[0].result as string;
      expect(resStr).not.toContain('4111-2222-3333-4444');
      expect(resStr).not.toContain('alice@gym.com');
      expect(resStr).toContain('[CARD]');
      expect(resStr).toContain('[EMAIL]');
      expect(resStr).toContain('Declined');
    });

    it('verifies AuditOutboxService sanitizes embedded phone, email, and card numbers from string fields in afterData', async () => {
      const recordedCalls: any[] = [];
      mockTx.auditLog.create.mockImplementation(async (args: any) => {
        recordedCalls.push(args.data);
        return { id: 'audit-id-outbox-string-test', ...args.data };
      });
      mockTx.outboxEvent.create.mockResolvedValue({ id: 'outbox-id-2' });

      const realAuditService = new AuditOutboxService(mockPrisma);
      await realAuditService.recordInTransaction(mockTx, {
        tenantId: TENANT_A,
        correlationId: 'corr-string-redact-test',
        actorType: 'staff',
        actorId: USER_ADMIN,
        action: 'ai.action.confirm.createMember',
        resourceType: 'pending_action',
        resourceRef: 'pa-string-test',
        eventType: 'ai.action.confirmed',
        payload: { actionType: 'createMember' },
        afterData: {
          actionType: 'createMember',
          summary: 'Member Alice Smith registered with phone +919876543210 and card 4111 2222 3333 4444',
          error: 'Error: Failed to send OTP to alice@example.com at +91 9876543210',
          arguments: {
            cardNumber: '4111222233334444',
            cvc: '999',
          },
        },
      });

      expect(recordedCalls.length).toBe(1);
      const afterData = recordedCalls[0].afterData;
      expect(afterData).toBeDefined();
      expect(afterData.arguments.cardNumber).toBe('[REDACTED]');
      expect(afterData.arguments.cvc).toBe('[REDACTED]');
      expect(afterData.summary).not.toContain('+919876543210');
      expect(afterData.summary).not.toContain('4111 2222 3333 4444');
      expect(afterData.summary).toContain('[PHONE]');
      expect(afterData.summary).toContain('[CARD]');
      expect(afterData.error).not.toContain('alice@example.com');
      expect(afterData.error).not.toContain('+91 9876543210');
      expect(afterData.error).toContain('[EMAIL]');
      expect(afterData.error).toContain('[PHONE]');
    });
  });

  describe('7. Audit Event Accuracy across ToolRegistry Lifecycles', () => {
    it('records security audit when unauthorized user attempts restricted tool', async () => {
      const toolDef = {
        name: 'getRevenueSummary',
        description: 'Revenue summary tool',
        category: 'revenue' as const,
        risk: 'read' as const,
        requiresConfirmation: false,
        args: {} as any,
        requiredPermission: 'reports:read',
      };

      toolRegistry.register('getRevenueSummary', {
        name: 'getRevenueSummary',
        execute: jest.fn<any>(),
      } as any, toolDef as any);

      const result = await toolRegistry.execute('getRevenueSummary', {
        tenantId: TENANT_A,
        tenantCode: 'TEST',
        userId: USER_MEMBER,
        role: 'member',
        correlationId: 'sec-corr-1',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PERMISSION_DENIED');

      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          actorType: 'ai',
          action: 'security.unauthorized_tool_access',
          eventType: 'security.unauthorized_tool_access',
          payload: expect.objectContaining({
            toolName: 'getRevenueSummary',
            role: 'member',
            requiredPermission: 'reports:read',
          }),
        }),
      );
    });

    it('records audit event for tool execution failure without false-success inference', async () => {
      const failingTool = {
        name: 'getMemberCount',
        execute: jest.fn<any>().mockResolvedValue({
          success: false,
          error: 'ERP system timed out',
          errorCode: 'ERP_TIMEOUT',
        }),
      };

      toolRegistry.register('getMemberCount', failingTool as any);

      const result = await toolRegistry.execute('getMemberCount', {
        tenantId: TENANT_A,
        tenantCode: 'TEST',
        userId: USER_ADMIN,
        role: 'admin',
        correlationId: 'fail-corr-1',
      });

      expect(result.success).toBe(false);

      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          action: 'ai.tool.getMemberCount',
          payload: expect.objectContaining({
            success: false,
            error: 'ERP system timed out',
            errorCode: 'ERP_TIMEOUT',
          }),
        }),
      );
    });
  });
});
