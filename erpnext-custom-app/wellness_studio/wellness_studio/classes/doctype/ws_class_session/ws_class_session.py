import frappe
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_link_tenant, require_nonnegative, require_positive, require_tenant


class WSClassSession(Document):
    def validate(self):
        require_tenant(self)
        require_link_tenant(self, "class_type", "WS Class Type")
        require_link_tenant(self, "schedule", "WS Class Schedule")
        require_link_tenant(self, "trainer", "WS Wellness Staff")
        require_positive(self.capacity, "Capacity")
        require_nonnegative(self.confirmed_count, "Confirmed count")
        require_nonnegative(self.waitlist_count, "Waitlist count")
        if (self.confirmed_count or 0) > self.capacity:
            frappe.throw("Capacity cannot be below the confirmed booking count", frappe.ValidationError)
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            frappe.throw("End time must be after start time", frappe.ValidationError)
