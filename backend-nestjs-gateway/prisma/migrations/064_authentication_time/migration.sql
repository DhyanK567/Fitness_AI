ALTER TABLE iam.auth_sessions
  ADD COLUMN authenticated_at timestamptz NOT NULL DEFAULT 'epoch'::timestamptz;

-- Existing refresh-token rotations did not retain the original authentication
-- time. Fail closed for account linking until the member signs in again.
ALTER TABLE iam.auth_sessions
  ALTER COLUMN authenticated_at DROP DEFAULT;
