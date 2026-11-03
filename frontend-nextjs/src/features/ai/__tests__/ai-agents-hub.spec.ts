/**
 * AI Agents Hub Contract & Integration Suite
 * Verifies backend API integration, 12-agent inventory retrieval,
 * domain action execution, chat dispatch, and error handling.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AiApi, AiApiError } from '../api/ai-api';
import { AgentSummary, AgentExecutionResult } from '../types/agent';

describe('AI Agents Hub: 12-Agent Ecosystem Contract Suite', () => {
  const originalFetch = global.fetch;
  const originalEnvUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_URL = originalEnvUrl;
  });

  describe('1. Agent Registry Discovery (GET /api/v1/ai/agents)', () => {
    it('queries agent inventory and returns all 12 registered agents', async () => {
      const mockAgents: AgentSummary[] = [
        { id: 'admin-copilot', name: 'Admin Assistant / Live Copilot', type: 'assistant', category: 'Administration', status: 'healthy', description: 'Studio operational copilot', latencyMs: 24, requiredRoles: ['owner', 'admin'], isAccessible: true, capabilities: [], metrics: { totalCalls: 154, successRate: 100, lastExecutedAt: null, avgLatencyMs: 24 } },
        { id: 'public-enquiry', name: 'Public Enquiry Assistant', type: 'assistant', category: 'Customer Experience', status: 'healthy', description: 'Website enquiry and lead capture', latencyMs: 18, requiredRoles: [], isAccessible: true, capabilities: [], metrics: { totalCalls: 312, successRate: 99.9, lastExecutedAt: null, avgLatencyMs: 18 } },
        { id: 'booking-assistant', name: 'Booking Assistant', type: 'assistant', category: 'Customer Experience', status: 'healthy', description: 'Class and session booking agent', latencyMs: 31, requiredRoles: ['owner', 'admin', 'front_desk'], isAccessible: true, capabilities: [], metrics: { totalCalls: 89, successRate: 100, lastExecutedAt: null, avgLatencyMs: 31 } },
        { id: 'recommendation-assistant', name: 'Recommendation Assistant', type: 'assistant', category: 'Customer Experience', status: 'healthy', description: 'Personalized wellness recommendations', latencyMs: 28, requiredRoles: ['owner', 'admin', 'trainer'], isAccessible: true, capabilities: [], metrics: { totalCalls: 114, successRate: 100, lastExecutedAt: null, avgLatencyMs: 28 } },
        { id: 'feedback-intelligence', name: 'Feedback Intelligence Assistant', type: 'assistant', category: 'Customer Experience', status: 'healthy', description: 'Sentiment and review intelligence', latencyMs: 20, requiredRoles: ['owner', 'admin'], isAccessible: true, capabilities: [], metrics: { totalCalls: 45, successRate: 100, lastExecutedAt: null, avgLatencyMs: 20 } },
        { id: 'crm-agent', name: 'CRM Agent', type: 'agent', category: 'Growth & Marketing', status: 'healthy', description: 'Lead nurture and conversion pipelines', latencyMs: 35, requiredRoles: ['owner', 'admin'], isAccessible: true, capabilities: [], metrics: { totalCalls: 210, successRate: 100, lastExecutedAt: null, avgLatencyMs: 35 } },
        { id: 'operations-agent', name: 'Operations Agent', type: 'agent', category: 'Operations', status: 'healthy', description: 'Studio resource and equipment scheduling', latencyMs: 40, requiredRoles: ['owner', 'admin'], isAccessible: true, capabilities: [], metrics: { totalCalls: 98, successRate: 99.8, lastExecutedAt: null, avgLatencyMs: 40 } },
        { id: 'marketing-agent', name: 'Marketing Agent', type: 'agent', category: 'Growth & Marketing', status: 'healthy', description: 'Promotional campaigns and offer generation', latencyMs: 38, requiredRoles: ['owner', 'admin'], isAccessible: true, capabilities: [], metrics: { totalCalls: 76, successRate: 100, lastExecutedAt: null, avgLatencyMs: 38 } },
        { id: 'advertising-agent', name: 'Advertising Agent', type: 'agent', category: 'Growth & Marketing', status: 'healthy', description: 'Ad spend optimization and attribution', latencyMs: 42, requiredRoles: ['owner', 'admin'], isAccessible: true, capabilities: [], metrics: { totalCalls: 52, successRate: 100, lastExecutedAt: null, avgLatencyMs: 42 } },
        { id: 'growth-agent', name: 'Growth Optimization Agent', type: 'agent', category: 'Growth & Marketing', status: 'healthy', description: 'Retention funnels and lifetime value growth', latencyMs: 45, requiredRoles: ['owner', 'admin'], isAccessible: true, capabilities: [], metrics: { totalCalls: 67, successRate: 99.9, lastExecutedAt: null, avgLatencyMs: 45 } },
        { id: 'studio-insights', name: 'Studio Insights Agent', type: 'agent', category: 'Analytics', status: 'healthy', description: 'Executive analytics and revenue trends', latencyMs: 29, requiredRoles: ['owner', 'admin'], isAccessible: true, capabilities: [], metrics: { totalCalls: 184, successRate: 100, lastExecutedAt: null, avgLatencyMs: 29 } },
        { id: 'session-summary', name: 'Session Summary Agent', type: 'agent', category: 'Operations', status: 'healthy', description: 'Class attendance and workout summarization', latencyMs: 22, requiredRoles: ['owner', 'admin', 'trainer'], isAccessible: true, capabilities: [], metrics: { totalCalls: 140, successRate: 100, lastExecutedAt: null, avgLatencyMs: 22 } },
      ];

      let requestedUrl = '';
      let requestedHeaders: Record<string, string> = {};

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestedHeaders = init?.headers || {};
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, data: mockAgents }),
        } as Response;
      };

      const result = await AiApi.getAgents();

      assert.equal(requestedUrl, 'http://localhost:3001/api/v1/ai/agents');
      assert.ok(requestedHeaders['Host'] === 'pilot-studio.fitness.local' || requestedHeaders['Host'] === 'demo.fitness.local');
      assert.equal(result.length, 12);
      assert.equal(result[0].id, 'admin-copilot');
      assert.equal(result[11].id, 'session-summary');
    });
  });

  describe('2. Domain Action Execution (POST /api/v1/ai/agents/:id/execute)', () => {
    it('executes a domain action on an agent and receives execution result', async () => {
      const mockResult: AgentExecutionResult = {
        success: true,
        agentId: 'studio-insights',
        actionId: 'revenue_analysis',
        data: {
          period: 'last_30_days',
          grossRevenue: 485000,
          activeSubscriptions: 342,
          mrr: 124000,
        },
        executionTimeMs: 45,
        message: 'Revenue trends calculated',
      };

      let requestedUrl = '';
      let requestedBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, data: mockResult }),
        } as Response;
      };

      const result = await AiApi.executeAgentAction('studio-insights', 'revenue_analysis', { period: 'last_30_days' });

      assert.equal(requestedUrl, 'http://localhost:3001/api/v1/ai/agents/studio-insights/execute');
      assert.equal(requestedBody.actionId, 'revenue_analysis');
      assert.deepEqual(requestedBody.payload, { period: 'last_30_days' });
      assert.equal(result.success, true);
      assert.equal(result.agentId, 'studio-insights');
      assert.equal(result.actionId, 'revenue_analysis');
      assert.equal(result.executionTimeMs, 45);
    });

    it('propagates honest 400 Bad Request error when action name is invalid', async () => {
      global.fetch = async () =>
        ({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => JSON.stringify({ statusCode: 400, message: 'Invalid action name for agent crm-agent' }),
        }) as Response;

      await assert.rejects(
        async () => AiApi.executeAgentAction('crm-agent', 'nonexistent_action'),
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.equal(err.status, 400);
          assert.ok(err.message.includes('Invalid action name'));
          return true;
        },
      );
    });

    it('propagates 403 Forbidden when caller lacks ai:action permission', async () => {
      global.fetch = async () =>
        ({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: async () => JSON.stringify({ statusCode: 403, message: 'Forbidden resource: ai:action required' }),
        }) as Response;

      await assert.rejects(
        async () => AiApi.executeAgentAction('operations-agent', 'schedule_maintenance'),
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.equal(err.status, 403);
          return true;
        },
      );
    });
  });

  describe('3. Agent Interactive Chat Dispatch (POST /api/v1/ai/agents/:id/chat)', () => {
    it('dispatches conversation prompt to a specific agent', async () => {
      const mockChatResponse = {
        agent_id: 'marketing-agent',
        reply: 'I generated 3 high-converting holiday promotion templates.',
        tools_invoked: ['campaign_optimizer'],
        correlation_id: 'chat-corr-555',
      };

      let requestedUrl = '';
      let sentBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, data: mockChatResponse }),
        } as Response;
      };

      const result = await AiApi.chatWithAgent('marketing-agent', 'Draft holiday promotion');

      assert.equal(requestedUrl, 'http://localhost:3001/api/v1/ai/agents/marketing-agent/chat');
      assert.equal(sentBody.message, 'Draft holiday promotion');
      assert.equal(result.agent_id, 'marketing-agent');
      assert.ok(result.reply.includes('high-converting'));
      assert.equal(result.correlation_id, 'chat-corr-555');
    });
  });

  describe('4. CRM Agent & LeadPilot Execution (score-lead & error handling)', () => {
    it('executes score-lead action on crm-agent and receives verified score breakdown', async () => {
      const mockResult: AgentExecutionResult = {
        success: true,
        agentId: 'crm-agent',
        actionId: 'score-lead',
        data: {
          leadId: 'lead-uuid-123',
          leadName: 'Priya Sharma',
          score: 82,
          status: 'HOT',
          breakdown: {
            source: 17,
            engagement: 25,
            recency: 15,
            completeness: 10,
          },
        },
        executionTimeMs: 32,
      };

      let requestedUrl = '';
      let requestedBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, data: mockResult }),
        } as Response;
      };

      const result = await AiApi.executeAgentAction('crm-agent', 'score-lead', { leadId: 'lead-uuid-123' });

      assert.equal(requestedUrl, 'http://localhost:3001/api/v1/ai/agents/crm-agent/execute');
      assert.equal(requestedBody.actionId, 'score-lead');
      assert.deepEqual(requestedBody.payload, { leadId: 'lead-uuid-123' });
      assert.equal(result.success, true);
      assert.equal((result.data as any).status, 'HOT');
      assert.equal((result.data as any).score, 82);
    });

    it('propagates error when crm-agent execution fails for non-existent lead', async () => {
      global.fetch = async () =>
        ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => JSON.stringify({ statusCode: 404, message: "Lead 'non-existent' not found for tenant" }),
        }) as Response;

      await assert.rejects(
        async () => AiApi.executeAgentAction('crm-agent', 'score-lead', { leadId: 'non-existent' }),
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.equal(err.status, 404);
          assert.ok(err.message.includes("Lead 'non-existent' not found"));
          return true;
        },
      );
    });
  });
});
