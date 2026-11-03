import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class AttributionService {
  private readonly logger = new Logger(AttributionService.name);
  private readonly prismaService?: PrismaService;
  private readonly erpService?: ErpnextService;

  constructor(
    @Optional() prismaOrErp?: PrismaService | ErpnextService,
    @Optional() erp?: ErpnextService,
  ) {
    if (prismaOrErp && 'withTenant' in prismaOrErp) {
      this.prismaService = prismaOrErp as PrismaService;
      this.erpService = erp;
    } else if (prismaOrErp && 'call' in prismaOrErp) {
      this.erpService = prismaOrErp as ErpnextService;
    }
  }

  /**
   * Get lead attribution
   */
  async getLeadAttribution(
    context: ToolContext,
    args: { leadId?: string; periodDays?: number; attributionModel?: string },
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    const periodDays = args.periodDays !== undefined ? Number(args.periodDays) : 30;
    const attributionModel = args.attributionModel || 'data_driven';

    const validModels = ['first_touch', 'last_touch', 'linear', 'position_based', 'time_decay', 'data_driven'];
    if (!validModels.includes(attributionModel)) {
      return {
        success: false,
        error: `Unsupported attribution model '${attributionModel}'. Supported models: ${validModels.join(', ')}`,
      };
    }

    // 1. Try PostgreSQL if configured
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
            const isMultiTouchRequested = attributionModel !== 'first_touch' && !isLastTouch;

            let dataLimitation: string | null = null;
            let attributionResult: Record<string, number> = { [channel]: 1.0 };

            if (isLastTouch) {
              attributionResult = {};
              dataLimitation = `Verified last-touch attribution is unavailable. PostgreSQL currently stores only the lead's capture/acquisition source, not a verified sequence of marketing touchpoints. For granular multi-touch journeys, configure ERPNext Lead Touchpoints.`;
            } else if (isMultiTouchRequested) {
              dataLimitation = `Only single acquisition touchpoint recorded for lead in PostgreSQL. Multi-touch model '${attributionModel}' collapsed to initial touchpoint. For granular multi-touch journeys, configure ERPNext Lead Touchpoints.`;
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

          // Aggregate attribution
          const startDate = new Date(Date.now() - periodDays * 86400000);
          const leads = await tx.studioLead.findMany({
            where: {
              tenantId: context.tenantId,
              createdAt: { gte: startDate },
            },
            orderBy: { createdAt: 'desc' },
          });

          // An empty list is a valid result for this tenant and period; NOT a failure
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
                : 'Aggregate attribution grouped by acquisition channel source. Granular touchpoint sequences require ERPNext integration.',
            },
          };
        });
      } catch (dbError) {
        this.logger.warn(`Database query failed for lead attribution, falling back to ERP if configured: ${(dbError as Error)?.message}`);
      }
    }

    // 2. Fall back to ERPNext if configured
    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_LEAD_ATTRIBUTION || 'wellness_studio.api.marketing.lead_attribution',
          body: {
            lead_id: args.leadId,
            period_days: periodDays,
            attribution_model: attributionModel,
          },
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get lead attribution';
        this.logger.error(`getLeadAttribution failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return {
      success: false,
      error: 'No database or ERPNext provider available for lead attribution',
    };
  }
}