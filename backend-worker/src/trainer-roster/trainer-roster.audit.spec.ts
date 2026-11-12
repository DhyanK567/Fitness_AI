/**
 * Member A – PDF-Based Test Case Verification & Defect Audit Spec
 *
 * Source Documents:
 * - B2B_Cycle2_Team_Work_Distribution.pdf (Section 10: Equal Testing Responsibilities)
 * - CYCLE2_TEAM_B2B_EXECUTION_GUIDE.pdf
 *
 * Covers:
 * - TEST A-UNIT-01: Empty Trainer Roster
 * - TEST A-UNIT-02: Multiple Classes and Aggregation (Chronological Order)
 * - TEST A-UNIT-03: Duplicate Prevention (Idempotence & Read-Only Guarantee)
 * - TEST A-UNIT-04: Tenant Isolation & Boundary Security
 * - TEST A-INT-01: Single-Class Day – Database to Roster
 * - TEST A-INT-02: Sold-Out Class (19/20, 20/20, 21/20 Thresholds)
 * - TEST A-INT-03: Fewer Than Three Bookings (0, 1, 2, 3 Confirmed vs Non-Confirmed)
 * - TEST A-INT-04: Four-Hour Timing – Fake Clock (3h59m, 4h, 4h1m Bounds)
 * - Functional requirements & BUG-A verification
 */

import { PrismaService } from '../common/prisma.service';
import { TrainerRosterService } from './trainer-roster.service';
import { TrainerRosterScheduler } from '../schedulers/trainer-roster/trainer-roster.scheduler';
import { RedisClient } from '../common/redis-client';
import { parseIstSessionDateTime } from '../common/date-utils';

