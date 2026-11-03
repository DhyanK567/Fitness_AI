-- Non-destructive migration adding structured AI classification fields to ops.studio_session_feedback
ALTER TABLE ops.studio_session_feedback
  ADD COLUMN IF NOT EXISTS classification jsonb,
  ADD COLUMN IF NOT EXISTS sentiment varchar(20),
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS theme varchar(200),
  ADD COLUMN IF NOT EXISTS low_confidence boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz;

CREATE INDEX IF NOT EXISTS studio_session_feedback_tenant_id_sentiment_idx
  ON ops.studio_session_feedback (tenant_id, sentiment);
