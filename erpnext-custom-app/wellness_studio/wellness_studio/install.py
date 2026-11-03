"""Idempotent installation hooks for the custom Frappe application."""

import frappe


WELLNESS_ROLES = ("WS Owner", "WS Admin", "WS Front Desk", "WS Trainer", "WS Member", "WS API Integration")
API_INTEGRATION_ROLE = "WS API Integration"

TENANT_UNIQUE_CONSTRAINTS = (
    ("WS Member", ("tenant", "email"), "uniq_ws_member_tenant_email"),
    ("WS Member", ("tenant", "phone"), "uniq_ws_member_tenant_phone"),
    ("WS Class Session", ("tenant", "schedule", "session_date"), "uniq_ws_schedule_session_date"),
    ("WS Booking", ("tenant", "idempotency_key"), "uniq_ws_booking_idempotency"),
    ("WS Member Plan", ("tenant", "plan_name"), "uniq_ws_plan_tenant_name"),
    ("WS Class Type", ("tenant", "class_name"), "uniq_ws_class_type_tenant_name"),
    ("WS Wellness Staff", ("tenant", "email"), "uniq_ws_staff_tenant_email"),
    ("WS Payment Record", ("tenant", "provider", "provider_reference"), "uniq_ws_payment_provider_ref"),
    ("WS Payment Record", ("tenant", "provider", "provider_order_reference"), "uniq_ws_payment_order_ref"),
    ("WS Payment Record", ("tenant", "idempotency_key"), "uniq_ws_payment_idempotency"),
    ("WS Session Attendance", ("tenant", "member", "session"), "uniq_ws_attendance_session_member"),
)

TENANT_INDEXES = (
    ("WS Membership", ("tenant", "member", "status"), "idx_ws_membership_member_status"),
    ("WS Membership", ("tenant", "status", "end_date"), "idx_ws_membership_expiry"),
    ("WS Class Session", ("tenant", "session_date", "status"), "idx_ws_session_date_status"),
    ("WS Class Session", ("tenant", "trainer", "session_date"), "idx_ws_session_trainer_date"),
    ("WS Booking", ("tenant", "session", "status", "creation"), "idx_ws_booking_session_created"),
    ("WS Booking", ("tenant", "member", "creation"), "idx_ws_booking_member_created"),
    ("WS Lead", ("tenant", "phone"), "idx_ws_lead_phone"),
    ("WS Lead", ("tenant", "email"), "idx_ws_lead_email"),
    ("WS Payment Record", ("tenant", "status", "paid_on"), "idx_ws_payment_status_paid"),
    ("WS Event Registration", ("tenant", "event", "status"), "idx_ws_registration_event_status"),
)


def after_install():
    ensure_roles()
    ensure_database_constraints()


def after_migrate():
    ensure_roles()
    ensure_database_constraints()


def ensure_roles():
    """Create the app's roles idempotently, including the gateway-only role."""
    for role_name in WELLNESS_ROLES:
        if frappe.db.exists("Role", role_name):
            if role_name == API_INTEGRATION_ROLE:
                role = frappe.get_doc("Role", role_name)
                if role.desk_access:
                    role.desk_access = 0
                    role.save(ignore_permissions=True)
            continue
        role = frappe.get_doc({
            "doctype": "Role",
            "role_name": role_name,
            "desk_access": 0 if role_name == API_INTEGRATION_ROLE else 1,
        })
        role.insert(ignore_permissions=True)


def ensure_database_constraints():
    """Install tenant-scoped uniqueness and lookup indexes idempotently."""
    for doctype, fields, name in TENANT_UNIQUE_CONSTRAINTS:
        frappe.db.add_unique(doctype, list(fields), name)
    for doctype, fields, name in TENANT_INDEXES:
        frappe.db.add_index(doctype, list(fields), name)
