import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';

@Injectable()
export class GetMemberAttendanceSummaryTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    // Parent BaseTool requires ErpnextService, but we make it optional
    // since this tool is PostgreSQL-first and doesn't require ERPNext
    super(undefined as any);
  }

  async execute(context: ToolContext, args: { days?: number }): Promise<ToolResult> {
    const days = args?.days || 30;

    // Validate tenant ID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.tenantId)) {
      return this.error('Invalid tenant ID format');
    }

    try {
      const result = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const memberBookings = await tx.studioBooking.findMany({
          where: {
            tenantId: context.tenantId,
            memberId: context.userId,
            bookedAt: { gte: cutoff },
          },
          select: {
            id: true,
            classId: true,
          },
        });

        const totalCount = memberBookings.length;
        if (totalCount === 0) {
          return this.success({
            totalSessions: 0,
            attended: 0,
            missed: 0,
            attendanceRate: 0,
            byClassType: {},
            periodDays: days,
            summary: `No recorded sessions in the last ${days} days`,
          });
        }

        const bookingIds = memberBookings.map((b) => b.id);
        const attendances = await tx.studioAttendance.findMany({
          where: {
            tenantId: context.tenantId,
            bookingId: { in: bookingIds },
            status: 'Present',
          },
        });

        const attendedBookingIds = new Set(attendances.map((a) => a.bookingId));
        const presentCount = attendances.length;

        // Query class categories for attended bookings
        const attendedClassIds = memberBookings
          .filter((b) => attendedBookingIds.has(b.id))
          .map((b) => b.classId);

        const classes = attendedClassIds.length > 0
          ? await tx.studioClass.findMany({
              where: {
                tenantId: context.tenantId,
                id: { in: attendedClassIds },
              },
              select: { category: true },
            })
          : [];

        const byClassType: Record<string, number> = {};
        for (const c of classes) {
          const cat = c.category || 'General';
          byClassType[cat] = (byClassType[cat] || 0) + 1;
        }

        const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
        return this.success({
          totalSessions: totalCount,
          attended: presentCount,
          missed: totalCount - presentCount,
          attendanceRate,
          byClassType,
          periodDays: days,
          summary: `Attended ${presentCount} of ${totalCount} sessions (${attendanceRate}%) in the last ${days} days`,
        });
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PostgreSQL query failed';
      console.error(`[GetMemberAttendanceSummaryTool] PostgreSQL query failed: ${errorMessage}`);
      return this.error(errorMessage, 'POSTGRES_QUERY_FAILED');
    }
  }
}
