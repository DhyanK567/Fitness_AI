"""Tenant-scoped attendance reads; writes use atomic check-in/correction APIs."""

from __future__ import annotations

import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _serialize(row):
    return {"id": row.name, "booking_id": row.booking, "check_in_time": row.marked_on,
            "check_out_time": None, "status": row.status.lower(), "session_id": row.session,
            "member_id": row.member, "attendance_method": row.attendance_method}


@frappe.whitelist(methods=["GET"])
def list_attendance(tenant: str, member_filter: str | None = None):
    tenant = _tenant(tenant)
    filters = {"tenant": tenant}
    if member_filter:
        filters["member"] = member_filter
    rows = frappe.get_all("WS Session Attendance", filters=filters,
                          fields=["name", "booking", "marked_on", "status", "session", "member", "attendance_method"],
                          limit_page_length=1000, order_by="marked_on desc")
    return [_serialize(row) for row in rows]


@frappe.whitelist(methods=["GET"])
def get_attendance(tenant: str, attendance: str, member_filter: str | None = None):
    tenant = _tenant(tenant)
    filters = {"name": attendance, "tenant": tenant}
    if member_filter:
        filters["member"] = member_filter
    row = frappe.db.get_value("WS Session Attendance", filters,
                              ["name", "booking", "marked_on", "status", "session", "member", "attendance_method"], as_dict=True)
    if not row:
        frappe.throw(_("Attendance record not found"), frappe.DoesNotExistError)
    return _serialize(row)


@frappe.whitelist(methods=["GET"])
def list_by_class(tenant: str, class_id: str):
    tenant = _tenant(tenant)
    if not frappe.db.exists("WS Class Type", {"name": class_id, "tenant": tenant}):
        frappe.throw(_("Class not found"), frappe.DoesNotExistError)
    rows = frappe.db.sql(
        """SELECT a.name, a.booking, a.marked_on, a.status, a.session, a.member, a.attendance_method
           FROM `tabWS Session Attendance` a JOIN `tabWS Class Session` s ON s.name=a.session AND s.tenant=a.tenant
           WHERE a.tenant=%s AND s.class_type=%s ORDER BY a.marked_on DESC LIMIT 1000""",
        (tenant, class_id), as_dict=True,
    )
    return [_serialize(row) for row in rows]


@frappe.whitelist(methods=["POST"])
def record_attendance(tenant: str, booking: str, method: str = "Trainer Marked", member_filter: str | None = None):
    tenant = _tenant(tenant)
    return frappe.get_attr("wellness_studio.api.check_in.check_in")(booking=booking, tenant=tenant, method=method, member_filter=member_filter)


@frappe.whitelist(methods=["POST"])
def correct(tenant: str, attendance: str, new_status: str, reason: str):
    tenant = _tenant(tenant)
    if not isinstance(new_status, str):
        frappe.throw(_("Invalid attendance status"), frappe.ValidationError)
    reverse = {"present": "Present", "absent": "Absent", "late": "Late"}
    if new_status not in reverse:
        frappe.throw(_("Invalid attendance status"), frappe.ValidationError)
    result = frappe.get_attr("wellness_studio.api.check_in.correct_attendance")(
        attendance=attendance, tenant=tenant, new_status=reverse[new_status], reason=reason)
    return get_attendance(tenant, attendance) | {"changed": result.get("changed", False)}
