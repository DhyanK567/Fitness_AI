import { Injectable, Logger, Optional, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

export interface ClassCancellationImpactArgs {
  sessionId: string;
}

export interface CancellationImpactResult {
  sessionId: string;
  className: string;
  sessionDate: string;
  startTime: string;
  trainer: string;
  capacity: number;
  bookedCount: number;
  waitlistCount: number;
  confirmedBookings: number;
  cancelledBookings: number;
  waitlistedBookings: number;
  affectedMembers: Array<{
    memberId: string;
    memberName: string;
    email: string;
    phone: string;
    bookingStatus: string;
    membershipPlan: string;
  }>;
  estimatedRevenueLoss: number;
  waitlistPromotions: number;
  recommendedActions: string[];
  cancelledAt: string | null;
}

@Injectable()
export class ClassCancellationImpactService {
  private readonly logger = new Logger(ClassCancellationImpactService.name);

  constructor(
    @Optional() private readonly prismaService?: PrismaService,
    @Optional() private readonly erpService?: any,
  ) {}

  /**
   * Analyze the impact of cancelling a class session
   * PostgreSQL-first implementation with ERPNext fallback
   */
  async getClassCancellationImpact(
    context: ToolContext,
    args: ClassCancellationImpactArgs,
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    const sessionId = args.sessionId;
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
      return { success: false, error: 'sessionId is required' };
    }

    // Try PostgreSQL first
    if (this.prismaService) {
      try {
        return await this.getImpactFromPostgres(context, args);
      } catch (dbError) {
        // Only fallback to ERPNext for connection errors, not for "not found" errors
        const errorMessage = (dbError as Error)?.message || '';
        if (errorMessage.includes('not found')) {
          return { success: false, error: errorMessage };
        }
        // Fallback to ERPNext for other errors
        this.logger.warn(`PostgreSQL query failed for cancellation impact, falling back to ERP: ${errorMessage}`);
      }
    }

    // Fallback to ERPNext
    if (this.erpService) {
      try {
        return await this.getImpactFromErp(context, args);
      } catch (erpError) {
        this.logger.error(`ERPNext cancellation impact failed:`, erpError);
        return { success: false, error: 'Cancellation impact analysis unavailable' };
      }
    }

    return { success: false, error: 'No persistence provider available for cancellation impact' };
  }

  private async getImpactFromPostgres(
    context: ToolContext,
    args: ClassCancellationImpactArgs,
  ): Promise<any> {
    const { sessionId } = args;

    const result = await this.prismaService!.withTenant(context.tenantId, async (prisma) => {
      // Get the session/class details
      const session = await prisma.studioClass.findFirst({
        where: {
          id: args.sessionId,
          tenantId: context.tenantId,
        },
      });

      if (!session) {
        throw new Error(`Session ${args.sessionId} not found`);
      }

      // Get bookings for this session
      const bookings = await prisma.studioBooking.findMany({
        where: {
          tenantId: context.tenantId,
          classId: args.sessionId,
        },
      });

      if (bookings.length === 0) {
        return {
          success: true,
          data: {
            sessionId: session.id,
            className: session.name,
            sessionDate: session.date.toISOString().split('T')[0],
            startTime: session.startTime,
            trainer: session.trainer,
            capacity: session.capacity,
            bookedCount: 0,
            waitlistCount: 0,
            confirmedBookings: 0,
            cancelledBookings: 0,
            waitlistedBookings: 0,
            affectedMembers: [],
            estimatedRevenueLoss: 0,
            waitlistPromotions: 0,
            recommendedActions: ['No bookings found for this session'],
            cancelledAt: session.status === 'Cancelled' ? session.updatedAt?.toISOString() : null,
          },
        };
      }

      // Get member details for the bookings
      const memberIds = [...new Set(bookings.map(b => b.memberId))];
      const members = await prisma.studioMember.findMany({
        where: {
          tenantId: context.tenantId,
          id: { in: memberIds },
        },
      });
      const memberMap = new Map(members.map(m => [m.id, m]));

      // Categorize bookings
      const waitlistBookings = bookings.filter(b => b.status === 'Waitlisted');
      const confirmedBookings = bookings.filter(b => b.status === 'Confirmed');
      const cancelledBookings = bookings.filter(b => b.status === 'Cancelled');

      // Get member details for affected members
      const affectedMembers = bookings.map(booking => {
        const member = memberMap.get(booking.memberId);
        return {
          memberId: booking.memberId,
          memberName: member?.fullName || 'Unknown',
          email: member?.email || '',
          phone: member?.phone || '',
          bookingStatus: booking.status,
          membershipPlan: member?.plan || 'Unknown',
        };
      });

      // Calculate revenue loss (placeholder - would need membership pricing)
      const estimatedRevenueLoss = confirmedBookings.length * 500;

      // Waitlist promotions possible
      const waitlistPromotions = Math.min(waitlistBookings.length, confirmedBookings.length);

      // Recommended actions
      const recommendedActions = [
        waitlistBookings.length > 0
          ? `Promote ${waitlistBookings.length} waitlisted member(s) to fill vacated spots`
          : 'No waitlist promotions available',
        cancelledBookings.length > 0
          ? `Process refunds/credits for ${cancelledBookings.length} previously cancelled booking(s)`
          : 'No prior cancellations to process',
        'Notify affected members via email/SMS about cancellation',
        'Update class schedule and notify instructor',
      ];

      return {
        success: true,
        data: {
          sessionId: session.id,
          className: session.name,
          sessionDate: session.date.toISOString().split('T')[0],
          startTime: session.startTime,
          trainer: session.trainer,
          capacity: session.capacity,
          bookedCount: bookings.length,
          waitlistCount: waitlistBookings.length,
          confirmedBookings: confirmedBookings.length,
          cancelledBookings: cancelledBookings.length,
          waitlistedBookings: waitlistBookings.length,
          affectedMembers,
          estimatedRevenueLoss,
          waitlistPromotions,
          recommendedActions,
          cancelledAt: session.status === 'Cancelled' ? session.updatedAt?.toISOString() : null,
        },
      };
    });

    return result;
  }

  private async getImpactFromErp(context: ToolContext, args: any): Promise<any> {
    // Fallback to ERPNext - return error result
    return { success: false, error: 'ERPNext cancellation impact not implemented' };
  }
}