"""Tenant-scoped event management; registration capacity is handled atomically."""

from __future__ import annotations

import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _serialize(doc):
    return {"id": doc.name, "title": doc.event_title, "category": doc.event_category,
            "event_date": str(doc.event_date), "start_time": str(doc.start_time), "end_time": str(doc.end_time) if doc.end_time else None,
            "capacity": int(doc.capacity), "is_paid": bool(doc.is_paid), "price": float(doc.price or 0),
            "audience": doc.audience, "registration_deadline": str(doc.registration_deadline) if doc.registration_deadline else None,
            "is_published": bool(doc.is_published), "status": doc.status.lower(), "image": doc.image,
            "description": doc.description, "confirmed_count": int(doc.confirmed_count or 0),
            "waitlist_count": int(doc.waitlist_count or 0)}


def _get(tenant: str, event_id: str):
    name = frappe.db.get_value("WS Event", {"name": event_id, "tenant": tenant}, "name")
    if not name:
        frappe.throw(_("Event not found"), frappe.DoesNotExistError)
    return frappe.get_doc("WS Event", name)


def _lock_event(tenant: str, event_id: str):
    rows = frappe.db.sql("SELECT name FROM `tabWS Event` WHERE name=%s AND tenant=%s FOR UPDATE", (event_id, tenant), as_dict=True)
    if not rows:
        frappe.throw(_("Event not found"), frappe.DoesNotExistError)
    return frappe.get_doc("WS Event", rows[0].name)


@frappe.whitelist(methods=["GET"])
def list_events(tenant: str, published_only: int = 0, public_only: int = 0):
    tenant = _tenant(tenant)
    filters = {"tenant": tenant}
    if int(published_only) or int(public_only):
        filters["is_published"] = 1
        filters["status"] = ["!=", "Cancelled"]
    if int(public_only):
        filters["audience"] = "Public"
    names = frappe.get_all("WS Event", filters=filters, pluck="name", limit_page_length=1000, order_by="event_date asc")
    return [_serialize(frappe.get_doc("WS Event", name)) for name in names]


@frappe.whitelist(methods=["GET"])
def get_event(tenant: str, event_id: str):
    return _serialize(_get(_tenant(tenant), event_id))


@frappe.whitelist(methods=["POST"])
def create_event(tenant: str, title: str, category: str, event_date: str, start_time: str, capacity: int,
                 end_time: str | None = None, is_paid: int = 0, price: float | None = None,
                 audience: str = "Members Only", registration_deadline: str | None = None,
                 is_published: int = 1, image: str | None = None, description: str | None = None):
    tenant = _tenant(tenant)
    if not title or not title.strip():
        frappe.throw(_("Event title is required"), frappe.ValidationError)
    doc = frappe.get_doc({"doctype": "WS Event", "tenant": tenant, "event_title": title.strip(), "event_category": category,
                          "event_date": event_date, "start_time": start_time, "end_time": end_time, "capacity": capacity,
                          "is_paid": int(bool(is_paid)), "price": price, "audience": audience,
                          "registration_deadline": registration_deadline, "is_published": int(bool(is_published)),
                          "image": image, "description": description, "status": "Upcoming"})
    doc.insert(ignore_permissions=True)
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
def update_event(tenant: str, event_id: str, updates: dict):
    tenant = _tenant(tenant)
    allowed = {"title", "category", "event_date", "start_time", "end_time", "capacity", "is_paid", "price", "audience", "registration_deadline", "is_published", "status", "image", "description"}
    if not isinstance(updates, dict) or not updates or set(updates) - allowed:
        frappe.throw(_("Invalid event update fields"), frappe.ValidationError)
    doc = _lock_event(tenant, event_id)
    if "capacity" in updates and int(updates["capacity"]) < int(doc.confirmed_count or 0):
        frappe.throw(_("Capacity cannot be below confirmed registrations"), frappe.ValidationError)
    mapping = {"title": "event_title", "category": "event_category"}
    status_map = {"upcoming": "Upcoming", "ongoing": "Ongoing", "completed": "Completed", "cancelled": "Cancelled"}
    for key, value in updates.items():
        if key == "status":
            if value not in status_map:
                frappe.throw(_("Invalid event status"), frappe.ValidationError)
            value = status_map[value]
        setattr(doc, mapping.get(key, key), value.strip() if key in {"title", "category"} and isinstance(value, str) else value)
    doc.save(ignore_permissions=True)
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
def cancel_event(tenant: str, event_id: str):
    tenant = _tenant(tenant)
    doc = _lock_event(tenant, event_id)
    if doc.status != "Cancelled":
        registrations = frappe.db.sql(
            "SELECT name FROM `tabWS Event Registration` WHERE event=%s AND tenant=%s AND status IN ('Pending Payment','Confirmed','Waitlisted') FOR UPDATE",
            (event_id, tenant), as_dict=True,
        )
        for row in registrations:
            frappe.db.set_value("WS Event Registration", row.name, "status", "Cancelled", update_modified=True)
        doc.confirmed_count = 0
        doc.waitlist_count = 0
        doc.status = "Cancelled"
        doc.is_published = 0
        doc.save(ignore_permissions=True)
    return _serialize(doc)
