import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { ReferralService } from './referral.service';
import { UpsellService } from './upsell.service';
import { ExpansionService } from './expansion.service';
import { ExperimentService } from './experiment.service';
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

describe('Growth Agent - Unit Tests', () => {
  let growthAnalyticsService: GrowthAnalyticsService;
  let referralService: ReferralService;
  let upsellService: UpsellService;
  let expansionService: ExpansionService;
  let experimentService: ExperimentService;

  beforeEach(() => {
    growthAnalyticsService = new GrowthAnalyticsService(mockErpService);
    referralService = new ReferralService(mockErpService);
    upsellService = new UpsellService(mockErpService);
    expansionService = new ExpansionService(mockErpService);
    experimentService = new ExperimentService(mockErpService);

    jest.clearAllMocks();
  });

  describe('GrowthAnalyticsService', () => {
    it('should get acquisition metrics', async () => {
      const mockResult = {
        period_days: 30,
        total_leads: 100,
        converted_leads: 25,
        conversion_rate: 25.0,
        cac: 500,
        by_channel: [
          { channel: 'organic', leads: 40, converted: 15 },
          { channel: 'referral', leads: 20, converted: 8 },
          { channel: 'paid_social', leads: 40, converted: 2 },
        ],
        by_status: [
          { status: 'New', count: 30 },
          { status: 'Contacted', count: 25 },
          { status: 'Converted', count: 25 },
          { status: 'Lost', count: 20 },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await growthAnalyticsService.getAcquisitionMetrics(
        createMockContext(),
        { periodDays: 30, channel: 'organic', branchId: 'branch-1' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).total_leads).toBe(100);
      expect((result.data as any).conversion_rate).toBe(25.0);
      expect((result.data as any).by_channel).toHaveLength(3);
    });

    it('should get lifetime value metrics', async () => {
      const mockResult = {
        cohorts: [
          { cohort: '2024-01', members: 50, avg_ltv: 15000, total_revenue: 750000 },
          { cohort: '2024-02', members: 60, avg_ltv: 14000, total_revenue: 840000 },
          { cohort: '2024-03', members: 55, avg_ltv: 16000, total_revenue: 880000 },
        ],
        period_months: 12,
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await growthAnalyticsService.getLifetimeValueMetrics(
        createMockContext(),
        { cohortBy: 'month', periodMonths: 12 },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).cohorts).toHaveLength(3);
      expect((result.data as any).cohorts[0].avg_ltv).toBe(15000);
    });
  });

  describe('ReferralService', () => {
    it('should get referral program metrics', async () => {
      const mockResult = {
        period_days: 30,
        total_referrals: 50,
        converted: 30,
        pending: 15,
        expired: 5,
        viral_coefficient: 0.6,
        referrals: [
          {
            id: 'ref-1',
            campaign_id: 'camp-1',
            referrer_member_id: 'm-1',
            referee_member_id: 'm-2',
            status: 'converted',
            referred_at: '2024-01-15T10:00:00Z',
            converted_at: '2024-01-20T10:00:00Z',
            referrer_reward_paid: true,
            referee_reward_paid: true,
          },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await referralService.getReferralProgramMetrics(
        createMockContext(),
        { periodDays: 30, status: 'converted' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).total_referrals).toBe(50);
      expect((result.data as any).viral_coefficient).toBe(0.6);
    });

    it('should create referral campaign', async () => {
      const mockResult = {
        id: 'camp-new',
        campaign_name: 'Spring Referral',
        status: 'active',
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await referralService.createReferralCampaign(
        createMockContext(),
        {
          name: 'Spring Referral',
          description: 'Spring referral campaign',
          referrerIncentive: { type: 'credit', value: 500, description: '₹500 credit' },
          refereeIncentive: { type: 'discount', value: 20, description: '20% off first month' },
          validFrom: '2024-03-01',
          validUntil: '2024-05-31',
          maxReferralsPerMember: 5,
        },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('camp-new');
    });
  });

  describe('UpsellService', () => {
    it('should get upsell opportunities', async () => {
      const mockResult = {
        opportunities: [
          {
            member_id: 'm-1',
            member_name: 'John Doe',
            score: 90,
            opportunity_types: ['plan_upgrade', 'personal_training'],
            membership_status: 'Active',
            recommended_action: 'outreach',
          },
          {
            member_id: 'm-2',
            member_name: 'Jane Smith',
            score: 75,
            opportunity_types: ['nutrition', 'addon'],
            membership_status: 'Active',
            recommended_action: 'nurture',
          },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await upsellService.getUpsellOpportunities(
        createMockContext(),
        { minScore: 70, limit: 50 },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).opportunities).toHaveLength(2);
      expect((result.data as any).opportunities[0].score).toBe(90);
    });

    it('should create upsell offer', async () => {
      const mockResult = {
        id: 'offer-new',
        member_id: 'm-1',
        offer_type: 'plan_upgrade',
        status: 'active',
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await upsellService.createUpsellOffer(
        createMockContext(),
        {
          memberId: 'm-1',
          offerType: 'plan_upgrade',
          offerDetails: { fromPlan: 'basic', toPlan: 'premium', savings: 2000 },
          discountPercent: 15,
          validUntil: '2024-03-31T23:59:59Z',
          triggerEvent: 'plan_expiry',
        },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('offer-new');
    });
  });

  describe('ExpansionService', () => {
    it('should get expansion opportunities', async () => {
      const mockResult = {
        opportunities: [
          {
            type: 'new_location',
            near_branch: 'Downtown Studio',
            lat: 12.9716,
            lon: 77.5946,
            radius_km: 10,
            reason: 'Underserved area within 10km of Downtown Studio',
            estimated_potential: 'high',
          },
          {
            type: 'corporate_partnership',
            target: 'Local businesses with 100+ employees',
            reason: 'Corporate wellness programs',
            estimated_potential: 'medium',
          },
        ],
        analysis_type: 'geographic',
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await expansionService.getExpansionOpportunities(
        createMockContext(),
        { analysisType: 'geographic', radiusKm: 10, minPopulation: 50000 },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).opportunities).toHaveLength(2);
      expect((result.data as any).opportunities[0].type).toBe('new_location');
    });
  });

  describe('ExperimentService', () => {
    it('should track growth experiment', async () => {
      const mockResult = {
        experiments: [
          {
            id: 'exp-1',
            experiment_name: 'Pricing Test',
            hypothesis: 'Lower price increases conversion',
            variant_control: { price: 1000 },
            variant_treatment: { price: 800 },
            target_metric: 'conversion_rate',
            minimum_detectable_effect: 0.1,
            traffic_allocation: 50,
            status: 'running',
            start_date: '2024-01-01T00:00:00Z',
            control_count: 100,
            treatment_count: 100,
            control_conversions: 20,
            treatment_conversions: 28,
            lift: 40,
          },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await experimentService.trackGrowthExperiment(
        createMockContext(),
        { experimentId: 'exp-1', status: 'running' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).experiments).toHaveLength(1);
      expect((result.data as any).experiments[0].lift).toBe(40);
    });

    it('should create growth experiment', async () => {
      const mockResult = {
        id: 'exp-new',
        experiment_name: 'New Pricing Test',
        status: 'draft',
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await experimentService.createGrowthExperiment(
        createMockContext(),
        {
          name: 'New Pricing Test',
          hypothesis: 'Bundle offer increases AOV',
          variantControl: { price: 1000, bundle: false },
          variantTreatment: { price: 1000, bundle: true, includes: ['nutrition', 'workshop'] },
          targetMetric: 'revenue_per_member',
          minimumDetectableEffect: 0.05,
          trafficAllocation: 50,
          startDate: '2024-02-01',
          endDate: '2024-03-31',
        },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('exp-new');
    });
  });
});