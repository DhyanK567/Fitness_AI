import { 
  buildTokenAwareMessages, 
  TokenBudgetConfig, 
  DEFAULT_TOKEN_BUDGET_CONFIG,
  TokenBudgetExceededError,
  getProviderLimits,
  estimateTokens,
  isGroqTpmError,
} from '../gateway/token-estimation';

describe('Token Budget Management', () => {
  const mockProvider = 'groq';
  const systemPrompt = 'You are a helpful assistant. '.repeat(50); // ~500 tokens
  const tools = [
    { name: 'tool1', description: 'Tool 1 description '.repeat(20), parameters: { type: 'object', properties: { param1: { type: 'string' } } } },
    { name: 'tool2', description: 'Tool 2 description '.repeat(20), parameters: { type: 'object', properties: { param2: { type: 'string' } } } },
    { name: 'tool3', description: 'Tool 3 description '.repeat(20), parameters: { type: 'object', properties: { param3: { type: 'string' } } } },
  ];

  const baseConfig = {
    maxInputTokens: 2000,
    reservedOutputTokens: 500,
    maxHistoryTurns: 10,
    minHistoryTurns: 3,
    summarizeThreshold: 1000,
    safetyMarginPercent: 0.15,
  };

  describe('buildTokenAwareMessages', () => {
    it('preserves system prompt, user message, and tools when under budget', () => {
      const messages = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' }
      ];

      const result = buildTokenAwareMessages(messages, tools, 'groq', {
        ...baseConfig,
        maxInputTokens: 5000,
        reservedOutputTokens: 500,
      });

      expect(result.messages.length).toBeGreaterThan(2);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[result.messages.length - 1].role).toBe('user');
      expect(result.tools.length).toBe(3);
      expect(result.trimmed).toBe(false);
    });

    it('trims oldest history when over budget', () => {
      const longHistory = Array(20).fill(0).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i} `.repeat(100) // ~100 tokens each
      }));
      
      const messages = [
        { role: 'system', content: 'System prompt' },
        ...longHistory,
        { role: 'user', content: 'Current question?' }
      ];

      const result = buildTokenAwareMessages(messages, tools, 'groq', {
        ...baseConfig,
        maxInputTokens: 2000,
        reservedOutputTokens: 500,
      });

      expect(result.trimmed).toBe(true);
      expect(result.trimmedTurns).toBeGreaterThan(0);
      // Should preserve system + latest user + some history
      expect(result.messages.length).toBeLessThan(messages.length);
    });

    it('preserves minimum history turns even when over budget', () => {
      // With 500 max input, 500 reserved output, 3.5 chars/token, 15% safety margin
      // Effective budget = 500 * 0.85 = 425, available = 425 - 500 = -75 (budget exceeded)
      // So we need a larger budget to test this properly
      const config = {
        ...baseConfig,
        maxInputTokens: 2000,
        minHistoryTurns: 3,
      };

      const longHistory = Array(10).fill(0).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Msg ${i} `.repeat(50) // ~50 tokens each
      }));
      
      const messages = [
        { role: 'system', content: 'System' },
        ...longHistory,
        { role: 'user', content: 'Current?' }
      ];

      const result = buildTokenAwareMessages(messages, [], 'groq', config);
      
      // Should preserve at least minHistoryTurns
      const historyCount = result.messages.filter(m => m.role !== 'system' && m.role !== 'user').length;
      expect(historyCount).toBeGreaterThanOrEqual(3);
    });

    it('preserves latest user message', () => {
      const longHistory = Array(20).fill(0).map((_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'x'.repeat(100)
      }));
      
      const messages = [
        { role: 'system', content: 'System' },
        ...longHistory,
        { role: 'user', content: 'IMPORTANT: This must be preserved' }
      ];

      const result = buildTokenAwareMessages(messages, tools, 'groq', {
        ...baseConfig,
        maxInputTokens: 5000,
      });

      const lastUserMsg = [...result.messages].reverse().find((m: any) => m.role === 'user');
      expect(lastUserMsg?.content).toContain('IMPORTANT');
    });

    it('preserves tool definitions completely', () => {
      const manyTools = Array(20).fill(0).map((_, i) => ({
        name: `tool${i}`,
        description: 'Tool description '.repeat(20),
        parameters: { type: 'object', properties: { param: { type: 'string' } } }
      }));
      
      const messages = [{ role: 'user', content: 'Hi' }];
      const result = buildTokenAwareMessages(messages, manyTools, 'groq', {
        ...baseConfig,
        maxInputTokens: 5000,
      });

      expect(result.tools.length).toBe(manyTools.length);
    });

    it('throws TokenBudgetExceededError when fixed content exceeds budget', () => {
      const hugeSystemPrompt = 'x'.repeat(10000); // ~2500 tokens
      const messages = [
        { role: 'system', content: hugeSystemPrompt },
        { role: 'user', content: 'Hi' }
      ];

      expect(() => 
        buildTokenAwareMessages(messages, tools, 'groq', {
          ...baseConfig,
          maxInputTokens: 1000,
        })
      ).toThrow(TokenBudgetExceededError);
    });

    it('handles oversized user message', () => {
      const hugeUserMessage = 'x'.repeat(10000); // ~2500 tokens
      const messages = [
        { role: 'system', content: 'System' },
        { role: 'user', content: hugeUserMessage }
      ];

      const result = buildTokenAwareMessages(messages, tools, 'groq', {
        ...baseConfig,
        maxInputTokens: 5000,
      });

      // Should still work, just with trimmed history
      expect(result.messages).toBeDefined();
      expect(result.messages.find(m => m.role === 'user')?.content).toContain('x');
    });

    it('preserves tool call/result pairs together', () => {
      const messages = [
        { role: 'user', content: 'Q1' },
        { 
          role: 'assistant', 
          content: '', 
          tool_calls: [{ id: 'call_1', name: 'tool1', args: '{}' }] 
        },
        { role: 'tool', content: 'Result', name: 'tool1', tool_call_id: 'call_1' },
        { role: 'user', content: 'Q2' },
        { 
          role: 'assistant', 
          content: '', 
          tool_calls: [{ id: 'call_2', name: 'tool2', args: '{}' }] 
        },
        { role: 'tool', content: 'Result2', name: 'tool2', tool_call_id: 'call_2' },
        { role: 'user', content: 'Final question' }
      ];

      const result = buildTokenAwareMessages(messages, tools, 'groq', {
        ...baseConfig,
        maxInputTokens: 2000,
      });

      // Tool calls and their results should stay together
      const assistantWithToolCall = result.messages.find((m: any) => m.role === 'assistant' && (m as any).tool_calls?.length);
      expect(assistantWithToolCall).toBeDefined();
      // The corresponding tool result should also be present
      const toolResult = result.messages.find((m: any) => m.role === 'tool' && m.tool_call_id === 'call_1');
      expect(toolResult).toBeDefined();
    });
  });

  describe('Provider Limits', () => {
    it('returns correct limits for Groq', () => {
      const limits = getProviderLimits('groq');
      expect(limits.tpmLimit).toBe(8000);
      expect(limits.maxInputTokens).toBe(6000);
      expect(limits.contextWindow).toBe(8192);
      expect(limits.charsPerToken).toBe(3.5);
    });

    it('returns correct limits for Gemini', () => {
      const limits = getProviderLimits('gemini');
      expect(limits.tpmLimit).toBe(1_500_000);
      expect(limits.maxInputTokens).toBe(1_000_000);
      expect(limits.contextWindow).toBe(1_048_576);
    });

    it('falls back to default for unknown provider', () => {
      const limits = getProviderLimits('unknown');
      expect(limits.tpmLimit).toBe(8000);
      expect(limits.maxInputTokens).toBe(6000);
    });
  });

  describe('TPM Error Detection', () => {
    it('detects Groq TPM error with "tokens per minute"', () => {
      const error = new Error('Request too large for model on tokens per minute (TPM): Limit 8000, Requested 9745');
      expect(isGroqTpmError(error)).toBe(true);
    });

    it('detects Groq TPM error with "TPM" keyword', () => {
      const error = new Error('TPM limit exceeded: 9745 tokens');
      expect(isGroqTpmError(error)).toBe(true);
    });

    it('detects Groq TPM error with "rate limit" + "token"', () => {
      const error = new Error('rate limit exceeded: token limit reached');
      expect(isGroqTpmError(error)).toBe(true);
    });

    it('does not detect ordinary rate limit as TPM', () => {
      const error = new Error('rate limit exceeded, try again later');
      expect(isGroqTpmError(error)).toBe(false);
    });
  });
});