import { jest } from '@jest/globals';
import { PrismaService } from '../../common/prisma.service';
import { PolicyService } from './policy.service';

describe('PolicyService', () => {
  const context = { tenantId: 'tenant-1', userId: 'user-1', sessionId: 'session-1' };

  function setup({ session = true, activeStaff = true, roleCode = 'admin' } = {}) {
    const findSession = jest.fn(async () => session ? { id: context.sessionId } : null);
    const findUser = jest.fn(async () => activeStaff ? { id: context.userId } : null);
    const findAssignments = jest.fn(async () => [{ roleId: 'role-1' }]);
    const findGrants = jest.fn(async () => [{ permissionId: 'direct-permission' }]);
    const tx = {
      authSession: { findFirst: findSession },
      user: { findFirst: findUser },
      userRoleAssignment: { findMany: findAssignments },
      permissionGrant: { findMany: findGrants },
      role: { findMany: async () => [{ id: 'role-1', code: roleCode }] },
      rolePermission: { findMany: async () => [{ permissionId: 'role-permission' }] },
      permission: { findMany: async () => [
        { code: 'members:read' },
        { code: 'settings:write' },
      ] },
    };
    const withTenant = jest.fn(async (_tenantId: string, work: (client: any) => unknown) => work(tx));
    return { service: new PolicyService({ withTenant } as unknown as PrismaService), withTenant, findSession, findUser, findAssignments, findGrants };
  }

  it('resolves active staff roles and permissions only inside the requested tenant context', async () => {
    const { service, withTenant } = setup();
    const access = await service.resolveStaffAccess(context);
    expect(withTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    expect(access?.roles).toEqual(['admin']);
    expect([...access!.permissions].sort()).toEqual(['members:read', 'settings:write']);
    expect(service.allows(access!, 'settings:write')).toBe(true);
    expect(service.allows(access!, 'payments:write')).toBe(false);
    expect(service.allows({ roles: ['owner'], permissions: new Set(['*']) }, 'unlisted:write')).toBe(true);
  });

  it('grants tenant owners wildcard authority without relying on a post-provisioning permission seed', async () => {
    const { service } = setup({ roleCode: 'owner' });
    const access = await service.resolveStaffAccess(context);
    expect(access?.roles).toEqual(['owner']);
    expect(access?.permissions.has('*')).toBe(true);
    expect(service.allows(access!, 'members:write')).toBe(true);
  });

  it('fails closed for an expired or revoked session and for inactive/non-staff users', async () => {
    const expired = setup({ session: false });
    await expect(expired.service.resolveStaffAccess(context)).resolves.toBeUndefined();
    expect(expired.findAssignments).not.toHaveBeenCalled();

    const inactive = setup({ activeStaff: false });
    await expect(inactive.service.resolveStaffAccess(context)).resolves.toBeUndefined();
    expect(inactive.findGrants).not.toHaveBeenCalled();
  });

  it('uses only tenant-wide assignments and grants until scoped request authorization is implemented', async () => {
    const { service, findAssignments, findGrants } = setup();
    await service.resolveStaffAccess(context);
    expect(findAssignments).toHaveBeenCalledWith({
      where: { tenantId: context.tenantId, userId: context.userId, studioId: null, branchId: null },
      select: { roleId: true },
    });
    expect(findGrants).toHaveBeenCalledWith({
      where: {
        tenantId: context.tenantId,
        userId: context.userId,
        resourceType: null,
        resourceRef: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      select: { permissionId: true },
    });
  });

  it('provides baseline role permissions for newly provisioned roles without database mappings', async () => {
    const tx = {
      authSession: { findFirst: jest.fn(async () => ({ id: context.sessionId })) },
      user: { findFirst: jest.fn(async () => ({ id: context.userId })) },
      userRoleAssignment: { findMany: jest.fn(async () => [{ roleId: 'role-trainer' }]) },
      permissionGrant: { findMany: jest.fn(async () => []) },
      role: { findMany: async () => [{ id: 'role-trainer', code: 'trainer' }] },
      rolePermission: { findMany: async () => [] },
      permission: { findMany: async () => [] },
    };
    const service = new PolicyService({ withTenant: jest.fn(async (_id: string, work: any) => work(tx)) } as unknown as PrismaService);
    const access = await service.resolveStaffAccess(context);
    expect(access?.roles).toEqual(['trainer']);
    expect(access?.permissions.has('members:read')).toBe(true);
    expect(access?.permissions.has('attendance:read')).toBe(true);
    expect(access?.permissions.has('payments:write')).toBe(false);
  });

  it('cannot widen reception into finance or settings through stale database grants', async () => {
    const { service } = setup({ roleCode: 'front_desk' });
    const access = await service.resolveStaffAccess(context);
    expect(access?.permissions.has('members:read')).toBe(true);
    expect(access?.permissions.has('settings:write')).toBe(false);
    expect(access?.permissions.has('payments:read')).toBe(false);
  });
});
