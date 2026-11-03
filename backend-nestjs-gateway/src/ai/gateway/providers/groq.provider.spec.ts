import { GroqProvider, LlmGateway, LlmError } from '../index';
import type { GenerateRequest, ProviderResult } from '../types';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function providerWith(handler: (body: any) => Response) {
  const seen: any[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    seen.push(body);
    return handler(body);
  }) as unknown as typeof fetch;
  return { p: new GroqProvider({ apiKey: 'k', model: 'm', fetchImpl }), seen };
}

async function failure(p: Promise<unknown>): Promise<LlmError> {
  try {
    await p;
  } catch (e) {
    return e as LlmError;
  }
  throw new Error('expected the call to fail');
}

const userMsg = [{ role: 'user' as const, text: 'x' }];
const testTool = {
  name: 'testTool',
  description: '',
  parameters: { type: 'object' as const, properties: {}, required: [] as string[] },
};

const expiringTool = {
  name: 'getExpiringMemberships',
  description: 'List memberships expiring within N days.',
  parameters: {
    type: 'object' as const,
    properties: { daysAhead: { type: 'integer' as const, default: 7 } },
    additionalProperties: false,
    required: [] as string[],
  },
};

const memberCountTool = {
  name: 'getMemberCount',
  description: '',
  parameters: { type: 'object' as const, properties: {}, required: [] as string[] },
};

