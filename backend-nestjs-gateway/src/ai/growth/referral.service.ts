import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);
  private readonly prismaService?: PrismaService;
  private readonly erpService?: ErpnextService;

  constructor(
    @Optional() prismaOrErp?: PrismaService | ErpnextService,
    @Optional() erp?: ErpnextService,
    @Optional() private readonly auditOutbox?: AuditOutboxService,
  ) {
    if (prismaOrErp && 'withTenant' in prismaOrErp) {
      this.prismaService = prismaOrErp as PrismaService;
      this.erpService = erp;
    } else if (prismaOrErp && 'call' in prismaOrErp) {
      this.erpService = prismaOrErp as ErpnextService;
    }
  }

  /**
   * Get referral program metrics
   */
  async getReferralProgramMetrics(
    context: ToolContext,
    args: { periodDays?: number; status?: string },
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const referralWhere: any = { tenantId: context.tenantId };
          if (args.status) {
            referralWhere.status = args.status;
          }
          if (args.periodDays) {
            const sinceDate = new Date();
            sinceDate.setDate(sinceDate.getDate() - args.periodDays);
            referralWhere.referredAt = { gte: sinceDate };
          }

          const [referrals, campaigns, activeMembersCount] = await Promise.all([
            tx.referral.findMany({ where: referralWhere }),
            tx.referralCampaign.findMany({ where: { tenantId: context.tenantId } }),
            tx.studioMember.count({ where: { tenantId: context.tenantId, status: 'Active' } }),
          ]);

          const totalReferrals = referrals.length;
          const convertedReferrals = referrals.filter((r: any) => r.status === 'converted').length;
          const pendingReferrals = referrals.filter((r: any) => r.status === 'pending').length;
          const conversionRate = totalReferrals > 0 ? Number(((convertedReferrals / totalReferrals) * 100).toFixed(1)) : 0;
          const rewardsPaid = referrals.filter((r: any) => r.referrerRewardPaid).length;

          // Viral coefficient = Converted referrals / Active members (guarding against division by zero)
          const viralCoefficient = activeMembersCount > 0 ? Number((convertedReferrals / activeMembersCount).toFixed(2)) : 0;

          // Group by referrer member ID for top advocates
          const advocateCounts = new Map<string, { count: number; converted: number }>();
          for (const r of referrals) {
            const curr = advocateCounts.get(r.referrerMemberId) || { count: 0, converted: 0 };
            curr.count++;
            if (r.status === 'converted') curr.converted++;
            advocateCounts.set(r.referrerMemberId, curr);
          }

          const topAdvocates = Array.from(advocateCounts.entries())
            .map(([memberId, stats]) => ({
              memberId,
              referralCount: stats.count,
              convertedCount: stats.converted,
            }))
            .sort((a, b) => b.referralCount - a.referralCount)
            .slice(0, 10);

          return {
            success: true,
            data: {
              period_days: args.periodDays || 30,
              total_referrals: totalReferrals,
              converted_referrals: convertedReferrals,
              pending_referrals: pendingReferrals,
              conversion_rate: conversionRate,
              viral_coefficient: viralCoefficient,
              rewards_paid: rewardsPaid,
              active_campaigns_count: campaigns.filter((c: any) => c.status === 'active').length,
              topAdvocates,
              referralVelocity: totalReferrals > 0 ? `+${conversionRate}% conversion` : '0% MoM',
              viralCoefficient,
              source: 'postgresql',
            },
          };
        });
      } catch (dbError) {
        this.logger.warn(
          `PostgreSQL query for referral metrics failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_REFERRAL_METRICS || 'wellness_studio.api.referral.metrics',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get referral metrics';
        this.logger.error(`getReferralProgramMetrics ERP fallback failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for referral metrics' };
  }

  /**
   * Create a referral campaign
   */
  async createReferralCampaign(
    context: ToolContext,
    args: {
      name: string;
      description?: string;
      referrerIncentive: { type: string; value: number; description: string };
      refereeIncentive?: { type: string; value: number; description: string };
      validFrom: string;
      validUntil?: string;
      maxReferralsPerMember: number;
      eligibilityCriteria?: Record<string, unknown>;
    },
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const campaign = await tx.referralCampaign.create({
            data: {
              tenantId: context.tenantId,
              name: args.name,
              description: args.description || null,
              referrerIncentiveType: args.referrerIncentive.type,
              referrerIncentiveValue: Math.round(args.referrerIncentive.value),
              referrerIncentiveDescription: args.referrerIncentive.description,
              refereeIncentiveType: args.refereeIncentive?.type || null,
              refereeIncentiveValue: args.refereeIncentive ? Math.round(args.refereeIncentive.value) : null,
              refereeIncentiveDescription: args.refereeIncentive?.description || null,
              validFrom: new Date(args.validFrom),
              validUntil: args.validUntil ? new Date(args.validUntil) : null,
              maxReferralsPerMember: args.maxReferralsPerMember,
              eligibilityCriteria: (args.eligibilityCriteria as any) || {},
              status: 'active',
              createdBy: context.userId || '00000000-0000-0000-0000-000000000000',
            },
          });
          return { success: true, data: campaign };
        });
      } catch (dbError) {
        this.logger.warn(
          `Database insert for createReferralCampaign failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.CREATE_REFERRAL_CAMPAIGN || 'wellness_studio.api.referral.create_campaign',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create referral campaign';
        this.logger.error(`createReferralCampaign failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for createReferralCampaign' };
  }
}