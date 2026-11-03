from frappe.model.document import Document
import frappe

from wellness_studio.rules.doctype_validation import require_link_tenant, require_nonnegative, require_positive, require_tenant, require_unique_for_tenant


class WSClassType(Document):
    def validate(self):
        require_tenant(self)
        require_link_tenant(self, "trainer", "WS Wellness Staff")
        if self.trainer and not frappe.db.exists("WS Wellness Staff", {"name": self.trainer, "tenant": self.tenant, "is_trainer": 1, "is_active": 1}):
            frappe.throw("Default trainer must be an active trainer in this tenant", frappe.ValidationError)
        self.class_name = (self.class_name or "").strip()
        require_unique_for_tenant(self, "class_name", self.class_name)
        require_nonnegative(self.default_capacity, "Default capacity")
        require_positive(self.duration_minutes, "Duration minutes")
