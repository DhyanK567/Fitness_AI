"""Unit tests for deterministic membership eligibility rules."""

from datetime import date

import pytest

from wellness_studio.rules.membership_state import (
    ACTIVE,
    CANCELLED,
    EXPIRED,
    PENDING,
    SUSPENDED,
    can_book,
    effective_state,
)


def test_active_membership_expires_only_after_end_date():
    today = date(2026, 10, 7)

    assert effective_state(ACTIVE, date(2026, 10, 6), today) == EXPIRED
    assert effective_state(ACTIVE, today, today) == ACTIVE
    assert effective_state(ACTIVE, date(2026, 10, 8), today) == ACTIVE


@pytest.mark.parametrize("status", [PENDING, SUSPENDED, CANCELLED, EXPIRED])
def test_non_active_membership_status_never_allows_booking(status):
    assert can_book(status, date(2026, 10, 8), today=date(2026, 10, 7)) is False


def test_active_membership_requires_start_date_to_have_arrived():
    today = date(2026, 10, 7)

    assert can_book(ACTIVE, date(2026, 10, 7), today=today, start_date=date(2026, 10, 8)) is False
    assert can_book(ACTIVE, date(2026, 10, 7), today=today, start_date=today) is True


def test_active_membership_past_end_date_cannot_book():
    assert can_book(ACTIVE, date(2026, 10, 6), today=date(2026, 10, 7)) is False
