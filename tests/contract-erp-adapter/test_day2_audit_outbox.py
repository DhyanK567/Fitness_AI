from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_day2_audit_and_outbox_share_a_transaction():
    source = (ROOT / "backend-nestjs-gateway" / "src" / "common" / "audit-outbox.service.ts").read_text(encoding="utf-8")
    assert "withTenant(input.tenantId" in source
    assert "auditLog.create" in source
    assert "outboxEvent.create" in source


def test_day5_payment_webhook_claim_states_are_allowed_by_database_migration():
    migration = (ROOT / "backend-nestjs-gateway" / "prisma" / "migrations" / "060_webhook_claim_states" / "migration.sql").read_text(encoding="utf-8")
    assert "'processing'" in migration
    assert "'ignored'" in migration
    assert "'failed'" in migration
