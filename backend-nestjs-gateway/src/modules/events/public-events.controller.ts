import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { LoginRateLimitGuard } from '../../auth/login-rate-limit.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { PublicRegisterEventDto } from './dto/public-register-event.dto';
import { EventsService } from './events.service';

@Controller('events/public')
@UseGuards(TenantContextGuard)
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Req() req: RequestWithContext) {
    return this.events.listPublic(this.context(req));
  }

  @Post(':id/registrations')
  @UseGuards(TenantContextGuard, LoginRateLimitGuard)
  register(@Req() req: RequestWithContext, @Param('id') id: string, @Body() dto: PublicRegisterEventDto) {
    return this.events.registerPublic(this.context(req), id, dto);
  }

  private context(req: RequestWithContext) {
    return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string };
  }
}
