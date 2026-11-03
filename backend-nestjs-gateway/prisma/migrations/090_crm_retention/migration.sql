-- CRM Agent & Retention Agent Models Migration
-- Phase 3: Lead Scoring, Pipeline Management, Campaigns
-- Phase 4: Churn Prediction, Engagement Scoring, Win-back Campaigns

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CRM Agent Tables
-- ============================================================

-- Lead Scores Table
CREATE TABLE ai.lead_scores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    lead_id             UUID NOT NULL,
    score               INTEGER NOT NULL,
    score_breakdown     JSONB NOT NULL,
    model_version       VARCHAR(50) NOT NULL,
    factors             JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.lead_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_score_tenant_isolation ON ai.lead_scores
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE UNIQUE INDEX idx_lead_scores_tenant_lead ON ai.lead_scores (tenant_id, lead_id);
CREATE INDEX idx_lead_scores_tenant_score ON ai.lead_scores (tenant_id, score);
CREATE INDEX idx_lead_scores_tenant_created ON ai.lead_scores (tenant_id, created_at DESC);

-- Updated at trigger
CREATE TRIGGER update_lead_scores_updated_at
    BEFORE UPDATE ON ai.lead_scores
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Pipeline Stages Table
-- ============================================================
CREATE TABLE ai.pipeline_stages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    name                VARCHAR(100) NOT NULL,
    display_name        VARCHAR(100) NOT NULL,
    stage_order         INTEGER NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    is_default          BOOLEAN NOT NULL DEFAULT false,
    win_probability     INTEGER NOT NULL DEFAULT 0,
    sla_days            INTEGER,
    color               VARCHAR(7),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_stage_tenant_isolation ON ai.pipeline_stages
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE UNIQUE INDEX idx_pipeline_stages_tenant_name ON ai.pipeline_stages (tenant_id, name);
CREATE INDEX idx_pipeline_stages_tenant_order ON ai.pipeline_stages (tenant_id, stage_order);

CREATE TRIGGER update_pipeline_stages_updated_at
    BEFORE UPDATE ON ai.pipeline_stages
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Pipeline Entries Table
-- ============================================================
CREATE TABLE ai.pipeline_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    lead_id             UUID NOT NULL,
    stage_id            UUID NOT NULL REFERENCES ai.pipeline_stages(id),
    entered_at          TIMESTAMPTZ(6) NOT NULL,
    exited_at           TIMESTAMPTZ(6),
    assigned_to         UUID,
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.pipeline_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_entry_tenant_isolation ON ai.pipeline_entries
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE UNIQUE INDEX idx_pipeline_entries_tenant_lead_stage ON ai.pipeline_entries (tenant_id, lead_id, stage_id, entered_at);
CREATE INDEX idx_pipeline_entries_tenant_lead ON ai.pipeline_entries (tenant_id, lead_id);
CREATE INDEX idx_pipeline_entries_tenant_stage ON ai.pipeline_entries (tenant_id, stage_id);
CREATE INDEX idx_pipeline_entries_tenant_assigned ON ai.pipeline_entries (tenant_id, assigned_to);

CREATE TRIGGER update_pipeline_entries_updated_at
    BEFORE UPDATE ON ai.pipeline_entries
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- CRM Campaigns Table
-- ============================================================
CREATE TABLE ai.crm_campaigns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    campaign_type       VARCHAR(40) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'draft',
    target_segment      JSONB NOT NULL,
    trigger_config      JSONB NOT NULL,
    schedule_config     JSONB,
    goals               JSONB NOT NULL DEFAULT '{}',
    created_by          UUID NOT NULL,
    started_at          TIMESTAMPTZ(6),
    ended_at            TIMESTAMPTZ(6),
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.crm_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_campaign_tenant_isolation ON ai.crm_campaigns
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE INDEX idx_crm_campaigns_tenant_status ON ai.crm_campaigns (tenant_id, status);
CREATE INDEX idx_crm_campaigns_tenant_type ON ai.crm_campaigns (tenant_id, campaign_type);

