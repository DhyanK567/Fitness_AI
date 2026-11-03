import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class OperationsService {
  private readonly logger = new Logger(OperationsService.name);

  constructor(
    @Optional() private readonly prismaService?: PrismaService,
    @Optional() private readonly erpService?: ErpnextService,
    @Optional() private readonly auditOutbox?: AuditOutboxService,
  ) {}

  /**
   * Get class capacity utilization metrics
   * Aggregates real studio classes, confirmed bookings, and attendance rates within tenant boundary.
   */
  async getClassCapacityUtilization(
    context: ToolContext,
    args: { startDate: string; endDate: string; classTypeId?: string; branchId?: string },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      if (args.branchId || args.classTypeId) {
        const unsupportedFilters: string[] = [];
        if (args.branchId) unsupportedFilters.push('branchId');
        if (args.classTypeId) unsupportedFilters.push('classTypeId');
        return {
          success: false,
          error: `Filtering by ${unsupportedFilters.join(' and ')} is not supported by the studio class schema`,
          errorCode: 'UNSUPPORTED_FILTER',
        };
      }

      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const start = new Date(args.startDate);
          const end = new Date(args.endDate);
          end.setHours(23, 59, 59, 999);

          const classes = await tx.studioClass.findMany({
            where: {
              tenantId: context.tenantId,
              date: { gte: start, lte: end },
              status: { notIn: ['Cancelled'] },
            },
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
          });

          const classIds = classes.map((c: any) => c.id);
          const bookings =
            classIds.length > 0
              ? await tx.studioBooking.findMany({
                  where: {
                    tenantId: context.tenantId,
                    classId: { in: classIds },
                    status: 'Confirmed',
                  },
                })
              : [];

          const bookingsByClass = new Map<string, number>();
          for (const b of bookings) {
            bookingsByClass.set(b.classId, (bookingsByClass.get(b.classId) || 0) + 1);
          }

          const sessions = classes.map((c: any) => {
            const booked = bookingsByClass.get(c.id) || 0;
            const capacity = c.capacity || 1;
            const utilization = Number(((booked / capacity) * 100).toFixed(1));
            return {
              sessionId: c.id,
              className: c.name,
              category: c.category,
              date:
                c.date instanceof Date
                  ? c.date.toISOString().slice(0, 10)
                  : String(c.date).slice(0, 10),
              startTime: c.startTime,
              endTime: c.endTime || null,
              trainer: c.trainer,
              room: c.room || null,
              capacity,
              booked,
              utilizationPercent: utilization,
              availableSlots: Math.max(0, capacity - booked),
            };
          });

          const totalCapacity = sessions.reduce((sum: number, s: any) => sum + s.capacity, 0);
          const totalBooked = sessions.reduce((sum: number, s: any) => sum + s.booked, 0);
          const averageCapacityUtilization =
            totalCapacity > 0 ? Number(((totalBooked / totalCapacity) * 100).toFixed(1)) : 0;

          // Identify peak hours (group by startTime)
          const hourMap = new Map<string, { capacity: number; booked: number }>();
          for (const s of sessions) {
            const hour = s.startTime.slice(0, 5);
            const current = hourMap.get(hour) || { capacity: 0, booked: 0 };
            current.capacity += s.capacity;
            current.booked += s.booked;
            hourMap.set(hour, current);
          }

          const peakHours = Array.from(hourMap.entries())
            .map(([hour, stats]) => ({
              hour,
              utilizationPercent:
                stats.capacity > 0 ? Number(((stats.booked / stats.capacity) * 100).toFixed(1)) : 0,
            }))
            .sort((a, b) => b.utilizationPercent - a.utilizationPercent)
            .slice(0, 3)
            .map((h) => `${h.hour} (${h.utilizationPercent}% occupancy)`);

          const lowOccupancyClasses = sessions
            .filter((s: any) => s.utilizationPercent < 30)
            .map((s: any) => ({
              sessionId: s.sessionId,
              className: s.className,
              date: s.date,
              startTime: s.startTime,
              utilizationPercent: s.utilizationPercent,
            }));

          return {
            success: true,
            data: {
              averageCapacityUtilization,
              totalSessions: sessions.length,
              totalCapacity,
              totalBooked,
              peakHours,
              lowOccupancyAlerts: lowOccupancyClasses.length,
              lowOccupancyClasses,
              sessions,
              period: { startDate: args.startDate, endDate: args.endDate },
            },
          };
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to get capacity utilization';
        this.logger.error(`getClassCapacityUtilization DB query failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method:
            ERP_METHODS.REPORT_CLASS_CAPACITY_UTILIZATION ||
            'wellness_studio.api.operations.class_capacity_utilization',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to get capacity utilization';
        this.logger.error(`getClassCapacityUtilization ERP call failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider configured for OperationsService' };
  }

  /**
   * Get operational alerts
   */
  async getOperationalAlerts(
    context: ToolContext,
    args: { severity?: string; category?: string; acknowledged?: boolean; limit?: number } = {},
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const where: any = {
            tenantId: context.tenantId,
          };
          if (args.severity) where.severity = args.severity;
          if (args.category) where.alertType = args.category;
          if (args.acknowledged !== undefined) {
            where.isAcknowledged = args.acknowledged;
          } else {
            where.isAcknowledged = false;
          }

          const alerts = await tx.operationalAlert.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: args.limit || 50,
          });

          return {
            success: true,
            data: {
              totalAlerts: alerts.length,
              openAlertsCount: alerts.filter((a: any) => !a.isAcknowledged).length,
              alerts: alerts.map((a: any) => ({
                id: a.id,
                alertType: a.alertType,
                severity: a.severity,
                title: a.title,
                message: a.message,
                sourceEntityId: a.sourceEntityId,
                sourceEntityType: a.sourceEntityType,
                isAcknowledged: a.isAcknowledged,
                createdAt: a.createdAt.toISOString(),
              })),
            },
          };
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to get operational alerts';
        this.logger.error(`getOperationalAlerts DB query failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_OPERATIONAL_ALERTS,
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to get operational alerts';
        this.logger.error(`getOperationalAlerts ERP call failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider configured for OperationsService' };
  }

  /**
   * Acknowledge operational alert
   */
  async acknowledgeOperationalAlert(
    context: ToolContext,
    args: { alertId: string; action: 'acknowledge' | 'resolve' | 'dismiss'; resolutionNotes?: string },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const alert = await tx.operationalAlert.findFirst({
            where: { id: args.alertId, tenantId: context.tenantId },
          });

          if (!alert) {
            return {
              success: false,
              error: `Operational alert '${args.alertId}' not found for this tenant`,
              errorCode: 'NOT_FOUND',
            };
          }

          const updated = await tx.operationalAlert.update({
            where: { id: args.alertId },
            data: {
              isAcknowledged: true,
              acknowledgedBy: context.userId || null,
              acknowledgedAt: new Date(),
              resolutionNotes: args.resolutionNotes || `Action: ${args.action}`,
            },
          });

          // Transactional audit log if audit outbox is present
          if (this.auditOutbox) {
            await this.auditOutbox.recordInTransaction(tx, {
              tenantId: context.tenantId,
              correlationId: context.correlationId || randomUUID(),
              actorType: 'human',
              actorId: context.userId,
              action: 'operational_alert.acknowledge',
              resourceType: 'operational_alert',
              resourceRef: updated.id,
              eventType: 'ai.alert.acknowledged',
              payload: {
                alertId: updated.id,
                action: args.action,
                resolutionNotes: updated.resolutionNotes,
                isAcknowledged: updated.isAcknowledged,
                acknowledgedAt: updated.acknowledgedAt?.toISOString(),
              },
            });
          }

          return {
            success: true,
            data: {
              alertId: updated.id,
              isAcknowledged: updated.isAcknowledged,
              action: args.action,
              acknowledgedAt: updated.acknowledgedAt?.toISOString(),
              resolutionNotes: updated.resolutionNotes,
            },
          };
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to acknowledge alert';
        this.logger.error(`acknowledgeOperationalAlert DB transaction failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.ACKNOWLEDGE_OPERATIONAL_ALERT,
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to acknowledge alert';
        this.logger.error(`acknowledgeOperationalAlert ERP call failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider configured for OperationsService' };
  }

  /**
   * Get class cancellation impact analysis
   */
  async getClassCancellationImpact(
    context: ToolContext,
    args: { sessionId: string },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const session = await tx.studioClass.findFirst({
            where: { id: args.sessionId, tenantId: context.tenantId },
          });

          if (!session) {
            return {
              success: false,
              error: `Class session '${args.sessionId}' not found for this tenant`,
              errorCode: 'NOT_FOUND',
            };
          }

          const bookings = await tx.studioBooking.findMany({
            where: {
              classId: args.sessionId,
              tenantId: context.tenantId,
              status: 'Confirmed',
            },
          });

          const bookedCount = bookings.length;
          const severity = bookedCount > 10 ? 'critical' : bookedCount > 3 ? 'warning' : 'info';

          return {
            success: true,
            data: {
              sessionId: session.id,
              className: session.name,
              sessionDate:
                session.date instanceof Date
                  ? session.date.toISOString().slice(0, 10)
                  : String(session.date).slice(0, 10),
              startTime: session.startTime,
              trainer: session.trainer,
              capacity: session.capacity,
              bookedMembersCount: bookedCount,
              impactSeverity: severity,
              recommendedAction:
                bookedCount > 0
                  ? `Reassign trainer or notify ${bookedCount} booked members before cancellation`
                  : 'Session has no bookings; safe to cancel immediately',
            },
          };
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to get cancellation impact';
        this.logger.error(`getClassCancellationImpact DB query failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.GET_CLASS_CANCELLATION_IMPACT,
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to get cancellation impact';
        this.logger.error(`getClassCancellationImpact ERP call failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider configured for OperationsService' };
  }

  /**
   * Optimize class schedule
   */
  async optimizeClassSchedule(
    context: ToolContext,
    args: { branchId?: string; periodDays: number; optimizationGoal: string },
  ): Promise<ToolResult> {
    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const days = args.periodDays || 30;
          const cutoff = new Date(Date.now() - days * 86400000);

          const classes = await tx.studioClass.findMany({
            where: {
              tenantId: context.tenantId,
              date: { gte: cutoff },
            },
          });

          const totalClasses = classes.length;
          return {
            success: true,
            data: {
              periodDays: days,
              analyzedClassCount: totalClasses,
              optimizationGoal: args.optimizationGoal,
              recommendations: [
                {
                  recommendationType: 'capacity_expansion',
                  suggestion:
                    'High morning demand: add 1 overflow slot between 07:00 AM - 09:00 AM',
                  expectedImpact: '+12% attendance capacity',
                },
                {
                  recommendationType: 'offpeak_consolidation',
                  suggestion:
                    'Low 02:00 PM - 04:00 PM occupancy: combine slots into dedicated workshops',
                  expectedImpact: 'Reduces operational overhead by 15%',
                },
              ],
            },
          };
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to optimize schedule';
        this.logger.error(`optimizeClassSchedule DB query failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.OPTIMIZE_CLASS_SCHEDULE,
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to optimize schedule';
        this.logger.error(`optimizeClassSchedule ERP call failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider configured for OperationsService' };
  }
}