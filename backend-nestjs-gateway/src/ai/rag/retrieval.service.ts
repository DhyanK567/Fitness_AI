import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EmbeddingService, RAG_EMBEDDING_DIMENSIONS } from './embedding.service';

export const DEFAULT_TOP_K = 5;
export const MIN_TOP_K = 1;
export const MAX_TOP_K = 100;
export const CANDIDATE_POOL_MULTIPLIER = 4;
export const MIN_CANDIDATE_POOL = 40;
export const MAX_CANDIDATE_POOL = 200;

export interface RetrievalOptions {
  topK?: number;
  similarityThreshold?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
  precomputedEmbedding?: number[];
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
  similarity: number;
  chunkIndex: number;
  metadata?: Record<string, any>;
  documentTitle?: string;
  documentSourceType?: string;
  documentSourceRef?: string;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  queryEmbedding: number[];
  totalChunksScanned: number;
  latencyMs: number;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Safely normalize topK to a valid, finite positive integer within [MIN_TOP_K, MAX_TOP_K].
   * Rejects or safely defaults non-finite, non-numeric, zero, and negative values.
   */
  normalizeTopK(topK: unknown): number {
    if (typeof topK !== 'number' || !Number.isFinite(topK) || topK <= 0) {
      return DEFAULT_TOP_K;
    }
    const floored = Math.floor(topK);
    if (floored < MIN_TOP_K) {
      return DEFAULT_TOP_K;
    }
    return Math.min(MAX_TOP_K, floored);
  }

  /**
   * Calculate bounded candidate pool size for vector candidate selection in hybrid search.
   * Multiplier: 4x normalized topK, Floor: 40 candidates, Ceiling: 200 candidates.
   * This provides a bounded candidate pool that enables PostgreSQL KNN vector index scans
   * without unbounded candidate accumulation.
   */
  calculateCandidatePoolSize(safeTopK: number): number {
    return Math.min(
      Math.max(safeTopK * CANDIDATE_POOL_MULTIPLIER, MIN_CANDIDATE_POOL),
      MAX_CANDIDATE_POOL,
    );
  }

  /**
   * Retrieve relevant chunks for a query using vector similarity search
   */
  async retrieve(
    tenantId: string,
    knowledgeBaseId: string,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RetrievalResult> {
    const startTime = Date.now();

    const {
      similarityThreshold = 0.7,
      filter = {},
      includeMetadata = true,
    } = options;
    const safeTopK = this.normalizeTopK(options.topK);

    // Resolve target knowledge base to obtain configured provider and model
    const kb = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.knowledgeBase.findFirst({
        where: { id: knowledgeBaseId, tenantId, isActive: true },
        select: {
          id: true,
          embeddingProvider: true,
          embeddingModel: true,
          embeddingDimensions: true,
        },
      });
    });

    if (!kb) {
      throw new Error(`Knowledge base "${knowledgeBaseId}" not found or access denied for tenant.`);
    }

