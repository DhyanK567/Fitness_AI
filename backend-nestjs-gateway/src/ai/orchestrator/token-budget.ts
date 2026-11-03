/**
 * Token Budget Management for Conversation History
 * 
 * Handles token-aware conversation history construction for LLM requests.
 * Ensures requests stay within provider token limits while preserving
 * essential conversation context.
 */

import { 
  buildTokenAwareMessages, 
  TokenBudgetConfig, 
  DEFAULT_TOKEN_BUDGET_CONFIG,
  TokenAwareMessages,
  TokenBudgetExceededError,
  getProviderLimits,
  estimateTokens,
  estimateJsonTokens,
  estimateMessageTokens,
  estimateToolsTokens,
  estimateRequestTokens,
} from '../gateway/token-estimation';

/**
 * Result of history trimming operation
 */
export interface HistoryTrimResult {
  history: Array<{ role: string; content: string; name?: string; tool_call_id?: string }>;
  trimmed: boolean;
  trimmedTurns: number;
  estimatedTokens: number;
}

/**
 * Trim conversation history to fit within token budget
 * 
 * @param history - Conversation history (oldest first)
 * @param budget - Available token budget for history
 * @param config - Token budget configuration
 * @param provider - Provider name for token estimation
 * @returns Trimmed history and metadata
 */
export function trimHistoryToBudget(
  history: Array<{ role: string; content: string; name?: string; tool_call_id?: string }>,
  budget: number,
  config: TokenBudgetConfig,
  provider: string
): HistoryTrimResult {
  const limits = getProviderLimits(provider);
  const charsPerToken = limits.charsPerToken;

  // Limit to maxTurns first
  let historyWindow = history.slice(-config.maxHistoryTurns);
  let currentTokens = historyWindow.reduce(
    (sum, m) => sum + estimateTokens(m.content, charsPerToken) + 10,
    0
  );

  // Trim from oldest until within budget or at minTurns
  let trimmedTurns = 0;
  while (currentTokens > budget && historyWindow.length > config.minHistoryTurns) {
    const removed = historyWindow.shift();
    if (removed) {
      currentTokens -= estimateTokens(removed.content, charsPerToken) + 10;
      trimmedTurns++;
    }
  }

  // If still over budget at minTurns, we log but proceed
  if (currentTokens > budget && historyWindow.length <= config.minHistoryTurns) {
    console.warn(`History at minTurns (${config.minHistoryTurns}) still exceeds budget by ${currentTokens - budget} tokens`);
  }

  return {
    history: historyWindow,
    trimmed: trimmedTurns > 0,
    trimmedTurns,
    estimatedTokens: currentTokens,
  };
}

/**
 * Build token-aware messages for LLM request
 * 
 * This is the main entry point for token-aware message construction.
 * It ensures:
 * 1. System prompt is always preserved
 * 2. Latest user message is always preserved
 * 3. Tool definitions are always preserved
 * 4. History is trimmed to fit within budget
 * 4. Tool call/result pairs are preserved together
 * 
 * @param messages - Conversation messages (including system, user, assistant, tool)
 * @param tools - Available tool definitions
 * @param provider - Provider name (e.g., 'groq', 'gemini')
 * @param config - Token budget configuration
 * @returns TokenAwareMessages with constructed messages and metadata
 */
export function buildMessagesWithTokenBudget(
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
): {
  messages: Array<{ role: string; content: string; name?: string; tool_call_id?: string }>;
  tools: any[];
  estimatedTokens: number;
  trimmed: boolean;
  trimmedTurns: number;
  budget: number;
} {
  return buildTokenAwareMessages(messages, tools, provider, config);
}

/**
 * Calculate token budget for a request
 * 
 * @param options - LlmChatOptions from gateway
 * @param provider - Provider name
 * @param config - Token budget configuration
 * @returns Object with budget info and whether request fits
 */
export function calculateTokenBudget(
  options: {
    messages: Array<{ role: string; content: string; tool_calls?: any[] }>;
    tools?: Array<{ name: string; description: string; parameters: any }>;
    system?: string;
  },
  provider: string,
  config: TokenBudgetConfig = DEFAULT_TOKEN_BUDGET_CONFIG
): {
  estimatedTokens: number;
  budget: number;
  withinBudget: boolean;
  breakdown: {
    systemPrompt: number;
    messages: number;
    tools: number;
    overhead: number;
  };
} {
  const limits = getProviderLimits(provider);
  
  const effectiveBudget = Math.min(
    config.maxInputTokens,
    Math.floor(limits.maxInputTokens * (1 - config.safetyMarginPercent))
  );
  
  // Note: maxInputTokens is already the max INPUT tokens, not total context window.
  // Output tokens are reserved separately from the context window, not deducted from input budget.
  const availableForInput = effectiveBudget;
  const estimate = estimateRequestTokens(options, provider);
  
  return {
    estimatedTokens: estimate.total,
    budget: availableForInput,
    withinBudget: estimate.total <= availableForInput,
    breakdown: estimate.breakdown,
  };
}

/**
 * Validate that a request fits within token budget
 * 
 * @throws TokenBudgetExceededError if request exceeds budget
 */
export function validateTokenBudget(
  options: {
    messages: Array<{ role: string; content: string; tool_calls?: any[] }>;
    tools?: Array<{ name: string; description: string; parameters: any }>;
    system?: string;
  },
  provider: string,
  config: TokenBudgetConfig = DEFAULT_TOKEN_BUDGET_CONFIG
): void {
  const budgetInfo = calculateTokenBudget(options, provider, config);
  if (!budgetInfo.withinBudget) {
    throw new TokenBudgetExceededError(
      budgetInfo.estimatedTokens,
      budgetInfo.budget,
      provider,
      budgetInfo.breakdown
    );
  }
}

/**
 * Get default token budget configuration from environment
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
 * Export default config and utilities
 */
export {
  DEFAULT_TOKEN_BUDGET_CONFIG,
  TokenBudgetExceededError,
  getProviderLimits,
  estimateTokens,
  estimateJsonTokens,
  estimateMessageTokens,
  estimateToolsTokens,
  estimateRequestTokens,
};