import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ToolDefinition, toolByName, TOOLS, PROHIBITED_TOOLS } from '@wsos/ai-tool-definitions';
import { ERP_METHODS } from '@wsos/erp-methods';
import { AiTool, BaseTool, ToolContext, ToolResult } from './base-tool';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { canUseTool, TOOL_PERMISSIONS, validateToolArgs } from '../guardrails/scope-rules';
import { PiiRedaction } from '../guardrails/pii-redaction';
import { Prisma } from '@prisma/client';

// Core tools
import { CreateMemberTool } from './create-member.tool';
import { ExtractCreateMemberFieldsTool } from './extract-create-member-fields.tool';
import { CreateBookingTool } from './create-booking.tool';
import { CancelBookingTool } from './cancel-booking.tool';
import { ExpiringMembershipsTool } from './expiring-memberships.tool';
import { LowAttendanceClassesTool } from './low-attendance-classes.tool';
import { GetMemberCountTool } from './get-member-count.tool';
import { GetDashboardSummaryTool } from './get-dashboard-summary.tool';
import { GetPublicEventListTool } from './get-public-event-list.tool';
import { GetPublicClassScheduleTool } from './get-public-class-schedule.tool';
import { GetActivePlansPublicTool } from './get-active-plans-public.tool';
import { CaptureLeadTool } from './capture-lead.tool';
import { GetEligibleScheduleTool } from './get-eligible-schedule.tool';
import { GetAvailabilityTool } from './get-availability.tool';
import { GetMemberPlanEntitlementTool } from './get-member-plan-entitlement.tool';
import { GetMyBookingsTool } from './get-my-bookings.tool';
import { GetMemberGoalAndLevelTool } from './get-member-goal-and-level.tool';
import { GetMemberAttendanceSummaryTool } from './get-member-attendance-summary.tool';
import { GetEligibleSessionsForRecommendationTool } from './get-eligible-sessions-for-recommendation.tool';
import { ClassifyFeedbackTool } from './classify-feedback.tool';
import { StoreFeedbackClassificationTool } from './store-feedback-classification.tool';
import { GetFeedbackSummaryTool } from './get-feedback-summary.tool';
import { GetRevenueSummaryTool } from './get-revenue-summary.tool';
import { GetRevenueTrendsTool } from './get-revenue-trends.tool';

// Domain agent tools
import {
  ScoreLeadTool,
  GetPipelineOverviewTool,
  MoveLeadInPipelineTool,
  CreatePipelineStageTool,
  CreateCrmCampaignTool,
  EnrollInCampaignTool,
  GetCampaignMetricsTool,
} from './crm-tools';
import {
  CalculateChurnRiskTool,
  GetHighRiskMembersTool,
  CalculateEngagementScoreTool,
  GetLowEngagementMembersTool,
  CreateWinbackCampaignTool,
  SendWinbackCampaignTool,
  CreateRetentionActionTool,
  GetRetentionActionsTool,
  GetRetentionMetricsTool,
} from './retention-tools';
import {
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
} from './operations-tools';
import {
  GetAcquisitionMetricsTool,
  GetReferralProgramMetricsTool,
  CreateReferralCampaignTool,
  GetUpsellOpportunitiesTool,
  CreateUpsellOfferTool,
  GetLifetimeValueMetricsTool,
  GetExpansionOpportunitiesTool,
  TrackGrowthExperimentTool,
  CreateGrowthExperimentTool,
} from './growth-tools';
import {
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
} from './marketing-tools';
import {
  SearchKnowledgeBaseTool,
  IngestDocumentTool,
  IngestFAQTool,
  ListKnowledgeBasesTool,
  DeleteDocumentTool,
  GetDocumentStatusTool,
} from './rag-tools';
import {
  SessionDebriefTool,
  TrainerNotesTool,
  MemberMilestonesTool,
} from './session-summary-tools';

export interface ToolExecutionOptions {
  isConfirmedPendingAction?: boolean;
  idempotencyKey?: string;
  skipAudit?: boolean;
}

/**
 * Fallback bridge tool for ERP methods that do not have a specialized class implementation.
 * Wraps ErpnextService.call inside the canonical BaseTool contract.
 */
export class ErpBridgeTool extends BaseTool {
  constructor(
    erp: ErpnextService,
    private readonly method: string,
    public readonly name: string,
  ) {
    super(erp);
  }

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    return this.callErp(context, this.method, args);
  }
}

