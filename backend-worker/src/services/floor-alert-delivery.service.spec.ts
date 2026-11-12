import { FloorAlertDeliveryService } from './floor-alert-delivery.service';
import { PrismaService } from '../common/prisma.service';
import { RedisClient } from '../common/redis-client';
import { FLOOR_ALERT_TYPES, FloorAlert } from '../contracts/floor-alert.types';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const CLASS_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CORRELATION_1 = '99999999-9999-4999-8999-999999999999';

interface StoredAlertRow {
  id: string;
  tenantId: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  sourceEntityId: string | null;
  sourceEntityType: string | null;
  metadata: Record<string, unknown>;
}

interface StoredOutboxRow {
  id: string;
  tenantId: string;
  eventType: string;
  subjectType: string;
  subjectRef: string;
  correlationId: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
}

function makeFakeTransactionalPrisma(
  options: {
    failOutboxWith?: Error;
    initialAlerts?: StoredAlertRow[];
    initialOutbox?: StoredOutboxRow[];
  } = {},
) {
  const committedAlerts: StoredAlertRow[] = [...(options.initialAlerts ?? [])];
  const committedOutbox: StoredOutboxRow[] = [...(options.initialOutbox ?? [])];
  const withTenantCalls: string[] = [];
  const transactionTxRefs: unknown[] = [];
  const inFlightOutbox = new Map<
    string,
    {
      promise: Promise<void>;
      resolve: () => void;
    }
  >();
  let skipPrecheckOnce = Boolean(options.failOutboxWith);

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

      // Stage writes per transaction so failures roll back cleanly without mutating committed arrays
      const stagedAlerts: StoredAlertRow[] = [];
      const stagedOutbox: StoredOutboxRow[] = [];
      const myInFlightKeys: string[] = [];

      const tx = {
        operationalAlert: {
          findFirst: jest.fn(async ({ where }: { where: any }) => {
            const found = committedAlerts.find((a) => {
              if (a.tenantId !== where.tenantId) return false;
              if (where.sourceEntityId && a.sourceEntityId !== where.sourceEntityId) {
                return false;
              }
              if (
                where.sourceEntityType &&
                a.sourceEntityType !== where.sourceEntityType
              ) {
                return false;
              }
              if (
                where.metadata?.path?.[0] === 'idempotencyKey' &&
                a.metadata?.idempotencyKey !== where.metadata.equals
              ) {
                return false;
              }
              return true;
            });
            return found ? { id: found.id } : null;
          }),
          create: jest.fn(async ({ data }: { data: any }) => {
            const row: StoredAlertRow = {
              id: `alert-${committedAlerts.length + stagedAlerts.length + 1}`,
              ...data,
            };
            stagedAlerts.push(row);
            return { id: row.id };
          }),
        },
        outboxEvent: {
          findFirst: jest.fn(
            async ({ where }: { where: { tenantId: string; idempotencyKey: string } }) => {
              // On simulated concurrent race, first transaction's pre-check misses before commit,
              // then post-rollback fresh lookup finds the committed winning row.
              if (skipPrecheckOnce) {
                skipPrecheckOnce = false;
                return null;
              }
              const found = committedOutbox.find(
                (e) =>
                  e.tenantId === where.tenantId &&
                  e.idempotencyKey === where.idempotencyKey,
              );
              return found ? { id: found.id, payload: found.payload } : null;
            },
          ),
          create: jest.fn(async ({ data }: { data: any }) => {
            if (options.failOutboxWith) {
              throw options.failOutboxWith;
            }

            const key =
              data.idempotencyKey !== null && data.idempotencyKey !== undefined
                ? `${data.tenantId}:${data.idempotencyKey}`
                : null;

            if (key) {
              const conflict = [...committedOutbox, ...stagedOutbox].some(
                (e) =>
                  e.tenantId === data.tenantId &&
                  e.idempotencyKey !== null &&
                  e.idempotencyKey === data.idempotencyKey,
              );
              if (conflict) {
                const err = new Error(
                  'Unique constraint failed on ix_outbox_idempotency',
                ) as Error & { code: string };
                err.code = 'P2002';
                throw err;
              }

              const inFlight = inFlightOutbox.get(key);
              if (inFlight) {
                await inFlight.promise;
                const committedNow = committedOutbox.some(
                  (e) =>
                    e.tenantId === data.tenantId &&
                    e.idempotencyKey !== null &&
                    e.idempotencyKey === data.idempotencyKey,
                );
                if (committedNow) {
                  const err = new Error(
                    'Unique constraint failed on ix_outbox_idempotency',
                  ) as Error & { code: string };
                  err.code = 'P2002';
                  throw err;
                }
              }

              let resolveInFlight!: () => void;
              const promise = new Promise<void>((res) => {
                resolveInFlight = res;
              });
              inFlightOutbox.set(key, { promise, resolve: resolveInFlight });
              myInFlightKeys.push(key);
            }

            const row: StoredOutboxRow = {
              id: `outbox-${committedOutbox.length + stagedOutbox.length + 1}`,
              ...data,
            };
            stagedOutbox.push(row);
            return { id: row.id };
          }),
        },
      };

      transactionTxRefs.push(tx);

      try {
        const result = await work(tx);
        // Commit staged rows only when transaction callback succeeds
        committedAlerts.push(...stagedAlerts);
        committedOutbox.push(...stagedOutbox);
        return result;
      } finally {
        for (const k of myInFlightKeys) {
          const entry = inFlightOutbox.get(k);
          if (entry) {
            inFlightOutbox.delete(k);
            entry.resolve();
          }
        }
      }
    }),
  } as unknown as PrismaService;

  return {
    prisma,
    committedAlerts,
    committedOutbox,
    withTenantCalls,
    transactionTxRefs,
  };
}

