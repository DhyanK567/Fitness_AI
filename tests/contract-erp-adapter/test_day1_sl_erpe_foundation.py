import ast
import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
APP_ROOT = ROOT / "erpnext-custom-app" / "wellness_studio" / "wellness_studio"
MIGRATIONS = ROOT / "backend-nestjs-gateway" / "prisma" / "migrations"


def _migration(name):
    return (MIGRATIONS / name / "migration.sql").read_text(encoding="utf-8")


def test_day1_contract_freeze_lists_every_p0_openapi_resource():
    freeze = (ROOT / "shared" / "api-contracts" / "CONTRACT_FREEZE_DAY_1.md").read_text(encoding="utf-8")
    for resource in (
        "members.yaml",
        "memberships.yaml",
        "classes.yaml",
        "class-schedules.yaml",
        "schedules.yaml",
        "bookings.yaml",
        "attendance.yaml",
        "leads.yaml",
        "payments.yaml",
    ):
        assert resource in freeze


def test_openapi_contract_resolves_every_path_reference_and_includes_google_doc_actions():
    api_root = ROOT / "shared" / "api-contracts"
    contract = yaml.safe_load((api_root / "openapi.yaml").read_text(encoding="utf-8"))
    expected_paths = {
        "/members",
        "/members/{id}",
        "/memberships",
        "/memberships/{id}",
        "/memberships/{id}/cancel",
        "/classes",
        "/classes/{id}",
        "/classes/{class_id}/schedules",
        "/classes/{class_id}/schedules/{schedule_id}",
        "/bookings",
        "/bookings/{id}",
        "/bookings/{id}/cancel",
        "/attendance",
        "/attendance/{id}",
        "/attendance/class/{class_id}",
        "/attendance/member/{member_id}",
        "/leads",
        "/leads/{id}",
        "/leads/{id}/convert",
        "/payments",
        "/payments/{id}",
        "/payments/webhook",
        "/events",
        "/events/{id}",
        "/events/{id}/registrations",
        "/events/public",
        "/events/public/{id}/registrations",
    }
    assert expected_paths <= set(contract["paths"])
    assert "/schedules" not in contract["paths"]
    assert "/class-schedules" not in contract["paths"]

    for path_item in contract["paths"].values():
        ref = path_item["$ref"]
        location, fragment = ref.split("#", 1)
        referenced = yaml.safe_load((api_root / location).read_text(encoding="utf-8"))
        target = referenced
        for token in fragment.lstrip("/").split("/"):
            target = target[token.replace("~1", "/").replace("~0", "~")]
        assert isinstance(target, dict)


def test_google_doc_contract_fields_are_frozen_for_booking_attendance_leads_and_payments():
    api_root = ROOT / "shared" / "api-contracts" / "schemas"
    documents = {
        path.stem: yaml.safe_load(path.read_text(encoding="utf-8"))
        for path in api_root.glob("*.yaml")
    }
    assert set(documents["bookings"]["Booking"]["properties"]) >= {
        "class_schedule_id",
        "booked_at",
        "payment_id",
    }
    assert set(documents["attendance"]["Attendance"]["properties"]) >= {
        "booking_id",
        "check_in_time",
        "check_out_time",
    }
    assert set(documents["leads"]["Lead"]["properties"]) >= {
        "full_name",
        "assigned_to",
        "created_at",
    }
    assert set(documents["payments"]["Payment"]["properties"]) >= {
        "membership_id",
        "booking_id",
        "razorpay_order_id",
        "razorpay_payment_id",
        "paid_at",
    }


