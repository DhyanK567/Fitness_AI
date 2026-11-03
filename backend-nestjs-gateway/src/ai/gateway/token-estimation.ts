/**
 * Token Estimation Utilities
 * 
 * Provides accurate token estimation for various LLM providers.
 * Uses character-based estimation with model-specific adjustments.
 * For production, consider using tiktoken or provider-specific tokenizers.
 */

import type { Message, ToolSpec } from './types';

/**
 * Provider-specific token limits and characteristics
 */
export interface ProviderLimits {
  /** Maximum tokens per minute (TPM) - provider throughput limit */
  tpmLimit: number;
  /** Maximum requests per minute (RPM) */
  rpmLimit?: number;
  /** Maximum input tokens per single request (provider enforced) */
  maxInputTokens: number;
  /** Maximum output tokens per request */
  maxOutputTokens: number;
  /** Model context window size (input + output) */
  contextWindow: number;
  /** Characters per token ratio (approximate) */
  charsPerToken: number;
  /** Overhead tokens per message (role, formatting) */
  messageOverhead: number;
}

/**
 * Provider-specific limits configuration
 * Values based on documented provider limits (as of 2025)
 * 
 * IMPORTANT: TPM (tokens per minute) is a THROUGHPUT limit, not a per-request limit.
 * Per-request input limit is min(maxInputTokens, contextWindow - outputTokens).
 */
export const PROVIDER_LIMITS: Record<string, ProviderLimits> = {
  groq: {
    // Groq on-demand limits (as of 2025)
    // Model: openai/gpt-oss-120b (8192 context window on Groq)
    tpmLimit: 8000,           // Tokens per minute (on-demand tier throughput)
    rpmLimit: 30,             // Requests per minute
    maxInputTokens: 6000,     // Max input tokens per request (conservative < context window)
    maxOutputTokens: 2000,    // Reserved for output
    contextWindow: 8192,      // Model context window (openai/gpt-oss-120b on Groq)
    charsPerToken: 3.5,       // Conservative for code/JSON heavy prompts
    messageOverhead: 10,      // Role tag, formatting overhead per message
  },
  gemini: {
    // Gemini 1.5 Flash limits (free tier)
    tpmLimit: 1_500_000,
    rpmLimit: 1500,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 8192,
    contextWindow: 1_048_576,
    charsPerToken: 4.0,
    messageOverhead: 5,
  },
  default: {
    tpmLimit: 8000,
    rpmLimit: 30,
    maxInputTokens: 6000,
    maxOutputTokens: 4000,
    contextWindow: 8192,
    charsPerToken: 4.0,
    messageOverhead: 10,
  },
};

/**
 * Get provider limits with fallback to default
 */
export function getProviderLimits(provider: string): ProviderLimits {
  return PROVIDER_LIMITS[provider.toLowerCase()] || PROVIDER_LIMITS.default;
}

/**
 * Token estimation result with breakdown
 */
export interface TokenEstimate {
  total: number;
  breakdown: {
    systemPrompt: number;
    messages: number;
    tools: number;
    overhead: number;
  };
  withinBudget: boolean;
  budget: number;
  provider: string;
}

/**
 * Estimate tokens for a text string using character-based approximation
 * @param text - Text to estimate tokens for
 * @param charsPerToken - Characters per token ratio (default 4)
 * @returns Estimated token count
 */
