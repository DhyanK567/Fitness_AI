"""Shared invariants for ERP-owned Wellness Studio DocTypes."""

from __future__ import annotations

from datetime import date

import frappe
from frappe import _
from frappe.utils import getdate


def require_tenant(doc) -> str:
    tenant = getattr(doc, "tenant", None)
    if not tenant or not frappe.db.exists("Wellness Tenant Scope", tenant):
        frappe.throw(_("A valid tenant is required"), frappe.ValidationError)
    return tenant


def require_link_tenant(doc, fieldname: str, doctype: str) -> None:
    value = getattr(doc, fieldname, None)
    if not value:
        return
    tenant = require_tenant(doc)
    if not frappe.db.exists(doctype, {"name": value, "tenant": tenant}):
        frappe.throw(_("{0} does not belong to this tenant").format(fieldname), frappe.ValidationError)


def require_nonnegative(value, label: str) -> None:
    if value is not None and float(value) < 0:
        frappe.throw(_("{0} cannot be negative").format(label), frappe.ValidationError)


def require_positive(value, label: str) -> None:
    if value is None or float(value) <= 0:
        frappe.throw(_("{0} must be greater than zero").format(label), frappe.ValidationError)


def require_date_order(start, end, start_label: str = "Start date", end_label: str = "End date") -> None:
    if start and end and getdate(end) < getdate(start):
        frappe.throw(_("{0} cannot be before {1}").format(end_label, start_label), frappe.ValidationError)


def require_past(value, label: str) -> None:
    if value and getdate(value) >= date.today():
        frappe.throw(_("{0} must be in the past").format(label), frappe.ValidationError)


def reject_changed_field(doc, fieldname: str, message: str) -> None:
    if not doc.is_new() and doc.has_value_changed(fieldname):
        frappe.throw(_(message), frappe.ValidationError)


def require_unique_for_tenant(doc, fieldname: str, value) -> None:
    if not value:
        return
    filters = {"tenant": require_tenant(doc), fieldname: value}
    existing = frappe.db.exists(doc.doctype, filters)
    if existing and existing != doc.name:
        frappe.throw(_("{0} already exists for this tenant").format(fieldname), frappe.DuplicateEntryError)
