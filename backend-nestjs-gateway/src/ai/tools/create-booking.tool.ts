import { Injectable, Optional } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { PrismaService } from '../../common/prisma.service';

export interface CreateBookingArgs {
  classScheduleId: string;
  bookingDate: string;
  memberId?: string;
}

export interface BookingResponse {
  id?: string;
  booking_id?: string;
  status?: string;
  duplicate?: boolean;
}

@Injectable()
export class CreateBookingTool extends BaseTool {
  constructor(
    erp: ErpnextService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    super(erp);
  }

  async execute(context: ToolContext, args: CreateBookingArgs | Record<string, any>): Promise<ToolResult> {
    // 1. Defense-in-depth: Ensure write actions only execute via confirmed pending action
    if (!context.isConfirmedPendingAction) {
      return this.error(
        'Direct execution blocked: createBooking requires explicit user confirmation via a pending action',
        'CONFIRMATION_REQUIRED',
      );
    }

    // 2. Validate mandatory required fields
    const validationError = this.validateRequired(args as unknown as Record<string, unknown>, ['classScheduleId', 'bookingDate']);
    if (validationError) return this.error(validationError, 'INVALID_ARGUMENTS');

    const classScheduleId = typeof args.classScheduleId === 'string' ? args.classScheduleId.trim() : '';
    if (!classScheduleId) {
      return this.error('classScheduleId must be a non-empty string', 'INVALID_ARGUMENTS');
    }

    const bookingDate = typeof args.bookingDate === 'string' ? args.bookingDate.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      return this.error('bookingDate must be in YYYY-MM-DD format', 'INVALID_ARGUMENTS');
    }

    // 3. Resolve authoritative ERP member reference (fail-closed before ERPNext call)
    const memberResolution = await this.resolveMemberRef(context, args.memberId);
    if (!memberResolution.success) {
      return this.error(memberResolution.error, memberResolution.errorCode);
    }
    const targetMemberRef = memberResolution.memberRef;

    // 4. Dispatch to ERP booking creation method with idempotency key in payload & header
    const result = await this.callErp<BookingResponse>(
      context,
      'wellness_studio.api.booking.book_by_schedule',
      {
        tenant: context.tenantId,
        member: targetMemberRef,
        class_schedule_id: classScheduleId,
        booking_date: bookingDate,
        ...(context.idempotencyKey ? { idempotency_key: context.idempotencyKey } : {}),
      },
      'POST',
    );

    if (!result.success) {
      if (result.errorCode === 'TIMEOUT_UNCERTAIN') {
        // Network timeout / connection drop occurred after booking request was dispatched.
        // Attempt immediate authoritative reconciliation before reporting outcome.
        try {
          const listRes = await this.callErp<any[] | { bookings?: any[] }>(
            context,
            'wellness_studio.api.booking.list_bookings',
            {
              tenant: context.tenantId,
              member_filter: targetMemberRef,
            },
            'GET',
          );
          const bookingsList = Array.isArray(listRes.data)
            ? listRes.data
            : listRes.data?.bookings || [];

          // Authoritative reconciliation:
          // A booking only reconciles this timed-out operation if its durable idempotency key matches.
          // Never treat a pre-existing booking for the same schedule/date as proof of success.
          let reconciledBooking: any = null;

          if (context.idempotencyKey) {
            const keyMatches = bookingsList.filter(
              (b: any) =>
                b.idempotency_key &&
                b.idempotency_key === context.idempotencyKey &&
                b.status !== 'cancelled',
            );

            if (keyMatches.length === 1) {
              reconciledBooking = keyMatches[0];
            }
          }

          if (reconciledBooking) {
            const bookingId = reconciledBooking.id || reconciledBooking.name || reconciledBooking.booking_id;
            const status = reconciledBooking.status || 'confirmed';
            const isWaitlist = status === 'waitlisted';
            return this.success({
              bookingId,
              status,
              isWaitlist,
              classScheduleId,
              bookingDate,
              memberId: targetMemberRef,
              userId: context.userId,
              reconciled: true,
              summary: isWaitlist
                ? `Placed on waitlist for class schedule ${classScheduleId} on ${bookingDate} (Reconciled Ref: ${bookingId})`
                : `Class reservation confirmed for schedule ${classScheduleId} on ${bookingDate} (Reconciled Ref: ${bookingId})`,
            });
          }
        } catch {
          // Upstream reconciliation failed; fall through to OUTCOME_UNCERTAIN
        }

        return this.error(
          'Booking request dispatched, but confirmation timed out. Do not re-submit immediately; check your reservations to avoid duplicate bookings.',
          'OUTCOME_UNCERTAIN',
        );
      }
      return result;
    }

    const bookingId = result.data?.id || result.data?.booking_id;
    const status = result.data?.status || 'confirmed';
    const isWaitlist = status === 'waitlisted';

    return this.success({
      bookingId,
      status,
      isWaitlist,
      classScheduleId,
      bookingDate,
      memberId: targetMemberRef,
      userId: context.userId,
      summary: isWaitlist
        ? `Placed on waitlist for class schedule ${classScheduleId} on ${bookingDate} (Ref: ${bookingId})`
        : `Class reservation confirmed for schedule ${classScheduleId} on ${bookingDate} (Ref: ${bookingId})`,
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
      // Priority 1: Trusted context memberRef (already verified by auth guard)
      if (context.memberRef && typeof context.memberRef === 'string' && context.memberRef.trim()) {
        return { success: true, memberRef: context.memberRef.trim() };
      }

      // Priority 2: Database lookup via userErpLink within tenant boundaries
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

      // Fail-closed: unlinked member accounts cannot perform ERP writes
      return {
        success: false,
        error: 'Member account is not linked to a valid ERP member record',
        errorCode: 'MEMBER_NOT_LINKED',
      };
    }

    // Staff/admin caller:
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
      error: 'An explicit memberId or authenticated memberRef is required for booking',
      errorCode: 'INVALID_ARGUMENTS',
    };
  }
}
