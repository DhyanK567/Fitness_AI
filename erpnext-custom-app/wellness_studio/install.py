"""Installation hooks for Wellness Studio app."""

import frappe
from frappe import _


def before_install():
    """Run before app installation."""
    # Ensure required apps are installed
    if not frappe.get_installed_apps() or "erpnext" not in frappe.get_installed_apps():
        frappe.throw(_("ERPNext must be installed before Wellness Studio"))


def after_install():
    """Run after app installation."""
    # Create standard roles
    create_standard_roles()

    # Create workflow states
    create_workflow_states()

    # Create default notification templates
    create_notification_templates()

    # Create standard email templates
    create_email_templates()

    # Setup tenant-scoped defaults
    setup_tenant_defaults()

    print("Wellness Studio installed successfully!")


def before_uninstall():
    """Run before app uninstallation."""
    # Clean up custom fields if needed
    pass


def after_uninstall():
    """Run after app uninstallation."""
    pass


def create_standard_roles():
    """Create standard roles for the app."""
    roles = [
        {
            "role_name": "Studio Owner",
            "desk_access": 1,
            "is_custom": 1,
        },
        {
            "role_name": "Studio Admin",
            "desk_access": 1,
            "is_custom": 1,
        },
        {
            "role_name": "Studio Front Desk",
            "desk_access": 1,
            "is_custom": 1,
        },
        {
            "role_name": "Studio Trainer",
            "desk_access": 1,
            "is_custom": 1,
        },
    ]

    for role_data in roles:
        if not frappe.db.exists("Role", role_data["role_name"]):
            role = frappe.get_doc({"doctype": "Role", **role_data})
            role.insert(ignore_permissions=True)
            print(f"Created role: {role_data['role_name']}")


def create_workflow_states():
    """Create standard workflow states."""
    states = [
        {"workflow_state_name": "Draft", "style": "Warning"},
        {"workflow_state_name": "Pending Approval", "style": "Info"},
        {"workflow_state_name": "Approved", "style": "Success"},
        {"workflow_state_name": "Rejected", "style": "Danger"},
        {"workflow_state_name": "Active", "style": "Success"},
        {"workflow_state_name": "Completed", "style": "Success"},
        {"workflow_state_name": "Cancelled", "style": "Danger"},
        {"workflow_state_name": "Scheduled", "style": "Info"},
        {"workflow_state_name": "In Progress", "style": "Primary"},
        {"workflow_state_name": "Maintenance", "style": "Warning"},
    ]

    for state in states:
        if not frappe.db.exists("Workflow State", state["workflow_state_name"]):
            ws = frappe.get_doc({"doctype": "Workflow State", **state})
            ws.insert(ignore_permissions=True)


def create_notification_templates():
    """Create default notification templates."""
    templates = [
        {
            "name": "Class Booking Confirmation",
            "subject": "Booking Confirmed - {{ class_name }} on {{ date }}",
            "channel": "WhatsApp",
            "message": "Hi {{ member_name }},\n\nYour booking for {{ class_name }} on {{ date }} at {{ time }} is confirmed.\n\nSee you there!\n{{ studio_name }}",
            "is_standard": 1,
        },
        {
            "name": "Class Reminder 12h",
            "subject": "Reminder: {{ class_name }} in 12 hours",
            "channel": "WhatsApp",
            "message": "Hi {{ member_name }},\n\nReminder: Your class {{ class_name }} starts in 12 hours at {{ time }}.\n\n{{ studio_name }}",
            "is_standard": 1,
        },
        {
            "name": "Class Reminder 1h",
            "subject": "Reminder: {{ class_name }} in 1 hour",
            "channel": "WhatsApp",
            "message": "Hi {{ member_name }},\n\nYour class {{ class_name }} starts in 1 hour at {{ time }}.\n\n{{ studio_name }}",
            "is_standard": 1,
        },
        {
            "name": "Membership Renewal 7d",
            "subject": "Membership expiring in 7 days",
            "channel": "WhatsApp",
            "message": "Hi {{ member_name }},\n\nYour {{ plan_name }} membership expires on {{ expiry_date }}.\n\nRenew now to continue your wellness journey!\n{{ studio_name }}",
            "is_standard": 1,
        },
        {
            "name": "Membership Renewal 3d",
            "subject": "Membership expiring in 3 days",
            "channel": "WhatsApp",
            "message": "Hi {{ member_name }},\n\nYour {{ plan_name }} membership expires in 3 days ({{ expiry_date }}).\n\nDon't lose your progress - renew today!\n{{ studio_name }}",
            "is_standard": 1,
        },
        {
            "name": "Membership Renewal 1d",
            "subject": "Membership expiring tomorrow",
            "channel": "WhatsApp",
            "message": "Hi {{ member_name }},\n\nYour {{ plan_name }} membership expires TOMORROW ({{ expiry_date }}).\n\nLast chance to renew without interruption!\n{{ studio_name }}",
            "is_standard": 1,
        },
        {
            "name": "Payment Received",
            "subject": "Payment Received - {{ amount }}",
            "channel": "WhatsApp",
            "message": "Hi {{ member_name }},\n\nWe've received your payment of {{ amount }} for {{ purpose }}.\n\nThank you!\n{{ studio_name }}",
            "is_standard": 1,
        },
        {
            "name": "Referral Reward",
            "subject": "You earned a referral reward!",
            "channel": "WhatsApp",
            "message": "Hi {{ member_name }},\n\n{{ referee_name }} joined using your referral!\nYou've earned {{ reward }}.\n\n{{ studio_name }}",
            "is_standard": 1,
        },
        {
            "name": "Marketing Campaign Content Scheduled",
            "subject": "Content scheduled for {{ scheduled_at }}",
            "channel": "Email",
            "message": "Hi {{ user_name }},\n\nYour content '{{ title }}' has been scheduled for {{ scheduled_at }} on {{ channel }}.\n\nView in calendar: {{ calendar_url }}\n\n{{ studio_name }}",
            "is_standard": 1,
        },
        {
            "name": "Operational Alert - Critical",
            "subject": "CRITICAL: {{ title }}",
            "channel": "Email",
            "message": "Critical operational alert:\n\n{{ message }}\n\nSource: {{ source_entity_type }} {{ source_entity_id }}\n\nView in dashboard: {{ dashboard_url }}\n\n{{ studio_name }}",
            "is_standard": 1,
        },
    ]

    for template in templates:
        if not frappe.db.exists("Notification Template", template["name"]):
            nt = frappe.get_doc({"doctype": "Notification Template", **template})
            nt.insert(ignore_permissions=True)
            print(f"Created notification template: {template['name']}")


