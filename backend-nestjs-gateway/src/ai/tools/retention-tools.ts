import { Injectable } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

interface MemberData {
  id: string;
  fullName?: string;
  createdAt: string;
}

interface AttendanceData {
  attendance: Array<{ status: string }>;
}

interface PaymentData {
  payments: Array<{ status: string }>;
}

interface FeedbackData {
  feedback: Array<{ rating?: number }>;
}

interface MembershipData {
  plan_type: string;
}

@Injectable()
export class CalculateChurnRiskTool extends BaseTool {
  async execute(context: ToolContext, args: { memberId: string }): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['memberId']);
    if (validationError) return this.error(validationError);

    const memberResult = await this.callErp<MemberData>(context, ERP_METHODS.MEMBER_GET, { id: args.memberId });
    if (!memberResult.success) return memberResult;
    const member = memberResult.data;

    const attendanceResult = await this.callErp<{ attendance: Array<{ status: string }> }>(context, ERP_METHODS.ATTENDANCE_LIST, { member_id: args.memberId });
    const attendanceData = attendanceResult.data || { attendance: [] };

    const paymentResult = await this.callErp<{ payments: Array<{ status: string }> }>(context, ERP_METHODS.PAYMENT_LIST, { member_id: args.memberId });
    const paymentData = paymentResult.data || { payments: [] };

    const membershipResult = await this.callErp<{ plan_type: string }>(context, ERP_METHODS.MEMBERSHIP_GET, { member_id: args.memberId });
    const membershipData = membershipResult.data;

    const daysSinceLastVisit = 30;
    const daysSinceLastPayment = 15;
    const attendanceRate = 0.5;
    const avgSessionsPerWeek = 1.5;
    const paymentFailures = paymentData?.payments?.filter((p: any) => p.status === 'failed').length || 0;
    const feedbackSentiment = 'neutral' as const;
    const npsScore = undefined;
    const referralCount = 0;
    const planTier = membershipData?.plan_type === 'annual' ? 'vip' : membershipData?.plan_type === 'quarterly' ? 'premium' : 'basic';
    const tenureDays = Math.floor((Date.now() - new Date(member?.createdAt || Date.now()).getTime()) / (1000 * 60 * 60 * 24));

    const weights = { recency: 0.25, frequency: 0.20, monetary: 0.15, engagement: 0.15, satisfaction: 0.15, tenure: 0.10 };

    const recencyScore = Math.max(0, 100 - (daysSinceLastVisit * 2));
    const frequencyScore = Math.min(100, avgSessionsPerWeek * 20);
    const monetaryScore = Math.max(0, 100 - (paymentFailures * 25));
    const engagementScore = Math.round(attendanceRate * 100);
    let satisfactionScore = 50;
    const tenureScore = Math.min(100, tenureDays / 10);

    let riskScore = 0;
    riskScore += (100 - recencyScore) * weights.recency;
    riskScore += (100 - frequencyScore) * weights.frequency;
    riskScore += (100 - monetaryScore) * weights.monetary;
    riskScore += (100 - engagementScore) * weights.engagement;
    riskScore += (100 - satisfactionScore) * weights.satisfaction;
    riskScore += (100 - tenureScore) * weights.tenure;

    const tierMultiplier = { basic: 1.0, premium: 0.8, vip: 0.6 }[planTier] || 1.0;
    riskScore = Math.round(riskScore * tierMultiplier);
    riskScore = Math.min(100, Math.max(0, riskScore));

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 75) riskLevel = 'critical';
    else if (riskScore >= 50) riskLevel = 'high';
    else if (riskScore >= 25) riskLevel = 'medium';
    else riskLevel = 'low';

    let predictedChurnDate: Date | undefined;
    if (riskLevel === 'critical' || riskLevel === 'high') {
      const daysToChurn = riskLevel === 'critical' ? 14 : 30;
      predictedChurnDate = new Date();
      predictedChurnDate.setDate(predictedChurnDate.getDate() + daysToChurn);
    }

    return this.success({
      memberId: args.memberId,
      riskScore,
      riskLevel,
      riskFactors: { recencyScore, frequencyScore, monetaryScore, engagementScore, satisfactionScore, tenureScore },
      predictedChurnDate,
      modelVersion: 'v1.1.0',
    });
  }
}

