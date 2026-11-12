import { StudioCapacityScheduler } from './studio-capacity.scheduler';
import { PrismaService } from '../../common/prisma.service';
import { RedisClient } from '../../common/redis-client';
import { FloorAlertService } from '../../services/floor-alert.service';
import { FloorAlertDeliveryService } from '../../services/floor-alert-delivery.service';
import {
  FLOOR_ALERT_TYPES,
  FloorAlert,
  FloorAlertType,
} from '../../contracts/floor-alert.types';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const CLASS_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLASS_A2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLASS_B1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

interface FakeClassRow {
  id: string;
  tenantId: string;
  date: Date;
  startTime: string;
  status: string;
}

class FakeRedisNativeClient {
  private locks = new Map<string, string>();
  public evalCalls: Array<{ script: string; numKeys: number; key: string; token: string }> = [];

  constructor(initiallyHeldKey?: string) {
    if (initiallyHeldKey) {
      this.locks.set(initiallyHeldKey, 'other-worker-token');
    }
  }

  set = jest.fn(
    async (
      key: string,
      value: string,
      _px?: string,
      _ttl?: number,
      mode?: string,
    ): Promise<'OK' | null> => {
      if (mode === 'NX' && this.locks.has(key)) {
        return null;
      }
      this.locks.set(key, value);
      return 'OK';
    },
  );

  eval = jest.fn(
    async (script: string, numKeys: number, key: string, token: string): Promise<number> => {
      this.evalCalls.push({ script, numKeys, key, token });
      if (this.locks.get(key) === token) {
        this.locks.delete(key);
        return 1;
      }
      return 0;
    },
  );

  hasLock(key: string): boolean {
    return this.locks.has(key);
  }
}

function makeFakeRedis(initiallyHeldKey?: string): {
  redis: RedisClient;
  native: FakeRedisNativeClient;
} {
  const native = new FakeRedisNativeClient(initiallyHeldKey);
  const redis = {
    getClient: () => native,
  } as unknown as RedisClient;
  return { redis, native };
}

function makeFakePrisma(
  activeTenantIds: string[],
  classes: FakeClassRow[],
): {
  prisma: PrismaService;
  withTenantCalls: string[];
  classQueries: Array<{ tenantId: string; gte: Date; lte: Date }>;
} {
  const withTenantCalls: string[] = [];
  const classQueries: Array<{ tenantId: string; gte: Date; lte: Date }> = [];

  const prisma = {
    tenant: {
      findMany: jest.fn(async () => activeTenantIds.map((id) => ({ id }))),
    },
    withTenant: jest.fn(async (tenantId: string, work: (tx: any) => Promise<any>) => {
      withTenantCalls.push(tenantId);
      const tx = {
        studioClass: {
          findMany: jest.fn(async ({ where }: { where: any }) => {
            classQueries.push({
              tenantId: where.tenantId,
              gte: where.date.gte,
              lte: where.date.lte,
            });
            const excludedStatuses: string[] = where.status?.notIn ?? [];
            return classes.filter(
              (c) =>
                c.tenantId === where.tenantId &&
                !excludedStatuses.includes(c.status) &&
                c.date >= where.date.gte &&
                c.date <= where.date.lte,
            );
          }),
        },
      };
      return work(tx);
    }),
  } as unknown as PrismaService;

  return { prisma, withTenantCalls, classQueries };
}

function makeTestAlert(
  tenantId: string,
  classId: string,
  type: FloorAlertType,
  extra: Partial<FloorAlert> = {},
): FloorAlert {
  return {
    tenantId,
    classId,
    type,
    className: 'Morning Vinyasa Yoga',
    startTime: new Date('2026-11-12T12:00:00+05:30'),
    booked:
      type === FLOOR_ALERT_TYPES.FULL_100
        ? 20
        : type === FLOOR_ALERT_TYPES.SURGE_90
          ? 18
          : 2,
    capacity: 20,
    waitlisted: 0,
    occupancyPct:
      type === FLOOR_ALERT_TYPES.FULL_100
        ? 100
        : type === FLOOR_ALERT_TYPES.SURGE_90
          ? 90
          : 10,
    message: `Test floor alert message for ${type}`,
    dedupKey: `floor-alert:${tenantId}:${classId}:${type}`,
    severity: type === FLOOR_ALERT_TYPES.FULL_100 ? 'critical' : 'warning',
    ...extra,
  };
}

