import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HttpException, HttpStatus, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { ToolRegistry } from '../ai/tools/tool-registry';
import { ExpiringMembershipsTool } from '../ai/tools/expiring-memberships.tool';
import { LowAttendanceClassesTool } from '../ai/tools/low-attendance-classes.tool';
import { CreateMemberTool } from '../ai/tools/create-member.tool';
import { ExtractCreateMemberFieldsTool } from '../ai/tools/extract-create-member-fields.tool';
import { AiController } from '../ai/ai.controller';
import { ERP_METHODS } from '@wsos/erp-methods';
import { TOOLS } from '@wsos/ai-tool-definitions';
import { PiiRedaction } from '../ai/guardrails/pii-redaction';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PrismaService } from '../common/prisma.service';
import { ConversationOrchestrator } from '../ai/orchestrator/conversation-loop';
import { PendingActionState, createConfirmationStateMachine } from '../ai/orchestrator/confirmation-state-machine';

describe('AI-07 — Admin Assistant Implementation and Verification', () => {
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
  let mockLlmGateway: any;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockErpService = {
      call: jest.fn<any>(),
    };

    mockAuditOutbox = {
      record: jest.fn<any>().mockResolvedValue({ audit: { id: 'audit-001' } }),
      recordInTransaction: jest.fn<any>().mockResolvedValue({ id: 'audit-001' }),
    };

    mockTx = {
      pendingAction: {
        findFirst: jest.fn<any>(),
        findMany: jest.fn<any>(),
        update: jest.fn<any>(),
        updateMany: jest.fn<any>(),
        create: jest.fn<any>(),
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
      withTenant: jest.fn<any>().mockImplementation(async (tenantId: string, fn: any) => fn(mockTx)),
    };

    mockConversationService = {
      findById: jest.fn<any>(),
      create: jest.fn<any>(),
      addMessage: jest.fn<any>(),
      purge: jest.fn<any>(),
    };

    mockPendingActionService = {
      findById: jest.fn<any>(),
      reject: jest.fn<any>(),
      cancel: jest.fn<any>(),
    };

    mockOrchestrator = {
      processMessage: jest.fn<any>(),
      confirmPendingAction: jest.fn<any>(),
      executeApprovedAction: jest.fn<any>(),
      callErpTool: jest.fn<any>(),
    };

    mockLlmGateway = {
      chat: jest.fn<any>(),
    };

    toolRegistry = new ToolRegistry(undefined, mockAuditOutbox, mockErpService);

    // Register all core tools
    const expiringTool = new ExpiringMembershipsTool(mockErpService, {} as any);
    const lowAttendanceTool = new LowAttendanceClassesTool(mockErpService);
    const createMemberTool = new CreateMemberTool(mockErpService);
    const extractFieldsTool = new ExtractCreateMemberFieldsTool(mockErpService);

    toolRegistry.register('getExpiringMemberships', expiringTool);
    toolRegistry.register('getLowAttendanceClasses', lowAttendanceTool);
    toolRegistry.register('createMember', createMemberTool);
    toolRegistry.register('extractCreateMemberFields', extractFieldsTool);
  });

  // =========================================================================
  // REQUIREMENT 1: EXPIRING MEMBERSHIPS (T-01) & FINDING 1 & 4
  // =========================================================================
  describe('Requirement 1: Expiring Memberships (T-01)', () => {
    it('calls authoritative whitelisted run_report RPC and returns formatted memberships within 7 days', async () => {
      mockErpService.call.mockResolvedValueOnce({
        report_code: 'memberships_expiring',
        rows: [
          {
            name: 'MEM-001',
            member: 'Rahul Sharma',
            member_phone: '+919876543210',
            plan: 'Annual Gold',
            end_date: '2026-10-20',
            days_remaining: 4,
            status: 'Active',
          },
        ],
      });

      const result = await toolRegistry.execute(
        'getExpiringMemberships',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { daysAhead: 7 },
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.daysAhead).toBe(7);
      expect(result.data.memberships[0]).toEqual({
        membershipId: 'MEM-001',
        memberName: 'Rahul Sharma',
        memberPhone: '+919876543210',
        planName: 'Annual Gold',
        endDate: '2026-10-20',
        daysRemaining: 4,
      });
      expect(result.data.summary).toContain('1 active membership(s) expiring within 7 days');

      // Asserts exact RPC method and arguments per Finding 1
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: ERP_METHODS.REPORT_RUN,
          httpMethod: 'GET',
          tenantId: TENANT_A,
          body: expect.objectContaining({
            report_code: 'memberships_expiring',
            tenant: TENANT_A,
            from_date: expect.any(String),
            to_date: expect.any(String),
          }),
        }),
      );
    });

    it('correctly handles boundary semantics: 0 days (today) and 7 days (upper bound) are included', async () => {
      mockErpService.call.mockResolvedValueOnce({
        rows: [
          { name: 'MEM-TODAY', member: 'Expires Today', end_date: '2026-10-16', days_remaining: 0, status: 'Active' },
          { name: 'MEM-DAY3', member: 'Expires Midweek', end_date: '2026-10-19', days_remaining: 3, status: 'Active' },
          { name: 'MEM-DAY7', member: 'Expires On Bound', end_date: '2026-10-23', days_remaining: 7, status: 'Active' },
        ],
      });

      const result = await toolRegistry.execute(
        'getExpiringMemberships',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { daysAhead: 7 },
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(3);
      const ids = result.data.memberships.map((m: any) => m.membershipId);
      expect(ids).toContain('MEM-TODAY');
      expect(ids).toContain('MEM-DAY3');
      expect(ids).toContain('MEM-DAY7');
    });

    it('excludes records outside the 7-day boundary: already expired (<0) and beyond 7 days (>7)', async () => {
      mockErpService.call.mockResolvedValueOnce({
        rows: [
          { name: 'MEM-EXPIRED', member: 'Past Expiry', end_date: '2026-10-14', days_remaining: -2, status: 'Active' },
          { name: 'MEM-DAY8', member: 'Expires Next Week', end_date: '2026-10-24', days_remaining: 8, status: 'Active' },
          { name: 'MEM-VALID', member: 'Valid Member', end_date: '2026-10-18', days_remaining: 2, status: 'Active' },
        ],
      });

      const result = await toolRegistry.execute(
        'getExpiringMemberships',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { daysAhead: 7 },
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.memberships[0].membershipId).toBe('MEM-VALID');
    });

    it('excludes invalid date strings such as "TBD" or "N/A" per Finding 4', async () => {
      mockErpService.call.mockResolvedValueOnce({
        rows: [
          { name: 'MEM-TBD', member: 'TBD Member', end_date: 'TBD', status: 'Active' },
          { name: 'MEM-NA', member: 'NA Member', end_date: 'N/A', status: 'Active' },
          { name: 'MEM-VALID', member: 'Valid Member', end_date: '2026-10-20', days_remaining: 4, status: 'Active' },
        ],
      });

      const result = await toolRegistry.execute(
        'getExpiringMemberships',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { daysAhead: 7 },
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.memberships[0].membershipId).toBe('MEM-VALID');
    });

    it('handles studio timezone and injected clock deterministically across calendar boundaries (Finding 4)', async () => {
      // 2026-10-15T20:00:00Z UTC crosses into 2026-10-16 01:30 AM in Asia/Kolkata (+05:30)
      const controlledClock = new Date('2026-10-15T20:00:00Z');
      const studioTimezone = 'Asia/Kolkata';

      mockErpService.call.mockResolvedValueOnce({
        report_code: 'memberships_expiring',
        rows: [
          { name: 'MEM-DAY0', member: 'Day 0 Member', end_date: '2026-10-16', status: 'Active' },
          { name: 'MEM-DAY7', member: 'Day 7 Member', end_date: '2026-10-23', status: 'Active' },
          { name: 'MEM-EXPIRED', member: 'Expired Yesterday', end_date: '2026-10-15', status: 'Active' },
          { name: 'MEM-DAY8', member: 'Day 8 Member', end_date: '2026-10-24', status: 'Active' },
        ],
      });

      const result = await toolRegistry.execute(
        'getExpiringMemberships',
        {
          tenantId: TENANT_A,
          userId: USER_A,
          role: 'admin',
          correlationId: 'c-tz',
          now: controlledClock,
          timezone: studioTimezone,
        } as any,
        { daysAhead: 7 },
      );

      expect(result.success).toBe(true);
      expect(result.data.referenceDate).toBe('2026-10-16');
      expect(result.data.count).toBe(2);
      const ids = result.data.memberships.map((m: any) => m.membershipId);
      expect(ids).toContain('MEM-DAY0');
      expect(ids).toContain('MEM-DAY7');
      expect(ids).not.toContain('MEM-EXPIRED');
      expect(ids).not.toContain('MEM-DAY8');

      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: ERP_METHODS.REPORT_RUN,
          httpMethod: 'GET',
          body: {
            tenant: TENANT_A,
            report_code: 'memberships_expiring',
            from_date: '2026-10-16',
            to_date: '2026-10-23',
          },
        }),
      );
    });

    it('excludes inactive, cancelled, or records with missing end_date', async () => {
      mockErpService.call.mockResolvedValueOnce({
        rows: [
          { name: 'MEM-CANCELLED', member: 'Cancelled User', end_date: '2026-10-18', days_remaining: 2, status: 'Cancelled' },
          { name: 'MEM-NO-DATE', member: 'Corrupt Date', days_remaining: 2, status: 'Active' },
          { member: 'No ID', end_date: '2026-10-18', days_remaining: 2, status: 'Active' },
          { name: 'MEM-ACTIVE', member: 'Active User', end_date: '2026-10-18', days_remaining: 2, status: 'Active' },
        ],
      });

      const result = await toolRegistry.execute(
        'getExpiringMemberships',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { daysAhead: 7 },
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.memberships[0].membershipId).toBe('MEM-ACTIVE');
    });

    it('enforces RBAC authorization: reports.read is required (staff allowed, visitor denied)', async () => {
      const staffResult = await toolRegistry.execute(
        'getExpiringMemberships',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'front_desk', correlationId: 'c-staff' },
        {},
      );
      expect(staffResult.errorCode).not.toBe('PERMISSION_DENIED');

      const visitorResult = await toolRegistry.execute(
        'getExpiringMemberships',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: 'v-1', role: 'visitor', correlationId: 'c-vis' },
        {},
      );
      expect(visitorResult.success).toBe(false);
      expect(visitorResult.errorCode).toBe('PERMISSION_DENIED');
    });

    it('returns an honest structured failure when ERP service is unavailable without fabricating data', async () => {
      mockErpService.call.mockRejectedValueOnce(new Error('ERP connection timeout'));

      const result = await toolRegistry.execute(
        'getExpiringMemberships',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { daysAhead: 7 },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ERP_CALL_FAILED');
      expect(result.error).toContain('ERP connection timeout');
      expect(result.data).toBeUndefined();
    });
  });

  // =========================================================================
  // REQUIREMENT 2: LOW-ATTENDANCE CLASSES (T-02) & FINDING 1
  // =========================================================================
  describe('Requirement 2: Low-Attendance Classes (T-02)', () => {
    it('calls authoritative run_report RPC and identifies classes below 50% threshold', async () => {
      mockErpService.call.mockResolvedValueOnce({
        report_code: 'low_attendance_classes',
        rows: [
          {
            class_type: 'Hatha Yoga',
            class_name: 'Morning Flow',
            class_session: 'SESS-001',
            offered_capacity: 20,
            attendance_count: 8,
          },
        ],
      });

      const result = await toolRegistry.execute(
        'getLowAttendanceClasses',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { thresholdPercent: 50, periodDays: 30 },
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.classes[0]).toEqual({
        classSessionId: 'SESS-001',
        classType: 'Hatha Yoga',
        className: 'Morning Flow',
        capacity: 20,
        attendanceCount: 8,
        attendanceRate: 40.0,
      });
      expect(result.data.summary).toContain('1 class(es) with attendance below 50%');

      // Asserts exact RPC call per Finding 1
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: ERP_METHODS.REPORT_RUN,
          httpMethod: 'GET',
          tenantId: TENANT_A,
          body: expect.objectContaining({
            report_code: 'low_attendance_classes',
            tenant: TENANT_A,
            from_date: expect.any(String),
            to_date: expect.any(String),
          }),
        }),
      );
    });

    it('enforces boundary semantics: rate strictly below 50% (<50%) is included; exactly 50% is excluded', async () => {
      mockErpService.call.mockResolvedValueOnce({
        rows: [
          { class_session: 'SESS-30', class_type: 'Spin', capacity: 20, attendance_count: 6, attendance_rate: 30.0 },
          { class_session: 'SESS-49_9', class_type: 'HIIT', capacity: 100, attendance_count: 49, attendance_rate: 49.0 },
          { class_session: 'SESS-50', class_type: 'Pilates', capacity: 20, attendance_count: 10, attendance_rate: 50.0 }, // Exactly 50% -> EXCLUDE
          { class_session: 'SESS-75', class_type: 'CrossFit', capacity: 20, attendance_count: 15, attendance_rate: 75.0 }, // Above 50% -> EXCLUDE
        ],
      });

      const result = await toolRegistry.execute(
        'getLowAttendanceClasses',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { thresholdPercent: 50 },
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(2);
      const sessionIds = result.data.classes.map((c: any) => c.classSessionId);
      expect(sessionIds).toContain('SESS-30');
      expect(sessionIds).toContain('SESS-49_9');
      expect(sessionIds).not.toContain('SESS-50');
      expect(sessionIds).not.toContain('SESS-75');
    });

    it('excludes classes with zero or missing capacity to prevent division by zero or fake rates', async () => {
      mockErpService.call.mockResolvedValueOnce({
        rows: [
          { class_session: 'SESS-ZERO-CAP', class_type: 'Workshop', capacity: 0, attendance_count: 0 },
          { class_session: 'SESS-NO-CAP', class_type: 'Open Gym', capacity: undefined, attendance_count: 2 },
          { class_session: 'SESS-VALID-LOW', class_type: 'Zumba', capacity: 10, attendance_count: 3, attendance_rate: 30.0 },
        ],
      });

      const result = await toolRegistry.execute(
        'getLowAttendanceClasses',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { thresholdPercent: 50 },
      );

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.classes[0].classSessionId).toBe('SESS-VALID-LOW');
    });

    it('reports failure honestly when ERP service fails without masking downstream errors', async () => {
      mockErpService.call.mockRejectedValueOnce(new Error('Downstream ERP 503'));

      const result = await toolRegistry.execute(
        'getLowAttendanceClasses',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        { thresholdPercent: 50 },
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ERP_CALL_FAILED');
      expect(result.error).toContain('Downstream ERP 503');
    });
  });

  // =========================================================================
  // REQUIREMENT 3: CREATE MEMBER (T-04 & T-03) & FINDING 2 & 3
  // =========================================================================
  describe('Requirement 3: Create Member (T-04 & T-03)', () => {
    describe('Field Extraction and Required-Field Validation (extractCreateMemberFields)', () => {
      it('extracts complete member fields with valid E.164 phone from natural language text', async () => {
        const result = await toolRegistry.execute(
          'extractCreateMemberFields',
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'front_desk', correlationId: 'c-1' },
          { message: 'Create member named Sunita Rao, phone +919876543210 and email sunita@test.com' },
        );

        expect(result.success).toBe(true);
        expect(result.data.isComplete).toBe(true);
        expect(result.data.missingFields).toHaveLength(0);
        expect(result.data.extracted).toMatchObject({
          fullName: 'Sunita Rao',
          phone: '+919876543210',
          email: 'sunita@test.com',
        });
      });

      it('detects malformed phone numbers (missing + / non-E.164) and explains expected format without assuming +91 (Finding 3)', async () => {
        const result = await toolRegistry.execute(
          'extractCreateMemberFields',
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'front_desk', correlationId: 'c-1' },
          { message: 'Create member named Sunita Rao, phone 9876543210' },
        );

        expect(result.success).toBe(true);
        expect(result.data.isComplete).toBe(false);
        expect(result.data.isMalformedPhone).toBe(true);
        expect(result.data.clarificationPrompt).toContain('Phone must use E.164 format');
        expect(result.data.extracted.phone).toBeUndefined();
      });

      it('detects ambiguous phone numbers (multiple candidates) and triggers clarification prompt (Finding 2)', async () => {
        const result = await toolRegistry.execute(
          'extractCreateMemberFields',
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'front_desk', correlationId: 'c-1' },
          { message: 'Create member named Sunita Rao, phone +919876543210 or +919876543211' },
        );

        expect(result.success).toBe(true);
        expect(result.data.isComplete).toBe(false);
        expect(result.data.isAmbiguousPhone).toBe(true);
        expect(result.data.clarificationPrompt).toContain('Multiple phone numbers were detected');
      });

      it('identifies missing phone number and asks for it rather than inventing a phone value', async () => {
        const result = await toolRegistry.execute(
          'extractCreateMemberFields',
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'front_desk', correlationId: 'c-1' },
          { message: 'Register a new member named Amit Kumar' },
        );

        expect(result.success).toBe(true);
        expect(result.data.isComplete).toBe(false);
        expect(result.data.missingFields).toContain('phone');
        expect(result.data.extracted.phone).toBeUndefined();
        expect(result.data.clarificationPrompt).toContain('phone number');
      });

      it('identifies missing full name when only valid phone is provided', async () => {
        const result = await toolRegistry.execute(
          'extractCreateMemberFields',
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'front_desk', correlationId: 'c-1' },
          { message: 'Create member with phone +919876543210' },
        );

        expect(result.success).toBe(true);
        expect(result.data.isComplete).toBe(false);
        expect(result.data.missingFields).toContain('fullName');
        expect(result.data.clarificationPrompt).toContain('full name');
      });
    });

    describe('Direct Execution Blocking & Confirmation Enforcement', () => {
      it('blocks direct execution of createMember in ToolRegistry without confirmed pending action', async () => {
        const result = await toolRegistry.execute(
          'createMember',
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
          { fullName: 'Sunita Rao', phone: '+919876543210' },
          { isConfirmedPendingAction: false },
        );

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
        expect(result.error).toContain('requires pending-action confirmation');
        expect(mockErpService.call).not.toHaveBeenCalled();
      });

      it('blocks direct execution inside CreateMemberTool itself if isConfirmedPendingAction is false', async () => {
        const tool = new CreateMemberTool(mockErpService);
        const result = await tool.execute(
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1', isConfirmedPendingAction: false },
          { fullName: 'Sunita Rao', phone: '+919876543210' },
        );

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
        expect(mockErpService.call).not.toHaveBeenCalled();
      });
    });

    describe('Server-Side Field Validation & Phone Format Consistency (Finding 3)', () => {
      it('rejects member creation with missing required fields (fullName or phone)', async () => {
        const tool = new CreateMemberTool(mockErpService);

        const noPhone = await tool.execute(
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1', isConfirmedPendingAction: true },
          { fullName: 'Rahul' } as any,
        );
        expect(noPhone.success).toBe(false);
        expect(noPhone.errorCode).toBe('INVALID_ARGUMENTS');

        const noName = await tool.execute(
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1', isConfirmedPendingAction: true },
          { phone: '+919876543210' } as any,
        );
        expect(noName.success).toBe(false);
        expect(noName.errorCode).toBe('INVALID_ARGUMENTS');
      });

      it('strictly enforces E.164 phone format and rejects non-E.164 formats with clear explanation (positive and negative)', async () => {
        const tool = new CreateMemberTool(mockErpService);

        // Negative cases
        const negatives = ['9876543210', '123', '09876543210', '+0123456789', 'invalid-phone'];
        for (const badPhone of negatives) {
          const res = await tool.execute(
            { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1', isConfirmedPendingAction: true },
            { fullName: 'Sunita Rao', phone: badPhone },
          );
          expect(res.success).toBe(false);
          expect(res.errorCode).toBe('INVALID_ARGUMENTS');
          expect(res.error).toContain('Phone must use E.164 format');
        }

        // Positive case
        mockErpService.call.mockResolvedValueOnce({ id: 'MEM-E164', duplicate: false });
        const positive = await tool.execute(
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1', isConfirmedPendingAction: true },
          { fullName: 'Sunita Rao', phone: '+919876543210' },
        );
        expect(positive.success).toBe(true);
      });

      it('rejects invalid email format', async () => {
        const tool = new CreateMemberTool(mockErpService);
        const result = await tool.execute(
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1', isConfirmedPendingAction: true },
          { fullName: 'Rahul', phone: '+919876543210', email: 'not-an-email' },
        );

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('INVALID_ARGUMENTS');
        expect(result.error).toContain('Invalid email format');
      });
    });

    describe('Pending Action Confirmation Lifecycle & Controller Execution', () => {
      let controller: AiController;

      beforeEach(() => {
        controller = new AiController(
          mockOrchestrator,
          mockConversationService,
          mockPendingActionService,
          mockPrisma,
          mockAuditOutbox,
          toolRegistry,
        );
      });

      it('successfully executes server-stored payload upon valid confirmation and records audit event', async () => {
        const pendingId = 'pa-create-member-1';
        const confirmToken = 'valid-token-64-bytes';

        mockTx.pendingAction.findFirst.mockResolvedValueOnce({
          id: pendingId,
          tenantId: TENANT_A,
          userId: USER_A,
          role: 'admin',
          actionType: 'createMember',
          payload: { fullName: 'Sunita Rao', phone: '+919876543210', email: 'sunita@test.com' },
          status: 'proposed',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          confirmToken,
        });

        mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });
        mockTx.pendingAction.update.mockResolvedValueOnce({});

        mockErpService.call.mockResolvedValueOnce({
          id: 'MEM-SUNITA-001',
          duplicate: false,
        });

        const response = await controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          pendingId,
          { confirm_token: confirmToken },
        );

        expect(response.status).toBe('succeeded');
        expect(response.record_id).toBe('MEM-SUNITA-001');
        expect(response.audit_id).toBe('audit-001');

        expect(mockTx.pendingAction.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: pendingId },
            data: expect.objectContaining({ status: 'executed' }),
          }),
        );
      });

      it('sanitizes raw ERP results in both audit log afterData AND outboxEvent payload (Finding 5)', async () => {
        const pendingId = 'pa-outbox-sanitization';
        const confirmToken = 'outbox-token-123';

        mockTx.pendingAction.findFirst.mockResolvedValueOnce({
          id: pendingId,
          tenantId: TENANT_A,
          userId: USER_A,
          role: 'admin',
          actionType: 'createMember',
          payload: { fullName: 'Sunita Rao', phone: '+919876543210', email: 'sunita@test.com' },
          status: 'proposed',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          confirmToken,
        });

        mockTx.pendingAction.updateMany.mockResolvedValueOnce({ count: 1 });
        mockTx.pendingAction.update.mockResolvedValueOnce({});

        // Downstream ERP returns raw created member with sensitive phone and email
        mockErpService.call.mockResolvedValueOnce({
          id: 'MEM-SUNITA-777',
          full_name: 'Sunita Rao',
          phone: '+919876543210',
          email: 'sunita@test.com',
          duplicate: false,
        });

        const response = await controller.confirmAssistantAction(
          { id: USER_A, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
          pendingId,
          { confirm_token: confirmToken },
        );

        expect(response.status).toBe('succeeded');

        // Verify auditOutbox.record was called with sanitized result in payload
        expect(mockAuditOutbox.record).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: TENANT_A,
            eventType: 'ai.action.confirmed',
            payload: expect.objectContaining({
              actionType: 'createMember',
              result: expect.objectContaining({
                phone: '[REDACTED]',
                email: '[REDACTED]',
              }),
            }),
            afterData: expect.objectContaining({
              actionType: 'createMember',
              arguments: expect.objectContaining({
                phone: '[REDACTED]',
                email: '[REDACTED]',
              }),
              result: expect.objectContaining({
                phone: '[REDACTED]',
                email: '[REDACTED]',
              }),
            }),
          }),
        );
      });

      it('rejects execution when confirmation token is incorrect', async () => {
        const pendingId = 'pa-token-mismatch';

        mockTx.pendingAction.findFirst.mockResolvedValueOnce({
          id: pendingId,
          tenantId: TENANT_A,
          userId: USER_A,
          actionType: 'createMember',
          payload: { fullName: 'Sunita Rao', phone: '+919876543210' },
          status: 'proposed',
          expiresAt: new Date(Date.now() + 60000),
          confirmToken: 'correct-token',
        });

        await expect(
          controller.confirmAssistantAction(
            { id: USER_A, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
            pendingId,
            { confirm_token: 'wrong-token' },
          ),
        ).rejects.toThrow(ForbiddenException);

        expect(mockErpService.call).not.toHaveBeenCalled();
      });

      it('rejects confirmation for expired action: returns HTTP 410 Gone and marks action expired', async () => {
        const pendingId = 'pa-expired';

        mockTx.pendingAction.findFirst.mockResolvedValueOnce({
          id: pendingId,
          tenantId: TENANT_A,
          userId: USER_A,
          actionType: 'createMember',
          payload: { fullName: 'Sunita Rao', phone: '+919876543210' },
          status: 'proposed',
          expiresAt: new Date(Date.now() - 60000), // Expired in past
        });

        mockTx.pendingAction.update.mockResolvedValueOnce({});

        await expect(
          controller.confirmAssistantAction(
            { id: USER_A, tenantId: TENANT_A, tenantCode: 'TEST', role: 'admin' },
            pendingId,
            {},
          ),
        ).rejects.toThrow(HttpException);

        expect(mockTx.pendingAction.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: pendingId },
            data: { status: 'expired' },
          }),
        );
        expect(mockErpService.call).not.toHaveBeenCalled();
      });

      it('enforces tenant isolation: user from Tenant B cannot confirm action belonging to Tenant A', async () => {
        const pendingId = 'pa-tenant-a-action';
        mockTx.pendingAction.findFirst.mockResolvedValueOnce(null);

        await expect(
          controller.confirmAssistantAction(
            { id: USER_B, tenantId: TENANT_B, tenantCode: 'TEST', role: 'admin' },
            pendingId,
            {},
          ),
        ).rejects.toThrow(NotFoundException);

        expect(mockErpService.call).not.toHaveBeenCalled();
      });
    });

    describe('AuditOutboxService Sanitization Contract (Finding 5)', () => {
      it('sanitizes outboxEvent.payload for AI events including nested phone/email/card and string snapshots', async () => {
        const mockPrismaClient: any = {
          auditLog: { create: jest.fn<any>().mockResolvedValue({ id: 'audit-1' }) },
          outboxEvent: { create: jest.fn<any>().mockResolvedValue({ id: 'outbox-1' }) },
        };

        const auditOutboxService = new AuditOutboxService({} as any);

        const rawAiPayload = {
          actionType: 'createMember',
          result: {
            memberId: 'MEM-999',
            phone: '+919876543210',
            email: 'secret@studio.com',
            notes: 'Contact at +919876543210 or admin@studio.com with card 4111222233334444',
            nested: {
              emergency_contact: '+919876543211',
              card_number: '4111-2222-3333-4444',
            },
          },
        };

        await auditOutboxService.recordInTransaction(mockPrismaClient, {
          tenantId: TENANT_A,
          correlationId: 'corr-sanitization',
          actorType: 'ai',
          action: 'ai.action.confirm.createMember',
          resourceType: 'pending_action',
          resourceRef: 'pa-123',
          eventType: 'ai.action.confirmed',
          payload: rawAiPayload as any,
        });

        expect(mockPrismaClient.outboxEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              subjectType: 'pending_action',
              payload: expect.objectContaining({
                actionType: 'createMember',
                result: expect.objectContaining({
                  memberId: 'MEM-999',
                  phone: '[REDACTED]',
                  email: '[REDACTED]',
                  notes: expect.stringContaining('[PHONE]'),
                  nested: expect.objectContaining({
                    emergency_contact: '[REDACTED]',
                    card_number: '[REDACTED]',
                  }),
                }),
              }),
            }),
          }),
        );
      });
    });

    describe('End-to-End Conversation Loop & PII Protection (Finding 2)', () => {
      it('proves phone reaches validated confirmed write payload from realistic prompt without requiring LLM reconstruction', async () => {
        const stateMachine = createConfirmationStateMachine();
        const orchestrator = new ConversationOrchestrator(
          mockLlmGateway,
          mockAuditOutbox,
          mockErpService,
          { recordLlmCall: jest.fn<any>().mockResolvedValue(undefined) } as any,
          undefined,
          stateMachine,
          toolRegistry,
        );

        const prompt = 'Create member named Sunita Rao, phone +919876543210';

        const proposal = await orchestrator.processMessage(
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-prompt' },
          prompt,
        );

        expect(proposal.requiresConfirmation).toBe(true);
        expect(proposal.pendingActionId).toBeDefined();
        expect(proposal.confirmToken).toBeDefined();

        // The proposed tool call has the locally extracted verified phone number
        expect(proposal.toolCalls?.[0].arguments).toEqual(
          expect.objectContaining({
            fullName: 'Sunita Rao',
            phone: '+919876543210',
          }),
        );

        // Confirm and execute the pending action
        mockErpService.call.mockResolvedValueOnce({
          id: 'MEM-SUNITA-PROMPT',
          full_name: 'Sunita Rao',
          phone: '+919876543210',
        });

        const confirmResult = await orchestrator.confirmPendingAction(
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-confirm' },
          proposal.pendingActionId!,
          proposal.confirmToken!,
        );

        expect(confirmResult.state).toBe(PendingActionState.SUCCEEDED);
        expect(confirmResult.response).toContain('Action completed successfully');

        // ERP was called with the confirmed write payload
        expect(mockErpService.call).toHaveBeenCalledWith(
          expect.objectContaining({
            method: ERP_METHODS.MEMBER_CREATE,
            body: expect.objectContaining({
              full_name: 'Sunita Rao',
              phone: '+919876543210',
            }),
          }),
        );
      });

      it('refuses member creation for unauthorized roles and explains permission refusal', async () => {
        const stateMachine = createConfirmationStateMachine();
        const orchestrator = new ConversationOrchestrator(
          mockLlmGateway,
          mockAuditOutbox,
          mockErpService,
          { recordLlmCall: jest.fn<any>().mockResolvedValue(undefined) } as any,
          undefined,
          stateMachine,
          toolRegistry,
        );

        const prompt = 'Create member named Sunita Rao, phone +919876543210';
        const response = await orchestrator.processMessage(
          { tenantId: TENANT_A, tenantCode: 'TEST', userId: 'guest-1', role: 'member', correlationId: 'c-unauth' },
          prompt,
        );

        expect(response.pendingActionId).toBeUndefined();
        expect(response.response).toContain("can't help");
        expect(response.response).toContain('permission');
      });
    });
  });

  // =========================================================================
  // REQUIREMENT 4: REAL DOMAIN-SERVICE VERIFICATION & TOOL INVENTORY
  // =========================================================================
  describe('Requirement 4: Domain-Service Verification & Tool Inventory', () => {
    it('verifies all AI-07 Admin Assistant tools are registered in the Unified Tool Registry', () => {
      expect(toolRegistry.has('getExpiringMemberships')).toBe(true);
      expect(toolRegistry.has('getLowAttendanceClasses')).toBe(true);
      expect(toolRegistry.has('createMember')).toBe(true);
      expect(toolRegistry.has('extractCreateMemberFields')).toBe(true);
    });

    it('verifies tool definitions match Phase 0 specifications in TOOLS catalog', () => {
      const expiringDef = TOOLS.find((t) => t.name === 'getExpiringMemberships');
      expect(expiringDef).toBeDefined();
      expect(expiringDef?.assistant).toBe('admin');
      expect(expiringDef?.risk).toBe('read');
      expect(expiringDef?.requiresConfirmation).toBe(false);

      const lowAttDef = TOOLS.find((t) => t.name === 'getLowAttendanceClasses');
      expect(lowAttDef).toBeDefined();
      expect(lowAttDef?.assistant).toBe('admin');
      expect(lowAttDef?.risk).toBe('read');

      const createDef = TOOLS.find((t) => t.name === 'createMember');
      expect(createDef).toBeDefined();
      expect(createDef?.assistant).toBe('admin');
      expect(createDef?.risk).toBe('write');
      expect(createDef?.requiresConfirmation).toBe(true);
    });

    it('verifies prohibited tools cannot be executed via the Tool Registry', async () => {
      const dummyTool: any = { execute: jest.fn<any>() };
      toolRegistry.register('bookSession', dummyTool);

      const result = await toolRegistry.execute(
        'bookSession' as any,
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        {},
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('TOOL_PROHIBITED');
      expect(dummyTool.execute).not.toHaveBeenCalled();
    });

    it('verifies unknown tools fail safely with UNKNOWN_TOOL error without application crash', async () => {
      const result = await toolRegistry.execute(
        'nonExistentTool',
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_A, role: 'admin', correlationId: 'c-1' },
        {},
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('UNKNOWN_TOOL');
    });
  });
});
