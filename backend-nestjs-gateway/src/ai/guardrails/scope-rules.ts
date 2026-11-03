import { ToolDefinition, toolByName } from '@wsos/ai-tool-definitions';
import { z } from 'zod';

/**
 * Scope Rules - AI Guardrail Implementation
 *
 * Enforces role-based tool access per AI Guardrail Spec v0.1
 * - Rule 3: Tool list filtered per user x role x tenant x tier x feature flag
 * - Rule 14-20: Scope refusal for out-of-scope requests
 * - Rule 41-44: Prompt-injection handling
 */

export type StaffRole = 'owner' | 'admin' | 'front_desk' | 'trainer' | 'member' | 'visitor';

type ZodSchema = z.ZodSchema<any>;

/**
 * Role-to-permission mapping (mirrors common/policy.ts)
 */
const ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
  owner: ['*'],
  admin: [
    'members:read', 'members:write', 'members:create',
    'memberships:read', 'memberships:write', 'memberships:create',
    'classes:read', 'classes:write', 'classes:create',
    'bookings:read', 'bookings:write', 'bookings:create',
    'attendance:read', 'attendance:write', 'attendance:create',
    'payments:read', 'payments:write', 'payments:create',
    'reports:read', 'settings:read', 'settings:write',
    'staff:read', 'staff:write',
    'feedback:read', 'feedback:write',
    'recommendations:read',
    'schedules:read', 'schedules:write',
    'webhooks:write',
    'ai:chat', 'ai:approve', 'ai:query', 'audit:read',
    'events:read', 'events:write',
    'leads:read', 'leads:write',
    'pipeline:read', 'pipeline:write',
    'dashboard:read',
    'operations:read', 'operations:write', 'equipment:read', 'equipment:write',
    'facility:read', 'growth:read', 'growth:write', 'marketing:read', 'marketing:write',
    'referral:read', 'referral:write', 'campaigns:read', 'campaigns:write',
    'retention:read', 'retention:write',
    'knowledge_base:read', 'knowledge_base:write',
  ],
  front_desk: [
    'members:read', 'members:write', 'members:create',
    'memberships:read', 'memberships:write', 'memberships:create',
    'classes:read', 'bookings:read', 'bookings:write', 'bookings:create',
    'attendance:read', 'attendance:write', 'attendance:create',
    'payments:read', 'staff:read',
    'leads:read', 'events:read',
    'ai:chat', 'ai:approve', 'ai:query',
    'reports:read',
    'import:read', 'import:write',
    'retention:read',
    'marketing:read',
    'knowledge_base:read',
    'own.schedule.read', 'own.membership.read',
  ],
  trainer: [
    'members:read', 'classes:read', 'bookings:read',
    'attendance:read', 'attendance:write', 'attendance:create',
    'ai:chat',
    'operations:read',
  ],
  member: [
    'members:read', 'memberships:read', 'classes:read',
    'bookings:read', 'bookings:write', 'bookings:create',
    'attendance:read', 'payments:read', 'events:read',
    'recommendations:read',
    'feedback:submit',
    'own.schedule.read', 'own.profile.read', 'own.membership.read', 'own.attendance.read',
    'ai:chat',
    'knowledge_base:read',
  ],
  visitor: ['classes:read', 'events:read'],
};

/**
 * Tool-to-required-permission mapping
 * Maps each AI tool to the permission required to use it
 */
