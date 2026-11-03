import { Injectable } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

interface RevenueTrendsResponse {
  trends: Array<{
    period: string;
    revenue: number;
    transaction_count: number;
    average_transaction: number;
    growth_percent: number;
  }>;
  period_type: 'daily' | 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  currency: string;
}

@Injectable()
export class GetRevenueTrendsTool extends BaseTool {
  async execute(context: ToolContext, args: { period_type?: 'daily' | 'weekly' | 'monthly'; periods?: number }): Promise<ToolResult> {
    const period_type = args.period_type || 'monthly';
    const periods = args.periods || 12;

    const result = await this.callErp<RevenueTrendsResponse>(context, ERP_METHODS.REPORT_REVENUE_TRENDS, {
      period_type,
      periods
    });

    if (!result.success) return result;

    const data = result.data;

    return this.success({
      trends: data?.trends ?? [],
      periodType: data?.period_type ?? period_type,
      periodStart: data?.period_start,
      periodEnd: data?.period_end,
      currency: data?.currency ?? 'INR',
      summary: `Revenue trends (${period_type}): ${(data?.trends?.length ?? 0)} periods analyzed | Latest: ${data?.currency ?? 'INR'} ${(data?.trends?.[0]?.revenue ?? 0).toLocaleString()} | Growth: ${data?.trends?.[0]?.growth_percent ?? 0}%`,
    });
  }
}