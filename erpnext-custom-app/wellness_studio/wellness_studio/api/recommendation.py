"""Tenant-scoped recommendation assistant operations for the ERP system of record."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import frappe
from frappe import _
from wellness_studio.tenant.permissions import require_api_tenant


def _tenant(tenant: str) -> str:
    return require_api_tenant(tenant)


def _val(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


GOAL_RULES = [
    {
        "keywords": ["strength", "muscle", "tone", "hypertrophy", "power", "lifting"],
        "primary": ["strength", "hiit", "conditioning", "power", "crossfit", "bootcamp", "weightlifting"],
        "secondary": ["pilates", "core", "functional", "bodyweight"],
        "tertiary": ["yoga", "mobility", "recovery", "stretching"],
    },
    {
        "keywords": ["flexib", "mobility", "posture", "stretch", "balance", "alignment"],
        "primary": ["yoga", "pilates", "mobility", "stretch", "stretching", "recovery", "barre"],
        "secondary": ["functional", "core", "bodyweight"],
        "tertiary": ["strength", "hiit", "cardio", "boxing"],
    },
    {
        "keywords": ["cardio", "endurance", "stamina", "weight loss", "burn", "fat loss", "conditioning"],
        "primary": ["cardio", "hiit", "spin", "cycling", "boxing", "conditioning", "dance"],
        "secondary": ["strength", "functional", "bootcamp"],
        "tertiary": ["yoga", "pilates", "recovery"],
    },
    {
        "keywords": ["recovery", "mindful", "stress", "meditation", "somatic", "breath", "relax"],
        "primary": ["recovery", "meditation", "sound bath", "yin yoga", "breathwork", "restorative yoga"],
        "secondary": ["yoga", "pilates", "stretch", "mobility"],
        "tertiary": ["strength", "hiit", "cardio", "crossfit"],
    },
]


def _calculate_goal_score(goal: str | None, category: str) -> int:
    if not goal:
        return 35
    goal_lower = goal.lower()
    category_lower = (category or "general").lower()
    for rule in GOAL_RULES:
        if any(kw in goal_lower for kw in rule["keywords"]):
            if any(cat in category_lower for cat in rule["primary"]):
                return 50
            if any(cat in category_lower for cat in rule["secondary"]):
                return 35
            if any(cat in category_lower for cat in rule["tertiary"]):
                return 20
            return 28
    return 35


def _build_reason(goal: str | None, category: str, past_visits: int, dominant_category: str, available_spots: int) -> str:
    spots_text = f"{available_spots} {'spot' if available_spots == 1 else 'spots'} open"
    if not goal:
        if past_visits == 0 and dominant_category and dominant_category.lower() != category.lower():
            return f"Adds cross-training variety based on your recent {dominant_category} attendance ({spots_text})."
        if past_visits == 0:
            return f"Introduces fresh studio cross-training to diversify your practice ({spots_text})."
        if past_visits <= 2:
            return f"Maintains balanced weekly practice consistency in {category} ({spots_text})."
        return f"Reinforces your established {category} practice rhythm ({spots_text})."

    if past_visits == 0 and dominant_category and dominant_category.lower() != category.lower():
        return f"Aligns with your {goal} target and adds variety from your recent {dominant_category} sessions ({spots_text})."
    if past_visits == 0:
        return f"Directly targets your {goal} focus with fresh cross-training stimulus ({spots_text})."
    if past_visits <= 2:
        return f"Balances your {goal} routine with consistent {category} progression ({spots_text})."
    return f"Reinforces your established {category} consistency toward your {goal} goals ({spots_text})."


@frappe.whitelist(methods=["GET", "POST"])
def get(
    tenant: str,
    member_id: str,
    goal: str | None = None,
    level: str | None = None,
    days: int = 7,
):
    tenant = _tenant(tenant)
    if not member_id:
        frappe.throw(_("member_id is required"), frappe.ValidationError)

    # 1. Verify member belongs to tenant and is active
    member = frappe.db.get_value(
        "WS Member",
        {"name": member_id, "tenant": tenant},
        ["name", "status", "full_name"],
        as_dict=True,
    )
    if not member:
        frappe.throw(_("Member not found for this tenant"), frappe.DoesNotExistError)

    if _val(member, "status") != "Active":
        frappe.throw(_("Member is not active"), frappe.ValidationError)

    goal_str = goal.strip() if goal and goal.strip() else None
    days_int = int(days) if days else 7

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    max_date_str = (now + timedelta(days=days_int)).strftime("%Y-%m-%d")

    # 2. Query scheduled class sessions
    sessions = frappe.db.sql(
        """
        SELECT s.name, s.class_type, s.session_date, s.start_time, s.capacity,
               s.confirmed_count, s.status,
               t.class_name, t.category, t.trainer
        FROM `tabWS Class Session` s
        JOIN `tabWS Class Type` t ON t.name = s.class_type AND t.tenant = s.tenant
        WHERE s.tenant = %s
          AND s.status = 'Scheduled'
          AND s.session_date >= %s
          AND s.session_date <= %s
        ORDER BY s.session_date ASC, s.start_time ASC
        """,
        (tenant, today_str, max_date_str),
        as_dict=True,
    )

    if not sessions:
        return {"recommendations": []}

    # 3. Check existing bookings by member in candidate sessions to avoid recommending already booked classes
    session_names = [_val(s, "name") for s in sessions]
    member_booked_sessions = set()
    if session_names:
        booked_rows = frappe.db.sql(
            """
            SELECT session
            FROM `tabWS Booking`
            WHERE tenant = %s
              AND member = %s
              AND session IN %s
              AND status = 'Confirmed'
            """,
            (tenant, member_id, tuple(session_names)),
            as_dict=True,
        )
        member_booked_sessions = {_val(r, "session") for r in (booked_rows or [])}

    # 4. Query member attendance history for past 30 days to compute variety weighting
    thirty_days_ago = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    past_attendances = frappe.db.sql(
        """
        SELECT a.name, s.class_type, t.category
        FROM `tabWS Session Attendance` a
        JOIN `tabWS Class Session` s ON s.name = a.session AND s.tenant = a.tenant
        JOIN `tabWS Class Type` t ON t.name = s.class_type AND t.tenant = s.tenant
        WHERE a.tenant = %s
          AND a.member = %s
          AND a.status = 'Present'
          AND a.marked_on >= %s
        """,
        (tenant, member_id, thirty_days_ago),
        as_dict=True,
    )

    attendance_category_counts: dict[str, int] = {}
    for att in (past_attendances or []):
        cat_key = (_val(att, "category") or "general").lower()
        attendance_category_counts[cat_key] = attendance_category_counts.get(cat_key, 0) + 1

    dominant_category = ""
    dominant_count = 0
    for cat, cnt in attendance_category_counts.items():
        if cnt > dominant_count:
            dominant_count = cnt
            dominant_category = cat

    # 5. Score candidate sessions
    scored = []
    for s in sessions:
        sess_name = _val(s, "name")
        if sess_name in member_booked_sessions:
            continue

        capacity = int(_val(s, "capacity") or 12)
        confirmed = int(_val(s, "confirmed_count") or 0)
        available_spots = capacity - confirmed

        if available_spots <= 0:
            continue

        category = _val(s, "category") or "General"
        category_lower = category.lower()

        goal_score = _calculate_goal_score(goal_str, category_lower)

        past_visits = attendance_category_counts.get(category_lower, 0)
        variety_score = 30
        if past_visits >= 3:
            variety_score = 5
        elif past_visits >= 1:
            variety_score = 15

        capacity_score = 20
        if available_spots == 1:
            capacity_score = 10
        elif available_spots == 2:
            capacity_score = 15

        total_score = min(99, max(50, goal_score + variety_score + capacity_score))
        reason = _build_reason(goal_str, category, past_visits, dominant_category, available_spots)

        scored.append({
            "session": s,
            "available_spots": available_spots,
            "total_score": total_score,
            "reason": reason,
        })

    # Sort deterministically
    scored.sort(
        key=lambda x: (
            -x["total_score"],
            -x["available_spots"],
            str(_val(x["session"], "session_date")),
            str(_val(x["session"], "start_time")),
        )
    )

    # Return top 3 to 5 (or fewer if fewer eligible candidates exist, never fabricate)
    top_candidates = scored[:5]

    recommendations = []
    for item in top_candidates:
        s = item["session"]
        sess_id = _val(s, "name")
        date_str = str(_val(s, "session_date"))[:10]
        start_str = str(_val(s, "start_time"))[:5]
        name = _val(s, "class_name") or "Studio Session"
        cat = _val(s, "category") or "General"
        trainer = _val(s, "trainer") or "Studio Trainer"

        book_href = f"/member/book-class?classId={sess_id}&className={name}&category={cat}"

        recommendations.append({
            "session_id": sess_id,
            "sessionId": sess_id,
            "class_name": name,
            "className": name,
            "category": cat,
            "trainer": trainer,
            "session_date": date_str,
            "date": date_str,
            "start_time": start_str,
            "startTime": start_str,
            "end_time": "",
            "endTime": "",
            "available_spots": item["available_spots"],
            "availableSpots": item["available_spots"],
            "match_score": item["total_score"],
            "matchScore": item["total_score"],
            "reason": item["reason"],
            "book_href": book_href,
            "bookHref": book_href,
        })

    return {"recommendations": recommendations}
