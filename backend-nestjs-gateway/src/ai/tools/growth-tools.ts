import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { GrowthAnalyticsService } from '../growth/growth-analytics.service';
import { ReferralService } from '../growth/referral.service';
import { UpsellService } from '../growth/upsell.service';
import { ExpansionService } from '../growth/expansion.service';
import { ExperimentService } from '../growth/experiment.service';
import { BaseTool, ToolContext, ToolResult, AiTool } from './base-tool';
import { ToolDefinition } from '@wsos/ai-tool-definitions';

// ============================================
// Growth Agent Tools (T-53 to T-61)
// ============================================

@Injectable()
export class GetAcquisitionMetricsTool extends BaseTool implements AiTool {
  constructor(private readonly growthAnalyticsService: GrowthAnalyticsService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
      channel: z.enum(['organic', 'referral', 'paid_social', 'paid_search', 'email', 'walk_in', 'partnership', 'other']).optional(),
      branchId: z.string().uuid().optional(),
    }).parse(args);

    return this.growthAnalyticsService.getAcquisitionMetrics(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-53',
    name: 'getAcquisitionMetrics',
    purpose: 'Get member acquisition metrics - leads, conversion rates, CAC, channel performance.',
    assistant: 'growth',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'growth.read',
    featureFlag: 'ai.growth',
    owningService: 'GrowthAnalyticsService',
    phase: 'P2',
    args: z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
      channel: z.enum(['organic', 'referral', 'paid_social', 'paid_search', 'email', 'walk_in', 'partnership', 'other']).optional(),
      branchId: z.string().uuid().optional(),
    }).strict(),
  };
}

@Injectable()
export class GetReferralProgramMetricsTool extends BaseTool implements AiTool {
  constructor(private readonly referralService: ReferralService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
      status: z.enum(['pending', 'converted', 'expired', 'cancelled']).optional(),
    }).parse(args);

    return this.referralService.getReferralProgramMetrics(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-54',
    name: 'getReferralProgramMetrics',
    purpose: 'Get referral program performance - referrals sent, converted, rewards paid, viral coefficient.',
    assistant: 'growth',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'growth.read',
    featureFlag: 'ai.growth',
    owningService: 'ReferralService',
    phase: 'P2',
    args: z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
      status: z.enum(['pending', 'converted', 'expired', 'cancelled']).optional(),
    }).strict(),
  };
}

@Injectable()
export class CreateReferralCampaignTool extends BaseTool implements AiTool {
  constructor(private readonly referralService: ReferralService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      referrerIncentive: z.object({
        type: z.enum(['credit', 'discount', 'free_session', 'merchandise', 'cash']),
        value: z.number().min(0),
        description: z.string().max(200),
      }),
      refereeIncentive: z.object({
        type: z.enum(['discount', 'free_trial', 'waived_fee', 'bonus']),
        value: z.number().min(0),
        description: z.string().max(200),
      }).optional(),
      validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      maxReferralsPerMember: z.number().int().min(1).max(100).default(10),
      eligibilityCriteria: z.record(z.string(), z.any()).optional(),
    }).parse(args);

    return this.referralService.createReferralCampaign(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-55',
    name: 'createReferralCampaign',
    purpose: 'Create a referral campaign with incentives, rules, and tracking.',
    assistant: 'growth',
    risk: 'write',
    requiresConfirmation: true,
    principals: ['staff'],
    requiredPermission: 'growth.write',
    featureFlag: 'ai.growth',
    owningService: 'ReferralService',
    phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      referrerIncentive: z.object({
        type: z.enum(['credit', 'discount', 'free_session', 'merchandise', 'cash']),
        value: z.number().min(0),
        description: z.string().max(200),
      }),
      refereeIncentive: z.object({
        type: z.enum(['discount', 'free_trial', 'waived_fee', 'bonus']),
        value: z.number().min(0),
        description: z.string().max(200),
      }).optional(),
      validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      maxReferralsPerMember: z.number().int().min(1).max(100).default(10),
      eligibilityCriteria: z.record(z.string(), z.any()).optional(),
    }).strict(),
  };
}

@Injectable()
export class GetUpsellOpportunitiesTool extends BaseTool implements AiTool {
  constructor(private readonly upsellService: UpsellService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      memberId: z.string().uuid().optional(),
      opportunityType: z.enum(['plan_upgrade', 'addon', 'personal_training', 'nutrition', 'workshop', 'retail']).optional(),
      minScore: z.number().int().min(0).max(100).default(70),
      limit: z.number().int().min(1).max(100).default(50),
    }).parse(args);

    return this.upsellService.getUpsellOpportunities(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-56',
    name: 'getUpsellOpportunities',
    purpose: 'Identify members ready for upsell - plan upgrade, add-ons, personal training, nutrition.',
    assistant: 'growth',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'growth.read',
    featureFlag: 'ai.growth',
    owningService: 'UpsellService',
    phase: 'P2',
    args: z.object({
      memberId: z.string().uuid().optional(),
      opportunityType: z.enum(['plan_upgrade', 'addon', 'personal_training', 'nutrition', 'workshop', 'retail']).optional(),
      minScore: z.number().int().min(0).max(100).default(70),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict(),
  };
}

@Injectable()
export class CreateUpsellOfferTool extends BaseTool implements AiTool {
  constructor(private readonly upsellService: UpsellService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      memberId: z.string().uuid().optional(),
      segmentId: z.string().uuid().optional(),
      offerType: z.enum(['plan_upgrade', 'addon', 'personal_training', 'nutrition', 'workshop', 'retail']),
      offerDetails: z.record(z.string(), z.any()),
      discountPercent: z.number().int().min(0).max(100).optional(),
      validUntil: z.string().datetime(),
      triggerEvent: z.enum(['milestone', 'birthday', 'anniversary', 'high_engagement', 'plan_expiry', 'manual']).optional(),
    }).parse(args);

    return this.upsellService.createUpsellOffer(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-57',
    name: 'createUpsellOffer',
    purpose: 'Create a personalized upsell offer for a member or segment.',
    assistant: 'growth',
    risk: 'write',
    requiresConfirmation: true,
    principals: ['staff'],
    requiredPermission: 'growth.write',
    featureFlag: 'ai.growth',
    owningService: 'UpsellService',
    phase: 'P2',
    args: z.object({
      memberId: z.string().uuid().optional(),
      segmentId: z.string().uuid().optional(),
      offerType: z.enum(['plan_upgrade', 'addon', 'personal_training', 'nutrition', 'workshop', 'retail']),
      offerDetails: z.record(z.string(), z.any()),
      discountPercent: z.number().int().min(0).max(100).optional(),
      validUntil: z.string().datetime(),
      triggerEvent: z.enum(['milestone', 'birthday', 'anniversary', 'high_engagement', 'plan_expiry', 'manual']).optional(),
    }).strict(),
  };
}

