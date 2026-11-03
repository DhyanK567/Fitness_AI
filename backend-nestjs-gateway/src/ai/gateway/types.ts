import { ERP_METHODS } from '@wsos/erp-methods';

export const STAFF_LIST = ERP_METHODS.STAFF_LIST;
export const STAFF_GET = ERP_METHODS.STAFF_GET;
export const STAFF_CREATE = ERP_METHODS.STAFF_CREATE;
export const STAFF_UPDATE = ERP_METHODS.STAFF_UPDATE;
export const STAFF_DELETE = ERP_METHODS.STAFF_DELETE;

export const FEEDBACK_LIST = ERP_METHODS.FEEDBACK_LIST;
export const FEEDBACK_GET = ERP_METHODS.FEEDBACK_GET;
export const FEEDBACK_CREATE = ERP_METHODS.FEEDBACK_CREATE;
export const FEEDBACK_UPDATE = ERP_METHODS.FEEDBACK_UPDATE;
export const FEEDBACK_DELETE = ERP_METHODS.FEEDBACK_DELETE;

export const RECOMMENDATION_GET = ERP_METHODS.RECOMMENDATION_GET;

export const REPORT_ATTENDANCE = ERP_METHODS.REPORT_ATTENDANCE;
export const REPORT_MEMBERSHIPS = ERP_METHODS.REPORT_MEMBERSHIPS;

export const EVENT_LIST = ERP_METHODS.EVENT_LIST;
export const EVENT_GET = ERP_METHODS.EVENT_GET;
export const EVENT_CREATE = ERP_METHODS.EVENT_CREATE;
export const EVENT_UPDATE = ERP_METHODS.EVENT_UPDATE;
export const EVENT_DELETE = ERP_METHODS.EVENT_DELETE;

// ============================================
// LLM Gateway Types
// ============================================

/** Error codes for LLM failures. */
export type LlmErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'auth'
  | 'bad_request'
  | 'unavailable'
  | 'invalid_response'
  | 'network'
  | 'unknown';

/** Structured LLM error with retryability hint. */
export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly retryable: boolean;
  readonly providerData?: unknown;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    code: LlmErrorCode,
    message: string,
    options?: { retryable?: boolean; providerData?: unknown; cause?: unknown; status?: number },
  ) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.retryable = options?.retryable ?? (code === 'timeout' || code === 'unavailable' || code === 'network');
    this.providerData = options?.providerData;
    this.status = options?.status;
    this.cause = options?.cause;
  }
}

/** A single message in the conversation. */
export interface Message {
  role: 'user' | 'model' | 'system' | 'tool';
  text?: string;
  name?: string; // tool name for tool messages
  result?: unknown; // tool result
  toolCalls?: ToolCall[];
  providerData?: unknown;
}

/** A tool call requested by the model. */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** A tool specification for function calling. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

/** JSON Schema for tool parameters (subset supported by providers). */
export type JsonSchema =
  | { type: 'string' | string; description?: string; enum?: string[] }
  | { type: 'number' | string; description?: string; minimum?: number; maximum?: number }
  | { type: 'integer' | string; description?: string; minimum?: number; maximum?: number }
  | { type: 'boolean' | string; description?: string }
  | {
      type: 'object' | string;
      description?: string;
      properties: Record<string, JsonSchema>;
      required?: string[];
      additionalProperties?: boolean;
    }
  | { type: 'array' | string; description?: string; items: JsonSchema };

/** Request to generate a completion. */
export interface GenerateRequest {
  messages: Message[];
  system?: string;
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Raw provider result before gateway processing. */
export interface ProviderResult {
  text?: string;
  toolCalls: ToolCall[];
  providerData?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

/** Gateway response after processing. */
export interface GenerateResponse {
  text: string;
  toolCalls: ToolCall[];
  message: {
    role: 'model';
    text: string;
    toolCalls: ToolCall[];
    providerData?: unknown;
  };
  meta: {
    provider: string;
    model: string;
    latencyMs: number;
    attempts: number;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
    };
  };
}

/** LLM Provider interface for swapping providers. */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  generate(req: GenerateRequest, signal: AbortSignal): Promise<ProviderResult>;
}