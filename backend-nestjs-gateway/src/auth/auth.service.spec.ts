import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, it, expect, beforeEach, beforeAll, afterAll, jest } from '@jest/globals';
import { createHash, scryptSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma.service';
import { hashPassword, hashToken, signPurposeToken, verifyPassword } from '../common/auth-token';
import { normalizeRecoveryCode, totpCode } from '../common/totp';
import { SecretBox } from '../common/secret-box';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const PASSWORD = 'correct-password-123';
const TEST_MFA_KEY = Buffer.alloc(32, 7).toString('base64');
let defaultPasswordHash: string;

beforeAll(async () => {
  defaultPasswordHash = await hashPassword(PASSWORD);
});

// ---------------------------------------------------------------------------
// Minimal in-memory Prisma double for testing in-memory behaviors
// ---------------------------------------------------------------------------
const PRISMA_OPERATORS = new Set(['in', 'not', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith']);

function isPrismaFilterObject(val: any): boolean {
  if (!val || typeof val !== 'object' || Array.isArray(val) || val instanceof Date) return false;
  return Object.keys(val).some((k) => PRISMA_OPERATORS.has(k));
}

function flattenWhere(where: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(where ?? {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !isPrismaFilterObject(value)) {
      Object.assign(out, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function matches(row: Record<string, any>, where: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(flattenWhere(where))) {
    if (value === undefined) continue;
    if (value === null) {
      if (row[key] !== null && row[key] !== undefined) return false;
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('in' in value && Array.isArray(value.in)) {
        if (!value.in.includes(row[key])) return false;
        continue;
      }
      if ('not' in value) {
        if (row[key] === value.not) return false;
        continue;
      }
      if ('gt' in value) {
        const a = row[key] instanceof Date ? row[key].getTime() : row[key];
        const b = value.gt instanceof Date ? value.gt.getTime() : value.gt;
        if (!(a > b)) return false;
        continue;
      }
      if ('gte' in value) {
        const a = row[key] instanceof Date ? row[key].getTime() : row[key];
        const b = value.gte instanceof Date ? value.gte.getTime() : value.gte;
        if (!(a >= b)) return false;
        continue;
      }
      if ('lt' in value) {
        const a = row[key] instanceof Date ? row[key].getTime() : row[key];
        const b = value.lt instanceof Date ? value.lt.getTime() : value.lt;
        if (!(a < b)) return false;
        continue;
      }
      if ('lte' in value) {
        const a = row[key] instanceof Date ? row[key].getTime() : row[key];
        const b = value.lte instanceof Date ? value.lte.getTime() : value.lte;
        if (!(a <= b)) return false;
        continue;
      }
    }
    if (row[key] !== value) return false;
  }
  return true;
}

function createTable(initial: any[] = []) {
  const rows: any[] = [...initial];
  return {
    rows,
    findFirst: jest.fn(async ({ where }: any = {}) => rows.find((r) => matches(r, where)) ?? null),
    findUnique: jest.fn(async ({ where }: any = {}) => rows.find((r) => matches(r, where)) ?? null),
    findMany: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where))),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `id-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date(), ...data };
      rows.push(row);
      return row;
    }),
    createMany: jest.fn(async ({ data }: any) => {
      const list = Array.isArray(data) ? data : [data];
      for (const item of list) {
        rows.push({ id: `id-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date(), ...item });
      }
      return { count: list.length };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const idx = rows.findIndex((r) => matches(r, where));
      if (idx === -1) throw new Error('Record not found');
      Object.assign(rows[idx], data);
      return rows[idx];
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const row of rows) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count++;
        }
      }
      return { count };
    }),
    upsert: jest.fn(async ({ where, update, create }: any) => {
      const idx = rows.findIndex((r) => matches(r, where));
      if (idx === -1) {
        const row = { id: `id-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date(), ...create };
        rows.push(row);
        return row;
      }
      Object.assign(rows[idx], update);
      return rows[idx];
    }),
    deleteMany: jest.fn(async ({ where }: any = {}) => {
      let count = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (matches(rows[i], where)) {
          rows.splice(i, 1);
          count++;
        }
      }
      return { count };
    }),
    count: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length),
  };
}

function createFakePrisma() {
  const tables = {
    user: createTable(),
    userCredential: createTable(),
    userRoleAssignment: createTable(),
    role: createTable(),
    authSession: createTable(),
    authActionToken: createTable(),
    userTotp: createTable(),
    totpRecoveryCode: createTable(),
    tenant: createTable(),
  };

  return {
    ...tables,
    withTenant: jest.fn(async (_tenant: string, work: (tx: any) => Promise<any>) => work(tables)),
    $transaction: jest.fn(async (work: (tx: any) => Promise<any>) => work(tables)),
  };
}

function seed(prisma: any) {
  prisma.tenant.rows.push({ id: TENANT_A, code: 'acme', displayName: 'Acme Studio' });
  prisma.role.rows.push(
    { id: 'role-owner', tenantId: TENANT_A, code: 'owner', displayName: 'Owner' },
    { id: 'role-admin', tenantId: TENANT_A, code: 'admin', displayName: 'Admin' },
    { id: 'role-trainer', tenantId: TENANT_A, code: 'trainer', displayName: 'Trainer' },
    { id: 'role-front_desk', tenantId: TENANT_A, code: 'front_desk', displayName: 'Front Desk' },
  );
  prisma.user.rows.push(
    { id: 'user-owner', tenantId: TENANT_A, email: 'owner@acme.fitness', userType: 'staff', status: 'active', failedLoginAttempts: 0 },
    { id: 'user-trainer', tenantId: TENANT_A, email: 'trainer@acme.fitness', userType: 'staff', status: 'active', failedLoginAttempts: 0 },
  );
  prisma.userCredential.rows.push(
    { tenantId: TENANT_A, userId: 'user-owner', passwordHash: defaultPasswordHash },
    { tenantId: TENANT_A, userId: 'user-trainer', passwordHash: defaultPasswordHash },
  );
  prisma.userRoleAssignment.rows.push(
    { tenantId: TENANT_A, userId: 'user-owner', roleId: 'role-owner' },
    { tenantId: TENANT_A, userId: 'user-trainer', roleId: 'role-trainer' },
  );
}

function makeService(prisma: any) {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'MFA_ENCRYPTION_KEY') return TEST_MFA_KEY;
      if (key === 'MFA_ENCRYPTION_KEY_PREVIOUS') return undefined;
      return 'test-secret';
    }),
  } as unknown as ConfigService;
  return new AuthService(prisma as unknown as PrismaService, config);
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(HttpException);
  await promise.catch((error: HttpException) => {
    expect((error.getResponse() as { errorCode: string }).errorCode).toBe(code);
  });
}

function legacyHash(password = 'LegacySecret#1'): string {
  const salt = '0123456789abcdef0123456789abcdef';
  const derived = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

// ===========================================================================
// Test Suites
// ===========================================================================

describe('AuthService member OTP delivery boundary', () => {
  it('fails closed in production rather than creating an undeliverable challenge', async () => {
    const prisma = { withTenant: jest.fn() };
    const config = { get: (key: string) => ({ OTP_MODE: 'mock', NODE_ENV: 'production' })[key] };
    const service = new AuthService(prisma as any, config as any, {} as any, {} as any);
    await expect(service.requestMemberOtp('tenant-uuid', '+919876543210', 'login')).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('does not claim a production password reset was sent without email delivery', async () => {
    const prisma = { withTenant: jest.fn() };
    const config = { get: (key: string) => ({ NODE_ENV: 'production' })[key] };
    const service = new AuthService(prisma as any, config as any, {} as any, {} as any);
    await expect(service.forgotPassword('tenant-uuid', 'member@example.com')).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('only exposes the test code in non-production mock mode and stores its HMAC', async () => {
    let challengeData: any;
    const lock = jest.fn(async () => []);
    const tx = {
      otpChallenge: {
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: any) => {
          challengeData = data;
          return { id: 'challenge-1' };
        }),
      },
      studioMember: { findFirst: jest.fn(async () => ({ id: 'member-1' })) },
      $executeRaw: lock,
    };
    const prisma = { withTenant: jest.fn((_tenant: string, work: (tx: any) => unknown) => work(tx)) };
    const config = { get: (key: string) => ({ OTP_MODE: 'mock', NODE_ENV: 'test', OTP_HASH_SECRET: 'test-secret' })[key] };
    const service = new AuthService(prisma as any, config as any, {} as any, {} as any);
    const result = await service.requestMemberOtp('tenant-uuid', '+919876543210', 'login');
    expect(result.test_otp).toMatch(/^\d{6}$/);
    expect(challengeData.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(challengeData.codeHash).not.toContain(result.test_otp);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to test OTP when the runtime mode is missing', async () => {
    const prisma = { withTenant: jest.fn() };
    const config = { get: () => undefined };
    const service = new AuthService(prisma as any, config as any, {} as any, {} as any);
    await expect(service.requestMemberOtp('tenant-uuid', '+919876543210', 'login')).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });
});

describe('AuthService password-change reset race', () => {
  it('does not overwrite a password reset that wins after current-password verification', async () => {
    const currentHash = await hashPassword('CurrentPassword!123');
    const tx = {
      userCredential: {
        findFirst: jest.fn(async () => ({ passwordHash: currentHash })),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      authSession: { updateMany: jest.fn() },
      user: { update: jest.fn() },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, {} as any, {} as any, {} as any);

    await expect(
      service.changePassword('tenant-uuid', 'user-uuid', 'CurrentPassword!123', 'ReplacementPassword!123'),
    ).rejects.toThrow(UnauthorizedException);

    expect(tx.userCredential.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-uuid',
        userId: 'user-uuid',
        passwordHash: currentHash,
      },
      data: expect.objectContaining({
        passwordHash: expect.stringMatching(/^\$argon2id\$/),
        failedAttempts: 0,
        lockedUntil: null,
      }),
    });
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService staff login credential upgrades & locks', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const password = 'LegacySecret#1';

  it('upgrades a verified legacy password hash using compare-and-set', async () => {
    const oldHash = legacyHash();
    let storedHash: string | undefined;
    const updateMany = jest.fn(async ({ data }: any) => {
      storedHash = data.passwordHash;
      return { count: 1 };
    });
    const tx = {
      user: {
        findFirst: jest.fn(async () => ({ id: 'user-1', status: 'active', mustResetPassword: false })),
        update: jest.fn(async () => ({})),
      },
      userCredential: {
        findFirst: jest.fn(async () => ({ passwordHash: oldHash, lockedUntil: null })),
        updateMany,
        update: jest.fn(async () => ({})),
      },
      userRoleAssignment: { findMany: jest.fn(async () => [{ roleId: 'role-1' }]) },
      role: { findMany: jest.fn(async () => [{ code: 'admin' }]) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => 'auth-test-secret' } as any, {} as any, {} as any);
    const issueSession = jest.fn(async () => ({ access_token: 'issued-after-upgrade' }));
    (service as any).issueSession = issueSession;

    await expect(service.login(tenantId, 'staff@example.test', password)).resolves.toMatchObject({ access_token: 'issued-after-upgrade' });

    expect(storedHash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(password, storedHash!)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { tenantId, userId: 'user-1', passwordHash: oldHash },
      data: expect.objectContaining({ passwordHash: storedHash, failedAttempts: 0, lockedUntil: null }),
    });
    expect(issueSession).toHaveBeenCalledTimes(1);
  });

  it('does not issue a session when a concurrent password change wins the credential compare-and-set', async () => {
    const oldHash = legacyHash();
    const tx = {
      user: {
        findFirst: jest.fn(async () => ({ id: 'user-1', status: 'active', mustResetPassword: false })),
        update: jest.fn(async () => ({})),
      },
      userCredential: {
        findFirst: jest.fn(async () => ({ passwordHash: oldHash, lockedUntil: null })),
        updateMany: jest.fn(async () => ({ count: 0 })),
        update: jest.fn(async () => ({})),
      },
      userRoleAssignment: { findMany: jest.fn(async () => [{ roleId: 'role-1' }]) },
      role: { findMany: jest.fn(async () => [{ code: 'admin' }]) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => 'auth-test-secret' } as any, {} as any, {} as any);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(service.login(tenantId, 'staff@example.test', password)).rejects.toThrow(UnauthorizedException);
    expect(issueSession).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService (staff)', () => {
  let prisma: any;
  let service: AuthService;

  beforeEach(() => {
    prisma = createFakePrisma();
    seed(prisma);
    service = makeService(prisma);
  });

  describe('POST /auth/staff/login', () => {
    it('issues tokens when password matches', async () => {
      const result = await service.login(TENANT_A, 'trainer@acme.fitness', PASSWORD);
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
    });

    it('distinguishes an unknown account from an incorrect password', async () => {
      await expectCode(service.login(TENANT_A, 'nobody@acme.fitness', PASSWORD), 'USER_NOT_FOUND');
      await expectCode(service.login(TENANT_A, 'trainer@acme.fitness', 'wrong-password'), 'INVALID_PASSWORD');
    });

    it('locks the account after 5 failed attempts and then refuses logins', async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expectCode(service.login(TENANT_A, 'trainer@acme.fitness', 'wrong-password'), 'INVALID_PASSWORD');
      }
      const locked = prisma.user.rows.find((u: any) => u.id === 'user-trainer');
      expect(locked?.status).toBe('locked');
      expect(locked?.lockedUntil).toBeInstanceOf(Date);
      await expectCode(service.login(TENANT_A, 'trainer@acme.fitness', PASSWORD), 'ACCOUNT_LOCKED');
    });
  });

  describe('POST /auth/staff/refresh', () => {
    it('rotates the refresh token and revokes the old one', async () => {
      const first = (await service.login(TENANT_A, 'trainer@acme.fitness', PASSWORD)) as { refresh_token: string };
      const second = await service.refresh(TENANT_A, first.refresh_token);
      expect(second.refresh_token).not.toBe(first.refresh_token);
      const oldSession = prisma.authSession.rows.find((s: any) => s.tokenHash === hashToken(first.refresh_token));
      expect(oldSession?.revokedAt).toBeInstanceOf(Date);
      expect(oldSession?.revokedReason).toBe('rotated');
      expect(oldSession?.replacedByTokenHash).toBe(hashToken(second.refresh_token));
      expect(prisma.authSession.rows.find((s: any) => s.tokenHash === hashToken(second.refresh_token))?.familyId).toBe(oldSession?.familyId);
    });

    it('detects reuse of a rotated token and revokes the whole family', async () => {
      const first = (await service.login(TENANT_A, 'trainer@acme.fitness', PASSWORD)) as { refresh_token: string };
      await service.refresh(TENANT_A, first.refresh_token);
      await expectCode(service.refresh(TENANT_A, first.refresh_token), 'TOKEN_REUSED');
      expect(prisma.authSession.rows.every((s: any) => s.revokedAt instanceof Date)).toBe(true);
      expect(prisma.authSession.rows.every((s: any) => s.revokedReason === 'reuse_detected')).toBe(true);
    });

    it('rejects an unknown refresh token', async () => {
      await expectCode(service.refresh(TENANT_A, 'not-a-real-token'), 'AUTH_INVALID');
    });
  });

  describe('POST /auth/staff/logout and logout-all', () => {
    it('revokes the presented refresh token', async () => {
      const tokens = (await service.login(TENANT_A, 'trainer@acme.fitness', PASSWORD)) as { refresh_token: string };
      await service.logout(TENANT_A, tokens.refresh_token);
      expect(prisma.authSession.rows[0].revokedAt).toBeInstanceOf(Date);
      expect(prisma.authSession.rows[0].revokedReason).toBe('logout');
    });

    it('revokes every active session for the user', async () => {
      await service.login(TENANT_A, 'trainer@acme.fitness', PASSWORD);
      await service.login(TENANT_A, 'trainer@acme.fitness', PASSWORD);
      const result = await service.logoutAll(TENANT_A, 'user-trainer');
      expect(result.revoked).toBe(2);
      expect(prisma.authSession.rows.every((s: any) => s.revokedAt instanceof Date)).toBe(true);
    });
  });

  describe('invite + reset-password (single-use, expiring)', () => {
    it('invites a staff user and issues a hashed single-use token', async () => {
      const result = await service.invite(TENANT_A, 'new@acme.fitness', 'New Person', 'front_desk');
      expect(result.status).toBe('invited');
      const user = prisma.user.rows.find((u: any) => u.email === 'new@acme.fitness');
      expect(user?.status).toBe('invited');
      expect(prisma.authActionToken.rows[0].tokenHash).toBe(hashToken(result.invite_token));
    });

    it('consumes the invite token once and activates the user', async () => {
      const result = await service.invite(TENANT_A, 'new@acme.fitness', 'New Person', 'front_desk');
      await service.resetPassword(TENANT_A, result.invite_token, 'Brand-new-password1!');
      expect(prisma.user.rows.find((u: any) => u.email === 'new@acme.fitness')?.status).toBe('active');
      expect(prisma.authActionToken.rows[0].consumedAt).toBeInstanceOf(Date);
      await expectCode(service.resetPassword(TENANT_A, result.invite_token, 'Another-brand-new-pass1!'), 'INVITE_INVALID');
    });

    it('rejects an expired reset token', async () => {
      await service.requestPasswordReset(TENANT_A, 'trainer@acme.fitness');
      prisma.authActionToken.rows[0].expiresAt = new Date(Date.now() - 1000);
      const token = 'unused';
      prisma.authActionToken.rows[0].tokenHash = hashToken(token);
      await expectCode(service.resetPassword(TENANT_A, token, 'Brand-new-password1!'), 'RESET_TOKEN_EXPIRED');
    });

    it('does not reveal whether a staff email exists', async () => {
      const before = prisma.authActionToken.rows.length;
      const result = await service.requestPasswordReset(TENANT_A, 'ghost@acme.fitness');
      expect(result).toEqual({ status: 'sent' });
      expect(prisma.authActionToken.rows.length).toBe(before);
    });
  });

  describe('TOTP enrollment (required for owner/admin)', () => {
    it('forces enrollment on first login without issuing an access token', async () => {
      const result = await service.login(TENANT_A, 'owner@acme.fitness', PASSWORD);
      expect(result).toMatchObject({ mfa_enrollment_required: true });
      expect((result as { enrollment_token: string }).enrollment_token.split('.')).toHaveLength(3);
      expect(result).not.toHaveProperty('access_token');
    });

    it('enrolls, confirms and then requires a code on login', async () => {
      const enrollment = await service.enrollTotp(TENANT_A, 'user-owner');
      expect(enrollment.recovery_codes).toHaveLength(10);
      expect(prisma.totpRecoveryCode.rows).toHaveLength(10);

      const stored = prisma.userTotp.rows[0].secret;
      expect(stored.startsWith('v1.')).toBe(true);
      expect(stored).not.toContain(enrollment.secret);
      expect(SecretBox.forKeys(Buffer.alloc(32, 7)).decrypt(stored)).toBe(enrollment.secret);

      expect(prisma.totpRecoveryCode.rows[0].codeHash).toBe(hashToken(normalizeRecoveryCode(enrollment.recovery_codes[0])));
      expect(prisma.totpRecoveryCode.rows[0].codeHash).not.toBe(enrollment.recovery_codes[0]);

      await service.verifyTotpEnrollment(TENANT_A, 'user-owner', totpCode(enrollment.secret));
      expect(prisma.userTotp.rows[0].confirmedAt).toBeInstanceOf(Date);
      expect(prisma.user.rows.find((user: any) => user.id === 'user-owner')?.mfaEnforced).toBe(true);

      await expectCode(service.login(TENANT_A, 'owner@acme.fitness', PASSWORD), 'MFA_REQUIRED');
      let ticket = '';
      await service.login(TENANT_A, 'owner@acme.fitness', PASSWORD).catch((error: HttpException) => {
        ticket = String((error.getResponse() as { mfaTicket?: string }).mfaTicket ?? '');
      });
      const ok = await service.completeMfa(TENANT_A, ticket, totpCode(enrollment.secret));
      expect(ok).toHaveProperty('access_token');
    });

    it('completes a signed two-step MFA challenge without re-validating the password', async () => {
      const enrollment = await service.enrollTotp(TENANT_A, 'user-owner');
      await service.verifyTotpEnrollment(TENANT_A, 'user-owner', totpCode(enrollment.secret));
      let ticket = '';
      await service.login(TENANT_A, ' OWNER@ACME.FITNESS ', PASSWORD).catch((error: HttpException) => {
        ticket = String((error.getResponse() as { mfaTicket?: string }).mfaTicket ?? '');
      });
      expect(ticket.split('.')).toHaveLength(3);
      const result = await service.completeMfa(TENANT_A, ticket, totpCode(enrollment.secret));
      expect(result).toMatchObject({ tenant_id: TENANT_A, tenant_code: 'acme', roles: ['owner'] });
      expect(result).toHaveProperty('access_token');
      await expectCode(service.completeMfa(TENANT_B, ticket, totpCode(enrollment.secret)), 'MFA_TICKET_INVALID');
    });

    it('strictly enforces MFA challenge and rejects bypass even when development auto-verify is configured', async () => {
      const enrollment = await service.enrollTotp(TENANT_A, 'user-owner');
      await service.verifyTotpEnrollment(TENANT_A, 'user-owner', totpCode(enrollment.secret));
      const previousNodeEnv = process.env.NODE_ENV;
      const config = {
        get: (key: string) => {
          if (key === 'AUTH_DEV_AUTO_VERIFY') return 'true';
          if (key === 'MFA_ENCRYPTION_KEY') return TEST_MFA_KEY;
          if (key === 'MFA_ENCRYPTION_KEY_PREVIOUS') return undefined;
          return 'test-secret';
        },
      } as unknown as ConfigService;
      const devService = new AuthService(prisma as unknown as PrismaService, config);

      try {
        process.env.NODE_ENV = 'development';
        await expectCode(devService.login(TENANT_A, 'owner@acme.fitness', PASSWORD), 'MFA_REQUIRED');
        await expectCode(devService.login(TENANT_A, 'owner@acme.fitness', PASSWORD, '000000'), 'MFA_REQUIRED');

        process.env.NODE_ENV = 'production';
        await expectCode(devService.login(TENANT_A, 'owner@acme.fitness', PASSWORD), 'MFA_REQUIRED');
        await expectCode(devService.login(TENANT_A, 'owner@acme.fitness', PASSWORD, '123456'), 'MFA_REQUIRED');
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
      }
    });

    it('accepts a single-use recovery code exactly once', async () => {
      const enrollment = await service.enrollTotp(TENANT_A, 'user-owner');
      await service.verifyTotpEnrollment(TENANT_A, 'user-owner', totpCode(enrollment.secret));
      let ticket1 = '';
      await service.login(TENANT_A, 'owner@acme.fitness', PASSWORD).catch((error: HttpException) => {
        ticket1 = String((error.getResponse() as { mfaTicket?: string }).mfaTicket ?? '');
      });
      const first = await service.completeMfa(TENANT_A, ticket1, undefined, enrollment.recovery_codes[0]);
      expect(first).toHaveProperty('access_token');

      let ticket2 = '';
      await service.login(TENANT_A, 'owner@acme.fitness', PASSWORD).catch((error: HttpException) => {
        ticket2 = String((error.getResponse() as { mfaTicket?: string }).mfaTicket ?? '');
      });
      await expectCode(service.completeMfa(TENANT_A, ticket2, undefined, enrollment.recovery_codes[0]), 'MFA_INVALID');
    });

    it('rejects an invalid enrollment code', async () => {
      await service.enrollTotp(TENANT_A, 'user-owner');
      await expectCode(service.verifyTotpEnrollment(TENANT_A, 'user-owner', '000000'), 'MFA_INVALID');
    });

    it('does not allow an enrollment token to reset an already confirmed authenticator', async () => {
      const enrollment = await service.enrollTotp(TENANT_A, 'user-owner');
      await service.verifyTotpEnrollment(TENANT_A, 'user-owner', totpCode(enrollment.secret));
      await expect(service.enrollTotp(TENANT_A, 'user-owner')).rejects.toThrow(
        'Authenticator is already enrolled for this account',
      );
    });
  });

  describe('GET /auth/staff/me', () => {
    it('returns user, role, tenant and permissions', async () => {
      const profile = await service.getProfile(TENANT_A, 'user-owner');
      expect(profile.user).toMatchObject({ id: 'user-owner', userType: 'staff' });
      expect(profile.roles).toEqual(['owner']);
      expect(profile.role).toBe('owner');
      expect(profile.tenant).toMatchObject({ id: TENANT_A, code: 'acme' });
      expect(profile.permissions).toContain('*');
    });
  });
});

describe('AuthService member OTP single-use claim', () => {
  const previousImportStore = process.env.IMPORT_STORE;
  beforeAll(() => {
    process.env.IMPORT_STORE = 'erp';
  });
  afterAll(() => {
    if (previousImportStore === undefined) delete process.env.IMPORT_STORE;
    else process.env.IMPORT_STORE = previousImportStore;
  });

  it('does not create or authenticate a portal user while the ERP member is pending approval', async () => {
    const challenge: any = {
      id: 'challenge-register', tenantId: 'tenant-uuid', phoneE164: '+919876543210', purpose: 'register',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async ({ data }: any) => { challenge.consumedAt = data.consumedAt; return { count: 1 }; }),
      },
      user: { findFirst: jest.fn(async () => null), create: jest.fn() },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const config = { get: (key: string) => key === 'OTP_HASH_SECRET' ? 'otp-test-secret' : undefined };
    const erp = { call: jest.fn(async () => ({ member_id: 'WS-MEM-1', status: 'inactive', duplicate: false })) };
    const service = new AuthService(prisma as any, config as any, {} as any, erp as any);
    challenge.codeHash = (service as any).otpHash('tenant-uuid', challenge.phoneE164, '123456');
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(service.verifyMemberOtp('tenant-uuid', 'tenant-a', 'corr-approval', challenge.id, '123456', 'New Member'))
      .rejects.toThrow('pending studio approval');

    expect(erp.call).toHaveBeenCalledTimes(1);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('allows only one of two concurrent valid verifications to claim a challenge', async () => {
    const challenge: any = {
      id: 'challenge-race', tenantId: 'tenant-uuid', phoneE164: '+919876543210', purpose: 'login',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const user = { id: 'user-1', displayName: 'Member', email: 'member@example.test', status: 'active' };
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async ({ data }: any) => {
          if (challenge.consumedAt) return { count: 0 };
          challenge.consumedAt = data.consumedAt;
          return { count: 1 };
        }),
      },
      user: { findFirst: jest.fn(async () => user) },
      userErpLink: { findFirst: jest.fn(async () => ({ erpUserRef: 'WS-MEM-1' })) },
      studioMember: { findFirst: jest.fn(async () => null) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const config = { get: (key: string) => key === 'OTP_HASH_SECRET' ? 'otp-test-secret' : undefined };
    const erp = { call: jest.fn(async () => ({ id: 'WS-MEM-1', status: 'active' })) };
    const service = new AuthService(prisma as any, config as any, {} as any, erp as any);
    challenge.codeHash = (service as any).otpHash('tenant-uuid', challenge.phoneE164, '123456');
    (service as any).rolesFor = jest.fn(async () => ['member']);
    (service as any).issueSession = jest.fn(async () => ({ access_token: 'test-token' }));

    const results = await Promise.allSettled([
      service.verifyMemberOtp('tenant-uuid', 'tenant-a', 'corr-1', challenge.id, '123456'),
      service.verifyMemberOtp('tenant-uuid', 'tenant-a', 'corr-2', challenge.id, '123456'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(UnauthorizedException);
    expect(tx.otpChallenge.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.user.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService single-use credential operations', () => {
  const tenantId = 'tenant-uuid';
  const secret = 'auth-race-test-secret';
  const config = { get: (key: string) => key === 'JWT_SECRET' ? secret : undefined };

  it('rotates a refresh token once under concurrent requests', async () => {
    const authenticatedAt = new Date(Date.now() - 10 * 60_000);
    const session: any = { id: 'session-old', tenantId, userId: 'user-1', tokenHash: 'old-hash', expiresAt: new Date(Date.now() + 60_000), authenticatedAt, revokedAt: null };
    const tx = {
      authSession: {
        findFirst: jest.fn(async () => ({ ...session })),
        updateMany: jest.fn(async () => {
          if (session.revokedAt) return { count: 0 };
          session.revokedAt = new Date();
          return { count: 1 };
        }),
        create: jest.fn(async () => ({ id: 'session-new' })),
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, config as any, {} as any, {} as any);
    (service as any).rolesFor = jest.fn(async () => ['member']);

    const results = await Promise.allSettled([service.refresh(tenantId, 'refresh-old'), service.refresh(tenantId, 'refresh-old')]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(UnauthorizedException);
    expect(tx.authSession.create).toHaveBeenCalledTimes(1);
    expect(tx.authSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ authenticatedAt }) });
  });

  it('consumes a password-reset fingerprint once under concurrent requests', async () => {
    const credential: any = { passwordHash: 'existing-hash' };
    const tx = {
      userCredential: {
        findFirst: jest.fn(async () => ({ ...credential })),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (credential.passwordHash !== where.passwordHash) return { count: 0 };
          credential.passwordHash = data.passwordHash;
          return { count: 1 };
        }),
      },
      authSession: { updateMany: jest.fn(async () => ({ count: 2 })) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, config as any, {} as any, {} as any);
    const fingerprint = createHash('sha256').update(credential.passwordHash).digest('hex');
    const token = signPurposeToken({ sub: 'user-1', tenant: tenantId, purpose: 'password-reset', fingerprint }, secret, 1_800);

    const results = await Promise.allSettled([
      service.completePasswordReset(tenantId, token, 'StrongPassword!123'),
      service.completePasswordReset(tenantId, token, 'DifferentPassword!456'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(GoneException);
    expect(tx.authSession.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService owner privilege freshness', () => {
  it('does not grant owner/admin assignment from stale token role claims', async () => {
    const create = jest.fn();
    const tx = {
      role: { findMany: jest.fn(async ({ where }: any) => where.code ? [{ id: 'admin-role', code: 'admin' }] : []) },
      userRoleAssignment: { findMany: jest.fn(async () => []) },
      user: { create },
    };
    const prisma = { withTenant: jest.fn((_tenant: string, work: (tx: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, {} as any, {} as any, {} as any);

    await expect(service.invite('tenant-uuid', 'admin@example.com', 'Admin', undefined, ['admin'], 'revoked-owner', 'corr-1'))
      .rejects.toThrow(ForbiddenException);
    expect(tx.userRoleAssignment.findMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-uuid', userId: 'revoked-owner' } });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('AuthService member OTP authentication bypass protections', () => {
  const previousImportStore = process.env.IMPORT_STORE;
  beforeAll(() => {
    process.env.IMPORT_STORE = 'erp';
  });
  afterAll(() => {
    if (previousImportStore === undefined) delete process.env.IMPORT_STORE;
    else process.env.IMPORT_STORE = previousImportStore;
  });

  const tenantId = 'tenant-uuid';
  const tenantCode = 'acme';
  const phone = '+919876543210';
  const otp = '123456';
  const secret = 'test-secret';

  it('1. OTP-send failure never creates a member account', async () => {
    const userCreate = jest.fn();
    const tx = {
      $queryRaw: jest.fn(async () => []),
      otpChallenge: { count: jest.fn(async () => 5) },
      user: { findFirst: jest.fn(), create: userCreate },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const config = { get: (key: string) => ({ OTP_MODE: 'mock', NODE_ENV: 'test', OTP_HASH_SECRET: secret })[key] };
    const service = new AuthService(prisma as any, config as any, {} as any, {} as any);

    await expect(service.sendMemberOtp(tenantId, phone)).rejects.toThrow(HttpException);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('2. Missing OTP challenges never create a member or issue a session in verifyMemberOtpByPhone', async () => {
    const userCreate = jest.fn();
    const issueSession = jest.fn();
    const tx = {
      otpChallenge: { findFirst: jest.fn(async () => null) },
      user: { findFirst: jest.fn(async () => null), create: userCreate },
      tenant: { findUnique: jest.fn(async () => ({ code: tenantCode })) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, {} as any, {} as any, {} as any);
    (service as any).issueSession = issueSession;

    await expect(service.verifyMemberOtpByPhone(tenantId, phone, otp)).rejects.toThrow(UnauthorizedException);
    expect(userCreate).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('3. Expired OTP challenges are rejected and never issue a session', async () => {
    const issueSession = jest.fn();
    const tx = {
      otpChallenge: { findFirst: jest.fn(async () => null) },
      user: { create: jest.fn() },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, {} as any, {} as any, {} as any);
    (service as any).issueSession = issueSession;

    await expect(service.verifyMemberOtpByPhone(tenantId, phone, otp)).rejects.toThrow(UnauthorizedException);
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('4. Consumed OTP challenges cannot be reused', async () => {
    const issueSession = jest.fn();
    const challenge = {
      id: 'challenge-1',
      tenantId,
      phoneE164: phone,
      purpose: 'login',
      consumedAt: new Date(Date.now() - 5000),
      expiresAt: new Date(Date.now() + 60000),
      attempts: 0,
    };
    const tx = {
      otpChallenge: { findFirst: jest.fn(async () => challenge) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, {} as any, {} as any, {} as any);
    (service as any).issueSession = issueSession;

    await expect(service.verifyMemberOtp(tenantId, tenantCode, 'corr-1', challenge.id, otp)).rejects.toThrow(UnauthorizedException);
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('5. Incorrect OTPs are rejected and increment failed attempts', async () => {
    const challenge = {
      id: 'challenge-1',
      tenantId,
      phoneE164: phone,
      purpose: 'login',
      codeHash: 'correct-hash',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60000),
      attempts: 0,
    };
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => challenge),
        updateMany,
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, {} as any);

    await expect(service.verifyMemberOtp(tenantId, tenantCode, 'corr-1', challenge.id, 'wrong-otp')).rejects.toThrow(UnauthorizedException);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: challenge.id }),
      data: { attempts: { increment: 1 } },
    }));
  });

  it('6. Concurrent verification cannot successfully consume the same challenge twice', async () => {
    const challenge: any = {
      id: 'challenge-race', tenantId, phoneE164: phone, purpose: 'login',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const user = { id: 'user-1', displayName: 'Member', email: 'member@example.test', status: 'active' };
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async ({ data }: any) => {
          if (challenge.consumedAt) return { count: 0 };
          challenge.consumedAt = data.consumedAt;
          return { count: 1 };
        }),
      },
      user: { findFirst: jest.fn(async () => user) },
      userErpLink: { findFirst: jest.fn(async () => ({ erpUserRef: 'WS-MEM-1' })) },
      studioMember: { findFirst: jest.fn(async () => null) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const erp = { call: jest.fn(async () => ({ id: 'WS-MEM-1', status: 'active' })) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, erp as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    (service as any).rolesFor = jest.fn(async () => ['member']);
    (service as any).issueSession = jest.fn(async () => ({ access_token: 'test-token' }));

    const results = await Promise.allSettled([
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-1', challenge.id, otp),
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-2', challenge.id, otp),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('7. Cross-tenant challenge access is rejected', async () => {
    const tx = {
      otpChallenge: { findFirst: jest.fn(async ({ where }: any) => where.tenantId === 'tenant-a' ? { id: 'c-1' } : null) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, {} as any, {} as any, {} as any);

    await expect(service.verifyMemberOtp('tenant-b', 'tenant-b', 'corr-1', 'c-1', otp)).rejects.toThrow(UnauthorizedException);
  });

  it('8. Legitimate OTP login flow succeeds and issues a member session', async () => {
    const challenge: any = {
      id: 'challenge-login', tenantId, phoneE164: phone, purpose: 'login',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const user = { id: 'user-member-1', displayName: 'Valid Member', email: 'member@test.com', status: 'active' };
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      tenant: { findUnique: jest.fn(async () => ({ code: tenantCode })) },
      user: { findFirst: jest.fn(async () => user) },
      userErpLink: { findFirst: jest.fn(async () => ({ erpUserRef: 'WS-MEM-1' })) },
      studioMember: { findFirst: jest.fn(async () => null) },
      authSession: { create: jest.fn(async () => ({ id: 'session-1' })) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const erp = { call: jest.fn(async () => ({ id: 'WS-MEM-1', status: 'active' })) };
    const service = new AuthService(prisma as any, { get: (key: string) => key === 'JWT_SECRET' ? 'test-jwt-secret' : secret } as any, {} as any, erp as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    (service as any).rolesFor = jest.fn(async () => ['member']);

    const result = await service.verifyMemberOtpByPhone(tenantId, phone, otp);
    expect(result).toHaveProperty('access_token');
    expect(result).toHaveProperty('refresh_token');
    expect(result.user).toMatchObject({ id: user.id, name: user.displayName });
  });

  it('9. Member registration flow succeeds when approved and creates local user', async () => {
    const challenge: any = {
      id: 'challenge-reg', tenantId, phoneE164: phone, purpose: 'register',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const createdUser = { id: 'new-user-id', displayName: 'New Member', email: 'new@test.com' };
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => createdUser),
      },
      userErpLink: { create: jest.fn() },
      role: { findFirst: jest.fn(async () => ({ id: 'role-member' })) },
      userRoleAssignment: { create: jest.fn() },
      authSession: { create: jest.fn(async () => ({ id: 'session-reg' })) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const erp = { call: jest.fn(async () => ({ member_id: 'WS-MEM-NEW', status: 'active' })) };
    const auditOutbox = { recordInTransaction: jest.fn() };
    const service = new AuthService(prisma as any, { get: (key: string) => key === 'JWT_SECRET' ? 'test-jwt-secret' : secret } as any, auditOutbox as any, erp as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    (service as any).rolesFor = jest.fn(async () => ['member']);

    const result = await service.verifyMemberOtp(tenantId, tenantCode, 'corr-reg', challenge.id, otp, 'New Member', 'new@test.com');
    expect(result.is_new_user).toBe(true);
    expect(result.member_id).toBe('WS-MEM-NEW');
    expect(tx.user.create).toHaveBeenCalled();
  });

  it('10. Production mode never exposes mock OTP values', async () => {
    const prisma = { withTenant: jest.fn() };
    const config = { get: (key: string) => ({ OTP_MODE: 'mock', NODE_ENV: 'production' })[key] };
    const service = new AuthService(prisma as any, config as any, {} as any, {} as any);

    await expect(service.sendMemberOtp(tenantId, phone)).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('rejects verifyMemberOtpByPhone with invalid tenant code', async () => {
    const challenge: any = {
      id: 'c-1', tenantId, phoneE164: phone, purpose: 'login',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const tx = {
      otpChallenge: { findFirst: jest.fn(async () => challenge) },
      tenant: { findUnique: jest.fn(async () => null) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, {} as any, {} as any, {} as any);

    await expect(service.verifyMemberOtpByPhone(tenantId, phone, otp)).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService OTP purpose enforcement', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const tenantCode = 'acme';
  const phone = '+919876543210';
  const otp = '654321';
  const secret = 'otp-hash-secret-test';

  it('rejects register challenge when member already exists and does not log in', async () => {
    const challenge: any = {
      id: 'challenge-reg-existing', tenantId, phoneE164: phone, purpose: 'register',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const existingUser = { id: 'user-existing', displayName: 'Existing Member', email: 'existing@test.com' };
    const userCreate = jest.fn();
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: {
        findFirst: jest.fn(async () => existingUser),
        create: userCreate,
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, {} as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-1', challenge.id, otp, 'Existing Member', 'existing@test.com'),
    ).rejects.toThrow(ConflictException);

    expect(userCreate).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rejects link challenge for an existing member without issuing session or creating user', async () => {
    const challenge: any = {
      id: 'challenge-link-existing', tenantId, phoneE164: phone, purpose: 'link',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const existingUser = { id: 'user-existing', displayName: 'Existing Member', email: 'existing@test.com' };
    const userCreate = jest.fn();
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: {
        findFirst: jest.fn(async () => existingUser),
        create: userCreate,
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, {} as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-link', challenge.id, otp),
    ).rejects.toThrow(BadRequestException);

    expect(userCreate).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rejects link challenge for a non-existing member without issuing session or creating user', async () => {
    const challenge: any = {
      id: 'challenge-link-new', tenantId, phoneE164: phone, purpose: 'link',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const userCreate = jest.fn();
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: {
        findFirst: jest.fn(async () => null),
        create: userCreate,
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, {} as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-link', challenge.id, otp),
    ).rejects.toThrow(BadRequestException);

    expect(userCreate).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rejects login challenge when no registered member exists', async () => {
    const challenge: any = {
      id: 'challenge-login-notfound', tenantId, phoneE164: phone, purpose: 'login',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const userCreate = jest.fn();
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: {
        findFirst: jest.fn(async () => null),
        create: userCreate,
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, {} as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-login', challenge.id, otp),
    ).rejects.toThrow(NotFoundException);

    expect(userCreate).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rejects login challenge when member account is inactive', async () => {
    const challenge: any = {
      id: 'challenge-login-inactive', tenantId, phoneE164: phone, purpose: 'login',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const user = { id: 'user-inactive', displayName: 'Inactive Member', phoneE164: phone, status: 'inactive' };
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: {
        findFirst: jest.fn(async () => user),
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, {} as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-login', challenge.id, otp),
    ).rejects.toThrow(ForbiddenException);

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rejects unsupported challenge purpose', async () => {
    const challenge: any = {
      id: 'challenge-unsupported', tenantId, phoneE164: phone, purpose: 'password_reset',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: { findFirst: jest.fn(async () => null) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, {} as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-unsupported', challenge.id, otp),
    ).rejects.toThrow(BadRequestException);

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rejects register challenge when full name is missing', async () => {
    const challenge: any = {
      id: 'challenge-reg-noname', tenantId, phoneE164: phone, purpose: 'register',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: { findFirst: jest.fn(async () => null) },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, {} as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-noname', challenge.id, otp, undefined),
    ).rejects.toThrow(BadRequestException);

    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rejects login challenge when member account status is missing or undefined', async () => {
    const challenge: any = {
      id: 'challenge-login-nostatus', tenantId, phoneE164: phone, purpose: 'login',
      expiresAt: new Date(Date.now() + 60_000), attempts: 0, consumedAt: null,
    };
    const userWithoutStatus = { id: 'user-no-status', displayName: 'No Status Member', email: 'nostatus@test.com' };
    const userCreate = jest.fn();
    const tx = {
      otpChallenge: {
        findFirst: jest.fn(async () => ({ ...challenge })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      user: {
        findFirst: jest.fn(async () => userWithoutStatus),
        create: userCreate,
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => unknown) => work(tx)) };
    const service = new AuthService(prisma as any, { get: () => secret } as any, {} as any, {} as any);
    challenge.codeHash = (service as any).otpHash(tenantId, challenge.phoneE164, otp);
    const issueSession = jest.fn();
    (service as any).issueSession = issueSession;

    await expect(
      service.verifyMemberOtp(tenantId, tenantCode, 'corr-login-nostatus', challenge.id, otp),
    ).rejects.toThrow(ForbiddenException);

    expect(issueSession).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });
});
