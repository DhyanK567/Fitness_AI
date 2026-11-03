CREATE TABLE platform.subscription_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  display_name varchar(120) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.tier_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id uuid NOT NULL REFERENCES platform.subscription_tiers(id),
  feature_code varchar(80) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_id, feature_code)
);

CREATE TABLE platform.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  legal_name varchar(200) NOT NULL,
  display_name varchar(120) NOT NULL,
  tier_id uuid NOT NULL REFERENCES platform.subscription_tiers(id),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('onboarding', 'active', 'suspended', 'closed')),
  timezone varchar(60) NOT NULL DEFAULT 'Asia/Kolkata',
  currency char(3) NOT NULL DEFAULT 'INR',
  locale varchar(10) NOT NULL DEFAULT 'en-IN',
  erp_company varchar(140),
  data_region varchar(20) NOT NULL DEFAULT 'in-west',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  hostname varchar(253) NOT NULL UNIQUE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.tenant_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  feature_code varchar(80) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_code)
);

CREATE TABLE platform.studios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  name varchar(160) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  studio_id uuid NOT NULL REFERENCES platform.studios(id),
  name varchar(160) NOT NULL,
  timezone varchar(60) NOT NULL DEFAULT 'Asia/Kolkata',
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, studio_id, name)
);

CREATE INDEX ix_tenant_domains_tenant ON platform.tenant_domains (tenant_id);
CREATE INDEX ix_studios_tenant ON platform.studios (tenant_id);
CREATE INDEX ix_branches_tenant_studio ON platform.branches (tenant_id, studio_id);

CALL platform.enable_tenant_rls('platform', 'tenant_domains');
CALL platform.enable_tenant_rls('platform', 'tenant_feature_flags');
CALL platform.enable_tenant_rls('platform', 'studios');
CALL platform.enable_tenant_rls('platform', 'branches');
CALL platform.add_updated_at_trigger('platform', 'subscription_tiers');
CALL platform.add_updated_at_trigger('platform', 'tier_features');
CALL platform.add_updated_at_trigger('platform', 'tenants');
CALL platform.add_updated_at_trigger('platform', 'tenant_domains');
CALL platform.add_updated_at_trigger('platform', 'tenant_feature_flags');
CALL platform.add_updated_at_trigger('platform', 'studios');
CALL platform.add_updated_at_trigger('platform', 'branches');
