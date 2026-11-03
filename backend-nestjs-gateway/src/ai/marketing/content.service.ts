import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
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
   * Get content calendar
   */
  async getContentCalendar(
    context: ToolContext,
    args: { startDate: string; endDate: string; channel?: string; status?: string },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const start = new Date(args.startDate);
          const end = new Date(args.endDate);
          end.setHours(23, 59, 59, 999);

          const where: any = {
            tenantId: context.tenantId,
            scheduledAt: { gte: start, lte: end },
          };
          if (args.channel) where.channel = args.channel;
          if (args.status) where.status = args.status;

          const content = await tx.contentCalendar.findMany({
            where,
            orderBy: { scheduledAt: 'asc' },
          });

          return {
            success: true,
            data: {
              content,
              period: { start: args.startDate, end: args.endDate },
            },
          };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get content calendar';
        this.logger.error(`getContentCalendar failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_CONTENT_CALENDAR || 'wellness_studio.api.marketing.content_calendar',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get content calendar';
        this.logger.error(`getContentCalendar failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'Database service is unavailable' };
  }

  /**
   * Schedule content
   */
  async scheduleContent(
    context: ToolContext,
    args: {
      channel: string;
      contentType: string;
      title?: string;
      body: string;
      mediaUrls?: string[];
      scheduledAt: string;
      targetSegments: string[];
      utmParams?: Record<string, string>;
      abTestVariant?: string;
    },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const content = await tx.contentCalendar.create({
            data: {
              tenantId: context.tenantId,
              channel: args.channel,
              contentType: args.contentType,
              title: args.title || null,
              body: args.body,
              mediaUrls: args.mediaUrls || [],
              scheduledAt: new Date(args.scheduledAt),
              targetSegments: args.targetSegments || [],
              utmParams: (args.utmParams as any) || {},
              abTestVariant: args.abTestVariant || null,
              status: 'scheduled',
              createdBy: context.userId,
            },
          });

          if (this.auditOutbox) {
            await this.auditOutbox.recordInTransaction(tx, {
              tenantId: context.tenantId,
              correlationId: context.correlationId,
              actorType: 'human',
              actorId: context.userId,
              action: 'ai.marketing.content.schedule',
              resourceType: 'content_calendar',
              resourceRef: content.id,
              eventType: 'marketing.content.scheduled',
              payload: {
                contentId: content.id,
                channel: content.channel,
                contentType: content.contentType,
                scheduledAt: content.scheduledAt,
              },
            });
          }

          return { success: true, data: content };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to schedule content';
        this.logger.error(`scheduleContent failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.SCHEDULE_CONTENT || 'wellness_studio.api.marketing.schedule_content',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to schedule content';
        this.logger.error(`scheduleContent failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'Database service is unavailable' };
  }
}