import { Injectable } from '@nestjs/common';
import { ErpBaseService, ToolContext, ToolResult } from '../../common/erp-base.service';
import { DashboardQueryDto, DashboardStatsDto } from './dto';
import { ERP_METHODS } from '@wsos/erp-methods';

@Injectable()
export class DashboardService extends ErpBaseService {
  async getStats(context: ToolContext, query: DashboardQueryDto): Promise<ToolResult<DashboardStatsDto>> {
    const result = await this.callErp<DashboardStatsDto>(context, ERP_METHODS.REPORT_DASHBOARD_STATS, query);
    if (!result.success) return result;
    return this.success(result.data as DashboardStatsDto);
  }
}