def test_day1_postgres_migrations_cover_the_documented_sl_foundation():
    expected_tables = {
        "010_platform": {
            "platform.subscription_tiers",
            "platform.tier_features",
            "platform.tenants",
            "platform.tenant_domains",
            "platform.tenant_feature_flags",
            "platform.studios",
            "platform.branches",
        },
        "020_iam": {
            "iam.users",
            "iam.user_credentials",
            "iam.auth_identities",
            "iam.roles",
            "iam.permissions",
            "iam.role_permissions",
            "iam.user_role_assignments",
            "iam.permission_grants",
            "iam.user_erp_links",
            "iam.auth_sessions",
            "iam.otp_challenges",
        },
        "030_config": {
            "config.tenant_branding",
            "config.tenant_settings",
            "config.event_categories",
            "config.notification_templates",
            "config.notification_rules",
        },
        "040_ops": {
            "ops.outbox_events",
            "ops.idempotency_keys",
            "ops.webhook_inbox",
        },
        "050_audit": {"audit.audit_logs", "audit.security_events"},
    }
    bootstrap = _migration("000_bootstrap")
    assert "platform.current_tenant" in bootstrap
    assert "ENABLE ROW LEVEL SECURITY" in bootstrap
    assert "FORCE ROW LEVEL SECURITY" in bootstrap

    for migration, tables in expected_tables.items():
        sql = _migration(migration)
        for table in tables:
            assert f"CREATE TABLE {table}" in sql
        if migration != "010_platform":
            assert "CALL platform.enable_tenant_rls" in sql


def test_day1_audit_migration_is_append_only():
    sql = _migration("050_audit")
    assert "CREATE FUNCTION audit.forbid_mutation" in sql
    assert "BEFORE UPDATE OR DELETE ON audit.audit_logs" in sql
    assert "BEFORE UPDATE OR DELETE ON audit.security_events" in sql


def test_audit_tables_reject_truncate_as_well_as_row_mutations():
    sql = _migration("065_audit_truncate_guard")
    assert "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit.audit_logs FROM PUBLIC" in sql
    assert "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit.security_events FROM PUBLIC" in sql
    assert "rolname = 'app_rw'" in sql
    assert "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit.audit_logs FROM app_rw" in sql
    assert "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit.security_events FROM app_rw" in sql
    assert "BEFORE TRUNCATE ON audit.audit_logs" in sql
    assert "BEFORE TRUNCATE ON audit.security_events" in sql
    assert sql.count("FOR EACH STATEMENT EXECUTE FUNCTION audit.forbid_mutation()") == 2


def test_security_events_support_unresolved_tenant_without_cross_tenant_reads():
    sql = _migration("066_nullable_security_event_tenant")
    schema = (ROOT / "backend-nestjs-gateway" / "prisma" / "schema.prisma").read_text(encoding="utf-8")
    security_event = schema.split("model SecurityEvent {", 1)[1].split("\n}", 1)[0]
    assert "ALTER COLUMN tenant_id DROP NOT NULL" in sql
    assert "USING (tenant_id = platform.current_tenant())" in sql
    assert "WITH CHECK (tenant_id = platform.current_tenant() OR tenant_id IS NULL)" in sql
    assert "ADD COLUMN ip_address inet" in sql
    assert "ADD COLUMN route varchar(200)" in sql
    assert "DROP CONSTRAINT %I" in sql
    assert "tenant_column.attname = 'tenant_id'" in sql
    assert "ix_security_events_tenant_type_time" in sql
    assert "ix_security_events_ip_time" in sql
    assert "tenantId      String?  @map(\"tenant_id\")" in security_event
    assert "ipAddress     String?  @map(\"ip_address\") @db.Inet" in security_event
    assert "route         String?  @db.VarChar(200)" in security_event


def test_day1_frappe_baseline_has_the_assigned_draft_doctypes_and_health_endpoint():
    required_doctypes = {
        "Wellness Tenant Scope",
        "WS Member",
        "WS Member Plan",
        "WS Membership",
        "WS Class Type",
        "WS Class Session",
        "WS Booking",
        "WS Session Attendance",
        "WS Payment Record",
        "WS Event",
        "WS Lead",
    }
    found = set()
    for path in APP_ROOT.rglob("*.json"):
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            continue
        document = json.loads(text)
        if document.get("doctype") == "DocType":
            found.add(document.get("name"))
    assert required_doctypes <= found

    health = APP_ROOT / "api" / "health.py"
    tree = ast.parse(health.read_text(encoding="utf-8"))
    assert "health" in {node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)}


def test_gateway_erp_readiness_uses_the_assigned_health_target():
    source = (ROOT / "backend-nestjs-gateway" / "src" / "erpnext" / "erpnext.service.ts").read_text(encoding="utf-8")
    assert "wellness_studio.api.health.health" in source
    assert not re.search(r"fitness_ai\.api\.health", source)
