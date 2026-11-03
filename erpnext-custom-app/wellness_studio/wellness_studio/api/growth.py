"""Growth API endpoints for AI Growth Agent."""

import frappe
from frappe import _
from frappe.utils import nowdate, add_days, getdate, flt, cint, now_datetime
from wellness_studio.tenant.permissions import has_permission


@frappe.whitelist()
def acquisition_metrics(period_days=30, channel=None, branch_id=None):
    """Get member acquisition metrics.

    Args:
        period_days: Analysis period in days
        channel: Filter by acquisition channel
        branch_id: Filter by branch

    Returns:
        Acquisition metrics
    """
    if not has_permission("growth", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    start_date = add_days(nowdate(), -cint(period_days))

    conditions = [
        "`tabWS Lead`.tenant_id = %(tenant_id)s",
        "`tabWS Lead`.creation >= %(start_date)s",
    ]
    params = {"tenant_id": tenant_id, "start_date": start_date}

    if channel:
        conditions.append("`tabWS Lead`.source = %(channel)s")
        params["channel"] = channel

    if branch_id:
        conditions.append("`tabWS Lead`.branch_id = %(branch_id)s")
        params["branch_id"] = branch_id

    where_clause = " AND ".join(conditions)

    # Total leads
    total_leads = frappe.db.sql(f"""
        SELECT COUNT(*) as count FROM `tabWS Lead` WHERE {where_clause}
    """, params)[0][0]

    # Converted leads
    converted = frappe.db.sql(f"""
        SELECT COUNT(*) as count FROM `tabWS Lead` WHERE {where_clause} AND status = 'Converted'
    """, params)[0][0]

    # By channel
    by_channel = frappe.db.sql(f"""
        SELECT source as channel, COUNT(*) as leads,
               COUNT(CASE WHEN status = 'Converted' THEN 1 END) as converted
        FROM `tabWS Lead` WHERE {where_clause}
        GROUP BY source
        ORDER BY leads DESC
    """, params, as_dict=True)

    # By status
    by_status = frappe.db.sql(f"""
        SELECT status, COUNT(*) as count FROM `tabWS Lead` WHERE {where_clause}
        GROUP BY status
    """, params, as_dict=True)

    # Conversion rate
    conversion_rate = round((converted / total_leads * 100), 2) if total_leads > 0 else 0

    # CAC calculation (simplified - would need marketing spend data)
    # In production, integrate with marketing spend data
    cac = 0

    return {
        "period_days": period_days,
        "total_leads": total_leads,
        "converted_leads": converted,
        "conversion_rate": conversion_rate,
        "cac": cac,
        "by_channel": by_channel,
        "by_status": by_status,
        "start_date": str(start_date),
        "end_date": str(nowdate()),
    }


@frappe.whitelist()
def referral_metrics(period_days=30, status=None):
    """Get referral program metrics."""
    if not has_permission("growth", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    start_date = add_days(nowdate(), -cint(period_days))

    conditions = ["tenant_id = %(tenant_id)s", "referred_at >= %(start_date)s"]
    params = {"tenant_id": tenant_id, "start_date": start_date}

    if status:
        conditions.append("status = %(status)s")
        params["status"] = status

    where_clause = " AND ".join(conditions)

    referrals = frappe.db.sql(f"""
        SELECT
            r.*,
            rc.name as campaign_name,
            rc.referrer_incentive_type,
            rc.referrer_incentive_value,
            rc.referee_incentive_type,
            rc.referee_incentive_value
        FROM `tabReferral` r
        LEFT JOIN `tabReferral Campaign` rc ON r.campaign_id = rc.name
        WHERE {where_clause}
        ORDER BY r.referred_at DESC
    """, params, as_dict=True)

    # Summary
    total = len(referrals)
    converted = len([r for r in referrals if r.get("status") == "converted"])
    pending = len([r for r in referrals if r.get("status") == "pending"])
    expired = len([r for r in referrals if r.get("status") == "expired"])

    viral_coeff = round((converted / total), 2) if total > 0 else 0

    return {
        "period_days": period_days,
        "total_referrals": total,
        "converted": converted,
        "pending": pending,
        "expired": expired,
        "viral_coefficient": viral_coeff,
        "referrals": referrals,
    }


@frappe.whitelist()
def create_referral_campaign(**kwargs):
    """Create a referral campaign."""
    if not has_permission("growth", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    user_id = frappe.session.user

    kwargs["tenant_id"] = tenant_id
    kwargs["created_by"] = user_id

    campaign = frappe.get_doc({"doctype": "Referral Campaign", **kwargs})
    campaign.insert(ignore_permissions=True)
    return campaign.as_dict()


@frappe.whitelist()
def upsell_opportunities(member_id=None, opportunity_type=None, min_score=70, limit=50):
    """Identify upsell opportunities."""
    if not has_permission("growth", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    # This would use ML scoring in production
    # For now, heuristic-based identification

    filters = {"tenant_id": tenant_id}
    if member_id:
        filters["name"] = member_id

    members = frappe.get_all("WS Member", filters=filters, fields=[
        "name", "full_name", "phone", "email", "membership_status",
        "goal", "level", "total_attendance", "total_spent"
    ])

    opportunities = []
    for m in members:
        score = 0
        opp_type = []

        # High attendance = personal training opportunity
        if m.total_attendance and m.total_attendance > 20:
            score += 30
            opp_type.append("personal_training")

        # High spender = plan upgrade
        if m.total_spent and m.total_spent > 50000:
            score += 25
            opp_type.append("plan_upgrade")

        # Goal-based
        if m.goal in ["muscle_gain", "weight_loss", "athletic_performance"]:
            score += 20
            opp_type.append("nutrition")

        # Expiring membership
        memberships = frappe.get_all("WS Membership",
            filters={"member_id": m.name, "status": "Active"},
            fields=["end_date"])
        for mem in memberships:
            days_left = (getdate(mem.end_date) - getdate(nowdate())).days
            if 0 <= days_left <= 30:
                score += 25
                opp_type.append("plan_renewal")

        if score >= min_score:
            if not opportunity_type or opportunity_type in opp_type:
                opportunities.append({
                    "member_id": m.name,
                    "member_name": m.full_name,
                    "score": score,
                    "opportunity_types": opp_type,
                    "membership_status": m.membership_status,
                    "recommended_action": "outreach" if score > 85 else "nurture",
                })

    # Sort by score descending
    opportunities.sort(key=lambda x: x["score"], reverse=True)

    return {"opportunities": opportunities[:cint(limit)]}


@frappe.whitelist()
def create_upsell_offer(**kwargs):
    """Create an upsell offer."""
    if not has_permission("growth", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    kwargs["tenant_id"] = tenant_id

    offer = frappe.get_doc({"doctype": "Upsell Offer", **kwargs})
    offer.insert(ignore_permissions=True)
    return offer.as_dict()


@frappe.whitelist()
def lifetime_value_metrics(cohort_by=None, period_months=12):
    """Get LTV metrics."""
    if not has_permission("growth", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    # Cohort analysis - simplified
    if cohort_by == "month":
        cohorts = frappe.db.sql("""
            SELECT
                DATE_FORMAT(creation, '%Y-%m') as cohort,
                COUNT(*) as members,
                AVG(total_spent) as avg_ltv,
                SUM(total_spent) as total_revenue
            FROM `tabWS Member`
            WHERE tenant_id = %s
            AND creation >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
            GROUP BY cohort
            ORDER BY cohort
        """, [tenant_id, period_months], as_dict=True)
    else:
        cohorts = frappe.db.sql("""
            SELECT
                'All' as cohort,
                COUNT(*) as members,
                AVG(total_spent) as avg_ltv,
                SUM(total_spent) as total_revenue
            FROM `tabWS Member`
            WHERE tenant_id = %s
            AND creation >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
        """, [tenant_id, period_months], as_dict=True)

    return {"cohorts": cohorts, "period_months": period_months}


@frappe.whitelist()
def expansion_opportunities(analysis_type="geographic", radius_km=10, min_population=50000):
    """Identify expansion opportunities."""
    if not has_permission("growth", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    # Get existing branches
    branches = frappe.get_all("Branch", filters={"tenant_id": tenant_id},
        fields=["name", "branch_name", "latitude", "longitude", "city"])

    opportunities = []

    if analysis_type == "geographic":
        # Find underserved areas (placeholder logic)
        for branch in branches:
            if branch.latitude and branch.longitude:
                opportunities.append({
                    "type": "new_location",
                    "near_branch": branch.branch_name,
                    "lat": branch.latitude,
                    "lon": branch.longitude,
                    "radius_km": radius_km,
                    "reason": f"Underserved area within {radius_km}km of {branch.branch_name}",
                    "estimated_potential": "high",
                })

    elif analysis_type == "corporate":
        # Corporate partnership opportunities
        opportunities.append({
            "type": "corporate_partnership",
            "target": "Local businesses with 100+ employees",
            "reason": "Corporate wellness programs",
            "estimated_potential": "medium",
        })

    return {"opportunities": opportunities, "analysis_type": analysis_type}


@frappe.whitelist()
def track_growth_experiment(experiment_id=None, status=None):
    """Track growth experiment results."""
    if not has_permission("growth", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    filters = {"tenant_id": tenant_id}
    if experiment_id:
        filters["name"] = experiment_id
    if status:
        filters["status"] = status

    experiments = frappe.get_all("Growth Experiment", filters=filters, fields="*")

    # Add enrollment stats
    for exp in experiments:
        enrollments = frappe.get_all("Experiment Enrollment",
            filters={"experiment_id": exp.name, "tenant_id": tenant_id},
            fields=["variant", "metric_value", "converted_at"])

        control = [e for e in enrollments if e.variant == "control"]
        treatment = [e for e in enrollments if e.variant == "treatment"]

        exp["control_count"] = len(control)
        exp["treatment_count"] = len(treatment)
        exp["control_conversions"] = len([e for e in control if e.converted_at])
        exp["treatment_conversions"] = len([e for e in treatment if e.converted_at])

        if exp["control_count"] > 0 and exp["treatment_count"] > 0:
            control_rate = exp["control_conversions"] / exp["control_count"]
            treatment_rate = exp["treatment_conversions"] / exp["treatment_count"]
            exp["lift"] = round(((treatment_rate - control_rate) / control_rate * 100), 2) if control_rate > 0 else 0

    return {"experiments": experiments}


@frappe.whitelist()
def create_growth_experiment(**kwargs):
    """Create a growth experiment (A/B test)."""
    if not has_permission("growth", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    user_id = frappe.session.user

    kwargs["tenant_id"] = tenant_id
    kwargs["created_by"] = user_id

    experiment = frappe.get_doc({"doctype": "Growth Experiment", **kwargs})
    experiment.insert(ignore_permissions=True)
    return experiment.as_dict()