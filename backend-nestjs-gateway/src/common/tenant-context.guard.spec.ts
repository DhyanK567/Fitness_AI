import { UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { TenantContextGuard } from './tenant-context.guard';
import { signAccessToken, signPurposeToken } from './auth-token';

function contextFor(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

describe('TenantContextGuard', () => {
  const prisma = { tenant: { findUnique: jest.fn() } } as any;
  const guard = new TenantContextGuard(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('resolves a host tenant code to its canonical active UUID', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: '123e4567-e89b-42d3-a456-426614174000', status: 'active' });
    const request: any = { tenantCode: 'pilot-studio' };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.tenantId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { code: 'pilot-studio' }, select: { id: true, status: true } });
  });

  it('rejects requests without tenant context', async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(UnauthorizedException);
  });

  it('gives a verified bearer token tenant absolute precedence over a stale host tenant', async () => {
    const tokenTenantId = '123e4567-e89b-42d3-a456-426614174111';
    const token = signAccessToken({ sub: 'user-1', tenant: tokenTenantId, roles: ['trainer'], sid: 'session-1' }, 'tenant-test-secret');
    const localPrisma = {
      tenant: { findUnique: jest.fn(async ({ where }: any) => where.id === tokenTenantId ? { id: tokenTenantId, code: 'true-studio', status: 'active' } : null) },
    } as any;
    const localGuard = new TenantContextGuard(localPrisma, { get: () => 'tenant-test-secret' } as any);
    const request: any = { tenantCode: 'stale-studio', headers: { authorization: `Bearer ${token}`, host: 'localhost:3001' }, body: { email: 'someone@else.test' } };
    await expect(localGuard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.tenantId).toBe(tokenTenantId);
    expect(request.tenantCode).toBe('true-studio');
    expect(localPrisma.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('never falls back to a header tenant when a verified token tenant is inactive', async () => {
    const tokenTenantId = '123e4567-e89b-42d3-a456-426614174112';
    const token = signAccessToken({ sub: 'user-1', tenant: tokenTenantId, roles: ['trainer'], sid: 'session-1' }, 'tenant-test-secret');
    const localPrisma = {
      tenant: { findUnique: jest.fn(async () => ({ id: tokenTenantId, code: 'inactive-studio', status: 'suspended' })) },
    } as any;
    const localGuard = new TenantContextGuard(localPrisma, { get: () => 'tenant-test-secret' } as any);
    const request: any = { tenantCode: 'active-header-studio', headers: { authorization: `Bearer ${token}` }, body: {} };
    await expect(localGuard.canActivate(contextFor(request))).rejects.toThrow(UnauthorizedException);
    expect(request.tenantId).toBeUndefined();
    expect(localPrisma.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it('resolves a login email across active tenants only on a shared development host', async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const localPrisma = {
        tenant: { findUnique: jest.fn(async ({ where }: any) => where.id ? { id: where.id, code: 'resolved-studio', status: 'active' } : { id: 'stale-id', status: 'active' }) },
        user: {
          findFirst: jest.fn(async () => null),
          findMany: jest.fn(async () => [{ id: 'user-1', tenantId: 'true-id', status: 'active', lastLoginAt: null, updatedAt: new Date() }]),
        },
        userCredential: { findFirst: jest.fn() },
      } as any;
      const localGuard = new TenantContextGuard(localPrisma);
      const request: any = { path: '/auth/staff/login', tenantCode: 'pilot-studio', headers: { host: 'localhost:3001' }, body: { email: ' User@Studio.In ', password: 'secret' } };
      await expect(localGuard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.tenantId).toBe('true-id');
      expect(request.tenantCode).toBe('resolved-studio');
      expect(localPrisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'user@studio.in', userType: 'staff', status: 'active' } }));
    } finally { process.env.NODE_ENV = previousEnv; }
  });

  it('uses a signed MFA ticket tenant without trusting a hostname or email', async () => {
    const tenantId = '123e4567-e89b-42d3-a456-426614174222';
    const ticket = signPurposeToken({ sub: 'user-1', tenant: tenantId, purpose: 'staff-mfa' }, 'tenant-test-secret', 300);
    const localPrisma = {
      tenant: { findUnique: jest.fn(async () => ({ id: tenantId, code: 'ticket-studio', status: 'active' })) },
    } as any;
    const localGuard = new TenantContextGuard(localPrisma, { get: () => 'tenant-test-secret' } as any);
    const request: any = { headers: {}, body: { mfa_ticket: ticket, totp_code: '123456' } };
    await expect(localGuard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.tenantId).toBe(tenantId);
    expect(request.tenantCode).toBe('ticket-studio');
  });

  it('rejects unknown and inactive tenants', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor({ tenantCode: 'unknown' }))).rejects.toThrow();
    prisma.tenant.findUnique.mockResolvedValue({ id: '123e4567-e89b-42d3-a456-426614174000', status: 'suspended' });
    await expect(guard.canActivate(contextFor({ tenantCode: 'pilot-studio' }))).rejects.toThrow();
  });
});
