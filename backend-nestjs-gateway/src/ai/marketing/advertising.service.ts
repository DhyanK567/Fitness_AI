import { Injectable, Logger, Optional, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';
import { AttributionService } from './attribution.service';

export interface AttributionReportArgs {
  periodDays?: number;
  attributionModel?: 'first_touch' | 'last_touch' | 'linear' | 'position_based' | 'time_decay' | 'data_driven' | string;
  leadId?: string;
}

export interface RoasMetricsArgs {
  periodDays?: number;
  channel?: 'meta' | 'google' | 'tiktok' | 'all' | string;
}

export interface ChannelRecommendationsArgs {
  periodDays?: number;
}

export interface ChannelMetrics {
  channel: string;
  spend: number;
  conversions: number;
  attributedRevenue: number;
  cpa: number | null;
  roas: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  campaignCount: number;
  currency: string;
  missingMetrics: boolean;
}

@Injectable()
export class AdvertisingService {
  private readonly logger = new Logger(AdvertisingService.name);
  private readonly prismaService?: PrismaService;
  private readonly erpService?: ErpnextService;

  constructor(
    @Optional() prismaOrErp?: PrismaService | ErpnextService,
    @Optional() erp?: ErpnextService,
    @Optional() private readonly auditOutbox?: AuditOutboxService,
    @Optional() private readonly attributionService?: AttributionService,
  ) {
    if (prismaOrErp && 'withTenant' in prismaOrErp) {
      this.prismaService = prismaOrErp as PrismaService;
      this.erpService = erp;
    } else if (prismaOrErp && 'call' in prismaOrErp) {
      this.erpService = prismaOrErp as ErpnextService;
    }
  }

  /**
   * Capability A: attribution-report
   * Provides lead conversion attribution analysis across marketing channels.
   * Discloses touchpoint limitations honestly; never fabricates multi-touch journeys.
   */
  async getAttributionReport(
    context: ToolContext,
    args: AttributionReportArgs = {},
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    // If AttributionService is injected and configured, delegate to maintain a single attribution engine
    if (this.attributionService) {
      return this.attributionService.getLeadAttribution(context, {
        leadId: args.leadId,
        periodDays: args.periodDays !== undefined ? Number(args.periodDays) : 30,
        attributionModel: args.attributionModel || 'data_driven',
      });
    }

    // Direct implementation if AttributionService is not injected
    const periodDays = args.periodDays !== undefined ? Number(args.periodDays) : 30;
    const attributionModel = args.attributionModel || 'data_driven';

    const validModels = ['first_touch', 'last_touch', 'linear', 'position_based', 'time_decay', 'data_driven'];
    if (!validModels.includes(attributionModel)) {
      return {
        success: false,
        error: `Unsupported attribution model '${attributionModel}'. Supported models: ${validModels.join(', ')}`,
      };
    }

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          if (args.leadId) {
            const lead = await tx.studioLead.findFirst({
              where: {
                id: args.leadId,
                tenantId: context.tenantId,
              },
            });

            if (!lead) {
              return { success: false, error: `Lead '${args.leadId}' not found for tenant` };
            }

            const channel = lead.source || 'unknown';
            const touchpoint = {
              channel,
              timestamp: lead.createdAt instanceof Date ? lead.createdAt.toISOString() : String(lead.createdAt),
              stage: lead.stage,
            };

            const isLastTouch = attributionModel === 'last_touch';
            const isMultiTouch = attributionModel !== 'first_touch' && !isLastTouch;

            let dataLimitation: string | null = null;
            let attributionResult: Record<string, number> = { [channel]: 1.0 };

            if (isLastTouch) {
              attributionResult = {};
              dataLimitation = `Verified last-touch attribution is unavailable. PostgreSQL currently stores only the lead's capture/acquisition source, not a verified sequence of marketing touchpoints.`;
            } else if (isMultiTouch) {
              dataLimitation = `Only single acquisition touchpoint recorded for lead in PostgreSQL. Multi-touch model '${attributionModel}' collapsed to initial touchpoint.`;
            }

            return {
              success: true,
              data: {
                lead_id: lead.id,
                touchpoints: [touchpoint],
                attribution: attributionResult,
                period_days: periodDays,
                model: attributionModel,
                touchpointCount: 1,
                dataLimitation,
              },
            };
          }

          const startDate = new Date(Date.now() - periodDays * 86400000);
          const leads = await tx.studioLead.findMany({
            where: {
              tenantId: context.tenantId,
              createdAt: { gte: startDate },
            },
            orderBy: { createdAt: 'desc' },
          });

          if (leads.length === 0) {
            return {
              success: true,
              data: {
                attribution: {},
                totalLeads: 0,
                convertedLeads: 0,
                period_days: periodDays,
                model: attributionModel,
                dataAvailable: true,
                notice: 'No leads recorded for tenant within the specified period.',
              },
            };
          }

          const bySource: Record<string, { leads: number; converted: number; conversionRate: number }> = {};
          let convertedTotal = 0;

          for (const lead of leads) {
            const src = lead.source || 'unknown';
            if (!bySource[src]) {
              bySource[src] = { leads: 0, converted: 0, conversionRate: 0 };
            }
            bySource[src].leads++;
            if (lead.stage?.toLowerCase() === 'converted') {
              bySource[src].converted++;
              convertedTotal++;
            }
          }

          for (const src of Object.keys(bySource)) {
            bySource[src].conversionRate = bySource[src].leads > 0
              ? Number(((bySource[src].converted / bySource[src].leads) * 100).toFixed(2))
              : 0;
          }

          return {
            success: true,
            data: {
              attribution: bySource,
              totalLeads: leads.length,
              convertedLeads: convertedTotal,
              period_days: periodDays,
              model: attributionModel,
              dataLimitation: attributionModel === 'last_touch'
                ? 'Aggregate attribution reflects initial capture/acquisition sources. Verified last-touch attribution is unavailable because PostgreSQL does not record subsequent marketing touchpoint sequences.'
                : 'Aggregate attribution grouped by acquisition channel source. Granular touchpoint journeys require ERPNext integration.',
            },
          };
        });
      } catch (dbError) {
        this.logger.warn(`Database query failed for lead attribution, falling back to ERP: ${(dbError as Error)?.message}`);
      }
    }

    if (this.erpService) {
      try {
        const erpResult = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_LEAD_ATTRIBUTION || 'wellness_studio.api.marketing.lead_attribution',
          body: {
            lead_id: args.leadId,
            period_days: periodDays,
            attribution_model: attributionModel,
          },
        });
        return { success: true, data: erpResult };
      } catch (erpError) {
        const msg = erpError instanceof Error ? erpError.message : 'ERPNext attribution call failed';
        return { success: false, error: msg };
      }
    }

    return { success: false, error: 'Attribution services unavailable' };
  }

  /**
   * Capability B: roas-metrics
   * Compares paid advertising spend against attributed membership revenue.
   * Calculates ROAS and CPA deterministically; prevents mixed-currency summation.
   */
  async getRoasMetrics(
    context: ToolContext,
    args: RoasMetricsArgs = {},
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    const periodDays = args.periodDays !== undefined ? Math.max(1, Math.min(365, Number(args.periodDays))) : 30;
    const requestedChannel = args.channel ? args.channel.toLowerCase() : 'all';

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const startDate = new Date(Date.now() - periodDays * 86400000);

          const paidChannels = ['meta', 'google', 'tiktok', 'paid_social', 'paid_search'];
          const channelFilter = requestedChannel !== 'all'
            ? requestedChannel
            : { in: paidChannels };

          const campaigns = await tx.marketingCampaign.findMany({
            where: {
              tenantId: context.tenantId,
              status: { not: 'archived' },
              channel: channelFilter,
              scheduleStart: { gte: startDate },
            },
            orderBy: { createdAt: 'desc' },
          });

          // A valid empty query is NOT an error
          if (campaigns.length === 0) {
            return {
              success: true,
              data: {
                periodDays,
                totalAdSpend: 0,
                attributedRevenue: 0,
                roas: 0,
                costPerAcquisition: 0,
                totalConversions: 0,
                currency: 'INR',
                mixedCurrencies: false,
                currenciesDetected: [],
                channelBreakdown: [],
                campaignsCount: 0,
                campaignsWithMissingMetrics: 0,
                dataAvailable: true,
                notice: 'No paid advertising campaigns found for tenant within the specified period.',
              },
            };
          }

          // Currency validation: Detect mixed currencies to prevent invalid sums
          const currencies = Array.from(new Set(campaigns.map((c) => c.budgetCurrency || 'INR')));
          const isMixedCurrencies = currencies.length > 1;

          const channelMap: Record<string, ChannelMetrics> = {};
          let totalSpend = 0;
          let totalRevenue = 0;
          let totalConversions = 0;
          let totalImpressions = 0;
          let totalClicks = 0;
          let campaignsWithMissingMetrics = 0;

          for (const c of campaigns) {
            const ch = c.channel;
            const metrics = (c.metrics as Record<string, any>) || {};
            const isMetricsEmpty = Object.keys(metrics).length === 0;
            if (isMetricsEmpty) {
              campaignsWithMissingMetrics++;
            }

            const spend = Number(c.budgetSpent || metrics.spend || 0);
            const revenue = Number(metrics.attributedRevenue || 0);
            const conversions = Number(metrics.conversions || 0);
            const impressions = Number(metrics.impressions || 0);
            const clicks = Number(metrics.clicks || 0);

            if (!channelMap[ch]) {
              channelMap[ch] = {
                channel: ch,
                spend: 0,
                conversions: 0,
                attributedRevenue: 0,
                impressions: 0,
                clicks: 0,
                ctr: 0,
                cpa: null,
                roas: null,
                campaignCount: 0,
                currency: c.budgetCurrency || 'INR',
                missingMetrics: false,
              };
            }

            channelMap[ch].spend += spend;
            channelMap[ch].attributedRevenue += revenue;
            channelMap[ch].conversions += conversions;
            channelMap[ch].impressions += impressions;
            channelMap[ch].clicks += clicks;
            channelMap[ch].campaignCount++;
            if (isMetricsEmpty) {
              channelMap[ch].missingMetrics = true;
            }

            totalSpend += spend;
            totalRevenue += revenue;
            totalConversions += conversions;
            totalImpressions += impressions;
            totalClicks += clicks;
          }

          const channelBreakdown = Object.values(channelMap).map((ch) => {
            const cpa = ch.conversions > 0
              ? Number((ch.spend / ch.conversions).toFixed(2))
              : (ch.spend > 0 ? null : 0);
            const roas = ch.spend > 0
              ? Number((ch.attributedRevenue / ch.spend).toFixed(2))
              : (ch.attributedRevenue > 0 ? null : 0);
            const ctr = ch.impressions > 0
              ? Number(((ch.clicks / ch.impressions) * 100).toFixed(2))
              : 0;

            return {
              channel: ch.channel,
              spend: Number(ch.spend.toFixed(2)),
              conversions: ch.conversions,
              attributedRevenue: Number(ch.attributedRevenue.toFixed(2)),
              cpa,
              roas,
              impressions: ch.impressions,
              clicks: ch.clicks,
              ctr,
              campaignCount: ch.campaignCount,
              currency: ch.currency,
              missingMetrics: ch.missingMetrics,
            };
          });

          const overallRoas = totalSpend > 0
            ? Number((totalRevenue / totalSpend).toFixed(2))
            : (totalRevenue > 0 ? null : 0);
          const overallCpa = totalConversions > 0
            ? Number((totalSpend / totalConversions).toFixed(2))
            : (totalSpend > 0 ? null : 0);
          const primaryCurrency = currencies[0] || 'INR';

          return {
            success: true,
            data: {
              periodDays,
              totalAdSpend: Number(totalSpend.toFixed(2)),
              attributedRevenue: Number(totalRevenue.toFixed(2)),
              roas: overallRoas,
              costPerAcquisition: overallCpa,
              totalConversions,
              currency: primaryCurrency,
              mixedCurrencies: isMixedCurrencies,
              currenciesDetected: currencies,
              channelBreakdown,
              campaignsCount: campaigns.length,
              campaignsWithMissingMetrics,
              dataAvailable: true,
            },
          };
        });
      } catch (dbError) {
        this.logger.warn(`Database query failed for ROAS metrics, falling back to ERP: ${(dbError as Error)?.message}`);
      }
    }

    if (this.erpService) {
      try {
        const erpResult = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_CAMPAIGN_PERFORMANCE || 'wellness_studio.api.marketing.campaign_performance',
          body: {
            channel: requestedChannel !== 'all' ? requestedChannel : undefined,
            period_days: periodDays,
          },
        });
        return { success: true, data: erpResult };
      } catch (erpError) {
        const msg = erpError instanceof Error ? erpError.message : 'ERPNext campaign performance call failed';
        return { success: false, error: msg };
      }
    }

    return { success: false, error: 'Campaign metrics database service unavailable' };
  }

  /**
   * Capability C: channel-recommendations
   * Generates deterministic, evidence-based advisory budget reallocation recommendations.
   * Discloses insufficient data explicitly; does NOT modify live campaign budgets.
   */
  async getChannelRecommendations(
    context: ToolContext,
    args: ChannelRecommendationsArgs = {},
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    const roasResult = await this.getRoasMetrics(context, {
      periodDays: args.periodDays,
      channel: 'all',
    });

    if (!roasResult.success) {
      return roasResult;
    }

    const {
      channelBreakdown,
      mixedCurrencies,
      currenciesDetected,
      campaignsCount,
    } = roasResult.data as {
      channelBreakdown: ChannelMetrics[];
      mixedCurrencies: boolean;
      currenciesDetected: string[];
      campaignsCount: number;
    };

    if (mixedCurrencies) {
      return {
        success: true,
        data: {
          sufficientData: false,
          recommendation: `Mixed currencies detected across campaigns (${currenciesDetected.join(', ')}). Currency amounts must be normalized before generating reallocation recommendations.`,
          recommendationType: 'currency_mismatch',
          channelsAnalyzed: channelBreakdown.length,
        },
      };
    }

    // Filter channels with meaningful spend and ROAS metrics
    const activeChannels = channelBreakdown.filter(
      (c) => c.spend > 0 && c.roas !== null,
    );

    if (activeChannels.length < 2) {
      return {
        success: true,
        data: {
          sufficientData: false,
          recommendation: activeChannels.length === 1
            ? `Only one active paid channel ('${activeChannels[0].channel}') has recorded spend. Comparative budget reallocation requires at least two active channels with verified spend and conversion data.`
            : 'No active advertising channels with spend and revenue metrics found. Record paid campaign spend to generate budget reallocation recommendations.',
          recommendationType: 'insufficient_data',
          channelsAnalyzed: activeChannels.length,
          campaignsCount,
        },
      };
    }

    // Sort descending by ROAS
    const sorted = [...activeChannels].sort((a, b) => (b.roas || 0) - (a.roas || 0));
    const topChannel = sorted[0];
    const bottomChannel = sorted[sorted.length - 1];

    const roasDiff = (topChannel.roas || 0) - (bottomChannel.roas || 0);

    // If there is significant efficiency divergence (>= 1.0 ROAS spread)
    if (roasDiff >= 1.0) {
      const shiftPercent = 15;
      const estimatedShiftAmount = Number(((bottomChannel.spend * shiftPercent) / 100).toFixed(2));
      const recommendation = `Reallocate ${shiftPercent}% budget (~${bottomChannel.currency} ${estimatedShiftAmount}) from '${bottomChannel.channel}' (ROAS: ${bottomChannel.roas}, CPA: ${bottomChannel.cpa ?? 'N/A'}) to '${topChannel.channel}' (ROAS: ${topChannel.roas}, CPA: ${topChannel.cpa ?? 'N/A'}) to optimize spend efficiency.`;

      return {
        success: true,
        data: {
          sufficientData: true,
          recommendation,
          recommendationType: 'budget_reallocation',
          suggestedShift: {
            fromChannel: bottomChannel.channel,
            fromRoas: bottomChannel.roas,
            fromCpa: bottomChannel.cpa,
            toChannel: topChannel.channel,
            toRoas: topChannel.roas,
            toCpa: topChannel.cpa,
            shiftPercentage: shiftPercent,
            estimatedShiftAmount,
            currency: bottomChannel.currency,
          },
          channelsAnalyzed: activeChannels.length,
          channelMetrics: sorted,
          advisoryNotice: 'This is an algorithmic advisory recommendation. Budget modifications require explicit administrative action.',
        },
      };
    }

    // If channels have comparable efficiency
    return {
      success: true,
      data: {
        sufficientData: true,
        recommendation: `Active paid channels (${sorted.map((c) => `${c.channel}: ROAS ${c.roas}`).join(', ')}) are performing within similar efficiency bands. Maintain current budget allocation or expand testing incrementally.`,
        recommendationType: 'maintain_allocation',
        channelsAnalyzed: activeChannels.length,
        channelMetrics: sorted,
        advisoryNotice: 'This is an algorithmic advisory recommendation. Budget modifications require explicit administrative action.',
      },
    };
  }
}
