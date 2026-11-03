"""Idempotent payment posting into ERP business records."""

from __future__ import annotations

import json
import math
from decimal import Decimal, InvalidOperation

import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


def _payment_payload(row):
    status = {"Created": "pending", "Pending": "pending", "Paid": "success", "Failed": "failed", "Refunded": "refunded"}.get(row.status, "pending")
    method = {"razorpay": "razorpay", "manual_cash": "cash", "manual_upi": "upi", "manual_other": "upi"}.get(row.provider, "razorpay")
    return {"id": row.name, "member_id": row.member, "membership_id": row.membership, "booking_id": row.booking,
            "amount": float(row.amount), "currency": row.currency, "payment_method": method,
            "razorpay_order_id": row.provider_order_reference, "razorpay_payment_id": row.provider_reference,
            "status": status, "paid_at": row.paid_on}


@frappe.whitelist(methods=["GET"])
def list_payments(tenant: str, member_filter: str | None = None):
    tenant = require_api_tenant(tenant)
    filters = {"tenant": tenant}
    if member_filter:
        filters["member"] = member_filter
    rows = frappe.get_all("WS Payment Record", filters=filters,
                          fields=["name", "member", "membership", "booking", "amount", "currency", "provider", "provider_order_reference", "provider_reference", "status", "paid_on"],
                          limit_page_length=1000, order_by="modified desc")
    return [_payment_payload(row) for row in rows]


@frappe.whitelist(methods=["GET"])
def get_payment(tenant: str, payment: str, member_filter: str | None = None):
    tenant = require_api_tenant(tenant)
    filters = {"name": payment, "tenant": tenant}
    if member_filter:
        filters["member"] = member_filter
    row = frappe.db.get_value("WS Payment Record", filters,
        ["name", "member", "membership", "booking", "amount", "currency", "provider", "provider_order_reference", "provider_reference", "status", "paid_on"], as_dict=True)
    if not row:
        frappe.throw(_("Payment not found"), frappe.DoesNotExistError)
    return _payment_payload(row)


