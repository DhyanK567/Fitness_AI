import { BadRequestException, Injectable } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';

type Context = { tenantId: string; tenantCode: string; correlationId: string };
type ClassInput = { name?: string; trainer_id?: string; category?: string; duration_mins?: number; capacity?: number; location?: string | null };
type ScheduleInput = { day_of_week?: string; start_time?: string; end_time?: string };

@Injectable()
export class ClassesService {
  constructor(private readonly erp: ErpnextService, private readonly auditOutbox: AuditOutboxService, private readonly prisma: PrismaService) {}

  list(context: Context) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase())) {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        return tx.studioClass.findMany({
          where: { tenantId: context.tenantId },
          orderBy: { createdAt: 'desc' },
        });
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.classes.list_classes', httpMethod: 'GET', body: { tenant: context.tenantCode } });
  }

  get(context: Context, id: string) {
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.classes.get_class', httpMethod: 'GET', body: { tenant: context.tenantCode, class_id: id } });
  }

  async create(context: Context, input: any, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && this.prisma) {
      const trainer = input.trainer || input.trainer_id || 'Staff Trainer';
      const room = input.room || input.location || 'Studio 1';
      const category = input.category || 'General';
      const capacity = Number(input.capacity) || 12;
      const classDate = input.date ? new Date(input.date) : new Date();
      const startTime = input.startTime || '07:00';
      const endTime = input.endTime || '08:00';
      const status = input.status || 'Scheduled';

      const created = await this.prisma.withTenant(context.tenantId, (tx: any) => {
        if (!tx?.studioClass?.create) return null;
        return tx.studioClass.create({
          data: {
            tenantId: context.tenantId,
            name: input.name,
            category,
            date: classDate,
            startTime,
            endTime,
            trainer,
            room,
            capacity,
            status,
          },
        });
      });
      if (created) {
        try {
          await this.erp.call({
            tenantId: context.tenantCode,
            correlationId: context.correlationId,
            method: 'wellness_studio.api.classes.create_class',
            body: { ...input, tenant: context.tenantCode },
          });
        } catch {}
        await this.audit(context, actorId, 'class.created', (created as any).id);
        return created;
      }
    }
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.classes.create_class', body: { ...input, tenant: context.tenantCode } }) as { id?: string };
    const id = String(result.id ?? '');
    if (!id) throw new Error('ERP class response omitted its identifier');
    await this.audit(context, actorId, 'class.created', id);
    return result;
  }

  async update(context: Context, id: string, input: any, actorId: string) {
    if (!Object.keys(input).length) throw new BadRequestException('At least one class field must be provided');
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && this.prisma) {
      let pgUpdated = false;
      await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioClass?.updateMany) return;
        const data: any = { updatedAt: new Date() };
        if (input.name) data.name = input.name;
        if (input.category) data.category = input.category;
        if (input.trainer || input.trainer_id) data.trainer = input.trainer || input.trainer_id;
        if (input.room || input.location) data.room = input.room || input.location;
        if (input.capacity !== undefined) data.capacity = Number(input.capacity);
        if (input.date) data.date = new Date(input.date);
        if (input.startTime) data.startTime = input.startTime;
        if (input.endTime) data.endTime = input.endTime;
        if (input.status) data.status = input.status;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          await tx.studioClass.updateMany({
            where: { id, tenantId: context.tenantId },
            data,
          });
          pgUpdated = true;
        }
      });
      if (pgUpdated) {
        try {
          await this.erp.call({
            tenantId: context.tenantCode,
            correlationId: context.correlationId,
            method: 'wellness_studio.api.classes.update_class',
            body: { tenant: context.tenantCode, class_id: id, updates: input },
          });
        } catch {}
        await this.audit(context, actorId, 'class.updated', id);
        return { success: true, id };
      }
    }
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.classes.update_class', body: { tenant: context.tenantCode, class_id: id, updates: input } });
    await this.audit(context, actorId, 'class.updated', id);
    return result;
  }

  async deactivate(context: Context, id: string, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && this.prisma) {
      let pgUpdated = false;
      await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioClass?.updateMany) return;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          await tx.studioClass.updateMany({
            where: { id, tenantId: context.tenantId },
            data: { status: 'Cancelled', updatedAt: new Date() },
          });
          pgUpdated = true;
        }
      });
      if (pgUpdated) {
        try {
          await this.erp.call({
            tenantId: context.tenantCode,
            correlationId: context.correlationId,
            method: 'wellness_studio.api.classes.deactivate_class',
            body: { tenant: context.tenantCode, class_id: id },
          });
        } catch {}
        await this.audit(context, actorId, 'class.deactivated', id);
        return { success: true, id };
      }
    }
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.classes.deactivate_class', body: { tenant: context.tenantCode, class_id: id } });
    await this.audit(context, actorId, 'class.deactivated', id);
    return result;
  }

  listSchedules(context: Context, classId: string) {
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.class_schedule.list_class_schedules', httpMethod: 'GET', body: { tenant: context.tenantCode, class_id: classId } });
  }

  async createSchedule(context: Context, classId: string, input: ScheduleInput, actorId: string) {
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.class_schedule.create_class_schedule', body: { ...input, tenant: context.tenantCode, class_id: classId } }) as { id?: string };
    const id = String(result.id ?? '');
    if (!id) throw new Error('ERP schedule response omitted its identifier');
    await this.audit(context, actorId, 'class_schedule.created', id);
    return result;
  }

  async updateSchedule(context: Context, classId: string, scheduleId: string, input: ScheduleInput, actorId: string) {
    if (!Object.keys(input).length) throw new BadRequestException('At least one schedule field must be provided');
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.class_schedule.update_class_schedule', body: { tenant: context.tenantCode, class_id: classId, schedule_id: scheduleId, updates: input } });
    await this.audit(context, actorId, 'class_schedule.updated', scheduleId);
    return result;
  }

  async deactivateSchedule(context: Context, classId: string, scheduleId: string, actorId: string) {
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.class_schedule.deactivate_class_schedule', body: { tenant: context.tenantCode, class_id: classId, schedule_id: scheduleId } });
    await this.audit(context, actorId, 'class_schedule.deactivated', scheduleId);
    return result;
  }

  private audit(context: Context, actorId: string, action: string, id: string) {
    return this.prisma.withTenant(context.tenantId, (tx) => this.auditOutbox.recordInTransaction(tx, {
      tenantId: context.tenantId, correlationId: context.correlationId, actorType: 'user', actorId,
      action, resourceType: action.startsWith('class_schedule.') ? 'class_schedule' : 'class', resourceRef: id,
      eventType: action.endsWith('deactivated') ? action.replace('deactivated', 'updated') : action,
      payload: { resourceId: id },
    }));
  }
}
