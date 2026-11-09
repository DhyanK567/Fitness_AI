import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { RequirePermission } from '../../common/permission.decorator';
import { RequireAnyRole, RequireTier } from '../../common/tier-entitlement.decorator';
import type { RequestWithContext } from '../../common/request-context.types';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(TenantContextGuard, StaffAccessGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('revenue')
  @RequirePermission('reports:read')
  @RequireTier('enterprise')
  @RequireAnyRole('owner', 'admin', 'biller', 'accountant')
  @ApiOperation({ summary: 'Get revenue report' })
  async getRevenueReport(
    @Req() req: RequestWithContext,
    @Query() query: ReportQueryDto,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      tenantCode: req.tenantCode as string,
      userId: req.auth!.userId,
      role: req.auth?.roles[0] ?? '',
      correlationId: `revenue_${Date.now()}`,
    };
    return this.service.getRevenueReport(context, query);
  }

  @Get('revenue/trends')
  @RequirePermission('reports:read')
  @RequireTier('enterprise')
  @RequireAnyRole('owner', 'admin', 'biller', 'accountant')
  @ApiOperation({ summary: 'Get revenue trends' })
  async getRevenueTrends(
    @Req() req: RequestWithContext,
    @Query() query: ReportQueryDto,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      tenantCode: req.tenantCode as string,
      userId: req.auth!.userId,
      role: req.auth?.roles[0] ?? '',
      correlationId: `trends_${Date.now()}`,
    };
    return this.service.getRevenueTrends(context, query);
  }

  @Get('attendance')
  @RequirePermission('reports:read')
  @RequireTier('growth')
  @ApiOperation({ summary: 'Get attendance report' })
  async getAttendanceReport(
    @Req() req: RequestWithContext,
    @Query() query: ReportQueryDto,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      tenantCode: req.tenantCode as string,
      userId: req.auth!.userId,
      role: req.auth?.roles[0] ?? '',
      correlationId: `attendance_${Date.now()}`,
    };
    return this.service.getAttendanceReport(context, query);
  }

  @Get('memberships')
  @RequirePermission('reports:read')
  @RequireTier('growth')
  @ApiOperation({ summary: 'Get membership report' })
  async getMembershipReport(
    @Req() req: RequestWithContext,
    @Query() query: ReportQueryDto,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      tenantCode: req.tenantCode as string,
      userId: req.auth!.userId,
      role: req.auth?.roles[0] ?? '',
      correlationId: `memberships_${Date.now()}`,
    };
    return this.service.getMembershipReport(context, query);
  }

  @Get('dashboard')
  @RequirePermission('reports:read')
  @RequireTier('growth')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboardStats(
    @Req() req: RequestWithContext,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      tenantCode: req.tenantCode as string,
      userId: req.auth!.userId,
      role: req.auth?.roles[0] ?? '',
      correlationId: `dashboard_${Date.now()}`,
    };
    return this.service.getDashboardStats(context);
  }
}
