import { Injectable, Logger } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class BrandService {
  private readonly logger = new Logger(BrandService.name);

  constructor(private readonly erp: ErpnextService) {}

  /**
   * Get brand health metrics
   */
  async getBrandHealthMetrics(
    context: ToolContext,
    args: { periodDays: number; source: string },
  ): Promise<ToolResult> {
    try {
      const result = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: ERP_METHODS.GET_BRAND_HEALTH_METRICS || 'wellness_studio.api.marketing.brand_health',
        body: args,
      });
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get brand health metrics';
      this.logger.error(`getBrandHealthMetrics failed:`, error);
      return { success: false, error: errorMessage };
    }
  }
}