import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateFreezeRequestDto, ReviewFreezeRequestDto } from './dto/freeze-request.dto';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';

type Context = { tenantId: string; tenantCode: string; correlationId: string };
type MemberContext = Context & { memberRef: string };
type MembershipResult = { id?: string; membership_id?: string };
type MembershipInput = {
  member_id?: string;
  name?: string;
  title?: string;
  plan_name?: string;
  plan_type?: string;
  planType?: string;
  start_date?: string;
  end_date?: string;
  price?: number;
  price_inr?: number;
  priceINR?: number;
  session_limit?: number | string;
  sessionLimit?: number | string;
  sessions?: number;
  active?: boolean;
  auto_renew?: boolean;
  benefits?: string;
  description?: string;
};

@Injectable()
export class MembershipsService {
  constructor(private readonly erp: ErpnextService, private readonly auditOutbox?: AuditOutboxService, private readonly prisma?: PrismaService) {}

  listFreezeRequests(context: Context) {
    if (!this.prisma) throw new Error('Database persistence is unavailable');
    return this.prisma.withTenant(context.tenantId, (tx) => tx.membershipFreezeRequest.findMany({ where: { tenantId: context.tenantId }, orderBy: { createdAt: 'desc' } }));
  }

  createFreezeRequest(context: Context, input: CreateFreezeRequestDto, actorId: string) {
    if (!this.prisma) throw new Error('Database persistence is unavailable');
    return this.prisma.withTenant(context.tenantId, async (tx) => {
      const member = await tx.studioMember.findFirst({ where: { id: input.member_id, tenantId: context.tenantId } });
      if (!member) throw new NotFoundException('Member was not found');
      const pending = await tx.membershipFreezeRequest.findFirst({ where: { tenantId: context.tenantId, memberId: input.member_id, status: 'Pending' } });
      if (pending) throw new ConflictException('This member already has a pending freeze request');
      return tx.membershipFreezeRequest.create({ data: { tenantId: context.tenantId, memberId: input.member_id, requestedBy: actorId, days: input.days, reason: input.reason } });
    });
  }

  reviewFreezeRequest(context: Context, id: string, input: ReviewFreezeRequestDto, actorId: string) {
    if (!this.prisma) throw new Error('Database persistence is unavailable');
    return this.prisma.withTenant(context.tenantId, async (tx) => {
      const changed = await tx.membershipFreezeRequest.updateMany({ where: { id, tenantId: context.tenantId, status: 'Pending' }, data: { status: input.decision, decisionNote: input.note?.trim() || null, reviewedBy: actorId, reviewedAt: new Date(), updatedAt: new Date() } });
      if (changed.count !== 1) throw new NotFoundException('Pending freeze request was not found');
      return tx.membershipFreezeRequest.findUnique({ where: { id } });
    });
  }

