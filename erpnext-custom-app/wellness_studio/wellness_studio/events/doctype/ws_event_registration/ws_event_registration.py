import frappe
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_link_tenant, require_tenant


class WSEventRegistration(Document):
    def before_insert(self):
        if not getattr(self.flags, "from_atomic_registration", False):
            frappe.throw("Event registrations must use the atomic registration API", frappe.PermissionError)

    def validate(self):
        require_tenant(self)
        require_link_tenant(self, "event", "WS Event")
        require_link_tenant(self, "member", "WS Member")
        require_link_tenant(self, "lead", "WS Lead")
        if self.member and self.lead:
            frappe.throw("A registration cannot reference both a member and a lead", frappe.ValidationError)
