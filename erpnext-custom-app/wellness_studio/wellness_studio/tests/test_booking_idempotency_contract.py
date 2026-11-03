"""Unit tests for Frappe booking idempotency, reconciliation, and cancellation contracts.

Tests deterministic idempotency key persistence, payload mapping, conflicting key
rejection, cancellation idempotency, and capacity consistency in wellness_studio.api.booking.
Does not call live business endpoints or external databases.
"""

from __future__ import annotations

import types
import pytest

import frappe
from wellness_studio.api.booking import (
    _booking_payload,
    _get_booking,
    _idempotent_booking,
    list_bookings,
    cancel,
)


class MockDbRow(types.SimpleNamespace):
    def __getattr__(self, name):
        return None


def test_booking_payload_includes_idempotency_key():
    """Verify _booking_payload returns idempotency_key when present and None when absent."""
    # Mock row with idempotency_key
    row_with_key = types.SimpleNamespace(
        name="WS-BK-001",
        member="MEM-100",
        schedule="SCH-200",
        booking_date="2026-10-26 10:00:00",
        status="Confirmed",
        idempotency_key="idemp-key-abc-123",
    )
    # Stub get_value for payment lookup
    frappe.db.get_value = lambda doctype, filters, field: None

    payload1 = _booking_payload(row_with_key, tenant="tenant-test")
    assert payload1["id"] == "WS-BK-001"
    assert payload1["idempotency_key"] == "idemp-key-abc-123"

    # Row without idempotency_key
    row_without_key = types.SimpleNamespace(
        name="WS-BK-002",
        member="MEM-100",
        schedule="SCH-200",
        booking_date="2026-10-26 10:00:00",
        status="Confirmed",
    )
    payload2 = _booking_payload(row_without_key, tenant="tenant-test")
    assert payload2["id"] == "WS-BK-002"
    assert payload2["idempotency_key"] is None


def test_get_booking_includes_idempotency_key():
    """Verify _get_booking queries and returns idempotency_key."""
    captured_queries = []

    def mock_sql(query, params, as_dict=False):
        captured_queries.append((query, params))
        return [
            MockDbRow(
                name="WS-BK-001",
                member="MEM-100",
                schedule="SCH-200",
                booking_date="2026-10-26",
                status="Confirmed",
                idempotency_key="idemp-key-get-999",
            )
        ]

    frappe.db.sql = mock_sql
    frappe.db.get_value = lambda *args, **kwargs: None

    booking = _get_booking("tenant-test", "WS-BK-001")
    assert booking is not None
    assert booking["idempotency_key"] == "idemp-key-get-999"
    assert "b.idempotency_key" in captured_queries[0][0]


def test_list_bookings_includes_idempotency_key():
    """Verify list_bookings query includes b.idempotency_key and maps it in response."""
    captured_queries = []

    def mock_sql(query, params, as_dict=False):
        captured_queries.append((query, params))
        return [
            MockDbRow(
                name="WS-BK-001",
                member="MEM-100",
                schedule="SCH-200",
                booking_date="2026-10-26",
                status="Confirmed",
                idempotency_key="idemp-key-list-111",
            ),
            MockDbRow(
                name="WS-BK-002",
                member="MEM-100",
                schedule="SCH-300",
                booking_date="2026-10-27",
                status="Waitlisted",
                idempotency_key="idemp-key-list-222",
            ),
        ]

    frappe.db.sql = mock_sql
    frappe.db.get_value = lambda doctype, *args, **kwargs: (
        types.SimpleNamespace(tenant_code="test-tenant", is_active=True)
        if doctype == "Wellness Tenant Scope"
        else None
    )

    result = list_bookings("test-tenant", member_filter="MEM-100")
    assert len(result) == 2
    assert result[0]["idempotency_key"] == "idemp-key-list-111"
    assert result[1]["idempotency_key"] == "idemp-key-list-222"
    assert "b.idempotency_key" in captured_queries[0][0]


def test_idempotent_booking_returns_existing_on_repeated_key():
    """Verify _idempotent_booking returns duplicate: True when same key is submitted for same member & session."""
    def mock_sql(query, params, as_dict=False):
        return [
            MockDbRow(
                name="WS-BK-EXISTING-001",
                member="MEM-100",
                session="SESS-500",
                status="Confirmed",
            )
        ]

    frappe.db.sql = mock_sql

    result = _idempotent_booking(
        tenant="tenant-test",
        key="idemp-repeat-key-1",
        member="MEM-100",
        session="SESS-500",
    )
    assert result is not None
    assert result["booking_id"] == "WS-BK-EXISTING-001"
    assert result["status"] == "Confirmed"
    assert result["duplicate"] is True