def create_email_templates():
    """Create standard email templates."""
    templates = [
        {
            "name": "Welcome Email",
            "subject": "Welcome to {{ studio_name }}!",
            "response": """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Welcome to {{ studio_name }}, {{ member_name }}!</h2>
                    <p>We're excited to have you join our wellness community.</p>
                    <p>Your membership: <strong>{{ plan_name }}</strong></p>
                    <p>Start date: {{ start_date }}</p>
                    <p><a href="{{ portal_url }}" style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Access Your Portal</a></p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">If you have any questions, reply to this email or contact us at {{ support_email }}</p>
                </div>
            """,
        },
        {
            "name": "Membership Expiry Warning",
            "subject": "Your {{ studio_name }} membership expires soon",
            "response": """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Membership Expiring Soon</h2>
                    <p>Hi {{ member_name }},</p>
                    <p>Your <strong>{{ plan_name }}</strong> membership expires on <strong>{{ expiry_date }}</strong>.</p>
                    <p>Renew now to avoid any interruption to your classes and benefits.</p>
                    <p><a href="{{ renewal_url }}" style="background: #FF5722; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Renew Membership</a></p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">{{ studio_name }} Team</p>
                </div>
            """,
        },
        {
            "name": "Marketing Campaign Report",
            "subject": "Weekly Campaign Performance Report",
            "response": """
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Weekly Marketing Report - {{ week_start }} to {{ week_end }}</h2>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="background: #f5f5f5;">
                            <th style="padding: 8px; border: 1px solid #ddd;">Campaign</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Channel</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Spend</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">Conversions</th>
                            <th style="padding: 8px; border: 1px solid #ddd;">ROAS</th>
                        </tr>
                        {{#each campaigns}}
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd;">{{name}}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">{{channel}}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">{{spend}}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">{{conversions}}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">{{roas}}</td>
                        </tr>
                        {{/each}}
                    </table>
                    <p><a href="{{ dashboard_url }}" style="background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">View Full Dashboard</a></p>
                </div>
            """,
        },
    ]

    for template in templates:
        if not frappe.db.exists("Email Template", template["name"]):
            et = frappe.get_doc({"doctype": "Email Template", **template})
            et.insert(ignore_permissions=True)
            print(f"Created email template: {template['name']}")


def setup_tenant_defaults():
    """Setup tenant-scoped defaults."""
    # Create default notification rules
    rules = [
        {
            "event_type": "booking.created",
            "template": "Class Booking Confirmation",
            "channel": "WhatsApp",
            "is_standard": 1,
        },
        {
            "event_type": "payment.received",
            "template": "Payment Received",
            "channel": "WhatsApp",
            "is_standard": 1,
        },
        {
            "event_type": "member.created",
            "template": "Welcome Email",
            "channel": "Email",
            "is_standard": 1,
        },
        {
            "event_type": "membership.expiry_reminder_7d",
            "template": "Membership Renewal 7d",
            "channel": "WhatsApp",
            "is_standard": 1,
        },
        {
            "event_type": "membership.expiry_reminder_3d",
            "template": "Membership Renewal 3d",
            "channel": "WhatsApp",
            "is_standard": 1,
        },
        {
            "event_type": "membership.expiry_reminder_1d",
            "template": "Membership Renewal 1d",
            "channel": "WhatsApp",
            "is_standard": 1,
        },
    ]

    for rule in rules:
        if not frappe.db.exists("Notification Rule", {"event_type": rule["event_type"]}):
            nr = frappe.get_doc({"doctype": "Notification Rule", **rule})
            nr.insert(ignore_permissions=True)
            print(f"Created notification rule: {rule['event_type']}")