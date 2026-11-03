import 'reflect-metadata';
import { describe, it, expect, jest } from '@jest/globals';
import { AuthMemberController } from './auth.member.controller';
import { MemberSignupDto, MemberOtpRequestDto, MemberOtpVerifyDto, AuthMeDto, AuthMePatchDto } from './dto';
import type { RequestWithContext } from '../common/request-context.types';

function makeController() {
  const auth = {
    memberSignup: jest.fn(async () => ({ status: 'sent', user_id: 'user-1', tenant_id: 'tenant-1', expires_in: 14400, consent_verified: true })),
    memberOtpRequest: jest.fn(async () => ({ status: 'sent' as const })),
    memberOtpVerify: jest.fn(async () => ({ status: 'verified' as const })),
    getProfile: jest.fn(async () => ({ roles: ['member'], role: 'member', tenant: { id: 'tenant-1', code: 'tenant-1', name: 'Tenant 1' }, permissions: [] })),
    patchProfile: jest.fn(async () => ({ status: 'updated' as const })),
    deleteProfile: jest.fn(async () => ({ status: 'deleted' as const })),
  };
  return { controller: new AuthMemberController(auth as never), auth };
}

const request: RequestWithContext = { tenantId: 'tenant-1', auth: { userId: 'user-1', roles: ['member'] } } as RequestWithContext;

describe('AuthMemberController (B2C member routes)', () => {
  it('POST /auth/member/signup delegates to auth service', async () => {
    const { controller, auth } = makeController();
    await controller.signup({ email: 'member@acme.fitness', password: 'Secure-Pass-9', confirmEmail: 'member@acme.fitness', consent: 'I agree' } as MemberSignupDto);
    expect(auth.memberSignup).toHaveBeenCalled();
  });

  it('POST /auth/member/otp/request delegates to auth service', async () => {
    const { controller, auth } = makeController();
    await controller.requestOtp({ email: 'member@acme.fitness', consent: 'I agree' } as MemberOtpRequestDto);
    expect(auth.memberOtpRequest).toHaveBeenCalled();
  });

  it('POST /auth/member/otp/verify delegates to auth service', async () => {
    const { controller, auth } = makeController();
    await controller.verifyOtp({ code: '123456' } as MemberOtpVerifyDto);
    expect(auth.memberOtpVerify).toHaveBeenCalled();
  });

  it('GET /auth/member/me delegates to auth service', async () => {
    const { controller, auth } = makeController();
    await controller.me(request);
    expect(auth.getProfile).toHaveBeenCalledWith('tenant-1', 'user-1');
  });

  it('PATCH /auth/member/me updates profile', async () => {
    const { controller, auth } = makeController();
    await controller.patchMe(request, { name: 'New Name' } as AuthMePatchDto);
    expect(auth.patchProfile).toHaveBeenCalled();
  });

  it('DELETE /auth/member/me deletes account', async () => {
    const { controller, auth } = makeController();
    await controller.deleteMe(request);
    expect(auth.deleteProfile).toHaveBeenCalled();
  });
});