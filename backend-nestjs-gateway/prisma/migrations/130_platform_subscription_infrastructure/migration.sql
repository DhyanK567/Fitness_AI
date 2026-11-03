-- Phase 1A: Database Foundation for Fitness AI SaaS Subscription Platform
-- Migration: 130_platform_subscription_infrastructure

-- 1. Reconcile platform.tenants schema drift and add trial/deletion lifecycle fields
ALTER TABLE platform.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE platform.tenants ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('onboarding', 'active', 'past_due', 'suspended', 'pending_deletion', 'closed'));

ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS locale varchar(10) NOT NULL DEFAULT 'en-IN';
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS erp_company varchar(140);
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS data_region varchar(20) NOT NULL DEFAULT 'in-west';
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz;
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS pending_deletion_at timestamptz;
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- 2. Subscription Tiers Catalog Seed (Ensure baseline codes exist)
INSERT INTO platform.subscription_tiers (id, code, display_name, status)
VALUES
  ('b93f1d44-8c88-4c3e-8c77-62a2de9038d1', 'starter', 'Starter', 'active'),
  ('b93f1d44-8c88-4c3e-8c77-62a2de9038d2', 'growth', 'Growth', 'active'),
  ('b93f1d44-8c88-4c3e-8c77-62a2de9038d3', 'enterprise', 'Enterprise', 'active')
ON CONFLICT (code) DO NOTHING;

-- 3. Provider Plan Mappings (Catalog mapping provider plan IDs to internal subscription tiers)
CREATE TABLE IF NOT EXISTS platform.provider_plan_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL DEFAULT 'razorpay',
  provider_plan_id varchar(120) NOT NULL,
  tier_id uuid NOT NULL REFERENCES platform.subscription_tiers(id),
  billing_interval varchar(20) NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_provider_plan UNIQUE (provider, provider_plan_id)
);

-- Seed provisional provider plan mappings (provisional commercial mapping)
INSERT INTO platform.provider_plan_mappings (provider, provider_plan_id, tier_id, billing_interval)
VALUES
  ('razorpay', 'plan_starter_monthly_provisional', (SELECT id FROM platform.subscription_tiers WHERE code = 'starter'), 'monthly'),
  ('razorpay', 'plan_growth_monthly_provisional', (SELECT id FROM platform.subscription_tiers WHERE code = 'growth'), 'monthly'),
  ('razorpay', 'plan_enterprise_monthly_provisional', (SELECT id FROM platform.subscription_tiers WHERE code = 'enterprise'), 'monthly')
ON CONFLICT (provider, provider_plan_id) DO NOTHING;