export const TOOL_PERMISSIONS: Record<string, string | null> = {
  // Admin tools (P0)
  'getExpiringMemberships': 'reports:read',
  'getLowAttendanceClasses': 'reports:read',
  'extractCreateMemberFields': 'members:create',
  'createMember': 'members:create',
  'getMemberCount': 'members:read',
  'getDashboardSummary': 'reports:read',
  'getRevenueSummary': 'reports:read',
  'getRevenueTrends': 'reports:read',

  // Enquiry tools (P1)
  'getPublicEventList': null,
  'getPublicClassSchedule': null,
  'getActivePlansPublic': null,
  'captureLead': null,

  // Booking tools (P1)
  'getEligibleSchedule': 'own.schedule.read',
  'getAvailability': 'own.schedule.read',
  'getMemberPlanEntitlement': 'own.membership.read',
  'createBooking': 'bookings:create',
  'cancelBooking': 'bookings:write',

  // Recommendation tools (P1)
  'getMemberGoalAndLevel': 'own.profile.read',
  'getMemberAttendanceSummary': 'own.attendance.read',
  'getEligibleSessionsForRecommendation': 'own.schedule.read',

  // Feedback tools (P1)
  'classifyFeedback': 'feedback:write',
  'storeFeedbackClassification': 'feedback:write',
  'getFeedbackSummary': 'feedback:read',

  // RAG / Knowledge Base Tools (Phase 2)
  'searchKnowledgeBase': 'knowledge_base:read',
  'listKnowledgeBases': 'knowledge_base:read',
  'getDocumentStatus': 'knowledge_base:read',
  'ingestDocument': 'knowledge_base:write',
  'ingestFAQ': 'knowledge_base:write',
  'deleteDocument': 'knowledge_base:write',

  // CRM Agent Tools (Phase 3)
  'scoreLead': 'leads:read',
  'getPipelineOverview': 'leads:read',
  'moveLeadInPipeline': 'pipeline:write',
  'createPipelineStage': 'pipeline:write',
  'createCrmCampaign': 'campaigns:write',
  'enrollInCampaign': 'campaigns:write',
  'getCampaignMetrics': 'campaigns:read',

  // Retention Agent Tools (Phase 4)
  'calculateChurnRisk': 'retention:read',
  'getHighRiskMembers': 'retention:read',
  'calculateEngagementScore': 'retention:read',
  'getLowEngagementMembers': 'retention:read',
  'createWinbackCampaign': 'retention:write',
  'sendWinbackCampaign': 'retention:write',
  'createRetentionAction': 'retention:write',
  'getRetentionActions': 'retention:read',
  'getRetentionMetrics': 'retention:read',

  // Operations Agent Tools (Phase 5)
  'getClassCapacityUtilization': 'operations:read',
  'getStaffSchedule': 'staff:read',
  'createStaffSchedule': 'staff:write',
  'getEquipmentStatus': 'equipment:read',
  'scheduleEquipmentMaintenance': 'equipment:write',
  'getFacilityUtilization': 'facility:read',
  'manageWaitlist': 'bookings:write',
  'getOperationalAlerts': 'operations:read',
  'acknowledgeOperationalAlert': 'operations:write',
  'getClassCancellationImpact': 'operations:read',
  'optimizeClassSchedule': 'operations:read',

  // Growth Agent Tools (Phase 5)
  'getAcquisitionMetrics': 'growth:read',
  'getReferralProgramMetrics': 'growth:read',
  'createReferralCampaign': 'growth:write',
  'getUpsellOpportunities': 'growth:read',
  'createUpsellOffer': 'growth:write',
  'getLifetimeValueMetrics': 'growth:read',
  'getExpansionOpportunities': 'growth:read',
  'trackGrowthExperiment': 'growth:read',
  'createGrowthExperiment': 'growth:write',

  // Marketing Agent Tools (Phase 5)
  'getCampaignPerformance': 'marketing:read',
  'createMarketingCampaign': 'marketing:write',
  'getAudienceSegments': 'marketing:read',
  'createAudienceSegment': 'marketing:write',
  'getContentCalendar': 'marketing:read',
  'scheduleContent': 'marketing:write',
  'getLeadAttribution': 'marketing:read',
  'getBrandHealthMetrics': 'marketing:read',
  'manageReviewResponse': 'marketing:write',
  'getCompetitorIntelligence': 'marketing:read',
};

/**
 * Assistant-to-role mapping
 * Which roles can access which assistant type
 */
