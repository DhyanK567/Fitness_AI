import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';

interface EventResponse {
  id: string;
  title: string;
  category: string;
  eventDate: string;
  startTime: string;
  endTime: string | null;
  capacity: number;
  isPaid: boolean;
  price: number;
  audience: string;
  description?: string;
  availableSpots: number;
}

@Injectable()
export class GetPublicEventListTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    super(undefined as any);
  }

  async execute(context: ToolContext, args?: { limit?: number }): Promise<ToolResult> {
    const limit = args?.limit && args.limit > 0 ? Math.min(args.limit, 20) : 10;

    // Validate tenant ID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.tenantId)) {
      return this.error('Invalid tenant ID format');
    }

    try {
      const result = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const now = new Date();

        const events = await tx.studioEvent.findMany({
          where: {
            tenantId: context.tenantId,
            startAt: { gte: now },
          },
          orderBy: { startAt: 'asc' },
          take: limit,
        });

        // Note: StudioEvent model doesn't have audience, is_paid, price, confirmed_count, waitlist_count
        // These fields would need to be added to the Prisma schema for full parity
        const publicEvents = events.map((e) => {
          const eventDate = e.startAt instanceof Date
            ? e.startAt.toISOString().split('T')[0]
            : String(e.startAt).split('T')[0];
          const endTime = e.endAt
            ? (e.endAt instanceof Date ? e.endAt.toISOString().split('T')[1]?.substring(0, 5) : String(e.endAt).split('T')[1]?.substring(0, 5))
            : null;

          return {
            id: e.id,
            title: e.title,
            category: e.category,
            eventDate,
            startTime: e.startAt instanceof Date
              ? e.startAt.toISOString().split('T')[1]?.substring(0, 5)
              : String(e.startAt).split('T')[1]?.substring(0, 5),
            endTime,
            capacity: e.capacity || 0,
            isPaid: false, // Not available in current schema
            price: 0, // Not available in current schema
            audience: 'Public', // Default since audience field not in schema
            description: e.organizer ? `Organized by ${e.organizer}${e.venue ? ` at ${e.venue}` : ''}` : undefined,
            availableSpots: e.capacity ? Math.max(0, e.capacity - 0) : 0, // No confirmed_count in schema
          };
        });

        return this.success({
          count: publicEvents.length,
          events: publicEvents,
          summary: `${publicEvents.length} upcoming public event(s) found`,
        });
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PostgreSQL query failed';
      console.error(`[GetPublicEventListTool] PostgreSQL query failed: ${errorMessage}`);
      return this.error(errorMessage, 'POSTGRES_QUERY_FAILED');
    }
  }
}