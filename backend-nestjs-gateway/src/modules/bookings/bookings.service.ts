import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';

type Context = { tenantId: string; tenantCode: string; correlationId: string; memberRef?: string; actorId?: string; roles?: string[] };
type BookingInput = { member_id?: string; class_schedule_id: string; booking_date: string; payment_id?: string | null };
type BookingResult = { id: string; status: string; duplicate?: boolean };
const TRAINER_ROLES = new Set(['trainer', 'coach', 'lead_trainer']);
const isTrainerScoped = (roles?: string[]) => roles?.some((role) => TRAINER_ROLES.has(role.trim().toLowerCase())) ?? false;

@Injectable()
export class BookingsService {
  constructor(private readonly erp: ErpnextService, private readonly auditOutbox?: AuditOutboxService, private readonly prisma?: PrismaService) {}

  async findAll(context: any): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const memberId = context.role === 'member' ? context.userId : undefined;
    try {
      const res = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: 'fitness.booking.list',
        body: { member_id: memberId },
      }) as any;
      const data = res?.bookings || res || [];
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async findOne(context: any, id: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: 'fitness.booking.get',
        body: { id },
      }) as any;
      if (context.role === 'member' && res?.member_id !== context.userId) {
        return { success: false, error: '404 Not Found' };
      }
      return { success: true, data: res };
    } catch (e: any) {
      return { success: false, error: e.message || '404 Not Found' };
    }
  }

  async list(context: Context) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const trainerScoped = isTrainerScoped(context.roles);
        const assignedMemberIds = trainerScoped
          ? (await tx.studioMember.findMany({ where: { tenantId: context.tenantId, trainerUserId: context.actorId }, select: { id: true } })).map((row) => row.id)
          : undefined;
        const bookings = await tx.studioBooking.findMany({
          where: { tenantId: context.tenantId, ...(context.memberRef ? { memberId: context.memberRef } : {}), ...(assignedMemberIds ? { memberId: { in: assignedMemberIds } } : {}) },
          orderBy: { createdAt: 'desc' },
        });
        const classIds = [...new Set(bookings.map((b) => b.classId).filter(Boolean))];
        const classes = classIds.length > 0
          ? await tx.studioClass.findMany({ where: { tenantId: context.tenantId, id: { in: classIds } } })
          : [];
        const classMap = new Map(classes.map((c) => [c.id, c]));
        return bookings.map((b) => {
          const cls = classMap.get(b.classId);
          return {
            ...b,
            className: cls?.name,
            category: cls?.category,
            trainer: cls?.trainer,
            startTime: cls?.startTime,
            endTime: cls?.endTime,
            classDate: cls?.date,
            room: cls?.room,
            capacity: cls?.capacity,
          };
        });
      });
    }
    if (isTrainerScoped(context.roles)) throw new ForbiddenException('Trainer booking lists require the assignment-aware PostgreSQL store');
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.booking.list_bookings', httpMethod: 'GET', body: { tenant: context.tenantCode, ...(context.memberRef ? { member_filter: context.memberRef } : {}) } });
  }

  async get(context: Context, id: string) {
    if (isTrainerScoped(context.roles) && !['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const trainerScoped = isTrainerScoped(context.roles);
        const memberIds = trainerScoped
          ? (await tx.studioMember.findMany({ where: { tenantId: context.tenantId, trainerUserId: context.actorId }, select: { id: true } })).map((member) => member.id)
          : undefined;
        const booking = await tx.studioBooking.findFirst({
          where: {
            id,
            tenantId: context.tenantId,
            ...(context.memberRef ? { memberId: context.memberRef } : {}),
            ...(memberIds ? { memberId: { in: memberIds } } : {}),
          },
        });
        if (!booking) throw new ForbiddenException('Booking is not available in this workspace');
        return booking;
      });
    }
    if (isTrainerScoped(context.roles)) throw new ForbiddenException('Trainer booking lookups require the assignment-aware PostgreSQL store');
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.booking.get_booking', httpMethod: 'GET', body: { tenant: context.tenantCode, booking: id, ...(context.memberRef ? { member_filter: context.memberRef } : {}) } });
  }

  async create(context: Context, input: BookingInput, actorId: string) {
    const memberId = context.memberRef ?? input.member_id;
    if (!memberId) throw new BadRequestException('An authenticated member or explicit staff-selected member is required');
    if (input.payment_id) throw new BadRequestException('Create the booking before creating its payment');
    if (isTrainerScoped(context.roles)) {
      if (['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) || typeof this.prisma?.withTenant !== 'function') {
        throw new ForbiddenException('Trainer booking changes require the assignment-aware PostgreSQL store');
      }
      const assigned = await this.prisma.withTenant(context.tenantId, (tx) => tx.studioMember.findFirst({
        where: { id: memberId, tenantId: context.tenantId, trainerUserId: context.actorId }, select: { id: true },
      }));
      if (!assigned) throw new ForbiddenException('This member is not assigned to the trainer');
    }
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      const postgresResult = await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioBooking || !tx?.studioClass) return null;
        const classTarget = await tx.studioClass.findFirst({
          where: { tenantId: context.tenantId, id: input.class_schedule_id },
        });
        const currentCount = await tx.studioBooking.count({
          where: { tenantId: context.tenantId, classId: input.class_schedule_id, status: 'Confirmed' },
        });
        const capacity = classTarget?.capacity ?? 12;
        const status = currentCount >= capacity ? 'Waitlisted' : 'Confirmed';
        const bookedAt = input.booking_date ? new Date(input.booking_date) : new Date();

        const booking = await tx.studioBooking.create({
          data: {
            tenantId: context.tenantId,
            classId: input.class_schedule_id,
            memberId,
            status,
            bookedAt,
          },
        });

        try {
          await this.erp.call({
            tenantId: context.tenantCode,
            correlationId: context.correlationId,
            method: 'wellness_studio.api.booking.book_by_schedule',
            body: {
              tenant: context.tenantCode,
              member: memberId,
              class_schedule_id: input.class_schedule_id,
              booking_date: input.booking_date,
            },
          });
        } catch {}

        await this.audit(context, actorId, status === 'Waitlisted' ? 'booking.waitlisted' : 'booking.created', booking.id, status === 'Waitlisted' ? 'booking.waitlisted' : 'booking.confirmed');
        return { id: booking.id, status: booking.status.toLowerCase(), duplicate: false };
      });
      if (postgresResult) return postgresResult;
    }
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.booking.book_by_schedule', body: {
      tenant: context.tenantCode, member: memberId, class_schedule_id: input.class_schedule_id, booking_date: input.booking_date,
    } }) as BookingResult;
    if (!result.id) throw new Error('ERP booking response omitted its identifier');
    if (!result.duplicate) await this.audit(context, actorId, result.status === 'waitlisted' ? 'booking.waitlisted' : 'booking.created', result.id, result.status === 'waitlisted' ? 'booking.waitlisted' : 'booking.confirmed');
    return result;
  }

  async update(context: Context, id: string, status: string, actorId: string) {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'cancelled') return this.cancel(context, id, actorId);
    if (normalized === 'confirmed') {
      if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && this.prisma) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          await this.prisma.withTenant(context.tenantId, (tx) =>
            tx.studioBooking.updateMany({
              where: { id, tenantId: context.tenantId },
              data: { status: 'Confirmed', updatedAt: new Date() },
            })
          );
        }
        try {
          await this.erp.call({
            tenantId: context.tenantCode,
            correlationId: context.correlationId,
            method: 'wellness_studio.api.booking.confirm',
            body: { tenant: context.tenantCode, booking: id },
          });
        } catch {}
        await this.audit(context, actorId, 'booking.confirmed', id, 'booking.confirmed');
        return { id, status: 'Confirmed' };
      }
      if (isTrainerScoped(context.roles)) await this.get(context, id);
      const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.booking.confirm', body: {
        tenant: context.tenantCode, booking: id,
        ...(context.memberRef ? { member_filter: context.memberRef } : {}),
      } }) as BookingResult;
      if (!result.id) throw new Error('ERP booking confirm response omitted its identifier');
      await this.audit(context, actorId, 'booking.confirmed', id, 'booking.confirmed');
      return result;
    }
    throw new BadRequestException(`Unsupported booking status: ${status}`);
  }

  async cancel(context: Context, id: string, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        const postgresResult = await this.prisma.withTenant(context.tenantId, async (tx: any) => {
          if (!tx?.studioBooking) return null;
          const booking = await tx.studioBooking.findFirst({
            where: {
              id,
              tenantId: context.tenantId,
              ...(context.memberRef ? { memberId: context.memberRef } : {}),
            },
          });
          if (!booking) throw new BadRequestException('Booking not found');
          const updated = await tx.studioBooking.update({
            where: { id },
            data: { status: 'Cancelled', updatedAt: new Date() },
          });
          try {
            await this.erp.call({
              tenantId: context.tenantCode,
              correlationId: context.correlationId,
              method: 'wellness_studio.api.booking.cancel',
              body: { tenant: context.tenantCode, booking: id },
            });
          } catch {}
          await this.audit(context, actorId, 'booking.cancelled', id, 'booking.cancelled');
          return { id: updated.id, status: 'cancelled' };
        });
        if (postgresResult) return postgresResult;
      }
    }
    await this.get(context, id);
    const cancellationWindowHours = await this.cancellationWindow(context.tenantId);
    const cancelled = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.booking.cancel', body: {
      tenant: context.tenantCode, booking: id, cancellation_window_hours: cancellationWindowHours,
      ...(context.memberRef ? { member_filter: context.memberRef } : {}),
    } }) as { duplicate?: boolean };
    const result = await this.get(context, id) as BookingResult;
    if (!cancelled.duplicate) await this.audit(context, actorId, 'booking.cancelled', id, 'booking.cancelled');
    return result;
  }

  async delete(context: Context, id: string, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && this.prisma) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioAttendance.deleteMany({ where: { bookingId: id, tenantId: context.tenantId } });
          await tx.studioBooking.deleteMany({ where: { id, tenantId: context.tenantId } });
        });
      }
      try {
        await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.booking.cancel',
          body: { tenant: context.tenantCode, booking: id },
        });
      } catch {}
      await this.audit(context, actorId, 'booking.deleted', id, 'booking.deleted');
      return { success: true, id };
    }
    return this.cancel(context, id, actorId);
  }

  private async cancellationWindow(tenantId: string): Promise<number> {
    if (!this.prisma) return 4;
    const setting = await this.prisma.withTenant(tenantId, (tx) => tx.tenantSetting.findUnique({ where: { tenantId_settingKey: { tenantId, settingKey: 'cancellation_window_hours' } } }));
    if (!setting) return 4;
    const value = setting.settingValue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 168) {
      throw new BadRequestException('Configured cancellation_window_hours must be an integer from 0 to 168');
    }
    return value;
  }

  private audit(context: Context, actorId: string, action: string, id: string, eventType: string) {
    if (!this.prisma || !this.auditOutbox) return Promise.resolve();
    return this.prisma.withTenant(context.tenantId, (tx) => this.auditOutbox!.recordInTransaction(tx, {
      tenantId: context.tenantId, correlationId: context.correlationId, actorType: 'user', actorId,
      action, resourceType: 'booking', resourceRef: id, eventType, payload: { bookingId: id },
    }));
  }
}
