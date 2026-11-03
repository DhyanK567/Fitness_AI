import ast
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "erpnext-custom-app" / "wellness_studio" / "wellness_studio"


def _functions(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}


def test_day2_atomic_erp_methods_exist():
    assert {"book", "cancel", "promote_waitlist"} <= _functions(APP / "api" / "booking.py")
    assert "check_in" in _functions(APP / "api" / "check_in.py")
    assert {"activate", "expire_memberships"} <= _functions(APP / "api" / "membership_activation.py")


def test_day2_booking_uses_row_lock_and_tenant_scope():
    source = (APP / "api" / "booking.py").read_text(encoding="utf-8")
    assert "FOR UPDATE" in source
    assert "tenant = %s" in source
    assert "DuplicateEntryError" in source


def test_booking_rechecks_idempotency_after_session_lock_and_cancels_in_consistent_lock_order():
    source = (APP / "api" / "booking.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
    book_source = ast.get_source_segment(source, functions["book"])
    cancel_source = ast.get_source_segment(source, functions["cancel"])

    session_lock = book_source.index("session_row = _session(session, tenant)")
    retry_check = book_source.index("existing = _idempotent_booking", session_lock)
    booking_insert = book_source.index("booking.insert", retry_check)
    assert book_source.index("existing = _idempotent_booking") < session_lock < retry_check < booking_insert

    session_lock = cancel_source.index("session_row = _session(candidate.session, tenant)")
    booking_lock = cancel_source.index("FROM `tabWS Booking` WHERE name=%s AND tenant=%s FOR UPDATE")
    assert session_lock < booking_lock
    assert "candidate = frappe.db.get_value" in cancel_source


def test_attendance_inputs_fail_closed_and_corrections_lock_before_append(monkeypatch):
    path = APP / "api" / "check_in.py"
    db_calls = []

    class ValidationError(Exception):
        pass

    def throw(message, exception=Exception):
        raise exception(str(message))

    fake_frappe = SimpleNamespace(
        whitelist=lambda **_kwargs: lambda function: function,
        ValidationError=ValidationError,
        throw=throw,
        db=SimpleNamespace(sql=lambda *args, **kwargs: db_calls.append((args, kwargs))),
        _=lambda value: value,
    )
    monkeypatch.setitem(sys.modules, "frappe", fake_frappe)
    monkeypatch.setitem(sys.modules, "wellness_studio.tenant.permissions", SimpleNamespace(require_api_tenant=lambda tenant: tenant))
    spec = importlib.util.spec_from_file_location("check_in_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    with pytest.raises(ValidationError, match="Invalid attendance method"):
        module.check_in("BOOK-1", "tenant-a", method=[])
    with pytest.raises(ValidationError, match="Invalid attendance status"):
        module.correct_attendance("ATT-1", "tenant-a", new_status=[], reason="fix")
    with pytest.raises(ValidationError, match="correction reason"):
        module.correct_attendance("ATT-1", "tenant-a", new_status="Absent", reason=None)
    assert db_calls == []

    source = path.read_text(encoding="utf-8")
    correction_source = ast.get_source_segment(source, next(
        node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == "correct_attendance"
    ))
    assert "WHERE name=%s AND tenant=%s FOR UPDATE" in correction_source
    assert 'doc.append("corrections"' in correction_source
    assert '"previous_value": row.status' in correction_source
    assert '"new_value": new_status' in correction_source


def test_member_creation_rejects_bad_types_and_prevents_mismatched_phone_reuse(monkeypatch):
    class ValidationError(Exception):
        pass

    class DuplicateEntryError(Exception):
        pass

    existing = SimpleNamespace(name="MEM-1", full_name="Existing Person", email="old@example.test")

    def throw(message, exception=Exception):
        raise exception(str(message))

    fake_frappe = SimpleNamespace(
        whitelist=lambda **_kwargs: lambda function: function,
        ValidationError=ValidationError,
        DuplicateEntryError=DuplicateEntryError,
        throw=throw,
        _=lambda value: value,
        db=SimpleNamespace(get_value=lambda *_args, **_kwargs: existing),
    )
    monkeypatch.setitem(sys.modules, "frappe", fake_frappe)
    monkeypatch.setitem(sys.modules, "wellness_studio.tenant.permissions", SimpleNamespace(require_api_tenant=lambda tenant: tenant))
    path = APP / "api" / "member.py"
    spec = importlib.util.spec_from_file_location("member_validation_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    with pytest.raises(ValidationError, match="full name must be text"):
        module.create_member("tenant-a", [], "+14155550123")
    with pytest.raises(ValidationError, match="Invalid member status"):
        module.create_member("tenant-a", "New Person", "+14155550123", status=[])
    with pytest.raises(ValidationError, match="Emergency contact must be a valid phone number"):
        module.create_member("tenant-a", "New Person", "+14155550123", emergency_contact="not-a-phone")
    with pytest.raises(DuplicateEntryError, match="different member"):
        module._existing_member("tenant-a", "+14155550123", "New Person", None)


def test_member_creation_recovers_matching_phone_unique_race(monkeypatch):
    class DuplicateEntryError(Exception):
        pass

    class Row(dict):
        __getattr__ = dict.__getitem__

    lookups = 0

    def get_value(*_args, **_kwargs):
        nonlocal lookups
        lookups += 1
        if lookups == 1:
            return None
        if lookups == 2:
            return Row(name="MEM-1", status="Active", full_name="Same Person", email="same@example.test")
        return Row(name="MEM-1", full_name="Same Person", email="same@example.test", phone="+14155550123",
                   date_of_birth=None, gender="Other", member_since="2026-10-01", status="Active",
                   emergency_contact_phone=None, profile_photo=None)

    def insert_duplicate(**_kwargs):
        raise DuplicateEntryError("tenant phone unique index")

    fake_frappe = SimpleNamespace(
        whitelist=lambda **_kwargs: lambda function: function,
        DuplicateEntryError=DuplicateEntryError,
        ValidationError=type("ValidationError", (Exception,), {}),
        DoesNotExistError=type("DoesNotExistError", (Exception,), {}),
        throw=lambda message, exception=Exception: (_ for _ in ()).throw(exception(str(message))),
        _=lambda value: value,
        db=SimpleNamespace(get_value=get_value),
        get_doc=lambda *_args, **_kwargs: SimpleNamespace(insert=insert_duplicate),
        utils=SimpleNamespace(today=lambda: "2026-10-07"),
    )
    monkeypatch.setitem(sys.modules, "frappe", fake_frappe)
    monkeypatch.setitem(sys.modules, "wellness_studio.tenant.permissions", SimpleNamespace(require_api_tenant=lambda tenant: tenant))
    path = APP / "api" / "member.py"
    spec = importlib.util.spec_from_file_location("member_unique_race_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    result = module.create_member("tenant-a", "Same Person", "+14155550123", email="same@example.test")
    assert result["id"] == "MEM-1"
    assert result["duplicate"] is True


def test_member_creation_deduplicates_by_tenant_phone_without_ignored_idempotency_argument():
    source = (APP / "api" / "member.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    create = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "create_member")
    assert "idempotency_key" not in {argument.arg for argument in create.args.args}
    assert "tenant and phone" in ast.get_docstring(create)
    auth_source = (ROOT / "backend-nestjs-gateway" / "src" / "auth" / "auth.service.ts").read_text(encoding="utf-8")
    assert "idempotency_key: challenge.id" not in auth_source
    lead_source = (APP / "api" / "lead.py").read_text(encoding="utf-8")
    assert "idempotency_key=f\"lead-convert:" not in lead_source


def test_day2_hooks_register_idempotent_expiry_scheduler():
    source = (APP / "hooks.py").read_text(encoding="utf-8")
    assert "wellness_studio.api.membership_activation.expire_memberships" in source


def test_membership_expiry_rechecks_locked_state_and_emits_one_callback(monkeypatch):
    path = APP / "api" / "membership_activation.py"
    row = SimpleNamespace(name="WS-MSHIP-1", tenant="tenant-a", member="WS-MEM-1", status="Active")
    writes = []
    callbacks = []

    def sql(query, values, as_dict=False):
        assert "status='Active' AND end_date < %s FOR UPDATE" in query
        assert values == (row.name, "2026-10-06")
        return [row] if row.status == "Active" else []

    def set_value(_doctype, name, field, value, **_kwargs):
        writes.append((name, field, value))
        row.status = value

    fake_frappe = SimpleNamespace(
        whitelist=lambda **_kwargs: lambda function: function,
        get_all=lambda *_args, **_kwargs: ["WS-MSHIP-1"],
        db=SimpleNamespace(sql=sql, set_value=set_value),
        utils=SimpleNamespace(today=lambda: "2026-10-06"),
        _=lambda value: value,
    )
    monkeypatch.setitem(sys.modules, "frappe", fake_frappe)
    monkeypatch.setitem(sys.modules, "wellness_studio.tenant.permissions", SimpleNamespace(require_api_tenant=lambda tenant: tenant))
    monkeypatch.setitem(sys.modules, "wellness_studio.events.callbacks", SimpleNamespace(send_callback=lambda *args: callbacks.append(args)))
    spec = importlib.util.spec_from_file_location("membership_expiry_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.expire_memberships() == 1
    assert module.expire_memberships() == 0
    assert writes == [(row.name, "status", "Expired")]
    assert len(callbacks) == 1
    assert callbacks[0][:4] == ("membership.expired", "tenant-a", "membership", row.name)


def test_day2_booking_doctype_and_cancel_path_support_waitlist_seat_recovery():
    booking_api = (APP / "api" / "booking.py").read_text(encoding="utf-8")
    booking_doctype = (APP / "booking" / "doctype" / "ws_booking" / "ws_booking.json").read_text(encoding="utf-8")
    assert "Waitlisted" in booking_doctype
    assert '"confirmed_count"' in booking_api
    assert '"waitlist_count"' in booking_api


def test_schedule_booking_materializes_session_under_tenant_schedule_lock():
    source = (APP / "api" / "booking.py").read_text(encoding="utf-8")
    assert "def _get_or_create_session" in source
    assert "FOR UPDATE" in source
    assert "recurrence_rule" in source
    assert '"schedule": class_schedule_id, "session_date": session_date' in source
    assert '"doctype": "WS Class Session"' in source
    assert "def book_by_schedule" in source


def test_day2_erp_hooks_only_reference_implemented_modules_and_tenant_permissions():
    hooks = (APP / "hooks.py").read_text(encoding="utf-8")
    permissions = APP / "tenant" / "permissions.py"
    assert permissions.exists()
    assert "tenant.permissions" in hooks
    assert "notifications." not in hooks
    assert "automation." not in hooks


def test_frappe_doctype_permissions_require_restricted_api_identity(monkeypatch):
    class PermissionError(Exception):
        pass

    request = SimpleNamespace(headers={"X-Tenant-ID": "tenant-a"})
    session = SimpleNamespace(user="ordinary.user@example.test")
    fake_frappe = SimpleNamespace(
        local=SimpleNamespace(request=request),
        session=session,
        get_roles=lambda: ["System Manager"],
        db=SimpleNamespace(
            get_value=lambda *_args, **_kwargs: SimpleNamespace(tenant_code="tenant-a", is_active=1),
            escape=lambda value: "'" + value + "'",
        ),
        PermissionError=PermissionError,
        throw=lambda message, exception=Exception: (_ for _ in ()).throw(exception(message)),
    )
    monkeypatch.setitem(sys.modules, "frappe", fake_frappe)
    path = APP / "tenant" / "permissions.py"
    spec = importlib.util.spec_from_file_location("tenant_permissions_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    document = SimpleNamespace(doctype="WS Member", tenant="tenant-a")
    assert module.has_permission(document) is False
    with pytest.raises(PermissionError):
        module.member_query_conditions()

    session.user = "fitness-api@example.test"
    fake_frappe.get_roles = lambda: ["WS API Integration"]
    # The integration identity is intentionally denied generic DocType access;
    # it can only reach the tenant-checked whitelisted methods.
    assert module.has_permission(document) is False
    assert module.member_query_conditions() == "tenant = 'tenant-a'"


def test_membership_activation_requires_a_paid_membership(monkeypatch):
    activation_path = APP / "api" / "membership_activation.py"
    writes = []

    class PermissionError(Exception):
        pass

    class ValidationError(Exception):
        pass

    class DoesNotExistError(Exception):
        pass

    row = SimpleNamespace(name="WS-MSHIP-1", status="Pending Approval", payment_status="Pending")

    def throw(message, exception=Exception):
        raise exception(str(message))

    fake_frappe = SimpleNamespace(
        whitelist=lambda **_kwargs: lambda function: function,
        db=SimpleNamespace(get_value=lambda *_args, **_kwargs: row, set_value=lambda *args, **kwargs: writes.append((args, kwargs))),
        session=SimpleNamespace(user="gateway-api@example.test"),
        utils=SimpleNamespace(now_datetime=lambda: "2026-10-06 12:00:00"),
        PermissionError=PermissionError,
        ValidationError=ValidationError,
        DoesNotExistError=DoesNotExistError,
        throw=throw,
        _=lambda value: value,
    )
    fake_permissions = SimpleNamespace(require_api_tenant=lambda tenant: tenant)
    monkeypatch.setitem(sys.modules, "frappe", fake_frappe)
    monkeypatch.setitem(sys.modules, "wellness_studio.tenant.permissions", fake_permissions)
    spec = importlib.util.spec_from_file_location("membership_activation_under_test", activation_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    with pytest.raises(PermissionError, match="before payment"):
        module.activate("WS-MSHIP-1", "tenant-a")
    assert writes == []

    row.payment_status = "Paid"
    assert module.activate("WS-MSHIP-1", "tenant-a")["status"] == "Active"
    assert writes and writes[0][0][:3] == ("WS Membership", "WS-MSHIP-1", {
        "status": "Active", "approved_by": "gateway-api@example.test", "approved_on": "2026-10-06 12:00:00",
    })


def test_membership_payment_uses_snapshotted_plan_price_and_activates_in_same_erp_transaction():
    source = (APP / "api" / "payment.py").read_text(encoding="utf-8")
    assert 'Decimal(str(snapshot["price"]))' in source
    assert "actual_amount != expected_amount" in source
    assert 'membership_doc.payment_status = "Paid"' in source
    assert 'membership_doc.status = "Active"' in source
    assert 'membership_doc.save(ignore_permissions=True)' in source


def test_paid_future_membership_cannot_be_used_to_book_early():
    state_path = APP / "rules" / "membership_state.py"
    spec = importlib.util.spec_from_file_location("membership_state_under_test", state_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from datetime import date

    assert not module.can_book("Active", date(2026, 10, 31), date(2026, 10, 6), start_date=date(2026, 10, 7))
    assert module.can_book("Active", date(2026, 10, 31), date(2026, 10, 7), start_date=date(2026, 10, 7))
