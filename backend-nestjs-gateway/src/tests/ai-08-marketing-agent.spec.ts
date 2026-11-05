import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MarketingAnalyticsService } from '../ai/marketing/marketing-analytics.service';
import { CampaignService } from '../ai/marketing/campaign.service';
import { AudienceService } from '../ai/marketing/audience.service';
import { ContentService } from '../ai/marketing/content.service';
import { CompetitorIntelligenceService } from '../ai/marketing/competitor-intelligence.service';
import { ReviewManagementService } from '../ai/marketing/review-management.service';
import { AttributionService } from '../ai/marketing/attribution.service';
import { BrandService } from '../ai/marketing/brand.service';
import {
  GetCampaignPerformanceTool,
  CreateMarketingCampaignTool,
  GetAudienceSegmentsTool,
  CreateAudienceSegmentTool,
  GetContentCalendarTool,
  ScheduleContentTool,
  GetLeadAttributionTool,
  GetBrandHealthMetricsTool,
  ManageReviewResponseTool,
  GetCompetitorIntelligenceTool,
} from '../ai/tools/marketing-tools';
import { ToolRegistry } from '../ai/tools/tool-registry';
import { AgentRegistryService } from '../ai/agents/agent-registry.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { canUseTool } from '../ai/guardrails/scope-rules';
import { ERP_METHODS } from '@wsos/erp-methods';

