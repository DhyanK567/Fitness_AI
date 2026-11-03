import json
import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest


ROOT = Path(__file__).resolve().parents[2]
ERP = ROOT / "erpnext-custom-app" / "wellness_studio" / "wellness_studio"
API = ROOT / "backend-nestjs-gateway" / "src"


def test_day4_event_registration_has_paid_hold_and_expiry_operations():
    doctype = json.loads((ERP / "events" / "doctype" / "ws_event_registration" / "ws_event_registration.json").read_text(encoding="utf-8"))
    fields = {field["fieldname"] for field in doctype["fields"]}
    source = (ERP / "api" / "event_registration.py").read_text(encoding="utf-8")
    assert {"tenant", "event", "status", "hold_expires_at", "payment"} <= fields
    assert "FOR UPDATE" in source
    assert {"register", "confirm_payment", "expire_payment_holds"} <= {
        line.split("(")[0].split()[-1] for line in source.splitlines() if line.startswith("def ")
    }
    events_api = (ERP / "api" / "events.py").read_text(encoding="utf-8")
    assert 'filters["audience"] = "Public"' in events_api
    assert 'filters["is_published"] = 1' in events_api
    assert 'event_row.audience != "Public" or not event_row.is_published' in source
    assert "Paid event checkout is not enabled in Phase 1" in source
    assert "payment_row.event_registration != registration" in source
    assert "payment_row.member != row.member" in source
    assert "payment_amount != event_price" in source


def test_event_payment_confirmation_rejects_a_paid_record_for_another_registration(monkeypatch):
    class ValidationError(Exception):
        pass

    class DoesNotExistError(Exception):
        pass

    registration = SimpleNamespace(
        name="EVR-1", event="EVT-1", member="MEM-1", payment=None,
        status="Pending Payment", hold_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    event = SimpleNamespace(
        name="EVT-1", capacity=10, confirmed_count=1, waitlist_count=0,
        is_paid=1, price=500, status="Upcoming", audience="Public", is_published=1,
    )
    payment = SimpleNamespace(
        name="PAY-1", event_registration="EVR-OTHER", member="MEM-1",
        purpose="event", amount=500, status="Paid",
    )
    writes = []

    def sql(query, _values, as_dict=False):
        if "SELECT event FROM `tabWS Event Registration`" in query:
            return [SimpleNamespace(event=registration.event)]
        if "FROM `tabWS Event`" in query:
            return [event]
        if "SELECT name, event, member, payment, status, hold_expires_at" in query:
            return [registration]
        if "FROM `tabWS Payment Record`" in query:
            return [payment]
        raise AssertionError(f"Unexpected SQL in event-payment test: {query}")

    fake_frappe = SimpleNamespace(
        whitelist=lambda **_kwargs: lambda function: function,
        db=SimpleNamespace(sql=sql, set_value=lambda *args, **kwargs: writes.append((args, kwargs))),
        utils=SimpleNamespace(now_datetime=lambda: datetime.now(timezone.utc)),
        ValidationError=ValidationError,
        DoesNotExistError=DoesNotExistError,
        throw=lambda message, error=Exception: (_ for _ in ()).throw(error(message)),
        _=lambda message: message,
    )
    monkeypatch.setitem(sys.modules, "frappe", fake_frappe)
    monkeypatch.setitem(sys.modules, "wellness_studio.tenant.permissions", SimpleNamespace(require_api_tenant=lambda tenant: tenant))
    spec = importlib.util.spec_from_file_location("event_registration_payment_test", ERP / "api" / "event_registration.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    with pytest.raises(ValidationError, match="does not belong"):
        module.confirm_payment("EVR-1", "PAY-1", "tenant-a")
    assert writes == []

    payment.event_registration = "EVR-1"
    result = module.confirm_payment("EVR-1", "PAY-1", "tenant-a")
    assert result == {"registration_id": "EVR-1", "status": "Confirmed", "duplicate": False}
    assert writes[0][0][0:2] == ("WS Event Registration", "EVR-1")


def test_day4_erp_callbacks_are_signed_and_enqueued_after_commit():
    source = (ERP / "events" / "callbacks.py").read_text(encoding="utf-8")
    assert "hmac.new" in source
    assert "hashlib.sha256" in source
    assert "enqueue_after_commit=True" in source
    assert "X-ERP-Signature" in source
    assert "https" in source
    assert "secret=secret" not in source
    assert 'secret = frappe.conf.get("fitness_api_callback_secret")' in source


def test_day5_gateway_preserves_raw_webhook_body_and_has_boundary_controls():
    main = (API / "main.ts").read_text(encoding="utf-8")
    payment_webhook = (API / "payments" / "payment-webhook.controller.ts").read_text(encoding="utf-8")
    erp_callback = (API / "erpnext" / "erp-callback.controller.ts").read_text(encoding="utf-8")
    rate_limit = (API / "auth" / "login-rate-limit.guard.ts").read_text(encoding="utf-8")
    assert "REQUEST_BODY_LIMIT" in main
    assert "CORS_ALLOWED_ORIGINS" in main
    assert "ValidationPipe" in main
    assert "request.rawBody" in payment_webhook
    assert "request.rawBody" in erp_callback
    assert "TOO_MANY_REQUESTS" in rate_limit
