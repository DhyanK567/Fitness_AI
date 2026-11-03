import { Injectable, Optional } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { PrismaService } from '../../common/prisma.service';

export interface CancelBookingArgs {
  bookingId: string;
  reason?: string;
  memberId?: string;
}

export interface BookingCancelResponse {
  id?: string;
  status?: string;
  cancelled?: boolean;
}

@Injectable()
export class CancelBookingTool extends BaseTool {
  constructor(
    erp: ErpnextService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    super(erp);
  }

  async execute(context: ToolContext, args: CancelBookingArgs | Record<string, any>): Promise<ToolResult> {
    // 1. Defense-in-depth: Ensure write actions only execute via confirmed pending action
    if (!context.isConfirmedPendingAction) {
      return this.error(
        'Direct execution blocked: cancelBooking requires explicit user confirmation via a pending action',
        'CONFIRMATION_REQUIRED',
      );
    }

    // 2. Validate mandatory required fields
    const validationError = this.validateRequired(args as unknown as Record<string, unknown>, ['bookingId']);
    if (validationError) return this.error(validationError, 'INVALID_ARGUMENTS');

    const bookingId = typeof args.bookingId === 'string' ? args.bookingId.trim() : '';
    if (!bookingId) {
      return this.error('bookingId must be a non-empty string', 'INVALID_ARGUMENTS');
    }

    const reason = typeof args.reason === 'string' ? args.reason.trim() : undefined;

    // 3. Resolve authoritative ERP member reference for ownership validation (fail-closed)
    let memberFilter: string | undefined;
    if (context.role === 'member') {
      const memberResolution = await this.resolveMemberRef(context);
      if (!memberResolution.success) {
        return this.error(memberResolution.error, memberResolution.errorCode);
      }
      memberFilter = memberResolution.memberRef;
    } else if (args.memberId) {
      const memberResolution = await this.resolveMemberRef(context, args.memberId);
      if (memberResolution.success) {
        memberFilter = memberResolution.memberRef;
      }
    }

    // 4. Dispatch to ERP booking cancellation method with idempotency key
    const result = await this.callErp<BookingCancelResponse>(
      context,
      ERP_METHODS.BOOKING_CANCEL,
      {
        tenant: context.tenantId,
        booking: bookingId,
        reason,
        member_filter: memberFilter,
        ...(context.idempotencyKey ? { idempotency_key: context.idempotencyKey } : {}),
      },
      'POST',
    );

    if (!result.success) {
      if (result.errorCode === 'TIMEOUT_UNCERTAIN') {
        // Attempt reconciliation to verify if booking was cancelled despite timeout
        try {
          const getRes = await this.callErp<any>(
            context,
            'wellness_studio.api.booking.get_booking',
            {
              tenant: context.tenantId,
              booking: bookingId,
              ...(memberFilter ? { member_filter: memberFilter } : {}),
            },
            'GET',
          );
          if (getRes.data && getRes.data.status === 'cancelled') {
            return this.success({
              bookingId,
              status: 'cancelled',
              reason,
              memberFilter,
              reconciled: true,
              summary: `Booking ${bookingId} has been successfully cancelled (Reconciled after upstream timeout)`,
            });
          }
        } catch {
          // Fall through to OUTCOME_UNCERTAIN
        }

        return this.error(
          `Cancellation request for ${bookingId} timed out. Verify your booking status before retrying.`,
          'OUTCOME_UNCERTAIN',
        );
      }
      return result;
    }

    return this.success({
      bookingId,
      status: 'cancelled',
      reason,
      memberFilter,
      summary: `Booking ${bookingId} has been successfully cancelled`,
    });
  }

  /**
   * Authoritatively resolve the ERP member reference.
   * - For members: strictly binds to trusted authenticated context (context.memberRef or userErpLink lookup).
   *   Client-supplied memberId arguments are never trusted or allowed to override caller identity.
   * - For staff/admin: resolves explicit memberId to ERP member reference if mapped, or allows direct ERP reference.
   * - Fails closed if member account is not linked.
   */
  private async resolveMemberRef(
    context: ToolContext,
    requestedMemberId?: string,
  ): Promise<{ success: true; memberRef: string } | { success: false; error: string; errorCode: string }> {
    if (context.role === 'member') {
      if (context.memberRef && typeof context.memberRef === 'string' && context.memberRef.trim()) {
        return { success: true, memberRef: context.memberRef.trim() };
      }

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
          return { success: true, memberRef: link.erpUserRef.trim() };
        }
      }

      return {
        success: false,
        error: 'Member account is not linked to a valid ERP member record',
        errorCode: 'MEMBER_NOT_LINKED',
      };
    }

    if (requestedMemberId && typeof requestedMemberId === 'string' && requestedMemberId.trim()) {
      const candidate = requestedMemberId.trim();

      if (this.prisma) {
        const link = await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.userErpLink.findFirst({
            where: {
              tenantId: context.tenantId,
              OR: [
                { userId: candidate },
                { erpUserRef: candidate },
              ],
            },
          }),
        );
        if (link?.erpUserRef && link.erpUserRef.trim()) {
          return { success: true, memberRef: link.erpUserRef.trim() };
        }
      }

      return { success: true, memberRef: candidate };
    }

    if (context.memberRef && typeof context.memberRef === 'string' && context.memberRef.trim()) {
      return { success: true, memberRef: context.memberRef.trim() };
    }

    return {
      success: false,
      error: 'An explicit memberId or authenticated memberRef is required',
      errorCode: 'INVALID_ARGUMENTS',
    };
  }
}
