import frappe
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_link_tenant, require_tenant


class WSSessionAttendance(Document):
    def before_insert(self):
        if not getattr(self.flags, "from_atomic_attendance", False):
            frappe.throw("Attendance must be recorded through the attendance API", frappe.PermissionError)

    def validate(self):
        require_tenant(self)
        require_link_tenant(self, "member", "WS Member")
        require_link_tenant(self, "booking", "WS Booking")
        if self.session_kind == "Class Session":
            require_link_tenant(self, "session", "WS Class Session")
        if not self.is_new() and (self.has_value_changed("status") or self.has_value_changed("corrections")):
            if not getattr(self.flags, "from_atomic_attendance", False):
                frappe.throw("Attendance corrections must use the correction API", frappe.PermissionError)
