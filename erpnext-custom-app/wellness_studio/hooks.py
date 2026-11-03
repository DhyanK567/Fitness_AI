"""Frappe hooks for Wellness Studio - Production Ready."""

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

# ============================================
# SCHEDULER EVENTS
# ============================================
scheduler_events = {
    "daily": [
        "wellness_studio.api.membership_activation.expire_memberships",
        "wellness_studio.api.event_registration.expire_payment_holds",
    ],
    "hourly": [
    ],
    "cron": {
    },
}

# ============================================
# DOC EVENTS
# ============================================
doc_events = {
    # Equipment Maintenance
    "Equipment Maintenance": {
        "on_update": "wellness_studio.events.equipment_maintenance.on_update",
        "after_insert": "wellness_studio.events.equipment_maintenance.after_insert",
    },
    # Staff Schedule
    "Staff Schedule": {
        "on_update": "wellness_studio.events.staff_schedule.on_update",
        "before_save": "wellness_studio.events.staff_schedule.before_save",
    },
    # Operational Alert
    "Operational Alert": {
        "on_update": "wellness_studio.events.operational_alert.on_update",
    },
    # Referral
    "Referral": {
        "on_update": "wellness_studio.events.referral.on_update",
        "after_insert": "wellness_studio.events.referral.after_insert",
    },
    # Upsell Offer
    "Upsell Offer": {
        "on_update": "wellness_studio.events.upsell_offer.on_update",
    },
    # Growth Experiment
    "Growth Experiment": {
        "on_update": "wellness_studio.events.growth_experiment.on_update",
    },
    # Experiment Enrollment
    "Experiment Enrollment": {
        "on_update": "wellness_studio.events.experiment_enrollment.on_update",
    },
    # Marketing Campaign
    "Marketing Campaign": {
        "on_update": "wellness_studio.events.marketing_campaign.on_update",
    },
    # Content Calendar
    "Content Calendar": {
        "on_update": "wellness_studio.events.content_calendar.on_update",
        "before_save": "wellness_studio.events.content_calendar.before_save",
    },
    # Review
    "Review": {
        "on_update": "wellness_studio.events.review.on_update",
    },
    # Competitor
    "Competitor": {
        "on_update": "wellness_studio.events.competitor.on_update",
    },
    # Facility Room
    "Facility Room": {
        "on_update": "wellness_studio.events.facility_room.on_update",
    },
}

# ============================================
# PERMISSIONS
# ============================================
has_permission = {
    doctype: "wellness_studio.tenant.permissions.has_permission"
    for doctype in (
        "Studio Tenant", "WS Member", "WS Member Plan", "WS Membership",
        "WS Class Type", "WS Class Session", "WS Booking", "WS Session Attendance",
        "WS Payment Record", "WS Event", "WS Event Registration", "WS Lead",
        "Equipment", "Equipment Maintenance", "Staff Schedule", "Facility Room",
        "Operational Alert", "Referral Campaign", "Referral", "Upsell Offer",
        "Growth Experiment", "Experiment Enrollment", "Marketing Campaign",
        "Audience Segment", "Content Calendar", "Review", "Competitor",
    )
}

permission_query_conditions = {
    "WS Member": "wellness_studio.tenant.permissions.member_query_conditions",
    "WS Member Plan": "wellness_studio.tenant.permissions.member_plan_query_conditions",
    "WS Membership": "wellness_studio.tenant.permissions.membership_query_conditions",
    "WS Class Type": "wellness_studio.tenant.permissions.class_type_query_conditions",
    "WS Class Session": "wellness_studio.tenant.permissions.class_session_query_conditions",
    "WS Booking": "wellness_studio.tenant.permissions.booking_query_conditions",
    "WS Session Attendance": "wellness_studio.tenant.permissions.attendance_query_conditions",
    "WS Payment Record": "wellness_studio.tenant.permissions.payment_query_conditions",
    "WS Event": "wellness_studio.tenant.permissions.event_query_conditions",
    "WS Event Registration": "wellness_studio.tenant.permissions.event_registration_query_conditions",
    "WS Lead": "wellness_studio.tenant.permissions.lead_query_conditions",
    "Equipment": "wellness_studio.tenant.permissions.equipment_query_conditions",
    "Equipment Maintenance": "wellness_studio.tenant.permissions.equipment_maintenance_query_conditions",
    "Staff Schedule": "wellness_studio.tenant.permissions.staff_schedule_query_conditions",
    "Facility Room": "wellness_studio.tenant.permissions.facility_room_query_conditions",
    "Operational Alert": "wellness_studio.tenant.permissions.operational_alert_query_conditions",
    "Referral Campaign": "wellness_studio.tenant.permissions.referral_campaign_query_conditions",
    "Referral": "wellness_studio.tenant.permissions.referral_query_conditions",
    "Upsell Offer": "wellness_studio.tenant.permissions.upsell_offer_query_conditions",
    "Growth Experiment": "wellness_studio.tenant.permissions.growth_experiment_query_conditions",
    "Experiment Enrollment": "wellness_studio.tenant.permissions.experiment_enrollment_query_conditions",
    "Marketing Campaign": "wellness_studio.tenant.permissions.marketing_campaign_query_conditions",
    "Audience Segment": "wellness_studio.tenant.permissions.audience_segment_query_conditions",
    "Content Calendar": "wellness_studio.tenant.permissions.content_calendar_query_conditions",
    "Review": "wellness_studio.tenant.permissions.review_query_conditions",
    "Competitor": "wellness_studio.tenant.permissions.competitor_query_conditions",
}

