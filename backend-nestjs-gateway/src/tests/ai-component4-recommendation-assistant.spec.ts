import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { RecommendationsService } from '../modules/recommendations/recommendations.service';
import { RecommendationsController } from '../modules/recommendations/recommendations.controller';
import { GetMemberGoalAndLevelTool } from '../ai/tools/get-member-goal-and-level.tool';
import { GetMemberAttendanceSummaryTool } from '../ai/tools/get-member-attendance-summary.tool';
import { GetEligibleSessionsForRecommendationTool } from '../ai/tools/get-eligible-sessions-for-recommendation.tool';
import { AgentRegistryService } from '../ai/agents/agent-registry.service';
import { ERP_METHODS } from '@wsos/erp-methods';

describe('AI-04 Component 4 — Recommendation Assistant Gateway Specification', () => {
  const TENANT_A = 'a0000000-0000-0000-0000-000000000001';
  const TENANT_B = 'b0000000-0000-0000-0000-000000000002';
  const MEMBER_A = 'm0000000-0000-0000-0000-000000000001';
  const MEMBER_B = 'm0000000-0000-0000-0000-000000000002';
  const ADMIN_USER = 'u0000000-0000-0000-0000-000000000099';

  let mockPrisma: any;
  let mockErpService: any;
  let recommendationsService: RecommendationsService;
  let controller: RecommendationsController;

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const inThreeDays = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  beforeEach(() => {
    delete process.env.IMPORT_STORE;

    mockPrisma = {
      withTenant: jest.fn<any>((tenantId: string, work: any) => work(mockPrisma)),
      studioClass: {
        findMany: jest.fn<any>(),
      },
      studioBooking: {
        findMany: jest.fn<any>(),
      },
      studioAttendance: {
        findMany: jest.fn<any>(),
      },
      studioMember: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: MEMBER_A, status: 'Active', fullName: 'Test Member' }),
        findUnique: jest.fn<any>(),
      },
    };

    mockErpService = {
      call: jest.fn<any>(),
    };

    recommendationsService = new RecommendationsService(mockErpService, mockPrisma);
    controller = new RecommendationsController(recommendationsService);
  });

  // =========================================================================
  // 1. Candidate Eligibility & Filtering
  // =========================================================================
  describe('1. Candidate Eligibility & Filtering', () => {
    it('strictly isolates tenant data: only queries classes for context tenant', async () => {
      mockPrisma.studioClass.findMany.mockResolvedValue([]);

      await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-1' },
        { days: 7 },
      );

      expect(mockPrisma.studioClass.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_A,
            status: 'Scheduled',
          }),
        }),
      );
    });

    it('excludes sessions where available spots <= 0 (capacity ceiling)', async () => {
      const scheduledClasses = [
        { id: 'c-full', name: 'Full HIIT Class', category: 'HIIT', date: tomorrow, startTime: '09:00', capacity: 10, status: 'Scheduled', trainer: 'Marcus' },
        { id: 'c-open', name: 'Open Flow Yoga', category: 'Yoga', date: tomorrow, startTime: '10:00', capacity: 10, status: 'Scheduled', trainer: 'Elena' },
      ];

      mockPrisma.studioClass.findMany.mockResolvedValue(scheduledClasses);
      // c-full has 10 confirmed bookings; c-open has 2
      mockPrisma.studioBooking.findMany
        .mockResolvedValueOnce([
          ...Array(10).fill({ id: 'b-full', classId: 'c-full', memberId: 'other' }),
          { id: 'b-open-1', classId: 'c-open', memberId: 'other-1' },
          { id: 'b-open-2', classId: 'c-open', memberId: 'other-2' },
        ])
        .mockResolvedValueOnce([]); // no past bookings
      mockPrisma.studioAttendance.findMany.mockResolvedValue([]);

      const result = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-2' },
        { goal: 'flexibility' },
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].sessionId).toBe('c-open');
      expect(result.data![0].availableSpots).toBe(8);
    });

    it('excludes classes already booked by the target member', async () => {
      const scheduledClasses = [
        { id: 'c-already-booked', name: 'Vinyasa Flow', category: 'Yoga', date: tomorrow, startTime: '08:00', capacity: 12, status: 'Scheduled', trainer: 'Elena' },
        { id: 'c-eligible', name: 'Reformer Pilates', category: 'Pilates', date: tomorrow, startTime: '09:00', capacity: 12, status: 'Scheduled', trainer: 'Maya' },
      ];

      mockPrisma.studioClass.findMany.mockResolvedValue(scheduledClasses);
      mockPrisma.studioBooking.findMany
        .mockResolvedValueOnce([
          { id: 'b-mem-1', classId: 'c-already-booked', memberId: MEMBER_A },
        ])
        .mockResolvedValueOnce([]);
      mockPrisma.studioAttendance.findMany.mockResolvedValue([]);

      const result = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-3' },
        { goal: 'flexibility & posture' },
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].sessionId).toBe('c-eligible');
    });

    it('returns fewer than 3 recommendations when fewer eligible sessions exist and never fabricates fake sessions', async () => {
      const singleClass = [
        { id: 'c-lone', name: 'Sunset Sound Bath', category: 'Recovery', date: tomorrow, startTime: '18:00', capacity: 15, status: 'Scheduled', trainer: 'Dr. Rao' },
      ];

      mockPrisma.studioClass.findMany.mockResolvedValue(singleClass);
      mockPrisma.studioBooking.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.studioAttendance.findMany.mockResolvedValue([]);

      const result = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-4' },
        { goal: 'recovery' },
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].sessionId).toBe('c-lone');
      expect(result.data![0].className).toBe('Sunset Sound Bath');
    });

    it('returns empty array when no upcoming scheduled classes exist', async () => {
      mockPrisma.studioClass.findMany.mockResolvedValue([]);

      const result = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-5' },
        {},
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  // =========================================================================
  // 2. Deterministic Ranking & Explainable Reasons
  // =========================================================================
  describe('2. Deterministic Ranking & Explainable Reasons', () => {
    it('ranks sessions aligned with member goal highest (Goal Alignment)', async () => {
      const scheduledClasses = [
        { id: 'c-yoga', name: 'Slow Yoga Flow', category: 'Yoga', date: tomorrow, startTime: '08:00', capacity: 10, status: 'Scheduled', trainer: 'Elena' },
        { id: 'c-hiit', name: 'Cardio HIIT Blast', category: 'HIIT', date: tomorrow, startTime: '09:00', capacity: 10, status: 'Scheduled', trainer: 'Marcus' },
      ];

      mockPrisma.studioClass.findMany.mockResolvedValue(scheduledClasses);
      mockPrisma.studioBooking.findMany.mockResolvedValue([]);
      mockPrisma.studioAttendance.findMany.mockResolvedValue([]);

      // Test with flexibility goal -> Yoga must rank #1
      const flexResult = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-rank-1' },
        { goal: 'flexibility & mobility' },
      );

      expect(flexResult.data![0].sessionId).toBe('c-yoga');
      expect(flexResult.data![0].matchScore!).toBeGreaterThan(flexResult.data![1].matchScore!);
      expect(flexResult.data![0].reason).toContain('flexibility');

      // Test with strength & conditioning goal -> HIIT must rank #1
      const strengthResult = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-rank-2' },
        { goal: 'strength & muscle' },
      );

      expect(strengthResult.data![0].sessionId).toBe('c-hiit');
      expect(strengthResult.data![0].matchScore!).toBeGreaterThan(strengthResult.data![1].matchScore!);
      expect(strengthResult.data![0].reason).toContain('strength');
    });

    it('boosts variety score when category has not been attended in 30 days', async () => {
      const scheduledClasses = [
        { id: 'c-pilates', name: 'Core Pilates', category: 'Pilates', date: tomorrow, startTime: '11:00', capacity: 10, status: 'Scheduled', trainer: 'Maya' },
        { id: 'c-yoga', name: 'Ashtanga Yoga', category: 'Yoga', date: tomorrow, startTime: '12:00', capacity: 10, status: 'Scheduled', trainer: 'Elena' },
      ];

      mockPrisma.studioClass.findMany.mockResolvedValueOnce(scheduledClasses);
      // Member past 30 days attendance: 4 Yoga attendances, 0 Pilates attendances
      mockPrisma.studioBooking.findMany
        .mockResolvedValueOnce([]) // no upcoming bookings
        .mockResolvedValueOnce([
          { id: 'b-past-1', classId: 'c-old-yoga' },
          { id: 'b-past-2', classId: 'c-old-yoga' },
          { id: 'b-past-3', classId: 'c-old-yoga' },
        ]);
      mockPrisma.studioAttendance.findMany.mockResolvedValue([
        { bookingId: 'b-past-1' },
        { bookingId: 'b-past-2' },
        { bookingId: 'b-past-3' },
      ]);
      mockPrisma.studioClass.findMany.mockResolvedValueOnce([
        { category: 'Yoga' },
      ]);

      const result = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-variety' },
        { goal: 'flexibility' },
      );

      // Both Yoga and Pilates are in primary categories for flexibility (50 pts goal score).
      // But Pilates has 0 past visits (+30 variety pts) vs Yoga with 3 past visits (+5 variety pts).
      // Pilates must rank #1!
      expect(result.data![0].sessionId).toBe('c-pilates');
      expect(result.data![0].matchScore!).toBeGreaterThan(result.data![1].matchScore!);
      expect(result.data![0].reason).toContain('variety');
    });

    it('applies neutral goal scoring (35) across all categories when member goal is undeclared', async () => {
      const scheduledClasses = [
        { id: 'c-yoga', name: 'Slow Yoga Flow', category: 'Yoga', date: tomorrow, startTime: '08:00', capacity: 10, status: 'Scheduled', trainer: 'Elena' },
        { id: 'c-hiit', name: 'Cardio HIIT Blast', category: 'HIIT', date: tomorrow, startTime: '09:00', capacity: 10, status: 'Scheduled', trainer: 'Marcus' },
      ];

      mockPrisma.studioClass.findMany.mockResolvedValue(scheduledClasses);
      mockPrisma.studioBooking.findMany.mockResolvedValue([]);
      mockPrisma.studioAttendance.findMany.mockResolvedValue([]);

      // Call without declaring a goal
      const res = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-neutral-1' },
        {},
      );

      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(2);
      // Both classes must have equal score: 35 (neutral goal) + 30 (variety) + 20 (capacity) = 85
      expect(res.data![0].matchScore).toBe(85);
      expect(res.data![1].matchScore).toBe(85);
      // Strength/HIIT does not receive artificial advantage
      expect(res.data![0].matchScore).toBe(res.data![1].matchScore);
      // Neither reason should claim an undeclared goal
      expect(res.data![0].reason).not.toContain('goal');
      expect(res.data![1].reason).not.toContain('goal');
    });
  });

  // =========================================================================
  // 3. Authorization & Controller Tenant Isolation
  // =========================================================================
  describe('3. Authorization & Controller Tenant Isolation', () => {
    it('allows authenticated member to retrieve their own recommendations', async () => {
      mockPrisma.studioClass.findMany.mockResolvedValue([]);

      const req = {
        user: { tenantId: TENANT_A, id: MEMBER_A, role: 'member' },
        headers: {},
      };

      const res = await controller.getRecommendations(req, {});
      expect(res.success).toBe(true);
      expect(res.data).toEqual([]);
    });

    it('rejects attempts by a member to request another member recommendations with 403 Forbidden', async () => {
      const req = {
        user: { tenantId: TENANT_A, id: MEMBER_A, role: 'member' },
        headers: {},
      };

      await expect(
        controller.getRecommendations(req, { memberId: MEMBER_B }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows admin/owner to request recommendations on behalf of another member', async () => {
      mockPrisma.studioClass.findMany.mockResolvedValue([]);

      const req = {
        user: { tenantId: TENANT_A, id: ADMIN_USER, role: 'admin' },
        headers: {},
      };

      const res = await controller.getRecommendations(req, { memberId: MEMBER_B });
      expect(res.success).toBe(true);
      expect(mockPrisma.studioClass.findMany).toHaveBeenCalled();
    });

    it('rejects requests without tenant context with 400 BadRequest', async () => {
      const req = {
        user: { id: MEMBER_A, role: 'member' },
        headers: {},
      };

      await expect(
        controller.getRecommendations(req, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects nonexistent member with 404 NotFoundException', async () => {
      mockPrisma.studioMember.findFirst.mockResolvedValue(null);

      const req = {
        user: { tenantId: TENANT_A, id: MEMBER_A, role: 'member' },
        headers: {},
      };

      await expect(controller.getRecommendations(req, {})).rejects.toThrow(NotFoundException);
    });

    it('rejects inactive member with 403 ForbiddenException', async () => {
      mockPrisma.studioMember.findFirst.mockResolvedValue({
        id: MEMBER_A,
        status: 'Inactive',
        fullName: 'Inactive User',
      });

      const req = {
        user: { tenantId: TENANT_A, id: MEMBER_A, role: 'member' },
        headers: {},
      };

      await expect(controller.getRecommendations(req, {})).rejects.toThrow(ForbiddenException);
    });

    it('enforces tenant RLS context and prevents cross-tenant member lookup', async () => {
      mockPrisma.studioMember.findFirst.mockImplementation(async ({ where }: any) => {
        if (where.tenantId === TENANT_A && where.id === MEMBER_A) {
          return { id: MEMBER_A, status: 'Active', fullName: 'Tenant A Member' };
        }
        return null;
      });

      const req = {
        user: { tenantId: TENANT_B, id: MEMBER_A, role: 'member' },
        headers: {},
      };

      await expect(controller.getRecommendations(req, {})).rejects.toThrow(NotFoundException);
      expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_B, expect.any(Function));
    });
  });

  // =========================================================================
  // 4. Dual Storage Modes: PostgreSQL & Frappe
  // =========================================================================
  describe('4. Dual Storage Modes: PostgreSQL & Frappe', () => {
    it('executes Frappe mode when IMPORT_STORE=erp and normalizes response', async () => {
      process.env.IMPORT_STORE = 'erp';

      mockErpService.call.mockResolvedValue({
        recommendations: [
          {
            session_id: 'frappe-sess-1',
            class_name: 'Ashtanga Morning',
            category: 'Yoga',
            trainer: 'Kavita',
            session_date: '2026-10-25',
            start_time: '07:00',
            available_spots: 6,
            match_score: 96,
            reason: 'Matches flexibility focus',
          },
        ],
      });

      const result = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-erp-1' },
        { days: 7 },
      );

      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          method: ERP_METHODS.RECOMMENDATION_GET,
        }),
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].sessionId).toBe('frappe-sess-1');
      expect(result.data![0].className).toBe('Ashtanga Morning');
      expect(result.data![0].availableSpots).toBe(6);
    });

    it('in ERP mode (IMPORT_STORE=erp), does NOT call PostgreSQL when Frappe call fails and propagates error', async () => {
      process.env.IMPORT_STORE = 'erp';
      mockErpService.call.mockRejectedValue(new Error('Frappe offline network partition'));

      const result = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-erp-exclusive' },
        { days: 7 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Frappe offline network partition');
      expect(mockPrisma.studioClass.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.withTenant).not.toHaveBeenCalled();
    });

    it('in PostgreSQL mode (IMPORT_STORE=postgres), executes within tenant RLS context independently', async () => {
      process.env.IMPORT_STORE = 'postgres';
      mockPrisma.studioClass.findMany.mockResolvedValue([]);

      const result = await recommendationsService.getRecommendations(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 'c-pg-exclusive' },
        { days: 7 },
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
      expect(mockErpService.call).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. Approved Tool Suite (T-14, T-15, T-16) & Agent Registry Integration
  // =========================================================================
  describe('5. Approved Tool Suite & Agent Registry Integration', () => {
    it('T-14: GetMemberGoalAndLevelTool supports member declared input with fallback', async () => {
      const tool = new GetMemberGoalAndLevelTool(mockErpService);

      // Explicit input
      const explicit = await tool.execute(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 't-14-1' },
        { goal: 'weight loss', level: 'Intermediate' },
      );
      expect(explicit.success).toBe(true);
      expect(explicit.data.goal).toBe('weight loss');
      expect(explicit.data.level).toBe('Intermediate');

      // Fallback: undeclared goal must NOT impute 'strength & endurance'
      mockErpService.call.mockRejectedValue(new Error('ERP down'));
      const fallback = await tool.execute(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 't-14-2' },
        {},
      );
      expect(fallback.success).toBe(true);
      expect(fallback.data.goal).toBeUndefined();
      expect(fallback.data.level).toBe('All Levels');
      expect(fallback.data.summary).toContain('Undeclared');
    });

    it('T-15: GetMemberAttendanceSummaryTool computes attendance stats from PostgreSQL fallback', async () => {
      const tool = new GetMemberAttendanceSummaryTool(mockErpService, mockPrisma);
      mockErpService.call.mockRejectedValue(new Error('ERP unavailable'));

      mockPrisma.studioBooking.findMany.mockResolvedValue([
        { id: 'b-1', classId: 'cls-1' },
        { id: 'b-2', classId: 'cls-2' },
      ]);
      mockPrisma.studioAttendance.findMany.mockResolvedValue([
        { bookingId: 'b-1' },
      ]);
      mockPrisma.studioClass.findMany.mockResolvedValue([
        { category: 'Yoga' },
      ]);

      const res = await tool.execute(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 't-15-1' },
        { days: 30 },
      );

      expect(res.success).toBe(true);
      expect(res.data.totalSessions).toBe(2);
      expect(res.data.attended).toBe(1);
      expect(res.data.attendanceRate).toBe(50);
      expect(res.data.byClassType).toEqual({ Yoga: 1 });
    });

    it('T-16: GetEligibleSessionsForRecommendationTool delegates to RecommendationsService', async () => {
      const tool = new GetEligibleSessionsForRecommendationTool(mockPrisma, mockErpService, recommendationsService);
      mockPrisma.studioClass.findMany.mockResolvedValue([
        { id: 'cls-99', name: 'Power Flow', category: 'Yoga', date: tomorrow, startTime: '09:00', capacity: 10, status: 'Scheduled', trainer: 'Elena' },
      ]);
      mockPrisma.studioBooking.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.studioAttendance.findMany.mockResolvedValue([]);

      const res = await tool.execute(
        { tenantId: TENANT_A, userId: MEMBER_A, role: 'member', correlationId: 't-16-1' },
        { goal: 'flexibility' },
      );

      expect(res.success).toBe(true);
      expect(res.data.count).toBe(1);
      expect(res.data.sessions[0].id).toBe('cls-99');
      expect(res.data.sessions[0].className).toBe('Power Flow');
      expect(res.data.sessions[0].availableSpots).toBe(10);
    });

    it('AgentRegistryService replaces static mock with dynamic domain recommendations', async () => {
      const mockAuditOutbox = { record: jest.fn<any>().mockResolvedValue({ id: 'aud-1' }) };
      const mockLlmGateway = { healthCheck: jest.fn<any>().mockResolvedValue({ status: 'healthy' }) };
      const mockOrchestrator = { processMessage: jest.fn<any>() };

      const agentRegistry = new AgentRegistryService(
        mockPrisma,
        mockLlmGateway as any,
        mockAuditOutbox as any,
        mockOrchestrator as any,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined,
        recommendationsService,
      );

      mockPrisma.studioClass.findMany.mockResolvedValue([
        { id: 'cls-live', name: 'Metabolic Conditioning', category: 'HIIT', date: tomorrow, startTime: '07:30', capacity: 12, status: 'Scheduled', trainer: 'Marcus' },
      ]);
      mockPrisma.studioBooking.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.studioAttendance.findMany.mockResolvedValue([]);

      const result = await agentRegistry.executeAgentAction(
        TENANT_A,
        'recommendation-assistant',
        'recommend-sessions',
        { goal: 'strength & conditioning' },
        { id: MEMBER_A, role: 'member' },
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.count).toBe(1);
      expect(data.suggestedSessions[0].class).toBe('Metabolic Conditioning');
      expect(data.suggestedSessions[0].sessionId).toBe('cls-live');
      expect(data.suggestedSessions[0].availableSpots).toBe(12);
      expect(data.attendanceTrend).toContain('Personalized based on attendance variety');
    });
  });
});
