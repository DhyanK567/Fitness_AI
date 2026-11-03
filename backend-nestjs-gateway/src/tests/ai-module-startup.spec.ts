import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import { AiController } from '../ai/ai.controller';
import { EmbeddingService } from '../ai/rag/embedding.service';
import { ConversationOrchestrator } from '../ai/orchestrator/conversation-loop';
import { LlmGatewayService } from '../ai/gateway/llm-gateway.service';
import { ToolRegistry } from '../ai/tools/tool-registry';
import { PrismaService } from '../common/prisma.service';
import { RedisClient } from '../common/redis-client';
import { ErpnextService } from '../erpnext/erpnext.service';

describe('Phase 1 Verification: AiModule Registration & Gateway Startup', () => {
  let app: INestApplication;
  let aiController: AiController;
  let embeddingService: EmbeddingService;
  let orchestrator: ConversationOrchestrator;
  let llmGatewayService: LlmGatewayService;
  let toolRegistry: ToolRegistry;

  // Mock external infrastructure dependencies to verify application composition and routing
  const mockPrisma = {
    $connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    $disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    $queryRaw: jest.fn<() => Promise<any>>().mockResolvedValue([{ '?column?': 1 }]),
    conversation: {
      findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]),
      count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    },
    pendingAction: {
      findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]),
      count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    },
  };

  const mockRedis = {
    getClient: jest.fn().mockReturnValue({
      ping: jest.fn<() => Promise<string>>().mockResolvedValue('PONG'),
    }),
  };

  const mockErpnext = {
    health: jest.fn<() => Promise<any>>().mockResolvedValue({ success: true }),
    call: jest.fn<() => Promise<any>>().mockResolvedValue({ success: true, data: {} }),
  };

  beforeAll(async () => {
    // Save original env vars
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    const originalCohereKey = process.env.COHERE_API_KEY;
    const originalLocalUrl = process.env.LOCAL_EMBEDDING_URL;

    // Set embedding credentials to empty strings to simulate unconfigured state
    // (ConfigModule reloads .env during init, so deletion doesn't persist)
    process.env.OPENAI_API_KEY = '';
    process.env.COHERE_API_KEY = '';
    process.env.LOCAL_EMBEDDING_URL = '';

    // Mock ConfigService to simulate unconfigured embedding credentials for this test suite
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY' || key === 'COHERE_API_KEY' || key === 'LOCAL_EMBEDDING_URL') {
          return undefined;
        }
        if (key === 'LLM_PROVIDER') return 'gemini';
        if (key === 'LLM_MODEL') return 'gemini-2.5-flash';
        if (key === 'LLM_API_KEY') return 'test-key';
        return undefined;
      }),
    } as unknown as ConfigService;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisClient)
      .useValue(mockRedis)
      .overrideProvider(ErpnextService)
      .useValue(mockErpnext)
      .overrideProvider(ConfigService)
      .useValue(mockConfig)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    aiController = moduleRef.get<AiController>(AiController);
    embeddingService = moduleRef.get<EmbeddingService>(EmbeddingService);
    orchestrator = moduleRef.get<ConversationOrchestrator>(ConversationOrchestrator);
    llmGatewayService = moduleRef.get<LlmGatewayService>(LlmGatewayService);
    toolRegistry = moduleRef.get<ToolRegistry>(ToolRegistry);

    // Restore original env vars
    if (originalOpenAIKey) process.env.OPENAI_API_KEY = originalOpenAIKey;
    if (originalCohereKey) process.env.COHERE_API_KEY = originalCohereKey;
    if (originalLocalUrl) process.env.LOCAL_EMBEDDING_URL = originalLocalUrl;
  }, 60000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Successfully boots NestJS application with AiModule registered in AppModule', () => {
    expect(app).toBeDefined();
    expect(aiController).toBeDefined();
    expect(orchestrator).toBeDefined();
    expect(embeddingService).toBeDefined();
    expect(llmGatewayService).toBeDefined();
    expect(toolRegistry).toBeDefined();
    expect(toolRegistry.getRegisteredTools().length).toBeGreaterThan(0);
  });

  it('2. EmbeddingService and LlmGatewayService safely handle unconfigured credentials without throwing fatal startup error', () => {
    expect(embeddingService.isAvailable()).toBe(false);
    expect(() => embeddingService.getProvider()).toThrow(/Embedding provider "openai" is not available/);
    expect(llmGatewayService).toBeDefined();
    expect(typeof llmGatewayService.isAvailable).toBe('function');
  });

  it('3. EmbeddingService correctly detects available provider when OPENAI_API_KEY is configured', async () => {
    // Create a separate module with configured credentials to test the positive case
    const mockConfigWithKey = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'sk-test-key';
        if (key === 'LLM_PROVIDER') return 'gemini';
        if (key === 'LLM_MODEL') return 'gemini-2.5-flash';
        if (key === 'LLM_API_KEY') return 'test-key';
        return undefined;
      }),
    } as unknown as ConfigService;

    const moduleRefWithKey: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisClient)
      .useValue(mockRedis)
      .overrideProvider(ErpnextService)
      .useValue(mockErpnext)
      .overrideProvider(ConfigService)
      .useValue(mockConfigWithKey)
      .compile();

    const embeddingServiceWithKey = moduleRefWithKey.get<EmbeddingService>(EmbeddingService);
    await embeddingServiceWithKey.onModuleInit();

    expect(embeddingServiceWithKey.isAvailable()).toBe(true);
    expect(embeddingServiceWithKey.listProviders()).toContain('openai');
    expect(embeddingServiceWithKey.getProvider('openai')).toBeDefined();
    expect(embeddingServiceWithKey.getModel('openai')).toBe('text-embedding-3-small');
    expect(embeddingServiceWithKey.getDimensions('openai')).toBe(1536);

    await moduleRefWithKey.close();
  });

  it('4. AiController is registered and exposes all 11 expected AI controller handlers', () => {
    expect(typeof aiController.chat).toBe('function');
    expect(typeof aiController.listConversations).toBe('function');
    expect(typeof aiController.getConversation).toBe('function');
    expect(typeof aiController.archiveConversation).toBe('function');
    expect(typeof aiController.deleteConversation).toBe('function');
    expect(typeof aiController.listPendingActions).toBe('function');
    expect(typeof aiController.getPendingAction).toBe('function');
    expect(typeof aiController.approveAction).toBe('function');
    expect(typeof aiController.rejectAction).toBe('function');
    expect(typeof aiController.executeAction).toBe('function');
    expect(typeof aiController.cancelAction).toBe('function');
  });

  it('4. Gateway router registers all expected /api/v1/ai routes', () => {
    const server = app.getHttpServer();
    const router = server._events.request._router;
    const routes: Array<{ path: string; method: string }> = [];

    router.stack.forEach((layer: any) => {
      if (layer.route) {
        const path = layer.route?.path;
        const methods = Object.keys(layer.route?.methods || {});
        methods.forEach((method) => {
          routes.push({ path, method: method.toUpperCase() });
        });
      }
    });

    const aiRoutes = routes.filter((r) => r.path.includes('/api/v1/ai'));
    expect(aiRoutes.length).toBeGreaterThanOrEqual(11);

    const expectedEndpoints = [
      { path: '/api/v1/ai/chat', method: 'POST' },
      { path: '/api/v1/ai/conversations', method: 'GET' },
      { path: '/api/v1/ai/conversations/:id', method: 'GET' },
      { path: '/api/v1/ai/conversations/:id/archive', method: 'PATCH' },
      { path: '/api/v1/ai/conversations/:id', method: 'DELETE' },
      { path: '/api/v1/ai/pending-actions', method: 'GET' },
      { path: '/api/v1/ai/pending-actions/:id', method: 'GET' },
      { path: '/api/v1/ai/pending-actions/:id/approve', method: 'POST' },
      { path: '/api/v1/ai/pending-actions/:id/reject', method: 'POST' },
      { path: '/api/v1/ai/pending-actions/:id/execute', method: 'POST' },
      { path: '/api/v1/ai/pending-actions/:id/cancel', method: 'POST' },
    ];

    expectedEndpoints.forEach((expected) => {
      const match = aiRoutes.find(
        (r) => r.path === expected.path && r.method === expected.method,
      );
      expect(match).toBeDefined();
    });
  });
});
