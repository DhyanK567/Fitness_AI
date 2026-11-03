import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';

interface AvailabilityResponse {
  sessionId: string;
  bookedCount: number;
  error?: string;
}

@Injectable()
export class GetAvailabilityTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    super(undefined as any);
  }

  async execute(context: ToolContext, args: { sessionIds: string[] }): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['sessionIds']);
    if (validationError) return this.error(validationError);

    if (!Array.isArray(args.sessionIds) || args.sessionIds.length === 0) {
      return this.error('sessionIds must be a non-empty array');
    }

    if (args.sessionIds.length > 20) {
      return this.error('Maximum 20 sessions can be checked at once');
    }

    // Validate tenant ID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.tenantId)) {
      return this.error('Invalid tenant ID format');
    }

    try {
      const results = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const results: AvailabilityResponse[] = [];

        for (const sessionId of args.sessionIds) {
          try {
            const bookings = await tx.studioBooking.findMany({
              where: {
                tenantId: context.tenantId,
                classId: sessionId,
                status: 'Confirmed',
              },
            });

            results.push({
              sessionId,
              bookedCount: bookings.length,
            });
          } catch (error) {
            results.push({
              sessionId,
              bookedCount: 0,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        return this.success({
          availability: results,
          summary: `Checked availability for ${args.sessionIds.length} session(s)`,
        });
      });

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PostgreSQL query failed';
      console.error(`[GetAvailabilityTool] PostgreSQL query failed: ${errorMessage}`);
      return this.error(errorMessage, 'POSTGRES_QUERY_FAILED');
    }
  }
}