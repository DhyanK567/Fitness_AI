-- Additive reconciliation for database objects present in schema.prisma but
-- absent from the historical production baseline. This migration is
-- intentionally idempotent and never drops application data.

ALTER TABLE audit.security_events
  ALTER COLUMN tenant_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS route varchar(200);

CREATE INDEX IF NOT EXISTS ix_security_events_tenant_type_time
  ON audit.security_events (tenant_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_security_events_ip_time
  ON audit.security_events (ip_address, occurred_at DESC);

CREATE TABLE IF NOT EXISTS platform.provider_plan_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL DEFAULT 'razorpay',
  provider_plan_id varchar(120) NOT NULL,
  tier_id uuid NOT NULL REFERENCES platform.subscription_tiers(id),
  billing_interval varchar(20) NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'yearly')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_provider_plan UNIQUE (provider, provider_plan_id)
);

CREATE TABLE IF NOT EXISTS platform.tenant_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES platform.tenant_subscriptions(id) ON DELETE RESTRICT,
  provider varchar(40) NOT NULL DEFAULT 'razorpay',
  provider_invoice_id varchar(120) NOT NULL,
  provider_payment_id varchar(120),
  amount integer NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  billing_period_start timestamptz NOT NULL,
  billing_period_end timestamptz NOT NULL,
  status varchar(40) NOT NULL CHECK (status IN ('paid', 'issued', 'failed', 'cancelled')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_invoices_provider_invoice UNIQUE (provider, provider_invoice_id)
);

CREATE INDEX IF NOT EXISTS ix_tenant_invoices_tenant
  ON platform.tenant_invoices (tenant_id);
CREATE INDEX IF NOT EXISTS ix_tenant_invoices_subscription
  ON platform.tenant_invoices (subscription_id);

CREATE TABLE IF NOT EXISTS platform.recurring_payment_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES platform.tenant_subscriptions(id) ON DELETE RESTRICT,
  provider varchar(40) NOT NULL DEFAULT 'razorpay',
  mandate_token varchar(160) NOT NULL,
  max_amount integer NOT NULL CHECK (max_amount > 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  status varchar(40) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked', 'failed')),
  consent_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_consents_provider_token UNIQUE (provider, mandate_token)
);

CREATE INDEX IF NOT EXISTS ix_recurring_payment_consents_tenant
  ON platform.recurring_payment_consents (tenant_id);

CREATE TABLE IF NOT EXISTS platform.platform_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL DEFAULT 'razorpay',
  provider_event_id varchar(160) NOT NULL,
  event_type varchar(80),
  payload jsonb NOT NULL,
  raw_body_sha256 char(64) NOT NULL,
  is_ambiguous_fallback boolean NOT NULL DEFAULT false,
  status varchar(40) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'claimed', 'processed', 'failed', 'quarantined', 'ignored')),
  claim_token uuid,
  claimed_at timestamptz,
  processed_at timestamptz,
  quarantined_at timestamptz,
  quarantine_reason text,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_platform_webhook_inbox_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS ix_platform_webhook_inbox_received
  ON platform.platform_webhook_inbox (received_at ASC)
  WHERE status = 'received';
CREATE INDEX IF NOT EXISTS ix_platform_webhook_inbox_claimed
  ON platform.platform_webhook_inbox (claimed_at)
  WHERE status = 'claimed';

CREATE TABLE IF NOT EXISTS config.faq_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  question text NOT NULL,
  answer text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  status varchar(12) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'archived')),
  approved_by uuid REFERENCES iam.users(id),
  approved_at timestamptz,
  search_tsv tsvector GENERATED ALWAYS AS
    (to_tsvector('english', question || ' ' || answer)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faq_entries_search_tsv
  ON config.faq_entries USING gin(search_tsv)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_faq_entries_tenant_status
  ON config.faq_entries (tenant_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_updated_at'
      AND tgrelid = 'platform.provider_plan_mappings'::regclass
  ) THEN
    CALL platform.add_updated_at_trigger('platform', 'provider_plan_mappings');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_updated_at'
      AND tgrelid = 'platform.tenant_invoices'::regclass
  ) THEN
    CALL platform.add_updated_at_trigger('platform', 'tenant_invoices');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_updated_at'
      AND tgrelid = 'platform.recurring_payment_consents'::regclass
  ) THEN
    CALL platform.add_updated_at_trigger('platform', 'recurring_payment_consents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_updated_at'
      AND tgrelid = 'platform.platform_webhook_inbox'::regclass
  ) THEN
    CALL platform.add_updated_at_trigger('platform', 'platform_webhook_inbox');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_updated_at'
      AND tgrelid = 'config.faq_entries'::regclass
  ) THEN
    CALL platform.add_updated_at_trigger('config', 'faq_entries');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    JOIN pg_class c ON pol.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE pol.polname = 'tenant_isolation'
      AND n.nspname = 'config'
      AND c.relname = 'faq_entries'
  ) THEN
    CALL platform.enable_tenant_rls('config', 'faq_entries');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_app_runtime') THEN
    GRANT SELECT ON platform.provider_plan_mappings TO fitness_app_runtime;
    GRANT SELECT ON platform.tenant_invoices TO fitness_app_runtime;
    GRANT SELECT ON platform.recurring_payment_consents TO fitness_app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON config.faq_entries TO fitness_app_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_webhook_ingest') THEN
    GRANT INSERT ON platform.platform_webhook_inbox TO fitness_webhook_ingest;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_worker_runtime') THEN
    GRANT SELECT ON platform.platform_webhook_inbox TO fitness_worker_runtime;
    GRANT UPDATE (status, claim_token, claimed_at, processed_at, quarantined_at,
      quarantine_reason, retry_count, last_error, updated_at)
      ON platform.platform_webhook_inbox TO fitness_worker_runtime;
    GRANT SELECT ON platform.provider_plan_mappings TO fitness_worker_runtime;
    GRANT SELECT ON platform.tenant_invoices TO fitness_worker_runtime;
  END IF;
END $$;
