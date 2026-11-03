import { Injectable, Optional } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { LeadScoringService } from '../crm/lead-scoring.service';
import { PipelineService } from '../crm/pipeline.service';
import { CrmCampaignService } from '../crm/crm-campaign.service';

@Injectable()
export class ScoreLeadTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly leadScoringService?: LeadScoringService,
  ) {
    super(erp);
  }

  async execute(context: ToolContext, args: { leadId: string }): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['leadId']);
    if (validationError) return this.error(validationError);

    if (!this.leadScoringService) {
      return this.error('LeadScoringService is unavailable');
    }

    try {
      const result = await this.leadScoringService.scoreLead(context.tenantId, args.leadId);
      return this.success(result);
    } catch (err) {
      return this.error(`Lead scoring failed: ${(err as Error).message}`);
    }
  }
}

@Injectable()
export class GetPipelineOverviewTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly pipelineService?: PipelineService,
  ) {
    super(erp);
  }

  async execute(context: ToolContext, args: Record<string, unknown> = {}): Promise<ToolResult> {
    if (!this.pipelineService) {
      return this.error('PipelineService is unavailable');
    }

    try {
      const overview = await this.pipelineService.getPipelineOverview(context.tenantId);
      return this.success({ stages: overview });
    } catch (err) {
      return this.error(`Failed to retrieve pipeline overview: ${(err as Error).message}`);
    }
  }
}

@Injectable()
export class MoveLeadInPipelineTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly pipelineService?: PipelineService,
  ) {
    super(erp);
  }

  async execute(
    context: ToolContext,
    args: { leadId: string; fromStageId: string; toStageId: string; notes?: string },
  ): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['leadId', 'fromStageId', 'toStageId']);
    if (validationError) return this.error(validationError);

    if (!this.pipelineService) {
      return this.error('PipelineService is unavailable');
    }

    try {
      const result = await this.pipelineService.moveLead({
        tenantId: context.tenantId,
        leadId: args.leadId,
        fromStageId: args.fromStageId,
        toStageId: args.toStageId,
        assignedTo: context.userId,
        notes: args.notes,
      });

      return this.success({
        message: 'Lead moved successfully',
        data: result,
      });
    } catch (err) {
      return this.error(`Moving lead in pipeline failed: ${(err as Error).message}`);
    }
  }
}

@Injectable()
export class CreatePipelineStageTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly pipelineService?: PipelineService,
  ) {
    super(erp);
  }

  async execute(
    context: ToolContext,
    args: {
      name: string;
      displayName: string;
      stageOrder: number;
      winProbability?: number;
      slaDays?: number;
      color?: string;
      isDefault?: boolean;
    },
  ): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['name', 'displayName', 'stageOrder']);
    if (validationError) return this.error(validationError);

    if (!this.pipelineService) {
      return this.error('PipelineService is unavailable');
    }

    try {
      const result = await this.pipelineService.createStage({
        tenantId: context.tenantId,
        name: args.name,
        displayName: args.displayName,
        stageOrder: args.stageOrder,
        winProbability: args.winProbability,
        slaDays: args.slaDays,
        color: args.color,
        isDefault: args.isDefault,
      });

      return this.success(result);
    } catch (err) {
      return this.error(`Creating pipeline stage failed: ${(err as Error).message}`);
    }
  }
}

@Injectable()
export class CreateCrmCampaignTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly crmCampaignService?: CrmCampaignService,
  ) {
    super(erp);
  }

  async execute(
    context: ToolContext,
    args: {
      name: string;
      description?: string;
      campaignType: 'nurture' | 'winback' | 'upsell' | 'cross_sell' | 'referral';
      targetSegment: Record<string, any>;
      triggerConfig: Record<string, any>;
      scheduleConfig?: Record<string, any>;
      goals?: Record<string, any>;
    },
  ): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['name', 'campaignType', 'targetSegment', 'triggerConfig']);
    if (validationError) return this.error(validationError);

    if (!this.crmCampaignService) {
      return this.error('CrmCampaignService is unavailable');
    }

    try {
      const result = await this.crmCampaignService.createCampaign({
        tenantId: context.tenantId,
        name: args.name,
        description: args.description,
        campaignType: args.campaignType,
        targetSegment: args.targetSegment,
        triggerConfig: args.triggerConfig,
        scheduleConfig: args.scheduleConfig,
        goals: args.goals,
        createdBy: context.userId,
      });

      return this.success(result);
    } catch (err) {
      return this.error(`Creating CRM campaign failed: ${(err as Error).message}`);
    }
  }
}

@Injectable()
export class EnrollInCampaignTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly crmCampaignService?: CrmCampaignService,
  ) {
    super(erp);
  }

  async execute(
    context: ToolContext,
    args: { campaignId: string; leadIds?: string[]; memberIds?: string[] },
  ): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['campaignId']);
    if (validationError) return this.error(validationError);

    if (!this.crmCampaignService) {
      return this.error('CrmCampaignService is unavailable');
    }

    try {
      const result = await this.crmCampaignService.enrollLeads({
        tenantId: context.tenantId,
        campaignId: args.campaignId,
        leadIds: args.leadIds,
        memberIds: args.memberIds,
      });

      return this.success({ enrolled: result });
    } catch (err) {
      return this.error(`Enrolling in CRM campaign failed: ${(err as Error).message}`);
    }
  }
}

@Injectable()
export class GetCampaignMetricsTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly crmCampaignService?: CrmCampaignService,
  ) {
    super(erp);
  }

  async execute(context: ToolContext, args: { campaignId: string }): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['campaignId']);
    if (validationError) return this.error(validationError);

    if (!this.crmCampaignService) {
      return this.error('CrmCampaignService is unavailable');
    }

    try {
      const result = await this.crmCampaignService.getCampaignMetrics(context.tenantId, args.campaignId);
      return this.success(result);
    } catch (err) {
      return this.error(`Retrieving CRM campaign metrics failed: ${(err as Error).message}`);
    }
  }
}