import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  EmbeddingService,
  OpenAIEmbeddingProvider,
  CohereEmbeddingProvider,
  LocalEmbeddingProvider,
  RAG_EMBEDDING_DIMENSIONS,
} from '../embedding.service';
import { RetrievalService } from '../retrieval.service';
import { DocumentIngestionService, DocumentSource } from '../document-ingestion.service';
import { PrismaService } from '../../../common/prisma.service';

describe('RAG Batch 2: RAG-04 Embedding Compatibility and Contract Enforcement', () => {
  const tenantId = '11111111-2222-3333-4444-555555555555';
  const knowledgeBaseId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const otherKbId = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee';

  let originalFetch: typeof global.fetch;
  let mockFetch: any;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  // ============================================================================
  // 1. OpenAI Provider Contract & Model Parameter Handling
  // ============================================================================
  describe('OpenAI Provider Contract & Model Parameter Handling', () => {
    const mockConfig = (overrides: Record<string, any> = {}) => ({
      get: jest.fn((key: string) => overrides[key] || undefined),
    } as unknown as ConfigService);

    it('1. OpenAI text-embedding-3-small requests dimensions: 1536 in request body', async () => {
      const provider = new OpenAIEmbeddingProvider('sk-test-key', mockConfig());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: new Array(1536).fill(0.02) }],
          model: 'text-embedding-3-small',
        }),
      });

      const vectors = await provider.embed(['test fitness policy']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, requestOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/embeddings');
      const body = JSON.parse(requestOptions.body as string);

      expect(body.model).toBe('text-embedding-3-small');
      expect(body.dimensions).toBe(1536);
      expect(body.encoding_format).toBe('float');

      expect(vectors).toHaveLength(1);
      expect(vectors[0]).toHaveLength(1536);
    });

    it('2. OpenAI text-embedding-3-large requests dimensions: 1536 for RAG compatibility', async () => {
      const provider = new OpenAIEmbeddingProvider(
        'sk-test-key',
        mockConfig({ OPENAI_EMBEDDING_MODEL: 'text-embedding-3-large' }),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: new Array(1536).fill(0.03) }],
          model: 'text-embedding-3-large',
        }),
      });

      const vectors = await provider.embed(['studio member guidelines']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, requestOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(requestOptions.body as string);

      expect(body.model).toBe('text-embedding-3-large');
      expect(body.dimensions).toBe(1536);
      expect(vectors[0]).toHaveLength(1536);
    });

    it('3. text-embedding-ada-002 does NOT receive unsupported dimensions parameter in request body', async () => {
      const provider = new OpenAIEmbeddingProvider(
        'sk-test-key',
        mockConfig({ OPENAI_EMBEDDING_MODEL: 'text-embedding-ada-002' }),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: new Array(1536).fill(0.04) }],
          model: 'text-embedding-ada-002',
        }),
      });

      await provider.embed(['studio class schedule']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, requestOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(requestOptions.body as string);

      expect(body.model).toBe('text-embedding-ada-002');
      // Crucial: dimensions parameter MUST be undefined for ada-002
      expect(body.dimensions).toBeUndefined();
    });

    it('4. Provider responses with incorrect vector dimensions are rejected', async () => {
      const provider = new OpenAIEmbeddingProvider('sk-test-key', mockConfig());

      // API returned 1024 dimensions instead of expected 1536
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: new Array(1024).fill(0.01) }],
          model: 'text-embedding-3-small',
        }),
      });

      await expect(provider.embed(['test chunk'])).rejects.toThrow(
        /Embedding dimension mismatch from "openai".*expected 1536, got 1024/,
      );
    });

    it('5. Provider responses containing NaN or Infinity are rejected', async () => {
      const provider = new OpenAIEmbeddingProvider('sk-test-key', mockConfig());

      const badVectorWithNaN = new Array(1536).fill(0.01);
      badVectorWithNaN[100] = NaN;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: badVectorWithNaN }],
          model: 'text-embedding-3-small',
        }),
      });

      await expect(provider.embed(['test chunk'])).rejects.toThrow(
        /Embedding vector from "openai".*contains non-finite number/,
      );

      const badVectorWithInf = new Array(1536).fill(0.01);
      badVectorWithInf[200] = Infinity;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: badVectorWithInf }],
          model: 'text-embedding-3-small',
        }),
      });

      await expect(provider.embed(['test chunk'])).rejects.toThrow(
        /Embedding vector from "openai".*contains non-finite number/,
      );
    });

    it('6. Malformed or empty embedding responses fail clearly', async () => {
      const provider = new OpenAIEmbeddingProvider('sk-test-key', mockConfig());

      // Empty input array
      await expect(provider.embed([])).rejects.toThrow(
        /input texts array must not be empty/,
      );

      // API error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Incorrect API key provided' } }),
      });

      await expect(provider.embed(['some query'])).rejects.toThrow(
        /OpenAI embedding failed: Incorrect API key provided/,
      );

      // Malformed payload without data array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unexpected: 'response format' }),
      });

      await expect(provider.embed(['some query'])).rejects.toThrow(
        /received malformed response payload/,
      );
    });
  });

  // ============================================================================
  // 2. Cohere & Local Provider Compatibility
  // ============================================================================
  describe('Cohere & Local Provider Compatibility & Registration', () => {
    const mockConfig = (overrides: Record<string, any> = {}) => ({
      get: jest.fn((key: string) => overrides[key] || undefined),
    } as unknown as ConfigService);

    it('rejects Cohere embed() calls for the 1536-dimensional RAG vector schema without faking dimensions', async () => {
      const cohere = new CohereEmbeddingProvider('cohere-test-key', mockConfig());

      // When called without options or with 1536 dimensions
      await expect(cohere.embed(['fitness query'])).rejects.toThrow(
        /cannot produce 1536-dimensional vectors/,
      );

      // Verify no live fetch was executed
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('LocalEmbeddingProvider validates returned vector dimensions against 1536', async () => {
      const local = new LocalEmbeddingProvider('http://localhost:11434', mockConfig());

      // Local Ollama model returns 768 dimensions (e.g. nomic-embed-text)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [[...new Array(768).fill(0.01)]],
      });

      await expect(local.embed(['studio hours'])).rejects.toThrow(
        /Embedding dimension mismatch from "local".*expected 1536, got 768/,
      );
    });

    it('LocalEmbeddingProvider configured with incompatible dimensions (768) rejects before network call', async () => {
      const local = new LocalEmbeddingProvider(
        'http://localhost:11434',
        mockConfig({ LOCAL_EMBEDDING_DIMENSIONS: 768 }),
      );

      await expect(local.embed(['studio hours'])).rejects.toThrow(
        /Local embedding provider configured with 768 dimensions, but 1536 dimensions are required/,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('11. Missing credentials or unsupported provider/model combinations fail without silent fallback', async () => {
      const config = mockConfig({
        DEFAULT_EMBEDDING_PROVIDER: 'cohere',
        COHERE_API_KEY: 'cohere-test-key',
      });
      const embeddingService = new EmbeddingService(config, {} as any);
      await embeddingService.onModuleInit();

      // Cohere must not be registered as a valid provider for RAG
      expect(embeddingService.isAvailable('cohere')).toBe(false);

      // Attempting to resolve cohere must fail with an explicit actionable error, not fall back to openai
      expect(() => embeddingService.getProvider('cohere')).toThrow(
        /Embedding provider "cohere" \(1024 dimensions\) is incompatible with the 1536-dimensional RAG vector schema/,
      );

      // Attempting to resolve an unknown provider must fail explicitly
      expect(() => embeddingService.getProvider('unsupported-provider')).toThrow(
        /Embedding provider "unsupported-provider" is not available/,
      );
    });
  });

  // ============================================================================
  // 3. Retrieval Embedding Selection & Multi-KB Compatibility
  // ============================================================================
  describe('Retrieval Embedding Selection & Multi-KB Consistency', () => {
    let retrievalService: RetrievalService;
    let mockEmbeddingService: jest.Mocked<EmbeddingService>;
    let mockPrisma: any;
    let mockTx: any;

    beforeEach(() => {
      mockTx = {
        knowledgeBase: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: knowledgeBaseId,
            tenantId,
            name: 'Studio Policies',
            isActive: true,
            embeddingProvider: 'openai',
            embeddingModel: 'text-embedding-3-small',
            embeddingDimensions: 1536,
          }),
          findMany: jest.fn<any>().mockResolvedValue([
            {
              id: knowledgeBaseId,
              tenantId,
              name: 'Studio Policies',
              isActive: true,
              embeddingProvider: 'openai',
              embeddingModel: 'text-embedding-3-small',
              embeddingDimensions: 1536,
            },
            {
              id: otherKbId,
              tenantId,
              name: 'Studio Workouts',
              isActive: true,
              embeddingProvider: 'openai',
              embeddingModel: 'text-embedding-3-small',
              embeddingDimensions: 1536,
            },
          ]),
        },
        $queryRawUnsafe: jest.fn<any>().mockResolvedValue([]),
      };

      mockPrisma = {
        withTenant: jest.fn(async (tid: string, work: (tx: any) => Promise<any>) => {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tid)) {
            throw new Error('A canonical tenant UUID is required for tenant-scoped database access.');
          }
          return work(mockTx);
        }),
      };

      mockEmbeddingService = {
        embedSingle: jest.fn<any>().mockResolvedValue(new Array(1536).fill(0.05)),
      } as any;

      retrievalService = new RetrievalService(mockPrisma as unknown as PrismaService, mockEmbeddingService);
    });

    it('7. Retrieval uses the target knowledge base configured provider and model', async () => {
      // Knowledge base configured with local provider and custom model
      mockTx.knowledgeBase.findFirst.mockResolvedValueOnce({
        id: knowledgeBaseId,
        tenantId,
        name: 'Local KB',
        isActive: true,
        embeddingProvider: 'local',
        embeddingModel: 'custom-local-1536',
        embeddingDimensions: 1536,
      });

      await retrievalService.retrieve(tenantId, knowledgeBaseId, 'membership cancelation');

      expect(mockEmbeddingService.embedSingle).toHaveBeenCalledTimes(1);
      expect(mockEmbeddingService.embedSingle).toHaveBeenCalledWith(
        'membership cancelation',
        'local',
        expect.objectContaining({
          model: 'custom-local-1536',
          inputType: 'query',
          dimensions: 1536,
        }),
      );
    });

    it('hybridRetrieve() uses the target knowledge base configured provider and model', async () => {
      mockTx.knowledgeBase.findFirst.mockResolvedValueOnce({
        id: knowledgeBaseId,
        tenantId,
        name: 'Policies',
        isActive: true,
        embeddingProvider: 'openai',
        embeddingModel: 'text-embedding-3-large',
        embeddingDimensions: 1536,
      });

      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'pilates instructor');

      expect(mockEmbeddingService.embedSingle).toHaveBeenCalledWith(
        'pilates instructor',
        'openai',
        expect.objectContaining({
          model: 'text-embedding-3-large',
          inputType: 'query',
          dimensions: 1536,
        }),
      );
    });

    it('8. retrieve(), hybridRetrieve(), and retrieveMulti() cannot silently use an incompatible default embedding configuration', async () => {
      // Target KB has incompatible dimensions (1024)
      mockTx.knowledgeBase.findFirst.mockResolvedValueOnce({
        id: knowledgeBaseId,
        tenantId,
        name: 'Incompatible Cohere KB',
        isActive: true,
        embeddingProvider: 'cohere',
        embeddingModel: 'embed-english-v3.0',
        embeddingDimensions: 1024,
      });

      await expect(
        retrievalService.retrieve(tenantId, knowledgeBaseId, 'pricing'),
      ).rejects.toThrow(
        /has embedding dimensions 1024, which is incompatible with the 1536-dimensional vector schema/,
      );

      // Same check in hybridRetrieve()
      mockTx.knowledgeBase.findFirst.mockResolvedValueOnce({
        id: knowledgeBaseId,
        tenantId,
        name: 'Incompatible 768 KB',
        isActive: true,
        embeddingProvider: 'local',
        embeddingModel: 'bge-base',
        embeddingDimensions: 768,
      });

      await expect(
        retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'pricing'),
      ).rejects.toThrow(
        /has embedding dimensions 768, which is incompatible with the 1536-dimensional vector schema/,
      );
    });

    it('9. Multi-knowledge-base retrieval does not reuse incompatible query embeddings', async () => {
      // KB1 uses text-embedding-3-small, KB2 uses text-embedding-ada-002
      mockTx.knowledgeBase.findMany.mockResolvedValueOnce([
        {
          id: knowledgeBaseId,
          tenantId,
          name: 'KB One',
          isActive: true,
          embeddingProvider: 'openai',
          embeddingModel: 'text-embedding-3-small',
          embeddingDimensions: 1536,
        },
        {
          id: otherKbId,
          tenantId,
          name: 'KB Two',
          isActive: true,
          embeddingProvider: 'openai',
          embeddingModel: 'text-embedding-ada-002',
          embeddingDimensions: 1536,
        },
      ]);

      await expect(
        retrievalService.retrieveMulti(tenantId, [knowledgeBaseId, otherKbId], 'equipment safety'),
      ).rejects.toThrow(
        /Multi-knowledge-base retrieval across incompatible embedding configurations is not supported/,
      );

      // Verify that no query embedding was generated or reused across incompatible models
      expect(mockEmbeddingService.embedSingle).not.toHaveBeenCalled();
    });

    it('Multi-knowledge-base retrieval generates query embedding once and reuses it safely across compatible KBs', async () => {
      // Both KBs share the exact same provider and model
      await retrievalService.retrieveMulti(tenantId, [knowledgeBaseId, otherKbId], 'locker room rules', {
        topK: 6,
      });

      // Crucial: embedSingle must have been called exactly ONCE, not twice
      expect(mockEmbeddingService.embedSingle).toHaveBeenCalledTimes(1);
      expect(mockEmbeddingService.embedSingle).toHaveBeenCalledWith(
        'locker room rules',
        'openai',
        expect.objectContaining({
          model: 'text-embedding-3-small',
          dimensions: 1536,
        }),
      );

      // Verify that SQL search was executed for both KBs
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // 4. Ingestion and Re-ingestion Consistency
  // ============================================================================
  describe('Ingestion and Re-ingestion Provider & Model Consistency', () => {
    let ingestionService: DocumentIngestionService;
    let mockEmbeddingService: jest.Mocked<EmbeddingService>;
    let mockPrisma: any;
    let mockTx: any;

    const testSource: DocumentSource = {
      type: 'text',
      reference: 'rules-doc-1',
      title: 'Studio Cleanliness Rules',
      content: 'Members must wipe down gym equipment after every workout session.',
    };

    beforeEach(() => {
      mockTx = {
        knowledgeBase: {
          findFirst: jest.fn<any>().mockResolvedValue({
            id: knowledgeBaseId,
            tenantId,
            name: 'Studio Policies',
            isActive: true,
            embeddingProvider: 'local',
            embeddingModel: 'local-fitness-1536',
            embeddingDimensions: 1536,
          }),
        },
        knowledgeBaseDocument: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
          create: jest.fn<any>().mockResolvedValue({
            id: 'doc-999',
            tenantId,
            knowledgeBaseId,
            status: 'processing',
          }),
          update: jest.fn<any>().mockResolvedValue({ id: 'doc-999', status: 'completed' }),
          deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        },
        knowledgeChunk: {
          deleteMany: jest.fn<any>().mockResolvedValue({ count: 2 }),
        },
        $executeRawUnsafe: jest.fn<any>().mockResolvedValue(1),
      };

      mockPrisma = {
        withTenant: jest.fn(async (tid: string, work: (tx: any) => Promise<any>) => {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tid)) {
            throw new Error('A canonical tenant UUID is required for tenant-scoped database access.');
          }
          return work(mockTx);
        }),
      };

      mockEmbeddingService = {
        embed: jest.fn<any>().mockResolvedValue([new Array(1536).fill(0.05)]),
      } as any;

      ingestionService = new DocumentIngestionService(
        mockPrisma as unknown as PrismaService,
        mockEmbeddingService,
      );
    });

    it('ingestDocument() automatically resolves provider and model from target knowledge base when omitted by caller', async () => {
      const result = await ingestionService.ingestDocument(tenantId, knowledgeBaseId, testSource);

      expect(result.status).toBe('completed');
      expect(mockEmbeddingService.embed).toHaveBeenCalledWith(
        expect.any(Array),
        'local',
        expect.objectContaining({
          model: 'local-fitness-1536',
          inputType: 'document',
          dimensions: 1536,
        }),
      );
    });

    it('ingestDocument() rejects conflicting provider or model overrides that mismatch target knowledge base', async () => {
      // Caller attempts to override provider to openai on a local KB
      await expect(
        ingestionService.ingestDocument(tenantId, knowledgeBaseId, testSource, {
          embeddingProvider: 'openai',
        }),
      ).rejects.toThrow(
        /Embedding provider override "openai" does not match knowledge base configured provider "local"/,
      );
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('ingestDocument() rejects knowledge bases configured with non-1536 dimensions', async () => {
      mockTx.knowledgeBase.findFirst.mockResolvedValueOnce({
        id: knowledgeBaseId,
        tenantId,
        name: 'Cohere KB',
        isActive: true,
        embeddingProvider: 'cohere',
        embeddingModel: 'embed-english-v3.0',
        embeddingDimensions: 1024,
      });

      await expect(
        ingestionService.ingestDocument(tenantId, knowledgeBaseId, testSource),
      ).rejects.toThrow(
        /has embedding dimensions 1024, which is incompatible with the 1536-dimensional vector schema/,
      );
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('10. Re-ingestion preserves the knowledge base configured provider/model when no override is supplied', async () => {
      // Document belongs to a KB configured with local provider and local-fitness-1536
      mockTx.knowledgeBaseDocument.findFirst.mockResolvedValueOnce({
        id: 'doc-999',
        tenantId,
        knowledgeBaseId,
        sourceType: 'text',
        sourceRef: 'rules-doc-1',
        title: 'Studio Cleanliness Rules',
        content: 'Members must wipe down gym equipment after every workout session.',
        metadata: {},
        knowledgeBase: {
          id: knowledgeBaseId,
          embeddingProvider: 'local',
          embeddingModel: 'local-fitness-1536',
          embeddingDimensions: 1536,
        },
      });

      const result = await ingestionService.reingestDocument(tenantId, 'doc-999');

      expect(result.status).toBe('completed');
      expect(mockEmbeddingService.embed).toHaveBeenCalledWith(
        expect.any(Array),
        'local',
        expect.objectContaining({
          model: 'local-fitness-1536',
          dimensions: 1536,
        }),
      );
    });

    it('12. Existing tenant-scoping and Batch 1 retrieval protections remain intact', async () => {
      // Malicious non-UUID tenant ID
      const maliciousTenant = "'; DROP TABLE ai.knowledge_bases; --";

      await expect(
        ingestionService.ingestDocument(
          maliciousTenant,
          knowledgeBaseId,
          testSource,
        ),
      ).rejects.toThrow('canonical tenant UUID is required');

      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });
});
