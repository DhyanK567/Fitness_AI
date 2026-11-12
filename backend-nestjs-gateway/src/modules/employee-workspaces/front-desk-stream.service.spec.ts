import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma.service';
import {
  FLOOR_ALERT_CHANNEL_PATTERN,
  FLOOR_ALERT_CHANNEL_PREFIX,
  FrontDeskSseEvent,
  FrontDeskStreamService,
} from './front-desk-stream.service';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const CLASS_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeFakeSubscriber() {
  const listeners = new Map<string, Array<(...args: any[]) => void>>();

  const subscriber: any = {
    status: 'wait',
    on: jest.fn((event: string, fn: (...args: any[]) => void) => {
      const existing = listeners.get(event) ?? [];
      existing.push(fn);
      listeners.set(event, existing);
      return subscriber;
    }),
    emitEvent: (event: string, ...args: any[]) => {
      for (const fn of listeners.get(event) ?? []) {
        fn(...args);
      }
    },
    connect: jest.fn(async () => {
      subscriber.status = 'ready';
      subscriber.emitEvent('ready');
    }),
    psubscribe: jest.fn(async () => 1),
    punsubscribe: jest.fn(async () => 0),
    quit: jest.fn(async () => {
      subscriber.status = 'end';
      return 'OK';
    }),
    disconnect: jest.fn(() => {
      subscriber.status = 'end';
    }),
    removeAllListeners: jest.fn(() => {
      listeners.clear();
    }),
    listeners,
  };

  return subscriber;
}

function makeFloorPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'outbox-evt-1',
    eventType: 'floor.capacity.alert',
    tenantId: TENANT_A,
    alertType: 'SURGE_90',
    severity: 'warning',
    operationalAlertId: 'alert-1',
    outboxEventId: 'outbox-evt-1',
    classId: CLASS_1,
    className: 'Morning HIIT',
    startTimeIso: '2026-11-12T12:30:00.000Z',
    booked: 18,
    capacity: 20,
    waitlisted: 1,
    occupancyPct: 90,
    message: 'Capacity Surge: Morning HIIT is 90% full (18/20 spots).',
    dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`,
    publishedAt: '2026-11-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('FrontDeskStreamService — Redis Pub/Sub & SSE', () => {
  let service: FrontDeskStreamService;
  let fakeSub: ReturnType<typeof makeFakeSubscriber>;
  let duplicateMock: jest.Mock;
  let sharedPsubscribeMock: jest.Mock;

  beforeEach(async () => {
    fakeSub = makeFakeSubscriber();
    duplicateMock = jest.fn(() => fakeSub);
    sharedPsubscribeMock = jest.fn();

    const fakeRedis = {
      getClient: jest.fn(() => ({
        duplicate: duplicateMock,
        psubscribe: sharedPsubscribeMock,
      })),
    };

    const fakePrisma = {
      withTenant: jest.fn(),
    } as unknown as PrismaService;

    service = new FrontDeskStreamService(fakePrisma, fakeRedis as any);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('subscribes via a dedicated duplicated Redis client and never subscribes on the shared connection', () => {
    expect(duplicateMock).toHaveBeenCalledTimes(1);
    const dupOpts = duplicateMock.mock.calls[0][0];
    expect(dupOpts.maxRetriesPerRequest).toBeNull();
    expect(typeof dupOpts.retryStrategy).toBe('function');
    // Continues backing off beyond attempt 3 (unlike shared Gateway RedisClient)
    expect(dupOpts.retryStrategy(1)).toBe(250);
    expect(dupOpts.retryStrategy(5)).toBe(1250);
    expect(dupOpts.retryStrategy(50)).toBe(5000);

    expect(sharedPsubscribeMock).not.toHaveBeenCalled();
    expect(fakeSub.psubscribe).toHaveBeenCalledWith(FLOOR_ALERT_CHANNEL_PATTERN);
  });

  it('forwards valid floor.capacity.alert Redis messages into discriminated tenant SSE events without leaking extra fields', () => {
    const receivedA: FrontDeskSseEvent[] = [];
    const subA = service.getEventStream(TENANT_A).subscribe((ev) => receivedA.push(ev));

    const payloadWithExtra = makeFloorPayload({
      alertType: 'FULL_100',
      severity: 'critical',
      booked: 20,
      occupancyPct: 100,
      phoneE164: '+919876543210',
      memberEmail: 'leak@example.com',
    });

    fakeSub.emitEvent(
      'pmessage',
      FLOOR_ALERT_CHANNEL_PATTERN,
      `${FLOOR_ALERT_CHANNEL_PREFIX}${TENANT_A}`,
      JSON.stringify(payloadWithExtra),
    );

    expect(receivedA).toHaveLength(1);
    expect(receivedA[0]).toEqual({
      id: 'outbox-evt-1',
      type: 'floor.capacity.alert',
      data: {
        eventId: 'outbox-evt-1',
        eventType: 'floor.capacity.alert',
        tenantId: TENANT_A,
        alertType: 'FULL_100',
        severity: 'critical',
        operationalAlertId: 'alert-1',
        outboxEventId: 'outbox-evt-1',
        classId: CLASS_1,
        className: 'Morning HIIT',
        startTimeIso: '2026-11-12T12:30:00.000Z',
        booked: 20,
        capacity: 20,
        waitlisted: 1,
        occupancyPct: 100,
        message: 'Capacity Surge: Morning HIIT is 90% full (18/20 spots).',
        dedupKey: `floor-alert:${TENANT_A}:${CLASS_1}:SURGE_90`,
        publishedAt: '2026-11-12T10:00:00.000Z',
      },
    });
    expect((receivedA[0].data as any).phoneE164).toBeUndefined();
    expect((receivedA[0].data as any).memberEmail).toBeUndefined();

    subA.unsubscribe();
  });

  it('rejects malformed JSON and incomplete payloads without emitting SSE events', () => {
    const receivedA: FrontDeskSseEvent[] = [];
    const subA = service.getEventStream(TENANT_A).subscribe((ev) => receivedA.push(ev));

    fakeSub.emitEvent(
      'pmessage',
      FLOOR_ALERT_CHANNEL_PATTERN,
      `${FLOOR_ALERT_CHANNEL_PREFIX}${TENANT_A}`,
      '{invalid-json',
    );

    fakeSub.emitEvent(
      'pmessage',
      FLOOR_ALERT_CHANNEL_PATTERN,
      `${FLOOR_ALERT_CHANNEL_PREFIX}${TENANT_A}`,
      JSON.stringify(makeFloorPayload({ capacity: 0 })),
    );

    fakeSub.emitEvent(
      'pmessage',
      FLOOR_ALERT_CHANNEL_PATTERN,
      `${FLOOR_ALERT_CHANNEL_PREFIX}${TENANT_A}`,
      JSON.stringify(makeFloorPayload({ eventType: 'unknown.event' })),
    );

    expect(receivedA).toHaveLength(0);
    subA.unsubscribe();
  });

  it('rejects invalid tenant UUIDs and channel/payload tenant mismatches', () => {
    const receivedA: FrontDeskSseEvent[] = [];
    const subA = service.getEventStream(TENANT_A).subscribe((ev) => receivedA.push(ev));

    fakeSub.emitEvent(
      'pmessage',
      FLOOR_ALERT_CHANNEL_PATTERN,
      `${FLOOR_ALERT_CHANNEL_PREFIX}not-a-uuid`,
      JSON.stringify(makeFloorPayload({ tenantId: 'not-a-uuid' })),
    );

    fakeSub.emitEvent(
      'pmessage',
      FLOOR_ALERT_CHANNEL_PATTERN,
      `${FLOOR_ALERT_CHANNEL_PREFIX}${TENANT_A}`,
      JSON.stringify(makeFloorPayload({ tenantId: TENANT_B })),
    );

    expect(receivedA).toHaveLength(0);
    subA.unsubscribe();
  });

  it('isolates floor capacity and check-in SSE streams strictly per tenant', () => {
    const receivedA: FrontDeskSseEvent[] = [];
    const receivedB: FrontDeskSseEvent[] = [];
    const subA = service.getEventStream(TENANT_A).subscribe((ev) => receivedA.push(ev));
    const subB = service.getEventStream(TENANT_B).subscribe((ev) => receivedB.push(ev));

    // Tenant B floor alert must not reach Tenant A
    fakeSub.emitEvent(
      'pmessage',
      FLOOR_ALERT_CHANNEL_PATTERN,
      `${FLOOR_ALERT_CHANNEL_PREFIX}${TENANT_B}`,
      JSON.stringify(
        makeFloorPayload({
          eventId: 'outbox-b-1',
          outboxEventId: 'outbox-b-1',
          tenantId: TENANT_B,
          dedupKey: `floor-alert:${TENANT_B}:${CLASS_1}:SURGE_90`,
        }),
      ),
    );

    // Tenant A check-in alert must continue working using existing { data: CheckinAlert } shape
    const checkinA = {
      eventId: 'chk-a-1',
      tenantId: TENANT_A,
      memberId: 'mem-1',
      memberName: 'Aarav Sharma',
      checkinTime: '2026-11-12T10:05:00.000Z',
      streakDays: 5,
      isTrialGuest: false,
      vipTag: false,
    };
    service.publishCheckin(checkinA);

    expect(receivedA).toEqual([{ data: checkinA }]);
    expect(receivedB).toHaveLength(1);
    expect(receivedB[0]).toMatchObject({
      id: 'outbox-b-1',
      type: 'floor.capacity.alert',
      data: { tenantId: TENANT_B },
    });

    subA.unsubscribe();
    subB.unsubscribe();
  });

  it('handles Redis reconnect cycles by re-subscribing to front-desk:alerts:*', async () => {
    expect(fakeSub.psubscribe).toHaveBeenCalledTimes(1);

    fakeSub.emitEvent('reconnecting', 250);
    fakeSub.emitEvent('ready');

    await Promise.resolve();
    expect(fakeSub.psubscribe).toHaveBeenCalledTimes(2);
  });

  it('tears down the dedicated Redis subscriber cleanly during module destruction', async () => {
    const completed = jest.fn();
    const subA = service.getEventStream(TENANT_A).subscribe({ complete: completed });

    await service.onModuleDestroy();

    expect(fakeSub.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(fakeSub.punsubscribe).toHaveBeenCalledWith(FLOOR_ALERT_CHANNEL_PATTERN);
    expect(fakeSub.quit).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledTimes(1);

    subA.unsubscribe();
  });

  it('resolves existing REDIS_CLIENT provider via Nest TestingModule alongside EmployeeWorkspacesModule pattern', async () => {
    const mockDup = makeFakeSubscriber();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FrontDeskStreamService,
        { provide: PrismaService, useValue: { withTenant: jest.fn() } },
        {
          provide: 'REDIS_CLIENT',
          useValue: { getClient: () => ({ duplicate: () => mockDup }) },
        },
      ],
    }).compile();

    const resolved = moduleRef.get(FrontDeskStreamService);
    await resolved.onModuleInit();
    expect(mockDup.psubscribe).toHaveBeenCalledWith(FLOOR_ALERT_CHANNEL_PATTERN);
    await moduleRef.close();
  });

  it('rejects invalid tenant IDs for SSE subscriptions, check-in broadcasts, and enrichment queries', async () => {
    expect(() => service.getEventStream('')).toThrow(/canonical tenant UUID/i);
    expect(() => service.getEventStream('tenant-a')).toThrow(
      /canonical tenant UUID/i,
    );

    const receivedA: FrontDeskSseEvent[] = [];
    const subA = service.getEventStream(TENANT_A).subscribe((ev) => receivedA.push(ev));

    // Invalid check-in tenantId must not emit to any subscriber
    service.publishCheckin({
      eventId: 'chk-bad',
      tenantId: 'invalid-tenant',
      memberId: 'mem-1',
      memberName: 'Invalid Tenant Guest',
      checkinTime: '2026-11-12T10:00:00.000Z',
      streakDays: 0,
      isTrialGuest: false,
      vipTag: false,
    });
    expect(receivedA).toHaveLength(0);

    // Valid tenant receives its own valid Redis event while remaining isolated
    fakeSub.emitEvent(
      'pmessage',
      FLOOR_ALERT_CHANNEL_PATTERN,
      `${FLOOR_ALERT_CHANNEL_PREFIX}${TENANT_A}`,
      JSON.stringify(makeFloorPayload({ tenantId: TENANT_A })),
    );
    expect(receivedA).toHaveLength(1);
    expect((receivedA[0].data as any).tenantId).toBe(TENANT_A);

    await expect(
      service.buildCheckinAlert('not-a-uuid', 'mem-1'),
    ).rejects.toThrow(/canonical tenant UUID/i);

    subA.unsubscribe();
  });
});