function makeFloorAlert(overrides: Partial<FloorAlert> = {}): FloorAlert {
  return {
    tenantId: TENANT_A,
    classId: CLASS_1,
    type: FLOOR_ALERT_TYPES.SURGE_90,
    className: 'HIIT Conditioning',
    startTime: new Date('2026-11-12T18:00:00+05:30'),
    booked: 19,
    capacity: 20,
    waitlisted: 2,
    occupancyPct: 95,
    roomName: 'Main Floor',
    trainerName: 'Coach Marcus',
    minutesUntilStart: 90,
    severity: 'warning',
    title: 'Capacity Surge: HIIT Conditioning',
    message: 'Capacity Surge: HIIT Conditioning at 06:00 PM is now 95% full (19/20 spots).',
    dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`,
    createdAt: '2026-11-12T11:00:00.000Z',
    ...overrides,
  };
}

describe('FloorAlertDeliveryService', () => {
  it('1. persists an OperationalAlert using exact schema fields', async () => {
    const { prisma, committedAlerts } = makeFakeTransactionalPrisma();
    const service = new FloorAlertDeliveryService(prisma);
    const alert = makeFloorAlert();

    const result = await service.deliverAlert(alert, {
      correlationId: CORRELATION_1,
    });

    expect(result).toEqual({
      created: true,
      deduplicated: false,
      operationalAlertId: 'alert-1',
      outboxEventId: 'outbox-1',
      idempotencyKey: `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`,
    });
    expect(committedAlerts).toHaveLength(1);
    expect(committedAlerts[0]).toMatchObject({
      tenantId: TENANT_A,
      alertType: 'capacity',
      severity: 'warning',
      title: 'Capacity Surge: HIIT Conditioning',
      message: alert.message,
      sourceEntityId: CLASS_1,
      sourceEntityType: 'studio_class',
      metadata: expect.objectContaining({
        floorAlertType: FLOOR_ALERT_TYPES.SURGE_90,
        booked: 19,
        capacity: 20,
        waitlisted: 2,
        occupancyPct: 95,
        idempotencyKey: `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`,
      }),
    });
  });

  it('2. creates an OutboxEvent matching ops.outbox_events and FloorAlertOutboxPayload', async () => {
    const { prisma, committedOutbox } = makeFakeTransactionalPrisma();
    const service = new FloorAlertDeliveryService(prisma);
    const alert = makeFloorAlert({
      type: FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H,
      severity: 'info',
      booked: 2,
      capacity: 15,
      waitlisted: 0,
      occupancyPct: 13.3,
      title: 'Low Attendance Warning: HIIT Conditioning',
      message: 'Low Attendance: HIIT Conditioning has only 2 booking(s) and starts in 4 hours.',
      dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:LOW_ATTENDANCE_4H`,
    });

    await service.deliverAlert(alert, { correlationId: CORRELATION_1 });

    expect(committedOutbox).toHaveLength(1);
    expect(committedOutbox[0]).toEqual({
      id: 'outbox-1',
      tenantId: TENANT_A,
      eventType: 'floor.capacity.alert',
      subjectType: 'studio_class',
      subjectRef: CLASS_1,
      correlationId: CORRELATION_1,
      idempotencyKey: `floor-alert:${TENANT_A}:${CLASS_1}:LOW_ATTENDANCE_4H`,
      payload: {
        tenantId: TENANT_A,
        alertType: FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H,
        severity: 'info',
        classId: CLASS_1,
        className: 'HIIT Conditioning',
        startTimeIso: alert.startTime.toISOString(),
        booked: 2,
        capacity: 15,
        waitlisted: 0,
        occupancyPct: 13.3,
        message: alert.message,
        dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:LOW_ATTENDANCE_4H`,
        operationalAlertId: 'alert-1',
      },
    });
  });

  it('3. writes both OperationalAlert and OutboxEvent in the exact same withTenant transaction', async () => {
    const { prisma, withTenantCalls, transactionTxRefs } =
      makeFakeTransactionalPrisma();
    const service = new FloorAlertDeliveryService(prisma);

    await service.deliverAlert(makeFloorAlert());

    expect(withTenantCalls).toEqual([TENANT_A]);
    expect(transactionTxRefs).toHaveLength(1);
    const tx = transactionTxRefs[0] as any;
    expect(tx.operationalAlert.create).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('4. enforces tenant isolation across separate tenants and rejects tenant mismatch', async () => {
    const { prisma, committedAlerts, committedOutbox, withTenantCalls } =
      makeFakeTransactionalPrisma();
    const service = new FloorAlertDeliveryService(prisma);

    const alertA = makeFloorAlert({ tenantId: TENANT_A });
    const alertB = makeFloorAlert({
      tenantId: TENANT_B,
      dedupKey: `floor-alert:${TENANT_B}:${CLASS_1}:SURGE_90`,
    });

    const resA = await service.deliverAlert(alertA);
    const resB = await service.deliverAlert(alertB);

    expect(resA.created).toBe(true);
    expect(resB.created).toBe(true);
    expect(resA.idempotencyKey).not.toBe(resB.idempotencyKey);
    expect(withTenantCalls).toEqual([TENANT_A, TENANT_B]);
    expect(committedAlerts.map((a) => a.tenantId)).toEqual([TENANT_A, TENANT_B]);
    expect(committedOutbox.map((o) => o.tenantId)).toEqual([TENANT_A, TENANT_B]);

    await expect(
      service.deliverAlert(alertA, { expectedTenantId: TENANT_B }),
    ).rejects.toThrow(/Tenant mismatch/i);
  });

  it('5. handles duplicate idempotency key safely without creating duplicate OperationalAlert or OutboxEvent rows', async () => {
    const { prisma, committedAlerts, committedOutbox } =
      makeFakeTransactionalPrisma();
    const service = new FloorAlertDeliveryService(prisma);
    const alert = makeFloorAlert();

    const first = await service.deliverAlert(alert);
    const second = await service.deliverAlert(alert);

    expect(first.created).toBe(true);
    expect(second).toEqual({
      created: false,
      deduplicated: true,
      operationalAlertId: 'alert-1',
      outboxEventId: 'outbox-1',
      idempotencyKey: first.idempotencyKey,
    });
    expect(committedAlerts).toHaveLength(1);
    expect(committedOutbox).toHaveLength(1);

    // Also test concurrent P2002 race condition where findFirst misses prior to commit
    const p2002Error = Object.assign(
      new Error('Unique constraint failed on ix_outbox_idempotency'),
      { code: 'P2002' },
    );
    const raceStore = makeFakeTransactionalPrisma({ failOutboxWith: p2002Error });
    const raceService = new FloorAlertDeliveryService(raceStore.prisma);

    const raceResult = await raceService.deliverAlert(alert);
    expect(raceResult).toEqual({
      created: false,
      deduplicated: true,
      operationalAlertId: null,
      outboxEventId: null,
      idempotencyKey: first.idempotencyKey,
    });
    expect(raceStore.committedAlerts).toHaveLength(0);
    expect(raceStore.committedOutbox).toHaveLength(0);
  });

  it('6. rolls back OperationalAlert creation and rethrows when OutboxEvent write fails', async () => {
    const dbError = new Error('PostgreSQL connection terminated');
    const { prisma, committedAlerts, committedOutbox } =
      makeFakeTransactionalPrisma({ failOutboxWith: dbError });
    const service = new FloorAlertDeliveryService(prisma);

    await expect(service.deliverAlert(makeFloorAlert())).rejects.toThrow(
      'PostgreSQL connection terminated',
    );
    expect(committedAlerts).toHaveLength(0);
    expect(committedOutbox).toHaveLength(0);
  });

  it('7. rejects invalid tenant ID before starting any database transaction', async () => {
    const { prisma, withTenantCalls } = makeFakeTransactionalPrisma();
    const service = new FloorAlertDeliveryService(prisma);

    await expect(
      service.deliverAlert(makeFloorAlert({ tenantId: 'invalid-tenant-id' })),
    ).rejects.toThrow(/canonical tenant UUID/i);

    await expect(
      service.deliverAlert(makeFloorAlert({ tenantId: '' })),
    ).rejects.toThrow(/canonical tenant UUID/i);

    expect(withTenantCalls).toHaveLength(0);
  });

  it('8. retrieves existing OperationalAlert and OutboxEvent IDs after P2002 rollback in concurrent race', async () => {
    const alert = makeFloorAlert();
    const idempotencyKey = `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`;
    const p2002Error = Object.assign(
      new Error('Unique constraint failed on ix_outbox_idempotency'),
      { code: 'P2002' },
    );

    const { prisma, withTenantCalls } = makeFakeTransactionalPrisma({
      failOutboxWith: p2002Error,
      initialAlerts: [
        {
          id: 'alert-winner-1',
          tenantId: TENANT_A,
          alertType: 'capacity',
          severity: 'warning',
          title: 'Capacity Surge: HIIT Conditioning',
          message: alert.message,
          sourceEntityId: CLASS_1,
          sourceEntityType: 'studio_class',
          metadata: { idempotencyKey },
        },
      ],
      initialOutbox: [
        {
          id: 'outbox-winner-1',
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: CLASS_1,
          correlationId: CORRELATION_1,
          idempotencyKey,
          payload: {
            operationalAlertId: 'alert-winner-1',
          },
        },
      ],
    });
    const service = new FloorAlertDeliveryService(prisma);

    const result = await service.deliverAlert(alert);

    expect(result).toEqual({
      created: false,
      deduplicated: true,
      operationalAlertId: 'alert-winner-1',
      outboxEventId: 'outbox-winner-1',
      idempotencyKey,
    });
    // First withTenant for transaction attempt, second fresh withTenant lookup after rollback
    expect(withTenantCalls).toEqual([TENANT_A, TENANT_A]);
  });

  it('9. rejects invalid startTime, invalid classId, empty className/message, zero capacity, and non-finite occupancyPct before Prisma', async () => {
    const { prisma, withTenantCalls } = makeFakeTransactionalPrisma();
    const service = new FloorAlertDeliveryService(prisma);

    await expect(
      service.deliverAlert(makeFloorAlert({ startTime: 'not-a-valid-date' as any })),
    ).rejects.toThrow(/Invalid startTime/i);

    await expect(
      service.deliverAlert(makeFloorAlert({ startTime: '' as any })),
    ).rejects.toThrow(/valid startTime/i);

    await expect(
      service.deliverAlert(makeFloorAlert({ capacity: 0 })),
    ).rejects.toThrow(/positive capacity/i);

    await expect(
      service.deliverAlert(makeFloorAlert({ classId: 'not-a-uuid' })),
    ).rejects.toThrow(/canonical studio class UUID/i);

    await expect(
      service.deliverAlert(makeFloorAlert({ className: '   ' })),
    ).rejects.toThrow(/non-empty className/i);

    await expect(
      service.deliverAlert(makeFloorAlert({ message: '' })),
    ).rejects.toThrow(/non-empty message/i);

    await expect(
      service.deliverAlert(makeFloorAlert({ occupancyPct: Number.NaN })),
    ).rejects.toThrow(/finite occupancyPct/i);

    expect(withTenantCalls).toHaveLength(0);
  });

  it('10. maps FULL_100 alerts to capacity category with critical severity', async () => {
    const { prisma, committedAlerts, committedOutbox } =
      makeFakeTransactionalPrisma();
    const service = new FloorAlertDeliveryService(prisma);
    const fullAlert = makeFloorAlert({
      type: FLOOR_ALERT_TYPES.FULL_100,
      severity: undefined,
      title: undefined,
      booked: 20,
      capacity: 20,
      waitlisted: 3,
      occupancyPct: 100,
      dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:FULL_100`,
      message: 'Class Full: HIIT Conditioning at 06:00 PM has reached 100% capacity (20/20, 3 waitlisted).',
    });

    const result = await service.deliverAlert(fullAlert);

    expect(result.created).toBe(true);
    expect(committedAlerts[0]).toMatchObject({
      alertType: 'capacity',
      severity: 'critical',
      title: 'Class Full: HIIT Conditioning',
    });
    expect(committedOutbox[0].payload).toMatchObject({
      alertType: FLOOR_ALERT_TYPES.FULL_100,
      severity: 'critical',
      occupancyPct: 100,
    });
  });

  it('11. extracts operationalAlertId when existing OutboxEvent payload contains _delivery metadata or stringified JSON', async () => {
    const idempotencyKey = `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`;
    const alert = makeFloorAlert();

    const objectStore = makeFakeTransactionalPrisma({
      initialOutbox: [
        {
          id: 'outbox-delivered-1',
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: CLASS_1,
          correlationId: CORRELATION_1,
          idempotencyKey,
          payload: {
            tenantId: TENANT_A,
            alertType: FLOOR_ALERT_TYPES.SURGE_90,
            operationalAlertId: 'alert-delivered-1',
            _delivery: {
              provider: 'whatsapp_cloud_api',
              deliveryStatus: 'accepted_for_processing',
              deliveredAt: '2026-11-12T11:01:00.000Z',
            },
          },
        },
      ],
    });
    const serviceObj = new FloorAlertDeliveryService(objectStore.prisma);
    const resObj = await serviceObj.deliverAlert(alert);

    expect(resObj).toEqual({
      created: false,
      deduplicated: true,
      operationalAlertId: 'alert-delivered-1',
      outboxEventId: 'outbox-delivered-1',
      idempotencyKey,
    });

    const stringPayloadStore = makeFakeTransactionalPrisma({
      initialOutbox: [
        {
          id: 'outbox-delivered-2',
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: CLASS_1,
          correlationId: CORRELATION_1,
          idempotencyKey,
          payload: JSON.stringify({
            operationalAlertId: 'alert-delivered-2',
            _delivery: { deliveryStatus: 'simulated' },
          }) as any,
        },
      ],
    });
    const serviceStr = new FloorAlertDeliveryService(stringPayloadStore.prisma);
    const resStr = await serviceStr.deliverAlert(alert);

    expect(resStr).toEqual({
      created: false,
      deduplicated: true,
      operationalAlertId: 'alert-delivered-2',
      outboxEventId: 'outbox-delivered-2',
      idempotencyKey,
    });
  });

  it('12. publishes sanitized capacity alert to tenant Redis channel strictly after DB commit', async () => {
    const eventsOrder: string[] = [];
    const { prisma, committedOutbox } = makeFakeTransactionalPrisma();
    const origWithTenant = (prisma as any).withTenant;
    (prisma as any).withTenant = jest.fn(async (tenantId: string, fn: any) => {
      eventsOrder.push('tx:start');
      const res = await origWithTenant(tenantId, fn);
      eventsOrder.push('tx:committed');
      return res;
    });

    const publishMock = jest.fn(async () => {
      expect(committedOutbox).toHaveLength(1);
      eventsOrder.push('redis:publish');
      return 1;
    });
    const fakeRedis = { publish: publishMock } as unknown as RedisClient;

    const service = new FloorAlertDeliveryService(prisma, fakeRedis);
    const alert = makeFloorAlert();

    const result = await service.deliverAlert(alert, {
      correlationId: CORRELATION_1,
    });

    expect(result.created).toBe(true);
    expect(eventsOrder).toEqual(['tx:start', 'tx:committed', 'redis:publish']);
    expect(publishMock).toHaveBeenCalledTimes(1);

    const [channel, rawPayload] = publishMock.mock.calls[0] as unknown as [string, string];
    expect(channel).toBe(`front-desk:alerts:${TENANT_A}`);

    const parsed = JSON.parse(rawPayload);
    expect(parsed).toMatchObject({
      eventId: 'outbox-1',
      eventType: 'floor.capacity.alert',
      tenantId: TENANT_A,
      alertType: FLOOR_ALERT_TYPES.SURGE_90,
      severity: 'warning',
      operationalAlertId: 'alert-1',
      outboxEventId: 'outbox-1',
      classId: CLASS_1,
      className: 'HIIT Conditioning',
      startTimeIso: alert.startTime.toISOString(),
      booked: 19,
      capacity: 20,
      waitlisted: 2,
      occupancyPct: 95,
      message: alert.message,
      dedupKey: alert.dedupKey,
    });
    expect(parsed.publishedAt).toEqual(expect.any(String));
    // Must never leak staff/member PII over Pub/Sub
    expect(parsed.trainerName).toBeUndefined();
    expect(parsed.phoneE164).toBeUndefined();
    expect(parsed.email).toBeUndefined();
  });

  it('13. does not publish to Redis when alert is deduplicated (fast-path or P2002)', async () => {
    const { prisma } = makeFakeTransactionalPrisma();
    const publishMock = jest.fn(async () => 1);
    const fakeRedis = { publish: publishMock } as unknown as RedisClient;
    const service = new FloorAlertDeliveryService(prisma, fakeRedis);
    const alert = makeFloorAlert();

    await service.deliverAlert(alert);
    expect(publishMock).toHaveBeenCalledTimes(1);

    const dupResult = await service.deliverAlert(alert);
    expect(dupResult.created).toBe(false);
    expect(dupResult.deduplicated).toBe(true);
    expect(publishMock).toHaveBeenCalledTimes(1);

    const p2002Error = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    const raceStore = makeFakeTransactionalPrisma({ failOutboxWith: p2002Error });
    const racePublish = jest.fn(async () => 1);
    const raceService = new FloorAlertDeliveryService(raceStore.prisma, {
      publish: racePublish,
    } as unknown as RedisClient);

    const raceResult = await raceService.deliverAlert(alert);
    expect(raceResult.created).toBe(false);
    expect(racePublish).not.toHaveBeenCalled();
  });

  it('14. does not publish to Redis when DB transaction fails and rolls back', async () => {
    const dbError = new Error('DB deadlock');
    const { prisma, committedAlerts, committedOutbox } =
      makeFakeTransactionalPrisma({ failOutboxWith: dbError });
    const publishMock = jest.fn(async () => 1);
    const service = new FloorAlertDeliveryService(prisma, {
      publish: publishMock,
    } as unknown as RedisClient);

    await expect(service.deliverAlert(makeFloorAlert())).rejects.toThrow(
      'DB deadlock',
    );
    expect(committedAlerts).toHaveLength(0);
    expect(committedOutbox).toHaveLength(0);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('15. logs and preserves committed DB records if Redis publish fails', async () => {
    const { prisma, committedAlerts, committedOutbox } =
      makeFakeTransactionalPrisma();
    const publishMock = jest.fn(async () => {
      throw new Error('ECONNREFUSED redis');
    });
    const service = new FloorAlertDeliveryService(prisma, {
      publish: publishMock,
    } as unknown as RedisClient);

    const result = await service.deliverAlert(makeFloorAlert());

    expect(result.created).toBe(true);
    expect(result.operationalAlertId).toBe('alert-1');
    expect(result.outboxEventId).toBe('outbox-1');
    expect(committedAlerts).toHaveLength(1);
    expect(committedOutbox).toHaveLength(1);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('16. isolates Redis channels cleanly per tenant UUID', async () => {
    const { prisma } = makeFakeTransactionalPrisma();
    const publishMock = jest.fn(async () => 1);
    const service = new FloorAlertDeliveryService(prisma, {
      publish: publishMock,
    } as unknown as RedisClient);

    await service.deliverAlert(makeFloorAlert({ tenantId: TENANT_A }));
    await service.deliverAlert(
      makeFloorAlert({
        tenantId: TENANT_B,
        dedupKey: `floor-alert:${TENANT_B}:${CLASS_1}:SURGE_90`,
      }),
    );

    expect(publishMock).toHaveBeenNthCalledWith(
      1,
      `front-desk:alerts:${TENANT_A}`,
      expect.any(String),
    );
    expect(publishMock).toHaveBeenNthCalledWith(
      2,
      `front-desk:alerts:${TENANT_B}`,
      expect.any(String),
    );
  });

  it('17. allows SURGE_90 and FULL_100 for the same class and tenant as distinct alerts', async () => {
    const { prisma, committedAlerts, committedOutbox } =
      makeFakeTransactionalPrisma();
    const publishMock = jest.fn(async () => 1);
    const service = new FloorAlertDeliveryService(prisma, {
      publish: publishMock,
    } as unknown as RedisClient);

    const surgeResult = await service.deliverAlert(
      makeFloorAlert({
        type: FLOOR_ALERT_TYPES.SURGE_90,
        booked: 18,
        capacity: 20,
        occupancyPct: 90,
        dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`,
      }),
    );

    const fullResult = await service.deliverAlert(
      makeFloorAlert({
        type: FLOOR_ALERT_TYPES.FULL_100,
        severity: 'critical',
        title: 'Class Full: HIIT Conditioning',
        booked: 20,
        capacity: 20,
        occupancyPct: 100,
        dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:FULL_100`,
      }),
    );

    expect(surgeResult.created).toBe(true);
    expect(fullResult.created).toBe(true);
    expect(surgeResult.idempotencyKey).not.toBe(fullResult.idempotencyKey);
    expect(committedAlerts).toHaveLength(2);
    expect(committedOutbox).toHaveLength(2);
    expect(publishMock).toHaveBeenCalledTimes(2);
  });

  it('18. isolates same class ID and alert type deduplication cleanly across separate tenants', async () => {
    const { prisma, committedAlerts, committedOutbox } =
      makeFakeTransactionalPrisma();
    const publishMock = jest.fn(async () => 1);
    const service = new FloorAlertDeliveryService(prisma, {
      publish: publishMock,
    } as unknown as RedisClient);

    const resA = await service.deliverAlert(
      makeFloorAlert({ tenantId: TENANT_A, classId: CLASS_1 }),
    );
    const resB = await service.deliverAlert(
      makeFloorAlert({
        tenantId: TENANT_B,
        classId: CLASS_1,
        dedupKey: `floor-alert:${TENANT_B}:${CLASS_1}:SURGE_90`,
      }),
    );
    const dupA = await service.deliverAlert(
      makeFloorAlert({ tenantId: TENANT_A, classId: CLASS_1 }),
    );

    expect(resA.created).toBe(true);
    expect(resB.created).toBe(true);
    expect(dupA.created).toBe(false);
    expect(dupA.deduplicated).toBe(true);
    expect(dupA.outboxEventId).toBe(resA.outboxEventId);
    expect(committedAlerts).toHaveLength(2);
    expect(committedOutbox).toHaveLength(2);
    expect(publishMock).toHaveBeenCalledTimes(2);
  });

  it('19. handles concurrent duplicate requests safely (1 OperationalAlert, 1 OutboxEvent, 1 Redis publish, winning IDs returned to both)', async () => {
    const { prisma, committedAlerts, committedOutbox } =
      makeFakeTransactionalPrisma();
    const publishMock = jest.fn(async () => 1);
    const origWithTenant = (prisma as any).withTenant;

    // Force two concurrent transactions to pass pre-check simultaneously before either commits
    let precheckCount = 0;
    let releaseSecondPrecheck: (() => void) | null = null;
    const bothPrechecked = new Promise<void>((resolve) => {
      releaseSecondPrecheck = resolve;
    });

    (prisma as any).withTenant = jest.fn(async (tenantId: string, fn: any) =>
      origWithTenant(tenantId, async (tx: any) => {
        const origFindFirst = tx.outboxEvent.findFirst;
        tx.outboxEvent.findFirst = jest.fn(async (args: any) => {
          const res = await origFindFirst(args);
          if (res === null && precheckCount < 2) {
            precheckCount += 1;
            if (precheckCount === 2) {
              releaseSecondPrecheck?.();
            } else {
              await bothPrechecked;
              // Yield so the first transaction enters create() ahead of the second or races deterministically
            }
          }
          return res;
        });
        return fn(tx);
      }),
    );

    const service = new FloorAlertDeliveryService(prisma, {
      publish: publishMock,
    } as unknown as RedisClient);
    const alert = makeFloorAlert();

    const [first, second] = await Promise.all([
      service.deliverAlert(alert),
      service.deliverAlert(alert),
    ]);

    const results = [first, second];
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.filter((r) => r.deduplicated)).toHaveLength(1);
    const winner = results.find((r) => r.created)!;
    const loser = results.find((r) => r.deduplicated)!;
    expect(loser.operationalAlertId).toBe(winner.operationalAlertId);
    expect(loser.outboxEventId).toBe(winner.outboxEventId);
    expect(committedAlerts).toHaveLength(1);
    expect(committedOutbox).toHaveLength(1);
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('20. preserves Outbox retry lifecycle: existing failed/retrying OutboxEvent prevents new OperationalAlert or Redis event', async () => {
    const idempotencyKey = `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`;
    const alert = makeFloorAlert();

    // Simulate an already-created OperationalAlert & OutboxEvent currently in retry state ('failed')
    const retryStore = makeFakeTransactionalPrisma({
      initialAlerts: [
        {
          id: 'alert-retry-1',
          tenantId: TENANT_A,
          alertType: 'capacity',
          severity: 'warning',
          title: 'Capacity Surge: HIIT Conditioning',
          message: alert.message,
          sourceEntityId: CLASS_1,
          sourceEntityType: 'studio_class',
          metadata: { idempotencyKey },
        },
      ],
      initialOutbox: [
        {
          id: 'outbox-retry-1',
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: CLASS_1,
          correlationId: CORRELATION_1,
          idempotencyKey,
          payload: {
            tenantId: TENANT_A,
            alertType: FLOOR_ALERT_TYPES.SURGE_90,
            operationalAlertId: 'alert-retry-1',
          },
        },
      ],
    });
    const publishMock = jest.fn(async () => 1);
    const service = new FloorAlertDeliveryService(retryStore.prisma, {
      publish: publishMock,
    } as unknown as RedisClient);

    const result = await service.deliverAlert(alert);

    expect(result).toEqual({
      created: false,
      deduplicated: true,
      operationalAlertId: 'alert-retry-1',
      outboxEventId: 'outbox-retry-1',
      idempotencyKey,
    });
    expect(retryStore.committedAlerts).toHaveLength(1);
    expect(retryStore.committedOutbox).toHaveLength(1);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('21. uses configurable ONCE_PER_CLASS_PER_ALERT_TYPE policy by default and rejects unsupported policies before Prisma', async () => {
    const { prisma, committedAlerts, withTenantCalls } =
      makeFakeTransactionalPrisma();
    const fakeConfig = {
      get: jest.fn((key: string) =>
        key === 'FLOOR_ALERT_DEDUP_POLICY'
          ? 'ONCE_PER_CLASS_PER_ALERT_TYPE'
          : undefined,
      ),
    };
    const service = new FloorAlertDeliveryService(
      prisma,
      undefined,
      fakeConfig as any,
    );

    const res = await service.deliverAlert(makeFloorAlert());
    expect(res.created).toBe(true);
    expect(committedAlerts[0].metadata).toMatchObject({
      deduplicationPolicy: 'ONCE_PER_CLASS_PER_ALERT_TYPE',
    });

    const beforeInvalidCalls = withTenantCalls.length;
    await expect(
      service.deliverAlert(makeFloorAlert(), {
        deduplicationPolicy: 'UNSUPPORTED_POLICY' as any,
      }),
    ).rejects.toThrow(/Unsupported floor alert deduplication policy/i);
    expect(withTenantCalls).toHaveLength(beforeInvalidCalls);
  });

  it('22. prevents Tenant A from retrieving Tenant B alerts even on P2002 or identical classId and rejects empty dedupKey', async () => {
    const tenantBKey = `floor-alert:${TENANT_B}:${CLASS_1}:SURGE_90`;
    const alertB = makeFloorAlert({ tenantId: TENANT_B, dedupKey: tenantBKey });
    const p2002Error = Object.assign(
      new Error('Unique constraint failed on ix_outbox_idempotency'),
      { code: 'P2002' },
    );

    // Store contains ONLY Tenant B's alert & outbox record for CLASS_1
    const { prisma, withTenantCalls } = makeFakeTransactionalPrisma({
      failOutboxWith: p2002Error,
      initialAlerts: [
        {
          id: 'alert-tenant-b-secret',
          tenantId: TENANT_B,
          alertType: 'capacity',
          severity: 'warning',
          title: 'Secret Tenant B Alert',
          message: alertB.message,
          sourceEntityId: CLASS_1,
          sourceEntityType: 'studio_class',
          metadata: { idempotencyKey: tenantBKey },
        },
      ],
      initialOutbox: [
        {
          id: 'outbox-tenant-b-secret',
          tenantId: TENANT_B,
          eventType: 'floor.capacity.alert',
          subjectType: 'studio_class',
          subjectRef: CLASS_1,
          correlationId: CORRELATION_1,
          idempotencyKey: tenantBKey,
          payload: { operationalAlertId: 'alert-tenant-b-secret' },
        },
      ],
    });
    const service = new FloorAlertDeliveryService(prisma);

    // Tenant A encounters P2002 lookup for CLASS_1 and must NOT recover Tenant B's alert/outbox IDs
    const resA = await service.deliverAlert(makeFloorAlert({ tenantId: TENANT_A }));
    expect(resA).toEqual({
      created: false,
      deduplicated: true,
      operationalAlertId: null,
      outboxEventId: null,
      idempotencyKey: `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`,
    });
    expect(withTenantCalls).toEqual([TENANT_A, TENANT_A]);

    await expect(
      service.deliverAlert(makeFloorAlert({ dedupKey: '   ' })),
    ).rejects.toThrow(/non-empty dedupKey/i);
  });
});