-- 4. Tenant Subscriptions (Contractual source of truth for subscription state)
CREATE TABLE IF NOT EXISTS platform.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  tier_id uuid NOT NULL REFERENCES platform.subscription_tiers(id) ON DELETE RESTRICT,
  status varchar(40) NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'authenticated', 'active', 'past_due', 'halted', 'cancelled', 'completed', 'paused')),
  provider varchar(40) NOT NULL DEFAULT 'razorpay',
  razorpay_subscription_id varchar(120) UNIQUE,
  razorpay_plan_id varchar(120),
  mandate_status varchar(40) NOT NULL DEFAULT 'pending' CHECK (mandate_status IN ('pending', 'authenticated', 'active', 'failed', 'revoked')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  paid_count integer NOT NULL DEFAULT 0 CHECK (paid_count >= 0),
  total_count integer CHECK (total_count IS NULL OR total_count >= 0),
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  last_provider_event_at timestamptz,
  last_provider_sync_at timestamptz,
  last_provider_snapshot jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tenant_subscriptions_tenant ON platform.tenant_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS ix_tenant_subscriptions_provider_id ON platform.tenant_subscriptions (razorpay_subscription_id);

-- Enforce exactly one active/trialing/past_due/halted subscription per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_active_subscription
  ON platform.tenant_subscriptions (tenant_id)
  WHERE status IN ('trialing', 'authenticated', 'active', 'past_due', 'halted', 'paused');

-- 5. Tenant Invoices (Append-only / statutory invoice ledger)
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

CREATE INDEX IF NOT EXISTS ix_tenant_invoices_tenant ON platform.tenant_invoices (tenant_id);
CREATE INDEX IF NOT EXISTS ix_tenant_invoices_subscription ON platform.tenant_invoices (subscription_id);

-- 6. Recurring Payment Consents (E-mandate / RBI recurring consent records)
CREATE TABLE IF NOT EXISTS platform.recurring_payment_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES platform.tenant_subscriptions(id) ON DELETE RESTRICT,
  provider varchar(40) NOT NULL DEFAULT 'razorpay',
  mandate_token varchar(160) NOT NULL,
  max_amount integer NOT NULL CHECK (max_amount > 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  status varchar(40) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked', 'failed')),
  consent_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_consents_provider_token UNIQUE (provider, mandate_token)
);

CREATE INDEX IF NOT EXISTS ix_recurring_payment_consents_tenant ON platform.recurring_payment_consents (tenant_id);

-- 7. Platform Webhook Inbox (Deduplication, atomic worker claiming, quarantine path)
CREATE TABLE IF NOT EXISTS platform.platform_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(40) NOT NULL DEFAULT 'razorpay',
  provider_event_id varchar(160) NOT NULL,
  event_type varchar(80),
  payload jsonb NOT NULL,
  raw_body_sha256 char(64) NOT NULL,
  is_ambiguous_fallback boolean NOT NULL DEFAULT false,
  status varchar(40) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'claimed', 'processed', 'failed', 'quarantined', 'ignored')),
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

-- 8. Add updated_at triggers to newly created tables
CALL platform.add_updated_at_trigger('platform', 'provider_plan_mappings');
CALL platform.add_updated_at_trigger('platform', 'tenant_subscriptions');
CALL platform.add_updated_at_trigger('platform', 'tenant_invoices');
CALL platform.add_updated_at_trigger('platform', 'recurring_payment_consents');
CALL platform.add_updated_at_trigger('platform', 'platform_webhook_inbox');

