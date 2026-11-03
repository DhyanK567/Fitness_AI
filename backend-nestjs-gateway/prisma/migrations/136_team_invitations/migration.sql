CREATE TABLE iam.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  email varchar(254) NOT NULL,
  full_name varchar(160) NOT NULL,
  phone varchar(20) NOT NULL,
  role varchar(40) NOT NULL CHECK (role IN ('front_desk', 'staff', 'trainer', 'admin')),
  token_hash char(64) NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  totp_secret varchar(255),
  recovery_code_hashes jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_team_invitation_lifecycle CHECK (
    (status = 'accepted' AND accepted_at IS NOT NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
    OR status IN ('pending', 'expired')
  )
);

CREATE INDEX ix_team_invitations_tenant ON iam.team_invitations (tenant_id);
CREATE INDEX ix_team_invitations_tenant_status ON iam.team_invitations (tenant_id, status);
CREATE UNIQUE INDEX uq_team_invitations_pending_email
  ON iam.team_invitations (tenant_id, lower(email)) WHERE status = 'pending';

ALTER TABLE iam.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam.team_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY team_invitations_tenant_isolation ON iam.team_invitations
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE OR REPLACE FUNCTION iam.lookup_team_invitation(p_token_hash char(64))
RETURNS TABLE (
  id uuid, tenant_id uuid, email varchar, full_name varchar, phone varchar,
  role varchar, status varchar, expires_at timestamptz, accepted_at timestamptz,
  revoked_at timestamptz, totp_secret varchar, recovery_code_hashes jsonb,
  studio_name varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, iam, platform
AS $$
BEGIN
  PERFORM set_config('app.invitation_token_hash', p_token_hash::text, true);
  RETURN QUERY SELECT i.id, i.tenant_id, i.email, i.full_name, i.phone, i.role,
         i.status, i.expires_at, i.accepted_at, i.revoked_at,
         i.totp_secret, i.recovery_code_hashes,
         COALESCE(s.name, t.display_name)::varchar AS studio_name
  FROM iam.team_invitations i
  JOIN platform.tenants t ON t.id = i.tenant_id
  LEFT JOIN LATERAL (
    SELECT studio.name FROM platform.studios AS studio WHERE studio.tenant_id = i.tenant_id ORDER BY studio.created_at ASC LIMIT 1
  ) s ON true
  WHERE i.token_hash = p_token_hash
  LIMIT 1;
END
$$;

REVOKE ALL ON FUNCTION iam.lookup_team_invitation(char(64)) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_app_runtime') THEN
    GRANT EXECUTE ON FUNCTION iam.lookup_team_invitation(char(64)) TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE ON iam.team_invitations TO fitness_app_runtime;
  END IF;
END
$$;
