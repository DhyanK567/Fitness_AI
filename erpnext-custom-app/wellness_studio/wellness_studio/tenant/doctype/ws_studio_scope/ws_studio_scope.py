"""Validation for the PostgreSQL studio mirror."""

from uuid import UUID

import frappe
from frappe import _
from frappe.model.document import Document

from wellness_studio.rules.doctype_validation import require_tenant


class WSStudioScope(Document):
    def validate(self):
        require_tenant(self)
        try:
            UUID(str(self.studio_uuid))
        except (TypeError, ValueError):
            frappe.throw(_("Studio UUID must be a canonical UUID"), frappe.ValidationError)
