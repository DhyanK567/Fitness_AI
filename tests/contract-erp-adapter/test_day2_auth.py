from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_day2_staff_auth_has_login_invite_and_reset_paths():
    source = (ROOT / "backend-nestjs-gateway" / "src" / "auth" / "auth.controller.ts").read_text(encoding="utf-8")
    for path in ("login", "invite", "reset-password"):
        assert f"'{path}'" in source
    service = (ROOT / "backend-nestjs-gateway" / "src" / "auth" / "auth.service.ts").read_text(encoding="utf-8")
    assert "tenantId" in service
    assert "signAccessToken" in service
