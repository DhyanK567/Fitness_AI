import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfirmationStateMachine, PendingAction, PendingActionState, createConfirmationStateMachine } from './confirmation-state-machine';
import { LlmGatewayService } from '../gateway/llm-gateway.service';
import { ScopeRules, hasPermission, canUseTool, getAvailableTools, validateToolArgs, detectPromptInjection, formatUserDataForPrompt, validateAndSanitizeModelOutput } from '../guardrails/scope-rules';
import { PiiRedaction } from '../guardrails/pii-redaction';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolDefinition, toolByName, TOOLS, PROHIBITED_TOOLS } from '@wsos/ai-tool-definitions';
import { Prisma } from '@prisma/client';
import { buildSystemPrompt } from '../prompts/system.prompt';
import { LlmObservabilityService } from '../observability/llm-observability.service';
import { PendingActionService } from '../pending-action.service';
import { ToolRegistry } from '../tools/tool-registry';
import { ExtractCreateMemberFieldsTool } from '../tools/extract-create-member-fields.tool';
import { 
  buildTokenAwareMessages, 
  TokenBudgetConfig, 
  DEFAULT_TOKEN_BUDGET_CONFIG,
  getTokenBudgetConfigFromEnv,
  TokenBudgetExceededError,
  estimateMessageTokens,
  getProviderLimits
} from '../gateway/token-estimation';
import { 
  selectRelevantTools, 
  ToolSelectionOptions,
  estimateDefaultToolTokens,
  getWorkflowDependencies,
  isWorkflowTool 
} from '../tools/tool-relevance';

export interface ConversationContext {
  tenantId: string;
  userId: string;
  role: string;
  correlationId: string;
  sessionId?: string;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

export interface OrchestratorResponse {
  response: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  pendingActionId?: string;
  confirmToken?: string;
  requiresConfirmation?: boolean;
  state?: PendingActionState;
  error?: string;
}

export interface OrchestratorConfig {
  maxHistoryTurns: number;
  llmTimeoutMs: number;
  maxToolCallsPerTurn: number;
  enableDebugLogging: boolean;
  tokenBudget?: Partial<TokenBudgetConfig>;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxHistoryTurns: 10,
  llmTimeoutMs: 30000,
  maxToolCallsPerTurn: 5,
  enableDebugLogging: false,
  tokenBudget: {},
};

/**
 * Main AI Conversation Orchestrator
 *
 * Implements the conversation loop per AI Guardrail Spec v0.1:
 * - Non-negotiable rules (1-6)
 * - Scope refusal (14-20)
 * - Grounding (24-28)
 * - PII handling (30-33)
 * - Prompt injection handling (36-39)
 * - Two-phase writes (42-46)
 * - Escalation triggers (48)
 * - Failure behavior (51)
 */
@Injectable()
export class ConversationOrchestrator {
  private readonly logger = new Logger(ConversationOrchestrator.name);
  private readonly stateMachine: ConfirmationStateMachine;
  private readonly config: OrchestratorConfig;

  constructor(
    private readonly llmGateway: LlmGatewayService,
    private readonly auditOutbox: AuditOutboxService,
    private readonly erpService: ErpnextService,
    private readonly observability: LlmObservabilityService,
    @Optional() private readonly pendingActionService?: PendingActionService,
    @Optional() private readonly stateMachineInstance?: ConfirmationStateMachine,
    @Optional() private readonly toolRegistry?: ToolRegistry,
    @Optional() config?: Partial<OrchestratorConfig>,
  ) {
    this.stateMachine = stateMachineInstance || createConfirmationStateMachine();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Merge token budget config from environment and config
    const envTokenBudget = getTokenBudgetConfigFromEnv();
    this.config.tokenBudget = { 
      ...DEFAULT_TOKEN_BUDGET_CONFIG, 
      ...envTokenBudget, 
      ...config?.tokenBudget 
    };
  }

  /**
   * Format tool results into a human-readable response when follow-up LLM call fails.
   * Provides deterministic, tool-specific formatting for key admin tools.
   */
  private formatToolResultsForUser(toolResults: ToolResult[]): string {
    if (!toolResults || toolResults.length === 0) {
      return 'No tool results to display.';
    }

    const successfulResults = toolResults.filter(r => !r.error && r.result);
    const failedResults = toolResults.filter(r => r.error);

    if (successfulResults.length === 0) {
      const errors = failedResults.map(r => `${r.name}: ${r.error}`).join('; ');
      return `All tool calls failed: ${errors}`;
    }

    const parts: string[] = [];
    
    for (const result of successfulResults) {
      const data = result.result as any;
      if (!data) continue;

      switch (result.name) {
        case 'getDashboardSummary': {
          const d = data;
          const source = d.metricSource || 'postgresql';
          const window = d.metricsWindowDays || 30;
          parts.push(
            `**Studio Dashboard (${window}-day window, source: ${source})**\n` +
            `- Active members: ${d.totalMembers ?? 0}\n` +
            `- Engaged members (last 30 days): ${d.engagedMembersLast30Days ?? 0}\n` +
            `- Eligible sessions: ${d.bookingsToday ?? d.sessions ?? 0}\n` +
            `- Verified attendances: ${d.attendancesLast30Days ?? 0}\n` +
            `- Occupancy rate: ${d.occupancyRate ?? d.occupancyRatePercent ?? 0}%\n` +
            `- Net revenue: ₹${d.netRevenueLast30Days ?? d.revenueThisMonth ?? 0}`
          );
          break;
        }
        case 'getMemberCount': {
          const count = data.total ?? data.count ?? 0;
          const status = data.status ?? 'all';
          parts.push(`**Member Count**: ${count} member(s) with status '${status}'`);
          break;
        }
        case 'getExpiringMemberships': {
          const count = data.count ?? 0;
          const days = data.daysAhead ?? 7;
          const memberships = data.memberships || [];
          if (count === 0) {
            parts.push(`No active memberships expiring within ${days} days.`);
          } else {
            parts.push(`**${count} membership(s) expiring within ${days} days:**`);
            for (const m of memberships.slice(0, 10)) {
              parts.push(`  - ${m.memberName} (${m.planName}): ends ${m.endDate}, ${m.daysRemaining} day(s) left`);
            }
            if (memberships.length > 10) {
              parts.push(`  ... and ${memberships.length - 10} more`);
            }
          }
          break;
        }
        case 'getPublicClassSchedule': {
          const count = data.count ?? 0;
          const schedules = data.schedules || [];
          if (count === 0) {
            parts.push(`No public class sessions available in the next ${data.days ?? 7} days.`);
          } else {
            parts.push(`**${count} public class session(s) available:**`);
            for (const s of schedules.slice(0, 10)) {
              const spots = s.availableSpots ?? (s.capacity - (s.bookedCount || 0));
              parts.push(`  - ${s.className} (${s.classType}): ${s.startTime} on ${s.sessionDate || s.date}, ${spots}/${s.capacity} spots`);
            }
            if (schedules.length > 10) {
              parts.push(`  ... and ${schedules.length - 10} more`);
            }
          }
          break;
        }
        case 'getOperationalAlerts': {
          const total = data.totalAlerts ?? 0;
          const open = data.openAlertsCount ?? 0;
          const alerts = data.alerts || [];
          if (total === 0) {
            parts.push('No operational alerts.');
          } else {
            parts.push(`**${total} operational alert(s)** (${open} open):`);
            for (const a of alerts.slice(0, 10)) {
              parts.push(`  - [${a.severity?.toUpperCase()}] ${a.title}: ${a.message}`);
            }
            if (alerts.length > 10) {
              parts.push(`  ... and ${alerts.length - 10} more`);
            }
          }
          break;
        }
        case 'getLowAttendanceClasses': {
          const count = data.count ?? 0;
          const classes = data.lowAttendanceClasses || [];
          if (count === 0) {
            parts.push('No classes with low attendance.');
          } else {
            parts.push(`**${count} class(es) with low attendance:**`);
            for (const c of classes.slice(0, 10)) {
              parts.push(`  - ${c.className} on ${c.date} at ${c.startTime}: ${c.utilizationPercent}% occupancy`);
            }
          }
          break;
        }
        case 'getRevenueSummary': {
          const net = data.netCollections ?? 0;
          const gross = data.grossBilling ?? 0;
          const members = data.activeMembersCount ?? 0;
          parts.push(
            `**Revenue Summary (${data.reportingWindow ?? data.arpuPeriod ?? 'period'})**\n` +
            `- Gross billing: ₹${gross}\n` +
            `- Refunds: ₹${data.refundTotals ?? 0}\n` +
            `- Net collections: ₹${net}\n` +
            `- Active members: ${members}\n` +
            `- ARPU: ₹${data.arpu ?? 0}`
          );
          break;
        }
        case 'getRevenueTrends': {
          const trends = data.trends || [];
          parts.push(`**Revenue Trends (${data.periodDays ?? data.period ?? 'period'})**`);
          if (trends.length > 0) {
            for (const t of trends.slice(0, 5)) {
              parts.push(`  - ${t.date}: ₹${t.netRevenue ?? t.net_revenue ?? 0} (${t.transactionCount ?? 0} txns)`);
            }
          }
          break;
        }
        default: {
          // Generic formatting for unknown tools
          const summary = data.summary ?? JSON.stringify(data).slice(0, 200);
          parts.push(`**${result.name}**: ${summary}`);
        }
      }
    }

    if (failedResults.length > 0) {
      const errors = failedResults.map(r => `${r.name}: ${r.error}`).join('; ');
      parts.push(`\n⚠️ Some operations failed: ${errors}`);
    }

    if (parts.length === 0) {
      return 'Tool execution completed but returned no displayable data.';
    }

    return parts.join('\n\n');
  }

