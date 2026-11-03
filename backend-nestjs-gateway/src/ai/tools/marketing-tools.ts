import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MarketingAnalyticsService } from '../marketing/marketing-analytics.service';
import { CampaignService } from '../marketing/campaign.service';
import { AudienceService } from '../marketing/audience.service';
import { ContentService } from '../marketing/content.service';
import { AttributionService } from '../marketing/attribution.service';
import { BrandService } from '../marketing/brand.service';
import { ReviewManagementService } from '../marketing/review-management.service';
import { CompetitorIntelligenceService } from '../marketing/competitor-intelligence.service';
import { BaseTool, ToolContext, ToolResult, AiTool } from './base-tool';
import { ToolDefinition } from '@wsos/ai-tool-definitions';

// ============================================
// Marketing/Advertising Agent Tools (T-62 to T-71)
// ============================================

@Injectable()
export class GetCampaignPerformanceTool extends BaseTool implements AiTool {
  constructor(private readonly marketingAnalyticsService: MarketingAnalyticsService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      campaignId: z.string().uuid().optional(),
      channel: z.enum(['meta', 'google', 'tiktok', 'email', 'sms', 'whatsapp', 'push', 'referral', 'organic']).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(['draft', 'active', 'paused', 'completed', 'archived']).optional(),
    }).parse(args);

    return this.marketingAnalyticsService.getCampaignPerformance(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-62',
    name: 'getCampaignPerformance',
    purpose: 'Get marketing campaign performance - impressions, clicks, conversions, ROAS, CPA.',
    assistant: 'marketing',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'marketing.read',
    featureFlag: 'ai.marketing',
    owningService: 'MarketingAnalyticsService',
    phase: 'P2',
    args: z.object({
      campaignId: z.string().uuid().optional(),
      channel: z.enum(['meta', 'google', 'tiktok', 'email', 'sms', 'whatsapp', 'push', 'referral', 'organic']).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(['draft', 'active', 'paused', 'completed', 'archived']).optional(),
    }).strict(),
  };
}

@Injectable()
export class CreateMarketingCampaignTool extends BaseTool implements AiTool {
  constructor(private readonly campaignService: CampaignService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      channel: z.enum(['meta', 'google', 'tiktok', 'email', 'sms', 'whatsapp', 'push']),
      objective: z.enum(['awareness', 'traffic', 'leads', 'conversions', 'engagement', 'retention']),
      targeting: z.record(z.string(), z.any()),
      creative: z.record(z.string(), z.any()),
      budget: z.object({
        type: z.enum(['daily', 'lifetime']),
        amount: z.number().min(0),
        currency: z.string().length(3).default('INR'),
      }),
      schedule: z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dayparting: z.array(z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(0).max(23),
        })).optional(),
      }),
      landingPageUrl: z.string().url().optional(),
      utmParams: z.record(z.string(), z.string()).optional(),
    }).parse(args) as {
      name: string;
      description?: string;
      channel: string;
      objective: string;
      targeting: Record<string, unknown>;
      creative: Record<string, unknown>;
      budget: { type: string; amount: number; currency: string };
      schedule: { startDate: string; endDate?: string; dayparting?: Array<{ dayOfWeek: number; startHour: number; endHour: number }> };
      landingPageUrl?: string;
      utmParams?: Record<string, string>;
    };

    return this.campaignService.createMarketingCampaign(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-63',
    name: 'createMarketingCampaign',
    purpose: 'Create a marketing campaign across channels with targeting, creative, and budget.',
    assistant: 'marketing',
    risk: 'write',
    requiresConfirmation: true,
    principals: ['staff'],
    requiredPermission: 'marketing.write',
    featureFlag: 'ai.marketing',
    owningService: 'CampaignService',
    phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      channel: z.enum(['meta', 'google', 'tiktok', 'email', 'sms', 'whatsapp', 'push']),
      objective: z.enum(['awareness', 'traffic', 'leads', 'conversions', 'engagement', 'retention']),
      targeting: z.record(z.string(), z.any()),
      creative: z.record(z.string(), z.any()),
      budget: z.object({
        type: z.enum(['daily', 'lifetime']),
        amount: z.number().min(0),
        currency: z.string().length(3).default('INR'),
      }),
      schedule: z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dayparting: z.array(z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(0).max(23),
        })).optional(),
      }),
      landingPageUrl: z.string().url().optional(),
      utmParams: z.record(z.string(), z.string()).optional(),
    }).strict(),
  };
}

