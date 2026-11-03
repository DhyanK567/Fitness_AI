CREATE TABLE audit.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type varchar(12) NOT NULL CHECK (actor_type IN ('human', 'automation', 'ai', 'agent', 'system')),
  actor_id uuid,
  action varchar(60) NOT NULL,
  resource_type varchar(60) NOT NULL,
  resource_ref varchar(140) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  reason text,
  request_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL,
  prev_hash char(64),
  row_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_logs_tenant_time ON audit.audit_logs (tenant_id, occurred_at DESC);

CREATE TABLE audit.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type varchar(100) NOT NULL,
  severity varchar(20) NOT NULL CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  actor_id uuid,
  correlation_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_security_events_tenant_time ON audit.security_events (tenant_id, occurred_at DESC);

CREATE FUNCTION audit.forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN RAISE EXCEPTION 'audit tables are append-only'; END $$;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit.audit_logs
FOR EACH ROW EXECUTE FUNCTION audit.forbid_mutation();
CREATE TRIGGER trg_security_events_immutable
BEFORE UPDATE OR DELETE ON audit.security_events
FOR EACH ROW EXECUTE FUNCTION audit.forbid_mutation();

CALL platform.enable_tenant_rls('audit', 'audit_logs');
CALL platform.enable_tenant_rls('audit', 'security_events');
