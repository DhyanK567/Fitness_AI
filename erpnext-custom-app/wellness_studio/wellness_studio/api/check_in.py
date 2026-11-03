"""Atomic attendance operations."""

from __future__ import annotations

import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


@frappe.whitelist(methods=["POST"])
def check_in(booking: str, tenant: str, method: str = "QR Scan", member_filter: str | None = None):
    tenant = require_api_tenant(tenant)
    if not isinstance(method, str) or method not in ("QR Scan", "Trainer Marked", "Admin Entry"):
        frappe.throw(_("Invalid attendance method"), frappe.ValidationError)
    rows = frappe.db.sql(
        "SELECT name, member, session, status FROM `tabWS Booking` WHERE name=%s AND tenant=%s FOR UPDATE",
        (booking, tenant), as_dict=True,
    )
    if not rows:
        frappe.throw(_("Booking not found"), frappe.DoesNotExistError)
    row = rows[0]
    if member_filter and row.member != member_filter:
        frappe.throw(_("Booking not found"), frappe.DoesNotExistError)
    if row.status != "Confirmed":
        frappe.throw(_("Only confirmed bookings can check in"), frappe.ValidationError)
    if frappe.db.exists("WS Session Attendance", {"booking": booking, "tenant": tenant}):
        frappe.throw(_("Attendance already recorded"), frappe.DuplicateEntryError)
    attendance = frappe.get_doc({
        "doctype": "WS Session Attendance", "tenant": tenant, "booking": booking,
        "member": row.member, "session": row.session, "attendance_method": method,
        "status": "Present", "marked_by": frappe.session.user,
    })
    attendance.flags.from_atomic_attendance = True
    attendance.insert(ignore_permissions=True)
    frappe.db.set_value("WS Booking", booking, "status", "Attended", update_modified=True)
    return {"attendance_id": attendance.name, "status": "Present"}


@frappe.whitelist(methods=["POST"])
def correct_attendance(attendance: str, tenant: str, new_status: str, reason: str):
    """Correct attendance while retaining immutable before/after evidence."""
    tenant = require_api_tenant(tenant)
    if not isinstance(new_status, str) or new_status not in {"Present", "Absent", "Late"}:
        frappe.throw(_("Invalid attendance status"), frappe.ValidationError)
    if not isinstance(reason, str) or not reason.strip():
        frappe.throw(_("A correction reason is required"), frappe.ValidationError)
    rows = frappe.db.sql(
        """SELECT name, status FROM `tabWS Session Attendance`
           WHERE name=%s AND tenant=%s FOR UPDATE""",
        (attendance, tenant), as_dict=True,
    )
    if not rows:
        frappe.throw(_("Attendance record not found"), frappe.DoesNotExistError)
    row = rows[0]
    if row.status == new_status:
        return {"attendance_id": attendance, "status": new_status, "changed": False}
    doc = frappe.get_doc("WS Session Attendance", attendance)
    doc.append("corrections", {
        "corrected_by": frappe.session.user,
        "corrected_on": frappe.utils.now_datetime(),
        "previous_value": row.status,
        "new_value": new_status,
        "reason": reason.strip(),
    })
    doc.status = new_status
    doc.is_corrected = 1
    doc.flags.from_atomic_attendance = True
    doc.save(ignore_permissions=True)
    return {"attendance_id": attendance, "status": new_status, "changed": True}
