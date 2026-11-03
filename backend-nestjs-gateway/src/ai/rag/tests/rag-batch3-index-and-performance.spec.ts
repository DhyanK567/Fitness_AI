import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  RetrievalService,
  DEFAULT_TOP_K,
  MIN_TOP_K,
  MAX_TOP_K,
  CANDIDATE_POOL_MULTIPLIER,
  MIN_CANDIDATE_POOL,
  MAX_CANDIDATE_POOL,
  RetrievedChunk,
} from '../retrieval.service';
import { EmbeddingService } from '../embedding.service';
import { PrismaService } from '../../../common/prisma.service';

describe('RAG Batch 3: RAG-05 Index Strategy, Candidate Pooling, and Hybrid Retrieval', () => {
  const tenantId = '11111111-2222-3333-4444-555555555555';
  const knowledgeBaseId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

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
      embed: jest.fn<any>().mockResolvedValue([new Array(1536).fill(0.05)]),
      embedSingle: jest.fn<any>().mockResolvedValue(new Array(1536).fill(0.05)),
    } as any;

    retrievalService = new RetrievalService(
      mockPrisma as unknown as PrismaService,
      mockEmbeddingService,
    );
  });

  // ============================================================================
  // 1. Candidate Pool Sizing & Boundary Calculation
  // ============================================================================
  describe('Candidate Pool Sizing & Boundaries', () => {
    it('applies multiplier 4, floor 40, and ceiling 200 to derive candidate pool size', () => {
      // Below floor: topK 1..9
      expect(retrievalService.calculateCandidatePoolSize(1)).toBe(MIN_CANDIDATE_POOL); // 1 * 4 = 4 -> 40
      expect(retrievalService.calculateCandidatePoolSize(5)).toBe(MIN_CANDIDATE_POOL); // 5 * 4 = 20 -> 40
      expect(retrievalService.calculateCandidatePoolSize(10)).toBe(MIN_CANDIDATE_POOL); // 10 * 4 = 40 -> 40

      // Proportional range: topK 11..49
      expect(retrievalService.calculateCandidatePoolSize(15)).toBe(60); // 15 * 4 = 60
      expect(retrievalService.calculateCandidatePoolSize(25)).toBe(100); // 25 * 4 = 100
      expect(retrievalService.calculateCandidatePoolSize(35)).toBe(140); // 35 * 4 = 140

      // At and above ceiling: topK >= 50
      expect(retrievalService.calculateCandidatePoolSize(50)).toBe(MAX_CANDIDATE_POOL); // 50 * 4 = 200 -> 200
      expect(retrievalService.calculateCandidatePoolSize(75)).toBe(MAX_CANDIDATE_POOL); // 75 * 4 = 300 -> 200
      expect(retrievalService.calculateCandidatePoolSize(100)).toBe(MAX_CANDIDATE_POOL); // 100 * 4 = 400 -> 200
    });

    it('enforces that candidate pool size is always within [MIN_CANDIDATE_POOL, MAX_CANDIDATE_POOL]', () => {
      for (let topK = MIN_TOP_K; topK <= MAX_TOP_K; topK++) {
        const poolSize = retrievalService.calculateCandidatePoolSize(topK);
        expect(poolSize).toBeGreaterThanOrEqual(MIN_CANDIDATE_POOL);
        expect(poolSize).toBeLessThanOrEqual(MAX_CANDIDATE_POOL);
        expect(Number.isInteger(poolSize)).toBe(true);
        expect(Number.isFinite(poolSize)).toBe(true);
      }
    });

    it('exports defined constants conforming to approved bounds', () => {
      expect(CANDIDATE_POOL_MULTIPLIER).toBe(4);
      expect(MIN_CANDIDATE_POOL).toBe(40);
      expect(MAX_CANDIDATE_POOL).toBe(200);
      expect(MIN_TOP_K).toBe(1);
      expect(MAX_TOP_K).toBe(100);
      expect(DEFAULT_TOP_K).toBe(5);
    });
  });

  // ============================================================================
  // 2. SQL Query Structure for KNN Vector Index & FTS GIN Scan
  // ============================================================================
  describe('SQL Query Structure for Index Optimization', () => {
    it('generates vector_results CTE with ORDER BY <=> and LIMIT candidateLimit for KNN scan', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'pilates equipment', {
        topK: 10,
        similarityThreshold: 0.7,
      });

      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // vector_results CTE contains distance ordering and candidate limit
      expect(sql).toContain('WITH vector_results AS (');
      expect(sql).toContain('ORDER BY kc.embedding <=> $3::vector');
      expect(sql).toContain('LIMIT $5'); // $5 is candidateLimit when similarityThreshold > 0 and 0 filters

      // keyword_results CTE contains FTS expression matching expression GIN index
      expect(sql).toContain('keyword_results AS (');
      expect(sql).toContain("to_tsvector('english', kc.content) @@ plainto_tsquery('english', $6)");
      expect(sql).toContain("ts_rank_cd(\n            to_tsvector('english', kc.content),\n            plainto_tsquery('english', $6)\n          )");

      // combined CTE merges results via FULL OUTER JOIN
      expect(sql).toContain('combined AS (');
      expect(sql).toContain('FROM vector_results v');
      expect(sql).toContain('FULL OUTER JOIN keyword_results k ON v.id = k.id');

      // Final outer query sorts by combined_score and applies safeTopK limit
      expect(sql).toContain('SELECT * FROM combined');
      expect(sql).toContain('ORDER BY combined_score DESC');
      expect(sql).toContain('LIMIT $9'); // $9 is topK
    });

    it('uses cosine distance operator (<=>) matching vector_cosine_ops operator class', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'yoga breathing');

      const [sql] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
      // Must use <=> for cosine distance (not <-> Euclidean or <#> negative inner product)
      expect(sql).toContain('kc.embedding <=> $3::vector');
      expect(sql).not.toContain('kc.embedding <->');
      expect(sql).not.toContain('kc.embedding <#>');
    });

    it('matches exact to_tsvector(english, content) expression to activate GIN index', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'strength training');

      const [sql] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
      // Expression in WHERE clause must exactly match CREATE INDEX ... ON ... USING gin (to_tsvector('english', content))
      expect(sql).toContain("to_tsvector('english', kc.content)");
    });
  });

  // ============================================================================
  // 3. Sequential Parameter Binding & Injection Safety
  // ============================================================================
  describe('Sequential Parameter Binding & Protection Against SQL Injection', () => {
    it('maintains clean sequential parameter binding with 0 metadata filters', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'cycling class', {
        topK: 8,
        similarityThreshold: 0.65,
        vectorWeight: 0.75,
        keywordWeight: 0.25,
      });

      const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // Sequential: $1=tenantId, $2=kbId, $3=embedding, $4=threshold, $5=candidateLimit, $6=query, $7=vecWeight, $8=kwWeight, $9=topK
      expect(params).toHaveLength(9);
      expect(params[0]).toBe(tenantId);
      expect(params[1]).toBe(knowledgeBaseId);
      expect(JSON.parse(params[2])).toHaveLength(1536);
      expect(params[3]).toBe(0.65);
      expect(params[4]).toBe(40); // candidate limit (8 * 4 = 32 -> min 40)
      expect(params[5]).toBe('cycling class');
      expect(params[6]).toBe(0.75);
      expect(params[7]).toBe(0.25);
      expect(params[8]).toBe(8);

      // Verify no gaps in parameter indices in SQL
      for (let i = 1; i <= params.length; i++) {
        expect(sql).toContain(`$${i}`);
      }
    });

    it('maintains clean sequential parameter binding when similarityThreshold is 0', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'boxing basics', {
        topK: 25,
        similarityThreshold: 0,
      });

      const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // When threshold is 0, similarityThresholdClause is omitted, so threshold param is not added:
      // $1=tenantId, $2=kbId, $3=embedding, $4=candidateLimit, $5=query, $6=vecWeight, $7=kwWeight, $8=topK
      expect(params).toHaveLength(8);
      expect(params[0]).toBe(tenantId);
      expect(params[1]).toBe(knowledgeBaseId);
      expect(params[3]).toBe(100); // candidate limit for topK=25: 25 * 4 = 100
      expect(params[4]).toBe('boxing basics');
      expect(params[7]).toBe(25); // topK

      // No threshold clause in SQL
      expect(sql).not.toContain('similarityThresholdClause');
      expect(sql).not.toContain('>= $');
    });

    it('maintains clean sequential parameter binding with 2 metadata filters', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'recovery', {
        topK: 5,
        similarityThreshold: 0.6,
        filter: { category: 'recovery', room: 'spa_1' },
      });

      const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // $1=tenantId, $2=kbId, $3=embedding, $4=threshold, $5=category, $6=room, $7=candidateLimit, $8=query, $9=vecWeight, $10=kwWeight, $11=topK
      expect(params).toHaveLength(11);
      expect(params[4]).toBe('recovery');
      expect(params[5]).toBe('spa_1');
      expect(params[6]).toBe(40); // candidateLimit
      expect(params[7]).toBe('recovery'); // query
      expect(params[10]).toBe(5); // topK

      expect(sql).toContain("kc.metadata->>'category' = $5");
      expect(sql).toContain("kc.metadata->>'room' = $6");
      expect(sql).toContain('LIMIT $7');
      expect(sql).toContain('LIMIT $11');
    });

    it('rejects SQL injection attempts in metadata filter keys', async () => {
      const injectionKeys = [
        'category; DROP TABLE ai.knowledge_chunks;--',
        "category' OR '1'='1",
        'status/*comment*/',
        'field with spaces',
        'key$with$symbols',
      ];

      for (const key of injectionKeys) {
        mockTx.$queryRawUnsafe.mockClear();
        await expect(
          retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'test', {
            filter: { [key]: 'value' },
          }),
        ).rejects.toThrow('Invalid metadata filter key');

        expect(mockTx.$queryRawUnsafe).not.toHaveBeenCalled();
      }
    });

    it('safely serializes non-primitive metadata filter values to JSON strings', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'test', {
        filter: { tags: ['yoga', 'core'] },
      });

      const [, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
      expect(params[4]).toBe(JSON.stringify(['yoga', 'core']));
    });
  });

  // ============================================================================
  // 4. Tenant Scoping, Active KB, and Status Filter Preservation
  // ============================================================================
  describe('Tenant Scoping and Security Filter Preservation', () => {
    it('enforces tenant_id, knowledge_base_id, is_active, and status in vector_results CTE', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'pilates');

      const [sql] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // Extract vector_results CTE content
      const vectorCte = sql.substring(sql.indexOf('WITH vector_results AS ('), sql.indexOf('keyword_results AS ('));
      expect(vectorCte).toContain('kc.tenant_id = $1');
      expect(vectorCte).toContain('kc.knowledge_base_id = $2');
      expect(vectorCte).toContain('kb.is_active = true');
      expect(vectorCte).toContain("kbd.status = 'completed'");
    });

    it('enforces tenant_id, knowledge_base_id, is_active, and status in keyword_results CTE', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'pilates');

      const [sql] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];

      // Extract keyword_results CTE content
      const keywordCte = sql.substring(sql.indexOf('keyword_results AS ('), sql.indexOf('combined AS ('));
      expect(keywordCte).toContain('kc.tenant_id = $1');
      expect(keywordCte).toContain('kc.knowledge_base_id = $2');
      expect(keywordCte).toContain('kb.is_active = true');
      expect(keywordCte).toContain("kbd.status = 'completed'");
    });

    it('preserves tenant context via withTenant wrapper', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'pilates');

      expect(mockPrisma.withTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
    });
  });

  // ============================================================================
  // 5. Threshold Preservation and Filtering
  // ============================================================================
  describe('Similarity Threshold Preservation', () => {
    it('places similarity threshold filter strictly inside vector_results CTE before LIMIT', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'yoga', {
        similarityThreshold: 0.8,
      });

      const [sql] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
      const vectorCte = sql.substring(sql.indexOf('WITH vector_results AS ('), sql.indexOf('keyword_results AS ('));

      expect(vectorCte).toContain('AND (1 - (kc.embedding <=> $3::vector)) >= $4');
      // Threshold check must precede ORDER BY ... LIMIT
      const threshIdx = vectorCte.indexOf('AND (1 - (kc.embedding <=> $3::vector)) >= $4');
      const orderIdx = vectorCte.indexOf('ORDER BY kc.embedding <=> $3::vector');
      const limitIdx = vectorCte.indexOf('LIMIT $5');

      expect(threshIdx).toBeLessThan(orderIdx);
      expect(orderIdx).toBeLessThan(limitIdx);
    });

    it('does not apply vector similarity threshold to keyword_results CTE', async () => {
      await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'yoga', {
        similarityThreshold: 0.8,
      });

      const [sql] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
      const keywordCte = sql.substring(sql.indexOf('keyword_results AS ('), sql.indexOf('combined AS ('));

      // keyword CTE must NOT filter by vector similarity threshold
      expect(keywordCte).not.toContain('kc.embedding <=> $3::vector');
    });
  });

  // ============================================================================
  // 6. Hybrid Ranking and Semantic Implications of Candidate Limits
  // ============================================================================
  describe('Hybrid Ranking and Candidate Pool Semantic Behavior', () => {
    it('correctly returns merged hybrid search results with expected return shape', async () => {
      const mockRows: any[] = [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          knowledgeBaseId,
          content: 'Pilates reformer safety and setup instructions.',
          chunkIndex: 0,
          metadata: { category: 'safety' },
          tokenCount: 45,
          documentTitle: 'Reformer Manual',
          documentSourceType: 'pdf',
          documentSourceRef: 'manuals/reformer.pdf',
          similarity: 0.88,
          combined_score: 0.82,
        },
        {
          id: 'chunk-2',
          documentId: 'doc-2',
          knowledgeBaseId,
          content: 'General studio opening hours and reformer availability.',
          chunkIndex: 1,
          metadata: { category: 'ops' },
          tokenCount: 30,
          documentTitle: 'Studio FAQ',
          documentSourceType: 'faq',
          documentSourceRef: 'faq/general',
          similarity: 0.72,
          combined_score: 0.68,
        },
      ];

      mockTx.$queryRawUnsafe.mockResolvedValueOnce(mockRows);

      const result = await retrievalService.hybridRetrieve(tenantId, knowledgeBaseId, 'reformer setup', {
        topK: 5,
        vectorWeight: 0.7,
        keywordWeight: 0.3,
      });

      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0].id).toBe('chunk-1');
      expect(result.chunks[0].similarity).toBe(0.88);
      expect(result.chunks[0].documentTitle).toBe('Reformer Manual');
      expect(result.totalChunksScanned).toBe(2);
      expect(result.queryEmbedding).toHaveLength(1536);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('documents ranking semantic behavior when a chunk has keyword relevance outside candidate pool', async () => {
      // In the CTE query:
      // If a document has strong keyword relevance but ranks outside the top candidateLimit nearest neighbors,
      // FULL OUTER JOIN keyword_results k ON v.id = k.id produces:
      // v.vector_similarity = NULL (COALESCE(v.vector_similarity, 0) -> 0).
      // Its combined score is purely: 0 * vectorWeight + keyword_score * keywordWeight.
      // Sizing candidateLimit to at least 40 and 4x topK ensures that relevant semantic neighbors
      // are retained in the candidate pool for hybrid reranking.
      const poolForTop10 = retrievalService.calculateCandidatePoolSize(10);
      expect(poolForTop10).toBe(40);

      const poolForTop30 = retrievalService.calculateCandidatePoolSize(30);
      expect(poolForTop30).toBe(120);
    });
  });

  // ============================================================================
  // 7. Backward Compatibility of retrieve() and retrieveMulti()
  // ============================================================================
  describe('Backward Compatibility with retrieve() and retrieveMulti()', () => {
    it('retrieve() continues to function with ORDER BY <=> and LIMIT safeTopK', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        {
          id: 'chunk-vec-1',
          documentId: 'doc-1',
          knowledgeBaseId,
          content: 'Pure vector match',
          chunkIndex: 0,
          tokenCount: 20,
          similarity: 0.92,
        },
      ]);

      const result = await retrievalService.retrieve(tenantId, knowledgeBaseId, 'warmup exercises', {
        topK: 5,
      });

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].similarity).toBe(0.92);

      const [sql, ...params] = (mockTx.$queryRawUnsafe as jest.Mock).mock.calls[0] as [string, ...any[]];
      expect(sql).toContain('ORDER BY kc.embedding <=> $3::vector');
      expect(sql).toContain('LIMIT $5');
      expect(params[params.length - 1]).toBe(5);
    });

    it('retrieveMulti() retrieves and aggregates across multiple knowledge bases', async () => {
      const kb2Id = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
      mockTx.knowledgeBase.findMany.mockResolvedValueOnce([
        {
          id: knowledgeBaseId,
          embeddingProvider: 'openai',
          embeddingModel: 'text-embedding-3-small',
          embeddingDimensions: 1536,
        },
        {
          id: kb2Id,
          embeddingProvider: 'openai',
          embeddingModel: 'text-embedding-3-small',
          embeddingDimensions: 1536,
        },
      ]);

      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([
          { id: 'c1', documentId: 'd1', knowledgeBaseId, content: 'kb1', chunkIndex: 0, similarity: 0.95 },
        ])
        .mockResolvedValueOnce([
          { id: 'c2', documentId: 'd2', knowledgeBaseId: kb2Id, content: 'kb2', chunkIndex: 0, similarity: 0.85 },
        ]);

      const result = await retrievalService.retrieveMulti(tenantId, [knowledgeBaseId, kb2Id], 'instructor bio', {
        topK: 2,
      });

      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0].similarity).toBe(0.95);
      expect(result.chunks[1].similarity).toBe(0.85);
    });
  });
});
