import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HttpException, HttpStatus, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ToolRegistry } from '../ai/tools/tool-registry';
import { CreateBookingTool } from '../ai/tools/create-booking.tool';
import { ToolContext } from '../ai/tools/base-tool';
import { PendingActionService, ActionReconciler } from '../ai/pending-action.service';
import { CancelBookingTool } from '../ai/tools/cancel-booking.tool';
import { GetAvailabilityTool } from '../ai/tools/get-availability.tool';
import { GetEligibleScheduleTool } from '../ai/tools/get-eligible-schedule.tool';
import { GetMemberPlanEntitlementTool } from '../ai/tools/get-member-plan-entitlement.tool';
import { AgentRegistryService } from '../ai/agents/agent-registry.service';
import { AiController } from '../ai/ai.controller';
import { toolByName, PROHIBITED_TOOLS } from '@wsos/ai-tool-definitions';
import { canUseTool, TOOL_PERMISSIONS } from '../ai/guardrails/scope-rules';
import { can } from '../common/policy';

describe('AI Component 4 — Member Booking Assistant & Natural-Language Booking (Items 3 & 31)', () => {
  const TENANT_ID = '10000000-0000-0000-0000-000000000001';
  const MEMBER_ID = '20000000-0000-0000-0000-000000000001';
  const MEMBER_REF = 'WS-MEM-0001';
  const OTHER_MEMBER_ID = '30000000-0000-0000-0000-000000000001';
  const OTHER_MEMBER_REF = 'WS-MEM-0002';
  const ADMIN_ID = '40000000-0000-0000-0000-000000000001';

  let mockErpService: any;
  let mockAuditOutbox: any;
  let mockPrisma: any;
  let mockTx: any;
  let mockLlmGateway: any;
  let mockOrchestrator: any;
  let toolRegistry: ToolRegistry;
  let createBookingTool: CreateBookingTool;
  let cancelBookingTool: CancelBookingTool;
  let getAvailabilityTool: GetAvailabilityTool;
  let getEligibleScheduleTool: GetEligibleScheduleTool;
  let getPlanEntitlementTool: GetMemberPlanEntitlementTool;
  let agentRegistryService: AgentRegistryService;
  let aiController: AiController;

  beforeEach(() => {
    mockErpService = {
      call: jest.fn<any>(),
    };

    mockAuditOutbox = {
      record: jest.fn<any>().mockResolvedValue({ audit: { id: 'audit-c4-001' } }),
      recordInTransaction: jest.fn<any>().mockResolvedValue({ id: 'audit-c4-001' }),
    };

    mockTx = {
      tenant: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: TENANT_ID }),
      },
      auditLog: {
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
      userErpLink: {
        findFirst: jest.fn<any>().mockImplementation(({ where }: any) => {
          if (where?.tenantId !== TENANT_ID) return Promise.resolve(null);
          if (where?.userId === MEMBER_ID || where?.erpUserRef === MEMBER_REF) {
            return Promise.resolve({
              tenantId: TENANT_ID,
              userId: MEMBER_ID,
              erpUserRef: MEMBER_REF,
            });
          }
          if (where?.userId === OTHER_MEMBER_ID || where?.erpUserRef === OTHER_MEMBER_REF) {
            return Promise.resolve({
              tenantId: TENANT_ID,
              userId: OTHER_MEMBER_ID,
              erpUserRef: OTHER_MEMBER_REF,
            });
          }
          if (where?.OR && Array.isArray(where.OR)) {
            for (const cond of where.OR) {
              if (cond.userId === OTHER_MEMBER_ID || cond.erpUserRef === OTHER_MEMBER_REF) {
                return Promise.resolve({
                  tenantId: TENANT_ID,
                  userId: OTHER_MEMBER_ID,
                  erpUserRef: OTHER_MEMBER_REF,
                });
              }
              if (cond.userId === MEMBER_ID || cond.erpUserRef === MEMBER_REF) {
                return Promise.resolve({
                  tenantId: TENANT_ID,
                  userId: MEMBER_ID,
                  erpUserRef: MEMBER_REF,
                });
              }
            }
          }
          return Promise.resolve(null);
        }),
      },
      pendingAction: {
        findFirst: jest.fn<any>(),
        findMany: jest.fn<any>(),
        create: jest.fn<any>(),
        update: jest.fn<any>(),
        updateMany: jest.fn<any>(),
      },
      conversation: {
        findFirst: jest.fn<any>(),
        create: jest.fn<any>(),
      },
      message: {
        create: jest.fn<any>(),
      },
      studioBooking: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        findFirst: jest.fn<any>().mockResolvedValue(null),
        create: jest.fn<any>().mockResolvedValue({}),
        update: jest.fn<any>().mockResolvedValue({}),
        updateMany: jest.fn<any>().mockResolvedValue({}),
      },
      studioClass: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        findFirst: jest.fn<any>().mockResolvedValue(null),
      },
      studioMember: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    };

    mockPrisma = {
      withTenant: jest.fn<any>().mockImplementation((tenantId: string, fn: any) => fn(mockTx)),
    };

    mockLlmGateway = {
      healthCheck: jest.fn<any>().mockResolvedValue({ status: 'healthy', latencyMs: 35 }),
    };

    mockOrchestrator = {
      processMessage: jest.fn<any>(),
      callErpTool: jest.fn<any>(),
    };

    // Instantiate tools with ErpnextService and PrismaService (erp first, prisma second)
    createBookingTool = new CreateBookingTool(mockErpService, mockPrisma);
    cancelBookingTool = new CancelBookingTool(mockErpService, mockPrisma);
    getAvailabilityTool = new GetAvailabilityTool(mockErpService, mockPrisma);
    getEligibleScheduleTool = new GetEligibleScheduleTool(mockErpService, mockPrisma);
    getPlanEntitlementTool = new GetMemberPlanEntitlementTool(mockErpService, mockPrisma);

    // Instantiate ToolRegistry
    toolRegistry = new ToolRegistry(undefined, mockAuditOutbox, mockErpService);
    toolRegistry.register('createBooking', createBookingTool);
    toolRegistry.register('cancelBooking', cancelBookingTool);
    toolRegistry.register('getAvailability', getAvailabilityTool);
    toolRegistry.register('getEligibleSchedule', getEligibleScheduleTool);
    toolRegistry.register('getMemberPlanEntitlement', getPlanEntitlementTool);

    // Instantiate AgentRegistryService
    agentRegistryService = new AgentRegistryService(
      mockPrisma,
      mockLlmGateway,
      mockAuditOutbox,
      mockOrchestrator,
      toolRegistry,
    );

    // Instantiate AiController
    aiController = new AiController(
      mockOrchestrator,
      {} as any, // conversationService
      {} as any, // pendingActionService
      mockPrisma, // prisma
      mockAuditOutbox, // auditOutbox
      toolRegistry, // toolRegistry
      agentRegistryService, // agentRegistry
    );
  });

  // ===========================================================================
  // 1. Tool Contracts and Authorization
  // ===========================================================================
  describe('1. Tool Contracts and Authorization', () => {
    it('defines createBooking with risk write, requiresConfirmation true, and bookings:create permission', () => {
      const def = toolByName('createBooking');
      expect(def).toBeDefined();
      expect(def?.risk).toBe('write');
      expect(def?.requiresConfirmation).toBe(true);
      expect(def?.requiredPermission).toBe('bookings:create');
      expect(TOOL_PERMISSIONS['createBooking']).toBe('bookings:create');
    });

    it('defines cancelBooking with risk write, requiresConfirmation true, and bookings:write permission', () => {
      const def = toolByName('cancelBooking');
      expect(def).toBeDefined();
      expect(def?.risk).toBe('write');
      expect(def?.requiresConfirmation).toBe(true);
      expect(def?.requiredPermission).toBe('bookings:write');
      expect(TOOL_PERMISSIONS['cancelBooking']).toBe('bookings:write');
    });

    it('retains bookSession in PROHIBITED_TOOLS ensuring it fails closed', () => {
      expect(PROHIBITED_TOOLS).toContain('bookSession');
    });

    it('authorizes member role for createBooking, cancelBooking, but denies administrative member creation', () => {
      expect(canUseTool('member', 'createBooking')).toBe(true);
      expect(canUseTool('member', 'cancelBooking')).toBe(true);
      expect(canUseTool('member', 'getEligibleSchedule')).toBe(true);
      expect(canUseTool('member', 'getAvailability')).toBe(true);
      expect(canUseTool('member', 'getMemberPlanEntitlement')).toBe(true);
      expect(canUseTool('member', 'createMember')).toBe(false);
      expect(can('member', 'bookings:create')).toBe(true);
      expect(can('member', 'bookings:write')).toBe(true);
      expect(can('member', 'members:create')).toBe(false);
    });
  });

  // ===========================================================================
  // 2. CreateBookingTool Direct Defense-in-Depth & Identity Resolution
  // ===========================================================================
  describe('2. CreateBookingTool Execution & Identity Resolution', () => {
    it('blocks execution when isConfirmedPendingAction is false or absent', async () => {
      const result = await createBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: false,
        },
        { classScheduleId: 'sch-101', bookingDate: '2026-10-25' },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
      expect(mockErpService.call).not.toHaveBeenCalled();
    });

    it('validates mandatory classScheduleId and YYYY-MM-DD bookingDate format', async () => {
      const resultMissingSchedule = await createBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        { classScheduleId: '', bookingDate: '2026-10-25' },
      );
      expect(resultMissingSchedule.success).toBe(false);
      expect(resultMissingSchedule.errorCode).toBe('INVALID_ARGUMENTS');

      const resultInvalidDate = await createBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        { classScheduleId: 'sch-101', bookingDate: 'tomorrow' },
      );
      expect(resultInvalidDate.success).toBe(false);
      expect(resultInvalidDate.errorCode).toBe('INVALID_ARGUMENTS');
    });

    it('resolves authoritative erpUserRef from userErpLink, preventing client-supplied impersonation', async () => {
      mockErpService.call.mockResolvedValueOnce({
        id: 'bk-confirmed-999',
        status: 'confirmed',
      });

      const result = await createBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        {
          classScheduleId: 'sch-101',
          bookingDate: '2026-10-25',
          memberId: OTHER_MEMBER_ID, // Attempted impersonation
        },
      );

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            member: MEMBER_REF, // Authoritative ERP reference resolved from userErpLink
          }),
        }),
      );
      expect(result.data.memberId).toBe(MEMBER_REF);
      expect(result.data.userId).toBe(MEMBER_ID);
    });

    it('fails closed when member userErpLink is missing in database', async () => {
      mockTx.userErpLink.findFirst.mockResolvedValueOnce(null);

      const result = await createBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: 'unlinked-member-uuid',
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        {
          classScheduleId: 'sch-101',
          bookingDate: '2026-10-25',
        },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MEMBER_NOT_LINKED');
      expect(result.error).toContain('not linked to a valid ERP member record');
      expect(mockErpService.call).not.toHaveBeenCalled();
    });

    it('uses trusted context.memberRef directly when provided on ToolContext', async () => {
      mockErpService.call.mockResolvedValueOnce({
        id: 'bk-direct-ref-001',
        status: 'confirmed',
      });

      const result = await createBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          memberRef: 'WS-MEM-TRUSTED',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        {
          classScheduleId: 'sch-101',
          bookingDate: '2026-10-25',
        },
      );

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            member: 'WS-MEM-TRUSTED',
          }),
        }),
      );
    });

    it('enforces tenant isolation during member identity resolution', async () => {
      const CROSS_TENANT_ID = 't0000000-0000-0000-0000-999999999999';

      const result = await createBookingTool.execute(
        {
          tenantId: CROSS_TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        {
          classScheduleId: 'sch-101',
          bookingDate: '2026-10-25',
        },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MEMBER_NOT_LINKED');
      expect(mockErpService.call).not.toHaveBeenCalled();
    });

    it('allows staff or admin caller to book on behalf of an explicit memberId resolving to ERP reference', async () => {
      mockErpService.call.mockResolvedValueOnce({
        id: 'bk-staff-001',
        status: 'confirmed',
      });

      const result = await createBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: ADMIN_ID,
          role: 'admin',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        {
          classScheduleId: 'sch-101',
          bookingDate: '2026-10-25',
          memberId: OTHER_MEMBER_ID,
        },
      );

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            member: OTHER_MEMBER_REF, // Resolved from OTHER_MEMBER_ID
          }),
        }),
      );
    });

    it('truthfully reports waitlisted status when ERP places booking on waitlist', async () => {
      mockErpService.call.mockResolvedValueOnce({
        id: 'bk-waitlist-777',
        status: 'waitlisted',
      });

      const result = await createBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        { classScheduleId: 'sch-full-class', bookingDate: '2026-10-25' },
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('waitlisted');
      expect(result.data.isWaitlist).toBe(true);
      expect(result.data.bookingId).toBe('bk-waitlist-777');
      expect(result.data.summary).toContain('waitlist');
    });

    it('propagates real ERP errors and never returns synthetic success on failure', async () => {
      mockErpService.call.mockRejectedValueOnce(new Error('Membership credit expired or depleted'));

      const result = await createBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        { classScheduleId: 'sch-101', bookingDate: '2026-10-25' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('credit expired or depleted');
      expect(result.errorCode).toBe('ERP_CALL_FAILED');
    });
  });

  // ===========================================================================
  // 3. CancelBookingTool Execution & Cancellation Rules
  // ===========================================================================
  describe('3. CancelBookingTool Execution & Cancellation Rules', () => {
    it('blocks direct execution without confirmed pending action', async () => {
      const result = await cancelBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: false,
        },
        { bookingId: 'bk-123' },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
      expect(mockErpService.call).not.toHaveBeenCalled();
    });

    it('validates bookingId is non-empty string', async () => {
      const result = await cancelBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        { bookingId: '   ' },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_ARGUMENTS');
    });

    it('passes tenant and resolved member_filter when member cancels booking', async () => {
      mockErpService.call.mockResolvedValueOnce({
        cancelled: true,
        status: 'cancelled',
      });

      const result = await cancelBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        { bookingId: 'bk-123', reason: 'Schedule conflict' },
      );

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            tenant: TENANT_ID,
            booking: 'bk-123',
            reason: 'Schedule conflict',
            member_filter: MEMBER_REF, // Authoritative ERP reference
          }),
        }),
      );
      expect(result.data.status).toBe('cancelled');
    });

    it('fails closed when member tries to cancel booking but has no ERP link', async () => {
      mockTx.userErpLink.findFirst.mockResolvedValueOnce(null);

      const result = await cancelBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: 'unlinked-member-uuid',
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        { bookingId: 'bk-123' },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MEMBER_NOT_LINKED');
      expect(mockErpService.call).not.toHaveBeenCalled();
    });

    it('enforces cancellation ownership by propagating ERP not found when booking belongs to other member', async () => {
      // ERPNext cancel throws DoesNotExistError when candidate.member != member_filter
      mockErpService.call.mockRejectedValueOnce(new Error('Booking not found'));

      const result = await cancelBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        { bookingId: 'bk-someone-else-booking' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Booking not found');
      expect(result.errorCode).toBe('ERP_CALL_FAILED');
    });

    it('ignores client-supplied memberId during member cancellation preventing filter spoofing', async () => {
      mockErpService.call.mockResolvedValueOnce({
        cancelled: true,
        status: 'cancelled',
      });

      const result = await cancelBookingTool.execute(
        {
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: randomUUID(),
          isConfirmedPendingAction: true,
        },
        {
          bookingId: 'bk-123',
          memberId: OTHER_MEMBER_ID, // Malicious member attempt to spoof filter
        },
      );

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            member_filter: MEMBER_REF, // Strictly the authenticated caller's reference
          }),
        }),
      );
    });
  });

  // ===========================================================================
  // 4. AgentRegistryService Real Booking Dispatch (G-02 Elimination)
  // ===========================================================================
  describe('4. AgentRegistryService Real Booking Dispatch (G-02 Elimination)', () => {
    it('dispatches check-availability to getAvailability tool returning authoritative data', async () => {
      // Mock PostgreSQL to return availability data
      mockTx.studioBooking.findMany.mockResolvedValueOnce([
        { id: 'b1', classId: 'sch-101', status: 'Confirmed' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValueOnce([
        { id: 'sch-101', name: 'Yoga Flow', category: 'Yoga', date: new Date('2026-10-25'), startTime: '10:00', endTime: '11:00', capacity: 20, trainer: 'Jane', room: 'Studio A' },
      ]);

      const result = await agentRegistryService.executeAgentAction(
        TENANT_ID,
        'booking-assistant',
        'check-availability',
        { sessionIds: ['sch-101'] },
        { id: MEMBER_ID, role: 'member' },
      );

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('check-availability');
    });

    it('dispatches eligible-schedule to getEligibleSchedule tool returning active schedule list', async () => {
      mockErpService.call.mockResolvedValueOnce({
        schedules: [
          { id: 'sch-1', class_id: 'cls-1', start_time: '2026-10-25T10:00:00Z', capacity: 20 },
        ],
      });

      const result = await agentRegistryService.executeAgentAction(
        TENANT_ID,
        'booking-assistant',
        'eligible-schedule',
        { date: '2026-10-25' },
        { id: MEMBER_ID, role: 'member' },
      );

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('eligible-schedule');
    });

    it('dispatches plan-entitlement to getMemberPlanEntitlement tool returning membership eligibility', async () => {
      mockErpService.call.mockResolvedValueOnce({
        membership: { id: 'mem-001', member: MEMBER_ID, plan: 'unlimited', status: 'Active' },
      });

      const result = await agentRegistryService.executeAgentAction(
        TENANT_ID,
        'booking-assistant',
        'plan-entitlement',
        {},
        { id: MEMBER_ID, role: 'member' },
      );

      expect(result.success).toBe(true);
      expect(result.actionId).toBe('plan-entitlement');
    });

    it('fails closed when dispatching an unknown task on booking-assistant', async () => {
      await expect(
        agentRegistryService.executeAgentAction(
          TENANT_ID,
          'booking-assistant',
          'arbitrary-dangerous-action',
          {},
          { id: MEMBER_ID, role: 'member' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects dispatch when agent does not exist', async () => {
      await expect(
        agentRegistryService.executeAgentAction(
          TENANT_ID,
          'nonexistent_agent',
          'check-availability',
          {},
          { id: MEMBER_ID, role: 'member' },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // 5. Two-Phase Action Confirmation Lifecycle via AiController
  // ===========================================================================
  describe('5. Two-Phase Booking Confirmation Lifecycle', () => {
    it('allows proposing member to confirm their own booking proposal without admin elevation', async () => {
      const pendingActionId = 'pa-booking-001';
      const confirmToken = 'valid-token-secret-1234567890123456';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingActionId,
        tenantId: TENANT_ID,
        userId: MEMBER_ID, // Proposing user
        actionType: 'createBooking',
        payload: { classScheduleId: 'sch-101', bookingDate: '2026-10-25' },
        status: 'proposed',
        confirmToken,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Valid
      });

      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });
      mockTx.pendingAction.update.mockResolvedValueOnce({ id: pendingActionId, status: 'executed' });

      mockErpService.call.mockResolvedValueOnce({
        id: 'bk-authoritative-888',
        status: 'confirmed',
      });

      const result = await (aiController as any).executeConfirmedAction(
        { id: MEMBER_ID, tenantId: TENANT_ID, role: 'member' },
        pendingActionId,
        confirmToken,
      );

      expect(result.status).toBe('succeeded');
      expect(result.record_id).toBe('bk-authoritative-888');
      expect(mockAuditOutbox.record).toHaveBeenCalled();
    });

    it('blocks a different member from confirming someone else booking proposal', async () => {
      const pendingActionId = 'pa-booking-002';
      const confirmToken = 'valid-token-secret-1234567890123456';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingActionId,
        tenantId: TENANT_ID,
        userId: MEMBER_ID, // Belonged to MEMBER_ID
        actionType: 'createBooking',
        payload: { classScheduleId: 'sch-101', bookingDate: '2026-10-25' },
        status: 'proposed',
        confirmToken,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      await expect(
        (aiController as any).executeConfirmedAction(
          { id: OTHER_MEMBER_ID, tenantId: TENANT_ID, role: 'member' },
          pendingActionId,
          confirmToken,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects confirmation with 410 GONE when confirmation window has expired', async () => {
      const pendingActionId = 'pa-booking-expired';
      const confirmToken = 'valid-token-secret-1234567890123456';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingActionId,
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        actionType: 'createBooking',
        payload: { classScheduleId: 'sch-101', bookingDate: '2026-10-25' },
        status: 'proposed',
        confirmToken,
        expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 minute ago
      });

      mockTx.pendingAction.update.mockResolvedValueOnce({ id: pendingActionId, status: 'expired' });

      await expect(
        (aiController as any).executeConfirmedAction(
          { id: MEMBER_ID, tenantId: TENANT_ID, role: 'member' },
          pendingActionId,
          confirmToken,
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          status: HttpStatus.GONE,
        }),
      );
    });

    it('rejects re-confirmation with 409 CONFLICT if action is already decided', async () => {
      const pendingActionId = 'pa-booking-already-executed';
      const confirmToken = 'valid-token-secret-1234567890123456';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingActionId,
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        actionType: 'createBooking',
        payload: { classScheduleId: 'sch-101', bookingDate: '2026-10-25' },
        status: 'executed', // Already executed
        confirmToken,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      await expect(
        (aiController as any).executeConfirmedAction(
          { id: MEMBER_ID, tenantId: TENANT_ID, role: 'member' },
          pendingActionId,
          confirmToken,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects confirmation with 403 Forbidden when token is invalid or tampered', async () => {
      const pendingActionId = 'pa-booking-tampered';

      mockTx.pendingAction.findFirst.mockResolvedValueOnce({
        id: pendingActionId,
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        actionType: 'createBooking',
        payload: { classScheduleId: 'sch-101', bookingDate: '2026-10-25' },
        status: 'proposed',
        confirmToken: 'genuine-token-value-000000000000000000',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      await expect(
        (aiController as any).executeConfirmedAction(
          { id: MEMBER_ID, tenantId: TENANT_ID, role: 'member' },
          pendingActionId,
          'forged-token-value-111111111111111111',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 6. Remediation Verification: Identity, Idempotency & Timeout Reconciliation
  // =========================================================================
  describe('6. Remediation: Identity, Idempotency, Timeouts & Stale Action Recovery', () => {
    it('propagates caller userId and role to ERPNext transport via BaseTool.callErp', async () => {
      mockErpService.call.mockResolvedValueOnce({ id: 'bk-role-test', status: 'confirmed' });

      const context: ToolContext = {
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        role: 'member',
        memberRef: MEMBER_REF,
        correlationId: 'corr-id-role-test',
        isConfirmedPendingAction: true,
      };

      await createBookingTool.execute(context, {
        classScheduleId: 'sch-role-101',
        bookingDate: '2026-10-25',
      });

      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: MEMBER_ID,
          role: 'member',
          correlationId: 'corr-id-role-test',
        }),
      );
    });

    it('passes idempotency_key in JSON body and context header for CreateBookingTool', async () => {
      mockErpService.call.mockResolvedValueOnce({ id: 'bk-idemp-1', status: 'confirmed' });

      const context: ToolContext = {
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        role: 'member',
        memberRef: MEMBER_REF,
        correlationId: 'corr-id-1',
        idempotencyKey: 'idemp-key-booking-12345',
        isConfirmedPendingAction: true,
      };

      await createBookingTool.execute(context, {
        classScheduleId: 'sch-101',
        bookingDate: '2026-10-25',
      });

      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'idemp-key-booking-12345',
          body: expect.objectContaining({
            idempotency_key: 'idemp-key-booking-12345',
            class_schedule_id: 'sch-101',
            booking_date: '2026-10-25',
          }),
        }),
      );
    });

    it('passes idempotency_key in JSON body and context header for CancelBookingTool', async () => {
      mockErpService.call.mockResolvedValueOnce({ id: 'bk-idemp-cancel', status: 'cancelled' });

      const context: ToolContext = {
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        role: 'member',
        memberRef: MEMBER_REF,
        correlationId: 'corr-id-cancel-1',
        idempotencyKey: 'idemp-key-cancel-99999',
        isConfirmedPendingAction: true,
      };

      await cancelBookingTool.execute(context, {
        bookingId: 'bk-to-cancel-001',
      });

      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'idemp-key-cancel-99999',
          body: expect.objectContaining({
            idempotency_key: 'idemp-key-cancel-99999',
            booking: 'bk-to-cancel-001',
          }),
        }),
      );
    });

    it('reconciles booking creation when upstream ERP call times out but booking exists in ERP with matching idempotency key', async () => {
      // 1st call (POST create): times out
      mockErpService.call.mockRejectedValueOnce(new Error('Gateway timeout (504): upstream did not respond'));

      // 2nd call (GET list): returns existing booking matching schedule, date, and durable idempotency key
      mockErpService.call.mockResolvedValueOnce({
        bookings: [
          {
            id: 'bk-reconciled-777',
            class_schedule_id: 'sch-timeout-1',
            booking_date: '2026-10-26',
            status: 'confirmed',
            idempotency_key: 'idemp-c4-recon-001',
          },
        ],
      });

      const context: ToolContext = {
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        role: 'member',
        memberRef: MEMBER_REF,
        correlationId: 'corr-timeout-test',
        idempotencyKey: 'idemp-c4-recon-001',
        isConfirmedPendingAction: true,
      };

      const result = await createBookingTool.execute(context, {
        classScheduleId: 'sch-timeout-1',
        bookingDate: '2026-10-26',
      });

      expect(result.success).toBe(true);
      expect(result.data.reconciled).toBe(true);
      expect(result.data.bookingId).toBe('bk-reconciled-777');
      expect(result.data.status).toBe('confirmed');
    });

    it('never treats pre-existing booking as proof of success when idempotency key differs', async () => {
      // 1st call: times out
      mockErpService.call.mockRejectedValueOnce(new Error('Gateway timeout (504): upstream did not respond'));

      // 2nd call (GET list): returns pre-existing booking created earlier with a DIFFERENT idempotency key
      mockErpService.call.mockResolvedValueOnce({
        bookings: [
          {
            id: 'bk-old-pre-existing',
            class_schedule_id: 'sch-timeout-1',
            booking_date: '2026-10-26',
            status: 'confirmed',
            idempotency_key: 'idemp-old-other-key',
          },
        ],
      });

      const context: ToolContext = {
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        role: 'member',
        memberRef: MEMBER_REF,
        correlationId: 'corr-pre-existing-test',
        idempotencyKey: 'idemp-new-current-key',
        isConfirmedPendingAction: true,
      };

      const result = await createBookingTool.execute(context, {
        classScheduleId: 'sch-timeout-1',
        bookingDate: '2026-10-26',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('OUTCOME_UNCERTAIN');
      expect(result.error).toContain('Booking request dispatched, but confirmation timed out');
    });

    it('fails closed with OUTCOME_UNCERTAIN when reconciliation finds ambiguous/multiple bookings matching key', async () => {
      // 1st call: times out
      mockErpService.call.mockRejectedValueOnce(new Error('Gateway timeout (504): upstream did not respond'));

      // 2nd call (GET list): returns multiple conflicting records with duplicate key
      mockErpService.call.mockResolvedValueOnce({
        bookings: [
          {
            id: 'bk-dup-1',
            class_schedule_id: 'sch-timeout-1',
            booking_date: '2026-10-26',
            status: 'confirmed',
            idempotency_key: 'idemp-c4-dup-key',
          },
          {
            id: 'bk-dup-2',
            class_schedule_id: 'sch-timeout-1',
            booking_date: '2026-10-26',
            status: 'confirmed',
            idempotency_key: 'idemp-c4-dup-key',
          },
        ],
      });

      const context: ToolContext = {
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        role: 'member',
        memberRef: MEMBER_REF,
        correlationId: 'corr-dup-key-test',
        idempotencyKey: 'idemp-c4-dup-key',
        isConfirmedPendingAction: true,
      };

      const result = await createBookingTool.execute(context, {
        classScheduleId: 'sch-timeout-1',
        bookingDate: '2026-10-26',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('OUTCOME_UNCERTAIN');
      expect(result.error).toContain('Booking request dispatched, but confirmation timed out');
    });

    it('fails closed with OUTCOME_UNCERTAIN when booking create times out and reconciliation finds no record', async () => {
      // 1st call: times out
      mockErpService.call.mockRejectedValueOnce(new Error('Service is unavailable'));

      // 2nd call (GET list): empty list
      mockErpService.call.mockResolvedValueOnce({ bookings: [] });

      const context: ToolContext = {
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        role: 'member',
        memberRef: MEMBER_REF,
        correlationId: 'corr-timeout-fail',
        isConfirmedPendingAction: true,
      };

      const result = await createBookingTool.execute(context, {
        classScheduleId: 'sch-timeout-empty',
        bookingDate: '2026-10-27',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('OUTCOME_UNCERTAIN');
      expect(result.error).toContain('Booking request dispatched, but confirmation timed out');
    });

    it('reconciles booking cancellation when upstream cancellation call times out but booking is cancelled', async () => {
      // 1st call (cancel): times out
      mockErpService.call.mockRejectedValueOnce(new Error('Connection timeout (ETIMEDOUT)'));

      // 2nd call (get booking): returns status cancelled
      mockErpService.call.mockResolvedValueOnce({
        id: 'bk-cancel-timeout-1',
        status: 'cancelled',
      });

      const context: ToolContext = {
        tenantId: TENANT_ID,
        userId: MEMBER_ID,
        role: 'member',
        memberRef: MEMBER_REF,
        correlationId: 'corr-cancel-reconcile',
        isConfirmedPendingAction: true,
      };

      const result = await cancelBookingTool.execute(context, {
        bookingId: 'bk-cancel-timeout-1',
      });

      expect(result.success).toBe(true);
      expect(result.data.reconciled).toBe(true);
      expect(result.data.status).toBe('cancelled');
    });

    it('PendingActionService.recoverStaleExecutingActions reconciles operation that succeeded before a worker crash', async () => {
      const pendingActionService = new PendingActionService(mockPrisma);
      const staleAction = {
        id: 'pa-stale-succeeded',
        tenantId: TENANT_ID,
        actionType: 'createBooking',
        status: 'executing',
        idempotencyKey: 'idemp-c4-recon-001',
        payload: { classScheduleId: 'sch-1', bookingDate: '2026-10-26' },
        updatedAt: new Date(Date.now() - 400000),
      };

      mockTx.pendingAction.findMany.mockResolvedValueOnce([staleAction]);
      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });

      // Reconciler checks external ERP and confirms booking exists
      const reconciler: ActionReconciler = (jest.fn<any>()).mockResolvedValue({
        resolved: true,
        succeeded: true,
        result: { booking_id: 'WS-BK-999', status: 'confirmed', reconciled: true },
      }) as any;

      const count = await pendingActionService.recoverStaleExecutingActions(TENANT_ID, 300000, reconciler);

      expect(count).toBe(1);
      expect(reconciler).toHaveBeenCalledWith(staleAction);
      expect(mockTx.pendingAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'pa-stale-succeeded',
            tenantId: TENANT_ID,
            status: 'executing',
          }),
          data: expect.objectContaining({
            status: 'executed',
            result: expect.objectContaining({ booking_id: 'WS-BK-999' }),
            error: null,
          }),
        }),
      );
    });

    it('PendingActionService.recoverStaleExecutingActions handles confirmed downstream failure', async () => {
      const pendingActionService = new PendingActionService(mockPrisma);
      const staleAction = {
        id: 'pa-stale-failed',
        tenantId: TENANT_ID,
        actionType: 'createBooking',
        status: 'executing',
        updatedAt: new Date(Date.now() - 400000),
      };

      mockTx.pendingAction.findMany.mockResolvedValueOnce([staleAction]);
      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });

      const reconciler: ActionReconciler = (jest.fn<any>()).mockResolvedValue({
        resolved: true,
        succeeded: false,
        error: 'CAPACITY_EXCEEDED: Class reached maximum limit',
      }) as any;

      const count = await pendingActionService.recoverStaleExecutingActions(TENANT_ID, 300000, reconciler);

      expect(count).toBe(1);
      expect(mockTx.pendingAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'pa-stale-failed',
            tenantId: TENANT_ID,
            status: 'executing',
          }),
          data: expect.objectContaining({
            status: 'failed',
            error: 'CAPACITY_EXCEEDED: Class reached maximum limit',
          }),
        }),
      );
    });

    it('PendingActionService.recoverStaleExecutingActions preserves explicit OUTCOME_UNCERTAIN when external outcome is unknown', async () => {
      const pendingActionService = new PendingActionService(mockPrisma);
      const staleAction = {
        id: 'pa-stale-unknown',
        tenantId: TENANT_ID,
        actionType: 'createBooking',
        status: 'executing',
        updatedAt: new Date(Date.now() - 400000),
      };

      mockTx.pendingAction.findMany.mockResolvedValueOnce([staleAction]);
      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });

      // Reconciler could not reach external ERP (timed out or ambiguous)
      const reconciler: ActionReconciler = (jest.fn<any>()).mockResolvedValue({
        resolved: false,
        error: 'ERP_UNREACHABLE',
      }) as any;

      const count = await pendingActionService.recoverStaleExecutingActions(TENANT_ID, 300000, reconciler);

      expect(count).toBe(1);
      expect(mockTx.pendingAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'pa-stale-unknown',
            tenantId: TENANT_ID,
            status: 'executing',
          }),
          data: expect.objectContaining({
            status: 'failed',
            error: expect.stringContaining('OUTCOME_UNCERTAIN'),
            result: expect.objectContaining({
              outcome: 'uncertain',
              unresolved: true,
            }),
          }),
        }),
      );
    });

    it('PendingActionService.recoverStaleExecutingActions handles concurrent recovery safely when another worker already transitioned', async () => {
      const pendingActionService = new PendingActionService(mockPrisma);
      const staleAction = {
        id: 'pa-concurrent',
        tenantId: TENANT_ID,
        actionType: 'createBooking',
        status: 'executing',
        updatedAt: new Date(Date.now() - 400000),
      };

      mockTx.pendingAction.findMany.mockResolvedValueOnce([staleAction]);
      // Another worker already CAS-transitioned this action: updateMany returns count 0
      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 0 });

      const count = await pendingActionService.recoverStaleExecutingActions(TENANT_ID, 300000);

      expect(count).toBe(0);
    });

    it('PendingActionService.recoverStaleExecutingActions enforces strict tenant isolation during recovery', async () => {
      const pendingActionService = new PendingActionService(mockPrisma);
      mockTx.pendingAction.findMany.mockResolvedValueOnce([]);

      await pendingActionService.recoverStaleExecutingActions(TENANT_ID, 300000);

      expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
      expect(mockTx.pendingAction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            status: 'executing',
          }),
        }),
      );
    });

    it('PendingActionService.expireOldActions expires both proposed and executing actions past expiry', async () => {
      const pendingActionService = new PendingActionService(mockPrisma);
      mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 3 });

      const count = await pendingActionService.expireOldActions(TENANT_ID);

      expect(count).toBe(3);
      expect(mockTx.pendingAction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            status: { in: ['proposed', 'executing'] },
            expiresAt: expect.any(Object),
          }),
          data: { status: 'expired' },
        }),
      );
    });
  });
});
