"""Signed ERP-to-API callbacks. Delivery occurs after the ERP transaction commits."""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from urllib.parse import urlparse

import frappe
from frappe import _
from frappe.integrations.utils import make_post_request


def _callback_url() -> str | None:
    url = frappe.conf.get("fitness_api_callback_url")
    if not url:
        return None
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        frappe.throw(_("fitness_api_callback_url must be HTTPS"), frappe.ValidationError)
    return url


def send_callback(event_type: str, tenant: str, resource_type: str, resource_ref: str, payload: dict):
    """Queue a signed callback after commit; no callback is sent for an uncommitted ERP change."""
    url = _callback_url()
    secret = frappe.conf.get("fitness_api_callback_secret")
    if not url or not secret:
        frappe.throw(_("Signed API callback URL and secret must be configured"), frappe.ValidationError)
    body = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "tenant_id": tenant,
        "resource_type": resource_type,
        "resource_ref": resource_ref,
        "payload": payload,
    }
    frappe.enqueue(
        "wellness_studio.events.callbacks._deliver",
        enqueue_after_commit=True,
        queue="short",
        url=url,
        body=body,
    )
    return True


def _deliver(url: str, body: dict):
    secret = frappe.conf.get("fitness_api_callback_secret")
    if not secret:
        frappe.throw(_("Signed API callback secret is not configured"), frappe.ValidationError)
    serialized = json.dumps(body, separators=(",", ":"), sort_keys=True)
    signature = hmac.new(secret.encode(), serialized.encode(), hashlib.sha256).hexdigest()
    try:
        make_post_request(url, data=serialized, headers={
            "Content-Type": "application/json",
            "X-ERP-Signature": signature,
            "X-Tenant-ID": body["tenant_id"],
            "X-Correlation-ID": body["event_id"],
        })
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"Fitness ERP callback failed: {body['event_id']}")
        raise
