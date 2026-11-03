import { Injectable } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

interface RevenueSummaryResponse {
  total_revenue: number;
  revenue_this_month: number;
  revenue_last_month: number;
  revenue_this_year: number;
  average_transaction: number;
  transaction_count: number;
  currency: string;
  period_start: string;
  period_end: string;
}

@Injectable()
export class GetRevenueSummaryTool extends BaseTool {
  async execute(context: ToolContext): Promise<ToolResult> {
    const result = await this.callErp<RevenueSummaryResponse>(context, ERP_METHODS.REPORT_REVENUE_SUMMARY, {});

    if (!result.success) return result;

    const data = result.data;

    return this.success({
      totalRevenue: data?.total_revenue ?? 0,
      revenueThisMonth: data?.revenue_this_month ?? 0,
      revenueLastMonth: data?.revenue_last_month ?? 0,
      revenueThisYear: data?.revenue_this_year ?? 0,
      averageTransaction: data?.average_transaction ?? 0,
      transactionCount: data?.transaction_count ?? 0,
      currency: data?.currency ?? 'INR',
      periodStart: data?.period_start,
      periodEnd: data?.period_end,
      summary: `Total Revenue: ${data?.currency ?? 'INR'} ${(data?.total_revenue ?? 0).toLocaleString()} | This Month: ${data?.currency ?? 'INR'} ${(data?.revenue_this_month ?? 0).toLocaleString()} | Transactions: ${data?.transaction_count ?? 0}`,
    });
  }
}