/**
 * Unified AI Tool Execution Registry
 *
 * Serves as the single canonical tool dispatch and execution engine for all AI assistants:
 * 1. Explicit tool lookup with safe failure for unknown tools.
 * 2. Strict server-side authorization and tenant context enforcement.
 * 3. Prohibited tools rejection (Phase 1 guardrail).
 * 4. Side-effecting / write tool confirmation enforcement (must come through confirmed pending-action context).
 * 5. Input schema validation via Zod with detailed errors.
 * 6. Idempotency preservation preventing duplicate execution on retries.
 * 7. Durable, privacy-safe audit logging without credential/PII leakage.
 * 8. Structured, contract-compatible success and failure responses.
 */
@Injectable()
export class ToolRegistry implements OnModuleInit {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools = new Map<string, AiTool>();
  private readonly definitions = new Map<string, ToolDefinition>();
  private readonly idempotencyCache = new Map<string, { result: ToolResult; expiresAt: number }>();

  // Canonical mapping of tool names to their implementation classes
  private readonly toolClassMap: Record<string, any> = {
    getExpiringMemberships: ExpiringMembershipsTool,
    getLowAttendanceClasses: LowAttendanceClassesTool,
    createMember: CreateMemberTool,
    extractCreateMemberFields: ExtractCreateMemberFieldsTool,
    createBooking: CreateBookingTool,
    cancelBooking: CancelBookingTool,
    getMemberCount: GetMemberCountTool,
    getDashboardSummary: GetDashboardSummaryTool,
    getPublicEventList: GetPublicEventListTool,
    getPublicClassSchedule: GetPublicClassScheduleTool,
    getPublicClassScheduleStaff: GetPublicClassScheduleTool,
    getActivePlansPublic: GetActivePlansPublicTool,
    captureLead: CaptureLeadTool,
    getEligibleSchedule: GetEligibleScheduleTool,
    getAvailability: GetAvailabilityTool,
    getMemberPlanEntitlement: GetMemberPlanEntitlementTool,
    getMyBookings: GetMyBookingsTool,
    getMemberGoalAndLevel: GetMemberGoalAndLevelTool,
    getMemberAttendanceSummary: GetMemberAttendanceSummaryTool,
    getEligibleSessionsForRecommendation: GetEligibleSessionsForRecommendationTool,
    classifyFeedback: ClassifyFeedbackTool,
    storeFeedbackClassification: StoreFeedbackClassificationTool,
    getFeedbackSummary: GetFeedbackSummaryTool,
    getRevenueSummary: GetRevenueSummaryTool,
    getRevenueTrends: GetRevenueTrendsTool,

    // CRM
    scoreLead: ScoreLeadTool,
    getPipelineOverview: GetPipelineOverviewTool,
    moveLeadInPipeline: MoveLeadInPipelineTool,
    createPipelineStage: CreatePipelineStageTool,
    createCrmCampaign: CreateCrmCampaignTool,
    enrollInCampaign: EnrollInCampaignTool,
    getCampaignMetrics: GetCampaignMetricsTool,

    // Retention
    calculateChurnRisk: CalculateChurnRiskTool,
    getHighRiskMembers: GetHighRiskMembersTool,
    calculateEngagementScore: CalculateEngagementScoreTool,
    getLowEngagementMembers: GetLowEngagementMembersTool,
    createWinbackCampaign: CreateWinbackCampaignTool,
    sendWinbackCampaign: SendWinbackCampaignTool,
    createRetentionAction: CreateRetentionActionTool,
    getRetentionActions: GetRetentionActionsTool,
    getRetentionMetrics: GetRetentionMetricsTool,

    // Operations
    getClassCapacityUtilization: GetClassCapacityUtilizationTool,
    getStaffSchedule: GetStaffScheduleTool,
    createStaffSchedule: CreateStaffScheduleTool,
    getEquipmentStatus: GetEquipmentStatusTool,
    scheduleEquipmentMaintenance: ScheduleEquipmentMaintenanceTool,
    getFacilityUtilization: GetFacilityUtilizationTool,
    manageWaitlist: ManageWaitlistTool,
    getOperationalAlerts: GetOperationalAlertsTool,
    acknowledgeOperationalAlert: AcknowledgeOperationalAlertTool,
    getClassCancellationImpact: GetClassCancellationImpactTool,
    optimizeClassSchedule: OptimizeClassScheduleTool,

    // Growth
    getAcquisitionMetrics: GetAcquisitionMetricsTool,
    getReferralProgramMetrics: GetReferralProgramMetricsTool,
    createReferralCampaign: CreateReferralCampaignTool,
    getUpsellOpportunities: GetUpsellOpportunitiesTool,
    createUpsellOffer: CreateUpsellOfferTool,
    getLifetimeValueMetrics: GetLifetimeValueMetricsTool,
    getExpansionOpportunities: GetExpansionOpportunitiesTool,
    trackGrowthExperiment: TrackGrowthExperimentTool,
    createGrowthExperiment: CreateGrowthExperimentTool,

    // Marketing
    getCampaignPerformance: GetCampaignPerformanceTool,
    createMarketingCampaign: CreateMarketingCampaignTool,
    getAudienceSegments: GetAudienceSegmentsTool,
    createAudienceSegment: CreateAudienceSegmentTool,
    getContentCalendar: GetContentCalendarTool,
    scheduleContent: ScheduleContentTool,
    getLeadAttribution: GetLeadAttributionTool,
    getBrandHealthMetrics: GetBrandHealthMetricsTool,
    manageReviewResponse: ManageReviewResponseTool,
    getCompetitorIntelligence: GetCompetitorIntelligenceTool,
    getRoasMetrics: GetRoasMetricsTool,
    getChannelRecommendations: GetChannelRecommendationsTool,

    // Session Summary
    sessionDebrief: SessionDebriefTool,
    trainerNotes: TrainerNotesTool,
    memberMilestones: MemberMilestonesTool,

    // RAG
    searchKnowledgeBase: SearchKnowledgeBaseTool,
    ingestDocument: IngestDocumentTool,
    ingestFAQ: IngestFAQTool,
    listKnowledgeBases: ListKnowledgeBasesTool,
    deleteDocument: DeleteDocumentTool,
    getDocumentStatus: GetDocumentStatusTool,
  };

