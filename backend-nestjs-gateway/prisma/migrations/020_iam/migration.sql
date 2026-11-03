CREATE TABLE iam.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_type varchar(10) NOT NULL CHECK (user_type IN ('staff', 'member', 'platform')),
  email citext,
  phone_e164 varchar(16),
  display_name varchar(160) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'locked', 'deactivated')),
  must_reset_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
);
CREATE UNIQUE INDEX uq_users_tenant_email ON iam.users (tenant_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX uq_users_tenant_phone ON iam.users (tenant_id, phone_e164) WHERE phone_e164 IS NOT NULL;

CREATE TABLE iam.user_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES iam.users(id),
  password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE TABLE iam.auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES iam.users(id),
  provider varchar(30) NOT NULL,
  provider_subject varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_subject)
);
CREATE TABLE iam.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  code varchar(60) NOT NULL,
  display_name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE TABLE iam.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  code varchar(100) NOT NULL,
  description varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE TABLE iam.role_permissions (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  role_id uuid NOT NULL REFERENCES iam.roles(id),
  permission_id uuid NOT NULL REFERENCES iam.permissions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role_id, permission_id)
);
CREATE TABLE iam.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES iam.users(id),
  role_id uuid NOT NULL REFERENCES iam.roles(id),
  studio_id uuid REFERENCES platform.studios(id),
  branch_id uuid REFERENCES platform.branches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, role_id, studio_id, branch_id)
);
CREATE TABLE iam.permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES iam.users(id),
  permission_id uuid NOT NULL REFERENCES iam.permissions(id),
  resource_type varchar(60),
  resource_ref varchar(140),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE iam.user_erp_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES iam.users(id),
  erp_user_ref varchar(140) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, erp_user_ref)
);
CREATE TABLE iam.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  user_id uuid NOT NULL REFERENCES iam.users(id),
  token_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, token_hash)
);
CREATE TABLE iam.otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  phone_e164 varchar(16) NOT NULL,
  purpose varchar(40) NOT NULL,
  code_hash char(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CALL platform.enable_tenant_rls('iam', 'users');
CALL platform.enable_tenant_rls('iam', 'user_credentials');
CALL platform.enable_tenant_rls('iam', 'auth_identities');
CALL platform.enable_tenant_rls('iam', 'roles');
CALL platform.enable_tenant_rls('iam', 'permissions');
CALL platform.enable_tenant_rls('iam', 'role_permissions');
CALL platform.enable_tenant_rls('iam', 'user_role_assignments');
CALL platform.enable_tenant_rls('iam', 'permission_grants');
CALL platform.enable_tenant_rls('iam', 'user_erp_links');
CALL platform.enable_tenant_rls('iam', 'auth_sessions');
CALL platform.enable_tenant_rls('iam', 'otp_challenges');
CALL platform.add_updated_at_trigger('iam', 'users');
CALL platform.add_updated_at_trigger('iam', 'user_credentials');
CALL platform.add_updated_at_trigger('iam', 'auth_identities');
CALL platform.add_updated_at_trigger('iam', 'roles');
CALL platform.add_updated_at_trigger('iam', 'permissions');
CALL platform.add_updated_at_trigger('iam', 'user_role_assignments');
CALL platform.add_updated_at_trigger('iam', 'permission_grants');
CALL platform.add_updated_at_trigger('iam', 'user_erp_links');
CALL platform.add_updated_at_trigger('iam', 'auth_sessions');
CALL platform.add_updated_at_trigger('iam', 'otp_challenges');
