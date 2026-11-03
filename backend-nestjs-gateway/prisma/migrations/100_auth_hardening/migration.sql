-- ============================================================
-- Auth hardening (Phase: B2B staff auth / member auth)
--   * login lockout counters
--   * refresh-token rotation families (reuse detection)
--   * single-use invite / password-reset tokens
--   * TOTP enrollment + hashed recovery codes
-- ============================================================

-- Users: lockout + MFA enforcement. (must_reset_password, last_login_at and
-- deactivated_at already exist from 020_iam.)
ALTER TABLE iam.users
  ADD COLUMN IF NOT EXISTS mfa_enforced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- Auth sessions: rotation family metadata.
ALTER TABLE iam.auth_sessions
  ADD COLUMN IF NOT EXISTS user_type varchar(10) NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS family_id uuid,
  ADD COLUMN IF NOT EXISTS parent_token_hash char(64),
  ADD COLUMN IF NOT EXISTS replaced_by_token_hash char(64),
  ADD COLUMN IF NOT EXISTS revoked_reason varchar(60);

CREATE INDEX IF NOT EXISTS ix_auth_sessions_tenant_user
  ON iam.auth_sessions (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_tenant_family
  ON iam.auth_sessions (tenant_id, family_id);

CREATE TABLE IF NOT EXISTS iam.auth_action_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES iam.users(id),
  purpose varchar(30) NOT NULL,
  token_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, token_hash)
);
CREATE INDEX IF NOT EXISTS ix_auth_action_tokens_tenant_user_purpose
  ON iam.auth_action_tokens (tenant_id, user_id, purpose);

CREATE TABLE IF NOT EXISTS iam.user_totp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES iam.users(id),
  secret varchar(64) NOT NULL,
  confirmed_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS iam.totp_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES iam.users(id),
  code_hash char(64) NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code_hash)
);
CREATE INDEX IF NOT EXISTS ix_totp_recovery_codes_tenant_user
  ON iam.totp_recovery_codes (tenant_id, user_id);

CALL platform.enable_tenant_rls('iam', 'auth_action_tokens');
CALL platform.enable_tenant_rls('iam', 'user_totp');
CALL platform.enable_tenant_rls('iam', 'totp_recovery_codes');

CALL platform.add_updated_at_trigger('iam', 'auth_action_tokens');
CALL platform.add_updated_at_trigger('iam', 'user_totp');
