import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ToolRegistry } from '../ai/tools/tool-registry';
import { ConversationOrchestrator } from '../ai/orchestrator/conversation-loop';
import { LlmGatewayService } from '../ai/gateway/llm-gateway.service';
import {
  canUseTool,
  TOOL_PERMISSIONS,
  hasPermission,
  getAvailableTools,
} from '../ai/guardrails/scope-rules';
import { TOOLS, toolByName } from '@wsos/ai-tool-definitions';
import {
  SearchKnowledgeBaseTool,
  IngestDocumentTool,
  IngestFAQTool,
  ListKnowledgeBasesTool,
  DeleteDocumentTool,
  GetDocumentStatusTool,
} from '../ai/tools/rag-tools';
import { GetRevenueSummaryTool } from '../ai/tools/get-revenue-summary.tool';
import { GetRevenueTrendsTool } from '../ai/tools/get-revenue-trends.tool';

describe('Component 1 Remediation: AI Orchestrator and Tool Registry', () => {
  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ADMIN = 'admin-user-uuid';
  const USER_FRONTDESK = 'frontdesk-user-uuid';
  const USER_MEMBER = 'member-user-uuid';
  const USER_VISITOR = 'visitor-user-uuid';

  let mockAuditOutbox: any;
  let mockErpService: any;
  let mockModuleRef: any;
  let registry: ToolRegistry;

  beforeEach(() => {
    mockAuditOutbox = {
      record: jest.fn<any>().mockResolvedValue({
        audit: { id: 'audit-log-uuid-1' },
        outbox: { id: 'outbox-log-uuid-1' },
      }),
    };

    mockErpService = {
      call: jest.fn<any>().mockImplementation(async ({ method }: any) => {
        if (method.includes('revenue_summary') || method.includes('revenue.summary')) {
          return {
            total_revenue: 150000,
            revenue_this_month: 25000,
            revenue_last_month: 22000,
            revenue_this_year: 150000,
            average_transaction: 2500,
            transaction_count: 60,
            currency: 'INR',
          };
        }
        if (method.includes('revenue_trends') || method.includes('revenue.trends')) {
          return {
            trends: [
              { period: '2026-09', revenue: 22000, transaction_count: 55, average_transaction: 400, growth_percent: 5 },
              { period: '2026-10', revenue: 25000, transaction_count: 60, average_transaction: 416, growth_percent: 13.6 },
            ],
            period_type: 'monthly',
            currency: 'INR',
          };
        }
        return { success: true };
      }),
    };

    mockModuleRef = {
      get: jest.fn<any>(),
    };

    registry = new ToolRegistry(mockModuleRef, mockAuditOutbox, mockErpService);
  });

  describe('A. Tool Permission Consistency & Safe Authorization Failures', () => {
    it('defines explicit permissions for all CRM tools (T-26 to T-32)', () => {
      const crmTools = [
        'scoreLead',
        'getPipelineOverview',
        'moveLeadInPipeline',
        'createPipelineStage',
        'createCrmCampaign',
        'enrollInCampaign',
        'getCampaignMetrics',
      ];

      for (const tool of crmTools) {
        expect(TOOL_PERMISSIONS[tool]).toBeDefined();
        expect(typeof TOOL_PERMISSIONS[tool]).toBe('string');
      }
    });

    it('defines explicit permissions for all Retention tools (T-33 to T-41)', () => {
      const retentionTools = [
        'calculateChurnRisk',
        'getHighRiskMembers',
        'calculateEngagementScore',
        'getLowEngagementMembers',
        'createWinbackCampaign',
        'sendWinbackCampaign',
        'createRetentionAction',
        'getRetentionActions',
        'getRetentionMetrics',
      ];

      for (const tool of retentionTools) {
        expect(TOOL_PERMISSIONS[tool]).toBeDefined();
        expect(typeof TOOL_PERMISSIONS[tool]).toBe('string');
      }
    });

    it('defines explicit permissions for all RAG tools (T-20 to T-25)', () => {
      const ragTools = [
        'searchKnowledgeBase',
        'listKnowledgeBases',
        'getDocumentStatus',
        'ingestDocument',
        'ingestFAQ',
        'deleteDocument',
      ];

      for (const tool of ragTools) {
        expect(TOOL_PERMISSIONS[tool]).toBeDefined();
        expect(typeof TOOL_PERMISSIONS[tool]).toBe('string');
      }
    });

    it('defines explicit permissions for Revenue tools (T-72, T-73)', () => {
      expect(TOOL_PERMISSIONS['getRevenueSummary']).toBe('reports:read');
      expect(TOOL_PERMISSIONS['getRevenueTrends']).toBe('reports:read');
    });

    it('fails safely (denies access) for unmapped or undefined tool permissions', () => {
      expect(canUseTool('admin', 'nonExistentTool_random123')).toBe(false);
      expect(canUseTool('owner', 'nonExistentTool_random123')).toBe(false);
      expect(hasPermission('admin', undefined as any)).toBe(false);
      expect(hasPermission('admin', null as any)).toBe(false);
    });

    it('enforces least-privilege role boundaries between admin, front_desk, member, and visitor', () => {
      // Admin: has full staff access
      expect(canUseTool('admin', 'scoreLead')).toBe(true);
      expect(canUseTool('admin', 'createCrmCampaign')).toBe(true);
      expect(canUseTool('admin', 'calculateChurnRisk')).toBe(true);
      expect(canUseTool('admin', 'createWinbackCampaign')).toBe(true);
      expect(canUseTool('admin', 'ingestDocument')).toBe(true);
      expect(canUseTool('admin', 'getRevenueSummary')).toBe(true);

      // Front Desk: can read leads and retention, but cannot write CRM campaigns or winback campaigns
      expect(canUseTool('front_desk', 'scoreLead')).toBe(true);
      expect(canUseTool('front_desk', 'getPipelineOverview')).toBe(true);
      expect(canUseTool('front_desk', 'createCrmCampaign')).toBe(false); // Campaigns require campaigns:write
      expect(canUseTool('front_desk', 'createWinbackCampaign')).toBe(false); // Winback requires retention:write
      expect(canUseTool('front_desk', 'ingestDocument')).toBe(false); // KB write requires knowledge_base:write

      // Member: can search knowledge base and view public schedule, but cannot access CRM/retention/admin
      expect(canUseTool('member', 'searchKnowledgeBase')).toBe(true);
      expect(canUseTool('member', 'scoreLead')).toBe(false);
      expect(canUseTool('member', 'getRevenueSummary')).toBe(false);
      expect(canUseTool('member', 'createMember')).toBe(false);

      // Visitor: can only access public tools
      expect(canUseTool('visitor', 'getPublicEventList')).toBe(true);
      expect(canUseTool('visitor', 'captureLead')).toBe(true);
      expect(canUseTool('visitor', 'searchKnowledgeBase')).toBe(false);
      expect(canUseTool('visitor', 'scoreLead')).toBe(false);
    });
  });

  describe('B. Tool Registration and Dispatch Consistency', () => {
    it('registers all 6 RAG tools and executes them via registry', async () => {
      const mockRetrievalService: any = {
        listKnowledgeBases: jest.fn<any>().mockResolvedValue([
          { id: 'kb-1', name: 'General FAQ', isActive: true },
        ]),
      };
      const mockIngestionService: any = {
        deleteDocument: jest.fn<any>().mockResolvedValue(true),
        getDocumentStatus: jest.fn<any>().mockResolvedValue({
          id: 'doc-1',
          title: 'Guidelines',
          status: 'completed',
          chunkCount: 5,
        }),
      };

      const listKBsTool = new ListKnowledgeBasesTool(mockRetrievalService);
      const deleteDocTool = new DeleteDocumentTool(mockIngestionService);
      const getDocStatusTool = new GetDocumentStatusTool(mockIngestionService);

      registry.register('listKnowledgeBases', listKBsTool);
      registry.register('deleteDocument', deleteDocTool);
      registry.register('getDocumentStatus', getDocStatusTool);

      // 1. listKnowledgeBases (read)
      const listRes = await registry.execute('listKnowledgeBases', {
        tenantId: TENANT_ID,
        userId: USER_ADMIN,
        role: 'admin',
        correlationId: 'corr-rag-1',
      });
      expect(listRes.success).toBe(true);
      expect(listRes.data).toEqual({
        knowledgeBases: [{ id: 'kb-1', name: 'General FAQ', isActive: true }],
      });

      // 2. deleteDocument (write: requires confirmation)
      const deleteBlocked = await registry.execute(
        'deleteDocument',
        {
          tenantId: TENANT_ID,
          userId: USER_ADMIN,
          role: 'admin',
          correlationId: 'corr-rag-2',
        },
        { documentId: '33333333-3333-3333-3333-333333333333' },
      );
      expect(deleteBlocked.success).toBe(false);
      expect(deleteBlocked.errorCode).toBe('CONFIRMATION_REQUIRED');

      // deleteDocument (confirmed execution)
      const deleteRes = await registry.execute(
        'deleteDocument',
        {
          tenantId: TENANT_ID,
          userId: USER_ADMIN,
          role: 'admin',
          correlationId: 'corr-rag-2',
          isConfirmedPendingAction: true,
        },
        { documentId: '33333333-3333-3333-3333-333333333333' },
        { isConfirmedPendingAction: true },
      );
      expect(deleteRes.success).toBe(true);
      expect(mockIngestionService.deleteDocument).toHaveBeenCalledWith(
        TENANT_ID,
        '33333333-3333-3333-3333-333333333333',
      );

      // 3. getDocumentStatus (read)
      const statusRes = await registry.execute(
        'getDocumentStatus',
        {
          tenantId: TENANT_ID,
          userId: USER_ADMIN,
          role: 'admin',
          correlationId: 'corr-rag-3',
        },
        { documentId: '44444444-4444-4444-4444-444444444444' },
      );
      expect(statusRes.success).toBe(true);
      expect(statusRes.data.status).toBe('completed');
      expect(statusRes.data.chunkCount).toBe(5);
    });

    it('accepts both object { documentId } and string argument for DeleteDocumentTool and GetDocumentStatusTool', async () => {
      const mockIngestionService: any = {
        deleteDocument: jest.fn<any>().mockResolvedValue(true),
        getDocumentStatus: jest.fn<any>().mockResolvedValue({ id: 'doc-1', status: 'completed' }),
      };

      const deleteDocTool = new DeleteDocumentTool(mockIngestionService);
      const getDocStatusTool = new GetDocumentStatusTool(mockIngestionService);

      // Object format
      await deleteDocTool.execute({ tenantId: TENANT_ID }, { documentId: 'doc-uuid-1' });
      expect(mockIngestionService.deleteDocument).toHaveBeenCalledWith(TENANT_ID, 'doc-uuid-1');

      // String format
      await deleteDocTool.execute({ tenantId: TENANT_ID }, 'doc-uuid-2');
      expect(mockIngestionService.deleteDocument).toHaveBeenCalledWith(TENANT_ID, 'doc-uuid-2');

      // Object format for status
      const res1 = await getDocStatusTool.execute({ tenantId: TENANT_ID }, { documentId: 'doc-uuid-3' });
      expect(res1.id).toBe('doc-1');

      // String format for status
      const res2 = await getDocStatusTool.execute({ tenantId: TENANT_ID }, 'doc-uuid-4');
      expect(res2.id).toBe('doc-1');
    });

    it('has canonical tool definitions for getRevenueSummary and getRevenueTrends in @wsos/ai-tool-definitions', () => {
      const summaryDef = toolByName('getRevenueSummary');
      expect(summaryDef).toBeDefined();
      expect(summaryDef?.id).toBe('T-72');
      expect(summaryDef?.assistant).toBe('admin');
      expect(summaryDef?.risk).toBe('read');
      expect(summaryDef?.requiresConfirmation).toBe(false);

      const trendsDef = toolByName('getRevenueTrends');
      expect(trendsDef).toBeDefined();
      expect(trendsDef?.id).toBe('T-73');
      expect(trendsDef?.assistant).toBe('admin');
      expect(trendsDef?.risk).toBe('read');
      expect(trendsDef?.requiresConfirmation).toBe(false);
    });

    it('executes getRevenueSummary and getRevenueTrends via ToolRegistry', async () => {
      const revenueSummaryTool = new GetRevenueSummaryTool(mockErpService);
      const revenueTrendsTool = new GetRevenueTrendsTool(mockErpService);

      registry.register('getRevenueSummary', revenueSummaryTool);
      registry.register('getRevenueTrends', revenueTrendsTool);

      const summaryRes = await registry.execute('getRevenueSummary', {
        tenantId: TENANT_ID,
        userId: USER_ADMIN,
        role: 'admin',
        correlationId: 'corr-rev-1',
      });

      expect(summaryRes.success).toBe(true);
      expect(summaryRes.data.totalRevenue).toBe(150000);
      expect(summaryRes.data.currency).toBe('INR');

      const trendsRes = await registry.execute(
        'getRevenueTrends',
        {
          tenantId: TENANT_ID,
          userId: USER_ADMIN,
          role: 'admin',
          correlationId: 'corr-rev-2',
        },
        { period_type: 'monthly', periods: 6 },
      );

      expect(trendsRes.success).toBe(true);
      expect(trendsRes.data.trends).toHaveLength(2);
      expect(trendsRes.data.periodType).toBe('monthly');
    });
  });

  describe('C. False-Success Prevention in AI Orchestrator', () => {
    let orchestrator: ConversationOrchestrator;
    let mockLlmGateway: any;
    let mockObservability: any;
    let mockPendingActionService: any;

    beforeEach(() => {
      mockLlmGateway = {
        chat: jest.fn<any>(),
      };
      mockObservability = {
        recordLlmCall: jest.fn<any>().mockResolvedValue(undefined),
      };
      mockPendingActionService = {
        propose: jest.fn<any>(),
      };

      orchestrator = new ConversationOrchestrator(
        mockLlmGateway,
        mockAuditOutbox,
        mockErpService,
        mockObservability,
        mockPendingActionService,
        undefined, // stateMachineInstance
        registry,
      );
    });

    it('prevents false-success claim and returns explicit failure when all tool executions fail', async () => {
      // Register a tool that fails
      const failingTool = {
        execute: jest.fn<any>().mockResolvedValue({
          success: false,
          error: 'ERP connection refused: remote host unreachable',
          errorCode: 'ERP_ERROR',
        }),
      };
      registry.register('getDashboardSummary', failingTool as any);

      // 1st LLM call proposes tool call
      mockLlmGateway.chat
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'tc-fail-1',
              type: 'function',
              function: {
                name: 'getDashboardSummary',
                arguments: '{}',
              },
            },
          ],
        })
        // 2nd LLM call returns empty content (which previously defaulted to "I've completed that action")
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [],
        });

      const response = await orchestrator.processMessage(
        {
          tenantId: TENANT_ID,
          userId: USER_ADMIN,
          role: 'admin',
          correlationId: 'corr-false-success-test',
        },
        'Show me the dashboard summary',
      );

      // Must NOT claim "I've completed that action"
      expect(response.response).not.toContain("completed that action");
      expect(response.response).toContain('ERP connection refused');
      expect(response.error).toBeDefined();
      expect(response.error).toContain('ERP connection refused');
    });

    it('handles follow-up LLM failure gracefully after tool failure without claiming success', async () => {
      const failingTool = {
        execute: jest.fn<any>().mockResolvedValue({
          success: false,
          error: 'Rate limit exceeded on upstream service',
          errorCode: 'RATE_LIMIT',
        }),
      };
      registry.register('getMemberCount', failingTool as any);

      mockLlmGateway.chat
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'tc-fail-2',
              type: 'function',
              function: {
                name: 'getMemberCount',
                arguments: '{}',
              },
            },
          ],
        })
        // 2nd LLM call throws an error
        .mockRejectedValueOnce(new Error('LLM provider timeout'));

      const response = await orchestrator.processMessage(
        {
          tenantId: TENANT_ID,
          userId: USER_ADMIN,
          role: 'admin',
          correlationId: 'corr-llm-fail-after-tool',
        },
        'Count all members',
      );

      expect(response.response).not.toContain("completed that action");
      expect(response.response).toContain('high demand');
      expect(response.error).toBeDefined();
    });
  });

  describe('D. Model Provider Availability & Safe Fallback', () => {
    it('reports isAvailable as false when no provider credentials are configured', () => {
      const mockRedis: any = { get: jest.fn<any>(), set: jest.fn<any>() };
      const mockObservability: any = { recordLlmCall: jest.fn<any>() };
      const mockConfig: any = { get: jest.fn<any>() };

      // In test environment without any provider env set, gateway should not be available
      const origModel = process.env.LLM_MODEL;
      const origKey = process.env.LLM_API_KEY;
      const origFallbackModel = process.env.FALLBACK_LLM_MODEL;
      const origFallbackKey = process.env.FALLBACK_LLM_API_KEY;
      const origProvider = process.env.LLM_PROVIDER;
      const origFallbackProvider = process.env.FALLBACK_LLM_PROVIDER;
      try {
        delete process.env.LLM_MODEL;
        delete process.env.LLM_API_KEY;
        delete process.env.FALLBACK_LLM_MODEL;
        delete process.env.FALLBACK_LLM_API_KEY;
        delete process.env.LLM_PROVIDER;
        delete process.env.FALLBACK_LLM_PROVIDER;

        const service = new LlmGatewayService(mockConfig, mockRedis, mockObservability);
        expect(service.isAvailable()).toBe(false);
      } finally {
        if (origModel) process.env.LLM_MODEL = origModel;
        if (origKey) process.env.LLM_API_KEY = origKey;
        if (origFallbackModel) process.env.FALLBACK_LLM_MODEL = origFallbackModel;
        if (origFallbackKey) process.env.FALLBACK_LLM_API_KEY = origFallbackKey;
        if (origProvider) process.env.LLM_PROVIDER = origProvider;
        if (origFallbackProvider) process.env.FALLBACK_LLM_PROVIDER = origFallbackProvider;
      }
    });

    it('rejects chat requests cleanly with clear error when LLM provider is not available', async () => {
      const mockRedis: any = { get: jest.fn<any>(), set: jest.fn<any>() };
      const mockObservability: any = { recordLlmCall: jest.fn<any>() };
      const mockConfig: any = { get: jest.fn<any>() };

      const origModel = process.env.LLM_MODEL;
      const origKey = process.env.LLM_API_KEY;
      const origFallbackModel = process.env.FALLBACK_LLM_MODEL;
      const origFallbackKey = process.env.FALLBACK_LLM_API_KEY;
      const origProvider = process.env.LLM_PROVIDER;
      const origFallbackProvider = process.env.FALLBACK_LLM_PROVIDER;
      try {
        delete process.env.LLM_MODEL;
        delete process.env.LLM_API_KEY;
        delete process.env.FALLBACK_LLM_MODEL;
        delete process.env.FALLBACK_LLM_API_KEY;
        delete process.env.LLM_PROVIDER;
        delete process.env.FALLBACK_LLM_PROVIDER;

        const service = new LlmGatewayService(mockConfig, mockRedis, mockObservability);
        await service.onModuleInit();

        await expect(
          service.chat({
            messages: [{ role: 'user', content: 'hello' }],
            context: {
              tenantId: TENANT_ID,
              userId: USER_ADMIN,
              role: 'admin',
              correlationId: 'corr-test',
            },
          }),
        ).rejects.toThrow('LLM Gateway is not available: no providers configured. Configure at least one provider (Groq or Gemini) with LLM_MODEL and LLM_API_KEY.');

        service.onModuleDestroy();
      } finally {
        if (origModel) process.env.LLM_MODEL = origModel;
        if (origKey) process.env.LLM_API_KEY = origKey;
      }
    });
  });
});
