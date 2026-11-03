"""Validation for tenant-scoped ERP staff profiles."""

import frappe
from frappe import _
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_link_tenant, require_tenant, require_unique_for_tenant


class WSWellnessStaff(Document):
    def validate(self):
        require_tenant(self)
        self.full_name = (self.full_name or "").strip()
        self.email = (self.email or "").strip().lower()
        if not self.full_name or not self.email:
            frappe.throw(_("Full name and email are required"), frappe.ValidationError)
        require_unique_for_tenant(self, "email", self.email)
        if self.studio:
            require_link_tenant(self, "studio", "WS Studio Scope")
        if self.branch:
            require_link_tenant(self, "branch", "WS Branch Scope")
        self.is_trainer = int(self.staff_role == "Trainer")
