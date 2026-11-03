"""Tenant-scoped lead operations exposed only through the NestJS gateway."""

from __future__ import annotations

import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


_STATUS = {"new": "New", "contacted": "Contacted", "trial-scheduled": "Trial Scheduled", "converted": "Converted", "lost": "Lost"}
_SOURCE = {"walk-in": "Walk-in", "website": "Website", "referral": "Referral", "ad": "Advertisement"}


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _serialize(doc):
    reverse_status = {value: key for key, value in _STATUS.items()}
    reverse_source = {"Walk-in": "walk-in", "Referral": "referral", "Advertisement": "ad", "Website": "website"}
    return {"id": doc.name, "full_name": doc.full_name, "phone": doc.phone, "email": doc.email,
            "source": reverse_source.get(doc.lead_source, "website"), "status": reverse_status.get(doc.status, "new"),
            "assigned_to": doc.assigned_to, "notes": doc.notes, "created_at": doc.creation, "member_id": doc.converted_member}


def _get(tenant: str, lead_id: str):
    name = frappe.db.get_value("WS Lead", {"name": lead_id, "tenant": tenant}, "name")
    if not name:
        frappe.throw(_("Lead not found"), frappe.DoesNotExistError)
    return frappe.get_doc("WS Lead", name)


@frappe.whitelist(methods=["GET"])
def list_leads(tenant: str):
    tenant = _tenant(tenant)
    names = frappe.get_all("WS Lead", filters={"tenant": tenant}, pluck="name", limit_page_length=1000, order_by="modified desc")
    return [_serialize(frappe.get_doc("WS Lead", name)) for name in names]


@frappe.whitelist(methods=["GET"])
def get_lead(tenant: str, lead_id: str):
    return _serialize(_get(_tenant(tenant), lead_id))


@frappe.whitelist(methods=["POST"])
def create_lead(tenant: str, full_name: str, phone: str, source: str, status: str = "new", email: str | None = None, assigned_to: str | None = None, notes: str | None = None):
    tenant = _tenant(tenant)
    if source not in _SOURCE or status not in _STATUS:
        frappe.throw(_("Invalid lead source or status"), frappe.ValidationError)
    if assigned_to and not frappe.db.exists("WS Wellness Staff", {"name": assigned_to, "tenant": tenant, "is_active": 1}):
        frappe.throw(_("Assigned staff member is not active in this tenant"), frappe.DoesNotExistError)
    phone = (phone or "").strip()
    if not full_name or not full_name.strip() or not phone:
        frappe.throw(_("Lead name and phone are required"), frappe.ValidationError)
    duplicate = frappe.db.get_value("WS Lead", {"tenant": tenant, "phone": phone}, "name")
    if duplicate:
        return {**_serialize(frappe.get_doc("WS Lead", duplicate)), "duplicate": True}
    doc = frappe.get_doc({"doctype": "WS Lead", "tenant": tenant, "full_name": full_name.strip(), "phone": phone,
                          "email": (email or "").strip().lower() or None, "lead_source": _SOURCE[source], "status": _STATUS[status], "assigned_to": assigned_to, "notes": notes})
    doc.insert(ignore_permissions=True)
    return {**_serialize(doc), "duplicate": False}


@frappe.whitelist(methods=["POST"])
def update_lead(tenant: str, lead_id: str, updates: dict):
    tenant = _tenant(tenant)
    allowed = {"full_name", "phone", "email", "status", "notes", "assigned_to"}
    if not isinstance(updates, dict) or not updates or set(updates) - allowed:
        frappe.throw(_("Invalid lead update fields; source is immutable"), frappe.ValidationError)
    doc = _get(tenant, lead_id)
    if "status" in updates:
        if updates["status"] not in _STATUS:
            frappe.throw(_("Invalid lead status"), frappe.ValidationError)
        updates["status"] = _STATUS[updates["status"]]
    if updates.get("assigned_to") and not frappe.db.exists("WS Wellness Staff", {"name": updates["assigned_to"], "tenant": tenant, "is_active": 1}):
        frappe.throw(_("Assigned staff member is not active in this tenant"), frappe.DoesNotExistError)
    for key, value in updates.items():
        setattr(doc, key, value.strip() if isinstance(value, str) and key in {"full_name", "phone", "email"} else value)
    doc.save(ignore_permissions=True)
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
def deactivate_lead(tenant: str, lead_id: str):
    tenant = _tenant(tenant)
    doc = _get(tenant, lead_id)
    if doc.status != "Lost":
        doc.status = "Lost"
        doc.save(ignore_permissions=True)
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
def convert_lead(tenant: str, lead_id: str):
    """Convert once under a lead-row lock; preserve the lead as the source record."""
    tenant = _tenant(tenant)
    rows = frappe.db.sql("SELECT name, status, converted_member FROM `tabWS Lead` WHERE name=%s AND tenant=%s FOR UPDATE", (lead_id, tenant), as_dict=True)
    if not rows:
        frappe.throw(_("Lead not found"), frappe.DoesNotExistError)
    if rows[0].converted_member:
        return {**_serialize(frappe.get_doc("WS Lead", lead_id)), "duplicate": True}
    if rows[0].status == "Lost":
        frappe.throw(_("Lost leads cannot be converted"), frappe.ValidationError)
    lead = frappe.get_doc("WS Lead", lead_id)
    phone = (lead.phone or "").strip()
    if not phone.startswith("+") or not phone[1:].isdigit() or not 8 <= len(phone[1:]) <= 15:
        frappe.throw(_("Lead phone must be stored in E.164 format before conversion"), frappe.ValidationError)
    from wellness_studio.api.member import create_member
    member = create_member(tenant=tenant, full_name=lead.full_name, phone=phone, email=lead.email,
                           status="active")
    member_id = member.get("id") or member.get("member_id")
    if not member_id:
        frappe.throw(_("Member conversion did not return a member ID"), frappe.ValidationError)
    lead.converted_member = member_id
    lead.status = "Converted"
    lead.converted_on = frappe.utils.now_datetime()
    lead.save(ignore_permissions=True)
    return {**_serialize(lead), "duplicate": False}
