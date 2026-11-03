from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import reject_changed_field, require_tenant, require_unique_for_tenant
from wellness_studio.rules.doctype_validation import require_link_tenant


class WSLead(Document):
    def validate(self):
        require_tenant(self)
        self.full_name = (self.full_name or "").strip()
        self.email = (self.email or "").strip().lower() or None
        require_unique_for_tenant(self, "phone", self.phone)
        if self.assigned_to:
            require_link_tenant(self, "assigned_to", "WS Wellness Staff")
        reject_changed_field(self, "lead_source", "Lead source is immutable after creation")
