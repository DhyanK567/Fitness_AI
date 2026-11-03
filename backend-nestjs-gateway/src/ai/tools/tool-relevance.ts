/**
 * Tool Relevance Mapping for Dynamic Tool Selection
 * 
 * Maps user intent signals to relevant tools. Used for intent-based tool filtering
 * to reduce token consumption while preserving necessary capabilities.
 * 
 * This is a server-side heuristic - the LLM still decides which tool to call
 * from the filtered set. Authorization is enforced separately via canUseTool().
 */

import { ToolDefinition, TOOLS } from '@wsos/ai-tool-definitions';
import { canUseTool } from '../guardrails/scope-rules';

export interface ToolRelevanceEntry {
  /** Tool name as defined in TOOLS */
  toolName: string;
  /** Keywords that indicate this tool is relevant */
  keywords: string[];
  /** Category for fallback grouping */
  category: 'admin-read' | 'admin-write' | 'enquiry' | 'booking' | 'recommendation' | 'feedback' | 'rag' | 'internal';
  /** Tools that must be included if this tool is selected (workflow dependencies) */
  workflowDependencies?: string[];
  /** Whether this tool is commonly needed for multi-turn conversations */
  isConversational?: boolean;
}

/**
 * Relevance map for all 24+ tools.
 * Keywords are lowercase and matched against sanitized user message.
 * Workflow dependencies ensure multi-step operations have all required tools.
 */
export const TOOL_RELEVANCE_MAP: ToolRelevanceEntry[] = [
  // Admin Read Tools (P0/P1)
  {
    toolName: 'getMemberCount',
    keywords: ['member', 'count', 'how many', 'total members', 'number of members'],
    category: 'admin-read',
    isConversational: true,
  },
  {
    toolName: 'getDashboardSummary',
    keywords: [
      'dashboard',
      'summary',
      'summarize',
      'overview',
      'operational',
      'kpi',
      'metrics',
      'stats',
      'statistics',
      'status',
      'complete summary',
      'full dashboard',
      'studio dashboard',
      'fitness studio',
      'all metrics',
      'comprehensive',
    ],
    category: 'admin-read',
    isConversational: true,
  },
  {
    toolName: 'getRevenueSummary',
    keywords: ['revenue', 'income', 'sales', 'earnings', 'money', 'revenue this month', 'revenue today'],
    category: 'admin-read',
    isConversational: true,
  },
  {
    toolName: 'getRevenueTrends',
    keywords: ['trend', 'revenue trend', 'revenue over time', 'monthly revenue', 'revenue chart', 'revenue graph'],
    category: 'admin-read',
    isConversational: true,
  },
  {
    toolName: 'getExpiringMemberships',
    keywords: ['expiring', 'expiry', 'renewal', 'membership expiring', 'expiring soon', 'renewals due'],
    category: 'admin-read',
    isConversational: true,
  },
  {
    toolName: 'getLowAttendanceClasses',
    keywords: ['attendance', 'low attendance', 'empty class', 'underutilized', 'class attendance'],
    category: 'admin-read',
    isConversational: true,
  },

  // Admin Write Tools (P0/P1) - require confirmation
  {
    toolName: 'createMember',
    keywords: ['create member', 'add member', 'new member', 'register member', 'signup member'],
    category: 'admin-write',
    workflowDependencies: ['extractCreateMemberFields'],
    isConversational: true,
  },
  {
    toolName: 'extractCreateMemberFields',
    keywords: [], // Server-side only, triggered by intent detection in orchestrator
    category: 'internal',
    workflowDependencies: ['createMember'],
  },

  // Enquiry Tools (P1) - public access
  {
    toolName: 'getPublicEventList',
    keywords: ['event', 'events', 'upcoming event', 'public event', 'what events', 'event list'],
    category: 'enquiry',
    isConversational: true,
  },
  {
    toolName: 'getPublicClassSchedule',
    keywords: ['class schedule', 'schedule', 'classes', 'class times', 'when is class', 'public class'],
    category: 'enquiry',
    isConversational: true,
  },
  {
    toolName: 'getActivePlansPublic',
    keywords: ['plan', 'membership plan', 'pricing', 'price', 'membership options', 'plans available'],
    category: 'enquiry',
    isConversational: true,
  },
  {
    toolName: 'captureLead',
    keywords: ['lead', 'interested', 'sign up', 'enquiry', 'contact me', 'more info', 'callback'],
    category: 'enquiry',
    isConversational: true,
  },

  // Booking Tools (P1) - member/staff
  {
    toolName: 'getEligibleSchedule',
    keywords: ['eligible', 'my schedule', 'my classes', 'what can i book', 'available to me'],
    category: 'booking',
    isConversational: true,
  },
  {
    toolName: 'getAvailability',
    keywords: ['availability', 'seats', 'open spots', 'seat available', 'space available'],
    category: 'booking',
    isConversational: true,
  },
  {
    toolName: 'getMemberPlanEntitlement',
    keywords: ['my plan', 'entitlement', 'what am i allowed', 'plan details', 'membership details'],
    category: 'booking',
    isConversational: true,
  },
  {
    toolName: 'createBooking',
    keywords: ['book', 'reserve', 'booking', 'reserve spot', 'sign up for class'],
    category: 'booking',
    isConversational: true,
  },
  {
    toolName: 'cancelBooking',
    keywords: ['cancel', 'cancel booking', 'cancel reservation', 'drop class'],
    category: 'booking',
    isConversational: true,
  },

  // Recommendation Tools (P1) - member
  {
    toolName: 'getMemberGoalAndLevel',
    keywords: ['goal', 'level', 'my goal', 'fitness goal', 'my level'],
    category: 'recommendation',
    isConversational: true,
  },
  {
    toolName: 'getMemberAttendanceSummary',
    keywords: ['my attendance', 'attendance history', 'classes attended', 'how many classes'],
    category: 'recommendation',
    isConversational: true,
  },
  {
    toolName: 'getEligibleSessionsForRecommendation',
    keywords: ['recommend', 'recommendation', 'suggest', 'what should i', 'best class'],
    category: 'recommendation',
    isConversational: true,
  },

  // Feedback Tools (P1) - system/trainer
  {
    toolName: 'classifyFeedback',
    keywords: [], // Internal/system triggered
    category: 'feedback',
  },
  {
    toolName: 'storeFeedbackClassification',
    keywords: [], // Internal/system triggered
    category: 'feedback',
    workflowDependencies: ['classifyFeedback'],
  },
  {
    toolName: 'getFeedbackSummary',
    keywords: ['feedback', 'feedback summary', 'sentiment', 'member feedback'],
    category: 'feedback',
    isConversational: true,
  },

  // RAG / Knowledge Base Tools (P2)
  {
    toolName: 'searchKnowledgeBase',
    keywords: ['search', 'knowledge base', 'kb', 'document', 'faq', 'help article', 'policy', 'procedure'],
    category: 'rag',
    isConversational: true,
  },
  {
    toolName: 'ingestDocument',
    keywords: ['ingest', 'upload document', 'add to knowledge base', 'add document'],
    category: 'rag',
    isConversational: true,
  },
];