const ASSISTANT_ROLES: Record<string, StaffRole[]> = {
  admin: ['owner', 'admin', 'front_desk'],
  enquiry: ['owner', 'admin', 'front_desk', 'trainer', 'member', 'visitor'],
  booking: ['owner', 'admin', 'front_desk', 'trainer', 'member'],
  recommendation: ['owner', 'admin', 'front_desk', 'trainer', 'member'],
  feedback: ['owner', 'admin', 'front_desk', 'trainer'],
  operations: ['owner', 'admin', 'front_desk', 'trainer'],
  growth: ['owner', 'admin', 'front_desk'],
  marketing: ['owner', 'admin', 'front_desk'],
  rag: ['owner', 'admin', 'front_desk', 'trainer', 'member'],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string, permission: string | null | undefined): boolean {
  if (!permission) return false;
  const rolePermissions = ROLE_PERMISSIONS[role as StaffRole] || [];
  if (rolePermissions.includes('*') || rolePermissions.includes(permission)) return true;
  const normalized = permission.includes('.') ? permission.replace(/\./g, ':') : permission;
  if (rolePermissions.includes(normalized)) return true;
  if (permission === 'ai:query' && rolePermissions.includes('ai:chat')) return true;
  return false;
}

/**
 * Check if a role can access a specific assistant
 */
export function canAccessAssistant(role: string, assistant: string): boolean {
  const allowedRoles = ASSISTANT_ROLES[assistant] || [];
  return allowedRoles.includes(role as StaffRole);
}

/**
 * Check if a role can use a specific tool
 * Includes permission check and feature flag check (using default tenant feature flags)
 */
export function canUseTool(role: string, toolName: string): boolean {
  const requiredPermission = TOOL_PERMISSIONS[toolName];
  // Safe failure: missing or unmapped tool permission is explicitly denied
  if (requiredPermission === undefined) return false;
  if (requiredPermission === null) return true; // Public tool
  if (!hasPermission(role, requiredPermission)) {
    // T-19 aggregate summary permission exception: trainers & front desk are authorized
    // for aggregate-only summary tools without granting raw feedback:read table access
    if (toolName === 'getFeedbackSummary' && (role === 'trainer' || role === 'front_desk')) {
      // aggregate access permitted
    } else {
      return false;
    }
  }
  // Check feature flag using default tenant feature flags
  const toolDef = toolByName(toolName);
  if (!toolDef) return false;
  if (toolDef.featureFlag && !isFeatureEnabled(DEFAULT_TENANT_FEATURE_FLAGS, toolDef.featureFlag as keyof typeof AI_FEATURE_FLAGS)) {
    return false;
  }
  // Check if role can access the tool's assistant
  const allowedRoles = ASSISTANT_ROLES[toolDef.assistant];
  if (allowedRoles && !allowedRoles.includes(role as StaffRole)) {
    return false;
  }
  return true;
}

/**
 * Check if a role can use a specific tool including feature flag check
 * Uses provided tenant feature flags or defaults
 */
export function canUseToolWithFeatureFlag(
  role: string,
  toolName: string,
  tenantFeatureFlags?: Record<string, boolean>
): boolean {
  // canUseTool already checks permissions and default feature flags
  // This function allows overriding with tenant-specific feature flags
  const requiredPermission = TOOL_PERMISSIONS[toolName];
  if (requiredPermission === undefined) return false;
  if (requiredPermission === null) return true; // Public tool
  if (!hasPermission(role, requiredPermission)) {
    // T-19 aggregate summary permission exception: trainers & front desk are authorized
    // for aggregate-only summary tools without granting raw feedback:read table access
    if (toolName === 'getFeedbackSummary' && (role === 'trainer' || role === 'front_desk')) {
      // aggregate access permitted
    } else {
      return false;
    }
  }
  const toolDef = toolByName(toolName);
  if (!toolDef) return false;
  const flags = tenantFeatureFlags || DEFAULT_TENANT_FEATURE_FLAGS;
  if (toolDef.featureFlag && !isFeatureEnabled(flags, toolDef.featureFlag as keyof typeof AI_FEATURE_FLAGS)) {
    return false;
  }
  const allowedRoles = ASSISTANT_ROLES[toolDef.assistant];
  if (allowedRoles && !allowedRoles.includes(role as StaffRole)) {
    return false;
  }
  return true;
}

/**
 * Get all available tools for a role
 * Rule 3: Tool list filtered per user x role x tenant x tier x feature flag
 */
