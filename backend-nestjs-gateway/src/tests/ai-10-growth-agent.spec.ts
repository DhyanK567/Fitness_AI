import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpsellService } from '../ai/growth/upsell.service';
import { ReferralService } from '../ai/growth/referral.service';
import { ExperimentService } from '../ai/growth/experiment.service';
import { GrowthAnalyticsService } from '../ai/growth/growth-analytics.service';
import { AgentRegistryService } from '../ai/agents/agent-registry.service';
import { ToolContext } from '../ai/tools/base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

describe('AI-10: Growth Optimization Agent Specification Suite', () => {
  const TENANT_A = '11111111-1111-4000-8000-000000000001';
  const TENANT_B = '22222222-2222-4000-8000-000000000002';
  const USER_ADMIN_ID = '33333333-3333-4000-8000-000000000001';
  const USER_OWNER_ID = '33333333-3333-4000-8000-000000000002';
  const USER_FRONT_DESK_ID = '33333333-3333-4000-8000-000000000003';
  const USER_TRAINER_ID = '33333333-3333-4000-8000-000000000004';
  const USER_MEMBER_ID = '33333333-3333-4000-8000-000000000005';

  const MEMBER_A1_ID = '44444444-4444-4000-8000-000000000001';
  const MEMBER_A2_ID = '44444444-4444-4000-8000-000000000002';
  const MEMBER_B1_ID = '44444444-4444-4000-8000-000000000003';

  const CAMPAIGN_A1_ID = '55555555-5555-4000-8000-000000000001';
  const CAMPAIGN_B1_ID = '55555555-5555-4000-8000-000000000002';

  const EXPERIMENT_A1_ID = '66666666-6666-4000-8000-000000000001';
  const EXPERIMENT_B1_ID = '66666666-6666-4000-8000-000000000002';

  let inMemoryMembers: Map<string, any>;
  let inMemoryBookings: Map<string, any>;
  let inMemoryMemberships: Map<string, any>;
  let inMemoryReferralCampaigns: Map<string, any>;
  let inMemoryReferrals: Map<string, any>;
  let inMemoryExperiments: Map<string, any>;
  let inMemoryEnrollments: Map<string, any>;
  let inMemoryPayments: Map<string, any>;
  let inMemoryLeads: Map<string, any>;
  let inMemoryAuditLogs: any[];

  let mockPrismaService: any;
  let mockErpService: any;
  let mockAuditOutbox: any;

  let upsellService: UpsellService;
  let referralService: ReferralService;
  let experimentService: ExperimentService;
  let growthAnalyticsService: GrowthAnalyticsService;
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
    inMemoryMembers = new Map();
    inMemoryBookings = new Map();
    inMemoryMemberships = new Map();
    inMemoryReferralCampaigns = new Map();
    inMemoryReferrals = new Map();
    inMemoryExperiments = new Map();
    inMemoryEnrollments = new Map();
    inMemoryPayments = new Map();
    inMemoryLeads = new Map();
    inMemoryAuditLogs = [];

    // Seed Tenant A Members (Real test identities, ensuring no hardcoded mock leak)
    inMemoryMembers.set(MEMBER_A1_ID, {
      id: MEMBER_A1_ID,
      tenantId: TENANT_A,
      fullName: 'Rohan Verma',
      email: 'rohan.verma@example.com',
      phone: '+919876500001',
      plan: '10-Class Flex',
      status: 'Active',
      joined: new Date('2026-01-10T00:00:00Z'),
    });

    inMemoryMembers.set(MEMBER_A2_ID, {
      id: MEMBER_A2_ID,
      tenantId: TENANT_A,
      fullName: 'Ananya Patel',
      email: 'ananya.patel@example.com',
      phone: '+919876500002',
      plan: 'Standard Gym Access',
      status: 'Active',
      joined: new Date('2026-03-15T00:00:00Z'),
    });

    // Seed Tenant B Members (Must never leak to Tenant A)
    inMemoryMembers.set(MEMBER_B1_ID, {
      id: MEMBER_B1_ID,
      tenantId: TENANT_B,
      fullName: 'Siddharth Rao',
      email: 'siddharth.rao@example.com',
      phone: '+919876500099',
      plan: 'Basic Tier',
      status: 'Active',
      joined: new Date('2026-02-01T00:00:00Z'),
    });

    // Seed Bookings (Attendance frequency)
    for (let i = 0; i < 10; i++) {
      const id = `booking-a1-${i}`;
      inMemoryBookings.set(id, {
        id,
        tenantId: TENANT_A,
        memberId: MEMBER_A1_ID,
        status: 'Attended',
        bookedAt: new Date('2026-10-01T10:00:00Z'),
      });
    }
    for (let i = 0; i < 14; i++) {
      const id = `booking-a2-${i}`;
      inMemoryBookings.set(id, {
        id,
        tenantId: TENANT_A,
        memberId: MEMBER_A2_ID,
        status: 'Confirmed',
        bookedAt: new Date('2026-10-05T10:00:00Z'),
      });
    }
    // Tenant B bookings
    for (let i = 0; i < 20; i++) {
      const id = `booking-b1-${i}`;
      inMemoryBookings.set(id, {
        id,
        tenantId: TENANT_B,
        memberId: MEMBER_B1_ID,
        status: 'Attended',
        bookedAt: new Date('2026-10-01T10:00:00Z'),
      });
    }

    // Seed Referral Campaigns
    inMemoryReferralCampaigns.set(CAMPAIGN_A1_ID, {
      id: CAMPAIGN_A1_ID,
      tenantId: TENANT_A,
      name: 'Diwali Member Referral Drive',
      status: 'active',
      validFrom: new Date('2026-10-01T00:00:00Z'),
      maxReferralsPerMember: 10,
    });
    inMemoryReferralCampaigns.set(CAMPAIGN_B1_ID, {
      id: CAMPAIGN_B1_ID,
      tenantId: TENANT_B,
      name: 'Tenant B Exclusive Drive',
      status: 'active',
      validFrom: new Date('2026-10-01T00:00:00Z'),
      maxReferralsPerMember: 5,
    });

    // Seed Referrals
    inMemoryReferrals.set('ref-a1', {
      id: 'ref-a1',
      tenantId: TENANT_A,
      campaignId: CAMPAIGN_A1_ID,
      referrerMemberId: MEMBER_A1_ID,
      status: 'converted',
      referrerRewardPaid: true,
      referredAt: new Date('2026-10-05T00:00:00Z'),
    });
    inMemoryReferrals.set('ref-a2', {
      id: 'ref-a2',
      tenantId: TENANT_A,
      campaignId: CAMPAIGN_A1_ID,
      referrerMemberId: MEMBER_A1_ID,
      status: 'pending',
      referrerRewardPaid: false,
      referredAt: new Date('2026-10-10T00:00:00Z'),
    });
    inMemoryReferrals.set('ref-b1', {
      id: 'ref-b1',
      tenantId: TENANT_B,
      campaignId: CAMPAIGN_B1_ID,
      referrerMemberId: MEMBER_B1_ID,
      status: 'converted',
      referrerRewardPaid: true,
      referredAt: new Date('2026-10-01T00:00:00Z'),
    });

    // Seed Experiments & Enrollments
    inMemoryExperiments.set(EXPERIMENT_A1_ID, {
      id: EXPERIMENT_A1_ID,
      tenantId: TENANT_A,
      name: 'Zero Joining Fee vs Free Merchandise',
      hypothesis: 'Zero joining fee increases trial-to-paid conversion by 20%',
      targetMetric: 'conversion_rate',
      status: 'running',
      startDate: new Date('2026-10-01T00:00:00Z'),
    });
    inMemoryExperiments.set(EXPERIMENT_B1_ID, {
      id: EXPERIMENT_B1_ID,
      tenantId: TENANT_B,
      name: 'Tenant B Pricing Test',
      hypothesis: 'Higher tier pricing test',
      targetMetric: 'revenue_per_member',
      status: 'running',
      startDate: new Date('2026-10-01T00:00:00Z'),
    });

    inMemoryEnrollments.set('enr-a1', {
      id: 'enr-a1',
      tenantId: TENANT_A,
      experimentId: EXPERIMENT_A1_ID,
      memberId: MEMBER_A1_ID,
      variant: 'treatment',
      enrolledAt: new Date('2026-10-02T00:00:00Z'),
      convertedAt: new Date('2026-10-08T00:00:00Z'),
    });
    inMemoryEnrollments.set('enr-a2', {
      id: 'enr-a2',
      tenantId: TENANT_A,
      experimentId: EXPERIMENT_A1_ID,
      memberId: MEMBER_A2_ID,
      variant: 'control',
      enrolledAt: new Date('2026-10-03T00:00:00Z'),
      convertedAt: null,
    });
    inMemoryEnrollments.set('enr-b1', {
      id: 'enr-b1',
      tenantId: TENANT_B,
      experimentId: EXPERIMENT_B1_ID,
      memberId: MEMBER_B1_ID,
      variant: 'treatment',
      enrolledAt: new Date('2026-10-01T00:00:00Z'),
      convertedAt: new Date('2026-10-05T00:00:00Z'),
    });

    // Seed Payments
    inMemoryPayments.set('pay-a1', {
      id: 'pay-a1',
      tenantId: TENANT_A,
      memberId: MEMBER_A1_ID,
      amount: 6000,
      refundedAmount: 0,
      status: 'Paid',
      date: new Date('2026-01-10T00:00:00Z'),
    });
    inMemoryPayments.set('pay-a2', {
      id: 'pay-a2',
      tenantId: TENANT_A,
      memberId: MEMBER_A2_ID,
      amount: 4000,
      refundedAmount: 500, // Refund handled: net = 3500
      status: 'Paid',
      date: new Date('2026-03-15T00:00:00Z'),
    });
    inMemoryPayments.set('pay-b1', {
      id: 'pay-b1',
      tenantId: TENANT_B,
      memberId: MEMBER_B1_ID,
      amount: 25000,
      refundedAmount: 0,
      status: 'Paid',
      date: new Date('2026-02-01T00:00:00Z'),
    });

    // Setup Mock Prisma Service with Tenant Isolation
    mockPrismaService = {
      withTenant: jest.fn(async (tenantId: string, fn: (tx: any) => Promise<any>) => {
        if (!tenantId || tenantId === 'invalid-uuid') {
          throw new BadRequestException('Invalid tenant');
        }
        const tx = {
          studioMember: {
            findMany: jest.fn(async ({ where }: any) => {
              const res: any[] = [];
              for (const m of inMemoryMembers.values()) {
                if (m.tenantId === where.tenantId) {
                  if (where.id && m.id !== where.id) continue;
                  if (where.status && m.status !== where.status) continue;
                  res.push(m);
                }
              }
              return res;
            }),
            count: jest.fn(async ({ where }: any) => {
              let cnt = 0;
              for (const m of inMemoryMembers.values()) {
                if (m.tenantId === where.tenantId) {
                  if (where.status && m.status !== where.status) continue;
                  cnt++;
                }
              }
              return cnt;
            }),
          },
          studioBooking: {
            findMany: jest.fn(async ({ where }: any) => {
              const res: any[] = [];
              for (const b of inMemoryBookings.values()) {
                if (b.tenantId === where.tenantId) {
                  if (where.memberId?.in && !where.memberId.in.includes(b.memberId)) continue;
                  res.push(b);
                }
              }
              return res;
            }),
          },
          studioMembership: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryMemberships.values()).filter((m) => m.tenantId === where.tenantId);
            }),
          },
          referralCampaign: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryReferralCampaigns.values()).filter((c) => c.tenantId === where.tenantId);
            }),
            create: jest.fn(async ({ data }: any) => {
              const created = { id: `camp-${Date.now()}`, ...data };
              inMemoryReferralCampaigns.set(created.id, created);
              return created;
            }),
          },
          referral: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryReferrals.values()).filter((r) => r.tenantId === where.tenantId);
            }),
          },
          growthExperiment: {
            findMany: jest.fn(async ({ where }: any) => {
              const res: any[] = [];
              for (const exp of inMemoryExperiments.values()) {
                if (exp.tenantId === where.tenantId) {
                  if (where.id && exp.id !== where.id) continue;
                  if (where.status && exp.status !== where.status) continue;
                  // Attach enrollments
                  const enrollments = Array.from(inMemoryEnrollments.values()).filter((e) => e.experimentId === exp.id && e.tenantId === where.tenantId);
                  res.push({ ...exp, enrollments });
                }
              }
              return res;
            }),
            create: jest.fn(async ({ data }: any) => {
              const created = { id: `exp-${Date.now()}`, ...data };
              inMemoryExperiments.set(created.id, created);
              return created;
            }),
          },
          studioPayment: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryPayments.values()).filter((p) => p.tenantId === where.tenantId);
            }),
          },
          studioLead: {
            findMany: jest.fn(async ({ where }: any) => {
              return Array.from(inMemoryLeads.values()).filter((l) => l.tenantId === where.tenantId);
            }),
          },
          upsellOffer: {
            create: jest.fn(async ({ data }: any) => {
              return { id: `offer-${Date.now()}`, ...data };
            }),
          },
        };
        return fn(tx);
      }),
    };

    // Setup Mock ERP Service
    mockErpService = {
      call: jest.fn(),
    };

    // Setup Mock Audit Outbox Service
    mockAuditOutbox = {
      record: jest.fn(async (event: any) => {
        inMemoryAuditLogs.push(event);
        return { id: `audit-${inMemoryAuditLogs.length}`, ...event };
      }),
    };

    // Instantiate Services
    upsellService = new UpsellService(mockPrismaService, mockErpService, mockAuditOutbox);
    referralService = new ReferralService(mockPrismaService, mockErpService, mockAuditOutbox);
    experimentService = new ExperimentService(mockPrismaService, mockErpService, mockAuditOutbox);
    growthAnalyticsService = new GrowthAnalyticsService(mockPrismaService, mockErpService, mockAuditOutbox);

    // Instantiate AgentRegistryService
    agentRegistryService = new AgentRegistryService(
      mockPrismaService,
      {} as any,
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
      upsellService,
      referralService,
      experimentService,
      growthAnalyticsService,
    );
  });

  // =========================================================================
  // 1. Multi-Tenant Isolation Tests
  // =========================================================================
  describe('Multi-Tenant Isolation', () => {
    it('should strictly isolate upsell candidates between Tenant A and Tenant B', async () => {
      const resA = await upsellService.getUpsellOpportunities(createMockContext(TENANT_A), {});
      expect(resA.success).toBe(true);
      const candidatesA = (resA.data as any).candidates;
      expect(candidatesA.length).toBeGreaterThan(0);
      expect(candidatesA.some((c: any) => c.memberId === MEMBER_A1_ID || c.memberId === MEMBER_A2_ID)).toBe(true);
      expect(candidatesA.some((c: any) => c.memberId === MEMBER_B1_ID)).toBe(false);

      const resB = await upsellService.getUpsellOpportunities(createMockContext(TENANT_B), {});
      expect(resB.success).toBe(true);
      const candidatesB = (resB.data as any).candidates;
      expect(candidatesB.some((c: any) => c.memberId === MEMBER_B1_ID)).toBe(true);
      expect(candidatesB.some((c: any) => c.memberId === MEMBER_A1_ID)).toBe(false);
    });

    it('should strictly isolate referral metrics between Tenant A and Tenant B', async () => {
      const resA = await referralService.getReferralProgramMetrics(createMockContext(TENANT_A), {});
      expect(resA.success).toBe(true);
      expect((resA.data as any).total_referrals).toBe(2);
      expect((resA.data as any).converted_referrals).toBe(1);

      const resB = await referralService.getReferralProgramMetrics(createMockContext(TENANT_B), {});
      expect(resB.success).toBe(true);
      expect((resB.data as any).total_referrals).toBe(1);
      expect((resB.data as any).converted_referrals).toBe(1);
    });

    it('should strictly isolate growth experiments between Tenant A and Tenant B', async () => {
      const resA = await experimentService.trackGrowthExperiment(createMockContext(TENANT_A), {});
      expect(resA.success).toBe(true);
      const expsA = (resA.data as any).experiments;
      expect(expsA).toHaveLength(1);
      expect(expsA[0].id).toBe(EXPERIMENT_A1_ID);

      const resB = await experimentService.trackGrowthExperiment(createMockContext(TENANT_B), {});
      expect(resB.success).toBe(true);
      const expsB = (resB.data as any).experiments;
      expect(expsB).toHaveLength(1);
      expect(expsB[0].id).toBe(EXPERIMENT_B1_ID);
    });

    it('should strictly isolate LTV analytics revenue between Tenant A and Tenant B', async () => {
      const resA = await growthAnalyticsService.getLifetimeValueMetrics(createMockContext(TENANT_A), {});
      expect(resA.success).toBe(true);
      // Tenant A: Rohan Verma (6000) + Ananya Patel (3500 net) = 9500 / 2 members = 4750
      expect((resA.data as any).netRevenue).toBe(9500);
      expect((resA.data as any).historicalLtv).toBe(4750);

      const resB = await growthAnalyticsService.getLifetimeValueMetrics(createMockContext(TENANT_B), {});
      expect(resB.success).toBe(true);
      // Tenant B: Siddharth Rao (25000) / 1 member = 25000
      expect((resB.data as any).netRevenue).toBe(25000);
      expect((resB.data as any).historicalLtv).toBe(25000);
    });

    it('should reject requests without tenantId context', async () => {
      const invalidCtx = { ...createMockContext(), tenantId: '' };
      const res = await upsellService.getUpsellOpportunities(invalidCtx, {});
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Tenant context required/i);
    });
  });

  // =========================================================================
  // 2. Capability Specific Logic & Math
  // =========================================================================
  describe('Capability 1: upsell-opportunities', () => {
    it('should calculate confidence scores based on visit frequency and current tier', async () => {
      const res = await upsellService.getUpsellOpportunities(createMockContext(TENANT_A), { minScore: 60 });
      expect(res.success).toBe(true);
      const candidates = (res.data as any).candidates;
      expect(candidates.length).toBe(2);

      const ananya = candidates.find((c: any) => c.memberId === MEMBER_A2_ID);
      expect(ananya).toBeDefined();
      expect(ananya.visitsThisMonth).toBe(14);
      expect(ananya.confidence).toBeGreaterThanOrEqual(0.85);
      expect(ananya.reason).toContain('High visit frequency');

      const rohan = candidates.find((c: any) => c.memberId === MEMBER_A1_ID);
      expect(rohan).toBeDefined();
      expect(rohan.visitsThisMonth).toBe(10);
    });

    it('should filter by specific memberId when requested', async () => {
      const res = await upsellService.getUpsellOpportunities(createMockContext(TENANT_A), { memberId: MEMBER_A1_ID });
      expect(res.success).toBe(true);
      const candidates = (res.data as any).candidates;
      expect(candidates).toHaveLength(1);
      expect(candidates[0].memberId).toBe(MEMBER_A1_ID);
    });

    it('should return clean zero-candidate state when tenant has no active members', async () => {
      const EMPTY_TENANT = '99999999-9999-4000-8000-000000000000';
      const res = await upsellService.getUpsellOpportunities(createMockContext(EMPTY_TENANT), {});
      expect(res.success).toBe(true);
      expect((res.data as any).candidates).toHaveLength(0);
      expect((res.data as any).totalCandidates).toBe(0);
      expect((res.data as any).source).toBe('postgresql');
    });
  });

  describe('Capability 2: referral-metrics', () => {
    it('should compute viral coefficient, conversion rate, and advocate rankings', async () => {
      const res = await referralService.getReferralProgramMetrics(createMockContext(TENANT_A), {});
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.total_referrals).toBe(2);
      expect(data.converted_referrals).toBe(1);
      expect(data.conversion_rate).toBe(50.0);
      // 1 converted / 2 active members in Tenant A = 0.5
      expect(data.viral_coefficient).toBe(0.5);
      expect(data.topAdvocates).toHaveLength(1);
      expect(data.topAdvocates[0].memberId).toBe(MEMBER_A1_ID);
      expect(data.topAdvocates[0].referralCount).toBe(2);
    });

    it('should safely guard against division by zero when active members count is 0', async () => {
      const EMPTY_TENANT = '99999999-9999-4000-8000-000000000000';
      const res = await referralService.getReferralProgramMetrics(createMockContext(EMPTY_TENANT), {});
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.total_referrals).toBe(0);
      expect(data.conversion_rate).toBe(0);
      expect(data.viral_coefficient).toBe(0);
      expect(data.topAdvocates).toHaveLength(0);
    });
  });

  describe('Capability 3: growth-experiments', () => {
    it('should report control and treatment conversion rates and identify the leading variant', async () => {
      const res = await experimentService.trackGrowthExperiment(createMockContext(TENANT_A), {});
      expect(res.success).toBe(true);
      const exp = (res.data as any).experiments[0];
      expect(exp.totalEnrolled).toBe(2);
      expect(exp.treatmentCount).toBe(1);
      expect(exp.controlCount).toBe(1);
      expect(exp.treatmentConversionRate).toBe(100);
      expect(exp.controlConversionRate).toBe(0);
      expect(exp.leadingVariant).toContain('Treatment');
    });

    it('should handle experiments with zero enrollments without false conversion claims', async () => {
      const EMPTY_EXP_ID = 'exp-empty-001';
      inMemoryExperiments.set(EMPTY_EXP_ID, {
        id: EMPTY_EXP_ID,
        tenantId: TENANT_A,
        name: 'Empty Cohort Test',
        hypothesis: 'Test with no enrollments yet',
        targetMetric: 'conversion_rate',
        status: 'draft',
      });

      const res = await experimentService.trackGrowthExperiment(createMockContext(TENANT_A), { experimentId: EMPTY_EXP_ID });
      expect(res.success).toBe(true);
      const exp = (res.data as any).experiments[0];
      expect(exp.totalEnrolled).toBe(0);
      expect(exp.treatmentConversionRate).toBe(0);
      expect(exp.controlConversionRate).toBe(0);
      expect(exp.leadingVariant).toBe('insufficient_data');
    });
  });

  describe('Capability 4: ltv-analytics', () => {
    it('should compute historical LTV and projected 12M LTV accounting for refunds', async () => {
      const res = await growthAnalyticsService.getLifetimeValueMetrics(createMockContext(TENANT_A), { periodMonths: 12 });
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.currency).toBe('INR');
      // Tenant A: 6000 + (4000 - 500 refund) = 9500
      expect(data.netRevenue).toBe(9500);
      expect(data.totalPayingMembers).toBe(2);
      expect(data.historicalLtv).toBe(4750);
      expect(data.formula).toBeDefined();
      expect(data.projectionLimitation).toBeDefined();
      expect(data.cohorts).toBeDefined();
      expect(data.cohorts.length).toBeGreaterThan(0);
    });

    it('should return honest zero LTV when no payments exist for tenant', async () => {
      const EMPTY_TENANT = '99999999-9999-4000-8000-000000000000';
      const res = await growthAnalyticsService.getLifetimeValueMetrics(createMockContext(EMPTY_TENANT), {});
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.netRevenue).toBe(0);
      expect(data.historicalLtv).toBe(0);
      expect(data.projected12MonthLtv).toBe(0);
      expect(data.totalPayingMembers).toBe(0);
      expect(data.cohorts).toHaveLength(0);
    });
  });

  // =========================================================================
  // 3. ERPNext Fallback Behavior
  // =========================================================================
  describe('ERPNext Fallback Mechanism', () => {
    it('should fallback to ERPNext when PostgreSQL is unavailable for upsell opportunities', async () => {
      const erpOnlyService = new UpsellService(mockErpService);
      const mockErpResponse = { candidates: [{ memberId: 'erp-m1', name: 'ERP Member' }] };
      mockErpService.call.mockResolvedValueOnce(mockErpResponse);

      const res = await erpOnlyService.getUpsellOpportunities(createMockContext(TENANT_A), { minScore: 50, limit: 10 });
      expect(res.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          method: ERP_METHODS.GET_UPSELL_OPPORTUNITIES || 'wellness_studio.api.growth.upsell_opportunities',
        }),
      );
      expect(res.data).toEqual(mockErpResponse);
    });

    it('should fallback to ERPNext when PostgreSQL is unavailable for referral metrics', async () => {
      const erpOnlyService = new ReferralService(mockErpService);
      const mockErpResponse = { total_referrals: 15, conversion_rate: 30 };
      mockErpService.call.mockResolvedValueOnce(mockErpResponse);

      const res = await erpOnlyService.getReferralProgramMetrics(createMockContext(TENANT_A), {});
      expect(res.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          method: ERP_METHODS.GET_REFERRAL_METRICS || 'wellness_studio.api.referral.metrics',
        }),
      );
    });

    it('should fallback to ERPNext when PostgreSQL is unavailable for growth experiments', async () => {
      const erpOnlyService = new ExperimentService(mockErpService);
      const mockErpResponse = { experiments: [{ id: 'erp-exp1', name: 'ERP Exp' }] };
      mockErpService.call.mockResolvedValueOnce(mockErpResponse);

      const res = await erpOnlyService.trackGrowthExperiment(createMockContext(TENANT_A), {});
      expect(res.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          method: ERP_METHODS.TRACK_GROWTH_EXPERIMENT || 'wellness_studio.api.growth.track_experiment',
        }),
      );
    });

    it('should fallback to ERPNext when PostgreSQL is unavailable for LTV analytics', async () => {
      const erpOnlyService = new GrowthAnalyticsService(mockErpService);
      const mockErpResponse = { avg_ltv: 12000, cohorts: [] };
      mockErpService.call.mockResolvedValueOnce(mockErpResponse);

      const res = await erpOnlyService.getLifetimeValueMetrics(createMockContext(TENANT_A), { periodMonths: 12 });
      expect(res.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          method: ERP_METHODS.GET_LIFETIME_VALUE_METRICS || 'wellness_studio.api.growth.lifetime_value',
        }),
      );
    });
  });

  // =========================================================================
  // 4. Agent Registry Dispatcher, RBAC, and Audit Logging
  // =========================================================================
  describe('AgentRegistryService Integration & RBAC', () => {
    it('should dispatch upsell-opportunities and record an audit outbox event', async () => {
      const result = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'upsell-opportunities',
        { limit: 10 },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('growth-agent');
      expect(result.actionId).toBe('upsell-opportunities');
      expect((result.data as any).candidates).toBeDefined();

      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          actorId: USER_ADMIN_ID,
          action: 'ai.agent.growth-agent.upsell-opportunities',
          resourceType: 'agent_execution',
          resourceRef: 'growth-agent:upsell-opportunities',
          eventType: 'ai.agent.executed',
        }),
      );
    });

    it('should dispatch referral-metrics successfully', async () => {
      const result = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'referral-metrics',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).total_referrals).toBe(2);
    });

    it('should dispatch growth-experiments successfully', async () => {
      const result = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'growth-experiments',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).experiments).toHaveLength(1);
    });

    it('should dispatch ltv-analytics successfully', async () => {
      const result = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'ltv-analytics',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).historicalLtv).toBe(4750);
    });

    it('should permit owner, admin, and front_desk roles', async () => {
      const roles = ['owner', 'admin', 'front_desk'];
      for (const role of roles) {
        const res = await agentRegistryService.executeAgentAction(
          TENANT_A,
          'growth-agent',
          'upsell-opportunities',
          {},
          { id: `user-${role}`, role },
        );
        expect(res.success).toBe(true);
      }
    });

    it('should reject unauthorized roles (trainer, member, visitor) with ForbiddenException', async () => {
      const forbiddenRoles = ['trainer', 'member', 'visitor'];
      for (const role of forbiddenRoles) {
        await expect(
          agentRegistryService.executeAgentAction(
            TENANT_A,
            'growth-agent',
            'upsell-opportunities',
            {},
            { id: `user-${role}`, role },
          ),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('should reject unsupported action IDs with BadRequestException', async () => {
      await expect(
        agentRegistryService.executeAgentAction(
          TENANT_A,
          'growth-agent',
          'non-existent-action',
          {},
          { id: USER_ADMIN_ID, role: 'admin' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 5. Mandatory Write-Action Guardrail Tests
  // =========================================================================
  describe('Mandatory Write-Action Guardrails', () => {
    it('should reject direct unsolicited write action create-referral-campaign via capability runner', async () => {
      // Direct capability dispatcher must reject write operations requiring confirmation
      await expect(
        (agentRegistryService as any).handleGrowthAction(
          TENANT_A,
          'create-referral-campaign',
          { name: 'Direct Campaign' },
          { id: USER_ADMIN_ID, role: 'admin' },
          'corr-123',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject direct unsolicited write action create-upsell-offer via capability runner', async () => {
      await expect(
        (agentRegistryService as any).handleGrowthAction(
          TENANT_A,
          'create-upsell-offer',
          { offerType: 'plan_upgrade' },
          { id: USER_ADMIN_ID, role: 'admin' },
          'corr-123',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject direct unsolicited write action create-growth-experiment via capability runner', async () => {
      await expect(
        (agentRegistryService as any).handleGrowthAction(
          TENANT_A,
          'create-growth-experiment',
          { name: 'Direct Experiment' },
          { id: USER_ADMIN_ID, role: 'admin' },
          'corr-123',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should verify that read-only capability execution does not mutate persistent database tables', async () => {
      const campaignsBefore = inMemoryReferralCampaigns.size;
      const experimentsBefore = inMemoryExperiments.size;

      await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'upsell-opportunities',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );
      await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'referral-metrics',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );
      await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'growth-experiments',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );
      await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'ltv-analytics',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(inMemoryReferralCampaigns.size).toBe(campaignsBefore);
      expect(inMemoryExperiments.size).toBe(experimentsBefore);
    });
  });

  // =========================================================================
  // 6. Regression Protection Against Hardcoded Stubs
  // =========================================================================
  describe('Regression Protection Against Stale Stubs', () => {
    it('should never return hardcoded synthetic candidate Priya Sharma when real tenant data is queried', async () => {
      const res = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'upsell-opportunities',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      const candidates = (res.data as any).candidates;
      const names = candidates.map((c: any) => c.name);
      expect(names).toContain('Rohan Verma');
      expect(names).toContain('Ananya Patel');
      expect(names).not.toContain('Priya Sharma');
      expect(names).not.toContain('Alexander Wright');
    });

    it('should never return static $1,860 LTV when actual tenant billing produces a calculated result', async () => {
      const res = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'growth-agent',
        'ltv-analytics',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      const data = res.data as any;
      expect(data.historicalLtv).toBe(4750);
      expect(data.historicalLtv).not.toBe(1860);
      expect(data.avgCustomerLifetimeValue).toBe(4750);
    });
  });
});
