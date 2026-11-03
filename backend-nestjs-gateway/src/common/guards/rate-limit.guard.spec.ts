import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard availability policy', () => {
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        route: { path: '/api/v1/auth/login' },
        tenantId: 'tenant-1',
        ip: '192.0.2.1',
      }),
    }),
  } as any;

  function failingRedis() {
    return {
      multi: () => ({
        zremrangebyscore() { return this; },
        zcard() { return this; },
        zadd() { return this; },
        expire() { return this; },
        exec: async () => { throw new Error('Redis unavailable'); },
      }),
    } as any;
  }

  it('fails closed outside development when Redis is unavailable', async () => {
    const guard = new RateLimitGuard(
      failingRedis(),
      { get: () => 'production' } as unknown as ConfigService,
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails open only in explicit development mode', async () => {
    const guard = new RateLimitGuard(
      failingRedis(),
      { get: () => 'development' } as unknown as ConfigService,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('preserves deliberate 429 responses', async () => {
    const redis = {
      multi: () => ({
        zremrangebyscore() { return this; },
        zcard() { return this; },
        zadd() { return this; },
        expire() { return this; },
        exec: async () => [null, [null, 10]],
      }),
      ttl: async () => 30,
    } as any;
    const guard = new RateLimitGuard(redis, { get: () => 'production' } as unknown as ConfigService);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
  });
});
