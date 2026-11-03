"""Tenant-scoped membership operations. Payment alone may activate a membership."""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation

import frappe
from frappe import _
from frappe.utils import getdate, today
from wellness_studio.rules.doctype_validation import require_date_order
from wellness_studio.tenant.permissions import require_api_tenant


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _snapshot(value):
    if isinstance(value, str):
        return json.loads(value)
    return value or {}


def _serialize(row):
    data = row.as_dict() if hasattr(row, "as_dict") else dict(row)
    snapshot = _snapshot(data.get("plan_snapshot"))
    status = {
        "Pending Approval": "pending", "Active": "active", "Expired": "expired",
        "Suspended": "suspended", "Cancelled": "cancelled",
    }.get(data.get("status"), "pending")
    return {
        "id": data.get("name"), "member_id": data.get("member"),
        "plan_name": snapshot.get("plan_name"),
        "plan_type": snapshot.get("billing_cycle", "monthly"),
        "start_date": data.get("start_date"), "end_date": data.get("end_date"),
        "status": status, "price": float(snapshot.get("price", 0)),
        "auto_renew": bool(snapshot.get("auto_renew", False)),
    }


def _plan(tenant: str, plan_name: str):
    plan_id = frappe.db.get_value("WS Member Plan", {"tenant": tenant, "plan_name": plan_name, "is_active": 1}, "name")
    if not plan_id:
        frappe.throw(_("Active membership plan not found for this tenant"), frappe.DoesNotExistError)
    return frappe.get_doc("WS Member Plan", plan_id)


def _build_snapshot(plan, billing_cycle: str, auto_renew: bool):
    return json.dumps({
        "name": plan.name, "plan_name": plan.plan_name, "price": float(plan.price),
        "validity_days": int(plan.validity_days),
        "allowed_bookings_per_week": int(plan.allowed_bookings_per_week or 0),
        "billing_cycle": billing_cycle, "auto_renew": bool(auto_renew),
    }, sort_keys=True)


def _validate_amount(actual, expected):
    try:
        matches = Decimal(str(actual)) == Decimal(str(expected))
    except (InvalidOperation, TypeError, ValueError):
        matches = False
    if not matches:
        frappe.throw(_("Membership price must match the active tenant plan price"), frappe.ValidationError)


@frappe.whitelist(methods=["GET"])
def list_active_plans(tenant: str):
    tenant = _tenant(tenant)
    return frappe.get_all(
        "WS Member Plan",
        filters={"tenant": tenant, "is_active": 1},
        fields=["name", "plan_name", "plan_type", "price", "validity_days", "allowed_bookings_per_week", "description"],
        limit_page_length=100,
        order_by="plan_name asc",
    )


@frappe.whitelist(methods=["GET"])
def list_memberships(tenant: str, member_filter: str | None = None):
    tenant = _tenant(tenant)
    filters = {"tenant": tenant}
    if member_filter:
        if not frappe.db.exists("WS Member", {"name": member_filter, "tenant": tenant}):
            frappe.throw(_("Member not found"), frappe.DoesNotExistError)
        filters["member"] = member_filter
    rows = frappe.get_all(
        "WS Membership", filters=filters,
        fields=["name", "member", "plan_snapshot", "start_date", "end_date", "status"],
        limit_page_length=1000, order_by="modified desc",
    )
    return [_serialize(row) for row in rows]


@frappe.whitelist(methods=["GET"])
def get_membership(tenant: str, membership: str):
    tenant = _tenant(tenant)
    row = frappe.db.get_value(
        "WS Membership", {"name": membership, "tenant": tenant},
        ["name", "member", "plan_snapshot", "start_date", "end_date", "status"], as_dict=True,
    )
    if not row:
        frappe.throw(_("Membership not found"), frappe.DoesNotExistError)
    return _serialize(row)