@frappe.whitelist(methods=["POST"])
def post_payment(
    tenant: str,
    member: str,
    amount: float,
    purpose: str = "membership",
    provider: str = "razorpay",
    idempotency_key: str | None = None,
    provider_reference: str | None = None,
    provider_order_reference: str | None = None,
    event_registration: str | None = None,
    membership: str | None = None,
    booking: str | None = None,
    recorded_by: str | None = None,
    manual_reference: str | None = None,
    currency: str = "INR",
):
    """Create a Paid ERP record only after the provider webhook is verified."""

    tenant = require_api_tenant(tenant)
    if not member or not frappe.db.exists("WS Member", {"name": member, "tenant": tenant}):
        frappe.throw(_("Member not found"), frappe.DoesNotExistError)
    if not math.isfinite(float(amount)) or float(amount) <= 0:
        frappe.throw(_("Payment amount must be positive"), frappe.ValidationError)
    if not idempotency_key:
        frappe.throw(_("Idempotency key is required"), frappe.ValidationError)
    if purpose not in {"membership", "event", "other"}:
        frappe.throw(_("Invalid payment purpose"), frappe.ValidationError)
    if provider not in {"razorpay", "manual_cash", "manual_upi", "manual_other"}:
        frappe.throw(_("Invalid payment provider"), frappe.ValidationError)
    currency = str(currency).upper()
    company = frappe.db.get_value("Wellness Tenant Scope", tenant, "company")
    company_currency = frappe.db.get_value("Company", company, "default_currency") if company else None
    if not company_currency or str(currency).upper() != str(company_currency).upper():
        frappe.throw(_("Payment currency must match the tenant company currency"), frappe.ValidationError)
    existing = frappe.db.get_value(
        "WS Payment Record", {"tenant": tenant, "idempotency_key": idempotency_key},
        ["name", "status", "member", "amount", "currency", "membership", "booking", "event_registration", "provider", "purpose", "provider_reference", "provider_order_reference"], as_dict=True,
    )
    if existing:
        same_request = (
            existing.member == member and Decimal(str(existing.amount)) == Decimal(str(amount))
            and existing.currency == currency and existing.membership == membership
            and existing.booking == booking and existing.event_registration == event_registration
            and existing.provider == provider and existing.purpose == purpose
        )
        if not same_request:
            frappe.throw(_("Idempotency key was already used for a different payment"), frappe.DuplicateEntryError)
        if existing.status == "Paid":
            if existing.provider_reference != provider_reference:
                frappe.throw(_("Idempotency key was already used for a different provider payment"), frappe.DuplicateEntryError)
            return {"payment_id": existing.name, "status": existing.status, "duplicate": True}
        if existing.status != "Pending" or provider != "razorpay" or existing.provider_order_reference != provider_order_reference or not provider_order_reference:
            frappe.throw(_("Payment intent does not match the captured provider order"), frappe.DuplicateEntryError)
    if sum(bool(value) for value in (membership, booking, event_registration)) > 1:
        frappe.throw(_("A payment can target only one membership, booking, or event registration"), frappe.ValidationError)
    if purpose == "membership" and not membership:
        frappe.throw(_("Membership payments require a membership"), frappe.ValidationError)
    if purpose == "event" and not event_registration:
        frappe.throw(_("Event payments require an event registration"), frappe.ValidationError)
    if membership:
        locked = frappe.db.sql("SELECT name FROM `tabWS Membership` WHERE name=%s AND tenant=%s AND member=%s FOR UPDATE", (membership, tenant, member), as_dict=True)
        if not locked:
            frappe.throw(_("Membership not found for this member and tenant"), frappe.DoesNotExistError)
    membership_doc = None
    if membership:
        membership_doc = frappe.get_doc("WS Membership", membership)
        if membership_doc.payment_status == "Paid" or membership_doc.status == "Active":
            frappe.throw(_("This membership has already been paid or activated"), frappe.ValidationError)
        try:
            snapshot = membership_doc.plan_snapshot
            snapshot = json.loads(snapshot) if isinstance(snapshot, str) else snapshot
            expected_amount = Decimal(str(snapshot["price"]))
            actual_amount = Decimal(str(amount))
        except (TypeError, ValueError, KeyError, InvalidOperation):
            frappe.throw(_("Membership payment amount cannot be verified"), frappe.ValidationError)
        if actual_amount != expected_amount:
            frappe.throw(_("Payment amount does not match the membership price"), frappe.ValidationError)
    if booking:
        locked = frappe.db.sql("SELECT name, status FROM `tabWS Booking` WHERE name=%s AND tenant=%s AND member=%s FOR UPDATE", (booking, tenant, member), as_dict=True)
        if not locked or locked[0].status != "Confirmed":
            frappe.throw(_("A confirmed booking for this member and tenant is required for payment"), frappe.DoesNotExistError)
    if event_registration and not frappe.db.exists("WS Event Registration", {"name": event_registration, "tenant": tenant, "member": member}):
        frappe.throw(_("Event registration not found for this member and tenant"), frappe.DoesNotExistError)
    payment = frappe.get_doc("WS Payment Record", existing.name) if existing else frappe.get_doc({
        "doctype": "WS Payment Record", "tenant": tenant, "member": member,
        "purpose": purpose, "provider": provider,
        "membership": membership, "booking": booking, "event_registration": event_registration,
        "amount": amount, "currency": currency,
        "provider_reference": provider_reference,
        "recorded_by": recorded_by,
        "manual_reference": manual_reference,
        "idempotency_key": idempotency_key,
    })
    payment.provider_reference = provider_reference
    payment.status = "Paid"
    payment.paid_on = frappe.utils.now_datetime()
    payment.flags.from_payment_api = True
    payment.flags.verified_payment = True
    if existing:
        payment.save(ignore_permissions=True)
    else:
        payment.insert(ignore_permissions=True)
    if membership_doc:
        membership_doc.payment_status = "Paid"
        membership_doc.amount_paid = amount
        membership_doc.payment_reference = provider_reference
        membership_doc.status = "Active"
        membership_doc.approved_by = frappe.session.user
        membership_doc.approved_on = frappe.utils.now_datetime()
        membership_doc.save(ignore_permissions=True)
    if event_registration:
        from wellness_studio.api.event_registration import confirm_payment
        confirm_payment(event_registration, payment.name, tenant)
    return {"payment_id": payment.name, "status": "Paid", "duplicate": False}


