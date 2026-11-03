import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);
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
   * Create a marketing campaign
   */
  async createMarketingCampaign(
    context: ToolContext,
    args: {
      name: string;
      description?: string;
      channel: string;
      objective: string;
      targeting: Record<string, unknown>;
      creative: Record<string, unknown>;
      budget: { type: string; amount: number; currency: string };
      schedule: { startDate: string; endDate?: string; dayparting?: Array<{ dayOfWeek: number; startHour: number; endHour: number }> };
      landingPageUrl?: string;
      utmParams?: Record<string, string>;
    },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const campaign = await tx.marketingCampaign.create({
            data: {
              tenantId: context.tenantId,
              name: args.name,
              description: args.description || null,
              channel: args.channel,
              objective: args.objective,
              targeting: (args.targeting as any) || {},
              creative: (args.creative as any) || {},
              budgetType: args.budget.type,
              budgetAmount: args.budget.amount,
              budgetCurrency: args.budget.currency || 'INR',
              budgetSpent: 0,
              scheduleStart: new Date(args.schedule.startDate),
              scheduleEnd: args.schedule.endDate ? new Date(args.schedule.endDate) : null,
              dayparting: (args.schedule.dayparting as any) || [],
              landingPageUrl: args.landingPageUrl || null,
              utmParams: (args.utmParams as any) || {},
              status: 'draft',
              metrics: {},
              createdBy: context.userId,
            },
          });

          if (this.auditOutbox) {
            await this.auditOutbox.recordInTransaction(tx, {
              tenantId: context.tenantId,
              correlationId: context.correlationId,
              actorType: 'human',
              actorId: context.userId,
              action: 'ai.marketing.campaign.create',
              resourceType: 'marketing_campaign',
              resourceRef: campaign.id,
              eventType: 'marketing.campaign.created',
              payload: {
                campaignId: campaign.id,
                name: campaign.name,
                channel: campaign.channel,
                budgetAmount: campaign.budgetAmount,
              },
            });
          }

          return { success: true, data: campaign };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create marketing campaign';
        this.logger.error(`createMarketingCampaign failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.CREATE_MARKETING_CAMPAIGN || 'wellness_studio.api.marketing.create_marketing_campaign',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create marketing campaign';
        this.logger.error(`createMarketingCampaign failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'Database service is unavailable' };
  }
}