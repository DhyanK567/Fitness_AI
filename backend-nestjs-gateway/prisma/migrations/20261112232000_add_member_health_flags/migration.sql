-- AlterTable: Add member health flags (Cycle 2 B2B Member A - Task 2.3)
-- Purely additive, nullable Booleans without FALSE database default.
-- Retains NULL for uncollected/unrecorded health data to preserve true absence vs unknown semantics.
-- Preserves existing data, row-level security, and indexes.

ALTER TABLE "ops"."studio_members"
  ADD COLUMN IF NOT EXISTS "knee_injury" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "lower_back_pain" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "post_surgery" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "first_time_member" BOOLEAN;
