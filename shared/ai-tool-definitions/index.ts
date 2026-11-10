import { z } from 'zod';

/**
 * Tool definitions T-01..T-19 (AI & Agent Architecture, Appendix A).
 * Tools are thin wrappers over domain services. Tenant and user identity
 * always come from the request context, never from tool arguments.
 * Permission strings are PROPOSED: align with SL's RBAC seed before Day 2.
 */

export type RiskClass = 'read' | 'write' | 'internal';
export type Assistant = 'admin' | 'staff' | 'enquiry' | 'booking' | 'recommendation' | 'feedback' | 'rag' | 'operations' | 'growth' | 'marketing';
export type Principal = 'staff' | 'member' | 'visitor' | 'system';

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  name: string;
  purpose: string;
  assistant: Assistant;
  risk: RiskClass;
  requiresConfirmation: boolean;
  principals: Principal[];
  requiredPermission: string | null; // null = public scope
  featureFlag: string;
  args: S;
  owningService: string;
  phase: 'P0' | 'P1' | 'P2';
}

const def = <S extends z.ZodTypeAny>(t: ToolDefinition<S>) => t;
const none = z.object({}).strict();

export const TOOLS = [
  def({ id: 'T-01', name: 'getExpiringMemberships', purpose: 'List memberships expiring within N days (matches dashboard tile).',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'reports.read', featureFlag: 'ai.admin', owningService: 'ReportingService', phase: 'P0',
    args: z.object({ daysAhead: z.number().int().min(1).max(30).default(7) }).strict() }),

  def({ id: 'T-02', name: 'getLowAttendanceClasses', purpose: 'List classes whose attendance is below a threshold percentage.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'reports.read', featureFlag: 'ai.admin', owningService: 'ReportingService', phase: 'P0',
    args: z.object({ thresholdPercent: z.number().min(0).max(100).default(50), periodDays: z.number().int().min(1).max(90).default(30) }).strict() }),

  def({ id: 'T-03', name: 'extractCreateMemberFields', purpose: 'Extract member fields from free text; missing mandatory fields are reported, never inferred.',
    assistant: 'staff', risk: 'internal', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'members.create', featureFlag: 'ai.booking', owningService: 'AI Orchestrator', phase: 'P0',
    args: z.object({ message: z.string().min(1).max(1000) }).strict() }),

  def({ id: 'T-04', name: 'createMember', purpose: 'Create a member via the same MembersService as the UI. Executes only from a confirmed pending action.',
    assistant: 'staff', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'members.create', featureFlag: 'ai.booking', owningService: 'MembersService', phase: 'P0',
    // plan/start date optionality to be confirmed with AIQ
    args: z.object({
      fullName: z.string().min(1).max(120),
      phone: z.string().min(8).max(20),
      email: z.string().email().optional(),
      planId: z.string().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // resolved by service layer, shown in confirmation
    }).strict() }),

  def({ id: 'T-05', name: 'getMemberCount', purpose: 'Count members with an optional status filter.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'members.read', featureFlag: 'ai.admin', owningService: 'MembersService', phase: 'P1',
    args: z.object({ status: z.enum(['active', 'expired', 'pending', 'archived']).optional() }).strict() }),

  def({ id: 'T-06', name: 'getDashboardSummary', purpose: 'Return the same KPI payload the dashboard shows.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'reports.read', featureFlag: 'ai.admin', owningService: 'ReportingService', phase: 'P1', args: none }),

  // ============================================
  // Staff Assistant Tools (Phase 1)
  // ============================================
  def({ id: 'T-06A', name: 'getPublicClassScheduleStaff', purpose: 'Staff view of class schedule for the next N days.',
    assistant: 'staff', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'classes.read', featureFlag: 'ai.booking', owningService: 'ClassesService', phase: 'P1',
    args: z.object({ days: z.number().int().min(1).max(14).default(7), classTypeId: z.string().optional() }).strict() }),

  def({ id: 'T-06B', name: 'manageWaitlist', purpose: 'Manage waitlist operations - view, promote, notify, or remove waitlist entries.',
    assistant: 'staff', risk: 'write', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'bookings.write', featureFlag: 'ai.operations', owningService: 'WaitlistService', phase: 'P1',
    args: z.object({
      action: z.enum(['view', 'promote', 'notify', 'remove', 'clear_expired']),
      sessionId: z.string().uuid().optional(),
      bookingId: z.string().uuid().optional(),
      notifyCount: z.number().int().min(1).max(10).default(3),
    }).strict() }),

  def({ id: 'T-06C', name: 'getOperationalAlerts', purpose: 'Get operational alerts - low capacity, no-shows, equipment issues, staffing gaps.',
    assistant: 'staff', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.read', featureFlag: 'ai.operations', owningService: 'OperationsService', phase: 'P1',
    args: z.object({
      severity: z.enum(['info', 'warning', 'critical']).optional(),
      category: z.enum(['capacity', 'staffing', 'equipment', 'attendance', 'payment']).optional(),
      acknowledged: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict() }),

  def({ id: 'T-06D', name: 'acknowledgeOperationalAlert', purpose: 'Acknowledge or resolve an operational alert.',
    assistant: 'staff', risk: 'write', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.write', featureFlag: 'ai.operations', owningService: 'OperationsService', phase: 'P1',
    args: z.object({
      alertId: z.string().uuid(),
      action: z.enum(['acknowledge', 'resolve', 'dismiss']),
      resolutionNotes: z.string().max(1000).optional(),
    }).strict() }),

  def({ id: 'T-06E', name: 'getClassCancellationImpact', purpose: 'Analyze impact of cancelling a class - affected members, revenue loss, waitlist promotions.',
    assistant: 'staff', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.read', featureFlag: 'ai.operations', owningService: 'OperationsService', phase: 'P1',
    args: z.object({
      sessionId: z.string().uuid(),
    }).strict() }),

  def({ id: 'T-07', name: 'getPublicEventList', purpose: 'List public upcoming events.',
    assistant: 'enquiry', risk: 'read', requiresConfirmation: false, principals: ['visitor', 'member'],
    requiredPermission: null, featureFlag: 'ai.enquiry', owningService: 'EventsService (public scope)', phase: 'P1',
    args: z.object({ limit: z.number().int().min(1).max(20).default(10) }).strict() }),

  def({ id: 'T-08', name: 'getPublicClassSchedule', purpose: 'Public class schedule for the next N days.',
    assistant: 'enquiry', risk: 'read', requiresConfirmation: false, principals: ['visitor', 'member'],
    requiredPermission: null, featureFlag: 'ai.enquiry', owningService: 'ClassesService (public scope)', phase: 'P1',
    args: z.object({ days: z.number().int().min(1).max(14).default(7), classTypeId: z.string().optional() }).strict() }),

  def({ id: 'T-09', name: 'getActivePlansPublic', purpose: 'List active public membership plans with price and validity.',
    assistant: 'enquiry', risk: 'read', requiresConfirmation: false, principals: ['visitor', 'member'],
    requiredPermission: null, featureFlag: 'ai.enquiry', owningService: 'MembershipsService (public scope)', phase: 'P1',
    args: z.object({
      includeDetails: z.boolean().default(false),
    }).strict() }),

  def({ id: 'T-10', name: 'captureLead', purpose: 'Create a lead (source AI_ENQUIRY) after consent, via the same createLead as the manual form.',
    assistant: 'enquiry', risk: 'write', requiresConfirmation: false, principals: ['visitor'],
    requiredPermission: null, featureFlag: 'ai.enquiry', owningService: 'LeadsService', phase: 'P1',
    args: z.object({
      name: z.string().min(1).max(120),
      phone: z.string().min(8).max(20),
      email: z.string().email().optional(),
      interest: z.string().max(200).optional(),
      consent: z.literal(true),
    }).strict() }),

  def({ id: 'T-11', name: 'getEligibleSchedule', purpose: 'Sessions the signed-in member is eligible for. Member comes from session.',
    assistant: 'booking', risk: 'read', requiresConfirmation: false, principals: ['member'],
    requiredPermission: 'own.schedule.read', featureFlag: 'ai.booking', owningService: 'ClassesService + MembershipsService', phase: 'P1',
    args: z.object({ classTypeId: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), timeOfDay: z.enum(['morning', 'afternoon', 'evening']).optional(), days: z.number().int().min(1).max(14).default(7).optional() }).strict() }),

  def({ id: 'T-12', name: 'getAvailability', purpose: 'Live seat availability for given sessions (never cached).',
    assistant: 'booking', risk: 'read', requiresConfirmation: false, principals: ['member'],
    requiredPermission: 'own.schedule.read', featureFlag: 'ai.booking', owningService: 'BookingsService', phase: 'P1',
    args: z.object({ sessionIds: z.array(z.string()).min(1).max(20) }).strict() }),

  def({ id: 'T-13', name: 'getMemberPlanEntitlement', purpose: "Member's own plan, allowed services and booking limits.",
    assistant: 'booking', risk: 'read', requiresConfirmation: false, principals: ['member'],
    requiredPermission: 'own.membership.read', featureFlag: 'ai.booking', owningService: 'MembershipsService', phase: 'P1', args: none }),

  def({ id: 'T-13C', name: 'getMyBookings', purpose: 'Retrieve the authenticated member\'s booking history and status (upcoming, past, cancelled).',
    assistant: 'booking', risk: 'read', requiresConfirmation: false, principals: ['member'],
    requiredPermission: 'own.schedule.read', featureFlag: 'ai.booking', owningService: 'BookingsService', phase: 'P1',
    args: z.object({
      status: z.enum(['upcoming', 'past', 'cancelled', 'all']).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    }).strict() }),

  def({ id: 'T-13A', name: 'createBooking', purpose: 'Reserve a spot in a class schedule for an eligible member. Executes only from a confirmed pending action.',
    assistant: 'booking', risk: 'write', requiresConfirmation: true, principals: ['member', 'staff'],
    requiredPermission: 'bookings:create', featureFlag: 'ai.booking', owningService: 'BookingsService', phase: 'P1',
    args: z.object({
      classScheduleId: z.string().min(1).max(100),
      bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      memberId: z.string().optional(),
    }).strict() }),

  def({ id: 'T-13B', name: 'cancelBooking', purpose: 'Cancel an existing class reservation for an authenticated member. Subject to tenant cancellation window.',
    assistant: 'booking', risk: 'write', requiresConfirmation: true, principals: ['member', 'staff'],
    requiredPermission: 'bookings:write', featureFlag: 'ai.booking', owningService: 'BookingsService', phase: 'P1',
    args: z.object({
      bookingId: z.string().min(1).max(100),
      reason: z.string().max(300).optional(),
    }).strict() }),

  def({ id: 'T-14', name: 'getMemberGoalAndLevel', purpose: 'Member-declared goal and level only. Never health notes.',
    assistant: 'recommendation', risk: 'read', requiresConfirmation: false, principals: ['member'],
    requiredPermission: 'own.profile.read', featureFlag: 'ai.recommendation', owningService: 'MembersService', phase: 'P1', args: none }),

  def({ id: 'T-15', name: 'getMemberAttendanceSummary', purpose: 'Attendance counts by class type for the member.',
    assistant: 'recommendation', risk: 'read', requiresConfirmation: false, principals: ['member'],
    requiredPermission: 'own.attendance.read', featureFlag: 'ai.recommendation', owningService: 'AttendanceService', phase: 'P1',
    args: z.object({ days: z.number().int().min(1).max(90).default(30) }).strict() }),

  def({ id: 'T-16', name: 'getEligibleSessionsForRecommendation', purpose: 'Rule-selected candidate set (eligible and available). LLM may only rank within it.',
    assistant: 'recommendation', risk: 'read', requiresConfirmation: false, principals: ['member'],
    requiredPermission: 'own.schedule.read', featureFlag: 'ai.recommendation', owningService: 'RecommendationsService', phase: 'P1',
    args: z.object({ days: z.number().int().min(1).max(14).default(7) }).strict() }),

  def({ id: 'T-17', name: 'classifyFeedback', purpose: 'Classify one feedback comment into sentiment, topics and theme (async job).',
    assistant: 'feedback', risk: 'internal', requiresConfirmation: false, principals: ['system'],
    requiredPermission: 'feedback:write', featureFlag: 'ai.feedback', owningService: 'FeedbackService', phase: 'P1',
    args: z.object({ feedbackId: z.string() }).strict() }),

  def({ id: 'T-18', name: 'storeFeedbackClassification', purpose: 'Store validated classification separately from the raw comment.',
    assistant: 'feedback', risk: 'write', requiresConfirmation: false, principals: ['system'],
    requiredPermission: 'feedback:write', featureFlag: 'ai.feedback', owningService: 'FeedbackService', phase: 'P1',
    args: z.object({
      feedbackId: z.string(),
      sentiment: z.enum(['positive', 'neutral', 'negative']),
      topics: z.array(z.enum(['trainer', 'class_content', 'music', 'timing', 'duration', 'facility'])).max(6),
      theme: z.string().max(200),
      lowConfidence: z.boolean().default(false),
    }).strict() }),

  def({ id: 'T-19', name: 'getFeedbackSummary', purpose: 'Aggregate feedback summary per session or week. Trainers see aggregates only.',
    assistant: 'feedback', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'feedback:read', featureFlag: 'ai.feedback', owningService: 'FeedbackService', phase: 'P1',
    args: z.object({ scope: z.enum(['session', 'week']), sessionId: z.string().optional(), weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict() }),

  // ============================================
  // RAG / Knowledge Base Tools (Phase 2)
  // ============================================
  def({ id: 'T-20', name: 'searchKnowledgeBase', purpose: 'Search the knowledge base for relevant information using vector similarity. Returns top matching chunks with citations.',
    assistant: 'rag', risk: 'read', requiresConfirmation: false, principals: ['staff', 'member'],
    requiredPermission: 'knowledge_base.read', featureFlag: 'ai.rag', owningService: 'RAGService', phase: 'P2',
    args: z.object({
      query: z.string().min(1).max(1000),
      knowledgeBaseId: z.string().uuid().optional(),
      topK: z.number().int().min(1).max(20).default(5),
      similarityThreshold: z.number().min(0).max(1).default(0.7),
    }).strict() }),

  def({ id: 'T-21', name: 'ingestDocument', purpose: 'Ingest a document (PDF, markdown, text, FAQ) into the knowledge base with automatic chunking and embedding.',
    assistant: 'rag', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'knowledge_base.write', featureFlag: 'ai.rag', owningService: 'RAGService', phase: 'P2',
    args: z.object({
      knowledgeBaseId: z.string().uuid(),
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(50000),
      sourceType: z.enum(['pdf', 'markdown', 'text', 'faq', 'erp_docs', 'web', 'manual']),
      sourceRef: z.string().max(500).optional(),
      mimeType: z.string().optional(),
      chunkSize: z.number().int().min(100).max(5000).default(1000).optional(),
      chunkOverlap: z.number().int().min(0).max(1000).default(200).optional(),
    }).strict() }),

  def({ id: 'T-22', name: 'ingestFAQ', purpose: 'Bulk ingest FAQ question-answer pairs into the knowledge base.',
    assistant: 'rag', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'knowledge_base.write', featureFlag: 'ai.rag', owningService: 'RAGService', phase: 'P2',
    args: z.object({
      knowledgeBaseId: z.string().uuid(),
      entries: z.array(z.object({
        question: z.string().min(1).max(500),
        answer: z.string().min(1).max(5000),
        category: z.string().max(100).optional(),
        tags: z.array(z.string()).optional(),
      })).min(1).max(100),
    }).strict() }),

  def({ id: 'T-23', name: 'listKnowledgeBases', purpose: 'List all active knowledge bases for the current tenant.',
    assistant: 'rag', risk: 'read', requiresConfirmation: false, principals: ['staff', 'member'],
    requiredPermission: 'knowledge_base.read', featureFlag: 'ai.rag', owningService: 'RAGService', phase: 'P2',
    args: z.object({}).strict() }),

  def({ id: 'T-24', name: 'deleteDocument', purpose: 'Delete a document and its chunks from the knowledge base.',
    assistant: 'rag', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'knowledge_base.write', featureFlag: 'ai.rag', owningService: 'RAGService', phase: 'P2',
    args: z.object({
      documentId: z.string().uuid(),
    }).strict() }),

  def({ id: 'T-25', name: 'getDocumentStatus', purpose: 'Get the ingestion status and chunk count for a document.',
    assistant: 'rag', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'knowledge_base.read', featureFlag: 'ai.rag', owningService: 'RAGService', phase: 'P2',
    args: z.object({
      documentId: z.string().uuid(),
    }).strict() }),

  // ============================================
  // CRM Agent Tools (Phase 3)
  // ============================================
  def({ id: 'T-26', name: 'scoreLead', purpose: 'Calculate lead conversion probability score based on engagement, source, and behavior signals.',
    assistant: 'staff', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'leads.read', featureFlag: 'ai.crm', owningService: 'LeadScoringService', phase: 'P2',
    args: z.object({
      leadId: z.string().uuid(),
    }).strict() }),

  def({ id: 'T-27', name: 'getPipelineOverview', purpose: 'Get complete pipeline overview with lead counts and conversion metrics per stage.',
    assistant: 'staff', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'pipeline.read', featureFlag: 'ai.crm', owningService: 'PipelineService', phase: 'P2',
    args: z.object({}).strict() }),

  def({ id: 'T-28', name: 'moveLeadInPipeline', purpose: 'Move a lead from one pipeline stage to another.',
    assistant: 'admin', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'pipeline.write', featureFlag: 'ai.crm', owningService: 'PipelineService', phase: 'P2',
    args: z.object({
      leadId: z.string().uuid(),
      fromStageId: z.string().uuid(),
      toStageId: z.string().uuid(),
      notes: z.string().max(500).optional(),
    }).strict() }),

  def({ id: 'T-29', name: 'createPipelineStage', purpose: 'Create a new pipeline stage.',
    assistant: 'admin', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'pipeline.write', featureFlag: 'ai.crm', owningService: 'PipelineService', phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(50),
      displayName: z.string().min(1).max(100),
      stageOrder: z.number().int().min(1),
      winProbability: z.number().int().min(0).max(100).default(0),
      slaDays: z.number().int().min(1).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      isDefault: z.boolean().default(false),
    }).strict() }),

  def({ id: 'T-30', name: 'createCrmCampaign', purpose: 'Create a CRM campaign for lead nurturing, winback, upsell, or referral.',
    assistant: 'admin', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'campaigns.write', featureFlag: 'ai.crm', owningService: 'CrmCampaignService', phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      campaignType: z.enum(['nurture', 'winback', 'upsell', 'cross_sell', 'referral']),
      targetSegment: z.record(z.string(), z.any()),
      triggerConfig: z.record(z.string(), z.any()),
      scheduleConfig: z.record(z.string(), z.any()).optional(),
      goals: z.record(z.string(), z.any()).optional(),
    }).strict() }),

  def({ id: 'T-31', name: 'enrollInCampaign', purpose: 'Enroll leads or members into a CRM campaign.',
    assistant: 'admin', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'campaigns.write', featureFlag: 'ai.crm', owningService: 'CrmCampaignService', phase: 'P2',
    args: z.object({
      campaignId: z.string().uuid(),
      leadIds: z.array(z.string().uuid()).optional(),
      memberIds: z.array(z.string().uuid()).optional(),
    }).strict() }),

  def({ id: 'T-32', name: 'getCampaignMetrics', purpose: 'Get conversion metrics and enrollment stats for a CRM campaign.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'campaigns.read', featureFlag: 'ai.crm', owningService: 'CrmCampaignService', phase: 'P2',
    args: z.object({
      campaignId: z.string().uuid(),
    }).strict() }),

  // ============================================
  // Retention Agent Tools (Phase 4)
  // ============================================
  def({ id: 'T-33', name: 'calculateChurnRisk', purpose: 'Calculate churn risk score and level for a member based on engagement, payment, and satisfaction signals.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'retention.read', featureFlag: 'ai.retention', owningService: 'ChurnPredictionService', phase: 'P2',
    args: z.object({
      memberId: z.string().uuid(),
    }).strict() }),

  def({ id: 'T-34', name: 'getHighRiskMembers', purpose: 'List members with high or critical churn risk.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'retention.read', featureFlag: 'ai.retention', owningService: 'ChurnPredictionService', phase: 'P2',
    args: z.object({
      riskLevel: z.enum(['high', 'critical']).default('high'),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict() }),

  def({ id: 'T-35', name: 'calculateEngagementScore', purpose: 'Calculate comprehensive engagement score for a member across attendance, frequency, recency, monetary, feedback, and referral dimensions.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'retention.read', featureFlag: 'ai.retention', owningService: 'EngagementScoringService', phase: 'P2',
    args: z.object({
      memberId: z.string().uuid(),
    }).strict() }),

  def({ id: 'T-36', name: 'getLowEngagementMembers', purpose: 'List members with low engagement scores who need attention.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'retention.read', featureFlag: 'ai.retention', owningService: 'EngagementScoringService', phase: 'P2',
    args: z.object({
      threshold: z.number().int().min(0).max(100).default(50),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict() }),

  def({ id: 'T-37', name: 'createWinbackCampaign', purpose: 'Create a win-back campaign targeting churned or at-risk members.',
    assistant: 'admin', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'retention.write', featureFlag: 'ai.retention', owningService: 'WinbackCampaignService', phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      triggerType: z.enum(['churn_risk', 'inactive', 'expired_membership', 'cancelled', 'manual']),
      targetCriteria: z.record(z.string(), z.any()),
      messageTemplate: z.string().min(1).max(2000),
      channel: z.enum(['whatsapp', 'email', 'sms', 'push', 'in_app']),
      incentiveConfig: z.record(z.string(), z.any()).optional(),
    }).strict() }),

  def({ id: 'T-38', name: 'sendWinbackCampaign', purpose: 'Send win-back campaign messages to targeted members.',
    assistant: 'admin', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'retention.write', featureFlag: 'ai.retention', owningService: 'WinbackCampaignService', phase: 'P2',
    args: z.object({
      campaignId: z.string().uuid(),
      memberIds: z.array(z.string().uuid()).min(1),
    }).strict() }),

  def({ id: 'T-39', name: 'createRetentionAction', purpose: 'Create a retention action (outreach, incentive, session booking, etc.) for a member.',
    assistant: 'admin', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'retention.write', featureFlag: 'ai.retention', owningService: 'RetentionActionService', phase: 'P2',
    args: z.object({
      memberId: z.string().uuid(),
      actionType: z.enum(['outreach', 'incentive_offered', 'session_booked', 'plan_changed', 'meeting_scheduled', 'feedback_requested']),
      description: z.string().min(1).max(1000),
      triggeredBy: z.enum(['churn_risk', 'engagement_drop', 'manual', 'campaign', 'automation']),
      assignedTo: z.string().uuid().optional(),
      dueAt: z.string().datetime().optional(),
    }).strict() }),

  def({ id: 'T-40', name: 'getRetentionActions', purpose: 'Get retention actions with filters for member, status, type, or assignee.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'retention.read', featureFlag: 'ai.retention', owningService: 'RetentionActionService', phase: 'P2',
    args: z.object({
      memberId: z.string().uuid().optional(),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
      actionType: z.enum(['outreach', 'incentive_offered', 'session_booked', 'plan_changed', 'meeting_scheduled', 'feedback_requested']).optional(),
      assignedTo: z.string().uuid().optional(),
    }).strict() }),

  def({ id: 'T-41', name: 'getRetentionMetrics', purpose: 'Get retention action metrics including completion rates, overdue actions, and breakdown by type/trigger.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'retention.read', featureFlag: 'ai.retention', owningService: 'RetentionActionService', phase: 'P2',
    args: z.object({
      days: z.number().int().min(1).max(365).default(30),
    }).strict() }),

  // ============================================
  // Operations Agent Tools (Phase 5)
  // ============================================
  def({ id: 'T-42', name: 'getClassCapacityUtilization', purpose: 'Get capacity utilization metrics for classes across time periods.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.read', featureFlag: 'ai.operations', owningService: 'OperationsService', phase: 'P2',
    args: z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      classTypeId: z.string().uuid().optional(),
      branchId: z.string().uuid().optional(),
    }).strict() }),

  def({ id: 'T-43', name: 'getStaffSchedule', purpose: 'Get staff schedules including classes, shifts, and availability.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'staff.read', featureFlag: 'ai.operations', owningService: 'StaffSchedulingService', phase: 'P2',
    args: z.object({
      staffId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      branchId: z.string().uuid().optional(),
    }).strict() }),

  def({ id: 'T-44', name: 'createStaffSchedule', purpose: 'Create or update staff schedule for classes and shifts.',
    assistant: 'operations', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'staff.write', featureFlag: 'ai.operations', owningService: 'StaffSchedulingService', phase: 'P2',
    args: z.object({
      staffId: z.string().uuid(),
      scheduleType: z.enum(['class', 'shift', 'availability']),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
      classTypeId: z.string().uuid().optional(),
      branchId: z.string().uuid(),
      notes: z.string().max(500).optional(),
    }).strict() }),

  def({ id: 'T-45', name: 'getEquipmentStatus', purpose: 'Get equipment status, maintenance schedule, and availability.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'equipment.read', featureFlag: 'ai.operations', owningService: 'EquipmentService', phase: 'P2',
    args: z.object({
      branchId: z.string().uuid().optional(),
      equipmentType: z.string().optional(),
      status: z.enum(['available', 'in_use', 'maintenance', 'retired']).optional(),
    }).strict() }),

  def({ id: 'T-46', name: 'scheduleEquipmentMaintenance', purpose: 'Schedule equipment maintenance or mark equipment as needing service.',
    assistant: 'operations', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'equipment.write', featureFlag: 'ai.operations', owningService: 'EquipmentService', phase: 'P2',
    args: z.object({
      equipmentId: z.string().uuid(),
      maintenanceType: z.enum(['routine', 'repair', 'inspection', 'calibration']),
      scheduledAt: z.string().datetime(),
      estimatedDurationMinutes: z.number().int().min(15).max(480),
      notes: z.string().max(1000).optional(),
      assignedTo: z.string().uuid().optional(),
    }).strict() }),

  def({ id: 'T-47', name: 'getFacilityUtilization', purpose: 'Get facility/room utilization metrics and availability.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'facility.read', featureFlag: 'ai.operations', owningService: 'FacilityService', phase: 'P2',
    args: z.object({
      branchId: z.string().uuid().optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      roomId: z.string().uuid().optional(),
    }).strict() }),

  def({ id: 'T-48', name: 'manageWaitlist', purpose: 'Manage waitlist operations - view, promote, notify, or clear waitlist entries using WS Booking with status=Waitlisted.',
    assistant: 'operations', risk: 'write', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'bookings.write', featureFlag: 'ai.operations', owningService: 'WaitlistService', phase: 'P2',
    args: z.object({
      action: z.enum(['view', 'promote', 'notify', 'remove', 'clear_expired']),
      sessionId: z.string().uuid().optional(),
      bookingId: z.string().uuid().optional(),
      notifyCount: z.number().int().min(1).max(10).default(3),
    }).strict() }),

  def({ id: 'T-49', name: 'getOperationalAlerts', purpose: 'Get operational alerts - low capacity, no-shows, equipment issues, staffing gaps.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.read', featureFlag: 'ai.operations', owningService: 'OperationsService', phase: 'P2',
    args: z.object({
      severity: z.enum(['info', 'warning', 'critical']).optional(),
      category: z.enum(['capacity', 'staffing', 'equipment', 'attendance', 'payment']).optional(),
      acknowledged: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict() }),

  def({ id: 'T-50', name: 'acknowledgeOperationalAlert', purpose: 'Acknowledge or resolve an operational alert.',
    assistant: 'operations', risk: 'write', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.write', featureFlag: 'ai.operations', owningService: 'OperationsService', phase: 'P2',
    args: z.object({
      alertId: z.string().uuid(),
      action: z.enum(['acknowledge', 'resolve', 'dismiss']),
      resolutionNotes: z.string().max(1000).optional(),
    }).strict() }),

  def({ id: 'T-51', name: 'getClassCancellationImpact', purpose: 'Analyze impact of cancelling a class - affected members, revenue loss, waitlist promotions.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.read', featureFlag: 'ai.operations', owningService: 'OperationsService', phase: 'P2',
    args: z.object({
      sessionId: z.string().uuid(),
    }).strict() }),

  def({ id: 'T-52', name: 'optimizeClassSchedule', purpose: 'Get AI-powered class schedule optimization recommendations based on demand, capacity, and instructor availability.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.read', featureFlag: 'ai.operations', owningService: 'ScheduleOptimizationService', phase: 'P2',
    args: z.object({
      branchId: z.string().uuid().optional(),
      periodDays: z.number().int().min(7).max(90).default(30),
      optimizationGoal: z.enum(['maximize_revenue', 'maximize_utilization', 'balance_load', 'minimize_conflicts']).default('maximize_utilization'),
    }).strict() }),

  // ============================================
  // Growth Agent Tools (Phase 5)
  // ============================================
  def({ id: 'T-53', name: 'getAcquisitionMetrics', purpose: 'Get member acquisition metrics - leads, conversion rates, CAC, channel performance.',
    assistant: 'growth', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'growth.read', featureFlag: 'ai.growth', owningService: 'GrowthAnalyticsService', phase: 'P2',
    args: z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
      channel: z.enum(['organic', 'referral', 'paid_social', 'paid_search', 'email', 'walk_in', 'partnership', 'other']).optional(),
      branchId: z.string().uuid().optional(),
    }).strict() }),

  def({ id: 'T-54', name: 'getReferralProgramMetrics', purpose: 'Get referral program performance - referrals sent, converted, rewards paid, viral coefficient.',
    assistant: 'growth', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'growth.read', featureFlag: 'ai.growth', owningService: 'ReferralService', phase: 'P2',
    args: z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
      status: z.enum(['pending', 'converted', 'expired', 'cancelled']).optional(),
    }).strict() }),

  def({ id: 'T-55', name: 'createReferralCampaign', purpose: 'Create a referral campaign with incentives, rules, and tracking.',
    assistant: 'growth', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'growth.write', featureFlag: 'ai.growth', owningService: 'ReferralService', phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      referrerIncentive: z.object({
        type: z.enum(['credit', 'discount', 'free_session', 'merchandise', 'cash']),
        value: z.number().min(0),
        description: z.string().max(200),
      }),
      refereeIncentive: z.object({
        type: z.enum(['discount', 'free_trial', 'waived_fee', 'bonus']),
        value: z.number().min(0),
        description: z.string().max(200),
      }).optional(),
      validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      maxReferralsPerMember: z.number().int().min(1).max(100).default(10),
      eligibilityCriteria: z.record(z.string(), z.any()).optional(),
    }).strict() }),

  def({ id: 'T-56', name: 'getUpsellOpportunities', purpose: 'Identify members ready for upsell - plan upgrade, add-ons, personal training, nutrition.',
    assistant: 'growth', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'growth.read', featureFlag: 'ai.growth', owningService: 'UpsellService', phase: 'P2',
    args: z.object({
      memberId: z.string().uuid().optional(),
      opportunityType: z.enum(['plan_upgrade', 'addon', 'personal_training', 'nutrition', 'workshop', 'retail']).optional(),
      minScore: z.number().int().min(0).max(100).default(70),
      limit: z.number().int().min(1).max(100).default(50),
    }).strict() }),

  def({ id: 'T-57', name: 'createUpsellOffer', purpose: 'Create a personalized upsell offer for a member or segment.',
    assistant: 'growth', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'growth.write', featureFlag: 'ai.growth', owningService: 'UpsellService', phase: 'P2',
    args: z.object({
      memberId: z.string().uuid().optional(),
      segmentId: z.string().uuid().optional(),
      offerType: z.enum(['plan_upgrade', 'addon', 'personal_training', 'nutrition', 'workshop', 'retail']),
      offerDetails: z.record(z.string(), z.any()),
      discountPercent: z.number().int().min(0).max(100).optional(),
      validUntil: z.string().datetime(),
      triggerEvent: z.enum(['milestone', 'birthday', 'anniversary', 'high_engagement', 'plan_expiry', 'manual']).optional(),
    }).strict() }),

  def({ id: 'T-58', name: 'getLifetimeValueMetrics', purpose: 'Get member lifetime value (LTV) metrics, cohorts, and predictions.',
    assistant: 'growth', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'growth.read', featureFlag: 'ai.growth', owningService: 'GrowthAnalyticsService', phase: 'P2',
    args: z.object({
      cohortBy: z.enum(['month', 'quarter', 'year', 'channel', 'plan']).optional(),
      periodMonths: z.number().int().min(1).max(60).default(12),
    }).strict() }),

  def({ id: 'T-59', name: 'getExpansionOpportunities', purpose: 'Identify expansion opportunities - new locations, class types, partnerships, corporate accounts.',
    assistant: 'growth', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'growth.read', featureFlag: 'ai.growth', owningService: 'ExpansionService', phase: 'P2',
    args: z.object({
      analysisType: z.enum(['geographic', 'demographic', 'competitive', 'corporate', 'partnership']).default('geographic'),
      radiusKm: z.number().int().min(1).max(100).default(10),
      minPopulation: z.number().int().min(1000).default(50000),
    }).strict() }),

  def({ id: 'T-60', name: 'trackGrowthExperiment', purpose: 'Track A/B test or growth experiment results - variant performance, statistical significance.',
    assistant: 'growth', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'growth.read', featureFlag: 'ai.growth', owningService: 'ExperimentService', phase: 'P2',
    args: z.object({
      experimentId: z.string().uuid().optional(),
      status: z.enum(['draft', 'running', 'completed', 'archived']).optional(),
    }).strict() }),

  def({ id: 'T-61', name: 'createGrowthExperiment', purpose: 'Create a growth experiment (A/B test) for pricing, messaging, offers, or features.',
    assistant: 'growth', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'growth.write', featureFlag: 'ai.growth', owningService: 'ExperimentService', phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      hypothesis: z.string().min(1).max(1000),
      variantControl: z.record(z.string(), z.any()),
      variantTreatment: z.record(z.string(), z.any()),
      targetMetric: z.enum(['conversion_rate', 'revenue_per_member', 'retention_rate', 'referral_rate', 'attendance_rate']),
      minimumDetectableEffect: z.number().min(0.01).max(1).default(0.1),
      trafficAllocation: z.number().int().min(10).max(100).default(50),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).strict() }),

  // ============================================
  // Marketing/Advertising Agent Tools (Phase 5)
  // ============================================
  def({ id: 'T-62', name: 'getCampaignPerformance', purpose: 'Get marketing campaign performance - impressions, clicks, conversions, ROAS, CPA.',
    assistant: 'marketing', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'marketing.read', featureFlag: 'ai.marketing', owningService: 'MarketingAnalyticsService', phase: 'P2',
    args: z.object({
      campaignId: z.string().uuid().optional(),
      channel: z.enum(['meta', 'google', 'tiktok', 'email', 'sms', 'whatsapp', 'push', 'referral', 'organic']).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(['draft', 'active', 'paused', 'completed', 'archived']).optional(),
    }).strict() }),

  def({ id: 'T-63', name: 'createMarketingCampaign', purpose: 'Create a marketing campaign across channels with targeting, creative, and budget.',
    assistant: 'marketing', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'marketing.write', featureFlag: 'ai.marketing', owningService: 'CampaignService', phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      channel: z.enum(['meta', 'google', 'tiktok', 'email', 'sms', 'whatsapp', 'push']),
      objective: z.enum(['awareness', 'traffic', 'leads', 'conversions', 'engagement', 'retention']),
      targeting: z.record(z.string(), z.any()),
      creative: z.record(z.string(), z.any()),
      budget: z.object({
        type: z.enum(['daily', 'lifetime']),
        amount: z.number().min(0),
        currency: z.string().length(3).default('INR'),
      }),
      schedule: z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dayparting: z.array(z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(0).max(23),
        })).optional(),
      }),
      landingPageUrl: z.string().url().optional(),
      utmParams: z.record(z.string(), z.string()).optional(),
    }).strict() }),

  def({ id: 'T-64', name: 'getAudienceSegments', purpose: 'Get audience segments for targeting - demographics, behavior, engagement, lifecycle stage.',
    assistant: 'marketing', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'marketing.read', featureFlag: 'ai.marketing', owningService: 'AudienceService', phase: 'P2',
    args: z.object({
      segmentType: z.enum(['demographic', 'behavioral', 'lifecycle', 'custom', 'lookalike']).optional(),
      minSize: z.number().int().min(1).default(10),
    }).strict() }),

  def({ id: 'T-65', name: 'createAudienceSegment', purpose: 'Create a custom audience segment based on rules or ML-based lookalike.',
    assistant: 'marketing', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'marketing.write', featureFlag: 'ai.marketing', owningService: 'AudienceService', phase: 'P2',
    args: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(500).optional(),
      segmentType: z.enum(['rule_based', 'lookalike', 'ml_predicted']),
      rules: z.record(z.string(), z.any()).optional(),
      sourceSegmentId: z.string().uuid().optional(),
      lookalikeConfig: z.object({
        sourceCountry: z.string().length(2).optional(),
        similarityPercent: z.number().int().min(1).max(10).default(1),
      }).optional(),
    }).strict() }),

  def({ id: 'T-66', name: 'getContentCalendar', purpose: 'Get marketing content calendar - posts, emails, campaigns scheduled.',
    assistant: 'marketing', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'marketing.read', featureFlag: 'ai.marketing', owningService: 'ContentService', phase: 'P2',
    args: z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      channel: z.enum(['social', 'email', 'blog', 'push', 'sms', 'whatsapp', 'in_app']).optional(),
      status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional(),
    }).strict() }),

  def({ id: 'T-67', name: 'scheduleContent', purpose: 'Schedule marketing content - social posts, emails, push notifications, in-app messages.',
    assistant: 'marketing', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'marketing.write', featureFlag: 'ai.marketing', owningService: 'ContentService', phase: 'P2',
    args: z.object({
      channel: z.enum(['social', 'email', 'blog', 'push', 'sms', 'whatsapp', 'in_app']),
      contentType: z.enum(['post', 'story', 'reel', 'email', 'newsletter', 'push', 'sms', 'whatsapp', 'in_app_banner']),
      title: z.string().min(1).max(200).optional(),
      body: z.string().min(1).max(10000),
      mediaUrls: z.array(z.string().url()).max(10).optional(),
      scheduledAt: z.string().datetime(),
      targetSegments: z.array(z.string().uuid()).min(1),
      utmParams: z.record(z.string(), z.string()).optional(),
      abTestVariant: z.string().optional(),
    }).strict() }),

  def({ id: 'T-68', name: 'getLeadAttribution', purpose: 'Get lead attribution - which channels, campaigns, touchpoints drove leads and conversions.',
    assistant: 'marketing', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'marketing.read', featureFlag: 'ai.marketing', owningService: 'AttributionService', phase: 'P2',
    args: z.object({
      leadId: z.string().uuid().optional(),
      periodDays: z.number().int().min(1).max(365).default(30),
      attributionModel: z.enum(['first_touch', 'last_touch', 'linear', 'time_decay', 'position_based', 'data_driven']).default('data_driven'),
    }).strict() }),

  def({ id: 'T-69', name: 'getBrandHealthMetrics', purpose: 'Get brand health metrics - NPS, brand awareness, sentiment, share of voice, review ratings.',
    assistant: 'marketing', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'marketing.read', featureFlag: 'ai.marketing', owningService: 'BrandService', phase: 'P2',
    args: z.object({
      periodDays: z.number().int().min(1).max(365).default(90),
      source: z.enum(['survey', 'reviews', 'social', 'nps', 'all']).default('all'),
    }).strict() }),

  def({ id: 'T-70', name: 'manageReviewResponse', purpose: 'Manage review responses - view, respond, flag, or escalate reviews across platforms.',
    assistant: 'marketing', risk: 'write', requiresConfirmation: true, principals: ['staff'],
    requiredPermission: 'marketing.write', featureFlag: 'ai.marketing', owningService: 'ReviewManagementService', phase: 'P2',
    args: z.object({
      action: z.enum(['view', 'respond', 'flag', 'escalate', 'report']),
      reviewId: z.string().uuid().optional(),
      platform: z.enum(['google', 'facebook', 'yelp', 'instagram', 'internal']).optional(),
      response: z.string().max(2000).optional(),
    }).strict() }),

  def({ id: 'T-71', name: 'getCompetitorIntelligence', purpose: 'Get competitor intelligence - pricing, offerings, promotions, reviews, digital presence.',
    assistant: 'marketing', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'marketing.read', featureFlag: 'ai.marketing', owningService: 'CompetitorIntelligenceService', phase: 'P2',
    args: z.object({
      competitorId: z.string().uuid().optional(),
      radiusKm: z.number().int().min(1).max(50).default(10),
      includeOnline: z.boolean().default(true),
    }).strict() }),

  // ============================================
  // Advertising Agent Tools (Phase 5)
  // ============================================
  def({ id: 'T-77', name: 'getRoasMetrics', purpose: 'Get ROAS and CPA metrics for paid advertising campaigns across channels.',
    assistant: 'marketing', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'marketing.read', featureFlag: 'ai.marketing', owningService: 'AdvertisingService', phase: 'P2',
    args: z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
      channel: z.enum(['meta', 'google', 'tiktok', 'all']).optional(),
    }).strict() }),

  def({ id: 'T-78', name: 'getChannelRecommendations', purpose: 'Get deterministic budget reallocation recommendations based on ROAS efficiency analysis.',
    assistant: 'marketing', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'marketing.read', featureFlag: 'ai.marketing', owningService: 'AdvertisingService', phase: 'P2',
    args: z.object({
      periodDays: z.number().int().min(1).max(365).default(30),
    }).strict() }),

  // ============================================
  // Revenue Intelligence Tools (Phase 1)
  // ============================================
  def({ id: 'T-72', name: 'getRevenueSummary', purpose: 'Get comprehensive revenue summary including monthly, yearly, and average transaction metrics.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'reports.read', featureFlag: 'ai.admin', owningService: 'ReportingService', phase: 'P1',
    args: z.object({}).strict() }),

  def({ id: 'T-73', name: 'getRevenueTrends', purpose: 'Get historical revenue trends by period (daily, weekly, monthly) with growth metrics.',
    assistant: 'admin', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'reports.read', featureFlag: 'ai.admin', owningService: 'ReportingService', phase: 'P1',
    args: z.object({
      period_type: z.enum(['daily', 'weekly', 'monthly']).optional(),
      periods: z.number().int().min(1).max(60).optional(),
    }).strict() }),

  // ============================================
  // Session Summary Agent Tools (Phase 3)
  // ============================================
  def({ id: 'T-74', name: 'sessionDebrief', purpose: 'Generate automated post-class debrief with attendance, no-shows, occupancy, and follow-up actions.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.read', featureFlag: 'ai.operations', owningService: 'SessionSummaryService', phase: 'P2',
    args: z.object({
      sessionId: z.string().uuid(),
      includeMemberDetails: z.boolean().default(false),
    }).strict() }),

  def({ id: 'T-75', name: 'trainerNotes', purpose: 'Retrieve or create trainer performance notes and observations for a session.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.read', featureFlag: 'ai.operations', owningService: 'SessionSummaryService', phase: 'P2',
    args: z.object({
      sessionId: z.string().uuid(),
    }).strict() }),

  def({ id: 'T-76', name: 'memberMilestones', purpose: 'Identify members hitting attendance milestones (10th, 50th, 100th, etc.) in a session or period.',
    assistant: 'operations', risk: 'read', requiresConfirmation: false, principals: ['staff'],
    requiredPermission: 'operations.read', featureFlag: 'ai.operations', owningService: 'SessionSummaryService', phase: 'P2',
    args: z.object({
      sessionId: z.string().uuid().optional(),
      periodDays: z.number().int().min(1).max(365).default(30),
      milestoneIntervals: z.array(z.number().int().min(1)).default([10, 25, 50, 75, 100, 200, 300]),
    }).strict() }),
] as const;

/** Tools that must never be registered in Phase 1. */
export const PROHIBITED_TOOLS = ['bookSession'] as const;

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);
export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);
