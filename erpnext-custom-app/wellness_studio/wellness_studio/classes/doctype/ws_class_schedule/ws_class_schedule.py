from frappe.model.document import Document
import frappe
import re

from wellness_studio.rules.doctype_validation import require_date_order, require_link_tenant, require_positive, require_tenant


class WSClassSchedule(Document):
    def validate(self):
        require_tenant(self)
        require_link_tenant(self, "class_type", "WS Class Type")
        if not self.trainer and self.class_type:
            self.trainer = frappe.db.get_value("WS Class Type", {"name": self.class_type, "tenant": self.tenant}, "trainer")
        require_link_tenant(self, "trainer", "WS Wellness Staff")
        if not self.trainer:
            frappe.throw("A trainer must be assigned before a schedule can be saved", frappe.ValidationError)
        if not frappe.db.exists("WS Wellness Staff", {"name": self.trainer, "tenant": self.tenant, "is_trainer": 1, "is_active": 1}):
            frappe.throw("Schedule trainer must be active in this tenant", frappe.ValidationError)
        if self.recurrence_rule and not re.fullmatch(r"FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)", self.recurrence_rule):
            frappe.throw("Unsupported weekly recurrence rule", frappe.ValidationError)
        require_positive(self.duration_minutes, "Duration minutes")
        if self.capacity is not None:
            require_positive(self.capacity, "Capacity")
        require_date_order(self.valid_from, self.valid_to, "Valid from", "Valid to")