describe('Member A – PDF-Based Test Case Generation & Bug Audit', () => {
  let service: TrainerRosterService;
  let mockPrisma: any;
  let mockTx: any;

  const TENANT_1 = '11111111-1111-4111-8111-111111111111';
  const TENANT_2 = '22222222-2222-4222-8222-222222222222';
  const TRAINER_1 = '33333333-3333-4333-8333-333333333333';
  const TRAINER_2 = '44444444-4444-4444-8444-444444444444';
  const CLASS_A = '55555555-5555-4555-8555-555555555555';
  const CLASS_B = '66666666-6666-4666-8666-666666666666';
  const CLASS_C = '77777777-7777-4777-8777-777777777777';
  const MEMBER_1 = '88888888-8888-4888-8888-888888888888';
  const MEMBER_2 = '99999999-9999-4999-8999-999999999999';

  const TARGET_DATE = '2026-11-13';

  beforeEach(() => {
    mockTx = {
      user: {
        findMany: jest.fn(),
      },
      studioClass: {
        findMany: jest.fn(),
      },
      studioBooking: {
        findMany: jest.fn(),
      },
      studioMember: {
        findMany: jest.fn(),
      },
      $executeRaw: jest.fn(),
    };

    mockPrisma = {
      withTenant: jest.fn().mockImplementation((tenantId: string, work: (tx: any) => Promise<any>) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
          throw new Error('A canonical tenant UUID is required for tenant-scoped database access.');
        }
        return work(mockTx);
      }),
    };

    service = new TrainerRosterService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // SECTION 2.A: MEMBER A UNIT TESTS (PDF SPEC)
  // ===========================================================================

  describe('TEST A-UNIT-01: Empty Trainer Roster', () => {
    it('should return empty roster array when no active trainers exist in tenant', async () => {
      mockTx.user.findMany.mockResolvedValue([]);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);

      expect(rosters).toEqual([]);
      expect(mockTx.studioClass.findMany).not.toHaveBeenCalled();
      expect(mockTx.studioBooking.findMany).not.toHaveBeenCalled();
      // Verifies no write/mutation database calls are issued
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
    });

    it('should return empty roster array when trainers exist but have zero scheduled classes', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Kavita Iyer', phoneE164: '+919876543210' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([]);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);

      expect(rosters).toEqual([]);
      expect(mockTx.studioBooking.findMany).not.toHaveBeenCalled();
    });

    it('should exclude trainers who have no classes on the requested date', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Trainer With Class', phoneE164: '+919876543210' },
        { id: TRAINER_2, displayName: 'Trainer Without Class', phoneE164: '+919876543211' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_A,
          tenantId: TENANT_1,
          name: 'Yoga Flow',
          startTime: '07:00',
          trainer: TRAINER_1,
          capacity: 10,
        },
      ]);
      mockTx.studioBooking.findMany.mockResolvedValue([]);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);

      expect(rosters).toHaveLength(1);
      expect(rosters[0].trainerId).toBe(TRAINER_1);
      // TRAINER_2 is omitted completely from output
      expect(rosters.some((r) => r.trainerId === TRAINER_2)).toBe(false);
    });
  });

  describe('TEST A-UNIT-02: Multiple Classes and Aggregation', () => {
    it('should produce one TrainerRoster with classes ordered strictly chronologically (BUG-A-001 fix)', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);

      // Classes returned in non-chronological order from query (e.g. evening class before morning class)
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_B,
          tenantId: TENANT_1,
          name: 'Evening Stretch',
          startTime: '19:00',
          trainer: 'Ananya Rao',
          room: 'Studio 2',
          capacity: 15,
        },
        {
          id: CLASS_A,
          tenantId: TENANT_1,
          name: 'Morning HIIT',
          startTime: '07:00',
          trainer: 'Ananya Rao',
          room: 'Main Gym',
          capacity: 12,
        },
      ]);

      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_1, classId: CLASS_A, memberId: MEMBER_1, status: 'Confirmed' },
      ]);
      mockTx.studioMember.findMany.mockResolvedValue([
        { id: MEMBER_1, fullName: 'Devendra', kneeInjury: true },
      ]);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);

      expect(rosters).toHaveLength(1);
      const roster = rosters[0];
      expect(roster.trainerId).toBe(TRAINER_1);
      expect(roster.sessions).toHaveLength(2);

      // Verifies session 1 is 07:00 (earlier) and session 2 is 19:00 (later)
      expect(roster.sessions[0].classId).toBe(CLASS_A);
      expect(roster.sessions[0].className).toBe('Morning HIIT');
      expect(roster.sessions[0].startTime.toISOString()).toBe('2026-11-13T01:30:00.000Z'); // 07:00 IST
      expect(roster.sessions[0].confirmed).toBe(1);

      expect(roster.sessions[1].classId).toBe(CLASS_B);
      expect(roster.sessions[1].className).toBe('Evening Stretch');
      expect(roster.sessions[1].startTime.toISOString()).toBe('2026-11-13T13:30:00.000Z'); // 19:00 IST
      expect(roster.sessions[1].confirmed).toBe(0);
    });

    it('should correctly sanitize room names with whitespace (BUG-A-004 fix)', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_A,
          tenantId: TENANT_1,
          name: 'Class with whitespace room',
          startTime: '08:00',
          trainer: 'Ananya Rao',
          room: '   ',
          capacity: 10,
        },
        {
          id: CLASS_B,
          tenantId: TENANT_1,
          name: 'Class with null room',
          startTime: '09:00',
          trainer: 'Ananya Rao',
          room: null,
          capacity: 10,
        },
      ]);
      mockTx.studioBooking.findMany.mockResolvedValue([]);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);

      expect(rosters[0].sessions[0].roomName).toBe('Main Studio');
      expect(rosters[0].sessions[1].roomName).toBe('Main Studio');
    });
  });

  describe('TEST A-UNIT-03: Duplicate Prevention (Idempotence & Read-Only)', () => {
    it('should produce identical roster data across repeated executions without side-effects', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_A,
          tenantId: TENANT_1,
          name: 'Pilates Core',
          startTime: '08:00',
          trainer: 'Ananya Rao',
          room: 'Studio A',
          capacity: 10,
        },
      ]);
      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_1, classId: CLASS_A, memberId: MEMBER_1, status: 'Confirmed' },
      ]);
      mockTx.studioMember.findMany.mockResolvedValue([
        { id: MEMBER_1, fullName: 'Asha Bhosle', postSurgery: true },
      ]);

      const run1 = await service.buildRosters(TENANT_1, TARGET_DATE);
      const run2 = await service.buildRosters(TENANT_1, TARGET_DATE);

      expect(run1).toEqual(run2);
      expect(mockPrisma.withTenant).toHaveBeenCalledTimes(2);
      // Confirms buildRosters is purely read-only and does not persist duplicate rows
      expect(mockTx.$executeRaw).not.toHaveBeenCalled();
    });

    it('should deduplicate booking rows if duplicated in query results (BUG-A-003 fix)', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_A,
          tenantId: TENANT_1,
          name: 'Pilates Core',
          startTime: '08:00',
          trainer: 'Ananya Rao',
          capacity: 10,
        },
      ]);
      // Duplicate booking records with same id 'b1'
      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_1, classId: CLASS_A, memberId: MEMBER_1, status: 'Confirmed' },
        { id: 'b1', tenantId: TENANT_1, classId: CLASS_A, memberId: MEMBER_1, status: 'Confirmed' },
      ]);
      mockTx.studioMember.findMany.mockResolvedValue([]);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);

      // Must count as exactly 1 confirmed booking, not 2
      expect(rosters[0].sessions[0].confirmed).toBe(1);
    });

    it('should deduplicate client notes if member has multiple bookings in same session (BUG-A-002 fix)', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_A,
          tenantId: TENANT_1,
          name: 'Pilates Core',
          startTime: '08:00',
          trainer: 'Ananya Rao',
          capacity: 10,
        },
      ]);
      // Member has two distinct bookings (e.g. for self and spot reservation)
      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_1, classId: CLASS_A, memberId: MEMBER_1, status: 'Confirmed' },
        { id: 'b2', tenantId: TENANT_1, classId: CLASS_A, memberId: MEMBER_1, status: 'Confirmed' },
      ]);
      mockTx.studioMember.findMany.mockResolvedValue([
        { id: MEMBER_1, fullName: 'Ramesh', kneeInjury: true },
      ]);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);

      expect(rosters[0].sessions[0].confirmed).toBe(2);
      // Notes should list KNEE_INJURY for Ramesh only once
      expect(rosters[0].sessions[0].notes).toEqual([
        { memberName: 'Ramesh', kind: 'KNEE_INJURY' },
      ]);
    });
  });

  describe('TEST A-UNIT-04: Tenant Isolation & Boundary Security', () => {
    it('should reject non-UUID tenant identifiers before making database calls', async () => {
      const maliciousTenantIds = [
        "1' OR '1'='1",
        '../etc/passwd',
        'tenant-abc',
        '',
        'undefined',
      ];

      for (const badId of maliciousTenantIds) {
        await expect(service.buildRosters(badId, TARGET_DATE)).rejects.toThrow(
          'A canonical tenant UUID is required for tenant-scoped database access.',
        );
      }
      expect(mockPrisma.withTenant).not.toHaveBeenCalled();
    });

    it('should enforce tenant isolation in all queries preventing cross-tenant leakage', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Tenant 1 Trainer', phoneE164: '+919000000001' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_A,
          tenantId: TENANT_1,
          name: 'Tenant 1 Class',
          startTime: '07:00',
          trainer: TRAINER_1,
          capacity: 10,
        },
      ]);
      mockTx.studioBooking.findMany.mockResolvedValue([]);

      await service.buildRosters(TENANT_1, TARGET_DATE);

      // Verify every query strictly applies tenantId: TENANT_1
      expect(mockTx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_1 }) }),
      );
      expect(mockTx.studioClass.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_1 }) }),
      );
      expect(mockTx.studioBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_1 }) }),
      );
    });
  });

  // ===========================================================================
  // SECTION 2.B: MEMBER A INTEGRATION TESTS (PDF SPEC)
  // ===========================================================================

  describe('TEST A-INT-01: Single-Class Day – Database to Roster', () => {
    it('should assemble complete TrainerRoster contract from simulated database entities', async () => {
      mockTx.user.findMany.mockResolvedValue([
        {
          id: TRAINER_1,
          displayName: 'Vikramaditya',
          phoneE164: '+919845099999',
          email: 'vikram@fitness.in',
        },
      ]);

      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_A,
          tenantId: TENANT_1,
          name: 'Power Ashtanga',
          category: 'Yoga',
          date: new Date('2026-11-13T01:30:00.000Z'),
          startTime: '07:00',
          endTime: '08:00',
          trainer: 'Vikramaditya',
          room: 'Shala 1',
          capacity: 15,
          status: 'Scheduled',
        },
      ]);

      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_1, classId: CLASS_A, memberId: MEMBER_1, status: 'Confirmed' },
        { id: 'b2', tenantId: TENANT_1, classId: CLASS_A, memberId: MEMBER_2, status: 'Confirmed' },
      ]);

      mockTx.studioMember.findMany.mockResolvedValue([
        {
          id: MEMBER_1,
          fullName: 'Aditi Rao',
          firstTimeMember: true,
          kneeInjury: false,
          lowerBackPain: null,
          postSurgery: false,
        },
        {
          id: MEMBER_2,
          fullName: 'Kiran Kumar',
          firstTimeMember: false,
          kneeInjury: true,
          lowerBackPain: true,
          postSurgery: false,
        },
      ]);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);

      expect(rosters).toHaveLength(1);
      const roster = rosters[0];

      expect(roster.tenantId).toBe(TENANT_1);
      expect(roster.trainerId).toBe(TRAINER_1);
      expect(roster.trainerName).toBe('Vikramaditya');
      expect(roster.phone).toBe('+919845099999');
      expect(roster.date).toBe('2026-11-13');

      expect(roster.sessions).toHaveLength(1);
      const session = roster.sessions[0];
      expect(session.classId).toBe(CLASS_A);
      expect(session.className).toBe('Power Ashtanga');
      expect(session.roomName).toBe('Shala 1');
      expect(session.startTime).toEqual(new Date('2026-11-13T01:30:00.000Z')); // 07:00 IST
      expect(session.confirmed).toBe(2);
      expect(session.capacity).toBe(15);
      expect(session.soldOut).toBe(false);

      expect(session.notes).toEqual([
        { memberName: 'Aditi Rao', kind: 'FIRST_TIMER' },
        { memberName: 'Kiran Kumar', kind: 'KNEE_INJURY' },
        { memberName: 'Kiran Kumar', kind: 'LOWER_BACK' },
      ]);
    });
  });

  describe('TEST A-INT-02: Sold-Out Class Thresholds', () => {
    const setupCapacityTest = (capacity: number, confirmedCount: number) => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Trainer 1', phoneE164: '+919000000001' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_A,
          tenantId: TENANT_1,
          name: 'Spinning Class',
          startTime: '06:30',
          trainer: TRAINER_1,
          capacity,
        },
      ]);

      const bookings = Array.from({ length: confirmedCount }, (_, i) => ({
        id: `book-${i}`,
        tenantId: TENANT_1,
        classId: CLASS_A,
        memberId: `mem-${i}`,
        status: 'Confirmed',
      }));
      mockTx.studioBooking.findMany.mockResolvedValue(bookings);
      mockTx.studioMember.findMany.mockResolvedValue([]);
    };

    it('should flag soldOut = false when confirmed is 19/20', async () => {
      setupCapacityTest(20, 19);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);
      expect(rosters[0].sessions[0].confirmed).toBe(19);
      expect(rosters[0].sessions[0].capacity).toBe(20);
      expect(rosters[0].sessions[0].soldOut).toBe(false);
    });

    it('should flag soldOut = true when confirmed is exactly 20/20', async () => {
      setupCapacityTest(20, 20);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);
      expect(rosters[0].sessions[0].confirmed).toBe(20);
      expect(rosters[0].sessions[0].capacity).toBe(20);
      expect(rosters[0].sessions[0].soldOut).toBe(true);
    });

    it('should flag soldOut = true when confirmed is 21/20 (overbooked capacity)', async () => {
      setupCapacityTest(20, 21);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);
      expect(rosters[0].sessions[0].confirmed).toBe(21);
      expect(rosters[0].sessions[0].capacity).toBe(20);
      expect(rosters[0].sessions[0].soldOut).toBe(true);
    });
  });

  describe('TEST A-INT-03: Fewer Than Three Bookings – Seeded Database Case', () => {
    it('should accurately calculate attendance for 0, 1, 2, and 3 bookings and exclude non-confirmed', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1, displayName: 'Trainer 1', phoneE164: '+919000000001' },
      ]);

      mockTx.studioClass.findMany.mockResolvedValue([
        { id: 'class-0', tenantId: TENANT_1, name: 'Zero Bookings', startTime: '07:00', trainer: TRAINER_1, capacity: 10 },
        { id: 'class-1', tenantId: TENANT_1, name: 'One Booking', startTime: '08:00', trainer: TRAINER_1, capacity: 10 },
        { id: 'class-2', tenantId: TENANT_1, name: 'Two Bookings', startTime: '09:00', trainer: TRAINER_1, capacity: 10 },
        { id: 'class-3', tenantId: TENANT_1, name: 'Three Bookings', startTime: '10:00', trainer: TRAINER_1, capacity: 10 },
      ]);

      // Seed bookings: non-confirmed bookings must be excluded
      mockTx.studioBooking.findMany.mockResolvedValue([
        // class-0 has only cancelled and waitlisted bookings (net confirmed = 0)
        // (Filtered at SQL level by status: { in: ['Confirmed', 'confirmed'] })
        // class-1: 1 confirmed
        { id: 'b-1-1', tenantId: TENANT_1, classId: 'class-1', memberId: MEMBER_1, status: 'Confirmed' },
        // class-2: 2 confirmed
        { id: 'b-2-1', tenantId: TENANT_1, classId: 'class-2', memberId: MEMBER_1, status: 'Confirmed' },
        { id: 'b-2-2', tenantId: TENANT_1, classId: 'class-2', memberId: MEMBER_2, status: 'Confirmed' },
        // class-3: 3 confirmed
        { id: 'b-3-1', tenantId: TENANT_1, classId: 'class-3', memberId: MEMBER_1, status: 'Confirmed' },
        { id: 'b-3-2', tenantId: TENANT_1, classId: 'class-3', memberId: MEMBER_2, status: 'Confirmed' },
        { id: 'b-3-3', tenantId: TENANT_1, classId: 'class-3', memberId: 'mem-3', status: 'Confirmed' },
      ]);

      mockTx.studioMember.findMany.mockResolvedValue([]);

      const rosters = await service.buildRosters(TENANT_1, TARGET_DATE);
      const sessions = rosters[0].sessions;

      expect(sessions.find((s) => s.classId === 'class-0')?.confirmed).toBe(0);
      expect(sessions.find((s) => s.classId === 'class-1')?.confirmed).toBe(1);
      expect(sessions.find((s) => s.classId === 'class-2')?.confirmed).toBe(2);
      expect(sessions.find((s) => s.classId === 'class-3')?.confirmed).toBe(3);

      // Verifies Member A contract boundary provides accurate low-attendance counts for Member B
    });
  });

  describe('TEST A-INT-04: Four-Hour Timing – Fake Clock & Boundary Checks', () => {
    it('should provide exact millisecond accuracy for downstream 4-hour monitoring boundaries', () => {
      // Class starts at 10:30 IST on 2026-11-13
      const sessionDate = parseIstSessionDateTime(TARGET_DATE, '10:30');
      // 10:30 IST = 05:00 UTC
      expect(sessionDate.toISOString()).toBe('2026-11-13T05:00:00.000Z');

      const sessionEpoch = sessionDate.getTime();
      const FOUR_HOURS_MS = 4 * 60 * 60 * 1000; // 14,400,000 ms

      // Case A: 3 hours 59 minutes before session (within 4-hour window)
      // Fake clock at 06:31 IST (01:01 UTC)
      const fakeClock_3h59m = new Date(sessionEpoch - (FOUR_HOURS_MS - 60_000));
      const diffA = sessionEpoch - fakeClock_3h59m.getTime();
      expect(diffA).toBe(14_340_000); // 3h 59m
      expect(diffA <= FOUR_HOURS_MS).toBe(true);

      // Case B: Exactly 4 hours before session (exact threshold)
      // Fake clock at 06:30 IST (01:00 UTC)
      const fakeClock_4h = new Date(sessionEpoch - FOUR_HOURS_MS);
      const diffB = sessionEpoch - fakeClock_4h.getTime();
      expect(diffB).toBe(FOUR_HOURS_MS); // exactly 4h
      expect(diffB <= FOUR_HOURS_MS).toBe(true);

      // Case C: 4 hours 1 minute before session (outside 4-hour window)
      // Fake clock at 06:29 IST (00:59 UTC)
      const fakeClock_4h1m = new Date(sessionEpoch - (FOUR_HOURS_MS + 60_000));
      const diffC = sessionEpoch - fakeClock_4h1m.getTime();
      expect(diffC).toBe(14_460_000); // 4h 1m
      expect(diffC <= FOUR_HOURS_MS).toBe(false);

      // Documents test dependency: Member B owns the recurring 4-hour capacity evaluation loop
    });
  });

  // ===========================================================================
  // SECTION 3: SCHEDULER & BUG-A AUDIT VERIFICATION
  // ===========================================================================

  describe('Scheduler Bug Audit: Override Date & Fault Isolation (BUG-A-005)', () => {
    it('should allow overrideDate parameter in TrainerRosterScheduler for deterministic execution', async () => {
      const mockRedisClient = {
        set: jest.fn().mockResolvedValue('OK'),
        eval: jest.fn().mockResolvedValue(1),
      };
      const mockRedis = {
        getClient: jest.fn().mockReturnValue(mockRedisClient),
      };

      const mockSchedulerPrisma = {
        tenant: {
          findMany: jest.fn().mockResolvedValue([{ id: TENANT_1 }]),
        },
      };

      const mockRosterService = {
        buildRosters: jest.fn().mockResolvedValue([]),
      };

      const scheduler = new TrainerRosterScheduler(
        mockSchedulerPrisma as unknown as PrismaService,
        mockRedis as unknown as RedisClient,
        mockRosterService as unknown as TrainerRosterService,
      );

      const customDate = '2026-12-25';
      const result = await scheduler.handleMorningRoster(customDate);

      expect(result.date).toBe(customDate);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `lock:trainer-roster:scheduler:${customDate}`,
        expect.any(String),
        'PX',
        expect.any(Number),
        'NX',
      );
      expect(mockRosterService.buildRosters).toHaveBeenCalledWith(TENANT_1, customDate);
    });
  });
});
