import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StudioInsightsService } from '../ai/analytics/studio-insights.service';
import { AgentRegistryService } from '../ai/agents/agent-registry.service';
import { ToolContext } from '../ai/tools/base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

describe('AI-11: Studio Insights & Revenue Intelligence Agent Specification Suite', () => {
  const TENANT_A = '11111111-1111-4000-8000-000000000001';
  const TENANT_B = '22222222-2222-4000-8000-000000000002';
  const USER_ADMIN_ID = '33333333-3333-4000-8000-000000000001';
  const USER_OWNER_ID = '33333333-3333-4000-8000-000000000002';
  const USER_FRONT_DESK_ID = '33333333-3333-4000-8000-000000000003';
  const USER_TRAINER_ID = '33333333-3333-4000-8000-000000000004';
  const USER_MEMBER_ID = '33333333-3333-4000-8000-000000000005';
  const USER_VISITOR_ID = '33333333-3333-4000-8000-000000000006';

  const MEMBER_A1_ID = '44444444-4444-4000-8000-000000000001';
  const MEMBER_A2_ID = '44444444-4444-4000-8000-000000000002';
  const MEMBER_A3_ID = '44444444-4444-4000-8000-000000000003';
  const MEMBER_B1_ID = '44444444-4444-4000-8000-000000000004';

  const REF_DATE = new Date('2026-10-28T12:00:00Z');

  let inMemoryPayments: Map<string, any>;
  let inMemoryMembers: Map<string, any>;
  let inMemoryBookings: Map<string, any>;
  let inMemoryAttendance: Map<string, any>;
  let inMemoryClasses: Map<string, any>;
  let inMemoryAuditLogs: any[];

  let mockPrismaService: any;
  let mockErpService: any;
  let mockAuditOutbox: any;

  let studioInsightsService: StudioInsightsService;
  let agentRegistryService: AgentRegistryService;

  const createMockContext = (
    tenantId: string = TENANT_A,
    userId: string = USER_ADMIN_ID,
    role: string = 'admin',
  ): ToolContext => ({
    tenantId,
    userId,
    role,
    correlationId: `corr-${Date.now()}`,
  });

  beforeEach(() => {
    inMemoryPayments = new Map();
    inMemoryMembers = new Map();
    inMemoryBookings = new Map();
    inMemoryAttendance = new Map();
    inMemoryClasses = new Map();
    inMemoryAuditLogs = [];

    // Seed Tenant A Members
    inMemoryMembers.set(MEMBER_A1_ID, {
      id: MEMBER_A1_ID,
      tenantId: TENANT_A,
      fullName: 'Vikram Mehta',
      email: 'vikram.mehta@example.com',
      phone: '+919876543210',
      plan: 'Annual Unlimited',
      status: 'Active',
      joined: new Date('2026-01-01T00:00:00Z'),
    });

    inMemoryMembers.set(MEMBER_A2_ID, {
      id: MEMBER_A2_ID,
      tenantId: TENANT_A,
      fullName: 'Pooja Hegde',
      email: 'pooja.hegde@example.com',
      phone: '+919876543211',
      plan: '10-Class Pack',
      status: 'Active',
      joined: new Date('2026-03-01T00:00:00Z'),
    });

    inMemoryMembers.set(MEMBER_A3_ID, {
      id: MEMBER_A3_ID,
      tenantId: TENANT_A,
      fullName: 'Kiran Rao',
      email: 'kiran.rao@example.com',
      phone: '+919876543212',
      plan: 'Monthly Standard',
      status: 'Inactive',
      joined: new Date('2025-06-01T00:00:00Z'),
    });

    // Seed Tenant B Members (Must never leak to Tenant A)
    inMemoryMembers.set(MEMBER_B1_ID, {
      id: MEMBER_B1_ID,
      tenantId: TENANT_B,
      fullName: 'Arjun Kapoor',
      email: 'arjun.kapoor@example.com',
      phone: '+919876543213',
      plan: 'VIP Crossfit',
      status: 'Active',
      joined: new Date('2026-02-01T00:00:00Z'),
    });

    // Seed Tenant A Payments (Current 30-day period: 2026-09-28 to 2026-10-28)
    inMemoryPayments.set('pay-a1', {
      id: 'pay-a1',
      tenantId: TENANT_A,
      ref: 'INV-A101',
      date: new Date('2026-10-15T10:00:00Z'),
      memberId: MEMBER_A1_ID,
      type: 'Membership',
      method: 'UPI',
      status: 'Completed',
      amount: 15000,
      refundedAmount: 0,
    });

    inMemoryPayments.set('pay-a2', {
      id: 'pay-a2',
      tenantId: TENANT_A,
      ref: 'INV-A102',
      date: new Date('2026-10-20T14:30:00Z'),
      memberId: MEMBER_A2_ID,
      type: 'Pack',
      method: 'Razorpay',
      status: 'Paid',
      amount: 5000,
      refundedAmount: 500, // Partial refund
    });

    // Seed Prior 30-day period payment: 2026-08-29 to 2026-09-28
    inMemoryPayments.set('pay-a3', {
      id: 'pay-a3',
      tenantId: TENANT_A,
      ref: 'INV-A099',
      date: new Date('2026-09-10T11:00:00Z'),
      memberId: MEMBER_A1_ID,
      type: 'Membership',
      method: 'Card',
      status: 'Settled',
      amount: 12000,
      refundedAmount: 0,
    });

    // Seed Non-settled payment (Must be ignored in gross/net)
    inMemoryPayments.set('pay-a4-pending', {
      id: 'pay-a4-pending',
      tenantId: TENANT_A,
      ref: 'INV-A103',
      date: new Date('2026-10-22T09:00:00Z'),
      memberId: MEMBER_A2_ID,
      type: 'Membership',
      method: 'UPI',
      status: 'Pending',
      amount: 8000,
      refundedAmount: 0,
    });

    inMemoryPayments.set('pay-a5-failed', {
      id: 'pay-a5-failed',
      tenantId: TENANT_A,
      ref: 'INV-A104',
      date: new Date('2026-10-23T09:00:00Z'),
      memberId: MEMBER_A2_ID,
      type: 'Membership',
      method: 'NetBanking',
      status: 'Failed',
      amount: 9000,
      refundedAmount: 0,
    });

    // Seed Tenant B Payment (Must never leak into Tenant A calculations)
    inMemoryPayments.set('pay-b1', {
      id: 'pay-b1',
      tenantId: TENANT_B,
      ref: 'INV-B101',
      date: new Date('2026-10-18T12:00:00Z'),
      memberId: MEMBER_B1_ID,
      type: 'Membership',
      method: 'Razorpay',
      status: 'Paid',
      amount: 99999,
      refundedAmount: 0,
    });

    // Seed Bookings for Churn Risk Modeling & Occupancy
    // Member A1 attended recently (5 days ago: 2026-10-23)
    inMemoryBookings.set('book-a1', {
      id: 'book-a1',
      tenantId: TENANT_A,
      classId: 'cls-1',
      memberId: MEMBER_A1_ID,
      status: 'Attended',
      bookedAt: new Date('2026-10-23T08:00:00Z'),
    });

    inMemoryAttendance.set('att-a1', {
      id: 'att-a1',
      tenantId: TENANT_A,
      bookingId: 'book-a1',
      status: 'Present',
      checkedInAt: new Date('2026-10-23T08:05:00Z'),
    });

    // Member A2 attended 25 days ago: 2026-10-03 (> 21 day threshold)
    inMemoryBookings.set('book-a2', {
      id: 'book-a2',
      tenantId: TENANT_A,
      classId: 'cls-2',
      memberId: MEMBER_A2_ID,
      status: 'Completed',
      bookedAt: new Date('2026-10-03T09:00:00Z'),
    });

    inMemoryAttendance.set('att-a2', {
      id: 'att-a2',
      tenantId: TENANT_A,
      bookingId: 'book-a2',
      status: 'Present',
      checkedInAt: new Date('2026-10-03T09:02:00Z'),
    });

    // Seed Classes for Dashboard KPI (Occupancy)
    inMemoryClasses.set('cls-1', {
      id: 'cls-1',
      tenantId: TENANT_A,
      name: 'HIIT Strength',
      capacity: 20,
      status: 'Scheduled',
      date: new Date('2026-10-23T08:00:00Z'),
    });

    inMemoryClasses.set('cls-2', {
      id: 'cls-2',
      tenantId: TENANT_A,
      name: 'Yoga Flow',
      capacity: 15,
      status: 'Completed',
      date: new Date('2026-10-03T09:00:00Z'),
    });

    // Mock Prisma Service with Tenant Isolation
    mockPrismaService = {
      withTenant: jest.fn(async (tenantId: string, work: (tx: any) => Promise<any>) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
          throw new Error('A canonical tenant UUID is required for tenant-scoped database access.');
        }

        const tx = {
          tenant: {
            findUnique: jest.fn(async ({ where }: any) => {
              if (where.id === tenantId) return { id: tenantId, code: 'demo' };
              return null;
            }),
          },
          auditLog: {
            findMany: (jest.fn() as any).mockResolvedValue([]),
          },
          studioPayment: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryPayments.values()).filter((p) => {
                if (p.tenantId !== tenantId) return false;
                if (where?.status?.in && !where.status.in.includes(p.status)) return false;
                if (where?.date?.gte && p.date < where.date.gte) return false;
                if (where?.date?.lte && p.date > where.date.lte) return false;
                return true;
              });
            }),
          },
          studioMember: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryMembers.values()).filter((m) => {
                if (m.tenantId !== tenantId) return false;
                if (where?.status && m.status !== where.status) return false;
                return true;
              });
            }),
            count: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryMembers.values()).filter((m) => {
                if (m.tenantId !== tenantId) return false;
                if (where?.status && m.status !== where.status) return false;
                return true;
              }).length;
            }),
          },
          studioBooking: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryBookings.values()).filter((b) => {
                if (b.tenantId !== tenantId) return false;
                if (where?.memberId?.in && !where.memberId.in.includes(b.memberId)) return false;
                if (where?.status?.in && !where.status.in.includes(b.status)) return false;
                if (where?.bookedAt?.gte && b.bookedAt < where.bookedAt.gte) return false;
                if (where?.bookedAt?.lte && b.bookedAt > where.bookedAt.lte) return false;
                return true;
              });
            }),
          },
          studioAttendance: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryAttendance.values()).filter((a) => {
                if (a.tenantId !== tenantId) return false;
                if (where?.bookingId?.in && !where.bookingId.in.includes(a.bookingId)) return false;
                if (where?.status?.in && !where.status.in.includes(a.status)) return false;
                return true;
              });
            }),
          },
          studioClass: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryClasses.values()).filter((c) => {
                if (c.tenantId !== tenantId) return false;
                if (where?.date?.gte && c.date < where.date.gte) return false;
                if (where?.date?.lte && c.date > where.date.lte) return false;
                if (where?.status?.notIn && where.status.notIn.includes(c.status)) return false;
                return true;
              });
            }),
          },
        };

        return work(tx);
      }),
      auditLog: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
      },
    };

    mockAuditOutbox = {
      record: jest.fn(async (entry: any) => {
        inMemoryAuditLogs.push(entry);
        return { id: `audit-${inMemoryAuditLogs.length}` };
      }),
    };

    mockErpService = {
      call: jest.fn(async () => ({ mockErp: true })),
    };

    studioInsightsService = new StudioInsightsService(
      mockPrismaService,
      mockErpService,
      mockAuditOutbox,
    );

    agentRegistryService = new AgentRegistryService(
      mockPrismaService,
      { getModelStatus: (jest.fn() as any).mockResolvedValue({ status: 'healthy', latencyMs: 20 }) } as any,
      mockAuditOutbox,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      studioInsightsService,
    );
  });

  // =========================================================================
  // Requirement 1 & 4: Gross, Refund, Net, and Settled-Only Payment Statuses
  // =========================================================================
  describe('1 & 4. Revenue Calculation Accuracy & Settled-Only Payment States', () => {
    it('calculates gross billing, refunds, and net revenue strictly from settled payments', async () => {
      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getRevenueTrends(ctx, {
        periodDays: 30,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      const data = res.data;

      // In current 30-day period:
      // pay-a1: 15000 (refund: 0)
      // pay-a2: 5000 (refund: 500)
      // pay-a4-pending & pay-a5-failed must be completely ignored!
      expect(data.currentPeriod.grossRevenue).toBe(20000);
      expect(data.currentPeriod.refunds).toBe(500);
      expect(data.currentPeriod.netRevenue).toBe(19500);
      expect(data.currentPeriod.transactionCount).toBe(2);

      // Prior period (pay-a3: 12000, refund: 0)
      expect(data.previousPeriod.grossRevenue).toBe(12000);
      expect(data.previousPeriod.refunds).toBe(0);
      expect(data.previousPeriod.netRevenue).toBe(12000);
      expect(data.previousPeriod.transactionCount).toBe(1);

      // Variance
      expect(data.variance.netRevenueDelta).toBe(7500);
      expect(data.variance.growthPercent).toBe(62.5); // (19500 - 12000)/12000 * 100
      expect(data.variance.growthStatus).toBe('calculated');
      expect(data.variance.trendDirection).toBe('up');
    });
  });

  // =========================================================================
  // Requirement 2: Window Boundaries & Daily/Weekly/Monthly Grouping
  // =========================================================================
  describe('2. Window Boundaries & Aggregation Intervals', () => {
    it('supports 30, 60, and 90-day windows and daily, weekly, monthly intervals', async () => {
      const ctx = createMockContext(TENANT_A);

      const dailyRes = await studioInsightsService.getRevenueTrends(ctx, {
        periodDays: 30,
        interval: 'daily',
        referenceDate: REF_DATE,
      });
      expect(dailyRes.success).toBe(true);
      expect(dailyRes.data.interval).toBe('daily');

      const weeklyRes = await studioInsightsService.getRevenueTrends(ctx, {
        periodDays: 60,
        interval: 'weekly',
        referenceDate: REF_DATE,
      });
      expect(weeklyRes.success).toBe(true);
      expect(weeklyRes.data.interval).toBe('weekly');

      const monthlyRes = await studioInsightsService.getRevenueTrends(ctx, {
        periodDays: 90,
        interval: 'monthly',
        referenceDate: REF_DATE,
      });
      expect(monthlyRes.success).toBe(true);
      expect(monthlyRes.data.interval).toBe('monthly');
    });

    it('rejects unsupported window and interval values', async () => {
      const ctx = createMockContext(TENANT_A);

      const invalidPeriod = await studioInsightsService.getRevenueTrends(ctx, { periodDays: 45 });
      expect(invalidPeriod.success).toBe(false);
      expect(invalidPeriod.error).toContain("Unsupported periodDays '45'");

      const invalidInterval = await studioInsightsService.getRevenueTrends(ctx, {
        periodDays: 30,
        interval: 'hourly' as any,
      });
      expect(invalidInterval.success).toBe(false);
      expect(invalidInterval.error).toContain("Unsupported interval 'hourly'");
    });
  });

  // =========================================================================
  // Requirement 3: P2 — Correct Zero Baseline & Negative Baseline Growth
  // =========================================================================
  describe('3. P2 — Previous-Period Comparison & Zero/Negative Division Guards', () => {
    it('returns growthPercent null with baseline_zero_non_comparable when prior period is 0 and current is positive', async () => {
      inMemoryPayments.delete('pay-a3'); // Remove prior payment so prior net = 0

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getRevenueTrends(ctx, {
        periodDays: 30,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      expect(res.data.previousPeriod.netRevenue).toBe(0);
      expect(res.data.currentPeriod.netRevenue).toBe(19500);
      expect(res.data.variance.growthPercent).toBeNull();
      expect(res.data.variance.growthStatus).toBe('baseline_zero_non_comparable');
      expect(res.data.variance.netRevenueDelta).toBe(19500);
      expect(res.data.variance.trendDirection).toBe('up');
    });

    it('returns growthPercent null with no_activity when both periods have zero net revenue', async () => {
      inMemoryPayments.clear();

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getRevenueTrends(ctx, {
        periodDays: 30,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      expect(res.data.currentPeriod.netRevenue).toBe(0);
      expect(res.data.previousPeriod.netRevenue).toBe(0);
      expect(res.data.variance.growthPercent).toBeNull();
      expect(res.data.variance.growthStatus).toBe('no_activity');
      expect(res.data.variance.netRevenueDelta).toBe(0);
      expect(res.data.variance.trendDirection).toBe('flat');
    });

    it('handles negative prior baseline explicitly without emitting NaN or Infinity', async () => {
      // Prior period payment had high refund exceeding gross
      inMemoryPayments.set('pay-a3', {
        id: 'pay-a3',
        tenantId: TENANT_A,
        ref: 'INV-A099',
        date: new Date('2026-09-10T11:00:00Z'),
        memberId: MEMBER_A1_ID,
        type: 'Membership',
        method: 'Card',
        status: 'Settled',
        amount: 5000,
        refundedAmount: 8000, // prior net = -3000
      });

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getRevenueTrends(ctx, {
        periodDays: 30,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      expect(res.data.previousPeriod.netRevenue).toBe(-3000);
      expect(res.data.variance.growthStatus).toBe('negative_baseline');
      expect(typeof res.data.variance.growthPercent).toBe('number');
      expect(Number.isFinite(res.data.variance.growthPercent)).toBe(true);
      expect(Number.isNaN(res.data.variance.growthPercent)).toBe(false);
      expect(res.data.variance.netRevenueDelta).toBe(22500); // 19500 - (-3000)
    });
  });

  // =========================================================================
  // Requirement 5: Explicit Handling of Unsupported/Unsubstantiated MRR/ARR
  // =========================================================================
  describe('5. MRR / ARR Contractual Substantiation & Disclosure', () => {
    it('returns explicit unsubstantiated status for MRR and ARR and labels estimated billing', async () => {
      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getRevenueSummary(ctx, {
        periodMonths: 1,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      const data = res.data;

      expect(data.mrr.status).toBe('unsubstantiated');
      expect(data.mrr.value).toBeNull();
      expect(data.mrr.reason).toContain('Schema does not track automated recurring subscription renewal schedules');

      expect(data.arr.status).toBe('unsubstantiated');
      expect(data.arr.value).toBeNull();
      expect(data.arr.reason).toContain('ARR cannot be verified without contractual annual recurring commitments');

      expect(data.estimatedMonthlyBilling).toBe(19500); // 20000 - 500
      expect(data.recurringRevenueDisclosure).toContain('not a verified contractual MRR subscription guarantee');
    });
  });

  // =========================================================================
  // Requirement 6: ARPU Denominator & Reporting Period Semantics
  // =========================================================================
  describe('6. ARPU Denominator & Member Status Integrity', () => {
    it('computes ARPU using only active members and defines denominator explicitly', async () => {
      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getRevenueSummary(ctx, {
        periodMonths: 1,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      const data = res.data;

      expect(data.activeMembersCount).toBe(2);
      expect(data.activeMembersDefinition).toBe("Studio members with status = 'Active' under current tenant");

      expect(data.arpu).toBe(9750);
      expect(data.arpuDenominator).toBe('Active members count (2)');
      expect(data.arpuPeriod).toBe('30_days');
    });

    it('handles zero active members without division errors', async () => {
      inMemoryMembers.clear();

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getRevenueSummary(ctx, {
        periodMonths: 1,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      expect(res.data.activeMembersCount).toBe(0);
      expect(res.data.arpu).toBe(0);
    });
  });

  // =========================================================================
  // Requirement 7: P1 — Correct Churn-Risk Attendance Calculations
  // =========================================================================
  describe('7. P1 — Churn-Risk Attendance Calculations & Verification', () => {
    it('identifies inactive members deterministically based on verified booking check-ins', async () => {
      const ctx = createMockContext(TENANT_A);

      const res21 = await studioInsightsService.getChurnRiskModeling(ctx, {
        inactivityDays: 21,
        referenceDate: REF_DATE,
      });

      expect(res21.success).toBe(true);
      const data21 = res21.data;

      expect(data21.inactivityWindowDays).toBe(21);
      expect(data21.totalActiveMembers).toBe(2);

      // Member A1 attended 5 days ago (low risk, active)
      // Member A2 attended 25 days ago (> 21 day threshold, high risk, inactive)
      expect(data21.inactiveMembersCount).toBe(1);
      expect(data21.inactiveMembers[0].memberId).toBe(MEMBER_A2_ID);
      expect(data21.inactiveMembers[0].riskLevel).toBe('high');
      expect(data21.inactiveMembers[0].daysSinceLastVisit).toBe(25);

      expect(data21.methodology).toContain('Deterministic attendance recency rule');
      expect(data21.readOnlyConfirmation).toContain('No messaging actions or winback campaigns dispatched');
    });

    it('excludes future confirmed bookings from treating dormant members as active', async () => {
      // Add a dormant member with a FUTURE confirmed booking
      const MEMBER_DORMANT_ID = '44444444-4444-4000-8000-000000000099';
      inMemoryMembers.set(MEMBER_DORMANT_ID, {
        id: MEMBER_DORMANT_ID,
        tenantId: TENANT_A,
        fullName: 'Dormant Dan',
        email: 'dan@example.com',
        phone: '+919876543299',
        plan: 'Annual',
        status: 'Active',
        joined: new Date('2025-01-01T00:00:00Z'),
      });

      // Future booking: 7 days after REF_DATE
      inMemoryBookings.set('book-future-dan', {
        id: 'book-future-dan',
        tenantId: TENANT_A,
        classId: 'cls-1',
        memberId: MEMBER_DORMANT_ID,
        status: 'Confirmed',
        bookedAt: new Date('2026-11-04T10:00:00Z'),
      });

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getChurnRiskModeling(ctx, {
        inactivityDays: 21,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      const danEntry = res.data.inactiveMembers.find((m: any) => m.memberId === MEMBER_DORMANT_ID);
      expect(danEntry).toBeDefined();
      expect(danEntry.riskLevel).toBe('critical');
      expect(danEntry.daysSinceLastVisit).toBeNull();
      expect(danEntry.reason).toContain('No recorded attended sessions');
    });

    it('does not treat unverified past Confirmed reservations or no-shows as attended visits', async () => {
      const MEMBER_NOSHOW_ID = '44444444-4444-4000-8000-000000000088';
      inMemoryMembers.set(MEMBER_NOSHOW_ID, {
        id: MEMBER_NOSHOW_ID,
        tenantId: TENANT_A,
        fullName: 'No-Show Nancy',
        email: 'nancy@example.com',
        phone: '+919876543288',
        plan: 'Standard',
        status: 'Active',
        joined: new Date('2026-01-01T00:00:00Z'),
      });

      // Past confirmed reservation that was never attended (no StudioAttendance record)
      inMemoryBookings.set('book-noshow', {
        id: 'book-noshow',
        tenantId: TENANT_A,
        classId: 'cls-1',
        memberId: MEMBER_NOSHOW_ID,
        status: 'Confirmed',
        bookedAt: new Date('2026-10-26T10:00:00Z'), // 2 days ago
      });

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getChurnRiskModeling(ctx, {
        inactivityDays: 21,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      const nancyEntry = res.data.inactiveMembers.find((m: any) => m.memberId === MEMBER_NOSHOW_ID);
      expect(nancyEntry).toBeDefined();
      expect(nancyEntry.riskLevel).toBe('critical');
      expect(nancyEntry.daysSinceLastVisit).toBeNull();
    });

    it('excludes future-dated attendance records', async () => {
      const MEMBER_FUTURE_ATT_ID = '44444444-4444-4000-8000-000000000077';
      inMemoryMembers.set(MEMBER_FUTURE_ATT_ID, {
        id: MEMBER_FUTURE_ATT_ID,
        tenantId: TENANT_A,
        fullName: 'Future Fiona',
        email: 'fiona@example.com',
        phone: '+919876543277',
        plan: 'Standard',
        status: 'Active',
        joined: new Date('2026-01-01T00:00:00Z'),
      });

      inMemoryBookings.set('book-future-att', {
        id: 'book-future-att',
        tenantId: TENANT_A,
        classId: 'cls-1',
        memberId: MEMBER_FUTURE_ATT_ID,
        status: 'Confirmed',
        bookedAt: new Date('2026-11-01T10:00:00Z'),
      });

      inMemoryAttendance.set('att-future-fiona', {
        id: 'att-future-fiona',
        tenantId: TENANT_A,
        bookingId: 'book-future-att',
        status: 'Present',
        checkedInAt: new Date('2026-11-01T10:00:00Z'), // Future date!
      });

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getChurnRiskModeling(ctx, {
        inactivityDays: 21,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      const fionaEntry = res.data.inactiveMembers.find((m: any) => m.memberId === MEMBER_FUTURE_ATT_ID);
      expect(fionaEntry).toBeDefined();
      expect(fionaEntry.riskLevel).toBe('critical');
      expect(fionaEntry.daysSinceLastVisit).toBeNull();
    });

    it('correctly handles member with genuine past attendance', async () => {
      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getChurnRiskModeling(ctx, {
        inactivityDays: 21,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      // Member A1 has genuine attendance 5 days ago -> low risk cohort
      expect(res.data.cohortBreakdown.low).toBeGreaterThanOrEqual(1);
    });

    it('correctly classifies member with no attendance history as critical', async () => {
      const MEMBER_NO_HISTORY_ID = '44444444-4444-4000-8000-000000000066';
      inMemoryMembers.set(MEMBER_NO_HISTORY_ID, {
        id: MEMBER_NO_HISTORY_ID,
        tenantId: TENANT_A,
        fullName: 'Newbie Ned',
        email: 'ned@example.com',
        phone: '+919876543266',
        plan: 'Trial',
        status: 'Active',
        joined: new Date('2026-10-25T00:00:00Z'),
      });

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getChurnRiskModeling(ctx, {
        inactivityDays: 21,
        referenceDate: REF_DATE,
      });

      expect(res.success).toBe(true);
      const nedEntry = res.data.inactiveMembers.find((m: any) => m.memberId === MEMBER_NO_HISTORY_ID);
      expect(nedEntry).toBeDefined();
      expect(nedEntry.riskLevel).toBe('critical');
      expect(nedEntry.daysSinceLastVisit).toBeNull();
      expect(nedEntry.reason).toContain('No recorded attended sessions');
    });
  });

  // =========================================================================
  // Requirement 8: P2 — Correct Occupancy Calculations
  // =========================================================================
  describe('8. P2 — Correct Occupancy Calculations & Capacity Filters', () => {
    it('excludes cancelled classes from the capacity denominator', async () => {
      // Add a cancelled class with large capacity
      inMemoryClasses.set('cls-cancelled', {
        id: 'cls-cancelled',
        tenantId: TENANT_A,
        name: 'Cancelled Spin',
        capacity: 50,
        status: 'Cancelled',
        date: new Date('2026-10-15T08:00:00Z'),
      });

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getDashboardKpi(ctx, { referenceDate: REF_DATE });

      expect(res.success).toBe(true);
      const occ = res.data.componentMetrics.occupancy;

      // cls-1 (20) + cls-2 (15) = 35. Cancelled class (50) must NOT be added!
      expect(occ.totalCapacity).toBe(35);
      expect(occ.totalSessions).toBe(2);
      expect(occ.denominatorDefinition).toBeDefined();
    });

    it('excludes future classes from historical occupancy calculation', async () => {
      // Add a future class
      inMemoryClasses.set('cls-future', {
        id: 'cls-future',
        tenantId: TENANT_A,
        name: 'Future Pilates',
        capacity: 30,
        status: 'Scheduled',
        date: new Date('2026-11-10T08:00:00Z'), // After REF_DATE
      });

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getDashboardKpi(ctx, { referenceDate: REF_DATE });

      expect(res.success).toBe(true);
      const occ = res.data.componentMetrics.occupancy;

      // Only past/present classes within 30 days: cls-1 (20) + cls-2 (15) = 35
      expect(occ.totalCapacity).toBe(35);
      expect(occ.totalSessions).toBe(2);
    });

    it('counts only verified attendance and deduplicates multiple bookings for same class and member', async () => {
      // Add a duplicate booking for Member A1 on cls-1
      inMemoryBookings.set('book-a1-dup', {
        id: 'book-a1-dup',
        tenantId: TENANT_A,
        classId: 'cls-1',
        memberId: MEMBER_A1_ID,
        status: 'Attended',
        bookedAt: new Date('2026-10-23T08:00:00Z'),
      });

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getDashboardKpi(ctx, { referenceDate: REF_DATE });

      expect(res.success).toBe(true);
      const occ = res.data.componentMetrics.occupancy;

      // Unique attendees: Member A1 on cls-1, Member A2 on cls-2 = 2 unique attendee-sessions
      expect(occ.totalAttended).toBe(2);
      expect(occ.occupancyRatePercent).toBe(5.7); // 2 / 35 * 100 = 5.7%
    });

    it('handles zero eligible capacity safely without dividing by zero', async () => {
      inMemoryClasses.clear();

      const ctx = createMockContext(TENANT_A);
      const res = await studioInsightsService.getDashboardKpi(ctx, { referenceDate: REF_DATE });

      expect(res.success).toBe(true);
      const occ = res.data.componentMetrics.occupancy;
      expect(occ.totalCapacity).toBe(0);
      expect(occ.totalSessions).toBe(0);
      expect(occ.occupancyRatePercent).toBe(0);
    });
  });

  // =========================================================================
  // Requirement 9: P2 — Normalize ERPNext Fallback Responses
  // =========================================================================
  describe('9. P2 — ERPNext Fallback Response Normalization', () => {
    it('normalizes ERP revenue-trends response from snake_case to canonical camelCase contract', async () => {
      const erpRevenueTrendsFixture = {
        start_date: '2026-09-28',
        end_date: '2026-10-28',
        currency: 'INR',
        current_period: {
          gross_revenue: 25000,
          refunds: 1000,
          net_revenue: 24000,
          transaction_count: 5,
        },
        previous_period: {
          gross_revenue: 20000,
          refunds: 0,
          net_revenue: 20000,
          transaction_count: 4,
        },
        trends: [
          { date: '2026-10-01', gross_revenue: 12000, refunds: 500, net_revenue: 11500, transaction_count: 2 },
          { date: '2026-10-15', gross_revenue: 13000, refunds: 500, net_revenue: 12500, transaction_count: 3 },
        ],
      };

      const fallbackService = new StudioInsightsService(
        undefined,
        { call: jest.fn(async () => erpRevenueTrendsFixture) } as any,
      );

      const ctx = createMockContext(TENANT_A);
      const res = await fallbackService.getRevenueTrends(ctx, { periodDays: 30, referenceDate: REF_DATE });

      expect(res.success).toBe(true);
      const data = res.data;

      expect(data.source).toBe('erpnext');
      expect(data.periodDays).toBe(30);
      expect(data.currency).toBe('INR');
      expect(data.currentPeriod.grossRevenue).toBe(25000);
      expect(data.currentPeriod.refunds).toBe(1000);
      expect(data.currentPeriod.netRevenue).toBe(24000);
      expect(data.currentPeriod.transactionCount).toBe(5);

      expect(data.previousPeriod.grossRevenue).toBe(20000);
      expect(data.previousPeriod.netRevenue).toBe(20000);

      expect(data.variance.netRevenueDelta).toBe(4000);
      expect(data.variance.growthPercent).toBe(20.0);
      expect(data.variance.growthStatus).toBe('calculated');
      expect(data.variance.trendDirection).toBe('up');

      expect(data.trends.length).toBe(2);
      expect(data.trends[0].grossRevenue).toBe(12000);
      expect(data.trends[0].netRevenue).toBe(11500);
    });

    it('normalizes ERP revenue-summary response to canonical camelCase contract', async () => {
      const erpRevenueSummaryFixture = {
        total_revenue: 45000,
        refunds: 2000,
        net_revenue: 43000,
        transaction_count: 8,
        active_members: 10,
        currency: 'INR',
      };

      const fallbackService = new StudioInsightsService(
        undefined,
        { call: jest.fn(async () => erpRevenueSummaryFixture) } as any,
      );

      const ctx = createMockContext(TENANT_A);
      const res = await fallbackService.getRevenueSummary(ctx, { periodMonths: 1, referenceDate: REF_DATE });

      expect(res.success).toBe(true);
      const data = res.data;

      expect(data.source).toBe('erpnext');
      expect(data.grossBilling).toBe(45000);
      expect(data.refundTotals).toBe(2000);
      expect(data.netCollections).toBe(43000);
      expect(data.totalSettledTransactions).toBe(8);
      expect(data.activeMembersCount).toBe(10);
      expect(data.arpu).toBe(4300);
      expect(data.mrr.status).toBe('unsubstantiated');
      expect(data.arr.status).toBe('unsubstantiated');
    });

    it('normalizes ERP churn-risk response to canonical camelCase contract', async () => {
      const erpChurnFixture = {
        inactivity_window_days: 21,
        total_active_members: 50,
        inactive_members_count: 5,
        inactivity_rate_percent: 10.0,
        cohort_breakdown: { low: 35, medium: 10, high: 3, critical: 2 },
        inactive_members: [
          {
            member_id: 'm-1',
            member_name: 'Aarav Patel',
            current_plan: 'Gold',
            days_since_last_visit: 28,
            last_visit_date: '2026-09-30',
            risk_level: 'high',
            reason: 'High churn risk: 28 days since last session.',
          },
        ],
      };

      const fallbackService = new StudioInsightsService(
        undefined,
        { call: jest.fn(async () => erpChurnFixture) } as any,
      );

      const ctx = createMockContext(TENANT_A);
      const res = await fallbackService.getChurnRiskModeling(ctx, { inactivityDays: 21, referenceDate: REF_DATE });

      expect(res.success).toBe(true);
      const data = res.data;

      expect(data.source).toBe('erpnext');
      expect(data.inactivityWindowDays).toBe(21);
      expect(data.totalActiveMembers).toBe(50);
      expect(data.inactiveMembersCount).toBe(5);
      expect(data.cohortBreakdown.low).toBe(35);
      expect(data.inactiveMembers.length).toBe(1);
      expect(data.inactiveMembers[0].memberId).toBe('m-1');
      expect(data.inactiveMembers[0].name).toBe('Aarav Patel');
      expect(data.inactiveMembers[0].currentPlan).toBe('Gold');
      expect(data.inactiveMembers[0].daysSinceLastVisit).toBe(28);
    });

    it('normalizes ERP dashboard-kpi response to canonical camelCase contract', async () => {
      const erpDashboardFixture = {
        total_sessions: 10,
        total_capacity: 100,
        total_attended: 45,
        total_members: 60,
        revenue_this_month: 30000,
      };

      const fallbackService = new StudioInsightsService(
        undefined,
        { call: jest.fn(async () => erpDashboardFixture) } as any,
      );

      const ctx = createMockContext(TENANT_A);
      const res = await fallbackService.getDashboardKpi(ctx, { referenceDate: REF_DATE });

      expect(res.success).toBe(true);
      const data = res.data;

      expect(data.source).toBe('erpnext');
      expect(data.status).toBe('deferred_pending_specification');
      expect(data.componentMetrics.occupancy.totalSessions).toBe(10);
      expect(data.componentMetrics.occupancy.totalCapacity).toBe(100);
      expect(data.componentMetrics.occupancy.totalAttended).toBe(45);
      expect(data.componentMetrics.occupancy.occupancyRatePercent).toBe(45);
      expect(data.componentMetrics.retention.totalActiveMembers).toBe(60);
      expect(data.componentMetrics.cashFlow.grossBilling30Days).toBe(30000);
    });

    it('surfaces ERP provider errors without hiding them or returning fake data', async () => {
      const failingErp = {
        call: jest.fn(async () => {
          throw new Error('ERP service unavailable (HTTP 503)');
        }),
      };

      const fallbackService = new StudioInsightsService(undefined, failingErp as any);
      const ctx = createMockContext(TENANT_A);

      const res = await fallbackService.getRevenueTrends(ctx, { periodDays: 30 });
      expect(res.success).toBe(false);
      expect(res.error).toContain('ERP service unavailable (HTTP 503)');
    });
  });

  // =========================================================================
  // Requirement 10: P3 — Audit Event Duplication Consolidation
  // =========================================================================
  describe('10. P3 — Single Authoritative Audit Recording Layer', () => {
    it('records exactly one audit log entry per execution through AgentRegistryService', async () => {
      inMemoryAuditLogs = [];

      const actionRes = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'studio-insights',
        'revenue-trends',
        { periodDays: 30, referenceDate: REF_DATE },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(actionRes.success).toBe(true);

      // Exactly ONE audit entry must be recorded for this logical execution!
      expect(inMemoryAuditLogs.length).toBe(1);

      const auditEntry = inMemoryAuditLogs[0];
      expect(auditEntry.action).toBe('ai.agent.studio-insights.revenue-trends');
      expect(auditEntry.tenantId).toBe(TENANT_A);
      expect(auditEntry.actorId).toBe(USER_ADMIN_ID);
      expect(auditEntry.actorType).toBe('human');
      expect(auditEntry.resourceType).toBe('agent_execution');
      expect(auditEntry.resourceRef).toBe('studio-insights:revenue-trends');
      expect(auditEntry.eventType).toBe('ai.agent.executed');
      expect(auditEntry.payload.success).toBe(true);
      expect(typeof auditEntry.payload.durationMs).toBe('number');
    });

    it('records exactly one failed audit log entry when agent action fails', async () => {
      inMemoryAuditLogs = [];

      // Execute with unsupported period to trigger failure
      const actionRes = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'studio-insights',
        'revenue-trends',
        { periodDays: 45 }, // Invalid periodDays
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(actionRes.success).toBe(false);

      // Exactly ONE failed audit entry must be recorded
      expect(inMemoryAuditLogs.length).toBe(1);
      const auditEntry = inMemoryAuditLogs[0];
      expect(auditEntry.action).toBe('ai.agent.studio-insights.revenue-trends.failed');
      expect(auditEntry.eventType).toBe('ai.agent.failed');
      expect(auditEntry.payload.success).toBe(false);
      expect(auditEntry.payload.error).toContain("Unsupported periodDays '45'");
    });
  });

  // =========================================================================
  // Requirement 11: Multi-Tenant Isolation
  // =========================================================================
  describe('11. Multi-Tenant Isolation', () => {
    it('completely isolates Tenant A from Tenant B financial and member records', async () => {
      const ctxA = createMockContext(TENANT_A);
      const ctxB = createMockContext(TENANT_B);

      const resA = await studioInsightsService.getRevenueSummary(ctxA, {
        periodMonths: 1,
        referenceDate: REF_DATE,
      });
      const resB = await studioInsightsService.getRevenueSummary(ctxB, {
        periodMonths: 1,
        referenceDate: REF_DATE,
      });

      // Tenant A must NOT see Tenant B's 99999 payment
      expect(resA.data.grossBilling).toBe(20000);
      expect(resA.data.activeMembersCount).toBe(2);

      // Tenant B must see ONLY Tenant B's records
      expect(resB.data.grossBilling).toBe(99999);
      expect(resB.data.activeMembersCount).toBe(1);
    });

    it('rejects invalid or non-UUID tenant IDs', async () => {
      const ctxInvalid = createMockContext('invalid-tenant-id');
      const res = await studioInsightsService.getRevenueTrends(ctxInvalid);
      expect(res.success).toBe(false);
    });
  });

  // =========================================================================
  // Requirement 12: Role-Based Authorization
  // =========================================================================
  describe('12. Role-Based Access Control', () => {
    it('allows owner and admin roles', async () => {
      const ctxAdmin = createMockContext(TENANT_A, USER_ADMIN_ID, 'admin');
      const ctxOwner = createMockContext(TENANT_A, USER_OWNER_ID, 'owner');

      const resAdmin = await studioInsightsService.getRevenueSummary(ctxAdmin, { referenceDate: REF_DATE });
      const resOwner = await studioInsightsService.getRevenueSummary(ctxOwner, { referenceDate: REF_DATE });

      expect(resAdmin.success).toBe(true);
      expect(resOwner.success).toBe(true);
    });

    it('rejects front_desk, trainer, member, and visitor roles in service and registry', async () => {
      const forbiddenRoles = ['front_desk', 'trainer', 'member', 'visitor'];

      for (const role of forbiddenRoles) {
        const ctx = createMockContext(TENANT_A, 'user-id', role);
        const res = await studioInsightsService.getRevenueTrends(ctx);
        expect(res.success).toBe(false);
        expect(res.error).toContain(`Access denied. Role '${role}' lacks permission`);

        await expect(
          agentRegistryService.executeAgentAction(
            TENANT_A,
            'studio-insights',
            'revenue-trends',
            {},
            { id: 'user-id', role },
          ),
        ).rejects.toThrow(ForbiddenException);
      }
    });
  });

  // =========================================================================
  // Requirement 13: Regression Assertions Against Old Hardcoded Mock
  // =========================================================================
  describe('13. Regression Verification Against Hardcoded Mocks', () => {
    it('proves old fabricated financial mock values are never returned', async () => {
      const actionRes = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'studio-insights',
        'revenue-summary',
        { referenceDate: REF_DATE },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(actionRes.success).toBe(true);
      const data: any = actionRes.data;

      // Old mock had: monthlyRecurringRevenue = 28450, arpu = 142.5, activePayingMembers = 200, churnRate = '2.1%'
      expect(data.monthlyRecurringRevenue).toBeUndefined();
      expect(data.mrrGrowthRate).toBeUndefined();
      expect(data.averageRevenuePerUser).toBeUndefined();
      expect(data.financialHealthGrade).toBeUndefined();
      expect(data.forecastedNextMonthRevenue).toBeUndefined();
      expect(data.historical30Days).toBeUndefined();

      // Real calculated values
      expect(data.grossBilling).toBe(20000);
      expect(data.netCollections).toBe(19500);
      expect(data.arpu).toBe(9750);
      expect(data.activeMembersCount).toBe(2);
    });
  });

  // =========================================================================
  // Requirement 14: Action Validation & Module Wiring
  // =========================================================================
  describe('14. Action Validation & Registry Dispatch', () => {
    it('rejects unknown action IDs', async () => {
      await expect(
        agentRegistryService.executeAgentAction(
          TENANT_A,
          'studio-insights',
          'unknown-analytics-action',
          {},
          { id: USER_ADMIN_ID, role: 'admin' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects direct write mutations', async () => {
      await expect(
        agentRegistryService.executeAgentAction(
          TENANT_A,
          'studio-insights',
          'create-winback-campaign',
          {},
          { id: USER_ADMIN_ID, role: 'admin' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('registers studio-insights in agent list with all 4 authorized capabilities', async () => {
      const agent = await agentRegistryService.getAgent(TENANT_A, 'studio-insights', 'admin');

      expect(agent).toBeDefined();
      expect(agent.id).toBe('studio-insights');
      expect(agent.name).toBe('Studio Insights & Revenue Intelligence Agent');
      expect(agent.requiredRoles).toEqual(['owner', 'admin']);
      expect(agent.capabilities.map((c) => c.id)).toEqual([
        'revenue-trends',
        'revenue-summary',
        'churn-risk-modeling',
        'dashboard-kpi',
      ]);
    });

    it('dispatches all 4 approved actions through AgentRegistryService successfully', async () => {
      const actions = ['revenue-trends', 'revenue-summary', 'churn-risk-modeling', 'dashboard-kpi'];

      for (const actionId of actions) {
        const res = await agentRegistryService.executeAgentAction(
          TENANT_A,
          'studio-insights',
          actionId,
          { referenceDate: REF_DATE },
          { id: USER_ADMIN_ID, role: 'admin' },
        );
        expect(res.success).toBe(true);
        expect(res.agentId).toBe('studio-insights');
        expect(res.actionId).toBe(actionId);
        expect(res.data).toBeDefined();
      }
    });
  });

  // =========================================================================
  // Requirement 15: Neighboring Agent Regression Protection
  // =========================================================================
  describe('15. Neighboring Agent Regression Protection', () => {
    it('preserves existing AI agents definitions in the registry', async () => {
      const agents = await agentRegistryService.getAgents(TENANT_A, 'admin');

      const expectedAgents = [
        'admin-copilot',
        'public-enquiry',
        'booking-assistant',
        'recommendation-assistant',
        'feedback-intelligence',
        'crm-agent',
        'operations-agent',
        'marketing-agent',
        'advertising-agent',
        'growth-agent',
        'studio-insights',
        'session-summary',
      ];

      for (const expectedId of expectedAgents) {
        const found = agents.find((a) => a.id === expectedId);
        expect(found).toBeDefined();
      }
    });
  });
});
