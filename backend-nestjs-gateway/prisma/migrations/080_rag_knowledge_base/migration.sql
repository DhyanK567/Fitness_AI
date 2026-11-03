-- RAG / Knowledge Base Schema and Tables
-- Phase 2: Vector Search, Document Ingestion, and Retrieval

-- Enable pgvector extension (required for vector similarity search)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Knowledge Bases Table
-- ============================================================
CREATE TABLE ai.knowledge_bases (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL,
    name                     VARCHAR(200) NOT NULL,
    description              TEXT,
    embedding_provider       VARCHAR(50) NOT NULL DEFAULT 'openai',
    embedding_model          VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
    embedding_dimensions     INTEGER NOT NULL DEFAULT 1536,
    chunk_size               INTEGER NOT NULL DEFAULT 1000,
    chunk_overlap            INTEGER NOT NULL DEFAULT 200,
    is_active                BOOLEAN NOT NULL DEFAULT true,
    metadata                 JSONB NOT NULL DEFAULT '{}',
    created_at               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.knowledge_bases ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access knowledge bases in their tenant
CREATE POLICY knowledge_base_tenant_isolation ON ai.knowledge_bases
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

-- Indexes
CREATE UNIQUE INDEX idx_knowledge_bases_tenant_name ON ai.knowledge_bases (tenant_id, name);
CREATE INDEX idx_knowledge_bases_tenant_active ON ai.knowledge_bases (tenant_id, is_active);

-- Updated at trigger
CREATE TRIGGER update_knowledge_bases_updated_at
    BEFORE UPDATE ON ai.knowledge_bases
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Knowledge Base Documents Table
-- ============================================================
CREATE TABLE ai.knowledge_base_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    knowledge_base_id   UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    source_type         VARCHAR(40) NOT NULL,  -- 'pdf', 'markdown', 'faq', 'erp_docs', 'web', 'manual'
    source_ref          VARCHAR(500),          -- Original source identifier (file path, URL, ERP doc ID, etc.)
    title               VARCHAR(500) NOT NULL,
    content             TEXT NOT NULL,
    content_hash        CHAR(64) NOT NULL,     -- SHA256 for deduplication
    mime_type           VARCHAR(100),
    file_size           INTEGER,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'archived')),
    error_message       TEXT,
    chunk_count         INTEGER NOT NULL DEFAULT 0,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    processed_at        TIMESTAMPTZ(6)
);

