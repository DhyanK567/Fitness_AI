import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSION } from './permission.decorator';
import { verifyAccessToken, verifyEnrollmentToken } from './auth-token';
import type { RequestWithContext } from './request-context.types';
import { PrismaService } from './prisma.service';
import { PolicyService } from '../platform/roles-permissions/policy.service';
import { REQUIRED_ROLES, REQUIRED_TIER } from './tier-entitlement.decorator';
import { normalizeTierCode, tierAllows, TIER_LABELS, type TierCode } from './tier-entitlements';

@Injectable()
export class StaffAccessGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly policy: PolicyService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('A staff access token is required');
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new UnauthorizedException('JWT authentication is unavailable');
    let claims = verifyAccessToken(header.slice(7), secret);
    let isEnrollmentToken = false;
    if (!claims) {
      const enrollment = verifyEnrollmentToken(header.slice(7), secret);
      if (enrollment) {
        claims = enrollment;
        isEnrollmentToken = true;
      } else {
        throw new UnauthorizedException('Invalid tenant access token');
      }
    }

    if (!isEnrollmentToken && !claims.sid) throw new UnauthorizedException('Invalid tenant access token');

    if (claims.tenant !== request.tenantId) {
      try {
        await this.prisma.withTenant(request.tenantId as string, (tx) => tx.securityEvent.create({
          data: {
            tenantId: request.tenantId as string,
            eventType: 'auth.cross_tenant_attempt',
            severity: 'high',
            ipAddress: request.ip,
            route: request.path.slice(0, 200),
            correlationId: request.correlationId,
            details: { tokenTenant: claims.tenant, requestTenant: request.tenantId },
          },
        }));
      } catch { /* Denial must not depend on audit storage availability. */ }
      throw new UnauthorizedException('Invalid tenant access token');
    }

    if (isEnrollmentToken) {
      // Enrollment tokens (scope: mfa_enroll) are short-lived, single-purpose tokens
      // issued after successful password login when MFA enrollment is required.
      // No session exists yet, so skip session revocation checks.
      const enrollmentPath = request.path?.split('?')[0] ?? '';
      if (!enrollmentPath.endsWith('/auth/staff/totp/enroll') && !enrollmentPath.endsWith('/auth/staff/totp/verify')) {
        throw new ForbiddenException('Enrollment tokens can only be used for MFA setup');
      }
      request.auth = { userId: claims.sub, roles: (claims.roles as string[]) ?? [], sessionId: undefined };
      return true;
    }

    const access = await this.policy.resolveStaffAccess({ tenantId: claims.tenant, userId: claims.sub, sessionId: claims.sid! });
    if (!access) throw new UnauthorizedException('Access session is revoked or expired');
    const permission = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    if (!this.policy.allows(access, permission)) throw new ForbiddenException('You do not have permission for this action');
    const allowedRoles = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]);
    if (Array.isArray(allowedRoles) && allowedRoles.length && !access.roles.some((role) => allowedRoles.includes(role))) {
      throw new ForbiddenException({ code: 'ROLE_ACCESS_REQUIRED', message: 'This action is not available for your workspace role' });
    }
    const requiredTier = this.reflector.getAllAndOverride<TierCode>(REQUIRED_TIER, [context.getHandler(), context.getClass()]);
    if (requiredTier && ['starter', 'growth', 'enterprise'].includes(requiredTier)) {
      const tenant = await this.prisma.withTenant(claims.tenant, (tx) => tx.tenant.findUnique({
        where: { id: claims.tenant }, select: { tierId: true },
      }));
      const tier = tenant?.tierId
        ? await this.prisma.subscriptionTier.findUnique({ where: { id: tenant.tierId }, select: { code: true } })
        : null;
      const currentTier = normalizeTierCode(tier?.code);
      if (!tierAllows(currentTier, requiredTier)) {
        throw new ForbiddenException({
          code: 'TIER_UPGRADE_REQUIRED',
          message: `${TIER_LABELS[requiredTier]} is required for this action`,
          currentTier,
          requiredTier,
        });
      }
    }
    request.auth = { userId: claims.sub, roles: access.roles, sessionId: claims.sid! };
    return true;
  }
}
