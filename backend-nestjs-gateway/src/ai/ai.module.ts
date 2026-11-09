import { Module, Global } from '@nestjs/common';
import { ConversationOrchestrator } from './orchestrator/conversation-loop';
import { ConfirmationStateMachine } from './orchestrator/confirmation-state-machine';
import { ScopeRules } from './guardrails/scope-rules';
import { PiiRedaction } from './guardrails/pii-redaction';
import { LlmGatewayService } from './gateway/llm-gateway.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PrismaService } from '../common/prisma.service';
import { ErpnextService } from '../erpnext/erpnext.service';
import { ConversationService } from './conversation.service';
import { PendingActionService } from './pending-action.service';
import { LlmObservabilityService } from './observability/llm-observability.service';
import { CreateMemberTool } from './tools/create-member.tool';
import { ExtractCreateMemberFieldsTool } from './tools/extract-create-member-fields.tool';
import { CreateBookingTool } from './tools/create-booking.tool';
import { CancelBookingTool } from './tools/cancel-booking.tool';
import { ExpiringMembershipsTool } from './tools/expiring-memberships.tool';
import { LowAttendanceClassesTool } from './tools/low-attendance-classes.tool';
import { FaqKnowledgeService } from './knowledge/faq-knowledge.service';
import { GetMemberCountTool } from './tools/get-member-count.tool';
import { GetDashboardSummaryTool } from './tools/get-dashboard-summary.tool';
import { GetPublicEventListTool } from './tools/get-public-event-list.tool';
import { GetPublicClassScheduleTool } from './tools/get-public-class-schedule.tool';
import { GetActivePlansPublicTool } from './tools/get-active-plans-public.tool';
import { CaptureLeadTool } from './tools/capture-lead.tool';
import { GetEligibleScheduleTool } from './tools/get-eligible-schedule.tool';
import { GetAvailabilityTool } from './tools/get-availability.tool';
import { GetMemberPlanEntitlementTool } from './tools/get-member-plan-entitlement.tool';
import { GetMyBookingsTool } from './tools/get-my-bookings.tool';
import { GetMemberGoalAndLevelTool } from './tools/get-member-goal-and-level.tool';
import { GetMemberAttendanceSummaryTool } from './tools/get-member-attendance-summary.tool';
import { GetEligibleSessionsForRecommendationTool } from './tools/get-eligible-sessions-for-recommendation.tool';
import { ClassifyFeedbackTool } from './tools/classify-feedback.tool';
import { StoreFeedbackClassificationTool } from './tools/store-feedback-classification.tool';
import { GetFeedbackSummaryTool } from './tools/get-feedback-summary.tool';
import { GetRevenueSummaryTool } from './tools/get-revenue-summary.tool';
import { GetRevenueTrendsTool } from './tools/get-revenue-trends.tool';
import { ScoreLeadTool } from './tools/crm-tools';
import { GetPipelineOverviewTool } from './tools/crm-tools';
import { MoveLeadInPipelineTool } from './tools/crm-tools';
import { CreatePipelineStageTool } from './tools/crm-tools';
import { CreateCrmCampaignTool } from './tools/crm-tools';
import { EnrollInCampaignTool } from './tools/crm-tools';
import { GetCampaignMetricsTool } from './tools/crm-tools';
import { CalculateChurnRiskTool } from './tools/retention-tools';
import { GetHighRiskMembersTool } from './tools/retention-tools';
import { CalculateEngagementScoreTool } from './tools/retention-tools';
import { GetLowEngagementMembersTool } from './tools/retention-tools';
import { CreateWinbackCampaignTool } from './tools/retention-tools';
import { SendWinbackCampaignTool } from './tools/retention-tools';
import { CreateRetentionActionTool } from './tools/retention-tools';
import { GetRetentionActionsTool } from './tools/retention-tools';
import { GetRetentionMetricsTool } from './tools/retention-tools';

// Operations Agent Tools
import { GetClassCapacityUtilizationTool } from './tools/operations-tools';
import { GetStaffScheduleTool } from './tools/operations-tools';
import { CreateStaffScheduleTool } from './tools/operations-tools';
import { GetEquipmentStatusTool } from './tools/operations-tools';
import { ScheduleEquipmentMaintenanceTool } from './tools/operations-tools';
import { GetFacilityUtilizationTool } from './tools/operations-tools';
import { ManageWaitlistTool } from './tools/operations-tools';
import { GetOperationalAlertsTool } from './tools/operations-tools';
import { AcknowledgeOperationalAlertTool } from './tools/operations-tools';
import { GetClassCancellationImpactTool } from './tools/operations-tools';
import { OptimizeClassScheduleTool } from './tools/operations-tools';

