-- Preserve the selective worker index while also providing the full index
-- represented by schema.prisma.

DO $$
BEGIN
  IF to_regclass('platform.ix_platform_webhook_inbox_received') IS NOT NULL
     AND to_regclass('platform.ix_platform_webhook_inbox_received_pending') IS NULL THEN
    ALTER INDEX platform.ix_platform_webhook_inbox_received
      RENAME TO ix_platform_webhook_inbox_received_pending;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_platform_webhook_inbox_received
  ON platform.platform_webhook_inbox (received_at);
