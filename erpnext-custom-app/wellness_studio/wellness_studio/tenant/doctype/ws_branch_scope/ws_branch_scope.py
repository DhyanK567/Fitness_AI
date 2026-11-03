"""Validation for the PostgreSQL branch mirror."""

from uuid import UUID

import frappe
from frappe import _
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_link_tenant, require_tenant


class WSBranchScope(Document):
    def validate(self):
        require_tenant(self)
        try:
            UUID(str(self.branch_uuid))
        except (TypeError, ValueError):
            frappe.throw(_("Branch UUID must be a canonical UUID"), frappe.ValidationError)
        require_link_tenant(self, "studio", "WS Studio Scope")
