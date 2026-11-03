"""Pytest configuration and Frappe test fixtures for wellness_studio contract tests.

Provides isolated mocks for frappe runtime primitives when running outside an
active Frappe/Bench container, enabling deterministic unit verification of
wellness_studio booking, membership, and idempotency logic.
"""

from __future__ import annotations

import sys
import os
import types
from datetime import date, datetime, timedelta

# Ensure parent directory is on sys.path so wellness_studio.wellness_studio can be imported
app_root = os.path.dirname(__file__)
if app_root not in sys.path:
    sys.path.insert(0, app_root)

# In Frappe app repositories, the inner wellness_studio directory is the actual installed package.
# Alias wellness_studio to wellness_studio.wellness_studio to match live bench environment.
import wellness_studio.wellness_studio as inner_ws
sys.modules["wellness_studio"] = inner_ws

# Stub frappe module if not present in the environment
if "frappe" not in sys.modules:
    frappe_stub = types.ModuleType("frappe")

    class DoesNotExistError(Exception):
        pass

    class ValidationError(Exception):
        pass

    class DuplicateEntryError(Exception):
        pass

    class PermissionError(Exception):
        pass

    def _(msg: str) -> str:
        return msg

    def throw(msg: str, exc: type[Exception] = Exception):
        raise exc(msg)

    def whitelist(methods=None):
        def decorator(fn):
            return fn
        return decorator

    class MockUtils:
        @staticmethod
        def getdate(val):
            if isinstance(val, date):
                return val
            if isinstance(val, str):
                return datetime.strptime(val[:10], "%Y-%m-%d").date()
            return date.today()

        @staticmethod
        def add_days(d, days):
            return d + timedelta(days=days)

        @staticmethod
        def get_datetime(val):
            if isinstance(val, datetime):
                return val
            return datetime.strptime(str(val), "%Y-%m-%d %H:%M:%S")

        @staticmethod
        def now_datetime():
            return datetime(2026, 10, 24, 12, 0, 0)

    frappe_stub.DoesNotExistError = DoesNotExistError
    frappe_stub.ValidationError = ValidationError
    frappe_stub.DuplicateEntryError = DuplicateEntryError
    frappe_stub.PermissionError = PermissionError
    frappe_stub._ = _
    frappe_stub.throw = throw
    frappe_stub.whitelist = whitelist
    frappe_stub.utils = MockUtils()
    frappe_stub.db = types.SimpleNamespace(
        get_value=lambda *args, **kwargs: None,
        sql=lambda *args, **kwargs: [],
        set_value=lambda *args, **kwargs: None,
        exists=lambda *args, **kwargs: False,
    )
    frappe_stub.local = types.SimpleNamespace(
        request=types.SimpleNamespace(headers={"X-Tenant-ID": "test-tenant"})
    )
    frappe_stub.session = types.SimpleNamespace(user="api-gateway-user")
    frappe_stub.get_roles = lambda: ["WS API Integration"]

    sys.modules["frappe"] = frappe_stub
