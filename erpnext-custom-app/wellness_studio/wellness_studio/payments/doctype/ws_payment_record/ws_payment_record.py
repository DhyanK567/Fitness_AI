import frappe
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_link_tenant, require_nonnegative, require_tenant


class WSPaymentRecord(Document):
    def before_insert(self):
        if not getattr(self.flags, "from_payment_api", False):
            frappe.throw("Payments must be recorded through the payment API", frappe.PermissionError)

    def validate(self):
        require_tenant(self)
        require_link_tenant(self, "member", "WS Member")
        require_link_tenant(self, "lead", "WS Lead")
        require_link_tenant(self, "membership", "WS Membership")
        require_link_tenant(self, "booking", "WS Booking")
        require_link_tenant(self, "event_registration", "WS Event Registration")
        if self.membership and not frappe.db.exists("WS Membership", {"name": self.membership, "tenant": self.tenant, "member": self.member}):
            frappe.throw("Membership must belong to the payment member and tenant", frappe.ValidationError)
        if self.booking and not frappe.db.exists("WS Booking", {"name": self.booking, "tenant": self.tenant, "member": self.member}):
            frappe.throw("Booking must belong to the payment member and tenant", frappe.ValidationError)
        require_nonnegative(self.amount, "Amount")
        if not self.member and not self.lead:
            frappe.throw("A member or lead is required", frappe.ValidationError)
        if self.provider.startswith("manual_") and (not self.recorded_by or not self.manual_reference):
            frappe.throw("Manual payments require an actor and reference", frappe.ValidationError)
        if self.status == "Paid" and not getattr(self.flags, "verified_payment", False):
            frappe.throw("Paid status requires a verified or authorised payment operation", frappe.PermissionError)
