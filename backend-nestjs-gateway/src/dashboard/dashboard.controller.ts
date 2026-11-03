import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../common/request-context.types';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { DashboardService } from './dashboard.service';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { RequirePermission } from '../common/permission.decorator';

@Controller('dashboard')
@UseGuards(TenantContextGuard, StaffAccessGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  @RequirePermission('reports:read')
  summary(@Req() request: RequestWithContext) { return this.service.summary(request.tenantId as string); }
}
