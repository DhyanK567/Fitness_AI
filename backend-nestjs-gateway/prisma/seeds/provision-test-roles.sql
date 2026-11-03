-- Test-Only Disposable Database Role Provisioning Fixture
-- STRICT SAFETY RULE:
-- This script is solely for provisioning unprivileged login roles in an isolated,
-- disposable test database (e.g. fitness_ai_test / fitness_ai_ci_test).
-- DO NOT RUN IN DEVELOPMENT, STAGING, OR PRODUCTION ENVIRONMENTS.

DO $$
BEGIN
  -- 1. Test Application User (inherits fitness_app_runtime)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_app_user') THEN
    CREATE ROLE test_app_user WITH LOGIN PASSWORD 'test_disposable_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
      IN ROLE fitness_app_runtime;
  END IF;

  -- 2. Test Webhook Ingest User (inherits fitness_webhook_ingest)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_ingest_user') THEN
    CREATE ROLE test_ingest_user WITH LOGIN PASSWORD 'test_disposable_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
      IN ROLE fitness_webhook_ingest;
  END IF;

  -- 3. Test Worker User (inherits fitness_worker_runtime)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_worker_user') THEN
    CREATE ROLE test_worker_user WITH LOGIN PASSWORD 'test_disposable_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
      IN ROLE fitness_worker_runtime;
  END IF;
END $$;
