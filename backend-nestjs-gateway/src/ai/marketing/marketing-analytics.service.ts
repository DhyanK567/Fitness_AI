import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class MarketingAnalyticsService {
  private readonly logger = new Logger(MarketingAnalyticsService.name);
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
   * Get campaign performance metrics
   */
  async getCampaignPerformance(
    context: ToolContext,
    args: { campaignId?: string; channel?: string; startDate?: string; endDate?: string; status?: string },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const where: any = {
            tenantId: context.tenantId,
          };
          if (args.campaignId) where.id = args.campaignId;
          if (args.channel) where.channel = args.channel;
          if (args.status) where.status = args.status;
          if (args.startDate && args.endDate) {
            const start = new Date(args.startDate);
            const end = new Date(args.endDate);
            end.setHours(23, 59, 59, 999);
            where.scheduleStart = { gte: start, lte: end };
          }

          const campaigns = await tx.marketingCampaign.findMany({
            where,
            orderBy: { createdAt: 'desc' },
          });

          const formattedCampaigns = campaigns.map((c: any) => {
            const storedMetrics = (c.metrics as Record<string, any>) || {};
            const impressions = Number(storedMetrics.impressions || 0);
            const clicks = Number(storedMetrics.clicks || 0);
            const conversions = Number(storedMetrics.conversions || 0);
            const spend = Number(c.budgetSpent || storedMetrics.spend || 0);
            const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
            const cpa = conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0;
            const attributedRevenue = Number(storedMetrics.attributedRevenue || 0);
            const roas = spend > 0 ? Number((attributedRevenue / spend).toFixed(2)) : 0;

            return {
              id: c.id,
              name: c.name,
              channel: c.channel,
              objective: c.objective,
              budgetAmount: c.budgetAmount,
              budgetSpent: spend,
              status: c.status,
              scheduleStart: c.scheduleStart instanceof Date ? c.scheduleStart.toISOString() : String(c.scheduleStart),
              scheduleEnd: c.scheduleEnd ? (c.scheduleEnd instanceof Date ? c.scheduleEnd.toISOString() : String(c.scheduleEnd)) : null,
              metrics: {
                impressions,
                clicks,
                conversions,
                spend,
                ctr,
                cpa,
                roas,
              },
            };
          });

          return {
            success: true,
            data: {
              campaigns: formattedCampaigns,
              totalCampaigns: formattedCampaigns.length,
            },
          };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get campaign performance';
        this.logger.error(`getCampaignPerformance failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_CAMPAIGN_PERFORMANCE || 'wellness_studio.api.marketing.campaign_performance',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get campaign performance';
        this.logger.error(`getCampaignPerformance failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'Database service is unavailable' };
  }
}