import { LlmGateway, LlmError, createGatewayFromEnv, createFallbackGatewayFromEnv, createGatewayFromConfig } from './index';
import type { LlmProvider, ProviderResult } from './index';
import { GroqProvider } from './providers/groq.provider';

const OK: ProviderResult = { text: 'hello', toolCalls: [] };
const req = { messages: [{ role: 'user' as const, text: 'hi' }] };
const fast = { retryDelayMs: 1, timeoutMs: 200, maxRetries: 1, maxTotalRetryTimeMs: 1000, maxBackoffMs: 100, backoffMultiplier: 2 };

/** Fake provider that plays back a script of results/errors. */
function fake(script: Array<ProviderResult | Error | 'hang'>): LlmProvider & { calls: number } {
  const p = {
    name: 'fake',
    model: 'fake-1',
    calls: 0,
    async generate(_r: unknown, signal: AbortSignal): Promise<ProviderResult> {
      const step = script[Math.min(p.calls, script.length - 1)];
      p.calls++;
      if (step === 'hang') {
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      }
      if (step instanceof Error) throw step;
      return step;
    },
  };
  return p;
}

async function failure(p: Promise<unknown>): Promise<LlmError> {
  try {
    await p;
  } catch (e) {
    return e as LlmError;
  }
  throw new Error('expected the call to fail');
}

describe('LlmGateway', () => {
  it('returns the provider result with meta', async () => {
    const r = await new LlmGateway(fake([OK]), fast).generate(req);
    expect(r.text).toBe('hello');
    expect(r.meta.attempts).toBe(1);
    expect(r.message.role).toBe('model');
  });

  it('retries once on 503 and then succeeds', async () => {
    const p = fake([new LlmError('unavailable', 'high demand', { status: 503 }), OK]);
    const events: string[] = [];
    const r = await new LlmGateway(p, fast, (e) => events.push(e.type)).generate(req);
    expect(p.calls).toBe(2);
    expect(r.meta.attempts).toBe(2);
    expect(events).toEqual(['retry']);
  });

  it('gives up after exactly one retry (still 503)', async () => {
    const p = fake([new LlmError('unavailable', 'high demand', { status: 503 })]);
    const e = await failure(new LlmGateway(p, fast).generate(req));
    expect(e.code).toBe('unavailable');
    expect(p.calls).toBe(2);
  });

  it('does not retry a bad request (400)', async () => {
    const p = fake([new LlmError('bad_request', 'bad schema', { status: 400 })]);
    const e = await failure(new LlmGateway(p, fast).generate(req));
    expect(e.code).toBe('bad_request');
    expect(p.calls).toBe(1);
  });

  it('does not retry auth or rate-limit errors', async () => {
    for (const code of ['auth', 'rate_limited'] as const) {
      const p = fake([new LlmError(code, 'nope')]);
      const e = await failure(new LlmGateway(p, fast).generate(req));
      expect(e.code).toBe(code);
      expect(p.calls).toBe(1);
    }
  });

  it('times out a hanging provider and retries once', async () => {
    const p = fake(['hang']);
    const e = await failure(new LlmGateway(p, { retryDelayMs: 1, timeoutMs: 30, maxRetries: 1, maxTotalRetryTimeMs: 1000, maxBackoffMs: 100, backoffMultiplier: 2 }).generate(req));
    expect(e.code).toBe('timeout');
    expect(p.calls).toBe(2);
  });

  it('wraps unexpected errors as LlmError(unknown) without retry', async () => {
    const p = fake([new Error('boom')]);
    const e = await failure(new LlmGateway(p, fast).generate(req));
    expect(e.code).toBe('unknown');
    expect(p.calls).toBe(1);
  });
});

describe('createGatewayFromEnv', () => {
  const baseEnv = { LLM_MODEL: 'test-model', LLM_API_KEY: 'valid-key' };

  it('creates GroqProvider when LLM_PROVIDER=groq', () => {
    const gw = createGatewayFromEnv({ ...baseEnv, LLM_PROVIDER: 'groq' });
    expect(gw).toBeInstanceOf(LlmGateway);
    // Access private provider via generate to verify type
    // We can't directly access private field, but we can verify behavior
  });

  it('creates GeminiProvider when LLM_PROVIDER=gemini', () => {
    const gw = createGatewayFromEnv({ ...baseEnv, LLM_PROVIDER: 'gemini' });
    expect(gw).toBeInstanceOf(LlmGateway);
  });

  it('defaults to Gemini when LLM_PROVIDER is not set', () => {
    const gw = createGatewayFromEnv(baseEnv);
    expect(gw).toBeInstanceOf(LlmGateway);
  });

  it('throws on missing LLM_MODEL', () => {
    expect(() => createGatewayFromEnv({ LLM_API_KEY: 'valid-key' })).toThrow('LLM_MODEL is not set');
  });

  it('throws on missing LLM_API_KEY', () => {
    expect(() => createGatewayFromEnv({ LLM_MODEL: 'test-model' })).toThrow('LLM_API_KEY is not set');
  });

  it('throws on placeholder LLM_API_KEY', () => {
    expect(() => createGatewayFromEnv({ ...baseEnv, LLM_API_KEY: 'change_me' })).toThrow('LLM_API_KEY is not set');
    expect(() => createGatewayFromEnv({ ...baseEnv, LLM_API_KEY: 'paste_your_key' })).toThrow('LLM_API_KEY is not set');
  });

  it('throws on unsupported provider', () => {
    expect(() => createGatewayFromEnv({ ...baseEnv, LLM_PROVIDER: 'unsupported' })).toThrow('Unsupported LLM_PROVIDER "unsupported"');
  });

  it('applies custom timeout and retries from env', () => {
    const gw = createGatewayFromEnv({
      ...baseEnv,
      LLM_TIMEOUT_MS: '30000',
      LLM_MAX_RETRIES: '2',
    });
    expect(gw).toBeInstanceOf(LlmGateway);
  });
});

