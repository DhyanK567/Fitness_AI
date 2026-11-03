import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { MembershipsService } from './memberships.service';

@Controller('memberships/plans')
@UseGuards(TenantContextGuard)
export class MembershipPlansPublicController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  listActivePlans(@Req() req: RequestWithContext) {
    return this.memberships.listActivePlans({ tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string });
  }
}