export function getAvailableTools(role: string, allTools: readonly ToolDefinition[], tenantFeatureFlags?: Record<string, boolean>): ToolDefinition[] {
  const staffRole = role as StaffRole;
  const allowedAssistants = Object.entries(ASSISTANT_ROLES)
    .filter(([_, roles]) => roles.includes(staffRole))
    .map(([assistant]) => assistant);

  return allTools.filter(tool =>
    allowedAssistants.includes(tool.assistant) &&
    canUseToolWithFeatureFlag(role, tool.name, tenantFeatureFlags)
  );
}

/**
 * Get tools filtered by assistant type and role
 */
export function getToolsForAssistant(role: string, assistant: string, allTools: readonly ToolDefinition[]): ToolDefinition[] {
  if (!canAccessAssistant(role, assistant)) return [];

  return allTools.filter(tool =>
    tool.assistant === assistant &&
    canUseTool(role, tool.name)
  );
}

/**
 * Generate scope refusal message per Guardrail Spec Rule 21
 */
export function generateScopeRefusal(role: string, requestedTool?: string): string {
  const availableTools = getAvailableTools(role, []); // Will be populated at runtime
  const canDo = availableTools.map(t => t.name).join(', ') || 'general enquiries';

  const topic = requestedTool ? ` ${requestedTool}` : '';

  return `I can't help with that here. I can help with ${canDo}. For${topic}, please contact studio staff.`;
}

/**
 * Validate tool call arguments against schema
 * Rule 38: Tool arguments are schema-validated (zod, strict). Unknown fields are rejected.
 */
export function validateToolArgs<Args extends Record<string, unknown>>(
  schema: ZodSchema,
  args: unknown
): { success: true; data: Args } | { success: false; errors: string[] } {
  try {
    const data = schema.parse(args);
    return { success: true, data: data as Args };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, errors: [error.message] };
    }
    return { success: false, errors: ['Invalid arguments'] };
  }
}

/**
 * Check if request contains potential prompt injection
 * Rule 36-39: Prompt-injection handling
 */
export function detectPromptInjection(text: string): { detected: boolean; patterns: string[] } {
  if (!text || typeof text !== 'string') {
    return { detected: false, patterns: [] };
  }

  const injectionPatterns = [
    // Direct instruction overrides & memory wipes
    /ignore\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions?|prompts?|rules?|directives?)/i,
    /forget\s+(?:everything|all|previous|prior)\s*(?:instructions?|prompts?|rules?)?/i,
    /disregard\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions?|prompts?|rules?)/i,

    // Role manipulation & identity spoofing
    /you\s+are\s+(?:now\s+)?(?:an?\s+)?(?:admin|root|superuser|developer|system\s+administrator|system\s+override)/i,
    /act\s+as\s+(?:an?\s+)?(?:admin|root|superuser|developer|unrestricted|DAN)\b/i,
    /pretend\s+to\s+be\s+(?:an?\s+)?(?:admin|root|developer|unfiltered)\b/i,

    // Data & system prompt exfiltration attempts
    /show\s+me\s+(?:your|the)\s+(?:system\s+)?prompt/i,
    /print\s+(?:your|the)\s+(?:system\s+)?prompt/i,
    /reveal\s+(?:your|the)\s+(?:system\s+)?prompt/i,
    /what\s+(?:is|are)\s+(?:your|the)\s+(?:system\s+)?prompt/i,
    /(?:show|reveal|display|output|dump|print)\s+(?:all\s+)?(?:system|internal|developer|hidden)\s+(?:instructions?|prompts?|rules?|guidelines?)/i,
    /(?:show|reveal|display|print)\s+(?:your\s+)?(?:secret|api\s*keys?|credentials?|tokens?)/i,

    // Adversarial code / command / SQL execution attempts (avoiding false positives on benign queries)
    /(?:run|execute)\s+(?:arbitrary|raw|system|os|bash|shell|sql)\s+(?:code|commands?|scripts?|queries|query)/i,
    /(?:run|execute)\s+(?:eval|exec|spawn|fork)\b/i,
    /(?:inject|drop|truncate|alter)\s+(?:table|database|schema)\b/i,
    /call\s+(?:the\s+)?(?:internal|private|hidden|undocumented|unauthorized)\s+(?:function|tool|api)/i,

    // SQL / code execution attempts
    /\bexecute\s+sql\b/i,
    /\b(sql|select|insert|update|delete|drop|alter|create|truncate)\s+(?:statement|query|command)\b/i,
    /\b(run|execute)\s+(?:sql|query)\b/i,

    // Jailbreak patterns & security bypass directives
    /\b(?:DAN|Do\s+Anything\s+Now)\b/i,
    /\b(?:unrestricted|unfiltered|uncensored)\s+mode\b/i,
    /(?:bypass|override|disable)\s+(?:all\s+)?(?:guardrails?|security|safety|filters?|rules?|limits?)/i,
  ];

  const detected = injectionPatterns
    .map((pattern) => pattern.test(text) ? pattern.source : null)
    .filter(Boolean);

  return {
    detected: detected.length > 0,
    patterns: detected as string[],
  };
}

