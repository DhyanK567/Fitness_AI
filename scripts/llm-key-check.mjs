// Gemini tool-calling round trip. Reads config from env (never hard-code keys).
const key = process.env.LLM_API_KEY;
const model = process.env.LLM_MODEL || 'gemini-2.5-flash';
const base = 'https://generativelanguage.googleapis.com/v1beta';

if (!key || key.includes('change_me') || key.includes('paste_your')) {
  console.error('FAIL: LLM_API_KEY is not set in backend-nestjs-gateway/.env');
  process.exit(1);
}

async function call(path, body) {
  const res = await fetch(`${base}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`FAIL: HTTP ${res.status}`, JSON.stringify(json.error ?? json, null, 2));
    process.exit(1);
  }
  return json;
}

// Helper: node ... scripts/llm-key-check.mjs --list   (shows models your key can use)
if (process.argv.includes('--list')) {
  const list = await call('models');
  list.models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .forEach((m) => console.log(m.name.replace('models/', '')));
  process.exit(0);
}

// Mirrors T-01 getExpiringMemberships from shared/ai-tool-definitions
const tools = [{
  functionDeclarations: [{
    name: 'getExpiringMemberships',
    description: 'List memberships expiring within N days.',
    parameters: {
      type: 'OBJECT',
      properties: { daysAhead: { type: 'INTEGER', description: 'Days ahead, 1 to 30' } },
      required: ['daysAhead'],
    },
  }],
}];

const t0 = Date.now();
const contents = [{ role: 'user', parts: [{ text: 'Which memberships expire this week?' }] }];

// Round trip part 1: model should ask to call the tool
const first = await call(`models/${model}:generateContent`, { contents, tools });
const modelContent = first.candidates?.[0]?.content;
const callPart = modelContent?.parts?.find((p) => p.functionCall);
if (!callPart) {
  console.error('FAIL: model did not request the tool. Reply was:', JSON.stringify(modelContent));
  process.exit(1);
}
console.log('Step 1 OK - model requested tool:', callPart.functionCall.name, callPart.functionCall.args);

// Fake tool result (real one comes from ReportingService later)
const toolResult = { count: 2, members: [{ name: 'Asha', expiresOn: '2026-10-03' }, { name: 'Ravi', expiresOn: '2026-10-05' }] };

// Round trip part 2: send the result back, model must answer from it
const second = await call(`models/${model}:generateContent`, {
  contents: [
    ...contents,
    modelContent, // pass the model turn back exactly as received
    { role: 'user', parts: [{ functionResponse: { name: callPart.functionCall.name, response: toolResult } }] },
  ],
  tools,
});
const answer = second.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join(' ');
console.log('Step 2 OK - final answer:', answer);
console.log(`PASS: tool-calling round trip works. Model: ${model}. Time: ${Date.now() - t0} ms`);