describe('AI-08: Marketing & Social Media Agent Specification Suite', () => {
  const TENANT_A = '11111111-1111-4000-8000-000000000001';
  const TENANT_B = '22222222-2222-4000-8000-000000000002';
  const USER_ADMIN_ID = '33333333-3333-4000-8000-000000000001';
  const USER_FRONT_DESK_ID = '33333333-3333-4000-8000-000000000002';

  const CAMPAIGN_A1_ID = '44444444-4444-4000-8000-000000000001';
  const CAMPAIGN_A2_ID = '44444444-4444-4000-8000-000000000002';
  const CAMPAIGN_B1_ID = '44444444-4444-4000-8000-000000000003';

  const SEGMENT_A1_ID = '55555555-5555-4000-8000-000000000001';
  const SEGMENT_A2_ID = '55555555-5555-4000-8000-000000000002';
  const SEGMENT_B1_ID = '55555555-5555-4000-8000-000000000003';

  const CONTENT_A1_ID = '66666666-6666-4000-8000-000000000001';
  const CONTENT_A2_ID = '66666666-6666-4000-8000-000000000002';
  const CONTENT_B1_ID = '66666666-6666-4000-8000-000000000003';

  const COMPETITOR_A1_ID = '77777777-7777-4000-8000-000000000001';
  const COMPETITOR_A2_ID = '77777777-7777-4000-8000-000000000002';
  const COMPETITOR_B1_ID = '77777777-7777-4000-8000-000000000003';

  const REVIEW_A1_ID = '88888888-8888-4000-8000-000000000001';
  const REVIEW_A2_ID = '88888888-8888-4000-8000-000000000002';
  const REVIEW_B1_ID = '88888888-8888-4000-8000-000000000003';

  let inMemoryCampaigns: Map<string, any>;
  let inMemorySegments: Map<string, any>;
  let inMemoryContent: Map<string, any>;
  let inMemoryCompetitors: Map<string, any>;
  let inMemoryReviews: Map<string, any>;
  let inMemoryAuditLogs: any[];
  let inMemoryOutboxEvents: any[];

  let mockTx: any;
  let mockPrisma: any;
  let mockErpService: any;
  let mockLlmGateway: any;
  let mockOrchestrator: any;
  let auditOutbox: AuditOutboxService;

  let marketingAnalyticsService: MarketingAnalyticsService;
  let campaignService: CampaignService;
  let audienceService: AudienceService;
  let contentService: ContentService;
  let competitorIntelligenceService: CompetitorIntelligenceService;
  let reviewManagementService: ReviewManagementService;
  let attributionService: AttributionService;
  let brandService: BrandService;

  let toolRegistry: ToolRegistry;
  let agentRegistry: AgentRegistryService;

  beforeEach(() => {
    // 1. In-memory Marketing Campaigns
    inMemoryCampaigns = new Map([
      [
        CAMPAIGN_A1_ID,
        {
          id: CAMPAIGN_A1_ID,
          tenantId: TENANT_A,
          name: 'New Year Yoga Awakening',
          description: 'Q1 acquisition campaign for new yoga memberships',
          channel: 'meta',
          objective: 'conversions',
          targeting: { interests: ['yoga', 'mindfulness'], ageMin: 21, ageMax: 55 },
          creative: { headline: 'Start your journey', body: 'First class free in Jan' },
          budgetType: 'lifetime',
          budgetAmount: 40000,
          budgetCurrency: 'INR',
          budgetSpent: 28000,
          scheduleStart: new Date('2026-01-01T00:00:00Z'),
          scheduleEnd: new Date('2026-01-31T23:59:59Z'),
          dayparting: [],
          landingPageUrl: 'https://studio-a.wellness.io/intro',
          utmParams: { utm_source: 'meta', utm_campaign: 'ny_yoga' },
          status: 'active',
          metrics: {
            impressions: 120000,
            clicks: 3600,
            conversions: 240,
            spend: 28000,
            attributedRevenue: 120000,
          },
          createdBy: USER_ADMIN_ID,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-15T00:00:00Z'),
        },
      ],
      [
        CAMPAIGN_A2_ID,
        {
          id: CAMPAIGN_A2_ID,
          tenantId: TENANT_A,
          name: 'Summer Reformer Intensive',
          description: 'Pilates reformer workshops promotion',
          channel: 'google',
          objective: 'traffic',
          targeting: { keywords: ['reformer pilates', 'pilates studio near me'] },
          creative: { headline: 'Pilates Specialists', body: 'Limited spots available' },
          budgetType: 'daily',
          budgetAmount: 1500,
          budgetCurrency: 'INR',
          budgetSpent: 12000,
          scheduleStart: new Date('2026-05-01T00:00:00Z'),
          scheduleEnd: new Date('2026-05-31T23:59:59Z'),
          dayparting: [],
          landingPageUrl: 'https://studio-a.wellness.io/reformer',
          utmParams: { utm_source: 'google', utm_campaign: 'summer_reformer' },
          status: 'draft',
          metrics: {
            impressions: 0,
            clicks: 0,
            conversions: 0,
            spend: 0,
            attributedRevenue: 0,
          },
          createdBy: USER_ADMIN_ID,
          createdAt: new Date('2026-04-20T00:00:00Z'),
          updatedAt: new Date('2026-04-20T00:00:00Z'),
        },
      ],
      [
        CAMPAIGN_B1_ID,
        {
          id: CAMPAIGN_B1_ID,
          tenantId: TENANT_B,
          name: 'CrossFit Open Prep',
          description: 'Tenant B CrossFit campaign',
          channel: 'meta',
          objective: 'conversions',
          targeting: { interests: ['crossfit', 'olympic lifting'] },
          creative: { headline: 'Compete Ready', body: 'Open coaching' },
          budgetType: 'lifetime',
          budgetAmount: 50000,
          budgetCurrency: 'INR',
          budgetSpent: 45000,
          scheduleStart: new Date('2026-02-01T00:00:00Z'),
          scheduleEnd: new Date('2026-02-28T23:59:59Z'),
          dayparting: [],
          landingPageUrl: 'https://studio-b.crossfit.io/open',
          utmParams: {},
          status: 'active',
          metrics: {
            impressions: 80000,
            clicks: 2000,
            conversions: 100,
            spend: 45000,
            attributedRevenue: 90000,
          },
          createdBy: 'user-b-admin',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-15T00:00:00Z'),
        },
      ],
    ]);

    // 2. In-memory Audience Segments
    inMemorySegments = new Map([
      [
        SEGMENT_A1_ID,
        {
          id: SEGMENT_A1_ID,
          tenantId: TENANT_A,
          name: 'Lapsed Morning Regulars',
          description: 'Members with 0 visits in last 21 days who used to book morning slots',
          segmentType: 'behavioral',
          rules: { inactivityDays: 21, preferredTimeSlot: 'morning' },
          estimatedSize: 45,
          sourceSegmentId: null,
          lookalikeConfig: null,
          status: 'active',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        },
      ],
      [
        SEGMENT_A2_ID,
        {
          id: SEGMENT_A2_ID,
          tenantId: TENANT_A,
          name: 'High Lifetime Value Lookalike',
          description: 'Lookalike 1% based on top 10% spenders',
          segmentType: 'lookalike',
          rules: {},
          estimatedSize: 2200,
          sourceSegmentId: SEGMENT_A1_ID,
          lookalikeConfig: { sourceCountry: 'IN', similarityPercent: 1 },
          status: 'active',
          createdAt: new Date('2026-02-05T00:00:00Z'),
          updatedAt: new Date('2026-02-05T00:00:00Z'),
        },
      ],
      [
        SEGMENT_B1_ID,
        {
          id: SEGMENT_B1_ID,
          tenantId: TENANT_B,
          name: 'Tenant B Weekend Warriors',
          description: 'Tenant B audience',
          segmentType: 'behavioral',
          rules: { preferredDays: ['sat', 'sun'] },
          estimatedSize: 80,
          sourceSegmentId: null,
          lookalikeConfig: null,
          status: 'active',
          createdAt: new Date('2026-02-01T00:00:00Z'),
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        },
      ],
    ]);

    // 3. In-memory Content Calendar
    inMemoryContent = new Map([
      [
        CONTENT_A1_ID,
        {
          id: CONTENT_A1_ID,
          tenantId: TENANT_A,
          channel: 'social',
          contentType: 'reel',
          title: 'Morning Yoga Sun Salutation Breakdown',
          body: 'Master your transitions with Coach Elena in 60 seconds.',
          mediaUrls: ['https://cdn.wellness.io/videos/sun-salutation.mp4'],
          scheduledAt: new Date('2026-03-10T08:00:00Z'),
          targetSegments: [SEGMENT_A1_ID],
          utmParams: { utm_source: 'instagram', utm_medium: 'reel' },
          abTestVariant: null,
          status: 'scheduled',
          createdBy: USER_ADMIN_ID,
          createdAt: new Date('2026-03-01T00:00:00Z'),
          updatedAt: new Date('2026-03-01T00:00:00Z'),
        },
      ],
      [
        CONTENT_A2_ID,
        {
          id: CONTENT_A2_ID,
          tenantId: TENANT_A,
          channel: 'email',
          contentType: 'newsletter',
          title: 'March Studio Community Update',
          body: 'Check out our newly installed reformer springs and nutrition talks.',
          mediaUrls: [],
          scheduledAt: new Date('2026-03-15T10:00:00Z'),
          targetSegments: [SEGMENT_A1_ID, SEGMENT_A2_ID],
          utmParams: { utm_source: 'email', utm_campaign: 'march_nl' },
          abTestVariant: 'subject_line_a',
          status: 'scheduled',
          createdBy: USER_ADMIN_ID,
          createdAt: new Date('2026-03-02T00:00:00Z'),
          updatedAt: new Date('2026-03-02T00:00:00Z'),
        },
      ],
      [
        CONTENT_B1_ID,
        {
          id: CONTENT_B1_ID,
          tenantId: TENANT_B,
          channel: 'social',
          contentType: 'post',
          title: 'Tenant B CrossFit Open PRs',
          body: 'Heavy snatch PRs this Friday night lights.',
          mediaUrls: ['https://cdn.crossfit.io/img/pr.jpg'],
          scheduledAt: new Date('2026-03-10T12:00:00Z'),
          targetSegments: [SEGMENT_B1_ID],
          utmParams: {},
          abTestVariant: null,
          status: 'scheduled',
          createdBy: 'user-b-admin',
          createdAt: new Date('2026-03-01T00:00:00Z'),
          updatedAt: new Date('2026-03-01T00:00:00Z'),
        },
      ],
    ]);

    // 4. In-memory Competitor Intelligence
    inMemoryCompetitors = new Map([
      [
        COMPETITOR_A1_ID,
        {
          id: COMPETITOR_A1_ID,
          tenantId: TENANT_A,
          name: 'CoreFlow Boutique Pilates',
          category: 'Pilates',
          address: '142 Indiranagar 100ft Rd, Bangalore',
          latitude: 12.9716,
          longitude: 77.5946,
          distanceKm: 2.4,
          pricing: { singleDropIn: 1200, tenClassPack: 10500, unlimitedMonthly: 15000 },
          offerings: ['Reformer', 'Mat', 'Cadillac'],
          promotions: ['First class 50% off', 'Refer a friend gets 1 class free'],
          reviews: { rating: 4.6, count: 128 },
          digitalPresence: { instagramFollowers: 8500, googleRating: 4.6 },
          lastCrawledAt: new Date('2026-02-20T00:00:00Z'),
          isActive: true,
          createdAt: new Date('2026-01-10T00:00:00Z'),
          updatedAt: new Date('2026-02-20T00:00:00Z'),
        },
      ],
      [
        COMPETITOR_A2_ID,
        {
          id: COMPETITOR_A2_ID,
          tenantId: TENANT_A,
          name: 'Zenith Yoga Collective',
          category: 'Yoga',
          address: '88 Koramangala 4th Block, Bangalore',
          latitude: 12.9352,
          longitude: 77.6245,
          distanceKm: 5.8,
          pricing: { singleDropIn: 800, unlimitedMonthly: 8500 },
          offerings: ['Vinyasa', 'Hatha', 'Sound Bath'],
          promotions: ['Free trial week'],
          reviews: { rating: 4.8, count: 215 },
          digitalPresence: { instagramFollowers: 14200, googleRating: 4.8 },
          lastCrawledAt: new Date('2026-02-22T00:00:00Z'),
          isActive: true,
          createdAt: new Date('2026-01-15T00:00:00Z'),
          updatedAt: new Date('2026-02-22T00:00:00Z'),
        },
      ],
      [
        COMPETITOR_B1_ID,
        {
          id: COMPETITOR_B1_ID,
          tenantId: TENANT_B,
          name: 'Titan CrossFit Arena',
          category: 'CrossFit',
          address: '42 Whitefield Main Rd, Bangalore',
          latitude: 12.9698,
          longitude: 77.7499,
          distanceKm: 3.1,
          pricing: { unlimitedMonthly: 9000 },
          offerings: ['WOD', 'Olympic Lifting'],
          promotions: [],
          reviews: { rating: 4.7, count: 95 },
          digitalPresence: {},
          lastCrawledAt: new Date('2026-02-25T00:00:00Z'),
          isActive: true,
          createdAt: new Date('2026-01-20T00:00:00Z'),
          updatedAt: new Date('2026-02-25T00:00:00Z'),
        },
      ],
    ]);

    // 5. In-memory Reviews
    inMemoryReviews = new Map([
      [
        REVIEW_A1_ID,
        {
          id: REVIEW_A1_ID,
          tenantId: TENANT_A,
          platform: 'google',
          reviewerName: 'Aarav Sharma',
          rating: 5,
          reviewText: 'Elena is the best Pilates instructor in Bangalore. The studio is spotless!',
          reviewDate: new Date('2026-02-18T14:30:00Z'),
          response: null,
          respondedAt: null,
          respondedBy: null,
          status: 'pending',
          fetchedAt: new Date('2026-02-18T15:00:00Z'),
        },
      ],
      [
        REVIEW_A2_ID,
        {
          id: REVIEW_A2_ID,
          tenantId: TENANT_A,
          platform: 'google',
          reviewerName: 'Pooja Iyer',
          rating: 2,
          reviewText: 'Air conditioning was leaking near reformer #2 during Saturday peak class.',
          reviewDate: new Date('2026-02-24T11:00:00Z'),
          response: null,
          respondedAt: null,
          respondedBy: null,
          status: 'pending',
          fetchedAt: new Date('2026-02-24T11:30:00Z'),
        },
      ],
      [
        REVIEW_B1_ID,
        {
          id: REVIEW_B1_ID,
          tenantId: TENANT_B,
          platform: 'google',
          reviewerName: 'Rohan Mehra',
          rating: 4,
          reviewText: 'Tenant B CrossFit is intense. Great barbells.',
          reviewDate: new Date('2026-02-20T09:00:00Z'),
          response: null,
          respondedAt: null,
          respondedBy: null,
          status: 'pending',
          fetchedAt: new Date('2026-02-20T09:15:00Z'),
        },
      ],
    ]);

    inMemoryAuditLogs = [];
    inMemoryOutboxEvents = [];

    // Mock Transaction Client
    mockTx = {
      marketingCampaign: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          return Array.from(inMemoryCampaigns.values()).filter((c) => {
            if (where.tenantId && c.tenantId !== where.tenantId) return false;
            if (where.id && c.id !== where.id) return false;
            if (where.channel && c.channel !== where.channel) return false;
            if (where.status && c.status !== where.status) return false;
            if (where.createdAt?.gte && c.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && c.createdAt > where.createdAt.lte) return false;
            return true;
          });
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return (
            Array.from(inMemoryCampaigns.values()).find((c) => {
              if (where.id && c.id !== where.id) return false;
              if (where.tenantId && c.tenantId !== where.tenantId) return false;
              return true;
            }) || null
          );
        }),
        create: jest.fn(async ({ data }: any) => {
          const id = `camp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          inMemoryCampaigns.set(id, record);
          return record;
        }),
      },

      audienceSegment: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          return Array.from(inMemorySegments.values()).filter((s) => {
            if (where.tenantId && s.tenantId !== where.tenantId) return false;
            if (where.segmentType && s.segmentType !== where.segmentType) return false;
            if (where.estimatedSize?.gte && s.estimatedSize < where.estimatedSize.gte) return false;
            return true;
          });
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return (
            Array.from(inMemorySegments.values()).find((s) => {
              if (where.id && s.id !== where.id) return false;
              if (where.tenantId && s.tenantId !== where.tenantId) return false;
              return true;
            }) || null
          );
        }),
        create: jest.fn(async ({ data }: any) => {
          const id = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          inMemorySegments.set(id, record);
          return record;
        }),
      },

      contentCalendar: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          return Array.from(inMemoryContent.values()).filter((c) => {
            if (where.tenantId && c.tenantId !== where.tenantId) return false;
            if (where.channel && c.channel !== where.channel) return false;
            if (where.status && c.status !== where.status) return false;
            if (where.scheduledAt?.gte && c.scheduledAt < where.scheduledAt.gte) return false;
            if (where.scheduledAt?.lte && c.scheduledAt > where.scheduledAt.lte) return false;
            return true;
          });
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return (
            Array.from(inMemoryContent.values()).find((c) => {
              if (where.id && c.id !== where.id) return false;
              if (where.tenantId && c.tenantId !== where.tenantId) return false;
              return true;
            }) || null
          );
        }),
        create: jest.fn(async ({ data }: any) => {
          const id = `cnt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const record = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
          inMemoryContent.set(id, record);
          return record;
        }),
      },

      competitor: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          const list = Array.from(inMemoryCompetitors.values()).filter((c) => {
            if (where.tenantId && c.tenantId !== where.tenantId) return false;
            if (where.isActive !== undefined && c.isActive !== where.isActive) return false;
            if (where.distanceKm?.lte && c.distanceKm > where.distanceKm.lte) return false;
            return true;
          });
          return list.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return (
            Array.from(inMemoryCompetitors.values()).find((c) => {
              if (where.id && c.id !== where.id) return false;
              if (where.tenantId && c.tenantId !== where.tenantId) return false;
              return true;
            }) || null
          );
        }),
      },

      review: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          return Array.from(inMemoryReviews.values()).filter((r) => {
            if (where.tenantId && r.tenantId !== where.tenantId) return false;
            if (where.platform && r.platform !== where.platform) return false;
            if (where.id && r.id !== where.id) return false;
            return true;
          });
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return (
            Array.from(inMemoryReviews.values()).find((r) => {
              if (where.id && r.id !== where.id) return false;
              if (where.tenantId && r.tenantId !== where.tenantId) return false;
              return true;
            }) || null
          );
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const r = inMemoryReviews.get(where.id);
          if (!r) throw new NotFoundException('Review not found');
          Object.assign(r, data);
          inMemoryReviews.set(where.id, r);
          return r;
        }),
      },

      tenant: {
        findUnique: jest.fn(async ({ where }: any) => {
          return { id: where.id, code: 'demo-tenant' };
        }),
      },

      auditLog: {
        create: jest.fn(async ({ data }: any) => {
          const entry = { id: `audit-${inMemoryAuditLogs.length + 1}`, ...data, createdAt: new Date() };
          inMemoryAuditLogs.push(entry);
          return entry;
        }),
        findMany: jest.fn(async () => []),
      },

      outboxEvent: {
        create: jest.fn(async ({ data }: any) => {
          const entry = { id: `outbox-${inMemoryOutboxEvents.length + 1}`, ...data, createdAt: new Date() };
          inMemoryOutboxEvents.push(entry);
          return entry;
        }),
      },
    };

    mockPrisma = {
      withTenant: jest.fn(async (tenantId: string, work: (tx: any) => Promise<any>) => {
        const campaignsSnapshot = new Map(
          Array.from(inMemoryCampaigns.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const segmentsSnapshot = new Map(
          Array.from(inMemorySegments.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const reviewsSnapshot = new Map(
          Array.from(inMemoryReviews.entries()).map(([k, v]) => [k, { ...v }]),
        );
        const auditSnapshot = [...inMemoryAuditLogs];
        const outboxSnapshot = [...inMemoryOutboxEvents];

        try {
          return await work(mockTx);
        } catch (err) {
          inMemoryCampaigns = campaignsSnapshot;
          inMemorySegments = segmentsSnapshot;
          inMemoryReviews = reviewsSnapshot;
          inMemoryAuditLogs = auditSnapshot;
          inMemoryOutboxEvents = outboxSnapshot;
          throw err;
        }
      }),
    };

    mockErpService = {
      call: jest.fn(),
    };

    mockLlmGateway = {
      healthCheck: jest.fn(async () => ({ status: 'healthy', latencyMs: 30 })),
    };

    mockOrchestrator = {
      processMessage: jest.fn(),
    };

    auditOutbox = new AuditOutboxService(mockPrisma as any);
    marketingAnalyticsService = new MarketingAnalyticsService(mockPrisma as any, mockErpService as any);
    campaignService = new CampaignService(mockPrisma as any, mockErpService as any, auditOutbox);
    audienceService = new AudienceService(mockPrisma as any, mockErpService as any, auditOutbox);
    contentService = new ContentService(mockPrisma as any, mockErpService as any, auditOutbox);
    competitorIntelligenceService = new CompetitorIntelligenceService(mockPrisma as any, mockErpService as any);
    reviewManagementService = new ReviewManagementService(mockPrisma as any, mockErpService as any, auditOutbox);
    attributionService = new AttributionService(mockErpService as any);
    brandService = new BrandService(mockErpService as any);

    toolRegistry = new ToolRegistry(undefined, auditOutbox);
    toolRegistry.register('getCampaignPerformance', new GetCampaignPerformanceTool(marketingAnalyticsService));
    toolRegistry.register('createMarketingCampaign', new CreateMarketingCampaignTool(campaignService));
    toolRegistry.register('getAudienceSegments', new GetAudienceSegmentsTool(audienceService));
    toolRegistry.register('createAudienceSegment', new CreateAudienceSegmentTool(audienceService));
    toolRegistry.register('getContentCalendar', new GetContentCalendarTool(contentService));
    toolRegistry.register('scheduleContent', new ScheduleContentTool(contentService));
    toolRegistry.register('getLeadAttribution', new GetLeadAttributionTool(attributionService));
    toolRegistry.register('getBrandHealthMetrics', new GetBrandHealthMetricsTool(brandService));
    toolRegistry.register('manageReviewResponse', new ManageReviewResponseTool(reviewManagementService));
    toolRegistry.register('getCompetitorIntelligence', new GetCompetitorIntelligenceTool(competitorIntelligenceService));

    agentRegistry = new AgentRegistryService(
      mockPrisma as any,
      mockLlmGateway as any,
      auditOutbox,
      mockOrchestrator as any,
      toolRegistry,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      campaignService,
      audienceService,
      contentService,
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
      marketingAnalyticsService,
      competitorIntelligenceService,
    );
  });

  // =========================================================================
  // 1. Tenant Boundary Isolation Across All Marketing Entities
  // =========================================================================
  describe('1. Tenant Boundary Isolation', () => {
    it('isolates marketing campaign performance queries by tenant boundary', async () => {
      const res = await marketingAnalyticsService.getCampaignPerformance(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        {},
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalCampaigns).toBe(2);
      expect(data.campaigns.map((c: any) => c.id)).toContain(CAMPAIGN_A1_ID);
      expect(data.campaigns.map((c: any) => c.id)).toContain(CAMPAIGN_A2_ID);
      expect(data.campaigns.map((c: any) => c.id)).not.toContain(CAMPAIGN_B1_ID);
    });

    it('isolates audience segments by tenant boundary', async () => {
      const res = await audienceService.getAudienceSegments(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        {},
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalSegments).toBe(2);
      expect(data.segments.map((s: any) => s.id)).toContain(SEGMENT_A1_ID);
      expect(data.segments.map((s: any) => s.id)).not.toContain(SEGMENT_B1_ID);
    });

    it('isolates content calendar items by tenant boundary', async () => {
      const res = await contentService.getContentCalendar(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { startDate: '2026-03-01', endDate: '2026-03-31' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.content.length).toBe(2);
      expect(data.content.map((c: any) => c.id)).toContain(CONTENT_A1_ID);
      expect(data.content.map((c: any) => c.id)).not.toContain(CONTENT_B1_ID);
    });

    it('isolates competitor intelligence by tenant boundary', async () => {
      const res = await competitorIntelligenceService.getCompetitorIntelligence(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        {},
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalCompetitors).toBe(2);
      expect(data.competitors.map((c: any) => c.id)).toContain(COMPETITOR_A1_ID);
      expect(data.competitors.map((c: any) => c.id)).not.toContain(COMPETITOR_B1_ID);
    });

    it('isolates review management view and mutations by tenant boundary', async () => {
      const viewRes = await reviewManagementService.manageReviewResponse(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { action: 'view' },
      );
      expect(viewRes.success).toBe(true);
      const reviews = (viewRes.data as any).reviews;
      expect(reviews.length).toBe(2);
      expect(reviews.map((r: any) => r.id)).not.toContain(REVIEW_B1_ID);

      // Attempting to respond to Tenant B's review from Tenant A context fails with NOT_FOUND
      const respondRes = await reviewManagementService.manageReviewResponse(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { action: 'respond', reviewId: REVIEW_B1_ID, response: 'Thank you!' },
      );
      expect(respondRes.success).toBe(false);
      expect(respondRes.errorCode).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // 2. Marketing Analytics Domain Metrics Calculation
  // =========================================================================
  describe('2. Marketing Analytics Performance Calculation', () => {
    it('calculates deterministic campaign metrics (CTR, CPA, ROAS) accurately', async () => {
      const res = await marketingAnalyticsService.getCampaignPerformance(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { channel: 'meta' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalCampaigns).toBe(1);
      const campaign = data.campaigns[0];
      expect(campaign.id).toBe(CAMPAIGN_A1_ID);
      // CTR: (3600 clicks / 120000 impressions) * 100 = 3%
      expect(campaign.metrics.ctr).toBe(3);
      // CPA: 28000 spend / 240 conversions = 116.67
      expect(campaign.metrics.cpa).toBe(116.67);
      // ROAS: 120000 attributed revenue / 28000 spend = 4.29
      expect(campaign.metrics.roas).toBe(4.29);
      expect(campaign.metrics.spend).toBe(28000);
    });

    it('handles zero-activity campaigns gracefully without NaN or division by zero', async () => {
      const res = await marketingAnalyticsService.getCampaignPerformance(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { status: 'draft' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalCampaigns).toBe(1);
      const campaign = data.campaigns[0];
      expect(campaign.metrics.ctr).toBe(0);
      expect(campaign.metrics.cpa).toBe(0);
      expect(campaign.metrics.roas).toBe(0);
    });

    it('returns empty list gracefully when no campaigns match filters', async () => {
      const res = await marketingAnalyticsService.getCampaignPerformance(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { channel: 'tiktok' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalCampaigns).toBe(0);
      expect(data.campaigns).toEqual([]);
    });
  });

  // =========================================================================
  // 3. Campaign Service Lifecycle and Audit Logging
  // =========================================================================
  describe('3. Campaign Service (createMarketingCampaign)', () => {
    it('creates marketing campaign in draft status and records transactional audit event', async () => {
      const res = await campaignService.createMarketingCampaign(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-camp-1' },
        {
          name: 'Flash Weekend Pass Promo',
          channel: 'meta',
          objective: 'conversions',
          targeting: { interests: ['fitness'] },
          creative: { headline: 'Weekend Passes Available' },
          budget: { type: 'lifetime', amount: 15000, currency: 'INR' },
          schedule: { startDate: '2026-04-01', endDate: '2026-04-03' },
          landingPageUrl: 'https://studio-a.wellness.io/flash',
          utmParams: { utm_campaign: 'flash_weekend' },
        },
      );

      expect(res.success).toBe(true);
      const campaign = res.data as any;
      expect(campaign.status).toBe('draft');
      expect(campaign.budgetAmount).toBe(15000);
      expect(campaign.budgetSpent).toBe(0);

      // Verify Transactional Audit Outbox Persistence
      expect(inMemoryAuditLogs.length).toBe(1);
      expect(inMemoryAuditLogs[0].action).toBe('ai.marketing.campaign.create');
      expect(inMemoryAuditLogs[0].tenantId).toBe(TENANT_A);
      expect(inMemoryAuditLogs[0].actorId).toBe(USER_ADMIN_ID);
      expect(inMemoryAuditLogs[0].resourceType).toBe('marketing_campaign');

      expect(inMemoryOutboxEvents.length).toBe(1);
      expect(inMemoryOutboxEvents[0].eventType).toBe('marketing.campaign.created');
      expect(inMemoryOutboxEvents[0].tenantId).toBe(TENANT_A);
    });

    it('falls back to ERP when database service is not configured', async () => {
      const erpOnlyCampaignService = new CampaignService(mockErpService as any);
      mockErpService.call.mockResolvedValueOnce({
        id: 'camp-erp-1',
        campaign_name: 'ERP Fallback Campaign',
        status: 'draft',
      });

      const res = await erpOnlyCampaignService.createMarketingCampaign(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-erp' },
        {
          name: 'ERP Fallback Campaign',
          channel: 'google',
          objective: 'traffic',
          targeting: {},
          creative: {},
          budget: { type: 'daily', amount: 1000, currency: 'INR' },
          schedule: { startDate: '2026-05-01' },
        },
      );

      expect(res.success).toBe(true);
      expect((res.data as any).id).toBe('camp-erp-1');
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          method: ERP_METHODS.CREATE_MARKETING_CAMPAIGN,
        }),
      );
    });
  });

  // =========================================================================
  // 4. Audience Service Segment Operations
  // =========================================================================
  describe('4. Audience Service (getAudienceSegments, createAudienceSegment)', () => {
    it('filters audience segments by minSize and segmentType', async () => {
      const res = await audienceService.getAudienceSegments(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { minSize: 100 },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalSegments).toBe(1);
      expect(data.segments[0].id).toBe(SEGMENT_A2_ID);
    });

    it('creates audience segment and logs transactional audit event', async () => {
      const res = await audienceService.createAudienceSegment(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-seg-1' },
        {
          name: 'Evening Reformer Enthusiasts',
          description: 'Members booking after 17:00 at least 3x/week',
          segmentType: 'rule_based',
          rules: { timeSlot: 'evening', minWeeklyVisits: 3 },
        },
      );

      expect(res.success).toBe(true);
      const segment = res.data as any;
      expect(segment.name).toBe('Evening Reformer Enthusiasts');
      expect(segment.status).toBe('active');

      expect(inMemoryAuditLogs.length).toBe(1);
      expect(inMemoryAuditLogs[0].action).toBe('ai.marketing.audience.create');
      expect(inMemoryOutboxEvents.length).toBe(1);
      expect(inMemoryOutboxEvents[0].eventType).toBe('marketing.audience.created');
    });
  });

  // =========================================================================
  // 5. Content Service Scheduling Operations
  // =========================================================================
  describe('5. Content Service (getContentCalendar, scheduleContent)', () => {
    it('filters content calendar by channel and status within date window', async () => {
      const res = await contentService.getContentCalendar(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { startDate: '2026-03-01', endDate: '2026-03-31', channel: 'email' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.content.length).toBe(1);
      expect(data.content[0].id).toBe(CONTENT_A2_ID);
    });

    it('schedules content and records transactional audit event', async () => {
      const res = await contentService.scheduleContent(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-cnt-1' },
        {
          channel: 'social',
          contentType: 'post',
          title: 'Spring Workshop Announcement',
          body: 'Registration open for April posture clinic.',
          scheduledAt: '2026-04-05T09:00:00Z',
          targetSegments: [SEGMENT_A1_ID],
        },
      );

      expect(res.success).toBe(true);
      const content = res.data as any;
      expect(content.status).toBe('scheduled');
      expect(content.channel).toBe('social');

      expect(inMemoryAuditLogs.length).toBe(1);
      expect(inMemoryAuditLogs[0].action).toBe('ai.marketing.content.schedule');
      expect(inMemoryOutboxEvents.length).toBe(1);
      expect(inMemoryOutboxEvents[0].eventType).toBe('marketing.content.scheduled');
    });
  });

  // =========================================================================
  // 6. Competitor Intelligence Operations
  // =========================================================================
  describe('6. Competitor Intelligence Service', () => {
    it('retrieves active competitors ordered by radius proximity', async () => {
      const res = await competitorIntelligenceService.getCompetitorIntelligence(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { radiusKm: 10 },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalCompetitors).toBe(2);
      // Ordered by distanceKm ascending
      expect(data.competitors[0].id).toBe(COMPETITOR_A1_ID);
      expect(data.competitors[0].distanceKm).toBe(2.4);
      expect(data.competitors[1].id).toBe(COMPETITOR_A2_ID);
      expect(data.competitors[1].distanceKm).toBe(5.8);
    });

    it('filters competitors within narrow radius threshold', async () => {
      const res = await competitorIntelligenceService.getCompetitorIntelligence(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-1' },
        { radiusKm: 3 },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalCompetitors).toBe(1);
      expect(data.competitors[0].id).toBe(COMPETITOR_A1_ID);
    });
  });

  // =========================================================================
  // 7. Review Management & Escalation Operations
  // =========================================================================
  describe('7. Review Management Service (manageReviewResponse)', () => {
    it('responds to a review, updating status to responded with transactional audit logging', async () => {
      const res = await reviewManagementService.manageReviewResponse(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-rev-1' },
        {
          action: 'respond',
          reviewId: REVIEW_A1_ID,
          response: 'Thank you Aarav! We appreciate your kind words.',
        },
      );

      expect(res.success).toBe(true);
      const updated = inMemoryReviews.get(REVIEW_A1_ID);
      expect(updated.status).toBe('responded');
      expect(updated.response).toContain('Thank you Aarav');
      expect(updated.respondedBy).toBe(USER_ADMIN_ID);

      expect(inMemoryAuditLogs.length).toBe(1);
      expect(inMemoryAuditLogs[0].action).toBe('ai.marketing.review.respond');
      expect(inMemoryOutboxEvents.length).toBe(1);
      expect(inMemoryOutboxEvents[0].eventType).toBe('marketing.review.responded');
    });

    it('escalates a negative review and updates status to escalated', async () => {
      const res = await reviewManagementService.manageReviewResponse(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-rev-2' },
        { action: 'escalate', reviewId: REVIEW_A2_ID },
      );

      expect(res.success).toBe(true);
      const updated = inMemoryReviews.get(REVIEW_A2_ID);
      expect(updated.status).toBe('escalated');

      expect(inMemoryAuditLogs.length).toBe(1);
      expect(inMemoryAuditLogs[0].action).toBe('ai.marketing.review.escalate');
      expect(inMemoryOutboxEvents.length).toBe(1);
      expect(inMemoryOutboxEvents[0].eventType).toBe('marketing.review.escalated');
    });

    it('returns validation error when required parameters are missing', async () => {
      const res = await reviewManagementService.manageReviewResponse(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-rev-3' },
        { action: 'respond', reviewId: REVIEW_A1_ID }, // missing response body
      );

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 8. Agent Registry Routing & Two-Phase Action Gating
  // =========================================================================
  describe('8. Agent Registry Routing (executeAgentAction)', () => {
    it('executes read action campaign-performance and returns real tenant data', async () => {
      const result = await agentRegistry.executeAgentAction(
        TENANT_A,
        'TEST',
        'marketing-agent',
        'campaign-performance',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.totalCampaigns).toBe(2);
      expect(data.campaigns.map((c: any) => c.id)).toContain(CAMPAIGN_A1_ID);
    });

    it('executes read action audience-segments and returns real tenant segments', async () => {
      const result = await agentRegistry.executeAgentAction(
        TENANT_A,
        'TEST',
        'marketing-agent',
        'audience-segments',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.totalSegments).toBe(2);
    });

    it('executes read action content-calendar and returns upcoming content', async () => {
      const result = await agentRegistry.executeAgentAction(
        TENANT_A,
        'TEST',
        'marketing-agent',
        'content-calendar',
        { startDate: '2026-03-01', endDate: '2026-03-31' },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.content.length).toBe(2);
    });

    it('executes read action competitor-intelligence and returns local competitors', async () => {
      const result = await agentRegistry.executeAgentAction(
        TENANT_A,
        'TEST',
        'marketing-agent',
        'competitor-intelligence',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.totalCompetitors).toBe(2);
    });

    it('rejects side-effecting write actions with BadRequestException requiring pending action confirmation', async () => {
      const writeActions = [
        'create-campaign',
        'createMarketingCampaign',
        'create-segment',
        'createAudienceSegment',
        'schedule-content',
        'scheduleContent',
        'manage-review',
        'manageReviewResponse',
      ];

      for (const actionId of writeActions) {
        // Since actionId is not in marketing-agent's declared read capabilities,
        // executeAgentAction will reject it either as unsupported capability or write gating
        await expect(
          agentRegistry.executeAgentAction(
            TENANT_A,
            'TEST',
            'marketing-agent',
            actionId,
            {},
            { id: USER_ADMIN_ID, role: 'admin' },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects unsupported actions with BadRequestException', async () => {
      await expect(
        agentRegistry.executeAgentAction(
          TENANT_A,
          'TEST',
          'marketing-agent',
          'non-existent-action',
          {},
          { id: USER_ADMIN_ID, role: 'admin' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 9. Two-Phase Confirmation Gating in Tool Definitions & Registry
  // =========================================================================
  describe('9. Two-Phase Confirmation Tool Definitions', () => {
    it('verifies that all mutating write tools require confirmation', () => {
      expect(CreateMarketingCampaignTool.definition.requiresConfirmation).toBe(true);
      expect(CreateMarketingCampaignTool.definition.risk).toBe('write');

      expect(CreateAudienceSegmentTool.definition.requiresConfirmation).toBe(true);
      expect(CreateAudienceSegmentTool.definition.risk).toBe('write');

      expect(ScheduleContentTool.definition.requiresConfirmation).toBe(true);
      expect(ScheduleContentTool.definition.risk).toBe('write');

      expect(ManageReviewResponseTool.definition.requiresConfirmation).toBe(true);
      expect(ManageReviewResponseTool.definition.risk).toBe('write');
    });

    it('verifies that all informational read tools do not require confirmation', () => {
      expect(GetCampaignPerformanceTool.definition.requiresConfirmation).toBe(false);
      expect(GetCampaignPerformanceTool.definition.risk).toBe('read');

      expect(GetAudienceSegmentsTool.definition.requiresConfirmation).toBe(false);
      expect(GetAudienceSegmentsTool.definition.risk).toBe('read');

      expect(GetContentCalendarTool.definition.requiresConfirmation).toBe(false);
      expect(GetContentCalendarTool.definition.risk).toBe('read');

      expect(GetCompetitorIntelligenceTool.definition.requiresConfirmation).toBe(false);
      expect(GetCompetitorIntelligenceTool.definition.risk).toBe('read');

      expect(GetLeadAttributionTool.definition.requiresConfirmation).toBe(false);
      expect(GetLeadAttributionTool.definition.risk).toBe('read');

      expect(GetBrandHealthMetricsTool.definition.requiresConfirmation).toBe(false);
      expect(GetBrandHealthMetricsTool.definition.risk).toBe('read');
    });

    it('executes tool execution via ToolRegistry cleanly', async () => {
      const tool = toolRegistry.get('getCampaignPerformance');
      expect(tool).toBeDefined();

      const result = await tool!.execute(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-t-1' },
        { channel: 'meta' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).totalCampaigns).toBe(1);
    });
  });

  // =========================================================================
  // 10. RBAC & Scope Rules Enforcement
  // =========================================================================
  describe('10. RBAC & Scope Rules Enforcement', () => {
    it('allows admin role to access read and write marketing tools', () => {
      expect(canUseTool('admin', 'getCampaignPerformance')).toBe(true);
      expect(canUseTool('admin', 'createMarketingCampaign')).toBe(true);
      expect(canUseTool('admin', 'getAudienceSegments')).toBe(true);
      expect(canUseTool('admin', 'createAudienceSegment')).toBe(true);
      expect(canUseTool('admin', 'getContentCalendar')).toBe(true);
      expect(canUseTool('admin', 'scheduleContent')).toBe(true);
      expect(canUseTool('admin', 'manageReviewResponse')).toBe(true);
      expect(canUseTool('admin', 'getCompetitorIntelligence')).toBe(true);
    });

    it('allows front desk role to read marketing data but forbids mutating write tools', () => {
      // Read access permitted
      expect(canUseTool('front_desk', 'getCampaignPerformance')).toBe(true);
      expect(canUseTool('front_desk', 'getAudienceSegments')).toBe(true);
      expect(canUseTool('front_desk', 'getContentCalendar')).toBe(true);
      expect(canUseTool('front_desk', 'getCompetitorIntelligence')).toBe(true);

      // Write access forbidden
      expect(canUseTool('front_desk', 'createMarketingCampaign')).toBe(false);
      expect(canUseTool('front_desk', 'createAudienceSegment')).toBe(false);
      expect(canUseTool('front_desk', 'scheduleContent')).toBe(false);
      expect(canUseTool('front_desk', 'manageReviewResponse')).toBe(false);
    });

    it('forbids trainer and member roles from marketing tools', () => {
      expect(canUseTool('trainer', 'getCampaignPerformance')).toBe(false);
      expect(canUseTool('trainer', 'createMarketingCampaign')).toBe(false);
      expect(canUseTool('member', 'getCampaignPerformance')).toBe(false);
      expect(canUseTool('member', 'createMarketingCampaign')).toBe(false);
    });
  });

  // =========================================================================
  // 11. Transactional Outbox Rollback on Mutation Failure
  // =========================================================================
  describe('11. Transactional Outbox Rollback', () => {
    it('aborts audit log and outbox emission if transaction encounters failure', async () => {
      mockTx.marketingCampaign.create.mockImplementationOnce(async () => {
        throw new Error('Database disk I/O error');
      });

      const initialAuditCount = inMemoryAuditLogs.length;
      const initialOutboxCount = inMemoryOutboxEvents.length;

      const res = await campaignService.createMarketingCampaign(
        { tenantId: TENANT_A, tenantCode: 'TEST', userId: USER_ADMIN_ID, role: 'admin', correlationId: 'corr-err' },
        {
          name: 'Failing Campaign',
          channel: 'meta',
          objective: 'traffic',
          targeting: {},
          creative: {},
          budget: { type: 'daily', amount: 500, currency: 'INR' },
          schedule: { startDate: '2026-06-01' },
        },
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Database disk I/O error');

      // Zero audit or outbox entries should have leaked into persistence
      expect(inMemoryAuditLogs.length).toBe(initialAuditCount);
      expect(inMemoryOutboxEvents.length).toBe(initialOutboxCount);
    });
  });

  // =========================================================================
  // 12. Shared ERP Method Mappings Contract Alignment
  // =========================================================================
  describe('12. Shared ERP Method Mappings Contract Alignment', () => {
    it('aligns with exact hooks.py Python method endpoints', () => {
      expect(ERP_METHODS.CREATE_MARKETING_CAMPAIGN).toBe(
        'wellness_studio.api.marketing.create_marketing_campaign',
      );
      expect(ERP_METHODS.GET_BRAND_HEALTH_METRICS).toBe(
        'wellness_studio.api.marketing.brand_health_metrics',
      );
      expect(ERP_METHODS.MANAGE_REVIEW_RESPONSE).toBe(
        'wellness_studio.api.marketing.manage_review_response',
      );
      expect(ERP_METHODS.GET_CAMPAIGN_PERFORMANCE).toBe(
        'wellness_studio.api.marketing.campaign_performance',
      );
      expect(ERP_METHODS.GET_AUDIENCE_SEGMENTS).toBe(
        'wellness_studio.api.marketing.audience_segments',
      );
      expect(ERP_METHODS.GET_COMPETITOR_INTELLIGENCE).toBe(
        'wellness_studio.api.marketing.competitor_intelligence',
      );
    });
  });
});
