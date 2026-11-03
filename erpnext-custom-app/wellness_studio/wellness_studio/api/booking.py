"""Whitelisted, transactional booking operations for the ERP system of record."""

from __future__ import annotations

import re
from datetime import datetime, timedelta

import frappe
from frappe import _

from wellness_studio.rules.membership_state import can_book
from wellness_studio.tenant.permissions import require_api_tenant


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _active_membership(member: str, tenant: str):
    member_row = frappe.db.get_value(
        "WS Member", {"name": member, "tenant": tenant}, ["name", "status"], as_dict=True,
    )
    if not member_row:
        frappe.throw(_("Member not found"), frappe.DoesNotExistError)
    if member_row.status != "Active":
        frappe.throw(_("Member is not active"), frappe.ValidationError)
    memberships = frappe.db.sql(
        """SELECT name, status, start_date, end_date, plan
           FROM `tabWS Membership`
           WHERE member=%s AND tenant=%s AND status='Active'
           ORDER BY end_date DESC
           FOR UPDATE""",
        (member, tenant), as_dict=True,
    )
    membership = memberships[0] if memberships else None
    if not membership or not can_book(membership.status, membership.end_date, start_date=membership.start_date):
        frappe.throw(_("Member has no active membership"), frappe.ValidationError)
    return membership


def _idempotent_booking(tenant: str, key: str, member: str, session: str):
    rows = frappe.db.sql(
        """SELECT name, status, member, session
           FROM `tabWS Booking`
           WHERE tenant=%s AND idempotency_key=%s
           FOR UPDATE""",
        (tenant, key), as_dict=True,
    )
    if not rows:
        return None
    existing = rows[0]
    if existing.member != member or existing.session != session:
        frappe.throw(_("Idempotency key was already used for a different booking"), frappe.ValidationError)
    return {"booking_id": existing.name, "status": existing.status, "duplicate": True}


def _session(session: str, tenant: str):
    row = frappe.db.sql(
        """
        SELECT name, capacity, confirmed_count, waitlist_count, status, class_type,
               session_date, start_time
        FROM `tabWS Class Session`
        WHERE name = %s AND tenant = %s
        FOR UPDATE
        """,
        (session, tenant),
        as_dict=True,
    )
    if not row:
        frappe.throw(_("Class session not found"), frappe.DoesNotExistError)
    if row[0].status == "Cancelled":
        frappe.throw(_("Class session is cancelled"), frappe.ValidationError)
    return row[0]


def _booking_payload(row, tenant: str):
    status = str(row.status).lower().replace(" ", "_")
    payment_id = frappe.db.get_value(
        "WS Payment Record", {"tenant": tenant, "booking": row.name, "status": "Paid"}, "name",
    )
    return {
        "id": row.name, "member_id": row.member, "class_schedule_id": row.schedule,
        "booking_date": str(row.booking_date)[:10], "status": status,
        "booked_at": str(row.booking_date), "payment_id": payment_id,
        "idempotency_key": getattr(row, "idempotency_key", None),
    }


def _get_booking(tenant: str, booking: str):
    row = frappe.db.sql(
        """SELECT b.name, b.member, s.schedule, b.booking_date, b.status, b.idempotency_key
           FROM `tabWS Booking` b
           JOIN `tabWS Class Session` s ON s.name=b.session AND s.tenant=b.tenant
           WHERE b.name=%s AND b.tenant=%s""",
        (booking, tenant), as_dict=True,
    )
    if not row:
        frappe.throw(_("Booking not found"), frappe.DoesNotExistError)
    return _booking_payload(row[0], tenant)


