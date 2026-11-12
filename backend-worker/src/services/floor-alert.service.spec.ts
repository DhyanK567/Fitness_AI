import { FloorAlertService } from './floor-alert.service';
import { PrismaService } from '../common/prisma.service';
import { FLOOR_ALERT_TYPES, FloorAlertContext } from '../contracts/floor-alert.types';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const CLASS_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface FakeStudioClass {
  id: string;
  tenantId: string;
  name: string;
  date: Date;
  startTime: string;
  room: string | null;
  trainer: string;
  capacity: number;
  status: string;
}

interface FakeBooking {
  tenantId: string;
  classId: string;
  status: string;
}

function makeFakePrisma(
  classes: FakeStudioClass[],
  bookings: FakeBooking[],
): {
  prisma: PrismaService;
  withTenantCalls: string[];
  classQueries: Array<{ id?: string; tenantId?: string }>;
  bookingQueries: Array<{ classId?: string; tenantId?: string }>;
} {
  const withTenantCalls: string[] = [];
  const classQueries: Array<{ id?: string; tenantId?: string }> = [];
  const bookingQueries: Array<{ classId?: string; tenantId?: string }> = [];

  const prisma = {
    withTenant: jest.fn(async (tenantId: string, work: (tx: any) => Promise<any>) => {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          tenantId,
        )
      ) {
        throw new Error(
          'A canonical tenant UUID is required for tenant-scoped database access.',
        );
      }
      withTenantCalls.push(tenantId);

      const tx = {
        studioClass: {
          findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
            classQueries.push(where);
            return (
              classes.find(
                (c) => c.id === where.id && c.tenantId === where.tenantId,
              ) ?? null
            );
          }),
        },
        studioBooking: {
          findMany: jest.fn(
            async ({ where }: { where: { classId: string; tenantId: string } }) => {
              bookingQueries.push(where);
              return bookings
                .filter(
                  (b) =>
                    b.classId === where.classId &&
                    b.tenantId === where.tenantId,
                )
                .map((b) => ({ status: b.status }));
            },
          ),
        },
      };

      return work(tx);
    }),
  } as unknown as PrismaService;

  return { prisma, withTenantCalls, classQueries, bookingQueries };
}

function makeBookings(
  tenantId: string,
  classId: string,
  counts: { confirmed?: number; waitlisted?: number; cancelled?: number },
): FakeBooking[] {
  const rows: FakeBooking[] = [];
  for (let i = 0; i < (counts.confirmed ?? 0); i += 1) {
    rows.push({ tenantId, classId, status: 'Confirmed' });
  }
  for (let i = 0; i < (counts.waitlisted ?? 0); i += 1) {
    rows.push({ tenantId, classId, status: 'Waitlisted' });
  }
  for (let i = 0; i < (counts.cancelled ?? 0); i += 1) {
    rows.push({ tenantId, classId, status: 'Cancelled' });
  }
  return rows;
}

