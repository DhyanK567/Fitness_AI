import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import type { RequestWithContext } from '../common/request-context.types';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { RequirePermission } from '../common/permission.decorator';
import { ErpnextService } from './erpnext.service';

@Controller('erpnext')
export class ErpnextController {
  constructor(private readonly erpnextService: ErpnextService) {}

  @Get('health')
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  @RequirePermission('reports:read')
  health(@Req() request: RequestWithContext) {
    return this.erpnextService.health({
      tenantId: request.tenantCode as string,
      correlationId: request.correlationId as string,
    });
  }

  @Get('version')
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  @RequirePermission('reports:read')
  version(@Req() request: RequestWithContext) {
    return this.erpnextService.version({
      tenantId: request.tenantCode as string,
      correlationId: request.correlationId as string,
    });
  }
}
