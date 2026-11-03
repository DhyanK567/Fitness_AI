import { Injectable, NotFoundException } from '@nestjs/common';
import { ErpBaseService, ToolContext, ToolResult } from '../../common/erp-base.service';
import { ReportQueryDto, RevenueReportDto, AttendanceReportDto, MembershipReportDto, DashboardStatsDto } from './dto';
import { ERP_METHODS } from '@wsos/erp-methods';

@Injectable()
export class ReportsService extends ErpBaseService {
  async getRevenueReport(context: ToolContext, query: ReportQueryDto): Promise<ToolResult<RevenueReportDto>> {
    const result = await this.callErp<RevenueReportDto>(context, ERP_METHODS.REPORT_REVENUE_SUMMARY, query);
    if (!result.success) return result;
    return this.success(result.data as RevenueReportDto);
  }

  async getRevenueTrends(context: ToolContext, query: ReportQueryDto): Promise<ToolResult<Record<string, unknown>>> {
    const result = await this.callErp<Record<string, unknown>>(context, ERP_METHODS.REPORT_REVENUE_TRENDS, query);
    if (!result.success) return result;
    return this.success(result.data as Record<string, unknown>);
  }

  async getAttendanceReport(context: ToolContext, query: ReportQueryDto): Promise<ToolResult<AttendanceReportDto[]>> {
    const result = await this.callErp<{ reports: AttendanceReportDto[] }>(context, ERP_METHODS.REPORT_ATTENDANCE, query);
    if (!result.success) return result as unknown as ToolResult<AttendanceReportDto[]>;
    const data = result.data?.reports || [];
    return this.success(data);
  }

  async getMembershipReport(context: ToolContext, query: ReportQueryDto): Promise<ToolResult<MembershipReportDto>> {
    const result = await this.callErp<MembershipReportDto>(context, ERP_METHODS.REPORT_MEMBERSHIPS, query);
    if (!result.success) return result;
    return this.success(result.data as MembershipReportDto);
  }

  async getDashboardStats(context: ToolContext): Promise<ToolResult<DashboardStatsDto>> {
    const result = await this.callErp<DashboardStatsDto>(context, ERP_METHODS.REPORT_DASHBOARD_STATS, {});
    if (!result.success) return result;
    return this.success(result.data as DashboardStatsDto);
  }
}