CREATE TRIGGER update_crm_campaigns_updated_at
    BEFORE UPDATE ON ai.crm_campaigns
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Campaign Enrollments Table
-- ============================================================
CREATE TABLE ai.campaign_enrollments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    campaign_id         UUID NOT NULL REFERENCES ai.crm_campaigns(id) ON DELETE CASCADE,
    lead_id             UUID,
    member_id           UUID,
    status              VARCHAR(20) NOT NULL DEFAULT 'enrolled',
    enrolled_at         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    converted_at        TIMESTAMPTZ(6),
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.campaign_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaign_enrollment_tenant_isolation ON ai.campaign_enrollments
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE UNIQUE INDEX idx_campaign_enrollments_tenant_campaign_lead_member ON ai.campaign_enrollments (tenant_id, campaign_id, lead_id, member_id);
CREATE INDEX idx_campaign_enrollments_tenant_campaign ON ai.campaign_enrollments (tenant_id, campaign_id);
CREATE INDEX idx_campaign_enrollments_tenant_lead ON ai.campaign_enrollments (tenant_id, lead_id);
CREATE INDEX idx_campaign_enrollments_tenant_member ON ai.campaign_enrollments (tenant_id, member_id);
CREATE INDEX idx_campaign_enrollments_tenant_status ON ai.campaign_enrollments (tenant_id, status);

CREATE TRIGGER update_campaign_enrollments_updated_at
    BEFORE UPDATE ON ai.campaign_enrollments
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Retention Agent Tables
-- ============================================================

