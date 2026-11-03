import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { getPermissionsForRole, type StaffRole } from '../../common/policy';

export type StaffAccessContext = {
  tenantId: string;
  userId: string;
  sessionId: string;
};

export type ResolvedStaffAccess = {
  roles: string[];
  permissions: ReadonlySet<string>;
};

@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveStaffAccess(context: StaffAccessContext): Promise<ResolvedStaffAccess | undefined> {
    return this.prisma.withTenant(context.tenantId, async (tx) => {
      const now = new Date();
      const [session, user] = await Promise.all([
        tx.authSession.findFirst({
          where: {
            id: context.sessionId,
            tenantId: context.tenantId,
            userId: context.userId,
            revokedAt: null,
            expiresAt: { gt: now },
          },
        }),
        tx.user.findFirst({
          where: { id: context.userId, tenantId: context.tenantId, status: 'active', userType: 'staff' },
          select: { id: true },
        }),
      ]);
      if (!session || !user) return undefined;

      // Requests currently carry tenant scope only. Do not widen scoped
      // studio/branch roles or resource-specific grants into tenant access.
      const [assignments, grants] = await Promise.all([
        tx.userRoleAssignment.findMany({
          where: { tenantId: context.tenantId, userId: context.userId, studioId: null, branchId: null },
          select: { roleId: true },
        }),
        tx.permissionGrant.findMany({
          where: {
            tenantId: context.tenantId,
            userId: context.userId,
            resourceType: null,
            resourceRef: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { permissionId: true },
        }),
      ]);

      const roleIds = assignments.map((assignment) => assignment.roleId);
      const roles = roleIds.length
        ? await tx.role.findMany({ where: { tenantId: context.tenantId, id: { in: roleIds } }, select: { id: true, code: true } })
        : [];
      const rolePermissions = roleIds.length
        ? await tx.rolePermission.findMany({ where: { tenantId: context.tenantId, roleId: { in: roleIds } }, select: { permissionId: true } })
        : [];
      const permissionIds = [...new Set([
        ...rolePermissions.map((permission) => permission.permissionId),
        ...grants.map((grant) => grant.permissionId),
      ])];
      const permissions = permissionIds.length
        ? await tx.permission.findMany({ where: { tenantId: context.tenantId, id: { in: permissionIds } }, select: { code: true } })
        : [];

      const roleCodes = roles.map((role) => role.code);
      const permissionCodes = new Set(permissions.map((permission) => permission.code));
      // For newly provisioned tenants or roles without explicit database permission
      // mappings, grant canonical baseline permissions based on role definitions so
      // invited team members (trainers, billers, front desk, etc.) are fully functional.
      if (rolePermissions.length === 0) {
        for (const roleCode of roleCodes) {
          const defaults = getPermissionsForRole(roleCode as StaffRole);
          if (defaults) {
            for (const perm of defaults) {
              permissionCodes.add(perm);
            }
          }
        }
      }
      const privileged = roleCodes.some((role) => role === 'owner' || role === 'admin');
      if (!privileged) {
        const financeRole = roleCodes.some((role) => role === 'biller' || role === 'accountant');
        const fitnessRole = roleCodes.some((role) => ['trainer', 'coach', 'lead_trainer'].includes(role));
        const receptionRole = roleCodes.some((role) => role === 'front_desk' || role === 'staff');
        for (const permission of [...permissionCodes]) {
          if ((fitnessRole || receptionRole) && !financeRole && /^(payments|reports|settings|import):/.test(permission)) permissionCodes.delete(permission);
          if (financeRole && !/^(payments|reports):/.test(permission)) permissionCodes.delete(permission);
        }
      }
      // A tenant-scoped owner is the workspace authority. Keep this invariant in
      // code so newly provisioned tenants do not depend on a one-time permission
      // seed having run after the tenant was created.
      if (roleCodes.includes('owner')) permissionCodes.add('*');
      return { roles: roleCodes, permissions: permissionCodes };
    });
  }

  allows(access: ResolvedStaffAccess, requiredPermission?: string): boolean {
    return !requiredPermission || access.permissions.has('*') || access.permissions.has(requiredPermission);
  }
}