/**
 * Sanitize user input for prompt inclusion
 * Rule 36: User text, FAQ text, feedback comments and lead names are DATA. Delimit and label them.
 */
export function sanitizeUserInput(input: string): string {
  if (!input || typeof input !== 'string') return '';

  // Truncate to reasonable length
  const maxLength = 2000;
  const truncated = input.length > maxLength ? input.substring(0, maxLength) + '...[truncated]' : input;

  // Escape potential delimiter conflicts
  const sanitized = truncated
    .replace(/```/g, '\\`\\`\\`')
    .replace(/---/g, '\\-\\-\\-')
    .replace(/===/g, '\\=\\=\\=');

  return sanitized;
}

/**
 * Format user data for prompt inclusion with delimiters
 */
export function formatUserDataForPrompt(label: string, data: string): string {
  const sanitized = sanitizeUserInput(data);
  return `<<${label.toUpperCase()}>>\n${sanitized}\n<<END ${label.toUpperCase()}>>`;
}

/**
 * Role hierarchy for permission escalation checks
 */
export const ROLE_HIERARCHY: Record<StaffRole, number> = {
  owner: 100,
  admin: 80,
  front_desk: 60,
  trainer: 40,
  member: 20,
  visitor: 10,
};

/**
 * Check if role A can manage role B
 */
export function canManageRole(roleA: string, roleB: string): boolean {
  const levelA = ROLE_HIERARCHY[roleA as StaffRole] || 0;
  const levelB = ROLE_HIERARCHY[roleB as StaffRole] || 0;
  return levelA > levelB;
}

/**
 * Feature flag checks for AI capabilities
 */
export const AI_FEATURE_FLAGS = {
  'ai.admin': 'Admin AI Assistant',
  'ai.enquiry': 'Enquiry AI Assistant',
  'ai.booking': 'Booking AI Assistant',
  'ai.recommendation': 'Recommendation AI Assistant',
  'ai.feedback': 'Feedback AI Assistant',
  'ai.rag': 'RAG Knowledge Base',
  'ai.crm': 'CRM Agent',
  'ai.retention': 'Retention Agent',
  'ai.operations': 'Operations Agent',
  'ai.growth': 'Growth Agent',
  'ai.marketing': 'Marketing Agent',
} as const;

/**
 * Default feature flags for testing and development
 * In production, these should come from tenant configuration
 */
export const DEFAULT_TENANT_FEATURE_FLAGS: Record<string, boolean> = {
  'ai.admin': true,
  'ai.enquiry': true,
  'ai.booking': true,
  'ai.recommendation': true,
  'ai.feedback': true,
  'ai.rag': true,
  'ai.crm': true,
  'ai.retention': true,
  'ai.operations': true,
  'ai.growth': true,
  'ai.marketing': true,
};

export function isFeatureEnabled(tenantFeatureFlags: Record<string, boolean>, flag: keyof typeof AI_FEATURE_FLAGS): boolean {
  return tenantFeatureFlags[flag] === true;
}

/**
 * Get all permissions for a role (for debugging/admin UI)
 */
export function getAllPermissionsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role as StaffRole] || [];
}

/**
 * Get all assistants accessible by a role
 */