def test_idempotent_booking_rejects_key_reused_for_conflicting_operation():
    """Verify _idempotent_booking throws ValidationError when key is reused for different member or session."""
    def mock_sql(query, params, as_dict=False):
        return [
            MockDbRow(
                name="WS-BK-001",
                member="MEM-100",
                session="SESS-500",
                status="Confirmed",
            )
        ]

    frappe.db.sql = mock_sql

    # Case 1: Same session, different member
    with pytest.raises(frappe.ValidationError) as exc1:
        _idempotent_booking(
            tenant="tenant-test",
            key="idemp-conflict-key",
            member="MEM-DIFFERENT",
            session="SESS-500",
        )
    assert "Idempotency key was already used for a different booking" in str(exc1.value)

    # Case 2: Same member, different session
    with pytest.raises(frappe.ValidationError) as exc2:
        _idempotent_booking(
            tenant="tenant-test",
            key="idemp-conflict-key",
            member="MEM-100",
            session="SESS-DIFFERENT",
        )
    assert "Idempotency key was already used for a different booking" in str(exc2.value)


def test_cancellation_retries_and_capacity_consistency():
    """Verify cancel is idempotent on repeated requests and does not double-decrement capacity."""
    # State tracking
    booking_status = {"status": "Confirmed"}
    session_capacity = {"confirmed_count": 5, "waitlist_count": 0}
    db_updates = []

    def mock_get_value(doctype, filters, fieldname=None, as_dict=False):
        if doctype == "Wellness Tenant Scope":
            return types.SimpleNamespace(tenant_code="test-tenant", is_active=True)
        if doctype == "WS Booking":
            return types.SimpleNamespace(
                name="WS-BK-CANCEL-1",
                session="SESS-10",
                member="MEM-100",
            )
        return None

    def mock_sql(query, params, as_dict=False):
        if "FROM `tabWS Class Session`" in query:
            return [
                MockDbRow(
                    name="SESS-10",
                    capacity=10,
                    confirmed_count=session_capacity["confirmed_count"],
                    waitlist_count=session_capacity["waitlist_count"],
                    status="Open",
                    class_type="Yoga",
                    session_date="2026-10-26",
                    start_time="10:00:00",
                )
            ]
        if "FROM `tabWS Booking`" in query:
            return [
                MockDbRow(
                    name="WS-BK-CANCEL-1",
                    status=booking_status["status"],
                    session="SESS-10",
                    member="MEM-100",
                )
            ]
        return []

    def mock_set_value(doctype, name, field, value=None, update_modified=True):
        db_updates.append((doctype, name, field, value))
        if doctype == "WS Class Session":
            session_capacity[field] = value
        elif doctype == "WS Booking":
            if isinstance(field, dict):
                booking_status.update(field)
            else:
                booking_status[field] = value

    frappe.db.get_value = mock_get_value
    frappe.db.sql = mock_sql
    frappe.db.set_value = mock_set_value
    frappe.db.exists = lambda doctype, filters: False

    # 1st Cancellation Call: Confirmed -> Cancelled
    res1 = cancel(
        booking="WS-BK-CANCEL-1",
        tenant="test-tenant",
        reason="Schedule conflict",
        cancellation_window_hours=0,
    )

    assert res1["status"] == "Cancelled"
    assert res1["duplicate"] is False
    assert session_capacity["confirmed_count"] == 4  # decremented from 5 to 4
    assert booking_status["status"] == "Cancelled"

    # 2nd Cancellation Call (Retry with same booking):
    # Booking is already Cancelled. Must return duplicate: True and NOT decrement capacity again!
    res2 = cancel(
        booking="WS-BK-CANCEL-1",
        tenant="test-tenant",
        reason="Schedule conflict",
        cancellation_window_hours=0,
    )

    assert res2["status"] == "Cancelled"
    assert res2["duplicate"] is True
    assert session_capacity["confirmed_count"] == 4  # Remains 4, not double-decremented!
