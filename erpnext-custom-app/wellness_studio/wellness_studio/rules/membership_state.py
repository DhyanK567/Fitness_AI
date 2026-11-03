"""Deterministic membership state transitions for the custom ERP app."""

from __future__ import annotations

from datetime import date


ACTIVE = "Active"
EXPIRED = "Expired"
PENDING = "Pending Approval"
SUSPENDED = "Suspended"
CANCELLED = "Cancelled"


def effective_state(status: str, end_date: date | None, today: date | None = None) -> str:
    """Return the effective state without mutating a document."""

    today = today or date.today()
    if status == ACTIVE and end_date and end_date < today:
        return EXPIRED
    return status


def can_book(status: str, end_date: date | None, today: date | None = None, start_date: date | None = None) -> bool:
    today = today or date.today()
    return effective_state(status, end_date, today) == ACTIVE and (start_date is None or start_date <= today)
