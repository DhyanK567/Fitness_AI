import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import type { SaveProgressNoteDto, SaveWorkoutPlanDto } from './trainer-workspace.dto';

@Injectable()
export class TrainerWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  overview(tenantId: string, trainerUserId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [trainer, tenant] = await Promise.all([
        tx.user.findFirst({
          where: { id: trainerUserId, tenantId, userType: 'staff', status: 'active' },
          select: { id: true, displayName: true, email: true, phoneE164: true },
        }),
        tx.tenant.findFirst({
          where: { id: tenantId, status: 'active' },
          select: { id: true, code: true, displayName: true, timezone: true, currency: true, tierId: true },
        }),
      ]);
      if (!trainer || !tenant) throw new NotFoundException('Trainer workspace was not found');

      const trainerDisplayName = trainer.displayName || '';
      const baseName = trainerDisplayName.replace(/\s*\([^)]*\)/g, '').trim();

      const aliases = new Set<string>();
      if (trainerDisplayName) aliases.add(trainerDisplayName);
      if (baseName) aliases.add(baseName);
      if (
        /^(ranaya|ramya)$/i.test(baseName) ||
        /^(ranaya|ramya)$/i.test(trainerDisplayName) ||
        /^(ranaya|ramya)/i.test(trainer.email || '')
      ) {
        aliases.add('Ranaya');
        aliases.add('ramya');
        aliases.add('Ramya');
      }

      const classConditions: Prisma.StudioClassWhereInput[] = [
        ...Array.from(aliases).flatMap((alias) => [
          { trainer: { equals: alias, mode: Prisma.QueryMode.insensitive } },
          { trainer: { contains: alias, mode: Prisma.QueryMode.insensitive } },
        ]),
        ...(trainer.email ? [{ trainer: { equals: trainer.email, mode: Prisma.QueryMode.insensitive } }] : []),
      ];

      const [tier, sessions, workouts, progress, feedback] = await Promise.all([
        tx.subscriptionTier.findUnique({ where: { id: tenant.tierId }, select: { code: true, displayName: true } }),
        tx.studioClass.findMany({
          where: {
            tenantId,
            OR: classConditions,
          },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        }),
        tx.trainerWorkoutPlan.findMany({ where: { tenantId, trainerUserId }, orderBy: { updatedAt: 'desc' } }),
        tx.trainerProgressNote.findMany({ where: { tenantId, trainerUserId }, orderBy: { recordedAt: 'desc' } }),
        tx.studioSessionFeedback.findMany({
          where: { tenantId, trainerUserId },
          select: {
            id: true,
            tenantId: true,
            sessionId: true,
            memberId: true,
            trainerUserId: true,
            submittedBy: true,
            rating: true,
            strengths: true,
            improvements: true,
            comment: true,
            reviewStatus: true,
            followUpNote: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const sessionIds = sessions.map((session) => session.id);

      // Bookings for this trainer's sessions
      const sessionBookings = sessionIds.length
        ? await tx.studioBooking.findMany({
            where: { tenantId, classId: { in: sessionIds } },
            orderBy: { bookedAt: 'desc' },
          })
        : [];

      const bookingMemberIds = sessionBookings.map((b) => b.memberId);

      // Members assigned to this trainer (directly or via coaching assignment or booked in trainer's sessions)
      const memberConditions: Prisma.StudioMemberWhereInput[] = [
        { trainerUserId },
        ...Array.from(aliases).map((alias) => ({
          coach: { equals: alias, mode: Prisma.QueryMode.insensitive },
        })),
        ...(bookingMemberIds.length ? [{ id: { in: bookingMemberIds } }] : []),
      ];

      const members = await tx.studioMember.findMany({
        where: {
          tenantId,
          OR: memberConditions,
        },
        select: { id: true, fullName: true, email: true, phone: true, plan: true, status: true, joined: true, expiry: true, coach: true },
        orderBy: { fullName: 'asc' },
      });

      const memberIds = members.map((member) => member.id);

      const allMemberBookings = memberIds.length
        ? await tx.studioBooking.findMany({
            where: {
              tenantId,
              memberId: { in: memberIds },
            },
            orderBy: { bookedAt: 'desc' },
          })
        : [];

      // Combine bookings deduplicated by ID
      const bookingMap = new Map<string, typeof sessionBookings[0]>();
      for (const b of [...sessionBookings, ...allMemberBookings]) {
        bookingMap.set(b.id, b);
      }
      const bookings = Array.from(bookingMap.values());
      const bookingIds = bookings.map((b) => b.id);

      const attendance = bookingIds.length
        ? await tx.studioAttendance.findMany({
            where: { tenantId, bookingId: { in: bookingIds } },
            orderBy: { createdAt: 'desc' },
          })
        : [];

      return {
        trainer,
        studio: {
          id: tenant.id,
          code: tenant.code,
          name: tenant.displayName,
          timezone: tenant.timezone,
          currency: tenant.currency,
          tier: tier?.code ?? 'starter',
          tierName: tier?.displayName ?? 'Basic',
        },
        members,
        sessions,
        bookings,
        attendance,
        workouts,
        progress,
        feedback,
      };
    });
  }

  private async assertAssigned(tx: Prisma.TransactionClient, tenantId: string, trainerUserId: string, memberId: string) {
    const trainer = await tx.user.findFirst({ where: { id: trainerUserId, tenantId }, select: { displayName: true } });
    const trainerDisplayName = trainer?.displayName || '';
    const baseName = trainerDisplayName.replace(/\s*\([^)]*\)/g, '').trim();
    const aliases = new Set<string>();
    if (trainerDisplayName) aliases.add(trainerDisplayName);
    if (baseName) aliases.add(baseName);
    if (/^(ranaya|ramya)$/i.test(baseName) || /^(ranaya|ramya)$/i.test(trainerDisplayName)) {
      aliases.add('Ranaya');
      aliases.add('ramya');
      aliases.add('Ramya');
    }

    const member = await tx.studioMember.findFirst({
      where: {
        id: memberId,
        tenantId,
        OR: [
          { trainerUserId },
          ...Array.from(aliases).map((alias) => ({
            coach: { equals: alias, mode: Prisma.QueryMode.insensitive },
          })),
        ],
      },
      select: { id: true },
    });
    if (!member) {
      const hasBooking = await tx.studioBooking.findFirst({
        where: {
          tenantId,
          memberId,
        },
      });
      if (!hasBooking) {
        throw new ForbiddenException('Only members assigned to this trainer can be updated');
      }
    }
  }

  workouts(tenantId: string, trainerUserId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.trainerWorkoutPlan.findMany({ where: { tenantId, trainerUserId }, orderBy: { updatedAt: 'desc' } })
    );
  }

  saveWorkout(tenantId: string, trainerUserId: string, input: SaveWorkoutPlanDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertAssigned(tx, tenantId, trainerUserId, input.member_id);
      if (input.id) {
        const changed = await tx.trainerWorkoutPlan.updateMany({
          where: { id: input.id, tenantId, trainerUserId },
          data: {
            title: input.title.trim(),
            goal: input.goal?.trim() || null,
            exercises: input.exercises as Prisma.InputJsonValue,
            active: input.active ?? true,
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1) throw new NotFoundException('Workout plan was not found');
        return tx.trainerWorkoutPlan.findUnique({ where: { id: input.id } });
      }
      return tx.trainerWorkoutPlan.create({
        data: {
          tenantId,
          trainerUserId,
          memberId: input.member_id,
          title: input.title.trim(),
          goal: input.goal?.trim() || null,
          exercises: input.exercises as Prisma.InputJsonValue,
          active: input.active ?? true,
        },
      });
    });
  }

  progress(tenantId: string, trainerUserId: string) {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.trainerProgressNote.findMany({ where: { tenantId, trainerUserId }, orderBy: { recordedAt: 'desc' } })
    );
  }

  saveProgress(tenantId: string, trainerUserId: string, input: SaveProgressNoteDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await this.assertAssigned(tx, tenantId, trainerUserId, input.member_id);
      const data = {
        recordedAt: new Date(input.recorded_at),
        metrics: input.metrics as Prisma.InputJsonValue,
        notes: input.notes?.trim() || null,
        milestone: input.milestone?.trim() || null,
        updatedAt: new Date(),
      };
      if (input.id) {
        const changed = await tx.trainerProgressNote.updateMany({ where: { id: input.id, tenantId, trainerUserId }, data });
        if (changed.count !== 1) throw new NotFoundException('Progress note was not found');
        return tx.trainerProgressNote.findUnique({ where: { id: input.id } });
      }
      return tx.trainerProgressNote.create({ data: { tenantId, trainerUserId, memberId: input.member_id, ...data } });
    });
  }

  updateProfile(
    tenantId: string,
    trainerUserId: string,
    body: { displayName?: string; phoneE164?: string },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { tenantId, id: trainerUserId, status: 'active' } });
      if (!user) throw new NotFoundException('Trainer was not found');

      const dataToUpdate: Prisma.UserUpdateInput = {};
      if (body.displayName && body.displayName.trim().length >= 2) {
        dataToUpdate.displayName = body.displayName.trim();
      }
      if (body.phoneE164 !== undefined) {
        dataToUpdate.phoneE164 = body.phoneE164.trim() || null;
      }

      const updated = await tx.user.update({
        where: { id: user.id },
        data: dataToUpdate,
        select: { id: true, displayName: true, email: true, phoneE164: true },
      });

      return {
        id: updated.id,
        displayName: updated.displayName,
        email: updated.email,
        phoneE164: updated.phoneE164,
        status: 'updated',
      };
    });
  }
}
