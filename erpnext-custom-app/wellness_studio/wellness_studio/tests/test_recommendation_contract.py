"""Unit tests for Frappe Recommendation Assistant API (AI-04 / B2C-09).

Tests tenant isolation, candidate eligibility, capacity ceiling exclusion,
goal alignment, variety scoring, and explainable reasons in wellness_studio.api.recommendation.
Does not call live business endpoints or external databases.
"""

from __future__ import annotations

import types
import pytest
from datetime import datetime, timedelta

import frappe
from wellness_studio.api.recommendation import (
    get,
    _calculate_goal_score,
    _build_reason,
)


class MockDbRow(types.SimpleNamespace):
    def __getattr__(self, name):
        return None


def test_goal_scoring_alignment():
    """Verify goal scoring aligns categories to declared fitness goals."""
    # Flexibility goal -> Yoga & Pilates primary (50 pts), HIIT tertiary (20 pts)
    assert _calculate_goal_score("flexibility & mobility", "Yoga") == 50
    assert _calculate_goal_score("flexibility", "Pilates") == 50
    assert _calculate_goal_score("flexibility", "HIIT") == 20

    # Strength goal -> Strength & HIIT primary (50 pts), Yoga tertiary (20 pts)
    assert _calculate_goal_score("strength & muscle", "Strength") == 50
    assert _calculate_goal_score("strength", "HIIT") == 50
    assert _calculate_goal_score("strength", "Yoga") == 20

    # Cardio goal -> Spin & Boxing primary (50 pts)
    assert _calculate_goal_score("cardio & endurance", "Cycling") == 50
    assert _calculate_goal_score("cardio", "Boxing") == 50

    # General fallback
    assert _calculate_goal_score("general fitness", "General") == 35


def test_explainable_reason_formatting():
    """Verify explainable reason generation reflects variety and goal alignment."""
    # High variety reason (0 past visits in category)
    r1 = _build_reason("flexibility", "Pilates", 0, "Yoga", 5)
    assert "adds variety from your recent yoga sessions" in r1.lower()
    assert "5 spots open" in r1

    # Consistency reason (3+ visits)
    r2 = _build_reason("strength", "Strength", 4, "Strength", 1)
    assert "reinforces your established strength consistency" in r2.lower()
    assert "1 spot open" in r2


def test_recommendation_endpoint_rejects_missing_member_or_foreign_tenant(monkeypatch):
    """Verify tenant isolation: throws if member does not belong to the requested tenant."""
    # Stub require_api_tenant to return tenant as-is
    monkeypatch.setattr("wellness_studio.api.recommendation._tenant", lambda t: t)

    # Stub frappe.db.get_value to simulate member not found in tenant
    frappe.db.get_value = lambda doctype, filters, fields, as_dict=True: None

    with pytest.raises(Exception) as exc_info:
        get(tenant="tenant-alpha", member_id="mem-foreign")

    assert "Member not found for this tenant" in str(exc_info.value) or "DoesNotExistError" in str(type(exc_info.value))


def test_recommendation_endpoint_filters_capacity_and_excludes_full_classes(monkeypatch):
    """Verify classes with no available spots are excluded from recommendations."""
    monkeypatch.setattr("wellness_studio.api.recommendation._tenant", lambda t: t)

    # Stub member lookup -> active
    frappe.db.get_value = lambda doctype, filters, fields, as_dict=True: {
        "name": "mem-01",
        "status": "Active",
        "full_name": "Test Member",
    }

    # Stub scheduled sessions query: one full class (capacity 10, confirmed 10) and one open (capacity 12, confirmed 2)
    fake_sessions = [
        {
            "name": "sess-full",
            "class_type": "ct-hiit",
            "class_name": "Full Blast HIIT",
            "category": "HIIT",
            "trainer": "Marcus",
            "capacity": 10,
            "confirmed_count": 10,
            "status": "Scheduled",
            "session_date": "2026-10-26",
            "start_time": "08:00:00",
        },
        {
            "name": "sess-open",
            "class_type": "ct-yoga",
            "class_name": "Morning Flow Yoga",
            "category": "Yoga",
            "trainer": "Elena",
            "capacity": 12,
            "confirmed_count": 2,
            "status": "Scheduled",
            "session_date": "2026-10-26",
            "start_time": "09:00:00",
        },
    ]

    def mock_sql(query, params, as_dict=True):
        if "FROM `tabWS Class Session`" in query:
            return fake_sessions
        if "FROM `tabWS Booking`" in query:
            return []  # No existing bookings by member
        if "FROM `tabWS Session Attendance`" in query:
            return []  # No past attendances
        return []

    monkeypatch.setattr(frappe.db, "sql", mock_sql)

    res = get(tenant="tenant-alpha", member_id="mem-01", goal="flexibility")
    recs = res["recommendations"]

    # Only sess-open must be returned
    assert len(recs) == 1
    assert recs[0]["session_id"] == "sess-open"
    assert recs[0]["class_name"] == "Morning Flow Yoga"
    assert recs[0]["available_spots"] == 10
    assert recs[0]["book_href"] == "/member/book-class?classId=sess-open&className=Morning Flow Yoga&category=Yoga"


