import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { StaffAccessGuard } from './staff-access.guard';
import { signAccessToken } from './auth-token';

describe('StaffAccessGuard', () => {
  const secret = 'test-secret';
  const makeContext = (authorization?: string, tenantId = 'alpha', path = '/api/staff'): any => ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization }, tenantId, ip: '192.0.2.66', path }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  });
  const guard = (permission?: string, roleCode = 'admin') => {
    const allowed = roleCode === 'owner' || roleCode === 'admin' || (roleCode === 'trainer' && permission === 'attendance:write');
    const access = { roles: [roleCode], permissions: new Set(allowed && permission ? [permission] : []) };
    const policy = { resolveStaffAccess: async () => access, allows: (resolved: typeof access, required?: string) => !required || resolved.permissions.has('*') || resolved.permissions.has(required) };
    const createSecurityEvent = jest.fn(async () => undefined);
    const prisma = { withTenant: (_tenant: string, work: any) => work({ securityEvent: { create: createSecurityEvent } }) };
    return { guard: new StaffAccessGuard(
      { get: () => secret } as unknown as ConfigService,
      { getAllAndOverride: () => permission } as unknown as Reflector,
      policy as any,
      prisma as any,
    ), createSecurityEvent };
  };

  it('accepts a tenant-matched token with the required permission', async () => {
    const token = signAccessToken({ sub: 'user', tenant: 'alpha', roles: ['admin'], sid: 'session-1' }, secret);
    await expect(guard('settings:write').guard.canActivate(makeContext(`Bearer ${token}`))).resolves.toBe(true);
  });

  it('rejects a token from another tenant', async () => {
    const token = signAccessToken({ sub: 'user', tenant: 'beta', roles: ['admin'], sid: 'session-1' }, secret);
    const guarded = guard();
    await expect(guarded.guard.canActivate(makeContext(`Bearer ${token}`))).rejects.toThrow('Invalid tenant access token');
    expect(guarded.createSecurityEvent).toHaveBeenCalledWith({ data: expect.objectContaining({
      ipAddress: '192.0.2.66', route: '/api/staff', eventType: 'auth.cross_tenant_attempt',
    }) });
  });

  it('rejects a role without the requested permission', async () => {
    const token = signAccessToken({ sub: 'user', tenant: 'alpha', roles: ['trainer'], sid: 'session-1' }, secret);
    await expect(guard('payments:write', 'trainer').guard.canActivate(makeContext(`Bearer ${token}`))).rejects.toThrow('You do not have permission');
  });

  it('rejects a malformed JWT', async () => {
    await expect(guard().guard.canActivate(makeContext('Bearer not-a-jwt'))).rejects.toThrow('Invalid tenant access token');
  });

  it('rejects a JWT missing the session id (sid)', async () => {
    const token = signAccessToken({ sub: 'user', tenant: 'alpha', roles: ['admin'] }, secret);
    await expect(guard().guard.canActivate(makeContext(`Bearer ${token}`))).rejects.toThrow('Invalid tenant access token');
  });

  it('rejects a request with no authorization header', async () => {
    await expect(guard().guard.canActivate(makeContext(undefined))).rejects.toThrow('A staff access token is required');
  });

  it('accepts enrollment tokens only on TOTP setup endpoints', async () => {
    const token = signAccessToken({ sub: 'user', tenant: 'alpha', roles: ['owner'], scope: 'mfa_enroll' }, secret, 600);
    await expect(
      guard().guard.canActivate(makeContext(`Bearer ${token}`, 'alpha', '/api/v1/auth/staff/totp/enroll')),
    ).resolves.toBe(true);
    await expect(
      guard().guard.canActivate(makeContext(`Bearer ${token}`, 'alpha', '/api/v1/auth/staff/me')),
    ).rejects.toThrow('Enrollment tokens can only be used for MFA setup');
  });

});
