"""Tenant-scoped Frappe permission hooks for the API integration boundary."""

from __future__ import annotations

import frappe

_API_IDENTITY_ALLOWED_ROLES = {"All", "Guest", "System User", "WS API Integration"}


def _requested_tenant() -> str | None:
    request = getattr(frappe.local, "request", None)
    headers = getattr(request, "headers", None)
    return headers.get("X-Tenant-ID") if headers else None


def require_api_tenant(tenant: str) -> str:
    """Require the dedicated gateway identity and bind input to trusted request scope."""
    user = frappe.session.user
    roles = set(frappe.get_roles()) if user not in {"Guest", "Administrator"} else set()
    if user in {"Guest", "Administrator"} or "WS API Integration" not in roles or not roles <= _API_IDENTITY_ALLOWED_ROLES:
        frappe.throw("A restricted Wellness Studio API identity is required", frappe.PermissionError)
    requested = _requested_tenant()
    if not tenant or not requested or requested != tenant:
        frappe.throw("Tenant context does not match the gateway request", frappe.PermissionError)
    row = frappe.db.get_value("Wellness Tenant Scope", tenant, ["tenant_code", "is_active"], as_dict=True)
    if not row or row.tenant_code != tenant or not row.is_active:
        frappe.throw("Tenant is missing or inactive", frappe.PermissionError)
    return tenant


def has_permission(doc, ptype=None, user=None):
    """Deny generic DocType REST/Desk access; all gateway traffic uses whitelisted APIs."""
    return frappe.session.user == "Administrator"


def _condition() -> str:
    if frappe.session.user == "Administrator":
        return "1=1"
    tenant = _requested_tenant()
    if not tenant:
        return "1=0"
    require_api_tenant(tenant)
    return f"tenant = {frappe.db.escape(tenant)}"


def member_query_conditions(user=None): return _condition()
def member_plan_query_conditions(user=None): return _condition()
def membership_query_conditions(user=None): return _condition()
def class_type_query_conditions(user=None): return _condition()
def class_schedule_query_conditions(user=None): return _condition()
def class_session_query_conditions(user=None): return _condition()
def booking_query_conditions(user=None): return _condition()
def attendance_query_conditions(user=None): return _condition()
def payment_query_conditions(user=None): return _condition()
def event_query_conditions(user=None): return _condition()
def event_registration_query_conditions(user=None): return _condition()
def lead_query_conditions(user=None): return _condition()
def studio_scope_query_conditions(user=None): return _condition()
def branch_scope_query_conditions(user=None): return _condition()
def staff_query_conditions(user=None): return _condition()


def tenant_scope_query_conditions(user=None):
    if frappe.session.user == "Administrator":
        return "1=1"
    tenant = _requested_tenant()
    if not tenant:
        return "1=0"
    require_api_tenant(tenant)
    escaped = frappe.db.escape(tenant)
    return f"(`tabWellness Tenant Scope`.`name` = {escaped} OR `tabWellness Tenant Scope`.`tenant_code` = {escaped})"
