DROP POLICY team_invitations_tenant_isolation ON iam.team_invitations;

CREATE POLICY team_invitations_tenant_isolation ON iam.team_invitations
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    OR token_hash = NULLIF(current_setting('app.invitation_token_hash', true), '')::char(64)
  )
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
