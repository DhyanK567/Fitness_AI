import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { RequirePermission } from '../../common/permission.decorator';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { MemberOrStaffAccessGuard } from './booking-access.guard';
import { BOOKINGS_PERMISSIONS } from './bookings.policy';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Controller('bookings')
@UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @RequirePermission(BOOKINGS_PERMISSIONS.read)
  list(@Req() req: RequestWithContext) {
    return this.bookings.list(this.context(req));
  }

  @Post()
  @RequirePermission(BOOKINGS_PERMISSIONS.write)
  create(@Req() req: RequestWithContext, @Body() body: CreateBookingDto) {
    if (!req.auth?.memberRef && !body.member_id) throw new BadRequestException('member_id is required for staff-created bookings');
    return this.bookings.create(this.context(req), body, req.auth?.userId as string);
  }

  @Get(':id')
  @RequirePermission(BOOKINGS_PERMISSIONS.read)
  get(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.bookings.get(this.context(req), id);
  }

  @Put(':id')
  @RequirePermission(BOOKINGS_PERMISSIONS.write)
  update(@Req() req: RequestWithContext, @Param('id') id: string, @Body() body: UpdateBookingDto) {
    return this.bookings.update(this.context(req), id, body.status, req.auth?.userId as string);
  }

  @Delete(':id')
  @RequirePermission(BOOKINGS_PERMISSIONS.write)
  delete(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.bookings.delete(this.context(req), id, req.auth?.userId as string);
  }

  @Post(':id/cancel')
  @RequirePermission(BOOKINGS_PERMISSIONS.write)
  cancel(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.bookings.cancel(this.context(req), id, req.auth?.userId as string);
  }

  private context(req: RequestWithContext) {
    return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string, memberRef: req.auth?.memberRef, actorId: req.auth?.userId, roles: req.auth?.roles ?? [] };
  }
}
