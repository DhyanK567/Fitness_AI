-- Phase 1B: Owner Registration and Email Verification DDL Correction
-- Migration: 132_owner_registration_and_verification
-- Corrects platform.verify_owner_email to target existing iam.auth_action_tokens
-- Adds platform.register_onboarding_studio for atomic least-privilege onboarding

-- 1. Corrected Email Verification and Trial Activation Function (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION platform.verify_owner_email(
  p_tenant_id uuid,
  p_raw_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, iam, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_token_hash text;
  v_token_rec record;
  v_user record;
  v_starter_tier_id uuid;
  v_sub_id uuid;
  v_now timestamptz := now();
  v_trial_end timestamptz := v_now + interval '7 days';
BEGIN
  -- 1. Parameter validation
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID is required' USING ERRCODE = 'P0001';
  END IF;

  IF p_raw_token IS NULL OR length(trim(p_raw_token)) = 0 THEN
    RAISE EXCEPTION 'Verification token is required' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Compute SHA-256 hash of the supplied raw token
  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  -- 3. Lock and validate unconsumed, unexpired token from iam.auth_action_tokens
  SELECT * INTO v_token_rec
  FROM iam.auth_action_tokens
  WHERE tenant_id = p_tenant_id
    AND token_hash = v_token_hash
    AND purpose = 'owner_email_verification'
    AND consumed_at IS NULL
    AND expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid, expired, or already-consumed verification token' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock and validate the owner user record from iam.users
  SELECT * INTO v_user
  FROM iam.users
  WHERE id = v_token_rec.user_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner user not found for token in tenant %', p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Mark token consumed atomically to prevent replay and concurrent races
  UPDATE iam.auth_action_tokens
  SET consumed_at = v_now,
      updated_at = v_now
  WHERE id = v_token_rec.id;

  -- 6. Transition user status from invited to active using existing schema columns
  UPDATE iam.users
  SET status = 'active',
      updated_at = v_now
  WHERE id = v_user.id;

  -- 7. Resolve default Starter subscription tier
  SELECT id INTO v_starter_tier_id
  FROM platform.subscription_tiers
  WHERE code = 'starter';

  IF v_starter_tier_id IS NULL THEN
    RAISE EXCEPTION 'Default starter subscription tier not configured' USING ERRCODE = 'P0003';
  END IF;

  -- 8. Transition tenant to active
  UPDATE platform.tenants
  SET status = 'active',
      tier_id = v_starter_tier_id,
      updated_at = v_now
  WHERE id = p_tenant_id;

  -- 9. Upsert baseline tenant subscription in trialing status
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

-- 2. Atomic Onboarding Registration Function (SECURITY DEFINER)
-- Creates onboarding tenant, owner identity, password credentials, and hashed action token in a single atomic transaction.
CREATE OR REPLACE FUNCTION platform.register_onboarding_studio(
  p_studio_name text,
  p_tenant_code text,
  p_owner_name text,
  p_owner_email text,
  p_owner_phone text,
  p_password_hash text,
  p_token_hash text,
  p_token_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, iam, public, pg_catalog, pg_temp
AS $$
DECLARE
  v_clean_code text;
  v_clean_email text;
  v_clean_phone text;
  v_clean_studio text;
  v_clean_owner text;
  v_starter_tier_id uuid;
  v_tenant_id uuid;
  v_studio_id uuid;
  v_branch_id uuid;
  v_owner_role_id uuid;
  v_user_id uuid;
  v_token_id uuid;
  v_now timestamptz := now();
BEGIN
  -- 1. Input sanitization and validation
  v_clean_studio := trim(p_studio_name);
  IF v_clean_studio IS NULL OR length(v_clean_studio) < 2 OR length(v_clean_studio) > 120 THEN
    RAISE EXCEPTION 'Studio name must be between 2 and 120 characters' USING ERRCODE = 'P0001';
  END IF;

  v_clean_code := lower(trim(p_tenant_code));
  IF v_clean_code IS NULL OR v_clean_code !~ '^[a-z0-9][a-z0-9-]{1,38}$' THEN
    RAISE EXCEPTION 'Tenant code must be 2-39 alphanumeric/hyphen characters and start with alphanumeric'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM platform.tenants WHERE code = v_clean_code) THEN
    RAISE EXCEPTION 'Tenant code % is already taken', v_clean_code USING ERRCODE = 'P0003';
  END IF;

  v_clean_owner := trim(p_owner_name);
  IF v_clean_owner IS NULL OR length(v_clean_owner) < 2 OR length(v_clean_owner) > 160 THEN
    RAISE EXCEPTION 'Owner name must be between 2 and 160 characters' USING ERRCODE = 'P0004';
  END IF;

  v_clean_email := lower(trim(p_owner_email));
  IF v_clean_email IS NULL OR v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid owner email address format' USING ERRCODE = 'P0005';
  END IF;

  v_clean_phone := trim(p_owner_phone);
  IF v_clean_phone IS NOT NULL AND length(v_clean_phone) > 0 THEN
    IF v_clean_phone !~ '^\+?[0-9]{10,15}$' THEN
      RAISE EXCEPTION 'Invalid owner phone format (expected 10-15 digits)' USING ERRCODE = 'P0006';
    END IF;
  ELSE
    v_clean_phone := NULL;
  END IF;

  IF p_password_hash IS NULL OR p_password_hash !~ '^\$argon2id\$' THEN
    RAISE EXCEPTION 'Password hash must be a valid Argon2id hash' USING ERRCODE = 'P0007';
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Token hash must be a 64-character lowercase hexadecimal SHA-256 digest'
      USING ERRCODE = 'P0008';
  END IF;

  IF p_token_expires_at IS NULL OR p_token_expires_at <= v_now THEN
    RAISE EXCEPTION 'Verification token expiration must be in the future' USING ERRCODE = 'P0009';
  END IF;

  -- 2. Resolve default starter subscription tier
  SELECT id INTO v_starter_tier_id
  FROM platform.subscription_tiers
  WHERE code = 'starter';

  IF v_starter_tier_id IS NULL THEN
    RAISE EXCEPTION 'Default starter subscription tier not configured' USING ERRCODE = 'P0010';
  END IF;

  -- 3. Create tenant in onboarding status
  INSERT INTO platform.tenants (
    code,
    legal_name,
    display_name,
    tier_id,
    status,
    timezone,
    currency
  ) VALUES (
    v_clean_code,
    v_clean_studio,
    v_clean_studio,
    v_starter_tier_id,
    'onboarding',
    'Asia/Kolkata',
    'INR'
  ) RETURNING id INTO v_tenant_id;

  -- 4. Initialize default IAM roles for the tenant
  INSERT INTO iam.roles (tenant_id, code, display_name) VALUES
    (v_tenant_id, 'owner', 'Studio Owner'),
    (v_tenant_id, 'admin', 'Studio Admin'),
    (v_tenant_id, 'front_desk', 'Front Desk Staff'),
    (v_tenant_id, 'trainer', 'Trainer'),
    (v_tenant_id, 'member', 'Member'),
    (v_tenant_id, 'visitor', 'Visitor')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO v_owner_role_id
  FROM iam.roles
  WHERE tenant_id = v_tenant_id AND code = 'owner';

  -- 5. Create default operational studio and branch
  INSERT INTO platform.studios (
    tenant_id,
    name,
    status
  ) VALUES (
    v_tenant_id,
    v_clean_studio,
    'active'
  ) RETURNING id INTO v_studio_id;

  INSERT INTO platform.branches (
    tenant_id,
    studio_id,
    name,
    timezone,
    status
  ) VALUES (
    v_tenant_id,
    v_studio_id,
    'Main Sanctuary',
    'Asia/Kolkata',
    'active'
  ) RETURNING id INTO v_branch_id;

  -- 6. Create owner user identity in invited status
  INSERT INTO iam.users (
    tenant_id,
    user_type,
    email,
    phone_e164,
    display_name,
    status,
    must_reset_password
  ) VALUES (
    v_tenant_id,
    'staff',
    v_clean_email::citext,
    v_clean_phone,
    v_clean_owner,
    'invited',
    false
  ) RETURNING id INTO v_user_id;

  -- 7. Persist owner password credentials
  INSERT INTO iam.user_credentials (
    tenant_id,
    user_id,
    password_hash
  ) VALUES (
    v_tenant_id,
    v_user_id,
    p_password_hash
  );

  -- 8. Assign owner role
  INSERT INTO iam.user_role_assignments (
    tenant_id,
    user_id,
    role_id,
    studio_id,
    branch_id
  ) VALUES (
    v_tenant_id,
    v_user_id,
    v_owner_role_id,
    NULL,
    NULL
  );

  -- 9. Persist hashed verification token in iam.auth_action_tokens
  INSERT INTO iam.auth_action_tokens (
    tenant_id,
    user_id,
    purpose,
    token_hash,
    expires_at
  ) VALUES (
    v_tenant_id,
    v_user_id,
    'owner_email_verification',
    p_token_hash,
    p_token_expires_at
  ) RETURNING id INTO v_token_id;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_code', v_clean_code,
    'user_id', v_user_id,
    'token_id', v_token_id,
    'status', 'onboarding'
  );
END;
$$;

-- 3. Execution Permissions & Security Grants
GRANT EXECUTE ON FUNCTION platform.verify_owner_email(uuid, text) TO fitness_app_runtime;
GRANT EXECUTE ON FUNCTION platform.register_onboarding_studio(text, text, text, text, text, text, text, timestamptz) TO fitness_app_runtime;

REVOKE ALL ON FUNCTION platform.verify_owner_email(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.register_onboarding_studio(text, text, text, text, text, text, text, timestamptz) FROM PUBLIC;
