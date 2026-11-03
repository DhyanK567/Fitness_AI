import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { RequirePermission } from '../../common/permission.decorator';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { AssignTrainerDto } from './dto/assign-trainer.dto';
import { MembersService } from './members.service';
import { MEMBERS_PERMISSIONS } from './members.policy';
import { RequireAnyRole } from '../../common/tier-entitlement.decorator';

@Controller('members')
@UseGuards(TenantContextGuard, StaffAccessGuard)
@RequireAnyRole('owner', 'admin', 'front_desk', 'staff', 'trainer', 'coach', 'lead_trainer')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission(MEMBERS_PERMISSIONS.read)
  list(@Req() req: RequestWithContext) {
    return this.members.list({ tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string, actorId: req.auth?.userId, roles: req.auth?.roles ?? [] });
  }

  @Post()
  @RequirePermission(MEMBERS_PERMISSIONS.write)
  create(@Req() req: RequestWithContext, @Body() body: CreateMemberDto) {
    return this.members.create({ tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string }, body, req.auth?.userId as string);
  }

  @Get(':id')
  @RequirePermission(MEMBERS_PERMISSIONS.read)
  get(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.members.get({ tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string, actorId: req.auth?.userId, roles: req.auth?.roles ?? [] }, id);
  }

  @Patch(':id/trainer')
  @RequirePermission('members:assign')
  assignTrainer(@Req() req: RequestWithContext, @Param('id') id: string, @Body() body: AssignTrainerDto) {
    return this.members.assignTrainer(
      { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string },
      id,
      body.trainer_user_id ?? null,
      req.auth?.userId as string,
    );
  }

  @Put(':id')
  @RequirePermission(MEMBERS_PERMISSIONS.write)
  update(@Req() req: RequestWithContext, @Param('id') id: string, @Body() body: UpdateMemberDto) {
    return this.members.update({ tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string }, id, body, req.auth?.userId as string);
  }

  @Delete(':id')
  @RequirePermission(MEMBERS_PERMISSIONS.write)
  deactivate(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.members.deactivate({ tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string }, id, req.auth?.userId as string);
  }

}
