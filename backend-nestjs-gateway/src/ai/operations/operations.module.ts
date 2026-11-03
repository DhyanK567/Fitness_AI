import { Module } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { StaffSchedulingService } from './staff-scheduling.service';
import { EquipmentService } from './equipment.service';
import { FacilityService } from './facility.service';
import { WaitlistService } from './waitlist.service';
import { ScheduleOptimizationService } from './schedule-optimization.service';
import { GetClassCapacityUtilizationTool } from '../tools/operations-tools';
import { GetStaffScheduleTool } from '../tools/operations-tools';
import { CreateStaffScheduleTool } from '../tools/operations-tools';
import { GetEquipmentStatusTool } from '../tools/operations-tools';
import { ScheduleEquipmentMaintenanceTool } from '../tools/operations-tools';
import { GetFacilityUtilizationTool } from '../tools/operations-tools';
import { ManageWaitlistTool } from '../tools/operations-tools';
import { GetOperationalAlertsTool } from '../tools/operations-tools';
import { AcknowledgeOperationalAlertTool } from '../tools/operations-tools';
import { GetClassCancellationImpactTool } from '../tools/operations-tools';
import { OptimizeClassScheduleTool } from '../tools/operations-tools';

import { PrismaService } from '../../common/prisma.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';

@Module({
  providers: [
    PrismaService,
    AuditOutboxService,
    OperationsService,
    StaffSchedulingService,
    EquipmentService,
    FacilityService,
    WaitlistService,
    ScheduleOptimizationService,
    // Operations Agent Tools
    GetClassCapacityUtilizationTool,
    GetStaffScheduleTool,
    CreateStaffScheduleTool,
    GetEquipmentStatusTool,
    ScheduleEquipmentMaintenanceTool,
    GetFacilityUtilizationTool,
    ManageWaitlistTool,
    GetOperationalAlertsTool,
    AcknowledgeOperationalAlertTool,
    GetClassCancellationImpactTool,
    OptimizeClassScheduleTool,
  ],
  exports: [
    OperationsService,
    StaffSchedulingService,
    EquipmentService,
    FacilityService,
    WaitlistService,
    ScheduleOptimizationService,
    // Export all tools
    GetClassCapacityUtilizationTool,
    GetStaffScheduleTool,
    CreateStaffScheduleTool,
    GetEquipmentStatusTool,
    ScheduleEquipmentMaintenanceTool,
    GetFacilityUtilizationTool,
    ManageWaitlistTool,
    GetOperationalAlertsTool,
    AcknowledgeOperationalAlertTool,
    GetClassCancellationImpactTool,
    OptimizeClassScheduleTool,
  ],
})
export class OperationsModule {}