/**
 * Category to default tool limit for fallback scenarios
 */
export const CATEGORY_FALLBACK_LIMITS: Record<ToolRelevanceEntry['category'], number> = {
  'admin-read': 6,
  'admin-write': 2,
  'enquiry': 4,
  'booking': 4,
  'recommendation': 3,
  'feedback': 2,
  'rag': 2,
  'internal': 1,
};

/**
 * Calculate relevance score for a tool based on user message
 */
export function calculateToolRelevanceScore(
  userMessage: string,
  toolName: string,
  toolPurpose: string
): number {
  const entry = TOOL_RELEVANCE_MAP.find(e => e.toolName === toolName);
  if (!entry) return 0;

  const normalizedMessage = userMessage.toLowerCase();
  let score = 0;

  // Keyword matching (primary signal)
  for (const keyword of entry.keywords) {
    if (normalizedMessage.includes(keyword.toLowerCase())) {
      score += keyword.length; // Longer matches = more specific = higher score
    }
  }

  // Purpose description fuzzy match (secondary signal)
  const purposeWords = toolPurpose.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  for (const word of purposeWords) {
    if (normalizedMessage.includes(word)) {
      score += 2;
    }
  }

  // Boost conversational tools slightly
  if (entry.isConversational) {
    score += 1;
  }

  return score;
}

/**
 * Select relevant tools based on user intent, role permissions, and token budget
 * 
 * @param userMessage - The user's current message (sanitized)
 * @param availableTools - All tools the user is authorized to use (post getAvailableTools)
 * @param context - Conversation context for role/tenant
 * @param options - Selection options
 * @returns Filtered array of ToolDefinition objects
 */
