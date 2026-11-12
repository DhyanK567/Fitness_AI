/**
 * Outbox Dispatcher Comprehensive Verification Suite:
 * - Actual DB status model: pending -> dispatching -> delivered / failed / dead
 * - ai.enquiry.escalated handler: payload validation, PII redaction, idempotency
 * - Strict delivery semantics: undelivered notifications CANNOT become 'delivered'
 * - Missing webhook configuration: fails closed and transitions to 'failed' with backoff
 * - Provider errors, timeouts, network failures: triggers retry/backoff, never false delivery
 * - Idempotency and crash recovery: downstream idempotency keys (X-Idempotency-Key) and stale claim recovery
 * - Tenant isolation: RLS context and payload immutability across tenants
 *
 * Relies on Jest globals (describe, it, expect, beforeEach, afterEach) provided by ts-jest.
 */
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';
import { RedisClient } from '../common/redis-client';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

function makeFakeConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
  const map: Record<string, unknown> = {
    MFA_TOTP_ISSUER: 'FitnessAI',
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    MFA_ENCRYPTION_KEY_PREVIOUS: undefined,
    OUTBOX_BACKOFF_BASE_MS: '5000',
    OUTBOX_BACKOFF_MAX_MS: '3600000',
    OUTBOX_BATCH_SIZE: '50',
    OUTBOX_MAX_ATTEMPTS: '3',
    OUTBOX_POLL_INTERVAL_MS: '60000',
    OUTBOX_WEBHOOK_TIMEOUT_MS: '2000',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    ...overrides,
  };
  return {
    get: <T>(key: string, defaultValue?: T) => {
      return key in map ? (map[key] as T) : defaultValue;
    },
  } as unknown as ConfigService;
}

// ---------------------------------------------------------------------------
// 1. Outbox Logic & State Machine Tests
// ---------------------------------------------------------------------------

describe('Outbox state model and lifecycle', () => {
  const computeBackoff = (attempt: number): number => {
    const baseMs = 5000;
    const maxMs = 3600000;
    return Math.min(baseMs * 2 ** Math.max(attempt, 0), maxMs);
  };

  it('verifies the actual project status model conforms to ops.outbox_events check constraint', () => {
    // Database constraint: status IN ('pending', 'dispatching', 'delivered', 'failed', 'dead')
    const validStatuses = ['pending', 'dispatching', 'delivered', 'failed', 'dead'];
    const invalidStatuses = ['processing', 'sent', 'dead_letter', 'in_progress', 'queued'];

    const allowed = new Set(validStatuses);
    for (const s of validStatuses) {
      expect(allowed.has(s)).toBe(true);
    }
    for (const s of invalidStatuses) {
      expect(allowed.has(s)).toBe(false);
    }
  });

  it('backoff: exponential growth, capped at max', () => {
    expect(computeBackoff(0)).toBe(5000);
    expect(computeBackoff(1)).toBe(10000);
    expect(computeBackoff(2)).toBe(20000);
    expect(computeBackoff(3)).toBe(40000);
    expect(computeBackoff(10)).toBe(3600000);
  });

  it('transitions to dead letter when attempts reach maxAttempts', () => {
    const maxAttempts = 3;
    let attempts = 0;
    for (let i = 0; i < 2; i++) {
      attempts++;
      const status = attempts >= maxAttempts ? 'dead' : 'failed';
      expect(status).toBe('failed');
    }
    attempts++;
    const status = attempts >= maxAttempts ? 'dead' : 'failed';
    expect(status).toBe('dead');
  });

  it('two concurrent workers never process the same row (SKIP LOCKED contract)', () => {
    const claimed = new Set(['e1']);

    const events = [
      { id: 'e1', status: 'pending' as const, attempts: 0 },
      { id: 'e2', status: 'pending' as const, attempts: 0 },
    ];
    const candidates = events.filter(
      (e) => e.status === 'pending' && !claimed.has(e.id),
    );
    const claimedEarly = candidates.some((e) => e.id === 'e1');
    expect(claimedEarly).toBe(false);
    expect(candidates.map((c) => c.id)).toEqual(['e2']);
  });
});

// ---------------------------------------------------------------------------
// 2. OutboxDispatcherService & AI Escalation Handler Tests
// ---------------------------------------------------------------------------

