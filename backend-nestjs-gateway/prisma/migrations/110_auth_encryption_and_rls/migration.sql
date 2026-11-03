-- ============================================================
-- 110: TOTP secret encryption column + outbox backoff + RLS fix
--
--  * Widen iam.user_totp.secret to varchar(255) for the versioned AES-256-GCM envelope.
--  * Add ops.outbox_events.next_attempt_at for retry backoff and index on (status, next_attempt_at).
--  * Unify platform.current_tenant() to check both 'app.tenant_id' (canonical)
--    and 'app.current_tenant' (legacy ai/crm), failing closed when neither is set.
--  * Recreate RLS policies in the ai schema using platform.current_tenant(),
--    preserving exact policy names, fail-closed security, and relational
--    integrity checks (conversation_id and knowledge_base_id subqueries).
--
-- Deliberately does NOT edit migrations 070/080/090 (already applied elsewhere).
-- ============================================================

-- 1. Widen iam.user_totp.secret for AES-256-GCM envelope
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'iam' AND table_name = 'user_totp' AND column_name = 'secret'
  ) THEN
    ALTER TABLE iam.user_totp ALTER COLUMN secret TYPE varchar(255);
  END IF;
END $$;

-- 2. Outbox retry scheduling column & index
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'ops' AND table_name = 'outbox_events'
  ) THEN
    ALTER TABLE ops.outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz DEFAULT now();
    CREATE INDEX IF NOT EXISTS ix_outbox_events_status_next_attempt
      ON ops.outbox_events (status, next_attempt_at);
  END IF;
END $$;

-- 3. Unify tenant resolution helper to fail-closed on unset context
CREATE OR REPLACE FUNCTION platform.current_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, NULLIF(current_setting('app.current_tenant', true), '')::uuid) $$;

