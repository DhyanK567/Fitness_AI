import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DocumentIngestionService, DocumentSource } from '../document-ingestion.service';
import { RetrievalService, DEFAULT_TOP_K, MIN_TOP_K, MAX_TOP_K } from '../retrieval.service';
import { EmbeddingService } from '../embedding.service';
import { PrismaService } from '../../../common/prisma.service';

describe('RAG Batch 1: Critical Data Integrity, Tenant Isolation and Retrieval Security', () => {
  const tenantId = '11111111-2222-3333-4444-555555555555';
  const otherTenantId = '99999999-8888-7777-6666-555555555555';
  const knowledgeBaseId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  let ingestionService: DocumentIngestionService;
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
          embeddingDimensions: 1536,
        }),
        findMany: jest.fn<any>().mockResolvedValue([
          { id: knowledgeBaseId, tenantId, name: 'Studio Policies', isActive: true },
        ]),
      },
      knowledgeBaseDocument: {
        findFirst: jest.fn<any>().mockResolvedValue(null), // no duplicate by default
        create: jest.fn<any>().mockResolvedValue({
          id: 'doc-123',
          tenantId,
          knowledgeBaseId,
          status: 'processing',
        }),
        update: jest.fn<any>().mockResolvedValue({ id: 'doc-123', status: 'completed' }),
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
      knowledgeChunk: {
        deleteMany: jest.fn<any>().mockResolvedValue({ count: 2 }),
      },
      $executeRawUnsafe: jest.fn<any>().mockResolvedValue(1),
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
      embed: jest.fn<any>().mockResolvedValue([
        new Array(1536).fill(0.05),
      ]),
      embedSingle: jest.fn<any>().mockResolvedValue(
        new Array(1536).fill(0.05)
      ),
    } as any;

    ingestionService = new DocumentIngestionService(mockPrisma as unknown as PrismaService, mockEmbeddingService);
    retrievalService = new RetrievalService(mockPrisma as unknown as PrismaService, mockEmbeddingService);
  });

  // ============================================================================
  // RAG-01: Embedding Persistence and Dimension Validation
  // ============================================================================
  describe('RAG-01: Embedding Persistence and Dimension Validation', () => {
    const validSource: DocumentSource = {
      type: 'text',
      reference: 'terms-2026',
      title: 'Studio Terms of Service',
      content: 'This is section one of our studio terms and conditions. All members must follow safety rules.',
      metadata: { department: 'legal' },
    };

    it('persists chunk embeddings into PostgreSQL vector(1536) column via parameterized raw SQL', async () => {
      const result = await ingestionService.ingestDocument(tenantId, knowledgeBaseId, validSource);

      expect(result.status).toBe('completed');
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.chunksEmbedded).toBe(result.chunksCreated);

      // Verify raw SQL execution was called
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql, ...params] = (mockTx.$executeRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // Check SQL uses pgvector parameter casting $6::vector
      expect(sql).toContain('INSERT INTO ai.knowledge_chunks');
      expect(sql).toContain('$6::vector');
      expect(sql).toContain('$1::uuid');
      expect(sql).toContain('$2::uuid');
      expect(sql).toContain('$3::uuid');

      // Check parameter values: tenantId, kbId, docId, chunkIndex, content, embeddingVectorString
      expect(params[0]).toBe(tenantId);
      expect(params[1]).toBe(knowledgeBaseId);
      expect(params[2]).toBe('doc-123');
      expect(params[3]).toBe(0); // chunk index
      expect(params[4]).toContain('terms and conditions');
      // Vector string format '[0.05,0.05,...]'
      expect(params[5]).toMatch(/^\[0\.05(,0\.05)+\]$/);
      // Non-null vector length matches 1536
      const vectorNums = JSON.parse(params[5]);
      expect(vectorNums).toHaveLength(1536);
    });

    it('rejects incompatible embedding dimensions before writing chunks', async () => {
      // Embedding service returns 1024 dimensions instead of expected 1536
      mockEmbeddingService.embed.mockResolvedValueOnce([new Array(1024).fill(0.01)]);

      const result = await ingestionService.ingestDocument(tenantId, knowledgeBaseId, validSource);

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toContain('dimension mismatch');
      expect(result.errorMessage).toContain('expected 1536, got 1024');

      // Crucial: $executeRawUnsafe must NOT have been called with invalid dimensions
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();

      // Document status updated to failed
      expect(mockTx.knowledgeBaseDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'doc-123' },
          data: expect.objectContaining({ status: 'failed' }),
        })
      );
    });

    it('rejects non-finite embedding numbers (NaN / Infinity) before writing chunks', async () => {
      const invalidEmbedding = new Array(1536).fill(0.1);
      invalidEmbedding[42] = NaN;
      mockEmbeddingService.embed.mockResolvedValueOnce([invalidEmbedding]);

      const result = await ingestionService.ingestDocument(tenantId, knowledgeBaseId, validSource);

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toContain('finite number');
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('detects duplicate document content using deterministic SHA-256 hash without duplicate chunks', async () => {
      // Return existing document on duplicate check
      mockTx.knowledgeBaseDocument.findFirst.mockResolvedValueOnce({
        id: 'existing-doc-999',
        tenantId,
        knowledgeBaseId,
      });

      const result = await ingestionService.ingestDocument(tenantId, knowledgeBaseId, validSource);

      expect(result.status).toBe('completed');
      expect(result.documentId).toBe('existing-doc-999');
      expect(result.chunksCreated).toBe(0);
      expect(result.chunksEmbedded).toBe(0);

      // No new document created, no chunks created, no embedding generated
      expect(mockTx.knowledgeBaseDocument.create).not.toHaveBeenCalled();
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // RAG-02: Tenant Context and Row-Level Security
  // ============================================================================
  describe('RAG-02: Tenant Context and Row-Level Security', () => {
    it('executes all ingestion database calls inside PrismaService.withTenant', async () => {
      const source: DocumentSource = {
        type: 'text',
        reference: 'rules',
        title: 'Safety',
        content: 'Safety guidelines.',
      };

      await ingestionService.ingestDocument(tenantId, knowledgeBaseId, source);

      expect(mockPrisma.withTenant).toHaveBeenCalled();
      // Ensure all calls to withTenant used the exact authenticated tenantId
      for (const call of mockPrisma.withTenant.mock.calls) {
        expect(call[0]).toBe(tenantId);
      }
    });

    it('rejects access when non-canonical or malicious tenant ID is supplied', async () => {
      const maliciousTenant = "'; DROP TABLE ai.knowledge_bases; --";
      const source: DocumentSource = { type: 'text', reference: 'x', title: 'x', content: 'test' };

      await expect(
        ingestionService.ingestDocument(maliciousTenant, knowledgeBaseId, source)
      ).rejects.toThrow('canonical tenant UUID is required');

      expect(mockTx.knowledgeBaseDocument.create).not.toHaveBeenCalled();
    });

    it('denies ingestion if target knowledge base does not belong to the tenant', async () => {
      // Mock KB lookup returning null (KB belongs to another tenant or does not exist)
      mockTx.knowledgeBase.findFirst.mockResolvedValueOnce(null);

      const source: DocumentSource = { type: 'text', reference: 'x', title: 'x', content: 'test' };
      await expect(
        ingestionService.ingestDocument(tenantId, knowledgeBaseId, source)
      ).rejects.toThrow('Knowledge base not found or access denied');

      expect(mockTx.knowledgeBaseDocument.create).not.toHaveBeenCalled();
    });

    it('enforces tenant context on deleteDocument and reingestDocument', async () => {
      await ingestionService.deleteDocument(tenantId, 'doc-123');
      expect(mockPrisma.withTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
      expect(mockTx.knowledgeBaseDocument.deleteMany).toHaveBeenCalledWith({
        where: { id: 'doc-123', tenantId },
      });

      mockTx.knowledgeBaseDocument.findFirst.mockResolvedValueOnce({
        id: 'doc-123',
        tenantId,
        knowledgeBaseId,
        sourceType: 'text',
        sourceRef: 'ref',
        title: 'Title',
        content: 'Content',
      });

      await ingestionService.reingestDocument(tenantId, 'doc-123');
      expect(mockTx.knowledgeChunk.deleteMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-123', tenantId },
      });
    });

    it('executes retrieval similarity search inside PrismaService.withTenant', async () => {
      await retrievalService.retrieve(tenantId, knowledgeBaseId, 'safety rules');

      expect(mockPrisma.withTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // RAG-03: Retrieval Query Construction, Parameter Binding & Injection Safety
  // ============================================================================
  describe('RAG-03: Retrieval SQL Parameter Binding & Injection Prevention', () => {
    it('retrieves with 0 filters and similarityThreshold > 0: exact sequential parameters and numeric LIMIT', async () => {
      await retrievalService.retrieve(tenantId, knowledgeBaseId, 'gym hours', {
        topK: 10,
        similarityThreshold: 0.8,
        filter: {},
      });

      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // Verifications:
      // $1: tenantId, $2: knowledgeBaseId, $3: embedding, $4: similarityThreshold, $5: topK
      expect(params).toHaveLength(5);
      expect(params[0]).toBe(tenantId);
      expect(params[1]).toBe(knowledgeBaseId);
      expect(JSON.parse(params[2])).toHaveLength(1536);
      expect(params[3]).toBe(0.8);
      expect(params[4]).toBe(10);

      // SQL contains correct references
      expect(sql).toContain('WHERE kc.tenant_id = $1');
      expect(sql).toContain('AND kc.knowledge_base_id = $2');
      expect(sql).toContain('AND (1 - (kc.embedding <=> $3::vector)) >= $4');
      expect(sql).toContain('ORDER BY kc.embedding <=> $3::vector');
      expect(sql).toContain('LIMIT $5');
    });

    it('retrieves with 0 filters and similarityThreshold = 0: threshold omitted, parameter positions shifted cleanly', async () => {
      await retrievalService.retrieve(tenantId, knowledgeBaseId, 'gym hours', {
        topK: 5,
        similarityThreshold: 0,
      });

      const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // With threshold=0, threshold clause is omitted, so parameters are:
      // $1: tenantId, $2: knowledgeBaseId, $3: embedding, $4: topK
      expect(params).toHaveLength(4);
      expect(params[0]).toBe(tenantId);
      expect(params[1]).toBe(knowledgeBaseId);
      expect(params[3]).toBe(5);

      expect(sql).not.toContain('similarityThreshold');
      expect(sql).not.toContain('>= $');
      expect(sql).toContain('LIMIT $4');
    });

    it('retrieves with 1 metadata filter: binds filter value and assigns topK to LIMIT correctly', async () => {
      await retrievalService.retrieve(tenantId, knowledgeBaseId, 'pricing', {
        topK: 7,
        similarityThreshold: 0.75,
        filter: { category: 'memberships' },
      });

      const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // $1: tenant, $2: kb, $3: emb, $4: threshold, $5: filter value 'memberships', $6: topK
      expect(params).toHaveLength(6);
      expect(params[3]).toBe(0.75);
      expect(params[4]).toBe('memberships');
      expect(params[5]).toBe(7);

      expect(sql).toContain("kc.metadata->>'category' = $5");
      expect(sql).toContain('LIMIT $6');
    });

    it('retrieves with 2 metadata filters: sequential parameters for both filters and topK', async () => {
      await retrievalService.retrieve(tenantId, knowledgeBaseId, 'pricing', {
        topK: 4,
        similarityThreshold: 0.7,
        filter: { category: 'classes', difficulty: 'beginner' },
      });

      const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      expect(params).toHaveLength(7);
      expect(params[4]).toBe('classes');
      expect(params[5]).toBe('beginner');
      expect(params[6]).toBe(4);

      expect(sql).toContain("kc.metadata->>'category' = $5");
      expect(sql).toContain("kc.metadata->>'difficulty' = $6");
      expect(sql).toContain('LIMIT $7');
    });

    it('retrieves with 3 metadata filters: all 3 filters bound and LIMIT receives topK', async () => {
      await retrievalService.retrieve(tenantId, knowledgeBaseId, 'yoga', {
        topK: 3,
        similarityThreshold: 0.6,
        filter: { category: 'schedule', location: 'studio_1', instructor: 'jane' },
      });

      const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      expect(params).toHaveLength(8);
      expect(params[4]).toBe('schedule');
      expect(params[5]).toBe('studio_1');
      expect(params[6]).toBe('jane');
      expect(params[7]).toBe(3);

      expect(sql).toContain("kc.metadata->>'category' = $5");
      expect(sql).toContain("kc.metadata->>'location' = $6");
      expect(sql).toContain("kc.metadata->>'instructor' = $7");
      expect(sql).toContain('LIMIT $8');
    });

    it('rejects malicious metadata filter keys with potential SQL injection payload', async () => {
      const maliciousFilter = {
        "category'; DROP TABLE ai.knowledge_chunks; --": 'test',
      };

      await expect(
        retrievalService.retrieve(tenantId, knowledgeBaseId, 'test query', {
          filter: maliciousFilter,
        })
      ).rejects.toThrow('Invalid metadata filter key');

      expect(mockTx.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('hybridRetrieve() with 0, 1, 2, and 3 metadata filters binds parameters cleanly without collision', async () => {
      // 0 filters
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'yoga class', {
        topK: 8,
        similarityThreshold: 0.65,
        vectorWeight: 0.8,
        keywordWeight: 0.2,
      });

      let [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
      // $1: tenantId, $2: kbId, $3: emb, $4: threshold, $5: candidateLimit, $6: query, $7: vecWeight, $8: kwWeight, $9: topK
      expect(params).toHaveLength(9);
      expect(params[3]).toBe(0.65);
      expect(params[4]).toBe(40); // bounded candidate pool size for topK=8 (min 40)
      expect(params[5]).toBe('yoga class');
      expect(params[6]).toBe(0.8);
      expect(params[7]).toBe(0.2);
      expect(params[8]).toBe(8);
      expect(sql).toContain('LIMIT $9');

      // 2 filters
      mockTx.$queryRawUnsafe.mockClear();
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'yoga class', {
        topK: 5,
        similarityThreshold: 0.65,
        vectorWeight: 0.8,
        keywordWeight: 0.2,
        filter: { studio: 'main', type: 'hatha' },
      });

      [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
      // $1: tenantId, $2: kbId, $3: emb, $4: threshold, $5: studio, $6: type, $7: candidateLimit, $8: query, $9: vecWeight, $10: kwWeight, $11: topK
      expect(params).toHaveLength(11);
      expect(params[4]).toBe('main');
      expect(params[5]).toBe('hatha');
      expect(params[6]).toBe(40); // bounded candidate pool size for topK=5 (min 40)
      expect(params[7]).toBe('yoga class');
      expect(params[8]).toBe(0.8);
      expect(params[9]).toBe(0.2);
      expect(params[10]).toBe(5);
      expect(sql).toContain("kc.metadata->>'studio' = $5");
      expect(sql).toContain("kc.metadata->>'type' = $6");
      expect(sql).toContain('plainto_tsquery(\'english\', $8)');
      expect(sql).toContain('LIMIT $11');
    });

    it('hybridRetrieve() rejects malicious metadata filter keys', async () => {
      const maliciousFilter = {
        'status" OR "1"="1': 'active',
      };

      await expect(
        retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'test', {
          filter: maliciousFilter,
        })
      ).rejects.toThrow('Invalid metadata filter key');

      expect(mockTx.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    describe('topK defensive validation and SQL parameter binding', () => {
      it('normalizeTopK correctly normalizes invalid, negative, non-finite, and out-of-bound inputs', () => {
        // Defaults to DEFAULT_TOP_K (5)
        expect(retrievalService.normalizeTopK(undefined)).toBe(DEFAULT_TOP_K);
        expect(retrievalService.normalizeTopK(null)).toBe(DEFAULT_TOP_K);
        expect(retrievalService.normalizeTopK('10' as any)).toBe(DEFAULT_TOP_K);
        expect(retrievalService.normalizeTopK(NaN)).toBe(DEFAULT_TOP_K);
        expect(retrievalService.normalizeTopK(Infinity)).toBe(DEFAULT_TOP_K);
        expect(retrievalService.normalizeTopK(-Infinity)).toBe(DEFAULT_TOP_K);
        expect(retrievalService.normalizeTopK(0)).toBe(DEFAULT_TOP_K);
        expect(retrievalService.normalizeTopK(-1)).toBe(DEFAULT_TOP_K);
        expect(retrievalService.normalizeTopK(-50)).toBe(DEFAULT_TOP_K);
        expect(retrievalService.normalizeTopK(0.4)).toBe(DEFAULT_TOP_K);

        // Valid integers within [1, 100]
        expect(retrievalService.normalizeTopK(1)).toBe(MIN_TOP_K);
        expect(retrievalService.normalizeTopK(5)).toBe(5);
        expect(retrievalService.normalizeTopK(20)).toBe(20);
        expect(retrievalService.normalizeTopK(100)).toBe(MAX_TOP_K);

        // Floats floored to finite integer
        expect(retrievalService.normalizeTopK(7.9)).toBe(7);
        expect(retrievalService.normalizeTopK(1.1)).toBe(1);

        // Clamping excessively large values to MAX_TOP_K (100)
        expect(retrievalService.normalizeTopK(101)).toBe(MAX_TOP_K);
        expect(retrievalService.normalizeTopK(500)).toBe(MAX_TOP_K);
        expect(retrievalService.normalizeTopK(1_000_000)).toBe(MAX_TOP_K);
      });

      it('retrieve() safely defaults NaN, Infinity, -Infinity, 0, and negative topK to DEFAULT_TOP_K and binds a valid integer to SQL', async () => {
        const testCases = [
          { input: NaN, expected: DEFAULT_TOP_K, desc: 'NaN' },
          { input: Infinity, expected: DEFAULT_TOP_K, desc: 'Infinity' },
          { input: -Infinity, expected: DEFAULT_TOP_K, desc: '-Infinity' },
          { input: 0, expected: DEFAULT_TOP_K, desc: 'zero' },
          { input: -5, expected: DEFAULT_TOP_K, desc: 'negative (-5)' },
          { input: -100, expected: DEFAULT_TOP_K, desc: 'negative (-100)' },
          { input: undefined, expected: DEFAULT_TOP_K, desc: 'undefined' },
        ];

        for (const { input, expected, desc } of testCases) {
          mockTx.$queryRawUnsafe.mockClear();

          await retrievalService.retrieve(tenantId, knowledgeBaseId, 'wellness programs', {
            topK: input as any,
          });

          expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
          const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
          const boundTopK = params[params.length - 1];

          expect(boundTopK).toBe(expected);
          expect(Number.isInteger(boundTopK)).toBe(true);
          expect(Number.isFinite(boundTopK)).toBe(true);
          expect(boundTopK).toBeGreaterThanOrEqual(MIN_TOP_K);
          expect(boundTopK).toBeLessThanOrEqual(MAX_TOP_K);
          expect(sql).toContain(`LIMIT $${params.length}`);
        }
      });

      it('retrieve() clamps excessively large topK and floors fractional topK into valid finite integers', async () => {
        const testCases = [
          { input: 500, expected: MAX_TOP_K, desc: 'excessively large (500)' },
          { input: 1_000_000, expected: MAX_TOP_K, desc: 'excessively large (1,000,000)' },
          { input: 4.8, expected: 4, desc: 'fractional float (4.8 -> 4)' },
          { input: 15, expected: 15, desc: 'valid in-bounds integer (15)' },
        ];

        for (const { input, expected, desc } of testCases) {
          mockTx.$queryRawUnsafe.mockClear();

          await retrievalService.retrieve(tenantId, knowledgeBaseId, 'wellness programs', {
            topK: input,
          });

          expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
          const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
          const boundTopK = params[params.length - 1];

          expect(boundTopK).toBe(expected);
          expect(Number.isInteger(boundTopK)).toBe(true);
          expect(Number.isFinite(boundTopK)).toBe(true);
          expect(boundTopK).toBeGreaterThanOrEqual(MIN_TOP_K);
          expect(boundTopK).toBeLessThanOrEqual(MAX_TOP_K);
          expect(sql).toContain(`LIMIT $${params.length}`);
        }
      });

      it('hybridRetrieve() safely defaults NaN, Infinity, -Infinity, 0, and negative topK to DEFAULT_TOP_K and binds a valid integer to SQL', async () => {
        const testCases = [
          { input: NaN, expected: DEFAULT_TOP_K, desc: 'NaN' },
          { input: Infinity, expected: DEFAULT_TOP_K, desc: 'Infinity' },
          { input: -Infinity, expected: DEFAULT_TOP_K, desc: '-Infinity' },
          { input: 0, expected: DEFAULT_TOP_K, desc: 'zero' },
          { input: -12, expected: DEFAULT_TOP_K, desc: 'negative (-12)' },
          { input: undefined, expected: DEFAULT_TOP_K, desc: 'undefined' },
        ];

        for (const { input, expected, desc } of testCases) {
          mockTx.$queryRawUnsafe.mockClear();

          await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'pilates workout', {
            topK: input as any,
          });

          expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
          const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
          const boundTopK = params[params.length - 1];

          expect(boundTopK).toBe(expected);
          expect(Number.isInteger(boundTopK)).toBe(true);
          expect(Number.isFinite(boundTopK)).toBe(true);
          expect(boundTopK).toBeGreaterThanOrEqual(MIN_TOP_K);
          expect(boundTopK).toBeLessThanOrEqual(MAX_TOP_K);
          expect(sql).toContain(`LIMIT $${params.length}`);
        }
      });

      it('hybridRetrieve() clamps excessively large topK and floors fractional topK into valid finite integers', async () => {
        const testCases = [
          { input: 9999, expected: MAX_TOP_K, desc: 'excessively large (9999)' },
          { input: 100_000, expected: MAX_TOP_K, desc: 'excessively large (100,000)' },
          { input: 8.7, expected: 8, desc: 'fractional float (8.7 -> 8)' },
          { input: 12, expected: 12, desc: 'valid in-bounds integer (12)' },
        ];

        for (const { input, expected, desc } of testCases) {
          mockTx.$queryRawUnsafe.mockClear();

          await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'pilates workout', {
            topK: input,
          });

          expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
          const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
          const boundTopK = params[params.length - 1];

          expect(boundTopK).toBe(expected);
          expect(Number.isInteger(boundTopK)).toBe(true);
          expect(Number.isFinite(boundTopK)).toBe(true);
          expect(boundTopK).toBeGreaterThanOrEqual(MIN_TOP_K);
          expect(boundTopK).toBeLessThanOrEqual(MAX_TOP_K);
          expect(sql).toContain(`LIMIT $${params.length}`);
        }
      });
    });
  });
});
