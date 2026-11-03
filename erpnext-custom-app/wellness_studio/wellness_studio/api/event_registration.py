"""Atomic event registration and paid-hold operations for ERP business truth."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal, InvalidOperation

import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


def _event(event: str, tenant: str):
    rows = frappe.db.sql(
        """SELECT name, capacity, confirmed_count, waitlist_count, is_paid, price, status, audience, is_published
        FROM `tabWS Event` WHERE name=%s AND tenant=%s FOR UPDATE""",
        (event, tenant), as_dict=True,
    )
    if not rows:
        frappe.throw(_("Event not found"), frappe.DoesNotExistError)
    if rows[0].status == "Cancelled":
        frappe.throw(_("Event is cancelled"), frappe.ValidationError)
    return rows[0]


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


@frappe.whitelist(methods=["POST"])
def register(event: str, tenant: str, registrant_name: str, member: str | None = None,
             registrant_phone: str | None = None, registrant_email: str | None = None,
             free_only: int | str | None = None, public_only: int | str | None = None):
    """Reserve one event place; paid events receive a short, expiring payment hold."""
    tenant = _tenant(tenant)
    event_row = _event(event, tenant)
    if str(public_only or "0").lower() not in {"0", "false", "none"} and (event_row.audience != "Public" or not event_row.is_published):
        frappe.throw(_("Public registration is not available for this event"), frappe.DoesNotExistError)
    if str(free_only or "0").lower() not in {"0", "false", "none"} and event_row.is_paid:
        frappe.throw(_("Paid event checkout is not enabled in Phase 1"), frappe.ValidationError)
    if member and not frappe.db.exists("WS Member", {"name": member, "tenant": tenant}):
        frappe.throw(_("Member not found"), frappe.DoesNotExistError)
    if member and frappe.db.exists("WS Event Registration", {"tenant": tenant, "event": event, "member": member, "status": ["in", ["Pending Payment", "Confirmed", "Waitlisted"]]}):
        frappe.throw(_("Member already has an active registration"), frappe.DuplicateEntryError)

    has_seat = (event_row.confirmed_count or 0) + (event_row.waitlist_count or 0) < (event_row.capacity or 0)
    if event_row.is_paid and has_seat:
        status = "Pending Payment"
        hold_expires_at = frappe.utils.now_datetime() + timedelta(minutes=15)
    elif has_seat:
        status = "Confirmed"
        hold_expires_at = None
    else:
        status = "Waitlisted"
        hold_expires_at = None

    registration = frappe.get_doc({
        "doctype": "WS Event Registration", "tenant": tenant, "event": event, "member": member,
        "registrant_name": registrant_name, "registrant_phone": registrant_phone,
        "registrant_email": registrant_email, "status": status, "hold_expires_at": hold_expires_at,
        "confirmed_on": frappe.utils.now_datetime() if status == "Confirmed" else None,
    })
    registration.flags.from_atomic_registration = True
    registration.insert(ignore_permissions=True)
    count_field = "waitlist_count" if status == "Waitlisted" else "confirmed_count"
    frappe.db.set_value("WS Event", event, count_field, (getattr(event_row, count_field) or 0) + 1, update_modified=False)
    return {"registration_id": registration.name, "status": status, "hold_expires_at": hold_expires_at}


@frappe.whitelist(methods=["POST"])
def confirm_payment(registration: str, payment: str, tenant: str):
    """Confirm only an active paid hold; this method is safe to replay."""
    tenant = _tenant(tenant)
    registration_rows = frappe.db.sql(
        "SELECT event FROM `tabWS Event Registration` WHERE name=%s AND tenant=%s",
        (registration, tenant), as_dict=True,
    )
    if not registration_rows:
        frappe.throw(_("Event registration not found"), frappe.DoesNotExistError)
    event_row = _event(registration_rows[0].event, tenant)
    rows = frappe.db.sql(
        "SELECT name, event, member, payment, status, hold_expires_at FROM `tabWS Event Registration` WHERE name=%s AND tenant=%s FOR UPDATE",
        (registration, tenant), as_dict=True,
    )
    if not rows or rows[0].event != event_row.name:
        frappe.throw(_("Event registration not found"), frappe.DoesNotExistError)
    row = rows[0]
    if not event_row.is_paid:
        frappe.throw(_("Event is not configured for paid registration"), frappe.ValidationError)
    payment_rows = frappe.db.sql(
        "SELECT name, event_registration, member, purpose, amount, status FROM `tabWS Payment Record` WHERE name=%s AND tenant=%s FOR UPDATE",
        (payment, tenant), as_dict=True,
    )
    if not payment_rows:
        frappe.throw(_("Paid event payment not found"), frappe.DoesNotExistError)
    payment_row = payment_rows[0]
    if (payment_row.status != "Paid" or payment_row.purpose != "event"
            or payment_row.event_registration != registration
            or not row.member or payment_row.member != row.member):
        frappe.throw(_("Paid payment does not belong to this event registration"), frappe.ValidationError)
    try:
        payment_amount = Decimal(str(payment_row.amount))
        event_price = Decimal(str(event_row.price))
    except (InvalidOperation, TypeError, ValueError):
        frappe.throw(_("Event payment amount cannot be verified"), frappe.ValidationError)
    if payment_amount != event_price:
        frappe.throw(_("Payment amount does not match the event price"), frappe.ValidationError)
    if row.status == "Confirmed":
        if row.payment != payment:
            frappe.throw(_("Event registration was confirmed by a different payment"), frappe.ValidationError)
        return {"registration_id": registration, "status": "Confirmed", "duplicate": True}
    if row.status != "Pending Payment" or not row.hold_expires_at or row.hold_expires_at < frappe.utils.now_datetime():
        frappe.throw(_("Event payment hold is no longer active"), frappe.ValidationError)
    frappe.db.set_value("WS Event Registration", registration, {"status": "Confirmed", "payment": payment, "confirmed_on": frappe.utils.now_datetime()}, update_modified=True)
    return {"registration_id": registration, "status": "Confirmed", "duplicate": False}


def expire_payment_holds():
    """Release expired paid-event seats. Re-running is idempotent."""
    rows = frappe.get_all("WS Event Registration", filters={"status": "Pending Payment", "hold_expires_at": ["<", frappe.utils.now_datetime()]}, fields=["name", "event", "tenant"])
    for row in rows:
        event_rows = frappe.db.sql(
            "SELECT name, confirmed_count, status FROM `tabWS Event` WHERE name=%s AND tenant=%s FOR UPDATE",
            (row.event, row.tenant), as_dict=True,
        )
        if not event_rows or event_rows[0].status == "Cancelled":
            continue
        event_row = event_rows[0]
        current = frappe.db.sql(
            "SELECT status, hold_expires_at FROM `tabWS Event Registration` WHERE name=%s AND tenant=%s FOR UPDATE",
            (row.name, row.tenant), as_dict=True,
        )
        if not current or current[0].status != "Pending Payment" or current[0].hold_expires_at >= frappe.utils.now_datetime():
            continue
        frappe.db.set_value("WS Event Registration", row.name, "status", "Expired", update_modified=True)
        frappe.db.set_value("WS Event", row.event, "confirmed_count", max((event_row.confirmed_count or 1) - 1, 0), update_modified=False)
    return len(rows)
