"""Validation for the read-only PostgreSQL tenant mirror."""

from __future__ import annotations

from uuid import UUID

import frappe
from frappe import _
from frappe.model.document import Document


class WellnessTenantScope(Document):
    def validate(self):
        self.tenant_code = (self.tenant_code or "").strip().lower()
        if not self.tenant_code:
            frappe.throw(_("Tenant code is required"), frappe.ValidationError)
        try:
            UUID(str(self.tenant_uuid))
        except (TypeError, ValueError):
            frappe.throw(_("Tenant UUID must be a canonical UUID"), frappe.ValidationError)

