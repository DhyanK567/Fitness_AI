import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { RequireAnyRole, RequireTier } from '../../common/tier-entitlement.decorator';
import type { RequestWithContext } from '../../common/request-context.types';
import { EmployeeWorkspacesService } from './employee-workspaces.service';
import { CreateWalkInLeadDto } from './dto/create-walk-in-lead.dto';

@Controller('workspaces')
@UseGuards(TenantContextGuard, StaffAccessGuard)
export class EmployeeWorkspacesController {
  constructor(private readonly workspaces: EmployeeWorkspacesService) {}

  @Get('front-desk')
  @RequireAnyRole('front_desk', 'staff')
  frontDesk(@Req() req: RequestWithContext) {
    return this.workspaces.frontDesk(req.tenantId as string, req.auth!.userId);
  }

  @Post('front-desk/leads')
  @RequireAnyRole('front_desk', 'staff')
  createWalkInLead(@Req() req: RequestWithContext, @Body() dto: CreateWalkInLeadDto) {
    return this.workspaces.createWalkInLead(req.tenantId as string, req.auth!.userId, dto);
  }

  @Get('billing')
  @RequireTier('enterprise')
  @RequireAnyRole('biller', 'accountant')
  billing(@Req() req: RequestWithContext) {
    return this.workspaces.billing(req.tenantId as string, req.auth!.userId);
  }

  @Get('lead-trainer')
  @RequireTier('growth')
  @RequireAnyRole('lead_trainer')
  leadTrainer(@Req() req: RequestWithContext) {
    return this.workspaces.leadTrainer(req.tenantId as string, req.auth!.userId);
  }
}
