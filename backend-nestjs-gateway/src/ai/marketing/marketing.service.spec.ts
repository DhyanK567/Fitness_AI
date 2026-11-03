import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MarketingAnalyticsService } from './marketing-analytics.service';
import { CampaignService } from './campaign.service';
import { AudienceService } from './audience.service';
import { ContentService } from './content.service';
import { AttributionService } from './attribution.service';
import { BrandService } from './brand.service';
import { ReviewManagementService } from './review-management.service';
import { CompetitorIntelligenceService } from './competitor-intelligence.service';
import type { ErpnextService } from '../../erpnext/erpnext.service';
import type { ToolContext } from '../tools/base-tool';

const mockErpService = {
  call: jest.fn(),
} as any;

const createMockContext = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  tenantId: 'tenant-1',
  userId: 'admin-1',
  role: 'admin',
  correlationId: 'corr-1',
  ...overrides,
});

describe('Marketing Agent - Unit Tests', () => {
  let marketingAnalyticsService: MarketingAnalyticsService;
  let campaignService: CampaignService;
  let audienceService: AudienceService;
  let contentService: ContentService;
  let attributionService: AttributionService;
  let brandService: BrandService;
  let reviewManagementService: ReviewManagementService;
  let competitorIntelligenceService: CompetitorIntelligenceService;

  beforeEach(() => {
    marketingAnalyticsService = new MarketingAnalyticsService(mockErpService);
    campaignService = new CampaignService(mockErpService);
    audienceService = new AudienceService(mockErpService);
    contentService = new ContentService(mockErpService);
    attributionService = new AttributionService(mockErpService);
    brandService = new BrandService(mockErpService);
    reviewManagementService = new ReviewManagementService(mockErpService);
    competitorIntelligenceService = new CompetitorIntelligenceService(mockErpService);

    jest.clearAllMocks();
  });

  describe('MarketingAnalyticsService', () => {
    it('should get campaign performance', async () => {
      const mockResult = {
        campaigns: [
          {
            id: 'camp-1',
            campaign_name: 'Meta Q1 Campaign',
            channel: 'meta',
            objective: 'conversions',
            budget_amount: 50000,
            budget_spent: 35000,
            status: 'active',
            metrics: {
              impressions: 100000,
              clicks: 2500,
              conversions: 150,
              spend: 35000,
              ctr: 2.5,
              cpa: 233.33,
              roas: 4.28,
            },
          },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await marketingAnalyticsService.getCampaignPerformance(
        createMockContext(),
        { channel: 'meta', status: 'active' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).campaigns).toHaveLength(1);
      expect((result.data as any).campaigns[0].metrics.roas).toBe(4.28);
      expect((result.data as any).campaigns[0].metrics.cpa).toBe(233.33);
    });
  });

  describe('CampaignService', () => {
    it('should create marketing campaign', async () => {
      const mockResult = {
        id: 'camp-new',
        campaign_name: 'Summer Sale',
        channel: 'google',
        objective: 'leads',
        status: 'draft',
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await campaignService.createMarketingCampaign(
        createMockContext(),
        {
          name: 'Summer Sale',
          channel: 'google',
          objective: 'leads',
          targeting: { age: '25-45', interests: ['fitness', 'yoga'] },
          creative: { headline: 'Get Fit This Summer', cta: 'Book Free Trial' },
          budget: { type: 'daily', amount: 2000, currency: 'INR' },
          schedule: { startDate: '2024-04-01', endDate: '2024-06-30' },
        },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('camp-new');
    });
  });

  describe('AudienceService', () => {
    it('should get audience segments', async () => {
      const mockResult = {
        segments: [
          {
            id: 'seg-1',
            segment_name: 'High Value Members',
            segment_type: 'rule_based',
            estimated_size: 150,
            status: 'active',
          },
          {
            id: 'seg-2',
            segment_name: 'Lapsed Members',
            segment_type: 'rule_based',
            estimated_size: 80,
            status: 'active',
          },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await audienceService.getAudienceSegments(
        createMockContext(),
        { segmentType: 'rule_based', minSize: 50 },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).segments).toHaveLength(2);
    });

    it('should create audience segment', async () => {
      const mockResult = {
        id: 'seg-new',
        segment_name: 'New Moms',
        segment_type: 'rule_based',
        estimated_size: 0,
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await audienceService.createAudienceSegment(
        createMockContext(),
        {
          name: 'New Moms',
          segmentType: 'rule_based',
          rules: { has_purchased: 'postnatal_class', last_active: '30_days' },
        },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).segment_name).toBe('New Moms');
    });
  });

  describe('ContentService', () => {
    it('should get content calendar', async () => {
      const mockResult = {
        content: [
          {
            id: 'cont-1',
            channel: 'social',
            content_type: 'reel',
            title: 'Morning Yoga Flow',
            scheduled_at: '2024-01-15T08:00:00Z',
            status: 'scheduled',
            target_segments: ['seg-1', 'seg-2'],
          },
          {
            id: 'cont-2',
            channel: 'email',
            content_type: 'newsletter',
            title: 'January Wellness Tips',
            scheduled_at: '2024-01-20T10:00:00Z',
            status: 'draft',
            target_segments: ['seg-1'],
          },
        ],
        period: { start: '2024-01-01', end: '2024-01-31' },
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await contentService.getContentCalendar(
        createMockContext(),
        { startDate: '2024-01-01', endDate: '2024-01-31', channel: 'social' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).content).toHaveLength(2);
    });

    it('should schedule content', async () => {
      const mockResult = {
        id: 'cont-new',
        channel: 'social',
        content_type: 'post',
        scheduled_at: '2024-02-14T12:00:00Z',
        status: 'scheduled',
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await contentService.scheduleContent(
        createMockContext(),
        {
          channel: 'social',
          contentType: 'post',
          title: 'Valentine Special',
          body: 'Treat yourself to wellness this Valentine!',
          scheduledAt: '2024-02-14T12:00:00Z',
          targetSegments: ['seg-1', 'seg-2'],
        },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('cont-new');
    });
  });

  describe('AttributionService', () => {
    it('should get lead attribution', async () => {
      const mockResult = {
        attribution: {
          organic: { leads: 50, converted: 15 },
          referral: { leads: 20, converted: 10 },
          paid_social: { leads: 100, converted: 8 },
          email: { leads: 30, converted: 5 },
        },
        period_days: 30,
        model: 'data_driven',
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await attributionService.getLeadAttribution(
        createMockContext(),
        { periodDays: 30, attributionModel: 'data_driven' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).attribution.organic.leads).toBe(50);
      expect((result.data as any).attribution.referral.converted).toBe(10);
    });
  });

  describe('BrandService', () => {
    it('should get brand health metrics', async () => {
      const mockResult = {
        metrics: {
          nps: 52,
          nps_responses: 200,
          avg_rating: 4.6,
          review_count: 150,
          sentiment_distribution: { positive: 90, neutral: 40, negative: 20 },
          platform_distribution: { google: 80, facebook: 40, instagram: 30 },
          social_mentions: 500,
          social_sentiment: 'positive',
          share_of_voice: 0.35,
        },
        period_days: 90,
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await brandService.getBrandHealthMetrics(
        createMockContext(),
        { periodDays: 90, source: 'all' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).metrics.nps).toBe(52);
      expect((result.data as any).metrics.avg_rating).toBe(4.6);
      expect((result.data as any).metrics.share_of_voice).toBe(0.35);
    });
  });

  describe('ReviewManagementService', () => {
    it('should manage review response - view', async () => {
      const mockResult = {
        reviews: [
          {
            id: 'rev-1',
            platform: 'google',
            external_id: 'google-rev-1',
            author_name: 'Happy Customer',
            rating: 5,
            content: 'Amazing studio!',
            sentiment: 'positive',
            status: 'new',
            fetched_at: '2024-01-15T10:00:00Z',
          },
          {
            id: 'rev-2',
            platform: 'google',
            external_id: 'google-rev-2',
            author_name: 'Unhappy Customer',
            rating: 2,
            content: 'Parking is difficult',
            sentiment: 'negative',
            status: 'flagged',
            fetched_at: '2024-01-14T15:00:00Z',
          },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await reviewManagementService.manageReviewResponse(
        createMockContext(),
        { action: 'view', platform: 'google' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).reviews).toHaveLength(2);
    });

    it('should manage review response - respond', async () => {
      const mockResult = {
        responded: true,
        review: {
          id: 'rev-1',
          response: 'Thank you for your feedback!',
          responded_at: '2024-01-16T10:00:00Z',
          responded_by: 'admin-1',
          status: 'responded',
        },
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await reviewManagementService.manageReviewResponse(
        createMockContext(),
        { action: 'respond', reviewId: 'rev-1', response: 'Thank you for your feedback!' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).responded).toBe(true);
      expect((result.data as any).review.status).toBe('responded');
    });
  });

  describe('CompetitorIntelligenceService', () => {
    it('should get competitor intelligence', async () => {
      const mockResult = {
        competitors: [
          {
            id: 'comp-1',
            competitor_name: 'FitZone Downtown',
            address: '123 Main St',
            latitude: 12.9716,
            longitude: 77.5946,
            distance_km: 2.5,
            class_types: ['Yoga', 'HIIT', 'Pilates'],
            pricing: { drop_in: 500, monthly: 3500 },
            ratings: { google: 4.2, facebook: 4.0 },
            reviews_count: 120,
            is_active: true,
          },
          {
            id: 'comp-2',
            competitor_name: 'Yoga Bliss',
            address: '456 Park Ave',
            latitude: 12.9720,
            longitude: 77.5950,
            distance_km: 1.8,
            class_types: ['Yoga', 'Meditation'],
            pricing: { drop_in: 400, monthly: 3000 },
            ratings: { google: 4.5, facebook: 4.3 },
            reviews_count: 85,
            is_active: true,
          },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await competitorIntelligenceService.getCompetitorIntelligence(
        createMockContext(),
        { radiusKm: 10, includeOnline: true },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).competitors).toHaveLength(2);
      expect((result.data as any).competitors[0].distance_km).toBe(2.5);
    });
  });
});