"""Marketing API endpoints for AI Marketing Agent."""

import frappe
from frappe import _
from frappe.utils import nowdate, add_days, getdate, flt, cint, now_datetime
from wellness_studio.tenant.permissions import has_permission


@frappe.whitelist()
def campaign_performance(campaign_id=None, channel=None, start_date=None, end_date=None, status=None):
    """Get marketing campaign performance."""
    if not has_permission("marketing", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    filters = {"tenant_id": tenant_id}
    if campaign_id:
        filters["name"] = campaign_id
    if channel:
        filters["channel"] = channel
    if status:
        filters["status"] = status
    if start_date and end_date:
        filters["schedule_start"] = ["between", [start_date, end_date]]

    campaigns = frappe.get_all("Marketing Campaign", filters=filters, fields="*")

    # Calculate metrics for each
    for c in campaigns:
        # These would come from platform APIs in production
        c["metrics"] = {
            "impressions": c.get("impressions", 0),
            "clicks": c.get("clicks", 0),
            "conversions": c.get("conversions", 0),
            "spend": c.get("budget_spent", 0),
            "ctr": round((c.get("clicks", 0) / c.get("impressions", 1) * 100), 2) if c.get("impressions") else 0,
            "cpa": round((c.get("budget_spent", 0) / c.get("conversions", 1)), 2) if c.get("conversions") else 0,
            "roas": round((c.get("revenue_attributed", 0) / c.get("budget_spent", 1)), 2) if c.get("budget_spent") else 0,
        }

    return {"campaigns": campaigns}


@frappe.whitelist()
def create_marketing_campaign(**kwargs):
    """Create a marketing campaign."""
    if not has_permission("marketing", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    user_id = frappe.session.user

    kwargs["tenant_id"] = tenant_id
    kwargs["created_by"] = user_id

    campaign = frappe.get_doc({"doctype": "Marketing Campaign", **kwargs})
    campaign.insert(ignore_permissions=True)
    return campaign.as_dict()


@frappe.whitelist()
def audience_segments(segment_type=None, min_size=10):
    """Get audience segments."""
    if not has_permission("marketing", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    filters = {"tenant_id": tenant_id, "status": "active"}
    if segment_type:
        filters["segment_type"] = segment_type

    segments = frappe.get_all("Audience Segment", filters=filters, fields="*")

    # Filter by min size
    segments = [s for s in segments if cint(s.estimated_size) >= cint(min_size)]

    return {"segments": segments}


@frappe.whitelist()
def create_audience_segment(**kwargs):
    """Create an audience segment."""
    if not has_permission("marketing", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    user_id = frappe.session.user

    kwargs["tenant_id"] = tenant_id
    kwargs["created_by"] = user_id

    segment = frappe.get_doc({"doctype": "Audience Segment", **kwargs})
    segment.insert(ignore_permissions=True)
    return segment.as_dict()


@frappe.whitelist()
def content_calendar(start_date, end_date, channel=None, status=None):
    """Get content calendar."""
    if not has_permission("marketing", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    filters = {
        "tenant_id": tenant_id,
        "scheduled_at": ["between", [start_date, end_date]],
    }
    if channel:
        filters["channel"] = channel
    if status:
        filters["status"] = status

    content = frappe.get_all("Content Calendar", filters=filters, fields="*", order_by="scheduled_at asc")

    return {"content": content, "period": {"start": start_date, "end": end_date}}


@frappe.whitelist()
def schedule_content(**kwargs):
    """Schedule marketing content."""
    if not has_permission("marketing", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    user_id = frappe.session.user

    kwargs["tenant_id"] = tenant_id
    kwargs["created_by"] = user_id

    content = frappe.get_doc({"doctype": "Content Calendar", **kwargs})
    content.insert(ignore_permissions=True)
    return content.as_dict()


@frappe.whitelist()
def lead_attribution(lead_id=None, period_days=30, attribution_model="data_driven"):
    """Get lead attribution."""
    if not has_permission("marketing", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    start_date = add_days(nowdate(), -cint(period_days))

    if lead_id:
        # Single lead attribution
        lead = frappe.get_doc("WS Lead", {"name": lead_id, "tenant_id": tenant_id})
        if not lead:
            frappe.throw(_("Lead not found"), frappe.DoesNotExistError)

        # Get touchpoints
        touchpoints = frappe.get_all("Lead Touchpoint",
            filters={"lead_id": lead_id, "tenant_id": tenant_id},
            fields="*", order_by="timestamp asc")

        # Apply attribution model
        attribution = apply_attribution_model(touchpoints, attribution_model)

        return {"lead_id": lead_id, "touchpoints": touchpoints, "attribution": attribution}

    # Aggregate attribution
    leads = frappe.get_all("WS Lead",
        filters={"tenant_id": tenant_id, "creation": [">=", start_date]},
        fields=["name", "source", "status", "creation"])

    by_source = {}
    for lead in leads:
        source = lead.source or "unknown"
        if source not in by_source:
            by_source[source] = {"leads": 0, "converted": 0}
        by_source[source]["leads"] += 1
        if lead.status == "Converted":
            by_source[source]["converted"] += 1

    return {"attribution": by_source, "period_days": period_days, "model": attribution_model}


def apply_attribution_model(touchpoints, model):
    """Apply attribution model to touchpoints."""
    if not touchpoints:
        return {}

    if model == "first_touch":
        return {touchpoints[0]["channel"]: 1.0}
    elif model == "last_touch":
        return {touchpoints[-1]["channel"]: 1.0}
    elif model == "linear":
        weight = 1.0 / len(touchpoints)
        return {tp["channel"]: weight for tp in touchpoints}
    elif model == "time_decay":
        # More recent gets more weight
        total = len(touchpoints)
        return {tp["channel"]: (i+1)/total for i, tp in enumerate(touchpoints)}
    elif model == "position_based":
        # 40% first, 40% last, 20% middle
        if len(touchpoints) == 1:
            return {touchpoints[0]["channel"]: 1.0}
        elif len(touchpoints) == 2:
            return {touchpoints[0]["channel"]: 0.5, touchpoints[1]["channel"]: 0.5}
        else:
            weights = {touchpoints[0]["channel"]: 0.4, touchpoints[-1]["channel"]: 0.4}
            middle_weight = 0.2 / (len(touchpoints) - 2)
            for tp in touchpoints[1:-1]:
                weights[tp["channel"]] = weights.get(tp["channel"], 0) + middle_weight
            return weights
    else:  # data_driven - simplified
        return {tp["channel"]: 1.0/len(touchpoints) for tp in touchpoints}


@frappe.whitelist()
def brand_health_metrics(period_days=90, source="all"):
    """Get brand health metrics."""
    if not has_permission("marketing", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    start_date = add_days(nowdate(), -cint(period_days))

    metrics = {}

    # NPS from feedback
    if source in ["nps", "all"]:
        nps_feedback = frappe.get_all("WS Feedback",
            filters={"tenant_id": tenant_id, "creation": [">=", start_date], "type": "nps"},
            fields=["rating"])
        if nps_feedback:
            promoters = len([f for f in nps_feedback if f.rating >= 9])
            detractors = len([f for f in nps_feedback if f.rating <= 6])
            total = len(nps_feedback)
            metrics["nps"] = round(((promoters - detractors) / total * 100), 1) if total > 0 else 0
            metrics["nps_responses"] = total

    # Reviews
    if source in ["reviews", "all"]:
        reviews = frappe.get_all("Review",
            filters={"tenant_id": tenant_id, "fetched_at": [">=", start_date]},
            fields=["rating", "platform", "sentiment"])

        if reviews:
            avg_rating = sum(flt(r.rating) for r in reviews) / len(reviews)
            sentiment_dist = {}
            for r in reviews:
                s = r.sentiment or "neutral"
                sentiment_dist[s] = sentiment_dist.get(s, 0) + 1

            platform_dist = {}
            for r in reviews:
                p = r.platform
                platform_dist[p] = platform_dist.get(p, 0) + 1

            metrics["avg_rating"] = round(avg_rating, 2)
            metrics["review_count"] = len(reviews)
            metrics["sentiment_distribution"] = sentiment_dist
            metrics["platform_distribution"] = platform_dist

    # Social sentiment (placeholder)
    if source in ["social", "all"]:
        metrics["social_mentions"] = 0
        metrics["social_sentiment"] = "neutral"
        metrics["share_of_voice"] = 0

    return {"metrics": metrics, "period_days": period_days}


@frappe.whitelist()
def manage_review_response(action, review_id=None, platform=None, response=None):
    """Manage review responses."""
    if not has_permission("marketing", "write"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    if action == "view":
        filters = {"tenant_id": tenant_id}
        if platform:
            filters["platform"] = platform
        if review_id:
            filters["name"] = review_id

        reviews = frappe.get_all("Review", filters=filters, fields="*", order_by="fetched_at desc", limit=100)
        return {"reviews": reviews}

    elif action == "respond":
        if not review_id or not response:
            frappe.throw(_("review_id and response required"), frappe.ValidationError)

        review = frappe.get_doc("Review", {"name": review_id, "tenant_id": tenant_id})
        if not review:
            frappe.throw(_("Review not found"), frappe.DoesNotExistError)

        review.response = response
        review.responded_at = now_datetime()
        review.responded_by = frappe.session.user
        review.status = "responded"
        review.save(ignore_permissions=True)

        # In production, post to platform API
        return {"responded": True, "review": review.as_dict()}

    elif action == "flag":
        if not review_id:
            frappe.throw(_("review_id required"), frappe.ValidationError)
        review = frappe.get_doc("Review", {"name": review_id, "tenant_id": tenant_id})
        review.status = "flagged"
        review.save(ignore_permissions=True)
        return {"flagged": True}

    elif action == "escalate":
        if not review_id:
            frappe.throw(_("review_id required"), frappe.ValidationError)
        review = frappe.get_doc("Review", {"name": review_id, "tenant_id": tenant_id})
        review.status = "escalated"
        review.save(ignore_permissions=True)
        # Send alert to management
        return {"escalated": True}

    elif action == "report":
        if not review_id:
            frappe.throw(_("review_id required"), frappe.ValidationError)
        review = frappe.get_doc("Review", {"name": review_id, "tenant_id": tenant_id})
        review.status = "reported"
        review.save(ignore_permissions=True)
        return {"reported": True}

    else:
        frappe.throw(_("Invalid action"), frappe.ValidationError)


@frappe.whitelist()
def competitor_intelligence(competitor_id=None, radius_km=10, include_online=True):
    """Get competitor intelligence."""
    if not has_permission("marketing", "read"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    tenant_id = frappe.local.tenant_id
    if not tenant_id:
        frappe.throw(_("Tenant context required"), frappe.ValidationError)

    if competitor_id:
        competitor = frappe.get_doc("Competitor", {"name": competitor_id, "tenant_id": tenant_id})
        if not competitor:
            frappe.throw(_("Competitor not found"), frappe.DoesNotExistError)
        return {"competitor": competitor.as_dict()}

    # Get nearby competitors
    filters = {"tenant_id": tenant_id, "is_active": 1}
    competitors = frappe.get_all("Competitor", filters=filters, fields="*")

    return {"competitors": competitors}