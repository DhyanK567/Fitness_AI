-- ============================================================
-- 135: RAG Vector HNSW and Full-Text Search (FTS) Indexes
-- ============================================================
-- Architecture & Verification Context:
-- 1. In migration 080, an IVFFlat index (idx_knowledge_chunks_kb_embedding)
--    was created on an empty ai.knowledge_chunks table with lists=100.
--    IVFFlat requires training on representative vector centroids.
--    HNSW (Hierarchical Navigable Small World) builds an incremental
--    graph that does not suffer from empty-table centroid skew.
-- 2. Physical vector(1536) column and all existing embeddings are preserved.
-- 3. Distance metric: cosine distance (<=>) indexed with vector_cosine_ops.
-- 4. Full-text search: expression GIN index matching to_tsvector('english', content)
--    accelerates hybrid keyword search without requiring schema changes or backfills.
-- 5. Safe replacement sequence:
--    - Create HNSW vector index FIRST.
--    - Create FTS GIN index SECOND.
--    - Drop older IVFFlat index ONLY AFTER replacement index is created.
--    If index creation fails for any reason, the transaction aborts and the
--    existing index remains intact.
--
-- Concurrency & Transactional Migration Notes:
-- - Prisma Migrate (npx prisma migrate deploy) runs each migration file inside
--   a PostgreSQL transaction block (BEGIN ... COMMIT).
-- - PostgreSQL prohibits CREATE INDEX CONCURRENTLY inside transaction blocks.
--   Therefore, standard CREATE INDEX IF NOT EXISTS is used here.
-- - For large production databases (>100k chunks) where write locks during index
--   creation cannot be tolerated during active business hours:
--   Execute concurrently out-of-band via DBA script:
--     SET maintenance_work_mem = '1GB';
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_hnsw_embedding
--       ON ai.knowledge_chunks USING hnsw (embedding vector_cosine_ops)
--       WITH (m = 16, ef_construction = 64);
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_chunks_content_fts
--       ON ai.knowledge_chunks USING gin (to_tsvector('english', content));
--     DROP INDEX CONCURRENTLY IF EXISTS ai.idx_knowledge_chunks_kb_embedding;
--   Then mark this migration applied:
--     npx prisma migrate resolve --applied 135_rag_hnsw_and_fts_indexes
-- ============================================================

-- Step 1: Create replacement HNSW vector index with vector_cosine_ops
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_hnsw_embedding
  ON ai.knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Step 2: Create expression GIN index for full-text search matching query predicate
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_fts
  ON ai.knowledge_chunks USING gin (to_tsvector('english', content));

-- Step 3: Safely drop superseded IVFFlat index now that HNSW is established
DROP INDEX IF EXISTS ai.idx_knowledge_chunks_kb_embedding;
