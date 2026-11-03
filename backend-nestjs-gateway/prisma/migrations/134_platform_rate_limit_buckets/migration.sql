-- Migration: 134_platform_rate_limit_buckets
-- Creates platform-level rate limit buckets table for tenant-agnostic endpoints
-- No foreign key to platform.tenants, no RLS (platform schema)

CREATE TABLE platform.rate_limit_buckets (
  scope            text NOT NULL,
  key_hash         char(64) NOT NULL,
  window_started_at timestamptz NOT NULL,
  hit_count        integer NOT NULL CHECK (hit_count >= 1),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key_hash)
);

CREATE INDEX ix_rate_limit_buckets_expiry
  ON platform.rate_limit_buckets (scope, window_started_at);

-- Grant access to app runtime role
GRANT USAGE ON SCHEMA platform TO fitness_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.rate_limit_buckets TO fitness_app_runtime;

-- Cleanup function: removes buckets older than 1 day for a given scope
CREATE OR REPLACE FUNCTION platform.cleanup_rate_limit_buckets(p_scope text, p_retention_days int DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM platform.rate_limit_buckets
  WHERE scope = p_scope
    AND window_started_at < now() - (p_retention_days || ' days')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;