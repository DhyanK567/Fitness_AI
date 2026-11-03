CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_attendance_booking
  ON ops.studio_attendance (tenant_id, booking_id);

CREATE TABLE IF NOT EXISTS ops.membership_freeze_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES ops.studio_members(id) ON DELETE CASCADE, requested_by uuid NOT NULL REFERENCES iam.users(id),
  days integer NOT NULL CHECK (days IN (7, 14)), reason varchar(80) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Declined')),
  decision_note text, reviewed_by uuid REFERENCES iam.users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_freeze_tenant_status ON ops.membership_freeze_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS ix_freeze_tenant_member ON ops.membership_freeze_requests(tenant_id, member_id);

CREATE TABLE IF NOT EXISTS ops.studio_session_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  session_id uuid, member_id uuid NOT NULL REFERENCES ops.studio_members(id) ON DELETE CASCADE,
  trainer_user_id uuid REFERENCES iam.users(id), submitted_by uuid NOT NULL REFERENCES iam.users(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5), strengths text[] NOT NULL DEFAULT '{}', improvements text[] NOT NULL DEFAULT '{}',
  comment text, review_status varchar(30) NOT NULL DEFAULT 'New', follow_up_note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_feedback_trainer ON ops.studio_session_feedback(tenant_id, trainer_user_id);
CREATE INDEX IF NOT EXISTS ix_feedback_member ON ops.studio_session_feedback(tenant_id, member_id);

CREATE TABLE IF NOT EXISTS ops.trainer_workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  trainer_user_id uuid NOT NULL REFERENCES iam.users(id), member_id uuid NOT NULL REFERENCES ops.studio_members(id) ON DELETE CASCADE,
  title varchar(160) NOT NULL, goal varchar(240), exercises jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_workouts_trainer_member ON ops.trainer_workout_plans(tenant_id, trainer_user_id, member_id);

CREATE TABLE IF NOT EXISTS ops.trainer_progress_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  trainer_user_id uuid NOT NULL REFERENCES iam.users(id), member_id uuid NOT NULL REFERENCES ops.studio_members(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL, metrics jsonb NOT NULL DEFAULT '{}', notes text, milestone varchar(240),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_progress_trainer_member ON ops.trainer_progress_notes(tenant_id, trainer_user_id, member_id, recorded_at DESC);

DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['membership_freeze_requests','studio_session_feedback','trainer_workout_plans','trainer_progress_notes'] LOOP
    EXECUTE format('ALTER TABLE ops.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON ops.%I', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON ops.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $policies$;

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fitness_app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ops.membership_freeze_requests, ops.studio_session_feedback, ops.trainer_workout_plans, ops.trainer_progress_notes TO fitness_app_runtime;
  END IF;
END $grant$;
