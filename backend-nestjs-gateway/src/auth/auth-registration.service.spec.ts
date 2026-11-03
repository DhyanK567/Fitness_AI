import { ConfigService } from '@nestjs/config';
import { verifyEnrollmentToken } from '../common/auth-token';
import { PrismaService } from '../common/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService studio registration handshake', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const jwtSecret = 'registration-test-jwt-secret';

  function harness() {
    const tenantUpdate = jest.fn(async () => ({}));
    const subscriptionUpdate = jest.fn(async () => ({ count: 1 }));
    const tierFindUnique = jest.fn(async () => ({ id: '44444444-4444-4444-8444-444444444444' }));
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{
        register_onboarding_studio: {
          success: true,
          tenant_id: tenantId,
          tenant_code: 'launch-studio',
          user_id: userId,
          token_id: '33333333-3333-4333-8333-333333333333',
          status: 'onboarding',
        },
      }])
      .mockResolvedValueOnce([{ verify_owner_email: { success: true } }]);
    const transaction = jest.fn(async (work: (tx: any) => unknown) => work({
      $queryRaw: queryRaw,
      subscriptionTier: { findUnique: tierFindUnique },
      tenant: { update: tenantUpdate },
      tenantSubscription: { updateMany: subscriptionUpdate },
    }));
    const prisma = {
      tenant: {
        findUnique: jest.fn(async () => null),
        findFirst: jest.fn().mockResolvedValue(null as any),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null as any),
      },
      $transaction: transaction,
    };
    const config = {
      get: jest.fn((key: string) => key === 'JWT_SECRET' ? jwtSecret : undefined),
    } as unknown as ConfigService;
    return {
      service: new AuthService(prisma as unknown as PrismaService, config),
      prisma,
      queryRaw,
      transaction,
      tenantUpdate,
      subscriptionUpdate,
      tierFindUnique,
    };
  }

  it('atomically activates the owner and returns a scoped enrollment token', async () => {
    const { service, queryRaw, transaction, tenantUpdate, subscriptionUpdate, tierFindUnique } = harness();
    const result = await service.registerStudio({
      studio_name: 'Launch Studio',
      owner_name: 'Launch Owner',
      owner_email: 'owner@launch.example',
      owner_phone: '+919876543210',
      password: 'StrongPass1!',
      subscription_plan: 'Premium',
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(tierFindUnique).toHaveBeenCalledWith({ where: { code: 'growth' }, select: { id: true } });
    expect(queryRaw.mock.invocationCallOrder[1]).toBeLessThan(tenantUpdate.mock.invocationCallOrder[0]);
    expect(tenantUpdate.mock.invocationCallOrder[0]).toBeLessThan(subscriptionUpdate.mock.invocationCallOrder[0]);
    expect(tenantUpdate).toHaveBeenCalledWith({ where: { id: tenantId }, data: { tierId: '44444444-4444-4444-8444-444444444444' } });
    expect(subscriptionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, status: { in: ['trialing', 'authenticated', 'active'] } },
      data: expect.objectContaining({ tierId: '44444444-4444-4444-8444-444444444444' }),
    }));
    expect(result).toMatchObject({
      tenant_code: 'launch-studio',
      owner_email: 'owner@launch.example',
      requires_email_verification: false,
      mfa_enrollment_required: true,
      subscription_plan: 'Premium',
    });
    expect(verifyEnrollmentToken(result.enrollment_token, jwtSecret)).toMatchObject({
      sub: userId,
      tenant: tenantId,
      roles: ['owner'],
      scope: 'mfa_enroll',
    });
  });

  it('rejects duplicate studio name with ConflictException', async () => {
    const { service, prisma, transaction } = harness();
    prisma.tenant.findFirst.mockResolvedValueOnce({ id: 'existing-tenant-id' });

    await expect(service.registerStudio({
      studio_name: 'Launch Studio',
      owner_name: 'Launch Owner',
      owner_email: 'unique@launch.example',
      password: 'StrongPass1!',
    })).rejects.toThrow('A studio with this name already exists');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects duplicate owner email with ConflictException', async () => {
    const { service, prisma, transaction } = harness();
    prisma.user.findFirst.mockResolvedValueOnce({ id: 'existing-user-id' });

    await expect(service.registerStudio({
      studio_name: 'Brand New Studio',
      owner_name: 'Launch Owner',
      owner_email: 'existing@launch.example',
      password: 'StrongPass1!',
    })).rejects.toThrow('An account with this email address already exists');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('enforces the same password rules advertised by the frontend', async () => {
    const { service, transaction } = harness();
    await expect(service.registerStudio({
      studio_name: 'Launch Studio',
      owner_name: 'Launch Owner',
      owner_email: 'owner@launch.example',
      password: 'MissingSymbol1',
    })).rejects.toThrow('include uppercase, lowercase, number, and symbol');
    expect(transaction).not.toHaveBeenCalled();
  });
});
