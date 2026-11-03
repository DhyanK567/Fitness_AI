import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';

type Context = { tenantId: string; tenantCode: string; correlationId: string };
type EventInput = object;

@Injectable()
export class EventsService {
  constructor(private readonly erp: ErpnextService, private readonly auditOutbox: AuditOutboxService, private readonly prisma: PrismaService) {}

  list(context: Context) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const rows = await tx.studioEvent.findMany({
          where: { tenantId: context.tenantId },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((e: any) => ({
          ...e,
          published: !e.organizer?.includes('[DRAFT]'),
          organizer: (e.organizer || '').replace(/\s*\[DRAFT\]\s*$/i, '').trim() || 'Lead Instructor',
        }));
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.events.list_events', httpMethod: 'GET', body: { tenant: context.tenantCode } });
  }

  listPublic(context: Context) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const now = new Date();
        const rows = await tx.studioEvent.findMany({
          where: {
            tenantId: context.tenantId,
            startAt: { gte: now },
            NOT: {
              organizer: {
                contains: '[DRAFT]',
              },
            },
          },
          orderBy: { startAt: 'asc' },
        });
        return rows.map((e: any) => ({
          ...e,
          published: true,
          organizer: (e.organizer || '').replace(/\s*\[DRAFT\]\s*$/i, '').trim() || 'Lead Instructor',
        }));
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.events.list_events', httpMethod: 'GET', body: { tenant: context.tenantCode, public_only: 1 } });
  }

  get(context: Context, id: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const item = await tx.studioEvent.findFirst({
          where: { id, tenantId: context.tenantId },
        });
        if (!item) throw new NotFoundException('Event not found');
        return {
          ...item,
          published: !item.organizer?.includes('[DRAFT]'),
          organizer: (item.organizer || '').replace(/\s*\[DRAFT\]\s*$/i, '').trim() || 'Lead Instructor',
        };
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.events.get_event', httpMethod: 'GET', body: { tenant: context.tenantCode, event_id: id } });
  }

