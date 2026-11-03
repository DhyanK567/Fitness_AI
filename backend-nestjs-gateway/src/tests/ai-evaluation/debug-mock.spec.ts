import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConversationOrchestrator } from '../../ai/orchestrator/conversation-loop';
import type { LlmChatOptions } from '../../ai/gateway/llm-gateway.service';
import type { ErpnextService } from '../../erpnext/erpnext.service';
import { LlmObservabilityService, LlmCallMetrics, ToolCallMetrics, PendingActionMetrics } from '../../ai/observability/llm-observability.service';
import type { MockLlmResponse } from './test-doubles';
import { makeToolCall } from './test-doubles';

describe('Debug LLM Gateway Mock - front_desk role', () => {
  let orchestrator: ConversationOrchestrator;
  let mockLlmGateway: any;
  let mockAuditOutbox: any;
  let mockErpService: any;
  let mockObservability: any;

  beforeEach(() => {
    mockLlmGateway = {
      chat: (jest.fn() as any).mockResolvedValue({ content: '', toolCalls: [], pendingAction: undefined })
    };
    mockAuditOutbox = { record: (jest.fn() as any).mockResolvedValue(undefined) };
    mockErpService = { call: (jest.fn() as any).mockResolvedValue({ success: true, data: {} }) };
    mockObservability = {
      recordLlmCall: (jest.fn() as any).mockResolvedValue(undefined),
      recordToolCall: (jest.fn() as any).mockResolvedValue(undefined),
      recordPendingAction: (jest.fn() as any).mockResolvedValue(undefined),
    };

    orchestrator = new ConversationOrchestrator(
      mockLlmGateway,
      mockAuditOutbox,
      mockErpService,
      mockObservability,
    );
    jest.clearAllMocks();
  });

  it('should return a response with toolCalls for createMember with front_desk role', async () => {
    mockLlmGateway.chat.mockResolvedValue({
      content: 'I will create the member.',
      toolCalls: [makeToolCall('createMember', { fullName: 'Test User', phone: '1234567890' })],
      pendingAction: undefined,
    });

    const context = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'front_desk' as const,
      correlationId: 'corr-1',
    };

    const response = await orchestrator.processMessage(context, 'Create a member named Test User', []);
    expect(response).toBeDefined();
    console.log('RESPONSE:', JSON.stringify(response, null, 2));
  });
});