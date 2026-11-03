import { LlmError } from '../types';
import type {
  GenerateRequest,
  JsonSchema,
  LlmProvider,
  Message,
  ProviderResult,
  ToolCall,
} from '../types';

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  [key: string]: unknown;
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

const ALLOWED_SCHEMA_KEYS = new Set([
  'type', 'description', 'properties', 'required', 'items', 'enum',
  'format', 'nullable', 'minimum', 'maximum',
]);

/** Gemini accepts an OpenAPI-style subset: upper-case types, no additionalProperties/default. */
export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!ALLOWED_SCHEMA_KEYS.has(k)) continue;
    if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase();
    else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(v as Record<string, JsonSchema>).map(([name, s]) => [name, toGeminiSchema(s)]),
      );
    } else if (k === 'items' && v && typeof v === 'object') out.items = toGeminiSchema(v as JsonSchema);
    else if (k === 'required' && Array.isArray(v) && v.length === 0) continue;
    else out[k] = v;
  }
  return out;
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { result: v };

export function toGeminiContents(messages: Message[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      const userParts: GeminiPart[] = [];
      if (m.text) userParts.push({ text: m.text });
      contents.push({ role: 'user', parts: userParts });
    } else if (m.role === 'model') {
      const raw = m.providerData as GeminiContent | undefined;
      if (raw && Array.isArray(raw.parts)) {
        contents.push(raw); // send back exactly as received
      } else {
        const parts: GeminiPart[] = [];
        if (m.text) parts.push({ text: m.text });
        for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: c.args } });
        contents.push({ role: 'model', parts });
      }
    } else {
      if (!m.name) throw new LlmError('bad_request', 'Tool message missing name');
      const part: GeminiPart = { functionResponse: { name: m.name, response: asObject(m.result) } };
      const last = contents[contents.length - 1];
      // Parallel tool results must share one user turn.
      if (last && last.role === 'user' && last.parts.every((p) => p.functionResponse)) last.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
    }
  }
  return contents;
}

function mapHttpError(status: number, message: string): LlmError {
  if (status === 401 || status === 403) return new LlmError('auth', message, { status });
  if (status === 429) return new LlmError('rate_limited', message, { status });
  if (status === 408) return new LlmError('timeout', message, { status });
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return new LlmError('unavailable', message, { status });
  }
  if (status >= 400 && status < 500) return new LlmError('bad_request', message, { status });
  return new LlmError('unknown', message, { status });
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GeminiOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(req: GenerateRequest, signal: AbortSignal): Promise<ProviderResult> {
    const body: Record<string, unknown> = { contents: toGeminiContents(req.messages) };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    if (req.tools?.length) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: toGeminiSchema(t.parameters),
          })),
        },
      ];
    }

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/models/${this.model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (signal.aborted) throw new LlmError('timeout', 'LLM call timed out', { cause: err });
      throw new LlmError('network', 'Could not reach the LLM provider', { cause: err });
    }

    let json: any;
    try {
      json = await res.json();
    } catch (err) {
      if (!res.ok) throw mapHttpError(res.status, `Provider returned HTTP ${res.status}`);
      throw new LlmError('invalid_response', 'Provider returned a non-JSON body', { cause: err });
    }
    if (!res.ok) throw mapHttpError(res.status, json?.error?.message ?? `Provider returned HTTP ${res.status}`);

    const candidate = json?.candidates?.[0];
    const content = candidate?.content as GeminiContent | undefined;
    if (!content || !Array.isArray(content.parts)) {
      const why = candidate?.finishReason ?? json?.promptFeedback?.blockReason ?? 'no content';
      throw new LlmError('invalid_response', `Provider returned no usable content (${why})`);
    }

    const toolCalls: ToolCall[] = content.parts
      .filter((p) => p.functionCall)
      .map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
    const text = content.parts
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text as string)
      .join('')
      .trim();

    return {
      text: text || undefined,
      toolCalls,
      providerData: content,
      usage: {
        inputTokens: json?.usageMetadata?.promptTokenCount,
        outputTokens: json?.usageMetadata?.candidatesTokenCount,
      },
    };
  }
}
