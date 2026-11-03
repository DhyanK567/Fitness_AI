-- ============================================================
-- 133: Studio domain models for Import/Export (PostgreSQL store)
-- Renumbered from 130 to sequence after 132_owner_registration_and_verification.
-- Creates studio_* tables in ops schema with tenant-scoped RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS ops.studio_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  full_name varchar(160) NOT NULL,
  email     citext NOT NULL,
  phone     varchar(16) NOT NULL DEFAULT '',
  plan      varchar(40) NOT NULL DEFAULT 'Premium',
  status    varchar(20) NOT NULL DEFAULT 'Active',
  joined    timestamptz NOT NULL DEFAULT now(),
  expiry    timestamptz,
  coach     varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.studio_leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES platform.tenants(id),
  name         varchar(160) NOT NULL,
  email        citext,
  phone        varchar(16),
  source       varchar(40) NOT NULL DEFAULT 'Spreadsheet Import',
  stage        varchar(40) NOT NULL DEFAULT 'New enquiry',
  follow_up_date timestamptz,
  assigned     varchar(160),
  plan         varchar(40) NOT NULL DEFAULT 'Premium',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.studio_classes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  name      varchar(160) NOT NULL,
  category  varchar(40) NOT NULL DEFAULT 'Strength',
  class_date timestamptz NOT NULL,
  start_time varchar(8) NOT NULL,
  end_time   varchar(8),
  trainer   varchar(160) NOT NULL,
  room      varchar(160),
  capacity  int NOT NULL DEFAULT 12,
  status    varchar(20) NOT NULL DEFAULT 'Scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.studio_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES platform.tenants(id),
  name        varchar(160) NOT NULL,
  plan_type   varchar(40) NOT NULL,
  price_inr   int NOT NULL,
  session_limit int NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.studio_bookings (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  class_id  varchar(160) NOT NULL,
  member_id varchar(160) NOT NULL,
  status    varchar(20) NOT NULL DEFAULT 'Confirmed',
  booked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.studio_attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES platform.tenants(id),
  booking_id  varchar(160) NOT NULL,
  status      varchar(20) NOT NULL DEFAULT 'Present',
  checked_in_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.studio_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES platform.tenants(id),
  ref            varchar(160) NOT NULL,
  date           timestamptz NOT NULL,
  member_id      varchar(160) NOT NULL,
  type           varchar(40) NOT NULL,
  method         varchar(40) NOT NULL,
  status         varchar(20) NOT NULL DEFAULT 'Pending',
  amount         real NOT NULL DEFAULT 0,
  refunded_amount real NOT NULL DEFAULT 0,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.studio_events (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  title     varchar(200) NOT NULL,
  category  varchar(40) NOT NULL DEFAULT 'General',
  start_at  timestamptz NOT NULL,
  end_at    timestamptz NOT NULL,
  venue     varchar(160) NOT NULL DEFAULT '',
  organizer varchar(160) NOT NULL DEFAULT '',
  capacity  int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_studio_members_tenant_email ON ops.studio_members (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_studio_members_tenant_phone ON ops.studio_members (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_studio_members_tenant_status ON ops.studio_members (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_studio_leads_tenant_email ON ops.studio_leads (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_studio_leads_tenant_phone ON ops.studio_leads (tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_studio_leads_tenant_stage ON ops.studio_leads (tenant_id, stage);

CREATE INDEX IF NOT EXISTS idx_studio_classes_tenant_name_date ON ops.studio_classes (tenant_id, name, class_date, start_time);
CREATE INDEX IF NOT EXISTS idx_studio_classes_tenant_status ON ops.studio_classes (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_studio_memberships_tenant_name ON ops.studio_memberships (tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_studio_memberships_tenant_active ON ops.studio_memberships (tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_studio_bookings_tenant_class ON ops.studio_bookings (tenant_id, class_id);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_tenant_member ON ops.studio_bookings (tenant_id, member_id);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_tenant_status ON ops.studio_bookings (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_studio_attendance_tenant_booking ON ops.studio_attendance (tenant_id, booking_id);
CREATE INDEX IF NOT EXISTS idx_studio_attendance_tenant_status ON ops.studio_attendance (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_studio_payments_tenant_ref ON ops.studio_payments (tenant_id, ref);
CREATE INDEX IF NOT EXISTS idx_studio_payments_tenant_member ON ops.studio_payments (tenant_id, member_id);
CREATE INDEX IF NOT EXISTS idx_studio_payments_tenant_status ON ops.studio_payments (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_studio_events_tenant_title ON ops.studio_events (tenant_id, title);
CREATE INDEX IF NOT EXISTS idx_studio_events_tenant_start ON ops.studio_events (tenant_id, start_at);

-- RLS + updated_at triggers
CALL platform.enable_tenant_rls('ops', 'studio_members');
CALL platform.add_updated_at_trigger('ops', 'studio_members');
CALL platform.enable_tenant_rls('ops', 'studio_leads');
CALL platform.add_updated_at_trigger('ops', 'studio_leads');
CALL platform.enable_tenant_rls('ops', 'studio_classes');
CALL platform.add_updated_at_trigger('ops', 'studio_classes');
CALL platform.enable_tenant_rls('ops', 'studio_memberships');
CALL platform.add_updated_at_trigger('ops', 'studio_memberships');
CALL platform.enable_tenant_rls('ops', 'studio_bookings');
CALL platform.add_updated_at_trigger('ops', 'studio_bookings');
CALL platform.enable_tenant_rls('ops', 'studio_attendance');
CALL platform.add_updated_at_trigger('ops', 'studio_attendance');
CALL platform.enable_tenant_rls('ops', 'studio_payments');
CALL platform.add_updated_at_trigger('ops', 'studio_payments');
CALL platform.enable_tenant_rls('ops', 'studio_events');
CALL platform.add_updated_at_trigger('ops', 'studio_events');