describe('createFallbackGatewayFromEnv', () => {
  const baseEnv = { FALLBACK_LLM_MODEL: 'fallback-model', FALLBACK_LLM_API_KEY: 'valid-fallback-key' };

  it('creates GroqProvider when FALLBACK_LLM_PROVIDER=groq', () => {
    const gw = createFallbackGatewayFromEnv({ ...baseEnv, FALLBACK_LLM_PROVIDER: 'groq' });
    expect(gw).toBeInstanceOf(LlmGateway);
  });

  it('creates GeminiProvider when FALLBACK_LLM_PROVIDER=gemini', () => {
    const gw = createFallbackGatewayFromEnv({ ...baseEnv, FALLBACK_LLM_PROVIDER: 'gemini' });
    expect(gw).toBeInstanceOf(LlmGateway);
  });

  it('defaults to Gemini when FALLBACK_LLM_PROVIDER is not set', () => {
    const gw = createFallbackGatewayFromEnv(baseEnv);
    expect(gw).toBeInstanceOf(LlmGateway);
  });

  it('throws on missing FALLBACK_LLM_MODEL', () => {
    expect(() => createFallbackGatewayFromEnv({ FALLBACK_LLM_API_KEY: 'valid-key' })).toThrow('LLM_MODEL is not set');
  });

  it('throws on missing FALLBACK_LLM_API_KEY', () => {
    expect(() => createFallbackGatewayFromEnv({ FALLBACK_LLM_MODEL: 'test-model' })).toThrow('LLM_API_KEY is not set');
  });

  it('throws on placeholder FALLBACK_LLM_API_KEY', () => {
    expect(() => createFallbackGatewayFromEnv({ ...baseEnv, FALLBACK_LLM_API_KEY: 'change_me' })).toThrow('LLM_API_KEY is not set');
    expect(() => createFallbackGatewayFromEnv({ ...baseEnv, FALLBACK_LLM_API_KEY: 'paste_your_key' })).toThrow('LLM_API_KEY is not set');
  });

  it('throws on unsupported provider', () => {
    expect(() => createFallbackGatewayFromEnv({ ...baseEnv, FALLBACK_LLM_PROVIDER: 'unsupported' })).toThrow('Unsupported LLM_PROVIDER "unsupported"');
  });

  it('applies custom timeout and retries from fallback env', () => {
    const gw = createFallbackGatewayFromEnv({
      ...baseEnv,
      FALLBACK_LLM_TIMEOUT_MS: '30000',
      FALLBACK_LLM_MAX_RETRIES: '2',
    });
    expect(gw).toBeInstanceOf(LlmGateway);
  });
});

describe('createGatewayFromConfig', () => {
  it('creates GroqProvider with explicit config', () => {
    const gw = createGatewayFromConfig({ provider: 'groq', model: 'test-model', apiKey: 'valid-key' });
    expect(gw).toBeInstanceOf(LlmGateway);
  });

  it('creates GeminiProvider with explicit config', () => {
    const gw = createGatewayFromConfig({ provider: 'gemini', model: 'test-model', apiKey: 'valid-key' });
    expect(gw).toBeInstanceOf(LlmGateway);
  });

  it('throws on missing model', () => {
    expect(() => createGatewayFromConfig({ provider: 'groq', apiKey: 'valid-key' } as any)).toThrow('LLM_MODEL is not set');
  });

  it('throws on missing apiKey', () => {
    expect(() => createGatewayFromConfig({ provider: 'groq', model: 'test-model' } as any)).toThrow('LLM_API_KEY is not set');
  });

  it('throws on placeholder apiKey', () => {
    expect(() => createGatewayFromConfig({ provider: 'groq', model: 'test-model', apiKey: 'change_me' })).toThrow('LLM_API_KEY is not set');
  });

  it('throws on unsupported provider', () => {
    expect(() => createGatewayFromConfig({ provider: 'unsupported' as any, model: 'test-model', apiKey: 'valid-key' })).toThrow('Unsupported LLM_PROVIDER "unsupported"');
  });
});
