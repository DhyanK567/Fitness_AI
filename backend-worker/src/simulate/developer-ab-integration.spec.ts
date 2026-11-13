import { TrainerRosterService } from '../trainer-roster/trainer-roster.service';
import { PrismaService } from '../common/prisma.service';
import { mapHealthFlags, HEALTH_FLAG_COACHING_NOTES } from '../services/health-flags.mapper';
import { formatTrainerBriefing } from '../formatters/trainer-briefing.formatter';
import { buildFloorAlertMessage, FLOOR_ALERT_TEMPLATES } from '../formatters/floor-alert-message';
import { runRosterSimulation } from './roster.simulate';
import type { FloorAlertContext, FloorAlert } from '../types/floor-alert.types';
import type { TrainerRoster, ClientNote } from '../types/roster.types';

describe('Developer A and Developer B Integration Verification', () => {
  const CANONICAL_TENANT_ID = 'e2b3c4d5-6789-4000-8000-abcdef123456';
  const CANONICAL_TRAINER_ID = 't1a2b3c4-5678-4000-8000-111122223333';
  const CANONICAL_MEMBER_ID = 'c1111111-1111-4111-8111-111111111111';

  describe('Developer A Integration (Roster Pipeline & Mapper/Formatter Usage)', () => {
    it('allows Developer A to use mapHealthFlags to convert member profiles to ClientNote[]', () => {
      // Developer A queries member profiles and calls Developer C mapper
      const rawProfiles = [
        {
          fullName: 'Priya Sharma',
          first_time_member: true,
          knee_injury: false,
          lower_back_pain: false,
          post_surgery: false,
        },
        {
          fullName: 'Rahul Mehta',
          firstTimeMember: false,
          kneeInjury: false,
          lowerBackPain: true,
          postSurgery: false,
        },
      ];

      const notes: ClientNote[] = [];
      for (const p of rawProfiles) {
        notes.push(...mapHealthFlags(p));
      }

      expect(notes).toHaveLength(2);
      expect(notes[0]).toEqual({
        memberName: 'Priya Sharma',
        kind: 'FIRST_TIMER',
        text: HEALTH_FLAG_COACHING_NOTES.FIRST_TIMER,
      });
      expect(notes[1]).toEqual({
        memberName: 'Rahul Mehta',
        kind: 'LOWER_BACK',
        text: HEALTH_FLAG_COACHING_NOTES.LOWER_BACK,
      });
    });

    it('allows Developer A to format built TrainerRoster into WhatsApp briefing using formatTrainerBriefing', () => {
      const roster: TrainerRoster = {
        tenantId: CANONICAL_TENANT_ID,
        trainerId: CANONICAL_TRAINER_ID,
        trainerName: 'Marcus',
        phone: '+919876543210',
        date: '2026-11-12',
        sessions: [
          {
            classId: 'class-dev-a-01',
            startTime: new Date('2026-11-12T01:30:00.000Z'), // 07:00 AM IST
            className: 'Strength & Conditioning',
            roomName: 'Main Floor',
            confirmed: 12,
            capacity: 15,
            soldOut: false,
            notes: [
              {
                memberName: 'Priya Sharma',
                kind: 'FIRST_TIMER',
                text: HEALTH_FLAG_COACHING_NOTES.FIRST_TIMER,
              },
            ],
          },
        ],
      };

      const message = formatTrainerBriefing(roster);

      expect(message).toContain('🌅 Good morning Coach Marcus! Here is your schedule for today (Thursday, Nov 12):');
      expect(message).toContain('🏋️ Session 1: 07:00 AM - Strength & Conditioning (Main Floor)');
      expect(message).toContain('👥 Attendance: 12/15 Confirmed');
      expect(message).toContain('⚠️ Important Client Notes:');
      expect(message).toContain('• Priya Sharma (First-timer, introduce gym layout)');
      expect(message).toContain('Have a high-energy day on the floor!');
    });

    it('verifies runRosterSimulation operates directly with Developer A TrainerRosterService', async () => {
      // Mock PrismaService for TrainerRosterService
      const mockPrisma = {
        withTenant: jest.fn().mockImplementation(async (tenantId: string, cb: any) => {
          return cb({
            user: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: CANONICAL_TRAINER_ID,
                  displayName: 'Coach Marcus',
                  phoneE164: '+919876543210',
                  email: 'marcus@wellness.local',
                },
              ]),
            },
            studioClass: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 'cls-live-01',
                  name: 'HIIT & Core',
                  room: 'Studio A',
                  trainer: 'Coach Marcus',
                  startTime: '07:00',
                  capacity: 15,
                },
              ]),
            },
            studioBooking: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 'bkg-1',
                  classId: 'cls-live-01',
                  memberId: CANONICAL_MEMBER_ID,
                  status: 'Confirmed',
                },
              ]),
            },
            studioMember: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: CANONICAL_MEMBER_ID,
                  fullName: 'Priya Sharma',
                  firstTimeMember: true,
                  kneeInjury: false,
                  lowerBackPain: false,
                  postSurgery: false,
                },
              ]),
            },
          });
        }),
      } as unknown as PrismaService;

      const trainerRosterService = new TrainerRosterService(mockPrisma);

      // Execute simulation passing Developer A's actual service and tenantId
      const simResult = await runRosterSimulation(
        '2026-11-12',
        undefined,
        true, // silent mode
        trainerRosterService,
        CANONICAL_TENANT_ID,
      );

      expect(simResult.date).toBe('2026-11-12');
      expect(simResult.renderedBriefings).toHaveLength(1);
      expect(simResult.renderedBriefings[0].trainerName).toBe('Coach Marcus');
      expect(simResult.renderedBriefings[0].briefingText).toContain('HIIT & Core');
      expect(simResult.renderedBriefings[0].briefingText).toContain('Priya Sharma');
      expect(simResult.outboxWrites).toBe(0);
      expect(simResult.whatsappDispatches).toBe(0);
    });
  });

  describe('Developer B Integration (Floor Alert Message Builder & Outbox/SSE Usage)', () => {
    it('allows Developer B to build SURGE_90 alert message for Front Desk SSE & Outbox', () => {
      const surgeContext: FloorAlertContext = {
        tenantId: CANONICAL_TENANT_ID,
        classId: 'class-b-surge',
        type: 'SURGE_90',
        className: 'HIIT',
        startTime: '18:00',
        booked: 19,
        capacity: 20,
        occupancyPct: 95,
      };

      const message = buildFloorAlertMessage(surgeContext);
      expect(message).toBe(
        'Capacity Surge: HIIT at 06:00 PM is now 95% full (19/20 spots).\nPrepare additional equipment.',
      );

      // Verify Developer B can construct the full FloorAlert contract
      const floorAlert: FloorAlert = {
        ...surgeContext,
        message,
        dedupKey: `floor-alert:${CANONICAL_TENANT_ID}:${surgeContext.classId}:SURGE_90`,
      };

      expect(floorAlert.message).toContain('Capacity Surge: HIIT at 06:00 PM is now 95% full');
      expect(floorAlert.dedupKey).toBe(`floor-alert:${CANONICAL_TENANT_ID}:class-b-surge:SURGE_90`);
    });

    it('allows Developer B to build FULL_100 alert message for Front Desk waitlist notification', () => {
      const fullContext: FloorAlertContext = {
        tenantId: CANONICAL_TENANT_ID,
        classId: 'class-b-full',
        type: 'FULL_100',
        className: 'Spin Revolution',
        startTime: '19:00',
        booked: 25,
        capacity: 25,
      };

      const message = buildFloorAlertMessage(fullContext);
      expect(message).toBe(
        'Class Full: Spin Revolution at 07:00 PM is now 100% full (25/25).\nConsider opening a waitlist.',
      );
    });

    it('allows Developer B to build LOW_ATTENDANCE alert message for 4-hour pre-class monitoring', () => {
      const lowContext: FloorAlertContext = {
        tenantId: CANONICAL_TENANT_ID,
        classId: 'class-b-low',
        type: 'LOW_ATTENDANCE',
        className: 'Sunrise Yoga',
        startTime: '06:00 AM',
        booked: 2,
        capacity: 20,
        minutesUntilStart: 240,
      };

      const message = buildFloorAlertMessage(lowContext);
      expect(message).toBe(
        'Low Attendance: Sunrise Yoga at 06:00 AM has only 2 booking(s) and starts in 4 hours.\nLaunch an instant waitlist push or confirm trainer availability.',
      );
    });
  });
});
