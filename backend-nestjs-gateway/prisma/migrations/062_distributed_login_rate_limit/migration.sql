CREATE TABLE iam.login_rate_limit_buckets (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  key_hash char(64) NOT NULL,
  window_started_at timestamptz NOT NULL,
  hit_count smallint NOT NULL CHECK (hit_count BETWEEN 1 AND 11),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key_hash)
);

CREATE INDEX ix_login_rate_limit_buckets_expiry
  ON iam.login_rate_limit_buckets (tenant_id, window_started_at);

CALL platform.enable_tenant_rls('iam', 'login_rate_limit_buckets');
