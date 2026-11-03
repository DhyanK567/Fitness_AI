"""Tenant-scoped class-type CRUD for the NestJS API boundary."""

from __future__ import annotations

import frappe
from frappe import _
from wellness_studio.rules.doctype_validation import require_positive
from wellness_studio.tenant.permissions import require_api_tenant


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _serialize(row):
    return {
        "id": row.name,
        "name": row.class_name,
        "trainer_id": row.trainer,
        "category": row.category,
        "duration_mins": int(row.duration_minutes),
        "capacity": int(row.default_capacity or 30),
        "location": row.location,
    }


def _get_class(tenant: str, class_id: str):
    row = frappe.db.get_value("WS Class Type", {"name": class_id, "tenant": tenant}, "name")
    if not row:
        frappe.throw(_("Class not found"), frappe.DoesNotExistError)
    return frappe.get_doc("WS Class Type", row)


@frappe.whitelist(methods=["GET"])
def list_classes(tenant: str):
    tenant = _tenant(tenant)
    rows = frappe.get_all(
        "WS Class Type", filters={"tenant": tenant, "is_active": 1},
        fields=["name", "class_name", "trainer", "category", "duration_minutes", "default_capacity", "location"],
        limit_page_length=1000, order_by="class_name asc",
    )
    return [_serialize(row) for row in rows]


@frappe.whitelist(methods=["GET"])
def get_class(tenant: str, class_id: str):
    return _serialize(_get_class(_tenant(tenant), class_id))


@frappe.whitelist(methods=["POST"])
def create_class(tenant: str, name: str, trainer_id: str, category: str, duration_mins: int, capacity: int, location: str | None = None):
    tenant = _tenant(tenant)
    if not name.strip() or not category.strip():
        frappe.throw(_("Class name and category are required"), frappe.ValidationError)
    if not frappe.db.exists("WS Wellness Staff", {"name": trainer_id, "tenant": tenant, "is_trainer": 1, "is_active": 1}):
        frappe.throw(_("Trainer not found for this tenant"), frappe.DoesNotExistError)
    require_positive(duration_mins, "Duration minutes")
    require_positive(capacity, "Capacity")
    doc = frappe.get_doc({
        "doctype": "WS Class Type", "tenant": tenant, "class_name": name.strip(),
        "trainer": trainer_id, "category": category.strip(), "duration_minutes": duration_mins,
        "default_capacity": capacity, "location": location, "is_active": 1,
    })
    doc.insert(ignore_permissions=True)
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
def update_class(tenant: str, class_id: str, updates: dict):
    tenant = _tenant(tenant)
    allowed = {"name", "trainer_id", "category", "duration_mins", "capacity", "location"}
    if not isinstance(updates, dict) or not updates or set(updates) - allowed:
        frappe.throw(_("Invalid class update fields"), frappe.ValidationError)
    doc = _get_class(tenant, class_id)
    mapping = {"name": "class_name", "trainer_id": "trainer", "duration_mins": "duration_minutes", "capacity": "default_capacity"}
    if "trainer_id" in updates and not frappe.db.exists("WS Wellness Staff", {"name": updates["trainer_id"], "tenant": tenant, "is_trainer": 1, "is_active": 1}):
        frappe.throw(_("Trainer not found for this tenant"), frappe.DoesNotExistError)
    for key, value in updates.items():
        if key in {"name", "category"} and (not isinstance(value, str) or not value.strip()):
            frappe.throw(_("Class name and category cannot be empty"), frappe.ValidationError)
        if key in {"duration_mins", "capacity"}:
            require_positive(value, key)
        setattr(doc, mapping.get(key, key), value.strip() if key in {"name", "category"} else value)
    doc.save(ignore_permissions=True)
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
def deactivate_class(tenant: str, class_id: str):
    tenant = _tenant(tenant)
    doc = _get_class(tenant, class_id)
    if doc.is_active:
        doc.is_active = 0
        doc.save(ignore_permissions=True)
    return {"id": doc.name, "status": "inactive"}
