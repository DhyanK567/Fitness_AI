import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OperationsService } from '../operations/operations.service';
import { StaffSchedulingService } from '../operations/staff-scheduling.service';
import { EquipmentService } from '../operations/equipment.service';
import { FacilityService } from '../operations/facility.service';
import { WaitlistService } from '../operations/waitlist.service';
import { ScheduleOptimizationService } from '../operations/schedule-optimization.service';
import { BaseTool, ToolContext, ToolResult, AiTool } from './base-tool';
import { ToolDefinition } from '@wsos/ai-tool-definitions';

// ============================================
// Operations Agent Tools (T-42 to T-52)
// ============================================

@Injectable()
export class GetClassCapacityUtilizationTool extends BaseTool implements AiTool {
  constructor(private readonly operationsService: OperationsService) {
    super(null as any); // ERP not directly used, service handles it
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      classTypeId: z.string().uuid().optional(),
      branchId: z.string().uuid().optional(),
    }).parse(args);

    return this.operationsService.getClassCapacityUtilization(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-42',
    name: 'getClassCapacityUtilization',
    purpose: 'Get capacity utilization metrics for classes across time periods.',
    assistant: 'operations',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'operations.read',
    featureFlag: 'ai.operations',
    owningService: 'OperationsService',
    phase: 'P2',
    args: z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      classTypeId: z.string().uuid().optional(),
      branchId: z.string().uuid().optional(),
    }).strict(),
  };
}

@Injectable()
export class GetStaffScheduleTool extends BaseTool implements AiTool {
  constructor(private readonly staffSchedulingService: StaffSchedulingService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      staffId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      branchId: z.string().uuid().optional(),
    }).parse(args);

    return this.staffSchedulingService.getStaffSchedule(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-43',
    name: 'getStaffSchedule',
    purpose: 'Get staff schedules including classes, shifts, and availability.',
    assistant: 'operations',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'staff.read',
    featureFlag: 'ai.operations',
    owningService: 'StaffSchedulingService',
    phase: 'P2',
    args: z.object({
      staffId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      branchId: z.string().uuid().optional(),
    }).strict(),
  };
}

@Injectable()
export class CreateStaffScheduleTool extends BaseTool implements AiTool {
  constructor(private readonly staffSchedulingService: StaffSchedulingService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      staffId: z.string().uuid(),
      scheduleType: z.enum(['class', 'shift', 'availability']),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      classTypeId: z.string().uuid().optional(),
      branchId: z.string().uuid(),
      notes: z.string().max(500).optional(),
    }).parse(args);

    return this.staffSchedulingService.createStaffSchedule(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-44',
    name: 'createStaffSchedule',
    purpose: 'Create or update staff schedule for classes and shifts.',
    assistant: 'operations',
    risk: 'write',
    requiresConfirmation: true,
    principals: ['staff'],
    requiredPermission: 'staff.write',
    featureFlag: 'ai.operations',
    owningService: 'StaffSchedulingService',
    phase: 'P2',
    args: z.object({
      staffId: z.string().uuid(),
      scheduleType: z.enum(['class', 'shift', 'availability']),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      classTypeId: z.string().uuid().optional(),
      branchId: z.string().uuid(),
      notes: z.string().max(500).optional(),
    }).strict(),
  };
}

@Injectable()
export class GetEquipmentStatusTool extends BaseTool implements AiTool {
  constructor(private readonly equipmentService: EquipmentService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      branchId: z.string().uuid().optional(),
      equipmentType: z.string().optional(),
      status: z.enum(['available', 'in_use', 'maintenance', 'retired']).optional(),
    }).parse(args);

    return this.equipmentService.getEquipmentStatus(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-45',
    name: 'getEquipmentStatus',
    purpose: 'Get equipment status, maintenance schedule, and availability.',
    assistant: 'operations',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'equipment.read',
    featureFlag: 'ai.operations',
    owningService: 'EquipmentService',
    phase: 'P2',
    args: z.object({
      branchId: z.string().uuid().optional(),
      equipmentType: z.string().optional(),
      status: z.enum(['available', 'in_use', 'maintenance', 'retired']).optional(),
    }).strict(),
  };
}

@Injectable()
export class ScheduleEquipmentMaintenanceTool extends BaseTool implements AiTool {
  constructor(private readonly equipmentService: EquipmentService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      equipmentId: z.string().uuid(),
      maintenanceType: z.enum(['routine', 'repair', 'inspection', 'calibration']),
      scheduledAt: z.string().datetime(),
      estimatedDurationMinutes: z.number().int().min(15).max(480),
      notes: z.string().max(1000).optional(),
      assignedTo: z.string().uuid().optional(),
    }).parse(args);

    return this.equipmentService.scheduleEquipmentMaintenance(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-46',
    name: 'scheduleEquipmentMaintenance',
    purpose: 'Schedule equipment maintenance or mark equipment as needing service.',
    assistant: 'operations',
    risk: 'write',
    requiresConfirmation: true,
    principals: ['staff'],
    requiredPermission: 'equipment.write',
    featureFlag: 'ai.operations',
    owningService: 'EquipmentService',
    phase: 'P2',
    args: z.object({
      equipmentId: z.string().uuid(),
      maintenanceType: z.enum(['routine', 'repair', 'inspection', 'calibration']),
      scheduledAt: z.string().datetime(),
      estimatedDurationMinutes: z.number().int().min(15).max(480),
      notes: z.string().max(1000).optional(),
      assignedTo: z.string().uuid().optional(),
    }).strict(),
  };
}

