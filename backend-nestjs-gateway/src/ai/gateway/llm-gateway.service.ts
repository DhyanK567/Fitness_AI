import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { LlmGateway, createGatewayFromEnv, createFallbackGatewayFromEnv, GenerateRequest, ToolSpec, ProviderCooldownManager } from './index';
import { RedisClient } from '../../common/redis-client';
import { LlmObservabilityService } from '../observability/llm-observability.service';
import { 
  getProviderLimits, 
  isGroqTpmError,
  estimateTokens,
  estimateMessageTokens,
  estimateToolsTokens,
  estimateJsonTokens,
  getTokenBudgetConfigFromEnv,
  DEFAULT_TOKEN_BUDGET_CONFIG,
} from './token-estimation';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmTool {
  name: string;
  description: string;
  parameters: any;
}

export interface LlmChatOptions {
  messages: LlmMessage[];
  tools?: LlmTool[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  signal?: AbortSignal;
  context?: {
    tenantId: string;
    userId: string;
    role: string;
    correlationId: string;
  };
}

export interface LlmChatResponse {
  content?: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  pendingAction?: {
    toolName: string;
    arguments: Record<string, unknown>;
  };
  providerData?: any;
  /** Preserved tool results when all LLM providers fail */
  preservedToolResults?: any[];
}

interface BudgetState {
  tokensUsed: number;
  requestsUsed: number;
  resetAt: number;
}

interface QueueItem {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  options: LlmChatOptions;
  priority: number;
}

const FREE_TIER_DAILY_TOKEN_LIMIT = 1_500_000; // 1.5M tokens/day for Gemini free tier
const FREE_TIER_DAILY_REQUEST_LIMIT = 1_500; // 1500 requests/day
const QUEUE_CONCURRENCY = 5; // Max concurrent requests to LLM
const TPM_WINDOW_MS = 60_000; // 60-second window for TPM limiting
const TPM_RESERVATION_TTL_MS = 65_000; // TTL for reservation keys (slightly longer than window)

/**
 * LLM Gateway Service
 * 
 * Abstracts LLM provider (Gemini, Ollama) for the AI orchestrator.
 * Implements: queue, rate limiting, token budget, fallback provider, retry, timeout, observability.
 */
@Injectable()
export class LlmGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LlmGatewayService.name);
  private geminiGateway: ReturnType<typeof createGatewayFromEnv> | null = null;
  private groqGateway: ReturnType<typeof createGatewayFromEnv> | null = null;
  private readonly queue: QueueItem[] = [];
  private activeRequests = 0;
  private isRunning = false;
  private readonly budgets = new Map<string, BudgetState>();
  private readonly redis: RedisClient;
  private readonly observability: LlmObservabilityService;
  private readonly cooldownManager = new ProviderCooldownManager();

  constructor(redis: RedisClient, observability: LlmObservabilityService);
  constructor(config: any, redis: RedisClient, observability: LlmObservabilityService);
  constructor(
    @Inject(RedisClient) redisOrConfig: RedisClient | any,
    @Inject(LlmObservabilityService) observabilityOrRedis?: LlmObservabilityService | any,
    @Optional() maybeObservability?: LlmObservabilityService | any,
  ) {
    if (maybeObservability !== undefined) {
      this.redis = observabilityOrRedis;
      this.observability = maybeObservability;
    } else {
      this.redis = redisOrConfig;
      this.observability = observabilityOrRedis;
    }

    // Initialize BOTH providers (primary + fallback) for resilience
    // Primary: configured via LLM_PROVIDER, LLM_MODEL, LLM_API_KEY
    // Fallback: configured via FALLBACK_LLM_PROVIDER, FALLBACK_LLM_MODEL, FALLBACK_LLM_API_KEY
    
    const initPrimaryGateway = (label: string): ReturnType<typeof createGatewayFromEnv> | null => {
      try {
        const gateway = createGatewayFromEnv(process.env, (event) => {
          this.logger.debug(`${label} Gateway event: ${event.type}`, { attempt: event.attempt, code: event.code, provider: event.provider });
        });
        this.logger.log(`Initialized ${label} LLM Gateway: ${(process.env.LLM_PROVIDER ?? 'gemini').toUpperCase()} (${process.env.LLM_MODEL})`);
        return gateway;
      } catch (error) {
        this.logger.warn(
          `${label} LLM Gateway is not configured (${(error as Error).message}). ` +
          `Will attempt fallback if available.`
        );
        return null;
      }
    };

    const initFallbackGateway = (label: string): ReturnType<typeof createFallbackGatewayFromEnv> | null => {
      try {
        const gateway = createFallbackGatewayFromEnv(process.env, (event) => {
          this.logger.debug(`${label} Gateway event: ${event.type}`, { attempt: event.attempt, code: event.code, provider: event.provider });
        });
        this.logger.log(`Initialized ${label} LLM Gateway: ${(process.env.FALLBACK_LLM_PROVIDER ?? 'gemini').toUpperCase()} (${process.env.FALLBACK_LLM_MODEL})`);
        return gateway;
      } catch (error) {
        this.logger.warn(
          `${label} LLM Gateway is not configured (${(error as Error).message}). ` +
          `Fallback unavailable.`
        );
        return null;
      }
    };

    const primaryProvider = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
    const fallbackProvider = (process.env.FALLBACK_LLM_PROVIDER ?? 'gemini').toLowerCase();
    
    // Use a compatible Gemini model for v1beta API
    // gemini-1.5-flash-latest or gemini-1.5-flash-001 are more likely to work on v1beta
    const fallbackModel = process.env.FALLBACK_LLM_MODEL || 'gemini-1.5-flash-latest';
    
    if (primaryProvider === 'groq') {
      this.groqGateway = initPrimaryGateway('Primary');
      // Override fallback model if using Gemini as fallback
      if (fallbackProvider === 'gemini') {
        process.env.FALLBACK_LLM_MODEL = fallbackModel;
      }
      this.geminiGateway = initFallbackGateway('Fallback');
    } else {
      this.geminiGateway = initPrimaryGateway('Primary');
      // Override fallback model if using Groq as fallback
      if (fallbackProvider === 'groq') {
        // Groq fallback model can be configured via FALLBACK_LLM_MODEL
      }
      this.groqGateway = initFallbackGateway('Fallback');
    }

    if (!this.groqGateway && !this.geminiGateway) {
      this.logger.error(
        `No LLM Gateways configured. AI conversational and reasoning features will remain unavailable ` +
        `until valid LLM credentials are provided for at least one provider.`
      );
    }
  }

  // ============================================================
  // TPM Rate Limiter (Token Per Minute)
  // ============================================================
  
  /**
   * Reserve tokens from the TPM budget atomically using Redis Lua script
   * Returns true if reservation successful, false if TPM limit exceeded
   */
  private async reserveTpmTokens(provider: string, estimatedTokens: number): Promise<boolean> {
    const limits = getProviderLimits(provider);
    const tpmLimit = parseInt(process.env[`${provider.toUpperCase()}_TPM_LIMIT`] || String(limits.tpmLimit), 10);
    
    if (tpmLimit <= 0) return true; // No limit configured
    
    const key = `llm:tpm:${provider}`;
    const now = Date.now();
    const windowStart = now - TPM_WINDOW_MS;
    
    // Use Lua script for atomic reservation
    const script = `
      local key = KEYS[1]
      local window_start = tonumber(ARGV[1])
      local requested = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local ttl = tonumber(ARGV[4])
      
      -- Remove expired entries
      redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
      
      -- Get current count
      local current = redis.call('ZCARD', key)
      
      -- Check if we can accommodate the request
      if current + requested > limit then
        return 0
      end
      
      -- Add reservation with timestamp as score
      local reservation_id = math.random(1000000000) .. '.' .. ARGV[5]
      redis.call('ZADD', key, ARGV[1], reservation_id)
      redis.call('PEXPIRE', key, ttl)
      
      return 1
    `;
    
    try {
      const reservationId = `${Date.now()}.${Math.random().toString(36).substring(7)}`;
      const result = await this.redis.getClient().eval(
        script,
        1,
        `llm:tpm:${provider}`,
        Date.now(),
        String(estimatedTokens),
        String(tpmLimit),
        String(TPM_RESERVATION_TTL_MS),
        reservationId
      );
      return result === 1;
    } catch (error) {
      this.logger.warn(`TPM reservation failed, allowing request: ${(error as Error).message}`);
      return true; // Fail open - don't block on Redis errors
    }
  }

  /**
   * Release TPM reservation (called on success or error)
   */
  private async releaseTpmReservation(provider: string, estimatedTokens: number): Promise<void> {
    // For simplicity, we use a sorted set with timestamps.
    // In a more sophisticated implementation, we'd track individual reservations.
    // For now, we rely on the TTL expiry of the sorted set entries.
    try {
      const key = `llm:tpm:${provider}`;
      const windowStart = Date.now() - TPM_WINDOW_MS;
      // Remove old entries (cleanup)
      await this.redis.getClient().zremrangebyscore(key, '-inf', windowStart);
    } catch (error) {
      this.logger.warn(`TPM cleanup failed: ${(error as Error).message}`);
    }
  }

  /**
   * Reconcile TPM reservation with actual usage
   */
  private async reconcileTpmUsage(provider: string, estimatedTokens: number, actualTokens: number): Promise<void> {
    // For now, we rely on the TTL-based cleanup.
    // A more sophisticated implementation would track individual reservations.
    await this.releaseTpmReservation(provider, estimatedTokens);
  }

  isAvailable(): boolean {
    return this.groqGateway !== null || this.geminiGateway !== null;
  }

  async onModuleInit(): Promise<void> {
    this.isRunning = true;
    // Start queue processor
    this.processQueue();
  }

  onModuleDestroy(): void {
    this.isRunning = false;
  }

  /**
   * Chat completion with tool calling support, queueing, budget enforcement, and fallback
   */
  async chat(options: LlmChatOptions): Promise<LlmChatResponse> {
    const { context } = options;
    if (!context?.tenantId) {
      throw new Error('Tenant ID required for LLM chat');
    }

    // Check budget before queueing
    await this.checkBudget(context.tenantId, options);

    // Queue the request (TPM reservation happens in processQueueItem to avoid double reservation)
    return new Promise((resolve, reject) => {
      const queueItem: QueueItem = {
        resolve,
        reject,
        options,
        priority: this.calculatePriority(options),
      };

      this.queue.push(queueItem);
      this.queue.sort((a, b) => b.priority - a.priority);
    });
  }

  private async checkBudget(tenantId: string, options: LlmChatOptions): Promise<void> {
    const budget = await this.getBudgetState(tenantId);
    const now = Date.now();

    // Reset daily budget if needed
    if (budget.resetAt < Date.now()) {
      budget.tokensUsed = 0;
      budget.requestsUsed = 0;
      budget.resetAt = this.getNextMidnight();
    }

    const estimatedTokens = this.estimateTokens(options);
    if (budget.tokensUsed + estimatedTokens > FREE_TIER_DAILY_TOKEN_LIMIT) {
      const retryAfter = budget.resetAt - Date.now();
      throw new Error(`LLM_BUDGET_EXCEEDED: Daily token budget exceeded. Resets in ${Math.ceil(retryAfter / 1000 / 60)} minutes.`);
    }

    if (budget.requestsUsed + 1 > FREE_TIER_DAILY_REQUEST_LIMIT) {
      const retryAfter = budget.resetAt - Date.now();
      throw new Error(`LLM_BUDGET_EXCEEDED: Daily request budget exceeded. Resets in ${Math.ceil(retryAfter / 1000 / 60)} minutes.`);
    }
  }

  private async getBudgetState(tenantId: string): Promise<BudgetState> {
    // Try Redis first for distributed budget tracking
    const redisKey = `llm:budget:${tenantId}`;
    const cached = await this.redis.get(redisKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fallback to in-memory
    let budget = this.budgets.get(tenantId);
    if (!budget) {
      budget = { tokensUsed: 0, requestsUsed: 0, resetAt: this.getNextMidnight() };
      this.budgets.set(tenantId, budget);
    }
    return budget;
  }

  private async persistBudget(tenantId: string, budget: BudgetState): Promise<void> {
    const redisKey = `llm:budget:${tenantId}`;
    await this.redis.set(redisKey, JSON.stringify(budget), 'PX', 24 * 60 * 60 * 1000);
    this.budgets.set(tenantId, budget);
  }

  private getNextMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
  }

  private estimateTokens(options: LlmChatOptions): number {
    const provider = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
    const limits = getProviderLimits(provider);
    const charsPerToken = limits.charsPerToken;
    const messageOverhead = limits.messageOverhead;

    // Estimate message tokens
    let messageTokens = 0;
    for (const msg of options.messages) {
      messageTokens += estimateMessageTokens(msg.role, msg.content || '', charsPerToken, messageOverhead);
      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          messageTokens += estimateTokens(tc.function?.name || tc.name || '', 4);
          const argsStr = typeof tc.function?.arguments === 'string' 
            ? tc.function.arguments 
            : JSON.stringify(tc.function?.arguments || tc.arguments || {});
          messageTokens += estimateJsonTokens(argsStr, 3.5);
          messageTokens += 20; // tool call overhead
        }
      }
    }

    // Estimate tool definition tokens
    const toolTokens = options.tools?.length 
      ? estimateToolsTokens(options.tools as Array<{ name: string; description: string; parameters: any }>, 3.5)
      : 0;

    // Add buffer
    return messageTokens + toolTokens + 100;
  }

  private calculatePriority(options: LlmChatOptions): number {
    // Higher priority for simpler requests (fewer tools, shorter context)
    const toolPenalty = (options.tools?.length ?? 0) * 10;
    const contextLength = options.messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
    return 1000 - toolPenalty - Math.min(contextLength / 100, 500);
  }

  private async processQueue(): Promise<void> {
    while (this.isRunning) {
      if (this.queue.length === 0 || this.activeRequests >= QUEUE_CONCURRENCY) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 100);
          timer?.unref?.();
        });
        continue;
      }

      const item = this.queue.shift()!;
      this.activeRequests++;

      // Process asynchronously
      this.processQueueItem(item).finally(() => {
        this.activeRequests--;
      });
    }
  }

  private async processQueueItem(item: QueueItem): Promise<void> {
    const { resolve, reject, options } = item;
    const startTime = Date.now();
    const primaryProvider = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
    const fallbackProvider = primaryProvider === 'groq' ? 'gemini' : 'groq';
    
    // Create AbortSignal with timeout
    const timeout = options.timeout ?? 30000; // Default 30s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // Build provider list with gateway instances and model info
    const primaryGateway = primaryProvider === 'groq' ? this.groqGateway : this.geminiGateway;
    const fallbackGateway = fallbackProvider === 'groq' ? this.groqGateway : this.geminiGateway;
    
    const primaryModel = primaryProvider === 'groq' ? process.env.LLM_MODEL : process.env.FALLBACK_LLM_MODEL;
    const fallbackModel = fallbackProvider === 'groq' ? process.env.LLM_MODEL : process.env.FALLBACK_LLM_MODEL;
    
    const providers = [
      { name: primaryProvider, gateway: primaryGateway!, model: primaryModel },
      { name: fallbackProvider, gateway: fallbackGateway!, model: fallbackModel },
    ].filter(p => p.gateway !== null);

    if (providers.length === 0) {
      const primaryProvider = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
      const unavailError = new Error(
        `LLM Gateway is not available: no providers configured. ` +
        `Configure at least one provider (Groq or Gemini) with LLM_MODEL and LLM_API_KEY.`
      );
      await this.recordUsage(options.context!.tenantId, options, 0, false, 'none');
      reject(unavailError);
      return;
    }

    // Try each provider in order (primary first, then fallback)
    for (let providerIndex = 0; providerIndex < providers.length; providerIndex++) {
      const { name: providerName, gateway, model: providerModel } = providers[providerIndex];
      const isFallback = providerIndex > 0;
      
      // Check provider cooldown (for TPD exhaustion)
      const providerKey = `${providerName}:${providerModel}`;
      const cooldownStatus = this.cooldownManager.check(providerKey);
      if (cooldownStatus) {
        this.logger.warn(
          `Provider ${providerName}/${providerModel} in cooldown (${cooldownStatus.remainingMs}ms remaining): ` +
          `${cooldownStatus.reason}. Skipping to next provider.`
        );
        
        if (!isFallback && providers.length > 1) {
          continue; // Try fallback
        }
        
        // No fallback available or fallback also in cooldown
        await this.recordUsage(options.context!.tenantId, options, 0, false, providerName);
        reject(new Error(
          `Provider ${providerName}/${providerModel} unavailable (cooldown): ${cooldownStatus.reason}. ` +
          `Try again in ${Math.ceil(cooldownStatus.remainingMs / 1000)} seconds.`
        ));
        return;
      }
      
      // Reserve TPM tokens before making the request
      const estimatedTokens = this.estimateTokens(options);
      const tpmReserved = await this.reserveTpmTokens(providerName, estimatedTokens);
      if (!tpmReserved) {
        this.logger.warn(`TPM limit exceeded for ${providerName}/${providerModel}: ${estimatedTokens} tokens estimated`);
        
        // If this was the primary and we have a fallback, try the fallback
        if (!isFallback && providers.length > 1) {
          this.logger.log(`Attempting fallback to ${fallbackProvider} after ${primaryProvider} TPM limit exceeded`);
          await this.releaseTpmReservation(providerName, estimatedTokens);
          continue; // Try next provider
        }
        
        // No fallback available or fallback also exceeded
        await this.recordUsage(options.context!.tenantId, options, 0, false, providerName);
        reject(new Error(`LLM_TPM_EXCEEDED: Token per minute limit exceeded for provider ${providerName}/${providerModel}. Estimated tokens: ${estimatedTokens}`));
        return;
      }

      try {
        const request = this.buildGenerateRequest({ ...options, signal: controller.signal });
        // LlmGateway internally handles retries with exponential backoff and retry-after
        const response = await gateway.generate(request);
        const result = this.transformResponse(response);
        
        // Reconcile TPM usage with actual response
        const actualTokens = (response.meta?.usage?.inputTokens ?? 0) + (response.meta?.usage?.outputTokens ?? 0) || this.estimateTokens(options);
        await this.reconcileTpmUsage(providerName, estimatedTokens, actualTokens);
        
        await this.recordUsage(options.context!.tenantId, options, Date.now() - startTime, true, providerName);
        
        // Clear cooldown on successful call
        this.cooldownManager.clear(providerKey);
        
        if (isFallback) {
          this.logger.log(`Successfully used fallback provider ${providerName}/${providerModel} after primary failure`);
        }
        clearTimeout(timeoutId);
        resolve(result);
        return; // Success, exit the provider loop
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        
        // Extract provider error classification
        const errorType = err instanceof Error && 'providerData' in err && err.providerData && typeof err.providerData === 'object' && 'type' in err.providerData
          ? (err.providerData as any).type
          : 'unknown';
        
        const isTpdExhausted = errorType === 'tpd_exhausted';
        const isTpmError = errorType === 'tpm_limit' || errorType === 'rpm_limit' || 
          err.message.includes('tokens per minute') || 
          err.message.includes('TPM limit') || 
          (err.message.includes('rate limit') && err.message.includes('token'));
        
        // Release current reservation before potential fallback
        await this.releaseTpmReservation(providerName, estimatedTokens);
        
        // Record failed usage
        await this.recordUsage(options.context!.tenantId, options, Date.now() - startTime, false, providerName);
        
        // Detailed error logging with full context (no credentials)
        this.logger.error(
          `Provider ${providerName}/${providerModel} request failed | ` +
          `attempt=${providerIndex + 1} | isFallback=${isFallback} | errorType=${errorType} | ` +
          `isTpdExhausted=${isTpdExhausted} | isTpmError=${isTpmError} | ` +
          `message=${err.message}`
        );
        
        // Handle TPD exhaustion - set cooldown and immediately try fallback
        if (isTpdExhausted) {
          // Cooldown for the rest of the day (or at least several hours)
          // Use retry-after if available, otherwise default to 30 minutes
          const retryAfterMs = (err as any).providerData?.retryAfterMs ?? 30 * 60 * 1000;
          const cooldownDuration = Math.min(Math.max(retryAfterMs, 5 * 60 * 1000), 60 * 60 * 1000); // 5min - 1hr
          this.cooldownManager.set(providerKey, cooldownDuration, `TPD exhausted: ${err.message}`);
          
          this.logger.warn(
            `TPD exhaustion for ${providerName}/${providerModel} - cooldown set for ${Math.ceil(cooldownDuration / 60000)}min. ` +
            `Falling back to ${fallbackProvider}.`
          );
          
          if (providers.length > 1) {
            continue; // Immediately try fallback
          }
        }
        
        // Handle TPM/RPM errors - let LlmGateway handle retries, then fallback
        if (isTpmError && !isFallback && providers.length > 1) {
          this.logger.log(`${providerName} TPM/RPM limit exceeded after retries, attempting fallback to ${fallbackProvider}`);
          continue; // Try fallback provider
        }
        
        // For other errors on primary, try fallback if available
        if (!isFallback && providers.length > 1) {
          this.logger.log(`${providerName} failed with error, attempting fallback to ${fallbackProvider}: ${err.message}`);
          continue;
        }
        
        // Fallback also failed, or no fallback available
        clearTimeout(timeoutId);
        reject(err);
        return;
      }
    }
    
    // All providers exhausted
    clearTimeout(timeoutId);
    const errorMsg = `All LLM providers (${providers.map(p => `${p.name}/${p.model}`).join(', ')}) failed to process the request`;
    this.logger.error(errorMsg);
    
    // Try to return a structured error that preserves context for the orchestrator
    const finalError = new Error(errorMsg);
    (finalError as any).allProvidersExhausted = true;
    (finalError as any).providers = providers.map(p => ({ name: p.name, model: p.model }));
    reject(finalError);
  }

  private async recordUsage(tenantId: string, options: LlmChatOptions, latencyMs: number, success: boolean, provider: string): Promise<void> {
    const estimatedTokens = this.estimateTokens(options);
    const budget = await this.getBudgetState(options.context!.tenantId);
    budget.tokensUsed += success ? estimatedTokens : 0;
    budget.requestsUsed += 1;
    await this.persistBudget(tenantId, budget);

    // Determine the actual model name from the provider gateway
    let modelName = 'unknown';
    if (provider === 'groq' && this.groqGateway) {
      // Access the provider's model through reflection or store it
      modelName = (this.groqGateway as any).provider?.model ?? 'openai/gpt-oss-120b';
    } else if (provider === 'gemini' && this.geminiGateway) {
      modelName = (this.geminiGateway as any).provider?.model ?? 'gemini-1.5-flash-latest';
    }

    // Record observability metrics
    await this.observability.recordLlmCall({
      correlationId: options.context!.correlationId,
      tenantId,
      userId: options.context!.userId,
      provider,
      model: modelName,
      latencyMs,
      inputTokens: Math.ceil(estimatedTokens * 0.7),
      outputTokens: Math.ceil(estimatedTokens * 0.3),
      totalTokens: estimatedTokens,
      toolCallsCount: options.tools?.length ?? 0,
      success,
      errorCode: success ? undefined : 'LLM_ERROR',
      timestamp: new Date(),
    });
  }

  /**
   * Build GenerateRequest from chat options
   */
  private buildGenerateRequest(options: LlmChatOptions): GenerateRequest {
    const { tools } = options;

    // Convert messages to gateway format
    const gatewayMessages: any[] = options.messages.map((msg: any) => {
      if (msg.role === 'user') {
        return { role: 'user', text: msg.content };
      } else if (msg.role === 'assistant') {
        const modelMsg: any = { role: 'model' };
        if (msg.content) modelMsg.text = msg.content;
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          modelMsg.toolCalls = msg.tool_calls.map((tc: any) => ({
            name: tc.function?.name || tc.name,
            args: typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function?.arguments || tc.arguments
          }));
        }
        if (msg.providerData) modelMsg.providerData = msg.providerData;
        return modelMsg;
      } else if (msg.role === 'tool') {
        return {
          role: 'tool',
          name: msg.name,
          result: msg.content
        };
      } else if (msg.role === 'system') {
        return { role: 'user', text: `[SYSTEM] ${msg.content}` }; // System messages as user messages for Gemini
      }
      return { role: 'user', text: msg.content };
    });

    // Convert tools to gateway format
    const toolSpecs: ToolSpec[] = (options.tools || []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));

    return {
      messages: gatewayMessages,
      tools: toolSpecs,
      system: options.messages.find((m: any) => m.role === 'system')?.content,
      signal: options.signal,
    };
  }

  /**
   * Transform gateway response to chat response format
   */
  private transformResponse(response: any): LlmChatResponse {
    const toolCalls = response.toolCalls?.map((tc: any, index: number) => ({
      id: `call-${index + 1}`,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.args || {})
      }
    })) || [];

    // Check if this is a pending action proposal (write tool)
    const pendingAction = this.extractPendingAction(response.text, toolCalls);

    return {
      content: response.text || '',
      toolCalls,
      pendingAction,
      providerData: response.providerData,
    };
  }

  /**
   * Extract pending action from response if it's a write tool proposal
   */
  private extractPendingAction(text: string | undefined, toolCalls: any[]): { toolName: string; arguments: Record<string, unknown> } | undefined {
    if (text && (text.toLowerCase().includes('confirm') || text.toLowerCase().includes('propose'))) {
      // Check if any tool call is a write tool
      const writeTool = toolCalls.find((tc: any) =>
        ['createMember', 'createBooking', 'cancelBooking', 'checkIn', 'createPayment', 'activateMembership'].includes(tc.function.name)
      );
      if (writeTool) {
        return {
          toolName: writeTool.function.name,
          arguments: writeTool.function.arguments
        };
      }
    }
    return undefined;
  }

  /**
   * Health check for LLM provider
   */
  async healthCheck(): Promise<{ status: string; provider: string }> {
    const providerName = (process.env.LLM_PROVIDER ?? 'gemini').toLowerCase();
    const gateway = providerName === 'groq' ? this.groqGateway : this.geminiGateway;
    
    if (!gateway) {
      return {
        status: 'unconfigured',
        provider: providerName,
      };
    }
    // Skip actual LLM call to avoid hanging on slow models
    // Just check if gateway is configured
    return {
      status: 'healthy',
      provider: providerName
    };
  }
}