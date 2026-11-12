import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { getIstDayRange, parseIstSessionDateTime } from '../common/date-utils';
import type { ClientNote, RosterSession, TrainerRoster } from '../types/roster.types';

export const CANONICAL_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TrainerRosterService {
  private readonly logger = new Logger(TrainerRosterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves and aggregates the daily class roster for all active trainers
   * within the specified tenant for a given IST calendar day.
   *
   * Features:
   * - Strict tenant isolation via withTenant and explicit tenantId filters
   * - Deterministic IST date boundaries [start, end)
   * - Multi-format trainer identity resolution (UUID, displayName, email)
   * - Safe UUID validation for booking-to-member resolution (no SQL cast errors)
   * - Tri-state health flag preservation (TRUE emits notes, FALSE/NULL skipped)
   * - Chronological session ordering by parsed startTime instant
   * - Deduplication of booking records and duplicate member alerts per session
   * - Filters out trainers with no scheduled sessions on the target date
   *
   * @param tenantId - Canonical UUID of the tenant
   * @param dateInput - Target IST calendar day (string YYYY-MM-DD or Date object)
   * @returns Array of assembled TrainerRoster contracts
   */
  async buildRosters(tenantId: string, dateInput?: string | Date): Promise<TrainerRoster[]> {
    if (!tenantId || !CANONICAL_UUID_REGEX.test(tenantId)) {
      throw new Error('A canonical tenant UUID is required for tenant-scoped database access.');
    }

    const dayRange = getIstDayRange(dateInput);

    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Identify active trainers belonging to this tenant with role TRAINER / trainer
      const activeTrainers = await tx.user.findMany({
        where: {
          tenantId,
          status: 'active',
          user_role_assignments: {
            some: {
              tenantId,
              roles: {
                code: { in: ['TRAINER', 'trainer'] },
              },
            },
          },
        },
        select: {
          id: true,
          displayName: true,
          phoneE164: true,
          email: true,
        },
      });

      if (activeTrainers.length === 0) {
        this.logger.debug(`No active trainers found for tenant ${tenantId}`);
        return [];
      }

      // 2. Retrieve scheduled classes for the target IST calendar day [start, end)
      const scheduledClasses = await tx.studioClass.findMany({
        where: {
          tenantId,
          status: 'Scheduled',
          date: {
            gte: dayRange.start,
            lt: dayRange.end,
          },
        },
        orderBy: [{ startTime: 'asc' }, { name: 'asc' }],
      });

      if (scheduledClasses.length === 0) {
        this.logger.debug(`No scheduled classes found for tenant ${tenantId} on date ${dayRange.dateString}`);
        return [];
      }

      // 3. Match classes to active trainers
      // A class belongs to a trainer if class.trainer matches the trainer's id (UUID),
      // displayName, or email (case-insensitive)
      const trainerClassesMap = new Map<string, typeof scheduledClasses>();
      const matchedClassIds = new Set<string>();

      for (const trainer of activeTrainers) {
        const trainerIdLower = trainer.id.toLowerCase();
        const trainerNameLower = trainer.displayName.trim().toLowerCase();
        const trainerEmailLower = trainer.email ? trainer.email.trim().toLowerCase() : null;

        const matchedForTrainer = scheduledClasses.filter((cls) => {
          const classTrainerStr = (cls.trainer || '').trim().toLowerCase();
          return (
            classTrainerStr === trainerIdLower ||
            classTrainerStr === trainerNameLower ||
            (trainerEmailLower !== null && classTrainerStr === trainerEmailLower)
          );
        });

        if (matchedForTrainer.length > 0) {
          trainerClassesMap.set(trainer.id, matchedForTrainer);
          for (const cls of matchedForTrainer) {
            matchedClassIds.add(cls.id);
          }
        }
      }

      if (matchedClassIds.size === 0) {
        this.logger.debug(
          `No classes matched any active trainer for tenant ${tenantId} on date ${dayRange.dateString}`,
        );
        return [];
      }

      // 4. Retrieve confirmed bookings for the matched classes
      const rawBookings = await tx.studioBooking.findMany({
        where: {
          tenantId,
          classId: { in: Array.from(matchedClassIds) },
          status: { in: ['Confirmed', 'confirmed'] },
        },
        orderBy: { bookedAt: 'asc' },
      });

      // Deduplicate bookings by booking.id to prevent duplicate counting (BUG-A-003)
      const confirmedBookings = Array.from(new Map(rawBookings.map((b) => [b.id, b])).values());

      // 5. Safe Member Profile matching:
      // StudioBooking.memberId is VARCHAR(160), while StudioMember.id is UUID.
      // Filter for valid UUIDs before executing the StudioMember query to avoid SQL cast syntax errors.
      const rawMemberIds = confirmedBookings.map((b) => b.memberId).filter((id): id is string => Boolean(id));
      const validMemberUuids = Array.from(
        new Set(rawMemberIds.filter((id) => CANONICAL_UUID_REGEX.test(id))),
      );

      type MemberRecord = {
        id: string;
        fullName: string;
        kneeInjury: boolean | null;
        lowerBackPain: boolean | null;
        postSurgery: boolean | null;
        firstTimeMember: boolean | null;
      };

      const members: MemberRecord[] = validMemberUuids.length > 0
        ? await tx.studioMember.findMany({
            where: {
              tenantId,
              id: { in: validMemberUuids },
            },
            select: {
              id: true,
              fullName: true,
              kneeInjury: true,
              lowerBackPain: true,
              postSurgery: true,
              firstTimeMember: true,
            },
          })
        : [];

      const memberMap = new Map<string, MemberRecord>();
      for (const member of members) {
        memberMap.set(member.id, member);
      }

      // Index bookings by classId
      const bookingsByClass = new Map<string, typeof confirmedBookings>();
      for (const booking of confirmedBookings) {
        const list = bookingsByClass.get(booking.classId) || [];
        list.push(booking);
        bookingsByClass.set(booking.classId, list);
      }

      // 6. Assemble TrainerRoster contracts
      const rosters: TrainerRoster[] = [];

      for (const trainer of activeTrainers) {
        const trainerClasses = trainerClassesMap.get(trainer.id);
        if (!trainerClasses || trainerClasses.length === 0) {
          // Exclude trainers with no sessions on this date
          continue;
        }

        const sessions: RosterSession[] = [];

        for (const cls of trainerClasses) {
          const classBookings = bookingsByClass.get(cls.id) || [];
          const confirmedCount = classBookings.length;
          const capacity = cls.capacity ?? 12;
          const isSoldOut = confirmedCount >= capacity;

          // Assemble client notes from member health flags (deduplicated by memberName:kind) (BUG-A-002)
          const notes: ClientNote[] = [];
          const seenNotes = new Set<string>();

          for (const booking of classBookings) {
            if (!booking.memberId) continue;
            const profile = memberMap.get(booking.memberId);
            if (!profile) continue;

            const memberName = profile.fullName || 'Member';

            const addNote = (kind: ClientNote['kind']) => {
              const noteKey = `${memberName}:${kind}`;
              if (!seenNotes.has(noteKey)) {
                seenNotes.add(noteKey);
                notes.push({ memberName, kind });
              }
            };

            // Preserve tri-state semantics: strictly check === true
            if (profile.firstTimeMember === true) {
              addNote('FIRST_TIMER');
            }
            if (profile.kneeInjury === true) {
              addNote('KNEE_INJURY');
            }
            if (profile.lowerBackPain === true) {
              addNote('LOWER_BACK');
            }
            if (profile.postSurgery === true) {
              addNote('POST_SURGERY');
            }
          }

          // Robust room name resolution (BUG-A-004)
          const roomName = (cls.room && cls.room.trim().length > 0) ? cls.room.trim() : 'Main Studio';

          sessions.push({
            classId: cls.id,
            startTime: parseIstSessionDateTime(dayRange.dateString, cls.startTime),
            className: cls.name,
            roomName,
            confirmed: confirmedCount,
            capacity,
            soldOut: isSoldOut,
            notes,
          });
        }

        // Chronological session ordering by parsed startTime epoch instant (BUG-A-001)
        sessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

        rosters.push({
          tenantId,
          trainerId: trainer.id,
          trainerName: trainer.displayName,
          phone: trainer.phoneE164 || '',
          date: dayRange.dateString,
          sessions,
        });
      }

      return rosters;
    });
  }
}