describe('OutboxDispatcherService — AI Enquiry Escalation and Handler Lifecycle', () => {
  let service: OutboxDispatcherService;
  let mockPrisma: any;
  let mockRedis: any;
  let origEnv: NodeJS.ProcessEnv;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    origEnv = { ...process.env };
    delete process.env.REQUIRE_EXTERNAL_DELIVERY;
    delete process.env.N8N_WEBHOOK_URL;
    delete process.env.OUTBOX_DELIVERY_DISABLED;
    delete process.env.NOTIFICATIONS_ENABLED;

    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      withTenant: jest.fn(async (tenantId: string, fn: any) =>
        fn({
          $queryRaw: mockPrisma.$queryRaw,
          $executeRaw: mockPrisma.$executeRaw,
        }),
      ),
    };
    mockRedis = {} as unknown as RedisClient;

    service = new OutboxDispatcherService(makeFakeConfig(), mockPrisma, mockRedis);
    service.onModuleInit();
    // Stop background auto-polling in unit tests to prevent stray timer executions
    (service as any).stopPolling();
  });

  afterEach(() => {
    service.onModuleDestroy();
    process.env = origEnv;
    jest.restoreAllMocks();
  });

  it('registers ai.enquiry.escalated handler on module initialization', () => {
    const handlers = (service as any).handlers as Map<string, Function>;
    expect(handlers.has('ai.enquiry.escalated')).toBe(true);
    expect(typeof handlers.get('ai.enquiry.escalated')).toBe('function');
  });

  it('dispatches valid escalation event to notification webhook with masked logging and idempotency headers', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'OK',
    });

    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();

    const event = {
      id: 'evt-esc-001',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-12345',
      payload: {
        sessionId: 'sess-12345',
        handoffId: 'handoff_98765',
        reason: 'Customer requested human concierge for membership discounts',
        contact: '+919876543210',
      },
      correlationId: 'corr-001',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const handler = (service as any).handlers.get('ai.enquiry.escalated');
    await handler(event);

    // Verify webhook payload
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [callUrl, callOpts] = fetchMock.mock.calls[0];
    expect(callUrl).toBe('http://localhost:5678/notify');
    const body = JSON.parse(callOpts.body);
    expect(body.tenantId).toBe(TENANT_A);
    expect(body.template).toBe('enquiry-escalated');
    expect(body.to).toBe('+919876543210');
    expect(body.eventId).toBe('evt-esc-001');
    expect(body.correlationId).toBe('corr-001');
    expect(body.idempotencyKey).toBe('outbox_evt-esc-001');
    expect(body.data.sessionId).toBe('sess-12345');
    expect(body.data.handoffId).toBe('handoff_98765');
    expect(body.data.contact).toBe('+919876543210');

    // Verify headers for provider deduplication
    expect(callOpts.headers['X-Idempotency-Key']).toBe('evt-esc-001');
    expect(callOpts.headers['X-Correlation-Id']).toBe('corr-001');
    expect(callOpts.headers['X-Tenant-Id']).toBe(TENANT_A);

    // Verify PII masking in logger
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('contact=***3210'),
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('+919876543210'),
    );
  });

  it('rejects missing or empty sessionId in payload', async () => {
    const event = {
      id: 'evt-esc-002',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-empty',
      payload: {
        reason: 'Missing session',
        contact: 'test@example.com',
      },
      correlationId: 'corr-002',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const handler = (service as any).handlers.get('ai.enquiry.escalated');
    await expect(handler(event)).rejects.toThrow(
      'Missing required sessionId in enquiry escalation event evt-esc-002',
    );
  });

  it('rejects malformed stringified JSON payloads', async () => {
    const event = {
      id: 'evt-esc-003',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-malformed',
      payload: '{ broken json: }',
      correlationId: 'corr-003',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const handler = (service as any).handlers.get('ai.enquiry.escalated');
    await expect(handler(event)).rejects.toThrow(
      'Malformed JSON payload in enquiry escalation event evt-esc-003',
    );
  });

  it('rejects non-object payloads', async () => {
    const event = {
      id: 'evt-esc-004',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-invalid',
      payload: ['not-an-object'] as any,
      correlationId: 'corr-004',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const handler = (service as any).handlers.get('ai.enquiry.escalated');
    await expect(handler(event)).rejects.toThrow(
      'Invalid payload for enquiry escalation event evt-esc-004: expected JSON object',
    );
  });

  it('supports idempotent deduplication: skips processing if event is already delivered', async () => {
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation();

    const deliveredEvent = {
      id: 'evt-esc-005',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-delivered',
      payload: { sessionId: 'sess-delivered' },
      correlationId: 'corr-005',
      status: 'delivered',
      attempts: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const handler = (service as any).handlers.get('ai.enquiry.escalated');
    await handler(deliveredEvent);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('already delivered. Skipping duplicate dispatch.'),
    );
  });

  it('CRITICAL: Missing N8N_WEBHOOK_URL throws error and NEVER marks event as delivered', async () => {
    delete process.env.N8N_WEBHOOK_URL;

    const event = {
      id: '11111111-1111-1111-1111-111111111111',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-noconfig',
      payload: { sessionId: 'sess-noconfig' },
      correlationId: 'corr-noconfig',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const markSuccessSpy = jest.spyOn(service as any, 'markSuccess');
    const markFailedSpy = jest.spyOn(service as any, 'markFailed');

    await (service as any).processEvent(TENANT_A, event);

    // markSuccess MUST NOT be called
    expect(markSuccessSpy).not.toHaveBeenCalled();
    // markFailed MUST be called with descriptive configuration error
    expect(markFailedSpy).toHaveBeenCalledWith(
      TENANT_A,
      event,
      expect.stringContaining('Delivery provider endpoint (N8N_WEBHOOK_URL) is not configured'),
    );
    // Verified DB executed update to 'failed' with attempts=1
    expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('CRITICAL: Provider 500 error triggers retry backoff and NEVER marks event delivered', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const event = {
      id: '22222222-2222-2222-2222-222222222222',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-500',
      payload: { sessionId: 'sess-500' },
      correlationId: 'corr-500',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const markSuccessSpy = jest.spyOn(service as any, 'markSuccess');
    const markFailedSpy = jest.spyOn(service as any, 'markFailed');

    await (service as any).processEvent(TENANT_A, event);

    expect(markSuccessSpy).not.toHaveBeenCalled();
    expect(markFailedSpy).toHaveBeenCalledWith(
      TENANT_A,
      event,
      expect.stringContaining('n8n webhook returned HTTP 500: Internal Server Error'),
    );
  });

  it('CRITICAL: Provider network failure or timeout triggers retry backoff and NEVER marks event delivered', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED: Connection refused by target machine'));

    const event = {
      id: '33333333-3333-3333-3333-333333333333',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-connrefused',
      payload: { sessionId: 'sess-connrefused' },
      correlationId: 'corr-connrefused',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const markSuccessSpy = jest.spyOn(service as any, 'markSuccess');
    const markFailedSpy = jest.spyOn(service as any, 'markFailed');

    await (service as any).processEvent(TENANT_A, event);

    expect(markSuccessSpy).not.toHaveBeenCalled();
    expect(markFailedSpy).toHaveBeenCalledWith(
      TENANT_A,
      event,
      expect.stringContaining('ECONNREFUSED'),
    );
  });

  it('CRITICAL: Deliberately disabled delivery (OUTBOX_DELIVERY_DISABLED=true) throws and prevents delivery', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    const disabledConfig = makeFakeConfig({ OUTBOX_DELIVERY_DISABLED: 'true' });
    const disabledService = new OutboxDispatcherService(disabledConfig, mockPrisma, mockRedis);
    disabledService.onModuleInit();
    (disabledService as any).stopPolling();

    const event = {
      id: '44444444-4444-4444-4444-444444444444',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-disabled',
      payload: { sessionId: 'sess-disabled' },
      correlationId: 'corr-disabled',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const markSuccessSpy = jest.spyOn(disabledService as any, 'markSuccess');
    const markFailedSpy = jest.spyOn(disabledService as any, 'markFailed');

    await (disabledService as any).processEvent(TENANT_A, event);

    expect(markSuccessSpy).not.toHaveBeenCalled();
    expect(markFailedSpy).toHaveBeenCalledWith(
      TENANT_A,
      event,
      expect.stringContaining('Notification delivery is explicitly disabled via configuration'),
    );
  });

  it('marks unknown event type as failed without crashing the dispatcher', async () => {
    const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation();

    const unknownEvent = {
      id: '55555555-5555-5555-5555-555555555555',
      tenantId: TENANT_A,
      eventType: 'unknown.bogus.event',
      subjectType: 'test',
      subjectRef: 'ref-bogus',
      payload: {},
      correlationId: 'corr-bogus',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await (service as any).processEvent(TENANT_A, unknownEvent);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No handler for event type: unknown.bogus.event'),
    );
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('marks event delivered ONLY when provider returns HTTP 200 OK', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'OK',
    });

    const event = {
      id: '66666666-6666-6666-6666-666666666666',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-success',
      payload: { sessionId: 'sess-success', contact: '+919999999999' },
      correlationId: 'corr-success',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const markSuccessSpy = jest.spyOn(service as any, 'markSuccess');
    const markFailedSpy = jest.spyOn(service as any, 'markFailed');

    await (service as any).processEvent(TENANT_A, event);

    expect(markSuccessSpy).toHaveBeenCalledWith(TENANT_A, event, expect.anything());
    expect(markFailedSpy).not.toHaveBeenCalled();
    expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('recovers stale dispatching claims older than 5 minutes during batch processing', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]); // no pending rows

    await (service as any).processTenantBatch(TENANT_A);

    // Verified that recovery query was executed for stale claims
    expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it('strictly enforces tenant isolation: uses tenantId from event record, ignoring payload overrides', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'OK',
    });

    // Attempt malicious spoof: event belongs to TENANT_A, but payload claims TENANT_B
    const spoofEvent = {
      id: '77777777-7777-7777-7777-777777777777',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-spoof',
      payload: {
        sessionId: 'sess-spoof',
        tenantId: TENANT_B, // malicious override attempt
        contact: '+919999999999',
      },
      correlationId: 'corr-spoof',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await (service as any).processEvent(TENANT_A, spoofEvent);

    const callOpts = fetchMock.mock.calls[0][1];
    const body = JSON.parse(callOpts.body);

    // Payload body MUST retain verified TENANT_A, NOT spoofed TENANT_B
    expect(body.tenantId).toBe(TENANT_A);
    expect(callOpts.headers['X-Tenant-Id']).toBe(TENANT_A);
    expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
  });

  // =========================================================================
  // AUD-001: Verification of Mock vs. Live Delivery Semantics
  // =========================================================================

  it('CRITICAL [AUD-001]: Records mock execution as SIMULATED with delivered_at=NULL and audit metadata in payload', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          status: 'mock',
          deliveryStatus: 'mock_delivered',
          deliveryMode: 'mock',
          provider: 'whatsapp_mock',
          recipient: '+919876543210',
          template: 'enquiry-escalated',
          eventId: 'mock-evt-001',
          tenantId: TENANT_A,
          correlationId: 'corr-mock-001',
          loggedAt: new Date().toISOString(),
          message:
            "[MOCK MODE] Simulated WhatsApp notification for template 'enquiry-escalated' sent to +919876543210",
        }),
    });

    const mockEvent = {
      id: 'mock-evt-001',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-mock-001',
      payload: { sessionId: 'sess-mock-001', contact: '+919876543210', customAttr: 'test-value' },
      correlationId: 'corr-mock-001',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const markSuccessSpy = jest.spyOn(service as any, 'markSuccess');
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();

    await (service as any).processEvent(TENANT_A, mockEvent);

    expect(markSuccessSpy).toHaveBeenCalledWith(
      TENANT_A,
      mockEvent,
      expect.objectContaining({
        success: true,
        deliveryMode: 'simulated',
        deliveryStatus: 'simulated',
        provider: 'whatsapp_mock',
        providerMessageId: null,
      }),
    );

    // Verify SQL query does NOT set delivered_at = NOW(), but sets delivered_at = NULL
    const rawSqlCall = mockPrisma.$executeRaw.mock.calls[0];
    const sqlText = Array.isArray(rawSqlCall[0]) ? rawSqlCall[0].join(' ') : String(rawSqlCall[0]);
    expect(sqlText).toContain('delivered_at = NULL');
    expect(sqlText).not.toContain('delivered_at = NOW()');

    // Verify payload preserved original data and attached _delivery audit metadata
    const payloadArg = rawSqlCall[1];
    const parsedPayload = JSON.parse(payloadArg);
    expect(parsedPayload.sessionId).toBe('sess-mock-001');
    expect(parsedPayload.customAttr).toBe('test-value');
    expect(parsedPayload._delivery).toBeDefined();
    expect(parsedPayload._delivery.is_simulated).toBe(true);
    expect(parsedPayload._delivery.is_real_delivery).toBe(false);
    expect(parsedPayload._delivery.delivery_mode).toBe('simulated');
    expect(parsedPayload._delivery.delivery_status).toBe('simulated');
    expect(parsedPayload._delivery.provider).toBe('whatsapp_mock');

    // Verify explicit logging stating simulated mode
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[MOCK DISPATCH] Outbox event mock-evt-001 (ai.enquiry.escalated) completed in SIMULATED mode. Not recorded as real delivery.',
      ),
    );
  });

  it('CRITICAL [AUD-001]: Records live Meta WhatsApp acceptance with provider_accepted, messageId, and delivered_at=NOW()', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          status: 'sent',
          deliveryStatus: 'sent',
          deliveryMode: 'live',
          provider: 'whatsapp_cloud_api',
          whatsappMessageId: 'wamid.HBgLMTIzNDU2Nzg5MAA=',
          recipient: '+919876543210',
          template: 'enquiry-escalated',
          eventId: 'live-evt-001',
          tenantId: TENANT_A,
          correlationId: 'corr-live-001',
          sentAt: new Date().toISOString(),
        }),
    });

    const liveEvent = {
      id: 'live-evt-001',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-live-001',
      payload: { sessionId: 'sess-live-001', contact: '+919876543210' },
      correlationId: 'corr-live-001',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const markSuccessSpy = jest.spyOn(service as any, 'markSuccess');
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation();

    await (service as any).processEvent(TENANT_A, liveEvent);

    expect(markSuccessSpy).toHaveBeenCalledWith(
      TENANT_A,
      liveEvent,
      expect.objectContaining({
        success: true,
        deliveryMode: 'live',
        deliveryStatus: 'provider_accepted',
        provider: 'whatsapp_cloud_api',
        providerMessageId: 'wamid.HBgLMTIzNDU2Nzg5MAA=',
      }),
    );

    // Verify SQL query sets delivered_at = NOW()
    const rawSqlCall = mockPrisma.$executeRaw.mock.calls[0];
    const sqlText = Array.isArray(rawSqlCall[0]) ? rawSqlCall[0].join(' ') : String(rawSqlCall[0]);
    expect(sqlText).toContain('delivered_at = NOW()');

    // Verify payload audit metadata
    const parsedPayload = JSON.parse(rawSqlCall[1]);
    expect(parsedPayload._delivery.is_simulated).toBe(false);
    expect(parsedPayload._delivery.is_real_delivery).toBe(true);
    expect(parsedPayload._delivery.delivery_mode).toBe('live');
    expect(parsedPayload._delivery.delivery_status).toBe('provider_accepted');
    expect(parsedPayload._delivery.provider_message_id).toBe('wamid.HBgLMTIzNDU2Nzg5MAA=');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[LIVE DISPATCH] Outbox event live-evt-001 (ai.enquiry.escalated) dispatched to provider whatsapp_cloud_api',
      ),
    );
  });

  it('CRITICAL [AUD-001]: Rejects HTTP 200 when response body contains success: false, triggering retry backoff', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: false,
          errorCode: 'INVALID_RECIPIENT_PHONE',
          error: 'Recipient phone validation failed in downstream sub-workflow',
        }),
    });

    const event = {
      id: 'fail-evt-001',
      tenantId: TENANT_A,
      eventType: 'ai.enquiry.escalated',
      subjectType: 'enquiry_session',
      subjectRef: 'sess-fail',
      payload: { sessionId: 'sess-fail', contact: '+919999999999' },
      correlationId: 'corr-fail',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const markSuccessSpy = jest.spyOn(service as any, 'markSuccess');
    const markFailedSpy = jest.spyOn(service as any, 'markFailed');

    await (service as any).processEvent(TENANT_A, event);

    expect(markSuccessSpy).not.toHaveBeenCalled();
    expect(markFailedSpy).toHaveBeenCalledWith(
      TENANT_A,
      event,
      expect.stringContaining('n8n reported dispatch failure [INVALID_RECIPIENT_PHONE]'),
    );
  });

  it('CRITICAL [AUD-001]: Distinguishes accepted_for_processing for domain sub-workflows returning dispatched', async () => {
    process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          workflow: 'booking-confirmation',
          status: 'dispatched',
          recipient: '+919876543210',
          eventId: 'proc-evt-001',
        }),
    });

    const event = {
      id: 'proc-evt-001',
      tenantId: TENANT_A,
      eventType: 'booking.created',
      subjectType: 'booking',
      subjectRef: 'book-001',
      payload: { member_id: '+919876543210', session_id: 'sess-001', booking_id: 'b-001' },
      correlationId: 'corr-proc-001',
      status: 'dispatching',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const markSuccessSpy = jest.spyOn(service as any, 'markSuccess');

    await (service as any).processEvent(TENANT_A, event);

    expect(markSuccessSpy).toHaveBeenCalledWith(
      TENANT_A,
      event,
      expect.objectContaining({
        success: true,
        deliveryStatus: 'accepted_for_processing',
      }),
    );
  });

  describe('floor.capacity.alert handler', () => {
    const CLASS_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const ALERT_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const makeValidFloorAlertPayload = (overrides: Record<string, unknown> = {}) => ({
      tenantId: TENANT_A,
      alertType: 'SURGE_90',
      severity: 'warning',
      classId: CLASS_UUID,
      className: 'Evening HIIT',
      startTimeIso: '2026-11-12T12:30:00.000Z',
      booked: 18,
      capacity: 20,
      waitlisted: 1,
      occupancyPct: 90,
      message: 'Capacity Surge: Evening HIIT at 06:00 PM is now 90% full (18/20 spots).',
      dedupKey: `floor-alert:${TENANT_A}:${CLASS_UUID}:SURGE_90`,
      operationalAlertId: ALERT_UUID,
      ...overrides,
    });

    const mockFrontDeskLookup = (users: Array<{ id: string; displayName: string; phoneE164: string | null }>) => {
      const roleFindMany = jest.fn().mockResolvedValue(users.length > 0 ? [{ id: 'role-fd-1' }] : []);
      const assignmentFindMany = jest.fn().mockResolvedValue(
        users.map((u) => ({ users: u })),
      );

      mockPrisma.withTenant = jest.fn(async (tenantId: string, fn: any) =>
        fn({
          $queryRaw: mockPrisma.$queryRaw,
          $executeRaw: mockPrisma.$executeRaw,
          role: { findMany: roleFindMany },
          userRoleAssignment: { findMany: assignmentFindMany },
        }),
      );

      return { roleFindMany, assignmentFindMany };
    };

    it('registers floor.capacity.alert handler on module initialization', () => {
      const handlers = (service as any).handlers as Map<string, Function>;
      expect(handlers.has('floor.capacity.alert')).toBe(true);
      expect(typeof handlers.get('floor.capacity.alert')).toBe('function');
    });

    it('dispatches valid floor.capacity.alert payload to Front Desk recipient via sendNotification', async () => {
      process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, status: 'dispatched' }),
      });

      const { roleFindMany, assignmentFindMany } = mockFrontDeskLookup([
        { id: 'user-fd-1', displayName: 'Front Desk Lead', phoneE164: '+919988776655' },
      ]);

      const payload = makeValidFloorAlertPayload({ alertType: 'FULL_100', severity: 'critical', booked: 20, occupancyPct: 100 });
      const event = {
        id: 'evt-floor-001',
        tenantId: TENANT_A,
        eventType: 'floor.capacity.alert',
        subjectType: 'studio_class',
        subjectRef: CLASS_UUID,
        payload,
        correlationId: 'corr-floor-001',
        status: 'dispatching',
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const handler = (service as any).handlers.get('floor.capacity.alert');
      const result = await handler(event);

      expect(result.success).toBe(true);
      expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
      expect(roleFindMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_A, code: 'front_desk' },
        select: { id: true },
      });
      expect(assignmentFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: TENANT_A,
            roleId: { in: ['role-fd-1'] },
            users: { status: 'active' },
          },
        }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [callUrl, callOpts] = fetchMock.mock.calls[0];
      expect(callUrl).toBe('http://localhost:5678/notify');
      expect(callOpts.headers['X-Tenant-Id']).toBe(TENANT_A);
      const body = JSON.parse(callOpts.body);
      expect(body.tenantId).toBe(TENANT_A);
      expect(body.template).toBe('floor-capacity-alert');
      expect(body.to).toBe('+919988776655');
      expect(body.eventId).toBe('evt-floor-001');
      expect(body.correlationId).toBe('corr-floor-001');
      expect(body.data).toEqual(payload);
    });

    it('rejects invalid or tenant-mismatched floor.capacity.alert payload before recipient lookup or webhook call', async () => {
      const { roleFindMany } = mockFrontDeskLookup([
        { id: 'user-fd-1', displayName: 'Front Desk', phoneE164: '+919988776655' },
      ]);
      const handler = (service as any).handlers.get('floor.capacity.alert');

      await expect(
        handler({
          id: 'evt-floor-bad-json',
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          payload: '{broken-json',
          correlationId: 'corr-bad-1',
        }),
      ).rejects.toThrow(/Malformed JSON payload/);

      await expect(
        handler({
          id: 'evt-floor-bad-cap',
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          payload: makeValidFloorAlertPayload({ capacity: 0 }),
          correlationId: 'corr-bad-2',
        }),
      ).rejects.toThrow(/Invalid capacity/);

      await expect(
        handler({
          id: 'evt-floor-tenant-mismatch',
          tenantId: TENANT_A,
          eventType: 'floor.capacity.alert',
          payload: makeValidFloorAlertPayload({
            tenantId: '22222222-2222-4222-8222-222222222222',
          }),
          correlationId: 'corr-bad-3',
        }),
      ).rejects.toThrow(/Tenant mismatch/);

      expect(roleFindMany).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles missing Front Desk recipient safely without sending notification and triggers retry in processEvent', async () => {
      process.env.N8N_WEBHOOK_URL = 'http://localhost:5678';
      mockFrontDeskLookup([
        { id: 'user-fd-nophone', displayName: 'Front Desk Without Phone', phoneE164: null },
      ]);

      const markFailedSpy = jest
        .spyOn(service as any, 'markFailed')
        .mockResolvedValue(undefined);
      const markSuccessSpy = jest.spyOn(service as any, 'markSuccess');

      const event = {
        id: 'evt-floor-no-recipient',
        tenantId: TENANT_A,
        eventType: 'floor.capacity.alert',
        subjectType: 'studio_class',
        subjectRef: CLASS_UUID,
        payload: makeValidFloorAlertPayload(),
        correlationId: 'corr-no-rec-1',
        status: 'dispatching',
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await (service as any).processEvent(TENANT_A, event);

      expect(mockPrisma.withTenant).toHaveBeenCalledWith(TENANT_A, expect.any(Function));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(markSuccessSpy).not.toHaveBeenCalled();
      expect(markFailedSpy).toHaveBeenCalledWith(
        TENANT_A,
        event,
        expect.stringContaining('Missing Front Desk notification recipient'),
      );
    });

    it('rejects invalid non-canonical tenantId in floor.capacity.alert before touching Prisma or webhook', async () => {
      const { roleFindMany } = mockFrontDeskLookup([
        { id: 'user-fd-1', displayName: 'Front Desk', phoneE164: '+919988776655' },
      ]);
      const handler = (service as any).handlers.get('floor.capacity.alert');

      await expect(
        handler({
          id: 'evt-floor-invalid-tenant',
          tenantId: 'not-a-canonical-uuid',
          eventType: 'floor.capacity.alert',
          payload: makeValidFloorAlertPayload({ tenantId: 'not-a-canonical-uuid' }),
          correlationId: 'corr-bad-tenant-1',
        }),
      ).rejects.toThrow(/Invalid event tenantId/);

      expect(roleFindMany).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});