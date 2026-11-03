"""Operations API endpoints for AI Operations Agent."""

import frappe
from frappe import _
from frappe.utils import nowdate, add_days, getdate, flt, cint
from wellness_studio.tenant.permissions import has_permission, require_api_tenant


@frappe.whitelist()
def class_capacity_utilization(start_date, end_date, class_type_id=None, branch_id=None, tenant=None):
    """Get class capacity utilization metrics.

    Args:
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        class_type_id: Optional class type filter
        branch_id: Optional branch filter
        tenant: Tenant ID (validated against X-Tenant-ID header)

    Returns:
        Dict with utilization metrics per class
    """
    # Verify permissions
    if not has_permission("operations", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    # Validate tenant context
    tenant = require_api_tenant(tenant)

    conditions = [
        "`tabWS Class Session`.tenant = %(tenant)s",
        "`tabWS Class Session`.session_date BETWEEN %(start_date)s AND %(end_date)s",
        "`tabWS Class Session`.status IN ('Scheduled', 'Completed')",
    ]
    params = {
        "tenant": tenant,
        "start_date": start_date,
        "end_date": end_date,
    }

    if class_type_id:
        conditions.append("`tabWS Class Session`.class_type_id = %(class_type_id)s")
        params["class_type_id"] = class_type_id

    if branch_id:
        conditions.append("`tabWS Class Session`.branch_id = %(branch_id)s")
        params["branch_id"] = branch_id

    where_clause = " AND ".join(conditions)

    # Get sessions with bookings and capacity
    sessions = frappe.db.sql(f"""
        SELECT
            cs.name as session_id,
            cs.class_type_id,
            ct.name as class_type_name,
            cs.session_date,
            cs.start_time,
            cs.end_time,
            cs.capacity,
            cs.branch_id,
            COUNT(b.name) as booked_count,
            COUNT(CASE WHEN b.status = 'Confirmed' THEN 1 END) as confirmed_count,
            COUNT(CASE WHEN b.status = 'Waitlisted' THEN 1 END) as waitlisted_count
        FROM `tabWS Class Session` cs
        LEFT JOIN `tabWS Class Type` ct ON cs.class_type_id = ct.name
        LEFT JOIN `tabWS Booking` b ON b.session = cs.name AND b.tenant = cs.tenant
        WHERE {where_clause}
        GROUP BY cs.name
        ORDER BY cs.session_date, cs.start_time
    """, params, as_dict=True)

    # Calculate utilization
    results = []
    for s in sessions:
        capacity = cint(s.capacity) or 0
        confirmed = cint(s.confirmed_count) or 0
        waitlisted = cint(s.waitlisted_count) or 0

        utilization_pct = round((confirmed / capacity * 100), 2) if capacity > 0 else 0
        waitlist_pct = round((waitlisted / capacity * 100), 2) if capacity > 0 else 0

        results.append({
            "session_id": s.session_id,
            "class_type_id": s.class_type_id,
            "class_type_name": s.class_type_name,
            "session_date": str(s.session_date),
            "start_time": str(s.start_time),
            "end_time": str(s.end_time),
            "capacity": capacity,
            "booked": confirmed,
            "waitlisted": waitlisted,
            "utilization_percent": utilization_pct,
            "waitlist_percent": waitlist_pct,
            "available_slots": max(0, capacity - confirmed),
            "branch_id": s.branch_id,
        })

    # Summary stats
    total_capacity = sum(r["capacity"] for r in results)
    total_booked = sum(r["booked"] for r in results)
    total_waitlisted = sum(r["waitlisted"] for r in results)
    avg_utilization = round((total_booked / total_capacity * 100), 2) if total_capacity > 0 else 0

    return {
        "sessions": results,
        "summary": {
            "total_sessions": len(results),
            "total_capacity": total_capacity,
            "total_booked": total_booked,
            "total_waitlisted": total_waitlisted,
            "avg_utilization_percent": avg_utilization,
            "period": {"start": start_date, "end": end_date},
        }
    }


@frappe.whitelist()
def get_operational_alerts(severity=None, category=None, acknowledged=None, limit=50, tenant=None):
    """Get operational alerts.

    Args:
        severity: Filter by severity (info, warning, critical)
        category: Filter by category (capacity, staffing, equipment, attendance, payment)
        acknowledged: Filter by acknowledged status (true/false)
        limit: Max results
        tenant: Tenant ID (validated against X-Tenant-ID header)

    Returns:
        List of operational alerts
    """
    if not has_permission("operations", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)

    conditions = ["tenant_id = %(tenant)s"]
    params = {"tenant": tenant}

    if severity:
        conditions.append("severity = %(severity)s")
        params["severity"] = severity

    if category:
        conditions.append("alert_type = %(category)s")
        params["category"] = category

    if acknowledged is not None:
        conditions.append("is_acknowledged = %(acknowledged)s")
        params["acknowledged"] = cint(acknowledged)

    where_clause = " AND ".join(conditions)

    alerts = frappe.db.sql(f"""
        SELECT * FROM `tabOperational Alert`
        WHERE {where_clause}
        ORDER BY
            CASE severity
                WHEN 'critical' THEN 1
                WHEN 'warning' THEN 2
                ELSE 3
            END,
            created_at DESC
        LIMIT %(limit)s
    """, {**params, "limit": cint(limit)}, as_dict=True)

    return {"alerts": alerts, "count": len(alerts)}


@frappe.whitelist()
def acknowledge_operational_alert(alert_id, action, resolution_notes=None, tenant=None):
    """Acknowledge or resolve an operational alert.

    Args:
        alert_id: Alert UUID
        action: 'acknowledge', 'resolve', or 'dismiss'
        resolution_notes: Optional notes
        tenant: Tenant ID (validated against X-Tenant-ID header)

    Returns:
        Updated alert
    """
    if not has_permission("operations", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)
    user_id = frappe.session.user

    alert = frappe.get_doc("Operational Alert", {"name": alert_id, "tenant_id": tenant})
    if not alert:
        frappe.throw(_("Alert not found"), frappe.DoesNotExistError)

    if action == "acknowledge":
        alert.is_acknowledged = 1
        alert.acknowledged_by = user_id
        alert.acknowledged_at = frappe.utils.now()
    elif action == "resolve":
        alert.is_acknowledged = 1
        alert.acknowledged_by = user_id
        alert.acknowledged_at = frappe.utils.now()
        alert.resolution_notes = resolution_notes
    elif action == "dismiss":
        alert.is_acknowledged = 1
        alert.acknowledged_by = user_id
        alert.acknowledged_at = frappe.utils.now()
        alert.resolution_notes = resolution_notes or "Dismissed"
    else:
        frappe.throw(_("Invalid action"), frappe.ValidationError)

    alert.save(ignore_permissions=True)
    return alert.as_dict()


@frappe.whitelist()
def class_cancellation_impact(session_id, tenant=None):
    """Analyze impact of cancelling a class.

    Args:
        session_id: Session UUID
        tenant: Tenant ID (validated against X-Tenant-ID header)

    Returns:
        Impact analysis
    """
    if not has_permission("operations", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)

    session = frappe.get_doc("WS Class Session", {"name": session_id, "tenant": tenant})
    if not session:
        frappe.throw(_("Session not found"), frappe.DoesNotExistError)

    # Get bookings
    bookings = frappe.get_all("WS Booking",
        filters={"session": session_id, "tenant": tenant, "status": "Confirmed"},
        fields=["name", "member", "member_name", "payment_status", "amount_paid"])

    # Get waitlist (using WS Booking with status=Waitlisted)
    waitlist = frappe.get_all("WS Booking",
        filters={"session": session_id, "tenant": tenant, "status": "Waitlisted"},
        fields=["name", "member", "member_name", "position"],
        order_by="creation asc")

    affected_members = len(bookings)
    revenue_at_risk = sum(flt(b.amount_paid) for b in bookings)
    waitlist_can_promote = min(len(waitlist), 5)  # Top 5

    return {
        "session_id": session_id,
        "session_date": str(session.session_date),
        "class_type": session.class_type_id,
        "affected_members": affected_members,
        "revenue_at_risk": revenue_at_risk,
        "bookings": bookings,
        "waitlist": waitlist,
        "waitlist_can_promote": waitlist_can_promote,
        "recommendation": "proceed_with_cancellation" if affected_members == 0 else
                         "notify_and_reschedule" if affected_members < 5 else
                         "consider_alternatives",
    }


@frappe.whitelist()
def optimize_class_schedule(branch_id=None, period_days=30, optimization_goal="maximize_utilization", tenant=None):
    """Get AI-powered schedule optimization recommendations.

    Args:
        branch_id: Optional branch filter
        period_days: Analysis period
        optimization_goal: Goal type
        tenant: Tenant ID (validated against X-Tenant-ID header)

    Returns:
        Optimization recommendations
    """
    if not has_permission("operations", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)

    # This is a placeholder for ML-based optimization
    # In production, this would call a trained model or complex algorithm

    end_date = add_days(nowdate(), period_days)

    # Get current schedule
    conditions = ["tenant = %(tenant)s", "session_date BETWEEN %(start)s AND %(end)s"]
    params = {"tenant": tenant, "start": nowdate(), "end": end_date}

    if branch_id:
        conditions.append("branch_id = %(branch_id)s")
        params["branch_id"] = branch_id

    sessions = frappe.get_all("WS Class Session",
        filters={"tenant": tenant, "session_date": ["between", [nowdate(), end_date]]},
        fields=["name", "class_type_id", "session_date", "start_time", "capacity", "branch_id"])

    # Simple heuristic recommendations
    recommendations = []

    # Group by class type and time slot
    from collections import defaultdict
    slots = defaultdict(list)
    for s in sessions:
        key = (s.class_type_id, str(s.start_time), s.branch_id)
        slots[key].append(s)

    for (class_type, time_slot, branch), slot_sessions in slots.items():
        avg_util = 0
        for sess in slot_sessions:
            bookings = frappe.db.count("WS Booking",
                filters={"session": sess.name, "status": "Confirmed"})
            avg_util += bookings / (cint(sess.capacity) or 1)
        avg_util = avg_util / len(slot_sessions) if slot_sessions else 0

        if avg_util < 0.3:  # Under 30% utilization
            recommendations.append({
                "type": "reduce_frequency",
                "class_type_id": class_type,
                "time_slot": time_slot,
                "branch_id": branch,
                "current_sessions": len(slot_sessions),
                "avg_utilization": round(avg_util * 100, 1),
                "reason": "Low utilization - consider reducing frequency or changing time",
            })
        elif avg_util > 0.9:  # Over 90% utilization
            recommendations.append({
                "type": "add_session",
                "class_type_id": class_type,
                "time_slot": time_slot,
                "branch_id": branch,
                "current_sessions": len(slot_sessions),
                "avg_utilization": round(avg_util * 100, 1),
                "reason": "High utilization - consider adding more sessions",
            })

    return {
        "period_days": period_days,
        "optimization_goal": optimization_goal,
        "recommendations": recommendations,
        "total_sessions_analyzed": len(sessions),
    }


@frappe.whitelist()
def staff_schedule_list(staff_id=None, start_date=None, end_date=None, branch_id=None, tenant=None):
    """Get staff schedules."""
    if not has_permission("staff", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)

    filters = {"tenant_id": tenant}
    if staff_id:
        filters["staff_id"] = staff_id
    if branch_id:
        filters["branch_id"] = branch_id
    if start_date and end_date:
        filters["start_date"] = ["<=", end_date]
        filters["end_date"] = [">=", start_date]

    schedules = frappe.get_all("Staff Schedule", filters=filters, fields="*")
    return {"schedules": schedules}


@frappe.whitelist()
def staff_schedule_create(tenant=None, **kwargs):
    """Create staff schedule."""
    if not has_permission("staff", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)
    kwargs["tenant_id"] = tenant

    schedule = frappe.get_doc({"doctype": "Staff Schedule", **kwargs})
    schedule.insert(ignore_permissions=True)
    return schedule.as_dict()


@frappe.whitelist()
def equipment_list(branch_id=None, equipment_type=None, status=None, tenant=None):
    """Get equipment list."""
    if not has_permission("equipment", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)

    filters = {"tenant_id": tenant}
    if branch_id:
        filters["branch_id"] = branch_id
    if equipment_type:
        filters["equipment_type"] = equipment_type
    if status:
        filters["status"] = status

    equipment = frappe.get_all("Equipment", filters=filters, fields="*")
    return {"equipment": equipment}


@frappe.whitelist()
def schedule_equipment_maintenance(tenant=None, **kwargs):
    """Schedule equipment maintenance."""
    if not has_permission("equipment", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)
    kwargs["tenant_id"] = tenant

    maintenance = frappe.get_doc({"doctype": "Equipment Maintenance", **kwargs})
    maintenance.insert(ignore_permissions=True)
    return maintenance.as_dict()


@frappe.whitelist()
def facility_utilization(branch_id=None, start_date=None, end_date=None, room_id=None, tenant=None):
    """Get facility utilization."""
    if not has_permission("facility", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)

    # Get rooms
    room_filters = {"tenant_id": tenant, "is_active": 1}
    if branch_id:
        room_filters["branch_id"] = branch_id
    if room_id:
        room_filters["name"] = room_id

    rooms = frappe.get_all("Facility Room", filters=room_filters, fields="*")

    # Get bookings for each room
    results = []
    for room in rooms:
        booking_filters = {
            "tenant": tenant,
            "room_id": room.name,
            "status": "Confirmed",
        }
        if start_date and end_date:
            booking_filters["session_date"] = ["between", [start_date, end_date]]

        bookings = frappe.get_all("WS Booking", filters=booking_filters, fields=["name", "session_date", "start_time", "end_time"])

        results.append({
            "room_id": room.name,
            "room_name": room.name,
            "room_type": room.room_type,
            "capacity": room.capacity,
            "bookings_count": len(bookings),
            "bookings": bookings,
        })

    return {"utilization": results, "period": {"start": start_date, "end": end_date}}


@frappe.whitelist()
def manage_waitlist(action, session_id=None, booking_id=None, notify_count=3, tenant=None):
    """Manage waitlist operations using WS Booking with status='Waitlisted'.

    Args:
        action: 'view' | 'promote' | 'notify' | 'remove' | 'clear_expired'
        session_id: Session ID (required for view, promote, notify, clear_expired)
        booking_id: Booking ID (required for promote, remove)
        notify_count: Number of waitlisted members to notify (default 3)
        tenant: Tenant ID (validated against X-Tenant-ID header)

    Returns:
        Dict with waitlist data or operation result
    """
    if not has_permission("bookings", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant = require_api_tenant(tenant)

    if action == "view":
        if not session_id:
            frappe.throw(_("session_id required for view"), frappe.ValidationError)
        waitlist = frappe.get_all("WS Booking",
            filters={"session": session_id, "tenant": tenant, "status": "Waitlisted"},
            fields=["name", "member", "member_name", "phone", "creation"],
            order_by="creation asc")
        return {"waitlist": waitlist}

    elif action == "promote":
        if not booking_id:
            frappe.throw(_("booking_id required for promote"), frappe.ValidationError)
        # Use the authoritative promote_waitlist from booking module
        from wellness_studio.api.booking import promote_waitlist
        result = promote_waitlist(session_id, tenant)
        if result:
            return {"promoted": True, "booking_id": result.get("booking_id"), "status": result.get("status")}
        return {"promoted": False, "reason": "No eligible waitlisted booking or session at capacity"}

    elif action == "notify":
        if not session_id:
            frappe.throw(_("session_id required for notify"), frappe.ValidationError)
        # Get top N waitlisted members for notification
        waitlist = frappe.get_all("WS Booking",
            filters={"session": session_id, "tenant": tenant, "status": "Waitlisted"},
            fields=["name", "member", "member_name", "phone"],
            order_by="creation asc",
            limit=cint(notify_count))

        # NOTE: This action only retrieves waitlisted members for notification.
        # Actual notification delivery (SMS, WhatsApp, Email, Push) is NOT implemented here.
        # Caller is responsible for delivering notifications using the returned contact information.
        for entry in waitlist:
            frappe.logger().info(f"Waitlisted member available for notification: {entry.member_name} for session {session_id}")

        return {"notified": len(waitlist), "entries": waitlist}

    elif action == "remove":
        if not booking_id:
            frappe.throw(_("booking_id required for remove"), frappe.ValidationError)
        # Verify booking belongs to this tenant and is waitlisted
        booking = frappe.get_doc("WS Booking", {"name": booking_id, "tenant": tenant, "status": "Waitlisted"})
        if not booking:
            frappe.throw(_("Waitlisted booking not found"), frappe.DoesNotExistError)
        booking.status = "Cancelled"
        booking.cancellation_reason = "Removed from waitlist"
        booking.save(ignore_permissions=True)

        # Update session waitlist count
        frappe.db.set_value("WS Class Session", session_id, "waitlist_count",
            max((frappe.db.get_value("WS Class Session", session_id, "waitlist_count") or 1) - 1, 0),
            update_modified=False)

        return {"removed": True, "booking_id": booking_id}

    elif action == "clear_expired":
        # Clear waitlisted bookings for past sessions
        # First, get the count per session to update waitlist_count
        expired_per_session = frappe.db.sql("""
            SELECT wb.session, COUNT(*) as cnt
            FROM `tabWS Booking` wb
            JOIN `tabWS Class Session` cs ON wb.session = cs.name
            WHERE wb.tenant = %s
            AND wb.status = 'Waitlisted'
            AND cs.session_date < CURDATE()
            GROUP BY wb.session
        """, tenant, as_dict=True)

        # Expire the bookings
        expired = frappe.db.sql("""
            UPDATE `tabWS Booking` wb
            JOIN `tabWS Class Session` cs ON wb.session = cs.name
            SET wb.status = 'Expired', wb.updated_at = NOW()
            WHERE wb.tenant = %s
            AND wb.status = 'Waitlisted'
            AND cs.session_date < CURDATE()
        """, tenant)

        # Update waitlist_count for each affected session
        for row in expired_per_session:
            frappe.db.set_value("WS Class Session", row.session, "waitlist_count",
                max((frappe.db.get_value("WS Class Session", row.session, "waitlist_count") or 0) - row.cnt, 0),
                update_modified=False)

        return {"cleared": expired}

    else:
        frappe.throw(_("Invalid action"), frappe.ValidationError)