def _get_or_create_session(tenant: str, class_schedule_id: str, booking_date: str):
    schedule_rows = frappe.db.sql(
        """SELECT name, class_type, trainer, start_time, duration_minutes, capacity,
                  valid_from, valid_to, recurrence_rule, is_active
           FROM `tabWS Class Schedule`
           WHERE name=%s AND tenant=%s
           FOR UPDATE""",
        (class_schedule_id, tenant), as_dict=True,
    )
    if not schedule_rows or not schedule_rows[0].is_active:
        frappe.throw(_("Active class schedule not found"), frappe.DoesNotExistError)
    schedule = schedule_rows[0]
    session_date = frappe.utils.getdate(booking_date)
    if session_date < frappe.utils.getdate(schedule.valid_from) or (schedule.valid_to and session_date > frappe.utils.getdate(schedule.valid_to)):
        frappe.throw(_("Booking date is outside the schedule validity period"), frappe.ValidationError)
    match = re.fullmatch(r"FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)", schedule.recurrence_rule or "")
    weekdays = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
    if not match or weekdays[session_date.weekday()] != match.group(1):
        frappe.throw(_("Booking date does not match the recurring class schedule"), frappe.ValidationError)
    class_row = frappe.db.get_value(
        "WS Class Type", {"name": schedule.class_type, "tenant": tenant, "is_active": 1},
        ["name", "class_name", "trainer", "default_capacity"], as_dict=True,
    )
    if not class_row:
        frappe.throw(_("Class is inactive or unavailable"), frappe.ValidationError)
    existing = frappe.db.get_value(
        "WS Class Session", {"tenant": tenant, "schedule": class_schedule_id, "session_date": session_date}, "name",
    )
    if existing:
        return existing
    trainer = schedule.trainer or class_row.trainer
    if not trainer or not frappe.db.exists("WS Wellness Staff", {"name": trainer, "tenant": tenant, "is_trainer": 1, "is_active": 1}):
        frappe.throw(_("An active trainer is required for this class session"), frappe.ValidationError)
    start_time = frappe.utils.get_time(schedule.start_time)
    end_at = datetime.combine(session_date, start_time) + timedelta(minutes=int(schedule.duration_minutes))
    if end_at.date() != session_date:
        frappe.throw(_("Class duration cannot extend beyond midnight"), frappe.ValidationError)
    session = frappe.get_doc({
        "doctype": "WS Class Session", "tenant": tenant, "session_title": class_row.class_name,
        "class_type": schedule.class_type, "schedule": schedule.name, "trainer": trainer,
        "session_date": session_date, "start_time": start_time, "end_time": end_at.time(),
        "capacity": schedule.capacity or class_row.default_capacity or 30,
        "status": "Scheduled", "confirmed_count": 0, "waitlist_count": 0,
    })
    session.insert(ignore_permissions=True)
    return session.name


@frappe.whitelist(methods=["GET"])
def list_bookings(tenant: str, member_filter: str | None = None):
    tenant = _tenant(tenant)
    member_clause = " AND b.member=%s" if member_filter else ""
    params = (tenant, member_filter) if member_filter else (tenant,)
    rows = frappe.db.sql(
        f"""SELECT b.name, b.member, s.schedule, b.booking_date, b.status, b.idempotency_key
           FROM `tabWS Booking` b
           JOIN `tabWS Class Session` s ON s.name=b.session AND s.tenant=b.tenant
           WHERE b.tenant=%s{member_clause} ORDER BY b.booking_date DESC LIMIT 1000""",
        params, as_dict=True,
    )
    return [_booking_payload(row, tenant) for row in rows]


@frappe.whitelist(methods=["GET"])
def get_booking(tenant: str, booking: str, member_filter: str | None = None):
    payload = _get_booking(_tenant(tenant), booking)
    if member_filter and payload["member_id"] != member_filter:
        frappe.throw(_("Booking not found"), frappe.DoesNotExistError)
    return payload


@frappe.whitelist(methods=["POST"])
def book_by_schedule(member: str, class_schedule_id: str, booking_date: str, tenant: str, idempotency_key: str | None = None):
    tenant = _tenant(tenant)
    _active_membership(member, tenant)
    session = _get_or_create_session(tenant, class_schedule_id, booking_date)
    result = book(member=member, session=session, tenant=tenant, idempotency_key=idempotency_key)
    payload = _get_booking(tenant, result["booking_id"])
    payload["duplicate"] = result.get("duplicate", False)
    return payload


