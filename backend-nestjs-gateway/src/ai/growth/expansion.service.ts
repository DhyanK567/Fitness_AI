import { Injectable, Logger } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class ExpansionService {
  private readonly logger = new Logger(ExpansionService.name);

  constructor(private readonly erp: ErpnextService) {}

  /**
   * Get expansion opportunities
   */
  async getExpansionOpportunities(
    context: ToolContext,
    args: { analysisType: string; radiusKm: number; minPopulation: number },
  ): Promise<ToolResult> {
    try {
      const result = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: ERP_METHODS.GET_EXPANSION_OPPORTUNITIES || 'wellness_studio.api.growth.expansion_opportunities',
        body: args,
      });
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get expansion opportunities';
      this.logger.error(`getExpansionOpportunities failed:`, error);
      return { success: false, error: errorMessage };
    }
  }
}