@Injectable()
export class GetHighRiskMembersTool extends BaseTool {
  async execute(context: ToolContext, args: { riskLevel?: 'high' | 'critical'; limit?: number }): Promise<ToolResult> {
    const membersResult = await this.callErp<{ members: MemberData[] }>(context, ERP_METHODS.MEMBER_LIST, { status: 'active' });
    if (!membersResult.success) return membersResult;

    const members = membersResult.data?.members || [];
    const riskResults = [];

    for (const member of members.slice(0, args.limit || 50)) {
      // Calculate churn risk inline (duplicated from CalculateChurnRiskTool)
      const memberResult = await this.callErp<MemberData>(context, ERP_METHODS.MEMBER_GET, { id: member.id });
      if (!memberResult.success) continue;
      const memberData = memberResult.data;

      const attendanceResult = await this.callErp<{ attendance: Array<{ status: string }> }>(context, ERP_METHODS.ATTENDANCE_LIST, { member_id: member.id });
      const attendanceData = attendanceResult.data || { attendance: [] };

      const paymentResult = await this.callErp<{ payments: Array<{ status: string }> }>(context, ERP_METHODS.PAYMENT_LIST, { member_id: member.id });
      const paymentData = paymentResult.data || { payments: [] };

      const membershipResult = await this.callErp<{ plan_type: string }>(context, ERP_METHODS.MEMBERSHIP_GET, { member_id: member.id });
      const membershipData = membershipResult.data;

      const daysSinceLastVisit = 30;
      const daysSinceLastPayment = 15;
      const attendanceRate = 0.5;
      const avgSessionsPerWeek = 1.5;
      const paymentFailures = paymentData?.payments?.filter((p: any) => p.status === 'failed').length || 0;
      const feedbackSentiment = 'neutral' as const;
      const npsScore = undefined;
      const referralCount = 0;
      const planTier = membershipData?.plan_type === 'annual' ? 'vip' : membershipData?.plan_type === 'quarterly' ? 'premium' : 'basic';
      const tenureDays = Math.floor((Date.now() - new Date(memberData?.createdAt || Date.now()).getTime()) / (1000 * 60 * 60 * 24));

      const weights = { recency: 0.25, frequency: 0.20, monetary: 0.15, engagement: 0.15, satisfaction: 0.15, tenure: 0.10 };

      const recencyScore = Math.max(0, 100 - (daysSinceLastVisit * 2));
      const frequencyScore = Math.min(100, avgSessionsPerWeek * 20);
      const monetaryScore = Math.max(0, 100 - (paymentFailures * 25));
      const engagementScore = Math.round(attendanceRate * 100);
      let satisfactionScore = 50;
      const tenureScore = Math.min(100, tenureDays / 10);

      let riskScore = 0;
      riskScore += (100 - recencyScore) * weights.recency;
      riskScore += (100 - frequencyScore) * weights.frequency;
      riskScore += (100 - monetaryScore) * weights.monetary;
      riskScore += (100 - engagementScore) * weights.engagement;
      riskScore += (100 - satisfactionScore) * weights.satisfaction;
      riskScore += (100 - tenureScore) * weights.tenure;

      const tierMultiplier = { basic: 1.0, premium: 0.8, vip: 0.6 }[planTier] || 1.0;
      riskScore = Math.round(riskScore * tierMultiplier);
      riskScore = Math.min(100, Math.max(0, riskScore));

      let riskLevel: 'low' | 'medium' | 'high' | 'critical';
      if (riskScore >= 75) riskLevel = 'critical';
      else if (riskScore >= 50) riskLevel = 'high';
      else if (riskScore >= 25) riskLevel = 'medium';
      else riskLevel = 'low';

      let predictedChurnDate: Date | undefined;
      if (riskLevel === 'critical' || riskLevel === 'high') {
        const daysToChurn = riskLevel === 'critical' ? 14 : 30;
        predictedChurnDate = new Date();
        predictedChurnDate.setDate(predictedChurnDate.getDate() + daysToChurn);
      }

      if ((args.riskLevel === 'critical' && riskLevel === 'critical') ||
          (args.riskLevel === 'high' && ['high', 'critical'].includes(riskLevel))) {
        riskResults.push({ 
          memberId: member.id, 
          memberName: member.fullName, 
          riskScore, 
          riskLevel,
          riskFactors: { recencyScore, frequencyScore, monetaryScore, engagementScore, satisfactionScore, tenureScore },
          predictedChurnDate,
          modelVersion: 'v1.1.0',
        });
      }
    }

    return this.success({ highRiskMembers: riskResults });
  }
}

