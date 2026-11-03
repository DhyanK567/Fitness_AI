CREATE TABLE config.tenant_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES platform.tenants(id),
  display_name varchar(120) NOT NULL,
  logo_url text,
  primary_color varchar(9),
  secondary_color varchar(9),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE config.tenant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  setting_key varchar(100) NOT NULL,
  setting_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, setting_key)
);
CREATE TABLE config.event_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  name varchar(100) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE TABLE config.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  code varchar(100) NOT NULL,
  channel varchar(20) NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code, channel)
);
CREATE TABLE config.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  event_type varchar(100) NOT NULL,
  template_id uuid REFERENCES config.notification_templates(id),
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_type)
);

CALL platform.enable_tenant_rls('config', 'tenant_branding');
CALL platform.enable_tenant_rls('config', 'tenant_settings');
CALL platform.enable_tenant_rls('config', 'event_categories');
CALL platform.enable_tenant_rls('config', 'notification_templates');
CALL platform.enable_tenant_rls('config', 'notification_rules');
CALL platform.add_updated_at_trigger('config', 'tenant_branding');
CALL platform.add_updated_at_trigger('config', 'tenant_settings');
CALL platform.add_updated_at_trigger('config', 'event_categories');
CALL platform.add_updated_at_trigger('config', 'notification_templates');
CALL platform.add_updated_at_trigger('config', 'notification_rules');
