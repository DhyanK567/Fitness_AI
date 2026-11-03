-- ============================================================
-- 144: Outbox Idempotency Key
-- ============================================================
-- Adds idempotency_key column to ops.outbox_events for deterministic
-- deduplication of outbox events (membership expiry, renewal reminders).
-- Uses a partial unique index to allow existing NULL values while
-- enforcing uniqueness for new non-NULL keys.
-- ============================================================

-- Step 1: Add idempotency_key column
ALTER TABLE ops.outbox_events ADD COLUMN IF NOT EXISTS idempotency_key varchar(255);

-- Step 2: Create partial unique index (excludes NULLs, allows existing rows with NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ix_outbox_idempotency
  ON ops.outbox_events (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- Rollback (for reference - not executed automatically):
-- DROP INDEX IF EXISTS ix_outbox_idempotency;
-- ALTER TABLE ops.outbox_events DROP COLUMN IF EXISTS idempotency_key;
-- ============================================================