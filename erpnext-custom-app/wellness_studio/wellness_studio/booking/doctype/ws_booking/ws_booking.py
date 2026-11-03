import frappe
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_link_tenant, require_tenant


class WSBooking(Document):
    def before_insert(self):
        if not getattr(self.flags, "from_atomic_booking", False):
            frappe.throw("Bookings must be created through the atomic booking API", frappe.PermissionError)

    def validate(self):
        require_tenant(self)
        require_link_tenant(self, "member", "WS Member")
        require_link_tenant(self, "session", "WS Class Session")
        require_link_tenant(self, "membership", "WS Membership")