  async findAll(context: any): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const memberId = context.role === 'member' ? context.userId : undefined;
    try {
      const res = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: 'fitness.membership.list',
        body: { member_id: memberId },
      }) as any;
      const data = res?.memberships || res || [];
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
        method: 'fitness.membership.get',
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

  list(context: Context) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const rows = await tx.studioMembership.findMany({
          where: { tenantId: context.tenantId },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((row: any) => ({
          ...row,
          benefits: row.sessionLimit > 0
            ? `${row.sessionLimit} studio sessions included, ${row.planType} validity, Full locker & studio access`
            : `Unlimited studio class access, ${row.planType} validity, Full locker & studio access`,
        }));
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.membership.list_memberships', httpMethod: 'GET', body: { tenant: context.tenantCode } });
  }

  listActivePlans(context: Context) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const rows = await tx.studioMembership.findMany({
          where: { tenantId: context.tenantId, active: true },
          orderBy: { priceINR: 'asc' },
        });
        return rows.map((row: any) => ({
          ...row,
          benefits: row.sessionLimit > 0
            ? `${row.sessionLimit} studio sessions included, ${row.planType} validity, Full locker & studio access`
            : `Unlimited studio class access, ${row.planType} validity, Full locker & studio access`,
        }));
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.membership.list_active_plans', httpMethod: 'GET', body: { tenant: context.tenantCode } });
  }

  listForMember(context: MemberContext) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const member = await tx.studioMember.findFirst({
          where: { tenantId: context.tenantId, id: context.memberRef },
        });
        if (!member) return [];
        return [{
          id: member.id,
          planName: member.plan,
          status: member.status,
          expiry: member.expiry,
          joined: member.joined,
        }];
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.membership.list_memberships', httpMethod: 'GET', body: { tenant: context.tenantCode, member_filter: context.memberRef } });
  }

  get(context: Context, id: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const item = await tx.studioMembership.findFirst({
          where: { id, tenantId: context.tenantId },
        });
        if (!item) throw new NotFoundException('Membership plan not found');
        return {
          ...item,
          benefits: item.sessionLimit > 0
            ? `${item.sessionLimit} studio sessions included, ${item.planType} validity, Full locker & studio access`
            : `Unlimited studio class access, ${item.planType} validity, Full locker & studio access`,
        };
      });
    }
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.membership.get_membership', httpMethod: 'GET', body: { tenant: context.tenantCode, membership: id } });
  }

  async create(context: Context, input: MembershipInput, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      const planName = String(input.name || input.title || input.plan_name || 'Membership Plan').trim();
      if (!planName) throw new BadRequestException('Plan name is required');
      const rawPlanType = String(input.planType || input.plan_type || 'Monthly').trim();
      const planType = rawPlanType.charAt(0).toUpperCase() + rawPlanType.slice(1);
      const priceINR = Math.round(Number(input.price_inr ?? input.priceINR ?? input.price ?? 0));
      let sessionLimit = 0;
      const rawLimit = input.sessionLimit ?? input.session_limit ?? input.sessions;
      if (typeof rawLimit === 'number') {
        sessionLimit = rawLimit;
      } else if (typeof rawLimit === 'string') {
        const match = rawLimit.match(/\d+/);
        sessionLimit = match ? parseInt(match[0], 10) : 0;
      }

      const postgresResult = await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioMembership) return null;
        const created = await tx.studioMembership.create({
          data: {
            tenantId: context.tenantId,
            name: planName,
            planType,
            priceINR,
            sessionLimit,
            active: input.active !== false,
          },
        });
        try {
          await this.erp.call({
            tenantId: context.tenantCode,
            correlationId: context.correlationId,
            method: 'wellness_studio.api.membership.create_membership',
            body: { ...input, tenant: context.tenantCode },
          });
        } catch {}
        await this.audit(context, actorId, 'membership.created', created.id);
        return created;
      });
      if (postgresResult) return postgresResult;
    }
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.membership.create_membership', body: { ...input, tenant: context.tenantCode } }) as MembershipResult;
    const id = String(result.id ?? result.membership_id ?? '');
    if (!id) throw new Error('ERP membership response omitted its identifier');
    await this.audit(context, actorId, 'membership.created', id);
    return result;
  }

  createForMember(context: MemberContext, input: Omit<MembershipInput, 'member_id'>, actorId: string) {
    return this.create(context, { ...input, member_id: context.memberRef }, actorId);
  }

  async update(context: Context, id: string, input: MembershipInput, actorId: string) {
    if (!Object.keys(input).length) throw new BadRequestException('At least one membership field must be provided');

    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        await this.prisma.withTenant(context.tenantId, async (tx: any) => {
          const data: any = { updatedAt: new Date() };
          if (input.name !== undefined || input.title !== undefined || input.plan_name !== undefined) {
            data.name = String(input.name ?? input.title ?? input.plan_name).trim();
          }
          if (input.planType !== undefined || input.plan_type !== undefined) {
            const pt = String(input.planType ?? input.plan_type).trim();
            data.planType = pt.charAt(0).toUpperCase() + pt.slice(1);
          }
          if (input.price_inr !== undefined || input.priceINR !== undefined || input.price !== undefined) {
            data.priceINR = Math.round(Number(input.price_inr ?? input.priceINR ?? input.price));
          }
          if (input.sessionLimit !== undefined || input.session_limit !== undefined || input.sessions !== undefined) {
            const rawLimit = input.sessionLimit ?? input.session_limit ?? input.sessions;
            if (typeof rawLimit === 'number') {
              data.sessionLimit = rawLimit;
            } else if (typeof rawLimit === 'string') {
              const match = rawLimit.match(/\d+/);
              data.sessionLimit = match ? parseInt(match[0], 10) : 0;
            }
          }
          if (input.active !== undefined) {
            data.active = Boolean(input.active);
          }
          await tx.studioMembership.updateMany({
            where: { id, tenantId: context.tenantId },
            data,
          });
        });
      }
      try {
        await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.membership.update_membership',
          body: { tenant: context.tenantCode, membership: id, updates: input },
        });
      } catch {}
      await this.audit(context, actorId, 'membership.updated', id);
      return { success: true, id };
    }

    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.membership.update_membership', body: { tenant: context.tenantCode, membership: id, updates: input } });
    await this.audit(context, actorId, 'membership.updated', id);
    return result;
  }

  async cancel(context: Context, id: string, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        await this.prisma.withTenant(context.tenantId, (tx: any) =>
          tx.studioMembership.updateMany({
            where: { id, tenantId: context.tenantId },
            data: { active: false, updatedAt: new Date() },
          })
        );
      }
      try {
        await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.membership.cancel_membership',
          body: { tenant: context.tenantCode, membership: id },
        });
      } catch {}
      await this.audit(context, actorId, 'membership.cancelled', id);
      return { success: true, id };
    }

    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.membership.cancel_membership', body: { tenant: context.tenantCode, membership: id } });
    await this.audit(context, actorId, 'membership.cancelled', id);
    return result;
  }

  async delete(context: Context, id: string, actorId: string) {
    return this.deletePlan(context, id, actorId);
  }

  async deletePlan(context: Context, id: string, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        await this.prisma.withTenant(context.tenantId, (tx: any) =>
          tx.studioMembership.deleteMany({ where: { id, tenantId: context.tenantId } })
        );
      }
    }
    try {
      await this.erp.call({
        tenantId: context.tenantCode,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.membership.cancel_membership',
        body: { tenant: context.tenantCode, membership: id },
      });
    } catch {}
    await this.audit(context, actorId, 'membership.deleted', id);
    return { success: true, id };
  }

  private audit(context: Context, actorId: string, action: string, id: string) {
    if (!this.prisma || !this.auditOutbox) return Promise.resolve();
    return this.prisma.withTenant(context.tenantId, (tx) => this.auditOutbox!.recordInTransaction(tx, {
      tenantId: context.tenantId, correlationId: context.correlationId, actorType: 'user', actorId, action,
      resourceType: 'membership', resourceRef: id, eventType: action, payload: { membershipId: id },
    }));
  }
}