@Injectable()
export class GetLifetimeValueMetricsTool extends BaseTool implements AiTool {
  constructor(private readonly growthAnalyticsService: GrowthAnalyticsService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      cohortBy: z.enum(['month', 'quarter', 'year', 'channel', 'plan']).optional(),
      periodMonths: z.number().int().min(1).max(60).default(12),
    }).parse(args);

    return this.growthAnalyticsService.getLifetimeValueMetrics(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-58',
    name: 'getLifetimeValueMetrics',
    purpose: 'Get member lifetime value (LTV) metrics, cohorts, and predictions.',
    assistant: 'growth',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'growth.read',
    featureFlag: 'ai.growth',
    owningService: 'GrowthAnalyticsService',
    phase: 'P2',
    args: z.object({
      cohortBy: z.enum(['month', 'quarter', 'year', 'channel', 'plan']).optional(),
      periodMonths: z.number().int().min(1).max(60).default(12),
    }).strict(),
  };
}

@Injectable()
export class GetExpansionOpportunitiesTool extends BaseTool implements AiTool {
  constructor(private readonly expansionService: ExpansionService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      analysisType: z.enum(['geographic', 'demographic', 'competitive', 'corporate', 'partnership']).default('geographic'),
      radiusKm: z.number().int().min(1).max(100).default(10),
      minPopulation: z.number().int().min(1000).default(50000),
    }).parse(args);

    return this.expansionService.getExpansionOpportunities(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-59',
    name: 'getExpansionOpportunities',
    purpose: 'Identify expansion opportunities - new locations, class types, partnerships, corporate accounts.',
    assistant: 'growth',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'growth.read',
    featureFlag: 'ai.growth',
    owningService: 'ExpansionService',
    phase: 'P2',
    args: z.object({
      analysisType: z.enum(['geographic', 'demographic', 'competitive', 'corporate', 'partnership']).default('geographic'),
      radiusKm: z.number().int().min(1).max(100).default(10),
      minPopulation: z.number().int().min(1000).default(50000),
    }).strict(),
  };
}

@Injectable()
export class TrackGrowthExperimentTool extends BaseTool implements AiTool {
  constructor(private readonly experimentService: ExperimentService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      experimentId: z.string().uuid().optional(),
      status: z.enum(['draft', 'running', 'completed', 'archived']).optional(),
    }).parse(args);

    return this.experimentService.trackGrowthExperiment(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-60',
    name: 'trackGrowthExperiment',
    purpose: 'Track A/B test or growth experiment results - variant performance, statistical significance.',
    assistant: 'growth',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'growth.read',
    featureFlag: 'ai.growth',
    owningService: 'ExperimentService',
    phase: 'P2',
    args: z.object({
      experimentId: z.string().uuid().optional(),
      status: z.enum(['draft', 'running', 'completed', 'archived']).optional(),
    }).strict(),
  };
}

@Injectable()
export class CreateGrowthExperimentTool extends BaseTool implements AiTool {
  constructor(private readonly experimentService: ExperimentService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      name: z.string().min(1).max(200),
      hypothesis: z.string().min(1).max(1000),
      variantControl: z.record(z.string(), z.any()),
      variantTreatment: z.record(z.string(), z.any()),
      targetMetric: z.enum(['conversion_rate', 'revenue_per_member', 'retention_rate', 'referral_rate', 'attendance_rate']),
      minimumDetectableEffect: z.number().min(0.01).max(1).default(0.1),
      trafficAllocation: z.number().int().min(10).max(100).default(50),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(args);

    return this.experimentService.createGrowthExperiment(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-61',
    name: 'createGrowthExperiment',
    purpose: 'Create a growth experiment (A/B test) for pricing, messaging, offers, or features.',
    assistant: 'growth',
    risk: 'write',
    requiresConfirmation: true,
    principals: ['staff'],
    requiredPermission: 'growth.write',
    featureFlag: 'ai.growth',
    owningService: 'ExperimentService',
    phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      hypothesis: z.string().min(1).max(1000),
      variantControl: z.record(z.string(), z.any()),
      variantTreatment: z.record(z.string(), z.any()),
      targetMetric: z.enum(['conversion_rate', 'revenue_per_member', 'retention_rate', 'referral_rate', 'attendance_rate']),
      minimumDetectableEffect: z.number().min(0.01).max(1).default(0.1),
      trafficAllocation: z.number().int().min(10).max(100).default(50),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).strict(),
  };
}