  async create(context: Context, input: EventInput, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      const data = input as any;
      const title = String(data.title || '').trim();
      if (!title) throw new BadRequestException('Event title is required');

      let startAt: Date;
      if (data.startAt) {
        startAt = new Date(data.startAt);
      } else if (data.event_date && data.start_time) {
        startAt = new Date(`${data.event_date}T${data.start_time}`);
      } else {
        startAt = new Date();
      }

      let endAt: Date;
      if (data.endAt) {
        endAt = new Date(data.endAt);
      } else if (data.event_date && data.end_time) {
        endAt = new Date(`${data.event_date}T${data.end_time}`);
      } else {
        endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      }

      const category = String(data.category || 'Workshop').trim();
      const venue = String(data.venue || 'Main Studio Floor').trim();
      let organizer = String(data.organizer || 'Lead Instructor').trim();

      const isDraft = data.published === false || data.is_published === false;
      if (isDraft && !organizer.includes('[DRAFT]')) {
        organizer = `${organizer} [DRAFT]`;
      }

      const capacity = data.capacity !== undefined && data.capacity !== null ? Number(data.capacity) : null;

      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const created = await tx.studioEvent.create({
          data: {
            tenantId: context.tenantId,
            title,
            category,
            startAt,
            endAt,
            venue,
            organizer,
            capacity,
          },
        });
        await this.audit(context, actorId, 'event.created', created.id);
        return {
          ...created,
          published: !isDraft,
          organizer: (created.organizer || '').replace(/\s*\[DRAFT\]\s*$/i, '').trim(),
        };
      });
    }

    const values = input as { is_paid?: boolean; price?: number };
    if (values.is_paid && (typeof values.price !== 'number' || values.price <= 0)) throw new BadRequestException('Paid events require a positive price');
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.events.create_event', body: { ...input, tenant: context.tenantCode } }) as { id?: string };
    if (!result.id) throw new Error('ERP event response omitted its identifier');
    await this.audit(context, actorId, 'event.created', result.id);
    return result;
  }

  async update(context: Context, id: string, input: EventInput, actorId: string) {
    if (!Object.keys(input).length) throw new BadRequestException('At least one event field must be provided');

    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const existing = await tx.studioEvent.findFirst({ where: { id, tenantId: context.tenantId } });
        if (!existing) throw new NotFoundException('Event not found');

        const data = input as any;
        if (data.cancelled === true) {
          await tx.studioEvent.delete({ where: { id, tenantId: context.tenantId } });
          await this.audit(context, actorId, 'event.cancelled', id);
          return { success: true, id };
        }

        const updateData: any = {};
        if (data.title !== undefined) updateData.title = String(data.title).trim();
        if (data.category !== undefined) updateData.category = String(data.category).trim();
        if (data.venue !== undefined) updateData.venue = String(data.venue).trim();
        if (data.capacity !== undefined) updateData.capacity = data.capacity !== null ? Number(data.capacity) : null;
        if (data.startAt !== undefined) updateData.startAt = new Date(data.startAt);
        if (data.endAt !== undefined) updateData.endAt = new Date(data.endAt);

        let baseOrganizer = (data.organizer !== undefined ? String(data.organizer) : existing.organizer).replace(/\s*\[DRAFT\]\s*$/i, '').trim();
        if (data.published === false || data.is_published === false) {
          updateData.organizer = `${baseOrganizer} [DRAFT]`;
        } else if (data.published === true || data.is_published === true) {
          updateData.organizer = baseOrganizer;
        } else if (data.organizer !== undefined) {
          const wasDraft = existing.organizer.includes('[DRAFT]');
          updateData.organizer = wasDraft ? `${baseOrganizer} [DRAFT]` : baseOrganizer;
        }

        updateData.updatedAt = new Date();

        const updated = await tx.studioEvent.update({
          where: { id, tenantId: context.tenantId },
          data: updateData,
        });
        await this.audit(context, actorId, 'event.updated', id);
        return {
          ...updated,
          published: !updated.organizer?.includes('[DRAFT]'),
          organizer: (updated.organizer || '').replace(/\s*\[DRAFT\]\s*$/i, '').trim(),
        };
      });
    }

    const values = input as { is_paid?: boolean; price?: number };
    if (values.is_paid === true) {
      const price = typeof values.price === 'number' ? values.price : (await this.get(context, id) as { price?: number }).price;
      if (typeof price !== 'number' || price <= 0) throw new BadRequestException('Paid events require a positive price');
    }
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.events.update_event', body: { tenant: context.tenantCode, event_id: id, updates: input } });
    await this.audit(context, actorId, 'event.updated', id);
    return result;
  }

  async cancel(context: Context, id: string, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const existing = await tx.studioEvent.findFirst({ where: { id, tenantId: context.tenantId } });
        if (!existing) throw new NotFoundException('Event not found');
        await tx.studioEvent.delete({
          where: { id, tenantId: context.tenantId },
        });
        await this.audit(context, actorId, 'event.cancelled', id);
        return { success: true, id };
      });
    }

    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.events.cancel_event', body: { tenant: context.tenantCode, event_id: id } });
    await this.audit(context, actorId, 'event.cancelled', id);
    return result;
  }

  async register(context: Context, eventId: string, input: EventInput, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const event = await tx.studioEvent.findFirst({ where: { id: eventId, tenantId: context.tenantId } });
        if (!event) throw new NotFoundException('Event not found');
        const regId = `REG-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
        await this.audit(context, actorId, 'event.registration.created', regId);
        return { registration_id: regId, status: 'confirmed', event_id: eventId };
      });
    }
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.event_registration.register', body: { ...input, tenant: context.tenantCode, event: eventId, free_only: 1 } }) as { registration_id?: string };
    if (!result.registration_id) throw new Error('ERP event registration response omitted its identifier');
    await this.audit(context, actorId, 'event.registration.created', result.registration_id);
    return result;
  }

  async cancelRegistration(context: Context, eventId: string, registrationId: string, actorId: string) {
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.event_registration.cancel', body: { tenant: context.tenantCode, event: eventId, registration: registrationId } }) as { registration_id?: string };
    if (!result.registration_id) throw new Error('ERP event registration cancellation response omitted its identifier');
    await this.audit(context, actorId, 'event.registration.cancelled', result.registration_id);
    return result;
  }

  async checkInRegistration(context: Context, eventId: string, registrationId: string, actorId: string) {
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.event_registration.checkin', body: { tenant: context.tenantCode, event: eventId, registration: registrationId } }) as { registration_id?: string };
    if (!result.registration_id) throw new Error('ERP event registration check-in response omitted its identifier');
    await this.audit(context, actorId, 'event.registration.checked_in', result.registration_id);
    return result;
  }

  async registerPublic(context: Context, eventId: string, input: EventInput) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const event = await tx.studioEvent.findFirst({ where: { id: eventId, tenantId: context.tenantId } });
        if (!event) throw new NotFoundException('Event not found');
        const regId = `PUB-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
        await this.audit(context, 'public-event-registration', 'event.registration.created', regId, 'system');
        return { registration_id: regId, status: 'confirmed', event_id: eventId };
      });
    }
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.event_registration.register', body: { ...input, tenant: context.tenantCode, event: eventId, free_only: 1, public_only: 1 } }) as { registration_id?: string };
    if (!result.registration_id) throw new Error('ERP event registration response omitted its identifier');
    await this.audit(context, 'public-event-registration', 'event.registration.created', result.registration_id, 'system');
    return result;
  }

  private audit(context: Context, actorId: string, action: string, id: string, actorType: 'user' | 'system' = 'user') {
    return this.prisma.withTenant(context.tenantId, (tx) => this.auditOutbox.recordInTransaction(tx, { tenantId: context.tenantId, correlationId: context.correlationId, actorType, actorId, action, resourceType: action.startsWith('event.registration.') ? 'event_registration' : 'event', resourceRef: id, eventType: action, payload: { eventId: id } }));
  }
}