describe('GroqProvider', () => {
  it('sends system message as native system role', async () => {
    const { p, seen } = providerWith(() =>
      json(200, {
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
    await p.generate({ messages: userMsg, system: 'You are a helpful assistant' }, new AbortController().signal);
    expect(seen[0].messages[0].role).toBe('system');
    expect(seen[0].messages[0].content).toBe('You are a helpful assistant');
  });

  it('includes system message in messages array for native system role support', async () => {
    const { p, seen } = providerWith(() =>
      json(200, {
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
    await p.generate(
      { messages: [{ role: 'system', text: 'System instruction' }, { role: 'user', text: 'Hello' }] },
      new AbortController().signal
    );
    expect(seen[0].messages[0].role).toBe('system');
    expect(seen[0].messages[0].content).toBe('System instruction');
    expect(seen[0].messages[1].role).toBe('user');
  });

  it('serializes tool calls with correct format', async () => {
    const { p, seen } = providerWith(() =>
      json(200, {
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    );
    await p.generate({ messages: userMsg, tools: [expiringTool] }, new AbortController().signal);
    expect(seen[0].tools).toBeDefined();
    expect(seen[0].tools[0].type).toBe('function');
    expect(seen[0].tools[0].function.name).toBe('getExpiringMemberships');
    expect(seen[0].tool_choice).toBe('auto');
  });

  it('parses a tool call and preserves the provider-generated ID', async () => {
    const modelContent = {
      role: 'assistant',
      content: 'I will check that.',
      tool_calls: [
        { id: 'call_abc123', type: 'function', function: { name: 'getExpiringMemberships', arguments: '{"daysAhead":7}' } },
      ],
    };
    const { p, seen } = providerWith((b) =>
      b.messages.length === 1
        ? json(200, { choices: [{ message: modelContent }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
        : json(200, { choices: [{ message: { role: 'assistant', content: 'Two expire.', tool_calls: [] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
    const gw = new LlmGateway(p, { retryDelayMs: 1 });
    const messages = [{ role: 'user' as const, text: 'Which memberships expire this week?' }];

    const first = await gw.generate({ messages, tools: [expiringTool] });
    expect(first.toolCalls).toEqual([{ name: 'getExpiringMemberships', args: { daysAhead: 7 } }]);
    const providerData = first.message.providerData as { toolCalls: Array<{ id: string }> } | undefined;
    expect(providerData).toBeDefined();
    expect(providerData!.toolCalls[0].id).toBe('call_abc123');
  });

  it('handles multiple tool calls in a single response', async () => {
    const modelContent = {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'getExpiringMemberships', arguments: '{"daysAhead":7}' } },
        { id: 'call_2', type: 'function', function: { name: 'getMemberCount', arguments: '{}' } },
      ],
    };
    const { p } = providerWith(() =>
      json(200, { choices: [{ message: modelContent }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
    const gw = new LlmGateway(p, { retryDelayMs: 1 });
    const messages = [{ role: 'user' as const, text: 'Check both' }];

    const result = await gw.generate({ messages, tools: [expiringTool, memberCountTool] });
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].name).toBe('getExpiringMemberships');
    expect(result.toolCalls[1].name).toBe('getMemberCount');
    const providerData = result.message.providerData as { toolCalls: Array<{ id: string }> } | undefined;
    expect(providerData).toBeDefined();
    expect(providerData!.toolCalls[0].id).toBe('call_1');
    expect(providerData!.toolCalls[1].id).toBe('call_2');
  });

  it('matches tool result messages to assistant tool calls by name and preserves IDs', async () => {
    const modelContent = {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_abc', type: 'function', function: { name: 'toolA', arguments: '{}' } },
        { id: 'call_def', type: 'function', function: { name: 'toolB', arguments: '{}' } },
      ],
    };
    const toolA = { name: 'toolA', description: '', parameters: { type: 'object' as const, properties: {}, required: [] as string[] } };
    const toolB = { name: 'toolB', description: '', parameters: { type: 'object' as const, properties: {}, required: [] as string[] } };
    const { p, seen } = providerWith((b) =>
      b.messages.length === 1
        ? json(200, { choices: [{ message: modelContent }], usage: { prompt_tokens: 10, completion_tokens: 5 } })
        : json(200, { choices: [{ message: { role: 'assistant', content: 'Done', tool_calls: [] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
    const gw = new LlmGateway(p, { retryDelayMs: 1 });
    const messages = [{ role: 'user' as const, text: 'x' }];

    const first = await gw.generate({ messages, tools: [toolA, toolB] });

    await gw.generate({
      messages: [
        ...messages,
        first.message,
        { role: 'tool', name: 'toolA', result: { a: 1 } },
        { role: 'tool', name: 'toolB', result: { b: 2 } },
      ],
      tools: [toolA, toolB],
    });

    const secondCallMessages = seen[1].messages;
    const toolMessages = secondCallMessages.filter((m: any) => m.role === 'tool');
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[0].tool_call_id).toBe('call_abc');
    expect(toolMessages[0].name).toBe('toolA');
    expect(toolMessages[1].tool_call_id).toBe('call_def');
    expect(toolMessages[1].name).toBe('toolB');
  });

  it('parses tool arguments as JSON objects', async () => {
    const modelContent = {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'testTool', arguments: '{"key":"value","num":42}' } },
      ],
    };
    const { p } = providerWith(() =>
      json(200, { choices: [{ message: modelContent }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
    const gw = new LlmGateway(p, { retryDelayMs: 1 });
    const result = await gw.generate({ messages: userMsg, tools: [testTool] });
    expect(result.toolCalls[0].args).toEqual({ key: 'value', num: 42 });
  });

  it('throws on malformed tool arguments JSON', async () => {
    const modelContent = {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'testTool', arguments: 'not valid json' } },
      ],
    };
    const { p } = providerWith(() =>
      json(200, { choices: [{ message: modelContent }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
    const gw = new LlmGateway(p, { retryDelayMs: 1 });
    const promise = gw.generate({ messages: userMsg, tools: [testTool] });
    const error = await failure(promise);
    expect(error.code).toBe('invalid_response');
    expect(error.message).toContain('invalid arguments');
  });

  it('throws on tool arguments that are not a JSON object', async () => {
    const modelContent = {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'testTool', arguments: '"just a string"' } },
      ],
    };
    const { p } = providerWith(() =>
      json(200, { choices: [{ message: modelContent }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
    const gw = new LlmGateway(p, { retryDelayMs: 1 });
    const promise = gw.generate({ messages: userMsg, tools: [testTool] });
    const error = await failure(promise);
    expect(error.code).toBe('invalid_response');
    expect(error.message).toContain('invalid arguments');
  });

  it('extracts token usage from response', async () => {
    const { p } = providerWith(() =>
      json(200, {
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 123, completion_tokens: 456 },
      }),
    );
    const gw = new LlmGateway(p, { retryDelayMs: 1 });
    const result = await gw.generate({ messages: userMsg, tools: [] });
    expect(result.meta.usage).toEqual({ inputTokens: 123, outputTokens: 456 });
  });

  it('maps HTTP 400 to bad_request', async () => {
    const { p } = providerWith(() => json(400, { error: { message: 'bad schema' } }));
    const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
    expect(error.code).toBe('bad_request');
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(400);
  });

  it('maps HTTP 401/403 to auth', async () => {
    for (const status of [401, 403]) {
      const { p } = providerWith(() => json(status, { error: { message: 'unauthorized' } }));
      const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
      expect(error.code).toBe('auth');
      expect(error.retryable).toBe(true);
      expect(error.status).toBe(status);
    }
  });

  it('maps HTTP 408 to timeout', async () => {
    const { p } = providerWith(() => json(408, { error: { message: 'timeout' } }));
    const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
    expect(error.code).toBe('timeout');
    expect(error.status).toBe(408);
  });

  it('maps HTTP 429 to rate_limited (retryable)', async () => {
    const { p } = providerWith(() => json(429, { error: { message: 'rate limited' } }));
    const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
    expect(error.code).toBe('rate_limited');
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(429);
  });

  it('maps HTTP 5xx to unavailable (retryable)', async () => {
    for (const status of [500, 502, 503, 504]) {
      const { p } = providerWith(() => json(status, { error: { message: 'server error' } }));
      const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
      expect(error.code).toBe('unavailable');
      expect(error.retryable).toBe(true);
      expect(error.status).toBe(status);
    }
  });

  it('maps network failure to retryable network error and never leaks the key', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const p = new GroqProvider({ apiKey: 'SECRET-KEY', model: 'm', fetchImpl });
    const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
    expect(error.code).toBe('network');
    expect(error.retryable).toBe(true);
    expect(error.message.includes('SECRET-KEY')).toBe(false);
  });

  it('maps abort signal to timeout error', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return json(200, { choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }] });
    }) as unknown as typeof fetch;
    const p = new GroqProvider({ apiKey: 'k', model: 'm', fetchImpl });
    const error = await failure(p.generate({ messages: userMsg }, controller.signal));
    expect(error.code).toBe('timeout');
  });

  it('throws on empty choices array', async () => {
    const { p } = providerWith(() => json(200, { choices: [] }));
    const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
    expect(error.code).toBe('invalid_response');
  });

  it('includes model in request body', async () => {
    const { p, seen } = providerWith(() =>
      json(200, { choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }], usage: {} }),
    );
    await p.generate({ messages: userMsg }, new AbortController().signal);
    expect(seen[0].model).toBe('m');
  });

  it('includes temperature and max_tokens when provided', async () => {
    const { p, seen } = providerWith(() =>
      json(200, { choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }], usage: {} }),
    );
    await p.generate({ messages: userMsg, temperature: 0.5, maxTokens: 100 }, new AbortController().signal);
    expect(seen[0].temperature).toBe(0.5);
    expect(seen[0].max_tokens).toBe(100);
  });

  describe('TPM Error Handling', () => {
    it('detects Groq TPM limit error (tokens per minute in message)', async () => {
      const { p } = providerWith(() => json(429, {
        error: { message: 'Request too large for model on tokens per minute (TPM): Limit 8000, Requested 9745' }
      }));
      const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
      expect(error.code).toBe('rate_limited');
      expect(error.retryable).toBe(true);
      expect(error.providerData).toBeDefined();
      expect((error.providerData as any).type).toBe('tpm_limit');
      expect((error.providerData as any).tpmLimit).toBe(8000);
    });

    it('detects Groq TPM limit error (TPM in message)', async () => {
      const { p } = providerWith(() => json(429, {
        error: { message: 'TPM limit exceeded: 9745 tokens requested, limit is 8000' }
      }));
      const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
      expect(error.code).toBe('rate_limited');
      expect(error.retryable).toBe(true);
      expect((error.providerData as any).type).toBe('tpm_limit');
    });

    it('detects Groq TPM limit error (rate limit with token in message)', async () => {
      const { p } = providerWith(() => json(429, {
        error: { message: 'rate limit exceeded: token limit reached' }
      }));
      const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
      expect(error.code).toBe('rate_limited');
      expect(error.retryable).toBe(true);
      expect((error.providerData as any).type).toBe('tpm_limit');
    });

    it('treats ordinary 429 as retryable rate limit with unknown subtype', async () => {
      const { p } = providerWith(() => json(429, {
        error: { message: 'rate limit exceeded, try again later' }
      }));
      const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
      expect(error.code).toBe('rate_limited');
      expect(error.retryable).toBe(true);
      expect((error.providerData as any).type).toBe('rate_limit_unknown');
    });

    it('includes TPM limit and requested tokens in providerData', async () => {
      const { p } = providerWith(() => json(429, {
        error: { message: 'TPM limit exceeded: 9745 tokens requested' },
        usage: { prompt_tokens: 9745 }
      }));
      const error = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
      expect(error.providerData).toBeDefined();
      expect((error.providerData as any).tpmLimit).toBe(8000);
      expect((error.providerData as any).requestedTokens).toBe(9745);
    });
  });
});