function makeFakeDeliveryService(): {
  deliveryService: FloorAlertDeliveryService;
  deliverAlert: jest.Mock;
} {
  const deliverAlert = jest.fn().mockResolvedValue({
    created: true,
    deduplicated: false,
    operationalAlertId: 'op-alert-1',
    outboxEventId: 'outbox-event-1',
    idempotencyKey: 'key-1',
  });
  const deliveryService = {
    deliverAlert,
  } as unknown as FloorAlertDeliveryService;
  return { deliveryService, deliverAlert };
}

describe('StudioCapacityScheduler', () => {
  // 10:00 AM IST on 2026-11-12
  const now = new Date('2026-11-12T10:00:00+05:30');
  const todayUtcMidnight = new Date('2026-11-12T00:00:00.000Z');

  it('1. executes a successful monitoring cycle for upcoming non-cancelled classes within 4 hours', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' }, // +2h (in)
      { id: CLASS_A2, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '14:00', status: 'Scheduled' }, // +4h exact (in)
      { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', tenantId: TENANT_A, date: todayUtcMidnight, startTime: '14:30', status: 'Scheduled' }, // +4h30m (out)
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', tenantId: TENANT_A, date: todayUtcMidnight, startTime: '11:00', status: 'Cancelled' }, // cancelled
    ];

    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis, native } = makeFakeRedis();
    const evaluateClass = jest.fn().mockResolvedValue({
      evaluated: true,
      triggeredAlerts: [{ type: FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H }],
      deduplicatedTypes: [],
    });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;

    const scheduler = new StudioCapacityScheduler(prisma, redis, floorAlertService);
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 1,
      classesEvaluated: 2,
      alertsTriggered: 2,
      failures: 0,
    });
    expect(evaluateClass).toHaveBeenCalledTimes(2);
    expect(evaluateClass).toHaveBeenNthCalledWith(1, TENANT_A, CLASS_A1, {
      now,
      requireFourHourWindow: true,
    });
    expect(evaluateClass).toHaveBeenNthCalledWith(2, TENANT_A, CLASS_A2, {
      now,
      requireFourHourWindow: true,
    });
    expect(native.hasLock('lock:scheduler:studio-capacity-monitor')).toBe(false);
  });

  it('2. handles zero active tenants gracefully and releases the lock', async () => {
    const { prisma, withTenantCalls } = makeFakePrisma([], []);
    const { redis, native } = makeFakeRedis();
    const evaluateClass = jest.fn();
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;

    const scheduler = new StudioCapacityScheduler(prisma, redis, floorAlertService);
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 0,
      classesEvaluated: 0,
      alertsTriggered: 0,
      failures: 0,
    });
    expect(withTenantCalls).toHaveLength(0);
    expect(evaluateClass).not.toHaveBeenCalled();
    expect(native.eval).toHaveBeenCalledTimes(1);
  });

  it('3. skips evaluation when active tenant has no upcoming classes in the 4-hour window', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '09:30', status: 'Scheduled' }, // started 30m ago
      { id: CLASS_A2, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '14:01', status: 'Scheduled' }, // 4h 01m away
    ];
    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis } = makeFakeRedis();
    const evaluateClass = jest.fn();
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;

    const scheduler = new StudioCapacityScheduler(prisma, redis, floorAlertService);
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 1,
      classesEvaluated: 0,
      alertsTriggered: 0,
      failures: 0,
    });
    expect(evaluateClass).not.toHaveBeenCalled();
  });

  it('4. isolates multiple tenants separately via PrismaService.withTenant()', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '11:30', status: 'Scheduled' },
      { id: CLASS_B1, tenantId: TENANT_B, date: todayUtcMidnight, startTime: '12:45', status: 'Scheduled' },
    ];
    const { prisma, withTenantCalls, classQueries } = makeFakePrisma(
      [TENANT_A, TENANT_B],
      classes,
    );
    const { redis } = makeFakeRedis();
    const evaluateClass = jest.fn().mockResolvedValue({
      evaluated: true,
      triggeredAlerts: [],
      deduplicatedTypes: [],
    });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;

    const scheduler = new StudioCapacityScheduler(prisma, redis, floorAlertService);
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 2,
      classesEvaluated: 2,
      alertsTriggered: 0,
      failures: 0,
    });
    expect(withTenantCalls).toEqual([TENANT_A, TENANT_B]);
    expect(classQueries.map((q) => q.tenantId)).toEqual([TENANT_A, TENANT_B]);
    expect(evaluateClass).toHaveBeenNthCalledWith(1, TENANT_A, CLASS_A1, {
      now,
      requireFourHourWindow: true,
    });
    expect(evaluateClass).toHaveBeenNthCalledWith(2, TENANT_B, CLASS_B1, {
      now,
      requireFourHourWindow: true,
    });
  });

  it('5. skips execution without releasing lock when Redis lock is already held', async () => {
    const { prisma, withTenantCalls } = makeFakePrisma([TENANT_A], []);
    const { redis, native } = makeFakeRedis('lock:scheduler:studio-capacity-monitor');
    const evaluateClass = jest.fn();
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;

    const scheduler = new StudioCapacityScheduler(prisma, redis, floorAlertService);
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: false,
      tenantsProcessed: 0,
      classesEvaluated: 0,
      alertsTriggered: 0,
      failures: 0,
    });
    expect(withTenantCalls).toHaveLength(0);
    expect(evaluateClass).not.toHaveBeenCalled();
    expect(native.eval).not.toHaveBeenCalled();
    expect(native.hasLock('lock:scheduler:studio-capacity-monitor')).toBe(true);
  });

  it('6. releases the Redis lock with matching key and token after a successful cycle', async () => {
    const { prisma } = makeFakePrisma([TENANT_A], []);
    const { redis, native } = makeFakeRedis();
    const floorAlertService = { evaluateClass: jest.fn() } as unknown as FloorAlertService;

    const scheduler = new StudioCapacityScheduler(prisma, redis, floorAlertService);
    await scheduler.monitorUpcomingClasses(now);

    expect(native.set).toHaveBeenCalledWith(
      'lock:scheduler:studio-capacity-monitor',
      expect.any(String),
      'PX',
      240000,
      'NX',
    );
    const issuedToken = native.set.mock.calls[0][1];
    expect(native.eval).toHaveBeenCalledTimes(1);
    expect(native.evalCalls[0].key).toBe('lock:scheduler:studio-capacity-monitor');
    expect(native.evalCalls[0].token).toBe(issuedToken);
    expect(native.hasLock('lock:scheduler:studio-capacity-monitor')).toBe(false);
  });

  it('7. releases the Redis lock in finally even when tenant lookup throws an unexpected error', async () => {
    const prisma = {
      tenant: {
        findMany: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      },
    } as unknown as PrismaService;
    const { redis, native } = makeFakeRedis();
    const floorAlertService = { evaluateClass: jest.fn() } as unknown as FloorAlertService;

    const scheduler = new StudioCapacityScheduler(prisma, redis, floorAlertService);

    await expect(scheduler.monitorUpcomingClasses(now)).rejects.toThrow(
      'DB connection lost',
    );
    expect(native.eval).toHaveBeenCalledTimes(1);
    expect(native.hasLock('lock:scheduler:studio-capacity-monitor')).toBe(false);
  });

  it('8. isolates per-class errors so one class failure does not stop remaining classes', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '11:00', status: 'Scheduled' },
      { id: CLASS_A2, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' },
    ];
    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis, native } = makeFakeRedis();

    const evaluateClass = jest
      .fn()
      .mockRejectedValueOnce(new Error('Transient query timeout'))
      .mockResolvedValueOnce({
        evaluated: true,
        triggeredAlerts: [{ type: FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H }],
        deduplicatedTypes: [],
      });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;

    const scheduler = new StudioCapacityScheduler(prisma, redis, floorAlertService);
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 1,
      classesEvaluated: 1,
      alertsTriggered: 1,
      failures: 1,
    });
    expect(evaluateClass).toHaveBeenCalledTimes(2);
    expect(evaluateClass).toHaveBeenNthCalledWith(1, TENANT_A, CLASS_A1, {
      now,
      requireFourHourWindow: true,
    });
    expect(evaluateClass).toHaveBeenNthCalledWith(2, TENANT_A, CLASS_A2, {
      now,
      requireFourHourWindow: true,
    });
    expect(native.hasLock('lock:scheduler:studio-capacity-monitor')).toBe(false);
  });

  it('9. passes triggered SURGE_90 alert to delivery service with expectedTenantId', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' },
    ];
    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis } = makeFakeRedis();
    const alert = makeTestAlert(TENANT_A, CLASS_A1, FLOOR_ALERT_TYPES.SURGE_90);
    const evaluateClass = jest.fn().mockResolvedValue({
      evaluated: true,
      triggeredAlerts: [alert],
      deduplicatedTypes: [],
    });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;
    const { deliveryService, deliverAlert } = makeFakeDeliveryService();

    const scheduler = new StudioCapacityScheduler(
      prisma,
      redis,
      floorAlertService,
      deliveryService,
    );
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 1,
      classesEvaluated: 1,
      alertsTriggered: 1,
      failures: 0,
    });
    expect(deliverAlert).toHaveBeenCalledTimes(1);
    expect(deliverAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        classId: CLASS_A1,
        type: FLOOR_ALERT_TYPES.SURGE_90,
      }),
      { expectedTenantId: TENANT_A },
    );
  });

  it('10. passes triggered FULL_100 alert to delivery service with expectedTenantId', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' },
    ];
    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis } = makeFakeRedis();
    const alert = makeTestAlert(TENANT_A, CLASS_A1, FLOOR_ALERT_TYPES.FULL_100);
    const evaluateClass = jest.fn().mockResolvedValue({
      evaluated: true,
      triggeredAlerts: [alert],
      deduplicatedTypes: [],
    });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;
    const { deliveryService, deliverAlert } = makeFakeDeliveryService();

    const scheduler = new StudioCapacityScheduler(
      prisma,
      redis,
      floorAlertService,
      deliveryService,
    );
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 1,
      classesEvaluated: 1,
      alertsTriggered: 1,
      failures: 0,
    });
    expect(deliverAlert).toHaveBeenCalledTimes(1);
    expect(deliverAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        classId: CLASS_A1,
        type: FLOOR_ALERT_TYPES.FULL_100,
      }),
      { expectedTenantId: TENANT_A },
    );
  });

  it('11. passes triggered LOW_ATTENDANCE_4H alert to delivery service with expectedTenantId', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' },
    ];
    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis } = makeFakeRedis();
    const alert = makeTestAlert(
      TENANT_A,
      CLASS_A1,
      FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H,
    );
    const evaluateClass = jest.fn().mockResolvedValue({
      evaluated: true,
      triggeredAlerts: [alert],
      deduplicatedTypes: [],
    });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;
    const { deliveryService, deliverAlert } = makeFakeDeliveryService();

    const scheduler = new StudioCapacityScheduler(
      prisma,
      redis,
      floorAlertService,
      deliveryService,
    );
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 1,
      classesEvaluated: 1,
      alertsTriggered: 1,
      failures: 0,
    });
    expect(deliverAlert).toHaveBeenCalledTimes(1);
    expect(deliverAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        classId: CLASS_A1,
        type: FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H,
      }),
      { expectedTenantId: TENANT_A },
    );
  });

  it('12. makes no delivery calls when no alerts are triggered or evaluation is skipped', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' },
      { id: CLASS_A2, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '13:00', status: 'Scheduled' },
    ];
    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis } = makeFakeRedis();
    const evaluateClass = jest
      .fn()
      .mockResolvedValueOnce({
        evaluated: true,
        triggeredAlerts: [],
        deduplicatedTypes: [],
      })
      .mockResolvedValueOnce({
        evaluated: false,
        skippedReason: 'OUTSIDE_WINDOW',
        triggeredAlerts: [],
        deduplicatedTypes: [],
      });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;
    const { deliveryService, deliverAlert } = makeFakeDeliveryService();

    const scheduler = new StudioCapacityScheduler(
      prisma,
      redis,
      floorAlertService,
      deliveryService,
    );
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 1,
      classesEvaluated: 1,
      alertsTriggered: 0,
      failures: 0,
    });
    expect(deliverAlert).not.toHaveBeenCalled();
  });

  it('13. handles duplicate alerts gracefully via delivery service F16 idempotency without failure', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' },
    ];
    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis } = makeFakeRedis();
    const alert = makeTestAlert(TENANT_A, CLASS_A1, FLOOR_ALERT_TYPES.SURGE_90);
    const evaluateClass = jest.fn().mockResolvedValue({
      evaluated: true,
      triggeredAlerts: [alert],
      deduplicatedTypes: [],
    });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;

    const deliverAlert = jest.fn().mockResolvedValue({
      created: false,
      deduplicated: true,
      operationalAlertId: 'existing-op-alert-1',
      outboxEventId: 'existing-outbox-event-1',
      idempotencyKey: `floor-alert:${TENANT_A}:${CLASS_A1}:SURGE_90`,
    });
    const deliveryService = {
      deliverAlert,
    } as unknown as FloorAlertDeliveryService;

    const scheduler = new StudioCapacityScheduler(
      prisma,
      redis,
      floorAlertService,
      deliveryService,
    );
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 1,
      classesEvaluated: 1,
      alertsTriggered: 1,
      failures: 0,
    });
    expect(deliverAlert).toHaveBeenCalledTimes(1);
    expect(deliverAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        classId: CLASS_A1,
        type: FLOOR_ALERT_TYPES.SURGE_90,
      }),
      { expectedTenantId: TENANT_A },
    );
  });

  it('14. isolates delivery errors per class so one class failure does not stop processing other classes', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '11:00', status: 'Scheduled' },
      { id: CLASS_A2, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' },
    ];
    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis, native } = makeFakeRedis();

    const alert1 = makeTestAlert(TENANT_A, CLASS_A1, FLOOR_ALERT_TYPES.SURGE_90);
    const alert2 = makeTestAlert(TENANT_A, CLASS_A2, FLOOR_ALERT_TYPES.FULL_100);

    const evaluateClass = jest
      .fn()
      .mockResolvedValueOnce({
        evaluated: true,
        triggeredAlerts: [alert1],
        deduplicatedTypes: [],
      })
      .mockResolvedValueOnce({
        evaluated: true,
        triggeredAlerts: [alert2],
        deduplicatedTypes: [],
      });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;

    const deliverAlert = jest
      .fn()
      .mockRejectedValueOnce(new Error('Outbox write failure'))
      .mockResolvedValueOnce({
        created: true,
        deduplicated: false,
        operationalAlertId: 'op-2',
        outboxEventId: 'outbox-2',
        idempotencyKey: 'key-2',
      });
    const deliveryService = {
      deliverAlert,
    } as unknown as FloorAlertDeliveryService;

    const scheduler = new StudioCapacityScheduler(
      prisma,
      redis,
      floorAlertService,
      deliveryService,
    );
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 1,
      classesEvaluated: 2,
      alertsTriggered: 2,
      failures: 1,
    });
    expect(deliverAlert).toHaveBeenCalledTimes(2);
    expect(native.hasLock('lock:scheduler:studio-capacity-monitor')).toBe(false);
  });

  it('15. preserves tenant ID and class ID from trusted scheduler context across multiple tenants', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '11:00', status: 'Scheduled' },
      { id: CLASS_B1, tenantId: TENANT_B, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' },
    ];
    const { prisma } = makeFakePrisma([TENANT_A, TENANT_B], classes);
    const { redis } = makeFakeRedis();

    const misattributedAlertA = makeTestAlert(
      TENANT_B,
      'forged-class-id',
      FLOOR_ALERT_TYPES.SURGE_90,
    );
    const validAlertB = makeTestAlert(
      TENANT_B,
      CLASS_B1,
      FLOOR_ALERT_TYPES.FULL_100,
    );

    const evaluateClass = jest
      .fn()
      .mockResolvedValueOnce({
        evaluated: true,
        triggeredAlerts: [misattributedAlertA],
        deduplicatedTypes: [],
      })
      .mockResolvedValueOnce({
        evaluated: true,
        triggeredAlerts: [validAlertB],
        deduplicatedTypes: [],
      });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;
    const { deliveryService, deliverAlert } = makeFakeDeliveryService();

    const scheduler = new StudioCapacityScheduler(
      prisma,
      redis,
      floorAlertService,
      deliveryService,
    );
    const summary = await scheduler.monitorUpcomingClasses(now);

    expect(summary).toEqual({
      lockAcquired: true,
      tenantsProcessed: 2,
      classesEvaluated: 2,
      alertsTriggered: 2,
      failures: 0,
    });
    expect(deliverAlert).toHaveBeenCalledTimes(2);
    expect(deliverAlert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tenantId: TENANT_A,
        classId: CLASS_A1,
        type: FLOOR_ALERT_TYPES.SURGE_90,
      }),
      { expectedTenantId: TENANT_A },
    );
    expect(deliverAlert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tenantId: TENANT_B,
        classId: CLASS_B1,
        type: FLOOR_ALERT_TYPES.FULL_100,
      }),
      { expectedTenantId: TENANT_B },
    );
  });

  it('16. preserves Redis distributed locking behavior across evaluation and delivery', async () => {
    const classes: FakeClassRow[] = [
      { id: CLASS_A1, tenantId: TENANT_A, date: todayUtcMidnight, startTime: '12:00', status: 'Scheduled' },
    ];
    const { prisma } = makeFakePrisma([TENANT_A], classes);
    const { redis, native } = makeFakeRedis();

    let lockHeldDuringDelivery = false;
    const deliverAlert = jest.fn().mockImplementation(async () => {
      lockHeldDuringDelivery = native.hasLock(
        'lock:scheduler:studio-capacity-monitor',
      );
      return {
        created: true,
        deduplicated: false,
        operationalAlertId: 'op-1',
        outboxEventId: 'outbox-1',
        idempotencyKey: 'key-1',
      };
    });
    const deliveryService = {
      deliverAlert,
    } as unknown as FloorAlertDeliveryService;

    const alert = makeTestAlert(TENANT_A, CLASS_A1, FLOOR_ALERT_TYPES.SURGE_90);
    const evaluateClass = jest.fn().mockResolvedValue({
      evaluated: true,
      triggeredAlerts: [alert],
      deduplicatedTypes: [],
    });
    const floorAlertService = { evaluateClass } as unknown as FloorAlertService;

    const scheduler = new StudioCapacityScheduler(
      prisma,
      redis,
      floorAlertService,
      deliveryService,
    );
    await scheduler.monitorUpcomingClasses(now);

    expect(lockHeldDuringDelivery).toBe(true);
    expect(native.hasLock('lock:scheduler:studio-capacity-monitor')).toBe(false);
    expect(native.eval).toHaveBeenCalledTimes(1);
  });
});
