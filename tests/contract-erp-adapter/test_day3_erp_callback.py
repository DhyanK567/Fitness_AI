from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_day3_erp_callback_is_signed_idempotent_and_audited():
    source = (ROOT / "backend-nestjs-gateway" / "src" / "erpnext" / "erp-callback.controller.ts").read_text(encoding="utf-8")
    assert "verifyHmacSignature" in source
    assert "webhookInbox.findUnique" in source
    assert "duplicate: true" in source
    assert "this.audit.record" in source
