import { LlmError } from './types';
import type { GenerateRequest, GenerateResponse, LlmProvider } from './types';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { Logger } from '@nestjs/common';

export interface GatewayConfig {
  /** Per-attempt timeout. */
  timeoutMs: number;
  /** Retries after the first attempt. Architecture says one bounded retry. */
  maxRetries: number;
  retryDelayMs: number;
  /** Maximum total time for all retries (ms). */
  maxTotalRetryTimeMs: number;
  /** Maximum backoff delay (ms). */
  maxBackoffMs: number;
  /** Base for exponential backoff. */
  backoffMultiplier: number;
}

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  timeoutMs: 15000,
  maxRetries: 3,
  retryDelayMs: 1000,
  maxTotalRetryTimeMs: 30000,
  maxBackoffMs: 10000,
  backoffMultiplier: 2,
};

export interface GatewayEvent {
  type: 'retry' | 'fallback' | 'provider_error';
  attempt: number;
  code: string;
  provider: string;
  model: string;
  errorType?: string;
  fallbackProvider?: string;
  fallbackModel?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const name = (err as { name?: string })?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new LlmError('timeout', 'LLM call timed out', { cause: err });
  }
  return new LlmError('unknown', 'Unexpected LLM gateway error', { cause: err });
}

/**
 * Provider cooldown manager for TPD exhaustion.
 * Tracks per-provider cooldown state to avoid repeated calls to exhausted providers.
 */
export class ProviderCooldownManager {
  private readonly cooldowns = new Map<string, { until: number; reason: string }>();
  private readonly logger = new Logger(ProviderCooldownManager.name);

  /**
   * Check if a provider is in cooldown.
   * @returns { inCooldown: boolean, remainingMs: number, reason: string } | null
   */
  check(providerKey: string): { inCooldown: boolean; remainingMs: number; reason: string } | null {
    const cooldown = this.cooldowns.get(providerKey);
    if (!cooldown) return null;
    
    const now = Date.now();
    if (now >= cooldown.until) {
      this.cooldowns.delete(providerKey);
      return null;
    }
    
    return {
      inCooldown: true,
      remainingMs: cooldown.until - now,
      reason: cooldown.reason,
    };
  }

  /**
   * Set a provider cooldown.
   * @param providerKey Unique provider identifier (e.g., "groq:openai/gpt-oss-20b")
   * @param durationMs Cooldown duration in milliseconds
   * @param reason Human-readable reason for cooldown
   */
  set(providerKey: string, durationMs: number, reason: string): void {
    const until = Date.now() + durationMs;
    this.cooldowns.set(providerKey, { until, reason });
    this.logger.warn(`Provider ${providerKey} in cooldown for ${durationMs}ms: ${reason}`);
  }

  /**
   * Clear a provider's cooldown (e.g., after successful call).
   */
  clear(providerKey: string): void {
    if (this.cooldowns.has(providerKey)) {
      this.cooldowns.delete(providerKey);
      this.logger.log(`Provider ${providerKey} cooldown cleared`);
    }
  }
}

export class LlmGateway {
  private readonly provider: LlmProvider;
  private readonly config: GatewayConfig;
  private readonly onEvent?: (e: GatewayEvent) => void;
  private readonly logger = new Logger(LlmGateway.name);

  constructor(
    provider: LlmProvider,
    config: Partial<GatewayConfig> = {},
    onEvent?: (e: GatewayEvent) => void,
  ) {
    this.provider = provider;
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config };
    this.onEvent = onEvent;
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const start = Date.now();
    let attempt = 0;
    const maxTotalRetryTime = this.config.maxTotalRetryTimeMs;
    const maxBackoffMs = this.config.maxBackoffMs;
    const backoffMultiplier = this.config.backoffMultiplier;
    const baseDelay = this.config.retryDelayMs;
    
