import { Injectable, Logger } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class ScheduleOptimizationService {
  private readonly logger = new Logger(ScheduleOptimizationService.name);

  constructor(private readonly erp: ErpnextService) {}

  /**
   * Get schedule optimization recommendations
   */
  async optimizeClassSchedule(
    context: ToolContext,
    args: { branchId?: string; periodDays: number; optimizationGoal: string },
  ): Promise<ToolResult> {
    try {
      const result = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: ERP_METHODS.OPTIMIZE_CLASS_SCHEDULE,
        body: args,
      });
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to optimize schedule';
      this.logger.error(`optimizeClassSchedule failed:`, error);
      return { success: false, error: errorMessage };
    }
  }
}