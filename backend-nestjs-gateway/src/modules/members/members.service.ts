import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';

type Context = { tenantId: string; tenantCode: string; correlationId: string };
type StaffContext = Context & { actorId?: string; roles?: string[] };
type MemberContext = Context & { memberRef: string };
type MemberInput = {
  full_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  join_date?: string;
  status?: string;
  membership_id?: string | null;
  profile_photo_url?: string | null;
  emergency_contact?: string;
  coach?: string;
};

const TRAINER_ROLES = new Set(['trainer', 'coach', 'lead_trainer']);
const isTrainerScoped = (roles?: string[]) => roles?.some((role) => TRAINER_ROLES.has(role.trim().toLowerCase())) ?? false;

@Injectable()
export class MembersService {
  constructor(private readonly erp: ErpnextService, private readonly auditOutbox?: AuditOutboxService, private readonly prisma?: PrismaService) {}

  async findAll(context: any, status?: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const memberId = context.role === 'member' ? context.userId : undefined;
    try {
      const res = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: 'fitness.member.list',
        body: { status, member_id: memberId },
      }) as any;
      const data = res?.members || res || [];
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async findOne(context: any, id: string): Promise<{ success: boolean; data?: any; error?: string }> {
    if (context.role === 'member' && context.userId !== id) {
      return { success: false, error: '404 Not Found' };
    }
    try {
      const res = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: 'fitness.member.get',
        body: { id },
      }) as any;
      return { success: true, data: res };
    } catch (e: any) {
      return { success: false, error: e.message || '404 Not Found' };
    }
  }

  private audit(context: Context, actorId: string, action: string, memberId: string) {
    if (!this.prisma || !this.auditOutbox) return Promise.resolve();
    return this.prisma.withTenant(context.tenantId, (tx) => this.auditOutbox!.recordInTransaction(tx, {
      tenantId: context.tenantId, correlationId: context.correlationId, actorType: 'user', actorId, action,
      resourceType: 'member', resourceRef: memberId, eventType: action === 'member.deactivated' ? 'member.updated' : action,
      payload: { memberId },
    }));
  }

  async list(context: StaffContext) {
    const trainerScoped = isTrainerScoped(context.roles);
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function' && Boolean((this.prisma as any).studioMember)) {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        return tx.studioMember.findMany({
          where: {
            tenantId: context.tenantId,
            ...(trainerScoped ? { trainerUserId: context.actorId ?? '00000000-0000-0000-0000-000000000000' } : {}),
          },
          orderBy: { createdAt: 'desc' },
        });
      });
    }
    if (trainerScoped) throw new ForbiddenException('Trainer member lists require the assignment-aware PostgreSQL store');
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.member.list_members', httpMethod: 'GET', body: { tenant: context.tenantCode, limit: 100, start: 0 } });
  }

  async get(context: StaffContext, id: string) {
    const trainerScoped = isTrainerScoped(context.roles);
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function' && Boolean((this.prisma as any).studioMember)) {
      return this.prisma.withTenant(context.tenantId, async (tx) => {
        const member = await tx.studioMember.findFirst({
          where: {
            id,
            tenantId: context.tenantId,
            ...(trainerScoped ? { trainerUserId: context.actorId ?? '00000000-0000-0000-0000-000000000000' } : {}),
          },
        });
        if (!member) throw new NotFoundException('Member not found');
        return member;
      });
    }
    if (trainerScoped) throw new ForbiddenException('Trainer member lookups require the assignment-aware PostgreSQL store');
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.member.get_member', httpMethod: 'GET', body: { tenant: context.tenantCode, member: id } });
  }

  async assignTrainer(context: Context, memberId: string, trainerUserId: string | null, actorId: string) {
    if (!this.prisma) throw new BadRequestException('Trainer assignments require the PostgreSQL data store');
    const result = await this.prisma.withTenant(context.tenantId, async (tx) => {
      let trainerName: string | null = null;
      if (trainerUserId) {
        const trainer = await tx.user.findFirst({ where: { id: trainerUserId, tenantId: context.tenantId, status: 'active', userType: 'staff' } });
        if (!trainer) throw new BadRequestException('Trainer account is not active in this studio');
        const assignments = await tx.userRoleAssignment.findMany({ where: { tenantId: context.tenantId, userId: trainerUserId }, select: { roleId: true } });
        const trainerRole = await tx.role.findFirst({ where: { tenantId: context.tenantId, id: { in: assignments.map((row) => row.roleId) }, code: { in: ['trainer', 'coach', 'lead_trainer'] } } });
        if (!trainerRole) throw new BadRequestException('Selected team member does not have a fitness delivery role');
        trainerName = trainer.displayName;
      }
      const updated = await tx.studioMember.updateMany({
        where: { id: memberId, tenantId: context.tenantId },
        data: { trainerUserId, coach: trainerName ?? 'Unassigned', updatedAt: new Date() },
      });
      if (updated.count !== 1) throw new NotFoundException('Member not found');
      return tx.studioMember.findFirstOrThrow({ where: { id: memberId, tenantId: context.tenantId } });
    });
    await this.audit(context, actorId, 'member.trainer_assigned', memberId);
    return result;
  }

  getSelf(context: MemberContext) {
    return this.get(context, context.memberRef);
  }

  async updateSelf(context: MemberContext, input: Pick<MemberInput, 'full_name' | 'email' | 'date_of_birth' | 'gender' | 'profile_photo_url' | 'emergency_contact'>, actorId: string) {
    return this.update(context, context.memberRef, input, actorId);
  }

  async create(context: Context, input: MemberInput, actorId: string) {
    if (input.membership_id) throw new BadRequestException('Create the member first, then create a tenant-validated membership');
    let result: { id?: string; member_id?: string; duplicate?: boolean } = {};
    try {
      result = (await this.erp.call({
        tenantId: context.tenantCode,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.member.create_member',
        idempotencyKey: randomUUID(),
        body: {
          tenant: context.tenantCode,
          full_name: input.full_name,
          email: input.email,
          phone: input.phone,
          date_of_birth: input.date_of_birth,
          gender: input.gender,
          join_date: input.join_date,
          status: input.status,
          emergency_contact: input.emergency_contact,
          profile_photo_url: input.profile_photo_url,
        },
      })) as { id?: string; member_id?: string; duplicate?: boolean };
    } catch {
      result = { id: randomUUID(), duplicate: false };
    }
    const memberId = String(result.id ?? result.member_id ?? randomUUID());

    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && this.prisma) {
      await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        if (!tx?.studioMember?.create) return;
        await tx.studioMember.create({
          data: {
            id: memberId,
            tenantId: context.tenantId,
            fullName: input.full_name || 'Member',
            email: input.email || '',
            phone: input.phone || '',
            plan: 'Premium',
            status: input.status || 'Active',
            joined: input.join_date ? new Date(input.join_date) : new Date(),
            coach: 'Unassigned',
          },
        });
      });
    }

    if (!result.duplicate) await this.audit(context, actorId, 'member.created', memberId);
    return { id: memberId, ...result };
  }

  async update(context: any, id: string, input: MemberInput, actorId?: string) {
    if (context.role === 'member' && context.userId !== id && context.memberRef !== id) {
      return { success: false, error: '404 Not Found' };
    }
    if (input.membership_id) throw new BadRequestException('Membership links must be changed through the memberships API');

    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function' && Boolean((this.prisma as any).studioMember)) {
      return this.prisma.withTenant(context.tenantId, async (tx: any) => {
        const existing = await tx.studioMember.findFirst({ where: { id, tenantId: context.tenantId } });
        if (!existing) throw new NotFoundException('Member not found');

        // Email address is read-only for members; enforce strictly
        if (input.email && input.email.trim().toLowerCase() !== existing.email.toLowerCase()) {
          throw new BadRequestException('Registered email address cannot be changed');
        }

        const dataToUpdate: any = { updatedAt: new Date() };
        if (input.full_name !== undefined) dataToUpdate.fullName = input.full_name.trim();
        if (input.phone !== undefined) dataToUpdate.phone = input.phone.trim();
        if (input.coach !== undefined) dataToUpdate.coach = input.coach;
        if (input.status !== undefined) dataToUpdate.status = input.status;

        const updated = await tx.studioMember.update({
          where: { id },
          data: dataToUpdate,
        });

        // Also update the User record's displayName and phone if present
        if (actorId && input.full_name) {
          await tx.user.updateMany({
            where: { id: actorId, tenantId: context.tenantId },
            data: { displayName: input.full_name.trim(), updatedAt: new Date() },
          });
        }

        try {
          const updates = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'membership_id'));
          await this.erp.call({
            tenantId: context.tenantCode,
            correlationId: context.correlationId,
            method: 'wellness_studio.api.member.update_member',
            body: { tenant: context.tenantCode, member: id, updates },
          });
        } catch {}

        if (actorId) await this.audit(context, actorId, 'member.updated', id);
        return updated;
      });
    }

    const updates = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'membership_id'));
    const result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.member.update_member', body: { tenant: context.tenantCode, member: id, updates } });
    if (actorId) await this.audit(context, actorId, 'member.updated', id);
    return result || { success: true, id };
  }

  async delete(context: any, id: string): Promise<{ success: boolean; error?: string }> {
    if (context.role === 'member' && context.userId !== id) {
      return { success: false, error: '404 Not Found' };
    }
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && this.prisma) {
      await this.prisma.withTenant(context.tenantId, async (tx) => {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          await tx.studioMember.deleteMany({
            where: { id, tenantId: context.tenantId },
          });
        }
      });
    }
    return { success: true };
  }

  async deactivate(context: Context, id: string, actorId: string) {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && this.prisma) {
      await this.prisma.withTenant(context.tenantId, async (tx) => {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          await tx.studioMember.deleteMany({
            where: { id, tenantId: context.tenantId },
          });
        }
      });
    }

    try {
      await this.erp.call({
        tenantId: context.tenantCode,
        correlationId: context.correlationId,
        method: 'wellness_studio.api.member.deactivate_member',
        body: { tenant: context.tenantCode, member: id },
      });
    } catch {}

    await this.audit(context, actorId, 'member.deactivated', id);
    return { success: true, id };
  }
}
