import { CanActivate, ExecutionContext, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { RequestWithContext } from './request-context.types';
import { PrismaService } from './prisma.service';
import { verifyAccessToken, verifyEnrollmentToken, verifyPassword, verifyPurposeToken } from './auth-token';
import { SecretBox } from './secret-box';
import { verifyTotp } from './totp';

@Injectable()
export class TenantContextGuard implements CanActivate {
  private secretBoxCache: SecretBox | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private secretBox(): SecretBox | null {
    if (!this.secretBoxCache && this.config) {
      try {
        this.secretBoxCache = SecretBox.fromConfig(this.config);
      } catch {}
    }
    return this.secretBoxCache;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    let tenant: { id: string; code?: string; status: string } | null = null;
    // Cryptographically verified token tenancy is authoritative. Hostnames,
    // development headers and request bodies must never re-scope it.
    const authHeader = request.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const secret = this.config?.get<string>('JWT_SECRET') ?? process.env.JWT_SECRET;
      if (secret) {
        const rawToken = authHeader.slice(7);
        const claims = verifyAccessToken(rawToken, secret) ?? verifyEnrollmentToken(rawToken, secret);
        if (claims?.tenant) {
          const tokenTenant = await this.prisma.tenant.findUnique({
            where: { id: claims.tenant },
            select: { id: true, code: true, status: true },
          });
          if (tokenTenant && tokenTenant.status === 'active') {
            tenant = tokenTenant;
            request.tenantCode = tokenTenant.code;
            request.tenantId = tokenTenant.id;
            return true;
          }
          throw new UnauthorizedException('The token tenant is unavailable or inactive.');
        }
      }
    }

    const mfaTicket = typeof request.body?.mfa_ticket === 'string' ? request.body.mfa_ticket : '';
    if (mfaTicket) {
      const secret = this.config?.get<string>('JWT_SECRET') ?? process.env.JWT_SECRET;
      const claims = secret ? verifyPurposeToken(mfaTicket, secret, 'staff-mfa') : undefined;
      if (claims?.tenant) {
        const ticketTenant = await this.prisma.tenant.findUnique({ where: { id: claims.tenant }, select: { id: true, code: true, status: true } });
        if (ticketTenant?.status === 'active') {
          request.tenantId = ticketTenant.id;
          request.tenantCode = ticketTenant.code;
          return true;
        }
      }
      throw new UnauthorizedException({ errorCode: 'MFA_TICKET_INVALID', message: 'The MFA challenge is invalid or expired' });
    }

    if (!request.tenantCode) {
      throw new UnauthorizedException('A tenant subdomain is required.');
    }
    tenant = await this.prisma.tenant.findUnique({ where: { code: request.tenantCode }, select: { id: true, status: true } });

    const email = request.body?.email ? String(request.body.email).trim().toLowerCase() : null;
    let userExistsInTenant = false;
    if (tenant && email) {
      const u = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, email, userType: 'staff', status: 'active' },
        select: { id: true },
      });
      userExistsInTenant = !!u;
    }
    const host = String(request.headers?.host ?? '').split(':')[0].toLowerCase();
    const sharedDevelopmentHost = process.env.NODE_ENV !== 'production' && (
      host === 'localhost' || host === '127.0.0.1' ||
      this.config?.get<string>('ALLOW_DEV_TENANT_HEADER') === 'true' ||
      process.env.ALLOW_DEV_TENANT_HEADER === 'true'
    );
    const isStaffRoute = Boolean(request.path?.includes('/auth/staff'));
    const shouldResolveByEmail =
      isStaffRoute &&
      sharedDevelopmentHost &&
      (!tenant || tenant.status !== 'active' || !userExistsInTenant || request.tenantCode === (process.env.DEV_DEFAULT_TENANT || 'pilot-studio'));

    if (shouldResolveByEmail) {
      if (email) {
        const candidateUsers = await this.prisma.user.findMany({
          where: { email, userType: 'staff', status: 'active' },
          select: { id: true, tenantId: true, status: true, lastLoginAt: true, updatedAt: true },
          orderBy: [{ lastLoginAt: 'desc' }, { updatedAt: 'desc' }],
        });

        let matchedUser = candidateUsers[0];

        const password = request.body?.password ? String(request.body.password) : null;
        const totpCode = request.body?.totp_code ? String(request.body.totp_code) : null;
        if (password && candidateUsers.length > 1) {
          const matchingUsers: typeof candidateUsers = [];
          for (const cand of candidateUsers) {
            const cred = await this.prisma.userCredential.findFirst({
              where: { userId: cand.id, tenantId: cand.tenantId },
              select: { passwordHash: true },
            });
            if (cred?.passwordHash && (await verifyPassword(password, cred.passwordHash))) {
              matchingUsers.push(cand);
            }
          }
          if (matchingUsers.length === 1) {
            matchedUser = matchingUsers[0];
          } else if (matchingUsers.length > 1) {
            if (totpCode) {
              const box = this.secretBox();
              for (const cand of matchingUsers) {
                const totp = await (this.prisma as any).userTotp.findFirst({
                  where: { userId: cand.id, tenantId: cand.tenantId },
                  select: { secret: true },
                });
                if (totp?.secret) {
                  let decrypted = totp.secret;
                  if (box && totp.secret.startsWith('v1.')) {
                    try {
                      decrypted = box.decrypt(totp.secret);
                    } catch {}
                  }
                  if (verifyTotp(decrypted, totpCode)) {
                    matchedUser = cand;
                    break;
                  }
                }
              }
            } else {
              matchedUser = matchingUsers[0];
            }
          }
        }

        if (matchedUser) {
          const userTenant = await this.prisma.tenant.findUnique({ where: { id: matchedUser.tenantId }, select: { id: true, code: true, status: true } });
          if (userTenant && userTenant.status === 'active') {
            tenant = userTenant;
            request.tenantCode = userTenant.code;
          }
        } else if (!tenant || tenant.status !== 'active' || request.tenantCode === (process.env.DEV_DEFAULT_TENANT || 'pilot-studio')) {
          throw new UnauthorizedException({ errorCode: 'USER_NOT_FOUND', message: 'No active staff account exists for this email' });
        }
      }
    }
    if (!tenant || tenant.status !== 'active') throw new NotFoundException('Tenant not found.');
    request.tenantId = tenant.id;
    return true;
  }
}