export function estimateTokens(text: string, charsPerToken = 4): number {
  if (!text) return 0;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens for a JSON object (used for tool schemas)
 * @param obj - Object to estimate
 * @param charsPerToken - Characters per token ratio
 * @returns Estimated token count
 */
export function estimateJsonTokens(obj: unknown, charsPerToken = 3.5): number {
  if (!obj) return 0;
  try {
    const json = JSON.stringify(obj);
    return Math.ceil(json.length / charsPerToken);
  } catch {
    return 0;
  }
}

/**
 * Estimate tokens for a message including role overhead
 */
export function estimateMessageTokens(
  role: string,
  content: string,
  charsPerToken: number,
  messageOverhead: number
): number {
  const contentTokens = estimateTokens(content, charsPerToken);
  const roleTokens = estimateTokens(role, charsPerToken);
  return contentTokens + roleTokens + messageOverhead;
}

/**
 * Estimate tokens for tool definitions
 */
export function estimateToolsTokens(
  tools: Array<{ name: string; description: string; parameters: any }>,
  charsPerToken = 3.5
): number {
  if (!tools?.length) return 0;
  let total = 0;
  for (const tool of tools) {
    total += estimateTokens(tool.name, 4);
    total += estimateTokens(tool.description, charsPerToken);
    total += estimateJsonTokens(tool.parameters, charsPerToken);
    total += 50; // Function calling format overhead per tool
  }
  return total;
}

/**
 * Token estimation result with breakdown
 */
export interface TokenEstimate {
  total: number;
  breakdown: {
    systemPrompt: number;
    messages: number;
    tools: number;
    overhead: number;
  };
  withinBudget: boolean;
  budget: number;
  provider: string;
}

/**
 * Estimate total tokens for a GenerateRequest
 */
export function estimateRequestTokens(
  request: {
    messages: Array<{ role: string; text?: string; name?: string; result?: unknown; toolCalls?: Array<{ name: string; args: Record<string, unknown> }> }>;
    system?: string;
    tools?: Array<{ name: string; description: string; parameters: any }>;
  },
  provider: string = 'default'
): TokenEstimate {
  const limits = getProviderLimits(provider);
  const charsPerToken = limits.charsPerToken;
  const messageOverhead = limits.messageOverhead;

  // System prompt tokens
  const systemTokens = request.system
    ? estimateMessageTokens('system', request.system, charsPerToken, messageOverhead)
    : 0;

  // Message tokens
  let messageTokens = 0;
  for (const msg of request.messages) {
    const role = msg.role === 'model' ? 'assistant' : msg.role;
    const content = msg.text || msg.result ? JSON.stringify(msg.result) : '';
    messageTokens += estimateMessageTokens(role, content, charsPerToken, messageOverhead);
    
    // Tool calls in assistant messages
    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        messageTokens += estimateTokens(tc.name, 4);
        messageTokens += estimateJsonTokens(tc.args, 3.5);
        messageTokens += 20; // tool call overhead
      }
    }
    
    // Tool results
    if (msg.result) {
      messageTokens += estimateJsonTokens(msg.result, 3.5);
      messageTokens += 20;
    }
  }

  // Tool definitions tokens
  const toolsTokens = request.tools ? estimateToolsTokens(request.tools, 3.5) : 0;

  const total = systemTokens + messageTokens + toolsTokens + 100; // 100 token buffer
  const budget = getProviderLimits(provider).maxInputTokens;

  return {
    total,
    breakdown: {
      systemPrompt: systemTokens,
      messages: messageTokens,
      tools: toolsTokens,
      overhead: 100,
    },
    withinBudget: total <= budget,
    budget,
    provider,
  };
}


/**
 * Token budget configuration for request construction
 */
export interface TokenBudgetConfig {
  /** Maximum input tokens allowed (will be min of this and provider limit) */
  maxInputTokens: number;
  /** Tokens to reserve for output generation */
  reservedOutputTokens: number;
  /** Maximum conversation history turns to include */
  maxHistoryTurns: number;
  /** Minimum turns to preserve (preference, not hard constraint) */
  minHistoryTurns: number;
  /** Token threshold to trigger summarization (not yet implemented) */
  summarizeThreshold: number;
  /** Safety margin (percentage of budget to keep free) */
  safetyMarginPercent: number;
}

/**
 * Default token budget configuration
 */
export const DEFAULT_TOKEN_BUDGET_CONFIG: TokenBudgetConfig = {
  maxInputTokens: 6000,
  reservedOutputTokens: 2000,
  maxHistoryTurns: 10,
  minHistoryTurns: 3,
  summarizeThreshold: 4000,
  safetyMarginPercent: 0.15,
};

/**
 * Get token budget configuration from environment variables
 */
export function getTokenBudgetConfigFromEnv(): TokenBudgetConfig {
  return {
    maxInputTokens: parseInt(process.env.LLM_MAX_INPUT_TOKENS || '6000', 10),
    reservedOutputTokens: parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || '2000', 10),
    maxHistoryTurns: parseInt(process.env.LLM_MAX_HISTORY_TURNS || '10', 10),
    minHistoryTurns: parseInt(process.env.LLM_MIN_HISTORY_TURNS || '3', 10),
    summarizeThreshold: parseInt(process.env.LLM_TOKEN_SUMMARIZE_THRESHOLD || '4000', 10),
    safetyMarginPercent: parseFloat(process.env.LLM_TOKEN_SAFETY_MARGIN || '0.15'),
  };
}

