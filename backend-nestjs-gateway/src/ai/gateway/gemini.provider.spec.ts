import { GeminiProvider, LlmGateway, LlmError } from './index';
import { toGeminiContents, toGeminiSchema } from './providers/gemini.provider';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function providerWith(handler: (body: any) => Response) {
  const seen: any[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    seen.push(body);
    return handler(body);
  }) as unknown as typeof fetch;
  return { p: new GeminiProvider({ apiKey: 'k', model: 'm', fetchImpl }), seen };
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
const tools = [
  {
    name: 'getExpiringMemberships',
    description: 'List memberships expiring within N days.',
    parameters: {
      type: 'object',
      properties: { daysAhead: { type: 'integer', default: 7 } },
      additionalProperties: false,
      required: [] as string[],
    },
  },
];

describe('GeminiProvider', () => {
  it('converts schema: upper-case types, drops unsupported keys and empty required', () => {
    const s = toGeminiSchema(tools[0].parameters) as any;
    expect(s.type).toBe('OBJECT');
    expect(s.properties.daysAhead.type).toBe('INTEGER');
    expect('default' in s.properties.daysAhead).toBe(false);
    expect('additionalProperties' in s).toBe(false);
    expect('required' in s).toBe(false);
  });

  it('parses a tool call and sends the model turn back unchanged (thought signatures)', async () => {
    const modelContent = {
      role: 'model',
      parts: [
        { functionCall: { name: 'getExpiringMemberships', args: { daysAhead: 7 } }, thoughtSignature: 'sig-123' },
      ],
    };
    const { p, seen } = providerWith((b) =>
      b.contents.length === 1
        ? json(200, { candidates: [{ content: modelContent }] })
        : json(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'Two expire.' }] } }] }),
    );
    const gw = new LlmGateway(p, { retryDelayMs: 1 });
    const messages = [{ role: 'user' as const, text: 'Which memberships expire this week?' }];

    const first = await gw.generate({ messages, tools });
    expect(first.toolCalls).toEqual([{ name: 'getExpiringMemberships', args: { daysAhead: 7 } }]);

    const second = await gw.generate({
      messages: [...messages, first.message, { role: 'tool', name: 'getExpiringMemberships', result: { count: 2 } }],
      tools,
    });
    expect(second.text).toBe('Two expire.');
    expect(seen[1].contents[1].parts[0].thoughtSignature).toBe('sig-123');
    expect(seen[1].contents[2].parts[0].functionResponse.response).toEqual({ count: 2 });
  });

  it('merges consecutive tool results into one user turn and wraps non-objects', () => {
    const c = toGeminiContents([
      { role: 'user', text: 'x' },
      { role: 'model', toolCalls: [{ name: 'a', args: {} }, { name: 'b', args: {} }] },
      { role: 'tool', name: 'a', result: [1, 2] },
      { role: 'tool', name: 'b', result: { ok: true } },
    ]);
    expect(c).toHaveLength(3);
    expect(c[2].parts).toHaveLength(2);
    expect(c[2].parts[0].functionResponse?.response).toEqual({ result: [1, 2] });
  });

  it('maps HTTP errors: 503 retryable; 400, 403, 429 are not', async () => {
    const cases: Array<[number, string, boolean]> = [
      [503, 'unavailable', true],
      [400, 'bad_request', false],
      [403, 'auth', false],
      [429, 'rate_limited', false],
    ];
    for (const [status, code, retryable] of cases) {
      const { p } = providerWith(() => json(status, { error: { message: 'm' } }));
      const e = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
      expect(e.code).toBe(code);
      expect(e.retryable).toBe(retryable);
      expect(e.status).toBe(status);
    }
  });

  it('turns an empty candidate (e.g. safety block) into invalid_response', async () => {
    const { p } = providerWith(() => json(200, { candidates: [{ finishReason: 'SAFETY' }] }));
    const e = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
    expect(e.code).toBe('invalid_response');
  });

  it('maps network failure to a retryable error and never leaks the key', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const p = new GeminiProvider({ apiKey: 'SECRET-KEY', model: 'm', fetchImpl });
    const e = await failure(p.generate({ messages: userMsg }, new AbortController().signal));
    expect(e.code).toBe('network');
    expect(e.retryable).toBe(true);
    expect(e.message.includes('SECRET-KEY')).toBe(false);
  });
});
