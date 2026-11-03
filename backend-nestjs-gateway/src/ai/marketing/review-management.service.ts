import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class ReviewManagementService {
  private readonly logger = new Logger(ReviewManagementService.name);
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
   * Manage review response
   */
  async manageReviewResponse(
    context: ToolContext,
    args: { action: string; reviewId?: string; platform?: string; response?: string },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          if (args.action === 'view') {
            const where: any = { tenantId: context.tenantId };
            if (args.platform) where.platform = args.platform;
            if (args.reviewId) where.id = args.reviewId;

            const reviews = await tx.review.findMany({
              where,
              orderBy: { fetchedAt: 'desc' },
              take: 100,
            });
            return { success: true, data: { reviews } };
          }

          if (args.action === 'respond') {
            if (!args.reviewId || !args.response) {
              return { success: false, error: 'reviewId and response required for respond action', errorCode: 'VALIDATION_ERROR' };
            }

            const review = await tx.review.findFirst({
              where: { id: args.reviewId, tenantId: context.tenantId },
            });
            if (!review) {
              return { success: false, error: 'Review not found', errorCode: 'NOT_FOUND' };
            }

            const updated = await tx.review.update({
              where: { id: args.reviewId },
              data: {
                response: args.response,
                respondedAt: new Date(),
                respondedBy: context.userId,
                status: 'responded',
              },
            });

            if (this.auditOutbox) {
              await this.auditOutbox.recordInTransaction(tx, {
                tenantId: context.tenantId,
                correlationId: context.correlationId,
                actorType: 'human',
                actorId: context.userId,
                action: 'ai.marketing.review.respond',
                resourceType: 'review',
                resourceRef: updated.id,
                eventType: 'marketing.review.responded',
                payload: { reviewId: updated.id, platform: updated.platform },
              });
            }

            return { success: true, data: { responded: true, review: updated } };
          }

          if (args.action === 'flag' || args.action === 'escalate' || args.action === 'report') {
            if (!args.reviewId) {
              return { success: false, error: `reviewId required for ${args.action} action`, errorCode: 'VALIDATION_ERROR' };
            }

            const review = await tx.review.findFirst({
              where: { id: args.reviewId, tenantId: context.tenantId },
            });
            if (!review) {
              return { success: false, error: 'Review not found', errorCode: 'NOT_FOUND' };
            }

            const statusMap: Record<string, string> = {
              flag: 'flagged',
              escalate: 'escalated',
              report: 'reported',
            };
            const newStatus = statusMap[args.action];

            const updated = await tx.review.update({
              where: { id: args.reviewId },
              data: { status: newStatus },
            });

            if (this.auditOutbox) {
              await this.auditOutbox.recordInTransaction(tx, {
                tenantId: context.tenantId,
                correlationId: context.correlationId,
                actorType: 'human',
                actorId: context.userId,
                action: `ai.marketing.review.${args.action}`,
                resourceType: 'review',
                resourceRef: updated.id,
                eventType: `marketing.review.${newStatus}`,
                payload: { reviewId: updated.id, platform: updated.platform, status: newStatus },
              });
            }

            return { success: true, data: { [newStatus]: true } };
          }

          return { success: false, error: `Invalid review action '${args.action}'`, errorCode: 'INVALID_ACTION' };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to manage review response';
        this.logger.error(`manageReviewResponse failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const methodMap = {
          view: 'wellness_studio.api.marketing.reviews.view',
          respond: 'wellness_studio.api.marketing.reviews.respond',
          flag: 'wellness_studio.api.marketing.reviews.flag',
          escalate: 'wellness_studio.api.marketing.reviews.escalate',
          report: 'wellness_studio.api.marketing.reviews.report',
        };

        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: methodMap[args.action as keyof typeof methodMap] || ERP_METHODS.MANAGE_REVIEW_RESPONSE,
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to manage review response';
        this.logger.error(`manageReviewResponse failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'Database service is unavailable' };
  }
}