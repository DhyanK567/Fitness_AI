import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';
import { CreateOwnMembershipDto } from './dto/create-own-membership.dto';
import { MembershipsService } from './memberships.service';

@Controller('memberships')
@UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
export class MemberMembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('me')
  listForMember(@Req() req: RequestWithContext) {
    if (!req.auth?.memberRef) throw new ForbiddenException('This endpoint is for member accounts');
    return this.memberships.listForMember(this.context(req));
  }

  @Post('me')
  createForMember(@Req() req: RequestWithContext, @Body() body: CreateOwnMembershipDto) {
    if (!req.auth?.memberRef) throw new ForbiddenException('This endpoint is for member accounts');
    return this.memberships.createForMember(this.context(req), body, req.auth.userId);
  }

  private context(req: RequestWithContext) {
    return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string, memberRef: req.auth?.memberRef as string };
  }
}
