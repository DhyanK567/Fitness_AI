import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { hashToken } from '../common/auth-token';
import { generateTotpSecret, totpCode } from '../common/totp';
import { TeamInvitationsService } from './team-invitations.service';
import { CreateTeamInvitationDto } from './dto/team-invitation.dto';

const TENANT = '11111111-1111-4111-8111-111111111111';

describe('TeamInvitationsService', () => {
  it('normalizes a display-formatted +91 mobile before validation', async () => {
    const dto = plainToInstance(CreateTeamInvitationDto, {
      full_name: 'Ananya Rao', email: 'ananya@studio.in', phone: '+91 98450 91122', role: 'trainer',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.phone).toBe('+919845091122');
  });

  it('stores only a SHA-256 digest of a 256-bit invitation token', async () => {
    let createData: any;
    const tx = {
      user: { findFirst: jest.fn(async () => null) },
      tenant: { findUnique: jest.fn(async () => ({ displayName: 'Prana Studio' })) },
      teamInvitation: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => { createData = data; return { id: 'invite-1', expiresAt: data.expiresAt }; }),
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: any) => work(tx)) };
    const config = { get: jest.fn((name: string) => name === 'FRONTEND_URL' ? 'https://studio.example' : undefined) };
    const email = { assertConfigured: jest.fn(), send: jest.fn(async () => 'sent') };
    const service = new TeamInvitationsService(prisma as any, config as any, {} as any, email as any);

    const result = await service.create(TENANT, {
      full_name: 'Ananya Rao', email: 'ANANYA@STUDIO.IN', phone: '+91 98450 91122', role: 'trainer',
    }, ['owner']);

    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(createData.tokenHash).toBe(hashToken(result.token));
    expect(createData.tokenHash).not.toContain(result.token);
    expect(createData.email).toBe('ananya@studio.in');
    expect(createData.phone).toBe('+919845091122');
    expect(result.setupUrl).toContain(encodeURIComponent(result.token));
    expect(result.emailDelivery).toBe('sent');
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ananya@studio.in', studioName: 'Prana Studio' }));
  });

  it('allows only owners to invite administrators', async () => {
    const service = new TeamInvitationsService({} as any, {} as any, {} as any, { assertConfigured: jest.fn() } as any);
    await expect(service.create(TENANT, {
      full_name: 'Studio Admin', email: 'admin@studio.in', phone: '9845091122', role: 'admin',
    }, ['admin'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('atomically provisions credentials, MFA, role and a persisted session', async () => {
    const secret = generateTotpSecret();
    const invitation = {
      id: 'invite-1', tenant_id: TENANT, email: 'trainer@studio.in', full_name: 'Trainer One', phone: '+919845091122',
      role: 'trainer', status: 'pending', expires_at: new Date(Date.now() + 60_000), accepted_at: null, revoked_at: null,
      totp_secret: 'encrypted-secret', recovery_code_hashes: ['a'.repeat(64)], studio_name: 'Prana Studio',
    };
    const tx = {
      teamInvitation: { updateMany: jest.fn(async () => ({ count: 1 })), update: jest.fn(async () => ({})) },
      user: { findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => ({ id: 'user-1', ...data })) },
      role: { findFirst: jest.fn(async () => ({ id: 'role-1', code: 'trainer' })) },
      userCredential: { create: jest.fn(async () => ({})) },
      userRoleAssignment: { create: jest.fn(async () => ({})) },
      userTotp: { create: jest.fn(async () => ({})) },
      totpRecoveryCode: { createMany: jest.fn(async () => ({ count: 1 })) },
      tenant: { findUnique: jest.fn(async () => ({ code: 'prana-studio' })) },
    };
    const prisma = {
      $queryRaw: jest.fn(async () => [invitation]),
      withTenant: jest.fn(async (_tenant: string, work: any) => work(tx)),
    };
    const auth = {
      assertStrongPassword: jest.fn(),
      decryptMfaSecret: jest.fn(() => secret),
      issueStaffSession: jest.fn(async () => ({ access_token: 'signed.jwt.token', refresh_token: 'opaque', expires_in: 3600 })),
    };
    const service = new TeamInvitationsService(prisma as any, {} as any, auth as any, {} as any);
    const result = await service.accept('f'.repeat(64), 'StrongPassword1!', totpCode(secret));

    expect(tx.teamInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'pending' }) }));
    expect(tx.userCredential.create).toHaveBeenCalled();
    expect(tx.userTotp.create).toHaveBeenCalled();
    expect(tx.totpRecoveryCode.createMany).toHaveBeenCalled();
    expect(auth.issueStaffSession).toHaveBeenCalledWith(TENANT, 'user-1', ['trainer']);
    expect(result.access_token).toBe('signed.jwt.token');
    expect(result.tenant_code).toBe('prana-studio');
  });
});
