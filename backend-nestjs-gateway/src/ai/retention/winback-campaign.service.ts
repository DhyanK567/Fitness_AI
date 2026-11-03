import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface CreateWinbackCampaignInput {
  tenantId: string;
  name: string;
  description?: string;
  triggerType: 'churn_risk' | 'inactive' | 'expired_membership' | 'cancelled' | 'manual';
  targetCriteria: Record<string, any>;
  messageTemplate: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'push' | 'in_app';
  incentiveConfig?: Record<string, any>;
  createdBy: string;
}

export interface SendWinbackInput {
  tenantId: string;
  campaignId: string;
  memberIds: string[];
  idempotencyKey?: string;
}

@Injectable()
export class WinbackCampaignService {
  constructor(private readonly prisma: PrismaService) {}

  async createCampaign(input: CreateWinbackCampaignInput) {
    return this.prisma.winbackCampaign.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        description: input.description,
        triggerType: input.triggerType,
        targetCriteria: input.targetCriteria,
        messageTemplate: input.messageTemplate,
        channel: input.channel,
        incentiveConfig: input.incentiveConfig,
        createdBy: input.createdBy,
        status: 'draft',
      },
    });
  }

  async getCampaigns(tenantId: string, status?: string) {
    return this.prisma.winbackCampaign.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { recipients: true } },
      },
    });
  }

  async getCampaign(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.winbackCampaign.findFirst({
      where: { id: campaignId, tenantId },
      include: {
        recipients: true,
      },
    });
    if (!campaign) throw new NotFoundException('Winback campaign not found');
    return campaign;
  }

  async updateCampaign(tenantId: string, campaignId: string, data: Partial<CreateWinbackCampaignInput>) {
    return this.prisma.winbackCampaign.update({
      where: { id: campaignId, tenantId },
      data,
    });
  }

  async deleteCampaign(tenantId: string, campaignId: string) {
    const campaign = await this.getCampaign(tenantId, campaignId);
    if (campaign.status === 'active') {
      throw new ConflictException('Cannot delete active campaign. Pause it first.');
    }
    return this.prisma.winbackCampaign.delete({ where: { id: campaignId, tenantId } });
  }

  async startCampaign(tenantId: string, campaignId: string) {
    const campaign = await this.getCampaign(tenantId, campaignId);
    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new ConflictException(`Cannot start campaign with status: ${campaign.status}`);
    }

    return this.prisma.winbackCampaign.update({
      where: { id: campaignId, tenantId },
      data: { status: 'active', startedAt: new Date() },
    });
  }

  async pauseCampaign(tenantId: string, campaignId: string) {
    return this.prisma.winbackCampaign.update({
      where: { id: campaignId, tenantId },
      data: { status: 'paused' },
    });
  }

  async completeCampaign(tenantId: string, campaignId: string) {
    return this.prisma.winbackCampaign.update({
      where: { id: campaignId, tenantId },
      data: { status: 'completed', endedAt: new Date() },
    });
  }

  async addRecipients(input: SendWinbackInput) {
    const { tenantId, campaignId, memberIds, idempotencyKey } = input;

    const campaign = await this.getCampaign(tenantId, campaignId);
    if (campaign.status !== 'active') {
      throw new ConflictException('Can only add recipients to active campaigns');
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await this.prisma.winbackRecipient.findFirst({
        where: { tenantId, campaignId, memberId: { in: memberIds } },
      });
      if (existing) {
        throw new ConflictException('Some recipients already exist for this campaign');
      }
    }

    const recipients = memberIds.map(memberId => ({
      tenantId,
      campaignId,
      memberId,
      status: 'pending',
      metadata: { idempotencyKey },
    }));

    const result = await this.prisma.winbackRecipient.createMany({
      data: recipients,
      skipDuplicates: true,
    });

    // Update campaign sent count
    await this.prisma.winbackCampaign.update({
      where: { id: campaignId, tenantId },
      data: { sentCount: { increment: result.count } },
    });

    return result;
  }

  async addRecipientsFromCriteria(tenantId: string, campaignId: string) {
    const campaign = await this.getCampaign(tenantId, campaignId);
    const criteria = campaign.targetCriteria as Record<string, any>;

    // Build query based on criteria
    const where: Record<string, any> = { tenantId };

    if (criteria.riskLevel) {
      where.churnRisk = { riskLevel: { in: criteria.riskLevel } };
    }
    if (criteria.daysInactive) {
      where.lastVisitAt = { lte: new Date(Date.now() - criteria.daysInactive * 24 * 60 * 60 * 1000) };
    }
    if (criteria.engagementBelow) {
      where.engagementScore = { overallScore: { lt: criteria.engagementBelow } };
    }
    if (criteria.memberStatus) {
      where.status = { in: criteria.memberStatus };
    }

    // This would need member model - placeholder for now
    // const members = await this.prisma.member.findMany({ where, select: { id: true } });
    // return this.addRecipients({ tenantId, campaignId, memberIds: members.map(m => m.id) });

    return { count: 0, message: 'Criteria-based recipient selection needs member model integration' };
  }

  async markSent(tenantId: string, campaignId: string, memberId: string) {
    return this.prisma.winbackRecipient.update({
      where: { tenantId_campaignId_memberId: { tenantId, campaignId, memberId } },
      data: { status: 'sent', sentAt: new Date() },
    });
  }

  async markOpened(tenantId: string, campaignId: string, memberId: string) {
    await this.prisma.winbackRecipient.update({
      where: { tenantId_campaignId_memberId: { tenantId, campaignId, memberId } },
      data: { status: 'opened', openedAt: new Date() },
    });

    await this.prisma.winbackCampaign.update({
      where: { id: campaignId, tenantId },
      data: { openedCount: { increment: 1 } },
    });
  }

  async markClicked(tenantId: string, campaignId: string, memberId: string) {
    await this.prisma.winbackRecipient.update({
      where: { tenantId_campaignId_memberId: { tenantId, campaignId, memberId } },
      data: { status: 'clicked', clickedAt: new Date() },
    });

    await this.prisma.winbackCampaign.update({
      where: { id: campaignId, tenantId },
      data: { clickedCount: { increment: 1 } },
    });
  }

  async markConverted(tenantId: string, campaignId: string, memberId: string) {
    await this.prisma.winbackRecipient.update({
      where: { tenantId_campaignId_memberId: { tenantId, campaignId, memberId } },
      data: { status: 'converted', convertedAt: new Date() },
    });

    await this.prisma.winbackCampaign.update({
      where: { id: campaignId, tenantId },
      data: { convertedCount: { increment: 1 } },
    });
  }

  async markFailed(tenantId: string, campaignId: string, memberId: string, error: string) {
    await this.prisma.winbackRecipient.update({
      where: { tenantId_campaignId_memberId: { tenantId, campaignId, memberId } },
      data: { status: 'failed', errorMessage: error },
    });
  }

  async getRecipients(tenantId: string, campaignId: string, status?: string) {
    return this.prisma.winbackRecipient.findMany({
      where: { tenantId, campaignId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaignMetrics(tenantId: string, campaignId: string) {
    const campaign = await this.getCampaign(tenantId, campaignId);
    const recipients = await this.getRecipients(tenantId, campaignId);

    const total = recipients.length;
    const sent = recipients.filter(r => ['sent', 'delivered', 'opened', 'clicked', 'converted'].includes(r.status)).length;
    const delivered = recipients.filter(r => ['delivered', 'opened', 'clicked', 'converted'].includes(r.status)).length;
    const opened = recipients.filter(r => ['opened', 'clicked', 'converted'].includes(r.status)).length;
    const clicked = recipients.filter(r => ['clicked', 'converted'].includes(r.status)).length;
    const converted = recipients.filter(r => r.status === 'converted').length;
    const failed = recipients.filter(r => r.status === 'failed').length;

    return {
      campaign,
      totalRecipients: total,
      sent,
      delivered,
      opened,
      clicked,
      converted,
      failed,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
      conversionRate: total > 0 ? (converted / total) * 100 : 0,
    };
  }

  async getCampaignsByTrigger(tenantId: string, triggerType: string) {
    return this.prisma.winbackCampaign.findMany({
      where: { tenantId, triggerType },
      orderBy: { createdAt: 'desc' },
    });
  }
}