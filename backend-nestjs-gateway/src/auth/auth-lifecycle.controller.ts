import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../common/request-context.types';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { AuthService } from './auth.service';
import { AcceptStaffInviteDto, ChangePasswordDto, CompletePasswordResetDto, ForgotPasswordDto, LogoutDto, RefreshTokenDto, RegisterStudioDto, ResendVerificationEmailDto, VerifyOwnerEmailDto } from './dto/auth-lifecycle.dto';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { AuthenticatedAccessGuard } from '../common/authenticated-access.guard';

@Controller('auth')
export class AuthLifecycleController {
  constructor(private readonly auth: AuthService) {}

  @Post('register-studio')
  @HttpCode(201)
  registerStudio(@Req() request: RequestWithContext, @Body() body: RegisterStudioDto) {
    return this.auth.registerStudio(body, request.correlationId);
  }

  @Post('verify-owner-email')
  @HttpCode(200)
  verifyOwnerEmail(@Req() request: RequestWithContext, @Body() body: VerifyOwnerEmailDto) {
    return this.auth.verifyOwnerEmail(body, request.correlationId);
  }

  @Post('resend-verification-email')
  @HttpCode(200)
  resendVerificationEmail(@Req() request: RequestWithContext, @Body() body: ResendVerificationEmailDto) {
    return this.auth.resendVerificationEmail(body, request.correlationId);
  }

  @Post('register/staff-invite')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  acceptInvite(@Req() request: RequestWithContext, @Body() body: AcceptStaffInviteDto) {
    return this.auth.acceptInvite(request.tenantId as string, body.invite_token, body.password, body.full_name);
  }

  @Post('password/forgot')
  @HttpCode(202)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  forgotPassword(@Req() request: RequestWithContext, @Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(request.tenantId as string, body.email);
  }

  @Post('password/reset')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  resetPassword(@Req() request: RequestWithContext, @Body() body: CompletePasswordResetDto) {
    return this.auth.completePasswordReset(request.tenantId as string, body.token, body.new_password);
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  refresh(@Req() request: RequestWithContext, @Body() body: RefreshTokenDto) {
    return this.auth.refresh(request.tenantId as string, body.refresh_token);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(TenantContextGuard)
  logout(@Req() request: RequestWithContext, @Body() body: LogoutDto) {
    return this.auth.logout(request.tenantId as string, body.refresh_token, body.all_sessions);
  }

  @Post('password/change')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  changePassword(@Req() request: RequestWithContext, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(request.tenantId as string, request.auth?.userId as string, body.current_password, body.new_password);
  }

  @Get('me')
  @UseGuards(TenantContextGuard, AuthenticatedAccessGuard)
  me(@Req() request: RequestWithContext) {
    return this.auth.me(request.tenantId as string, request.auth?.userId as string);
  }
}