@Injectable()
export class GetAudienceSegmentsTool extends BaseTool implements AiTool {
  constructor(private readonly audienceService: AudienceService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      segmentType: z.enum(['demographic', 'behavioral', 'lifecycle', 'custom', 'lookalike']).optional(),
      minSize: z.number().int().min(1).default(10),
    }).parse(args);

    return this.audienceService.getAudienceSegments(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-64',
    name: 'getAudienceSegments',
    purpose: 'Get audience segments for targeting - demographics, behavior, engagement, lifecycle stage.',
    assistant: 'marketing',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'marketing.read',
    featureFlag: 'ai.marketing',
    owningService: 'AudienceService',
    phase: 'P2',
    args: z.object({
      segmentType: z.enum(['demographic', 'behavioral', 'lifecycle', 'custom', 'lookalike']).optional(),
      minSize: z.number().int().min(1).default(10),
    }).strict(),
  };
}

@Injectable()
export class CreateAudienceSegmentTool extends BaseTool implements AiTool {
  constructor(private readonly audienceService: AudienceService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(500).optional(),
      segmentType: z.enum(['rule_based', 'lookalike', 'ml_predicted']),
      rules: z.record(z.string(), z.any()).optional(),
      sourceSegmentId: z.string().uuid().optional(),
      lookalikeConfig: z.object({
        sourceCountry: z.string().length(2).optional(),
        similarityPercent: z.number().int().min(1).max(10).default(1),
      }).optional(),
    }).parse(args);

    return this.audienceService.createAudienceSegment(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-65',
    name: 'createAudienceSegment',
    purpose: 'Create a custom audience segment based on rules or ML-based lookalike.',
    assistant: 'marketing',
    risk: 'write',
    requiresConfirmation: true,
    principals: ['staff'],
    requiredPermission: 'marketing.write',
    featureFlag: 'ai.marketing',
    owningService: 'AudienceService',
    phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(500).optional(),
      segmentType: z.enum(['rule_based', 'lookalike', 'ml_predicted']),
      rules: z.record(z.string(), z.any()).optional(),
      sourceSegmentId: z.string().uuid().optional(),
      lookalikeConfig: z.object({
        sourceCountry: z.string().length(2).optional(),
        similarityPercent: z.number().int().min(1).max(10).default(1),
      }).optional(),
    }).strict(),
  };
}

@Injectable()
export class GetContentCalendarTool extends BaseTool implements AiTool {
  constructor(private readonly contentService: ContentService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      channel: z.enum(['social', 'email', 'blog', 'push', 'sms', 'whatsapp', 'in_app']).optional(),
      status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
    }).parse(args);

    return this.contentService.getContentCalendar(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-66',
    name: 'getContentCalendar',
    purpose: 'Get marketing content calendar - posts, emails, campaigns scheduled.',
    assistant: 'marketing',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'marketing.read',
    featureFlag: 'ai.marketing',
    owningService: 'ContentService',
    phase: 'P2',
    args: z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      channel: z.enum(['social', 'email', 'blog', 'push', 'sms', 'whatsapp', 'in_app']).optional(),
      status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
    }).strict(),
  };
}

@Injectable()
export class ScheduleContentTool extends BaseTool implements AiTool {
  constructor(private readonly contentService: ContentService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      channel: z.enum(['social', 'email', 'blog', 'push', 'sms', 'whatsapp', 'in_app']),
      contentType: z.enum(['post', 'story', 'reel', 'email', 'newsletter', 'push', 'sms', 'whatsapp', 'in_app_banner']),
      title: z.string().min(1).max(200).optional(),
      body: z.string().min(1).max(10000),
      mediaUrls: z.array(z.string().url()).max(10).optional(),
      scheduledAt: z.string().datetime(),
      targetSegments: z.array(z.string().uuid()).min(1),
      utmParams: z.record(z.string(), z.string()).optional(),
      abTestVariant: z.string().optional(),
    }).parse(args) as {
      channel: string;
      contentType: string;
      title?: string;
      body: string;
      mediaUrls?: string[];
      scheduledAt: string;
      targetSegments: string[];
      utmParams?: Record<string, string>;
      abTestVariant?: string;
    };

    return this.contentService.scheduleContent(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-67',
    name: 'scheduleContent',
    purpose: 'Schedule marketing content - social posts, emails, push notifications, in-app messages.',
    assistant: 'marketing',
    risk: 'write',
    requiresConfirmation: true,
    principals: ['staff'],
    requiredPermission: 'marketing.write',
    featureFlag: 'ai.marketing',
    owningService: 'ContentService',
    phase: 'P2',
    args: z.object({
      channel: z.enum(['social', 'email', 'blog', 'push', 'sms', 'whatsapp', 'in_app']),
      contentType: z.enum(['post', 'story', 'reel', 'email', 'newsletter', 'push', 'sms', 'whatsapp', 'in_app_banner']),
      title: z.string().min(1).max(200).optional(),
      body: z.string().min(1).max(10000),
      mediaUrls: z.array(z.string().url()).max(10).optional(),
      scheduledAt: z.string().datetime(),
      targetSegments: z.array(z.string().uuid()).min(1),
      utmParams: z.record(z.string(), z.string()).optional(),
      abTestVariant: z.string().optional(),
    }).strict(),
  };
}

