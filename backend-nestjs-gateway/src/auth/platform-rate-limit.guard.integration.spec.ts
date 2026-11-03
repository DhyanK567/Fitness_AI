import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { PlatformRateLimitGuard } from './platform-rate-limit.guard';
import { PrismaService } from '../common/prisma.service';
import { ConfigService } from '@nestjs/config';

const describeWithTestDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithTestDatabase('PlatformRateLimitGuard (integration against disposable test DB)', () => {
  let guard: PlatformRateLimitGuard;
  let prisma: PrismaService;
  let config: ConfigService;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'OTP_HASH_SECRET') return 'test-integration-secret';
        if (key === 'TRUST_PROXY_HOPS') return undefined;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformRateLimitGuard,
        PrismaService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<PlatformRateLimitGuard>(PlatformRateLimitGuard);
    prisma = module.get<PrismaService>(PrismaService);
    config = module.get<ConfigService>(ConfigService);
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM platform.rate_limit_buckets WHERE scope = 'register_studio'`;
    await prisma.$disconnect();
  });

  const createMockRequest = (overrides: Record<string, any> = {}) => ({
    headers: { 'x-forwarded-for': undefined },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    body: {},
    ...overrides,
  });

  it('allows request when under IP limit (real DB)', async () => {
    const mockRequest = createMockRequest({
      ip: '10.0.0.1',
      body: {}
    });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
  });

  it('returns 429 on 6th request from same IP (real DB)', async () => {
    const mockRequest = createMockRequest({
      ip: '10.0.0.2',
      body: {}
    });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    for (let i = 0; i < 5; i++) {
      await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    }

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(mockExecutionContext);
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((e as HttpException).getResponse()).toMatchObject({
        errorCode: 'RATE_LIMITED',
        message: expect.stringContaining('Too many requests'),
      });
    }
  });

  it('returns 429 on 4th request for same email (real DB)', async () => {
    const mockRequest = createMockRequest({
      ip: '10.0.0.3',
      body: { owner_email: 'test-email-1@example.com' }
    });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    for (let i = 0; i < 3; i++) {
      await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);
    }

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(HttpException);
    try {
      await guard.canActivate(mockExecutionContext);
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('fails closed when table is unavailable (simulated by dropping grants)', async () => {
    const mockRequest = createMockRequest({
      ip: '10.0.0.4',
      body: { owner_email: 'test-unavailable@example.com' }
    });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    await prisma.$executeRawUnsafe(`ALTER TABLE platform.rate_limit_buckets RENAME TO rate_limit_buckets_temp`);

    try {
      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(ServiceUnavailableException);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE platform.rate_limit_buckets_temp RENAME TO rate_limit_buckets`);
    }
  });

  it('uses real client IP when no trusted proxy', async () => {
    const mockRequest = createMockRequest({ ip: '198.51.100.42' });
    const mockExecutionContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
    } as any;

    await expect(guard.canActivate(mockExecutionContext)).resolves.toBe(true);

    const buckets = await prisma.$queryRaw<Array<{ key_hash: string }>>`
      SELECT key_hash FROM platform.rate_limit_buckets
      WHERE scope = 'register_studio'
    `;
    expect(buckets.length).toBeGreaterThan(0);
  });
});
