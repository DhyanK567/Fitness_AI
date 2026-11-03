export type MockLlmResponse = {
  content?: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  pendingAction?: {
    toolName: string;
    arguments: Record<string, unknown>;
  };
};

export function makeToolCall(name: string, args: Record<string, unknown> = {}): NonNullable<MockLlmResponse['toolCalls']>[0] {
  return {
    id: '1',
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}