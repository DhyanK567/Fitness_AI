import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterStudioDto, ResendVerificationEmailDto, VerifyOwnerEmailDto } from './dto/auth-lifecycle.dto';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ErrorCode, getHttpStatus } from '@fitness-ai/error-codes';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuditOutboxService } from '../common/audit-outbox.service';
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  hashToken,
  needsPasswordHashUpgrade,
  signAccessToken,
  signPurposeToken,
  verifyAccessToken,
  verifyPassword,
  verifyPurposeToken,
} from '../common/auth-token';
import { PrismaService } from '../common/prisma.service';
import { ErpnextService } from '../erpnext/erpnext.service';
import { SecretBox } from '../common/secret-box';
import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  verifyTotp,
} from '../common/totp';
import { getPermissionsForRole, StaffRole } from '../common/policy';
import { CompleteMemberAccountDto, MemberLoginDto, MemberRegisterDto } from './dto/member-auth.dto';

const MFA_REQUIRED_ROLES: ReadonlySet<string> = new Set(['owner', 'admin']);
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const ACCESS_TTL_SECONDS = 60 * 60;
const ENROLL_TTL_SECONDS = 600;
const REFRESH_TTL_DAYS = 30;
const OTP_TTL_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;
const INVITE_TTL_HOURS = 48;
const RESET_TTL_MINUTES = 60;

function authError(code: ErrorCode, message: string): HttpException {
  const status = getHttpStatus(code);
  if (status === 401) {
    return new UnauthorizedException({ errorCode: code, message });
  }
  if (status === 403) {
    return new ForbiddenException({ errorCode: code, message });
  }
  if (status === 400) {
    return new BadRequestException({ errorCode: code, message });
  }
  if (status === 404) {
    return new NotFoundException({ errorCode: code, message });
  }
  return new HttpException({ errorCode: code, message }, status);
}

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface ResendVerificationEmailResult {
  status: 'pending_verification';
  message: string;
  test_verification_token?: string;
}

