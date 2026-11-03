import { LlmError } from '../types';
import type {
  GenerateRequest,
  LlmProvider,
  Message,
  ProviderResult,
  ToolCall,
} from '../types';

interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface GroqConversationData {
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
}

export interface GroqOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function extractRetryAfterMs(headers?: Headers): number | undefined {
  if (!headers) return undefined;
  const retryAfter = headers.get('Retry-After') || headers.get('retry-after');
  if (!retryAfter) return undefined;
  const retryAfterSec = parseInt(retryAfter, 10);
  if (isNaN(retryAfterSec)) return undefined;
  return retryAfterSec * 1000;
}

function mapHttpError(status: number, message: string, body?: any, headers?: Headers): LlmError {
  // Check for Groq rate limit errors (429)
  if (status === 429) {
    const errorMessage = body?.error?.message || message;
    const lowerMessage = errorMessage.toLowerCase();
    
    // Extract retry-after from headers
    const retryAfterMs = extractRetryAfterMs(headers);
    
    // Classify the rate limit type using structured detection
    // Priority: TPD (daily quota) > TPM (per-minute) > RPM (per-minute requests) > unknown
    const isTpdError = 
      lowerMessage.includes('daily') ||
      lowerMessage.includes('quota') ||
      lowerMessage.includes('day') ||
      lowerMessage.includes('per day') ||
      lowerMessage.includes('200000') ||
      lowerMessage.includes('token per day') ||
      lowerMessage.includes('tpd') ||
      (lowerMessage.includes('limit') && lowerMessage.includes('daily'));
    
    const isTpmError = 
      lowerMessage.includes('tokens per minute') || 
      lowerMessage.includes('tpm') ||
      (lowerMessage.includes('rate limit') && lowerMessage.includes('token')) ||
      (lowerMessage.includes('token') && lowerMessage.includes('minute'));
    
    const isRpmError = 
      lowerMessage.includes('requests per minute') ||
      lowerMessage.includes('rpm') ||
      (lowerMessage.includes('rate limit') && lowerMessage.includes('request'));
    
    // TPD (Tokens Per Day) exhaustion - NOT retryable, must fallback
    if (isTpdError) {
      return new LlmError('rate_limited', errorMessage, {
        status,
        retryable: false, // TPD exhaustion requires provider switch, not retry
        providerData: { 
          type: 'tpd_exhausted',
          retryAfterMs: retryAfterMs,
          // Include raw error for logging without credentials
          errorCode: body?.error?.code,
        },
      });
    }
    
    // TPM (Tokens Per Minute) limit - retryable with backoff
    if (isTpmError) {
      return new LlmError('rate_limited', errorMessage, {
        status,
        retryable: true,
        providerData: { 
          type: 'tpm_limit',
          tpmLimit: 8000,
          requestedTokens: body?.usage?.prompt_tokens || body?.usage?.total_tokens,
          retryAfterMs: retryAfterMs,
        },
      });
    }
    
    // RPM (Requests Per Minute) limit - retryable with backoff
    if (isRpmError) {
      return new LlmError('rate_limited', errorMessage, {
        status,
        retryable: true,
        providerData: { 
          type: 'rpm_limit',
          retryAfterMs: retryAfterMs,
        },
      });
    }
    
    // Unknown rate limit type - retryable but log for investigation
    return new LlmError('rate_limited', errorMessage, {
      status,
      retryable: true,
      providerData: { 
        type: 'rate_limit_unknown',
        retryAfterMs: retryAfterMs,
      },
    });
  }
  
  if (status === 401 || status === 403) {
    return new LlmError('auth', message, { status, retryable: true });
  }
  if (status === 408) {
    return new LlmError('timeout', message, { status });
  }
  if ([500, 502, 503, 504].includes(status)) {
    return new LlmError('unavailable', message, { status });
  }
  if (status >= 400 && status < 500) {
    return new LlmError('bad_request', message, { status, retryable: true });
  }
  return new LlmError('unknown', message, { status });
}

function stringifyArguments(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? {});
}