@Injectable()
export class GetFacilityUtilizationTool extends BaseTool implements AiTool {
  constructor(private readonly facilityService: FacilityService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      branchId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      roomId: z.string().uuid().optional(),
    }).parse(args);

    return this.facilityService.getFacilityUtilization(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-47',
    name: 'getFacilityUtilization',
    purpose: 'Get facility/room utilization metrics and availability.',
    assistant: 'operations',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'facility.read',
    featureFlag: 'ai.operations',
    owningService: 'FacilityService',
    phase: 'P2',
    args: z.object({
      branchId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      roomId: z.string().uuid().optional(),
    }).strict(),
  };
}

@Injectable()
export class ManageWaitlistTool extends BaseTool implements AiTool {
  constructor(private readonly waitlistService: WaitlistService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      action: z.enum(['view', 'promote', 'notify', 'remove', 'clear_expired']),
      sessionId: z.string().uuid().optional(),
      bookingId: z.string().uuid().optional(),
      notifyCount: z.number().int().min(1).max(10).default(3),
    }).parse(args);

    return this.waitlistService.manageWaitlist(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-48',
    name: 'manageWaitlist',
    purpose: 'Manage waitlist operations - view, promote, notify, or clear waitlist entries using WS Booking with status=Waitlisted.',
    assistant: 'operations',
    risk: 'write',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'bookings.write',
    featureFlag: 'ai.operations',
    owningService: 'WaitlistService',
    phase: 'P2',
    args: z.object({
      action: z.enum(['view', 'promote', 'notify', 'remove', 'clear_expired']),
      sessionId: z.string().uuid().optional(),
      bookingId: z.string().uuid().optional(),
      notifyCount: z.number().int().min(1).max(10).default(3),
    }).strict(),
  };
}

@Injectable()
export class GetOperationalAlertsTool extends BaseTool implements AiTool {
  constructor(private readonly operationsService: OperationsService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      severity: z.enum(['info', 'warning', 'critical']).optional(),
      category: z.enum(['capacity', 'staffing', 'equipment', 'attendance', 'payment']).optional(),
      acknowledged: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).parse(args);

    return this.operationsService.getOperationalAlerts(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-49',
    name: 'getOperationalAlerts',
    purpose: 'Get operational alerts - low capacity, no-shows, equipment issues, staffing gaps.',
    assistant: 'operations',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'operations.read',
    featureFlag: 'ai.operations',
    owningService: 'OperationsService',
    phase: 'P2',
    args: z.object({
      severity: z.enum(['info', 'warning', 'critical']).optional(),
      category: z.enum(['capacity', 'staffing', 'equipment', 'attendance', 'payment']).optional(),
      acknowledged: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict(),
  };
}

@Injectable()
export class AcknowledgeOperationalAlertTool extends BaseTool implements AiTool {
  constructor(private readonly operationsService: OperationsService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      alertId: z.string().uuid(),
      action: z.enum(['acknowledge', 'resolve', 'dismiss']),
      resolutionNotes: z.string().max(1000).optional(),
    }).parse(args);

    return this.operationsService.acknowledgeOperationalAlert(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-50',
    name: 'acknowledgeOperationalAlert',
    purpose: 'Acknowledge or resolve an operational alert.',
    assistant: 'operations',
    risk: 'write',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'operations.write',
    featureFlag: 'ai.operations',
    owningService: 'OperationsService',
    phase: 'P2',
    args: z.object({
      alertId: z.string().uuid(),
      action: z.enum(['acknowledge', 'resolve', 'dismiss']),
      resolutionNotes: z.string().max(1000).optional(),
    }).strict(),
  };
}

@Injectable()
export class GetClassCancellationImpactTool extends BaseTool implements AiTool {
  constructor(private readonly operationsService: OperationsService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      sessionId: z.string().uuid(),
    }).parse(args);

    return this.operationsService.getClassCancellationImpact(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-51',
    name: 'getClassCancellationImpact',
    purpose: 'Analyze impact of cancelling a class - affected members, revenue loss, waitlist promotions.',
    assistant: 'operations',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'operations.read',
    featureFlag: 'ai.operations',
    owningService: 'OperationsService',
    phase: 'P2',
    args: z.object({
      sessionId: z.string().uuid(),
    }).strict(),
  };
}

@Injectable()
export class OptimizeClassScheduleTool extends BaseTool implements AiTool {
  constructor(private readonly scheduleOptimizationService: ScheduleOptimizationService) {
    super(null as any);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const parsedArgs = z.object({
      branchId: z.string().uuid().optional(),
      periodDays: z.number().int().min(7).max(90).default(30),
      optimizationGoal: z.enum(['maximize_revenue', 'maximize_utilization', 'balance_load', 'minimize_conflicts']).default('maximize_utilization'),
    }).parse(args);

    return this.scheduleOptimizationService.optimizeClassSchedule(context, parsedArgs);
  }

  static definition: ToolDefinition = {
    id: 'T-52',
    name: 'optimizeClassSchedule',
    purpose: 'Get AI-powered class schedule optimization recommendations based on demand, capacity, and instructor availability.',
    assistant: 'operations',
    risk: 'read',
    requiresConfirmation: false,
    principals: ['staff'],
    requiredPermission: 'operations.read',
    featureFlag: 'ai.operations',
    owningService: 'ScheduleOptimizationService',
    phase: 'P2',
    args: z.object({
      branchId: z.string().uuid().optional(),
      periodDays: z.number().int().min(7).max(90).default(30),
      optimizationGoal: z.enum(['maximize_revenue', 'maximize_utilization', 'balance_load', 'minimize_conflicts']).default('maximize_utilization'),
    }).strict(),
  };
}