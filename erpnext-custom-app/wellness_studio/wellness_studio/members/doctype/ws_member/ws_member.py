from __future__ import annotations

import re

from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_past, require_tenant, require_unique_for_tenant


class WSMember(Document):
    def validate(self):
        require_tenant(self)
        self.full_name = (self.full_name or "").strip()
        self.email = (self.email or "").strip().lower()
        self.phone = re.sub(r"[\s()-]", "", self.phone or "")
        if not re.fullmatch(r"\+[1-9][0-9]{7,14}", self.phone):
            import frappe
            frappe.throw("Phone must use E.164 format", frappe.ValidationError)
        require_past(self.date_of_birth, "Date of birth")
        require_unique_for_tenant(self, "email", self.email)
        require_unique_for_tenant(self, "phone", self.phone)
