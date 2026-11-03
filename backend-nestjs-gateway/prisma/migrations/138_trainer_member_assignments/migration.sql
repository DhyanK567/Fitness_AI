-- Server-enforced trainer/member visibility boundary.
ALTER TABLE ops.studio_members
  ADD COLUMN IF NOT EXISTS trainer_user_id uuid;

ALTER TABLE ops.studio_members
  DROP CONSTRAINT IF EXISTS studio_members_trainer_user_id_fkey;

ALTER TABLE ops.studio_members
  ADD CONSTRAINT studio_members_trainer_user_id_fkey
  FOREIGN KEY (trainer_user_id) REFERENCES iam.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_studio_members_tenant_trainer
  ON ops.studio_members (tenant_id, trainer_user_id);

-- Product names shown at checkout map to stable internal tier codes. Some
-- long-lived environments predate the complete catalog, so seed idempotently.
INSERT INTO platform.subscription_tiers (id, code, display_name, status)
VALUES
  ('b93f1d44-8c88-4c3e-8c77-62a2de9038d1', 'starter', 'Basic', 'active'),
  ('b93f1d44-8c88-4c3e-8c77-62a2de9038d2', 'growth', 'Premium', 'active'),
  ('b93f1d44-8c88-4c3e-8c77-62a2de9038d3', 'enterprise', 'Ultra Premium', 'active')
ON CONFLICT (code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    status = 'active',
    updated_at = now();
