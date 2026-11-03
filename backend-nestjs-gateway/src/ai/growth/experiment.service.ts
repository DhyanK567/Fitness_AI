import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext, ToolResult } from '../tools/base-tool';

@Injectable()
export class ExperimentService {
  private readonly logger = new Logger(ExperimentService.name);
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
   * Track growth experiment
   */
  async trackGrowthExperiment(
    context: ToolContext,
    args: { experimentId?: string; status?: string },
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const where: any = { tenantId: context.tenantId };
          if (args.experimentId) {
            where.id = args.experimentId;
          }
          if (args.status) {
            where.status = args.status;
          }

          const experiments = await tx.growthExperiment.findMany({
            where,
            include: { enrollments: true },
          });

          const experimentSummaries = experiments.map((exp: any) => {
            const enrollments = exp.enrollments || [];
            const control = enrollments.filter((e: any) => e.variant === 'control');
            const treatment = enrollments.filter((e: any) => e.variant === 'treatment');
            const controlConversions = control.filter((e: any) => e.convertedAt !== null).length;
            const treatmentConversions = treatment.filter((e: any) => e.convertedAt !== null).length;

            const controlRate = control.length > 0 ? Number(((controlConversions / control.length) * 100).toFixed(1)) : 0;
            const treatmentRate = treatment.length > 0 ? Number(((treatmentConversions / treatment.length) * 100).toFixed(1)) : 0;

            let leadingVariant = 'insufficient_data';
            if (control.length > 0 || treatment.length > 0) {
              if (treatmentRate > controlRate) {
                const uplift = controlRate > 0 ? Number((((treatmentRate - controlRate) / controlRate) * 100).toFixed(1)) : treatmentRate;
                leadingVariant = `Treatment (+${uplift}% conversion)`;
              } else if (controlRate > treatmentRate) {
                leadingVariant = 'Control (leading)';
              } else {
                leadingVariant = 'Tie (equal performance)';
              }
            }

            return {
              id: exp.id,
              name: exp.name,
              hypothesis: exp.hypothesis,
              status: exp.status,
              targetMetric: exp.targetMetric,
              totalEnrolled: enrollments.length,
              controlCount: control.length,
              treatmentCount: treatment.length,
              controlConversionRate: controlRate,
              treatmentConversionRate: treatmentRate,
              leadingVariant,
            };
          });

          const activeExperiments = experimentSummaries
            .filter((e: any) => e.status === 'running' || e.status === 'active' || e.status === 'draft')
            .map((e: any) => ({ name: e.name, leadingVariant: e.leadingVariant }));

          return {
            success: true,
            data: {
              experiments: experimentSummaries,
              activeExperiments,
              totalExperiments: experimentSummaries.length,
              activeCount: activeExperiments.length,
              source: 'postgresql',
            },
          };
        });
      } catch (dbError) {
        this.logger.warn(
          `PostgreSQL query for growth experiments failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.TRACK_GROWTH_EXPERIMENT || 'wellness_studio.api.growth.track_experiment',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to track growth experiment';
        this.logger.error(`trackGrowthExperiment ERP fallback failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for tracking growth experiments' };
  }

  /**
   * Create a growth experiment
   */
  async createGrowthExperiment(
    context: ToolContext,
    args: {
      name: string;
      hypothesis: string;
      variantControl: Record<string, unknown>;
      variantTreatment: Record<string, unknown>;
      targetMetric: string;
      minimumDetectableEffect: number;
      trafficAllocation: number;
      startDate: string;
      endDate?: string;
    },
  ): Promise<ToolResult> {
    if (!context?.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return { success: false, error: 'Tenant context required' };
    }

    if (this.prismaService) {
      try {
        return await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const experiment = await tx.growthExperiment.create({
            data: {
              tenantId: context.tenantId,
              name: args.name,
              hypothesis: args.hypothesis,
              variantControl: (args.variantControl as any) || {},
              variantTreatment: (args.variantTreatment as any) || {},
              targetMetric: args.targetMetric,
              minimumDetectableEffect: args.minimumDetectableEffect,
              trafficAllocation: Math.round(args.trafficAllocation),
              status: 'running',
              startDate: new Date(args.startDate),
              endDate: args.endDate ? new Date(args.endDate) : null,
              createdBy: context.userId || '00000000-0000-0000-0000-000000000000',
            },
          });
          return { success: true, data: experiment };
        });
      } catch (dbError) {
        this.logger.warn(
          `Database insert for createGrowthExperiment failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.CREATE_GROWTH_EXPERIMENT || 'wellness_studio.api.growth.create_experiment',
          body: args,
        });
        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create growth experiment';
        this.logger.error(`createGrowthExperiment failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for createGrowthExperiment' };
  }
}