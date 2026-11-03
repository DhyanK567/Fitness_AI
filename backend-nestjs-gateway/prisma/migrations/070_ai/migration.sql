-- AI Schema and Tables for Admin AI (Studio Copilot)
-- Phase 1: Conversations, Messages, Pending Actions

-- Create AI schema
CREATE SCHEMA IF NOT EXISTS ai;

-- Enable RLS on AI schema
ALTER SCHEMA ai OWNER TO CURRENT_USER;

-- ============================================================
-- Conversations Table
-- ============================================================
CREATE TABLE ai.conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    user_id         UUID NOT NULL,
    title           VARCHAR(200),
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    archived_at     TIMESTAMPTZ(6)
);

-- Enable RLS
ALTER TABLE ai.conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access conversations in their tenant
CREATE POLICY conversation_tenant_isolation ON ai.conversations
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

-- Indexes
CREATE INDEX idx_conversations_tenant_user ON ai.conversations (tenant_id, user_id);
CREATE INDEX idx_conversations_tenant_status ON ai.conversations (tenant_id, status);
CREATE INDEX idx_conversations_created_at ON ai.conversations (created_at DESC);

-- Updated at trigger
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON ai.conversations
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Messages Table
-- ============================================================
CREATE TABLE ai.messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    conversation_id UUID NOT NULL REFERENCES ai.conversations(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content         TEXT NOT NULL,
    tool_calls      JSONB,
    tool_results    JSONB,
    metadata        JSONB NOT NULL DEFAULT '{}',
    token_count     INTEGER,
    created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Messages inherit tenant from conversation
CREATE POLICY message_tenant_isolation ON ai.messages
    USING (
        conversation_id IN (
            SELECT id FROM ai.conversations WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    )
    WITH CHECK (
        conversation_id IN (
            SELECT id FROM ai.conversations WHERE tenant_id = current_setting('app.current_tenant', true)::UUID
        )
    );

-- Indexes
CREATE INDEX idx_messages_conversation_created ON ai.messages (conversation_id, created_at);
CREATE INDEX idx_messages_tenant_created ON ai.messages (tenant_id, created_at DESC);

-- ============================================================
-- Pending Actions Table
-- ============================================================
CREATE TABLE ai.pending_actions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    user_id             UUID NOT NULL,
    conversation_id     UUID REFERENCES ai.conversations(id) ON DELETE SET NULL,
    action_type         VARCHAR(60) NOT NULL,
    payload             JSONB NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired', 'cancelled')),
    confirm_token       VARCHAR(64),
    idempotency_key     VARCHAR(64) UNIQUE,
    summary             VARCHAR(500),
    proposed_by         UUID NOT NULL,
    approved_by         UUID,
    rejected_by         UUID,
    executed_by         UUID,
    executed_at         TIMESTAMPTZ(6),
    rejection_reason    TEXT,
    result              JSONB,
    error               TEXT,
    expires_at          TIMESTAMPTZ(6) NOT NULL,
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.pending_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access pending actions in their tenant
CREATE POLICY pending_action_tenant_isolation ON ai.pending_actions
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

-- Indexes
CREATE INDEX idx_pending_actions_tenant_status ON ai.pending_actions (tenant_id, status);
CREATE INDEX idx_pending_actions_tenant_user ON ai.pending_actions (tenant_id, user_id);
CREATE INDEX idx_pending_actions_conversation ON ai.pending_actions (conversation_id);
CREATE INDEX idx_pending_actions_expires_at ON ai.pending_actions (expires_at) WHERE status = 'proposed';
CREATE INDEX idx_pending_actions_idempotency ON ai.pending_actions (idempotency_key);

-- Updated at trigger
CREATE TRIGGER update_pending_actions_updated_at
    BEFORE UPDATE ON ai.pending_actions
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Helper Function for RLS
-- ============================================================
-- This function should be called by the application to set the tenant context
-- Example: SELECT set_ai_tenant_context('tenant-uuid-here');
CREATE OR REPLACE FUNCTION ai.set_tenant_context(p_tenant_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.current_tenant', p_tenant_id::text, true);
END;
$$;

-- ============================================================
-- Audit Trigger for Pending Actions
-- ============================================================
CREATE OR REPLACE FUNCTION ai.audit_pending_action_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit.audit_logs (
            tenant_id, occurred_at, actor_type, actor_id, action, resource_type, resource_ref,
            after_data, correlation_id
        ) VALUES (
            NEW.tenant_id, now(), 'ai', NEW.user_id, 'pending_action.proposed', 'pending_action', NEW.id::text,
            to_jsonb(NEW), NEW.id
        );
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit.audit_logs (
            tenant_id, occurred_at, actor_type, actor_id, action, resource_type, resource_ref,
            before_data, after_data, correlation_id
        ) VALUES (
            NEW.tenant_id, now(), 'ai', COALESCE(NEW.approved_by, NEW.rejected_by, NEW.executed_by, NEW.user_id),
            'pending_action.' || NEW.status, 'pending_action', NEW.id::text,
            to_jsonb(OLD), to_jsonb(NEW), NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER audit_pending_actions
    AFTER INSERT OR UPDATE ON ai.pending_actions
    FOR EACH ROW EXECUTE FUNCTION ai.audit_pending_action_changes();

-- ============================================================
-- LLM Call Metrics Table
-- ============================================================
CREATE TABLE ai.llm_call_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    user_id         UUID NOT NULL,
    correlation_id  UUID NOT NULL,
    provider        VARCHAR(50) NOT NULL,
    model           VARCHAR(100) NOT NULL,
    latency_ms      INTEGER NOT NULL,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    total_tokens    INTEGER NOT NULL DEFAULT 0,
    tool_calls_count INTEGER NOT NULL DEFAULT 0,
    success         BOOLEAN NOT NULL,
    error_code      VARCHAR(50),
    error_message   TEXT,
    timestamp       TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.llm_call_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY llm_call_metrics_tenant_isolation ON ai.llm_call_metrics
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE INDEX idx_llm_call_metrics_tenant_timestamp ON ai.llm_call_metrics (tenant_id, timestamp DESC);
CREATE INDEX idx_llm_call_metrics_correlation ON ai.llm_call_metrics (correlation_id);
CREATE INDEX idx_llm_call_metrics_provider_model ON ai.llm_call_metrics (provider, model);

-- ============================================================
-- Tool Call Metrics Table
-- ============================================================
CREATE TABLE ai.tool_call_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    user_id         UUID NOT NULL,
    correlation_id  UUID NOT NULL,
    tool_name       VARCHAR(100) NOT NULL,
    latency_ms      INTEGER NOT NULL,
    success         BOOLEAN NOT NULL,
    error_code      VARCHAR(50),
    error_message   TEXT,
    timestamp       TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

ALTER TABLE ai.tool_call_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY tool_call_metrics_tenant_isolation ON ai.tool_call_metrics
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE INDEX idx_tool_call_metrics_tenant_timestamp ON ai.tool_call_metrics (tenant_id, timestamp DESC);
CREATE INDEX idx_tool_call_metrics_correlation ON ai.tool_call_metrics (correlation_id);
CREATE INDEX idx_tool_call_metrics_tool_name ON ai.tool_call_metrics (tool_name);

-- ============================================================
-- Pending Action Metrics Table
-- ============================================================
CREATE TABLE ai.pending_action_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    user_id         UUID NOT NULL,
    correlation_id  UUID NOT NULL,
    action_type     VARCHAR(60) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    duration_ms     INTEGER NOT NULL,
    timestamp       TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

ALTER TABLE ai.pending_action_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_action_metrics_tenant_isolation ON ai.pending_action_metrics
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE INDEX idx_pending_action_metrics_tenant_timestamp ON ai.pending_action_metrics (tenant_id, timestamp DESC);
CREATE INDEX idx_pending_action_metrics_correlation ON ai.pending_action_metrics (correlation_id);
CREATE INDEX idx_pending_action_metrics_action_type ON ai.pending_action_metrics (action_type);

-- ============================================================
-- Updated at triggers
-- ============================================================
-- (Using platform.set_updated_at() function from bootstrap)

-- ============================================================
-- Grant Permissions
-- ============================================================
GRANT USAGE ON SCHEMA ai TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai TO CURRENT_USER;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA ai TO CURRENT_USER;