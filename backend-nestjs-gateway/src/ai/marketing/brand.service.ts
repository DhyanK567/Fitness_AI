import { Injectable, Logger, Optional, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

export interface BrandHealthMetricsArgs {
  periodDays: number;
  source: 'survey' | 'reviews' | 'social' | 'nps' | 'all';
}

export interface BrandHealthMetrics {
  nps: {
    score: number | null;
    promoterPercent: number;
    detractorPercent: number;
    passivePercent: number;
    responseCount: number;
    lastCalculatedAt: string | null;
  };
  reviews: {
    averageRating: number | null;
    totalReviews: number;
    sentimentDistribution: {
      positive: number;
      neutral: number;
      negative: number;
    };
    byPlatform: Record<string, { count: number; averageRating: number }>;
    recentTrend: 'improving' | 'stable' | 'declining' | 'unknown';
  };
  social: {
    mentions: number | null;
    sentiment: 'positive' | 'neutral' | 'negative' | 'unknown';
    engagement: number | null;
    note: string;
  };
  awareness: {
    searchVolume: number | null;
    directTraffic: number | null;
    referralTraffic: number | null;
    note: string;
  };
  overallScore: number | null;
  periodDays: number;
  calculatedAt: string;
  dataSources: string[];
  dataLimitations: string[];
}

@Injectable()
export class BrandService {
  private readonly logger = new Logger(BrandService.name);

  constructor(
    @Optional() private readonly prismaService?: PrismaService,
    @Optional() private readonly erpService?: any,
  ) {}

  /**
   * Get brand health metrics
   * PostgreSQL-first implementation with ERPNext fallback
   */
  async getBrandHealthMetrics(
    context: ToolContext,
    args: { periodDays: number; source: 'survey' | 'reviews' | 'social' | 'nps' | 'all' },
  ): Promise<any> {
    const periodDays = args.periodDays !== undefined ? Math.max(1, Math.min(365, Number(args.periodDays))) : 90;
    const source = args.source || 'all';

    // Try PostgreSQL first
    if (this.prismaService) {
      try {
        return await this.getBrandHealthMetricsFromPostgres(context, { periodDays, source });
      } catch (dbError) {
        this.logger.warn(`PostgreSQL query failed for brand health, falling back to ERP: ${(dbError as Error)?.message}`);
      }
    }

    // Fallback to ERPNext
    if (this.erpService) {
      try {
        const erpResult = await this.getBrandHealthFromErp(context, { periodDays, source });
        return erpResult;
      } catch (erpError) {
        this.logger.error(`ERPNext brand health failed:`, erpError);
        return { success: false, error: 'Brand health metrics unavailable' };
      }
    }

    return { success: false, error: 'No persistence provider available for brand health metrics' };
  }

  private async getBrandHealthMetricsFromPostgres(
    context: any,
    args: { periodDays: number; source: string },
  ): Promise<any> {
    const periodDays = args.periodDays;
    const source = args.source;

    const metrics: any = {
      periodDays,
      calculatedAt: new Date().toISOString(),
      dataSources: [],
      dataLimitations: [],
    };

    let hasData = false;
    let hadConnectionError = false;

    // Get tenant branding info
    let branding: any = null;
    try {
      const brandingRecord = await this.prismaService!.tenantBranding.findUnique({
        where: { tenantId: context.tenantId },
      });
      if (brandingRecord) {
        metrics.branding = {
          displayName: brandingRecord.displayName,
          logoUrl: brandingRecord.logoUrl,
          primaryColor: brandingRecord.primaryColor,
          secondaryColor: brandingRecord.secondaryColor,
        };
        metrics.dataSources.push('tenant_branding');
        hasData = true;
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch tenant branding: ${e}`);
      hadConnectionError = true;
    }

    // 1. NPS from reviews (using review ratings as proxy)
    if (['nps', 'reviews', 'all'].includes(args.source)) {
      try {
        const reviews = await this.prismaService!.review.findMany({
          where: {
            tenantId: context.tenantId,
            createdAt: { gte: new Date(Date.now() - args.periodDays * 86400000) },
          },
          select: {
            rating: true,
            sentiment: true,
            platform: true,
            createdAt: true,
          },
        });

        if (reviews.length > 0) {
          const ratings = reviews.map(r => r.rating).filter(r => r != null);
          const avgRating = ratings.length > 0
            ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
            : 0;

          // Calculate NPS from ratings (assuming 1-5 scale: 4-5 = promoter, 3 = passive, 1-2 = detractor)
          const promoters = ratings.filter(r => r >= 4).length;
          const detractors = ratings.filter(r => r <= 2).length;
          const passives = ratings.filter(r => r === 3).length;
          const total = ratings.length;
          const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;

          metrics.nps = {
            score: npsScore,
            promoterPercent: total > 0 ? Number(((promoters / total) * 100).toFixed(1)) : 0,
            detractorPercent: total > 0 ? Number(((detractors / total) * 100).toFixed(1)) : 0,
            passivePercent: total > 0 ? Number(((passives / total) * 100).toFixed(1)) : 0,
            responseCount: total,
            lastCalculatedAt: new Date().toISOString(),
          };

          // Sentiment distribution from reviews
          const sentimentDistribution = { positive: 0, neutral: 0, negative: 0 };
          reviews.forEach(r => {
            if (r.sentiment === 'positive') sentimentDistribution.positive++;
            else if (r.sentiment === 'negative') sentimentDistribution.negative++;
            else sentimentDistribution.neutral++;
          });

          // By platform
          const byPlatform: Record<string, { count: number; averageRating: number }> = {};
          const platformStats: Record<string, { count: number; sum: number }> = {};
          reviews.forEach(r => {
            const platform = r.platform || 'unknown';
            if (!platformStats[platform]) {
              platformStats[platform] = { count: 0, sum: 0 };
            }
            platformStats[platform].count++;
            platformStats[platform].sum += (r.rating || 0);
          });
          Object.entries(platformStats).forEach(([platform, stats]) => {
            byPlatform[platform] = {
              count: stats.count,
              averageRating: stats.count > 0 ? Number((stats.sum / stats.count).toFixed(2)) : 0,
            };
          });

          metrics.reviews = {
            averageRating: avgRating > 0 ? Number(avgRating.toFixed(2)) : null,
            totalReviews: reviews.length,
            sentimentDistribution,
            byPlatform,
            recentTrend: 'stable', // Would need historical comparison
          };
          metrics.dataSources.push('reviews');
          hasData = true;
        } else {
          metrics.reviews = {
            averageRating: null,
            totalReviews: 0,
            sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
            byPlatform: {},
            recentTrend: 'unknown',
          };
          metrics.dataSources.push('reviews');
          metrics.dataLimitations = [...(metrics.dataLimitations || []), 'No reviews found for period'];
        }
      } catch (e) {
        this.logger.warn(`Failed to fetch reviews for brand health: ${e}`);
        hadConnectionError = true;
        metrics.dataLimitations = [...(metrics.dataLimitations || []), 'Reviews query failed'];
      }
    }

    // Social metrics (placeholder - would need social media integration)
    if (['social', 'all'].includes(args.source)) {
      metrics.social = {
        mentions: null,
        sentiment: 'unknown',
        engagement: null,
        note: 'Social media integration not yet implemented. Requires social media API integration.',
      };
      metrics.dataLimitations = [...(metrics.dataLimitations || []), 'Social media data not available'];
    }

    // Awareness metrics (placeholder)
    if (['all'].includes(args.source)) {
      metrics.awareness = {
        searchVolume: null,
        directTraffic: null,
        referralTraffic: null,
        note: 'Web analytics integration required for search volume and traffic metrics',
      };
      metrics.dataLimitations = [...(metrics.dataLimitations || []), 'Web analytics integration required'];
    }

    // Calculate overall score
    let overallScore: number | null = null;
    const scores: number[] = [];
    if (metrics.nps?.score !== null && metrics.nps?.score !== undefined) {
      // Normalize NPS from -100..100 to 0..100
      scores.push((metrics.nps.score + 100) / 2);
    }
    if (metrics.reviews?.averageRating) {
      // Normalize 1-5 rating to 0-100
      scores.push(((metrics.reviews.averageRating - 1) / 4) * 100);
    }
    if (scores.length > 0) {
      metrics.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    } else {
      metrics.overallScore = null;
    }

    metrics.periodDays = args.periodDays;
    metrics.calculatedAt = new Date().toISOString();
    metrics.dataSources = metrics.dataSources || [];
    metrics.dataLimitations = metrics.dataLimitations || [];

    // If there was a connection error, throw to trigger ERPNext fallback
    if (hadConnectionError) {
      throw new Error('PostgreSQL connection error');
    }

    // If no actual database data was retrieved, throw to trigger ERPNext fallback
    // Exception 1: user explicitly requests only social (source='social')
    // Exception 2: user requests 'all' - return placeholders if database empty (don't force ERPNext for placeholders)
    const hasDatabaseData = metrics.dataSources.length > 0;
    const explicitlyRequestedOnlyPlaceholders = args.source === 'social';
    const allSourceWithNoData = args.source === 'all' && metrics.dataSources.length === 0;
    
    if (!hasDatabaseData && !explicitlyRequestedOnlyPlaceholders && !allSourceWithNoData) {
      throw new Error('No brand health data available in PostgreSQL');
    }

    return {
      success: true,
      data: metrics,
    };
  }

  /**
   * Fallback to ERPNext
   */
  private async getBrandHealthFromErp(context: any, args: any) {
    if (!this.erpService) {
      return { success: false, error: 'ERPNext service unavailable' };
    }
    try {
      const result = await this.erpService.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.marketing.brand_health',
        body: args,
      });
      return { success: true, data: result, source: 'erpnext' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'ERPNext brand health failed';
      this.logger.error(`ERPNext brand health failed:`, error);
      return { success: false, error: errorMessage };
    }
  }
}