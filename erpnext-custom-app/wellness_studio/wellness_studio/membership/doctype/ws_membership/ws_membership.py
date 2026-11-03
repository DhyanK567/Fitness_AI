import json

import frappe
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_date_order, require_link_tenant, require_nonnegative, require_tenant


ALLOWED_TRANSITIONS = {
    "Pending Approval": {"Active", "Cancelled"},
    "Active": {"Expired", "Suspended", "Cancelled"},
    "Suspended": {"Active", "Cancelled", "Expired"},
    "Expired": set(),
    "Cancelled": set(),
}


class WSMembership(Document):
    def validate(self):
        require_tenant(self)
        require_link_tenant(self, "member", "WS Member")
        require_link_tenant(self, "plan", "WS Member Plan")
        require_date_order(self.start_date, self.end_date)
        require_nonnegative(self.amount_paid, "Amount paid")
        if self.is_new() and not self.plan_snapshot:
            plan = frappe.get_doc("WS Member Plan", self.plan)
            self.plan_snapshot = json.dumps({
                "name": plan.name, "plan_name": plan.plan_name, "price": plan.price,
                "validity_days": plan.validity_days,
                "allowed_bookings_per_week": plan.allowed_bookings_per_week,
            }, sort_keys=True, default=str)
        if not self.is_new() and self.has_value_changed("status"):
            previous = self.get_doc_before_save()
            if previous and self.status not in ALLOWED_TRANSITIONS.get(previous.status, set()):
                frappe.throw(f"Invalid membership status transition: {previous.status} to {self.status}", frappe.ValidationError)