// Growth Agent Tools
import { GetAcquisitionMetricsTool } from './tools/growth-tools';
import { GetReferralProgramMetricsTool } from './tools/growth-tools';
import { CreateReferralCampaignTool } from './tools/growth-tools';
import { GetUpsellOpportunitiesTool } from './tools/growth-tools';
import { CreateUpsellOfferTool } from './tools/growth-tools';
import { GetLifetimeValueMetricsTool } from './tools/growth-tools';
import { GetExpansionOpportunitiesTool } from './tools/growth-tools';
import { TrackGrowthExperimentTool } from './tools/growth-tools';
import { CreateGrowthExperimentTool } from './tools/growth-tools';

// Marketing Agent Tools
import { GetCampaignPerformanceTool } from './tools/marketing-tools';
import { CreateMarketingCampaignTool } from './tools/marketing-tools';
import { GetAudienceSegmentsTool } from './tools/marketing-tools';
import { CreateAudienceSegmentTool } from './tools/marketing-tools';
import { GetContentCalendarTool } from './tools/marketing-tools';
import { ScheduleContentTool } from './tools/marketing-tools';
import { GetLeadAttributionTool } from './tools/marketing-tools';
import { GetBrandHealthMetricsTool } from './tools/marketing-tools';
import { ManageReviewResponseTool } from './tools/marketing-tools';
import { GetCompetitorIntelligenceTool } from './tools/marketing-tools';
import { GetRoasMetricsTool } from './tools/marketing-tools';
import { GetChannelRecommendationsTool } from './tools/marketing-tools';

// Session Summary Agent Tools
import { SessionDebriefTool } from './tools/session-summary-tools';
import { TrainerNotesTool } from './tools/session-summary-tools';
import { MemberMilestonesTool } from './tools/session-summary-tools';
import { SessionSummaryService } from './operations/session-summary.service';

import { AiController } from './ai.controller';
import { PublicEnquiryAiController } from './public-enquiry-ai.controller';
import { LeadsModule } from '../modules/leads/leads.module';
import { ToolRegistry } from './tools/tool-registry';
import { RagModule } from './rag/rag.module';
import { CrmModule } from './crm/crm.module';
import { RetentionModule } from './retention/retention.module';
import { OperationsModule } from './operations/operations.module';
import { GrowthModule } from './growth/growth.module';
import { MarketingModule } from './marketing/marketing.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AgentRegistryService } from './agents/agent-registry.service';
import { RecommendationsModule } from '../modules/recommendations/recommendations.module';
import { FeedbackModule } from '../modules/feedback/feedback.module';