@frappe.whitelist(methods=["POST"])
def validate_order_request(tenant: str, member: str, amount: float, currency: str = "INR",
                           membership: str | None = None, booking: str | None = None,
                           idempotency_key: str | None = None):
    """Validate ownership and canonical membership price before an external order is created."""
    tenant = require_api_tenant(tenant)
    if not member or not frappe.db.exists("WS Member", {"name": member, "tenant": tenant, "status": "Active"}):
        frappe.throw(_("Member not found or inactive"), frappe.DoesNotExistError)
    if not math.isfinite(float(amount)) or float(amount) <= 0:
        frappe.throw(_("Payment amount must be positive"), frappe.ValidationError)
    if sum(bool(value) for value in (membership, booking)) != 1:
        frappe.throw(_("Exactly one payment target is required"), frappe.ValidationError)
    currency = str(currency).upper()
    company = frappe.db.get_value("Wellness Tenant Scope", tenant, "company")
    company_currency = frappe.db.get_value("Company", company, "default_currency") if company else None
    if not company_currency or str(currency).upper() != str(company_currency).upper():
        frappe.throw(_("Payment currency must match the tenant company currency"), frappe.ValidationError)
    if membership:
        doc = frappe.db.get_value("WS Membership", {"name": membership, "tenant": tenant, "member": member},
                                  ["status", "payment_status", "plan_snapshot"], as_dict=True)
        if not doc:
            frappe.throw(_("Membership not found for this member and tenant"), frappe.DoesNotExistError)
        if doc.payment_status == "Paid" or doc.status == "Active":
            frappe.throw(_("This membership has already been paid or activated"), frappe.ValidationError)
        try:
            snapshot = json.loads(doc.plan_snapshot) if isinstance(doc.plan_snapshot, str) else doc.plan_snapshot
            if Decimal(str(snapshot["price"])) != Decimal(str(amount)):
                frappe.throw(_("Payment amount does not match the membership price"), frappe.ValidationError)
        except (TypeError, ValueError, KeyError, InvalidOperation):
            frappe.throw(_("Membership payment amount cannot be verified"), frappe.ValidationError)
        pending = frappe.db.sql(
            """SELECT name, idempotency_key FROM `tabWS Payment Record`
               WHERE tenant=%s AND membership=%s AND status IN ('Created','Pending') FOR UPDATE""",
            (tenant, membership), as_dict=True,
        )
        if any(row.idempotency_key != idempotency_key for row in pending):
            frappe.throw(_("This membership already has a payment in progress"), frappe.DuplicateEntryError)
    if booking and not frappe.db.exists("WS Booking", {"name": booking, "tenant": tenant, "member": member, "status": "Confirmed"}):
        frappe.throw(_("Confirmed booking not found for this member and tenant"), frappe.DoesNotExistError)
    if booking:
        pending = frappe.db.sql(
            """SELECT name, idempotency_key FROM `tabWS Payment Record`
               WHERE tenant=%s AND booking=%s AND status IN ('Created','Pending') FOR UPDATE""",
            (tenant, booking), as_dict=True,
        )
        if any(row.idempotency_key != idempotency_key for row in pending):
            frappe.throw(_("This booking already has a payment in progress"), frappe.DuplicateEntryError)
    return {"valid": True, "currency": company_currency}


