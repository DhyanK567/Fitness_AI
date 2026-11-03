import frappe
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_nonnegative, require_positive, require_tenant


class WSEvent(Document):
    def validate(self):
        require_tenant(self)
        require_positive(self.capacity, "Capacity")
        require_nonnegative(self.confirmed_count, "Confirmed count")
        require_nonnegative(self.waitlist_count, "Waitlist count")
        if (self.confirmed_count or 0) > self.capacity:
            frappe.throw("Capacity cannot be below confirmed registrations", frappe.ValidationError)
        if self.is_paid and (self.price is None or self.price <= 0):
            frappe.throw("Paid events require a positive price", frappe.ValidationError)
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            frappe.throw("Event end time must be after start time", frappe.ValidationError)
        if self.registration_deadline and self.event_date and self.registration_deadline > self.event_date:
            frappe.throw("Registration deadline cannot be after the event date", frappe.ValidationError)
