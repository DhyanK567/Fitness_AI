import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { ReferralService } from './referral.service';
import { UpsellService } from './upsell.service';
import { ExpansionService } from './expansion.service';
import { ExperimentService } from './experiment.service';
import { GetAcquisitionMetricsTool } from '../tools/growth-tools';
import { GetReferralProgramMetricsTool } from '../tools/growth-tools';
import { CreateReferralCampaignTool } from '../tools/growth-tools';
import { GetUpsellOpportunitiesTool } from '../tools/growth-tools';
import { CreateUpsellOfferTool } from '../tools/growth-tools';
import { GetLifetimeValueMetricsTool } from '../tools/growth-tools';
import { GetExpansionOpportunitiesTool } from '../tools/growth-tools';
import { TrackGrowthExperimentTool } from '../tools/growth-tools';
import { CreateGrowthExperimentTool } from '../tools/growth-tools';

@Module({
  providers: [
    PrismaService,
    AuditOutboxService,
    GrowthAnalyticsService,
    ReferralService,
    UpsellService,
    ExpansionService,
    ExperimentService,
    // Growth Agent Tools
    GetAcquisitionMetricsTool,
    GetReferralProgramMetricsTool,
    CreateReferralCampaignTool,
    GetUpsellOpportunitiesTool,
    CreateUpsellOfferTool,
    GetLifetimeValueMetricsTool,
    GetExpansionOpportunitiesTool,
    TrackGrowthExperimentTool,
    CreateGrowthExperimentTool,
  ],
  exports: [
    GrowthAnalyticsService,
    ReferralService,
    UpsellService,
    ExpansionService,
    ExperimentService,
    // Export all tools
    GetAcquisitionMetricsTool,
    GetReferralProgramMetricsTool,
    CreateReferralCampaignTool,
    GetUpsellOpportunitiesTool,
    CreateUpsellOfferTool,
    GetLifetimeValueMetricsTool,
    GetExpansionOpportunitiesTool,
    TrackGrowthExperimentTool,
    CreateGrowthExperimentTool,
  ],
})
export class GrowthModule {}