/**
 * Result of token-aware message construction
 */
export interface TokenAwareMessages {
  messages: Array<{ role: string; content: string; name?: string; tool_call_id?: string; tool_calls?: any[] }>;
  tools: any[];
  estimatedTokens: number;
  trimmed: boolean;
  trimmedTurns: number;
  budget: number;
}

/**
 * Build token-aware messages for LLM request
 * 
 * Strategy:
 * 1. Always preserve system prompt and latest user message
 * 2. Include all tool definitions (essential for function calling)
 * 3. Trim oldest conversation history first
 * 4. Never trim below minHistoryTurns (preference, not hard constraint)
 * 5. Return structured error if fixed content alone exceeds budget
 */
export function buildTokenAwareMessages(
  messages: Array<{
    role: string;
    content: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: any[];
  }>,
  tools: Array<{ name: string; description: string; parameters: any }>,
  provider: string,
  config: TokenBudgetConfig = DEFAULT_TOKEN_BUDGET_CONFIG
): TokenAwareMessages {
  const limits = getProviderLimits(provider);
  const charsPerToken = limits.charsPerToken;
  const messageOverhead = limits.messageOverhead;

  // Effective budget: min(configured maxInputTokens, contextWindow - reservedOutputTokens) * (1 - safetyMargin)
  // This correctly accounts for: configured limit, model context window, output reservation, and safety margin
  const maxAllowedInput = Math.min(
    config.maxInputTokens,
    limits.contextWindow - config.reservedOutputTokens
  );
  const effectiveBudget = Math.floor(maxAllowedInput * (1 - config.safetyMarginPercent));
  
  // Note: maxInputTokens is the max INPUT tokens, not total context window.
  // Output tokens are reserved from context window, not deducted from input budget a second time.
  const availableForInput = effectiveBudget;

  // Split messages into fixed (system + latest user) and history
  const systemMessage = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role === 'user');
  const latestUserMessage = userMessages[userMessages.length - 1];
  
  const systemTokens = systemMessage
    ? estimateMessageTokens('system', systemMessage.content, charsPerToken, messageOverhead)
    : 0;
  
  const latestUserTokens = latestUserMessage
    ? estimateMessageTokens('user', latestUserMessage.content, charsPerToken, messageOverhead)
    : 0;

  const toolsTokens = estimateToolsTokens(
    Array.isArray(tools) ? tools : [], 
    3.5
  );

  const fixedTokens = systemTokens + latestUserTokens + toolsTokens + 100; // buffer

  // Structured diagnostics (non-sensitive)
  const isInitialRequest = messages.length <= 3; // system + user + maybe one assistant
  const toolNames = tools.map(t => t.name);
  console.log('[TokenBudget]', JSON.stringify({
    provider,
    modelContextWindow: limits.contextWindow,
    configuredMaxInput: config.maxInputTokens,
    reservedOutputTokens: config.reservedOutputTokens,
    safetyMarginPercent: config.safetyMarginPercent,
    effectiveInputBudget: availableForInput,
    requestType: isInitialRequest ? 'initial' : 'follow-up',
    componentTokens: {
      systemPrompt: systemTokens,
      latestUserMessage: latestUserTokens,
      toolSchemas: toolsTokens,
      buffer: 100,
      fixedTotal: fixedTokens,
    },
    selectedToolCount: tools.length,
    selectedTools: toolNames,
    historyBudget: availableForInput - fixedTokens,
  }));

  if (fixedTokens > availableForInput) {
    // Fixed content exceeds budget - return structured error with breakdown
    throw new TokenBudgetExceededError(
      fixedTokens,
      availableForInput,
      provider,
      {
        systemPrompt: systemTokens,
        messages: latestUserTokens,
        tools: toolsTokens,
        overhead: 100,
      }
    );
  }

  // Available tokens for history
  const historyBudget = availableForInput - fixedTokens;
  
  // Build history messages (everything except system and latest user)
  const historyMessages = messages.filter(
    m => m.role !== 'system' && m !== latestUserMessage
  );

  // Build history from most recent, respecting budget
  const { history, trimmed, trimmedTurns } = buildHistoryWithinBudget(
    historyMessages,
    historyBudget,
    config.maxHistoryTurns,
    config.minHistoryTurns,
    (text) => estimateTokens(text, charsPerToken)
  );

  // Reconstruct final messages
  const finalMessages: Array<{
    role: string;
    content: string;
    name?: string;
    tool_call_id?: string;
  }> = [];
  if (systemMessage) finalMessages.push({ role: 'system', content: systemMessage.content });
  finalMessages.push(...history);
  finalMessages.push({ role: 'user', content: latestUserMessage.content });

  const historyTokens = history.reduce((sum, m) => sum + estimateTokens(m.content, 4) + 10, 0);
  const totalEstimated = fixedTokens + historyTokens;

  // Final diagnostics
  console.log('[TokenBudget]', JSON.stringify({
    result: 'success',
    finalMessageCount: finalMessages.length,
    historyMessagesKept: history.length,
    historyTurnsTrimmed: trimmedTurns,
    historyTokens,
    totalEstimatedInputTokens: totalEstimated,
    budget: availableForInput,
    headroom: availableForInput - totalEstimated,
    withinBudget: totalEstimated <= availableForInput,
  }));

  return {
    messages: finalMessages,
    tools,
    estimatedTokens: totalEstimated,
    trimmed,
    trimmedTurns,
    budget: availableForInput,
  };
}

