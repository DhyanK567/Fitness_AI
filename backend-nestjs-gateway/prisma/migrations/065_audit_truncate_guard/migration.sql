-- Row-level UPDATE/DELETE triggers do not run for TRUNCATE. Reject it explicitly
-- so append-only audit guarantees also cover accidental or overly broad grants.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit.audit_logs FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit.security_events FROM PUBLIC;

-- app_rw is provisioned by the database environment, not by an application migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit.audit_logs FROM app_rw';
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit.security_events FROM app_rw';
  END IF;
END;
$$;

CREATE TRIGGER trg_audit_logs_no_truncate
BEFORE TRUNCATE ON audit.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION audit.forbid_mutation();

CREATE TRIGGER trg_security_events_no_truncate
BEFORE TRUNCATE ON audit.security_events
FOR EACH STATEMENT EXECUTE FUNCTION audit.forbid_mutation();