-- Enable RLS
ALTER TABLE ai.knowledge_base_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Documents inherit tenant from knowledge base
CREATE POLICY kb_document_tenant_isolation ON ai.knowledge_base_documents
    USING (
        knowledge_base_id IN (
            SELECT id FROM ai.knowledge_bases WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    )
    WITH CHECK (
        knowledge_base_id IN (
            SELECT id FROM ai.knowledge_bases WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    );

-- Indexes
CREATE UNIQUE INDEX idx_kb_documents_tenant_kb_hash ON ai.knowledge_base_documents (tenant_id, knowledge_base_id, content_hash);
CREATE INDEX idx_kb_documents_tenant_status ON ai.knowledge_base_documents (tenant_id, status);
CREATE INDEX idx_kb_documents_kb_status ON ai.knowledge_base_documents (knowledge_base_id, status);
CREATE INDEX idx_kb_documents_source ON ai.knowledge_base_documents (source_type, source_ref);

-- Updated at trigger
CREATE TRIGGER update_knowledge_base_documents_updated_at
    BEFORE UPDATE ON ai.knowledge_base_documents
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Knowledge Chunks Table (with vector embeddings)
-- ============================================================
CREATE TABLE ai.knowledge_chunks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    knowledge_base_id   UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    document_id         UUID NOT NULL REFERENCES ai.knowledge_base_documents(id) ON DELETE CASCADE,
    chunk_index         INTEGER NOT NULL,
    content             TEXT NOT NULL,
    embedding           vector(1536),  -- pgvector type for similarity search
    token_count         INTEGER NOT NULL DEFAULT 0,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Chunks inherit tenant from knowledge base
CREATE POLICY kb_chunk_tenant_isolation ON ai.knowledge_chunks
    USING (
        knowledge_base_id IN (
            SELECT id FROM ai.knowledge_bases WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    )
    WITH CHECK (
        knowledge_base_id IN (
            SELECT id FROM ai.knowledge_bases WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    );

-- Indexes
CREATE INDEX idx_knowledge_chunks_tenant_kb ON ai.knowledge_chunks (tenant_id, knowledge_base_id);
CREATE INDEX idx_knowledge_chunks_document ON ai.knowledge_chunks (document_id, chunk_index);
CREATE INDEX idx_knowledge_chunks_kb_embedding ON ai.knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- Knowledge Base Ingestion Jobs Table (for async processing)
-- ============================================================
CREATE TABLE ai.knowledge_base_ingestion_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    knowledge_base_id   UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    document_id         UUID REFERENCES ai.knowledge_base_documents(id) ON DELETE SET NULL,
    job_type            VARCHAR(40) NOT NULL,  -- 'ingest', 'reindex', 'delete', 'update_embeddings'
    status              VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    progress            INTEGER NOT NULL DEFAULT 0,  -- 0-100
    total_chunks        INTEGER NOT NULL DEFAULT 0,
    processed_chunks    INTEGER NOT NULL DEFAULT 0,
    error_message       TEXT,
    started_at          TIMESTAMPTZ(6),
    completed_at        TIMESTAMPTZ(6),
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.knowledge_base_ingestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_ingestion_job_tenant_isolation ON ai.knowledge_base_ingestion_jobs
    USING (
        knowledge_base_id IN (
            SELECT id FROM ai.knowledge_bases WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    )
    WITH CHECK (
        knowledge_base_id IN (
            SELECT id FROM ai.knowledge_bases WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    );

CREATE INDEX idx_kb_ingestion_jobs_tenant ON ai.knowledge_base_ingestion_jobs (tenant_id, status);
CREATE INDEX idx_kb_ingestion_jobs_kb ON ai.knowledge_base_ingestion_jobs (knowledge_base_id, status);
CREATE INDEX idx_kb_ingestion_jobs_document ON ai.knowledge_base_ingestion_jobs (document_id);

-- Updated at trigger
CREATE TRIGGER update_knowledge_base_ingestion_jobs_updated_at
    BEFORE UPDATE ON ai.knowledge_base_ingestion_jobs
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- RAG Query Logs (for observability and evaluation)
-- ============================================================
CREATE TABLE ai.rag_query_logs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    knowledge_base_id       UUID NOT NULL REFERENCES ai.knowledge_bases(id) ON DELETE CASCADE,
    user_id                 UUID,
    query_text              TEXT NOT NULL,
    query_embedding         vector(1536),
    retrieved_chunk_ids     UUID[],
    similarity_scores       REAL[],
    top_k                   INTEGER NOT NULL DEFAULT 5,
    similarity_threshold    REAL NOT NULL DEFAULT 0.7,
    response_generated      BOOLEAN NOT NULL DEFAULT false,
    response_text           TEXT,
    latency_ms              INTEGER,
    model_used              VARCHAR(100),
    created_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.rag_query_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY rag_query_log_tenant_isolation ON ai.rag_query_logs
    USING (
        knowledge_base_id IN (
            SELECT id FROM ai.knowledge_bases WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    )
    WITH CHECK (
        knowledge_base_id IN (
            SELECT id FROM ai.knowledge_bases WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    );

CREATE INDEX idx_rag_query_logs_tenant ON ai.rag_query_logs (tenant_id, created_at DESC);
CREATE INDEX idx_rag_query_logs_kb ON ai.rag_query_logs (knowledge_base_id, created_at DESC);

-- ============================================================
-- Grant Permissions
-- ============================================================
GRANT USAGE ON SCHEMA ai TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai TO CURRENT_USER;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA ai TO CURRENT_USER;