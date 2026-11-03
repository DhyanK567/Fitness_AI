import { jest } from '@jest/globals';
import { signAccessToken } from '../../common/auth-token';
import { MemberOrStaffAccessGuard } from './booking-access.guard';

describe('BookingAccessGuard', () => {
  const secret = 'member-booking-test-secret';
  const makeContext = (request: any): any => ({
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  });
  const makeGuard = ({ memberRef = 'WS-MEM-22' as string | null, permission = 'bookings:write' } = {}) => {
    const withTenant = jest.fn(async (_tenant: string, work: (tx: any) => unknown) => work({
      authSession: { findFirst: async () => ({ id: 'session-1' }) },
      user: { findFirst: async () => ({ userType: 'member' }) },
      userRoleAssignment: { findMany: async () => [{ roleId: 'role-1' }] },
      role: { findMany: async () => [{ id: 'role-1', code: 'member' }] },
      rolePermission: { findMany: async () => [{ permissionId: 'permission-1' }] },
      permissionGrant: { findMany: async () => [] },
      permission: { findMany: async () => [{ id: 'permission-1', code: permission }] },
      userErpLink: { findFirst: async () => memberRef ? { erpUserRef: memberRef } : null },
    }));
    const prisma = { withTenant };
    const staff = { canActivate: jest.fn(async () => true) };
    const reflector = { getAllAndOverride: () => 'bookings:write' };
    return { guard: new MemberOrStaffAccessGuard({ get: () => secret } as any, reflector as any, prisma as any, staff as any), staff };
  };
  const requestFor = (tenant = 'tenant-a') => ({
    headers: { authorization: `Bearer ${signAccessToken({ sub: 'user-member', tenant, roles: ['member'], sid: 'session-1' }, secret)}` },
    tenantId: tenant,
  });

  it('authenticates a member and binds request context to its ERP member record', async () => {
    const { guard } = makeGuard();
    const request: any = requestFor();
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.auth).toMatchObject({ userId: 'user-member', memberRef: 'WS-MEM-22' });
  });

  it('rejects an unlinked member and does not delegate to the staff guard', async () => {
    const { guard, staff } = makeGuard({ memberRef: null });
    await expect(guard.canActivate(makeContext(requestFor()))).rejects.toThrow('not linked');
    expect(staff.canActivate).not.toHaveBeenCalled();
  });

  it('rejects a member lacking the required booking permission', async () => {
    const { guard } = makeGuard({ permission: 'attendance:read' });
    await expect(guard.canActivate(makeContext(requestFor()))).rejects.toThrow('do not have permission');
  });

  it('delegates staff authorization to the existing permission-enforcing guard', async () => {
    const { guard, staff } = makeGuard();
    const request = requestFor();
    const withTenant = (guard as any).prisma.withTenant as ReturnType<typeof jest.fn>;
    withTenant.mockImplementationOnce(async (_tenant: string, work: (tx: any) => unknown) => work({
      authSession: { findFirst: async () => ({ id: 'session-1' }) },
      user: { findFirst: async () => ({ userType: 'staff' }) },
    }));
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(staff.canActivate).toHaveBeenCalled();
  });
});