  /**
   * Process a user message through the conversation loop
   */
  async processMessage(
    context: ConversationContext,
    userMessage: string,
    history: ConversationTurn[] = [],
  ): Promise<OrchestratorResponse> {
    const startTime = Date.now();

    try {
      // 1. Validate context and check for prompt injection
      const injectionCheck = detectPromptInjection(userMessage);
      if (injectionCheck.detected) {
        this.logger.warn(`Prompt injection detected for user ${context.userId}: ${injectionCheck.patterns.join(', ')}`);
        await this.auditSecurityEvent(context, 'prompt_injection_attempt', { patterns: injectionCheck.patterns });
        return this.createRefusalResponse(
          "I can't process that request. Please rephrase and try again.",
          context
        );
      }

      // 1b. Check for member creation intent: extract sensitive fields deterministically server-side
      const isExtractRequest = /^(?:extract|parse)\b/i.test(userMessage.trim());
      const isMemberCreateIntent =
        !isExtractRequest &&
        (/(?:create|add|register)\s+(?:a\s+)?member/i.test(userMessage) ||
          /member\s+named/i.test(userMessage) ||
          /(?:create|add|register)\s+(?:a\s+)?member\s+[A-Za-z].*phone/i.test(userMessage));

      if (isMemberCreateIntent) {
        // Enforce role authorization before proposing any action
        if (!canUseTool(context.role, 'createMember')) {
          await this.auditSecurityEvent(context, 'unauthorized_member_create_attempt', {
            userMessage: PiiRedaction.redact(userMessage).redacted,
            requiredPermission: 'members:create',
          });
          return this.createRefusalResponse(
            "I can't help with that request. You don't have permission to create members. Please contact an administrator or front desk staff.",
            context,
          );
        }

        const extraction = ExtractCreateMemberFieldsTool.extractFields(userMessage);

        if (extraction.isAmbiguousPhone || extraction.isMalformedPhone || !extraction.isComplete) {
          const prompt =
            extraction.clarificationPrompt ||
            "Please provide the member's full name and phone number (E.164 format, e.g. +919876543210) to create the member record.";
          return {
            response: prompt,
            toolCalls: [],
          };
        }

        // All mandatory fields present and strictly validated to E.164.
        // Propose pending action directly with server-controlled verified fields.
        // Raw PII stays server-side; LLM cannot alter or drop them.
        return await this.handlePendingActionProposal(context, {
          content: undefined,
          pendingAction: {
            toolName: 'createMember',
            arguments: {
              fullName: extraction.extracted.fullName!,
              phone: extraction.extracted.phone!,
              email: extraction.extracted.email,
              startDate: extraction.extracted.startDate,
              planId: extraction.extracted.planId,
            },
          },
        });
      }

      // 2. Redact PII from user message before sending to LLM
      const { redacted: sanitizedMessage, redactions } = PiiRedaction.redact(userMessage);

      if (redactions.length > 0) {
        this.logger.debug(`Redacted ${redactions.length} PII items from user message`);
      }

      // 3. Get available tools for this role
      const availableTools = getAvailableTools(context.role, this.getAllToolDefinitions());

      if (availableTools.length === 0) {
        return this.createRefusalResponse(
          "I don't have any tools available for your role. Please contact studio staff.",
          context
        );
      }

      // 4. Build system prompt with guardrails
      const systemPrompt = this.buildSystemPrompt(context, availableTools);

      // 5. Prepare conversation history with token budget awareness
      const { messages: trimmedMessages, selectedTools } = this.prepareMessages(
        history, 
        sanitizedMessage, 
        systemPrompt, 
        availableTools,
        context, // pass context for tool selection
        false, // isFollowUp
        [] // previousToolCalls
      );

      // 6. Call LLM with tools
      const llmResponse = await this.callLlmWithTools(trimmedMessages, selectedTools, context);

      // 7. Handle tool calls if any
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        return await this.handleToolCalls(
          context,
          { ...llmResponse, toolCalls: llmResponse.toolCalls },
          trimmedMessages,
          availableTools,
          history,
        );
      }

      // 8. Check for pending action proposal (write tools)
      if (llmResponse.pendingAction) {
        return await this.handlePendingActionProposal(context, { ...llmResponse, pendingAction: llmResponse.pendingAction });
      }

      // 9. Regular response
      const rawContent = llmResponse.content || "I understand. Is there anything else I can help you with?";
      const outputCheck = validateAndSanitizeModelOutput(rawContent);
      if (outputCheck.flagged) {
        this.logger.warn(`Model output sanitized for user ${context.userId}: ${outputCheck.violations.join(', ')}`);
      }

      const response: OrchestratorResponse = {
        response: outputCheck.sanitized,
        toolCalls: llmResponse.toolCalls || [],
      };

      // 10. Audit the interaction
      await this.auditInteraction(context, userMessage, response, Date.now() - startTime);

      return response;

    } catch (error) {
      const err = error as Error;
      this.logger.error(`Conversation error for user ${context.userId}:`, err);
      await this.auditSecurityEvent(context, 'conversation_error', { error: err.message });
      return this.handleError(err, context);
    }
  }