  // ERP method mappings for tools without dedicated custom logic
  private readonly erpMethodMap: Record<string, string> = {
    getExpiringMemberships: ERP_METHODS.REPORT_EXPIRING_MEMBERSHIPS,
    getLowAttendanceClasses: ERP_METHODS.REPORT_LOW_ATTENDANCE,
    extractCreateMemberFields: 'wellness_studio.api.ai.extract_member_fields',
    createMember: ERP_METHODS.MEMBER_CREATE,
    createBooking: 'wellness_studio.api.booking.book_by_schedule',
    cancelBooking: ERP_METHODS.BOOKING_CANCEL,
    getMemberCount: ERP_METHODS.MEMBER_LIST,
    getDashboardSummary: ERP_METHODS.REPORT_DASHBOARD_STATS,
    getPublicEventList: ERP_METHODS.EVENT_LIST,
    getPublicClassSchedule: ERP_METHODS.SCHEDULE_LIST,
    getPublicClassScheduleStaff: ERP_METHODS.SCHEDULE_LIST,
    getActivePlansPublic: ERP_METHODS.MEMBERSHIP_LIST,
    captureLead: ERP_METHODS.LEAD_CREATE,
    getEligibleSchedule: ERP_METHODS.SCHEDULE_LIST,
    getAvailability: ERP_METHODS.BOOKING_LIST,
    getMemberPlanEntitlement: ERP_METHODS.MEMBERSHIP_GET,
    getMemberGoalAndLevel: ERP_METHODS.MEMBER_GET,
    getMemberAttendanceSummary: ERP_METHODS.ATTENDANCE_LIST,
    getEligibleSessionsForRecommendation: ERP_METHODS.SCHEDULE_LIST,
    getRevenueSummary: ERP_METHODS.REPORT_REVENUE_SUMMARY,
    getRevenueTrends: ERP_METHODS.REPORT_REVENUE_TRENDS,
    calculateChurnRisk: ERP_METHODS.RETENTION_METRICS,
    getHighRiskMembers: ERP_METHODS.RETENTION_METRICS,
    calculateEngagementScore: ERP_METHODS.RETENTION_METRICS,
    getLowEngagementMembers: ERP_METHODS.RETENTION_METRICS,
    createWinbackCampaign: ERP_METHODS.WINBACK_CAMPAIGN_CREATE,
    sendWinbackCampaign: ERP_METHODS.WINBACK_CAMPAIGN_SEND,
    createRetentionAction: ERP_METHODS.RETENTION_ACTION_CREATE,
    getRetentionActions: ERP_METHODS.RETENTION_ACTION_LIST,
    getRetentionMetrics: ERP_METHODS.RETENTION_METRICS,
    getClassCapacityUtilization: ERP_METHODS.REPORT_CLASS_CAPACITY_UTILIZATION,
    getStaffSchedule: ERP_METHODS.STAFF_SCHEDULE_LIST,
    createStaffSchedule: ERP_METHODS.STAFF_SCHEDULE_CREATE,
    getEquipmentStatus: ERP_METHODS.EQUIPMENT_LIST,
    scheduleEquipmentMaintenance: ERP_METHODS.EQUIPMENT_MAINTENANCE_SCHEDULE,
    getFacilityUtilization: ERP_METHODS.FACILITY_UTILIZATION,
    // manageWaitlist: ERP bridge removed - use dedicated tool classes
    getOperationalAlerts: ERP_METHODS.GET_OPERATIONAL_ALERTS,
    acknowledgeOperationalAlert: ERP_METHODS.ACKNOWLEDGE_OPERATIONAL_ALERT,
    getClassCancellationImpact: ERP_METHODS.GET_CLASS_CANCELLATION_IMPACT,
    optimizeClassSchedule: ERP_METHODS.OPTIMIZE_CLASS_SCHEDULE,
    getAcquisitionMetrics: ERP_METHODS.GET_ACQUISITION_METRICS,
    getReferralProgramMetrics: ERP_METHODS.GET_REFERRAL_METRICS,
    createReferralCampaign: ERP_METHODS.CREATE_REFERRAL_CAMPAIGN,
    getUpsellOpportunities: ERP_METHODS.GET_UPSELL_OPPORTUNITIES,
    createUpsellOffer: ERP_METHODS.CREATE_UPSELL_OFFER,
    getLifetimeValueMetrics: ERP_METHODS.GET_LIFETIME_VALUE_METRICS,
    getExpansionOpportunities: ERP_METHODS.GET_EXPANSION_OPPORTUNITIES,
    trackGrowthExperiment: ERP_METHODS.TRACK_GROWTH_EXPERIMENT,
    createGrowthExperiment: ERP_METHODS.CREATE_GROWTH_EXPERIMENT,
    getCampaignPerformance: ERP_METHODS.GET_CAMPAIGN_PERFORMANCE,
    createMarketingCampaign: ERP_METHODS.CREATE_MARKETING_CAMPAIGN,
    getAudienceSegments: ERP_METHODS.GET_AUDIENCE_SEGMENTS,
    createAudienceSegment: ERP_METHODS.CREATE_AUDIENCE_SEGMENT,
    getContentCalendar: ERP_METHODS.GET_CONTENT_CALENDAR,
    scheduleContent: ERP_METHODS.SCHEDULE_CONTENT,
    getLeadAttribution: ERP_METHODS.GET_LEAD_ATTRIBUTION,
    getBrandHealthMetrics: ERP_METHODS.GET_BRAND_HEALTH_METRICS,
    manageReviewResponse: ERP_METHODS.MANAGE_REVIEW_RESPONSE,
    getCompetitorIntelligence: ERP_METHODS.GET_COMPETITOR_INTELLIGENCE,
    getRoasMetrics: ERP_METHODS.GET_CAMPAIGN_PERFORMANCE,
    getChannelRecommendations: ERP_METHODS.GET_CAMPAIGN_PERFORMANCE,
  };