export interface ToolSelectionOptions {
  /** Previous tool calls in this conversation turn (for workflow continuity) */
  previousToolCalls?: Array<{ name: string }>;
  /** Whether this is a follow-up request after tool execution */
  isFollowUp?: boolean;
  /** Maximum tools to select (safety cap) */
  maxTools?: number;
  /** Token budget for tool schemas (will be calculated if not provided) */
  toolTokenBudget?: number;
  /** Estimate function for tool token cost */
  estimateToolTokens?: (tool: ToolDefinition) => number;
}

export function selectRelevantTools(
  userMessage: string,
  availableTools: readonly ToolDefinition[],
  context: { role: string; tenantId: string },
  options: ToolSelectionOptions = {}
): ToolDefinition[] {
  const {
    previousToolCalls = [],
    isFollowUp = false,
    maxTools = 10,
    toolTokenBudget,
    estimateToolTokens = estimateDefaultToolTokens,
  } = options;

  // Step 1: Collect mandatory tools from workflow continuity
  const mandatoryTools = new Set<string>();
  
  // Add tools from previous turn's tool calls
  for (const tc of previousToolCalls) {
    mandatoryTools.add(tc.name);
  }

  // Add workflow dependencies for those tools
  for (const tc of previousToolCalls) {
    const entry = TOOL_RELEVANCE_MAP.find(e => e.toolName === tc.name);
    if (entry?.workflowDependencies) {
      for (const dep of entry.workflowDependencies) {
        mandatoryTools.add(dep);
      }
    }
  }

  // Step 2: Score all available tools by relevance
  const scoredTools = availableTools
    .filter(t => canUseTool(context.role, t.name)) // Security: re-validate permissions
    .map(tool => {
      const relevanceEntry = TOOL_RELEVANCE_MAP.find(e => e.toolName === tool.name);
      const baseScore = calculateToolRelevanceScore(userMessage, tool.name, tool.purpose);
      
      // Mandatory tools get maximum score
      const mandatoryBoost = mandatoryTools.has(tool.name) ? 10000 : 0;
      
      // Boost tools that are part of an active workflow
      const workflowBoost = relevanceEntry?.workflowDependencies?.some(d => mandatoryTools.has(d)) ? 100 : 0;
      
      const estimatedTokens = estimateToolTokens(tool);
      
      return {
        tool,
        score: baseScore + mandatoryBoost + workflowBoost,
        estimatedTokens,
        isMandatory: mandatoryTools.has(tool.name),
        category: relevanceEntry?.category || 'admin-read',
      };
    })
    .sort((a, b) => b.score - a.score);

  // Step 3: Select tools within budget
  const selected: ToolDefinition[] = [];
  let totalTokens = 0;
  const mandatorySelected = new Set<string>();

  // First pass: include all mandatory tools
  for (const scored of scoredTools) {
    if (scored.isMandatory) {
      selected.push(scored.tool);
      mandatorySelected.add(scored.tool.name);
      totalTokens += scored.estimatedTokens;
    }
  }

  // Check if mandatory tools exceed budget
  if (toolTokenBudget && totalTokens > toolTokenBudget) {
    throw new Error(
      `Mandatory tools for active workflow exceed token budget: ` +
      `${totalTokens} tokens required, ${toolTokenBudget} available. ` +
      `Tools: ${Array.from(mandatorySelected).join(', ')}`
    );
  }

  // Second pass: add highest-scored non-mandatory tools within budget
  const remainingBudget = toolTokenBudget ? toolTokenBudget - totalTokens : Infinity;
  
  for (const scored of scoredTools) {
    if (selected.length >= maxTools) break;
    if (mandatorySelected.has(scored.tool.name)) continue;
    
    const wouldExceedBudget = toolTokenBudget && (totalTokens + scored.estimatedTokens > toolTokenBudget);
    if (wouldExceedBudget) continue;
    
    // Only add tools with some relevance score, or fallback to category limits
    if (scored.score > 0 || !toolTokenBudget) {
      selected.push(scored.tool);
      totalTokens += scored.estimatedTokens;
    }
  }

  // Special handling: if getDashboardSummary is selected with high confidence,
  // limit other admin-read tools to avoid token bloat for comprehensive dashboard queries
  const dashboardTool = selected.find(t => t.name === 'getDashboardSummary');
  const dashboardScored = scoredTools.find(s => s.tool.name === 'getDashboardSummary');
  if (dashboardTool && dashboardScored && dashboardScored.score >= 25) {
    // High-confidence dashboard query: keep only dashboard and directly related tools
    const allowedTools = new Set(['getDashboardSummary', 'getExpiringMemberships', 'getRevenueSummary', 'getLowAttendanceClasses']);
    const filtered = selected.filter(t => allowedTools.has(t.name));
    // Recalculate tokens for filtered selection
    selected.length = 0;
    totalTokens = 0;
    for (const tool of filtered) {
      selected.push(tool);
      const scored = scoredTools.find(s => s.tool.name === tool.name);
      if (scored) totalTokens += scored.estimatedTokens;
    }
  }

  // Step 4: Safe fallback if nothing selected (uncertain intent)
  if (selected.length === 0 && !isFollowUp) {
    // Fallback: include read-only tools from primary categories for this role
    const fallbackCategories = getFallbackCategoriesForRole(context.role);
    
    for (const category of fallbackCategories) {
      const categoryTools = scoredTools
        .filter(s => s.category === category && !mandatorySelected.has(s.tool.name))
        .slice(0, CATEGORY_FALLBACK_LIMITS[category] || 3);
      
      for (const scored of categoryTools) {
        if (selected.length >= maxTools) break;
        if (toolTokenBudget && totalTokens + scored.estimatedTokens > toolTokenBudget) continue;
        
        selected.push(scored.tool);
        totalTokens += scored.estimatedTokens;
      }
    }
  }

  // Step 5: Ensure we have at least some tools (last resort)
  if (selected.length === 0 && availableTools.length > 0) {
    // Just pick the first authorized read tool
    const firstReadTool = availableTools.find(t => 
      canUseTool(context.role, t.name) && 
      TOOL_RELEVANCE_MAP.find(e => e.toolName === t.name)?.category?.endsWith('-read')
    );
    if (firstReadTool) {
      selected.push(firstReadTool);
    }
  }

  return selected;
}

