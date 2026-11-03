import { Body, Controller, Post, Get, Patch, Delete, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { RequestWithContext } from '../common/request-context.types';
import { AuthService } from './auth.service';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { RequirePermission } from '../common/permission.decorator';
import { MemberSignupDto, MemberOtpRequestDto, MemberOtpVerifyDto, AuthMeDto, AuthMePatchDto } from './dto';

@ApiTags('auth-member')
@ApiBearerAuth()
@Controller('auth/member')
export class AuthMemberController {
  constructor(private readonly auth: AuthService) { }

  @Post('signup')
  @ApiOperation({ summary: 'B2C member signup with consent' })
  @ApiResponse({ status: 201, description: 'Member created and OTP sent' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  signup(@Body() body: MemberSignupDto) {
    return this.auth.memberSignup(body.email, body.password, body.confirmEmail, body.consent);
  }

  @Post('otp/request')
  @ApiOperation({ summary: 'Request OTP for member verification' })
  @ApiResponse({ status: 200, description: 'OTP sent to email' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  requestOtp(@Body() body: MemberOtpRequestDto) {
    return this.auth.memberOtpRequest(body.email, body.consent);
  }

  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify OTP for member' })
  @ApiResponse({ status: 200, description: 'Member verified, tokens issued' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 429, description: 'Too many attempts, account locked' })
  verifyOtp(@Body() body: MemberOtpVerifyDto) {
    return this.auth.memberOtpVerify(body.code);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current member user profile' })
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  me(@Req() request: RequestWithContext) {
    return this.auth.getProfile(request.tenantId as string, request.auth?.userId as string);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update member profile (name only)' })
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  patchMe(@Req() request: RequestWithContext, @Body() body: AuthMePatchDto) {
    return this.auth.patchProfile(request.tenantId as string, request.auth?.userId as string, body.name);
  }

  @Delete('me')
  @ApiOperation({ summary: 'DPDP anonymize and delete member account' })
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  deleteMe(@Req() request: RequestWithContext) {
    return this.auth.deleteProfile(request.tenantId as string, request.auth?.userId as string);
  }
}