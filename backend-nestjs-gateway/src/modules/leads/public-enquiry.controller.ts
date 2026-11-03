import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { LoginRateLimitGuard } from '../../auth/login-rate-limit.guard';
import { LeadsService } from './leads.service';
import { PublicEnquiryDto } from './dto/public-enquiry.dto';

@Controller('leads/public')
@UseGuards(TenantContextGuard, LoginRateLimitGuard)
export class PublicEnquiryController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  create(@Req() req: RequestWithContext, @Body() dto: PublicEnquiryDto) {
    return this.leads.createPublic({ tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string }, dto);
  }
}
