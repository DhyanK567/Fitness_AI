ALTER TABLE iam.user_credentials
  ADD COLUMN failed_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz;

ALTER TABLE iam.user_credentials
  ADD CONSTRAINT user_credentials_failed_attempts_nonnegative
  CHECK (failed_attempts >= 0);
