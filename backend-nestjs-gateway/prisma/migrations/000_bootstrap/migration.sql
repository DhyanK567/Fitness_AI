CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS config;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE FUNCTION platform.current_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE FUNCTION platform.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE PROCEDURE platform.add_updated_at_trigger(p_schema text, p_table text)
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform.set_updated_at()', p_schema, p_table);
END;
$$;

CREATE PROCEDURE platform.enable_tenant_rls(p_schema text, p_table text)
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', p_schema, p_table);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (tenant_id = platform.current_tenant()) WITH CHECK (tenant_id = platform.current_tenant())', p_schema, p_table);
END;
$$;
