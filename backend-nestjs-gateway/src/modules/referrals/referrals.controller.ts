import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';
import { ReferralsService } from './referrals.service';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidateReferralDto {
  @IsString()
  @IsNotEmpty()
  referral_code!: string;

  @IsOptional()
  @IsString()
  plan_id?: string;
}

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  @Get('my-referral')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  getMyReferral(@Req() req: RequestWithContext) {
    const memberRef = (req.auth?.memberRef || req.auth?.userId) as string;
    return this.service.getMyReferral(req.tenantId as string, memberRef);
  }

  @Post('validate')
  @UseGuards(TenantContextGuard)
  validateCode(@Req() req: RequestWithContext, @Body() body: ValidateReferralDto) {
    const currentMemberRef = (req.auth?.memberRef || req.auth?.userId) as string | undefined;
    return this.service.validateCode(
      req.tenantId as string,
      body.referral_code,
      currentMemberRef,
      body.plan_id,
    );
  }
}
