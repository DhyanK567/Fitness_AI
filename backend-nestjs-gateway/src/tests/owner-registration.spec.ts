import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { AuthLifecycleController } from '../auth/auth-lifecycle.controller';
import { RegisterStudioDto, ResendVerificationEmailDto, VerifyOwnerEmailDto } from '../auth/dto/auth-lifecycle.dto';
import { PrismaService } from '../common/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { verifyPassword } from '../common/auth-token';

describe('Phase 1B: Owner Studio Registration (POST /api/v1/auth/register-studio)', () => {
  let authService: AuthService;
  let controller: AuthLifecycleController;
  let mockPrisma: any;
  let mockConfig: any;
  let mockAuditOutbox: any;

  const validRegistrationPayload: RegisterStudioDto = {
    studio_name: 'Sanctuary Yoga & Pilates',
    tenant_code: 'sanctuary-yoga',
    owner_name: 'Priya Sharma',
    owner_email: 'priya@sanctuary-yoga.com',
    owner_phone: '+919876543210',
    password: 'Correct-Horse-Battery-Staple-9!',
  };

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: jest.fn<any>(),
      $executeRaw: jest.fn<any>(),
      $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
      withTenant: jest.fn<any>(),
      tenant: {
        findUnique: jest.fn<any>(),
        findFirst: jest.fn<any>(),
      },
    };

    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'JWT_SECRET') return 'test-jwt-secret-minimum-32-chars-long!!';
        if (key === 'OTP_HASH_SECRET') return 'test-otp-secret-minimum-32-chars-long!!';
        return undefined;
      }),
    };

    mockAuditOutbox = {
      record: jest.fn<any>().mockResolvedValue({} as any),
      recordInTransaction: jest.fn<any>().mockResolvedValue({} as any),
    };

    authService = new AuthService(
      mockPrisma as unknown as PrismaService,
      mockConfig as unknown as ConfigService,
      mockAuditOutbox as unknown as AuditOutboxService,
    );

    controller = new AuthLifecycleController(authService);
  });

  describe('1. Successful Studio Registration Contract', () => {
    it('registers a new studio, hashes password with Argon2id, generates 24h verification token, and returns onboarding state', async () => {
      const mockDbResult = {
        success: true,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        tenant_code: 'sanctuary-yoga',
        user_id: '22222222-2222-4222-8222-222222222222',
        token_id: '33333333-3333-4333-8333-333333333333',
        status: 'onboarding',
      };

      mockPrisma.$queryRaw.mockResolvedValueOnce([{ result: mockDbResult }]);

      const result = await authService.registerStudio(validRegistrationPayload, 'corr-test-123');

      expect(result.status).toBe('onboarding');
      expect(result.tenant_id).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.tenant_code).toBe('sanctuary-yoga');
      expect(result.user_id).toBe('22222222-2222-4222-8222-222222222222');
      expect(result.message).toContain('Please verify your email');
      expect(result.test_verification_token).toBeDefined();
      expect(typeof result.test_verification_token).toBe('string');

      // Verify no sensitive credentials or hashes leaked in the response
      expect((result as any).password).toBeUndefined();
      expect((result as any).password_hash).toBeUndefined();
      expect((result as any).token_hash).toBeUndefined();

      // Inspect parameters passed to PostgreSQL platform.register_onboarding_studio
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const queryInvocation = mockPrisma.$queryRaw.mock.calls[0];
      const strings = queryInvocation[0];
      const values = queryInvocation.slice(1);

      expect(strings.join(' ')).toContain('platform.register_onboarding_studio');
      expect(values[0]).toBe('Sanctuary Yoga & Pilates');
      expect(values[1]).toBe('sanctuary-yoga');
      expect(values[2]).toBe('Priya Sharma');
      expect(values[3]).toBe('priya@sanctuary-yoga.com');
      expect(values[4]).toBe('+919876543210');

      // Password hash must be valid Argon2id
      const passedPasswordHash = values[5];
      expect(passedPasswordHash).toMatch(/^\$argon2id\$/);
      const isPasswordMatching = await verifyPassword('Correct-Horse-Battery-Staple-9!', passedPasswordHash);
      expect(isPasswordMatching).toBe(true);

      // Token hash must be a 64-character hex SHA-256 digest
      const passedTokenHash = values[6];
      expect(passedTokenHash).toMatch(/^[0-9a-f]{64}$/);

      // Token expiration must be in the future (~24 hours from now)
      const passedExpiresAt: Date = values[7];
      expect(passedExpiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
      expect(passedExpiresAt.getTime()).toBeLessThan(Date.now() + 25 * 3600_000);

      // Confirms audit and outbox event is recorded atomically inside the database transaction
      expect(mockAuditOutbox.recordInTransaction).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          tenantId: '11111111-1111-4111-8111-111111111111',
          actorType: 'user',
          actorId: '22222222-2222-4222-8222-222222222222',
          action: 'studio.registered',
          resourceType: 'tenant',
          eventType: 'studio.registered',
        }),
      );
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('supports registration without optional owner_phone', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        result: {
          success: true,
          tenant_id: 'tenant-no-phone',
          tenant_code: 'fit-no-phone',
          user_id: 'user-no-phone',
          status: 'onboarding',
        },
      }]);

      const payloadWithoutPhone: RegisterStudioDto = {
        studio_name: 'Studio Minimal',
        tenant_code: 'studio-minimal',
        owner_name: 'Alex Minimal',
        owner_email: 'alex@minimal.fit',
        password: 'ValidPassword123!',
      };

      const result = await authService.registerStudio(payloadWithoutPhone);
      expect(result.status).toBe('onboarding');
      expect(result.tenant_id).toBe('tenant-no-phone');

      const values = mockPrisma.$queryRaw.mock.calls[0].slice(1);
      expect(values[4]).toBeNull();
    });
  });

  describe('2. Security & Validation Enforcement', () => {
    it('rejects passwords shorter than 12 characters', async () => {
      const weakPayload: RegisterStudioDto = {
        ...validRegistrationPayload,
        password: 'Short1!',
      };

      await expect(authService.registerStudio(weakPayload)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('rejects passwords lacking at least three character classes', async () => {
      const weakPayload: RegisterStudioDto = {
        ...validRegistrationPayload,
        password: 'alllowercaseletters',
      };

      await expect(authService.registerStudio(weakPayload)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('maps database code collision (P0003) to ConflictException (409)', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('Tenant code sanctuary-yoga is already taken (ERRCODE = P0003)'),
      );

      await expect(authService.registerStudio(validRegistrationPayload)).rejects.toThrow(ConflictException);
    });

    it('maps starter tier missing error (P0010) to ServiceUnavailableException (503)', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('Default starter subscription tier not configured (ERRCODE = P0010)'),
      );

      await expect(authService.registerStudio(validRegistrationPayload)).rejects.toThrow(ServiceUnavailableException);
    });

    it('requires email delivery configuration in production environment', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined; // No SMTP or Resend
      });

      await expect(authService.registerStudio(validRegistrationPayload)).rejects.toThrow(ServiceUnavailableException);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('fails registration when audit/outbox recording fails to prevent silent delivery failure', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        result: {
          success: true,
          tenant_id: '11111111-1111-4111-8111-111111111111',
          tenant_code: 'sanctuary-yoga',
          user_id: '22222222-2222-4222-8222-222222222222',
          status: 'onboarding',
        },
      }]);

      mockAuditOutbox.recordInTransaction.mockRejectedValueOnce(new Error('Outbox database write failed'));

      await expect(authService.registerStudio(validRegistrationPayload)).rejects.toThrow('Outbox database write failed');
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('rejects registration safely when AuditOutboxService.recordInTransaction is unavailable', async () => {
      const fallbackSpy = jest.fn();
      const authWithoutTxOutbox = new AuthService(
        mockPrisma as unknown as PrismaService,
        mockConfig as unknown as ConfigService,
        { record: fallbackSpy } as unknown as AuditOutboxService,
      );

      await expect(authWithoutTxOutbox.registerStudio(validRegistrationPayload)).rejects.toThrow(ServiceUnavailableException);
      expect(fallbackSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Controller Endpoint & Request Context Binding', () => {
    it('routes POST /api/v1/auth/register-studio to authService.registerStudio without requiring existing tenant', async () => {
      const mockDbResult = {
        success: true,
        tenant_id: 'ten-ctrl-123',
        tenant_code: 'sanctuary-yoga',
        user_id: 'usr-ctrl-123',
        status: 'onboarding',
      };

      mockPrisma.$queryRaw.mockResolvedValueOnce([{ result: mockDbResult }]);

      const mockRequest = {
        correlationId: 'req-corr-456',
        tenantId: undefined, // Public endpoint: no pre-existing tenant context required
      } as any;

      const response = await controller.registerStudio(mockRequest, validRegistrationPayload);

      expect(response.status).toBe('onboarding');
      expect(response.tenant_id).toBe('ten-ctrl-123');
      expect(response.tenant_code).toBe('sanctuary-yoga');
      expect(response.user_id).toBe('usr-ctrl-123');
    });

    it('routes POST /api/v1/auth/verify-owner-email to authService.verifyOwnerEmail without requiring prior auth', async () => {
      const tenantId = '11111111-1111-4111-8111-111111111111';
      const userId = '22222222-2222-4222-8222-222222222222';

      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        result: {
          success: true,
          tenant_id: tenantId,
          user_id: userId,
          subscription_id: 'sub-test-1',
          trial_starts_at: '2026-10-18T12:00:00.000Z',
          trial_ends_at: '2026-10-25T12:00:00.000Z',
        },
      }]);

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-1' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-1', code: 'owner' }]) },
          authSession: { create: jest.fn<any>().mockResolvedValue({ id: 'sess-ctrl-1' }) },
        });
      });

      const mockRequest = {
        correlationId: 'req-corr-789',
      } as any;

      const response = await controller.verifyOwnerEmail(mockRequest, {
        tenant_id: tenantId,
        token: 'valid-test-token-32-bytes-entropy',
      });

      expect(response.status).toBe('verified');
      expect(response.tenant_id).toBe(tenantId);
      expect(response.access_token).toBeDefined();
    });
  });

  describe('4. Owner Email Verification Contract (POST /api/v1/auth/verify-owner-email)', () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const rawToken = 'test-raw-token-entropy-abcdef123456';

    it('successfully verifies email, activates tenant with 7-day trial, and issues standard authenticated staff session', async () => {
      const mockDbResult = {
        success: true,
        tenant_id: tenantId,
        user_id: userId,
        subscription_id: 'sub-activated-123',
        trial_starts_at: '2026-10-18T12:00:00.000Z',
        trial_ends_at: '2026-10-25T12:00:00.000Z',
      };

      mockPrisma.$queryRaw.mockResolvedValueOnce([{ result: mockDbResult }]);

      mockPrisma.withTenant.mockImplementation(async (tid: string, fn: any) => {
        expect(tid).toBe(tenantId);
        return fn({
          userRoleAssignment: {
            findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]),
          },
          role: {
            findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]),
          },
          authSession: {
            create: jest.fn<any>().mockResolvedValue({ id: 'sess-new-123' }),
          },
        });
      });

      const result = await authService.verifyOwnerEmail({
        tenant_id: tenantId,
        token: rawToken,
      }, 'corr-verify-123');

      expect(result.status).toBe('verified');
      expect(result.tenant_id).toBe(tenantId);
      expect(result.user_id).toBe(userId);
      expect(result.token_type).toBe('Bearer');
      expect(typeof result.access_token).toBe('string');
      expect(typeof result.refresh_token).toBe('string');
      expect(result.trial_starts_at).toBe('2026-10-18T12:00:00.000Z');
      expect(result.trial_ends_at).toBe('2026-10-25T12:00:00.000Z');

      // Verify no sensitive internals leaked
      expect((result as any).password).toBeUndefined();
      expect((result as any).password_hash).toBeUndefined();
      expect((result as any).token_hash).toBeUndefined();

      // Confirms audit outbox recorded event
      expect(mockAuditOutbox.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          actorType: 'user',
          actorId: userId,
          action: 'owner.email_verified',
          eventType: 'owner.email_verified',
        }),
      );

      // Verify SQL invocation was parameterized
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const call = mockPrisma.$queryRaw.mock.calls[0];
      expect(call[0].join(' ')).toContain('platform.verify_owner_email');
      expect(call[1]).toBe(tenantId);
      expect(call[2]).toBe(rawToken);
    });

    it('rejects invalid or already-consumed token (P0001) with BadRequestException', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('Invalid, expired, or already-consumed verification token (ERRCODE = P0001)'),
      );

      await expect(
        authService.verifyOwnerEmail({ tenant_id: tenantId, token: 'invalid-token' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects expired token (P0001) with BadRequestException', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('Invalid, expired, or already-consumed verification token (ERRCODE = P0001)'),
      );

      await expect(
        authService.verifyOwnerEmail({ tenant_id: tenantId, token: 'expired-token' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('prevents token replay / repeated verification calls', async () => {
      // First verification succeeds
      mockPrisma.$queryRaw.mockResolvedValueOnce([{
        result: {
          success: true,
          tenant_id: tenantId,
          user_id: userId,
          subscription_id: 'sub-1',
          trial_starts_at: '2026-10-18T12:00:00.000Z',
          trial_ends_at: '2026-10-25T12:00:00.000Z',
        },
      }]);

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'r1' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'r1', code: 'owner' }]) },
          authSession: { create: jest.fn<any>().mockResolvedValue({ id: 's1' }) },
        });
      });

      const firstCall = await authService.verifyOwnerEmail({ tenant_id: tenantId, token: rawToken });
      expect(firstCall.status).toBe('verified');

      // Second verification attempt with same token fails because consumed_at IS NOT NULL
      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('Invalid, expired, or already-consumed verification token (ERRCODE = P0001)'),
      );

      await expect(
        authService.verifyOwnerEmail({ tenant_id: tenantId, token: rawToken }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects token when tenant ID does not match the token tenant binding', async () => {
      const wrongTenantId = '99999999-9999-4999-8999-999999999999';

      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('Invalid, expired, or already-consumed verification token (ERRCODE = P0001)'),
      );

      await expect(
        authService.verifyOwnerEmail({ tenant_id: wrongTenantId, token: rawToken }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty or whitespace-only token without calling database', async () => {
      await expect(
        authService.verifyOwnerEmail({ tenant_id: tenantId, token: '   ' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('5. Resend Owner Verification Email (POST /api/v1/auth/resend-verification-email)', () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const tenantCode = 'sanctuary-yoga';
    const ownerEmail = 'priya@sanctuary-yoga.com';

    it('resends verification email for eligible unverified owner, invalidates old token, and returns test token in non-prod', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      const mockTxAuthActionToken = {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        create: jest.fn<any>().mockResolvedValue({ id: 'tok-new-123' }),
      };

      mockPrisma.withTenant.mockImplementation(async (tid: string, fn: any) => {
        expect(tid).toBe(tenantId);
        return fn({
          user: {
            findFirst: jest.fn<any>().mockResolvedValue({
              id: userId,
              email: ownerEmail,
              status: 'invited',
            }),
          },
          userRoleAssignment: {
            findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]),
          },
          role: {
            findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]),
          },
          authActionToken: mockTxAuthActionToken,
          $queryRaw: jest.fn<any>()
            .mockResolvedValueOnce([{ id: userId }])
            .mockResolvedValueOnce([{ count_60s: 0, count_24h: 1 }]),
          $executeRaw: jest.fn<any>(),
        });
      });

      const response = await authService.resendVerificationEmail(
        { tenant_code: tenantCode, email: ownerEmail },
        'corr-resend-123',
      );

      expect(response.status).toBe('pending_verification');
      expect(response.message).toContain('If an account exists and requires verification');
      expect(response.test_verification_token).toBeDefined();
      expect(typeof response.test_verification_token).toBe('string');

      // Verify no sensitive credentials or hashes leaked
      expect((response as any).token_hash).toBeUndefined();
      expect((response as any).password).toBeUndefined();
      expect((response as any).password_hash).toBeUndefined();

      // Confirms old unconsumed tokens are invalidated
      expect(mockTxAuthActionToken.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          userId,
          purpose: 'owner_email_verification',
          consumedAt: null,
        },
        data: {
          consumedAt: expect.any(Date),
        },
      });

      // Confirms new token is created with 24h expiration
      expect(mockTxAuthActionToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            userId,
            purpose: 'owner_email_verification',
            tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
            expiresAt: expect.any(Date),
          }),
        }),
      );

      // Confirms audit outbox event recorded atomically
      const outboxRecorder = mockAuditOutbox.recordInTransaction.mock.calls.length > 0
        ? mockAuditOutbox.recordInTransaction
        : mockAuditOutbox.record;

      if (mockAuditOutbox.recordInTransaction.mock.calls.length > 0) {
        expect(outboxRecorder).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            tenantId,
            actorType: 'user',
            actorId: userId,
            action: 'owner.verification_resent',
            resourceType: 'tenant',
            eventType: 'owner.verification_resent',
            payload: {
              tenantCode,
              ownerEmail,
              verificationToken: response.test_verification_token,
            },
          }),
        );
      } else {
        expect(outboxRecorder).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId,
            actorType: 'user',
            actorId: userId,
            action: 'owner.verification_resent',
            resourceType: 'tenant',
            eventType: 'owner.verification_resent',
            payload: {
              tenantCode,
              ownerEmail,
              verificationToken: response.test_verification_token,
            },
          }),
        );
      }
    });

    it('supports resend with canonical tenant_id instead of tenant_code', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }) },
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]) },
          authActionToken: { updateMany: jest.fn<any>(), create: jest.fn<any>() },
          $queryRaw: jest.fn<any>()
            .mockResolvedValueOnce([{ id: userId }])
            .mockResolvedValueOnce([{ count_60s: 0, count_24h: 0 }]),
        });
      });

      const response = await authService.resendVerificationEmail({
        tenant_id: tenantId,
        email: ownerEmail,
      });

      expect(response.status).toBe('pending_verification');
      expect(response.test_verification_token).toBeDefined();
    });

    it('returns consistent non-disclosing response without issuing token if owner is already active/verified', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      const mockTxAuthActionToken = {
        updateMany: jest.fn<any>(),
        create: jest.fn<any>(),
      };

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          user: {
            findFirst: jest.fn<any>().mockResolvedValue({
              id: userId,
              email: ownerEmail,
              status: 'active', // Already verified!
            }),
          },
          userRoleAssignment: { findMany: jest.fn<any>() },
          role: { findMany: jest.fn<any>() },
          authActionToken: mockTxAuthActionToken,
          $queryRaw: jest.fn<any>(),
        });
      });

      const response = await authService.resendVerificationEmail({
        tenant_code: tenantCode,
        email: ownerEmail,
      });

      expect(response.status).toBe('pending_verification');
      expect(response.message).toContain('If an account exists and requires verification');
      expect(response.test_verification_token).toBeUndefined();

      // No token created or outbox recorded
      expect(mockTxAuthActionToken.create).not.toHaveBeenCalled();
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('returns consistent non-disclosing response without issuing token if tenant is already active', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'active', // Tenant is active, studio trial already activated
      });

      const response = await authService.resendVerificationEmail({
        tenant_code: tenantCode,
        email: ownerEmail,
      });

      expect(response.status).toBe('pending_verification');
      expect(response.message).toContain('If an account exists and requires verification');
      expect(response.test_verification_token).toBeUndefined();

      expect(mockPrisma.withTenant).not.toHaveBeenCalled();
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('returns consistent non-disclosing response when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      const response = await authService.resendVerificationEmail({
        tenant_code: 'non-existent-tenant',
        email: 'anyone@example.com',
      });

      expect(response.status).toBe('pending_verification');
      expect(response.message).toContain('If an account exists and requires verification');
      expect(response.test_verification_token).toBeUndefined();
      expect(mockPrisma.withTenant).not.toHaveBeenCalled();
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('returns consistent non-disclosing response when owner email does not exist in tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          user: {
            findFirst: jest.fn<any>().mockResolvedValue(null), // User not found in this tenant
          },
          $queryRaw: jest.fn<any>(),
        });
      });

      const response = await authService.resendVerificationEmail({
        tenant_code: tenantCode,
        email: 'unknown@sanctuary-yoga.com',
      });

      expect(response.status).toBe('pending_verification');
      expect(response.message).toContain('If an account exists and requires verification');
      expect(response.test_verification_token).toBeUndefined();
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('returns consistent non-disclosing response when user exists but is not an owner', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          user: {
            findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }),
          },
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-trainer' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-trainer', code: 'trainer' }]) }, // Not owner!
          $queryRaw: jest.fn<any>(),
        });
      });

      const response = await authService.resendVerificationEmail({
        tenant_code: tenantCode,
        email: ownerEmail,
      });

      expect(response.status).toBe('pending_verification');
      expect(response.test_verification_token).toBeUndefined();
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('enforces 60-second cooldown per tenant/owner and returns consistent non-disclosing response', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      const mockTxAuthActionToken = {
        updateMany: jest.fn<any>(),
        create: jest.fn<any>(),
      };

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }) },
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]) },
          authActionToken: mockTxAuthActionToken,
          $queryRaw: jest.fn<any>()
            .mockResolvedValueOnce([{ id: userId }]) // FOR UPDATE lock
            .mockResolvedValueOnce([{ count_60s: 1, count_24h: 1 }]), // Cooldown hit! (count_60s > 0)
        });
      });

      const response = await authService.resendVerificationEmail({
        tenant_code: tenantCode,
        email: ownerEmail,
      });

      expect(response.status).toBe('pending_verification');
      expect(response.message).toContain('If an account exists and requires verification');
      expect(response.test_verification_token).toBeUndefined();

      expect(mockTxAuthActionToken.create).not.toHaveBeenCalled();
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('enforces rolling 24-hour limit (max 5 verification emails) and returns consistent non-disclosing response', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      const mockTxAuthActionToken = {
        updateMany: jest.fn<any>(),
        create: jest.fn<any>(),
      };

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }) },
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]) },
          authActionToken: mockTxAuthActionToken,
          $queryRaw: jest.fn<any>()
            .mockResolvedValueOnce([{ id: userId }]) // FOR UPDATE lock
            .mockResolvedValueOnce([{ count_60s: 0, count_24h: 5 }]), // 24h limit reached! (count_24h >= 5)
        });
      });

      const response = await authService.resendVerificationEmail({
        tenant_code: tenantCode,
        email: ownerEmail,
      });

      expect(response.status).toBe('pending_verification');
      expect(response.message).toContain('If an account exists and requires verification');
      expect(response.test_verification_token).toBeUndefined();

      expect(mockTxAuthActionToken.create).not.toHaveBeenCalled();
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('executes row-level locking (FOR UPDATE) inside transaction to serialize concurrent requests', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      let forUpdateExecuted = false;

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }) },
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]) },
          authActionToken: { updateMany: jest.fn<any>(), create: jest.fn<any>() },
          $queryRaw: jest.fn<any>().mockImplementation(async (strings: any) => {
            const query = Array.isArray(strings) ? strings.join(' ') : String(strings);
            if (query.includes('FOR UPDATE')) {
              forUpdateExecuted = true;
              return [{ id: userId }];
            }
            if (query.includes('count_60s')) {
              return [{ count_60s: 0, count_24h: 0 }];
            }
            return [];
          }),
        });
      });

      await authService.resendVerificationEmail({
        tenant_code: tenantCode,
        email: ownerEmail,
      });

      expect(forUpdateExecuted).toBe(true);
    });

    it('fails explicitly when audit/outbox recording fails during resend and uses same transaction', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      const txClient = {
        user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }) },
        userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]) },
        role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]) },
        authActionToken: { updateMany: jest.fn<any>(), create: jest.fn<any>() },
        $queryRaw: jest.fn<any>()
          .mockResolvedValueOnce([{ id: userId }])
          .mockResolvedValueOnce([{ count_60s: 0, count_24h: 0 }]),
      };

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn(txClient);
      });

      mockAuditOutbox.recordInTransaction.mockRejectedValueOnce(new Error('Outbox delivery database failure'));

      await expect(
        authService.resendVerificationEmail({ tenant_code: tenantCode, email: ownerEmail }),
      ).rejects.toThrow('Outbox delivery database failure');

      expect(mockAuditOutbox.recordInTransaction).toHaveBeenCalledWith(txClient, expect.any(Object));
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('proves outbox failure rolls back token invalidation and new token creation during resend', async () => {
      let stateCommitted = false;
      let updateManyCalled = false;
      let createCalled = false;

      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        const tx = {
          user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }) },
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]) },
          authActionToken: {
            updateMany: jest.fn<any>().mockImplementation(async () => {
              updateManyCalled = true;
            }),
            create: jest.fn<any>().mockImplementation(async () => {
              createCalled = true;
            }),
          },
          $queryRaw: jest.fn<any>()
            .mockResolvedValueOnce([{ id: userId }])
            .mockResolvedValueOnce([{ count_60s: 0, count_24h: 0 }]),
        };

        try {
          const res = await fn(tx);
          stateCommitted = true;
          return res;
        } catch (err) {
          // Transaction aborts on error - state is not committed
          stateCommitted = false;
          throw err;
        }
      });

      mockAuditOutbox.recordInTransaction.mockRejectedValueOnce(new Error('Outbox failure: disk full'));

      await expect(
        authService.resendVerificationEmail({ tenant_code: tenantCode, email: ownerEmail }),
      ).rejects.toThrow('Outbox failure: disk full');

      expect(updateManyCalled).toBe(true);
      expect(createCalled).toBe(true);
      expect(stateCommitted).toBe(false);
      expect(mockAuditOutbox.record).not.toHaveBeenCalled();
    });

    it('rejects resend safely when AuditOutboxService.recordInTransaction is unavailable and never falls back to record()', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }) },
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]) },
          authActionToken: { updateMany: jest.fn<any>(), create: jest.fn<any>() },
          $queryRaw: jest.fn<any>()
            .mockResolvedValueOnce([{ id: userId }])
            .mockResolvedValueOnce([{ count_60s: 0, count_24h: 0 }]),
        });
      });

      const fallbackSpy = jest.fn();
      const authWithBrokenOutbox = new AuthService(
        mockPrisma as unknown as PrismaService,
        mockConfig as unknown as ConfigService,
        { record: fallbackSpy } as unknown as AuditOutboxService,
      );

      await expect(
        authWithBrokenOutbox.resendVerificationEmail({ tenant_code: tenantCode, email: ownerEmail }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(fallbackSpy).not.toHaveBeenCalled();
    });

    it('returns identical external response structure across non-existent tenant, already-verified user, and rate-limited user in production', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'SMTP_HOST') return 'smtp.sendgrid.net';
        if (key === 'JWT_SECRET') return 'test-jwt-secret-minimum-32-chars-long!!';
        return undefined;
      });

      // Scenario A: Non-existent tenant
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);
      const resA = await authService.resendVerificationEmail({ tenant_code: 'ghost-tenant', email: 'owner@ghost.com' });

      // Scenario B: Already active owner
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: tenantId, code: tenantCode, status: 'onboarding' });
      mockPrisma.withTenant.mockImplementationOnce(async (_tid: string, fn: any) => {
        return fn({
          user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'active' }) },
          $queryRaw: jest.fn<any>(),
        });
      });
      const resB = await authService.resendVerificationEmail({ tenant_code: tenantCode, email: ownerEmail });

      // Scenario C: Rate-limited user
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: tenantId, code: tenantCode, status: 'onboarding' });
      mockPrisma.withTenant.mockImplementationOnce(async (_tid: string, fn: any) => {
        return fn({
          user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }) },
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]) },
          $queryRaw: jest.fn<any>()
            .mockResolvedValueOnce([{ id: userId }])
            .mockResolvedValueOnce([{ count_60s: 1, count_24h: 1 }]),
        });
      });
      const resC = await authService.resendVerificationEmail({ tenant_code: tenantCode, email: ownerEmail });

      // Assert identical non-disclosing responses
      expect(resA).toEqual(resB);
      expect(resB).toEqual(resC);
      expect(resA).toEqual({
        status: 'pending_verification',
        message: 'If an account exists and requires verification, a verification email has been sent.',
      });
    });

    it('routes POST /api/v1/auth/resend-verification-email through controller without requiring tenant session', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: tenantId,
        code: tenantCode,
        status: 'onboarding',
      });

      mockPrisma.withTenant.mockImplementation(async (_tid: string, fn: any) => {
        return fn({
          user: { findFirst: jest.fn<any>().mockResolvedValue({ id: userId, email: ownerEmail, status: 'invited' }) },
          userRoleAssignment: { findMany: jest.fn<any>().mockResolvedValue([{ roleId: 'role-owner-uuid' }]) },
          role: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'role-owner-uuid', code: 'owner' }]) },
          authActionToken: { updateMany: jest.fn<any>(), create: jest.fn<any>() },
          $queryRaw: jest.fn<any>()
            .mockResolvedValueOnce([{ id: userId }])
            .mockResolvedValueOnce([{ count_60s: 0, count_24h: 0 }]),
        });
      });

      const mockRequest = {
        correlationId: 'req-corr-resend',
      } as any;

      const response = await controller.resendVerificationEmail(mockRequest, {
        tenant_code: tenantCode,
        email: ownerEmail,
      });

      expect(response.status).toBe('pending_verification');
      expect(response.test_verification_token).toBeDefined();
    });

    it('rejects resend request when neither tenant_id nor tenant_code is provided', async () => {
      await expect(
        authService.resendVerificationEmail({ email: ownerEmail } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects resend request with invalid email format', async () => {
      await expect(
        authService.resendVerificationEmail({ tenant_code: tenantCode, email: 'not-an-email' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires email delivery configuration in production environment', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined; // No SMTP or Resend
      });

      await expect(
        authService.resendVerificationEmail({ tenant_code: tenantCode, email: ownerEmail }),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
