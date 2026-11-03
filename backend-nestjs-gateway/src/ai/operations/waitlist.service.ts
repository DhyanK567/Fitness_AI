import { Injectable, Logger } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private readonly erp: ErpnextService) {}

  /**
   * Manage waitlist operations
   * Uses the authoritative WS Booking model with status='Waitlisted'
   */
  async manageWaitlist(
    context: ToolContext,
    args: {
      action: 'view' | 'promote' | 'notify' | 'remove' | 'clear_expired';
      sessionId?: string;
      bookingId?: string;
      notifyCount?: number;
    },
  ): Promise<ToolResult> {
    try {
      // Map our arguments to the Frappe manage_waitlist function
      const frappeArgs: Record<string, unknown> = {
        action: args.action,
      };

      if (args.sessionId) {
        frappeArgs.session_id = args.sessionId;
      }
      if (args.bookingId) {
        frappeArgs.booking_id = args.bookingId;
      }
      if (args.notifyCount) {
        frappeArgs.notify_count = args.notifyCount;
      }

      const result = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.operations.manage_waitlist',
        body: frappeArgs,
      });
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to manage waitlist';
      this.logger.error(`manageWaitlist failed:`, error);
      return { success: false, error: errorMessage };
    }
  }
}