  constructor(
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() private readonly auditOutbox?: AuditOutboxService,
    @Optional() private readonly erpService?: ErpnextService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Unified AI Tool Execution Registry...');

    // 1. Register tools from DI container via ModuleRef
    if (this.moduleRef) {
      for (const [name, toolClass] of Object.entries(this.toolClassMap)) {
        try {
          const instance = this.moduleRef.get(toolClass, { strict: false });
          if (instance) {
            this.register(name, instance, toolByName(name));
          }
        } catch (err) {
          this.logger.debug(`Could not resolve provider for ${name}: ${(err as Error).message}`);
        }
      }
    }

    // 2. Register ERP bridge fallback for all mapped tools that do not have an instantiated class
    if (this.erpService) {
      for (const [name, erpMethod] of Object.entries(this.erpMethodMap)) {
        if (!this.tools.has(name)) {
          const bridgeTool = new ErpBridgeTool(this.erpService, erpMethod, name);
          this.register(name, bridgeTool, toolByName(name));
        }
      }
    }

    this.logger.log(`Tool Registry initialized with ${this.tools.size} registered tools.`);
  }

  /**
   * Explicitly register a tool instance with optional specification definition
   */
  register(name: string, tool: AiTool, definition?: ToolDefinition): void {
    this.tools.set(name, tool);
    const def = definition || toolByName(name);
    if (def) {
      this.definitions.set(name, def);
    }
  }

