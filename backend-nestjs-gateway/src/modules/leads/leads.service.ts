import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';

type Context = { tenantId: string; tenantCode: string; correlationId: string };
type LeadInput = {
  full_name?: string;
  phone?: string;
  email?: string | null;
  source?: string;
  status?: string;
  stage?: string;
  plan?: string | null;
  follow_up_date?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
};
type PublicEnquiryInput = { full_name: string; phone: string; email?: string; source?: string; notes?: string };

@Injectable()
export class LeadsService {
  constructor(private readonly erp: ErpnextService, private readonly auditOutbox: AuditOutboxService, private readonly prisma: PrismaService) {}

  list(context: Context) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase())) {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        return tx.studioLead.findMany({
          where: { tenantId: context.tenantId },
          orderBy: { createdAt: 'desc' },
        });
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.lead.list_leads', httpMethod: 'GET', body: { tenant: context.tenantCode } });
  }

  get(context: Context, id: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase())) {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (!isUuid) return null;
        return tx.studioLead.findFirst({ where: { id, tenantId: context.tenantId } });
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.lead.get_lead', httpMethod: 'GET', body: { tenant: context.tenantCode, lead_id: id } });
  }

  async create(context: Context, input: LeadInput, actorId: string) {
    let result: { id?: string; duplicate?: boolean } = {};
    try {
      result = (await this.erp.call({
        tenantId: context.tenantCode,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.lead.create_lead',
        idempotencyKey: randomUUID(),
        body: { ...input, tenant: context.tenantCode },
      })) as { id?: string; duplicate?: boolean };
    } catch {
      result = { id: randomUUID(), duplicate: false };
    }
    let leadId = String(result.id || randomUUID());
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) {
      leadId = randomUUID();
    }

    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioLead?.create) return;
        const created = await tx.studioLead.create({
          data: {
            id: leadId,
            tenantId: context.tenantId,
            name: input.full_name || 'New Lead',
            phone: input.phone || null,
            email: input.email || null,
            source: input.source || 'Manual Entry',
            stage: input.stage || input.status || 'New enquiry',
            plan: input.plan || 'Standard',
            followUpDate: input.follow_up_date ? new Date(input.follow_up_date) : null,
            assigned: input.assigned_to || null,
            notes: input.notes || null,
          },
        });
        if (created?.id) leadId = created.id;
      });
    }

    if (!result.duplicate) await this.audit(context, actorId, 'lead.created', leadId);
    return { id: leadId, status: input.status || 'new', ...result };
  }

  async createPublic(context: Context, input: PublicEnquiryInput) {
    let result: { id?: string; duplicate?: boolean } = {};
    try {
      result = (await this.erp.call({
        tenantId: context.tenantCode,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.lead.create_lead',
        idempotencyKey: randomUUID(),
        body: { ...input, source: input.source || 'website', status: 'new', tenant: context.tenantCode },
      })) as { id?: string; duplicate?: boolean };
    } catch (err) {
      if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase())) {
        result = { id: randomUUID(), duplicate: false };
      } else {
        throw err;
      }
    }
    if (!result?.id) throw new Error('ERP lead response omitted its identifier');
    const leadId = String(result.id);

    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioLead?.create) return;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId);
        await tx.studioLead.create({
          data: {
            ...(isUuid ? { id: leadId } : {}),
            tenantId: context.tenantId,
            name: input.full_name,
            phone: input.phone || null,
            email: input.email || null,
            source: input.source || 'website',
            stage: 'New enquiry',
            plan: 'Standard',
            notes: input.notes || null,
          },
        });
      });
    }

    if (!result.duplicate) await this.audit(context, undefined, 'lead.created', leadId, 'system');
    return { id: leadId, duplicate: result.duplicate ?? false };
  }

  async update(context: Context, id: string, input: LeadInput, actorId: string) {
    if (!Object.keys(input).length) throw new BadRequestException('At least one lead field must be provided');
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioLead?.updateMany) return;
        const data: any = {};
        if (input.full_name !== undefined) data.name = input.full_name;
        if (input.phone !== undefined) data.phone = input.phone;
        if (input.email !== undefined) data.email = input.email;
        if (input.source !== undefined) data.source = input.source;
        if (input.stage !== undefined) data.stage = input.stage;
        else if (input.status !== undefined) data.stage = input.status;
        if (input.plan !== undefined) data.plan = input.plan;
        if (input.follow_up_date !== undefined) data.followUpDate = input.follow_up_date ? new Date(input.follow_up_date) : null;
        if (input.assigned_to !== undefined) data.assigned = input.assigned_to;
        if (input.notes !== undefined) data.notes = input.notes;
        data.updatedAt = new Date();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          await tx.studioLead.updateMany({
            where: { id, tenantId: context.tenantId },
            data,
          });
        }
      });
    }

    try {
      await this.erp.call({
        tenantId: context.tenantCode,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.lead.update_lead',
        body: { tenant: context.tenantCode, lead_id: id, updates: input },
      });
    } catch {}

    await this.audit(context, actorId, 'lead.updated', id);
    return { success: true, id };
  }

  async deactivate(context: Context, id: string, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioLead?.deleteMany) return;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          await tx.studioLead.deleteMany({
            where: { id, tenantId: context.tenantId },
          });
        }
      });
    }

    try {
      await this.erp.call({
        tenantId: context.tenantCode,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.lead.deactivate_lead',
        body: { tenant: context.tenantCode, lead_id: id },
      });
    } catch {}

    await this.audit(context, actorId, 'lead.deactivated', id);
    return { success: true, id };
  }

  async convert(context: Context, id: string, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioLead?.updateMany) return;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          await tx.studioLead.updateMany({
            where: { id, tenantId: context.tenantId },
            data: { stage: 'Converted', updatedAt: new Date() },
          });
        }
      });
    }

    let result: { id?: string; duplicate?: boolean } = { id };
    try {
      result = (await this.erp.call({
        tenantId: context.tenantCode,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.lead.convert_lead',
        body: { tenant: context.tenantCode, lead_id: id },
      })) as { id?: string; duplicate?: boolean };
    } catch {}

    if (!result.duplicate) await this.audit(context, actorId, 'lead.converted', result.id || id);
    return result;
  }

  private audit(context: Context, actorId: string | undefined, action: string, id: string, actorType: 'user' | 'system' = 'user') {
    return this.prisma.withTenant(context.tenantId, (tx) => this.auditOutbox.recordInTransaction(tx, { tenantId: context.tenantId, correlationId: context.correlationId, actorType, actorId, action, resourceType: 'lead', resourceRef: id, eventType: action === 'lead.deactivated' ? 'lead.updated' : action, payload: { leadId: id } }));
  }
}
