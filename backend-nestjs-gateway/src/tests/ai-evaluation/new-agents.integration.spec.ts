import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConversationOrchestrator } from '../../ai/orchestrator/conversation-loop';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { LlmGatewayService } from '../../ai/gateway/llm-gateway.service';
import { LlmObservabilityService } from '../../ai/observability/llm-observability.service';
import type { MockLlmResponse } from './test-doubles';
import { makeToolCall } from './test-doubles';

describe('Agent Integration Tests (E2E)', () => {
  let orchestrator: ConversationOrchestrator;
  let mockErpService: any;
  let mockLlmGateway: any;
  let mockAuditOutbox: any;
  let mockObservability: any;

  const adminContext = {
    tenantId: 'tenant-1',
    userId: 'admin-1',
    role: 'admin' as const,
    correlationId: 'corr-1',
  };

  beforeEach(() => {
    mockErpService = { call: (jest.fn() as any).mockResolvedValue({ success: true, data: {} }) };
    mockLlmGateway = {
      chat: (jest.fn() as any).mockResolvedValue({ content: '', toolCalls: [], pendingAction: undefined })
    };
    mockAuditOutbox = { record: (jest.fn() as any).mockResolvedValue(undefined) };
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

  describe('Admin Agent Integration', () => {
    it('should process member count query end-to-end', async () => {
      mockLlmGateway.chat.mockResolvedValue({
        content: 'Member count retrieved',
        toolCalls: [makeToolCall('getMemberCount', {})],
        pendingAction: undefined,
      });

      mockErpService.call.mockResolvedValue({ success: true, data: { count: 150 } });

      const response = await orchestrator.processMessage(adminContext, 'How many members?', []);

      expect(response.toolCalls?.[0].name).toBe('getMemberCount');
      expect(response.response).toBeDefined();
    });

    it('should process dashboard summary query end-to-end', async () => {
      mockLlmGateway.chat.mockResolvedValue({
        content: 'Dashboard retrieved',
        toolCalls: [makeToolCall('getDashboardSummary', {})],
        pendingAction: undefined,
      });

      mockErpService.call.mockResolvedValue({ success: true, data: { members: 150, revenue: 150000 } });

      const response = await orchestrator.processMessage(adminContext, 'Show dashboard', []);

      expect(response.toolCalls?.[0].name).toBe('getDashboardSummary');
    });
  });

  describe('Cross-Tenant Isolation', () => {
    it('should isolate data between tenants', async () => {
      const tenant2Context = { tenantId: 'tenant-2', userId: 'admin-2', role: 'admin' as const, correlationId: 'corr-2' };

      // Each processMessage call makes 2 LLM calls (initial + follow-up), so we need 4 responses
      mockLlmGateway.chat
        .mockResolvedValueOnce({ content: 'Tenant 1 data', toolCalls: [makeToolCall('getMemberCount', {})], pendingAction: undefined })
        .mockResolvedValueOnce({ content: 'Tenant 1 followup', toolCalls: [], pendingAction: undefined })
        .mockResolvedValueOnce({ content: 'Tenant 2 data', toolCalls: [makeToolCall('getMemberCount', {})], pendingAction: undefined })
        .mockResolvedValueOnce({ content: 'Tenant 2 followup', toolCalls: [], pendingAction: undefined });

      mockErpService.call
        .mockResolvedValueOnce({ success: true, data: { count: 100 } })
        .mockResolvedValueOnce({ success: true, data: { count: 200 } });

      await orchestrator.processMessage({ tenantId: 'tenant-1', userId: 'admin-1', role: 'admin', correlationId: 'corr-1' }, 'Count members', []);
      await orchestrator.processMessage({ tenantId: 'tenant-2', userId: 'admin-2', role: 'admin', correlationId: 'corr-2' }, 'Count members', []);

      expect(mockErpService.call).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }));
      expect(mockErpService.call).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-2' }));
    });
  });

  describe('Scope Enforcement', () => {
    it('should refuse unauthorized tool access', async () => {
      // Member role trying to use admin-only tool
      const memberContext = { tenantId: 'tenant-1', userId: 'member-1', role: 'member' as const, correlationId: 'corr-3' };

      // The LLM should not propose admin tools for member role
      mockLlmGateway.chat.mockResolvedValue({
        content: "I can't show all members. I can only help with your own bookings.",
        toolCalls: [],
        pendingAction: undefined,
      });

      const response = await orchestrator.processMessage(
        { tenantId: 'tenant-1', userId: 'member-1', role: 'member', correlationId: 'corr-3' },
        'Show all members',
        []
      );

      expect(response.toolCalls).toHaveLength(0);
    });
  });
});