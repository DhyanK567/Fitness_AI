import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { RequirePermission } from '../../common/permission.decorator';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EVENTS_PERMISSIONS } from './events.policy';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}
  @Get() @UseGuards(TenantContextGuard, StaffAccessGuard) @RequirePermission(EVENTS_PERMISSIONS.read) list(@Req() req: RequestWithContext) { return this.events.list(this.context(req)); }
  @Post() @UseGuards(TenantContextGuard, StaffAccessGuard) @RequirePermission(EVENTS_PERMISSIONS.write) create(@Req() req: RequestWithContext, @Body() dto: CreateEventDto) { return this.events.create(this.context(req), dto, req.auth!.userId); }
  @Get(':id') @UseGuards(TenantContextGuard, StaffAccessGuard) @RequirePermission(EVENTS_PERMISSIONS.read) get(@Req() req: RequestWithContext, @Param('id') id: string) { return this.events.get(this.context(req), id); }
  @Put(':id') @UseGuards(TenantContextGuard, StaffAccessGuard) @RequirePermission(EVENTS_PERMISSIONS.write) update(@Req() req: RequestWithContext, @Param('id') id: string, @Body() dto: UpdateEventDto) { return this.events.update(this.context(req), id, dto, req.auth!.userId); }
  @Delete(':id') @UseGuards(TenantContextGuard, StaffAccessGuard) @RequirePermission(EVENTS_PERMISSIONS.write) cancel(@Req() req: RequestWithContext, @Param('id') id: string) { return this.events.cancel(this.context(req), id, req.auth!.userId); }
  private context(req: RequestWithContext) { return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string }; }
}
