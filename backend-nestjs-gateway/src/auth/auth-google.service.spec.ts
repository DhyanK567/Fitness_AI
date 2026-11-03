import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { afterAll, beforeAll, jest } from '@jest/globals';
import { AuthService } from './auth.service';

const tenantId = '123e4567-e89b-42d3-a456-426614174000';
const member = { id: 'member-1', tenantId, userType: 'member', status: 'active', displayName: 'A Member' };

describe('AuthService Google member identity', () => {
  const previousImportStore = process.env.IMPORT_STORE;
  beforeAll(() => {
    process.env.IMPORT_STORE = 'erp';
  });
  afterAll(() => {
    if (previousImportStore === undefined) delete process.env.IMPORT_STORE;
    else process.env.IMPORT_STORE = previousImportStore;
  });

  const config = { get: (key: string) => key === 'JWT_SECRET' ? 'jwt-test-secret' : undefined } as any;

  it('creates a session only for an already-linked active member identity', async () => {
    const tx = {
      authIdentity: { findFirst: jest.fn(async () => ({ userId: member.id })) },
      user: { findFirst: jest.fn(async () => member), update: jest.fn(async () => member) },
      userErpLink: { findFirst: jest.fn(async () => ({ erpUserRef: 'WS-MEM-1' })) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (tx: any) => unknown) => work(tx)) };
    const erp = { call: jest.fn(async () => ({ id: 'WS-MEM-1', status: 'active' })) };
    const service = new AuthService(prisma as any, config, {} as any, erp as any);
    (service as any).rolesFor = jest.fn(async () => ['member']);
    (service as any).issueSession = jest.fn(async () => ({ access_token: 'access' }));

    const result = await service.loginWithGoogle(tenantId, 'tenant-a', 'corr-google', 'google-subject');

    expect(result.user).toEqual({ id: member.id, name: member.displayName, roles: ['member'] });
    expect(tx.authIdentity.findFirst).toHaveBeenCalledWith({ where: { tenantId, provider: 'google', providerSubject: 'google-subject' } });
    expect(erp.call).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a', correlationId: 'corr-google', method: 'wellness_studio.api.member.get_member', httpMethod: 'GET',
      body: { tenant: 'tenant-a', member: 'WS-MEM-1' },
    }));
    expect((service as any).issueSession).toHaveBeenCalledWith(tenantId, member.id, ['member']);
  });

  it('does not auto-link an unlinked Google identity', async () => {
    const tx = { authIdentity: { findFirst: jest.fn(async () => undefined) }, user: { findFirst: jest.fn() } };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (tx: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, config, {} as any, {} as any);
    await expect(service.loginWithGoogle(tenantId, 'tenant-a', 'corr', 'unlinked-subject')).rejects.toThrow(UnauthorizedException);
    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });

  it('denies Google sign-in when the linked ERP member is inactive', async () => {
    const tx = {
      authIdentity: { findFirst: jest.fn(async () => ({ userId: member.id })) },
      user: { findFirst: jest.fn(async () => member), update: jest.fn() },
      userErpLink: { findFirst: jest.fn(async () => ({ erpUserRef: 'WS-MEM-1' })) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (tx: any) => unknown) => work(tx)) };
    const erp = { call: jest.fn(async () => ({ id: 'WS-MEM-1', status: 'inactive' })) };
    const service = new AuthService(prisma as any, config, {} as any, erp as any);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(service.loginWithGoogle(tenantId, 'tenant-a', 'corr', 'google-subject'))
      .rejects.toThrow('ERP member is not active');

    expect(issueSession).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('links only the authenticated active member and records the link audit transactionally', async () => {
    const authenticatedAt = new Date();
    const tx = {
      authSession: { findFirst: jest.fn(async () => ({ authenticatedAt })) },
      user: { findFirst: jest.fn(async () => member) },
      authIdentity: {
        findFirst: jest.fn(async () => undefined),
        create: jest.fn(async () => ({ id: 'identity-1' })),
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (tx: any) => unknown) => work(tx)) };
    const audit = { recordInTransaction: jest.fn(async () => undefined) };
    const service = new AuthService(prisma as any, config, audit as any, {} as any);

    await expect(service.linkGoogleAccount(tenantId, member.id, 'session-1', 'google-subject', '123e4567-e89b-42d3-a456-426614174111'))
      .resolves.toEqual({ status: 'linked', already_linked: false });
    expect(tx.authSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'session-1', tenantId, userId: member.id, revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      select: { authenticatedAt: true },
    });
    expect(tx.authIdentity.create).toHaveBeenCalledWith({ data: { tenantId, userId: member.id, provider: 'google', providerSubject: 'google-subject' } });
    expect(audit.recordInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'member.google_linked', resourceRef: member.id }));
  });

  it('rejects staff accounts and identities already linked to another member', async () => {
    const tx = {
      authSession: { findFirst: jest.fn(async () => ({ authenticatedAt: new Date() })) },
      user: { findFirst: jest.fn(async () => ({ ...member, userType: 'staff' })) },
      authIdentity: { findFirst: jest.fn(), create: jest.fn() },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (tx: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, config, {} as any, {} as any);
    await expect(service.linkGoogleAccount(tenantId, 'staff-1', 'session-1', 'subject', 'correlation'))
      .rejects.toThrow(ForbiddenException);

    tx.user.findFirst.mockImplementationOnce(async () => member);
    tx.authIdentity.findFirst.mockImplementationOnce(async () => ({ userId: 'other-member' }));
    await expect(service.linkGoogleAccount(tenantId, member.id, 'session-1', 'subject', 'correlation'))
      .rejects.toThrow(ConflictException);
  });

  it('rejects stale or missing database authentication time even when the access token was just refreshed', async () => {
    const tx = {
      authSession: { findFirst: jest.fn(async (): Promise<{ authenticatedAt: Date } | null> => ({ authenticatedAt: new Date(Date.now() - 301_000) })) },
      authIdentity: { create: jest.fn() },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: typeof tx) => unknown) => work(tx)) } as any;
    const service = new AuthService(prisma, config, {} as any, {} as any);
    await expect(service.linkGoogleAccount(tenantId, member.id, 'refreshed-session', 'subject', 'correlation'))
      .rejects.toThrow('Re-authenticate within five minutes');
    expect(tx.authIdentity.create).not.toHaveBeenCalled();

    tx.authSession.findFirst.mockImplementationOnce(async () => null);
    await expect(service.linkGoogleAccount(tenantId, member.id, 'unknown-session', 'subject', 'correlation'))
      .rejects.toThrow('Re-authenticate within five minutes');
  });

  it('fails closed when no active authenticated session is found', async () => {
    const tx = {
      authSession: { findFirst: jest.fn(async () => null) },
      authIdentity: { create: jest.fn() },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: typeof tx) => unknown) => work(tx)) } as any;
    const service = new AuthService(prisma, config, {} as any, {} as any);

    await expect(service.linkGoogleAccount(tenantId, member.id, 'missing-session', 'subject', 'correlation'))
      .rejects.toThrow('Re-authenticate within five minutes');
    expect(tx.authIdentity.create).not.toHaveBeenCalled();
  });
});
