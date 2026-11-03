import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { MarketingAnalyticsService } from './marketing-analytics.service';
import { CampaignService } from './campaign.service';
import { AudienceService } from './audience.service';
import { ContentService } from './content.service';
import { AttributionService } from './attribution.service';
import { BrandService } from './brand.service';
import { ReviewManagementService } from './review-management.service';
import { CompetitorIntelligenceService } from './competitor-intelligence.service';
import { GetCampaignPerformanceTool } from '../tools/marketing-tools';
import { CreateMarketingCampaignTool } from '../tools/marketing-tools';
import { GetAudienceSegmentsTool } from '../tools/marketing-tools';
import { CreateAudienceSegmentTool } from '../tools/marketing-tools';
import { GetContentCalendarTool } from '../tools/marketing-tools';
import { ScheduleContentTool } from '../tools/marketing-tools';
import { GetLeadAttributionTool } from '../tools/marketing-tools';
import { GetBrandHealthMetricsTool } from '../tools/marketing-tools';
import { ManageReviewResponseTool } from '../tools/marketing-tools';
import { GetCompetitorIntelligenceTool } from '../tools/marketing-tools';
import { AdvertisingService } from './advertising.service';

@Module({
  providers: [
    PrismaService,
    AuditOutboxService,
    MarketingAnalyticsService,
    CampaignService,
    AudienceService,
    ContentService,
    AttributionService,
    BrandService,
    ReviewManagementService,
    CompetitorIntelligenceService,
    AdvertisingService,
    // Marketing Agent Tools
    GetCampaignPerformanceTool,
    CreateMarketingCampaignTool,
    GetAudienceSegmentsTool,
    CreateAudienceSegmentTool,
    GetContentCalendarTool,
    ScheduleContentTool,
    GetLeadAttributionTool,
    GetBrandHealthMetricsTool,
    ManageReviewResponseTool,
    GetCompetitorIntelligenceTool,
  ],
  exports: [
    MarketingAnalyticsService,
    CampaignService,
    AudienceService,
    ContentService,
    AttributionService,
    BrandService,
    ReviewManagementService,
    CompetitorIntelligenceService,
    AdvertisingService,
    // Export all tools
    GetCampaignPerformanceTool,
    CreateMarketingCampaignTool,
    GetAudienceSegmentsTool,
    CreateAudienceSegmentTool,
    GetContentCalendarTool,
    ScheduleContentTool,
    GetLeadAttributionTool,
    GetBrandHealthMetricsTool,
    ManageReviewResponseTool,
    GetCompetitorIntelligenceTool,
  ],
})
export class MarketingModule {}