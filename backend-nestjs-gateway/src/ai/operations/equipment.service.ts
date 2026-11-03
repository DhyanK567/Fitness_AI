import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class EquipmentService {
  private readonly logger = new Logger(EquipmentService.name);
  private readonly prismaService?: PrismaService;
  private readonly erpService?: ErpnextService;

  constructor(
    @Optional() prismaOrErp?: PrismaService | ErpnextService,
    @Optional() erp?: ErpnextService,
    @Optional() private readonly auditOutbox?: AuditOutboxService,
  ) {
    if (prismaOrErp && 'withTenant' in prismaOrErp) {
      this.prismaService = prismaOrErp as PrismaService;
      this.erpService = erp;
    } else if (prismaOrErp && 'call' in prismaOrErp) {
      this.erpService = prismaOrErp as ErpnextService;
    }
  }

  /**
   * Get equipment status, maintenance schedule, and availability.
   * Uses authoritative PostgreSQL domain model within tenant boundary when available.
   */
  async getEquipmentStatus(
    context: ToolContext,
    args: { branchId?: string; equipmentType?: string; status?: string } = {},
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const where: any = {
            tenantId: context.tenantId,
          };
          if (args.branchId) where.branchId = args.branchId;
          if (args.equipmentType) where.equipmentType = args.equipmentType;
          if (args.status) where.status = args.status;

          const equipmentList = await tx.equipment.findMany({
            where,
            include: {
              maintenance: {
                where: { tenantId: context.tenantId },
                orderBy: { scheduledAt: 'desc' },
                take: 3,
              },
            },
            orderBy: { name: 'asc' },
          });

          const totalEquipmentCount = equipmentList.length;
          const operational = equipmentList.filter(
            (e: any) => e.status === 'available' || e.status === 'in_use',
          ).length;
          const maintenanceRequired = equipmentList.filter(
            (e: any) => e.status === 'maintenance',
          ).length;

          return {
            success: true,
            data: {
              totalEquipmentCount,
              operational,
              maintenanceRequired,
              equipment: equipmentList.map((e: any) => ({
                id: e.id,
                name: e.name,
                equipmentType: e.equipmentType,
                brand: e.brand,
                model: e.model,
                serialNumber: e.serialNumber,
                status: e.status,
                location: e.location,
                lastMaintenanceAt: e.lastMaintenanceAt ? e.lastMaintenanceAt.toISOString() : null,
                nextMaintenanceAt: e.nextMaintenanceAt ? e.nextMaintenanceAt.toISOString() : null,
                notes: e.notes,
                recentMaintenance:
                  e.maintenance?.map((m: any) => ({
                    id: m.id,
                    maintenanceType: m.maintenanceType,
                    status: m.status,
                    scheduledAt: m.scheduledAt.toISOString(),
                    assignedTo: m.assignedTo,
                    cost: m.cost,
                  })) || [],
              })),
            },
          };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get equipment status';
        this.logger.error(`getEquipmentStatus DB query failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.EQUIPMENT_LIST,
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get equipment status';
        this.logger.error(`getEquipmentStatus ERP call failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider configured for EquipmentService' };
  }

  /**
   * Schedule equipment maintenance or mark equipment as needing service.
   * Creates an EquipmentMaintenance record and updates equipment nextMaintenanceAt/status.
   */
  async scheduleEquipmentMaintenance(
    context: ToolContext,
    args: {
      equipmentId: string;
      maintenanceType: 'routine' | 'repair' | 'inspection' | 'calibration';
      scheduledAt: string;
      estimatedDurationMinutes: number;
      notes?: string;
      assignedTo?: string;
    },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          // 1. Verify equipment exists and belongs to this tenant
          const equipment = await tx.equipment.findFirst({
            where: { id: args.equipmentId, tenantId: context.tenantId },
          });

          if (!equipment) {
            return {
              success: false,
              error: `Equipment '${args.equipmentId}' not found for this tenant`,
              errorCode: 'NOT_FOUND',
            };
          }

          // 2. Validate scheduled date
          const scheduledDate = new Date(args.scheduledAt);
          if (isNaN(scheduledDate.getTime())) {
            return {
              success: false,
              error: 'Invalid scheduledAt date format',
              errorCode: 'INVALID_ARGUMENT',
            };
          }

          // 3. Create maintenance work order
          const maintenance = await tx.equipmentMaintenance.create({
            data: {
              tenantId: context.tenantId,
              equipmentId: args.equipmentId,
              maintenanceType: args.maintenanceType,
              status: 'scheduled',
              scheduledAt: scheduledDate,
              estimatedDurationMin: args.estimatedDurationMinutes,
              notes: args.notes || null,
              assignedTo: args.assignedTo || null,
            },
          });

          // 4. Update equipment metadata/status
          const updateData: any = {
            nextMaintenanceAt: scheduledDate,
          };
          if (args.maintenanceType === 'repair') {
            updateData.status = 'maintenance';
          }
          await tx.equipment.update({
            where: { id: args.equipmentId },
            data: updateData,
          });

          // 5. Transactional audit log if audit outbox is present
          if (this.auditOutbox) {
            await this.auditOutbox.recordInTransaction(tx, {
              tenantId: context.tenantId,
              correlationId: context.correlationId || randomUUID(),
              actorType: 'human',
              actorId: context.userId,
              action: 'equipment.maintenance.schedule',
              resourceType: 'equipment_maintenance',
              resourceRef: maintenance.id,
              eventType: 'ai.equipment.maintenance_scheduled',
              payload: {
                maintenanceId: maintenance.id,
                equipmentId: equipment.id,
                equipmentName: equipment.name,
                maintenanceType: maintenance.maintenanceType,
                scheduledAt: maintenance.scheduledAt.toISOString(),
                estimatedDurationMinutes: maintenance.estimatedDurationMin,
              },
            });
          }

          return {
            success: true,
            data: {
              maintenanceId: maintenance.id,
              equipmentId: maintenance.equipmentId,
              equipmentName: equipment.name,
              maintenanceType: maintenance.maintenanceType,
              status: maintenance.status,
              scheduledAt: maintenance.scheduledAt.toISOString(),
              estimatedDurationMinutes: maintenance.estimatedDurationMin,
              assignedTo: maintenance.assignedTo,
              notes: maintenance.notes,
            },
          };
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to schedule equipment maintenance';
        this.logger.error(`scheduleEquipmentMaintenance DB transaction failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.EQUIPMENT_MAINTENANCE_SCHEDULE,
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to schedule equipment maintenance';
        this.logger.error(`scheduleEquipmentMaintenance ERP call failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider configured for EquipmentService' };
  }
}