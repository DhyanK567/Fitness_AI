import { ConfigService } from '@nestjs/config';
import { WebhookIngestDatabaseService } from './webhook-ingest-database.service';

describe('WebhookIngestDatabaseService', () => {
  let mockPrismaClient: any;
  let mockConfigService: any;
  let service: WebhookIngestDatabaseService;

  beforeEach(() => {
    mockPrismaClient = {
      $executeRaw: jest.fn(),
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'WEBHOOK_INGEST_DATABASE_URL') return 'postgresql://ingest_user:secret@localhost:5432/wellness_studio';
        return undefined;
      }),
    };

    service = new WebhookIngestDatabaseService(mockConfigService as ConfigService, mockPrismaClient);
  });

  it('records a new verified webhook event using parameterized INSERT with ON CONFLICT DO NOTHING', async () => {
    mockPrismaClient.$executeRaw.mockResolvedValue(1);

    const result = await service.recordEvent({
      provider: 'razorpay',
      providerEventId: 'evt_new_12345',
      eventType: 'subscription.charged',
      payload: { id: 'evt_new_12345', event: 'subscription.charged', amount: 5000 },
      rawBodySha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });

    expect(result).toEqual({
      inserted: true,
      duplicate: false,
      providerEventId: 'evt_new_12345',
    });
    expect(mockPrismaClient.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('reports duplicate when ON CONFLICT DO NOTHING affects 0 rows', async () => {
    mockPrismaClient.$executeRaw.mockResolvedValue(0);

    const result = await service.recordEvent({
      provider: 'razorpay',
      providerEventId: 'evt_existing_999',
      eventType: 'subscription.activated',
      payload: { id: 'evt_existing_999', event: 'subscription.activated' },
      rawBodySha256: 'a'.repeat(64),
    });

    expect(result).toEqual({
      inserted: false,
      duplicate: true,
      providerEventId: 'evt_existing_999',
    });
  });

  it('propagates database errors so that caller receives failure and upstream provider can retry', async () => {
    mockPrismaClient.$executeRaw.mockRejectedValue(new Error('Connection terminated unexpectedly'));

    await expect(
      service.recordEvent({
        provider: 'razorpay',
        providerEventId: 'evt_fail_1',
        eventType: 'subscription.halted',
        payload: { id: 'evt_fail_1', event: 'subscription.halted' },
        rawBodySha256: 'b'.repeat(64),
      }),
    ).rejects.toThrow('Connection terminated unexpectedly');
  });

  it('resolves database connection URL prioritizing WEBHOOK_INGEST_DATABASE_URL over DATABASE_URL', () => {
    const configMock = {
      get: jest.fn((key: string) => {
        if (key === 'WEBHOOK_INGEST_DATABASE_URL') return 'postgresql://ingest:pass@host/db';
        if (key === 'DATABASE_URL') return 'postgresql://app:pass@host/db';
        return undefined;
      }),
    } as any;

    const svc = new WebhookIngestDatabaseService(configMock, mockPrismaClient);
    expect(svc.getClient()).toBe(mockPrismaClient);
  });
});
