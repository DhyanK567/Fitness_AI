import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface LeadScoreInput {
  leadId: string;
  tenantId: string;
  source: string;
  interest?: string;
  engagementCount: number;
  daysSinceCreated: number;
  hasPhone: boolean;
  hasEmail: boolean;
  conversionHistory: number;
  pageViews: number;
  sessionDuration: number;
}

export interface LeadScoreResult {
  score: number;
  breakdown: Record<string, number>;
  factors: Record<string, any>;
  modelVersion: string;
}

@Injectable()
export class LeadScoringService {
  private readonly modelVersion = 'v1.2.0';
  private readonly weights = {
    source: 0.20,
    engagement: 0.25,
    recency: 0.15,
    completeness: 0.10,
    conversionHistory: 0.15,
    behavior: 0.15,
  };

  private readonly sourceScores: Record<string, number> = {
    'website': 85,
    'referral': 90,
    'walk_in': 75,
    'social_media': 65,
    'advertisement': 55,
    'email_campaign': 60,
    'event': 70,
    'partner': 80,
    'spreadsheet import': 60,
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deterministically calculate lead conversion score from input attributes
   */
  async calculateScore(input: LeadScoreInput): Promise<LeadScoreResult> {
    const breakdown: Record<string, number> = {};
    const factors: Record<string, any> = {};

    // Source score (0-100)
    const sourceKey = (input.source || 'website').toLowerCase();
    const sourceScore = this.sourceScores[sourceKey] || 50;
    breakdown.source = Math.round(sourceScore * this.weights.source);
    factors.source = { value: input.source, score: sourceScore };

    // Engagement score (0-100)
    const engagementScore = Math.min(100, Math.max(0, input.engagementCount * 10));
    breakdown.engagement = Math.round(engagementScore * this.weights.engagement);
    factors.engagement = { count: input.engagementCount, score: engagementScore };

    // Recency score (0-100) - newer leads score higher
    const recencyScore = Math.max(0, 100 - input.daysSinceCreated * 2);
    breakdown.recency = Math.round(recencyScore * this.weights.recency);
    factors.recency = { daysSinceCreated: input.daysSinceCreated, score: recencyScore };

    // Completeness score (0-100)
    let completenessScore = 0;
    if (input.hasPhone) completenessScore += 50;
    if (input.hasEmail) completenessScore += 50;
    breakdown.completeness = Math.round(completenessScore * this.weights.completeness);
    factors.completeness = { hasPhone: input.hasPhone, hasEmail: input.hasEmail, score: completenessScore };

    // Conversion history score (0-100)
    const conversionScore = Math.min(100, input.conversionHistory * 25);
    breakdown.conversionHistory = Math.round(conversionScore * this.weights.conversionHistory);
    factors.conversionHistory = { count: input.conversionHistory, score: conversionScore };

    // Behavior score (0-100) - page views and session duration
    const behaviorScore = Math.min(100, (input.pageViews * 2) + Math.floor(input.sessionDuration / 60));
    breakdown.behavior = Math.round(behaviorScore * this.weights.behavior);
    factors.behavior = { pageViews: input.pageViews, sessionDuration: input.sessionDuration, score: behaviorScore };

    // Calculate total score
    const totalScore = Math.round(Object.values(breakdown).reduce((sum, val) => sum + val, 0));
    const clampedScore = Math.min(100, Math.max(0, totalScore));

    return {
      score: clampedScore,
      breakdown,
      factors,
      modelVersion: this.modelVersion,
    };
  }

  /**
   * Calculate conversion score for a real lead from authoritative database records
   * and persist the calculated score with factor breakdown to PostgreSQL (ai.lead_scores)
   */
  async scoreLead(
    tenantId: string,
    leadId: string,
  ): Promise<LeadScoreResult & { leadId: string; leadName: string; status: 'HOT' | 'WARM' | 'COLD' }> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Fetch real lead from tenant-isolated studio_leads
      const lead = await tx.studioLead.findFirst({
        where: { id: leadId, tenantId },
      });

      if (!lead) {
        throw new NotFoundException(`Lead '${leadId}' not found for tenant`);
      }

      // 2. Derive real attributes
      const daysSinceCreated = Math.max(
        0,
        Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
      );

      const interactionCount = await tx.pipelineEntry.count({
        where: { tenantId, leadId },
      });

      const isConverted = Boolean(
        lead.stage && ['won', 'converted', 'member'].some((s) => lead.stage.toLowerCase().includes(s)),
      );

      const input: LeadScoreInput = {
        leadId,
        tenantId,
        source: lead.source || 'website',
        interest: lead.plan || undefined,
        engagementCount: Math.max(1, interactionCount),
        daysSinceCreated,
        hasPhone: Boolean(lead.phone && lead.phone.trim().length > 0),
        hasEmail: Boolean(lead.email && lead.email.trim().length > 0),
        conversionHistory: isConverted ? 1 : 0,
        pageViews: 0,
        sessionDuration: 0,
      };

      // 3. Compute deterministic score
      const result = await this.calculateScore(input);

      // 4. Persist score to ai.lead_scores inside tenant RLS transaction
      await tx.leadScore.upsert({
        where: { tenantId_leadId: { tenantId, leadId } },
        create: {
          tenantId,
          leadId,
          score: result.score,
          scoreBreakdown: result.breakdown,
          modelVersion: result.modelVersion,
          factors: result.factors,
        },
        update: {
          score: result.score,
          scoreBreakdown: result.breakdown,
          modelVersion: result.modelVersion,
          factors: result.factors,
          updatedAt: new Date(),
        },
      });

      const status: 'HOT' | 'WARM' | 'COLD' =
        result.score >= 75 ? 'HOT' : result.score >= 50 ? 'WARM' : 'COLD';

      return {
        leadId,
        leadName: lead.name,
        status,
        ...result,
      };
    });
  }

  /**
   * Persist score for a lead within tenant isolation
   */
  async saveScore(tenantId: string, leadId: string, result: LeadScoreResult): Promise<void> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await tx.leadScore.upsert({
        where: { tenantId_leadId: { tenantId, leadId } },
        create: {
          tenantId,
          leadId,
          score: result.score,
          scoreBreakdown: result.breakdown,
          modelVersion: result.modelVersion,
          factors: result.factors,
        },
        update: {
          score: result.score,
          scoreBreakdown: result.breakdown,
          modelVersion: result.modelVersion,
          factors: result.factors,
          updatedAt: new Date(),
        },
      });
    });
  }

  /**
   * Retrieve saved score for a lead within tenant isolation
   */
  async getScore(tenantId: string, leadId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.leadScore.findUnique({
        where: { tenantId_leadId: { tenantId, leadId } },
      });
    });
  }

  /**
   * Retrieve top scoring leads within tenant isolation
   */
  async getTopLeads(tenantId: string, limit = 20, minScore = 70) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.leadScore.findMany({
        where: {
          tenantId,
          score: { gte: minScore },
        },
        orderBy: { score: 'desc' },
        take: limit,
      });
    });
  }

  /**
   * Retrieve leads within a score range for a tenant
   */
  async getLeadsByScoreRange(tenantId: string, minScore: number, maxScore: number) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.leadScore.findMany({
        where: {
          tenantId,
          score: { gte: minScore, lte: maxScore },
        },
        orderBy: { score: 'desc' },
      });
    });
  }

  /**
   * Batch recalculate and save scores for multiple leads within tenant isolation
   */
  async recalculateAllScores(tenantId: string, leads: LeadScoreInput[]) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const results = await Promise.all(
        leads.map((lead) => this.calculateScore({ ...lead, tenantId })),
      );

      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const result = results[i];
        await tx.leadScore.upsert({
          where: { tenantId_leadId: { tenantId, leadId: lead.leadId } },
          create: {
            tenantId,
            leadId: lead.leadId,
            score: result.score,
            scoreBreakdown: result.breakdown,
            modelVersion: result.modelVersion,
            factors: result.factors,
          },
          update: {
            score: result.score,
            scoreBreakdown: result.breakdown,
            modelVersion: result.modelVersion,
            factors: result.factors,
            updatedAt: new Date(),
          },
        });
      }

      return results;
    });
  }
}