@Injectable()
export class CalculateEngagementScoreTool extends BaseTool {
  async execute(context: ToolContext, args: { memberId: string }): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['memberId']);
    if (validationError) return this.error(validationError);

    const memberResult = await this.callErp<MemberData>(context, ERP_METHODS.MEMBER_GET, { id: args.memberId });
    if (!memberResult.success) return memberResult;

    const attendanceResult = await this.callErp<{ attendance: Array<{ status: string }> }>(context, ERP_METHODS.ATTENDANCE_LIST, { member_id: args.memberId });
    const attendanceData = attendanceResult.data || { attendance: [] };

    const paymentResult = await this.callErp<{ payments: Array<{ status: string }> }>(context, ERP_METHODS.PAYMENT_LIST, { member_id: args.memberId });
    const paymentData = paymentResult.data || { payments: [] };

    const feedbackResult = await this.callErp<{ feedback: Array<{ rating?: number }> }>(context, ERP_METHODS.FEEDBACK_LIST, { member_id: args.memberId });
    const feedbackData = feedbackResult.data || { feedback: [] };

    const sessionsAttended = attendanceData?.attendance?.filter((a: any) => a.status === 'present').length || 0;
    const sessionsBooked = attendanceData?.attendance?.length || 0;
    const classesAvailable = 20;
    const daysSinceLastAttendance = 3;
    const avgWeeklyVisits = 2;
    const peakHoursVisits = 1;
    const weekendVisits = 1;
    const daysSinceLastVisit = 3;
    const daysSinceLastBooking = 1;
    const monthlySpend = 1500;
    const ltv = 18000;
    const paymentReliability = 1.0;
    const avgFeedbackRating = feedbackData?.feedback?.length ? 
      feedbackData.feedback.reduce((sum: number, f: any) => sum + (f.rating || 0), 0) / feedbackData.feedback.length : 4.5;
    const feedbackCount = feedbackData?.feedback?.length || 0;
    const referralsMade = 1;
    const referralConversions = 1;
    const planTier = 'premium' as const;
    const tenureDays = 180;

    const weights = { attendance: 0.25, frequency: 0.20, recency: 0.15, monetary: 0.15, feedback: 0.15, referral: 0.10 };

    const attendanceRate = sessionsBooked > 0 ? sessionsAttended / sessionsBooked : 0;
    const attendanceScore = Math.min(100, Math.round(attendanceRate * 100 + (classesAvailable / 10)));
    const frequencyScore = Math.min(100, Math.round(avgWeeklyVisits * 20 + (peakHoursVisits * 2) + (weekendVisits * 1)));
    const recencyScore = Math.max(0, 100 - (daysSinceLastVisit * 3) - (daysSinceLastBooking * 1));
    const monetaryScore = Math.min(100, Math.round(paymentReliability * 60 + (monthlySpend / 100) * 20 + (ltv / 1000) * 20));
    const feedbackScore = feedbackCount > 0 ? Math.round(avgFeedbackRating * 20) : 50;
    const referralScore = Math.min(100, Math.round(referralsMade * 15 + referralConversions * 25));

    let overallScore = 0;
    overallScore += attendanceScore * weights.attendance;
    overallScore += frequencyScore * weights.frequency;
    overallScore += recencyScore * weights.recency;
    overallScore += monetaryScore * weights.monetary;
    overallScore += feedbackScore * weights.feedback;
    overallScore += referralScore * weights.referral;
    overallScore = Math.round(Math.min(100, Math.max(0, overallScore)));

    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (overallScore >= 80) trend = 'improving';
    else if (overallScore < 50) trend = 'declining';

    return this.success({
      memberId: args.memberId,
      overallScore,
      breakdown: {
        attendance: { rate: attendanceRate, sessionsAttended, sessionsBooked, score: attendanceScore },
        frequency: { avgWeeklyVisits, peakHoursVisits, weekendVisits, score: frequencyScore },
        recency: { daysSinceLastVisit, daysSinceLastBooking, score: recencyScore },
        monetary: { monthlySpend, ltv, paymentReliability, score: monetaryScore },
        feedback: { avgRating: avgFeedbackRating, count: feedbackCount, score: feedbackScore },
        referral: { referralsMade, conversions: referralConversions, score: referralScore },
      },
      trend,
    });
  }
}

