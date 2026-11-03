import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../common/request-context.types';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { AuthService } from './auth.service';
import { CompleteMemberAccountDto, MemberLoginDto, MemberRegisterDto, RequestMemberOtpDto, VerifyMemberOtpDto } from './dto/member-auth.dto';
import { ChangePasswordDto } from './dto/auth-lifecycle.dto';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { AuthenticatedAccessGuard } from '../common/authenticated-access.guard';
import { GoogleIdentityService } from './google-identity.service';
import { GoogleSignInDto } from './dto/google-sign-in.dto';

@Controller('auth/member')
export class MemberAuthController {
  constructor(private readonly auth: AuthService, private readonly google: GoogleIdentityService) {}

  @Post('register')
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  register(@Req() request: RequestWithContext, @Body() body: MemberRegisterDto) {
    return this.auth.memberRegister(
      request.tenantId as string,
      request.tenantCode as string,
      request.correlationId as string,
      body,
    );
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  login(@Req() request: RequestWithContext, @Body() body: MemberLoginDto) {
    return this.auth.memberLogin(
      request.tenantId as string,
      request.tenantCode as string,
      request.correlationId as string,
      body.email,
      body.password,
    );
  }

  @Post('complete-account')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  completeAccount(@Req() request: RequestWithContext, @Body() body: CompleteMemberAccountDto) {
    return this.auth.completeMemberAccount(
      request.tenantId as string,
      request.tenantCode as string,
      request.correlationId as string,
      body,
    );
  }


  @Post('password/change')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, AuthenticatedAccessGuard)
  changePassword(@Req() request: RequestWithContext, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(
      request.tenantId as string,
      request.auth?.userId as string,
      body.current_password,
      body.new_password,
    );
  }

  @Post('otp/request')
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  requestOtp(@Req() request: RequestWithContext, @Body() body: RequestMemberOtpDto) {
    return this.auth.requestMemberOtp(request.tenantId as string, body.phone, body.purpose);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  verifyOtp(@Req() request: RequestWithContext, @Body() body: VerifyMemberOtpDto) {
    return this.auth.verifyMemberOtp(
      request.tenantId as string,
      request.tenantCode as string,
      request.correlationId as string,
      body.challenge_id,
      body.otp,
      body.full_name,
      body.email,
    );
  }

  @Post('google')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  async googleSignIn(@Req() request: RequestWithContext, @Body() body: GoogleSignInDto) {
    const identity = await this.google.verify(body.id_token);
    return this.auth.loginWithGoogle(
      request.tenantId as string,
      request.tenantCode as string,
      request.correlationId as string,
      identity.subject,
    );
  }

  @Post('google/link')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard, AuthenticatedAccessGuard)
  async linkGoogle(@Req() request: RequestWithContext, @Body() body: GoogleSignInDto) {
    const identity = await this.google.verify(body.id_token);
    return this.auth.linkGoogleAccount(
      request.tenantId as string,
      request.auth!.userId,
      request.auth!.sessionId as string,
      identity.subject,
      request.correlationId as string,
    );
  }

  @Post('login-otp')
  @UseGuards(TenantContextGuard)
  sendOtp(@Req() request: RequestWithContext, @Body() body: { phone: string }) {
    return this.auth.sendMemberOtp(request.tenantId as string, body.phone);
  }

  @Post('verify-otp')
  @HttpCode(200)
  @UseGuards(TenantContextGuard)
  verifyLegacyOtp(@Req() request: RequestWithContext, @Body() body: { phone: string; otpCode: string }) {
    return this.auth.verifyMemberOtpByPhone(request.tenantId as string, body.phone, body.otpCode);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(TenantContextGuard)
  logout(@Req() request: RequestWithContext) {
    const token = request.headers.authorization?.split(' ')[1] || '';
    return this.auth.logout(request.tenantId as string, token);
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(TenantContextGuard)
  refresh(@Req() request: RequestWithContext, @Body() body: { refresh_token: string }) {
    return this.auth.refreshToken(request.tenantId as string, body.refresh_token);
  }
}
