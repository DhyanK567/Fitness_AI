"""Frappe hooks limited to the implemented Day 1–3 ERPE scope."""

import os


def _allowed_origins():
    configured = os.environ.get("FRAPPE_ALLOWED_ORIGINS", "http://localhost:8080")
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


app_name = "wellness_studio"
app_title = "Wellness Studio OS"
app_publisher = "Wellness Studio OS Team"
app_description = "Universal multi-tenant wellness studio management system"
app_email = ""
app_license = "MIT"
app_version = "0.0.1"
allow_cors = _allowed_origins()
required_apps = ["erpnext"]
after_install = "wellness_studio.install.after_install"
after_migrate = "wellness_studio.install.after_migrate"

scheduler_events = {
    "daily": [
        "wellness_studio.api.membership_activation.expire_memberships",
        "wellness_studio.api.event_registration.expire_payment_holds",
    ],
}

has_permission = {
    doctype: "wellness_studio.tenant.permissions.has_permission"
    for doctype in (
        "Wellness Tenant Scope", "WS Studio Scope", "WS Branch Scope", "WS Member",
        "WS Member Plan", "WS Membership", "WS Class Type", "WS Class Schedule",
        "WS Class Session", "WS Booking", "WS Session Attendance",
        "WS Attendance Correction",
        "WS Plan Class Entitlement", "WS Staff Class Assignment", "WS Lead Activity",
        "WS Payment Record", "WS Event", "WS Event Registration", "WS Lead",
        "WS Wellness Staff",
    )
}

permission_query_conditions = {
    "Wellness Tenant Scope": "wellness_studio.tenant.permissions.tenant_scope_query_conditions",
    "WS Member": "wellness_studio.tenant.permissions.member_query_conditions",
    "WS Member Plan": "wellness_studio.tenant.permissions.member_plan_query_conditions",
    "WS Membership": "wellness_studio.tenant.permissions.membership_query_conditions",
    "WS Class Type": "wellness_studio.tenant.permissions.class_type_query_conditions",
    "WS Class Schedule": "wellness_studio.tenant.permissions.class_schedule_query_conditions",
    "WS Class Session": "wellness_studio.tenant.permissions.class_session_query_conditions",
    "WS Booking": "wellness_studio.tenant.permissions.booking_query_conditions",
    "WS Session Attendance": "wellness_studio.tenant.permissions.attendance_query_conditions",
    "WS Payment Record": "wellness_studio.tenant.permissions.payment_query_conditions",
    "WS Event": "wellness_studio.tenant.permissions.event_query_conditions",
    "WS Event Registration": "wellness_studio.tenant.permissions.event_registration_query_conditions",
    "WS Lead": "wellness_studio.tenant.permissions.lead_query_conditions",
    "WS Studio Scope": "wellness_studio.tenant.permissions.studio_scope_query_conditions",
    "WS Branch Scope": "wellness_studio.tenant.permissions.branch_scope_query_conditions",
    "WS Wellness Staff": "wellness_studio.tenant.permissions.staff_query_conditions",
}
