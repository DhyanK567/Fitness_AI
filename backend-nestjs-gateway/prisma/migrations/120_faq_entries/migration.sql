-- ============================================================
-- 120: FAQ entries table for Enquiry Assistant (AI-5)
-- Database Design Document §3.6 / §5A (config.faq_entries)
-- ============================================================

CREATE TABLE IF NOT EXISTS config.faq_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  question text NOT NULL,
  answer text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  status varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  approved_by uuid REFERENCES iam.users(id),
  approved_at timestamptz,
  search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', question || ' ' || answer)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faq_entries_search_tsv
  ON config.faq_entries USING gin(search_tsv)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_faq_entries_tenant_status
  ON config.faq_entries (tenant_id, status);

CALL platform.enable_tenant_rls('config', 'faq_entries');
CALL platform.add_updated_at_trigger('config', 'faq_entries');