  /**
   * Handle tool calls from LLM
   */
  private async handleToolCalls(
    context: ConversationContext,
    llmResponse: { content?: string; toolCalls: ToolCall[]; pendingAction?: any } & { toolCalls: ToolCall[] },
    messages: any[],
    availableTools: ToolDefinition[],
    history: ConversationTurn[],
  ): Promise<OrchestratorResponse> {
    const toolResults: ToolResult[] = [];

    for (const toolCall of llmResponse.toolCalls.slice(0, this.config.maxToolCallsPerTurn)) {
      const result = await this.executeTool(context, toolCall, availableTools);
      toolResults.push(result);
    }

    const allFailed = toolResults.length > 0 && toolResults.every(r => !!r.error);
    const anyFailed = toolResults.some(r => !!r.error);
    const failedErrors = toolResults
      .filter(r => !!r.error)
      .map(r => (toolResults.length > 1 ? `${r.name}: ${r.error}` : r.error))
      .join('; ');

    // 8. Second LLM call with tool results - use token-aware message construction
    // Include previous tool calls for workflow continuity in tool selection
    const previousToolCalls = llmResponse.toolCalls.map(tc => ({ name: tc.name }));
    
    // Build follow-up messages with tool results
    const followUpMessages = [
      ...messages,
      {
        role: 'assistant',
        content: llmResponse.content,
        tool_calls: llmResponse.toolCalls,
        providerData: (llmResponse as any).providerData,
      },
      ...toolResults.map(r => ({
        role: 'tool' as const,
        tool_call_id: r.toolCallId,
        name: r.name,
        content: r.error ? `Error: ${r.error}` : JSON.stringify(r.result),
      })),
    ];

    // Get system prompt from original messages
    const systemMessage = messages.find(m => m.role === 'system');
    const systemPrompt = systemMessage?.content || '';
    
    // Get the latest user message from original messages
    const userMessages = messages.filter(m => m.role === 'user');
    const latestUserMessage = userMessages[userMessages.length - 1]?.content || '';
    
    // Use the conversation history from the original messages
    const historyForFollowUp = messages
      .filter(m => m.role !== 'system')
      .slice(0, -1); // Exclude the latest user message
    
    // Convert to ConversationTurn format (simplified for token budget)
    const conversationHistory: ConversationTurn[] = historyForFollowUp.map(m => ({
      role: m.role as any,
      content: m.content,
      toolCalls: m.tool_calls ? m.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || tc.name,
        arguments: typeof tc.function?.arguments === 'string' 
          ? JSON.parse(tc.function.arguments) 
          : tc.function?.arguments || tc.arguments
      })) : undefined,
      toolResults: m.role === 'tool' ? [{
        toolCallId: m.tool_call_id,
        name: m.name,
        result: m.content,
        error: m.content.startsWith('Error:') ? m.content.replace('Error: ', '') : undefined,
      }] : undefined,
      timestamp: new Date(),
    }));

    let finalFollowUpResult: { messages: any[]; selectedTools: ToolDefinition[] };
    try {
      finalFollowUpResult = this.prepareMessages(
        conversationHistory,
        latestUserMessage,
        systemPrompt,
        availableTools,
        context, // pass context for tool selection
        true, // isFollowUp
        previousToolCalls,
        toolResults // pass current turn's tool results
      );
    } catch (error) {
      if (error instanceof TokenBudgetExceededError) {
        this.logger.warn(`Follow-up token budget exceeded, using original messages: ${error.message}`);
        finalFollowUpResult = { messages: followUpMessages, selectedTools: availableTools };
      } else {
        throw error;
      }
    }

    let finalResponse: { content?: string; toolCalls?: ToolCall[]; pendingAction?: any; error?: string };
    try {
      finalResponse = await this.callLlmWithTools(
        finalFollowUpResult.messages, 
        finalFollowUpResult.selectedTools, 
        context
      );
    } catch (llmErr) {
      this.logger.warn(`Follow-up LLM call failed after tool execution: ${(llmErr as Error).message}`);
      finalResponse = { error: (llmErr as Error).message };
    }
    
    // Handle LLM error response (e.g., TPM exceeded) - use the LLM's user-friendly error message
    if (finalResponse.error) {
      this.logger.warn(`Follow-up LLM returned error: ${finalResponse.error}`);
      
      // Check if LLM error is a TPM/timeout/rate-limit error - these should show user-friendly message
      const isLlmRateLimitError = 
        finalResponse.error === 'GROQ_TPM_EXCEEDED' ||
        finalResponse.error === 'LLM_UNAVAILABLE' ||
        (finalResponse.content && (
          finalResponse.content.toLowerCase().includes('high demand') ||
          finalResponse.content.toLowerCase().includes('rate limit') ||
          finalResponse.content.toLowerCase().includes('timeout')
        ));
      
      // If tools failed but LLM error is a rate-limit/timeout, prefer LLM's user-friendly message
      if (allFailed && !isLlmRateLimitError) {
        const failureResponse: OrchestratorResponse = {
          response: `I was unable to complete your request because the operation failed: ${failedErrors}`,
          toolCalls: [],
          toolResults,
          error: finalResponse.error,
        };
        await this.auditInteraction(context, '', failureResponse, 0, toolResults);
        return failureResponse;
      }
      
      // Use LLM's user-friendly message for rate-limit/timeout, or when tools succeeded
      const llmErrorContent = finalResponse.content || 'I encountered an issue. Please try again.';
      if (allFailed || anyFailed) {
        const partialResponse: OrchestratorResponse = {
          response: llmErrorContent,
          toolCalls: [],
          toolResults,
          error: finalResponse.error,
        };
        await this.auditInteraction(context, '', partialResponse, 0, toolResults);
        return partialResponse;
      }
      
      // Deterministic fallback: format tool results when LLM fails but tools succeeded
      const fallbackContent = this.formatToolResultsForUser(toolResults);
      const partialResponse: OrchestratorResponse = {
        response: fallbackContent,
        toolCalls: [],
        toolResults,
        error: 'Follow-up LLM unavailable; showing tool results directly',
      };
      await this.auditInteraction(context, '', partialResponse, 0, toolResults);
      return partialResponse;
    }

    // Check for pending action in follow-up
    if (finalResponse.pendingAction) {
      return await this.handlePendingActionProposal(context, {
        content: finalResponse.content,
        pendingAction: finalResponse.pendingAction
      });
    }

    // Return the original tool calls that were executed, not the follow-up response's tool calls
    const executedToolCalls = llmResponse.toolCalls || [];

    // Check if any executed tool was a write tool (action that modifies state)
    const writeTools = new Set(['createMember', 'createBooking', 'cancelBooking', 'checkIn', 'createPayment', 'activateMembership']);
    const hasWriteTool = executedToolCalls.some(tc => writeTools.has(tc.name));

    // Determine safe, truthful response content
    let finalContent = finalResponse.content?.trim();
    
    if (allFailed) {
      if (!finalContent) {
        finalContent = `I was unable to complete your request because the operation failed: ${failedErrors}`;
      }
    } else if (anyFailed) {
      if (!finalContent) {
        finalContent = `Some actions could not be completed. ${failedErrors}`;
      }
    } else {
      // All tools succeeded
      if (!finalContent) {
        // For read-only analytical queries, format the tool results directly
        // instead of using a generic "completed action" message
        if (!hasWriteTool) {
          finalContent = this.formatToolResultsForUser(toolResults);
        } else {
          finalContent = "I've completed that action. Is there anything else?";
        }
      }
    }

    const outputCheck = validateAndSanitizeModelOutput(finalContent || '', { isFailureOutcome: allFailed });
    if (outputCheck.flagged) {
      this.logger.warn(`Model tool follow-up output sanitized for user ${context.userId}: ${outputCheck.violations.join(', ')}`);
    }

    const response: OrchestratorResponse = {
      response: outputCheck.sanitized,
      toolCalls: executedToolCalls,
      toolResults,
      error: allFailed ? failedErrors : undefined,
    };

    await this.auditInteraction(context, '', response, 0, toolResults);
    return response;
  }

  /**
   * Execute a single tool call
   */
  private async executeTool(
    context: ConversationContext,
    toolCall: ToolCall,
    availableTools: ToolDefinition[],
  ): Promise<ToolResult> {
    const { id, name, arguments: args } = toolCall;

    // 1. Prioritize canonical ToolRegistry if available
    if (this.toolRegistry) {
      const toolRes = await this.toolRegistry.execute(
        name,
        {
          tenantId: context.tenantId,
          userId: context.userId,
          role: context.role,
          correlationId: context.correlationId,
          isConfirmedPendingAction: false,
        },
        args,
        { isConfirmedPendingAction: false },
      );

      return {
        toolCallId: id,
        name,
        result: toolRes.success ? toolRes.data : null,
        error: toolRes.success ? undefined : toolRes.error,
      };
    }

    // 2. In-memory / unit-test fallback when ToolRegistry is not injected
    // Check prohibited tools (Phase 1 guardrail)
    if (PROHIBITED_TOOLS.includes(name as any)) {
      this.logger.warn(`Execution attempted for prohibited tool "${name}" in fallback mode`);
      await this.auditSecurityEvent(context, 'prohibited_tool_attempt', { toolName: name });
      return {
        toolCallId: id,
        name,
        result: null,
        error: `Tool ${name} is prohibited in current phase`,
      };
    }

    // Find tool definition
    const toolDef = toolByName(name);
    if (!toolDef) {
      return {
        toolCallId: id,
        name,
        result: null,
        error: `Unknown tool: ${name}`,
      };
    }

    // Check permissions
    if (!canUseTool(context.role, name)) {
      await this.auditSecurityEvent(context, 'unauthorized_tool_access', { tool: name });
      return {
        toolCallId: id,
        name,
        result: null,
        error: `Access denied: insufficient permissions for tool ${name}`,
      };
    }

    // Side-effect & write confirmation enforcement (Defense-in-depth: fail-closed)
    const isWriteTool = toolDef.requiresConfirmation || toolDef.risk === 'write';
    const isConfirmed = (context as any).isConfirmedPendingAction === true;

    if (isWriteTool && !isConfirmed) {
      this.logger.warn(
        `Direct execution blocked for side-effecting tool "${name}" without confirmed pending action in fallback mode`,
      );
      await this.auditSecurityEvent(context, 'unconfirmed_write_tool_blocked', { toolName: name });
      return {
        toolCallId: id,
        name,
        result: null,
        error: `Tool ${name} requires pending-action confirmation before execution`,
      };
    }

    // Validate arguments against schema
    const validation = validateToolArgs(toolDef.args, args);
    if (!validation.success) {
      return {
        toolCallId: id,
        name,
        result: null,
        error: `Invalid arguments: ${validation.errors.join(', ')}`,
      };
    }

    try {
      // Execute the tool via ERP service
      const result = await this.callErpTool(context, name, validation.data);

      // Audit the tool call only if toolRegistry is not already handling it
      if (!this.toolRegistry) {
        await this.auditToolCall(context, name, validation.data, result);
      }

      return {
        toolCallId: id,
        name,
        result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
      this.logger.error(`Tool ${name} failed:`, error);

      if (!this.toolRegistry) {
        await this.auditSecurityEvent(context, 'tool_execution_error', {
          tool: name,
          error: errorMessage,
        });
      }

      return {
        toolCallId: id,
        name,
        result: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Call ERP tool method
   */
  async callErpTool(
    context: ConversationContext,
    toolName: string,
    args: Record<string, unknown>,
    options?: { isConfirmedPendingAction?: boolean },
  ): Promise<unknown> {
    if (this.toolRegistry) {
      const isConfirmed = options?.isConfirmedPendingAction ?? true;
      const res = await this.toolRegistry.execute(
        toolName,
        {
          tenantId: context.tenantId,
          userId: context.userId,
          role: context.role,
          correlationId: context.correlationId,
          isConfirmedPendingAction: isConfirmed,
        },
        args,
        { isConfirmedPendingAction: isConfirmed },
      );

      if (!res.success) {
        throw new Error(res.error || `Tool ${toolName} execution failed`);
      }
      return res.data;
    }
    // Map tool names to ERP methods
    const toolToErpMethod: Record<string, string> = {
      // Admin tools (P0)
      'getExpiringMemberships': ERP_METHODS.REPORT_EXPIRING_MEMBERSHIPS,
      'getLowAttendanceClasses': ERP_METHODS.REPORT_LOW_ATTENDANCE,
      'extractCreateMemberFields': 'wellness_studio.api.ai.extract_member_fields',
      'createMember': ERP_METHODS.MEMBER_CREATE,
      'getMemberCount': ERP_METHODS.MEMBER_LIST,
      'getDashboardSummary': ERP_METHODS.REPORT_DASHBOARD_STATS,
      'getPublicEventList': ERP_METHODS.EVENT_LIST,
      'getPublicClassSchedule': ERP_METHODS.SCHEDULE_LIST,
      'getActivePlansPublic': ERP_METHODS.MEMBERSHIP_LIST,
      'captureLead': ERP_METHODS.LEAD_CREATE,
      'getEligibleSchedule': ERP_METHODS.SCHEDULE_LIST,
      'getAvailability': ERP_METHODS.BOOKING_LIST,
      'getMemberPlanEntitlement': ERP_METHODS.MEMBERSHIP_GET,
      'createBooking': 'wellness_studio.api.booking.book_by_schedule',
      'cancelBooking': ERP_METHODS.BOOKING_CANCEL,
      'getMemberGoalAndLevel': ERP_METHODS.MEMBER_GET,
      'getMemberAttendanceSummary': ERP_METHODS.ATTENDANCE_LIST,
      'getEligibleSessionsForRecommendation': ERP_METHODS.SCHEDULE_LIST,
      'getRevenueSummary': ERP_METHODS.REPORT_REVENUE_SUMMARY,
      'getRevenueTrends': ERP_METHODS.REPORT_REVENUE_TRENDS,

      // CRM Agent tools (Phase 3)
      'scoreLead': ERP_METHODS.PIPELINE_ENTRY_LIST, // placeholder
      'getPipelineOverview': ERP_METHODS.PIPELINE_STAGE_LIST,
      'moveLeadInPipeline': ERP_METHODS.PIPELINE_ENTRY_MOVE,
      'createPipelineStage': ERP_METHODS.PIPELINE_STAGE_CREATE,
      'createCrmCampaign': ERP_METHODS.CRM_CAMPAIGN_CREATE,
      'enrollInCampaign': ERP_METHODS.CRM_CAMPAIGN_ENROLL,
      'getCampaignMetrics': ERP_METHODS.CRM_CAMPAIGN_METRICS,

      // Retention Agent tools (Phase 4)
      'calculateChurnRisk': ERP_METHODS.RETENTION_METRICS,
      'getHighRiskMembers': ERP_METHODS.RETENTION_METRICS,
      'calculateEngagementScore': ERP_METHODS.RETENTION_METRICS,
      'getLowEngagementMembers': ERP_METHODS.RETENTION_METRICS,
      'createWinbackCampaign': ERP_METHODS.WINBACK_CAMPAIGN_CREATE,
      'sendWinbackCampaign': ERP_METHODS.WINBACK_CAMPAIGN_SEND,
      'createRetentionAction': ERP_METHODS.RETENTION_ACTION_CREATE,
      'getRetentionActions': ERP_METHODS.RETENTION_ACTION_LIST,
      'getRetentionMetrics': ERP_METHODS.RETENTION_METRICS,

      // RAG tools (Phase 2)
      'searchKnowledgeBase': 'wellness_studio.api.rag.search',
      'ingestDocument': 'wellness_studio.api.rag.ingest_document',
      'ingestFAQ': 'wellness_studio.api.rag.ingest_faq',
      'listKnowledgeBases': 'wellness_studio.api.rag.list_knowledge_bases',
      'deleteDocument': 'wellness_studio.api.rag.delete_document',
      'getDocumentStatus': 'wellness_studio.api.rag.get_document_status',

      // Operations Agent tools (Phase 5)
      'getClassCapacityUtilization': ERP_METHODS.REPORT_CLASS_CAPACITY_UTILIZATION,
      'getStaffSchedule': ERP_METHODS.STAFF_SCHEDULE_LIST,
      'createStaffSchedule': ERP_METHODS.STAFF_SCHEDULE_CREATE,
      'getEquipmentStatus': ERP_METHODS.EQUIPMENT_LIST,
      'scheduleEquipmentMaintenance': ERP_METHODS.EQUIPMENT_MAINTENANCE_SCHEDULE,
      'getFacilityUtilization': ERP_METHODS.FACILITY_UTILIZATION,
      // 'manageWaitlist': removed - use dedicated tool classes
      'getOperationalAlerts': ERP_METHODS.GET_OPERATIONAL_ALERTS,
      'acknowledgeOperationalAlert': ERP_METHODS.ACKNOWLEDGE_OPERATIONAL_ALERT,
      'getClassCancellationImpact': ERP_METHODS.GET_CLASS_CANCELLATION_IMPACT,
      'optimizeClassSchedule': ERP_METHODS.OPTIMIZE_CLASS_SCHEDULE,

      // Growth Agent tools (Phase 5)
      'getAcquisitionMetrics': ERP_METHODS.GET_ACQUISITION_METRICS,
      'getReferralProgramMetrics': ERP_METHODS.GET_REFERRAL_METRICS,
      'createReferralCampaign': ERP_METHODS.CREATE_REFERRAL_CAMPAIGN,
      'getUpsellOpportunities': ERP_METHODS.GET_UPSELL_OPPORTUNITIES,
      'createUpsellOffer': ERP_METHODS.CREATE_UPSELL_OFFER,
      'getLifetimeValueMetrics': ERP_METHODS.GET_LIFETIME_VALUE_METRICS,
      'getExpansionOpportunities': ERP_METHODS.GET_EXPANSION_OPPORTUNITIES,
      'trackGrowthExperiment': ERP_METHODS.TRACK_GROWTH_EXPERIMENT,
      'createGrowthExperiment': ERP_METHODS.CREATE_GROWTH_EXPERIMENT,

      // Marketing Agent tools (Phase 5)
      'getCampaignPerformance': ERP_METHODS.GET_CAMPAIGN_PERFORMANCE,
      'createMarketingCampaign': ERP_METHODS.CREATE_MARKETING_CAMPAIGN,
      'getAudienceSegments': ERP_METHODS.GET_AUDIENCE_SEGMENTS,
      'createAudienceSegment': ERP_METHODS.CREATE_AUDIENCE_SEGMENT,
      'getContentCalendar': ERP_METHODS.GET_CONTENT_CALENDAR,
      'scheduleContent': ERP_METHODS.SCHEDULE_CONTENT,
      'getLeadAttribution': ERP_METHODS.GET_LEAD_ATTRIBUTION,
      'getBrandHealthMetrics': ERP_METHODS.GET_BRAND_HEALTH_METRICS,
      'manageReviewResponse': ERP_METHODS.MANAGE_REVIEW_RESPONSE,
      'getCompetitorIntelligence': ERP_METHODS.GET_COMPETITOR_INTELLIGENCE,
    };

    const erpMethod = toolToErpMethod[toolName];
    if (!erpMethod) {
      throw new Error(`No ERP method mapped for tool: ${toolName}`);
    }

    // Prepare ERP call context
    const erpContext = {
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      userId: context.userId,
      role: context.role,
    };

    // Call ERP method
    const result = await this.erpService.call({
      ...erpContext,
      method: erpMethod,
      body: args,
    });

    return result;
  }

  /**
   * Handle pending action proposal (two-phase write)
   */
  private async handlePendingActionProposal(
    context: ConversationContext,
    llmResponse: { content?: string; pendingAction: { toolName: string; arguments: Record<string, unknown> } } & { pendingAction: { toolName: string; arguments: Record<string, unknown> } },
  ): Promise<OrchestratorResponse> {
    const { toolName, arguments: args } = llmResponse.pendingAction;

    // Verify this is a write tool that requires confirmation
    const toolDef = toolByName(toolName);
    if (!toolDef || !toolDef.requiresConfirmation) {
      throw new Error(`Tool ${toolName} does not require confirmation`);
    }

    // Defense-in-depth: Validate createMember arguments before proposing
    if (toolName === 'createMember') {
      const phone = typeof args.phone === 'string' ? args.phone.trim().replace(/[\s()-]/g, '') : '';
      if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
        return {
          response:
            'Phone must use E.164 format (e.g., +919876543210 or +12025550123 with country code and leading +). Please provide a valid phone number to proceed.',
          toolCalls: [],
        };
      }
      if (!args.fullName || typeof args.fullName !== 'string' || args.fullName.trim().length === 0) {
        return {
          response: "Please provide the member's full name to proceed with creating the member record.",
          toolCalls: [],
        };
      }
    }

    if (toolName === 'createBooking') {
      const scheduleId = typeof args.classScheduleId === 'string' ? args.classScheduleId.trim() : '';
      if (!scheduleId) {
        return {
          response: 'Please specify the class schedule ID you would like to book.',
          toolCalls: [],
        };
      }
      const bookingDate = typeof args.bookingDate === 'string' ? args.bookingDate.trim() : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
        return {
          response: 'Please provide the booking date in YYYY-MM-DD format.',
          toolCalls: [],
        };
      }
      if (context.role === 'member') {
        args.memberId = context.userId;
      }
    }

    if (toolName === 'cancelBooking') {
      const bookingId = typeof args.bookingId === 'string' ? args.bookingId.trim() : '';
      if (!bookingId) {
        return {
          response: 'Please provide the booking ID to cancel.',
          toolCalls: [],
        };
      }
    }

    let actionId: string;
    let confirmToken: string;

    let actionSummary = `Proposed ${toolName}`;
    if (toolName === 'createBooking') {
      actionSummary = `Book session ${args.classScheduleId} on ${args.bookingDate}`;
    } else if (toolName === 'cancelBooking') {
      actionSummary = `Cancel booking ${args.bookingId}`;
    } else if (toolName === 'createMember') {
      actionSummary = `Create member ${args.fullName}`;
    }

    if (this.pendingActionService) {
      const ttlMinutes = 10; // Expiry 10 min per Document 5 Section 6.1
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
      const created = await this.pendingActionService.create({
        tenantId: context.tenantId,
        userId: context.userId,
        conversationId: (context as any).sessionId || (context as any).conversationId,
        actionType: toolName,
        payload: args,
        proposedBy: context.userId,
        summary: actionSummary,
        expiresAt,
      });

      actionId = created.id;
      confirmToken = created.confirmToken || '';

      // Register with state machine to keep in-memory cache in sync
      this.stateMachine.registerExternalAction({
        id: created.id,
        tenantId: created.tenantId,
        userId: created.userId,
        toolName: created.actionType,
        arguments: args,
        state: PendingActionState.PROPOSED,
        confirmToken: created.confirmToken || undefined,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        retryCount: 0,
        maxRetries: 3,
      });
    } else {
      // In-memory fallback for pure unit tests
      const pendingAction = this.stateMachine.propose({
        tenantId: context.tenantId,
        userId: context.userId,
        toolName,
        arguments: args,
        ttlMinutes: 5,
      });
      actionId = pendingAction.id;
      confirmToken = pendingAction.confirmToken!;
    }

    // Format confirmation message
    const confirmMessage = this.formatConfirmationMessage(toolName, args, confirmToken);

    // Include the proposed tool call in the response for test compatibility
    const proposedToolCall: ToolCall = {
      id: 'pending_' + actionId,
      name: toolName,
      arguments: args,
    };

    return {
      response: llmResponse.content || confirmMessage,
      toolCalls: [proposedToolCall],
      pendingActionId: actionId,
      confirmToken,
      requiresConfirmation: true,
      state: PendingActionState.PROPOSED,
    };
  }

  /**
   * Confirm and execute a pending action
   */
  async confirmPendingAction(
    context: ConversationContext,
    actionId: string,
    confirmToken: string,
  ): Promise<OrchestratorResponse> {
    if (this.pendingActionService) {
      try {
        const { action, result } = await this.pendingActionService.confirmAndExecute(
          context.tenantId,
          actionId,
          context.userId,
          confirmToken,
          async (persistedAction) => {
            // CRITICAL: Execute strictly using the frozen database arguments!
            return await this.callErpTool(
              context,
              persistedAction.actionType,
              persistedAction.payload as Record<string, unknown>,
            );
          },
        );

        return {
          response: `Action completed successfully. ${this.formatResultMessage(action.actionType, result)}`,
          toolCalls: [],
          state: PendingActionState.SUCCEEDED,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Execution failed';
        return {
          response: `Action failed: ${errorMessage}. Please try again or contact staff.`,
          toolCalls: [],
          state: PendingActionState.FAILED,
          error: errorMessage,
        };
      }
    }

    // Confirm the action via in-memory state machine fallback
    const action = this.stateMachine.confirm({
      actionId,
      confirmToken,
      userId: context.userId,
    });

    // Execute the action
    const { action: executedAction, result } = await this.stateMachine.execute({
      actionId,
      executor: async () => {
        return await this.callErpTool(context, action.toolName, action.arguments);
      },
    });

    if (executedAction.state === PendingActionState.SUCCEEDED) {
      return {
        response: `Action completed successfully. ${this.formatResultMessage(action.toolName, result)}`,
        toolCalls: [],
        state: PendingActionState.SUCCEEDED,
      };
    } else {
      return {
        response: `Action failed: ${executedAction.error}. Please try again or contact staff.`,
        toolCalls: [],
        state: PendingActionState.FAILED,
      };
    }
  }

  /**
   * Cancel a pending action
   */
  async cancelPendingAction(
    context: ConversationContext,
    actionId: string,
  ): Promise<OrchestratorResponse> {
    if (this.pendingActionService) {
      await this.pendingActionService.cancel(context.tenantId, actionId, context.userId);
    } else {
      this.stateMachine.cancel(actionId, context.userId);
    }
    return {
      response: "Action cancelled. Is there anything else I can help you with?",
      toolCalls: [],
      state: PendingActionState.CANCELLED,
    };
  }

  /**
   * Execute an already approved action using frozen database arguments
   */
  async executeApprovedAction(
    context: ConversationContext,
    actionId: string,
    idempotencyKey?: string,
  ): Promise<OrchestratorResponse> {
    if (this.pendingActionService) {
      try {
        const executed = await this.pendingActionService.execute(
          context.tenantId,
          actionId,
          context.userId,
          idempotencyKey,
          async (persistedAction) => {
            return await this.callErpTool(
              context,
              persistedAction.actionType,
              persistedAction.payload as Record<string, unknown>,
            );
          },
        );
        return {
          response: `Action completed successfully. ${this.formatResultMessage(executed.actionType, executed.result)}`,
          toolCalls: [],
          state: PendingActionState.SUCCEEDED,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Execution failed';
        return {
          response: `Action failed: ${errorMessage}`,
          toolCalls: [],
          state: PendingActionState.FAILED,
          error: errorMessage,
        };
      }
    }
    throw new Error('PendingActionService is required to execute approved actions');
  }

  /**
   * Build system prompt with guardrails
   */
  private buildSystemPrompt(context: ConversationContext, availableTools: ToolDefinition[]): string {
    return buildSystemPrompt(context.role, availableTools);
  }

  /**
   * Prepare messages for LLM call with token budget awareness
   * Returns both trimmed messages and the selected tool definitions
   */
  private prepareMessages(
    history: ConversationTurn[], 
    userMessage: string, 
    systemPrompt: string,
    availableTools: ToolDefinition[],
    context: ConversationContext,
    isFollowUp: boolean = false,
    previousToolCalls: Array<{ name: string }> = [],
    currentToolResults?: ToolResult[]
  ): {
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      tool_call_id?: string;
      name?: string;
      tool_calls?: any[];
    }>;
    selectedTools: ToolDefinition[];
  } {
    // Build history messages from conversation turns
    const historyMessages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
      name?: string;
      tool_call_id?: string;
      tool_calls?: any[];
    }> = [];

    // Add recent history (limited by config)
    const recentHistory = history.slice(-this.config.maxHistoryTurns);
    for (const turn of recentHistory) {
      if (turn.role === 'user') {
        historyMessages.push({ role: 'user', content: turn.content });
      } else if (turn.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant', content: turn.content };
        if (turn.toolCalls && turn.toolCalls.length > 0) {
          assistantMsg.tool_calls = turn.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
          }));
        }
        historyMessages.push(assistantMsg);
      } else if (turn.role === 'tool') {
        for (const result of turn.toolResults || []) {
          historyMessages.push({
            role: 'tool',
            tool_call_id: result.toolCallId,
            name: result.name,
            content: result.error ? `Error: ${result.error}` : JSON.stringify(result.result),
          });
        }
      }
    }

    // Build the complete message array for token-aware construction
    const allMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...historyMessages,
      { role: 'user' as const, content: userMessage }
    ];

    // Include current turn's tool results in follow-up messages
    // This ensures the LLM sees the actual tool results when generating the final response
    if (isFollowUp && currentToolResults && currentToolResults.length > 0) {
      for (const result of currentToolResults) {
        allMessages.push({
          role: 'tool' as const,
          tool_call_id: result.toolCallId,
          name: result.name,
          content: result.error ? `Error: ${result.error}` : JSON.stringify(result.result),
        });
      }
    }

    // Dynamic tool selection based on user intent, role, permissions, and workflow
    const provider = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
    const limits = getProviderLimits(provider);
    const tokenBudgetConfig = { 
      ...DEFAULT_TOKEN_BUDGET_CONFIG, 
      ...getTokenBudgetConfigFromEnv(), 
      ...this.config.tokenBudget 
    };
    
    // Calculate effective input budget (same logic as in token-estimation)
    const maxAllowedInput = Math.min(
      tokenBudgetConfig.maxInputTokens,
      limits.contextWindow - tokenBudgetConfig.reservedOutputTokens
    );
    const effectiveBudget = Math.floor(maxAllowedInput * (1 - tokenBudgetConfig.safetyMarginPercent));
    
    // Estimate fixed costs to determine tool budget
    const charsPerToken = limits.charsPerToken;
    const messageOverhead = limits.messageOverhead;
    const systemTokens = estimateMessageTokens('system', systemPrompt, charsPerToken, messageOverhead);
    const latestUserTokens = estimateMessageTokens('user', userMessage, charsPerToken, messageOverhead);
    const fixedOverhead = 100; // buffer
    const toolTokenBudget = effectiveBudget - systemTokens - latestUserTokens - fixedOverhead;
    
    // Select relevant tools within budget
    const selectionOptions: ToolSelectionOptions = {
      previousToolCalls,
      isFollowUp,
      maxTools: 10,
      toolTokenBudget: Math.max(0, toolTokenBudget),
      estimateToolTokens: estimateDefaultToolTokens,
    };
    
    const selectedTools = selectRelevantTools(
      userMessage,
      availableTools,
      { role: context.role, tenantId: context.tenantId },
      selectionOptions
    );

    // Convert selected tools to the format expected by token-estimation
    const toolsForEstimation = selectedTools.map(t => ({
      name: t.name,
      description: t.purpose,
      parameters: this.zodToJsonSchema(t.args as any)
    }));

    // Use token-aware message construction with selected tools
    try {
      const envTokenBudget = getTokenBudgetConfigFromEnv();
      
      const { messages } = buildTokenAwareMessages(
        allMessages,
        toolsForEstimation,
        provider,
        { ...DEFAULT_TOKEN_BUDGET_CONFIG, ...envTokenBudget, ...this.config.tokenBudget }
      );
      
      // Convert back to the format expected by the gateway
      const trimmedMessages = messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant' | 'tool',
        content: m.content,
        name: m.name,
        tool_call_id: m.tool_call_id,
        tool_calls: m.tool_calls
      }));
      
      return {
        messages: trimmedMessages,
        selectedTools,
      };
    } catch (error) {
      if (error instanceof TokenBudgetExceededError) {
        this.logger.error(`Token budget exceeded: ${error.message}`);
        throw new Error(`Conversation context too large: ${error.message}. Please start a new conversation or reduce context.`);
      }
      throw error;
    }
  }

  /**
   * Call LLM with tools
   */
  private async callLlmWithTools(
    messages: any[],
    selectedTools: ToolDefinition[],
    context: ConversationContext,
  ): Promise<{ content?: string; toolCalls?: ToolCall[]; pendingAction?: any; providerData?: any; error?: string }> {
    const startTime = Date.now();
    const tools = selectedTools.map(t => ({
      name: t.name,
      description: t.purpose,
      parameters: this.zodToJsonSchema(t.args as any),
    })) as Array<{ name: string; description: string; parameters: object }>;

    let response: { content?: string; toolCalls?: any[]; pendingAction?: any; providerData?: any; provider?: string; model?: string } = { content: '', toolCalls: [], pendingAction: undefined, providerData: undefined, provider: undefined, model: undefined };
    let errorCode: string | undefined;
    let success = true;

    try {
      response = await this.llmGateway.chat({
        messages,
        tools,
        toolChoice: 'auto',
        temperature: 0.1,
        maxTokens: 2000,
        timeout: this.config.llmTimeoutMs,
        context: {
          tenantId: context.tenantId,
          userId: context.userId,
          role: context.role,
          correlationId: context.correlationId,
        },
      });
    } catch (error) {
      success = false;
      const err = error as Error;
      
      // Handle token budget exceeded errors
      if (err.message.includes('TOKEN_BUDGET_EXCEEDED') || err.message.includes('token budget exceeded')) {
        errorCode = 'TOKEN_BUDGET_EXCEEDED';
        this.logger.error(`Token budget exceeded: ${err.message}`);
        return {
          content: 'The conversation context is too large. Please start a new conversation or reduce the context.',
          toolCalls: [],
          error: 'TOKEN_BUDGET_EXCEEDED',
        };
      }
      
      // Handle Groq TPM limit errors
      if (err.message.includes('tokens per minute') || err.message.includes('TPM limit') || 
          (err.message.includes('rate limit') && err.message.includes('token')) ||
          err.message.toLowerCase().includes('rate limit exceeded') ||
          err.message.toLowerCase().includes('timeout')) {
        errorCode = 'GROQ_TPM_EXCEEDED';
        this.logger.error(`Groq TPM limit exceeded: ${err.message}`);
        return {
          content: 'I\'m currently experiencing high demand. Please try again in a moment, or contact studio staff if this persists.',
          toolCalls: [],
          error: 'GROQ_TPM_EXCEEDED',
        };
      }
      
      errorCode = err.message?.includes('BUDGET_EXCEEDED') ? 'LLM_BUDGET_EXCEEDED' : 'LLM_UNAVAILABLE';
      throw error;
    } finally {
      const latencyMs = Date.now() - startTime;
      const toolCallsCount = response?.toolCalls?.length ?? 0;
      
      // Use token estimation utility for accurate token counting
      const providerName = response.provider ?? (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
      const { estimateRequestTokens, getProviderLimits } = await import('../gateway/token-estimation');
      const limits = getProviderLimits(providerName);
      
      const requestForEstimation = {
        messages: messages.map((m: any) => ({
          role: m.role,
          text: m.content,
          name: m.name,
          result: undefined,
          toolCalls: m.tool_calls?.map((tc: any) => ({
            name: tc.function?.name || tc.name,
            args: typeof tc.function?.arguments === 'string' 
              ? JSON.parse(tc.function.arguments) 
              : tc.function?.arguments || tc.arguments
          })) || []
        })),
        system: messages.find((m: any) => m.role === 'system')?.content,
        tools: [] // placeholder
      };
      
      // Use the existing estimateTokens for backward compatibility with observability
      const estimatedTokens = this.estimateTokens(messages);

      // Use actual provider/model from response, fallback to env defaults
      const model = response.model ?? process.env.LLM_MODEL ?? 'unknown';

      await this.observability.recordLlmCall({
        correlationId: context.correlationId,
        tenantId: context.tenantId,
        userId: context.userId,
        provider: providerName,
        model,
        latencyMs,
        inputTokens: Math.ceil(estimatedTokens * 0.7),
        outputTokens: Math.ceil(estimatedTokens * 0.3),
        totalTokens: estimatedTokens,
        toolCallsCount,
        success,
        errorCode,
        timestamp: new Date(),
      });
    }

    return {
      content: response.content,
      toolCalls: response.toolCalls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      pendingAction: response.pendingAction,
      providerData: response.providerData,
      error: (response as any).error,
    };
  }

  private estimateTokens(messages: any[]): number {
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
    return Math.ceil(totalChars / 4) + 500;
  }

  /**
   * Convert Zod schema to JSON Schema (simplified)
   */
  private zodToJsonSchema(zodSchema: any): any {
    // This is a simplified conversion - in production use zod-to-json-schema
    return {
      type: 'object',
      properties: zodSchema.shape ? Object.fromEntries(
        Object.entries(zodSchema.shape).map(([key, value]: [string, any]) => [
          key,
          this.getJsonSchemaFromZod(value),
        ])
      ) : {},
      required: zodSchema._def?.required || [],
      additionalProperties: false,
    };
  }

  private getJsonSchemaFromZod(zodType: any): any {
    const def = zodType._def;
    if (!def) return { type: 'string' };

    switch (def.typeName) {
      case 'ZodString':
        return { type: 'string', format: def.checks?.find((c: any) => c.kind === 'email') ? 'email' : undefined };
      case 'ZodNumber':
        return { type: 'number' };
      case 'ZodBoolean':
        return { type: 'boolean' };
      case 'ZodEnum':
        return { type: 'string', enum: def.values };
      case 'ZodArray':
        return { type: 'array', items: this.getJsonSchemaFromZod(def.type) };
      case 'ZodObject':
        return this.zodToJsonSchema(zodType);
      case 'ZodOptional':
        return this.getJsonSchemaFromZod(def.innerType);
      case 'ZodDefault':
        return this.getJsonSchemaFromZod(def.innerType);
      default:
        return { type: 'string' };
    }
  }

  /**
   * Get all tool definitions
   */
  private getAllToolDefinitions(): readonly ToolDefinition[] {
    return TOOLS;
  }

  /**
   * Format confirmation message for user
   */
  private formatConfirmationMessage(toolName: string, args: Record<string, unknown>, confirmToken: string): string {
    const argStr = Object.entries(args)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join(', ');

    return `I'm ready to ${toolName} with: ${argStr}.\n\nPlease confirm by saying "confirm ${confirmToken}" or cancel by saying "cancel".`;
  }

  /**
   * Format result message
   */
  private formatResultMessage(toolName: string, result: unknown): string {
    if (!result) return '';
    if (typeof result === 'object' && result !== null) {
      const obj = result as Record<string, unknown>;
      if (obj.summary) return String(obj.summary);
      if (obj.bookingId) return `Booking ${obj.bookingId} processed (${obj.status || 'confirmed'}).`;
      if (obj.id) return `Created ${obj.id}.`;
      if (obj.payment_id) return `Payment ${obj.payment_id} processed.`;
      if (obj.membership_id) return `Membership ${obj.membership_id} updated.`;
    }
    return 'Operation completed.';
  }

  /**
   * Create refusal response
   */
  private createRefusalResponse(message: string, context: ConversationContext): OrchestratorResponse {
    return { response: message, toolCalls: [] };
  }

  /**
   * Handle errors gracefully
   */
  private handleError(error: Error, context: ConversationContext): OrchestratorResponse {
    if (error.message.includes('timeout') || error.message.includes('timeout')) {
      return { response: "I'm taking too long to respond. Please try again in a moment.", toolCalls: [] };
    }
    if (error.message.includes('ERP') || error.message.includes('unavailable')) {
      return { response: "The studio system is temporarily unavailable. Please try again shortly.", toolCalls: [] };
    }
    if (error.message.includes('permission') || error.message.includes('unauthorized')) {
      return { response: "You don't have permission for that action. Please contact studio staff.", toolCalls: [] };
    }
    if (error.message.includes('tokens per minute') || error.message.includes('TPM limit') || 
        (error.message.includes('rate limit') && error.message.includes('token'))) {
      return { response: "I'm currently experiencing high demand. Please try again in a moment, or contact studio staff if this persists.", toolCalls: [] };
    }
    if (error.message.includes('TOKEN_BUDGET_EXCEEDED') || error.message.includes('token budget exceeded')) {
      return { response: "The conversation context is too large. Please start a new conversation or reduce the context.", toolCalls: [] };
    }
    return { response: "I encountered an issue. Please try again or contact studio staff.", toolCalls: [] };
  }

  /**
   * Audit interaction
   */
  private async auditInteraction(
    context: ConversationContext,
    userMessage: string,
    response: OrchestratorResponse,
    durationMs: number,
    toolResults?: ToolResult[],
  ): Promise<void> {
    await this.auditOutbox.record({
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      actorType: 'ai',
      action: 'conversation_turn',
      resourceType: 'conversation',
      resourceRef: context.sessionId || context.correlationId,
      eventType: 'ai.conversation',
      payload: {
        userMessage: PiiRedaction.redact(userMessage).redacted,
        response: PiiRedaction.redactTextForAudit(response.response.substring(0, 500)),
        toolCalls: response.toolCalls?.length || 0,
        toolResults: toolResults?.length || 0,
        durationMs,
        pendingActionId: response.pendingActionId,
      } as Prisma.InputJsonValue,
    });
  }

  /**
   * Audit security event
   */
  private async auditSecurityEvent(
    context: ConversationContext,
    eventType: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.auditOutbox.record({
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      actorType: 'ai',
      action: eventType,
      resourceType: 'security',
      resourceRef: context.userId,
      eventType: `security.${eventType}`,
      payload: details as Prisma.InputJsonValue,
    });
  }

  /**
   * Audit tool call
   */
  private async auditToolCall(
    context: ConversationContext,
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
  ): Promise<void> {
    await this.auditOutbox.record({
      tenantId: context.tenantId,
      correlationId: context.correlationId,
      actorType: 'ai',
      action: 'tool_call',
      resourceType: 'tool',
      resourceRef: toolName,
      eventType: `ai.tool.${toolName}`,
      payload: {
        toolName,
        arguments: PiiRedaction.sanitizeForLogging(args),
        result: result ? 'success' : 'error',
      } as Prisma.InputJsonValue,
    });
  }

  /**
   * Get pending action by ID
   */
  getPendingAction(actionId: string): PendingAction | undefined {
    return this.stateMachine.get(actionId);
  }

  /**
   * Get pending actions for user
   */
  getUserPendingActions(userId: string): PendingAction[] {
    return this.stateMachine.getByUser(userId);
  }

  /**
   * Cleanup expired actions
   */
  cleanup(): number {
    return this.stateMachine.cleanup();
  }
}
