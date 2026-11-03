-- Security events can occur before a tenant can be resolved (for example,
-- malformed tenant hosts). Such rows are insertable but never visible to a
-- tenant-scoped query. Tenant-bound events retain the normal RLS policy.
ALTER TABLE audit.security_events
  ALTER COLUMN tenant_id DROP NOT NULL;

-- Retain signals even when the tenant record is later removed. Identify the
-- tenant FK by its constrained column instead of relying on a generated name.
DO $$
DECLARE tenant_fk_name text;
BEGIN
  SELECT constraint_row.conname INTO tenant_fk_name
  FROM pg_constraint AS constraint_row
  JOIN pg_attribute AS tenant_column
    ON tenant_column.attrelid = constraint_row.conrelid
   AND tenant_column.attnum = ANY (constraint_row.conkey)
  WHERE constraint_row.conrelid = 'audit.security_events'::regclass
    AND constraint_row.contype = 'f'
    AND tenant_column.attname = 'tenant_id';

  IF tenant_fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE audit.security_events DROP CONSTRAINT %I', tenant_fk_name);
  END IF;
END;
$$;

ALTER TABLE audit.security_events
  ADD COLUMN ip_address inet,
  ADD COLUMN route varchar(200);

CREATE INDEX ix_security_events_tenant_type_time
  ON audit.security_events (tenant_id, event_type, occurred_at DESC);
CREATE INDEX ix_security_events_ip_time
  ON audit.security_events (ip_address, occurred_at DESC);

DROP POLICY tenant_isolation ON audit.security_events;
CREATE POLICY tenant_isolation ON audit.security_events
  USING (tenant_id = platform.current_tenant())
  WITH CHECK (tenant_id = platform.current_tenant() OR tenant_id IS NULL);