describe('FloorAlertService', () => {
  // 2026-11-12T10:00:00+05:30 (10:00 AM IST)
  const now = new Date('2026-11-12T10:00:00+05:30');
  const todayIst = new Date('2026-11-12T00:00:00+05:30');

  const baseClass: FakeStudioClass = {
    id: CLASS_1,
    tenantId: TENANT_A,
    name: 'HIIT Conditioning',
    date: todayIst,
    startTime: '12:30', // 2h 30m after `now` (inside 4h window)
    room: 'Main Floor',
    trainer: 'Coach Marcus',
    capacity: 10,
    status: 'Scheduled',
  };

  it('1. returns no alerts when occupancy is below 90% and bookings >= 3', async () => {
    const bookings = makeBookings(TENANT_A, CLASS_1, {
      confirmed: 8,
      waitlisted: 2,
      cancelled: 3,
    });
    const { prisma } = makeFakePrisma([baseClass], bookings);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, { now });

    expect(result.evaluated).toBe(true);
    expect(result.triggeredAlerts).toEqual([]);
    expect(result.snapshot).toMatchObject({
      confirmedCount: 8,
      waitlistedCount: 2,
      capacity: 10,
      occupancyPct: 80,
    });
  });

  it('2. triggers SURGE_90 when confirmed occupancy is exactly 90% (keeping waitlisted separate)', async () => {
    const bookings = makeBookings(TENANT_A, CLASS_1, {
      confirmed: 9,
      waitlisted: 3,
    });
    const { prisma } = makeFakePrisma([baseClass], bookings);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, { now });

    expect(result.evaluated).toBe(true);
    expect(result.snapshot?.confirmedCount).toBe(9);
    expect(result.snapshot?.waitlistedCount).toBe(3);
    expect(result.snapshot?.occupancyPct).toBe(90);
    expect(result.triggeredAlerts).toHaveLength(1);
    expect(result.triggeredAlerts[0]).toMatchObject({
      tenantId: TENANT_A,
      classId: CLASS_1,
      type: FLOOR_ALERT_TYPES.SURGE_90,
      booked: 9,
      waitlisted: 3,
      capacity: 10,
      severity: 'warning',
      dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`,
    });
  });

  it('3. triggers FULL_100 when confirmed occupancy reaches 100%', async () => {
    const bookings = makeBookings(TENANT_A, CLASS_1, {
      confirmed: 10,
      waitlisted: 4,
    });
    const { prisma } = makeFakePrisma([baseClass], bookings);
    const service = new FloorAlertService(prisma);

    const customBuilder = jest.fn(
      (ctx: FloorAlertContext) =>
        `CUSTOM ${ctx.type}: ${ctx.className} (${ctx.booked}/${ctx.capacity})`,
    );

    const result = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      messageBuilder: customBuilder,
    });

    expect(result.evaluated).toBe(true);
    expect(result.snapshot?.occupancyPct).toBe(100);
    expect(result.triggeredAlerts).toHaveLength(1);
    expect(result.triggeredAlerts[0]).toMatchObject({
      type: FLOOR_ALERT_TYPES.FULL_100,
      booked: 10,
      waitlisted: 4,
      capacity: 10,
      severity: 'critical',
      message: 'CUSTOM FULL_100: HIIT Conditioning (10/10)',
      dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:FULL_100`,
    });
    expect(customBuilder).toHaveBeenCalledTimes(1);
  });

  it('4. triggers LOW_ATTENDANCE_4H when fewer than 3 confirmed bookings exist within 4 hours', async () => {
    const bookings = makeBookings(TENANT_A, CLASS_1, {
      confirmed: 2,
      waitlisted: 0,
      cancelled: 2,
    });
    const { prisma } = makeFakePrisma([baseClass], bookings);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: true,
    });

    expect(result.evaluated).toBe(true);
    expect(result.snapshot?.confirmedCount).toBe(2);
    expect(result.snapshot?.minutesUntilStart).toBe(150);
    expect(result.triggeredAlerts).toHaveLength(1);
    expect(result.triggeredAlerts[0]).toMatchObject({
      type: FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H,
      booked: 2,
      capacity: 10,
      severity: 'info',
      dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:LOW_ATTENDANCE_4H`,
    });
  });

  it('5. skips evaluation for a class outside the 4-hour window when requested and suppresses LOW_ATTENDANCE_4H otherwise', async () => {
    const laterClass: FakeStudioClass = {
      ...baseClass,
      startTime: '14:30', // 4h 30m after 10:00 IST -> outside 4h window
    };
    const bookings = makeBookings(TENANT_A, CLASS_1, { confirmed: 1 });
    const { prisma } = makeFakePrisma([laterClass], bookings);
    const service = new FloorAlertService(prisma);

    const restricted = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: true,
    });
    expect(restricted).toEqual({
      evaluated: false,
      skippedReason: 'OUTSIDE_WINDOW',
      triggeredAlerts: [],
      deduplicatedTypes: [],
    });

    // When requireFourHourWindow is false (e.g. booking update check), low occupancy outside 4h must not fire
    const unrestricted = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: false,
    });
    expect(unrestricted.evaluated).toBe(true);
    expect(unrestricted.triggeredAlerts).toEqual([]);
  });

  it('6. ignores cancelled classes safely', async () => {
    const cancelledClass: FakeStudioClass = {
      ...baseClass,
      status: 'Cancelled',
    };
    const bookings = makeBookings(TENANT_A, CLASS_1, { confirmed: 10 });
    const { prisma, bookingQueries } = makeFakePrisma([cancelledClass], bookings);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, { now });

    expect(result).toEqual({
      evaluated: false,
      skippedReason: 'CLASS_CANCELLED',
      triggeredAlerts: [],
      deduplicatedTypes: [],
    });
    expect(bookingQueries).toHaveLength(0);
  });

  it('7. handles invalid capacity safely (0 or negative)', async () => {
    const zeroCapClass: FakeStudioClass = {
      ...baseClass,
      capacity: 0,
    };
    const { prisma, bookingQueries } = makeFakePrisma([zeroCapClass], []);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, { now });

    expect(result).toEqual({
      evaluated: false,
      skippedReason: 'INVALID_CAPACITY',
      triggeredAlerts: [],
      deduplicatedTypes: [],
    });
    expect(bookingQueries).toHaveLength(0);
  });

  it('8. enforces strict tenant isolation and rejects invalid tenant IDs', async () => {
    const tenantAClass: FakeStudioClass = { ...baseClass, tenantId: TENANT_A };
    const bookings = [
      ...makeBookings(TENANT_A, CLASS_1, { confirmed: 10 }),
      ...makeBookings(TENANT_B, CLASS_1, { confirmed: 2 }),
    ];
    const { prisma, withTenantCalls, classQueries, bookingQueries } =
      makeFakePrisma([tenantAClass], bookings);
    const service = new FloorAlertService(prisma);

    // Querying Tenant B for Tenant A's class must not return Tenant A's class or bookings
    const tenantBResult = await service.evaluateClass(TENANT_B, CLASS_1, { now });
    expect(tenantBResult).toEqual({
      evaluated: false,
      skippedReason: 'CLASS_NOT_FOUND',
      triggeredAlerts: [],
      deduplicatedTypes: [],
    });
    expect(withTenantCalls).toEqual([TENANT_B]);
    expect(classQueries[0]).toEqual({ id: CLASS_1, tenantId: TENANT_B });
    expect(bookingQueries).toHaveLength(0);

    // Invalid tenantId is rejected before any DB call
    await expect(
      service.evaluateClass('not-a-uuid', CLASS_1, { now }),
    ).rejects.toThrow(/canonical tenant UUID/i);
    expect(withTenantCalls).toHaveLength(1);
  });

  it('9. evaluates and triggers LOW_ATTENDANCE_4H for class starting in 3 hours 59 minutes', async () => {
    const cls3h59m: FakeStudioClass = {
      ...baseClass,
      startTime: '13:59', // 239m after 10:00 IST
    };
    const bookings = makeBookings(TENANT_A, CLASS_1, { confirmed: 2 });
    const { prisma } = makeFakePrisma([cls3h59m], bookings);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: true,
    });

    expect(result.evaluated).toBe(true);
    expect(result.snapshot?.minutesUntilStart).toBe(239);
    expect(result.triggeredAlerts).toHaveLength(1);
    expect(result.triggeredAlerts[0].type).toBe(
      FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H,
    );
  });

  it('10. evaluates and triggers LOW_ATTENDANCE_4H for class starting exactly 4 hours from now', async () => {
    const cls4h00m: FakeStudioClass = {
      ...baseClass,
      startTime: '14:00', // 240m after 10:00 IST
    };
    const bookings = makeBookings(TENANT_A, CLASS_1, { confirmed: 2 });
    const { prisma } = makeFakePrisma([cls4h00m], bookings);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: true,
    });

    expect(result.evaluated).toBe(true);
    expect(result.snapshot?.minutesUntilStart).toBe(240);
    expect(result.triggeredAlerts).toHaveLength(1);
    expect(result.triggeredAlerts[0].type).toBe(
      FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H,
    );
  });

  it('11. treats class starting in 4 hours 1 minute as outside the 4-hour window', async () => {
    const cls4h01m: FakeStudioClass = {
      ...baseClass,
      startTime: '14:01', // 241m after 10:00 IST
    };
    const bookings = makeBookings(TENANT_A, CLASS_1, { confirmed: 2 });
    const { prisma } = makeFakePrisma([cls4h01m], bookings);
    const service = new FloorAlertService(prisma);

    const restricted = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: true,
    });
    expect(restricted).toEqual({
      evaluated: false,
      skippedReason: 'OUTSIDE_WINDOW',
      triggeredAlerts: [],
      deduplicatedTypes: [],
    });

    const unrestricted = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: false,
    });
    expect(unrestricted.evaluated).toBe(true);
    expect(unrestricted.triggeredAlerts).toEqual([]);
  });

  it('12. treats class that started 1 minute ago as outside the 4-hour window', async () => {
    const startedClass: FakeStudioClass = {
      ...baseClass,
      startTime: '09:59', // -1m from 10:00 IST
    };
    const bookings = makeBookings(TENANT_A, CLASS_1, { confirmed: 1 });
    const { prisma } = makeFakePrisma([startedClass], bookings);
    const service = new FloorAlertService(prisma);

    const restricted = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: true,
    });
    expect(restricted).toEqual({
      evaluated: false,
      skippedReason: 'OUTSIDE_WINDOW',
      triggeredAlerts: [],
      deduplicatedTypes: [],
    });

    const unrestricted = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: false,
    });
    expect(unrestricted.evaluated).toBe(true);
    expect(unrestricted.triggeredAlerts).toEqual([]);
  });

  it('13. produces no low-attendance alert when exactly 3 confirmed bookings exist within 4 hours', async () => {
    const bookings = makeBookings(TENANT_A, CLASS_1, {
      confirmed: 3,
      waitlisted: 1,
    });
    const { prisma } = makeFakePrisma([baseClass], bookings);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: true,
    });

    expect(result.evaluated).toBe(true);
    expect(result.snapshot?.confirmedCount).toBe(3);
    expect(result.triggeredAlerts).toEqual([]);
  });

  it('14. triggers LOW_ATTENDANCE_4H when zero confirmed bookings exist within 4 hours', async () => {
    const bookings = makeBookings(TENANT_A, CLASS_1, {
      confirmed: 0,
      cancelled: 2,
    });
    const { prisma } = makeFakePrisma([baseClass], bookings);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, {
      now,
      requireFourHourWindow: true,
    });

    expect(result.evaluated).toBe(true);
    expect(result.snapshot?.confirmedCount).toBe(0);
    expect(result.snapshot?.occupancyPct).toBe(0);
    expect(result.triggeredAlerts).toHaveLength(1);
    expect(result.triggeredAlerts[0]).toMatchObject({
      type: FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H,
      booked: 0,
      capacity: 10,
    });
  });

  it('15. handles negative capacity safely without querying bookings', async () => {
    const negativeCapClass: FakeStudioClass = {
      ...baseClass,
      capacity: -5,
    };
    const { prisma, bookingQueries } = makeFakePrisma([negativeCapClass], []);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, { now });

    expect(result).toEqual({
      evaluated: false,
      skippedReason: 'INVALID_CAPACITY',
      triggeredAlerts: [],
      deduplicatedTypes: [],
    });
    expect(bookingQueries).toHaveLength(0);
  });

  it('16. returns CLASS_NOT_FOUND without calling Prisma for invalid classId values', async () => {
    const { prisma, withTenantCalls } = makeFakePrisma([baseClass], []);
    const service = new FloorAlertService(prisma);

    for (const badId of ['', '   ', 'not-a-uuid', 'cls-101']) {
      const result = await service.evaluateClass(TENANT_A, badId, { now });
      expect(result).toEqual({
        evaluated: false,
        skippedReason: 'CLASS_NOT_FOUND',
        triggeredAlerts: [],
        deduplicatedTypes: [],
      });
    }

    expect(withTenantCalls).toHaveLength(0);
  });

  it('17. returns an explicit invalidScheduleReason for invalid startTime values instead of falling back to midnight', async () => {
    for (const badTime of ['25:99', '24:00', '12:60', 'invalid', '']) {
      const badTimeClass: FakeStudioClass = {
        ...baseClass,
        startTime: badTime,
      };
      const { prisma, bookingQueries } = makeFakePrisma(
        [badTimeClass],
        makeBookings(TENANT_A, CLASS_1, { confirmed: 10 }),
      );
      const service = new FloorAlertService(prisma);

      const result = await service.evaluateClass(TENANT_A, CLASS_1, { now });

      expect(result).toEqual({
        evaluated: false,
        invalidScheduleReason: 'INVALID_START_TIME',
        triggeredAlerts: [],
        deduplicatedTypes: [],
      });
      expect(bookingQueries).toHaveLength(0);
    }
  });

  it('18. resolves class start time accurately when StudioClass.date is stored at UTC midnight', async () => {
    const utcMidnightClass: FakeStudioClass = {
      ...baseClass,
      date: new Date('2026-11-12T00:00:00.000Z'),
      startTime: '12:30', // 12:30 IST = 2h 30m after 10:00 IST
    };
    const bookings = makeBookings(TENANT_A, CLASS_1, { confirmed: 9 });
    const { prisma } = makeFakePrisma([utcMidnightClass], bookings);
    const service = new FloorAlertService(prisma);

    const result = await service.evaluateClass(TENANT_A, CLASS_1, { now });

    expect(result.evaluated).toBe(true);
    expect(result.snapshot?.startTime.toISOString()).toBe(
      new Date('2026-11-12T12:30:00+05:30').toISOString(),
    );
    expect(result.snapshot?.minutesUntilStart).toBe(150);
    expect(result.triggeredAlerts).toHaveLength(1);
    expect(result.triggeredAlerts[0].type).toBe(FLOOR_ALERT_TYPES.SURGE_90);
  });
});