@Injectable()
export class GetLeadAttributionTool extends BaseTool implements AiTool {
  constructor(private readonly attributionService: AttributionService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      leadId: z.string().uuid().optional(),
      periodDays: z.number().int().min(1).max(365).default(30),
      attributionModel: z.enum(['first_touch', 'last_touch', 'linear', 'time_decay', 'position_based', 'data_driven']).default('data_driven'),
    }).parse(args);

    return this.attributionService.getLeadAttribution(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-68',
    name: 'getLeadAttribution',
    purpose: 'Get lead attribution - which channels, campaigns, touchpoints drove leads and conversions.',
    assistant: 'marketing',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'marketing.read',
    featureFlag: 'ai.marketing',
    owningService: 'AttributionService',
    phase: 'P2',
    args: z.object({
      leadId: z.string().uuid().optional(),
      periodDays: z.number().int().min(1).max(365).default(30),
      attributionModel: z.enum(['first_touch', 'last_touch', 'linear', 'time_decay', 'position_based', 'data_driven']).default('data_driven'),
    }).strict(),
  };
}

@Injectable()
export class GetBrandHealthMetricsTool extends BaseTool implements AiTool {
  constructor(private readonly brandService: BrandService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      periodDays: z.number().int().min(1).max(365).default(90),
      source: z.enum(['survey', 'reviews', 'social', 'nps', 'all']).default('all'),
    }).parse(args);

    return this.brandService.getBrandHealthMetrics(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-69',
    name: 'getBrandHealthMetrics',
    purpose: 'Get brand health metrics - NPS, brand awareness, sentiment, share of voice, review ratings.',
    assistant: 'marketing',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'marketing.read',
    featureFlag: 'ai.marketing',
    owningService: 'BrandService',
    phase: 'P2',
    args: z.object({
      periodDays: z.number().int().min(1).max(365).default(90),
      source: z.enum(['survey', 'reviews', 'social', 'nps', 'all']).default('all'),
    }).strict(),
  };
}

@Injectable()
export class ManageReviewResponseTool extends BaseTool implements AiTool {
  constructor(private readonly reviewManagementService: ReviewManagementService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      action: z.enum(['view', 'respond', 'flag', 'escalate', 'report']),
      reviewId: z.string().uuid().optional(),
      platform: z.enum(['google', 'facebook', 'yelp', 'instagram', 'internal']).optional(),
      response: z.string().max(2000).optional(),
    }).parse(args);

    return this.reviewManagementService.manageReviewResponse(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-70',
    name: 'manageReviewResponse',
    purpose: 'Manage review responses - view, respond, flag, or escalate reviews across platforms.',
    assistant: 'marketing',
    risk: 'write',
    requiresConfirmation: true,
    principals: ['staff'],
    requiredPermission: 'marketing.write',
    featureFlag: 'ai.marketing',
    owningService: 'ReviewManagementService',
    phase: 'P2',
    args: z.object({
      action: z.enum(['view', 'respond', 'flag', 'escalate', 'report']),
      reviewId: z.string().uuid().optional(),
      platform: z.enum(['google', 'facebook', 'yelp', 'instagram', 'internal']).optional(),
      response: z.string().max(2000).optional(),
    }).strict(),
  };
}

@Injectable()
export class GetCompetitorIntelligenceTool extends BaseTool implements AiTool {
  constructor(private readonly competitorIntelligenceService: CompetitorIntelligenceService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      competitorId: z.string().uuid().optional(),
      radiusKm: z.number().int().min(1).max(50).default(10),
      includeOnline: z.boolean().default(true),
    }).parse(args);

    return this.competitorIntelligenceService.getCompetitorIntelligence(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-71',
    name: 'getCompetitorIntelligence',
    purpose: 'Get competitor intelligence - pricing, offerings, promotions, reviews, digital presence.',
    assistant: 'marketing',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'marketing.read',
    featureFlag: 'ai.marketing',
    owningService: 'CompetitorIntelligenceService',
    phase: 'P2',
    args: z.object({
      competitorId: z.string().uuid().optional(),
      radiusKm: z.number().int().min(1).max(50).default(10),
      includeOnline: z.boolean().default(true),
    }).strict(),
  };
}