import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyAccessToken } from './auth-token';
import { PrismaService } from './prisma.service';
import type { RequestWithContext } from './request-context.types';

@Injectable()
export class AuthenticatedAccessGuard implements CanActivate {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const header = request.headers.authorization;
    const secret = this.config.get<string>('JWT_SECRET');
    if (!header?.startsWith('Bearer ') || !secret) throw new UnauthorizedException('An access token is required');
    const claims = verifyAccessToken(header.slice(7), secret);
    if (!claims || claims.tenant !== request.tenantId) throw new UnauthorizedException('Invalid tenant access token');
    const identity = await this.prisma.withTenant(claims.tenant, async (tx) => {
      const session = await tx.authSession.findFirst({ where: { id: claims.sid, tenantId: claims.tenant, userId: claims.sub, revokedAt: null, expiresAt: { gt: new Date() } } });
      const user = await tx.user.findFirst({ where: { id: claims.sub, tenantId: claims.tenant, status: 'active' } });
      if (!session || !user) return undefined;
      const assignments = await tx.userRoleAssignment.findMany({ where: { tenantId: claims.tenant, userId: claims.sub } });
      const roles = await tx.role.findMany({ where: { tenantId: claims.tenant, id: { in: assignments.map((row) => row.roleId) } } });
      return { userId: user.id, roles: roles.map((role) => role.code) };
    });
    if (!identity) throw new UnauthorizedException('Access session is revoked or expired');
    request.auth = { ...identity, sessionId: claims.sid };
    return true;
  }
}