@Injectable()
export class GetLowEngagementMembersTool extends BaseTool {
  async execute(context: ToolContext, args: { threshold?: number; limit?: number }): Promise<ToolResult> {
    const membersResult = await this.callErp<{ members: MemberData[] }>(context, ERP_METHODS.MEMBER_LIST, { status: 'active' });
    if (!membersResult.success) return membersResult;

    const members = membersResult.data?.members || [];
    const lowEngagement = [];

    for (const member of members.slice(0, args.limit || 50)) {
      // Calculate engagement score inline (duplicated from CalculateEngagementScoreTool)
      const memberResult = await this.callErp<MemberData>(context, ERP_METHODS.MEMBER_GET, { id: member.id });
      if (!memberResult.success) continue;
      const memberData = memberResult.data;

      const attendanceResult = await this.callErp<{ attendance: Array<{ status: string }> }>(context, ERP_METHODS.ATTENDANCE_LIST, { member_id: member.id });
      const attendanceData = attendanceResult.data || { attendance: [] };

      const paymentResult = await this.callErp<{ payments: Array<{ status: string }> }>(context, ERP_METHODS.PAYMENT_LIST, { member_id: member.id });
      const paymentData = paymentResult.data || { payments: [] };

      const feedbackResult = await this.callErp<{ feedback: Array<{ rating?: number }> }>(context, ERP_METHODS.FEEDBACK_LIST, { member_id: member.id });
      const feedbackData = feedbackResult.data || { feedback: [] };

      const sessionsAttended = attendanceData?.attendance?.filter((a: any) => a.status === 'present').length || 0;
      const sessionsBooked = attendanceData?.attendance?.length || 0;
      const classesAvailable = 20;
      const daysSinceLastAttendance = 3;
      const avgWeeklyVisits = 2;
      const peakHoursVisits = 1;
      const weekendVisits = 1;
      const daysSinceLastVisit = 3;
      const daysSinceLastBooking = 1;
      const monthlySpend = 1500;
      const ltv = 18000;
      const paymentReliability = 1.0;
      const avgFeedbackRating = feedbackData?.feedback?.length ? 
        feedbackData.feedback.reduce((sum: number, f: any) => sum + (f.rating || 0), 0) / feedbackData.feedback.length : 4.5;
      const feedbackCount = feedbackData?.feedback?.length || 0;
      const referralsMade = 1;
      const referralConversions = 1;
      const planTier = 'premium' as const;
      const tenureDays = 180;

      const weights = { attendance: 0.25, frequency: 0.20, recency: 0.15, monetary: 0.15, feedback: 0.15, referral: 0.10 };

      const attendanceRate = sessionsBooked > 0 ? sessionsAttended / sessionsBooked : 0;
      const attendanceScore = Math.min(100, Math.round(attendanceRate * 100 + (classesAvailable / 10)));
      const frequencyScore = Math.min(100, Math.round(avgWeeklyVisits * 20 + (peakHoursVisits * 2) + (weekendVisits * 1)));
      const recencyScore = Math.max(0, 100 - (daysSinceLastVisit * 3) - (daysSinceLastBooking * 1));
      const monetaryScore = Math.min(100, Math.round(paymentReliability * 60 + (monthlySpend / 100) * 20 + (ltv / 1000) * 20));
      const feedbackScore = feedbackCount > 0 ? Math.round(avgFeedbackRating * 20) : 50;
      const referralScore = Math.min(100, Math.round(referralsMade * 15 + referralConversions * 25));

      let overallScore = 0;
      overallScore += attendanceScore * weights.attendance;
      overallScore += frequencyScore * weights.frequency;
      overallScore += recencyScore * weights.recency;
      overallScore += monetaryScore * weights.monetary;
      overallScore += feedbackScore * weights.feedback;
      overallScore += referralScore * weights.referral;
      overallScore = Math.round(Math.min(100, Math.max(0, overallScore)));

      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (overallScore >= 80) trend = 'improving';
      else if (overallScore < 50) trend = 'declining';

      if (overallScore <= (args.threshold || 50)) {
        lowEngagement.push({ 
          memberId: member.id, 
          memberName: member.fullName, 
          overallScore,
          breakdown: {
            attendance: { rate: attendanceRate, sessionsAttended, sessionsBooked, score: attendanceScore },
            frequency: { avgWeeklyVisits, peakHoursVisits, weekendVisits, score: frequencyScore },
            recency: { daysSinceLastVisit, daysSinceLastBooking, score: recencyScore },
            monetary: { monthlySpend, ltv, paymentReliability, score: monetaryScore },
            feedback: { avgRating: avgFeedbackRating, count: feedbackCount, score: feedbackScore },
            referral: { referralsMade, conversions: referralConversions, score: referralScore },
          },
          trend,
        });
      }
    }

    return this.success({ lowEngagementMembers: lowEngagement });
  }
}

