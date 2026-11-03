from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_day3_callback_verification_uses_sha256_and_constant_time_compare():
    source = (ROOT / "backend-nestjs-gateway" / "src" / "common" / "signature.ts").read_text(encoding="utf-8")
    assert "createHmac" in source
    assert "timingSafeEqual" in source
    assert "sha256" in source


def test_day3_payment_posting_is_tenant_scoped_and_idempotent():
    source = (ROOT / "erpnext-custom-app" / "wellness_studio" / "wellness_studio" / "api" / "payment.py").read_text(encoding="utf-8")
    assert "idempotency_key" in source
    assert "tenant" in source
    assert '"Paid"' in source
    assert '"duplicate": True' in source


def test_staff_routes_require_signed_token_and_documented_permissions():
    guard = (ROOT / "backend-nestjs-gateway" / "src" / "common" / "staff-access.guard.ts").read_text(encoding="utf-8")
    settings = (ROOT / "backend-nestjs-gateway" / "src" / "configuration" / "configuration.controller.ts").read_text(encoding="utf-8")
    payments = (ROOT / "backend-nestjs-gateway" / "src" / "payments" / "payments.controller.ts").read_text(encoding="utf-8")
    assert "verifyAccessToken" in guard
    assert "claims.tenant !== request.tenantId" in guard
    assert "settings:write" in settings
    assert "payments:write" in payments
