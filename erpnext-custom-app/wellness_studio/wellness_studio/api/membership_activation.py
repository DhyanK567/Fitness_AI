"""Membership activation and idempotent expiry scheduler."""

from __future__ import annotations

import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


@frappe.whitelist(methods=["POST"])
def activate(membership: str, tenant: str):
    tenant = require_api_tenant(tenant)
    row = frappe.db.get_value("WS Membership", {"name": membership, "tenant": tenant}, ["name", "status", "payment_status"], as_dict=True)
    if not row:
        frappe.throw(_("Membership not found"), frappe.DoesNotExistError)
    if row.status == "Active":
        if row.payment_status != "Paid":
            frappe.throw(_("An active membership must have a paid payment status"), frappe.ValidationError)
        return {"membership_id": membership, "status": "Active"}
    if row.status != "Pending Approval":
        frappe.throw(_("Only pending memberships can be activated"), frappe.ValidationError)
    if row.payment_status != "Paid":
        frappe.throw(_("Membership cannot be activated before payment is recorded"), frappe.PermissionError)
    frappe.db.set_value("WS Membership", membership, {"status": "Active", "approved_by": frappe.session.user, "approved_on": frappe.utils.now_datetime()}, update_modified=True)
    return {"membership_id": membership, "status": "Active"}


def expire_memberships():
    """Expire each eligible membership once, even when scheduler runs overlap."""

    today = frappe.utils.today()
    names = frappe.get_all("WS Membership", filters={"status": "Active", "end_date": ["<", today]}, pluck="name")
    expired = 0
    for name in names:
        rows = frappe.db.sql(
            """SELECT name, tenant, member FROM `tabWS Membership`
               WHERE name=%s AND status='Active' AND end_date < %s FOR UPDATE""",
            (name, today), as_dict=True,
        )
        # The candidate may have been expired by another scheduler run while
        # this job waited for the row lock. Only the successful transition
        # owns the callback.
        if not rows:
            continue
        row = rows[0]
        frappe.db.set_value("WS Membership", name, "status", "Expired", update_modified=True)
        from wellness_studio.events.callbacks import send_callback
        send_callback("membership.expired", row.tenant, "membership", name, {"membership_id": name, "member": row.member})
        expired += 1
    return expired
