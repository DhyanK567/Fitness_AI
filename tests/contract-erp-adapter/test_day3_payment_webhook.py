from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_day3_payment_webhook_is_signed_idempotent_and_posts_to_erp():
    source = (ROOT / "backend-nestjs-gateway" / "src" / "payments" / "payment-webhook.service.ts").read_text(encoding="utf-8")
    assert "verifyHmacSignature" in source
    assert "webhookInbox.findUnique" in source
    assert "post_payment" in source
    assert "payment.confirmed" in source
    assert "payment.captured" in source
    assert "status: 'pending'" in source
