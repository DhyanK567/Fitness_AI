from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_nonnegative, require_positive, require_tenant, require_unique_for_tenant


class WSMemberPlan(Document):
    def validate(self):
        require_tenant(self)
        self.plan_name = (self.plan_name or "").strip()
        require_unique_for_tenant(self, "plan_name", self.plan_name)
        require_nonnegative(self.price, "Price")
        require_positive(self.validity_days, "Validity days")
        require_nonnegative(self.allowed_bookings_per_week, "Allowed bookings per week")
