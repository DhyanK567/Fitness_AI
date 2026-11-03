import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface EngagementInput {
  memberId: string;
  tenantId: string;
  // Attendance metrics
  sessionsAttended: number;
  sessionsBooked: number;
  classesAvailable: number;
  daysSinceLastAttendance: number;
  // Frequency metrics
  avgWeeklyVisits: number;
  peakHoursVisits: number;
  weekendVisits: number;
  // Recency metrics
  daysSinceLastVisit: number;
  daysSinceLastBooking: number;
  // Monetary metrics
  monthlySpend: number;
  ltv: number;
  paymentReliability: number; // 0-1
  // Feedback metrics
  avgFeedbackRating: number;
  feedbackCount: number;
  // Referral metrics
  referralsMade: number;
  referralConversions: number;
  // Plan info
  planTier: 'basic' | 'premium' | 'vip';
  tenureDays: number;
}

export interface EngagementResult {
  overallScore: number;
  attendanceScore: number;
  frequencyScore: number;
  recencyScore: number;
  monetaryScore: number;
  feedbackScore: number;
  referralScore: number;
  factorBreakdown: Record<string, any>;
  trend: 'improving' | 'stable' | 'declining';
}

@Injectable()
export class EngagementScoringService {
  private readonly weights = {
    attendance: 0.25,
    frequency: 0.20,
    recency: 0.15,
    monetary: 0.15,
    feedback: 0.15,
    referral: 0.10,
  };

  constructor(private readonly prisma: PrismaService) {}

  async calculateEngagement(input: EngagementInput): Promise<EngagementResult> {
    const breakdown: Record<string, any> = {};

    // Attendance Score (0-100)
    const attendanceRate = input.sessionsBooked > 0 
      ? input.sessionsAttended / input.sessionsBooked 
      : 0;
    const attendanceScore = Math.round(Math.min(100, attendanceRate * 100 + (input.classesAvailable / 10)));
    breakdown.attendance = { rate: attendanceRate, sessionsAttended: input.sessionsAttended, sessionsBooked: input.sessionsBooked, score: attendanceScore };

    // Frequency Score (0-100)
    const frequencyScore = Math.min(100, Math.round(input.avgWeeklyVisits * 20 + (input.peakHoursVisits * 2) + (input.weekendVisits * 1)));
    breakdown.frequency = { avgWeeklyVisits: input.avgWeeklyVisits, peakHoursVisits: input.peakHoursVisits, weekendVisits: input.weekendVisits, score: frequencyScore };

    // Recency Score (0-100)
    const recencyScore = Math.max(0, 100 - (input.daysSinceLastVisit * 3) - (input.daysSinceLastBooking * 1));
    breakdown.recency = { daysSinceLastVisit: input.daysSinceLastVisit, daysSinceLastBooking: input.daysSinceLastBooking, score: recencyScore };

    // Monetary Score (0-100)
    const monetaryScore = Math.min(100, Math.round(input.paymentReliability * 60 + (input.monthlySpend / 100) * 20 + (input.ltv / 1000) * 20));
    breakdown.monetary = { monthlySpend: input.monthlySpend, ltv: input.ltv, paymentReliability: input.paymentReliability, score: monetaryScore };

    // Feedback Score (0-100)
    const feedbackScore = input.feedbackCount > 0 
      ? Math.round(input.avgFeedbackRating * 20) 
      : 50; // neutral if no feedback
    breakdown.feedback = { avgRating: input.avgFeedbackRating, count: input.feedbackCount, score: feedbackScore };

    // Referral Score (0-100)
    const referralScore = Math.min(100, Math.round(input.referralsMade * 15 + input.referralConversions * 25));
    breakdown.referral = { referralsMade: input.referralsMade, conversions: input.referralConversions, score: referralScore };

    // Calculate weighted overall score
    let overallScore = 0;
    for (const [factor, weight] of Object.entries(this.weights)) {
      overallScore += (breakdown[factor]?.score || 0) * weight;
    }
    overallScore = Math.round(Math.min(100, Math.max(0, overallScore)));

    // Determine trend (simplified - would need historical data for real trend)
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (overallScore >= 80) trend = 'improving';
    else if (overallScore < 50) trend = 'declining';

    return {
      overallScore,
      attendanceScore,
      frequencyScore,
      recencyScore,
      monetaryScore,
      feedbackScore,
      referralScore,
      factorBreakdown: breakdown,
      trend,
    };
  }

  async saveEngagement(tenantId: string, memberId: string, result: EngagementResult): Promise<void> {
    await this.prisma.engagementScore.upsert({
      where: { tenantId_memberId: { tenantId, memberId } },
      create: {
        tenantId,
        memberId,
        overallScore: result.overallScore,
        attendanceScore: result.attendanceScore,
        frequencyScore: result.frequencyScore,
        recencyScore: result.recencyScore,
        monetaryScore: result.monetaryScore,
        feedbackScore: result.feedbackScore,
        referralScore: result.referralScore,
        factorBreakdown: result.factorBreakdown,
        trend: result.trend,
        lastCalculatedAt: new Date(),
      },
      update: {
        overallScore: result.overallScore,
        attendanceScore: result.attendanceScore,
        frequencyScore: result.frequencyScore,
        recencyScore: result.recencyScore,
        monetaryScore: result.monetaryScore,
        feedbackScore: result.feedbackScore,
        referralScore: result.referralScore,
        factorBreakdown: result.factorBreakdown,
        trend: result.trend,
        lastCalculatedAt: new Date(),
      },
    });
  }

  async getEngagement(tenantId: string, memberId: string) {
    return this.prisma.engagementScore.findUnique({
      where: { tenantId_memberId: { tenantId, memberId } },
    });
  }

  async getLowEngagementMembers(tenantId: string, threshold = 50, limit = 50) {
    return this.prisma.engagementScore.findMany({
      where: { tenantId, overallScore: { lt: threshold } },
      orderBy: { overallScore: 'asc' },
      take: limit,
    });
  }

  async getEngagementDistribution(tenantId: string) {
    const scores = await this.prisma.engagementScore.findMany({
      where: { tenantId },
      select: { overallScore: true },
    });

    const distribution = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
    for (const s of scores) {
      if (s.overallScore <= 20) distribution['0-20']++;
      else if (s.overallScore <= 40) distribution['21-40']++;
      else if (s.overallScore <= 60) distribution['41-60']++;
      else if (s.overallScore <= 80) distribution['61-80']++;
      else distribution['81-100']++;
    }
    return distribution;
  }

  async getTrendDistribution(tenantId: string) {
    const trends = await this.prisma.engagementScore.findMany({
      where: { tenantId },
      select: { trend: true },
    });

    const distribution = { improving: 0, stable: 0, declining: 0 };
    for (const t of trends) {
      distribution[t.trend as keyof typeof distribution]++;
    }
    return distribution;
  }

  async recalculateAllEngagements(tenantId: string, members: EngagementInput[]) {
    const results = await Promise.all(
      members.map(member => this.calculateEngagement({ ...member, tenantId }))
    );

    await Promise.all(
      results.map((result, index) =>
        this.saveEngagement(tenantId, members[index].memberId, result)
      )
    );

    return results;
  }
}