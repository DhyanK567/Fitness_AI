import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';

interface ScheduleResponse {
  id: string;
  classType: string;
  className: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  availableSpots: number;
  status: string;
}

@Injectable()
export class GetEligibleScheduleTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    super(undefined as any);
  }

  async execute(context: ToolContext, args: { 
    classTypeId?: string; 
    date?: string; 
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
  }): Promise<ToolResult> {
    // Validate tenant ID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.tenantId)) {
      return this.error('Invalid tenant ID format');
    }

    try {
      const result = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const now = new Date();
        const targetDate = args.date ? new Date(args.date) : now;
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Build where clause for StudioClass
        const classWhere: any = {
          tenantId: context.tenantId,
          status: 'Scheduled',
          date: {
            gte: startOfDay,
            lte: endOfDay,
          },
        };

        // Time of day filtering
        if (args.timeOfDay) {
          const timeRanges: Record<string, [string, string]> = {
            morning: ['05:00', '12:00'],
            afternoon: ['12:00', '17:00'],
            evening: ['17:00', '23:00'],
          };
          const [startTime, endTime] = timeRanges[args.timeOfDay];
          classWhere.startTime = {
            gte: startTime,
            lt: endTime,
          };
        }

        const classes = await tx.studioClass.findMany({
          where: classWhere,
          orderBy: [
            { date: 'asc' },
            { startTime: 'asc' },
          ],
        });

        if (!classes.length) {
          return this.success({
            count: 0,
            schedules: [],
            summary: 'No eligible sessions found',
          });
        }

        // Get confirmed bookings for these classes to calculate available spots
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

        const schedules: any[] = [];

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

          // Format date as YYYY-MM-DD
          const sessionDate = c.date instanceof Date
            ? c.date.toISOString().split('T')[0]
            : String(c.date).split('T')[0];

          schedules.push({
            id: c.id,
            classType: c.category,
            className: c.name,
            sessionDate,
            startTime: c.startTime,
            endTime: c.endTime || '',
            capacity: c.capacity,
            availableSpots,
            status: c.status,
          });
        }

        return this.success({
          count: schedules.length,
          schedules,
          summary: `${schedules.length} eligible session(s) found`,
        });
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PostgreSQL query failed';
      console.error(`[GetEligibleScheduleTool] PostgreSQL query failed: ${errorMessage}`);
      return this.error(errorMessage, 'POSTGRES_QUERY_FAILED');
    }
  }
}