/**
 * Build history within token budget
 */
function buildHistoryWithinBudget(
  history: Array<{ role: string; content: string; name?: string; tool_call_id?: string }>,
  budget: number,
  maxTurns: number,
  minTurns: number,
  estimateFn: (text: string) => number
): { history: Array<{ role: string; content: string; name?: string; tool_call_id?: string }>; trimmed: boolean; trimmedTurns: number } {
  // Limit to maxTurns first
  let historyWindow = history.slice(-maxTurns);
  let currentTokens = historyWindow.reduce(
    (sum, m) => sum + estimateFn(m.content) + 10,
    0
  );

  // Trim from oldest until within budget or at minTurns
  let trimmedTurns = 0;
  while (currentTokens > budget && historyWindow.length > minTurns) {
    const removed = historyWindow.shift();
    if (removed) {
      currentTokens -= estimateFn(removed.content) + 10;
      trimmedTurns++;
    }
  }

  // If still over budget at minTurns, we have to truncate content (last resort)
  if (currentTokens > budget && historyWindow.length <= minTurns) {
    // This is a last resort - we log but proceed
    console.warn(`History at minTurns (${minTurns}) still exceeds budget by ${currentTokens - budget} tokens`);
  }

  return {
    history: historyWindow,
    trimmed: trimmedTurns > 0,
    trimmedTurns,
  };
}

/**
 * Check if error is a Groq TPM limit error
 */
export function isGroqTpmError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('tokens per minute') ||
    message.includes('TPM') ||
    (message.includes('rate limit') && message.includes('token'))
  );
}

/**
 * Check if error is a rate limit error (not TPM)
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Response) return error.status === 429;
  if (error instanceof Error) {
    return error.message.includes('rate limit') || error.message.includes('rate_limit');
  }
  return false;
}

/**
 * Token budget exceeded error
 */
export class TokenBudgetExceededError extends Error {
  readonly code = 'TOKEN_BUDGET_EXCEEDED';
  readonly estimatedTokens: number;
  readonly budget: number;
  readonly provider: string;
  readonly breakdown: { systemPrompt: number; messages: number; tools: number; overhead: number };

  constructor(
    estimatedTokens: number,
    budget: number,
    provider: string,
    breakdown: { systemPrompt: number; messages: number; tools: number; overhead: number }
  ) {
    super(
      `Request exceeds token budget: ${estimatedTokens} tokens estimated, ` +
      `budget is ${budget} tokens for provider ${provider}`
    );
    this.name = 'TokenBudgetExceededError';
    this.estimatedTokens = estimatedTokens;
    this.budget = budget;
    this.provider = provider;
    this.breakdown = breakdown;
  }
}