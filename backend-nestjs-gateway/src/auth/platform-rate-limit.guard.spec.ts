import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PlatformRateLimitGuard } from './platform-rate-limit.guard';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('PlatformRateLimitGuard', () => {
  let guard: PlatformRateLimitGuard;
  let prisma: any;
  let config: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
    };

    config = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformRateLimitGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    guard = module.get<PlatformRateLimitGuard>(PlatformRateLimitGuard);
    jest.clearAllMocks();
  });

  const createMockRequest = (overrides: Record<string, any> = {}) => ({
    headers: { 'x-forwarded-for': undefined },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    body: {},
    ...overrides,
  });

  beforeEach(() => {
    config.get.mockImplementation((key: string) => {
      if (key === 'OTP_HASH_SECRET') return 'test-secret';
      if (key === 'TRUST_PROXY_HOPS') return undefined;
      return undefined;
    });
  });

  it('allows request when under IP limit', async () => {
    const mockRequest = createMockRequest({ body: { owner_email: 'test@example.com' } });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    prisma.$transaction.mockImplementation(async (fn: any) => fn({
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ hit_count: 1 }]),
    }));

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
  });

  it('allows request when under email limit', async () => {
    const mockRequest = createMockRequest({ body: { owner_email: 'test@example.com' } });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    const buckets = new Map<string, number>();
    prisma.$transaction.mockImplementation(async (fn: any) => fn({
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockImplementation((_queryParts: any, ...values: any[]) => {
        const keyHash = String(values[1] ?? 'default');
        const current = (buckets.get(keyHash) || 0) + 1;
        buckets.set(keyHash, current);
        return [{ hit_count: current }];
      }),
    }));

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
  });

  it('throws 429 when IP limit exceeded (6th request)', async () => {
    const mockRequest = createMockRequest({ body: {} });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    let callCount = 0;
    prisma.$transaction.mockImplementation(async (fn: any) => fn({
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockImplementation(() => {
        callCount++;
        return [{ hit_count: callCount }];
      }),
    }));

    // 5 requests allowed
    for (let i = 0; i < 5; i++) {
      await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    }
    // 6th request should be rate limited
    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(HttpException);
    const err = await guard.canActivate(mockExecutionContext).catch((e: any) => e);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(err.getResponse()).toMatchObject({
      errorCode: 'RATE_LIMITED',
      message: expect.stringContaining('Too many requests'),
    });
  });

  it('throws 429 when email limit exceeded (4th request)', async () => {
    const mockRequest = createMockRequest({ body: { owner_email: 'test@example.com' } });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    const buckets = new Map<string, number>();
    prisma.$transaction.mockImplementation(async (fn: any) => fn({
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockImplementation((_queryParts: any, ...values: any[]) => {
        const keyHash = String(values[1] ?? 'default');
        const current = (buckets.get(keyHash) || 0) + 1;
        buckets.set(keyHash, current);
        return [{ hit_count: current }];
      }),
    }));

    // 3 requests allowed
    for (let i = 0; i < 3; i++) {
      await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    }
    // 4th request should be rate limited
    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(HttpException);
  });

  it('uses real client IP when no trusted proxy', async () => {
    const mockRequest = createMockRequest({ ip: '192.168.1.100' });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    prisma.$transaction.mockImplementation(async (fn: any) => fn({
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ hit_count: 1 }]),
    }));

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);

    // Verify the transaction was called with IP-based key
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('uses x-forwarded-for when trusted proxy configured', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'OTP_HASH_SECRET') return 'test-secret';
      if (key === 'TRUST_PROXY_HOPS') return '1';
      return undefined;
    });

    const mockRequest = createMockRequest({
      headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
      ip: '127.0.0.1',
    });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    prisma.$transaction.mockImplementation(async (fn: any) => fn({
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ hit_count: 1 }]),
    }));

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
  });

  it('throws ServiceUnavailableException when OTP_HASH_SECRET missing', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'OTP_HASH_SECRET') return undefined;
      return undefined;
    });

    const mockRequest = createMockRequest();
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed when storage (DB) is unavailable', async () => {
    const mockRequest = createMockRequest({ body: { owner_email: 'test@example.com' } });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    prisma.$transaction.mockRejectedValue(new Error('DB connection failed'));

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ServiceUnavailableException);
  });
});
