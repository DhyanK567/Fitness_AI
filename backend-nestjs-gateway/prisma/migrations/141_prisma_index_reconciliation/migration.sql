-- Add the remaining indexes declared by schema.prisma. Existing differently
-- named and partial operational indexes are retained.

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_identities_tenant_user_provider
  ON iam.auth_identities (tenant_id, user_id, provider);

CREATE INDEX IF NOT EXISTS studio_session_feedback_tenant_id_review_status_idx
  ON ops.studio_session_feedback (tenant_id, review_status);

CREATE INDEX IF NOT EXISTS trainer_progress_notes_tenant_id_trainer_user_id_member_id__idx
  ON ops.trainer_progress_notes (tenant_id, trainer_user_id, member_id, recorded_at);
