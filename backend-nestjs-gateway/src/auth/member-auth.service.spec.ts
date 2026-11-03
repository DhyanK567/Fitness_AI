import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { hashPassword } from '../common/auth-token';

describe('AuthService (Member Registration & Login)', () => {
  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const TENANT_CODE = 'ranayaa';

  function createTestService(customTx?: any) {
    const tx = customTx || {
      user: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({
          id: 'user-uuid-1',
          displayName: data.displayName,
          email: data.email,
          phoneE164: data.phoneE164,
          status: 'active',
        })),
        update: jest.fn(async ({ data }: any) => ({
          id: 'user-uuid-1',
          displayName: 'Test Member',
          email: data.email,
          phoneE164: '+919876543210',
          status: 'active',
        })),
      },
      userCredential: {
        create: jest.fn(async () => ({})),
        upsert: jest.fn(async () => ({})),
        findFirst: jest.fn(async () => null),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      studioMember: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'mem-uuid-1', ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: 'mem-uuid-1', ...data })),
      },
      userErpLink: {
        create: jest.fn(async () => ({})),
      },
      role: {
        findFirst: jest.fn(async () => ({ id: 'role-member', code: 'member' })),
        findMany: jest.fn(async () => [{ id: 'role-member', code: 'member' }]),
      },
      userRoleAssignment: {
        create: jest.fn(async () => ({})),
        findMany: jest.fn(async () => [{ roleId: 'role-member' }]),
      },
      authSession: {
        create: jest.fn(async () => ({ id: 'session-uuid-1' })),
      },
    };

    const prisma = {
      withTenant: jest.fn((_tenant: string, work: (t: any) => unknown) => work(tx)),
    };

    const config = {
      get: (key: string) => {
        const map: Record<string, string> = {
          NODE_ENV: 'test',
          JWT_SECRET: 'super-secret-jwt-key-minimum-32-chars-long!',
          OTP_HASH_SECRET: 'super-secret-otp-hash-key!',
          OTP_MODE: 'mock',
        };
        return map[key];
      },
    };

    const service = new AuthService(prisma as any, config as any, undefined, undefined);
    return { service, tx, prisma };
  }

  describe('memberRegister', () => {
    it('successfully registers a member with hashed password and session issuance', async () => {
      const { service, tx } = createTestService();

      const result = await service.memberRegister(TENANT_ID, TENANT_CODE, 'corr-1', {
        fullName: 'Aarav Patel',
        email: 'aarav@studio.in',
        phone: '+919876543210',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
      });

      expect(result.access_token).toBeDefined();
      expect(result.user.name).toBe('Aarav Patel');
      expect(result.user.email).toBe('aarav@studio.in');
      expect(tx.user.create).toHaveBeenCalled();
      expect(tx.userCredential.create).toHaveBeenCalled();
    });

    it('rejects registration when password and confirmPassword mismatch', async () => {
      const { service } = createTestService();

      await expect(
        service.memberRegister(TENANT_ID, TENANT_CODE, 'corr-1', {
          fullName: 'Aarav Patel',
          email: 'aarav@studio.in',
          phone: '+919876543210',
          password: 'Password1!',
          confirmPassword: 'DifferentPassword2@',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects registration when password is less than 8 characters', async () => {
      const { service } = createTestService();

      await expect(
        service.memberRegister(TENANT_ID, TENANT_CODE, 'corr-1', {
          fullName: 'Aarav Patel',
          email: 'aarav@studio.in',
          phone: '+919876543210',
          password: 'short',
          confirmPassword: 'short',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate email within the tenant', async () => {
      const { service, tx } = createTestService();
      tx.user.findFirst.mockImplementation(async ({ where }: any) => {
        if (where?.email) return { id: 'existing-u-1', email: where.email };
        return null;
      });

      await expect(
        service.memberRegister(TENANT_ID, TENANT_CODE, 'corr-1', {
          fullName: 'Duplicate User',
          email: 'aarav@studio.in',
          phone: '+919876543210',
          password: 'ValidPassword123!',
          confirmPassword: 'ValidPassword123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('memberLogin', () => {
    it('authenticates member with email and password and returns paid membership', async () => {
      const password = 'CorrectPassword123!';
      const passwordHash = await hashPassword(password);

      const customTx = {
        user: {
          findFirst: jest.fn(async () => ({
            id: 'user-uuid-1',
            displayName: 'Priya Sen',
            email: 'priya@studio.in',
            phoneE164: '+919812345678',
            userType: 'member',
            status: 'active',
          })),
        },
        userCredential: {
          findFirst: jest.fn(async () => ({
            id: 'cred-1',
            passwordHash,
            failedAttempts: 0,
          })),
          update: jest.fn(async () => ({})),
        },
        studioMember: {
          findFirst: jest.fn(async () => ({
            id: 'sm-1',
            fullName: 'Priya Sen',
            email: 'priya@studio.in',
            phone: '+919812345678',
            plan: 'pre basic',
            status: 'Active',
            joined: new Date('2026-10-01'),
            expiry: new Date('2026-11-01'),
          })),
        },
        studioMembership: {
          findFirst: jest.fn(async () => ({
            id: 'plan_pre_basic',
            name: 'pre basic',
            priceINR: 100,
            sessionLimit: 30,
          })),
        },
        studioPayment: {
          findFirst: jest.fn(async () => ({
            id: 'pay-1',
            amount: 100,
            status: 'Paid',
            ref: 'pay_test_order_123',
          })),
        },
        role: {
          findMany: jest.fn(async () => [{ id: 'role-member', code: 'member' }]),
        },
        userRoleAssignment: {
          findMany: jest.fn(async () => [{ roleId: 'role-member' }]),
        },
        authSession: {
          create: jest.fn(async () => ({ id: 'session-uuid-1' })),
        },
      };

      const { service } = createTestService(customTx);

      const result = await service.memberLogin(
        TENANT_ID,
        TENANT_CODE,
        'corr-1',
        'priya@studio.in',
        password,
      );

      expect(result.access_token).toBeDefined();
      expect(result.user.email).toBe('priya@studio.in');
      expect(result.membership).toBeDefined();
      expect(result.membership?.planName).toBe('pre basic');
      expect(result.membership?.priceFormatted).toBe('₹100');
      expect(result.membership?.paymentStatus).toBe('Paid');
    });

    it('rejects memberLogin with incorrect password', async () => {
      const correctHash = await hashPassword('CorrectPassword123!');
      const customTx = {
        user: {
          findFirst: jest.fn(async () => ({
            id: 'user-uuid-1',
            email: 'priya@studio.in',
            userType: 'member',
            status: 'active',
          })),
        },
        userCredential: {
          findFirst: jest.fn(async () => ({
            id: 'cred-1',
            passwordHash: correctHash,
            failedAttempts: 0,
          })),
          update: jest.fn(async () => ({})),
        },
      };

      const { service } = createTestService(customTx);

      await expect(
        service.memberLogin(TENANT_ID, TENANT_CODE, 'corr-1', 'priya@studio.in', 'WrongPassword123!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('enforces multi-tenant isolation by rejecting login in different tenant', async () => {
      const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000002';
      const { service, tx } = createTestService();
      tx.user.findFirst.mockImplementation(async ({ where }: any) => {
        // Only exists in TENANT_ID, not in OTHER_TENANT_ID
        if (where?.tenantId === TENANT_ID && where?.email === 'user@tenant1.com') {
          return { id: 'user-t1', email: 'user@tenant1.com', userType: 'member', status: 'active' };
        }
        return null;
      });

      await expect(
        service.memberLogin(OTHER_TENANT_ID, 'other-tenant', 'corr-1', 'user@tenant1.com', 'SomePassword123!'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('completeMemberAccount', () => {
    it('links email & password to existing OTP paid member and preserves membership', async () => {
      const crypto = require('node:crypto');
      const phoneE164 = '+919876543210';
      const otp = '123456';
      const codeHash = crypto.createHmac('sha256', 'super-secret-otp-hash-key!').update(`${TENANT_ID}:${phoneE164}:${otp}`).digest('hex');

      const customTx = {
        otpChallenge: {
          findFirst: jest.fn(async () => ({
            id: 'ch-1',
            tenantId: TENANT_ID,
            phoneE164,
            codeHash,
            attempts: 0,
            consumedAt: null,
            expiresAt: new Date(Date.now() + 300000),
          })),
          updateMany: jest.fn(async () => ({ count: 1 })),
        },
        user: {
          findFirst: jest.fn(async ({ where }: any) => {
            if (where?.email === 'paidmember@studio.in' && where?.NOT) {
              return null; // No OTHER user with this email
            }
            if (where?.OR) {
              return {
                id: 'user-uuid-1',
                displayName: 'Existing Paid Member',
                phoneE164,
                email: null,
                userType: 'member',
                status: 'active',
              };
            }
            return null;
          }),
          update: jest.fn(async ({ data }: any) => ({
            id: 'user-uuid-1',
            displayName: 'Existing Paid Member',
            phoneE164,
            email: data.email,
            status: 'active',
          })),
        },
        userCredential: {
          upsert: jest.fn(async () => ({})),
        },
        studioMember: {
          findFirst: jest.fn(async () => ({
            id: 'sm-uuid-1',
            fullName: 'Existing Paid Member',
            phone: phoneE164,
            email: null,
            plan: 'pre basic',
            status: 'Active',
            joined: new Date('2026-10-15'),
            expiry: new Date('2026-11-15'),
          })),
          update: jest.fn(async () => ({})),
        },
        studioMembership: {
          findFirst: jest.fn(async () => ({
            id: 'plan_pre_basic',
            name: 'pre basic',
            priceINR: 100,
          })),
        },
        studioPayment: {
          findFirst: jest.fn(async () => ({
            id: 'pay-1',
            amount: 100,
            status: 'Paid',
            ref: 'pay_test_order_xyz',
          })),
        },
        role: {
          findMany: jest.fn(async () => [{ id: 'role-member', code: 'member' }]),
        },
        userRoleAssignment: {
          findMany: jest.fn(async () => [{ roleId: 'role-member' }]),
        },
        authSession: {
          create: jest.fn(async () => ({ id: 'session-uuid-1' })),
        },
      };

      const { service } = createTestService(customTx);

      const result = await service.completeMemberAccount(TENANT_ID, TENANT_CODE, 'corr-1', {
        challenge_id: 'ch-1',
        otp,
        email: 'paidmember@studio.in',
        password: 'NewStrongPassword123!',
        confirmPassword: 'NewStrongPassword123!',
      });

      expect(result.access_token).toBeDefined();
      expect(result.user.email).toBe('paidmember@studio.in');
      expect(result.membership).toBeDefined();
      expect(result.membership?.planName).toBe('pre basic');
      expect(result.membership?.paymentStatus).toBe('Paid');
      expect(result.membership?.paymentRef).toBe('pay_test_order_xyz');
      expect(customTx.userCredential.upsert).toHaveBeenCalled();
    });

    it('rejects completeMemberAccount when OTP is incorrect', async () => {
      const crypto = require('node:crypto');
      const phoneE164 = '+919876543210';
      const actualCodeHash = crypto.createHmac('sha256', 'super-secret-otp-hash-key!').update(`${TENANT_ID}:${phoneE164}:654321`).digest('hex');

      const customTx = {
        otpChallenge: {
          findFirst: jest.fn(async () => ({
            id: 'ch-1',
            tenantId: TENANT_ID,
            phoneE164,
            codeHash: actualCodeHash,
            attempts: 0,
            consumedAt: null,
            expiresAt: new Date(Date.now() + 300000),
          })),
          updateMany: jest.fn(async () => ({ count: 1 })),
        },
      };

      const { service } = createTestService(customTx);

      await expect(
        service.completeMemberAccount(TENANT_ID, TENANT_CODE, 'corr-1', {
          challenge_id: 'ch-1',
          otp: '000000',
          email: 'paidmember@studio.in',
          password: 'NewStrongPassword123!',
          confirmPassword: 'NewStrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