@frappe.whitelist(methods=["POST"])
def create_order_intent(tenant: str, member: str, amount: float, currency: str, idempotency_key: str,
                        membership: str | None = None, booking: str | None = None):
    """Reserve one business payment before creating its external provider order."""
    tenant = require_api_tenant(tenant)
    if not idempotency_key:
        frappe.throw(_("Order idempotency key is required"), frappe.ValidationError)
    currency = str(currency).upper()
    if membership:
        locked = frappe.db.sql("SELECT name FROM `tabWS Membership` WHERE name=%s AND tenant=%s AND member=%s FOR UPDATE", (membership, tenant, member), as_dict=True)
        if not locked:
            frappe.throw(_("Membership not found for this member and tenant"), frappe.DoesNotExistError)
    if booking:
        locked = frappe.db.sql("SELECT name FROM `tabWS Booking` WHERE name=%s AND tenant=%s AND member=%s AND status='Confirmed' FOR UPDATE", (booking, tenant, member), as_dict=True)
        if not locked:
            frappe.throw(_("Confirmed booking not found for this member and tenant"), frappe.DoesNotExistError)
    validate_order_request(tenant, member, amount, currency, membership, booking, idempotency_key)
    existing = frappe.db.get_value("WS Payment Record", {"tenant": tenant, "idempotency_key": idempotency_key},
                                   ["name", "member", "amount", "currency", "membership", "booking", "provider", "provider_order_reference", "status"], as_dict=True)
    if existing:
        expected = (existing.member == member and Decimal(str(existing.amount)) == Decimal(str(amount)) and existing.currency == currency
                    and existing.membership == membership and existing.booking == booking and existing.provider == "razorpay"
                    and existing.provider == "razorpay")
        if not expected:
            frappe.throw(_("Payment idempotency key conflicts with an existing payment"), frappe.DuplicateEntryError)
        return {"payment_id": existing.name, "status": existing.status, "duplicate": True}
    target_filter = {"tenant": tenant, "membership": membership, "status": ["in", ["Created", "Pending"]]} if membership else {"tenant": tenant, "booking": booking, "status": ["in", ["Created", "Pending"]]}
    pending = frappe.get_all("WS Payment Record", filters=target_filter, fields=["name", "idempotency_key"], limit_page_length=2)
    if any(row.idempotency_key != idempotency_key for row in pending):
        frappe.throw(_("A payment is already in progress for this target"), frappe.DuplicateEntryError)
    doc = frappe.get_doc({"doctype": "WS Payment Record", "tenant": tenant, "member": member,
                          "purpose": "membership" if membership else "other", "membership": membership, "booking": booking,
                          "provider": "razorpay", "amount": amount, "currency": currency,
                          "status": "Created", "idempotency_key": idempotency_key})
    doc.flags.from_payment_api = True
    doc.insert(ignore_permissions=True)
    return {"payment_id": doc.name, "status": doc.status, "duplicate": False}


@frappe.whitelist(methods=["POST"])
def attach_order_reference(tenant: str, idempotency_key: str, provider_order_reference: str):
    """Attach the provider's order ID to the previously reserved business intent."""
    tenant = require_api_tenant(tenant)
    if not provider_order_reference:
        frappe.throw(_("Provider order ID is required"), frappe.ValidationError)
    rows = frappe.db.sql(
        """SELECT name, status, provider_order_reference FROM `tabWS Payment Record`
           WHERE tenant=%s AND idempotency_key=%s FOR UPDATE""",
        (tenant, idempotency_key), as_dict=True,
    )
    if not rows:
        frappe.throw(_("Payment intent not found"), frappe.DoesNotExistError)
    row = rows[0]
    if row.provider_order_reference:
        if row.provider_order_reference != provider_order_reference:
            frappe.throw(_("Payment intent is already attached to another provider order"), frappe.DuplicateEntryError)
        return {"payment_id": row.name, "status": row.status, "duplicate": True}
    if row.status != "Created":
        frappe.throw(_("Only a newly reserved payment can be attached to an order"), frappe.ValidationError)
    doc = frappe.get_doc("WS Payment Record", row.name)
    doc.provider_order_reference = provider_order_reference
    doc.status = "Pending"
    doc.save(ignore_permissions=True)
    return {"payment_id": doc.name, "status": doc.status, "duplicate": False}


@frappe.whitelist(methods=["POST"])
def record_manual(
    tenant: str,
    member: str,
    amount: float,
    payment_method: str = "cash",
    membership_id: str | None = None,
    booking_id: str | None = None,
    currency: str = "INR",
    idempotency_key: str | None = None,
):
    """Record a staff-entered cash/UPI payment through the ERP boundary."""
    if payment_method not in {"cash", "upi"}:
        frappe.throw(_("Manual payment method must be cash or upi"), frappe.ValidationError)
    result = post_payment(
        tenant=tenant,
        member=member,
        amount=amount,
        purpose="membership" if membership_id else "other",
        provider="manual_cash" if payment_method == "cash" else "manual_upi",
        provider_reference=idempotency_key,
        recorded_by=frappe.session.user,
        manual_reference=idempotency_key,
        idempotency_key=idempotency_key,
        membership=membership_id,
        booking=booking_id,
        currency=currency,
    )
    result.update({"membership_id": membership_id, "booking_id": booking_id, "currency": currency})
    return result
