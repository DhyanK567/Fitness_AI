-- Operational Alerts Table
-- Phase 2: Operational Alerts for Admin AI

-- ============================================================
-- Operational Alerts Table
-- ============================================================
CREATE TABLE ai.operational_alerts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    alert_type          VARCHAR(50) NOT NULL, -- 'capacity', 'staffing', 'equipment', 'attendance', 'payment'
    severity            VARCHAR(20) NOT NULL, -- 'info', 'warning', 'critical'
    title               VARCHAR(300) NOT NULL,
    message             TEXT NOT NULL,
    source_entity_id    UUID,
    source_entity_type  VARCHAR(50),
    is_acknowledged     BOOLEAN NOT NULL DEFAULT false,
    acknowledged_by     UUID,
    acknowledged_at     TIMESTAMPTZ(6),
    resolution_notes    TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai.operational_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access alerts in their tenant
CREATE POLICY operational_alert_tenant_isolation ON ai.operational_alerts
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::UUID);

-- Indexes
CREATE INDEX idx_operational_alerts_tenant_acknowledged ON ai.operational_alerts (tenant_id, is_acknowledged);
CREATE INDEX idx_operational_alerts_tenant_severity ON ai.operational_alerts (tenant_id, severity);
CREATE INDEX idx_operational_alerts_tenant_alert_type ON ai.operational_alerts (tenant_id, alert_type);
CREATE INDEX idx_operational_alerts_tenant_created_at ON ai.operational_alerts (tenant_id, created_at DESC);

-- Updated at trigger
CREATE TRIGGER update_operational_alerts_updated_at
    BEFORE UPDATE ON ai.operational_alerts
    FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ai.operational_alerts TO CURRENT_USER;