import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface ChurnRiskInput {
  memberId: string;
  tenantId: string;
  daysSinceLastVisit: number;
  daysSinceLastPayment: number;
  attendanceRate: number;
  avgSessionsPerWeek: number;
  membershipDaysRemaining: number;
  paymentFailures: number;
  feedbackSentiment: 'positive' | 'neutral' | 'negative' | null;
  npsScore?: number;
  referralCount: number;
  planTier: 'basic' | 'premium' | 'vip';
  age?: number;
  tenureDays: number;
}

export interface ChurnRiskResult {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: Record<string, any>;
  predictedChurnDate?: Date;
  modelVersion: string;
}

@Injectable()
export class ChurnPredictionService {
  private readonly modelVersion = 'v1.1.0';
  private readonly weights = {
    recency: 0.25,
    frequency: 0.20,
    monetary: 0.15,
    engagement: 0.15,
    satisfaction: 0.15,
    tenure: 0.10,
  };

  constructor(private readonly prisma: PrismaService) {}

  async calculateRisk(input: ChurnRiskInput): Promise<ChurnRiskResult> {
    const factors: Record<string, any> = {};
    const scores: Record<string, number> = {};

    // Recency score (0-100) - lower is worse
    const recencyScore = Math.max(0, 100 - (input.daysSinceLastVisit * 2));
    scores.recency = recencyScore;
    factors.recency = { daysSinceLastVisit: input.daysSinceLastVisit, score: recencyScore };

    // Frequency score (0-100)
    const frequencyScore = Math.min(100, input.avgSessionsPerWeek * 20);
    scores.frequency = frequencyScore;
    factors.frequency = { avgSessionsPerWeek: input.avgSessionsPerWeek, score: frequencyScore };

    // Monetary score (0-100) - based on payment reliability
    const monetaryScore = Math.max(0, 100 - (input.paymentFailures * 25));
    scores.monetary = monetaryScore;
    factors.monetary = { paymentFailures: input.paymentFailures, score: monetaryScore };

    // Engagement score (0-100) - attendance rate
    const engagementScore = Math.round(input.attendanceRate * 100);
    scores.engagement = engagementScore;
    factors.engagement = { attendanceRate: input.attendanceRate, score: engagementScore };

    // Satisfaction score (0-100)
    let satisfactionScore = 50; // neutral default
    if (input.feedbackSentiment === 'positive') satisfactionScore = 85;
    else if (input.feedbackSentiment === 'negative') satisfactionScore = 20;
    else if (input.npsScore !== undefined) satisfactionScore = Math.max(0, Math.min(100, input.npsScore * 10));
    scores.satisfaction = satisfactionScore;
    factors.satisfaction = { sentiment: input.feedbackSentiment, npsScore: input.npsScore, score: satisfactionScore };

    // Tenure score (0-100) - longer tenure = lower churn risk
    const tenureScore = Math.min(100, input.tenureDays / 10);
    scores.tenure = tenureScore;
    factors.tenure = { tenureDays: input.tenureDays, score: tenureScore };

    // Plan tier adjustment
    const tierMultiplier = { basic: 1.0, premium: 0.8, vip: 0.6 }[input.planTier] || 1.0;

    // Calculate weighted risk score
    let riskScore = 0;
    for (const [factor, weight] of Object.entries(this.weights)) {
      const factorScore = scores[factor] || 0;
      // Invert score: higher score = lower risk, so risk = 100 - score
      riskScore += (100 - factorScore) * weight;
    }

    // Apply tier multiplier
    riskScore = Math.round(riskScore * tierMultiplier);
    riskScore = Math.min(100, Math.max(0, riskScore));

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 75) riskLevel = 'critical';
    else if (riskScore >= 50) riskLevel = 'high';
    else if (riskScore >= 25) riskLevel = 'medium';
    else riskLevel = 'low';

    // Predict churn date
    let predictedChurnDate: Date | undefined;
    if (riskLevel === 'critical' || riskLevel === 'high') {
      const daysToChurn = riskLevel === 'critical' ? 14 : 30;
      predictedChurnDate = new Date();
      predictedChurnDate.setDate(predictedChurnDate.getDate() + daysToChurn);
    }

    return {
      riskScore,
      riskLevel,
      riskFactors: factors,
      predictedChurnDate,
      modelVersion: this.modelVersion,
    };
  }

  async saveRisk(tenantId: string, memberId: string, result: ChurnRiskResult): Promise<void> {
    await this.prisma.churnRisk.upsert({
      where: { tenantId_memberId: { tenantId, memberId } },
      create: {
        tenantId,
        memberId,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        riskFactors: result.riskFactors,
        predictedChurnDate: result.predictedChurnDate,
        modelVersion: result.modelVersion,
        lastCalculatedAt: new Date(),
      },
      update: {
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        riskFactors: result.riskFactors,
        predictedChurnDate: result.predictedChurnDate,
        modelVersion: result.modelVersion,
        lastCalculatedAt: new Date(),
      },
    });
  }

  async getRisk(tenantId: string, memberId: string) {
    return this.prisma.churnRisk.findUnique({
      where: { tenantId_memberId: { tenantId, memberId } },
    });
  }

  async getHighRiskMembers(tenantId: string, riskLevel: 'high' | 'critical' = 'high', limit = 50) {
    return this.prisma.churnRisk.findMany({
      where: {
        tenantId,
        riskLevel: { in: riskLevel === 'critical' ? ['critical'] : ['high', 'critical'] },
      },
      orderBy: { riskScore: 'desc' },
      take: limit,
    });
  }

  async getRiskDistribution(tenantId: string) {
    const risks = await this.prisma.churnRisk.findMany({
      where: { tenantId },
      select: { riskLevel: true },
    });

    const distribution = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of risks) {
      distribution[r.riskLevel as keyof typeof distribution]++;
    }
    return distribution;
  }

  async recalculateAllRisks(tenantId: string, members: ChurnRiskInput[]) {
    const results = await Promise.all(
      members.map(member => this.calculateRisk({ ...member, tenantId }))
    );

    await Promise.all(
      results.map((result, index) =>
        this.saveRisk(tenantId, members[index].memberId, result)
      )
    );

    return results;
  }
}