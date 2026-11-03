"""Public health endpoint for the Wellness Studio Frappe custom app."""

import frappe


@frappe.whitelist(methods=["GET"])
def health():
    """Return only the state needed by the gateway readiness check."""

    return {"status": "ok", "app": "wellness_studio"}


@frappe.whitelist(methods=["GET"])
def version():
    """Return the installed custom-app version for adapter compatibility checks."""

    return {"app": "wellness_studio", "version": "0.0.1"}
