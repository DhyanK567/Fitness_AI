"""Atomic member operations used by the single NestJS API boundary."""

from __future__ import annotations

import re

import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _text(value, label: str, *, required: bool = False, max_length: int = 255):
    if value is None and not required:
        return None
    if not isinstance(value, str):
        frappe.throw(_("{0} must be text").format(label), frappe.ValidationError)
    value = value.strip()
    if (required and not value) or len(value) > max_length:
        frappe.throw(_("Invalid {0}").format(label), frappe.ValidationError)
    return value or None


def _existing_member(tenant: str, phone: str, full_name: str, email: str | None):
    existing = frappe.db.get_value(
        "WS Member", {"tenant": tenant, "phone": phone},
        ["name", "status", "full_name", "email"], as_dict=True,
    )
    if not existing:
        return None
    if (existing.full_name or "").strip().casefold() != full_name.casefold() or (
        email and (existing.email or "").strip().lower() != email
    ):
        frappe.throw(_("Phone number already belongs to a different member"), frappe.DuplicateEntryError)
    return {**get_member(tenant, existing.name), "duplicate": True}


@frappe.whitelist(methods=["POST"])
def create_member(
    tenant: str,
    full_name: str,
    phone: str,
    email: str | None = None,
    date_of_birth: str | None = None,
    gender: str | None = None,
    join_date: str | None = None,
    status: str | None = None,
    emergency_contact: str | None = None,
    profile_photo_url: str | None = None,
):
    """Create once by tenant and phone; matching retries return the existing member."""
    tenant = _tenant(tenant)
    full_name = _text(full_name, "full name", required=True, max_length=140)
    phone = re.sub(r"[\s()-]", "", _text(phone, "phone", required=True, max_length=32))
    email = _text(email, "email", max_length=140)
    email = email.lower() if email else None
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        frappe.throw(_("Invalid email address"), frappe.ValidationError)
    if status is not None and (not isinstance(status, str) or status not in {"active", "inactive", "frozen"}):
        frappe.throw(_("Invalid member status"), frappe.ValidationError)
    if not re.fullmatch(r"\+[1-9][0-9]{7,14}", phone):
        frappe.throw(_("Phone must use E.164 format"), frappe.ValidationError)
    if gender is not None and (not isinstance(gender, str) or gender.lower() not in {"male", "female", "other", "prefer not to say"}):
        frappe.throw(_("Invalid gender"), frappe.ValidationError)
    for label, value in (("date of birth", date_of_birth), ("join date", join_date)):
        if value is not None and (not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)):
            frappe.throw(_("Invalid {0}").format(label), frappe.ValidationError)
    emergency_contact = _text(emergency_contact, "emergency contact", max_length=32)
    if emergency_contact:
        emergency_contact = re.sub(r"[\s()-]", "", emergency_contact)
        if not re.fullmatch(r"\+?[1-9][0-9]{7,14}", emergency_contact):
            frappe.throw(_("Emergency contact must be a valid phone number"), frappe.ValidationError)
    profile_photo_url = _text(profile_photo_url, "profile photo", max_length=2048)
    existing = _existing_member(tenant, phone, full_name, email)
    if existing:
        return existing
    member = frappe.get_doc({
        "doctype": "WS Member",
        "tenant": tenant,
        "full_name": full_name,
        "phone": phone,
        "email": email,
        "status": {"active": "Active", "inactive": "Suspended", "frozen": "Suspended"}.get(status, "Pending Approval"),
        "activation_status": {"active": "Active", "inactive": "Suspended", "frozen": "Suspended"}.get(status, "Pending"),
        "onboarding_source": "Direct B2C",
        "member_since": join_date or frappe.utils.today(),
        "date_of_birth": date_of_birth,
        "gender": {"male": "Male", "female": "Female", "other": "Other", "prefer not to say": "Prefer not to say"}.get((gender or "").lower()),
        "emergency_contact_phone": emergency_contact,
        "profile_photo": profile_photo_url,
    })
    try:
        member.insert(ignore_permissions=True)
    except frappe.DuplicateEntryError:
        # A concurrent request may win the tenant+phone unique constraint.
        existing = _existing_member(tenant, phone, full_name, email)
        if existing:
            return existing
        raise
    return {**get_member(tenant, member.name), "duplicate": False}


_MEMBER_FIELDS = (
    "name", "full_name", "email", "phone", "date_of_birth", "gender", "member_since",
    "status", "emergency_contact_phone", "profile_photo",
)


def _member_payload(row):
    if not row:
        return None
    status = {"Active": "active", "Suspended": "inactive", "Expired": "inactive", "Pending Approval": "inactive"}.get(row.get("status"), "inactive")
    return {
        "id": row.get("name"), "member_id": row.get("name"), "full_name": row.get("full_name"), "email": row.get("email"),
        "phone": row.get("phone"), "date_of_birth": row.get("date_of_birth"),
        "gender": (row.get("gender") or "Other").lower(), "join_date": row.get("member_since"),
        "status": status, "membership_id": None,
        "profile_photo_url": row.get("profile_photo"),
        "emergency_contact": row.get("emergency_contact_phone"),
    }


