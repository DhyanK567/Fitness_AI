import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class CompetitorIntelligenceService {
  private readonly logger = new Logger(CompetitorIntelligenceService.name);
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
   * Get competitor intelligence
   */
  async getCompetitorIntelligence(
    context: ToolContext,
    args: { competitorId?: string; radiusKm?: number; includeOnline?: boolean } = {},
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          if (args.competitorId) {
            const competitor = await tx.competitor.findFirst({
              where: { id: args.competitorId, tenantId: context.tenantId },
            });
            if (!competitor) {
              return { success: false, error: 'Competitor not found', errorCode: 'NOT_FOUND' };
            }
            return { success: true, data: { competitor } };
          }

          const where: any = {
            tenantId: context.tenantId,
            isActive: true,
          };
          if (args.radiusKm) {
            where.distanceKm = { lte: args.radiusKm };
          }

          const competitors = await tx.competitor.findMany({
            where,
            orderBy: { distanceKm: 'asc' },
          });

          return {
            success: true,
            data: {
              competitors,
              totalCompetitors: competitors.length,
            },
          };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get competitor intelligence';
        this.logger.error(`getCompetitorIntelligence failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_COMPETITOR_INTELLIGENCE || 'wellness_studio.api.marketing.competitor_intelligence',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get competitor intelligence';
        this.logger.error(`getCompetitorIntelligence failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'Database service is unavailable' };
  }
}