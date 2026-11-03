import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';

interface BookingHistoryResponse {
  id: string;
  classId: string;
  className: string;
  classCategory: string;
  classDate: string;
  startTime: string;
  endTime: string;
  trainer: string;
  room: string;
  status: string;
  bookedAt: string;
  attendedAt?: string;
}

interface MyBookingsArgs {
  status?: 'upcoming' | 'past' | 'cancelled' | 'all';
  limit?: number;
  offset?: number;
}

@Injectable()
export class GetMyBookingsTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    super(undefined as any);
  }

  async execute(context: ToolContext, args: MyBookingsArgs = {}): Promise<ToolResult> {
    const status = args.status || 'upcoming';
    const limit = Math.min(args.limit || 20, 50);
    const offset = args.offset || 0;

    // Validate tenant ID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.tenantId)) {
      return this.error('Invalid tenant ID format');
    }

    // For members, resolve memberId from context
    const memberId = await this.resolveMemberId(context);
    if (!memberId.success) return memberId;

    try {
      const result = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const now = new Date();

        const where: any = {
          tenantId: context.tenantId,
          memberId: memberId.data,
        };

        // Filter by status
        if (status === 'upcoming') {
          where.status = { in: ['Confirmed', 'Waitlisted'] };
        } else if (status === 'past') {
          where.status = { in: ['Confirmed', 'Attended', 'Completed'] };
        } else if (status === 'cancelled') {
          where.status = 'Cancelled';
        } else if (status === 'all') {
          where.status = { in: ['Confirmed', 'Waitlisted', 'Attended', 'Completed', 'Cancelled'] };
        }

        const [bookingRecords, total] = await Promise.all([
          tx.studioBooking.findMany({
            where,
            orderBy: [
              { bookedAt: 'desc' },
            ],
            take: limit,
            skip: offset,
          }),
          tx.studioBooking.count({ where }),
        ]);

        // Fetch class details separately since there's no explicit relation
        const classIds = [...new Set(bookingRecords.map((b: any) => b.classId))];
        const classes = await tx.studioClass.findMany({
          where: {
            tenantId: context.tenantId,
            id: { in: classIds },
          },
          select: {
            id: true,
            name: true,
            category: true,
            date: true,
            startTime: true,
            endTime: true,
            trainer: true,
            room: true,
          },
        });

        const classMap = new Map(classes.map((c: any) => [c.id, c]));

        // Filter by date for upcoming/past status
        const filteredRecords = bookingRecords.filter((b: any) => {
          const cls = classMap.get(b.classId);
          if (!cls) return true; // Include if class not found
          const classDate = new Date(cls.date);
          if (status === 'upcoming') return classDate >= new Date();
          if (status === 'past') return classDate < new Date();
          return true;
        });

        const bookings = filteredRecords.map((b: any) => {
          const cls = classMap.get(b.classId);
          const classDate = cls?.date ? (cls.date instanceof Date ? cls.date.toISOString().split('T')[0] : String(cls.date).split('T')[0]) : '';
          return {
            id: b.id,
            classId: b.classId,
            className: cls?.name || 'Unknown Class',
            classCategory: cls?.category || 'Unknown',
            classDate,
            startTime: cls?.startTime || '',
            endTime: cls?.endTime || '',
            trainer: cls?.trainer || 'TBA',
            room: cls?.room || 'Studio',
            status: b.status,
            bookedAt: b.bookedAt instanceof Date ? b.bookedAt.toISOString() : String(b.bookedAt),
            attendedAt: undefined, // StudioBooking doesn't have attendedAt
          };
        });

        return this.success({
          count: bookings.length,
          total,
          bookings,
          summary: `${bookings.length} booking(s) found (${total} total)`,
        });
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PostgreSQL query failed';
      console.error(`[GetMyBookingsTool] PostgreSQL query failed: ${errorMessage}`);
      return this.error(errorMessage, 'POSTGRES_QUERY_FAILED');
    }
  }

  private async resolveMemberId(
    context: ToolContext,
  ): Promise<{ success: true; data: string } | { success: false; error: string; errorCode: string }> {
    if (context.role === 'member') {
      // Priority 1: Trusted context memberRef
      if (context.memberRef && typeof context.memberRef === 'string' && context.memberRef.trim()) {
        return { success: true, data: context.memberRef.trim() };
      }

      // Priority 2: Database lookup via userErpLink
      if (this.prisma) {
        const link = await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.userErpLink.findFirst({
            where: {
              tenantId: context.tenantId,
              userId: context.userId,
            },
          }),
        );
        if (link?.erpUserRef && link.erpUserRef.trim()) {
          return { success: true, data: link.erpUserRef.trim() };
        }
      }

      return {
        success: false,
        error: 'Member account is not linked to a valid ERP member record',
        errorCode: 'MEMBER_NOT_LINKED',
      };
    }

    // Staff/admin: allow explicit memberId via context (not from args for security)
    if (context.memberRef && typeof context.memberRef === 'string' && context.memberRef.trim()) {
      return { success: true, data: context.memberRef.trim() };
    }

    return {
      success: false,
      error: 'Member identity could not be resolved',
      errorCode: 'MEMBER_NOT_LINKED',
    };
  }
}