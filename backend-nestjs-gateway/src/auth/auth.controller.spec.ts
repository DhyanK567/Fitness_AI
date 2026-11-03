import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { TenantContextGuard } from '../common/tenant-context.guard';
import type { RequestWithContext } from '../common/request-context.types';

function makeController() {
  const auth = {
    login: jest.fn(async () => ({ access_token: 'access' })),
    completeMfa: jest.fn(async () => ({ access_token: 'access' })),
    refresh: jest.fn(async () => ({ access_token: 'access' })),
    logout: jest.fn(async () => ({ status: 'logged_out' })),
    logoutAll: jest.fn(async () => ({ status: 'logged_out_all', revoked: 1 })),
    invite: jest.fn(async () => ({ status: 'invited' })),
    requestPasswordReset: jest.fn(async () => ({ status: 'sent' })),
    resetPassword: jest.fn(async () => ({ status: 'password_reset' })),
    enrollTotp: jest.fn(async () => ({ secret: 'S' })),
    verifyTotpEnrollment: jest.fn(async () => ({ mfa_enrolled: true })),
    getProfile: jest.fn(async () => ({ roles: ['owner'] })),
  };
  return { controller: new AuthController(auth as never), auth };
}

const request = { tenantId: 'tenant-1', auth: { userId: 'user-1', roles: ['owner'] } } as unknown as RequestWithContext;

describe('AuthController (staff routes)', () => {
  it('POST /auth/staff/login delegates tenant + credentials', async () => {
    const { controller, auth } = makeController();
    await controller.login(request, { email: 'a@b.c', password: 'pw', totp_code: '123456' } as never);
    expect(auth.login).toHaveBeenCalledWith('tenant-1', 'a@b.c', 'pw', '123456', undefined);
  });

  it('POST /auth/staff/login completes MFA from a signed ticket without repeating the password', async () => {
    const { controller, auth } = makeController();
    await controller.login(request, { mfa_ticket: 'signed-ticket', totp_code: '123456' } as never);
    expect(auth.completeMfa).toHaveBeenCalledWith('tenant-1', 'signed-ticket', '123456', undefined);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('POST /auth/staff/refresh delegates the refresh token', async () => {
    const { controller, auth } = makeController();
    await controller.refresh(request, { refresh_token: 'rt' } as never);
    expect(auth.refresh).toHaveBeenCalledWith('tenant-1', 'rt');
  });

  it('POST /auth/staff/logout delegates the refresh token', async () => {
    const { controller, auth } = makeController();
    await controller.logout(request, { refresh_token: 'rt' } as never);
    expect(auth.logout).toHaveBeenCalledWith('tenant-1', 'rt');
  });

  it('POST /auth/staff/logout-all uses the authenticated user id', async () => {
    const { controller, auth } = makeController();
    await controller.logoutAll(request);
    expect(auth.logoutAll).toHaveBeenCalledWith('tenant-1', 'user-1');
  });

  it('POST /auth/staff/invite delegates invite details', async () => {
    const { controller, auth } = makeController();
    await controller.invite(request, { email: 'n@b.c', displayName: 'N', roleCode: 'front_desk' } as never);
    expect(auth.invite).toHaveBeenCalledWith('tenant-1', 'n@b.c', 'N', 'front_desk');
  });

  it('POST /auth/staff/reset-password/request delegates the email', async () => {
    const { controller, auth } = makeController();
    await controller.requestReset(request, { email: 'n@b.c' } as never);
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('tenant-1', 'n@b.c');
  });

  it('POST /auth/staff/reset-password consumes the single-use token', async () => {
    const { controller, auth } = makeController();
    await controller.resetPassword(request, { token: 'tok', password: 'long-enough-password' } as never);
    expect(auth.resetPassword).toHaveBeenCalledWith('tenant-1', 'tok', 'long-enough-password');
  });

  it('POST /auth/staff/totp/enroll uses the authenticated user id', async () => {
    const { controller, auth } = makeController();
    await controller.enrollTotp(request);
    expect(auth.enrollTotp).toHaveBeenCalledWith('tenant-1', 'user-1');
  });

  it('POST /auth/staff/totp/verify delegates the code', async () => {
    const { controller, auth } = makeController();
    await controller.verifyTotp(request, { code: '123456' } as never);
    expect(auth.verifyTotpEnrollment).toHaveBeenCalledWith('tenant-1', 'user-1', '123456');
  });

  it('GET /auth/staff/me uses the authenticated user id', async () => {
    const { controller, auth } = makeController();
    await controller.me(request);
    expect(auth.getProfile).toHaveBeenCalledWith('tenant-1', 'user-1');
  });
});

describe('TenantContextGuard (login tenant resolution)', () => {
  const contextFor = (req: Record<string, unknown>): never =>
    ({ switchToHttp: () => ({ getRequest: () => req }) }) as never;

  it('rejects an unknown tenant with 404', async () => {
    const guard = new TenantContextGuard({ tenant: { findUnique: jest.fn(async () => null) } } as never);
    await expect(guard.canActivate(contextFor({ tenantCode: 'ghost' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an inactive tenant', async () => {
    const guard = new TenantContextGuard({ tenant: { findUnique: jest.fn(async () => ({ id: 't', status: 'suspended' })) } } as never);
    await expect(guard.canActivate(contextFor({ tenantCode: 'ghost' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a request without a tenant subdomain', async () => {
    const guard = new TenantContextGuard({ tenant: { findUnique: jest.fn(async () => null) } } as never);
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resolves the tenant id for an active tenant', async () => {
    const guard = new TenantContextGuard({ tenant: { findUnique: jest.fn(async () => ({ id: 'tenant-1', status: 'active' })) } } as never);
    const req = { tenantCode: 'acme' } as Record<string, unknown>;
    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.tenantId).toBe('tenant-1');
  });
});
