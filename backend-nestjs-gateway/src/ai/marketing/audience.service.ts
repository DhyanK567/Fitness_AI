import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class AudienceService {
  private readonly logger = new Logger(AudienceService.name);
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
   * Get audience segments
   */
  async getAudienceSegments(
    context: ToolContext,
    args: { segmentType?: string; minSize?: number } = {},
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const where: any = {
            tenantId: context.tenantId,
            status: 'active',
          };
          if (args.segmentType) where.segmentType = args.segmentType;
          if (args.minSize !== undefined && args.minSize > 0) {
            where.estimatedSize = { gte: args.minSize };
          }

          const segments = await tx.audienceSegment.findMany({
            where,
            orderBy: { createdAt: 'desc' },
          });

          return {
            success: true,
            data: {
              segments,
              totalSegments: segments.length,
            },
          };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get audience segments';
        this.logger.error(`getAudienceSegments failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_AUDIENCE_SEGMENTS || 'wellness_studio.api.marketing.audience_segments',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get audience segments';
        this.logger.error(`getAudienceSegments failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'Database service is unavailable' };
  }

  /**
   * Create an audience segment
   */
  async createAudienceSegment(
    context: ToolContext,
    args: {
      name: string;
      description?: string;
      segmentType: string;
      rules?: Record<string, unknown>;
      sourceSegmentId?: string;
      lookalikeConfig?: { sourceCountry?: string; similarityPercent: number };
    },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const segment = await tx.audienceSegment.create({
            data: {
              tenantId: context.tenantId,
              name: args.name,
              description: args.description || null,
              segmentType: args.segmentType,
              rules: (args.rules as any) || {},
              sourceSegmentId: args.sourceSegmentId || null,
              lookalikeConfig: (args.lookalikeConfig as any) || {},
              estimatedSize: 0,
              status: 'active',
              createdBy: context.userId,
            },
          });

          if (this.auditOutbox) {
            await this.auditOutbox.recordInTransaction(tx, {
              tenantId: context.tenantId,
              correlationId: context.correlationId,
              actorType: 'human',
              actorId: context.userId,
              action: 'ai.marketing.audience.create',
              resourceType: 'audience_segment',
              resourceRef: segment.id,
              eventType: 'marketing.audience.created',
              payload: {
                segmentId: segment.id,
                name: segment.name,
                segmentType: segment.segmentType,
              },
            });
          }

          return { success: true, data: segment };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create audience segment';
        this.logger.error(`createAudienceSegment failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.CREATE_AUDIENCE_SEGMENT || 'wellness_studio.api.marketing.create_audience_segment',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create audience segment';
        this.logger.error(`createAudienceSegment failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'Database service is unavailable' };
  }
}