  /**
   * Explicitly look up a tool by name
   */
  get(name: string): AiTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the formal definition for a tool
   */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.definitions.get(name) || toolByName(name);
  }

  /**
   * List all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Clear the idempotency cache (useful for testing)
   */
  clearIdempotencyCache(): void {
    this.idempotencyCache.clear();
  }

  /**
   * Canonical Tool Execution Pipeline
   *
   * Enforces all non-negotiable security and reliability invariants:
   * 1. Safe unknown-tool handling
   * 2. Prohibited tools check
   * 3. Tenant context presence & propagation
   * 4. RBAC authorization & scope validation
   * 5. Side-effect confirmation enforcement
   * 6. Idempotency preservation
   * 7. Zod schema input validation
   * 8. Safe execution with structured outcomes
   * 9. Privacy-safe audit logging
   */
  async execute(
    toolName: string,
    context: ToolContext,
    args: Record<string, unknown> = {},
    options?: ToolExecutionOptions,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    // 1. Sanity check: toolName
    if (!toolName || typeof toolName !== 'string' || toolName.trim() === '') {
      return {
        success: false,
        error: 'Tool name is required',
        errorCode: 'INVALID_TOOL_NAME',
      };
    }

    // 2. Safe unknown-tool handling: must fail safely without crash
    const tool = this.tools.get(toolName);
    const toolDef = this.definitions.get(toolName) || toolByName(toolName);

    if (!tool) {
      this.logger.warn(`Execution attempted for unknown tool: "${toolName}" by user ${context?.userId}`);
      await this.recordAuditSecurityEvent(context, 'unknown_tool', { toolName });
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
        errorCode: 'UNKNOWN_TOOL',
      };
    }

    // 3. Prohibited tools check (Phase 1 guardrail)
    if (PROHIBITED_TOOLS.includes(toolName as any)) {
      this.logger.warn(`Execution attempted for prohibited tool: "${toolName}"`);
      await this.recordAuditSecurityEvent(context, 'prohibited_tool_attempt', { toolName });
      return {
        success: false,
        error: `Tool ${toolName} is prohibited in current phase`,
        errorCode: 'TOOL_PROHIBITED',
      };
    }

    // 4. Server-side tenant context validation
    if (!context || !context.tenantId || typeof context.tenantId !== 'string' || context.tenantId.trim() === '') {
      return {
        success: false,
        error: 'Tenant context is required for tool execution',
        errorCode: 'MISSING_TENANT_CONTEXT',
      };
    }

    // 5. Server-side authorization check (RBAC)
    const requiredPermission = TOOL_PERMISSIONS[toolName] ?? toolDef?.requiredPermission ?? null;
    if (requiredPermission !== null) {
      const isAllowed = canUseTool(context.role, toolName);
      if (!isAllowed) {
        this.logger.warn(
          `Unauthorized tool access: user ${context.userId} (role: ${context.role}) attempted "${toolName}" (requires: ${requiredPermission})`,
        );
        await this.recordAuditSecurityEvent(context, 'unauthorized_tool_access', {
          toolName,
          role: context.role,
          requiredPermission,
        });
        return {
          success: false,
          error: `Access denied: insufficient permissions for tool ${toolName}`,
          errorCode: 'PERMISSION_DENIED',
        };
      }
    }

    // 6. Side-effect & confirmation enforcement
    const isWriteTool = toolDef?.requiresConfirmation || toolDef?.risk === 'write';
    const isConfirmed = options?.isConfirmedPendingAction === true || context.isConfirmedPendingAction === true;

    if (isWriteTool && !isConfirmed) {
      this.logger.warn(
        `Direct execution blocked for side-effecting tool "${toolName}" without confirmed pending action`,
      );
      return {
        success: false,
        error: `Tool ${toolName} requires pending-action confirmation before execution`,
        errorCode: 'CONFIRMATION_REQUIRED',
      };
    }

    // 7. Idempotency preservation
    const idempotencyKey = options?.idempotencyKey;
    if (idempotencyKey) {
      const cacheKey = `${context.tenantId}:${toolName}:${idempotencyKey}`;
      const cached = this.idempotencyCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        this.logger.debug(`Returning idempotent cached result for key ${cacheKey}`);
        return cached.result;
      }
    }

    // 8. Tool argument validation against schema
    let validatedArgs = args;
    if (toolDef && toolDef.args) {
      const validation = validateToolArgs(toolDef.args, args);
      if (!validation.success) {
        this.logger.warn(`Validation failed for tool "${toolName}": ${validation.errors.join(', ')}`);
        return {
          success: false,
          error: `Invalid arguments: ${validation.errors.join(', ')}`,
          errorCode: 'INVALID_ARGUMENTS',
        };
      }
      validatedArgs = validation.data;
    }

    // 9. Execute the tool implementation
    let toolResult: ToolResult;
    try {
      const rawResult = await tool.execute(context, validatedArgs);

      // Normalize return contract
      if (rawResult && typeof rawResult === 'object' && 'success' in rawResult) {
        toolResult = rawResult as ToolResult;
      } else {
        toolResult = {
          success: true,
          data: rawResult,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
      this.logger.error(`Execution error in tool "${toolName}":`, error);
      toolResult = {
        success: false,
        error: errorMessage,
        errorCode: 'TOOL_EXECUTION_ERROR',
      };
    }

    const durationMs = Date.now() - startTime;

    // 10. Durable, privacy-safe audit logging
    if (!options?.skipAudit) {
      await this.recordAuditExecution(context, toolName, validatedArgs, toolResult, durationMs);
    }

    // 11. Cache successful result for idempotency
    if (idempotencyKey && toolResult.success) {
      const cacheKey = `${context.tenantId}:${toolName}:${idempotencyKey}`;
      this.idempotencyCache.set(cacheKey, {
        result: toolResult,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minute TTL
      });
    }

    return toolResult;
  }

  /**
   * Record privacy-sanitized execution outcome in the audit outbox
   */
  private async recordAuditExecution(
    context: ToolContext,
    toolName: string,
    args: Record<string, unknown>,
    result: ToolResult,
    durationMs: number,
  ): Promise<void> {
    if (!this.auditOutbox) return;

    try {
      const sanitizedArgs = PiiRedaction.sanitizeForLogging(args);
      const sanitizedError = result.error
        ? (typeof result.error === 'string' ? PiiRedaction.redactTextForAudit(result.error) : result.error)
        : undefined;
      const auditResult = result.success
        ? result.data
          ? PiiRedaction.sanitizeForLogging(
              typeof result.data === 'object' && result.data !== null
                ? (result.data as Record<string, unknown>)
                : { value: result.data },
            )
          : 'succeeded'
        : 'failed';

      await this.auditOutbox.record({
        tenantId: context.tenantId,
        correlationId: context.correlationId || randomUUID(),
        actorType: 'ai',
        actorId: context.userId,
        action: `ai.tool.${toolName}`,
        resourceType: 'tool',
        resourceRef: toolName,
        eventType: `ai.tool.${toolName}`,
        payload: {
          toolName,
          arguments: sanitizedArgs,
          success: result.success,
          error: sanitizedError,
          errorCode: result.errorCode,
          durationMs,
        } as Prisma.InputJsonValue,
        afterData: {
          toolName,
          arguments: sanitizedArgs,
          result: auditResult,
          success: result.success,
          error: sanitizedError,
          errorCode: result.errorCode,
          durationMs,
        } as Prisma.InputJsonValue,
      });
    } catch (err) {
      this.logger.warn(`Failed to record audit log for tool ${toolName}: ${(err as Error).message}`);
    }
  }

  /**
   * Record security events (unauthorized access, unknown tool, etc.)
   */
  private async recordAuditSecurityEvent(
    context: Partial<ToolContext> | undefined,
    eventType: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditOutbox || !context?.tenantId) return;

    try {
      const sanitizedDetails = PiiRedaction.sanitizeForLogging(details);
      await this.auditOutbox.record({
        tenantId: context.tenantId,
        correlationId: context.correlationId || randomUUID(),
        actorType: 'ai',
        actorId: context.userId || 'anonymous',
        action: `security.${eventType}`,
        resourceType: 'security',
        resourceRef: (details.toolName as string) || 'tool_registry',
        eventType: `security.${eventType}`,
        payload: sanitizedDetails as Prisma.InputJsonValue,
        afterData: sanitizedDetails as Prisma.InputJsonValue,
      });
    } catch (err) {
      this.logger.warn(`Failed to record security audit: ${(err as Error).message}`);
    }
  }
}
