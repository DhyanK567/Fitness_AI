import { jest } from '@jest/globals';
import { LoginRateLimitGuard } from './login-rate-limit.guard';

describe('LoginRateLimitGuard', () => {
  const request = { tenantId: '123e4567-e89b-42d3-a456-426614174000', ip: '127.0.0.1', headers: {}, socket: {} } as any;
  const context: any = { switchToHttp: () => ({ getRequest: () => request }) };

  it('uses the shared tenant/IP counter result across guard instances and rejects attempt eleven', async () => {
    let hitCount = 0;
    const queryRaw = jest.fn(async () => [{ hit_count: Math.min(++hitCount, 11) }]);
    const prisma = {
      withTenant: jest.fn((_tenant: string, work: (tx: any) => Promise<unknown>) => work({
        $executeRaw: jest.fn(async () => 0),
        $queryRaw: queryRaw,
      })),
    } as any;
    const config = { get: () => 'h'.repeat(32) } as any;
    const firstInstance = new LoginRateLimitGuard(prisma, config);
    const secondInstance = new LoginRateLimitGuard(prisma, config);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(await (attempt % 2 ? firstInstance : secondInstance).canActivate(context)).toBe(true);
    }
    await expect(firstInstance.canActivate(context)).rejects.toThrow('Too many login attempts');
    expect(queryRaw).toHaveBeenCalledTimes(11);
    expect(prisma.withTenant).toHaveBeenCalledTimes(11);
  });

  it('fails closed if shared throttling storage is unavailable', async () => {
    const prisma = { withTenant: jest.fn(async () => { throw new Error('database unavailable'); }) } as any;
    const guard = new LoginRateLimitGuard(prisma, { get: () => 'h'.repeat(32) } as any);
    await expect(guard.canActivate(context)).rejects.toThrow('Request throttling is unavailable');
  });
});
