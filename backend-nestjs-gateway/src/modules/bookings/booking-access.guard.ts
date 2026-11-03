import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSION } from '../../common/permission.decorator';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { verifyAccessToken } from '../../common/auth-token';
import { PrismaService } from '../../common/prisma.service';
import type { RequestWithContext } from '../../common/request-context.types';

const CANONICAL_MEMBER_PERMISSIONS = new Set([
  'attendance:read',
  'attendance:write',
  'bookings:read',
  'bookings:write',
  'members:read',
  'members:write',
  'memberships:read',
  'payments:read',
]);

@Injectable()
export class MemberOrStaffAccessGuard implements CanActivate {
  constructor(private readonly config: ConfigService, private readonly reflector: Reflector, private readonly prisma: PrismaService, private readonly staff: StaffAccessGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const secret = this.config.get<string>('JWT_SECRET');
    const header = request.headers.authorization;
    const claims = header?.startsWith('Bearer ') && secret ? verifyAccessToken(header.slice(7), secret) : undefined;
    if (!claims) throw new UnauthorizedException('Invalid tenant access token');
    if (claims.tenant !== request.tenantId) {
      try {
        await this.prisma.withTenant(request.tenantId as string, (tx) => tx.securityEvent.create({
          data: { tenantId: request.tenantId as string, eventType: 'auth.cross_tenant_attempt', severity: 'high', correlationId: request.correlationId, details: { tokenTenant: claims.tenant, requestTenant: request.tenantId } },
        }));
      } catch { /* Denial must not rely on audit storage availability. */ }
      throw new UnauthorizedException('Invalid tenant access token');
    }
    const type = await this.prisma.withTenant(claims.tenant, async (tx) => {
      const session = await tx.authSession.findFirst({ where: { id: claims.sid, tenantId: claims.tenant, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() } } });
      const user = await tx.user.findFirst({ where: { id: claims.sub, tenantId: claims.tenant, status: 'active' }, select: { userType: true } });
      return session && user ? user.userType : undefined;
    });
    if (!type) throw new UnauthorizedException('Access session is revoked or expired');
    if (type === 'staff') return this.staff.canActivate(context);
    if (type !== 'member') throw new ForbiddenException('This account cannot access this business operation');

    const result = await this.prisma.withTenant(claims.tenant, async (tx) => {
      const assignments = await tx.userRoleAssignment.findMany({ where: { tenantId: claims.tenant, userId: claims.sub } });
      const roles = await tx.role.findMany({ where: { tenantId: claims.tenant, id: { in: assignments.map((row) => row.roleId) } } });
      const rolePermissions = await tx.rolePermission.findMany({ where: { tenantId: claims.tenant, roleId: { in: roles.map((role) => role.id) } } });
      const grants = await tx.permissionGrant.findMany({ where: { tenantId: claims.tenant, userId: claims.sub, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
      const permissions = await tx.permission.findMany({ where: { tenantId: claims.tenant, id: { in: [...rolePermissions.map((row) => row.permissionId), ...grants.map((row) => row.permissionId)] } } });
      const link = await tx.userErpLink.findFirst({ where: { tenantId: claims.tenant, userId: claims.sub } });
      let memberRef = link?.erpUserRef;
      if (!memberRef) {
        const user = await tx.user.findFirst({ where: { id: claims.sub, tenantId: claims.tenant } });
        if (user) {
          const conditions: Array<Record<string, unknown>> = [];
          if (user.email) conditions.push({ email: user.email });
          if (user.phoneE164) conditions.push({ phone: user.phoneE164 });
          const existingMember = conditions.length > 0
            ? await tx.studioMember.findFirst({ where: { tenantId: claims.tenant, OR: conditions as any } })
            : null;
          if (existingMember) {
            memberRef = existingMember.id;
            await tx.userErpLink.create({
              data: { tenantId: claims.tenant, userId: claims.sub, erpUserRef: existingMember.id },
            }).catch(() => {});
          }
        }
      }
      const effectivePermissions = new Set(permissions.map((row) => row.code));
      if (effectivePermissions.size === 0) {
        for (const p of CANONICAL_MEMBER_PERMISSIONS) {
          effectivePermissions.add(p);
        }
      }
      return { roles: roles.map((role) => role.code), permissions: effectivePermissions, memberRef };
    });
    if (!result.memberRef) throw new ForbiddenException('Member account is not linked to a business member record');
    const required = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    if (required && !result.permissions.has(required) && !result.permissions.has('*')) throw new ForbiddenException('You do not have permission for this action');
    request.auth = { userId: claims.sub, roles: result.roles, sessionId: claims.sid, memberRef: result.memberRef };
    return true;
  }
}
