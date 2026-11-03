import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface CreateRetentionActionInput {
  tenantId: string;
  memberId: string;
  actionType: 'outreach' | 'incentive_offered' | 'session_booked' | 'plan_changed' | 'meeting_scheduled' | 'feedback_requested';
  description: string;
  triggeredBy: 'churn_risk' | 'engagement_drop' | 'manual' | 'campaign' | 'automation';
  assignedTo?: string;
  dueAt?: Date;
  metadata?: Record<string, any>;
}

export interface UpdateRetentionActionInput {
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assignedTo?: string;
  dueAt?: Date;
  result?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class RetentionActionService {
  constructor(private readonly prisma: PrismaService) {}

  async createAction(input: CreateRetentionActionInput) {
    return this.prisma.retentionAction.create({
      data: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        actionType: input.actionType,
        description: input.description,
        triggeredBy: input.triggeredBy,
        assignedTo: input.assignedTo,
        dueAt: input.dueAt,
        metadata: input.metadata ?? {},
        status: 'pending',
      },
    });
  }

  async getActions(tenantId: string, filters?: { memberId?: string; status?: string; actionType?: string; assignedTo?: string }) {
    const where: Record<string, any> = { tenantId };
    if (filters?.memberId) where.memberId = filters.memberId;
    if (filters?.status) where.status = filters.status;
    if (filters?.actionType) where.actionType = filters.actionType;
    if (filters?.assignedTo) where.assignedTo = filters.assignedTo;

    return this.prisma.retentionAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAction(tenantId: string, actionId: string) {
    const action = await this.prisma.retentionAction.findFirst({
      where: { id: actionId, tenantId },
    });
    if (!action) throw new NotFoundException('Retention action not found');
    return action;
  }

  async updateAction(tenantId: string, actionId: string, input: UpdateRetentionActionInput) {
    const action = await this.getAction(tenantId, actionId);

    const data: Record<string, any> = { ...input };
    if (input.status === 'completed' && action.status !== 'completed') {
      data.completedAt = new Date();
    }

    return this.prisma.retentionAction.update({
      where: { id: actionId, tenantId },
      data,
    });
  }

  async deleteAction(tenantId: string, actionId: string) {
    const action = await this.getAction(tenantId, actionId);
    if (action.status === 'completed') {
      throw new ConflictException('Cannot delete completed action');
    }
    return this.prisma.retentionAction.delete({ where: { id: actionId, tenantId } });
  }

  async completeAction(tenantId: string, actionId: string, result: string) {
    return this.updateAction(tenantId, actionId, { status: 'completed', result });
  }

  async cancelAction(tenantId: string, actionId: string) {
    return this.updateAction(tenantId, actionId, { status: 'cancelled' });
  }

  async getOverdueActions(tenantId: string) {
    return this.prisma.retentionAction.findMany({
      where: {
        tenantId,
        status: { in: ['pending', 'in_progress'] },
        dueAt: { lt: new Date() },
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  async getActionsByMember(tenantId: string, memberId: string) {
    return this.prisma.retentionAction.findMany({
      where: { tenantId, memberId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getActionsByAssignee(tenantId: string, assignedTo: string, status?: string) {
    return this.prisma.retentionAction.findMany({
      where: { tenantId, assignedTo, ...(status ? { status } : {}) },
      orderBy: { dueAt: 'asc' },
    });
  }

  async getActionMetrics(tenantId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const actions = await this.prisma.retentionAction.findMany({
      where: { tenantId, createdAt: { gte: since } },
    });

    const total = actions.length;
    const completed = actions.filter(a => a.status === 'completed').length;
    const pending = actions.filter(a => a.status === 'pending').length;
    const inProgress = actions.filter(a => a.status === 'in_progress').length;
    const cancelled = actions.filter(a => a.status === 'cancelled').length;
    const overdue = actions.filter(a => a.dueAt && a.dueAt < new Date() && !['completed', 'cancelled'].includes(a.status)).length;

    const byType = actions.reduce((acc, a) => {
      acc[a.actionType] = (acc[a.actionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byTrigger = actions.reduce((acc, a) => {
      acc[a.triggeredBy] = (acc[a.triggeredBy] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      completed,
      pending,
      inProgress,
      cancelled,
      overdue,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      byType,
      byTrigger,
    };
  }

  async createAutomatedActions(tenantId: string, triggers: Array<{
    memberId: string;
    actionType: 'outreach' | 'incentive_offered' | 'session_booked' | 'plan_changed' | 'meeting_scheduled' | 'feedback_requested';
    description: string;
    triggeredBy: 'churn_risk' | 'engagement_drop' | 'manual' | 'campaign' | 'automation';
    dueAt?: Date;
  }>) {
    const actions = triggers.map(t => ({
      tenantId,
      memberId: t.memberId,
      actionType: t.actionType,
      description: t.description,
      triggeredBy: t.triggeredBy,
      dueAt: t.dueAt,
      status: 'pending',
    }));

    return this.prisma.retentionAction.createMany({ data: actions });
  }

  async bulkUpdateStatus(tenantId: string, actionIds: string[], status: 'pending' | 'in_progress' | 'completed' | 'cancelled') {
    return this.prisma.retentionAction.updateMany({
      where: { tenantId, id: { in: actionIds } },
      data: { status, ...(status === 'completed' ? { completedAt: new Date() } : {}) },
    });
  }
}