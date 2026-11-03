import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';

type Context = { tenantId: string; tenantCode: string; correlationId: string; memberRef?: string; actorId?: string; roles?: string[] };
const TRAINER_ROLES = new Set(['trainer', 'coach', 'lead_trainer']);
const isTrainerScoped = (roles?: string[]) => roles?.some((role) => TRAINER_ROLES.has(role.trim().toLowerCase())) ?? false;

@Injectable()
export class AttendanceService {
  constructor(private readonly erp: ErpnextService, private readonly auditOutbox: AuditOutboxService, private readonly prisma: PrismaService) {}
  async list(context: Context) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase())) {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const trainerScoped = isTrainerScoped(context.roles);
        const assignedMemberIds = trainerScoped ? (await tx.studioMember.findMany({ where: { tenantId: context.tenantId, trainerUserId: context.actorId }, select: { id: true } })).map((row) => row.id) : undefined;
        const bookingIds = context.memberRef || assignedMemberIds
          ? (await tx.studioBooking.findMany({ where: { tenantId: context.tenantId, ...(context.memberRef ? { memberId: context.memberRef } : {}), ...(assignedMemberIds ? { memberId: { in: assignedMemberIds } } : {}) }, select: { id: true } })).map((row) => row.id)
          : undefined;
        const attendances = await tx.studioAttendance.findMany({
          where: { tenantId: context.tenantId, ...(bookingIds ? { bookingId: { in: bookingIds } } : {}) },
          orderBy: { createdAt: 'desc' },
        });
        if (attendances.length === 0) return [];
        const bookings = await tx.studioBooking.findMany({
          where: { tenantId: context.tenantId, id: { in: attendances.map((a) => a.bookingId) } },
        });
        const bookingMap = new Map(bookings.map((b) => [b.id, b]));
        const classIds = [...new Set(bookings.map((b) => b.classId))];
        const classes = classIds.length
          ? await tx.studioClass.findMany({ where: { tenantId: context.tenantId, id: { in: classIds } } })
          : [];
        const classMap = new Map(classes.map((c) => [c.id, c]));

        return attendances.map((att) => {
          const booking = bookingMap.get(att.bookingId);
          const cls = booking ? classMap.get(booking.classId) : undefined;
          return {
            ...att,
            booking: booking || null,
            class: cls || null,
            className: cls?.name || 'Studio Session',
            sessionName: cls?.name || 'Studio Session',
            trainer: cls?.trainer || 'Staff Coach',
            date: cls?.date || att.checkedInAt || att.createdAt,
            time: cls?.startTime || '07:00 AM',
          };
        });
      });
    }
    if (isTrainerScoped(context.roles)) throw new ForbiddenException('Trainer attendance lists require the assignment-aware PostgreSQL store');
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.attendance.list_attendance', httpMethod: 'GET', body: { tenant: context.tenantCode, ...(context.memberRef ? { member_filter: context.memberRef } : {}) } });
  }
  async listForClass(context: Context, classId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase())) {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const memberIds = isTrainerScoped(context.roles)
          ? (await tx.studioMember.findMany({ where: { tenantId: context.tenantId, trainerUserId: context.actorId }, select: { id: true } })).map((member) => member.id)
          : undefined;
        const bookingIds = (await tx.studioBooking.findMany({ where: { tenantId: context.tenantId, classId, ...(memberIds ? { memberId: { in: memberIds } } : {}) }, select: { id: true } })).map((row) => row.id);
        return tx.studioAttendance.findMany({ where: { tenantId: context.tenantId, bookingId: { in: bookingIds } }, orderBy: { createdAt: 'desc' } });
      });
    }
    if (isTrainerScoped(context.roles)) throw new ForbiddenException('Trainer class rosters require the assignment-aware PostgreSQL store');
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.attendance.list_by_class', httpMethod: 'GET', body: { tenant: context.tenantCode, class_id: classId } });
  }
  async get(context: Context, id: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase())) {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const row = await tx.studioAttendance.findFirst({ where: { id, tenantId: context.tenantId } });
        if (!row) return null;
        if (context.memberRef) {
          const booking = await tx.studioBooking.findFirst({ where: { id: row.bookingId, tenantId: context.tenantId, memberId: context.memberRef } });
          if (!booking) return null;
        }
        if (isTrainerScoped(context.roles)) {
          const assignedMemberIds = (await tx.studioMember.findMany({ where: { tenantId: context.tenantId, trainerUserId: context.actorId }, select: { id: true } })).map((member) => member.id);
          const assigned = await tx.studioBooking.findFirst({
            where: { id: row.bookingId, tenantId: context.tenantId, memberId: { in: assignedMemberIds } },
            select: { id: true },
          });
          if (!assigned) return null;
        }
        return row;
      });
    }
    if (isTrainerScoped(context.roles)) throw new ForbiddenException('Trainer attendance lookups require the assignment-aware PostgreSQL store');
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.attendance.get_attendance', httpMethod: 'GET', body: { tenant: context.tenantCode, attendance: id, ...(context.memberRef ? { member_filter: context.memberRef } : {}) } });
  }
  async record(context: Context, bookingId: string, method: string, actorId: string, initialStatus?: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase())) {
      const value = await this.prisma.withTenant(context.tenantId, async (tx) => {
        if (bookingId.startsWith('staff:') || bookingId.startsWith('trainer:') || bookingId.startsWith('manual:')) {
          const existing = await tx.studioAttendance.findFirst({ where: { tenantId: context.tenantId, bookingId } });
          if (existing) {
            return tx.studioAttendance.update({
              where: { id: existing.id },
              data: { status: 'Present', checkedInAt: new Date(), updatedAt: new Date() },
            });
          }
          return tx.studioAttendance.create({
            data: { tenantId: context.tenantId, bookingId, status: 'Present', checkedInAt: new Date() },
          });
        }
        const assignedMemberIds = isTrainerScoped(context.roles)
          ? (await tx.studioMember.findMany({ where: { tenantId: context.tenantId, trainerUserId: context.actorId }, select: { id: true } })).map((member) => member.id)
          : undefined;
        const booking = await tx.studioBooking.findFirst({ where: { id: bookingId, tenantId: context.tenantId, ...(context.memberRef ? { memberId: context.memberRef } : {}), ...(assignedMemberIds ? { memberId: { in: assignedMemberIds } } : {}) } });
        if (!booking) {
          // If not a booking, allow recording as general attendance
          return tx.studioAttendance.create({ data: { tenantId: context.tenantId, bookingId, status: 'Present', checkedInAt: new Date() } });
        }
        const existing = await tx.studioAttendance.findFirst({ where: { tenantId: context.tenantId, bookingId } });
        if (existing) {
          const normalized = initialStatus ? (initialStatus.charAt(0).toUpperCase() + initialStatus.slice(1).toLowerCase()) : 'Present';
          return tx.studioAttendance.update({
            where: { id: existing.id },
            data: {
              status: normalized,
              checkedInAt: normalized === 'Absent' ? null : (existing.checkedInAt ?? new Date()),
              updatedAt: new Date(),
            },
          });
        }
        const normalized = initialStatus ? (initialStatus.charAt(0).toUpperCase() + initialStatus.slice(1).toLowerCase()) : 'Present';
        return tx.studioAttendance.create({ data: { tenantId: context.tenantId, bookingId, status: normalized, checkedInAt: normalized === 'Absent' ? null : new Date() } });
      });
      await this.audit(context, actorId, 'attendance.recorded', value.id);
      return value;
    }
    if (isTrainerScoped(context.roles)) throw new ForbiddenException('Trainer check-in requires the assignment-aware PostgreSQL store');
    const value = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.attendance.record_attendance', body: { tenant: context.tenantCode, booking: bookingId, method, ...(context.memberRef ? { member_filter: context.memberRef } : {}) } }) as { attendance_id?: string };
    if (!value.attendance_id) throw new Error('ERP attendance response omitted its identifier');
    await this.audit(context, actorId, 'attendance.recorded', value.attendance_id);
    return this.get(context, value.attendance_id);
  }
  async correct(context: Context, id: string, status: string, reason: string, actorId: string) {
    const normalizedStatus = String(status).trim().toLowerCase();
    const statusMap: Record<string, 'Present' | 'Absent' | 'Late'> = {
      present: 'Present',
      absent: 'Absent',
      late: 'Late',
    };
    const canonicalStatus = statusMap[normalizedStatus];
    if (!canonicalStatus) {
      throw new ConflictException('Attendance status must be present, absent, or late');
    }
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase())) {
      const value = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const existing = await tx.studioAttendance.findFirst({ where: { id, tenantId: context.tenantId } });
        if (!existing) throw new ConflictException('Attendance record was not found');
        if (isTrainerScoped(context.roles)) {
          const assignedMemberIds = (await tx.studioMember.findMany({ where: { tenantId: context.tenantId, trainerUserId: context.actorId }, select: { id: true } })).map((member) => member.id);
          const assigned = await tx.studioBooking.findFirst({ where: { id: existing.bookingId, tenantId: context.tenantId, memberId: { in: assignedMemberIds } }, select: { id: true } });
          if (!assigned) throw new ForbiddenException('Attendance is not assigned to this trainer');
        }
        return tx.studioAttendance.update({
          where: { id },
          data: {
            status: canonicalStatus,
            checkedInAt: canonicalStatus === 'Absent' ? null : existing.checkedInAt,
            updatedAt: new Date(),
          },
        });
      });
      await this.audit(context, actorId, 'attendance.corrected', id);
      return { ...value, correctionReason: reason };
    }
    if (isTrainerScoped(context.roles)) throw new ForbiddenException('Trainer attendance corrections require the assignment-aware PostgreSQL store');
    const value = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.attendance.correct', body: { tenant: context.tenantCode, attendance: id, new_status: normalizedStatus, reason } }) as { changed?: boolean };
    if (value.changed) await this.audit(context, actorId, 'attendance.corrected', id);
    return value;
  }
  remove(): never { throw new ConflictException('Attendance is retained for audit; correct its status with a reason instead of deleting it'); }
  private audit(context: Context, actorId: string, action: string, id: string) {
    return this.prisma.withTenant(context.tenantId, (tx) => this.auditOutbox.recordInTransaction(tx, { tenantId: context.tenantId, correlationId: context.correlationId, actorType: 'user', actorId, action, resourceType: 'attendance', resourceRef: id, eventType: action, payload: { attendanceId: id } }));
  }
}
