"""Tenant-scoped reporting methods shared by dashboards and governed assistants."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, getdate, now_datetime, today
from wellness_studio.tenant.permissions import require_api_tenant


REPORTS = {
    "active_members": "Active Members",
    "revenue_by_plan": "Revenue by Plan",
    "occupancy": "Class Occupancy",
    "attendance_trend": "Attendance Trend",
    "renewal_pipeline": "Renewal Pipeline",
    "low_attendance_classes": "Low Attendance Classes",
    "memberships_expiring": "Memberships Expiring",
}


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _period(from_date=None, to_date=None):
    end = getdate(to_date or today())
    start = getdate(from_date or add_days(end, -30))
    if end < start or (end - start).days > 366:
        frappe.throw(_("Report date range must be between 0 and 366 days"), frappe.ValidationError)
    return start, end


@frappe.whitelist(methods=["GET"])
def report_catalog(tenant: str):
    _tenant(tenant)
    return [{"code": code, "name": name} for code, name in REPORTS.items()]


@frappe.whitelist(methods=["GET"])
def dashboard_summary(tenant: str):
    tenant = _tenant(tenant)
    current = getdate(today())
    week_end = add_days(current, 7)
    active_members = frappe.db.sql(
        """SELECT COUNT(DISTINCT member) FROM `tabWS Membership`
           WHERE tenant=%s AND status='Active' AND start_date<=%s AND end_date>=%s""",
        (tenant, current, current),
    )[0][0]
    sessions_today = frappe.db.sql(
        """SELECT COUNT(*), COALESCE(SUM(confirmed_count),0), COALESCE(SUM(capacity),0)
           FROM `tabWS Class Session` WHERE tenant=%s AND session_date=%s AND status!='Cancelled'""",
        (tenant, current),
    )[0]
    expiring = frappe.db.sql(
        """SELECT COUNT(*) FROM `tabWS Membership`
           WHERE tenant=%s AND status='Active' AND end_date BETWEEN %s AND %s""",
        (tenant, current, week_end),
    )[0][0]
    revenue = frappe.db.sql(
        """SELECT COALESCE(SUM(amount),0) FROM `tabWS Payment Record`
           WHERE tenant=%s AND status='Paid' AND DATE(paid_on) BETWEEN %s AND %s""",
        (tenant, current.replace(day=1), current),
    )[0][0]
    capacity = int(sessions_today[2] or 0)
    booked = int(sessions_today[1] or 0)
    return {
        "active_members": int(active_members or 0),
        "sessions_today": int(sessions_today[0] or 0),
        "booked_today": booked,
        "capacity_today": capacity,
        "occupancy_percent": round((booked / capacity) * 100, 2) if capacity else 0,
        "memberships_expiring_7d": int(expiring or 0),
        "revenue_month_to_date": float(revenue or 0),
        "currency": "INR",
        "generated_at": now_datetime(),
    }


@frappe.whitelist(methods=["GET"])
def run_report(tenant: str, report_code: str, from_date=None, to_date=None):
    tenant = _tenant(tenant)
    if report_code not in REPORTS:
        frappe.throw(_("Unknown report"), frappe.DoesNotExistError)
    start, end = _period(from_date, to_date)
    queries = {
        "active_members": ("""SELECT status, COUNT(*) AS count FROM `tabWS Membership`
            WHERE tenant=%s AND start_date<=%s AND end_date>=%s GROUP BY status ORDER BY status""", (tenant, end, start)),
        "revenue_by_plan": ("""SELECT COALESCE(mp.plan_name,'Unassigned') AS plan_name, SUM(p.amount) AS revenue
            FROM `tabWS Payment Record` p LEFT JOIN `tabWS Membership` m ON m.name=p.membership
            LEFT JOIN `tabWS Member Plan` mp ON mp.name=m.plan
            WHERE p.tenant=%s AND p.status='Paid' AND DATE(p.paid_on) BETWEEN %s AND %s
            GROUP BY mp.plan_name ORDER BY revenue DESC""", (tenant, start, end)),
        "occupancy": ("""SELECT class_type, SUM(confirmed_count) AS booked, SUM(capacity) AS capacity
            FROM `tabWS Class Session` WHERE tenant=%s AND session_date BETWEEN %s AND %s AND status!='Cancelled'
            GROUP BY class_type ORDER BY class_type""", (tenant, start, end)),
        "attendance_trend": ("""SELECT DATE(marked_on) AS date, status, COUNT(*) AS count
            FROM `tabWS Session Attendance` WHERE tenant=%s AND DATE(marked_on) BETWEEN %s AND %s
            GROUP BY DATE(marked_on), status ORDER BY date, status""", (tenant, start, end)),
        "renewal_pipeline": ("""SELECT status, COUNT(*) AS count FROM `tabWS Membership`
            WHERE tenant=%s AND end_date BETWEEN %s AND %s GROUP BY status ORDER BY status""", (tenant, start, end)),
        "low_attendance_classes": ("""SELECT s.class_type, COUNT(a.name) AS attendance_count, SUM(s.capacity) AS offered_capacity
            FROM `tabWS Class Session` s LEFT JOIN `tabWS Session Attendance` a ON a.session=s.name AND a.status IN ('Present','Late')
            WHERE s.tenant=%s AND s.session_date BETWEEN %s AND %s GROUP BY s.class_type ORDER BY attendance_count ASC""", (tenant, start, end)),
        "memberships_expiring": ("""SELECT name, member, plan, end_date FROM `tabWS Membership`
            WHERE tenant=%s AND status='Active' AND end_date BETWEEN %s AND %s ORDER BY end_date""", (tenant, start, end)),
    }
    query, params = queries[report_code]
    rows = frappe.db.sql(query, params, as_dict=True)
    columns = list(rows[0].keys()) if rows else []
    return {
        "report_code": report_code,
        "period": {"from": start, "to": end},
        "columns": columns,
        "rows": rows,
        "totals": {"row_count": len(rows)},
        "generated_at": now_datetime(),
    }