# ============================================
# OVERRIDE WHITELISTED METHODS
# ============================================
override_whitelisted_methods = {
    # Operations
    "wellness_studio.api.operations.class_capacity_utilization": "wellness_studio.api.operations.class_capacity_utilization",
    "wellness_studio.api.operations.get_operational_alerts": "wellness_studio.api.operations.get_operational_alerts",
    "wellness_studio.api.operations.acknowledge_operational_alert": "wellness_studio.api.operations.acknowledge_operational_alert",
    "wellness_studio.api.operations.class_cancellation_impact": "wellness_studio.api.operations.class_cancellation_impact",
    "wellness_studio.api.operations.optimize_class_schedule": "wellness_studio.api.operations.optimize_class_schedule",
    "wellness_studio.api.operations.staff_schedule_list": "wellness_studio.api.operations.staff_schedule_list",
    "wellness_studio.api.operations.staff_schedule_create": "wellness_studio.api.operations.staff_schedule_create",
    "wellness_studio.api.operations.equipment_list": "wellness_studio.api.operations.equipment_list",
    "wellness_studio.api.operations.schedule_equipment_maintenance": "wellness_studio.api.operations.schedule_equipment_maintenance",
    "wellness_studio.api.operations.facility_utilization": "wellness_studio.api.operations.facility_utilization",
    "wellness_studio.api.operations.manage_waitlist": "wellness_studio.api.operations.manage_waitlist",

    # Growth
    "wellness_studio.api.growth.acquisition_metrics": "wellness_studio.api.growth.acquisition_metrics",
    "wellness_studio.api.growth.referral_metrics": "wellness_studio.api.growth.referral_metrics",
    "wellness_studio.api.growth.create_referral_campaign": "wellness_studio.api.growth.create_referral_campaign",
    "wellness_studio.api.growth.upsell_opportunities": "wellness_studio.api.growth.upsell_opportunities",
    "wellness_studio.api.growth.create_upsell_offer": "wellness_studio.api.growth.create_upsell_offer",
    "wellness_studio.api.growth.lifetime_value_metrics": "wellness_studio.api.growth.lifetime_value_metrics",
    "wellness_studio.api.growth.expansion_opportunities": "wellness_studio.api.growth.expansion_opportunities",
    "wellness_studio.api.growth.track_growth_experiment": "wellness_studio.api.growth.track_growth_experiment",
    "wellness_studio.api.growth.create_growth_experiment": "wellness_studio.api.growth.create_growth_experiment",

    # Marketing
    "wellness_studio.api.marketing.campaign_performance": "wellness_studio.api.marketing.campaign_performance",
    "wellness_studio.api.marketing.create_marketing_campaign": "wellness_studio.api.marketing.create_marketing_campaign",
    "wellness_studio.api.marketing.audience_segments": "wellness_studio.api.marketing.audience_segments",
    "wellness_studio.api.marketing.create_audience_segment": "wellness_studio.api.marketing.create_audience_segment",
    "wellness_studio.api.marketing.content_calendar": "wellness_studio.api.marketing.content_calendar",
    "wellness_studio.api.marketing.schedule_content": "wellness_studio.api.marketing.schedule_content",
    "wellness_studio.api.marketing.lead_attribution": "wellness_studio.api.marketing.lead_attribution",
    "wellness_studio.api.marketing.brand_health_metrics": "wellness_studio.api.marketing.brand_health_metrics",
    "wellness_studio.api.marketing.manage_review_response": "wellness_studio.api.marketing.manage_review_response",
    "wellness_studio.api.marketing.competitor_intelligence": "wellness_studio.api.marketing.competitor_intelligence",
}

# ============================================
# FIXTURES (for easy setup)
# ============================================
fixtures = [
    {"dt": "Role", "filters": [["name", "in", ["Studio Owner", "Studio Admin", "Studio Front Desk", "Studio Trainer"]]]},
    {"dt": "Workflow", "filters": [["name", "in", ["Equipment Maintenance Approval", "Staff Schedule Approval", "Marketing Campaign Approval"]]]},
]

# ============================================
# INSTALL/UNINSTALL
# ============================================
before_install = "wellness_studio.install.before_install"
after_install = "wellness_studio.install.after_install"
before_uninstall = "wellness_studio.install.before_uninstall"
after_uninstall = "wellness_studio.install.after_uninstall"

# ============================================
# MODULES
# ============================================
modules_txt = """Wellness Studio
Members
Memberships
Classes
Bookings
Attendance
Leads
Events
Payments
Reports
Staff
Operations
Growth
Marketing
Notifications
Settings
AI"""

# ============================================
# JINJA ENVIRONMENT
# ============================================
jinja = {
    "methods": [
        "wellness_studio.utils.jinja.get_tenant_currency",
        "wellness_studio.utils.jinja.format_currency",
    ],
    "filters": [
        "wellness_studio.utils.jinja.truncate_words",
    ],
}