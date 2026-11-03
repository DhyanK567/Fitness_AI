import { Body, Controller, ForbiddenException, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';
import { UpdateMemberProfileDto } from './dto/update-member-profile.dto';
import { MembersService } from './members.service';

@Controller('members')
@UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
export class MemberSelfController {
  constructor(private readonly members: MembersService) {}

  @Get('me')
  getSelf(@Req() req: RequestWithContext) {
    if (!req.auth?.memberRef) throw new ForbiddenException('This endpoint is for member accounts');
    return this.members.getSelf(this.context(req));
  }

  @Put('me')
  updateSelf(@Req() req: RequestWithContext, @Body() body: UpdateMemberProfileDto) {
    if (!req.auth?.memberRef) throw new ForbiddenException('This endpoint is for member accounts');
    return this.members.updateSelf(this.context(req), body, req.auth.userId);
  }

  private context(req: RequestWithContext) {
    return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string, memberRef: req.auth?.memberRef as string };
  }
}
