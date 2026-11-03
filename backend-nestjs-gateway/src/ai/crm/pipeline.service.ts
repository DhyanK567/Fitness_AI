import {
  Injectable,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { Prisma } from '@prisma/client';

export interface CreatePipelineStageInput {
  tenantId: string;
  name: string;
  displayName: string;
  stageOrder: number;
  winProbability?: number;
  slaDays?: number;
  color?: string;
  isDefault?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdatePipelineStageInput {
  displayName?: string;
  stageOrder?: number;
  winProbability?: number;
  slaDays?: number;
  color?: string;
  isActive?: boolean;
  isDefault?: boolean;
  metadata?: Record<string, any>;
}

export interface MoveLeadInput {
  tenantId: string;
  leadId: string;
  fromStageId: string;
  toStageId: string;
  assignedTo?: string;
  notes?: string;
}

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditOutbox?: AuditOutboxService,
  ) {}

  /**
   * Create a new pipeline stage within tenant isolation
   */
  async createStage(input: CreatePipelineStageInput) {
    return this.prisma.withTenant(input.tenantId, async (tx) => {
      const existing = await tx.pipelineStage.findFirst({
        where: { tenantId: input.tenantId, name: input.name },
      });
      if (existing) {
        throw new ConflictException(`Stage with name '${input.name}' already exists in this tenant`);
      }

      // If this is marked default, unset existing default stages
      if (input.isDefault) {
        await tx.pipelineStage.updateMany({
          where: { tenantId: input.tenantId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const stage = await tx.pipelineStage.create({
        data: {
          tenantId: input.tenantId,
          name: input.name,
          displayName: input.displayName,
          stageOrder: input.stageOrder,
          winProbability: input.winProbability ?? 0,
          slaDays: input.slaDays,
          color: input.color,
          isDefault: input.isDefault ?? false,
          metadata: input.metadata ?? {},
        },
      });

      if (this.auditOutbox) {
        await this.auditOutbox.recordInTransaction(tx, {
          tenantId: input.tenantId,
          correlationId: randomUUID(),
          actorType: 'system',
          actorId: undefined,
          action: 'pipeline_stage.created',
          resourceType: 'pipeline_stage',
          resourceRef: stage.id,
          eventType: 'pipeline_stage.created',
          payload: { stageId: stage.id, name: stage.name, displayName: stage.displayName },
        });
      }

      return stage;
    });
  }

  /**
   * Retrieve active pipeline stages ordered by stageOrder
   */
  async getStages(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.pipelineStage.findMany({
        where: { tenantId, isActive: true },
        orderBy: { stageOrder: 'asc' },
        include: {
          _count: { select: { pipelineEntries: true } },
        },
      });
    });
  }

  /**
   * Retrieve a specific pipeline stage by ID with tenant isolation
   */
  async getStage(tenantId: string, stageId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const stage = await tx.pipelineStage.findFirst({
        where: { id: stageId, tenantId },
      });
      if (!stage) throw new NotFoundException(`Pipeline stage '${stageId}' not found`);
      return stage;
    });
  }

  /**
   * Update an existing pipeline stage
   */
  async updateStage(tenantId: string, stageId: string, input: UpdatePipelineStageInput) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.pipelineStage.findFirst({
        where: { id: stageId, tenantId },
      });
      if (!existing) throw new NotFoundException(`Pipeline stage '${stageId}' not found`);

      if (input.isDefault) {
        await tx.pipelineStage.updateMany({
          where: { tenantId, isDefault: true, NOT: { id: stageId } },
          data: { isDefault: false },
        });
      }

      const updated = await tx.pipelineStage.update({
        where: { id: stageId },
        data: input,
      });

      if (this.auditOutbox) {
        await this.auditOutbox.recordInTransaction(tx, {
          tenantId,
          correlationId: randomUUID(),
          actorType: 'system',
          actorId: undefined,
          action: 'pipeline_stage.updated',
          resourceType: 'pipeline_stage',
          resourceRef: stageId,
          eventType: 'pipeline_stage.updated',
          payload: { stageId, updates: input as Record<string, unknown> } as Prisma.InputJsonValue,
        });
      }

      return updated;
    });
  }

  /**
   * Delete an existing pipeline stage (prevented if default or has active entries)
   */
  async deleteStage(tenantId: string, stageId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const stage = await tx.pipelineStage.findFirst({
        where: { id: stageId, tenantId },
      });
      if (!stage) throw new NotFoundException(`Pipeline stage '${stageId}' not found`);

      if (stage.isDefault) {
        throw new ConflictException('Cannot delete default pipeline stage');
      }

      const entriesCount = await tx.pipelineEntry.count({
        where: { stageId, tenantId },
      });
      if (entriesCount > 0) {
        throw new ConflictException('Cannot delete stage with active leads. Move leads first.');
      }

      return tx.pipelineStage.delete({
        where: { id: stageId },
      });
    });
  }

  /**
   * Reorder stages within tenant isolation
   */
  async reorderStages(tenantId: string, stageOrders: Array<{ id: string; order: number }>) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      for (const { id, order } of stageOrders) {
        await tx.pipelineStage.updateMany({
          where: { id, tenantId },
          data: { stageOrder: order },
        });
      }
      return tx.pipelineStage.findMany({
        where: { tenantId, isActive: true },
        orderBy: { stageOrder: 'asc' },
      });
    });
  }

  /**
   * Move lead between stages with complete historical tracking and audit logging
   */
  async moveLead(input: MoveLeadInput) {
    const { tenantId, leadId, fromStageId, toStageId, assignedTo, notes } = input;

    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Verify lead exists and belongs to this tenant (CORR-CRM-02)
      const lead = await tx.studioLead.findFirst({
        where: { id: leadId, tenantId },
      });
      if (!lead) {
        throw new NotFoundException(`Lead '${leadId}' not found for tenant`);
      }

      // 2. Verify both stages exist and belong to tenant
      const [fromStage, toStage] = await Promise.all([
        tx.pipelineStage.findFirst({ where: { id: fromStageId, tenantId } }),
        tx.pipelineStage.findFirst({ where: { id: toStageId, tenantId } }),
      ]);

      if (!fromStage) throw new NotFoundException(`Source pipeline stage '${fromStageId}' not found`);
      if (!toStage) throw new NotFoundException(`Destination pipeline stage '${toStageId}' not found`);

      // 3. Verify lead's current stage matches fromStageId (CORR-CRM-03)
      const activeEntry = await tx.pipelineEntry.findFirst({
        where: { tenantId, leadId, exitedAt: null },
        orderBy: { enteredAt: 'desc' },
      });

      if (activeEntry) {
        if (activeEntry.stageId !== fromStageId) {
          throw new ConflictException(
            `Lead '${leadId}' is currently in stage '${activeEntry.stageId}', not requested source stage '${fromStageId}'`,
          );
        }
      } else {
        // If no active pipeline entry exists yet, verify lead's current stage label matches fromStage
        const currentLeadStage = (lead.stage || '').trim().toLowerCase();
        const fromStageName = fromStage.name.trim().toLowerCase();
        const fromStageDisplayName = fromStage.displayName.trim().toLowerCase();

        if (currentLeadStage && currentLeadStage !== fromStageName && currentLeadStage !== fromStageDisplayName) {
          throw new ConflictException(
            `Lead '${leadId}' is in stage '${lead.stage}', not requested source stage '${fromStage.displayName}'`,
          );
        }
      }

      // 4. Close any currently active stage entries for this lead to guarantee exactly one active entry
      await tx.pipelineEntry.updateMany({
        where: { tenantId, leadId, exitedAt: null },
        data: { exitedAt: new Date() },
      });

      // 5. Create new stage entry
      const entry = await tx.pipelineEntry.create({
        data: {
          tenantId,
          leadId,
          stageId: toStageId,
          enteredAt: new Date(),
          assignedTo,
          notes,
        },
        include: { stage: true },
      });

      // 6. Synchronize studioLead stage
      await tx.studioLead.updateMany({
        where: { id: leadId, tenantId },
        data: { stage: toStage.displayName, updatedAt: new Date() },
      });

      // 5. Record transactional audit outbox event
      if (this.auditOutbox) {
        await this.auditOutbox.recordInTransaction(tx, {
          tenantId,
          correlationId: randomUUID(),
          actorType: 'human',
          actorId: assignedTo || undefined,
          action: 'lead.moved_in_pipeline',
          resourceType: 'lead',
          resourceRef: leadId,
          eventType: 'lead.moved_in_pipeline',
          payload: {
            leadId,
            fromStageId,
            toStageId,
            fromStageName: fromStage.displayName,
            toStageName: toStage.displayName,
            notes: notes || null,
          },
        });
      }

      return entry;
    });
  }

  /**
   * Retrieve lead's complete stage transition history
   */
  async getLeadPipeline(tenantId: string, leadId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.pipelineEntry.findMany({
        where: { tenantId, leadId },
        orderBy: { enteredAt: 'asc' },
        include: { stage: true },
      });
    });
  }

  /**
   * Get complete pipeline overview with lead counts, win probabilities, and lead details.
   * Deterministically initializes default stages if the tenant has no stages defined.
   */
  async getPipelineOverview(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      let stages = await tx.pipelineStage.findMany({
        where: { tenantId, isActive: true },
        orderBy: { stageOrder: 'asc' },
      });

      // Deterministically seed default stages if none exist for this tenant
      if (stages.length === 0) {
        try {
          await this.seedDefaultStagesInTx(tenantId, tx);
        } catch (err: any) {
          if (err?.code !== 'P2002' && !err?.message?.includes('Unique constraint') && !err?.message?.includes('already exists')) {
            throw err;
          }
        }
        stages = await tx.pipelineStage.findMany({
          where: { tenantId, isActive: true },
          orderBy: { stageOrder: 'asc' },
        });
      }

      const entries = await tx.pipelineEntry.findMany({
        where: { tenantId, exitedAt: null },
        include: { stage: true },
        orderBy: { enteredAt: 'desc' },
      });

      // Fetch corresponding lead records to enrich entries
      const leadIds = Array.from(new Set(entries.map((e) => e.leadId)));
      const leads = leadIds.length > 0
        ? await tx.studioLead.findMany({
            where: { tenantId, id: { in: leadIds } },
            select: { id: true, name: true, email: true, phone: true, source: true, plan: true, stage: true },
          })
        : [];
      const leadMap = new Map(leads.map((l) => [l.id, l]));

      return stages.map((stage) => {
        const stageEntries = entries.filter((e) => e.stageId === stage.id);
        return {
          stage,
          count: stageEntries.length,
          winProbability: stage.winProbability,
          leads: stageEntries.map((e) => ({
            ...e,
            lead: leadMap.get(e.leadId) || null,
          })),
          totalValue: 0,
        };
      });
    });
  }

  /**
   * Get all active leads in a specific stage
   */
  async getLeadsInStage(tenantId: string, stageId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.pipelineEntry.findMany({
        where: { tenantId, stageId, exitedAt: null },
        include: { stage: true },
        orderBy: { enteredAt: 'asc' },
      });
    });
  }

  /**
   * Calculate conversion metrics and average time in stage
   */
  async getStageMetrics(tenantId: string, stageId: string, days = 30) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const entries = await tx.pipelineEntry.findMany({
        where: {
          tenantId,
          stageId,
          enteredAt: { gte: since },
        },
        include: { stage: true },
      });

      const exitedEntries = await tx.pipelineEntry.findMany({
        where: {
          tenantId,
          stageId,
          exitedAt: { gte: since },
        },
      });

      const avgTimeInStage =
        exitedEntries.length > 0
          ? exitedEntries.reduce(
              (sum, e) => sum + (e.exitedAt!.getTime() - e.enteredAt.getTime()),
              0,
            ) / exitedEntries.length
          : 0;

      return {
        stageId,
        totalEntered: entries.length,
        currentlyInStage: entries.filter((e) => !e.exitedAt).length,
        exited: exitedEntries.length,
        conversionRate: entries.length > 0 ? (exitedEntries.length / entries.length) * 100 : 0,
        avgTimeInStageHours: avgTimeInStage / (1000 * 60 * 60),
      };
    });
  }

  /**
   * Deterministically seed 7 canonical default stages for a tenant
   */
  async initializeDefaultPipeline(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const count = await tx.pipelineStage.count({ where: { tenantId } });
      if (count === 0) {
        try {
          await this.seedDefaultStagesInTx(tenantId, tx);
        } catch (err: any) {
          if (err?.code !== 'P2002' && !err?.message?.includes('Unique constraint') && !err?.message?.includes('already exists')) {
            throw err;
          }
        }
      }
      return tx.pipelineStage.findMany({
        where: { tenantId, isActive: true },
        orderBy: { stageOrder: 'asc' },
      });
    });
  }

  private async seedDefaultStagesInTx(tenantId: string, tx: Prisma.TransactionClient) {
    const defaultStages = [
      { name: 'new', displayName: 'New Lead', stageOrder: 1, winProbability: 10, color: '#3B82F6', isDefault: true },
      { name: 'contacted', displayName: 'Contacted', stageOrder: 2, winProbability: 25, color: '#8B5CF6' },
      { name: 'qualified', displayName: 'Qualified', stageOrder: 3, winProbability: 50, color: '#F59E0B' },
      { name: 'proposal', displayName: 'Proposal Sent', stageOrder: 4, winProbability: 70, color: '#F97316' },
      { name: 'negotiation', displayName: 'Negotiation', stageOrder: 5, winProbability: 80, color: '#EF4444' },
      { name: 'won', displayName: 'Won', stageOrder: 6, winProbability: 100, color: '#22C55E' },
      { name: 'lost', displayName: 'Lost', stageOrder: 7, winProbability: 0, color: '#6B7280' },
    ];

    for (let i = 0; i < defaultStages.length; i++) {
      const stage = defaultStages[i];
      try {
        await tx.pipelineStage.upsert({
          where: { tenantId_name: { tenantId, name: stage.name } },
          create: {
            tenantId,
            name: stage.name,
            displayName: stage.displayName,
            stageOrder: i + 1,
            winProbability: stage.winProbability,
            color: stage.color,
            isDefault: stage.isDefault ?? false,
            metadata: {},
          },
          update: {},
        });
      } catch (err: any) {
        if (err?.code === 'P2002' || err?.message?.includes('Unique constraint') || err?.message?.includes('already exists')) {
          continue;
        }
        throw err;
      }
    }
  }
}