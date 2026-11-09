import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BrandService } from './brand.service';
import type { ErpnextService } from '../../erpnext/erpnext.service';
import type { ToolContext } from '../tools/base-tool';

const mockErpService = {
  call: jest.fn(),
} as any;

const mockPrismaService = {
  withTenant: jest.fn(),
  tenantBranding: {
    findUnique: jest.fn(),
  },
  review: {
    findMany: jest.fn(),
  },
} as any;

const createMockContext = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  tenantId: 'tenant-1',
  tenantCode: 'TEST',
  userId: 'admin-1',
  role: 'admin',
  correlationId: 'corr-1',
  ...overrides,
});

describe('BrandService', () => {
  let brandService: BrandService;

  beforeEach(() => {
    brandService = new BrandService(mockPrismaService, mockErpService);
    jest.clearAllMocks();
  });

  describe('PostgreSQL path', () => {
    it('should return brand health metrics from reviews', async () => {
      const mockReviews = [
        { rating: 5, sentiment: 'positive', platform: 'google', createdAt: new Date() },
        { rating: 4, sentiment: 'positive', platform: 'google', createdAt: new Date() },
        { rating: 3, sentiment: 'neutral', platform: 'facebook', createdAt: new Date() },
        { rating: 2, sentiment: 'negative', platform: 'facebook', createdAt: new Date() },
        { rating: 1, sentiment: 'negative', platform: 'google', createdAt: new Date() },
      ];

      mockPrismaService.review.findMany.mockResolvedValue(mockReviews);
      mockPrismaService.tenantBranding.findUnique.mockResolvedValue({
        displayName: 'Test Studio',
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#E11D48',
        secondaryColor: '#FCFAF5',
      });

      const result = await brandService.getBrandHealthMetrics(
        createMockContext(),
        { periodDays: 90, source: 'all' },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.periodDays).toBe(90);
      expect(result.data.dataSources).toContain('tenant_branding');
      expect(result.data.dataSources).toContain('reviews');
      expect(result.data.nps).toBeDefined();
      expect(result.data.reviews).toBeDefined();
      expect(result.data.reviews.totalReviews).toBe(5);
      expect(result.data.reviews.sentimentDistribution.positive).toBe(2);
      expect(result.data.reviews.sentimentDistribution.neutral).toBe(1);
      expect(result.data.reviews.sentimentDistribution.negative).toBe(2);
      expect(result.data.reviews.byPlatform.google.count).toBe(3);
      expect(result.data.reviews.byPlatform.facebook.count).toBe(2);
      expect(result.data.overallScore).toBeGreaterThan(0);
    });

    it('should handle empty reviews gracefully', async () => {
      mockPrismaService.review.findMany.mockResolvedValue([]);
      mockPrismaService.tenantBranding.findUnique.mockResolvedValue(null);

      const result = await brandService.getBrandHealthMetrics(
        createMockContext(),
        { periodDays: 30, source: 'reviews' },
      );

      expect(result.success).toBe(true);
      expect(result.data.reviews.totalReviews).toBe(0);
      expect(result.data.reviews.averageRating).toBeNull();
      expect(result.data.dataLimitations).toContain('No reviews found for period');
    });

    it('should include social and awareness limitations when source is all', async () => {
      mockPrismaService.review.findMany.mockResolvedValue([]);
      mockPrismaService.tenantBranding.findUnique.mockResolvedValue(null);

      const result = await brandService.getBrandHealthMetrics(
        createMockContext(),
        { periodDays: 90, source: 'all' },
      );

      expect(result.success).toBe(true);
      expect(result.data.social.sentiment).toBe('unknown');
      expect(result.data.social.note).toContain('not yet implemented');
      expect(result.data.awareness.note).toContain('Web analytics integration required');
    });

    it('should calculate NPS correctly from ratings', async () => {
      // 5 promoters (5,5,4,4,4), 2 passives (3,3), 3 detractors (2,1,1) = 10 total
      // NPS = (5-3)/10 * 100 = 20
      const mockReviews = [
        { rating: 5, sentiment: 'positive', platform: 'google', createdAt: new Date() },
        { rating: 5, sentiment: 'positive', platform: 'google', createdAt: new Date() },
        { rating: 4, sentiment: 'positive', platform: 'google', createdAt: new Date() },
        { rating: 4, sentiment: 'positive', platform: 'google', createdAt: new Date() },
        { rating: 4, sentiment: 'positive', platform: 'google', createdAt: new Date() },
        { rating: 3, sentiment: 'neutral', platform: 'google', createdAt: new Date() },
        { rating: 3, sentiment: 'neutral', platform: 'google', createdAt: new Date() },
        { rating: 2, sentiment: 'negative', platform: 'google', createdAt: new Date() },
        { rating: 1, sentiment: 'negative', platform: 'google', createdAt: new Date() },
        { rating: 1, sentiment: 'negative', platform: 'google', createdAt: new Date() },
      ];

      mockPrismaService.review.findMany.mockResolvedValue(mockReviews);
      mockPrismaService.tenantBranding.findUnique.mockResolvedValue(null);

      const result = await brandService.getBrandHealthMetrics(
        createMockContext(),
        { periodDays: 90, source: 'nps' },
      );

      expect(result.success).toBe(true);
      expect(result.data.nps.score).toBe(20);
      expect(result.data.nps.promoterPercent).toBe(50);
      expect(result.data.nps.detractorPercent).toBe(30);
      expect(result.data.nps.passivePercent).toBe(20);
      expect(result.data.nps.responseCount).toBe(10);
    });
  });

  describe('ERPNext fallback', () => {
    it('should fall back to ERPNext when PostgreSQL fails', async () => {
      mockPrismaService.review.findMany.mockRejectedValue(new Error('DB connection failed'));
      mockPrismaService.tenantBranding.findUnique.mockRejectedValue(new Error('DB connection failed'));
      mockErpService.call.mockResolvedValue({
        metrics: { nps: 40, avg_rating: 4.2 },
        period_days: 90,
      });

      const result = await brandService.getBrandHealthMetrics(
        createMockContext(),
        { periodDays: 90, source: 'all' },
      );

      expect(result.success).toBe(true);
      expect(result.source).toBe('erpnext');
      expect(result.data.metrics.nps).toBe(40);
    });

    it('should return error when both PostgreSQL and ERPNext fail', async () => {
      mockPrismaService.review.findMany.mockRejectedValue(new Error('DB connection failed'));
      mockPrismaService.tenantBranding.findUnique.mockRejectedValue(new Error('DB connection failed'));
      mockErpService.call.mockRejectedValue(new Error('ERPNext unavailable'));

      const result = await brandService.getBrandHealthMetrics(
        createMockContext(),
        { periodDays: 90, source: 'all' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('ERPNext unavailable');
    });
  });

  describe('Tenant isolation', () => {
    it('should only query reviews for the given tenant', async () => {
      mockPrismaService.review.findMany.mockResolvedValue([]);
      mockPrismaService.tenantBranding.findUnique.mockResolvedValue(null);

      await brandService.getBrandHealthMetrics(
        createMockContext({ tenantId: 'tenant-A' }),
        { periodDays: 90, source: 'reviews' },
      );

      expect(mockPrismaService.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-A' }),
        }),
      );
    });
  });
});