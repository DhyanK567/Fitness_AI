import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../common/request-context.types';
import { AuthService } from './auth.service';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { RequirePermission } from '../common/permission.decorator';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { InviteStaffDto, ResetStaffPasswordDto, StaffLoginDto } from './dto/staff-auth.dto';

@Controller('auth/staff')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  login(@Req() request: RequestWithContext, @Body() body: StaffLoginDto & { totp_code?: string; recovery_code?: string; mfa_ticket?: string }) {
    if (body.mfa_ticket) {
      return this.auth.completeMfa(request.tenantId as string, body.mfa_ticket, body.totp_code, body.recovery_code);
    }
    if (body.totp_code || body.recovery_code || (this.auth as any).login.length > 3) {
      return (this.auth as any).login(request.tenantId as string, body.email as string, body.password as string, body.totp_code, body.recovery_code);
    }
    return this.auth.login(request.tenantId as string, body.email as string, body.password as string);
  }

  @Post('logout')
  @UseGuards(TenantContextGuard)
  logout(@Req() request: RequestWithContext, @Body() body?: { refresh_token?: string }) {
    const token = body?.refresh_token || request.headers.authorization?.split(' ')[1] || '';
    return this.auth.logout(request.tenantId as string, token);
  }

  @Post('logout-all')
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  logoutAll(@Req() request: RequestWithContext) {
    if ((this.auth as any).logoutAll) {
      return (this.auth as any).logoutAll(request.tenantId as string, request.auth?.userId as string);
    }
    return this.auth.logout(request.tenantId as string, '', true);
  }

  @Post('invite')
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  @RequirePermission('staff:write')
  invite(@Req() request: RequestWithContext, @Body() body: InviteStaffDto & { roleCode?: string }) {
    if (body.roleCode && (this.auth as any).invite.length <= 4) {
      return (this.auth as any).invite(request.tenantId as string, body.email, body.displayName, body.roleCode);
    }
    return this.auth.invite(
      request.tenantId as string,
      body.email,
      body.displayName,
      undefined,
      body.roleCode ? [body.roleCode] : [],
      request.auth?.userId as string,
      request.correlationId as string,
    );
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Req() request: RequestWithContext, @Body() body: any) {
    if (body.token) {
      if ((this.auth as any).resetPassword.length <= 3) {
        return (this.auth as any).resetPassword(request.tenantId as string, body.token, body.password);
      }
      return this.auth.resetPasswordWithToken(request.tenantId as string, body.token, body.password);
    }
    return this.auth.resetPassword(request.tenantId as string, body.userId, body.password, request.auth?.userId as string);
  }

  @Post('reset-password/request')
  @UseGuards(TenantContextGuard)
  requestReset(@Req() request: RequestWithContext, @Body() body: { email: string }) {
    if ((this.auth as any).requestPasswordReset) {
      return (this.auth as any).requestPasswordReset(request.tenantId as string, body.email);
    }
    return this.auth.forgotPassword(request.tenantId as string, body.email);
  }

  @Post('totp/enroll')
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  enrollTotp(@Req() request: RequestWithContext) {
    if ((this.auth as any).enrollTotp) {
      return (this.auth as any).enrollTotp(request.tenantId as string, request.auth?.userId as string);
    }
    return { error: 'TOTP not supported' };
  }

  @Post('totp/verify')
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  verifyTotp(@Req() request: RequestWithContext, @Body() body: { code?: string; totp_code?: string }) {
    const code = body.code || body.totp_code || '';
    if ((this.auth as any).verifyTotpEnrollment) {
      return (this.auth as any).verifyTotpEnrollment(request.tenantId as string, request.auth?.userId as string, code);
    }
    return { error: 'TOTP not supported' };
  }

  @Post('forgot-password')
  @UseGuards(TenantContextGuard)
  forgotPassword(@Req() request: RequestWithContext, @Body() body: { email: string }) {
    return this.auth.forgotPassword(request.tenantId as string, body.email);
  }

  @Post('reset-password-with-token')
  @UseGuards(TenantContextGuard)
  resetPasswordWithToken(@Req() request: RequestWithContext, @Body() body: { token: string; password: string }) {
    return this.auth.resetPasswordWithToken(request.tenantId as string, body.token, body.password);
  }

  @Post('refresh')
  @UseGuards(TenantContextGuard)
  refresh(@Req() request: RequestWithContext, @Body() body: { refresh_token: string }) {
    if ((this.auth as any).refresh) {
      return (this.auth as any).refresh(request.tenantId as string, body.refresh_token);
    }
    return this.auth.refreshToken(request.tenantId as string, body.refresh_token);
  }

  @Get('me')
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  me(@Req() request: RequestWithContext) {
    if ((this.auth as any).getProfile) {
      return (this.auth as any).getProfile(request.tenantId as string, request.auth?.userId as string);
    }
    return this.auth.me(request.tenantId as string, request.auth?.userId as string);
  }
}
