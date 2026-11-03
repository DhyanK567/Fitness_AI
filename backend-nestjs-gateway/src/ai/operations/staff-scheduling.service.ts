import { Injectable, Logger } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class StaffSchedulingService {
  private readonly logger = new Logger(StaffSchedulingService.name);

  constructor(private readonly erp: ErpnextService) {}

  /**
   * Get staff schedules
   */
  async getStaffSchedule(
    context: ToolContext,
    args: { staffId?: string; startDate: string; endDate: string; branchId?: string },
  ): Promise<ToolResult> {
    try {
      const result = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: ERP_METHODS.STAFF_SCHEDULE_LIST,
        body: args,
      });
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get staff schedule';
      this.logger.error(`getStaffSchedule failed:`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create or update staff schedule
   */
  async createStaffSchedule(
    context: ToolContext,
    args: {
      staffId: string;
      scheduleType: 'class' | 'shift' | 'availability';
      startDate: string;
      endDate: string;
      daysOfWeek: number[];
      startTime: string;
      endTime: string;
      classTypeId?: string;
      branchId: string;
      notes?: string;
    },
  ): Promise<ToolResult> {
    try {
      const result = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method: ERP_METHODS.STAFF_SCHEDULE_CREATE,
        body: args,
      });
      return { success: true, data: result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create staff schedule';
      this.logger.error(`createStaffSchedule failed:`, error);
      return { success: false, error: errorMessage };
    }
  }
}