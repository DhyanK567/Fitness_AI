import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { hashPassword, hashToken } from '../common/auth-token';
import { buildOtpAuthUrl, generateRecoveryCodes, generateTotpSecret, verifyTotp } from '../common/totp';
import { AuthService } from './auth.service';
import { CreateTeamInvitationDto, TeamRole } from './dto/team-invitation.dto';
import { InvitationEmailService } from './invitation-email.service';
import { normalizeTierCode, ROLE_MINIMUM_TIER, tierAllows, TIER_LABELS } from '../common/tier-entitlements';

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

type InvitationLookup = {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  phone: string;
  role: TeamRole;
  status: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  totp_secret: string | null;
  recovery_code_hashes: unknown;
  studio_name: string;
};

@Injectable()
export class TeamInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly emailDelivery: InvitationEmailService,
  ) {}

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    return `+91${digits}`;
  }

  private async lookup(rawToken: string): Promise<InvitationLookup> {
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) throw new BadRequestException('Invitation token is malformed');
    const rows = await this.prisma.$queryRaw<InvitationLookup[]>(
      Prisma.sql`SELECT * FROM iam.lookup_team_invitation(${hashToken(rawToken)}::char(64))`,
    );
    const invitation = rows[0];
    if (!invitation) throw new NotFoundException('Invitation was not found');
    return invitation;
  }

  private async pending(rawToken: string): Promise<InvitationLookup> {
    const invitation = await this.lookup(rawToken);
    if (invitation.status === 'accepted') throw new ConflictException('Invitation has already been accepted');
    if (invitation.status === 'revoked') throw new GoneException('Invitation has been revoked');
    if (invitation.status === 'expired' || invitation.expires_at.getTime() <= Date.now()) {
      await this.prisma.withTenant(invitation.tenant_id, async (tx) => {
        await (tx as any).teamInvitation.updateMany({
          where: { id: invitation.id, tenantId: invitation.tenant_id, status: 'pending' },
          data: { status: 'expired', updatedAt: new Date() },
        });
      });
      throw new GoneException('Invitation has expired');
    }
    if (invitation.status !== 'pending') throw new GoneException('Invitation is no longer active');
    return invitation;
  }

  async create(tenantId: string, input: CreateTeamInvitationDto, actorRoles: string[]) {
    if (input.role === 'admin' && !actorRoles.includes('owner')) {
      throw new ForbiddenException('Only an owner can invite another administrator');
    }
    const tenantTier = await this.prisma.withTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { tierId: true } });
      return tenant?.tierId ? tx.subscriptionTier.findUnique({ where: { id: tenant.tierId }, select: { code: true } }) : null;
    });
    const currentTier = normalizeTierCode(tenantTier?.code);
    const requiredTier = ROLE_MINIMUM_TIER[input.role] ?? 'starter';
    if (!tierAllows(currentTier, requiredTier)) {
      throw new ForbiddenException({
        code: 'TIER_UPGRADE_REQUIRED',
        message: `${TIER_LABELS[requiredTier]} is required to invite a ${input.role.replace('_', ' ')}`,
        currentTier,
        requiredTier,
      });
    }
    this.emailDelivery.assertConfigured();
    const email = input.email.trim().toLowerCase();
    const phone = this.normalizePhone(input.phone);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await this.prisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findFirst({ where: { tenantId, OR: [{ email }, { phoneE164: phone }] } });
      if (user) throw new ConflictException('A user with this email or mobile number already exists');
      const pending = await (tx as any).teamInvitation.findFirst({ where: { tenantId, email, status: 'pending' } });
      if (pending) {
        await (tx as any).teamInvitation.update({
          where: { id: pending.id },
          data: { status: 'revoked', revokedAt: new Date(), updatedAt: new Date() },
        });
      }
      const created = await (tx as any).teamInvitation.create({
        data: {
          tenantId,
          email,
          fullName: input.full_name.trim(),
          phone,
          role: input.role,
          tokenHash: hashToken(token),
          expiresAt,
        },
      });
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { displayName: true } });
      return { ...created, studioName: tenant?.displayName ?? 'Wellness Studio OS' };
    });

    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const setupUrl = `${frontendUrl}/staff-login?mode=setup&token=${encodeURIComponent(token)}`;
    let emailDelivery: 'sent' | 'not_configured' | 'sandbox_restricted';
    try {
      emailDelivery = await this.emailDelivery.send({
        to: email,
        fullName: input.full_name.trim(),
        studioName: invitation.studioName,
        roleLabel: input.role === 'front_desk' ? 'Front Desk' : input.role === 'admin' ? 'Administrator' : input.role[0].toUpperCase() + input.role.slice(1),
        setupUrl,
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      await this.prisma.withTenant(tenantId, (tx) => (tx as any).teamInvitation.updateMany({
        where: { id: invitation.id, tenantId, status: 'pending' },
        data: { status: 'revoked', revokedAt: new Date(), updatedAt: new Date() },
      }));
      throw error;
    }
    return {
      invitationId: invitation.id,
      token,
      expiresAt: invitation.expiresAt.toISOString(),
      setupUrl,
      emailDelivery,
    };
  }

  async list(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      await (tx as any).teamInvitation.updateMany({
        where: { tenantId, status: 'pending', expiresAt: { lte: new Date() } },
        data: { status: 'expired', updatedAt: new Date() },
      });
      const rows = await (tx as any).teamInvitation.findMany({
        where: { tenantId, status: { in: ['pending', 'accepted'] } },
        select: {
          id: true, email: true, fullName: true, phone: true, role: true, status: true,
          expiresAt: true, acceptedAt: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      const acceptedEmails = rows.filter((row: any) => row.status === 'accepted').map((row: any) => row.email);
      const users = acceptedEmails.length
        ? await tx.user.findMany({ where: { tenantId, email: { in: acceptedEmails }, status: 'active' }, select: { id: true, email: true } })
        : [];
      const userIdByEmail = new Map(users.map((user) => [user.email?.toLowerCase(), user.id]));
      return rows.map((row: any) => ({
        invitationId: row.id,
        email: row.email,
        fullName: row.fullName,
        phone: row.phone,
        role: row.role,
        status: row.status,
        expiresAt: row.expiresAt.toISOString(),
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        userId: userIdByEmail.get(row.email.toLowerCase()) ?? null,
      }));
    });
  }

  async revoke(tenantId: string, invitationId: string) {
    const result = await this.prisma.withTenant<{ count: number }>(tenantId, (tx) => (tx as any).teamInvitation.updateMany({
      where: { id: invitationId, tenantId, status: 'pending' },
      data: { status: 'revoked', revokedAt: new Date(), updatedAt: new Date() },
    }));
    if (result.count !== 1) throw new NotFoundException('Pending invitation was not found');
    return { revoked: true };
  }

  async validate(rawToken: string) {
    const invitation = await this.pending(rawToken);
    return {
      valid: true,
      email: invitation.email,
      fullName: invitation.full_name,
      role: invitation.role,
      studioName: invitation.studio_name,
      expiresAt: invitation.expires_at.toISOString(),
      mfaEnrollmentStarted: Boolean(invitation.totp_secret),
    };
  }

  async enroll(rawToken: string) {
    const invitation = await this.pending(rawToken);
    const secret = generateTotpSecret();
    const recovery = generateRecoveryCodes(10);
    const encryptedSecret = this.auth.encryptMfaSecret(secret);
    await this.prisma.withTenant(invitation.tenant_id, async (tx) => {
      const result = await (tx as any).teamInvitation.updateMany({
        where: { id: invitation.id, tenantId: invitation.tenant_id, status: 'pending', expiresAt: { gt: new Date() } },
        data: { totpSecret: encryptedSecret, recoveryCodeHashes: recovery.hashes, updatedAt: new Date() },
      });
      if (result.count !== 1) throw new GoneException('Invitation is no longer active');
    });
    return {
      secret,
      otpauth_url: buildOtpAuthUrl(invitation.studio_name || 'Wellness Studio OS', invitation.email, secret),
      recovery_codes: recovery.plain,
    };
  }

  async accept(rawToken: string, password: string, totpCode: string) {
    this.auth.assertStrongPassword(password);
    const invitation = await this.pending(rawToken);
    if (!invitation.totp_secret || !Array.isArray(invitation.recovery_code_hashes)) {
      throw new BadRequestException('Authenticator enrollment must be completed first');
    }
    const encryptedTotpSecret = invitation.totp_secret;
    const secret = this.auth.decryptMfaSecret(encryptedTotpSecret);
    if (!verifyTotp(secret, totpCode)) throw new BadRequestException('Authenticator code is invalid or expired');
    const passwordHash = await hashPassword(password);

    const created = await this.prisma.withTenant(invitation.tenant_id, async (tx) => {
      const claimed = await (tx as any).teamInvitation.updateMany({
        where: { id: invitation.id, tenantId: invitation.tenant_id, status: 'pending', expiresAt: { gt: new Date() } },
        data: { status: 'accepted', acceptedAt: new Date(), updatedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ConflictException('Invitation has already been used');
      const existing = await tx.user.findFirst({ where: { tenantId: invitation.tenant_id, OR: [{ email: invitation.email }, { phoneE164: invitation.phone }] } });
      if (existing) throw new ConflictException('A user with this email or mobile number already exists');

      let role = await tx.role.findFirst({ where: { tenantId: invitation.tenant_id, code: invitation.role } });
      if (!role) {
        role = await tx.role.create({
          data: {
            tenantId: invitation.tenant_id,
            code: invitation.role,
            displayName: invitation.role === 'front_desk' ? 'Front Desk' : invitation.role.replace('_', ' '),
          },
        });
        const templateRole = ['staff'].includes(invitation.role)
          ? 'front_desk'
          : ['coach', 'lead_trainer'].includes(invitation.role)
            ? 'trainer'
            : null;
        if (templateRole) {
          const template = await tx.role.findFirst({ where: { tenantId: invitation.tenant_id, code: templateRole } });
          if (template) {
            const grants = await tx.rolePermission.findMany({ where: { tenantId: invitation.tenant_id, roleId: template.id } });
            await tx.rolePermission.createMany({
              data: grants.map((grant) => ({ tenantId: invitation.tenant_id, roleId: role!.id, permissionId: grant.permissionId })),
              skipDuplicates: true,
            });
          }
        }
        if (['coach', 'lead_trainer', 'biller', 'accountant'].includes(invitation.role)) {
          const codes = ['biller', 'accountant'].includes(invitation.role)
            ? ['payments:read', 'payments:write', 'reports:read']
            : invitation.role === 'lead_trainer'
              ? ['feedback:read', 'feedback:write', 'members:assign', 'staff:read']
              : ['feedback:read', 'feedback:write'];
          const grants = await tx.permission.findMany({ where: { tenantId: invitation.tenant_id, code: { in: codes } } });
          await tx.rolePermission.createMany({
            data: grants.map((grant) => ({ tenantId: invitation.tenant_id, roleId: role!.id, permissionId: grant.id })),
            skipDuplicates: true,
          });
        }
      }
      const user = await tx.user.create({
        data: {
          tenantId: invitation.tenant_id,
          userType: 'staff',
          email: invitation.email,
          phoneE164: invitation.phone,
          displayName: invitation.full_name,
          status: 'active',
          mustResetPassword: false,
          mfaEnforced: true,
        },
      });
      await tx.userCredential.create({ data: { tenantId: invitation.tenant_id, userId: user.id, passwordHash } });
      await tx.userRoleAssignment.create({ data: { tenantId: invitation.tenant_id, userId: user.id, roleId: role.id } });
      await tx.userTotp.create({
        data: { tenantId: invitation.tenant_id, userId: user.id, secret: encryptedTotpSecret, confirmedAt: new Date(), lastUsedAt: new Date() },
      });
      await tx.totpRecoveryCode.createMany({
        data: (invitation.recovery_code_hashes as string[]).map((codeHash) => ({ tenantId: invitation.tenant_id, userId: user.id, codeHash })),
      });
      await (tx as any).teamInvitation.update({
        where: { id: invitation.id },
        data: { totpSecret: null, recoveryCodeHashes: Prisma.JsonNull, updatedAt: new Date() },
      });
      return { user, roleCode: role.code };
    });

    const tenant = await this.prisma.withTenant(invitation.tenant_id, (tx) => tx.tenant.findUnique({
      where: { id: invitation.tenant_id },
      select: { code: true },
    }));
    return {
      ...(await this.auth.issueStaffSession(invitation.tenant_id, created.user.id, [created.roleCode])),
      user: { id: created.user.id, email: created.user.email, name: created.user.displayName },
      roles: [created.roleCode],
      role: created.roleCode,
      tenant_id: invitation.tenant_id,
      tenant_code: tenant?.code,
    };
  }
}