def test_recommendation_endpoint_excludes_already_booked_sessions(monkeypatch):
    """Verify classes the member is already booked in are omitted from recommendations."""
    monkeypatch.setattr("wellness_studio.api.recommendation._tenant", lambda t: t)

    frappe.db.get_value = lambda doctype, filters, fields, as_dict=True: {
        "name": "mem-01",
        "status": "Active",
        "full_name": "Test Member",
    }

    fake_sessions = [
        {
            "name": "sess-booked",
            "class_type": "ct-yoga",
            "class_name": "Gentle Yoga",
            "category": "Yoga",
            "trainer": "Elena",
            "capacity": 10,
            "confirmed_count": 1,
            "status": "Scheduled",
            "session_date": "2026-10-26",
            "start_time": "08:00:00",
        },
        {
            "name": "sess-available",
            "class_type": "ct-pilates",
            "class_name": "Mat Pilates",
            "category": "Pilates",
            "trainer": "Maya",
            "capacity": 10,
            "confirmed_count": 1,
            "status": "Scheduled",
            "session_date": "2026-10-26",
            "start_time": "10:00:00",
        },
    ]

    def mock_sql(query, params, as_dict=True):
        if "FROM `tabWS Class Session`" in query:
            return fake_sessions
        if "FROM `tabWS Booking`" in query:
            # Member is already confirmed in sess-booked
            return [{"session": "sess-booked"}]
        if "FROM `tabWS Session Attendance`" in query:
            return []
        return []

    monkeypatch.setattr(frappe.db, "sql", mock_sql)

    res = get(tenant="tenant-alpha", member_id="mem-01", goal="flexibility")
    recs = res["recommendations"]

    assert len(recs) == 1
    assert recs[0]["session_id"] == "sess-available"
    assert recs[0]["class_name"] == "Mat Pilates"


def test_undeclared_goal_neutral_scoring():
    """Verify missing/undeclared goal produces neutral 35 scoring across all categories."""
    assert _calculate_goal_score(None, "Yoga") == 35
    assert _calculate_goal_score(None, "Strength") == 35
    assert _calculate_goal_score(None, "HIIT") == 35
    assert _calculate_goal_score(None, "Pilates") == 35
    assert _calculate_goal_score(None, "Recovery") == 35
    assert _calculate_goal_score("", "Strength") == 35

    # Confirm Strength/HIIT has no artificial score advantage over Yoga when goal is absent
    assert _calculate_goal_score(None, "Strength") == _calculate_goal_score(None, "Yoga")


def test_undeclared_goal_neutral_reasons():
    """Verify explainable reasons do not claim an undeclared member goal."""
    # Cross-training variety reason
    reason_var = _build_reason(None, "Pilates", 0, "Yoga", 5)
    assert "adds cross-training variety" in reason_var.lower()
    assert "target" not in reason_var.lower()
    assert "goal" not in reason_var.lower()
    assert "5 spots open" in reason_var

    # Consistency reason
    reason_cons = _build_reason(None, "Yoga", 2, "Yoga", 3)
    assert "maintains balanced weekly practice consistency" in reason_cons.lower()
    assert "goal" not in reason_cons.lower()


def test_recommendation_endpoint_rejects_inactive_member(monkeypatch):
    """Verify inactive member status is rejected before recommendation generation."""
    monkeypatch.setattr("wellness_studio.api.recommendation._tenant", lambda t: t)

    # Member exists in tenant, but is Inactive
    frappe.db.get_value = lambda doctype, filters, fields, as_dict=True: {
        "name": "mem-inactive",
        "status": "Inactive",
        "full_name": "Inactive Member",
    }

    with pytest.raises(Exception) as exc_info:
        get(tenant="tenant-alpha", member_id="mem-inactive")

    assert "Member is not active" in str(exc_info.value)


def test_recommendation_endpoint_neutral_goal_ranking(monkeypatch):
    """Verify missing goal treats candidate categories equitably without artificial strength bias."""
    monkeypatch.setattr("wellness_studio.api.recommendation._tenant", lambda t: t)

    frappe.db.get_value = lambda doctype, filters, fields, as_dict=True: {
        "name": "mem-01",
        "status": "Active",
        "full_name": "Active Member",
    }

    fake_sessions = [
        {
            "name": "sess-strength",
            "class_type": "ct-strength",
            "class_name": "Barbell Strength",
            "category": "Strength",
            "trainer": "Marcus",
            "capacity": 10,
            "confirmed_count": 0,
            "status": "Scheduled",
            "session_date": "2026-10-26",
            "start_time": "08:00:00",
        },
        {
            "name": "sess-yoga",
            "class_type": "ct-yoga",
            "class_name": "Vinyasa Flow",
            "category": "Yoga",
            "trainer": "Elena",
            "capacity": 10,
            "confirmed_count": 0,
            "status": "Scheduled",
            "session_date": "2026-10-26",
            "start_time": "09:00:00",
        },
    ]

    def mock_sql(query, params, as_dict=True):
        if "FROM `tabWS Class Session`" in query:
            return fake_sessions
        return []

    monkeypatch.setattr(frappe.db, "sql", mock_sql)

    # Calling with goal=None
    res = get(tenant="tenant-alpha", member_id="mem-01", goal=None)
    recs = res["recommendations"]

    assert len(recs) == 2
    # Both have neutral goal score (35) + default variety (30) + capacity (20) = 85
    assert recs[0]["match_score"] == recs[1]["match_score"]
    # Explanations do not claim a goal
    for r in recs:
        assert "goal" not in r["reason"].lower()