-- Churn Risks Table
CREATE TABLE ai.churn_risks (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    member_id               UUID NOT NULL,
    risk_score              INTEGER NOT NULL,
    risk_level              VARCHAR(20) NOT NULL,
    risk_factors            JSONB NOT NULL,
    predicted_churn_date    TIMESTAMPTZ(6),
    model_version           VARCHAR(50) NOT NULL,
    last_calculated_at      TIMESTAMPTZ(6) NOT NULL,
    created_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.churn_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY churn_risk_tenant_isolation ON ai.churn_risks
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE UNIQUE INDEX idx_churn_risks_tenant_member ON ai.churn_risks (tenant_id, member_id);
CREATE INDEX idx_churn_risks_tenant_level ON ai.churn_risks (tenant_id, risk_level);
CREATE INDEX idx_churn_risks_tenant_score ON ai.churn_risks (tenant_id, risk_score);
CREATE INDEX idx_churn_risks_tenant_calculated ON ai.churn_risks (tenant_id, last_calculated_at DESC);

CREATE TRIGGER update_churn_risks_updated_at
    BEFORE UPDATE ON ai.churn_risks
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Engagement Scores Table
-- ============================================================
CREATE TABLE ai.engagement_scores (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    member_id               UUID NOT NULL,
    overall_score           INTEGER NOT NULL,
    attendance_score        INTEGER NOT NULL,
    frequency_score         INTEGER NOT NULL,
    recency_score           INTEGER NOT NULL,
    monetary_score          INTEGER NOT NULL,
    feedback_score          INTEGER NOT NULL,
    referral_score          INTEGER NOT NULL,
    factor_breakdown        JSONB NOT NULL,
    trend                   VARCHAR(20) NOT NULL,
    last_calculated_at      TIMESTAMPTZ(6) NOT NULL,
    created_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.engagement_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY engagement_score_tenant_isolation ON ai.engagement_scores
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE UNIQUE INDEX idx_engagement_scores_tenant_member ON ai.engagement_scores (tenant_id, member_id);
CREATE INDEX idx_engagement_scores_tenant_overall ON ai.engagement_scores (tenant_id, overall_score);
CREATE INDEX idx_engagement_scores_tenant_trend ON ai.engagement_scores (tenant_id, trend);
CREATE INDEX idx_engagement_scores_tenant_calculated ON ai.engagement_scores (tenant_id, last_calculated_at DESC);

CREATE TRIGGER update_engagement_scores_updated_at
    BEFORE UPDATE ON ai.engagement_scores
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Winback Campaigns Table
-- ============================================================
CREATE TABLE ai.winback_campaigns (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    name                    VARCHAR(200) NOT NULL,
    description             TEXT,
    trigger_type            VARCHAR(40) NOT NULL,
    target_criteria         JSONB NOT NULL,
    message_template        TEXT NOT NULL,
    channel                 VARCHAR(20) NOT NULL,
    incentive_config        JSONB,
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft',
    sent_count              INTEGER NOT NULL DEFAULT 0,
    opened_count            INTEGER NOT NULL DEFAULT 0,
    clicked_count           INTEGER NOT NULL DEFAULT 0,
    converted_count         INTEGER NOT NULL DEFAULT 0,
    created_by              UUID NOT NULL,
    started_at              TIMESTAMPTZ(6),
    ended_at                TIMESTAMPTZ(6),
    created_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.winback_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY winback_campaign_tenant_isolation ON ai.winback_campaigns
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE INDEX idx_winback_campaigns_tenant_status ON ai.winback_campaigns (tenant_id, status);
CREATE INDEX idx_winback_campaigns_tenant_trigger ON ai.winback_campaigns (tenant_id, trigger_type);

CREATE TRIGGER update_winback_campaigns_updated_at
    BEFORE UPDATE ON ai.winback_campaigns
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Winback Recipients Table
-- ============================================================
CREATE TABLE ai.winback_recipients (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    campaign_id             UUID NOT NULL REFERENCES ai.winback_campaigns(id) ON DELETE CASCADE,
    member_id               UUID NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at                 TIMESTAMPTZ(6),
    opened_at               TIMESTAMPTZ(6),
    clicked_at              TIMESTAMPTZ(6),
    converted_at            TIMESTAMPTZ(6),
    error_message           TEXT,
    metadata                JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.winback_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY winback_recipient_tenant_isolation ON ai.winback_recipients
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE UNIQUE INDEX idx_winback_recipients_tenant_campaign_member ON ai.winback_recipients (tenant_id, campaign_id, member_id);
CREATE INDEX idx_winback_recipients_tenant_campaign ON ai.winback_recipients (tenant_id, campaign_id);
CREATE INDEX idx_winback_recipients_tenant_member ON ai.winback_recipients (tenant_id, member_id);
CREATE INDEX idx_winback_recipients_tenant_status ON ai.winback_recipients (tenant_id, status);

CREATE TRIGGER update_winback_recipients_updated_at
    BEFORE UPDATE ON ai.winback_recipients
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Retention Actions Table
-- ============================================================
CREATE TABLE ai.retention_actions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    member_id               UUID NOT NULL,
    action_type             VARCHAR(40) NOT NULL,
    description             TEXT NOT NULL,
    triggered_by            VARCHAR(40) NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
    assigned_to             UUID,
    due_at                  TIMESTAMPTZ(6),
    completed_at            TIMESTAMPTZ(6),
    result                  TEXT,
    metadata                JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.retention_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY retention_action_tenant_isolation ON ai.retention_actions
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

CREATE INDEX idx_retention_actions_tenant_member ON ai.retention_actions (tenant_id, member_id);
CREATE INDEX idx_retention_actions_tenant_type ON ai.retention_actions (tenant_id, action_type);
CREATE INDEX idx_retention_actions_tenant_status ON ai.retention_actions (tenant_id, status);
CREATE INDEX idx_retention_actions_tenant_due ON ai.retention_actions (tenant_id, due_at);

CREATE TRIGGER update_retention_actions_updated_at
    BEFORE UPDATE ON ai.retention_actions
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- ============================================================
-- Grant Permissions
-- ============================================================
GRANT USAGE ON SCHEMA ai TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai TO CURRENT_USER;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA ai TO CURRENT_USER;