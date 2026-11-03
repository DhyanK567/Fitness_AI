"""Tenant-scoped recurring class schedule operations."""

from __future__ import annotations

import re
from datetime import datetime, timedelta

import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


_DAY_TO_RRULE = {"Mon": "MO", "Tue": "TU", "Wed": "WE", "Thu": "TH", "Fri": "FR", "Sat": "SA", "Sun": "SU"}
_RRULE_TO_DAY = {value: key for key, value in _DAY_TO_RRULE.items()}


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _clock(value: str):
    if not isinstance(value, str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
        frappe.throw(_("Time must use HH:MM"), frappe.ValidationError)
    return frappe.utils.get_time(value)


def _duration(start_time: str, end_time: str) -> int:
    start, end = _clock(start_time), _clock(end_time)
    minutes = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)
    if minutes <= 0:
        frappe.throw(_("End time must be after start time"), frappe.ValidationError)
    return minutes


def _end_time(start_time: str, duration_minutes: int) -> str:
    start = _clock(str(start_time)[:5])
    return (datetime.combine(datetime.min.date(), start) + timedelta(minutes=int(duration_minutes))).strftime("%H:%M")


def _day(schedule) -> str | None:
    match = re.fullmatch(r"FREQ=WEEKLY;BYDAY=([A-Z]{2})", schedule.recurrence_rule or "")
    return _RRULE_TO_DAY.get(match.group(1)) if match else None


def _serialize(schedule):
    return {
        "id": schedule.name, "class_id": schedule.class_type, "day_of_week": _day(schedule),
        "start_time": str(schedule.start_time)[:5],
        "end_time": _end_time(schedule.start_time, schedule.duration_minutes),
    }


def _class_type(tenant: str, class_id: str):
    class_name = frappe.db.get_value("WS Class Type", {"name": class_id, "tenant": tenant, "is_active": 1}, "name")
    if not class_name:
        frappe.throw(_("Class not found for this tenant"), frappe.DoesNotExistError)
    return frappe.get_doc("WS Class Type", class_name)


def _get_schedule(tenant: str, class_id: str, schedule_id: str):
    name = frappe.db.get_value("WS Class Schedule", {"name": schedule_id, "tenant": tenant, "class_type": class_id}, "name")
    if not name:
        frappe.throw(_("Class schedule not found"), frappe.DoesNotExistError)
    return frappe.get_doc("WS Class Schedule", name)


@frappe.whitelist(methods=["GET"])
def list_class_schedules(tenant: str, class_id: str):
    tenant = _tenant(tenant)
    _class_type(tenant, class_id)
    rows = frappe.get_all(
        "WS Class Schedule", filters={"tenant": tenant, "class_type": class_id, "is_active": 1},
        fields=["name", "class_type", "start_time", "duration_minutes", "recurrence_rule"],
        limit_page_length=1000, order_by="valid_from asc",
    )
    return [_serialize(row) for row in rows]


@frappe.whitelist(methods=["POST"])
def create_class_schedule(tenant: str, class_id: str, day_of_week: str, start_time: str, end_time: str):
    tenant = _tenant(tenant)
    if day_of_week not in _DAY_TO_RRULE:
        frappe.throw(_("Invalid day of week"), frappe.ValidationError)
    class_type = _class_type(tenant, class_id)
    if not class_type.trainer:
        frappe.throw(_("Assign a default trainer before scheduling this class"), frappe.ValidationError)
    doc = frappe.get_doc({
        "doctype": "WS Class Schedule", "tenant": tenant, "class_type": class_id,
        "trainer": class_type.trainer, "start_time": _clock(start_time),
        "duration_minutes": _duration(start_time, end_time),
        "recurrence_rule": f"FREQ=WEEKLY;BYDAY={_DAY_TO_RRULE[day_of_week]}",
        "valid_from": frappe.utils.today(), "capacity": class_type.default_capacity or 30, "is_active": 1,
    })
    doc.insert(ignore_permissions=True)
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
def update_class_schedule(tenant: str, class_id: str, schedule_id: str, updates: dict):
    tenant = _tenant(tenant)
    allowed = {"day_of_week", "start_time", "end_time"}
    if not isinstance(updates, dict) or not updates or set(updates) - allowed:
        frappe.throw(_("Invalid schedule update fields"), frappe.ValidationError)
    _class_type(tenant, class_id)
    doc = _get_schedule(tenant, class_id, schedule_id)
    day = updates.get("day_of_week", _day(doc))
    if day not in _DAY_TO_RRULE:
        frappe.throw(_("Invalid day of week"), frappe.ValidationError)
    start = updates.get("start_time", str(doc.start_time)[:5])
    end = updates.get("end_time", _end_time(doc.start_time, doc.duration_minutes))
    doc.recurrence_rule = f"FREQ=WEEKLY;BYDAY={_DAY_TO_RRULE[day]}"
    doc.start_time = _clock(start)
    doc.duration_minutes = _duration(start, end)
    doc.save(ignore_permissions=True)
    return _serialize(doc)


@frappe.whitelist(methods=["POST"])
def deactivate_class_schedule(tenant: str, class_id: str, schedule_id: str):
    tenant = _tenant(tenant)
    _class_type(tenant, class_id)
    doc = _get_schedule(tenant, class_id, schedule_id)
    if doc.is_active:
        doc.is_active = 0
        doc.save(ignore_permissions=True)
    return {"id": doc.name, "status": "inactive"}
