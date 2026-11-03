import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { RequirePermission } from '../../common/permission.decorator';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LEADS_PERMISSIONS } from './leads.policy';
import { LeadsService } from './leads.service';
import { RequireAnyRole, RequireTier } from '../../common/tier-entitlement.decorator';

@Controller('leads')
@UseGuards(TenantContextGuard, StaffAccessGuard)
@RequireTier('growth')
@RequireAnyRole('owner', 'admin', 'lead_trainer')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}
  @Get() @RequirePermission(LEADS_PERMISSIONS.read) list(@Req() req: RequestWithContext) { return this.leads.list(this.context(req)); }
  @Post() @RequirePermission(LEADS_PERMISSIONS.write) create(@Req() req: RequestWithContext, @Body() dto: CreateLeadDto) { return this.leads.create(this.context(req), dto, req.auth!.userId); }
  @Get(':id') @RequirePermission(LEADS_PERMISSIONS.read) get(@Req() req: RequestWithContext, @Param('id') id: string) { return this.leads.get(this.context(req), id); }
  @Put(':id') @RequirePermission(LEADS_PERMISSIONS.write) update(@Req() req: RequestWithContext, @Param('id') id: string, @Body() dto: UpdateLeadDto) { return this.leads.update(this.context(req), id, dto, req.auth!.userId); }
  @Post(':id/convert') @RequirePermission(LEADS_PERMISSIONS.write) convert(@Req() req: RequestWithContext, @Param('id') id: string) { return this.leads.convert(this.context(req), id, req.auth!.userId); }
  @Delete(':id') @RequirePermission(LEADS_PERMISSIONS.write) deactivate(@Req() req: RequestWithContext, @Param('id') id: string) { return this.leads.deactivate(this.context(req), id, req.auth!.userId); }
  private context(req: RequestWithContext) { return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string }; }
}
