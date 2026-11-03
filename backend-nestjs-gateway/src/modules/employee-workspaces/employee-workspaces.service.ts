import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { CreateWalkInLeadDto } from './dto/create-walk-in-lead.dto';

@Injectable()
export class EmployeeWorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  private async identity(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
    const [user, tenant] = await Promise.all([
      tx.user.findFirst({ where: { id: userId, tenantId, userType: 'staff', status: 'active' }, select: { id: true, displayName: true, email: true, phoneE164: true } }),
      tx.tenant.findFirst({ where: { id: tenantId, status: 'active' }, select: { id: true, code: true, displayName: true, timezone: true, currency: true, tierId: true } }),
    ]);
    if (!user || !tenant) throw new NotFoundException('Employee workspace was not found');
    const tier = await tx.subscriptionTier.findUnique({ where: { id: tenant.tierId }, select: { code: true, displayName: true } });
    return {
      user,
      studio: { id: tenant.id, code: tenant.code, name: tenant.displayName, timezone: tenant.timezone, currency: tenant.currency, tier: tier?.code ?? 'starter', tierName: tier?.displayName ?? 'Basic' },
    };
  }

  frontDesk(tenantId: string, userId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [base, members, sessions, bookings, attendance] = await Promise.all([
        this.identity(tx, tenantId, userId),
        tx.studioMember.findMany({ where: { tenantId }, orderBy: { fullName: 'asc' }, take: 500 }),
        tx.studioClass.findMany({ where: { tenantId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 500 }),
        tx.studioBooking.findMany({ where: { tenantId }, orderBy: { bookedAt: 'desc' }, take: 1000 }),
        tx.studioAttendance.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 1000 }),
      ]);
      return { ...base, members, sessions, bookings, attendance };
    });
  }

  createWalkInLead(tenantId: string, userId: string, input: CreateWalkInLeadDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.identity(tx, tenantId, userId);
      return tx.studioLead.create({
        data: {
          tenantId,
          name: input.full_name.trim(),
          email: input.email?.trim().toLowerCase() || null,
          phone: input.phone.replace(/[\s-]/g, ''),
          source: 'Walk-in',
          stage: 'New enquiry',
          plan: input.plan?.trim() || 'Not selected',
          notes: input.notes?.trim() || null,
        },
      });
    });
  }

  billing(tenantId: string, userId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [base, members, payments] = await Promise.all([
        this.identity(tx, tenantId, userId),
        tx.studioMember.findMany({ where: { tenantId }, select: { id: true, fullName: true, email: true, phone: true, status: true }, orderBy: { fullName: 'asc' } }),
        tx.studioPayment.findMany({ where: { tenantId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 1000 }),
      ]);
      const totals = payments.reduce((sum, payment) => {
        const net = Math.max(0, payment.amount - payment.refundedAmount);
        if (payment.status.toLowerCase() === 'paid') sum.collected += net;
        else sum.pending += net;
        sum.refunded += payment.refundedAmount;
        return sum;
      }, { collected: 0, pending: 0, refunded: 0 });
      return { ...base, members, payments, totals };
    });
  }

  leadTrainer(tenantId: string, userId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const base = await this.identity(tx, tenantId, userId);
      const trainerRoles = await tx.role.findMany({ where: { tenantId, code: { in: ['trainer', 'coach', 'lead_trainer'] } }, select: { id: true, code: true } });
      const assignments = trainerRoles.length
        ? await tx.userRoleAssignment.findMany({ where: { tenantId, roleId: { in: trainerRoles.map((role) => role.id) } }, select: { userId: true, roleId: true } })
        : [];
      const trainers = assignments.length
        ? await tx.user.findMany({ where: { tenantId, id: { in: [...new Set(assignments.map((assignment) => assignment.userId))] }, status: 'active' }, select: { id: true, displayName: true, email: true, phoneE164: true, lastLoginAt: true }, orderBy: { displayName: 'asc' } })
        : [];
      const [members, sessions, feedback] = await Promise.all([
        tx.studioMember.findMany({ where: { tenantId }, orderBy: { fullName: 'asc' }, take: 1000 }),
        tx.studioClass.findMany({ where: { tenantId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 500 }),
        tx.studioSessionFeedback.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 500 }),
      ]);
      const roleById = new Map(trainerRoles.map((role) => [role.id, role.code]));
      const roleByUser = new Map(assignments.map((assignment) => [assignment.userId, roleById.get(assignment.roleId)]));
      return { ...base, trainers: trainers.map((trainer) => ({ ...trainer, role: roleByUser.get(trainer.id) ?? 'trainer' })), members, sessions, feedback };
    });
  }
}
