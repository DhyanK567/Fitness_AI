import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { RequirePermission } from '../../common/permission.decorator';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { MEMBERSHIPS_PERMISSIONS } from './memberships.policy';
import { MembershipsService } from './memberships.service';
import { CreateFreezeRequestDto, ReviewFreezeRequestDto } from './dto/freeze-request.dto';
import { RequireAnyRole, RequireTier } from '../../common/tier-entitlement.decorator';

@Controller('memberships')
@UseGuards(TenantContextGuard, StaffAccessGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('freeze-requests')
  @RequirePermission(MEMBERSHIPS_PERMISSIONS.read)
  @RequireTier('growth')
  listFreezeRequests(@Req() req: RequestWithContext) { return this.memberships.listFreezeRequests(this.context(req)); }

  @Post('freeze-requests')
  @RequirePermission(MEMBERSHIPS_PERMISSIONS.write)
  createFreezeRequest(@Req() req: RequestWithContext, @Body() body: CreateFreezeRequestDto) { return this.memberships.createFreezeRequest(this.context(req), body, req.auth?.userId as string); }

  @Post('freeze-requests/:id/review')
  @RequirePermission(MEMBERSHIPS_PERMISSIONS.write)
  @RequireTier('growth')
  @RequireAnyRole('owner', 'admin')
  reviewFreezeRequest(@Req() req: RequestWithContext, @Param('id') id: string, @Body() body: ReviewFreezeRequestDto) { return this.memberships.reviewFreezeRequest(this.context(req), id, body, req.auth?.userId as string); }

  @Get()
  @RequirePermission(MEMBERSHIPS_PERMISSIONS.read)
  list(@Req() req: RequestWithContext) {
    return this.memberships.list(this.context(req));
  }

  @Post()
  @RequirePermission(MEMBERSHIPS_PERMISSIONS.write)
  create(@Req() req: RequestWithContext, @Body() body: CreateMembershipDto) {
    return this.memberships.create(this.context(req), body, req.auth?.userId as string);
  }

  @Get(':id')
  @RequirePermission(MEMBERSHIPS_PERMISSIONS.read)
  get(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.memberships.get(this.context(req), id);
  }

  @Put(':id')
  @RequirePermission(MEMBERSHIPS_PERMISSIONS.write)
  update(@Req() req: RequestWithContext, @Param('id') id: string, @Body() body: UpdateMembershipDto) {
    return this.memberships.update(this.context(req), id, body, req.auth?.userId as string);
  }

  @Post(':id/cancel')
  @RequirePermission(MEMBERSHIPS_PERMISSIONS.write)
  cancel(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.memberships.cancel(this.context(req), id, req.auth?.userId as string);
  }

  @Delete(':id')
  @RequirePermission(MEMBERSHIPS_PERMISSIONS.write)
  delete(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.memberships.delete(this.context(req), id, req.auth?.userId as string);
  }

  private context(req: RequestWithContext) {
    return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string };
  }
}
