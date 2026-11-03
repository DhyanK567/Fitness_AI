-- Migration: 131_current_tenant_runtime_grants
-- Description: Explicitly grant EXECUTE permissions on platform.current_tenant() to runtime roles.
-- Context: Migration 130 revoked default PUBLIC privileges on all functions in schema 'platform'.
-- Because kernel RLS policies rely on platform.current_tenant(), non-superuser application
-- and worker roles require explicit EXECUTE grants on platform.current_tenant().

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_app_runtime') THEN
    GRANT EXECUTE ON FUNCTION platform.current_tenant() TO fitness_app_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_worker_runtime') THEN
    GRANT EXECUTE ON FUNCTION platform.current_tenant() TO fitness_worker_runtime;
  END IF;
END $$;