function toGroqMessages(req: GenerateRequest): GroqMessage[] {
  const result: GroqMessage[] = [];

  if (req.system) {
    result.push({ role: 'system', content: req.system });
  }

  for (const message of req.messages) {
    if (message.role === 'system') {
      result.push({ role: 'system', content: message.text ?? '' });
      continue;
    }

    if (message.role === 'user') {
      result.push({ role: 'user', content: message.text ?? '' });
      continue;
    }

    if (message.role === 'model') {
      const raw = message.providerData as GroqConversationData | undefined;
      const toolCalls = message.toolCalls ?? [];

      result.push({
        role: 'assistant',
        content: message.text ?? null,
        ...(toolCalls.length
          ? {
              tool_calls: toolCalls.map((call, index) => ({
                id: raw?.toolCalls?.[index]?.id ?? `call_${index + 1}`,
                type: 'function' as const,
                function: {
                  name: call.name,
                  arguments: stringifyArguments(call.args),
                },
              })),
            }
          : {}),
      });
      continue;
    }

    if (message.role === 'tool') {
      // Find the most recent assistant message with tool_calls (not the immediately previous message)
      let assistantWithTools: GroqMessage | undefined;
      for (let i = result.length - 1; i >= 0; i--) {
        const msg = result[i];
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
          assistantWithTools = msg;
          break;
        }
      }
      const pending = assistantWithTools?.tool_calls ?? [];
      const matched = pending.find(
        (call) => call.function.name === message.name,
      );

      result.push({
        role: 'tool',
        tool_call_id: matched?.id ?? `call_${message.name ?? 'unknown'}`,
        name: message.name,
        content:
          typeof message.result === 'string'
            ? message.result
            : JSON.stringify(message.result ?? {}),
      });
    }
  }

  return result;
}

export class GroqProvider implements LlmProvider {
  readonly name = 'groq';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GroqOptions) {
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = (
      options.baseUrl ?? 'https://api.groq.com/openai/v1'
    ).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generate(
    request: GenerateRequest,
    signal: AbortSignal,
  ): Promise<ProviderResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: toGroqMessages(request),
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }
    if (request.tools?.length) {
      body.tools = request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }

    let response: Response;

    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new LlmError('timeout', 'Groq request timed out', {
          cause: error,
        });
      }
      throw new LlmError('network', 'Could not reach Groq', {
        cause: error,
      });
    }

    let json: any;

    try {
      json = await response.json();
    } catch (error) {
      if (!response.ok) {
        throw mapHttpError(
          response.status,
          `Groq returned HTTP ${response.status}`,
          undefined,
          response.headers
        );
      }
      throw new LlmError(
        'invalid_response',
        'Groq returned a non-JSON response',
        { cause: error },
      );
    }

    if (!response.ok) {
      throw mapHttpError(
        response.status,
        json?.error?.message ?? `Groq returned HTTP ${response.status}`,
        json,
        response.headers
      );
    }

    const choice = json?.choices?.[0];
    const assistantMessage = choice?.message;

    if (!assistantMessage || typeof assistantMessage !== 'object') {
      throw new LlmError(
        'invalid_response',
        'Groq returned no usable assistant message',
      );
    }

    const rawCalls = assistantMessage.tool_calls ?? [];
    const calls: GroqConversationData['toolCalls'] = [];
    const toolCalls: ToolCall[] = [];

    for (const raw of rawCalls) {
      let args: Record<string, unknown>;

      try {
        const parsed = JSON.parse(raw.function.arguments || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Tool arguments must be a JSON object');
        }
        args = parsed as Record<string, unknown>;
      } catch (error) {
        throw new LlmError(
          'invalid_response',
          `Groq returned invalid arguments for tool "${raw.function.name}"`,
          { cause: error },
        );
      }

      calls.push({
        id: raw.id,
        name: raw.function.name,
        args,
      });
      toolCalls.push({ name: raw.function.name, args });
    }

    return {
      text:
        typeof assistantMessage.content === 'string'
          ? assistantMessage.content
          : undefined,
      toolCalls,
      providerData: { toolCalls: calls } satisfies GroqConversationData,
      usage: {
        inputTokens: json?.usage?.prompt_tokens,
        outputTokens: json?.usage?.completion_tokens,
      },
    };
  }
}