    for (;;) {
      attempt++;
      try {
        const r = await this.callOnce(req);
        const text = r.text ?? '';
        return {
          text,
          toolCalls: r.toolCalls,
          message: {
            role: 'model',
            text,
            toolCalls: r.toolCalls,
            providerData: r.providerData,
          },
          meta: {
            provider: this.provider.name,
            model: this.provider.model,
            latencyMs: Date.now() - start,
            attempts: attempt,
            usage: r.usage,
          },
        };
      } catch (err) {
        const e = toLlmError(err);
        
        // Classify error type from provider data
        const errorType = e.providerData && typeof e.providerData === 'object' && 'type' in e.providerData
          ? (e.providerData as any).type
          : 'unknown';
        
        const isTpdExhausted = errorType === 'tpd_exhausted';
        const isTpmLimit = errorType === 'tpm_limit';
        const isRpmLimit = errorType === 'rpm_limit';
        const isRateLimit = e.code === 'rate_limited';
        
        // Check if we should retry
        // TPD exhaustion is NEVER retryable - must fallback immediately
        // TPM/RPM limits are retryable with backoff
        const shouldRetry = e.retryable && attempt <= this.config.maxRetries && !isTpdExhausted;
        
        // For TPM/RPM errors, check if we have a retry-after header
        let retryAfterMs: number | undefined;
        if ((isTpmLimit || isRpmLimit) && e.providerData && typeof e.providerData === 'object' && 'retryAfterMs' in e.providerData) {
          retryAfterMs = (e.providerData as any).retryAfterMs;
        }
        
        // Calculate if we have time for another retry
        const elapsedMs = Date.now() - start;
        const hasTimeForRetry = elapsedMs < maxTotalRetryTime;
        
        // Log provider error with full context (no credentials)
        this.logger.error(
          `Provider error: ${this.provider.name}/${this.provider.model} | attempt=${attempt} | ` +
          `code=${e.code} | errorType=${errorType} | retryable=${e.retryable} | ` +
          `shouldRetry=${shouldRetry} | hasTimeForRetry=${hasTimeForRetry} | elapsedMs=${elapsedMs} | ` +
          `message=${e.message}`
        );
        
        if (!shouldRetry || !hasTimeForRetry) {
          if (isTpdExhausted) {
            this.logger.warn(`TPD exhaustion detected for ${this.provider.name}/${this.provider.model} - immediate fallback required`);
          } else if (!hasTimeForRetry) {
            this.logger.warn(`Total retry time (${maxTotalRetryTime}ms) exhausted after ${attempt} attempts for ${this.provider.name}/${this.provider.model}`);
          }
          throw e;
        }
        
        // Calculate backoff delay
        let delayMs: number;
        if (retryAfterMs !== undefined && retryAfterMs > 0) {
          // Use provider's retry-after, capped at maxBackoffMs
          delayMs = Math.min(retryAfterMs, maxBackoffMs);
          this.logger.log(`Rate limit hit (${errorType}), using provider retry-after: ${delayMs}ms`);
        } else {
          // Exponential backoff with jitter
          const exponentialDelay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt - 1), maxBackoffMs);
          const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
          delayMs = Math.floor(exponentialDelay + jitter);
        }
        
        // Ensure we don't exceed max total retry time
        const remainingTime = maxTotalRetryTime - elapsedMs;
        if (delayMs > remainingTime) {
          delayMs = remainingTime;
        }
        
        this.onEvent?.({ 
          type: 'retry', 
          attempt, 
          code: e.code, 
          provider: this.provider.name,
          model: this.provider.model,
          errorType,
        });
        await sleep(delayMs);
      }
    }
  }

  /** One attempt, with a hard timeout even if the provider ignores the signal. */
  private async callOnce(req: GenerateRequest) {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctl.abort();
        reject(new LlmError('timeout', `LLM call exceeded ${this.config.timeoutMs} ms`));
      }, this.config.timeoutMs);
    });
    try {
      return await Promise.race([this.provider.generate(req, ctl.signal), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface GatewayProviderConfig {
  provider: 'gemini' | 'groq';
  model: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/** Build a gateway from explicit provider configuration. */
export function createGatewayFromConfig(
  config: GatewayProviderConfig,
  onEvent?: (e: GatewayEvent) => void,
): LlmGateway {
  const { provider, model, apiKey, baseUrl, timeoutMs, maxRetries } = config;
  
  if (!model) throw new Error('LLM_MODEL is not set');
  if (!apiKey || apiKey.includes('change_me') || apiKey.includes('paste_your')) {
    throw new Error('LLM_API_KEY is not set');
  }

  let providerInstance: LlmProvider;
  switch (provider) {
    case 'gemini':
      providerInstance = new GeminiProvider({ apiKey, model, baseUrl });
      break;
    case 'groq':
      providerInstance = new GroqProvider({ apiKey, model, baseUrl });
      break;
    default:
      throw new Error(`Unsupported LLM_PROVIDER "${provider}". Add an adapter in ai/gateway/providers.`);
  }

  const gatewayConfig: Partial<GatewayConfig> = {};
  if (timeoutMs !== undefined) gatewayConfig.timeoutMs = timeoutMs;
  if (maxRetries !== undefined) gatewayConfig.maxRetries = maxRetries;
  return new LlmGateway(providerInstance, gatewayConfig, onEvent);
}

/** Build a gateway from environment variables (primary provider). */
export function createGatewayFromEnv(
  env: Record<string, string | undefined> = process.env,
  onEvent?: (e: GatewayEvent) => void,
): LlmGateway {
  return createGatewayFromConfig({
    provider: (env.LLM_PROVIDER ?? 'gemini').toLowerCase() as 'gemini' | 'groq',
    model: env.LLM_MODEL ?? '',
    apiKey: env.LLM_API_KEY ?? '',
    timeoutMs: env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : undefined,
    maxRetries: env.LLM_MAX_RETRIES ? Number(env.LLM_MAX_RETRIES) : undefined,
  }, onEvent);
}

/** Build a fallback gateway from environment variables. */
export function createFallbackGatewayFromEnv(
  env: Record<string, string | undefined> = process.env,
  onEvent?: (e: GatewayEvent) => void,
): LlmGateway {
  return createGatewayFromConfig({
    provider: (env.FALLBACK_LLM_PROVIDER ?? 'gemini').toLowerCase() as 'gemini' | 'groq',
    model: env.FALLBACK_LLM_MODEL ?? '',
    apiKey: env.FALLBACK_LLM_API_KEY ?? '',
    timeoutMs: env.FALLBACK_LLM_TIMEOUT_MS ? Number(env.FALLBACK_LLM_TIMEOUT_MS) : undefined,
    maxRetries: env.FALLBACK_LLM_MAX_RETRIES ? Number(env.FALLBACK_LLM_MAX_RETRIES) : undefined,
  }, onEvent);
}
