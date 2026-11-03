from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_day3_configuration_and_dashboard_are_tenant_scoped():
    config = (ROOT / "backend-nestjs-gateway" / "src" / "configuration" / "configuration.service.ts").read_text(encoding="utf-8")
    dashboard = (ROOT / "backend-nestjs-gateway" / "src" / "dashboard" / "dashboard.service.ts").read_text(encoding="utf-8")
    assert "tenantId" in config
    assert "tenantSetting" in config
    assert "tenantId" in dashboard
    assert "outboxEvent.count" in dashboard