@frappe.whitelist(methods=["POST"])
def create_membership(
    tenant: str, member_id: str, plan_name: str, plan_type: str,
    start_date: str, end_date: str, price: float, auto_renew: bool = False,
):
    tenant = _tenant(tenant)
    if not frappe.db.exists("WS Member", {"name": member_id, "tenant": tenant}):
        frappe.throw(_("Member not found for this tenant"), frappe.DoesNotExistError)
    if plan_type not in {"monthly", "quarterly", "annual"}:
        frappe.throw(_("Invalid membership billing cycle"), frappe.ValidationError)
    start, end = getdate(start_date), getdate(end_date)
    require_date_order(start, end)
    if end < getdate(today()):
        frappe.throw(_("A new membership cannot end in the past"), frappe.ValidationError)
    plan = _plan(tenant, plan_name)
    _validate_amount(price, plan.price)
    doc = frappe.get_doc({
        "doctype": "WS Membership", "tenant": tenant, "member": member_id,
        "plan": plan.name, "plan_snapshot": _build_snapshot(plan, plan_type, auto_renew),
        "start_date": start, "end_date": end, "payment_status": "Pending",
        "amount_paid": 0, "status": "Pending Approval",
    })
    doc.insert(ignore_permissions=True)
    return get_membership(tenant, doc.name)


@frappe.whitelist(methods=["POST"])
def update_membership(tenant: str, membership: str, updates: dict):
    tenant = _tenant(tenant)
    allowed = {"plan_name", "plan_type", "start_date", "end_date", "price", "auto_renew"}
    if not isinstance(updates, dict) or not updates or set(updates) - allowed:
        frappe.throw(_("Invalid membership update fields"), frappe.ValidationError)
    rows = frappe.db.sql("SELECT name FROM `tabWS Membership` WHERE name=%s AND tenant=%s FOR UPDATE", (membership, tenant), as_dict=True)
    if not rows:
        frappe.throw(_("Membership not found"), frappe.DoesNotExistError)
    if frappe.db.exists("WS Payment Record", {"tenant": tenant, "membership": membership, "status": ["in", ["Created", "Pending"]]}):
        frappe.throw(_("Membership cannot be edited while a payment is in progress"), frappe.ValidationError)
    doc = frappe.get_doc("WS Membership", membership)
    if doc.tenant != tenant:
        frappe.throw(_("Membership not found"), frappe.DoesNotExistError)
    if doc.status != "Pending Approval" or doc.payment_status != "Pending":
        frappe.throw(_("Only unpaid pending memberships can be edited"), frappe.ValidationError)
    previous = _snapshot(doc.plan_snapshot)
    plan = _plan(tenant, updates.get("plan_name", previous.get("plan_name", "")))
    billing_cycle = updates.get("plan_type", previous.get("billing_cycle", "monthly"))
    if billing_cycle not in {"monthly", "quarterly", "annual"}:
        frappe.throw(_("Invalid membership billing cycle"), frappe.ValidationError)
    _validate_amount(updates.get("price", previous.get("price")), plan.price)
    start = getdate(updates.get("start_date", doc.start_date))
    end = getdate(updates.get("end_date", doc.end_date))
    require_date_order(start, end)
    if end < getdate(today()):
        frappe.throw(_("Membership end date cannot be in the past"), frappe.ValidationError)
    doc.plan = plan.name
    doc.plan_snapshot = _build_snapshot(plan, billing_cycle, updates.get("auto_renew", previous.get("auto_renew", False)))
    doc.start_date, doc.end_date = start, end
    doc.save(ignore_permissions=True)
    return get_membership(tenant, membership)


@frappe.whitelist(methods=["POST"])
def cancel_membership(tenant: str, membership: str):
    tenant = _tenant(tenant)
    rows = frappe.db.sql("SELECT name FROM `tabWS Membership` WHERE name=%s AND tenant=%s FOR UPDATE", (membership, tenant), as_dict=True)
    if not rows:
        frappe.throw(_("Membership not found"), frappe.DoesNotExistError)
    if frappe.db.exists("WS Payment Record", {"tenant": tenant, "membership": membership, "status": ["in", ["Created", "Pending"]]}):
        frappe.throw(_("Membership cannot be cancelled while a payment is in progress"), frappe.ValidationError)
    doc = frappe.get_doc("WS Membership", membership)
    if doc.tenant != tenant:
        frappe.throw(_("Membership not found"), frappe.DoesNotExistError)
    if doc.status == "Cancelled":
        return get_membership(tenant, membership)
    if doc.status not in {"Pending Approval", "Active"}:
        frappe.throw(_("This membership cannot be cancelled in its current state"), frappe.ValidationError)
    doc.status = "Cancelled"
    doc.save(ignore_permissions=True)
    return get_membership(tenant, membership)
