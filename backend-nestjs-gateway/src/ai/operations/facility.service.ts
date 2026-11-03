import { Injectable, Logger } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class FacilityService {
  private readonly logger = new Logger(FacilityService.name);

  constructor(private readonly erp: ErpnextService) {}

  /**
   * Get facility/room utilization
   */
  async getFacilityUtilization(
    context: ToolContext,
    args: { branchId?: string; startDate: string; endDate: string; roomId?: string },
  ): Promise<ToolResult> {
    try {
      const result = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: ERP_METHODS.FACILITY_UTILIZATION,
        body: args,
      });
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get facility utilization';
      this.logger.error(`getFacilityUtilization failed:`, error);
      return { success: false, error: errorMessage };
    }
  }
}