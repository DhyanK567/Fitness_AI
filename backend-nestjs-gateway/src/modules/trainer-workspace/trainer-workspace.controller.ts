import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { RequirePermission } from '../../common/permission.decorator';
import { RequireAnyRole } from '../../common/tier-entitlement.decorator';
import type { RequestWithContext } from '../../common/request-context.types';
import { SaveProgressNoteDto, SaveWorkoutPlanDto } from './trainer-workspace.dto';
import { TrainerWorkspaceService } from './trainer-workspace.service';

@Controller('trainer')
@UseGuards(TenantContextGuard, StaffAccessGuard)
@RequireAnyRole('trainer', 'coach', 'lead_trainer')
export class TrainerWorkspaceController {
  constructor(private readonly workspace: TrainerWorkspaceService) {}

  @Get('overview')
  @RequirePermission('members:read')
  overview(@Req() req: RequestWithContext) {
    return this.workspace.overview(req.tenantId as string, req.auth!.userId);
  }

  @Get('workouts')
  @RequirePermission('members:read')
  workouts(@Req() req: RequestWithContext) {
    return this.workspace.workouts(req.tenantId as string, req.auth!.userId);
  }

  @Post('workouts')
  @RequirePermission('members:read')
  saveWorkout(@Req() req: RequestWithContext, @Body() body: SaveWorkoutPlanDto) {
    return this.workspace.saveWorkout(req.tenantId as string, req.auth!.userId, body);
  }

  @Get('progress')
  @RequirePermission('members:read')
  progress(@Req() req: RequestWithContext) {
    return this.workspace.progress(req.tenantId as string, req.auth!.userId);
  }

  @Post('progress')
  @RequirePermission('members:read')
  saveProgress(@Req() req: RequestWithContext, @Body() body: SaveProgressNoteDto) {
    return this.workspace.saveProgress(req.tenantId as string, req.auth!.userId, body);
  }

  @Patch('profile')
  @RequirePermission('members:read')
  updateProfile(
    @Req() req: RequestWithContext,
    @Body() body: { displayName?: string; phoneE164?: string },
  ) {
    return this.workspace.updateProfile(req.tenantId as string, req.auth!.userId, body);
  }
}
