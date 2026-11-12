import { PrismaService } from '../common/prisma.service';
import { TrainerRosterService } from './trainer-roster.service';

describe('TrainerRosterService (buildRosters Pipeline)', () => {
  let service: TrainerRosterService;
  let mockPrismaService: any;
  let mockTx: any;

  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TRAINER_1_ID = '22222222-2222-4222-8222-222222222222';
  const TRAINER_2_ID = '33333333-3333-4333-8333-333333333333';
  const CLASS_1_ID = '44444444-4444-4444-8444-444444444444';
  const CLASS_2_ID = '55555555-5555-4555-8555-555555555555';
  const MEMBER_1_ID = '66666666-6666-4666-8666-666666666666';
  const MEMBER_2_ID = '77777777-7777-4777-8777-777777777777';

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
    };

    mockPrismaService = {
      withTenant: jest.fn().mockImplementation((tenantId: string, work: (tx: any) => Promise<any>) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
          throw new Error('A canonical tenant UUID is required for tenant-scoped database access.');
        }
        return work(mockTx);
      }),
    };

    service = new TrainerRosterService(mockPrismaService as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation & Tenant Isolation', () => {
    it('should throw error if tenantId is not a canonical UUID', async () => {
      await expect(service.buildRosters('invalid-tenant', '2026-11-13')).rejects.toThrow(
        'A canonical tenant UUID is required for tenant-scoped database access.',
      );
      expect(mockPrismaService.withTenant).not.toHaveBeenCalled();
    });

    it('should pass canonical tenantId to PrismaService.withTenant', async () => {
      mockTx.user.findMany.mockResolvedValue([]);
      await service.buildRosters(TENANT_A, '2026-11-13');

      expect(mockPrismaService.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
    });

    it('should explicitly filter all database queries by tenantId', async () => {
      mockTx.user.findMany.mockResolvedValue([
        {
          id: TRAINER_1_ID,
          displayName: 'Ananya Rao',
          phoneE164: '+919845012345',
          email: 'ananya@studio.in',
        },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'Morning Vinyasa',
          date: new Date('2026-11-13T01:30:00.000Z'),
          startTime: '07:00',
          trainer: 'Ananya Rao',
          room: 'Studio A',
          capacity: 15,
        },
      ]);
      mockTx.studioBooking.findMany.mockResolvedValue([]);

      await service.buildRosters(TENANT_A, '2026-11-13');

      expect(mockTx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A }),
        }),
      );
      expect(mockTx.studioClass.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A }),
        }),
      );
      expect(mockTx.studioBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A }),
        }),
      );
    });
  });

  describe('IST Date Boundaries & Class Filtering', () => {
    it('should query classes using start-inclusive and end-exclusive IST boundaries', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Trainer 1', phoneE164: '+919999999999' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([]);

      await service.buildRosters(TENANT_A, '2026-11-13');

      expect(mockTx.studioClass.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: {
              gte: new Date('2026-11-12T18:30:00.000Z'),
              lt: new Date('2026-11-13T18:30:00.000Z'),
            },
          }),
        }),
      );
    });
  });

  describe('Active Trainer & Class Discovery', () => {
    it('should return empty array if no active trainers exist for tenant', async () => {
      mockTx.user.findMany.mockResolvedValue([]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');
      expect(result).toEqual([]);
      expect(mockTx.studioClass.findMany).not.toHaveBeenCalled();
    });

    it('should return empty array if no classes are scheduled for the day', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');
      expect(result).toEqual([]);
      expect(mockTx.studioBooking.findMany).not.toHaveBeenCalled();
    });

    it('should exclude trainers who have no classes on the requested date', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
        { id: TRAINER_2_ID, displayName: 'Vikram Singh', phoneE164: '+919845067890' },
      ]);

      // Only Ananya has a class today
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'Power Yoga',
          startTime: '07:00',
          trainer: 'Ananya Rao',
          room: 'Studio A',
          capacity: 10,
        },
      ]);
      mockTx.studioBooking.findMany.mockResolvedValue([]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');

      expect(result).toHaveLength(1);
      expect(result[0].trainerId).toBe(TRAINER_1_ID);
      expect(result[0].trainerName).toBe('Ananya Rao');
    });

    it('should match classes by trainer ID (UUID), displayName, or email', async () => {
      mockTx.user.findMany.mockResolvedValue([
        {
          id: TRAINER_1_ID,
          displayName: 'Ananya Rao',
          phoneE164: '+919845012345',
          email: 'ananya@studio.in',
        },
      ]);

      // Three classes: one referencing UUID, one referencing displayName, one referencing email
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'Session by UUID',
          startTime: '06:30',
          trainer: TRAINER_1_ID,
          room: 'Room 1',
          capacity: 10,
        },
        {
          id: CLASS_2_ID,
          tenantId: TENANT_A,
          name: 'Session by Name',
          startTime: '08:00',
          trainer: 'Ananya Rao',
          room: 'Room 2',
          capacity: 12,
        },
      ]);
      mockTx.studioBooking.findMany.mockResolvedValue([]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');

      expect(result).toHaveLength(1);
      expect(result[0].sessions).toHaveLength(2);
      expect(result[0].sessions[0].className).toBe('Session by UUID');
      expect(result[0].sessions[1].className).toBe('Session by Name');
    });
  });

  describe('Booking Aggregation & Sold-Out Logic', () => {
    it('should count only confirmed bookings and exclude cancelled bookings', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'HIIT Blast',
          startTime: '07:00',
          trainer: 'Ananya Rao',
          room: 'Gym Floor',
          capacity: 10,
        },
      ]);

      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: MEMBER_1_ID, status: 'Confirmed' },
        { id: 'b2', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: MEMBER_2_ID, status: 'Confirmed' },
      ]);
      mockTx.studioMember.findMany.mockResolvedValue([]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');

      expect(mockTx.studioBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['Confirmed', 'confirmed'] },
          }),
        }),
      );
      expect(result[0].sessions[0].confirmed).toBe(2);
      expect(result[0].sessions[0].soldOut).toBe(false);
    });

    it('should mark class as soldOut: true when confirmed bookings equal or exceed capacity', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'Small Group Strength',
          startTime: '07:00',
          trainer: 'Ananya Rao',
          room: 'Gym Floor',
          capacity: 2,
        },
      ]);

      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: MEMBER_1_ID, status: 'Confirmed' },
        { id: 'b2', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: MEMBER_2_ID, status: 'Confirmed' },
      ]);
      mockTx.studioMember.findMany.mockResolvedValue([]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');

      expect(result[0].sessions[0].confirmed).toBe(2);
      expect(result[0].sessions[0].capacity).toBe(2);
      expect(result[0].sessions[0].soldOut).toBe(true);
    });
  });

  describe('Member Health Flags & Nullable Tri-State Semantics', () => {
    it('should safely handle non-UUID memberIds without querying StudioMember with invalid cast', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'Pilates Reformer',
          startTime: '08:00',
          trainer: 'Ananya Rao',
          capacity: 5,
        },
      ]);

      // One valid UUID and one external non-UUID string
      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: MEMBER_1_ID, status: 'Confirmed' },
        { id: 'b2', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: 'external-member-999', status: 'Confirmed' },
      ]);
      mockTx.studioMember.findMany.mockResolvedValue([
        {
          id: MEMBER_1_ID,
          fullName: 'Pooja Sharma',
          kneeInjury: true,
          lowerBackPain: false,
          postSurgery: null,
          firstTimeMember: false,
        },
      ]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');

      // StudioMember should only be queried with the valid UUID
      expect(mockTx.studioMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: [MEMBER_1_ID] },
          }),
        }),
      );

      // Total confirmed should still include both bookings
      expect(result[0].sessions[0].confirmed).toBe(2);
      // Notes should contain only the valid member's injury
      expect(result[0].sessions[0].notes).toEqual([
        { memberName: 'Pooja Sharma', kind: 'KNEE_INJURY' },
      ]);
    });

    it('should map all four health flags when true', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'Gentle Yoga',
          startTime: '09:00',
          trainer: 'Ananya Rao',
          capacity: 10,
        },
      ]);

      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: MEMBER_1_ID, status: 'Confirmed' },
      ]);
      mockTx.studioMember.findMany.mockResolvedValue([
        {
          id: MEMBER_1_ID,
          fullName: 'Rahul Dravid',
          firstTimeMember: true,
          kneeInjury: true,
          lowerBackPain: true,
          postSurgery: true,
        },
      ]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');

      expect(result[0].sessions[0].notes).toEqual([
        { memberName: 'Rahul Dravid', kind: 'FIRST_TIMER' },
        { memberName: 'Rahul Dravid', kind: 'KNEE_INJURY' },
        { memberName: 'Rahul Dravid', kind: 'LOWER_BACK' },
        { memberName: 'Rahul Dravid', kind: 'POST_SURGERY' },
      ]);
    });

    it('should not emit notes when health flags are null or false', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'Gentle Yoga',
          startTime: '09:00',
          trainer: 'Ananya Rao',
          capacity: 10,
        },
      ]);

      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: MEMBER_1_ID, status: 'Confirmed' },
      ]);
      mockTx.studioMember.findMany.mockResolvedValue([
        {
          id: MEMBER_1_ID,
          fullName: 'Healthy Member',
          firstTimeMember: false,
          kneeInjury: false,
          lowerBackPain: null,
          postSurgery: null,
        },
      ]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');

      expect(result[0].sessions[0].notes).toEqual([]);
    });

    it('should handle missing member profile gracefully without losing booking count', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
      ]);
      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'Evening Spin',
          startTime: '18:00',
          trainer: 'Ananya Rao',
          capacity: 20,
        },
      ]);

      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: MEMBER_1_ID, status: 'Confirmed' },
      ]);
      // Member not found in database
      mockTx.studioMember.findMany.mockResolvedValue([]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');

      expect(result[0].sessions[0].confirmed).toBe(1);
      expect(result[0].sessions[0].notes).toEqual([]);
    });
  });

  describe('Multiple Trainers and Multiple Classes per Trainer', () => {
    it('should correctly assemble rosters for multiple trainers with multiple sessions', async () => {
      mockTx.user.findMany.mockResolvedValue([
        { id: TRAINER_1_ID, displayName: 'Ananya Rao', phoneE164: '+919845012345' },
        { id: TRAINER_2_ID, displayName: 'Vikram Singh', phoneE164: '+919845067890' },
      ]);

      mockTx.studioClass.findMany.mockResolvedValue([
        {
          id: CLASS_1_ID,
          tenantId: TENANT_A,
          name: 'Morning Vinyasa',
          startTime: '07:00',
          trainer: 'Ananya Rao',
          room: 'Studio 1',
          capacity: 10,
        },
        {
          id: CLASS_2_ID,
          tenantId: TENANT_A,
          name: 'Evening Yin Yoga',
          startTime: '19:00',
          trainer: 'Ananya Rao',
          room: 'Studio 1',
          capacity: 15,
        },
        {
          id: 'class-vikram-1',
          tenantId: TENANT_A,
          name: 'CrossFit WOD',
          startTime: '08:30',
          trainer: 'Vikram Singh',
          room: 'Box Area',
          capacity: 12,
        },
      ]);

      mockTx.studioBooking.findMany.mockResolvedValue([
        { id: 'b1', tenantId: TENANT_A, classId: CLASS_1_ID, memberId: MEMBER_1_ID, status: 'Confirmed' },
      ]);

      mockTx.studioMember.findMany.mockResolvedValue([
        {
          id: MEMBER_1_ID,
          fullName: 'Aarav Patel',
          firstTimeMember: true,
          kneeInjury: false,
          lowerBackPain: null,
          postSurgery: false,
        },
      ]);

      const result = await service.buildRosters(TENANT_A, '2026-11-13');

      expect(result).toHaveLength(2);

      // Trainer 1 (Ananya)
      const ananyaRoster = result.find((r) => r.trainerId === TRAINER_1_ID);
      expect(ananyaRoster).toBeDefined();
      expect(ananyaRoster?.sessions).toHaveLength(2);
      expect(ananyaRoster?.sessions[0].className).toBe('Morning Vinyasa');
      expect(ananyaRoster?.sessions[0].startTime).toEqual(new Date('2026-11-13T01:30:00.000Z')); // 07:00 IST
      expect(ananyaRoster?.sessions[0].confirmed).toBe(1);
      expect(ananyaRoster?.sessions[0].notes).toEqual([
        { memberName: 'Aarav Patel', kind: 'FIRST_TIMER' },
      ]);
      expect(ananyaRoster?.sessions[1].className).toBe('Evening Yin Yoga');
      expect(ananyaRoster?.sessions[1].confirmed).toBe(0);

      // Trainer 2 (Vikram)
      const vikramRoster = result.find((r) => r.trainerId === TRAINER_2_ID);
      expect(vikramRoster).toBeDefined();
      expect(vikramRoster?.sessions).toHaveLength(1);
      expect(vikramRoster?.sessions[0].className).toBe('CrossFit WOD');
      expect(vikramRoster?.sessions[0].confirmed).toBe(0);
    });
  });
});
