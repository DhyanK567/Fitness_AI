import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto, UpdateFeedbackDto } from './dto';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { RequirePermission } from '../../common/permission.decorator';
import { RequireTier } from '../../common/tier-entitlement.decorator';
import type { RequestWithContext } from '../../common/request-context.types';

@Controller('feedback')
@UseGuards(TenantContextGuard, StaffAccessGuard)
@RequireTier('growth')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}
  @Post() @RequirePermission('feedback:write') create(@Body() dto: CreateFeedbackDto, @Req() req: RequestWithContext) { return this.service.create(this.context(req), dto); }
  @Get() @RequirePermission('feedback:read') findAll(@Req() req: RequestWithContext, @Query('member_id') memberId?: string) { return this.service.findAll(this.context(req), memberId); }
  @Get(':id') @RequirePermission('feedback:read') findOne(@Param('id') id: string, @Req() req: RequestWithContext) { return this.service.findOne(this.context(req), id); }
  @Patch(':id') @RequirePermission('feedback:write') update(@Param('id') id: string, @Body() dto: UpdateFeedbackDto, @Req() req: RequestWithContext) { return this.service.update(this.context(req), id, dto); }
  @Delete(':id') @RequirePermission('feedback:write') delete(@Param('id') id: string, @Req() req: RequestWithContext) { return this.service.delete(this.context(req), id); }
  private context(req: RequestWithContext) { return { tenantId: req.tenantId as string, userId: req.auth!.userId, roles: req.auth?.roles ?? [] }; }
}