@Global()
@Module({
  imports: [RagModule, CrmModule, RetentionModule, OperationsModule, GrowthModule, MarketingModule, AnalyticsModule, LeadsModule, RecommendationsModule, FeedbackModule],
  controllers: [AiController, PublicEnquiryAiController],
  providers: [
    // Core database & infrastructure
    PrismaService,
    AuditOutboxService,

    // Canonical Tool Registry
    ToolRegistry,

    // Core orchestrator
    ConversationOrchestrator,
    ConfirmationStateMachine,

    // Services
    ConversationService,
    PendingActionService,
    LlmObservabilityService,
    FaqKnowledgeService,
    AgentRegistryService,
    SessionSummaryService,

    // Guardrails
    ScopeRules,
    PiiRedaction,

    // LLM Gateway
    LlmGatewayService,

    // Read-only tools (Phase 1)
    ExpiringMembershipsTool,
    LowAttendanceClassesTool,
    GetMemberCountTool,
    GetDashboardSummaryTool,
    GetPublicEventListTool,
    GetPublicClassScheduleTool,
    GetActivePlansPublicTool,
    CaptureLeadTool,
    GetEligibleScheduleTool,
    GetAvailabilityTool,
    GetMemberPlanEntitlementTool,
    GetMyBookingsTool,
    GetMemberGoalAndLevelTool,
    GetMemberAttendanceSummaryTool,
    GetEligibleSessionsForRecommendationTool,
    ClassifyFeedbackTool,
    StoreFeedbackClassificationTool,
    GetFeedbackSummaryTool,
    // Revenue intelligence tools
    GetRevenueSummaryTool,
    GetRevenueTrendsTool,

    // Write tools (Phase 2 ready)
    CreateMemberTool,
    ExtractCreateMemberFieldsTool,
    CreateBookingTool,
    CancelBookingTool,

    // CRM Agent tools (Phase 3)
    ScoreLeadTool,
    GetPipelineOverviewTool,
    MoveLeadInPipelineTool,
    CreatePipelineStageTool,
    CreateCrmCampaignTool,
    EnrollInCampaignTool,
    GetCampaignMetricsTool,

    // Retention Agent tools (Phase 4)
    CalculateChurnRiskTool,
    GetHighRiskMembersTool,
    CalculateEngagementScoreTool,
    GetLowEngagementMembersTool,
    CreateWinbackCampaignTool,
    SendWinbackCampaignTool,
    CreateRetentionActionTool,
    GetRetentionActionsTool,
    GetRetentionMetricsTool,

    // Operations Agent tools (Phase 5)
    GetClassCapacityUtilizationTool,
    GetStaffScheduleTool,
    CreateStaffScheduleTool,
    GetEquipmentStatusTool,
    ScheduleEquipmentMaintenanceTool,
    GetFacilityUtilizationTool,
    ManageWaitlistTool,
    GetOperationalAlertsTool,
    AcknowledgeOperationalAlertTool,
    GetClassCancellationImpactTool,
    OptimizeClassScheduleTool,

    // Growth Agent tools (Phase 5)
    GetAcquisitionMetricsTool,
    GetReferralProgramMetricsTool,
    CreateReferralCampaignTool,
    GetUpsellOpportunitiesTool,
    CreateUpsellOfferTool,
    GetLifetimeValueMetricsTool,
    GetExpansionOpportunitiesTool,
    TrackGrowthExperimentTool,
    CreateGrowthExperimentTool,

    // Marketing Agent tools (Phase 5)
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
    GetRoasMetricsTool,
    GetChannelRecommendationsTool,

    // Session Summary Agent tools (Phase 3)
    SessionDebriefTool,
    TrainerNotesTool,
    MemberMilestonesTool,
  ],
  exports: [
    ToolRegistry,
    ConversationOrchestrator,
    ConfirmationStateMachine,
    ScopeRules,
    PiiRedaction,
    LlmGatewayService,
    ConversationService,
    PendingActionService,
    LlmObservabilityService,
    FaqKnowledgeService,
    AgentRegistryService,
    // Export all tools
    ExpiringMembershipsTool,
    LowAttendanceClassesTool,
    GetMemberCountTool,
    GetDashboardSummaryTool,
    GetPublicClassScheduleTool,
    GetActivePlansPublicTool,
    CaptureLeadTool,
    GetEligibleScheduleTool,
    GetAvailabilityTool,
    GetMemberPlanEntitlementTool,
    GetMyBookingsTool,
    GetMemberGoalAndLevelTool,
    GetMemberAttendanceSummaryTool,
    GetEligibleSessionsForRecommendationTool,
    ClassifyFeedbackTool,
    StoreFeedbackClassificationTool,
    GetFeedbackSummaryTool,
    GetRevenueSummaryTool,
    GetRevenueTrendsTool,
    CreateMemberTool,
    CreateBookingTool,
    CancelBookingTool,
    // Export CRM tools
    ScoreLeadTool,
    GetPipelineOverviewTool,
    MoveLeadInPipelineTool,
    CreatePipelineStageTool,
    CreateCrmCampaignTool,
    EnrollInCampaignTool,
    GetCampaignMetricsTool,
    // Export Retention tools
    CalculateChurnRiskTool,
    GetHighRiskMembersTool,
    CalculateEngagementScoreTool,
    GetLowEngagementMembersTool,
    CreateWinbackCampaignTool,
    SendWinbackCampaignTool,
    CreateRetentionActionTool,
    GetRetentionActionsTool,
    GetRetentionMetricsTool,
    // Export Operations tools
    GetClassCapacityUtilizationTool,
    GetStaffScheduleTool,
    CreateStaffScheduleTool,
    GetEquipmentStatusTool,
    ScheduleEquipmentMaintenanceTool,
    GetFacilityUtilizationTool,
    ManageWaitlistTool,
    GetOperationalAlertsTool,
    AcknowledgeOperationalAlertTool,
    GetClassCancellationImpactTool,
    OptimizeClassScheduleTool,
    // Export Growth tools
    GetAcquisitionMetricsTool,
    GetReferralProgramMetricsTool,
    CreateReferralCampaignTool,
    GetUpsellOpportunitiesTool,
    CreateUpsellOfferTool,
    GetLifetimeValueMetricsTool,
    GetExpansionOpportunitiesTool,
    TrackGrowthExperimentTool,
    CreateGrowthExperimentTool,
    // Export Marketing tools
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
    GetRoasMetricsTool,
    GetChannelRecommendationsTool,
    // Export Session Summary tools
    SessionDebriefTool,
    TrainerNotesTool,
    MemberMilestonesTool,
    SessionSummaryService,
  ],
})
export class AiModule {}