@frappe.whitelist(methods=["POST"])
def book(member: str, session: str, tenant: str, idempotency_key: str | None = None):
    """Book a member under a row lock; return Confirmed or Waitlisted."""

    tenant = _tenant(tenant)
    idempotency_key = idempotency_key or None
    if idempotency_key:
        existing = _idempotent_booking(tenant, idempotency_key, member, session)
        if existing:
            return existing

    membership = _active_membership(member, tenant)

    session_row = _session(session, tenant)
    # Recheck after waiting for the session lock so retries return the committed booking.
    if idempotency_key:
        existing = _idempotent_booking(tenant, idempotency_key, member, session)
        if existing:
            return existing
    if frappe.db.exists("WS Booking", {"tenant": tenant, "member": member, "session": session, "status": ["in", ["Confirmed", "Waitlisted"]]}):
        frappe.throw(_("Member already has a booking for this session"), frappe.DuplicateEntryError)
    entitlements = frappe.get_all(
        "WS Plan Class Entitlement",
        filters={"parent": membership.plan, "parenttype": "WS Member Plan", "parentfield": "eligible_class_types"},
        pluck="class_type",
    )
    if entitlements and session_row.class_type not in entitlements:
        frappe.throw(_("Membership plan does not include this class type"), frappe.ValidationError)
    weekly_limit = frappe.db.get_value("WS Member Plan", membership.plan, "allowed_bookings_per_week") or 0
    if weekly_limit:
        session_date = frappe.utils.getdate(session_row.session_date)
        week_start = frappe.utils.add_days(session_date, -session_date.weekday())
        week_end = frappe.utils.add_days(week_start, 6)
        weekly_count = frappe.db.sql(
            """SELECT COUNT(*) FROM `tabWS Booking` b
               JOIN `tabWS Class Session` s ON s.name=b.session
               WHERE b.tenant=%s AND b.membership=%s AND b.status IN ('Confirmed','Attended')
                 AND s.session_date BETWEEN %s AND %s""",
            (tenant, membership.name, week_start, week_end),
        )[0][0]
        if weekly_count >= weekly_limit:
            frappe.throw(_("Weekly booking limit reached"), frappe.ValidationError)
    status = "Confirmed" if (session_row.confirmed_count or 0) < (session_row.capacity or 0) else "Waitlisted"
    booking = frappe.get_doc({
        "doctype": "WS Booking", "tenant": tenant, "member": member,
        "session": session, "membership": membership.name, "status": status,
        "idempotency_key": idempotency_key,
    })
    booking.flags.from_atomic_booking = True
    try:
        booking.insert(ignore_permissions=True)
    except frappe.DuplicateEntryError:
        if idempotency_key:
            existing = _idempotent_booking(tenant, idempotency_key, member, session)
            if existing:
                return existing
        raise
    field = "confirmed_count" if status == "Confirmed" else "waitlist_count"
    frappe.db.set_value("WS Class Session", session, field, (getattr(session_row, field) or 0) + 1, update_modified=False)
    return {"booking_id": booking.name, "status": status, "duplicate": False}