-- 9. Trigger for Authoritative Tenant Tier Synchronization
CREATE OR REPLACE FUNCTION platform.sync_tenant_subscription_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, pg_catalog, pg_temp
AS $$
BEGIN
  -- When subscription is active or trialing, project tier_id onto the tenant operational shell
  IF NEW.status IN ('active', 'trialing') THEN
    UPDATE platform.tenants
    SET tier_id = NEW.tier_id,
        updated_at = now()
    WHERE id = NEW.tenant_id
      AND (tier_id IS DISTINCT FROM NEW.tier_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tenant_subscription_tier ON platform.tenant_subscriptions;
CREATE TRIGGER trg_sync_tenant_subscription_tier
  AFTER INSERT OR UPDATE OF tier_id, status
  ON platform.tenant_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION platform.sync_tenant_subscription_tier();

-- 10. Email Verification and Trial Activation Function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION platform.verify_owner_email(
  p_tenant_id uuid,
  p_raw_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, iam, pg_catalog, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_verification record;
  v_user record;
  v_starter_tier_id uuid;
  v_sub_id uuid;
  v_now timestamptz := now();
  v_trial_end timestamptz := v_now + interval '7 days';
BEGIN
  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  SELECT * INTO v_verification
  FROM iam.email_verifications
  WHERE tenant_id = p_tenant_id
    AND token_hash = v_token_hash
    AND verified_at IS NULL
    AND expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired, or already-verified token' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_user
  FROM iam.users
  WHERE id = v_verification.user_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in tenant' USING ERRCODE = 'P0002';
  END IF;

  UPDATE iam.email_verifications
  SET verified_at = v_now,
      updated_at = v_now
  WHERE id = v_verification.id;

  UPDATE iam.users
  SET is_email_verified = true,
      updated_at = v_now
  WHERE id = v_user.id;

  SELECT id INTO v_starter_tier_id
  FROM platform.subscription_tiers
  WHERE code = 'starter';

  IF v_starter_tier_id IS NULL THEN
    RAISE EXCEPTION 'Default starter subscription tier not configured' USING ERRCODE = 'P0003';
  END IF;

  UPDATE platform.tenants
  SET status = 'active',
      tier_id = v_starter_tier_id,
      trial_starts_at = v_now,
      trial_ends_at = v_trial_end,
      updated_at = v_now
  WHERE id = p_tenant_id;

  INSERT INTO platform.tenant_subscriptions (
    tenant_id,
    tier_id,
    status,
    provider,
    mandate_status,
    trial_starts_at,
    trial_ends_at,
    version
  ) VALUES (
    p_tenant_id,
    v_starter_tier_id,
    'trialing',
    'razorpay',
    'pending',
    v_now,
    v_trial_end,
    1
  )
  ON CONFLICT (tenant_id) WHERE status IN ('trialing', 'authenticated', 'active', 'past_due', 'halted', 'paused')
  DO UPDATE SET
    status = 'trialing',
    tier_id = v_starter_tier_id,
    trial_starts_at = v_now,
    trial_ends_at = v_trial_end,
    version = platform.tenant_subscriptions.version + 1,
    updated_at = v_now
  RETURNING id INTO v_sub_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'user_id', v_user.id,
    'subscription_id', v_sub_id,
    'trial_starts_at', v_now,
    'trial_ends_at', v_trial_end
  );
END;
$$;

-- 11. Subscription State Reconciliation Function (SECURITY DEFINER with Quarantine Protection)
CREATE OR REPLACE FUNCTION platform.reconcile_subscription_provider_state(
  p_inbox_id uuid,
  p_claim_token uuid,
  p_expected_version integer,
  p_live_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, pg_catalog, pg_temp
AS $$
DECLARE
  v_inbox record;
  v_sub record;
  v_inbox_sub_id text;
  v_snapshot_sub_id text;
  v_snapshot_plan_id text;
  v_snapshot_status text;
  v_target_tier_id uuid;
  v_target_status text;
  v_snapshot_paid_count integer;
  v_snapshot_current_end timestamptz;
BEGIN
  -- 1. Validate and lock the claimed inbox record
  SELECT * INTO v_inbox
  FROM platform.platform_webhook_inbox
  WHERE id = p_inbox_id
    AND claim_token = p_claim_token
    AND status = 'claimed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or invalid inbox claim for id %', p_inbox_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Validate and correlate provider subscription IDs
  v_inbox_sub_id := v_inbox.payload->'payload'->'subscription'->'entity'->>'id';
  v_snapshot_sub_id := p_live_snapshot->>'id';

  IF v_inbox_sub_id IS NULL OR v_snapshot_sub_id IS NULL OR v_inbox_sub_id != v_snapshot_sub_id THEN
    RAISE EXCEPTION 'Provider subscription ID mismatch: inbox %, snapshot %', v_inbox_sub_id, v_snapshot_sub_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Lock target subscription row
  SELECT * INTO v_sub
  FROM platform.tenant_subscriptions
  WHERE razorpay_subscription_id = v_snapshot_sub_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tenant subscription found for provider id %', v_snapshot_sub_id
      USING ERRCODE = 'P0003';
  END IF;

  -- 4. Compare-And-Swap (CAS) Concurrency Verification
  IF v_sub.version != p_expected_version THEN
    RAISE EXCEPTION 'Concurrency conflict on subscription %: expected version %, actual %',
      v_sub.id, p_expected_version, v_sub.version
      USING ERRCODE = 'P0005';
  END IF;

  -- 5. Validate Provider Plan Mapping (Quarantine if unrecognized)
  v_snapshot_plan_id := p_live_snapshot->>'plan_id';
  SELECT tier_id INTO v_target_tier_id
  FROM platform.provider_plan_mappings
  WHERE provider = 'razorpay' AND provider_plan_id = v_snapshot_plan_id;

  IF v_target_tier_id IS NULL THEN
    UPDATE platform.platform_webhook_inbox
    SET status = 'quarantined',
        quarantine_reason = 'UNKNOWN_PROVIDER_PLAN: ' || COALESCE(v_snapshot_plan_id, 'NULL'),
        quarantined_at = now(),
        updated_at = now()
    WHERE id = p_inbox_id;

    RETURN jsonb_build_object('success', false, 'status', 'quarantined', 'reason', 'UNKNOWN_PROVIDER_PLAN');
  END IF;

  -- 6. Validate Provider Status (Quarantine if unrecognized)
  v_snapshot_status := p_live_snapshot->>'status';
  v_target_status := CASE v_snapshot_status
    WHEN 'active' THEN 'active'
    WHEN 'authenticated' THEN 'authenticated'
    WHEN 'halted' THEN 'halted'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'completed' THEN 'completed'
    WHEN 'paused' THEN 'paused'
    ELSE NULL
  END;

  IF v_target_status IS NULL THEN
    UPDATE platform.platform_webhook_inbox
    SET status = 'quarantined',
        quarantine_reason = 'UNRECOGNIZED_PROVIDER_STATUS: ' || COALESCE(v_snapshot_status, 'NULL'),
        quarantined_at = now(),
        updated_at = now()
    WHERE id = p_inbox_id;

    RETURN jsonb_build_object('success', false, 'status', 'quarantined', 'reason', 'UNRECOGNIZED_PROVIDER_STATUS');
  END IF;

  -- 7. Enforce Terminal State Protection (Cancelled subscriptions cannot resurrect)
  IF v_sub.status = 'cancelled' AND v_target_status != 'cancelled' THEN
    UPDATE platform.platform_webhook_inbox
    SET status = 'quarantined',
        quarantine_reason = 'ATTEMPTED_RESURRECTION_OF_CANCELLED_SUBSCRIPTION',
        quarantined_at = now(),
        updated_at = now()
    WHERE id = p_inbox_id;

    RETURN jsonb_build_object('success', false, 'status', 'quarantined', 'reason', 'TERMINAL_STATE_VIOLATION');
  END IF;

  -- 8. Monotonic Paid Count Check
  v_snapshot_paid_count := COALESCE((p_live_snapshot->>'paid_count')::integer, 0);
  v_snapshot_current_end := to_timestamp((p_live_snapshot->>'current_end')::double precision);

  IF v_snapshot_paid_count < v_sub.paid_count THEN
    RAISE EXCEPTION 'Monotonic regression: snapshot paid_count % < recorded %',
      v_snapshot_paid_count, v_sub.paid_count
      USING ERRCODE = 'P0006';
  END IF;

  -- 9. Atomic Mutation & Audit Trail
  UPDATE platform.tenant_subscriptions
  SET status = v_target_status,
      tier_id = v_target_tier_id,
      paid_count = GREATEST(v_sub.paid_count, v_snapshot_paid_count),
      current_period_end = COALESCE(v_snapshot_current_end, v_sub.current_period_end),
      last_provider_sync_at = now(),
      last_provider_snapshot = p_live_snapshot,
      version = v_sub.version + 1,
      updated_at = now()
  WHERE id = v_sub.id;

  -- 10. Mark Inbox Successfully Processed
  UPDATE platform.platform_webhook_inbox
  SET status = 'processed',
      processed_at = now(),
      updated_at = now()
  WHERE id = p_inbox_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'applied',
    'subscription_id', v_sub.id,
    'new_status', v_target_status,
    'new_version', v_sub.version + 1
  );
END;
$$;

-- 12. Provider Subscription Mandate Binding Function (SECURITY DEFINER)
-- Binds a newly created Razorpay subscription ID to an active/trialing tenant subscription.
-- Does NOT activate or authenticate the subscription (that requires provider webhook/reconciliation).
CREATE OR REPLACE FUNCTION platform.bind_tenant_subscription_mandate(
  p_tenant_id uuid,
  p_razorpay_sub_id text,
  p_razorpay_plan_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, pg_catalog, pg_temp
AS $$
DECLARE
  v_sub record;
  v_target_tier_id uuid;
BEGIN
  -- 1. Parameter Validation
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID is required' USING ERRCODE = 'P0001';
  END IF;

  IF p_razorpay_sub_id IS NULL OR p_razorpay_sub_id !~ '^sub_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Invalid Razorpay subscription ID format: %', p_razorpay_sub_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_razorpay_plan_id IS NULL OR p_razorpay_plan_id !~ '^plan_[A-Za-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid Razorpay plan ID format: %', p_razorpay_plan_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Validate Provider Plan Mapping
  SELECT tier_id INTO v_target_tier_id
  FROM platform.provider_plan_mappings
  WHERE provider = 'razorpay'
    AND provider_plan_id = p_razorpay_plan_id
    AND is_active = true;

  IF v_target_tier_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive provider plan ID: %', p_razorpay_plan_id
      USING ERRCODE = 'P0004';
  END IF;

  -- 3. Lock Active / Trialing Subscription for Tenant
  SELECT * INTO v_sub
  FROM platform.tenant_subscriptions
  WHERE tenant_id = p_tenant_id
    AND status IN ('trialing', 'authenticated', 'active')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No eligible active or trialing subscription found for tenant %', p_tenant_id
      USING ERRCODE = 'P0003';
  END IF;

  -- 4. Rebinding & Idempotency Checks
  IF v_sub.razorpay_subscription_id IS NOT NULL THEN
    IF v_sub.razorpay_subscription_id = p_razorpay_sub_id AND v_sub.razorpay_plan_id = p_razorpay_plan_id THEN
      -- Repeated identical call is an idempotent no-op
      RETURN jsonb_build_object(
        'success', true,
        'status', 'already_bound',
        'subscription_id', v_sub.id,
        'razorpay_subscription_id', p_razorpay_sub_id
      );
    ELSE
      -- Conflicting rebinding attempt
      RAISE EXCEPTION 'Subscription % already bound to provider subscription %, cannot rebind to %',
        v_sub.id, v_sub.razorpay_subscription_id, p_razorpay_sub_id
        USING ERRCODE = 'P0007';
    END IF;
  END IF;

  -- 5. Bind Provider IDs (Subscription remains in current status, mandate_status set to pending)
  UPDATE platform.tenant_subscriptions
  SET razorpay_subscription_id = p_razorpay_sub_id,
      razorpay_plan_id = p_razorpay_plan_id,
      mandate_status = 'pending',
      version = v_sub.version + 1,
      updated_at = now()
  WHERE id = v_sub.id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'bound',
    'subscription_id', v_sub.id,
    'razorpay_subscription_id', p_razorpay_sub_id,
    'tier_id', v_target_tier_id
  );
END;
$$;

-- 13. Invoice Immutability Guard Trigger
-- Physically prevents any invoice from regressing from 'paid' to a non-paid status,
-- and prevents modifying core financial terms once an invoice record is created.
CREATE OR REPLACE FUNCTION platform.guard_invoice_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, pg_catalog, pg_temp
AS $$
BEGIN
  -- 1. Never allow regression of paid invoices
  IF OLD.status = 'paid' AND NEW.status != 'paid' THEN
    RAISE EXCEPTION 'Cannot regress invoice % from paid to %', OLD.provider_invoice_id, NEW.status
      USING ERRCODE = 'P0008';
  END IF;

  -- 2. Prevent tampering with core financial attributes
  IF OLD.tenant_id != NEW.tenant_id
     OR OLD.subscription_id != NEW.subscription_id
     OR OLD.provider != NEW.provider
     OR OLD.provider_invoice_id != NEW.provider_invoice_id
     OR OLD.amount != NEW.amount
     OR OLD.currency != NEW.currency
     OR OLD.billing_period_start != NEW.billing_period_start
     OR OLD.billing_period_end != NEW.billing_period_end THEN
    RAISE EXCEPTION 'Cannot modify financial identity or terms of invoice %', OLD.provider_invoice_id
      USING ERRCODE = 'P0009';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_immutability ON platform.tenant_invoices;
CREATE TRIGGER trg_guard_invoice_immutability
  BEFORE UPDATE ON platform.tenant_invoices
  FOR EACH ROW
  EXECUTE FUNCTION platform.guard_invoice_immutability();

-- 14. Authorized Invoice Recording Function (SECURITY DEFINER)
-- Allows the worker to record invoices strictly bound to a claimed inbox record and matched subscription.
CREATE OR REPLACE FUNCTION platform.record_subscription_invoice(
  p_inbox_id uuid,
  p_claim_token uuid,
  p_provider_invoice_id text,
  p_provider_payment_id text,
  p_amount integer,
  p_currency text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_status text,
  p_paid_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, pg_catalog, pg_temp
AS $$
DECLARE
  v_inbox record;
  v_sub record;
  v_provider_sub_id text;
  v_invoice_id uuid;
BEGIN
  -- 1. Validate claimed inbox record
  SELECT * INTO v_inbox
  FROM platform.platform_webhook_inbox
  WHERE id = p_inbox_id
    AND claim_token = p_claim_token
    AND status = 'claimed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or invalid inbox claim for id %', p_inbox_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Extract provider subscription ID from verified inbox payload
  v_provider_sub_id := v_inbox.payload->'payload'->'subscription'->'entity'->>'id';
  IF v_provider_sub_id IS NULL THEN
    RAISE EXCEPTION 'Inbox payload missing subscription ID' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Resolve internal tenant subscription
  SELECT * INTO v_sub
  FROM platform.tenant_subscriptions
  WHERE razorpay_subscription_id = v_provider_sub_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tenant subscription found for provider id %', v_provider_sub_id
      USING ERRCODE = 'P0003';
  END IF;

  -- 4. Idempotent Insert / Safe Status Update (Never regress paid)
  INSERT INTO platform.tenant_invoices (
    tenant_id, subscription_id, provider, provider_invoice_id, provider_payment_id,
    amount, currency, billing_period_start, billing_period_end, status, paid_at
  ) VALUES (
    v_sub.tenant_id, v_sub.id, 'razorpay', p_provider_invoice_id, p_provider_payment_id,
    p_amount, COALESCE(p_currency, 'INR'), p_period_start, p_period_end, p_status, p_paid_at
  )
  ON CONFLICT (provider, provider_invoice_id) DO UPDATE
  SET status = CASE
        WHEN platform.tenant_invoices.status = 'paid' THEN 'paid'
        ELSE EXCLUDED.status
      END,
      provider_payment_id = COALESCE(EXCLUDED.provider_payment_id, platform.tenant_invoices.provider_payment_id),
      paid_at = COALESCE(EXCLUDED.paid_at, platform.tenant_invoices.paid_at),
      updated_at = now()
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'provider_invoice_id', p_provider_invoice_id,
    'status', p_status
  );
END;
$$;

-- 15. Database Role Topology & Least Privilege Grants
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_app_runtime') THEN
    CREATE ROLE fitness_app_runtime WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_webhook_ingest') THEN
    CREATE ROLE fitness_webhook_ingest WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_worker_runtime') THEN
    CREATE ROLE fitness_worker_runtime WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

-- Revoke default PUBLIC privileges
REVOKE ALL ON SCHEMA platform FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA platform FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA platform FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA platform FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA platform REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform REVOKE ALL ON SEQUENCES FROM PUBLIC;

-- Grants for fitness_app_runtime (General Application Runtime)
GRANT USAGE ON SCHEMA platform TO fitness_app_runtime;
GRANT SELECT ON platform.tenants TO fitness_app_runtime;
GRANT SELECT ON platform.subscription_tiers TO fitness_app_runtime;
GRANT SELECT ON platform.tier_features TO fitness_app_runtime;
GRANT SELECT ON platform.tenant_subscriptions TO fitness_app_runtime;
GRANT SELECT ON platform.tenant_invoices TO fitness_app_runtime;
GRANT SELECT ON platform.recurring_payment_consents TO fitness_app_runtime;
GRANT SELECT ON platform.provider_plan_mappings TO fitness_app_runtime;
GRANT SELECT ON platform.tenant_domains TO fitness_app_runtime;
GRANT SELECT ON platform.tenant_feature_flags TO fitness_app_runtime;
GRANT SELECT ON platform.studios TO fitness_app_runtime;
GRANT SELECT ON platform.branches TO fitness_app_runtime;

-- Operational column-level update on tenants (tier_id strictly omitted)
GRANT UPDATE (
  legal_name, display_name, timezone, currency, locale, erp_company, updated_at
) ON platform.tenants TO fitness_app_runtime;

-- Deny direct writes on subscription records and inbox to application runtime
REVOKE INSERT, UPDATE, DELETE ON platform.tenant_subscriptions FROM fitness_app_runtime;
REVOKE INSERT, UPDATE, DELETE ON platform.tenant_invoices FROM fitness_app_runtime;
REVOKE INSERT, UPDATE, DELETE ON platform.platform_webhook_inbox FROM fitness_app_runtime;

-- Grants for fitness_webhook_ingest (Webhook Ingestion ONLY)
GRANT USAGE ON SCHEMA platform TO fitness_webhook_ingest;
GRANT INSERT ON platform.platform_webhook_inbox TO fitness_webhook_ingest;
REVOKE SELECT, UPDATE, DELETE ON platform.platform_webhook_inbox FROM fitness_webhook_ingest;
REVOKE ALL ON platform.tenant_subscriptions FROM fitness_webhook_ingest;
REVOKE ALL ON platform.tenant_invoices FROM fitness_webhook_ingest;
REVOKE ALL ON platform.tenants FROM fitness_webhook_ingest;

-- Grants for fitness_worker_runtime (Reconciliation Worker ONLY)
GRANT USAGE ON SCHEMA platform TO fitness_worker_runtime;
GRANT SELECT ON platform.platform_webhook_inbox TO fitness_worker_runtime;
GRANT UPDATE (status, claim_token, claimed_at, processed_at, quarantined_at, quarantine_reason, retry_count, last_error, updated_at)
  ON platform.platform_webhook_inbox TO fitness_worker_runtime;
GRANT SELECT ON platform.tenant_subscriptions TO fitness_worker_runtime;
GRANT SELECT ON platform.tenant_invoices TO fitness_worker_runtime;
GRANT SELECT ON platform.provider_plan_mappings TO fitness_worker_runtime;

-- Direct invoice writes revoked from worker; worker must use record_subscription_invoice
REVOKE INSERT, UPDATE, DELETE ON platform.tenant_invoices FROM fitness_worker_runtime;

-- Execution permissions for privileged functions
GRANT EXECUTE ON FUNCTION platform.verify_owner_email(uuid, text) TO fitness_app_runtime;
GRANT EXECUTE ON FUNCTION platform.bind_tenant_subscription_mandate(uuid, text, text) TO fitness_app_runtime;
GRANT EXECUTE ON FUNCTION platform.reconcile_subscription_provider_state(uuid, uuid, integer, jsonb) TO fitness_worker_runtime;
GRANT EXECUTE ON FUNCTION platform.record_subscription_invoice(uuid, uuid, text, text, integer, text, timestamptz, timestamptz, text, timestamptz) TO fitness_worker_runtime;

-- Revoke execute from public on all functions
REVOKE ALL ON FUNCTION platform.bind_tenant_subscription_mandate(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.record_subscription_invoice(uuid, uuid, text, text, integer, text, timestamptz, timestamptz, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.guard_invoice_immutability() FROM PUBLIC;

-- 16. Backfill baseline subscription record for existing tenants if not present
INSERT INTO platform.tenant_subscriptions (tenant_id, tier_id, status, provider, mandate_status, version)
SELECT id, tier_id, 'active', 'razorpay', 'authenticated', 1
FROM platform.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM platform.tenant_subscriptions s WHERE s.tenant_id = t.id
)
ON CONFLICT DO NOTHING;
