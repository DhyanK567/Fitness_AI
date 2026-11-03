import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { MemberAuthController } from './member-auth.controller';
import type { RequestWithContext } from '../common/request-context.types';

function makeController() {
  const auth = {
    memberRegister: jest.fn(async () => ({
      access_token: 'mock_jwt_access',
      user: { id: 'u-1', name: 'Member Test', email: 'test@studio.in', phone: '+919876543210' },
      user_id: 'u-1',
      is_new_user: true,
      member_id: 'm-1',
    })),
    memberLogin: jest.fn(async () => ({
      access_token: 'mock_jwt_access',
      user: { id: 'u-1', name: 'Member Test', email: 'test@studio.in', phone: '+919876543210' },
      user_id: 'u-1',
      is_new_user: false,
      member_id: 'm-1',
      membership: { planName: 'pre basic', status: 'active', priceFormatted: '₹100' },
    })),
    completeMemberAccount: jest.fn(async () => ({
      access_token: 'mock_jwt_access',
      user: { id: 'u-1', name: 'Member Test', email: 'test@studio.in', phone: '+919876543210' },
      user_id: 'u-1',
      membership: { planName: 'pre basic', status: 'active' },
      message: 'Account setup complete!',
    })),
    requestMemberOtp: jest.fn(async () => ({ challenge_id: 'ch-1', expires_in: 300 })),
    verifyMemberOtp: jest.fn(async () => ({ access_token: 'mock_jwt_access' })),
    logout: jest.fn(async () => ({ success: true })),
    refreshToken: jest.fn(async () => ({ access_token: 'new_token' })),
  };
  const google = {
    verify: jest.fn(async () => ({ subject: 'g-sub' })),
  };
  return { controller: new MemberAuthController(auth as never, google as never), auth };
}

const req: RequestWithContext = {
  tenantId: 'tenant-uuid-1',
  tenantCode: 'ranayaa',
  correlationId: 'corr-1',
  headers: { authorization: 'Bearer token123' },
} as RequestWithContext;

describe('MemberAuthController (Final Member Registration & Login)', () => {
  it('delegates memberRegister to auth service with tenant context', async () => {
    const { controller, auth } = makeController();
    const dto = {
      fullName: 'Priyanshu Sharma',
      email: 'priyanshu@example.com',
      phone: '+919876543210',
      password: 'SecurePassword123!',
      confirmPassword: 'SecurePassword123!',
    };

    const result = await controller.register(req, dto);

    expect(auth.memberRegister).toHaveBeenCalledWith(
      'tenant-uuid-1',
      'ranayaa',
      'corr-1',
      dto,
    );
    expect(result.access_token).toBe('mock_jwt_access');
    expect(result.is_new_user).toBe(true);
  });

  it('delegates memberLogin to auth service with email & password', async () => {
    const { controller, auth } = makeController();
    const dto = {
      email: 'priyanshu@example.com',
      password: 'SecurePassword123!',
    };

    const result = await controller.login(req, dto);

    expect(auth.memberLogin).toHaveBeenCalledWith(
      'tenant-uuid-1',
      'ranayaa',
      'corr-1',
      dto.email,
      dto.password,
    );
    expect(result.membership).toBeDefined();
    expect(result.membership?.planName).toBe('pre basic');
  });

  it('delegates completeMemberAccount for existing paid OTP members', async () => {
    const { controller, auth } = makeController();
    const dto = {
      challenge_id: 'ch-uuid-1234',
      otp: '123456',
      email: 'priyanshu@example.com',
      password: 'SecurePassword123!',
      confirmPassword: 'SecurePassword123!',
    };

    const result = await controller.completeAccount(req, dto);

    expect(auth.completeMemberAccount).toHaveBeenCalledWith(
      'tenant-uuid-1',
      'ranayaa',
      'corr-1',
      dto,
    );
    expect(result.membership).toBeDefined();
  });

  it('delegates requestOtp for complete_account', async () => {
    const { controller, auth } = makeController();
    const dto = {
      phone: '+919876543210',
      purpose: 'complete_account' as const,
    };

    await controller.requestOtp(req, dto);

    expect(auth.requestMemberOtp).toHaveBeenCalledWith(
      'tenant-uuid-1',
      dto.phone,
      'complete_account',
    );
  });

  it('delegates logout properly', async () => {
    const { controller, auth } = makeController();
    await controller.logout(req);
    expect(auth.logout).toHaveBeenCalledWith('tenant-uuid-1', 'token123');
  });
});