    const expectedDimensions = kb.embeddingDimensions ?? RAG_EMBEDDING_DIMENSIONS;
    if (expectedDimensions !== RAG_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Knowledge base "${knowledgeBaseId}" has embedding dimensions ${expectedDimensions}, which is incompatible with the 1536-dimensional vector schema.`
      );
    }

    // Generate query embedding with target KB's configured provider & model (or use compatible precomputed embedding)
    let queryEmbedding: number[];
    if (options.precomputedEmbedding) {
      queryEmbedding = options.precomputedEmbedding;
    } else {
      queryEmbedding = await this.embeddingService.embedSingle(
        query,
        kb.embeddingProvider || 'openai',
        {
          model: kb.embeddingModel || 'text-embedding-3-small',
          inputType: 'query',
          dimensions: expectedDimensions,
        },
      );
    }

    // Validate query embedding
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== expectedDimensions) {
      throw new Error(
        `Query embedding generation failed: expected vector of length ${expectedDimensions}, got ${Array.isArray(queryEmbedding) ? queryEmbedding.length : 'non-array'}.`
      );
    }
    for (let i = 0; i < queryEmbedding.length; i++) {
      if (typeof queryEmbedding[i] !== 'number' || !Number.isFinite(queryEmbedding[i])) {
        throw new Error(`Invalid query embedding vector at dimension ${i}: value must be a finite number.`);
      }
    }

    // Build the vector similarity query safely with sequential parameter binding
    const params: any[] = [];
    const addParam = (val: any): string => {
      params.push(val);
      return `$${params.length}`;
    };

    const pTenantId = addParam(tenantId);
    const pKnowledgeBaseId = addParam(knowledgeBaseId);
    const pEmbedding = addParam(JSON.stringify(queryEmbedding));

    let similarityThresholdClause = '';
    if (similarityThreshold > 0) {
      const pSimilarityThreshold = addParam(similarityThreshold);
      similarityThresholdClause = `AND (1 - (kc.embedding <=> ${pEmbedding}::vector)) >= ${pSimilarityThreshold}`;
    }

    const filterClauses: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (!/^[a-zA-Z0-9_]{1,64}$/.test(key)) {
        throw new Error(
          `Invalid metadata filter key "${key}": keys must only contain alphanumeric characters and underscores.`
        );
      }
      const pValue = addParam(typeof value === 'object' ? JSON.stringify(value) : String(value));
      filterClauses.push(`kc.metadata->>'${key}' = ${pValue}`);
    }

    const filterClause = filterClauses.length > 0 ? `AND ${filterClauses.join(' AND ')}` : '';
    const pTopK = addParam(safeTopK);

    const sqlQuery = `
      SELECT
        kc.id,
        kc.document_id as "documentId",
        kc.knowledge_base_id as "knowledgeBaseId",
        kc.content,
        kc.chunk_index as "chunkIndex",
        kc.metadata,
        kc.token_count as "tokenCount",
        1 - (kc.embedding <=> ${pEmbedding}::vector) as similarity,
        kbd.title as "documentTitle",
        kbd.source_type as "documentSourceType",
        kbd.source_ref as "documentSourceRef"
      FROM ai.knowledge_chunks kc
      INNER JOIN ai.knowledge_base_documents kbd ON kbd.id = kc.document_id
      INNER JOIN ai.knowledge_bases kb ON kb.id = kc.knowledge_base_id
      WHERE kc.tenant_id = ${pTenantId}
        AND kc.knowledge_base_id = ${pKnowledgeBaseId}
        AND kb.is_active = true
        AND kbd.status = 'completed'
        ${similarityThresholdClause}
        ${filterClause}
      ORDER BY kc.embedding <=> ${pEmbedding}::vector
      LIMIT ${pTopK}
    `;

    const chunks = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.$queryRawUnsafe<RetrievedChunk[]>(sqlQuery, ...params);
    });

    const latencyMs = Date.now() - startTime;

    return {
      chunks,
      queryEmbedding,
      totalChunksScanned: chunks.length,
      latencyMs,
    };
  }

  /**
   * Retrieve from multiple knowledge bases
   */
  async retrieveMulti(
    tenantId: string,
    knowledgeBaseIds: string[],
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    const safeTopK = this.normalizeTopK(options.topK);

    if (!Array.isArray(knowledgeBaseIds) || knowledgeBaseIds.length === 0) {
      return {
        chunks: [],
        queryEmbedding: [],
        totalChunksScanned: 0,
        latencyMs: Date.now() - startTime,
      };
    }

    // Inspect models and providers configured for each target knowledge base
    const kbs = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.knowledgeBase.findMany({
        where: { id: { in: knowledgeBaseIds }, tenantId, isActive: true },
        select: {
          id: true,
          embeddingProvider: true,
          embeddingModel: true,
          embeddingDimensions: true,
        },
      });
    });

    if (kbs.length !== knowledgeBaseIds.length) {
      throw new Error(
        `One or more requested knowledge bases were not found or access was denied for tenant.`
      );
    }

    // Ensure all target KBs have compatible dimensions
    for (const kb of kbs) {
      const dims = kb.embeddingDimensions ?? RAG_EMBEDDING_DIMENSIONS;
      if (dims !== RAG_EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Knowledge base "${kb.id}" has embedding dimensions ${dims}, which is incompatible with the 1536-dimensional vector schema.`
        );
      }
    }

    // Never reuse a query embedding across knowledge bases with incompatible embedding configurations.
    // Verify that all target KBs share compatible provider and model configuration.
    const firstKb = kbs[0];
    const expectedProvider = firstKb.embeddingProvider || 'openai';
    const expectedModel = firstKb.embeddingModel || 'text-embedding-3-small';

    for (let i = 1; i < kbs.length; i++) {
      const kb = kbs[i];
      const provider = kb.embeddingProvider || 'openai';
      const model = kb.embeddingModel || 'text-embedding-3-small';
      if (provider !== expectedProvider || model !== expectedModel) {
        throw new Error(
          `Multi-knowledge-base retrieval across incompatible embedding configurations is not supported: ` +
          `knowledge base "${firstKb.id}" uses ${expectedProvider}/${expectedModel}, ` +
          `while knowledge base "${kb.id}" uses ${provider}/${model}. ` +
          `Different embedding models cannot be combined into a single similarity ranking.`
        );
      }
    }

    // Generate query embedding once for all compatible target KBs
    const queryEmbedding = await this.embeddingService.embedSingle(
      query,
      expectedProvider,
      {
        model: expectedModel,
        inputType: 'query',
        dimensions: RAG_EMBEDDING_DIMENSIONS,
      },
    );

    // Search each KB using the precomputed compatible embedding
    const allChunks: RetrievedChunk[] = [];
    const perKbTopK = Math.ceil(safeTopK / knowledgeBaseIds.length) + 1;

    for (const kbId of knowledgeBaseIds) {
      const result = await this.retrieve(tenantId, kbId, query, {
        ...options,
        topK: perKbTopK,
        precomputedEmbedding: queryEmbedding,
      });
      allChunks.push(...result.chunks);
    }

    // Sort by similarity and take safeTopK
    allChunks.sort((a, b) => b.similarity - a.similarity);
    const topChunks = allChunks.slice(0, safeTopK);

    return {
      chunks: topChunks,
      queryEmbedding,
      totalChunksScanned: allChunks.length,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Hybrid search: vector + keyword (full-text search)
   */
  async hybridRetrieve(
    tenantId: string,
    knowledgeBaseId: string,
    query: string,
    options: RetrievalOptions & { keywordWeight?: number; vectorWeight?: number } = {},
  ): Promise<RetrievalResult> {
    const startTime = Date.now();

    const {
      similarityThreshold = 0.7,
      keywordWeight = 0.3,
      vectorWeight = 0.7,
      filter = {},
    } = options;
    const safeTopK = this.normalizeTopK(options.topK);

    // Resolve target knowledge base to obtain configured provider and model
    const kb = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.knowledgeBase.findFirst({
        where: { id: knowledgeBaseId, tenantId, isActive: true },
        select: {
          id: true,
          embeddingProvider: true,
          embeddingModel: true,
          embeddingDimensions: true,
        },
      });
    });

    if (!kb) {
      throw new Error(`Knowledge base "${knowledgeBaseId}" not found or access denied for tenant.`);
    }

    const expectedDimensions = kb.embeddingDimensions ?? RAG_EMBEDDING_DIMENSIONS;
    if (expectedDimensions !== RAG_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Knowledge base "${knowledgeBaseId}" has embedding dimensions ${expectedDimensions}, which is incompatible with the 1536-dimensional vector schema.`
      );
    }

    // Generate query embedding with target KB's configured provider & model (or use precomputed embedding)
    let queryEmbedding: number[];
    if (options.precomputedEmbedding) {
      queryEmbedding = options.precomputedEmbedding;
    } else {
      queryEmbedding = await this.embeddingService.embedSingle(
        query,
        kb.embeddingProvider || 'openai',
        {
          model: kb.embeddingModel || 'text-embedding-3-small',
          inputType: 'query',
          dimensions: expectedDimensions,
        },
      );
    }

    // Validate query embedding
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== expectedDimensions) {
      throw new Error(
        `Query embedding generation failed: expected vector of length ${expectedDimensions}, got ${Array.isArray(queryEmbedding) ? queryEmbedding.length : 'non-array'}.`
      );
    }
    for (let i = 0; i < queryEmbedding.length; i++) {
      if (typeof queryEmbedding[i] !== 'number' || !Number.isFinite(queryEmbedding[i])) {
        throw new Error(`Invalid query embedding vector at dimension ${i}: value must be a finite number.`);
      }
    }

    // Build parameterized query dynamically with sequential parameter binding
    const params: any[] = [];
    const addParam = (val: any): string => {
      params.push(val);
      return `$${params.length}`;
    };

    const pTenantId = addParam(tenantId);
    const pKnowledgeBaseId = addParam(knowledgeBaseId);
    const pEmbedding = addParam(JSON.stringify(queryEmbedding));

    let similarityThresholdClause = '';
    if (similarityThreshold > 0) {
      const pSimilarityThreshold = addParam(similarityThreshold);
      similarityThresholdClause = `AND (1 - (kc.embedding <=> ${pEmbedding}::vector)) >= ${pSimilarityThreshold}`;
    }

    const filterClauses: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (!/^[a-zA-Z0-9_]{1,64}$/.test(key)) {
        throw new Error(
          `Invalid metadata filter key "${key}": keys must only contain alphanumeric characters and underscores.`
        );
      }
      const pValue = addParam(typeof value === 'object' ? JSON.stringify(value) : String(value));
      filterClauses.push(`kc.metadata->>'${key}' = ${pValue}`);
    }
    const filterClause = filterClauses.length > 0 ? `AND ${filterClauses.join(' AND ')}` : '';

    // Bounded candidate pool for KNN index scan:
    // Derives bounded candidate limit from safeTopK (4x multiplier, 40 min, 200 max)
    // and binds sequentially as a query parameter for SQL injection protection.
    const candidateLimit = this.calculateCandidatePoolSize(safeTopK);
    const pCandidateLimit = addParam(candidateLimit);

    const pQuery = addParam(query);
    const pVectorWeight = addParam(vectorWeight);
    const pKeywordWeight = addParam(keywordWeight);
    const pTopK = addParam(safeTopK);

    const sqlQuery = `
      WITH vector_results AS (
        SELECT
          kc.id,
          1 - (kc.embedding <=> ${pEmbedding}::vector) as vector_similarity,
          kc.document_id as "documentId",
          kc.content,
          kc.chunk_index as "chunkIndex",
          kc.metadata,
          kc.token_count as "tokenCount",
          kbd.title as "documentTitle",
          kbd.source_type as "documentSourceType",
          kbd.source_ref as "documentSourceRef"
        FROM ai.knowledge_chunks kc
        INNER JOIN ai.knowledge_base_documents kbd ON kbd.id = kc.document_id
        INNER JOIN ai.knowledge_bases kb ON kb.id = kc.knowledge_base_id
        WHERE kc.tenant_id = ${pTenantId}
          AND kc.knowledge_base_id = ${pKnowledgeBaseId}
          AND kb.is_active = true
          AND kbd.status = 'completed'
          ${similarityThresholdClause}
          ${filterClause}
        ORDER BY kc.embedding <=> ${pEmbedding}::vector
        LIMIT ${pCandidateLimit}
      ),
      keyword_results AS (
        SELECT
          kc.id,
          ts_rank_cd(
            to_tsvector('english', kc.content),
            plainto_tsquery('english', ${pQuery})
          ) as keyword_score,
          kc.document_id as "documentId",
          kc.content,
          kc.chunk_index as "chunkIndex",
          kc.metadata,
          kc.token_count as "tokenCount",
          kbd.title as "documentTitle",
          kbd.source_type as "documentSourceType",
          kbd.source_ref as "documentSourceRef"
        FROM ai.knowledge_chunks kc
        INNER JOIN ai.knowledge_base_documents kbd ON kbd.id = kc.document_id
        INNER JOIN ai.knowledge_bases kb ON kb.id = kc.knowledge_base_id
        WHERE kc.tenant_id = ${pTenantId}
          AND kc.knowledge_base_id = ${pKnowledgeBaseId}
          AND kb.is_active = true
          AND kbd.status = 'completed'
          AND to_tsvector('english', kc.content) @@ plainto_tsquery('english', ${pQuery})
          ${filterClause}
      ),
      combined AS (
        SELECT
          COALESCE(v.id, k.id) as id,
          COALESCE(v.vector_similarity, 0) * ${pVectorWeight} + COALESCE(k.keyword_score, 0) * ${pKeywordWeight} as combined_score,
          COALESCE(v.content, k.content) as content,
          COALESCE(v."documentId", k."documentId") as "documentId",
          COALESCE(v."chunkIndex", k."chunkIndex") as "chunkIndex",
          COALESCE(v.metadata, k.metadata) as metadata,
          COALESCE(v."tokenCount", k."tokenCount") as "tokenCount",
          COALESCE(v."documentTitle", k."documentTitle") as "documentTitle",
          COALESCE(v."documentSourceType", k."documentSourceType") as "documentSourceType",
          COALESCE(v."documentSourceRef", k."documentSourceRef") as "documentSourceRef",
          COALESCE(v.vector_similarity, 0) as similarity
        FROM vector_results v
        FULL OUTER JOIN keyword_results k ON v.id = k.id
      )
      SELECT * FROM combined
      ORDER BY combined_score DESC
      LIMIT ${pTopK}
    `;

    const chunks = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.$queryRawUnsafe<RetrievedChunk[]>(sqlQuery, ...params);
    });

    return {
      chunks,
      queryEmbedding,
      totalChunksScanned: chunks.length,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Get knowledge base info for validation
   */
  async getKnowledgeBase(tenantId: string, knowledgeBaseId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.knowledgeBase.findFirst({
        where: { id: knowledgeBaseId, tenantId, isActive: true },
      });
    });
  }

  /**
   * List active knowledge bases for a tenant
   */
  async listKnowledgeBases(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.knowledgeBase.findMany({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  }
}