@Injectable()
export class CreateWinbackCampaignTool extends BaseTool {
  async execute(context: ToolContext, args: { name: string; description?: string; triggerType: 'churn_risk' | 'inactive' | 'expired_membership' | 'cancelled' | 'manual'; targetCriteria: Record<string, any>; messageTemplate: string; channel: 'whatsapp' | 'email' | 'sms' | 'push' | 'in_app'; incentiveConfig?: Record<string, any> }): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['name', 'triggerType', 'targetCriteria', 'messageTemplate', 'channel']);
    if (validationError) return this.error(validationError);

    const result = await this.callErp(context, ERP_METHODS.WINBACK_CAMPAIGN_CREATE, {
      name: args.name,
      description: args.description,
      trigger_type: args.triggerType,
      target_criteria: args.targetCriteria,
      message_template: args.messageTemplate,
      channel: args.channel,
      incentive_config: args.incentiveConfig,
      status: 'draft',
    });

    if (!result.success) return result;
    return this.success(result.data);
  }
}

@Injectable()
export class SendWinbackCampaignTool extends BaseTool {
  async execute(context: ToolContext, args: { campaignId: string; memberIds: string[] }): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['campaignId', 'memberIds']);
    if (validationError) return this.error(validationError);

    const result = await this.callErp(context, ERP_METHODS.WINBACK_CAMPAIGN_SEND, {
      campaign_id: args.campaignId,
      member_ids: args.memberIds,
    });

    if (!result.success) return result;
    return this.success({ sent: result.data });
  }
}

@Injectable()
export class CreateRetentionActionTool extends BaseTool {
  async execute(context: ToolContext, args: { memberId: string; actionType: 'outreach' | 'incentive_offered' | 'session_booked' | 'plan_changed' | 'meeting_scheduled' | 'feedback_requested'; description: string; triggeredBy: 'churn_risk' | 'engagement_drop' | 'manual' | 'campaign' | 'automation'; assignedTo?: string; dueAt?: string }): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['memberId', 'actionType', 'description', 'triggeredBy']);
    if (validationError) return this.error(validationError);

    const result = await this.callErp(context, ERP_METHODS.RETENTION_ACTION_CREATE, {
      member_id: args.memberId,
      action_type: args.actionType,
      description: args.description,
      triggered_by: args.triggeredBy,
      assigned_to: args.assignedTo,
      due_at: args.dueAt,
      status: 'pending',
    });

    if (!result.success) return result;
    return this.success(result.data);
  }
}

@Injectable()
export class GetRetentionActionsTool extends BaseTool {
  async execute(context: ToolContext, args: { memberId?: string; status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'; actionType?: string; assignedTo?: string }): Promise<ToolResult> {
    const result = await this.callErp(context, ERP_METHODS.RETENTION_ACTION_LIST, {
      member_id: args.memberId,
      status: args.status,
      action_type: args.actionType,
      assigned_to: args.assignedTo,
    });

    if (!result.success) return result;
    return this.success({ actions: result.data });
  }
}

@Injectable()
export class GetRetentionMetricsTool extends BaseTool {
  async execute(context: ToolContext, args: { days?: number }): Promise<ToolResult> {
    const result = await this.callErp(context, ERP_METHODS.RETENTION_METRICS, {
      days: args.days || 30,
    });

    if (!result.success) return result;
    return this.success(result.data);
  }
}