/**
 * Get fallback categories based on user role
 */
function getFallbackCategoriesForRole(role: string): ToolRelevanceEntry['category'][] {
  switch (role) {
    case 'owner':
    case 'admin':
      return ['admin-read', 'admin-write', 'enquiry', 'rag', 'feedback'];
    case 'front_desk':
      return ['admin-read', 'enquiry', 'booking', 'rag'];
    case 'trainer':
      return ['booking', 'recommendation', 'feedback', 'enquiry'];
    case 'member':
      return ['booking', 'recommendation', 'enquiry', 'feedback'];
    case 'visitor':
      return ['enquiry'];
    default:
      return ['enquiry'];
  }
}

/**
 * Default token estimation for a tool schema
 */
export function estimateDefaultToolTokens(tool: ToolDefinition): number {
  // Rough estimation: name + description + JSON schema
  const nameTokens = Math.ceil(tool.name.length / 4);
  const descTokens = Math.ceil(tool.purpose.length / 3.5);
  const schemaTokens = estimateJsonSchemaTokens(tool.args);
  const overhead = 50; // Function calling format overhead
  return nameTokens + descTokens + schemaTokens + overhead;
}

/**
 * Estimate tokens for a Zod schema (simplified)
 */
function estimateJsonSchemaTokens(zodSchema: any): number {
  if (!zodSchema || !zodSchema._def) return 100;
  
  const def = zodSchema._def;
  if (def.typeName === 'ZodObject' && def.shape) {
    let total = 50; // Object overhead
    for (const [key, value] of Object.entries(def.shape)) {
      total += Math.ceil(key.length / 4) + estimateJsonSchemaTokens(value as any);
    }
    return total;
  }
  if (def.typeName === 'ZodArray') {
    return 30 + estimateJsonSchemaTokens(def.type);
  }
  if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') {
    return estimateJsonSchemaTokens(def.innerType);
  }
  // Primitive types
  return 20;
}

/**
 * Get all tool names that are workflow dependencies of a given tool
 */
export function getWorkflowDependencies(toolName: string): string[] {
  const entry = TOOL_RELEVANCE_MAP.find(e => e.toolName === toolName);
  return entry?.workflowDependencies || [];
}

/**
 * Check if a tool is part of a multi-step workflow
 */
export function isWorkflowTool(toolName: string): boolean {
  const entry = TOOL_RELEVANCE_MAP.find(e => e.toolName === toolName);
  return !!entry?.workflowDependencies?.length || 
         TOOL_RELEVANCE_MAP.some(e => e.workflowDependencies?.includes(toolName));
}