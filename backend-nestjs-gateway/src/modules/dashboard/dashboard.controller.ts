import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(AuthGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  @RequirePermission('dashboard:read')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getStats(
    @Request() req: any,
    @Query() query: DashboardQueryDto,
  ) {
    const context = {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `dashboard_${Date.now()}`,
    };
    return this.service.getStats(context, query);
  }
}