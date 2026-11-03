ALTER TABLE ops.webhook_inbox
  DROP CONSTRAINT IF EXISTS webhook_inbox_status_check;

ALTER TABLE ops.webhook_inbox
  ADD CONSTRAINT webhook_inbox_status_check
  CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored'));