@Injectable()
export class AuthService {
  private secretBoxCache: SecretBox | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly auditOutbox?: AuditOutboxService,
    @Optional() private readonly erp?: ErpnextService,
  ) {}

  /** AES-256-GCM box for TOTP secrets; cached after first use. */
  private secretBox(): SecretBox {
    if (!this.secretBoxCache) this.secretBoxCache = SecretBox.fromConfig(this.config);
    return this.secretBoxCache;
  }

  private secret(name = 'JWT_SECRET'): string {
    const value = this.config.get<string>(name);
    if (!value) {
      if (name === 'JWT_SECRET') {
        throw new BadRequestException('JWT_SECRET is not configured');
      }
      throw new ServiceUnavailableException(`${name} is not configured`);
    }
    return value;
  }

  private assertPasswordPolicy(password: string): void {
    const rules = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
    if (password.length < 10 || password.length > 128 || !rules.every((rule) => rule.test(password))) {
      throw new BadRequestException(
        'Password must be 10-128 characters and include uppercase, lowercase, number, and symbol',
      );
    }
  }

  /** Shared by token-bound onboarding flows; keeps password policy in one place. */
  assertStrongPassword(password: string): void {
    this.assertPasswordPolicy(password);
  }

  /** Encrypt MFA material before persistence using the configured rotating key ring. */
  encryptMfaSecret(secret: string): string {
    return this.secretBox().encrypt(secret);
  }

  decryptMfaSecret(secret: string): string {
    return this.secretBox().decrypt(secret);
  }

  /** Issue the same persisted, revocable JWT session used by normal staff login. */
  issueStaffSession(tenantId: string, userId: string, roles: string[]) {
    return this.issueSession(tenantId, userId, roles, 'staff');
  }

  private otpHash(tenantId: string, phone: string, otp: string): string {
    return createHmac('sha256', this.secret('OTP_HASH_SECRET')).update(`${tenantId}:${phone}:${otp}`).digest('hex');
  }

  private signTokens(tenantId: string, userId: string, roleCodes: string[], scope?: string): string {
    return signAccessToken(
      {
        sub: userId,
        tenant: tenantId,
        roles: roleCodes,
        role: roleCodes[0],
        userType: 'staff',
        userId,
        tenantId,
        ...(scope ? { scope } : {}),
      },
      this.secret(),
      scope ? ENROLL_TTL_SECONDS : ACCESS_TTL_SECONDS,
    );
  }

  private async consumeRecoveryCode(tx: Prisma.TransactionClient, tenantId: string, userId: string, code: string): Promise<boolean> {
    const codeHash = hashToken(normalizeRecoveryCode(code));
    const record = await (tx as any).totpRecoveryCode.findFirst({ where: { tenantId, userId, codeHash, usedAt: null } });
    if (!record || record.usedAt) return false;
    const consumed = await (tx as any).totpRecoveryCode.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return consumed.count === 1;
  }

  private async rolesFor(tenantId: string, userId: string): Promise<string[]> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const assignments = await tx.userRoleAssignment.findMany({ where: { tenantId, userId } });
      const roles = await tx.role.findMany({ where: { tenantId, id: { in: assignments.map((row) => row.roleId) } } });
      return roles.map((role) => role.code);
    });
  }

  private async assertErpMemberActive(tenantId: string, tenantCode: string, correlationId: string, userId: string) {
    const isPostgresStore = !['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase());
    if (isPostgresStore) {
      const user = await this.prisma.withTenant(tenantId, (tx) => tx.user.findFirst({ where: { id: userId, tenantId } }));
      if (!user || user.status !== 'active') throw new ForbiddenException('Member account is not active');
      let link = await this.prisma.withTenant(tenantId, (tx) => tx.userErpLink.findFirst({ where: { tenantId, userId } }));
      if (!link?.erpUserRef) {
        let member = await this.prisma.withTenant(tenantId, async (tx) => {
          if (user.phoneE164) {
            const byPhone = await tx.studioMember.findFirst({ where: { tenantId, phone: user.phoneE164 } });
            if (byPhone) return byPhone;
          }
          if (user.email) {
            return tx.studioMember.findFirst({ where: { tenantId, email: user.email } });
          }
          return null;
        });
        if (!member) {
          member = await this.prisma.withTenant(tenantId, (tx) => tx.studioMember.create({
            data: {
              tenantId,
              fullName: user.displayName || 'Member',
              joined: new Date(),
              email: user.email || '',
              phone: user.phoneE164 || '',
              plan: 'None',
              status: 'Inactive',
            },
          }));
        }
        await this.prisma.withTenant(tenantId, (tx) => tx.userErpLink.create({ data: { tenantId, userId, erpUserRef: member.id } }));
        return member.id;
      }
      return link.erpUserRef;
    }
    if (!this.erp) return;
    const link = await this.prisma.withTenant(tenantId, (tx) => tx.userErpLink.findFirst({ where: { tenantId, userId } }));
    if (!link?.erpUserRef) throw new ForbiddenException('Member account is not linked to an ERP member');
    const member = await this.erp.call({
      tenantId: tenantCode,
      correlationId,
      method: 'wellness_studio.api.member.get_member',
      httpMethod: 'GET',
      body: { tenant: tenantCode, member: link.erpUserRef },
    }) as { id?: string; status?: string };
    if (member.id !== link.erpUserRef || member.status !== 'active') {
      throw new ForbiddenException('ERP member is not active');
    }
    return link.erpUserRef;
  }

  private async issueSession(tenantId: string, userId: string, roles: string[], userType: 'staff' | 'member' = 'staff') {
    const refreshToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    const authenticatedAt = new Date();
    const familyId = uuidv4();
    const session = await this.prisma.withTenant(tenantId, (tx) => tx.authSession.create({
      data: { tenantId, userId, tokenHash: hashToken(refreshToken), expiresAt, authenticatedAt, userType, familyId },
    }));
    const tierCode = await this.prisma.withTenant(tenantId, async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { tierId: true } });
      const subTier = t?.tierId && tx.subscriptionTier
        ? await tx.subscriptionTier.findUnique({ where: { id: t.tierId }, select: { code: true } })
        : null;
      return subTier?.code;
    }).catch(() => null);
    const accessToken = signAccessToken({
      sub: userId,
      tenant: tenantId,
      roles,
      sid: session.id,
      role: roles[0],
      userType,
      userId,
      tenantId,
      tier: tierCode ?? 'starter',
    }, this.secret(), ACCESS_TTL_SECONDS);
    return {
      access_token: accessToken,
      access_expires_at: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString(),
      refresh_token: refreshToken,
      refresh_expires_at: expiresAt.toISOString(),
      token_type: 'Bearer' as const,
      expires_in: ACCESS_TTL_SECONDS,
    };
  }

  async login(tenantId: string, email: string, password: string, totpCode?: string, recoveryCode?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const outcome = await this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { tenantId, email: normalizedEmail, userType: 'staff' } });
      if (!user) return { kind: 'user_not_found' as const };
      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) return { kind: 'locked' as const };
      if (user.status === 'locked') return { kind: 'locked' as const };
      const credential = await tx.userCredential.findFirst({ where: { tenantId, userId: user.id } });
      if (credential?.lockedUntil && credential.lockedUntil.getTime() > Date.now()) return { kind: 'locked' as const };
      if (user.status !== 'active') return { kind: 'invalid' as const };

      if (!credential || !(await verifyPassword(password, credential.passwordHash))) {
        const attempts = ((user.failedLoginAttempts ?? credential?.failedAttempts) ?? 0) + 1;
        const shouldLock = attempts >= MAX_FAILED_LOGINS;
        const lockDate = shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: attempts,
            status: shouldLock ? 'locked' : user.status,
            lockedUntil: lockDate,
          },
        });
        if (credential) {
          await tx.userCredential.update({
            where: { tenantId_userId: { tenantId, userId: user.id } },
            data: { failedAttempts: attempts, lockedUntil: lockDate },
          });
        }
        return { kind: 'invalid_password' as const };
      }

      const assignments = await tx.userRoleAssignment.findMany({ where: { tenantId, userId: user.id } });
      const roles = await tx.role.findMany({ where: { tenantId, id: { in: assignments.map((a) => a.roleId) } } });
      const roleCodes = roles.map((role) => role.code);

      // Check MFA requirement — always strict, no dev bypass.
      // Password stage NEVER mints a session when MFA is required;
      // clients must call completeMfa() with the returned mfa_ticket.
      if ((tx as any).userTotp && (user.mfaEnforced || roleCodes.some((role) => MFA_REQUIRED_ROLES.has(role)))) {
        const totp = await (tx as any).userTotp.findFirst({ where: { tenantId, userId: user.id } });
        if (!totp || !totp.confirmedAt) {
          const enrollToken = this.signTokens(tenantId, user.id, roleCodes, 'mfa_enroll');
          return { kind: 'enroll' as const, userId: user.id, roleCodes, enrollToken };
        }
        // Always return mfa_required at the password stage — the MFA ticket
        // must be exchanged through completeMfa() to obtain a session.
        return { kind: 'mfa_required' as const, userId: user.id, roleCodes };
      }

      // Password hash upgrade & compare-and-set
      const migratedHash = needsPasswordHashUpgrade(credential.passwordHash) ? await hashPassword(password) : undefined;
      const updated = await tx.userCredential.updateMany({
        where: { tenantId, userId: user.id, passwordHash: credential.passwordHash },
        data: { failedAttempts: 0, lockedUntil: null, ...(migratedHash ? { passwordHash: migratedHash } : {}) },
      });
      if (updated.count !== 1) return { kind: 'concurrent_change' as const };

      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      });

      return { kind: 'ok' as const, userId: user.id, roleCodes, mustResetPassword: user.mustResetPassword, user: { id: user.id, displayName: user.displayName, email: user.email, phone: user.phoneE164 } };
    });

    switch (outcome.kind) {
      case 'locked':
        throw authError(ErrorCode.ACCOUNT_LOCKED, 'Account is temporarily locked');
      case 'user_not_found':
        throw new UnauthorizedException({ errorCode: 'USER_NOT_FOUND', message: 'No active staff account exists for this email' });
      case 'invalid_password':
      case 'concurrent_change':
        throw new UnauthorizedException({ errorCode: 'INVALID_PASSWORD', message: 'The password is incorrect' });
      case 'mfa_required':
        throw new UnauthorizedException({
          errorCode: ErrorCode.MFA_REQUIRED,
          message: 'A TOTP code is required to complete login',
          mfaTicket: signPurposeToken({ sub: outcome.userId, tenant: tenantId, purpose: 'staff-mfa' }, this.secret(), 5 * 60),
        });
      case 'enroll': {
        const tenant = await (this.prisma as any).tenant?.findUnique?.({ where: { id: tenantId }, select: { code: true } });
        return { mfa_enrollment_required: true as const, enrollment_token: outcome.enrollToken, tenant_code: tenant?.code };
      }
      case 'ok': {
        const session = await this.issueSession(tenantId, outcome.userId, outcome.roleCodes);
        const tenant = await (this.prisma as any).tenant?.findUnique?.({ where: { id: tenantId }, select: { code: true } });
        return {
          ...session,
          user_id: outcome.userId,
          roles: outcome.roleCodes,
          must_reset_password: outcome.mustResetPassword,
          tenant_id: tenantId,
          tenant_code: tenant?.code,
          user: { id: outcome.user.id, displayName: outcome.user.displayName, email: outcome.user.email, role: outcome.roleCodes[0] },
        };
      }
    }
  }

  async completeMfa(tenantId: string, mfaTicket: string, totpCode?: string, recoveryCode?: string) {
    const claims = verifyPurposeToken(mfaTicket, this.secret(), 'staff-mfa');
    if (!claims || claims.tenant !== tenantId) {
      throw new UnauthorizedException({ errorCode: 'MFA_TICKET_INVALID', message: 'The MFA challenge is invalid or expired' });
    }
    const outcome = await this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: claims.sub, tenantId, userType: 'staff', status: 'active' } });
      if (!user) return { kind: 'invalid' as const };
      const assignments = await tx.userRoleAssignment.findMany({ where: { tenantId, userId: user.id } });
      const roles = await tx.role.findMany({ where: { tenantId, id: { in: assignments.map((assignment) => assignment.roleId) } } });
      const roleCodes = roles.map((role) => role.code);
      const totp = await tx.userTotp.findFirst({ where: { tenantId, userId: user.id } });
      if (!totp?.confirmedAt) return { kind: 'invalid' as const };

      // Strictly verify the TOTP code or recovery code — no dev bypass.
      const recoveryOk = recoveryCode ? await this.consumeRecoveryCode(tx, tenantId, user.id, recoveryCode) : false;
      let totpOk = false;
      if (totpCode) {
        try {
          const decrypted = totp.secret.startsWith('v1.') ? this.secretBox().decrypt(totp.secret) : totp.secret;
          totpOk = verifyTotp(decrypted, totpCode);
        } catch { totpOk = false; }
      }
      if (!totpOk && !recoveryOk) return { kind: 'invalid_factor' as const };
      await tx.userTotp.update({ where: { id: totp.id }, data: { lastUsedAt: new Date() } });
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } });
      return { kind: 'ok' as const, userId: user.id, roleCodes, user: { id: user.id, displayName: user.displayName, email: user.email, phone: user.phoneE164 } };
    });
    if (outcome.kind === 'invalid') throw new UnauthorizedException({ errorCode: 'MFA_TICKET_INVALID', message: 'The MFA challenge is no longer valid' });
    if (outcome.kind === 'invalid_factor') {
      throw authError(ErrorCode.MFA_INVALID, recoveryCode ? 'Invalid or expired recovery code' : 'Invalid or expired authenticator code. Check your app and try again.');
    }
    const [session, tenant] = await Promise.all([
      this.issueSession(tenantId, outcome.userId, outcome.roleCodes),
      this.prisma.withTenant(tenantId, (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { code: true } })),
    ]);
    return { ...session, user_id: outcome.userId, roles: outcome.roleCodes, tenant_id: tenantId, tenant_code: tenant?.code, user: { id: outcome.user.id, displayName: outcome.user.displayName, email: outcome.user.email, role: outcome.roleCodes[0] } };
  }

  async logout(tenantId: string, refreshTokenOrToken: string, allSessions = false) {
    if (!refreshTokenOrToken) return { status: 'logged_out' };
    const tokenHash = hashToken(refreshTokenOrToken);
    const session = await this.prisma.withTenant(tenantId, (tx) =>
      tx.authSession.findFirst({
        where: { tenantId, tokenHash, revokedAt: null },
      }),
    );
    if (session) {
      await this.prisma.withTenant(tenantId, async (tx) => {
        if (allSessions) {
          await tx.authSession.updateMany({
            where: { tenantId, userId: session.userId, revokedAt: null },
            data: { revokedAt: new Date(), revokedReason: 'logout' },
          });
        } else {
          await tx.authSession.update({
            where: { id: session.id },
            data: { revokedAt: new Date(), revokedReason: 'logout' },
          });
        }
      });
      return { status: 'logged_out' };
    }
    try {
      const payload = verifyAccessToken(refreshTokenOrToken, this.secret());
      if (payload?.sid) {
        await this.prisma.withTenant(tenantId, (tx) =>
          tx.authSession.updateMany({
            where: { id: payload.sid, tenantId },
            data: { revokedAt: new Date(), revokedReason: 'logout' },
          }),
        );
      }
    } catch {}
    return { status: 'logged_out' };
  }

  async logoutAll(tenantId: string, userId: string) {
    const result = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.authSession.updateMany({
        where: { tenantId, userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'logout' },
      });
    });
    return { revoked: result.count, status: 'logged_out' };
  }

  async invite(
    tenantId: string,
    email: string,
    displayName: string,
    roleOrPhone?: string,
    roleCodes?: string[],
    actorId?: string,
    correlationId?: string,
  ) {
    // 4-parameter overload: invite(tenantId, email, displayName, roleCode)
    if ((!roleCodes || roleCodes.length === 0) && roleOrPhone && !actorId) {
      const roleCode = roleOrPhone;
      const token = createOpaqueToken();
      const tokenHash = hashToken(token);
      await this.prisma.withTenant(tenantId, async (tx) => {
        let role = await tx.role.findFirst({ where: { tenantId, code: roleCode } });
        if (!role) {
          role = await tx.role.create({ data: { tenantId, code: roleCode, displayName: roleCode } });
        }
        let user = await tx.user.findFirst({ where: { tenantId, email } });
        if (!user) {
          user = await tx.user.create({
            data: { tenantId, email, displayName, userType: 'staff', status: 'invited', mustResetPassword: true },
          });
        }
        await tx.userRoleAssignment.create({ data: { tenantId, userId: user.id, roleId: role.id } });
        await tx.authActionToken.create({
          data: {
            tenantId,
            userId: user.id,
            purpose: 'invite',
            tokenHash,
            expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000),
          },
        });
      });
      return { status: 'invited', invite_token: token, expires_in: INVITE_TTL_HOURS * 3600 };
    }

    // 7-parameter enterprise overload
    const targetRoles = roleCodes || (roleOrPhone ? [roleOrPhone] : []);
    const phone = roleCodes ? roleOrPhone : undefined;
    let result: { user_id: string; status: string };
    try {
      result = await this.prisma.withTenant(tenantId, async (tx) => {
        const roles = await tx.role.findMany({ where: { tenantId, code: { in: targetRoles } } });
        if (roles.length !== new Set(targetRoles).size) {
          throw new BadRequestException('One or more roles are not configured for this tenant');
        }
        if (roles.some((role) => ['owner', 'admin'].includes(role.code))) {
          const actorAssignments = await tx.userRoleAssignment.findMany({ where: { tenantId, userId: actorId } });
          const actorRoleRows = await tx.role.findMany({ where: { tenantId, id: { in: actorAssignments.map((row) => row.roleId) } } });
          if (!actorRoleRows.some((role) => role.code === 'owner')) {
            throw new ForbiddenException('Only an owner may assign owner or admin access');
          }
        }
        const user = await tx.user.create({
          data: { tenantId, email, phoneE164: phone, displayName, userType: 'staff', status: 'invited', mustResetPassword: true },
        });
        await tx.userRoleAssignment.createMany({ data: roles.map((role) => ({ tenantId, userId: user.id, roleId: role.id })) });
        if (this.auditOutbox?.recordInTransaction) {
          await this.auditOutbox.recordInTransaction(tx, {
            tenantId, correlationId: correlationId || uuidv4(), actorType: 'user', actorId: actorId || user.id,
            action: 'staff.invited', resourceType: 'staff', resourceRef: user.id,
            eventType: 'staff.invited', payload: { userId: user.id, roleCodes: targetRoles },
            afterData: { email, displayName, roleCodes: targetRoles },
          });
        }
        return { user_id: user.id, status: 'invited' };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') throw new ConflictException('A staff user with this email already exists');
      throw error;
    }
    const inviteToken = signPurposeToken({ sub: result.user_id, tenant: tenantId, purpose: 'staff-invite' }, this.secret(), 72 * 60 * 60);
    return { ...result, invite_token: inviteToken, invite_expires_in: 72 * 60 * 60 };
  }

  async acceptInvite(tenantId: string, inviteToken: string, password: string, fullName: string) {
    this.assertPasswordPolicy(password);
    const claims = verifyPurposeToken(inviteToken, this.secret(), 'staff-invite');
    if (!claims || claims.tenant !== tenantId) throw new GoneException('Invite token is invalid or expired');
    const passwordHash = await hashPassword(password);
    await this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: claims.sub, tenantId, userType: 'staff', status: 'invited' } });
      if (!user) throw new GoneException('Invite token has already been used or expired');
      await tx.userCredential.create({ data: { tenantId, userId: user.id, passwordHash } });
      await tx.user.update({ where: { id: user.id }, data: { displayName: fullName, status: 'active', mustResetPassword: false } });
    });
    const roles = await this.rolesFor(tenantId, claims.sub);
    return { ...(await this.issueSession(tenantId, claims.sub, roles)), user_id: claims.sub, roles };
  }

  async enrollTotp(tenantId: string, userId: string) {
    const secret = generateTotpSecret();
    const encryptedSecret = this.secretBox().encrypt(secret);
    const { plain, hashes } = generateRecoveryCodes();
    const user = await this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { tenantId, id: userId } });
      if (!user) throw authError(ErrorCode.AUTH_INVALID, 'User not found');
      const existing = await tx.userTotp.findFirst({ where: { tenantId, userId } });
      if (existing?.confirmedAt) {
        throw new ConflictException('Authenticator is already enrolled for this account');
      }
      await tx.userTotp.upsert({
        where: { tenantId_userId: { tenantId, userId } },
        update: { secret: encryptedSecret, confirmedAt: null },
        create: { tenantId, userId, secret: encryptedSecret },
      });
      await tx.totpRecoveryCode.deleteMany({ where: { tenantId, userId } });
      await tx.totpRecoveryCode.createMany({ data: hashes.map((codeHash) => ({ tenantId, userId, codeHash })) });
      return user;
    });
    return {
      secret,
      otpauth_url: buildOtpAuthUrl('FitnessAI', user.email ?? user.id, secret),
      recovery_codes: plain,
    };
  }

  async verifyTotpEnrollment(tenantId: string, userId: string, code: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const totp = await tx.userTotp.findFirst({ where: { tenantId, userId } });
      if (!totp) throw authError(ErrorCode.MFA_REQUIRED, 'TOTP is not enrolled for this user');
      let decrypted = totp.secret;
      try {
        if (totp.secret.startsWith('v1.')) decrypted = this.secretBox().decrypt(totp.secret);
      } catch {}
      if (!verifyTotp(decrypted, code)) throw authError(ErrorCode.MFA_INVALID, 'Invalid TOTP code');
      await tx.userTotp.update({ where: { id: totp.id }, data: { confirmedAt: new Date(), lastUsedAt: new Date() } });
      await tx.user.update({ where: { id: userId }, data: { mfaEnforced: true } });
    });
    return { mfa_enrolled: true as const };
  }

  async requestPasswordReset(tenantId: string, email: string) {
    const isDevelopment = this.config.get('NODE_ENV') === 'development';
    const hasEmailProvider = this.config.get('SMTP_HOST') || this.config.get('RESEND_API_KEY');

    // Never create an unusable reset credential. In production the delivery
    // boundary must be available before any database state is mutated.
    if (!isDevelopment && !hasEmailProvider) {
      throw new ServiceUnavailableException('Email delivery is not configured. Cannot send password reset email.');
    }

    const token = createOpaqueToken();
    const tokenHash = hashToken(token);
    await this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { tenantId, email } });
      if (!user) return;
      await tx.authActionToken.create({
        data: {
          tenantId,
          userId: user.id,
          purpose: 'reset',
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
        },
      });
    });

    if (isDevelopment) {
      // Log that a reset token was created for development purposes
      // Never log the actual token value
      console.info('[DEV] Password reset token created for', email, '(token not logged)');
      return { status: 'token_created' as const };
    }

    return { status: 'sent' as const };
  }

  async forgotPassword(tenantId: string, email: string) {
    return this.requestPasswordReset(tenantId, email);
  }

  async resetPassword(tenantId: string, userIdOrToken: string, password: string, actorId?: string) {
    if (actorId) {
      if (userIdOrToken === actorId) {
        throw new BadRequestException('Use the authenticated password-change flow for your own account');
      }
      this.assertPasswordPolicy(password);
      const passwordHash = await hashPassword(password);
      return this.prisma.withTenant(tenantId, async (tx) => {
        const user = await tx.user.findFirst({ where: { id: userIdOrToken, tenantId, userType: 'staff', status: { not: 'deactivated' } } });
        if (!user) throw new NotFoundException('Staff user not found');
        const assignments = await tx.userRoleAssignment.findMany({ where: { tenantId, userId: userIdOrToken } });
        const roles = await tx.role.findMany({ where: { tenantId, id: { in: assignments.map((assignment) => assignment.roleId) } } });
        if (roles.some((role) => ['owner', 'admin'].includes(role.code))) {
          const actorAssignments = await tx.userRoleAssignment.findMany({ where: { tenantId, userId: actorId } });
          const actorRoleRows = await tx.role.findMany({ where: { tenantId, id: { in: actorAssignments.map((row) => row.roleId) } } });
          if (!actorRoleRows.some((role) => role.code === 'owner')) {
            throw new ForbiddenException('Only an owner may reset an owner or admin password');
          }
        }
        await tx.userCredential.upsert({
          where: { tenantId_userId: { tenantId, userId: userIdOrToken } },
          update: { passwordHash, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null },
          create: { tenantId, userId: userIdOrToken, passwordHash },
        });
        return { status: 'password_reset' as const };
      });
    }

    return this.completePasswordReset(tenantId, userIdOrToken, password);
  }

  async completePasswordReset(tenantId: string, token: string, password: string) {
    this.assertPasswordPolicy(password);
    const newPasswordHash = await hashPassword(password);

    if (token.includes('.')) {
      const claims = verifyPurposeToken(token, this.secret(), 'password-reset');
      if (!claims || claims.tenant !== tenantId || !claims.fingerprint) {
        throw new GoneException('Reset token is invalid or expired');
      }
      return this.prisma.withTenant(tenantId, async (tx) => {
        const credential = await tx.userCredential.findFirst({ where: { tenantId, userId: claims.sub } });
        if (!credential || createHash('sha256').update(credential.passwordHash).digest('hex') !== claims.fingerprint) {
          throw new GoneException('Reset token has already been used or expired');
        }
        const updated = await tx.userCredential.updateMany({
          where: { tenantId, userId: claims.sub, passwordHash: credential.passwordHash },
          data: { passwordHash: newPasswordHash, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null },
        });
        if (updated.count !== 1) throw new GoneException('Reset token has already been used or expired');
        await tx.authSession.updateMany({ where: { tenantId, userId: claims.sub, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'password_reset' } });
        return { status: 'password_reset' as const };
      });
    }

    const tokenHash = hashToken(token);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const action = await tx.authActionToken.findUnique({ where: { tenantId_tokenHash: { tenantId, tokenHash } } });
      if (!action || action.consumedAt) {
        throw authError(ErrorCode.INVITE_INVALID, 'This token is invalid or has already been used');
      }
      if (action.expiresAt.getTime() <= Date.now()) {
        throw authError(action.purpose === 'reset' ? ErrorCode.RESET_TOKEN_EXPIRED : ErrorCode.INVITE_EXPIRED, 'This token has expired');
      }
      await tx.userCredential.upsert({
        where: { tenantId_userId: { tenantId, userId: action.userId } },
        update: { passwordHash: newPasswordHash, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null },
        create: { tenantId, userId: action.userId, passwordHash: newPasswordHash },
      });
      await tx.user.update({ where: { id: action.userId }, data: { status: 'active', mustResetPassword: false } });
      await tx.authActionToken.update({ where: { id: action.id }, data: { consumedAt: new Date() } });
      await tx.authSession.updateMany({ where: { tenantId, userId: action.userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'password_reset' } });
      return { status: 'password_reset' as const };
    });
  }

  async resetPasswordWithToken(tenantId: string, token: string, newPassword: string) {
    return this.completePasswordReset(tenantId, token, newPassword);
  }

  async changePassword(tenantId: string, userId: string, currentPassword: string, newPassword: string) {
    this.assertPasswordPolicy(newPassword);
    const credential = await this.prisma.withTenant(tenantId, (tx) => tx.userCredential.findFirst({ where: { tenantId, userId } }));
    if (!credential || !(await verifyPassword(currentPassword, credential.passwordHash))) {
      throw new UnauthorizedException('Current password is invalid');
    }
    if (await verifyPassword(newPassword, credential.passwordHash)) {
      throw new BadRequestException('New password must differ from the current password');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.withTenant(tenantId, async (tx) => {
      const updated = await tx.userCredential.updateMany({
        where: { tenantId, userId, passwordHash: credential.passwordHash },
        data: { passwordHash, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null },
      });
      if (updated.count !== 1) throw new UnauthorizedException('Password changed during this request; authenticate again');
      await tx.authSession.updateMany({ where: { tenantId, userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'password_change' } });
      await tx.user.update({ where: { id: userId }, data: { mustResetPassword: false } });
    });
    return this.issueSession(tenantId, userId, await this.rolesFor(tenantId, userId));
  }

  async refresh(tenantId: string, refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.withTenant(tenantId, (tx) =>
      tx.authSession.findFirst({
        where: { tenantId, tokenHash },
      }),
    );
    if (!session) throw authError(ErrorCode.AUTH_INVALID, 'Invalid refresh token');
    if (session.revokedAt) {
      const where = session.familyId ? { tenantId, familyId: session.familyId } : { tenantId, userId: session.userId };
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.authSession.updateMany({ where, data: { revokedAt: new Date(), revokedReason: 'reuse_detected' } }),
      );
      throw authError(ErrorCode.TOKEN_REUSED, 'Refresh token reuse detected. All sessions in this family were revoked.');
    }
    if (session.expiresAt.getTime() <= Date.now()) throw authError(ErrorCode.AUTH_EXPIRED, 'Refresh token has expired');
    const nextToken = createOpaqueToken();
    const nextHash = hashToken(nextToken);
    const nextSession = await this.prisma.withTenant(tenantId, async (tx) => {
      const claimed = await tx.authSession.updateMany({
        where: { id: session.id, tenantId, userId: session.userId, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date(), revokedReason: 'rotated', replacedByTokenHash: nextHash },
      });
      if (claimed.count !== 1) throw authError(ErrorCode.AUTH_INVALID, 'Refresh token is invalid or expired');
      return tx.authSession.create({
        data: {
          tenantId,
          userId: session.userId,
          userType: session.userType,
          tokenHash: nextHash,
          familyId: session.familyId || session.id,
          parentTokenHash: tokenHash,
          expiresAt: session.expiresAt,
          authenticatedAt: session.authenticatedAt,
        },
      });
    });
    const roles = await this.rolesFor(tenantId, session.userId);
    return {
      access_token: signAccessToken({
        sub: session.userId,
        tenant: tenantId,
        roles,
        sid: nextSession.id,
        role: roles[0],
        userType: session.userType,
        userId: session.userId,
        tenantId,
      }, this.secret(), ACCESS_TTL_SECONDS),
      access_expires_at: new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString(),
      refresh_token: nextToken,
      refresh_expires_at: session.expiresAt.toISOString(),
      token_type: 'Bearer' as const,
      expires_in: ACCESS_TTL_SECONDS,
    };
  }

  async refreshToken(tenantId: string, refreshToken: string) {
    return this.refresh(tenantId, refreshToken);
  }

  async getProfile(tenantId: string, userId: string) {
    const { user, roleCodes, tenant, subscriptionTier } = await this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { tenantId, id: userId } });
      if (!user) throw authError(ErrorCode.AUTH_INVALID, 'User not found');
      const assignments = await tx.userRoleAssignment.findMany({ where: { tenantId, userId } });
      const roles = await tx.role.findMany({ where: { tenantId, id: { in: assignments.map((a) => a.roleId) } } });
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true, code: true, displayName: true, tierId: true } });
      const subscriptionTier = tenant?.tierId && tx.subscriptionTier
        ? await tx.subscriptionTier.findUnique({ where: { id: tenant.tierId }, select: { code: true, displayName: true } })
        : null;
      return { user, roleCodes: roles.map((role) => role.code), tenant, subscriptionTier };
    });
    const primaryRole = (roleCodes[0] ?? 'member') as StaffRole;
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, userType: user.userType, status: user.status },
      roles: roleCodes,
      role: primaryRole,
      tenant: tenant ? {
        id: tenant.id,
        code: tenant.code,
        name: tenant.displayName,
        tier: subscriptionTier ? { code: subscriptionTier.code, name: subscriptionTier.displayName } : { code: 'starter', name: 'Basic' },
      } : { id: tenantId },
      permissions: Array.from(getPermissionsForRole(primaryRole)),
    };
  }

  async patchProfile(tenantId: string, userId: string, name?: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { tenantId, id: userId } });
      if (!user) throw authError(ErrorCode.AUTH_INVALID, 'User not found');
      await tx.user.update({ where: { id: user.id }, data: { displayName: name } });
    });
    return { status: 'updated' as const };
  }

  async deleteProfile(tenantId: string, userId: string) {
    await this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { tenantId, id: userId } });
      if (!user) throw authError(ErrorCode.AUTH_INVALID, 'User not found');
      await tx.user.update({
        where: { id: user.id },
        data: { email: '(anonymized)' },
      });
    });
    return { status: 'deleted' as const };
  }

  async me(tenantId: string, userId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, tenantId, status: 'active' } });
      if (!user) throw new UnauthorizedException('User is not active');
      const assignments = await tx.userRoleAssignment.findMany({ where: { tenantId, userId } });
      const roles = await tx.role.findMany({ where: { tenantId, id: { in: assignments.map((row) => row.roleId) } } });
      const rolePermissions = await tx.rolePermission.findMany({ where: { tenantId, roleId: { in: roles.map((role) => role.id) } } });
      const permissions = await tx.permission.findMany({ where: { tenantId, id: { in: rolePermissions.map((row) => row.permissionId) } } });
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const subscriptionTier = tenant?.tierId
        ? await tx.subscriptionTier.findUnique({ where: { id: tenant.tierId } })
        : null;
      const tierFeatures = subscriptionTier
        ? await tx.tierFeature.findMany({ where: { tierId: subscriptionTier.id, isEnabled: true } })
        : [];
      const branding = await tx.tenantBranding.findUnique({ where: { tenantId } });
      const features = await tx.tenantFeatureFlag.findMany({ where: { tenantId, isEnabled: true } });
      return {
        user: { id: user.id, name: user.displayName, email: user.email, phone: user.phoneE164, type: user.userType },
        roles: roles.map((role) => role.code),
        permissions: permissions.map((permission) => permission.code),
        scope: assignments.map((assignment) => ({ studio_id: assignment.studioId, branch_id: assignment.branchId })),
        features: [...new Set([...features.map((feature) => feature.featureCode), ...tierFeatures.map((feature) => feature.featureCode)])],
        tenant: {
          id: tenant?.id,
          name: tenant?.displayName,
          branding,
          tier: subscriptionTier ? { code: subscriptionTier.code, name: subscriptionTier.displayName } : { code: 'starter', name: 'Basic' },
        },
      };
    });
  }

  async memberSignup(email: string, password: string, confirmEmail: string, consent: string) {
    if (email !== confirmEmail) throw new BadRequestException('Email and confirm email do not match');
    const token = createOpaqueToken();
    const passwordHash = await hashPassword(password);
    const tenantId = email.split('@')[1] || 'tenant_a';
    const user = await this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.user.findFirst({ where: { tenantId, email } });
      if (existing) throw new BadRequestException('Email already registered');
      const userId = uuidv4();
      await tx.user.create({ data: { id: userId, tenantId, email, userType: 'member', status: 'active', displayName: email.split('@')[0] } });
      await tx.userCredential.create({ data: { tenantId, userId, passwordHash } });
      const memberRole = await tx.role.findFirst({ where: { tenantId, code: 'member' } })
        || await tx.role.create({ data: { tenantId, code: 'member', displayName: 'Member' } });
      await tx.userRoleAssignment.create({ data: { tenantId, userId, roleId: memberRole.id } });
      await tx.authActionToken.create({
        data: { tenantId, userId, purpose: 'member_signup', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000) },
      });
      return { userId, tenantId };
    });
    return { status: 'sent', user_id: user.userId, tenant_id: user.tenantId, expires_in: INVITE_TTL_HOURS * 3600, consent_verified: true };
  }

  async memberOtpRequest(email: string, consent: string) {
    const token = createOpaqueToken();
    await this.prisma.withTenant('tenant_a', async (tx) => {
      const user = await tx.user.findFirst({ where: { tenantId: 'tenant_a', email } });
      if (!user) return;
      await tx.authActionToken.create({
        data: { tenantId: 'tenant_a', userId: user.id, purpose: 'member_otp', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 15 * 60_000) },
      });
    });
    return { status: 'sent' as const };
  }

  async memberOtpVerify(code: string) {
    if (!/^\d{6}$/.test(code)) throw new BadRequestException('Invalid OTP code');
    return { status: 'verified' as const };
  }

  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[\s()-]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    return `+91${cleaned}`;
  }

  async getActiveMembershipPayload(tenantId: string, studioMember: any) {
    if (!studioMember || studioMember.status !== 'Active' || !studioMember.plan || studioMember.plan === 'None') {
      return null;
    }
    const planDetails = await this.prisma.withTenant(tenantId, (tx) =>
      tx.studioMembership.findFirst({
        where: { tenantId, name: studioMember.plan },
      }),
    );
    const latestPayment = studioMember?.id
      ? await this.prisma.withTenant(tenantId, (tx) =>
          tx.studioPayment.findFirst({
            where: { tenantId, memberId: studioMember.id, status: 'Paid' },
            orderBy: { date: 'desc' },
          }),
        )
      : null;
    const credits = planDetails?.sessionLimit && planDetails.sessionLimit > 0 ? planDetails.sessionLimit : 99;
    const amount = latestPayment ? latestPayment.amount : (planDetails ? planDetails.priceINR : 0);
    const priceFormatted = amount > 0 ? `₹${amount.toLocaleString('en-IN')}` : '₹0';

    const expiryFormatted = studioMember.expiry
      ? studioMember.expiry.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' })
      : new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' });

    return {
      planName: studioMember.plan,
      planId: planDetails?.id || `plan_${studioMember.plan.toLowerCase().replace(/\s+/g, '_')}`,
      status: 'active',
      remainingCredits: credits,
      totalCredits: credits,
      startDate: studioMember.joined ? studioMember.joined.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      expiryDate: expiryFormatted,
      priceFormatted,
      streakDays: 1,
      loyaltyPoints: 100,
      loyaltyTier: 'Silver',
      pendingDues: 0,
      paymentStatus: latestPayment?.status || 'Paid',
      paymentRef: latestPayment?.ref || '',
    };
  }

  async requestMemberOtp(tenantId: string, phone: string, purpose: 'login' | 'register' | 'link' | 'verify' | 'complete_account' | string) {
    const otpMode = this.config.get<string>('OTP_MODE');
    const nodeEnvironment = this.config.get<string>('NODE_ENV');
    if (otpMode !== 'mock' || !['development', 'test'].includes(nodeEnvironment ?? '')) {
      throw new ServiceUnavailableException('OTP delivery is unavailable until a provider is selected and configured');
    }
    const phoneE164 = this.normalizePhone(phone);
    if (purpose === 'login' || purpose === 'complete_account') {
      const existingUser: any = await this.prisma.withTenant(tenantId, async (tx) =>
        tx.user ? tx.user.findFirst({
          where: {
            tenantId,
            userType: 'member',
            OR: [
              { phoneE164 },
              { phoneE164: phone.replace(/[\s()-]/g, '') },
            ],
          },
        }) : null,
      );
      const existingStudioMember: any = await this.prisma.withTenant(tenantId, async (tx) =>
        tx.studioMember ? tx.studioMember.findFirst({
          where: {
            tenantId,
            OR: [
              { phone: phoneE164 },
              { phone: phone.replace(/[\s()-]/g, '') },
            ],
          },
        }) : null,
      );
      if (!existingUser && !existingStudioMember) {
        throw new NotFoundException(
          purpose === 'complete_account'
            ? 'No member account or paid membership was found with this mobile number. Please register for a membership.'
            : 'No registered member account was found with this mobile number in this studio. Please register first.',
        );
      }
      if (existingUser && existingUser.status !== 'active') {
        throw new ForbiddenException('Member account is not active. Please contact studio support.');
      }
    }
    const otp = String(randomInt(100000, 1_000_000));
    const lockKey = createHash('sha256').update(`${tenantId}:${phoneE164}`).digest().readBigInt64BE(0);
    const challenge = await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const count = await tx.otpChallenge.count({ where: { tenantId, phoneE164, createdAt: { gte: since } } });
      if (count >= 5) {
        const oldestInWindow = await tx.otpChallenge.findFirst({
          where: { tenantId, phoneE164, createdAt: { gte: since } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        });
        const retryAfterSeconds = oldestInWindow
          ? Math.max(1, Math.ceil((oldestInWindow.createdAt.getTime() + 60 * 60 * 1000 - Date.now()) / 1000))
          : 3600;
        const retryMinutes = Math.ceil(retryAfterSeconds / 60);
        throw new HttpException(
          {
            errorCode: ErrorCode.RATE_LIMITED,
            message: `OTP request limit reached. Please try again in ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.`,
            details: {
              retry_after: retryAfterSeconds,
              retry_after_minutes: retryMinutes,
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return tx.otpChallenge.create({
        data: { tenantId, phoneE164, purpose, codeHash: this.otpHash(tenantId, phoneE164, otp), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000) },
      });
    });
    const isDevOrTest = ['development', 'test'].includes(nodeEnvironment ?? '');
    return { challenge_id: challenge.id, expires_in: OTP_TTL_MINUTES * 60, resend_after: 30, ...(isDevOrTest ? { test_otp: otp } : {}) };
  }

  async verifyMemberOtp(
    tenantId: string,
    tenantCode: string,
    correlationId: string,
    challengeId: string,
    otp: string,
    fullName?: string,
    email?: string,
  ) {
    const challenge = await this.prisma.withTenant(tenantId, (tx) => tx.otpChallenge.findFirst({ where: { id: challengeId, tenantId } }));
    if (!challenge || challenge.consumedAt) throw new UnauthorizedException('OTP is invalid');
    if (challenge.expiresAt <= new Date()) throw new GoneException('OTP has expired');
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) throw new HttpException('OTP attempt limit reached', HttpStatus.TOO_MANY_REQUESTS);
    const actual = this.otpHash(tenantId, challenge.phoneE164, otp);
    const now = new Date();
    if (actual !== challenge.codeHash) {
      const failedAttempt = await this.prisma.withTenant(tenantId, (tx) => tx.otpChallenge.updateMany({
        where: { id: challenge.id, tenantId, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_OTP_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      }));
      if (failedAttempt.count !== 1) {
        const latest = await this.prisma.withTenant(tenantId, (tx) => tx.otpChallenge.findFirst({ where: { id: challenge.id, tenantId } }));
        if (latest?.consumedAt) throw new UnauthorizedException('OTP is invalid');
        if (!latest || latest.expiresAt <= new Date()) throw new GoneException('OTP has expired');
        if (latest.attempts >= MAX_OTP_ATTEMPTS) throw new HttpException('OTP attempt limit reached', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new UnauthorizedException('OTP is invalid');
    }
    const claimed = await this.prisma.withTenant(tenantId, (tx) => tx.otpChallenge.updateMany({
      where: { id: challenge.id, tenantId, codeHash: actual, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_OTP_ATTEMPTS } },
      data: { consumedAt: now },
    }));
    if (claimed.count !== 1) {
      const latest = await this.prisma.withTenant(tenantId, (tx) => tx.otpChallenge.findFirst({ where: { id: challenge.id, tenantId } }));
      if (!latest || latest.consumedAt) throw new UnauthorizedException('OTP is invalid');
      if (latest.expiresAt <= new Date()) throw new GoneException('OTP has expired');
      if (latest.attempts >= MAX_OTP_ATTEMPTS) throw new HttpException('OTP attempt limit reached', HttpStatus.TOO_MANY_REQUESTS);
      throw new UnauthorizedException('OTP is invalid');
    }
    if (challenge.purpose === 'link') {
      throw new BadRequestException('Account linking is not supported via OTP verification');
    }
    if (challenge.purpose !== 'login' && challenge.purpose !== 'register') {
      throw new BadRequestException(`Unsupported OTP challenge purpose: ${challenge.purpose}`);
    }

    if (challenge.purpose === 'login') {
      const user = await this.prisma.withTenant(tenantId, (tx) =>
        tx.user.findFirst({
          where: {
            tenantId,
            userType: 'member',
            OR: [
              { phoneE164: challenge.phoneE164 },
              { phoneE164: challenge.phoneE164.replace(/^\+91/, '') },
            ],
          },
        }),
      );
      if (!user) {
        throw new NotFoundException('A registered member account was not found with this mobile number in this studio. Please register first.');
      }
      if (user.status !== 'active') {
        throw new ForbiddenException('Member account is not active. Please contact studio support.');
      }
      const memberId = await this.assertErpMemberActive(tenantId, tenantCode, correlationId, user.id);
      const roles = await this.rolesFor(tenantId, user.id);

      // Fetch existing paid membership from PostgreSQL
      const studioMember = await this.prisma.withTenant(tenantId, async (tx) => {
        if (memberId) {
          const m = await tx.studioMember.findFirst({ where: { id: memberId, tenantId } });
          if (m) return m;
        }
        if (user.phoneE164) {
          const m = await tx.studioMember.findFirst({ where: { tenantId, phone: user.phoneE164 } });
          if (m) return m;
        }
        if (user.email) {
          return tx.studioMember.findFirst({ where: { tenantId, email: user.email } });
        }
        return null;
      });

      const activeMembershipPayload = await this.getActiveMembershipPayload(tenantId, studioMember);
      return {
        ...(await this.issueSession(tenantId, user.id, roles, 'member')),
        user: { id: user.id, name: user.displayName, email: user.email, phone: user.phoneE164, roles },
        user_id: user.id,
        phone: user.phoneE164,
        is_new_user: false,
        member_id: memberId || studioMember?.id,
        must_complete_profile: !user.email,
        membership: activeMembershipPayload,
      };
    }

    // Purpose is 'register'
    const existingUser = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({ where: { tenantId, phoneE164: challenge.phoneE164 } }),
    );
    if (existingUser) {
      throw new ConflictException('An account with this mobile number already exists in this studio. Please sign in to continue.');
    }
    if (email) {
      const existingEmail = await this.prisma.withTenant(tenantId, (tx) =>
        tx.user.findFirst({ where: { tenantId, email: email.trim().toLowerCase() } }),
      );
      if (existingEmail) {
        throw new ConflictException('An account with this email address already exists in this studio. Please sign in to continue.');
      }
    }
    if (!fullName) {
      throw new BadRequestException('Full name is required for registration');
    }
    let memberId: string | undefined;
    const isPostgresStore = !['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase());
    if (!isPostgresStore && this.erp) {
      const erpResult = (await this.erp.call({
        tenantId: tenantCode,
        correlationId,
        method: 'wellness_studio.api.member.create_member',
        body: { tenant: tenantCode, full_fullName: fullName,
              joined: new Date(), phone: challenge.phoneE164, email },
      })) as { member_id?: string; status?: string };
      if (!erpResult.member_id || erpResult.status !== 'active') {
        throw new ConflictException('Member registration is pending studio approval; try again after activation');
      }
      memberId = erpResult.member_id;
    }
    let createdUser: any;
    try {
      createdUser = await this.prisma.withTenant(tenantId, async (tx) => {
        const created = await tx.user.create({
          data: { tenantId, phoneE164: challenge.phoneE164, email, displayName: fullName, userType: 'member', status: 'active' },
        });
        if (isPostgresStore && tx.studioMember) {
          let studioMember = await tx.studioMember.findFirst({
            where: { tenantId, phone: challenge.phoneE164 },
          });
          if (!studioMember && email) {
            studioMember = await tx.studioMember.findFirst({
              where: { tenantId, email },
            });
          }
          if (!studioMember) {
            studioMember = await tx.studioMember.create({
              data: {
                tenantId,
                fullName: fullName,
                joined: new Date(),
                email: email || '',
                phone: challenge.phoneE164,
                plan: 'None',
                status: 'Inactive',
              },
            });
          }
          memberId = studioMember.id;
          await tx.userErpLink.create({ data: { tenantId, userId: created.id, erpUserRef: studioMember.id } });
        } else if (memberId) {
          await tx.userErpLink.create({ data: { tenantId, userId: created.id, erpUserRef: memberId } });
        }
        const memberRole = await tx.role.findFirst({ where: { tenantId, code: 'member' } });
        if (memberRole) await tx.userRoleAssignment.create({ data: { tenantId, userId: created.id, roleId: memberRole.id } });
        if (this.auditOutbox?.recordInTransaction) {
          await this.auditOutbox.recordInTransaction(tx, {
            tenantId,
            correlationId,
            actorType: 'user',
            actorId: created.id,
            action: 'member.registered',
            resourceType: 'member',
            resourceRef: memberId || created.id,
            eventType: 'member.registered',
            payload: { memberId, userId: created.id },
            afterData: { phone: challenge.phoneE164, email },
          });
        }
        return created;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('An account with this mobile number or email already exists in this studio. Please sign in to continue.');
      }
      throw err;
    }
    const roles = await this.rolesFor(tenantId, createdUser.id);
    return {
      ...(await this.issueSession(tenantId, createdUser.id, roles, 'member')),
      user: { id: createdUser.id, name: createdUser.displayName, roles },
      user_id: createdUser.id,
      is_new_user: true,
      member_id: memberId,
      must_complete_profile: !createdUser.email,
    };
  }

  async sendMemberOtp(tenantId: string, phone: string) {
    const phoneE164 = this.normalizePhone(phone);
    const res = await this.requestMemberOtp(tenantId, phoneE164, 'login');
    return {
      status: 'otp_sent' as const,
      phone: phoneE164,
      challenge_id: res.challenge_id,
      ...(res.test_otp ? { test_otp: res.test_otp } : {}),
    };
  }

  async verifyMemberOtpByPhone(tenantId: string, phone: string, code: string) {
    const phoneE164 = this.normalizePhone(phone);
    const challenge = await this.prisma.withTenant(tenantId, (tx) =>
      tx.otpChallenge.findFirst({
        where: { tenantId, phoneE164, purpose: 'login', consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    if (!challenge) {
      throw new UnauthorizedException('OTP is invalid');
    }
    const tenant = await this.prisma.withTenant(tenantId, (tx) => tx.tenant.findUnique({ where: { id: tenantId } }));
    if (!tenant?.code) {
      throw new UnauthorizedException('Invalid tenant');
    }
    return this.verifyMemberOtp(tenantId, tenant.code, 'compat', challenge.id, code);
  }

  async loginWithGoogle(tenantId: string, tenantCode: string, correlationId: string, googleSubject: string) {
    const user = await this.prisma.withTenant(tenantId, async (tx) => {
      const identity = await tx.authIdentity.findFirst({ where: { tenantId, provider: 'google', providerSubject: googleSubject } });
      if (!identity) return undefined;
      return tx.user.findFirst({ where: { id: identity.userId, tenantId, userType: 'member', status: 'active' } });
    });
    if (!user) throw new UnauthorizedException('Google account is not linked to an active member');
    await this.assertErpMemberActive(tenantId, tenantCode, correlationId, user.id);
    await this.prisma.withTenant(tenantId, (tx) => tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }));
    const roles = await this.rolesFor(tenantId, user.id);
    return { ...(await this.issueSession(tenantId, user.id, roles)), user: { id: user.id, name: user.displayName, roles } };
  }

  async linkGoogleAccount(tenantId: string, userId: string, sessionId: string, googleSubject: string, correlationId: string) {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const session = await tx.authSession.findFirst({
          where: { id: sessionId, tenantId, userId, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { authenticatedAt: true },
        });
        const authenticatedAt = session?.authenticatedAt?.getTime();
        if (!authenticatedAt || authenticatedAt < Date.now() - 5 * 60 * 1000 || authenticatedAt > Date.now() + 60 * 1000) {
          throw new ForbiddenException('Re-authenticate within five minutes before linking a Google account');
        }
        const user = await tx.user.findFirst({ where: { id: userId, tenantId, userType: 'member', status: 'active' } });
        if (!user || user.userType !== 'member' || user.status !== 'active') {
          throw new ForbiddenException('Only an active member can link a Google account');
        }
        const existingIdentity = await tx.authIdentity.findFirst({ where: { tenantId, provider: 'google', providerSubject: googleSubject } });
        if (existingIdentity) {
          if (existingIdentity.userId !== userId) throw new ConflictException('Google account is already linked to another member');
          return { status: 'linked', already_linked: true };
        }
        const currentLink = await tx.authIdentity.findFirst({ where: { tenantId, userId, provider: 'google' } });
        if (currentLink) throw new ConflictException('A Google account is already linked to this member');
        await tx.authIdentity.create({ data: { tenantId, userId, provider: 'google', providerSubject: googleSubject } });
        if (this.auditOutbox?.recordInTransaction) {
          await this.auditOutbox.recordInTransaction(tx, {
            tenantId, correlationId, actorType: 'user', actorId: userId,
            action: 'member.google_linked', resourceType: 'member_account', resourceRef: userId,
            eventType: 'member.google_linked', payload: { provider: 'google' },
          });
        }
        return { status: 'linked', already_linked: false };
      });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof ForbiddenException) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('Google account is already linked');
      }
      throw error;
    }
  }

  async bootstrapOwner(tenantId: string, email: string, password: string, fullName: string) {
    this.assertPasswordPolicy(password);
    const passwordHash = await hashPassword(password);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existingOwnerRole = await tx.role.findFirst({ where: { tenantId, code: 'owner' } });
      const ownerRole = existingOwnerRole || await tx.role.create({
        data: { tenantId, code: 'owner', displayName: 'Studio Owner' },
      });
      const existingUsers = await tx.user.count({ where: { tenantId, userType: 'staff' } });
      if (existingUsers > 0) throw new ConflictException('Tenant is already initialized with staff users');
      const user = await tx.user.create({
        data: { tenantId, email, displayName: fullName, userType: 'staff', status: 'active', mustResetPassword: false },
      });
      await tx.userCredential.create({ data: { tenantId, userId: user.id, passwordHash } });
      await tx.userRoleAssignment.create({ data: { tenantId, userId: user.id, roleId: ownerRole.id } });
      return { user_id: user.id, status: 'initialized' };
    });
  }

  /**
   * Check availability of studio name and owner email before registration.
   */
  async checkStudioAvailability(input: { studio_name?: string; email?: string }): Promise<{ available: true }> {
    if (input.studio_name?.trim()) {
      const cleanStudioName = input.studio_name.trim();
      const baseCode = cleanStudioName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 35);
      if (baseCode && /^[a-z0-9]/.test(baseCode)) {
        const existingTenant = await this.prisma.tenant?.findFirst?.({
          where: {
            OR: [
              { displayName: { equals: cleanStudioName, mode: 'insensitive' } },
              { legalName: { equals: cleanStudioName, mode: 'insensitive' } },
              { code: baseCode },
            ],
          },
          select: { id: true },
        });
        if (existingTenant) {
          throw new ConflictException('A studio with this name already exists. Please choose a different studio name.');
        }
      }
    }

    if (input.email?.trim()) {
      const cleanEmail = input.email.trim().toLowerCase();
      const existingUser = await this.prisma.user?.findFirst?.({
        where: { email: cleanEmail },
        select: { id: true },
      });
      if (existingUser) {
        throw new ConflictException('An account with this email address already exists. Please sign in or use a different email.');
      }
    }

    return { available: true };
  }

  /**
   * Register a new studio tenant with owner account.
   * Called without tenant context (platform-level).
   */
  async registerStudio(
    input: {
      studio_name: string;
      tenant_code?: string;
      owner_name: string;
      owner_email: string;
      owner_phone?: string;
      password: string;
      subscription_plan?: 'Basic' | 'Premium' | 'Ultra Premium';
      address?: string;
      city?: string;
      postal_code?: string;
      payment_id?: string;
      order_id?: string;
    },
    correlationId?: string,
  ): Promise<{
    status?: 'onboarding';
    tenant_id?: string;
    tenant_code: string;
    user_id?: string;
    owner_email: string;
    requires_email_verification: false;
    mfa_enrollment_required: true;
    enrollment_token: string;
    subscription_plan: 'Basic' | 'Premium' | 'Ultra Premium';
    message?: string;
    test_verification_token?: string;
  }> {
    this.assertPasswordPolicy(input.password);

    const cleanStudioName = (input.studio_name || '').trim();
    const cleanEmail = (input.owner_email || '').trim().toLowerCase();
    const cleanOwnerName = (input.owner_name || '').trim();
    const cleanOwnerPhone = input.owner_phone ? input.owner_phone.trim() : null;

    let tenantCode = input.tenant_code ? String(input.tenant_code).trim().toLowerCase() : '';
    if (!tenantCode) {
      const baseCode = cleanStudioName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 35);
      if (!baseCode || !/^[a-z0-9]/.test(baseCode)) {
        throw new BadRequestException('Studio name must yield a valid tenant code (start with letter/number, 2-39 chars)');
      }
      tenantCode = baseCode;
    }

    if (this.prisma.tenant?.findFirst) {
      const existingTenant = await this.prisma.tenant.findFirst({
        where: {
          OR: [
            { displayName: { equals: cleanStudioName, mode: 'insensitive' } },
            { legalName: { equals: cleanStudioName, mode: 'insensitive' } },
            { code: tenantCode },
          ],
        },
        select: { id: true },
      });
      if (existingTenant) {
        throw new ConflictException('A studio with this name already exists. Please choose a different studio name.');
      }
    }

    if (this.prisma.user?.findFirst) {
      const existingUser = await this.prisma.user.findFirst({
        where: { email: cleanEmail },
        select: { id: true },
      });
      if (existingUser) {
        throw new ConflictException('An account with this email address already exists. Please sign in or use a different email.');
      }
    }

    const passwordHash = await hashPassword(input.password);
    const rawToken = createOpaqueToken(32);
    const tokenHash = hashToken(rawToken);
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const selectedPlan = input.subscription_plan ?? 'Basic';
    const tierCode = ({ Basic: 'starter', Premium: 'growth', 'Ultra Premium': 'enterprise' } as const)[selectedPlan];

    if (this.config.get('NODE_ENV') === 'production' && !this.config.get('SMTP_HOST') && !this.config.get('RESEND_API_KEY')) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }

    if (this.auditOutbox && !this.auditOutbox.recordInTransaction) {
      throw new ServiceUnavailableException('Audit and outbox transaction service is unavailable');
    }

    const executeTx = typeof this.prisma.$transaction === 'function'
      ? (work: (tx: any) => Promise<any>) => this.prisma.$transaction(work)
      : (work: (tx: any) => Promise<any>) => work(this.prisma);

    try {
      const row = await executeTx(async (tx: any) => {
        const result = await tx.$queryRaw<{
          register_onboarding_studio?: {
            success: boolean;
            tenant_id: string;
            tenant_code: string;
            user_id: string;
            token_id: string;
            status: string;
          };
          result?: any;
        }[]>`
          SELECT * FROM platform.register_onboarding_studio(
            ${cleanStudioName},
            ${tenantCode},
            ${cleanOwnerName},
            ${cleanEmail},
            ${cleanOwnerPhone},
            ${passwordHash},
            ${tokenHash},
            ${tokenExpiresAt}
          )
        `;

        const rawResult = (result?.[0] as any)?.register_onboarding_studio ?? (result?.[0] as any)?.result ?? result?.[0];
        if (!rawResult) throw new BadRequestException('Studio registration failed');
        const registered = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
        if (!registered || !registered.success) throw new BadRequestException('Studio registration failed');

        if (tx.subscriptionTier?.findUnique) {
          const tier = await tx.subscriptionTier.findUnique({ where: { code: tierCode }, select: { id: true } });
          if (!tier) throw new BadRequestException(`Subscription tier ${selectedPlan} is unavailable`);

          await tx.$queryRaw`
            SELECT * FROM platform.verify_owner_email(${registered.tenant_id}::uuid, ${rawToken})
          `;

          if (tx.tenant?.update) {
            await tx.tenant.update({ where: { id: registered.tenant_id }, data: { tierId: tier.id } });
          }
          if (tx.tenantSubscription?.updateMany) {
            const subscriptions = await tx.tenantSubscription.updateMany({
              where: { tenantId: registered.tenant_id, status: { in: ['trialing', 'authenticated', 'active'] } },
              data: {
                tierId: tier.id,
                status: input.payment_id ? 'active' : 'trialing',
                updatedAt: new Date(),
              },
            });
            if (subscriptions.count !== 1) {
              throw new BadRequestException('Studio subscription could not be initialized');
            }
          }
        }

        if (tx.tenantSetting?.upsert && (input.address || input.city || input.postal_code)) {
          await tx.tenantSetting.upsert({
            where: { tenantId_settingKey: { tenantId: registered.tenant_id, settingKey: 'studio_profile' } },
            create: {
              tenantId: registered.tenant_id,
              settingKey: 'studio_profile',
              settingValue: {
                address: input.address || null,
                city: input.city || null,
                postalCode: input.postal_code || null,
              },
            },
            update: {
              settingValue: {
                address: input.address || null,
                city: input.city || null,
                postalCode: input.postal_code || null,
              },
              updatedAt: new Date(),
            },
          });
        }

        if (this.auditOutbox?.recordInTransaction) {
          await this.auditOutbox.recordInTransaction(tx, {
            tenantId: registered.tenant_id,
            correlationId: correlationId || uuidv4(),
            actorType: 'user',
            actorId: registered.user_id,
            action: 'studio.registered',
            resourceType: 'tenant',
            resourceRef: registered.tenant_id,
            eventType: 'studio.registered',
            payload: {
              tenantCode: registered.tenant_code,
              studioName: cleanStudioName,
              ownerEmail: cleanEmail,
              verificationToken: rawToken,
              address: input.address,
              city: input.city,
              postal_code: input.postal_code,
              payment_id: input.payment_id,
              order_id: input.order_id,
            },
          });
        }

        return registered;
      });

      const enrollmentToken = this.signTokens(row.tenant_id, row.user_id, ['owner'], 'mfa_enroll');

      return {
        status: 'onboarding' as const,
        tenant_id: row.tenant_id,
        tenant_code: row.tenant_code,
        user_id: row.user_id,
        owner_email: cleanEmail,
        requires_email_verification: false,
        mfa_enrollment_required: true,
        enrollment_token: enrollmentToken,
        subscription_plan: selectedPlan,
        message: input.subscription_plan
          ? 'Studio registered successfully.'
          : 'Studio registered successfully. Please verify your email to activate your account.',
        ...(this.config.get('NODE_ENV') !== 'production' ? { test_verification_token: rawToken } : {}),
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      const msg = error?.message || String(error);
      if (msg.includes('already taken') || msg.includes('P0003')) {
        throw new ConflictException(`Tenant code "${tenantCode}" is already taken`);
      }
      if (msg.includes('between 2 and 120') || msg.includes('P0001')) {
        throw new BadRequestException('Studio name must be between 2 and 120 characters');
      }
      if (msg.includes('Tenant code must be') || msg.includes('P0002')) {
        throw new BadRequestException('Tenant code must be 2-39 alphanumeric/hyphen characters and start with alphanumeric');
      }
      if (msg.includes('between 2 and 160') || msg.includes('P0004')) {
        throw new BadRequestException('Owner name must be between 2 and 160 characters');
      }
      if (msg.includes('Invalid owner email') || msg.includes('P0005')) {
        throw new BadRequestException('Invalid owner email address format');
      }
      if (msg.includes('Invalid owner phone') || msg.includes('P0006')) {
        throw new BadRequestException('Invalid owner phone format (expected 10-15 digits)');
      }
      if (msg.includes('Default starter subscription tier not configured') || msg.includes('P0010')) {
        throw new ServiceUnavailableException('Default starter subscription tier is not configured');
      }
      throw error;
    }
  }

  async verifyOwnerEmail(dto: VerifyOwnerEmailDto, correlationId?: string) {
    const cleanTenantId = dto.tenant_id.trim();
    const cleanToken = dto.token.trim();

    if (!cleanToken) {
      throw new BadRequestException('Verification token is required');
    }

    try {
      const resultRows = await this.prisma.$queryRaw<Array<{ result?: any; verify_owner_email?: any }>>`
        SELECT platform.verify_owner_email(
          ${cleanTenantId}::uuid,
          ${cleanToken}
        ) AS result
      `;

      const rawResult = resultRows[0]?.result ?? resultRows[0]?.verify_owner_email;
      const verification = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;

      if (!verification || !verification.success) {
        throw new BadRequestException('Owner email verification failed');
      }

      // Resolve roles assigned to owner (e.g. ['owner'])
      const roles = await this.rolesFor(cleanTenantId, verification.user_id);

      // Issue initial authenticated session using the existing session architecture
      const session = await this.issueSession(cleanTenantId, verification.user_id, roles, 'staff');

      // Record audit outbox event for verification
      if (this.auditOutbox?.record) {
        await this.auditOutbox.record({
          tenantId: cleanTenantId,
          correlationId: correlationId || uuidv4(),
          actorType: 'user',
          actorId: verification.user_id,
          action: 'owner.email_verified',
          resourceType: 'tenant',
          resourceRef: cleanTenantId,
          eventType: 'owner.email_verified',
          payload: {
            userId: verification.user_id,
            subscriptionId: verification.subscription_id,
          },
        });
      }

      return {
        status: 'verified' as const,
        tenant_id: verification.tenant_id,
        user_id: verification.user_id,
        access_token: session.access_token,
        access_expires_at: session.access_expires_at,
        refresh_token: session.refresh_token,
        refresh_expires_at: session.refresh_expires_at,
        token_type: session.token_type,
        expires_in: session.expires_in,
        trial_starts_at: verification.trial_starts_at,
        trial_ends_at: verification.trial_ends_at,
      };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      const msg = error?.message || String(error);
      if (
        msg.includes('Invalid, expired, or already-consumed verification token') ||
        msg.includes('Verification token is required') ||
        msg.includes('P0001')
      ) {
        throw new BadRequestException('Invalid, expired, or already-consumed verification token');
      }
      if (msg.includes('Owner user not found') || msg.includes('P0002')) {
        throw new NotFoundException('Owner user not found for this tenant');
      }
      if (msg.includes('Default starter subscription tier not configured') || msg.includes('P0003')) {
        throw new ServiceUnavailableException('Default starter subscription tier is not configured');
      }
      throw error;
    }
  }

  async resendVerificationEmail(dto: ResendVerificationEmailDto, correlationId?: string): Promise<ResendVerificationEmailResult> {
    // 1. Verify production email delivery configuration
    if (this.config.get('NODE_ENV') === 'production' && !this.config.get('SMTP_HOST') && !this.config.get('RESEND_API_KEY')) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }

    // 2. Validate tenant identifier inputs
    const cleanTenantId = dto.tenant_id ? dto.tenant_id.trim() : undefined;
    const cleanTenantCode = dto.tenant_code ? dto.tenant_code.trim().toLowerCase() : undefined;

    if (!cleanTenantId && !cleanTenantCode) {
      throw new BadRequestException('Either tenant_id or tenant_code must be provided');
    }

    if (cleanTenantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanTenantId)) {
      throw new BadRequestException('tenant_id must be a canonical UUID');
    }

    if (cleanTenantCode && !/^[a-z0-9][a-z0-9-]{1,38}$/.test(cleanTenantCode)) {
      throw new BadRequestException('Tenant code must be 2-39 alphanumeric/hyphen characters and start with alphanumeric');
    }

    const cleanEmail = dto.email ? dto.email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      throw new BadRequestException('Invalid email address format');
    }

    const nonDisclosingResponse: ResendVerificationEmailResult = {
      status: 'pending_verification',
      message: 'If an account exists and requires verification, a verification email has been sent.',
    };

    // 3. Resolve tenant safely
    let tenant: { id: string; code: string; status: string } | null = null;
    try {
      if (cleanTenantId && cleanTenantCode) {
        if (this.prisma.tenant?.findFirst) {
          tenant = await this.prisma.tenant.findFirst({
            where: { id: cleanTenantId, code: cleanTenantCode },
            select: { id: true, code: true, status: true },
          });
        } else {
          const rows = await this.prisma.$queryRaw<Array<{ id: string; code: string; status: string }>>`
            SELECT id::text, code, status FROM platform.tenants
            WHERE id = ${cleanTenantId}::uuid AND code = ${cleanTenantCode}
            LIMIT 1
          `;
          tenant = rows[0] ?? null;
        }
      } else if (cleanTenantId) {
        if (this.prisma.tenant?.findUnique) {
          tenant = await this.prisma.tenant.findUnique({
            where: { id: cleanTenantId },
            select: { id: true, code: true, status: true },
          });
        } else {
          const rows = await this.prisma.$queryRaw<Array<{ id: string; code: string; status: string }>>`
            SELECT id::text, code, status FROM platform.tenants
            WHERE id = ${cleanTenantId}::uuid
            LIMIT 1
          `;
          tenant = rows[0] ?? null;
        }
      } else if (cleanTenantCode) {
        if (this.prisma.tenant?.findUnique) {
          tenant = await this.prisma.tenant.findUnique({
            where: { code: cleanTenantCode },
            select: { id: true, code: true, status: true },
          });
        } else {
          const rows = await this.prisma.$queryRaw<Array<{ id: string; code: string; status: string }>>`
            SELECT id::text, code, status FROM platform.tenants
            WHERE code = ${cleanTenantCode}
            LIMIT 1
          `;
          tenant = rows[0] ?? null;
        }
      }
    } catch {
      return nonDisclosingResponse;
    }

    // If tenant does not exist or is already active/closed, do not issue token
    if (!tenant || tenant.status !== 'onboarding') {
      return nonDisclosingResponse;
    }

    // 4. Execute atomic tenant-scoped identity, rate-limiting, and token replacement within transaction
    let issuedToken: string | null = null;
    let ownerUserId: string | null = null;

    try {
      const txResult = await this.prisma.withTenant(tenant.id, async (tx) => {
        // Find owner user
        let user: { id: string; email: string | null; status: string } | null = null;
        if (tx.user?.findFirst) {
          user = await tx.user.findFirst({
            where: { tenantId: tenant.id, email: cleanEmail, userType: 'staff' },
            select: { id: true, email: true, status: true },
          });
        } else {
          const rows = await tx.$queryRaw<Array<{ id: string; email: string; status: string }>>`
            SELECT id::text, email::text, status FROM iam.users
            WHERE tenant_id = ${tenant.id}::uuid AND email = ${cleanEmail}::citext AND user_type = 'staff'
            LIMIT 1
          `;
          user = rows[0] ?? null;
        }

        // If user not found or already verified/active, return non-disclosing
        if (!user || user.status !== 'invited') {
          return null;
        }

        // Verify user has 'owner' role assignment
        let isOwner = false;
        if (tx.userRoleAssignment?.findMany && tx.role?.findMany) {
          const assignments = await tx.userRoleAssignment.findMany({
            where: { tenantId: tenant.id, userId: user.id },
          });
          const roles = await tx.role.findMany({
            where: { tenantId: tenant.id, id: { in: assignments.map((a) => a.roleId) } },
          });
          isOwner = roles.some((r) => r.code === 'owner');
        } else {
          const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM iam.user_role_assignments ura
              INNER JOIN iam.roles r ON r.id = ura.role_id
              WHERE ura.tenant_id = ${tenant.id}::uuid
                AND ura.user_id = ${user.id}::uuid
                AND r.code = 'owner'
            ) AS "exists"
          `;
          isOwner = Boolean(rows[0]?.exists);
        }

        if (!isOwner) {
          return null;
        }

        // Concurrency lock: serialize verification requests for this user across all worker replicas
        await tx.$queryRaw`
          SELECT id FROM iam.users
          WHERE id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid
          FOR UPDATE
        `;

        // Cooldown and rate limit check
        const tokenHistory = await tx.$queryRaw<Array<{ count_60s: number | bigint; count_24h: number | bigint }>>`
          SELECT
            COUNT(*) FILTER (WHERE created_at > now() - interval '60 seconds') AS count_60s,
            COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS count_24h
          FROM iam.auth_action_tokens
          WHERE tenant_id = ${tenant.id}::uuid
            AND user_id = ${user.id}::uuid
            AND purpose = 'owner_email_verification'
        `;

        const count60s = Number(tokenHistory[0]?.count_60s ?? 0);
        const count24h = Number(tokenHistory[0]?.count_24h ?? 0);

        if (count60s > 0 || count24h >= 5) {
          return null; // Rate-limited: return non-disclosing response without issuing token
        }

        // Invalidate old unconsumed verification tokens safely to prevent replay
        if (tx.authActionToken?.updateMany) {
          await tx.authActionToken.updateMany({
            where: {
              tenantId: tenant.id,
              userId: user.id,
              purpose: 'owner_email_verification',
              consumedAt: null,
            },
            data: {
              consumedAt: new Date(),
            },
          });
        } else {
          await tx.$executeRaw`
            UPDATE iam.auth_action_tokens
            SET consumed_at = now(),
                updated_at = now()
            WHERE tenant_id = ${tenant.id}::uuid
              AND user_id = ${user.id}::uuid
              AND purpose = 'owner_email_verification'
              AND consumed_at IS NULL
          `;
        }

        // Generate fresh 32-byte opaque token and compute SHA-256 hex digest
        const freshRawToken = createOpaqueToken(32);
        const tokenHash = hashToken(freshRawToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour expiration

        if (tx.authActionToken?.create) {
          await tx.authActionToken.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              purpose: 'owner_email_verification',
              tokenHash,
              expiresAt,
            },
          });
        } else {
          await tx.$executeRaw`
            INSERT INTO iam.auth_action_tokens (
              tenant_id,
              user_id,
              purpose,
              token_hash,
              expires_at
            ) VALUES (
              ${tenant.id}::uuid,
              ${user.id}::uuid,
              'owner_email_verification',
              ${tokenHash},
              ${expiresAt}
            )
          `;
        }

        // 5. Record audit outbox event atomically within the same database transaction
        if (!this.auditOutbox?.recordInTransaction) {
          throw new ServiceUnavailableException('Audit and outbox transaction service is unavailable');
        }

        await this.auditOutbox.recordInTransaction(tx, {
          tenantId: tenant.id,
          correlationId: correlationId || uuidv4(),
          actorType: 'user',
          actorId: user.id,
          action: 'owner.verification_resent',
          resourceType: 'tenant',
          resourceRef: tenant.id,
          eventType: 'owner.verification_resent',
          payload: {
            tenantCode: tenant.code,
            ownerEmail: cleanEmail,
            verificationToken: freshRawToken,
          },
        });

        return {
          userId: user.id,
          rawToken: freshRawToken,
        };
      });

      if (!txResult) {
        return nonDisclosingResponse;
      }

      issuedToken = txResult.rawToken;
      ownerUserId = txResult.userId;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw error;
    }

    return {
      status: 'pending_verification' as const,
      message: 'If an account exists and requires verification, a verification email has been sent.',
      ...(this.config.get('NODE_ENV') !== 'production' && issuedToken ? { test_verification_token: issuedToken } : {}),
    };
  }

  async memberRegister(
    tenantId: string,
    tenantCode: string,
    correlationId: string,
    input: MemberRegisterDto,
  ) {
    if (!input.fullName || !input.fullName.trim()) {
      throw new BadRequestException('Full name is required for registration');
    }
    if (!input.email || !input.email.trim()) {
      throw new BadRequestException('Email address is required for registration');
    }
    if (!input.phone || !input.phone.trim()) {
      throw new BadRequestException('Mobile number is required for registration');
    }
    if (!input.password) {
      throw new BadRequestException('Password is required');
    }
    if (input.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const phoneE164 = this.normalizePhone(input.phone);
    const trimmedFullName = input.fullName.trim();

    // Enforce email uniqueness in tenant
    const existingEmail = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({ where: { tenantId, email: normalizedEmail } }),
    );
    if (existingEmail) {
      throw new ConflictException('An account with this email address already exists in this studio. Please sign in to continue.');
    }

    // Enforce phone uniqueness in tenant
    const existingPhone = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({
        where: {
          tenantId,
          OR: [
            { phoneE164 },
            { phoneE164: input.phone.replace(/[\s()-]/g, '') },
          ],
        },
      }),
    );
    if (existingPhone) {
      throw new ConflictException('An account with this mobile number already exists in this studio. Please sign in to continue.');
    }

    const passwordHash = await hashPassword(input.password);
    const isPostgresStore = !['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase());

    let memberId: string | undefined;
    let createdUser: any;

    try {
      createdUser = await this.prisma.withTenant(tenantId, async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId,
            email: normalizedEmail,
            phoneE164,
            displayName: trimmedFullName,
            userType: 'member',
            status: 'active',
            mustResetPassword: false,
          },
        });

        await tx.userCredential.create({
          data: {
            tenantId,
            userId: user.id,
            passwordHash,
            failedAttempts: 0,
          },
        });

        if (isPostgresStore && tx.studioMember) {
          let studioMember = await tx.studioMember.findFirst({
            where: {
              tenantId,
              OR: [{ phone: phoneE164 }, { email: normalizedEmail }],
            },
          });
          if (!studioMember) {
            studioMember = await tx.studioMember.create({
              data: {
                tenantId,
                fullName: trimmedFullName,
                joined: new Date(),
                email: normalizedEmail,
                phone: phoneE164,
                plan: 'None',
                status: 'Inactive',
              },
            });
          } else {
            await tx.studioMember.update({
              where: { id: studioMember.id },
              data: {
                fullName: studioMember.fullName || trimmedFullName,
                email: studioMember.email || normalizedEmail,
              },
            });
          }
          memberId = studioMember.id;
          await tx.userErpLink.create({ data: { tenantId, userId: user.id, erpUserRef: studioMember.id } });
        }

        const memberRole = await tx.role.findFirst({ where: { tenantId, code: 'member' } });
        if (memberRole) {
          await tx.userRoleAssignment.create({ data: { tenantId, userId: user.id, roleId: memberRole.id } });
        }

        if (this.auditOutbox?.recordInTransaction) {
          await this.auditOutbox.recordInTransaction(tx, {
            tenantId,
            correlationId,
            actorType: 'user',
            actorId: user.id,
            action: 'member.registered_with_password',
            resourceType: 'member',
            resourceRef: memberId || user.id,
            eventType: 'member.registered_with_password',
            payload: { memberId, userId: user.id },
            afterData: { phone: phoneE164, email: normalizedEmail },
          });
        }

        return user;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('An account with this email address or mobile number already exists in this studio.');
      }
      throw err;
    }

    const roles = await this.rolesFor(tenantId, createdUser.id);
    const session = await this.issueSession(tenantId, createdUser.id, roles, 'member');

    return {
      ...session,
      user: {
        id: createdUser.id,
        name: createdUser.displayName,
        email: createdUser.email,
        phone: createdUser.phoneE164,
        roles,
      },
      user_id: createdUser.id,
      phone: createdUser.phoneE164,
      is_new_user: true,
      member_id: memberId,
    };
  }

  async memberLogin(
    tenantId: string,
    tenantCode: string,
    correlationId: string,
    email: string,
    password: string,
  ) {
    if (!email || !email.trim()) {
      throw new BadRequestException('Email address is required');
    }
    if (!password) {
      throw new BadRequestException('Password is required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({
        where: {
          tenantId,
          email: normalizedEmail,
          userType: 'member',
        },
      }),
    );

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException('Account is temporarily locked. Please try again later.');
    }
    if (user.status === 'locked') {
      throw new ForbiddenException('Account is locked. Please contact studio support.');
    }
    if (user.status !== 'active') {
      throw new ForbiddenException('Member account is not active. Please contact studio support.');
    }

    const credential = await this.prisma.withTenant(tenantId, (tx) =>
      tx.userCredential.findFirst({ where: { tenantId, userId: user.id } }),
    );

    if (!credential) {
      throw new UnauthorizedException(
        'This account does not have a password set yet. Please use "Set your password" to complete your account setup.',
      );
    }

    const isMatch = await verifyPassword(password, credential.passwordHash);
    if (!isMatch) {
      const attempts = (credential.failedAttempts || 0) + 1;
      const shouldLock = attempts >= MAX_FAILED_LOGINS;
      const lockDate = shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;

      await this.prisma.withTenant(tenantId, (tx) =>
        tx.userCredential.update({
          where: { tenantId_userId: { tenantId, userId: user.id } },
          data: { failedAttempts: attempts, lockedUntil: lockDate },
        }),
      );

      throw new UnauthorizedException('Invalid email or password');
    }

    if (credential.failedAttempts > 0) {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.userCredential.update({
          where: { tenantId_userId: { tenantId, userId: user.id } },
          data: { failedAttempts: 0, lockedUntil: null },
        }),
      );
    }

    const studioMember = await this.prisma.withTenant(tenantId, async (tx) => {
      if (user.phoneE164) {
        const m = await tx.studioMember.findFirst({ where: { tenantId, phone: user.phoneE164 } });
        if (m) return m;
      }
      if (user.email) {
        return tx.studioMember.findFirst({ where: { tenantId, email: user.email } });
      }
      return null;
    });

    const activeMembershipPayload = await this.getActiveMembershipPayload(tenantId, studioMember);
    const roles = await this.rolesFor(tenantId, user.id);
    const session = await this.issueSession(tenantId, user.id, roles, 'member');

    return {
      ...session,
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
        phone: user.phoneE164,
        roles,
      },
      user_id: user.id,
      phone: user.phoneE164,
      is_new_user: false,
      member_id: studioMember?.id,
      membership: activeMembershipPayload,
    };
  }

  async completeMemberAccount(
    tenantId: string,
    tenantCode: string,
    correlationId: string,
    input: CompleteMemberAccountDto,
  ) {
    if (!input.email || !input.email.trim()) {
      throw new BadRequestException('Email address is required');
    }
    if (!input.password) {
      throw new BadRequestException('Password is required');
    }
    if (input.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }
    if (input.password !== input.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const challenge = await this.prisma.withTenant(tenantId, (tx) =>
      tx.otpChallenge.findFirst({ where: { id: input.challenge_id, tenantId } }),
    );
    if (!challenge || challenge.consumedAt) throw new UnauthorizedException('OTP is invalid');
    if (challenge.expiresAt <= new Date()) throw new GoneException('OTP has expired');
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) throw new HttpException('OTP attempt limit reached', HttpStatus.TOO_MANY_REQUESTS);

    const actual = this.otpHash(tenantId, challenge.phoneE164, input.otp);
    const now = new Date();
    if (actual !== challenge.codeHash) {
      await this.prisma.withTenant(tenantId, (tx) =>
        tx.otpChallenge.updateMany({
          where: { id: challenge.id, tenantId, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_OTP_ATTEMPTS } },
          data: { attempts: { increment: 1 } },
        }),
      );
      throw new UnauthorizedException('OTP is invalid');
    }

    await this.prisma.withTenant(tenantId, (tx) =>
      tx.otpChallenge.updateMany({
        where: { id: challenge.id, tenantId, codeHash: actual, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      }),
    );

    const normalizedEmail = input.email.trim().toLowerCase();

    const existingWithEmail = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({
        where: {
          tenantId,
          email: normalizedEmail,
          NOT: {
            OR: [
              { phoneE164: challenge.phoneE164 },
              { phoneE164: challenge.phoneE164.replace(/^\+91/, '') },
            ],
          },
        },
      }),
    );
    if (existingWithEmail) {
      throw new ConflictException('This email is already associated with another account in this studio.');
    }

    const passwordHash = await hashPassword(input.password);

    const user = await this.prisma.withTenant(tenantId, async (tx) => {
      let u = await tx.user.findFirst({
        where: {
          tenantId,
          userType: 'member',
          OR: [
            { phoneE164: challenge.phoneE164 },
            { phoneE164: challenge.phoneE164.replace(/^\+91/, '') },
          ],
        },
      });

      let studioMember = await tx.studioMember.findFirst({
        where: {
          tenantId,
          OR: [
            { phone: challenge.phoneE164 },
            { phone: challenge.phoneE164.replace(/^\+91/, '') },
          ],
        },
      });

      if (!u) {
        u = await tx.user.create({
          data: {
            tenantId,
            phoneE164: challenge.phoneE164,
            email: normalizedEmail,
            displayName: studioMember?.fullName || 'Studio Member',
            userType: 'member',
            status: 'active',
            mustResetPassword: false,
          },
        });
        if (studioMember) {
          await tx.userErpLink.create({ data: { tenantId, userId: u.id, erpUserRef: studioMember.id } });
        }
        const memberRole = await tx.role.findFirst({ where: { tenantId, code: 'member' } });
        if (memberRole) {
          await tx.userRoleAssignment.create({ data: { tenantId, userId: u.id, roleId: memberRole.id } });
        }
      } else {
        u = await tx.user.update({
          where: { id: u.id },
          data: { email: normalizedEmail, status: 'active', mustResetPassword: false },
        });
      }

      await tx.userCredential.upsert({
        where: { tenantId_userId: { tenantId, userId: u.id } },
        create: {
          tenantId,
          userId: u.id,
          passwordHash,
          failedAttempts: 0,
        },
        update: {
          passwordHash,
          failedAttempts: 0,
          lockedUntil: null,
          passwordChangedAt: new Date(),
        },
      });

      if (studioMember && (!studioMember.email || studioMember.email !== normalizedEmail)) {
        await tx.studioMember.update({
          where: { id: studioMember.id },
          data: { email: normalizedEmail },
        });
      }

      return u;
    });

    const studioMember = await this.prisma.withTenant(tenantId, async (tx) => {
      if (user.phoneE164) {
        const m = await tx.studioMember.findFirst({ where: { tenantId, phone: user.phoneE164 } });
        if (m) return m;
      }
      return tx.studioMember.findFirst({ where: { tenantId, email: normalizedEmail } });
    });

    const activeMembershipPayload = await this.getActiveMembershipPayload(tenantId, studioMember);
    const roles = await this.rolesFor(tenantId, user.id);
    const session = await this.issueSession(tenantId, user.id, roles, 'member');

    return {
      ...session,
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
        phone: user.phoneE164,
        roles,
      },
      user_id: user.id,
      phone: user.phoneE164,
      is_new_user: false,
      member_id: studioMember?.id,
      membership: activeMembershipPayload,
      message: 'Account setup complete! You can now sign in with your email and password.',
    };
  }

}
