import { Module } from '@nestjs/common';
import { LeadScoringService } from './lead-scoring.service';
import { PipelineService } from './pipeline.service';
import { CrmCampaignService } from './crm-campaign.service';
import { PrismaService } from '../../common/prisma.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';

@Module({
  providers: [
    PrismaService,
    AuditOutboxService,
    LeadScoringService,
    PipelineService,
    CrmCampaignService,
  ],
  exports: [
    LeadScoringService,
    PipelineService,
    CrmCampaignService,
  ],
})
export class CrmModule {}