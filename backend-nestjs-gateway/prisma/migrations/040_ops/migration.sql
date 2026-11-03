CREATE TABLE ops.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  event_type varchar(100) NOT NULL,
  subject_type varchar(60) NOT NULL,
  subject_ref varchar(140) NOT NULL,
  payload jsonb NOT NULL,
  correlation_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatching', 'delivered', 'failed', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_outbox_dispatch ON ops.outbox_events (status, next_attempt_at) WHERE status IN ('pending', 'failed');
CREATE INDEX ix_outbox_tenant_created ON ops.outbox_events (tenant_id, created_at DESC);

CREATE TABLE ops.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  idempotency_key varchar(255) NOT NULL,
  request_hash char(64) NOT NULL,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE ops.webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  provider varchar(40) NOT NULL,
  provider_event_id varchar(255) NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_event_id)
);

CALL platform.enable_tenant_rls('ops', 'outbox_events');
CALL platform.enable_tenant_rls('ops', 'idempotency_keys');
CALL platform.enable_tenant_rls('ops', 'webhook_inbox');
CALL platform.add_updated_at_trigger('ops', 'outbox_events');
CALL platform.add_updated_at_trigger('ops', 'idempotency_keys');
CALL platform.add_updated_at_trigger('ops', 'webhook_inbox');
