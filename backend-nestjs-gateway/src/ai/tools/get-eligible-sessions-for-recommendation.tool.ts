import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { RecommendationsService } from '../../modules/recommendations/recommendations.service';

interface ScheduleResponse {
  id: string;
  classType: string;
  className: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  availableSpots: number;
  trainer: string;
}

@Injectable()
export class GetEligibleSessionsForRecommendationTool extends BaseTool {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly recommendationsService?: RecommendationsService,
  ) {
    super(undefined as any);
  }

  async execute(
    context: ToolContext,
    args?: { days?: number; goal?: string; level?: string },
  ): Promise<ToolResult> {
    const days = args?.days || 7;

    // Validate tenant ID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.tenantId)) {
      return this.error('Invalid tenant ID format');
    }

    // 1. Delegate to domain recommendations service when available (PostgreSQL-first)
    if (this.recommendationsService) {
      try {
        const recResult = await this.recommendationsService.getRecommendations(context, {
          days,
          goal: args?.goal,
          level: args?.level,
          memberId: context.userId,
        });

        if (recResult.success && Array.isArray(recResult.data)) {
          const sessions = recResult.data.map((s) => ({
            id: s.sessionId || s.session_id,
            classType: s.category || 'General',
            className: s.className || s.class_name,
            sessionDate: s.date || s.session_date,
            startTime: s.startTime || s.start_time,
            endTime: s.endTime || s.end_time || '',
            availableSpots: s.availableSpots ?? s.available_spots ?? 0,
            trainer: s.trainer,
          }));

          return this.success({
            count: sessions.length,
            sessions,
            summary: `${sessions.length} eligible and available session(s) in the next ${days} days`,
          });
        }
      } catch (error) {
        console.error(`[GetEligibleSessionsForRecommendationTool] RecommendationsService failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Fall through to direct PostgreSQL query
      }
    }

    // 2. Direct PostgreSQL query (simplified version matching ERP response format)
    try {
      const result = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const now = new Date();
        const maxDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        // Find upcoming scheduled classes
        const classes = await tx.studioClass.findMany({
          where: {
            tenantId: context.tenantId,
            status: 'Scheduled',
            date: {
              gte: now,
              lte: maxDate,
            },
          },
          orderBy: [
            { date: 'asc' },
            { startTime: 'asc' },
          ],
        });

        // Get confirmed bookings for these classes
        const classIds = classes.map((c: any) => c.id);
        const confirmedBookings = await tx.studioBooking.findMany({
          where: {
            tenantId: context.tenantId,
            classId: { in: classIds },
            status: 'Confirmed',
          },
          select: {
            classId: true,
            memberId: true,
          },
        });

        // Map booked count per class and detect classes already booked by the member
        const bookingsByClassId = new Map<string, number>();
        const memberBookedClassIds = new Set<string>();

        for (const booking of confirmedBookings || []) {
          bookingsByClassId.set(booking.classId, (bookingsByClassId.get(booking.classId) || 0) + 1);
          if (booking.memberId === context.userId) {
            memberBookedClassIds.add(booking.classId);
          }
        }

        const sessions: any[] = [];

        for (const c of classes) {
          // Exclude if already booked by this member
          if (memberBookedClassIds.has(c.id)) {
            continue;
          }

          const bookedCount = bookingsByClassId.get(c.id) || 0;
          const availableSpots = c.capacity - bookedCount;

          // Candidate eligibility: must have confirmed capacity available
          if (availableSpots <= 0) {
            continue;
          }

          const sessionDate = c.date instanceof Date
            ? c.date.toISOString().split('T')[0]
            : String(c.date).split('T')[0];

          sessions.push({
            id: c.id,
            classType: c.category,
            className: c.name,
            sessionDate,
            startTime: c.startTime,
            endTime: c.endTime || '',
            availableSpots,
            trainer: c.trainer,
          });
        }

        return this.success({
          count: sessions.length,
          sessions,
          summary: `${sessions.length} eligible and available session(s) in the next ${days} days`,
        });
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PostgreSQL query failed';
      console.error(`[GetEligibleSessionsForRecommendationTool] PostgreSQL query failed: ${errorMessage}`);
      return this.error(errorMessage, 'POSTGRES_QUERY_FAILED');
    }
  }
}