@frappe.whitelist(methods=["POST"])
def cancel(booking: str, tenant: str, reason: str | None = None, cancellation_window_hours: int = 4, member_filter: str | None = None):
    """Cancel a booking and leave promotion to the explicit promote operation."""

    tenant = _tenant(tenant)
    candidate = frappe.db.get_value(
        "WS Booking", {"name": booking, "tenant": tenant}, ["name", "session", "member"], as_dict=True,
    )
    if not candidate:
        frappe.throw(_("Booking not found"), frappe.DoesNotExistError)
    if member_filter and candidate.member != member_filter:
        frappe.throw(_("Booking not found"), frappe.DoesNotExistError)

    # Always acquire locks in session -> booking order, matching book/promote_waitlist.
    session_row = _session(candidate.session, tenant)
    rows = frappe.db.sql(
        "SELECT name, status, session, member FROM `tabWS Booking` WHERE name=%s AND tenant=%s FOR UPDATE",
        (booking, tenant), as_dict=True,
    )
    if not rows:
        frappe.throw(_("Booking not found"), frappe.DoesNotExistError)
    row = rows[0]
    if row.session != candidate.session:
        frappe.throw(_("Booking session changed; retry cancellation"), frappe.ValidationError)
    if member_filter and row.member != member_filter:
        frappe.throw(_("Booking not found"), frappe.DoesNotExistError)
    if row.status == "Cancelled":
        return {"booking_id": booking, "status": "Cancelled", "duplicate": True}
    if row.status not in {"Confirmed", "Waitlisted"}:
        frappe.throw(_("Only confirmed or waitlisted bookings can be cancelled"), frappe.ValidationError)
    if frappe.db.exists("WS Payment Record", {"tenant": tenant, "booking": booking, "status": ["in", ["Created", "Pending"]]}):
        frappe.throw(_("Booking cannot be cancelled while a payment is in progress"), frappe.ValidationError)
    if row.status == "Confirmed":
        cutoff_hours = int(cancellation_window_hours)
        if cutoff_hours < 0 or cutoff_hours > 168:
            frappe.throw(_("Cancellation window must be between 0 and 168 hours"), frappe.ValidationError)
        starts_at = frappe.utils.get_datetime(f"{session_row.session_date} {session_row.start_time}")
        if frappe.utils.now_datetime() > starts_at - timedelta(hours=int(cutoff_hours)):
            frappe.throw(_("Cancellation cutoff has passed"), frappe.ValidationError)
    if row.status == "Confirmed":
        frappe.db.set_value("WS Class Session", row.session, "confirmed_count", max((session_row.confirmed_count or 1) - 1, 0), update_modified=False)
    elif row.status == "Waitlisted":
        frappe.db.set_value("WS Class Session", row.session, "waitlist_count", max((session_row.waitlist_count or 1) - 1, 0), update_modified=False)
    frappe.db.set_value("WS Booking", booking, {"status": "Cancelled", "cancellation_reason": reason}, update_modified=True)
    return {"booking_id": booking, "status": "Cancelled", "duplicate": False}


@frappe.whitelist(methods=["POST"])
def update_booking(tenant: str, booking: str, updates: dict, cancellation_window_hours: int = 4):
    tenant = _tenant(tenant)
    if not isinstance(updates, dict) or set(updates) != {"status"}:
        frappe.throw(_("Only the booking status can be updated"), frappe.ValidationError)
    if updates["status"] != "cancelled":
        frappe.throw(_("Booking status is controlled by booking and attendance operations"), frappe.ValidationError)
    result = cancel(booking=booking, tenant=tenant, cancellation_window_hours=cancellation_window_hours)
    return _get_booking(tenant, result["booking_id"])


@frappe.whitelist(methods=["POST"])
def promote_waitlist(session: str, tenant: str):
    """Promote the oldest waitlisted booking while holding the session row lock."""

    tenant = _tenant(tenant)
    session_row = _session(session, tenant)
    if (session_row.confirmed_count or 0) >= (session_row.capacity or 0):
        return None
    waiting = frappe.db.sql(
        """SELECT name FROM `tabWS Booking` WHERE tenant=%s AND session=%s AND status='Waitlisted' ORDER BY creation LIMIT 1 FOR UPDATE""",
        (tenant, session), as_dict=True,
    )
    if not waiting:
        return None
    current = frappe.db.get_value("WS Booking", {"name": waiting[0].name, "tenant": tenant, "status": "Waitlisted"}, "name")
    if not current:
        return None
    frappe.db.set_value("WS Booking", waiting[0].name, "status", "Confirmed", update_modified=True)
    frappe.db.set_value("WS Class Session", session, {"confirmed_count": (session_row.confirmed_count or 0) + 1, "waitlist_count": max((session_row.waitlist_count or 1) - 1, 0)}, update_modified=False)
    return {"booking_id": waiting[0].name, "status": "Confirmed"}
