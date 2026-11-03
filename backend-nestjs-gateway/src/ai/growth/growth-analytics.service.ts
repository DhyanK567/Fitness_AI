import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class GrowthAnalyticsService {
  private readonly logger = new Logger(GrowthAnalyticsService.name);
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
   * Get member acquisition metrics
   */
  async getAcquisitionMetrics(
    context: ToolContext,
    args: { periodDays?: number; channel?: string; branchId?: string },
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const leadWhere: any = { tenantId: context.tenantId };
          if (args.channel) {
            leadWhere.source = { contains: args.channel, mode: 'insensitive' };
          }
          if (args.periodDays) {
            const sinceDate = new Date();
            sinceDate.setDate(sinceDate.getDate() - args.periodDays);
            leadWhere.createdAt = { gte: sinceDate };
          }

          const leads = await tx.studioLead.findMany({ where: leadWhere });
          const totalLeads = leads.length;
          const convertedLeads = leads.filter((l: any) => /converted|won|member/i.test(l.stage)).length;
          const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(1)) : 0;

          // Channel breakdown
          const channelMap = new Map<string, { leads: number; converted: number }>();
          for (const l of leads) {
            const ch = l.source || 'other';
            const curr = channelMap.get(ch) || { leads: 0, converted: 0 };
            curr.leads++;
            if (/converted|won|member/i.test(l.stage)) curr.converted++;
            channelMap.set(ch, curr);
          }

          const byChannel = Array.from(channelMap.entries()).map(([channel, stats]) => ({
            channel,
            leads: stats.leads,
            converted: stats.converted,
          }));

          // Status breakdown
          const statusMap = new Map<string, number>();
          for (const l of leads) {
            const st = l.stage || 'New';
            statusMap.set(st, (statusMap.get(st) || 0) + 1);
          }

          const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({
            status,
            count,
          }));

          return {
            success: true,
            data: {
              period_days: args.periodDays || 30,
              total_leads: totalLeads,
              converted_leads: convertedLeads,
              conversion_rate: conversionRate,
              cac: 0,
              by_channel: byChannel,
              by_status: byStatus,
              source: 'postgresql',
            },
          };
        });
      } catch (dbError) {
        this.logger.warn(
          `PostgreSQL query for acquisition metrics failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_ACQUISITION_METRICS || 'wellness_studio.api.growth.acquisition_metrics',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get acquisition metrics';
        this.logger.error(`getAcquisitionMetrics ERP fallback failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for acquisition metrics' };
  }

  /**
   * Get lifetime value metrics
   */
  async getLifetimeValueMetrics(
    context: ToolContext,
    args: { cohortBy?: string; periodMonths?: number },
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const periodMonths = args.periodMonths !== undefined ? args.periodMonths : 12;

          const [payments, members] = await Promise.all([
            tx.studioPayment.findMany({
              where: {
                tenantId: context.tenantId,
                status: { in: ['Paid', 'Completed', 'Settled'] },
              },
            }),
            tx.studioMember.findMany({
              where: { tenantId: context.tenantId },
            }),
          ]);

          const totalMembers = members.length;
          const netRevenue = payments.reduce((sum: number, p: any) => sum + (p.amount - (p.refundedAmount || 0)), 0);

          const historicalLtv = totalMembers > 0 ? Number((netRevenue / totalMembers).toFixed(2)) : 0;
          const effectiveMonths = Math.max(1, Math.min(periodMonths, 12));
          const avgMonthlyBilling = totalMembers > 0 ? (netRevenue / totalMembers) / effectiveMonths : 0;
          const projected12MonthLtv = Number((avgMonthlyBilling * 12).toFixed(2));

          // Group by joined cohort
          const memberCohortMap = new Map<string, string>();
          const cohortMap = new Map<string, { members: number; revenue: number }>();

          for (const m of members) {
            const cohortKey = m.joined ? new Date(m.joined).toISOString().slice(0, 7) : 'Unknown';
            memberCohortMap.set(m.id, cohortKey);
            const curr = cohortMap.get(cohortKey) || { members: 0, revenue: 0 };
            curr.members++;
            cohortMap.set(cohortKey, curr);
          }

          for (const p of payments) {
            const cohortKey = memberCohortMap.get(p.memberId);
            if (cohortKey && cohortMap.has(cohortKey)) {
              const curr = cohortMap.get(cohortKey)!;
              curr.revenue += (p.amount - (p.refundedAmount || 0));
            }
          }

          const cohorts = Array.from(cohortMap.entries())
            .map(([cohort, data]) => {
              const avg = data.members > 0 ? Number((data.revenue / data.members).toFixed(2)) : 0;
              return {
                cohort,
                members: data.members,
                total_revenue: Number(data.revenue.toFixed(2)),
                totalRevenue: Number(data.revenue.toFixed(2)),
                avg_ltv: avg,
                avgLtv: avg,
              };
            })
            .sort((a, b) => b.cohort.localeCompare(a.cohort))
            .slice(0, 12);

          return {
            success: true,
            data: {
              historicalLtv,
              projected12MonthLtv,
              avgCustomerLifetimeValue: historicalLtv,
              currency: 'INR',
              period_months: periodMonths,
              periodMonths,
              totalPayingMembers: totalMembers,
              netRevenue: Number(netRevenue.toFixed(2)),
              cohorts,
              formula: 'Historical LTV = Net Revenue / Total Members; 12M Projected = Monthly ARPU * 12',
              projectionLimitation: 'Projected 12M LTV assumes constant attendance and retention rates over the projection window.',
              source: 'postgresql',
            },
          };
        });
      } catch (dbError) {
        this.logger.warn(
          `PostgreSQL query for LTV metrics failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_LIFETIME_VALUE_METRICS || 'wellness_studio.api.growth.lifetime_value',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get LTV metrics';
        this.logger.error(`getLifetimeValueMetrics ERP fallback failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for LTV metrics' };
  }
}