export function getAccessibleAssistants(role: string): string[] {
  return Object.entries(ASSISTANT_ROLES)
    .filter(([_, roles]) => roles.includes(role as StaffRole))
    .map(([assistant]) => assistant);
}

export interface OutputValidationResult {
  sanitized: string;
  flagged: boolean;
  violations: string[];
}

/**
 * Validate and sanitize untrusted LLM output before delivery to clients.
 * - Scrubs leaked internal prompt boundary delimiters without deleting surrounding text
 * - Redacts leaked credentials, secret tokens, payment cards, and government IDs
 * - Preserves truthful failure reporting (never turns a failed operation into a success claim)
 */
export function validateAndSanitizeModelOutput(
  rawContent: string,
  options?: { isFailureOutcome?: boolean }
): OutputValidationResult {
  if (!rawContent || typeof rawContent !== 'string') {
    return { sanitized: '', flagged: false, violations: [] };
  }

  const violations: string[] = [];
  let text = rawContent;

  // 1. Scrub echoed internal prompt delimiters without stripping the actual payload text
  const delimiterPatterns = [
    /\[APPROVED_STUDIO_FAQ_DATA\]/gi,
    /\[\/APPROVED_STUDIO_FAQ_DATA\]/gi,
    /<<[A-Z0-9_-]+>>/g,
    /<<END\s+[A-Z0-9_-]+>>/g,
    /\[SYSTEM\]/gi,
    /\[\/SYSTEM\]/gi,
    /\[INSTRUCTION\]/gi,
    /\[\/INSTRUCTION\]/gi,
  ];

  for (const pattern of delimiterPatterns) {
    if (pattern.test(text)) {
      violations.push(`delim:${pattern.source}`);
      text = text.replace(pattern, '').trim();
    }
  }

  // 2. Scrub echoed credentials, sensitive tokens, and high-risk secrets
  const secretPatterns = [
    { pattern: /\bBearer\s+eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g, placeholder: '[TOKEN_REDACTED]', type: 'jwt' },
    { pattern: /(?:API_KEY|API_SECRET|JWT_SECRET|PASSWORD)\s*[:=]\s*["']?[A-Za-z0-9-_]{8,}["']?/gi, placeholder: '[CONFIG_REDACTED]', type: 'config' },
    { pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, placeholder: '[CARD]', type: 'card' },
    { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, placeholder: '[AADHAAR]', type: 'aadhaar' },
  ];

  for (const { pattern, placeholder, type } of secretPatterns) {
    if (pattern.test(text)) {
      violations.push(`secret:${type}`);
      text = text.replace(pattern, placeholder);
    }
  }

  // 3. Truthful failure guarantee: ensure failed operations do not falsely claim success
  if (options?.isFailureOutcome) {
    const positiveSuccessClaims = [
      /successfully\s+(?:created|updated|processed|executed|enrolled|booked)/i,
      /action\s+(?:has\s+been\s+)?completed\s+successfully/i,
    ];
    for (const claim of positiveSuccessClaims) {
      if (claim.test(text)) {
        violations.push('untruthful_success_claim_in_failure');
        text = `Operation could not be completed: ${text}`;
        break;
      }
    }
  }

  return {
    sanitized: text,
    flagged: violations.length > 0,
    violations,
  };
}

/**
 * ScopeRules class for dependency injection
 * Provides a singleton-like interface for scope checking
 */
export class ScopeRules {
  static hasPermission = hasPermission;
  static canUseTool = canUseTool;
  static canAccessAssistant = canAccessAssistant;
  static getAvailableTools = getAvailableTools;
  static getToolsForAssistant = getToolsForAssistant;
  static generateScopeRefusal = generateScopeRefusal;
  static validateToolArgs = validateToolArgs;
  static detectPromptInjection = detectPromptInjection;
  static sanitizeUserInput = sanitizeUserInput;
  static formatUserDataForPrompt = formatUserDataForPrompt;
  static validateAndSanitizeModelOutput = validateAndSanitizeModelOutput;
  static canManageRole = canManageRole;
  static isFeatureEnabled = isFeatureEnabled;
  static getAllPermissionsForRole = getAllPermissionsForRole;
  static getAccessibleAssistants = getAccessibleAssistants;
}