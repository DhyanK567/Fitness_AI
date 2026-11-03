// Spike S6: tool-calling round trip THROUGH the LLM gateway.
// Run: pnpm exec tsx --env-file=backend-nestjs-gateway/.env scripts/s6-gateway-roundtrip.ts
import { createGatewayFromEnv } from '../backend-nestjs-gateway/src/ai/gateway/index';
import type { Message, ToolSpec } from '../backend-nestjs-gateway/src/ai/gateway/index';
import { toolByName } from '../shared/ai-tool-definitions/index';

const SYSTEM = 'You are a studio admin assistant. Answer only from tool results.';

async function main() {
  const gateway = createGatewayFromEnv(process.env, (e) =>
    console.log(`  (gateway retried after "${e.code}" from ${e.provider})`),
  );

  // Hand-written for now. The tool registry will generate this from the zod schemas.
  const def = toolByName('getExpiringMemberships')!;
  const tools: ToolSpec[] = [
    {
      name: def.name,
      description: def.purpose,
      parameters: {
        type: 'object',
        properties: { daysAhead: { type: 'integer', description: 'Days ahead, 1 to 30. Default 7.' } },
      },
    },
  ];

  const messages: Message[] = [{ role: 'user', text: 'Which memberships expire this week?' }];

  const first = await gateway.generate({ messages, tools, system: SYSTEM });
  const call = first.toolCalls[0];
  if (!call) throw new Error(`FAIL: model did not call a tool. Text: ${first.text}`);
  console.log('Step 1 OK - tool requested:', call.name, call.args);

  // What the orchestrator/registry will do: known tool + validated args.
  const tool = toolByName(call.name);
  if (!tool) throw new Error(`FAIL: model asked for unregistered tool "${call.name}"`);
  const parsed = tool.args.safeParse(call.args);
  if (!parsed.success) throw new Error(`FAIL: arguments rejected by schema: ${parsed.error.message}`);
  console.log('Step 2 OK - arguments valid against zod schema:', parsed.data);

  const fakeResult = {
    count: 2,
    members: [
      { name: 'Asha', expiresOn: '2026-10-03' },
      { name: 'Ravi', expiresOn: '2026-10-05' },
    ],
  };
  const second = await gateway.generate({
    messages: [...messages, first.message, { role: 'tool', name: call.name, result: fakeResult }],
    tools,
    system: SYSTEM,
  });
  console.log('Step 3 OK - answer:', second.text);

  const total = first.meta.latencyMs + second.meta.latencyMs;
  console.log(
    `PASS: S6 round trip via gateway. ${first.meta.provider}/${first.meta.model}, ${total} ms total, attempts ${first.meta.attempts}+${second.meta.attempts}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
