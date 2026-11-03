// Set environment variables for token budget config before any modules are loaded
process.env.LLM_MAX_INPUT_TOKENS = '20000';
process.env.LLM_MAX_OUTPUT_TOKENS = '2000';
process.env.LLM_MAX_HISTORY_TURNS = '10';
process.env.LLM_MIN_HISTORY_TURNS = '3';
process.env.LLM_TOKEN_SAFETY_MARGIN = '0.15';
// Use Gemini for tests to avoid Groq's lower token limits
process.env.LLM_PROVIDER = 'gemini';

console.log('[jest.setup.ts] Environment variables set:', {
  LLM_MAX_INPUT_TOKENS: process.env.LLM_MAX_INPUT_TOKENS,
  LLM_MAX_OUTPUT_TOKENS: process.env.LLM_MAX_OUTPUT_TOKENS,
  LLM_MAX_HISTORY_TURNS: process.env.LLM_MAX_HISTORY_TURNS,
  LLM_MIN_HISTORY_TURNS: process.env.LLM_MIN_HISTORY_TURNS,
  LLM_TOKEN_SAFETY_MARGIN: process.env.LLM_TOKEN_SAFETY_MARGIN,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
});
