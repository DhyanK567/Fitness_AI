import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdvertisingService } from '../ai/marketing/advertising.service';
import { AttributionService } from '../ai/marketing/attribution.service';
import { AgentRegistryService } from '../ai/agents/agent-registry.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { ToolContext } from '../ai/tools/base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

describe('AI-09: Advertising & Attribution Agent Specification Suite', () => {
  const TENANT_A = '11111111-1111-4000-8000-000000000001';
  const TENANT_B = '22222222-2222-4000-8000-000000000002';
  const USER_ADMIN_ID = '33333333-3333-4000-8000-000000000001';
  const USER_FRONT_DESK_ID = '33333333-3333-4000-8000-000000000002';
  const USER_TRAINER_ID = '33333333-3333-4000-8000-000000000003';
  const USER_MEMBER_ID = '33333333-3333-4000-8000-000000000004';

  const LEAD_A1_ID = '44444444-4444-4000-8000-000000000001';
  const LEAD_A2_ID = '44444444-4444-4000-8000-000000000002';
  const LEAD_B1_ID = '44444444-4444-4000-8000-000000000003';

  const CAMPAIGN_META_A_ID = '55555555-5555-4000-8000-000000000001';
  const CAMPAIGN_GOOGLE_A_ID = '55555555-5555-4000-8000-000000000002';
  const CAMPAIGN_TIKTOK_A_ID = '55555555-5555-4000-8000-000000000003';
  const CAMPAIGN_META_B_ID = '55555555-5555-4000-8000-000000000004';

  const campaignStartedRecently = () => new Date(Date.now() - 7 * 86400000);

  let inMemoryLeads: Map<string, any>;
  let inMemoryCampaigns: Map<string, any>;
  let inMemoryAuditLogs: any[];
  let mockPrismaService: any;
  let mockErpService: any;
  let mockAuditOutbox: any;

  let attributionService: AttributionService;
  let advertisingService: AdvertisingService;
  let agentRegistryService: AgentRegistryService;

  const createMockContext = (
    tenantId: string = TENANT_A,
    userId: string = USER_ADMIN_ID,
    role: string = 'admin',
  ): ToolContext => ({
    tenantId,
    tenantCode: 'TEST',
    userId,
    role,
    correlationId: `corr-${Date.now()}`,
  });

  beforeEach(() => {
    inMemoryLeads = new Map();
    inMemoryCampaigns = new Map();
    inMemoryAuditLogs = [];

    // Seed Tenant A Leads
    inMemoryLeads.set(LEAD_A1_ID, {
      id: LEAD_A1_ID,
      tenantId: TENANT_A,
      name: 'Alice Johnson',
      email: 'alice@example.com',
      source: 'Meta Ads',
      stage: 'Converted',
      createdAt: new Date('2026-10-15T10:00:00Z'),
    });
    inMemoryLeads.set(LEAD_A2_ID, {
      id: LEAD_A2_ID,
      tenantId: TENANT_A,
      name: 'Bob Smith',
      email: 'bob@example.com',
      source: 'Google Search',
      stage: 'New enquiry',
      createdAt: new Date('2026-10-18T14:30:00Z'),
    });

    // Seed Tenant B Leads
    inMemoryLeads.set(LEAD_B1_ID, {
      id: LEAD_B1_ID,
      tenantId: TENANT_B,
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      source: 'TikTok Ads',
      stage: 'Converted',
      createdAt: new Date('2026-10-20T09:00:00Z'),
    });

    // Seed Tenant A Campaigns
    inMemoryCampaigns.set(CAMPAIGN_META_A_ID, {
      id: CAMPAIGN_META_A_ID,
      tenantId: TENANT_A,
      name: 'Instagram Fall Promo',
      channel: 'meta',
      objective: 'conversions',
      budgetType: 'lifetime',
      budgetAmount: 1500,
      budgetSpent: 1200,
      budgetCurrency: 'INR',
      status: 'active',
      scheduleStart: campaignStartedRecently(),
      metrics: {
        spend: 1200,
        attributedRevenue: 5400,
        conversions: 24,
        impressions: 48000,
        clicks: 1200,
      },
    });

    inMemoryCampaigns.set(CAMPAIGN_GOOGLE_A_ID, {
      id: CAMPAIGN_GOOGLE_A_ID,
      tenantId: TENANT_A,
      name: 'Local Yoga Search Ads',
      channel: 'google',
      objective: 'traffic',
      budgetType: 'daily',
      budgetAmount: 800,
      budgetSpent: 800,
      budgetCurrency: 'INR',
      status: 'active',
      scheduleStart: campaignStartedRecently(),
      metrics: {
        spend: 800,
        attributedRevenue: 3200,
        conversions: 16,
        impressions: 12000,
        clicks: 850,
      },
    });

    inMemoryCampaigns.set(CAMPAIGN_TIKTOK_A_ID, {
      id: CAMPAIGN_TIKTOK_A_ID,
      tenantId: TENANT_A,
      name: 'TikTok Dance Trend',
      channel: 'tiktok',
      objective: 'awareness',
      budgetType: 'daily',
      budgetAmount: 400,
      budgetSpent: 400,
      budgetCurrency: 'INR',
      status: 'active',
      scheduleStart: campaignStartedRecently(),
      metrics: {
        spend: 400,
        attributedRevenue: 600,
        conversions: 2,
        impressions: 30000,
        clicks: 600,
      },
    });

    // Seed Tenant B Campaigns
    inMemoryCampaigns.set(CAMPAIGN_META_B_ID, {
      id: CAMPAIGN_META_B_ID,
      tenantId: TENANT_B,
      name: 'Tenant B Meta Campaign',
      channel: 'meta',
      objective: 'leads',
      budgetType: 'lifetime',
      budgetAmount: 2000,
      budgetSpent: 1500,
      budgetCurrency: 'INR',
      status: 'active',
      scheduleStart: campaignStartedRecently(),
      metrics: {
        spend: 1500,
        attributedRevenue: 7500,
        conversions: 30,
        impressions: 60000,
        clicks: 1800,
      },
    });

    // Setup Mock Prisma Service
    mockPrismaService = {
      withTenant: jest.fn(async (tenantId: string, fn: (tx: any) => Promise<any>) => {
        if (!tenantId || tenantId === 'invalid-uuid') {
          throw new BadRequestException('Invalid tenant');
        }
        const tx = {
          studioLead: {
            findFirst: jest.fn(async ({ where }: any) => {
              for (const lead of inMemoryLeads.values()) {
                if (lead.tenantId === where.tenantId) {
                  if (where.id && lead.id === where.id) return lead;
                }
              }
              return null;
            }),
            findMany: jest.fn(async ({ where }: any) => {
              const results: any[] = [];
              for (const lead of inMemoryLeads.values()) {
                if (lead.tenantId === where.tenantId) {
                  if (where.createdAt?.gte && lead.createdAt < where.createdAt.gte) {
                    continue;
                  }
                  results.push(lead);
                }
              }
              return results;
            }),
          },
          marketingCampaign: {
            findMany: jest.fn(async ({ where }: any) => {
              const results: any[] = [];
              for (const c of inMemoryCampaigns.values()) {
                if (c.tenantId === where.tenantId) {
                  if (where.status?.not && c.status === where.status.not) continue;
                  if (where.channel) {
                    if (typeof where.channel === 'string' && c.channel !== where.channel) continue;
                    if (where.channel.in && !where.channel.in.includes(c.channel)) continue;
                  }
                  if (where.scheduleStart?.gte && c.scheduleStart < where.scheduleStart.gte) continue;
                  results.push(c);
                }
              }
              return results;
            }),
          },
          tenant: {
            findUnique: jest.fn(async ({ where }: any) => {
              return { id: where.id };
            }),
          },
        };
        return fn(tx);
      }),
    };

    mockErpService = {
      call: jest.fn(async ({ method, body }: any) => {
        if (method === ERP_METHODS.GET_LEAD_ATTRIBUTION || method === 'wellness_studio.api.marketing.lead_attribution') {
          return {
            attribution: {
              'Meta Ads': { leads: 12, converted: 4 },
              'Google Ads': { leads: 8, converted: 3 },
            },
            period_days: body.period_days || 30,
            model: body.attribution_model || 'data_driven',
          };
        }
        return { success: true };
      }),
    };

    mockAuditOutbox = {
      record: jest.fn(async (event: any) => {
        inMemoryAuditLogs.push(event);
        return { id: `audit-${Date.now()}` };
      }),
    };

    attributionService = new AttributionService(mockPrismaService, mockErpService);
    advertisingService = new AdvertisingService(mockPrismaService, mockErpService, mockAuditOutbox, attributionService);

    agentRegistryService = new AgentRegistryService(
      mockPrismaService,
      { healthCheck: jest.fn(async () => ({ status: 'healthy' })) } as any,
      mockAuditOutbox,
      { processMessage: jest.fn() } as any,
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
      attributionService,
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
      advertisingService,
    );
  });

  // ============================================================
  // 1. Action Routing & Unknown Action Rejection
  // ============================================================
  describe('1. Agent Registry Action Dispatching', () => {
    it('should route "attribution-report" to getAttributionReport', async () => {
      const res = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'TEST',
        'advertising-agent',
        'attribution-report',
        { periodDays: 30, attributionModel: 'data_driven' },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(res.success).toBe(true);
      expect(res.actionId).toBe('attribution-report');
      expect(res.data).toBeDefined();
      expect((res.data as any).attribution['Meta Ads']).toBeDefined();
    });

    it('should route "roas-metrics" to getRoasMetrics', async () => {
      const res = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'TEST',
        'advertising-agent',
        'roas-metrics',
        { periodDays: 30, channel: 'all' },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(res.success).toBe(true);
      expect(res.actionId).toBe('roas-metrics');
      expect((res.data as any).totalAdSpend).toBe(2400); // 1200 + 800 + 400
      expect((res.data as any).attributedRevenue).toBe(9200); // 5400 + 3200 + 600
    });

    it('should route "channel-recommendations" to getChannelRecommendations', async () => {
      const res = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'TEST',
        'advertising-agent',
        'channel-recommendations',
        { periodDays: 30 },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(res.success).toBe(true);
      expect(res.actionId).toBe('channel-recommendations');
      expect((res.data as any).sufficientData).toBe(true);
      expect((res.data as any).suggestedShift).toBeDefined();
    });

    it('should reject unknown action IDs with BadRequestException', async () => {
      await expect(
        agentRegistryService.executeAgentAction(
          TENANT_A,
          'TEST',
          'advertising-agent',
          'unknown-action-xyz',
          {},
          { id: USER_ADMIN_ID, role: 'admin' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject mutating action attempts on advertising-agent', async () => {
      await expect(
        agentRegistryService.executeAgentAction(
          TENANT_A,
          'TEST',
          'advertising-agent',
          'create-campaign',
          {},
          { id: USER_ADMIN_ID, role: 'admin' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================
  // 2. Tenant Boundary Isolation & Context Enforcement
  // ============================================================
  describe('2. Multi-Tenant Boundary Isolation', () => {
    it('should reject execution when tenant context is missing', async () => {
      const invalidContext = createMockContext('');
      const res = await advertisingService.getRoasMetrics(invalidContext);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/tenant/i);
    });

    it('should enforce tenant isolation on ROAS queries (Tenant A cannot see Tenant B campaigns)', async () => {
      const resA = await advertisingService.getRoasMetrics(createMockContext(TENANT_A));
      const resB = await advertisingService.getRoasMetrics(createMockContext(TENANT_B));

      expect(resA.success).toBe(true);
      expect(resB.success).toBe(true);

      // Tenant A has 3 campaigns (Meta, Google, TikTok), total spend = 2400
      expect((resA.data as any).totalAdSpend).toBe(2400);
      expect((resA.data as any).campaignsCount).toBe(3);

      // Tenant B has 1 campaign (Meta), total spend = 1500
      expect((resB.data as any).totalAdSpend).toBe(1500);
      expect((resB.data as any).campaignsCount).toBe(1);
    });

    it('should enforce tenant isolation on lead attribution queries', async () => {
      const resA = await advertisingService.getAttributionReport(createMockContext(TENANT_A));
      const resB = await advertisingService.getAttributionReport(createMockContext(TENANT_B));

      expect(resA.success).toBe(true);
      expect(resB.success).toBe(true);

      // Tenant A has Meta Ads and Google Search
      expect((resA.data as any).attribution['Meta Ads']).toBeDefined();
      expect((resA.data as any).attribution['TikTok Ads']).toBeUndefined();

      // Tenant B has TikTok Ads
      expect((resB.data as any).attribution['TikTok Ads']).toBeDefined();
      expect((resB.data as any).attribution['Google Search']).toBeUndefined();
    });

    it('should prevent cross-tenant single lead access', async () => {
      // Tenant A tries to access Tenant B's lead LEAD_B1_ID
      const res = await advertisingService.getAttributionReport(createMockContext(TENANT_A), {
        leadId: LEAD_B1_ID,
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });
  });

  // ============================================================
  // 3. Honest Attribution & Touchpoint Semantics
  // ============================================================
  describe('3. Honest Lead Attribution & Limitations Disclosure', () => {
    it('should calculate single-lead attribution for first_touch accurately', async () => {
      const res = await advertisingService.getAttributionReport(createMockContext(TENANT_A), {
        leadId: LEAD_A1_ID,
        attributionModel: 'first_touch',
      });

      expect(res.success).toBe(true);
      expect((res.data as any).lead_id).toBe(LEAD_A1_ID);
      expect((res.data as any).attribution['Meta Ads']).toBe(1.0);
      expect((res.data as any).dataLimitation).toBeNull();
    });

    it('should disclose limitation when multi-touch model is requested on single-source PostgreSQL lead', async () => {
      const res = await advertisingService.getAttributionReport(createMockContext(TENANT_A), {
        leadId: LEAD_A1_ID,
        attributionModel: 'linear',
      });

      expect(res.success).toBe(true);
      expect((res.data as any).touchpointCount).toBe(1);
      expect((res.data as any).attribution['Meta Ads']).toBe(1.0);
      expect((res.data as any).dataLimitation).toMatch(/collapsed to initial touchpoint/i);
    });

    it('should disclose limitation and not present acquisition source as verified last_touch', async () => {
      const res = await advertisingService.getAttributionReport(createMockContext(TENANT_A), {
        leadId: LEAD_A1_ID,
        attributionModel: 'last_touch',
      });

      expect(res.success).toBe(true);
      expect((res.data as any).lead_id).toBe(LEAD_A1_ID);
      // The acquisition source must NOT be presented as a verified last-touch result
      expect((res.data as any).attribution['Meta Ads']).toBeUndefined();
      expect((res.data as any).attribution).toEqual({});
      expect((res.data as any).model).toBe('last_touch');
      // A clear limitation notice must be returned explaining verified last-touch history is unavailable
      expect((res.data as any).dataLimitation).toMatch(/verified last-touch attribution is unavailable/i);
      expect((res.data as any).dataLimitation).toMatch(/capture\/acquisition source/i);
    });

    it('should disclose limitation on aggregate attribution when last_touch model is requested', async () => {
      const res = await advertisingService.getAttributionReport(createMockContext(TENANT_A), {
        attributionModel: 'last_touch',
      });

      expect(res.success).toBe(true);
      expect((res.data as any).model).toBe('last_touch');
      expect((res.data as any).dataLimitation).toMatch(/verified last-touch attribution is unavailable/i);
    });

    it('should reject unsupported attribution models safely', async () => {
      const res = await advertisingService.getAttributionReport(createMockContext(TENANT_A), {
        attributionModel: 'unsupported_quantum_model',
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/unsupported attribution model/i);
    });

    it('should return valid empty result when tenant has zero leads without calling ERP', async () => {
      const EMPTY_TENANT = '99999999-9999-4000-8000-000000000099';
      const res = await advertisingService.getAttributionReport(createMockContext(EMPTY_TENANT));

      expect(res.success).toBe(true);
      expect((res.data as any).totalLeads).toBe(0);
      expect((res.data as any).attribution).toEqual({});
      expect((res.data as any).dataAvailable).toBe(true);
      // ERPNext must not be called when DB returned valid empty results
      expect(mockErpService.call).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // 4. ROAS, CPA, and Currency Safety
  // ============================================================
  describe('4. Deterministic ROAS, CPA, and Currency Safety', () => {
    it('should calculate deterministic ROAS and CPA accurately across paid channels', async () => {
      const res = await advertisingService.getRoasMetrics(createMockContext(TENANT_A));

      expect(res.success).toBe(true);
      const data = res.data as any;

      // Meta: spend = 1200, revenue = 5400 -> ROAS = 4.5, conversions = 24 -> CPA = 50.0
      const meta = data.channelBreakdown.find((c: any) => c.channel === 'meta');
      expect(meta.roas).toBe(4.5);
      expect(meta.cpa).toBe(50.0);

      // Google: spend = 800, revenue = 3200 -> ROAS = 4.0, conversions = 16 -> CPA = 50.0
      const google = data.channelBreakdown.find((c: any) => c.channel === 'google');
      expect(google.roas).toBe(4.0);
      expect(google.cpa).toBe(50.0);

      // TikTok: spend = 400, revenue = 600 -> ROAS = 1.5, conversions = 2 -> CPA = 200.0
      const tiktok = data.channelBreakdown.find((c: any) => c.channel === 'tiktok');
      expect(tiktok.roas).toBe(1.5);
      expect(tiktok.cpa).toBe(200.0);

      // Overall: spend = 2400, revenue = 9200 -> ROAS = 3.83, conversions = 42 -> CPA = 57.14
      expect(data.roas).toBe(3.83);
      expect(data.costPerAcquisition).toBe(57.14);
    });

    it('should handle zero spend and zero conversions safely without NaN or division by zero', async () => {
      const ZERO_TENANT = '88888888-8888-4000-8000-000000000088';
      inMemoryCampaigns.set('zero-camp', {
        id: 'zero-camp',
        tenantId: ZERO_TENANT,
        channel: 'meta',
        status: 'active',
        budgetSpent: 0,
        budgetCurrency: 'INR',
        scheduleStart: campaignStartedRecently(),
        metrics: { spend: 0, attributedRevenue: 0, conversions: 0, impressions: 0, clicks: 0 },
      });

      const res = await advertisingService.getRoasMetrics(createMockContext(ZERO_TENANT));
      expect(res.success).toBe(true);

      const data = res.data as any;
      expect(data.roas).toBe(0);
      expect(data.costPerAcquisition).toBe(0);
      expect(Number.isNaN(data.roas)).toBe(false);
      expect(Number.isNaN(data.costPerAcquisition)).toBe(false);
    });

    it('should detect mixed currencies and refuse invalid multi-currency summation', async () => {
      const MIXED_TENANT = '77777777-7777-4000-8000-000000000077';
      inMemoryCampaigns.set('camp-usd', {
        id: 'camp-usd',
        tenantId: MIXED_TENANT,
        channel: 'meta',
        status: 'active',
        budgetSpent: 500,
        budgetCurrency: 'USD',
        scheduleStart: campaignStartedRecently(),
        metrics: { spend: 500, attributedRevenue: 2000, conversions: 10 },
      });
      inMemoryCampaigns.set('camp-inr', {
        id: 'camp-inr',
        tenantId: MIXED_TENANT,
        channel: 'google',
        status: 'active',
        budgetSpent: 25000,
        budgetCurrency: 'INR',
        scheduleStart: campaignStartedRecently(),
        metrics: { spend: 25000, attributedRevenue: 100000, conversions: 50 },
      });

      const res = await advertisingService.getRoasMetrics(createMockContext(MIXED_TENANT));
      expect(res.success).toBe(true);

      const data = res.data as any;
      expect(data.mixedCurrencies).toBe(true);
      expect(data.currenciesDetected).toContain('USD');
      expect(data.currenciesDetected).toContain('INR');
    });

    it('should flag campaigns with missing metrics explicitly', async () => {
      const INCOMPLETE_TENANT = '66666666-6666-4000-8000-000000000066';
      inMemoryCampaigns.set('camp-incomplete', {
        id: 'camp-incomplete',
        tenantId: INCOMPLETE_TENANT,
        channel: 'meta',
        status: 'active',
        budgetSpent: 1000,
        budgetCurrency: 'INR',
        scheduleStart: campaignStartedRecently(),
        metrics: {}, // missing metrics
      });

      const res = await advertisingService.getRoasMetrics(createMockContext(INCOMPLETE_TENANT));
      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.campaignsWithMissingMetrics).toBe(1);
      expect(data.channelBreakdown[0].missingMetrics).toBe(true);
    });
  });

  // ============================================================
  // 5. Channel Recommendations & Advisory Guardrails
  // ============================================================
  describe('5. Deterministic Channel Reallocation Advisory', () => {
    it('should generate evidence-based reallocation advice when ROAS divergence is significant', async () => {
      const res = await advertisingService.getChannelRecommendations(createMockContext(TENANT_A));
      expect(res.success).toBe(true);

      const data = res.data as any;
      expect(data.sufficientData).toBe(true);
      expect(data.recommendationType).toBe('budget_reallocation');
      expect(data.suggestedShift.fromChannel).toBe('tiktok'); // lowest ROAS: 1.5
      expect(data.suggestedShift.toChannel).toBe('meta');     // highest ROAS: 4.5
      expect(data.suggestedShift.shiftPercentage).toBe(15);
      expect(data.advisoryNotice).toMatch(/advisory recommendation/i);
    });

    it('should return insufficient_data when only a single channel has spend', async () => {
      const res = await advertisingService.getChannelRecommendations(createMockContext(TENANT_B));
      expect(res.success).toBe(true);

      const data = res.data as any;
      expect(data.sufficientData).toBe(false);
      expect(data.recommendationType).toBe('insufficient_data');
      expect(data.recommendation).toMatch(/only one active paid channel/i);
    });

    it('should return currency_mismatch when campaigns use multiple incompatible currencies', async () => {
      const MIXED_TENANT = '77777777-7777-4000-8000-000000000077';
      inMemoryCampaigns.set('camp-usd-rec', {
        id: 'camp-usd-rec',
        tenantId: MIXED_TENANT,
        channel: 'meta',
        status: 'active',
        budgetSpent: 500,
        budgetCurrency: 'USD',
        scheduleStart: campaignStartedRecently(),
        metrics: { spend: 500, attributedRevenue: 2000, conversions: 10 },
      });
      inMemoryCampaigns.set('camp-inr-rec', {
        id: 'camp-inr-rec',
        tenantId: MIXED_TENANT,
        channel: 'google',
        status: 'active',
        budgetSpent: 25000,
        budgetCurrency: 'INR',
        scheduleStart: campaignStartedRecently(),
        metrics: { spend: 25000, attributedRevenue: 100000, conversions: 50 },
      });

      const res = await advertisingService.getChannelRecommendations(createMockContext(MIXED_TENANT));
      expect(res.success).toBe(true);

      const data = res.data as any;
      expect(data.sufficientData).toBe(false);
      expect(data.recommendationType).toBe('currency_mismatch');
      expect(data.recommendation).toMatch(/mixed currencies/i);
    });
  });

  // ============================================================
  // 6. Explicit Fallback Policy & Error Preservation
  // ============================================================
  describe('6. Explicit ERPNext Fallback Policy', () => {
    it('should fall back to ERPNext when PrismaService encounters a database outage', async () => {
      const failingPrismaService = {
        withTenant: jest.fn(async () => {
          throw new Error('Database connection pool exhausted');
        }),
      };

      const fallbackService = new AdvertisingService(failingPrismaService as any, mockErpService);
      const res = await fallbackService.getAttributionReport(createMockContext(TENANT_A));

      expect(res.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalled();
      expect((res.data as any).attribution['Meta Ads'].leads).toBe(12);
    });

    it('should NOT fall back to ERPNext when PostgreSQL returns a valid empty result', async () => {
      const EMPTY_TENANT = '55555555-5555-4000-8000-000000000055';
      const res = await advertisingService.getRoasMetrics(createMockContext(EMPTY_TENANT));

      expect(res.success).toBe(true);
      expect((res.data as any).campaignsCount).toBe(0);
      expect(mockErpService.call).not.toHaveBeenCalled();
    });

    it('should return honest error when both database and ERP fail without leaking credentials', async () => {
      const failingPrisma = {
        withTenant: jest.fn(async () => {
          throw new Error('DB timeout');
        }),
      };
      const failingErp = {
        call: jest.fn(async () => {
          throw new Error('Upstream ERP gateway 502 Bad Gateway');
        }),
      };

      const brokenService = new AdvertisingService(failingPrisma as any, failingErp as any);
      const res = await brokenService.getRoasMetrics(createMockContext(TENANT_A));

      expect(res.success).toBe(false);
      expect(res.error).toBe('Upstream ERP gateway 502 Bad Gateway');
      expect(res.error).not.toMatch(/password|secret|bearer/i);
    });
  });

  // ============================================================
  // 7. Role-Based Access Control (RBAC) Enforcement
  // ============================================================
  describe('7. Server-Side RBAC Enforcement for Advertising Agent', () => {
    it('should allow owner and admin roles to execute advertising actions', async () => {
      const resAdmin = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'TEST',
        'advertising-agent',
        'roas-metrics',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );
      expect(resAdmin.success).toBe(true);
    });

    it('should allow front_desk role to execute read-only advertising actions', async () => {
      const resFrontDesk = await agentRegistryService.executeAgentAction(
        TENANT_A,
        'TEST',
        'advertising-agent',
        'attribution-report',
        {},
        { id: USER_FRONT_DESK_ID, role: 'front_desk' },
      );
      expect(resFrontDesk.success).toBe(true);
    });

    it('should forbid trainer role from executing advertising actions', async () => {
      await expect(
        agentRegistryService.executeAgentAction(
          TENANT_A,
          'TEST',
          'advertising-agent',
          'roas-metrics',
          {},
          { id: USER_TRAINER_ID, role: 'trainer' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid member role from executing advertising actions', async () => {
      await expect(
        agentRegistryService.executeAgentAction(
          TENANT_A,
          'TEST',
          'advertising-agent',
          'channel-recommendations',
          {},
          { id: USER_MEMBER_ID, role: 'member' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================
  // 8. Audit Logging & Observability
  // ============================================================
  describe('8. Audit Logging & Outbox Integration', () => {
    it('should record structured audit outbox events on action execution', async () => {
      await agentRegistryService.executeAgentAction(
        TENANT_A,
        'TEST',
        'advertising-agent',
        'roas-metrics',
        { periodDays: 30 },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(inMemoryAuditLogs.length).toBeGreaterThan(0);
      const auditEvent = inMemoryAuditLogs[inMemoryAuditLogs.length - 1];
      expect(auditEvent.action).toBe('ai.agent.advertising-agent.roas-metrics');
      expect(auditEvent.tenantId).toBe(TENANT_A);
      expect(auditEvent.actorId).toBe(USER_ADMIN_ID);
      expect(auditEvent.payload.success).toBe(true);
    });
  });
});