-- Update ai schema tenant helper to set both canonical and legacy session variables
CREATE OR REPLACE FUNCTION ai.set_tenant_context(p_tenant_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
    PERFORM set_config('app.current_tenant', p_tenant_id::text, true);
END;
$$;

-- 4. Recreate RLS policies in schema 'ai' preserving policy names and relational checks
DO $$
BEGIN
  -- -------------------------------------------------------------------------
  -- ai.conversations (070_ai)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'conversations') THEN
    ALTER TABLE ai.conversations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.conversations FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS conversation_tenant_isolation ON ai.conversations;
    DROP POLICY IF EXISTS tenant_isolation ON ai.conversations;
    CREATE POLICY conversation_tenant_isolation ON ai.conversations
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.messages (070_ai) - Preserves conversation_id foreign tenant check
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'messages') THEN
    ALTER TABLE ai.messages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.messages FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS message_tenant_isolation ON ai.messages;
    DROP POLICY IF EXISTS tenant_isolation ON ai.messages;
    CREATE POLICY message_tenant_isolation ON ai.messages
      USING (
        tenant_id = platform.current_tenant()
        AND conversation_id IN (
          SELECT id FROM ai.conversations WHERE tenant_id = platform.current_tenant()
        )
      )
      WITH CHECK (
        tenant_id = platform.current_tenant()
        AND conversation_id IN (
          SELECT id FROM ai.conversations WHERE tenant_id = platform.current_tenant()
        )
      );
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.pending_actions (070_ai)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'pending_actions') THEN
    ALTER TABLE ai.pending_actions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.pending_actions FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS pending_action_tenant_isolation ON ai.pending_actions;
    DROP POLICY IF EXISTS tenant_isolation ON ai.pending_actions;
    CREATE POLICY pending_action_tenant_isolation ON ai.pending_actions
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.llm_call_metrics (070_ai)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'llm_call_metrics') THEN
    ALTER TABLE ai.llm_call_metrics ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.llm_call_metrics FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS llm_call_metrics_tenant_isolation ON ai.llm_call_metrics;
    DROP POLICY IF EXISTS tenant_isolation ON ai.llm_call_metrics;
    CREATE POLICY llm_call_metrics_tenant_isolation ON ai.llm_call_metrics
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.tool_call_metrics (070_ai)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'tool_call_metrics') THEN
    ALTER TABLE ai.tool_call_metrics ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.tool_call_metrics FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tool_call_metrics_tenant_isolation ON ai.tool_call_metrics;
    DROP POLICY IF EXISTS tenant_isolation ON ai.tool_call_metrics;
    CREATE POLICY tool_call_metrics_tenant_isolation ON ai.tool_call_metrics
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.pending_action_metrics (070_ai)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'pending_action_metrics') THEN
    ALTER TABLE ai.pending_action_metrics ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.pending_action_metrics FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS pending_action_metrics_tenant_isolation ON ai.pending_action_metrics;
    DROP POLICY IF EXISTS tenant_isolation ON ai.pending_action_metrics;
    CREATE POLICY pending_action_metrics_tenant_isolation ON ai.pending_action_metrics
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.knowledge_bases (080_rag_knowledge_base)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'knowledge_bases') THEN
    ALTER TABLE ai.knowledge_bases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.knowledge_bases FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS knowledge_base_tenant_isolation ON ai.knowledge_bases;
    DROP POLICY IF EXISTS tenant_isolation ON ai.knowledge_bases;
    CREATE POLICY knowledge_base_tenant_isolation ON ai.knowledge_bases
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.knowledge_base_documents (080_rag_knowledge_base) - Preserves KB tenant check
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'knowledge_base_documents') THEN
    ALTER TABLE ai.knowledge_base_documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.knowledge_base_documents FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS kb_document_tenant_isolation ON ai.knowledge_base_documents;
    DROP POLICY IF EXISTS tenant_isolation ON ai.knowledge_base_documents;
    CREATE POLICY kb_document_tenant_isolation ON ai.knowledge_base_documents
      USING (
        tenant_id = platform.current_tenant()
        AND knowledge_base_id IN (
          SELECT id FROM ai.knowledge_bases WHERE tenant_id = platform.current_tenant()
        )
      )
      WITH CHECK (
        tenant_id = platform.current_tenant()
        AND knowledge_base_id IN (
          SELECT id FROM ai.knowledge_bases WHERE tenant_id = platform.current_tenant()
        )
      );
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.knowledge_chunks (080_rag_knowledge_base) - Preserves KB tenant check
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'knowledge_chunks') THEN
    ALTER TABLE ai.knowledge_chunks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.knowledge_chunks FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS kb_chunk_tenant_isolation ON ai.knowledge_chunks;
    DROP POLICY IF EXISTS tenant_isolation ON ai.knowledge_chunks;
    CREATE POLICY kb_chunk_tenant_isolation ON ai.knowledge_chunks
      USING (
        tenant_id = platform.current_tenant()
        AND knowledge_base_id IN (
          SELECT id FROM ai.knowledge_bases WHERE tenant_id = platform.current_tenant()
        )
      )
      WITH CHECK (
        tenant_id = platform.current_tenant()
        AND knowledge_base_id IN (
          SELECT id FROM ai.knowledge_bases WHERE tenant_id = platform.current_tenant()
        )
      );
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.knowledge_base_ingestion_jobs (080_rag_knowledge_base) - Preserves KB tenant check
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'knowledge_base_ingestion_jobs') THEN
    ALTER TABLE ai.knowledge_base_ingestion_jobs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.knowledge_base_ingestion_jobs FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS kb_ingestion_job_tenant_isolation ON ai.knowledge_base_ingestion_jobs;
    DROP POLICY IF EXISTS tenant_isolation ON ai.knowledge_base_ingestion_jobs;
    CREATE POLICY kb_ingestion_job_tenant_isolation ON ai.knowledge_base_ingestion_jobs
      USING (
        tenant_id = platform.current_tenant()
        AND knowledge_base_id IN (
          SELECT id FROM ai.knowledge_bases WHERE tenant_id = platform.current_tenant()
        )
      )
      WITH CHECK (
        tenant_id = platform.current_tenant()
        AND knowledge_base_id IN (
          SELECT id FROM ai.knowledge_bases WHERE tenant_id = platform.current_tenant()
        )
      );
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.rag_query_logs (080_rag_knowledge_base) - Preserves KB tenant check
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'rag_query_logs') THEN
    ALTER TABLE ai.rag_query_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.rag_query_logs FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rag_query_log_tenant_isolation ON ai.rag_query_logs;
    DROP POLICY IF EXISTS tenant_isolation ON ai.rag_query_logs;
    CREATE POLICY rag_query_log_tenant_isolation ON ai.rag_query_logs
      USING (
        tenant_id = platform.current_tenant()
        AND knowledge_base_id IN (
          SELECT id FROM ai.knowledge_bases WHERE tenant_id = platform.current_tenant()
        )
      )
      WITH CHECK (
        tenant_id = platform.current_tenant()
        AND knowledge_base_id IN (
          SELECT id FROM ai.knowledge_bases WHERE tenant_id = platform.current_tenant()
        )
      );
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.lead_scores (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'lead_scores') THEN
    ALTER TABLE ai.lead_scores ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.lead_scores FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS lead_score_tenant_isolation ON ai.lead_scores;
    DROP POLICY IF EXISTS tenant_isolation ON ai.lead_scores;
    CREATE POLICY lead_score_tenant_isolation ON ai.lead_scores
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.pipeline_stages (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'pipeline_stages') THEN
    ALTER TABLE ai.pipeline_stages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.pipeline_stages FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS pipeline_stage_tenant_isolation ON ai.pipeline_stages;
    DROP POLICY IF EXISTS tenant_isolation ON ai.pipeline_stages;
    CREATE POLICY pipeline_stage_tenant_isolation ON ai.pipeline_stages
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.pipeline_entries (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'pipeline_entries') THEN
    ALTER TABLE ai.pipeline_entries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.pipeline_entries FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS pipeline_entry_tenant_isolation ON ai.pipeline_entries;
    DROP POLICY IF EXISTS tenant_isolation ON ai.pipeline_entries;
    CREATE POLICY pipeline_entry_tenant_isolation ON ai.pipeline_entries
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.crm_campaigns (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'crm_campaigns') THEN
    ALTER TABLE ai.crm_campaigns ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.crm_campaigns FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS crm_campaign_tenant_isolation ON ai.crm_campaigns;
    DROP POLICY IF EXISTS tenant_isolation ON ai.crm_campaigns;
    CREATE POLICY crm_campaign_tenant_isolation ON ai.crm_campaigns
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.campaign_enrollments (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'campaign_enrollments') THEN
    ALTER TABLE ai.campaign_enrollments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.campaign_enrollments FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS campaign_enrollment_tenant_isolation ON ai.campaign_enrollments;
    DROP POLICY IF EXISTS tenant_isolation ON ai.campaign_enrollments;
    CREATE POLICY campaign_enrollment_tenant_isolation ON ai.campaign_enrollments
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.churn_risks (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'churn_risks') THEN
    ALTER TABLE ai.churn_risks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.churn_risks FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS churn_risk_tenant_isolation ON ai.churn_risks;
    DROP POLICY IF EXISTS tenant_isolation ON ai.churn_risks;
    CREATE POLICY churn_risk_tenant_isolation ON ai.churn_risks
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.engagement_scores (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'engagement_scores') THEN
    ALTER TABLE ai.engagement_scores ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.engagement_scores FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS engagement_score_tenant_isolation ON ai.engagement_scores;
    DROP POLICY IF EXISTS tenant_isolation ON ai.engagement_scores;
    CREATE POLICY engagement_score_tenant_isolation ON ai.engagement_scores
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.winback_campaigns (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'winback_campaigns') THEN
    ALTER TABLE ai.winback_campaigns ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.winback_campaigns FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS winback_campaign_tenant_isolation ON ai.winback_campaigns;
    DROP POLICY IF EXISTS tenant_isolation ON ai.winback_campaigns;
    CREATE POLICY winback_campaign_tenant_isolation ON ai.winback_campaigns
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.winback_recipients (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'winback_recipients') THEN
    ALTER TABLE ai.winback_recipients ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.winback_recipients FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS winback_recipient_tenant_isolation ON ai.winback_recipients;
    DROP POLICY IF EXISTS tenant_isolation ON ai.winback_recipients;
    CREATE POLICY winback_recipient_tenant_isolation ON ai.winback_recipients
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

  -- -------------------------------------------------------------------------
  -- ai.retention_actions (090_crm_retention)
  -- -------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'ai' AND tablename = 'retention_actions') THEN
    ALTER TABLE ai.retention_actions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ai.retention_actions FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS retention_action_tenant_isolation ON ai.retention_actions;
    DROP POLICY IF EXISTS tenant_isolation ON ai.retention_actions;
    CREATE POLICY retention_action_tenant_isolation ON ai.retention_actions
      USING (tenant_id = platform.current_tenant())
      WITH CHECK (tenant_id = platform.current_tenant());
  END IF;

END $$;
