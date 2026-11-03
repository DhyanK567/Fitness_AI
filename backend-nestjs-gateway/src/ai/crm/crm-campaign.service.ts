import {
  Injectable,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';

export interface CreateCampaignInput {
  tenantId: string;
  name: string;
  description?: string;
  campaignType: 'nurture' | 'winback' | 'upsell' | 'cross_sell' | 'referral';
  targetSegment: Record<string, any>;
  triggerConfig: Record<string, any>;
  scheduleConfig?: Record<string, any>;
  goals?: Record<string, any>;
  createdBy: string;
}

export interface EnrollLeadsInput {
  tenantId: string;
  campaignId: string;
  leadIds?: string[];
  memberIds?: string[];
  metadata?: Record<string, any>;
}

@Injectable()
export class CrmCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditOutbox?: AuditOutboxService,
  ) {}

  /**
   * Create a new CRM campaign draft within tenant isolation
   */
  async createCampaign(input: CreateCampaignInput) {
    return this.prisma.withTenant(input.tenantId, async (tx) => {
      const campaign = await tx.crmCampaign.create({
        data: {
          tenantId: input.tenantId,
          name: input.name,
          description: input.description,
          campaignType: input.campaignType,
          targetSegment: input.targetSegment,
          triggerConfig: input.triggerConfig,
          scheduleConfig: input.scheduleConfig,
          goals: input.goals ?? {},
          createdBy: input.createdBy,
          status: 'draft',
        },
      });

      if (this.auditOutbox) {
        await this.auditOutbox.recordInTransaction(tx, {
          tenantId: input.tenantId,
          correlationId: randomUUID(),
          actorType: 'human',
          actorId: input.createdBy,
          action: 'crm_campaign.created',
          resourceType: 'campaign',
          resourceRef: campaign.id,
          eventType: 'crm_campaign.created',
          payload: { campaignId: campaign.id, name: campaign.name, campaignType: campaign.campaignType },
        });
      }

      return campaign;
    });
  }

  /**
   * Retrieve campaigns filtered by tenant and optional status
   */
  async getCampaigns(tenantId: string, status?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.crmCampaign.findMany({
        where: { tenantId, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { enrollments: true } },
        },
      });
    });
  }

  /**
   * Retrieve a single campaign by ID with enrollments count
   */
  async getCampaign(tenantId: string, campaignId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaign = await tx.crmCampaign.findFirst({
        where: { id: campaignId, tenantId },
        include: {
          enrollments: true,
        },
      });
      if (!campaign) throw new NotFoundException(`Campaign '${campaignId}' not found`);
      return campaign;
    });
  }

  /**
   * Update an existing campaign
   */
  async updateCampaign(tenantId: string, campaignId: string, data: Partial<CreateCampaignInput>) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.crmCampaign.findFirst({
        where: { id: campaignId, tenantId },
      });
      if (!existing) throw new NotFoundException(`Campaign '${campaignId}' not found`);

      return tx.crmCampaign.update({
        where: { id: campaignId },
        data,
      });
    });
  }

  /**
   * Delete an existing campaign (forbidden if currently active)
   */
  async deleteCampaign(tenantId: string, campaignId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaign = await tx.crmCampaign.findFirst({
        where: { id: campaignId, tenantId },
      });
      if (!campaign) throw new NotFoundException(`Campaign '${campaignId}' not found`);

      if (campaign.status === 'active') {
        throw new ConflictException('Cannot delete active campaign. Pause it first.');
      }
      return tx.crmCampaign.delete({ where: { id: campaignId } });
    });
  }

  /**
   * Activate a draft or paused campaign
   */
  async startCampaign(tenantId: string, campaignId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaign = await tx.crmCampaign.findFirst({
        where: { id: campaignId, tenantId },
      });
      if (!campaign) throw new NotFoundException(`Campaign '${campaignId}' not found`);

      if (campaign.status !== 'draft' && campaign.status !== 'paused') {
        throw new ConflictException(`Cannot start campaign with status: ${campaign.status}`);
      }

      return tx.crmCampaign.update({
        where: { id: campaignId },
        data: { status: 'active', startedAt: new Date() },
      });
    });
  }

  /**
   * Pause an active campaign
   */
  async pauseCampaign(tenantId: string, campaignId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaign = await tx.crmCampaign.findFirst({
        where: { id: campaignId, tenantId },
      });
      if (!campaign) throw new NotFoundException(`Campaign '${campaignId}' not found`);

      return tx.crmCampaign.update({
        where: { id: campaignId },
        data: { status: 'paused' },
      });
    });
  }

  /**
   * Mark campaign completed
   */
  async completeCampaign(tenantId: string, campaignId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaign = await tx.crmCampaign.findFirst({
        where: { id: campaignId, tenantId },
      });
      if (!campaign) throw new NotFoundException(`Campaign '${campaignId}' not found`);

      return tx.crmCampaign.update({
        where: { id: campaignId },
        data: { status: 'completed', endedAt: new Date() },
      });
    });
  }

  /**
   * Enroll leads or members into an active campaign with duplicate suppression
   */
  async enrollLeads(input: EnrollLeadsInput) {
    const { tenantId, campaignId, leadIds = [], memberIds = [], metadata = {} } = input;

    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaign = await tx.crmCampaign.findFirst({
        where: { id: campaignId, tenantId },
      });
      if (!campaign) throw new NotFoundException(`Campaign '${campaignId}' not found`);

      if (campaign.status !== 'active') {
        throw new ConflictException('Can only enroll in active campaigns');
      }

      const allIds = Array.from(new Set([...leadIds, ...memberIds]));
      if (allIds.length === 0) {
        throw new ConflictException('At least one lead or member ID required');
      }

      // 1. Validate that all supplied leadIds belong to this tenant (CORR-CRM-04)
      if (leadIds.length > 0) {
        const uniqueLeadIds = Array.from(new Set(leadIds));
        const foundLeads = await tx.studioLead.findMany({
          where: { tenantId, id: { in: uniqueLeadIds } },
          select: { id: true },
        });
        const foundLeadIds = new Set(foundLeads.map((l) => l.id));
        const missingLeadIds = uniqueLeadIds.filter((id) => !foundLeadIds.has(id));
        if (missingLeadIds.length > 0) {
          throw new NotFoundException(
            `Lead(s) not found for tenant: ${missingLeadIds.join(', ')}`,
          );
        }
      }

      // 2. Validate that all supplied memberIds belong to this tenant (CORR-CRM-04)
      if (memberIds.length > 0) {
        const uniqueMemberIds = Array.from(new Set(memberIds));
        const foundMembers = await tx.studioMember.findMany({
          where: { tenantId, id: { in: uniqueMemberIds } },
          select: { id: true },
        });
        const foundMemberIds = new Set(foundMembers.map((m) => m.id));
        const missingMemberIds = uniqueMemberIds.filter((id) => !foundMemberIds.has(id));
        if (missingMemberIds.length > 0) {
          throw new NotFoundException(
            `Member(s) not found for tenant: ${missingMemberIds.join(', ')}`,
          );
        }
      }

      const enrollments = allIds.map((id) => ({
        tenantId,
        campaignId,
        leadId: leadIds.includes(id) ? id : null,
        memberId: memberIds.includes(id) ? id : null,
        status: 'enrolled',
        enrolledAt: new Date(),
        metadata,
      }));

      const result = await tx.campaignEnrollment.createMany({
        data: enrollments,
        skipDuplicates: true,
      });

      if (this.auditOutbox) {
        await this.auditOutbox.recordInTransaction(tx, {
          tenantId,
          correlationId: randomUUID(),
          actorType: 'system',
          actorId: undefined,
          action: 'crm_campaign.enrolled',
          resourceType: 'campaign',
          resourceRef: campaignId,
          eventType: 'crm_campaign.enrolled',
          payload: { campaignId, count: result.count, leadIds, memberIds },
        });
      }

      return result;
    });
  }

  /**
   * Unenroll a lead or member from campaign
   */
  async unenroll(tenantId: string, campaignId: string, leadId?: string, memberId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.campaignEnrollment.updateMany({
        where: {
          tenantId,
          campaignId,
          ...(leadId ? { leadId } : {}),
          ...(memberId ? { memberId } : {}),
        },
        data: { status: 'unsubscribed' },
      });
    });
  }

  /**
   * Mark lead or member converted within campaign
   */
  async markConverted(tenantId: string, campaignId: string, leadId?: string, memberId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.campaignEnrollment.updateMany({
        where: {
          tenantId,
          campaignId,
          ...(leadId ? { leadId } : {}),
          ...(memberId ? { memberId } : {}),
        },
        data: { status: 'converted', convertedAt: new Date() },
      });
    });
  }

  /**
   * Retrieve campaign enrollments
   */
  async getEnrollments(tenantId: string, campaignId: string, status?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.campaignEnrollment.findMany({
        where: { tenantId, campaignId, ...(status ? { status } : {}) },
        orderBy: { enrolledAt: 'desc' },
      });
    });
  }

  /**
   * Calculate conversion metrics and enrollment stats for campaign
   */
  async getCampaignMetrics(tenantId: string, campaignId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaign = await tx.crmCampaign.findFirst({
        where: { id: campaignId, tenantId },
      });
      if (!campaign) throw new NotFoundException(`Campaign '${campaignId}' not found`);

      const enrollments = await tx.campaignEnrollment.findMany({
        where: { tenantId, campaignId },
      });

      const total = enrollments.length;
      const converted = enrollments.filter((e) => e.status === 'converted').length;
      const active = enrollments.filter((e) => e.status === 'enrolled' || e.status === 'active').length;
      const unsubscribed = enrollments.filter((e) => e.status === 'unsubscribed').length;

      return {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          campaignType: campaign.campaignType,
          status: campaign.status,
        },
        totalEnrolled: total,
        converted,
        active,
        unsubscribed,
        conversionRate: total > 0 ? Math.round((converted / total) * 1000) / 10 : 0,
        unsubscribeRate: total > 0 ? Math.round((unsubscribed / total) * 1000) / 10 : 0,
      };
    });
  }
}