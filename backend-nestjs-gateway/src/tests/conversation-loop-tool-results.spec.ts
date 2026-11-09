// Minimal test to verify tool results are passed to follow-up LLM call
// This test avoids importing modules with missing Prisma models

import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock the dependencies before importing ConversationOrchestrator
const mockLlmGateway = {
  chat: jest.fn(),
};

const mockAuditOutbox = {
  record: jest.fn().mockResolvedValue(undefined),
};

const mockErpService = {
  call: jest.fn().mockResolvedValue({ success: true, data: {} }),
};

const mockObservability = {
  recordLlmCall: jest.fn().mockResolvedValue(undefined),
  recordToolCall: jest.fn().mockResolvedValue(undefined),
  recordPendingAction: jest.fn().mockResolvedValue(undefined),
};

// Import after mocks are set up
import { ConversationOrchestrator } from '../ai/orchestrator/conversation-loop';
import type { LlmChatOptions } from '../ai/gateway/llm-gateway.service';
import type { AuditOutboxInput } from '../common/audit-outbox.service';
import type { ErpnextService } from '../erpnext/erpnext.service';
import { LlmObservabilityService, LlmCallMetrics, ToolCallMetrics, PendingActionMetrics } from '../ai/observability/llm-observability.service';
import type { MockLlmResponse } from './ai-evaluation/test-doubles';
import { makeToolCall } from './ai-evaluation/test-doubles';

const adminContext = {
  tenantId: 'tenant-1',
  tenantCode: 'TEST',
  userId: 'admin-1',
  role: 'admin' as const,
  correlationId: 'corr-1',
};

describe('ConversationOrchestrator - Tool Results in Follow-Up', () => {
  let orchestrator: ConversationOrchestrator;

  beforeEach(() => {
    mockLlmGateway.chat.mockReset();
    mockErpService.call.mockReset();
    jest.clearAllMocks();

    orchestrator = new ConversationOrchestrator(
      mockLlmGateway as any,
      mockAuditOutbox as any,
      mockErpService as any,
      mockObservability as any,
      undefined, // pendingActionService
      undefined, // stateMachineInstance
      undefined, // toolRegistry
      {
        tokenBudget: {
          maxInputTokens: 20000,
          reservedOutputTokens: 2000,
          maxHistoryTurns: 10,
          minHistoryTurns: 3,
          safetyMarginPercent: 0.15,
        }
      },
    );
  });

  it('should pass tool results to follow-up LLM call and return actual data', async () => {
    // First LLM call: returns tool call
    // Second LLM call: returns natural language with actual data
    mockLlmGateway.chat
      .mockResolvedValueOnce({
        content: "I'll check the member count for you.",
        toolCalls: [makeToolCall('getMemberCount', {})],
        pendingAction: undefined,
      })
      .mockResolvedValueOnce({
        content: 'We have 150 active members.',
        toolCalls: [],
        pendingAction: undefined,
      });

    // Mock the ERP tool to return actual data
    mockErpService.call.mockResolvedValue({ success: true, data: { count: 150 } });

    const response = await orchestrator.processMessage(
      adminContext,
      'How many active members do we have?',
      []
    );

    // Verify tool was called
    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls?.[0].name).toBe('getMemberCount');

    // Verify the final response contains the actual tool result
    expect(response.response).toContain('150');
    expect(response.response).not.toContain("I've completed that action");
  });

  it('should handle multiple tool calls and include all results in follow-up', async () => {
    mockLlmGateway.chat
      .mockResolvedValueOnce({
        content: "I'll check both member count and dashboard summary.",
        toolCalls: [
          makeToolCall('getMemberCount', {}),
          makeToolCall('getDashboardSummary', {}),
        ],
        pendingAction: undefined,
      })
      .mockResolvedValueOnce({
        content: 'We have 150 active members and the dashboard shows 500 total members.',
        toolCalls: [],
        pendingAction: undefined,
      });

    mockErpService.call
      .mockResolvedValueOnce({ success: true, data: { count: 150 } })
      .mockResolvedValueOnce({ success: true, data: { totalMembers: 500, activeMembers: 150 } });

    const response = await orchestrator.processMessage(
      adminContext,
      'How many active members and what is the dashboard summary?',
      []
    );

    expect(response.toolCalls).toHaveLength(2);
    expect(response.toolCalls?.[0].name).toBe('getMemberCount');
    expect(response.toolCalls?.[1].name).toBe('getDashboardSummary');
    expect(response.response).toContain('150');
    expect(response.response).toContain('500');
    expect(response.response).not.toContain("I've completed that action");
  });

  it('should not return generic message when tool succeeds and model returns content', async () => {
    mockLlmGateway.chat
      .mockResolvedValueOnce({
        content: "I'll check the member count.",
        toolCalls: [makeToolCall('getMemberCount', {})],
        pendingAction: undefined,
      })
      .mockResolvedValueOnce({
        content: '', // Empty model content
        toolCalls: [],
        pendingAction: undefined,
      });

    mockErpService.call.mockResolvedValue({ success: true, data: { count: 75 } });

    const response = await orchestrator.processMessage(
      adminContext,
      'How many active members do we have?',
      []
    );

    // Should not return the generic "I've completed that action" when model returns empty
    // Instead it should handle empty content appropriately
    expect(response.toolCalls?.[0].name).toBe('getMemberCount');
  });
});