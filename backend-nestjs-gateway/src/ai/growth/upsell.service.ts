import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class UpsellService {
  private readonly logger = new Logger(UpsellService.name);
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
   * Get upsell opportunities
   */
  async getUpsellOpportunities(
    context: ToolContext,
    args: { memberId?: string; opportunityType?: string; minScore?: number; limit?: number },
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const memberWhere: any = {
            tenantId: context.tenantId,
            status: 'Active',
          };
          if (args.memberId) {
            memberWhere.id = args.memberId;
          }

          const members = await tx.studioMember.findMany({
            where: memberWhere,
            take: args.limit ? Math.max(args.limit * 2, 50) : 100,
          });

          if (members.length === 0) {
            return {
              success: true,
              data: {
                candidates: [],
                upsellCandidates: [],
                totalCandidates: 0,
                source: 'postgresql',
              },
            };
          }

          const memberIds = members.map((m: any) => m.id);
          const bookings = await tx.studioBooking.findMany({
            where: {
              tenantId: context.tenantId,
              memberId: { in: memberIds },
              status: { in: ['Confirmed', 'Attended', 'Completed'] },
            },
          });

          const bookingCounts = new Map<string, number>();
          for (const b of bookings) {
            bookingCounts.set(b.memberId, (bookingCounts.get(b.memberId) || 0) + 1);
          }

          const minScore = args.minScore !== undefined ? args.minScore : 70;
          const candidates: any[] = [];

          for (const member of members) {
            const visits = bookingCounts.get(member.id) || 0;
            const currentPlan = member.plan || 'Standard';

            const isLowerTier = /basic|flex|10-class|standard/i.test(currentPlan);

            let score = 50;
            if (visits >= 12) score += 40;
            else if (visits >= 8) score += 35;
            else if (visits >= 4) score += 20;

            if (isLowerTier) score += 10;

            let recommendedPlan = 'Monthly Unlimited';
            if (/yoga/i.test(currentPlan) || visits > 10) {
              recommendedPlan = 'VIP Yoga + Gym Combo';
            } else if (/basic|10-class/i.test(currentPlan)) {
              recommendedPlan = 'Monthly Unlimited';
            }

            if (score >= minScore) {
              candidates.push({
                memberId: member.id,
                name: member.fullName,
                currentPlan,
                recommendedPlan,
                confidence: Number((score / 100).toFixed(2)),
                visitsThisMonth: visits,
                opportunityType: args.opportunityType || 'plan_upgrade',
                reason: `High visit frequency (${visits} sessions) on ${currentPlan} plan. Recommended upgrade to ${recommendedPlan}.`,
              });
            }
          }

          candidates.sort((a, b) => b.confidence - a.confidence);
          const limitedCandidates = args.limit ? candidates.slice(0, args.limit) : candidates;

          return {
            success: true,
            data: {
              candidates: limitedCandidates,
              upsellCandidates: limitedCandidates,
              totalCandidates: limitedCandidates.length,
              source: 'postgresql',
            },
          };
        });
      } catch (dbError) {
        this.logger.warn(
          `PostgreSQL query for upsell opportunities failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_UPSELL_OPPORTUNITIES || 'wellness_studio.api.growth.upsell_opportunities',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get upsell opportunities';
        this.logger.error(`getUpsellOpportunities ERP fallback failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for upsell opportunities' };
  }

  /**
   * Create an upsell offer
   */
  async createUpsellOffer(
    context: ToolContext,
    args: {
      memberId?: string;
      segmentId?: string;
      offerType: string;
      offerDetails: Record<string, unknown>;
      discountPercent?: number;
      validUntil: string;
      triggerEvent?: string;
    },
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const offer = await tx.upsellOffer.create({
            data: {
              tenantId: context.tenantId,
              memberId: args.memberId || null,
              segmentId: args.segmentId || null,
              offerType: args.offerType,
              offerDetails: (args.offerDetails as any) || {},
              discountPercent: args.discountPercent !== undefined ? Math.round(args.discountPercent) : null,
              validUntil: new Date(args.validUntil),
              triggerEvent: args.triggerEvent || 'manual',
              status: 'active',
            },
          });
          return { success: true, data: offer };
        });
      } catch (dbError) {
        this.logger.warn(
          `Database insert for createUpsellOffer failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.CREATE_UPSELL_OFFER || 'wellness_studio.api.growth.create_upsell_offer',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create upsell offer';
        this.logger.error(`createUpsellOffer failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for createUpsellOffer' };
  }
}