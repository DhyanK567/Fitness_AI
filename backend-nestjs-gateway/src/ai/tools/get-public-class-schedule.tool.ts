import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';

interface ScheduleResponse {
  id: string;
  classType: string;
  className: string;
  startTime: string;
  endTime: string;
  capacity: number;
  availableSpots: number;
  trainer: string;
  location: string;
}

@Injectable()
export class GetPublicClassScheduleTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    super(undefined as any);
  }

  async execute(context: ToolContext, args: { days?: number; classTypeId?: string }): Promise<ToolResult> {
    const days = args.days || 7;

    // Validate tenant ID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.tenantId)) {
      return this.error('Invalid tenant ID format');
    }

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
          },
        });

        // Map booked count per class
        const bookingsByClassId = new Map<string, number>();
        for (const booking of confirmedBookings || []) {
          bookingsByClassId.set(booking.classId, (bookingsByClassId.get(booking.classId) || 0) + 1);
        }

        const schedules = classes.map((c) => {
          const bookedCount = bookingsByClassId.get(c.id) || 0;
          const availableSpots = c.capacity - bookedCount;

          const sessionDate = c.date instanceof Date
            ? c.date.toISOString().split('T')[0]
            : String(c.date).split('T')[0];

          return {
            id: c.id,
            classType: c.category,
            className: c.name,
            startTime: c.startTime,
            endTime: c.endTime || '',
            capacity: c.capacity,
            availableSpots: Math.max(0, availableSpots),
            trainer: c.trainer,
            location: c.room || 'Studio',
          };
        });

        return this.success({
          count: schedules.length,
          schedules,
          summary: `${schedules.length} public class session(s) available in the next ${days} days`,
        });
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PostgreSQL query failed';
      console.error(`[GetPublicClassScheduleTool] PostgreSQL query failed: ${errorMessage}`);
      return this.error(errorMessage, 'POSTGRES_QUERY_FAILED');
    }
  }
}