@frappe.whitelist(methods=["GET"])
def list_members(tenant: str, limit: int = 50, start: int = 0):
    tenant = _tenant(tenant)
    limit = min(max(int(limit), 1), 100)
    start = max(int(start), 0)
    rows = frappe.get_all("WS Member", filters={"tenant": tenant}, fields=list(_MEMBER_FIELDS), limit_start=start, limit_page_length=limit, order_by="modified desc")
    return [_member_payload(row) for row in rows]


@frappe.whitelist(methods=["GET"])
def get_member(tenant: str, member: str):
    tenant = _tenant(tenant)
    row = frappe.db.get_value("WS Member", {"name": member, "tenant": tenant}, list(_MEMBER_FIELDS), as_dict=True)
    if not row:
        frappe.throw(_("Member not found"), frappe.DoesNotExistError)
    return _member_payload(row)


@frappe.whitelist(methods=["POST"])
def update_member(tenant: str, member: str, updates: dict):
    tenant = _tenant(tenant)
    allowed = {"full_name", "email", "phone", "date_of_birth", "gender", "join_date", "status", "emergency_contact", "profile_photo_url"}
    if not isinstance(updates, dict) or not updates or set(updates) - allowed:
        frappe.throw(_("Invalid member update fields"), frappe.ValidationError)
    updates = dict(updates)
    if "full_name" in updates:
        updates["full_name"] = _text(updates["full_name"], "full name", required=True, max_length=140)
    if "email" in updates:
        updates["email"] = _text(updates["email"], "email", max_length=140)
        updates["email"] = updates["email"].lower() if updates["email"] else None
        if updates["email"] and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", updates["email"]):
            frappe.throw(_("Invalid email address"), frappe.ValidationError)
    if "phone" in updates:
        updates["phone"] = re.sub(r"[\s()-]", "", _text(updates["phone"], "phone", required=True, max_length=32))
        if not re.fullmatch(r"\+[1-9][0-9]{7,14}", updates["phone"]):
            frappe.throw(_("Phone must use E.164 format"), frappe.ValidationError)
    if "gender" in updates:
        gender = _text(updates["gender"], "gender", max_length=32)
        if gender and gender.lower() not in {"male", "female", "other", "prefer not to say"}:
            frappe.throw(_("Invalid gender"), frappe.ValidationError)
        updates["gender"] = {"male": "Male", "female": "Female", "other": "Other", "prefer not to say": "Prefer not to say"}.get((gender or "").lower())
    for field in ("date_of_birth", "join_date"):
        if field in updates and updates[field] is not None and (
            not isinstance(updates[field], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", updates[field])
        ):
            frappe.throw(_("Invalid {0}").format(field.replace("_", " ")), frappe.ValidationError)
    if "emergency_contact" in updates:
        updates["emergency_contact"] = _text(updates["emergency_contact"], "emergency contact", max_length=32)
        if updates["emergency_contact"]:
            updates["emergency_contact"] = re.sub(r"[\s()-]", "", updates["emergency_contact"])
            if not re.fullmatch(r"\+?[1-9][0-9]{7,14}", updates["emergency_contact"]):
                frappe.throw(_("Emergency contact must be a valid phone number"), frappe.ValidationError)
    if "profile_photo_url" in updates:
        updates["profile_photo_url"] = _text(updates["profile_photo_url"], "profile photo", max_length=2048)
    doc = frappe.get_doc("WS Member", member)
    if doc.tenant != tenant:
        frappe.throw(_("Member not found"), frappe.DoesNotExistError)
    mapping = {"join_date": "member_since", "emergency_contact": "emergency_contact_phone", "profile_photo_url": "profile_photo"}
    for key, value in updates.items():
        field = mapping.get(key, key)
        if key == "gender" and value:
            value = value.title()
        if key == "status":
            if not isinstance(value, str):
                frappe.throw(_("Invalid member status"), frappe.ValidationError)
            value = {"active": "Active", "inactive": "Suspended", "frozen": "Suspended"}.get(value)
            if not value:
                frappe.throw(_("Invalid member status"), frappe.ValidationError)
            doc.activation_status = "Active" if value == "Active" else "Suspended"
        setattr(doc, field, value)
    doc.save(ignore_permissions=True)
    return get_member(tenant, member)


@frappe.whitelist(methods=["POST"])
def deactivate_member(tenant: str, member: str):
    """Retire a member without deleting business history."""
    tenant = _tenant(tenant)
    return update_member(tenant, member, {"status": "inactive"})
