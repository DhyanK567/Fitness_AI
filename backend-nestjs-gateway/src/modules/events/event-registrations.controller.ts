import { Body, Controller, Delete, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { RequirePermission } from '../../common/permission.decorator';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';
import { RegisterEventDto } from './dto/register-event.dto';
import { EVENTS_PERMISSIONS } from './events.policy';
import { EventsService } from './events.service';

/** Shared operation: staff may register a selected member; members are forced to their linked member record. */
@Controller('events')
export class EventRegistrationsController {
  constructor(private readonly events: EventsService) {}

  @Post(':id/registrations')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  @RequirePermission(EVENTS_PERMISSIONS.register)
  register(@Req() req: RequestWithContext, @Param('id') id: string, @Body() dto: RegisterEventDto) {
    const input = req.auth?.memberRef ? { ...dto, member_id: req.auth.memberRef } : dto;
    return this.events.register(this.context(req), id, input, req.auth!.userId);
  }

  @Delete(':id/registrations/:registrationId')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  @RequirePermission(EVENTS_PERMISSIONS.register)
  cancelRegistration(
    @Req() req: RequestWithContext,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.events.cancelRegistration(this.context(req), id, registrationId, req.auth!.userId);
  }

  @Patch(':id/registrations/:registrationId/checkin')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  @RequirePermission(EVENTS_PERMISSIONS.register)
  checkInRegistration(
    @Req() req: RequestWithContext,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.events.checkInRegistration(this.context(req), id, registrationId, req.auth!.userId);
  }

  private context(req: RequestWithContext) {
    return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string };
  }
}
