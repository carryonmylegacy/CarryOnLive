"""CarryOn™ Backend — Weekly Estate Readiness Digest"""

import asyncio
from datetime import datetime, timedelta, timezone

import resend
from fastapi import APIRouter, Depends, HTTPException

from config import RESEND_API_KEY, SENDER_EMAIL, db, logger
from services.readiness import calculate_estate_readiness
from utils import get_current_user

router = APIRouter()


def build_digest_html(name: str, score: int, prev_score: int, actions: list, dashboard_url: str) -> str:
    """Build Outlook-safe HTML email for weekly digest"""
    # Trend
    diff = score - prev_score
    if diff > 0:
        trend_color = "#22C993"
        trend_text = f"+{diff}% from last week"
        trend_arrow = "&#9650;"  # up triangle
    elif diff < 0:
        trend_color = "#ef4444"
        trend_text = f"{diff}% from last week"
        trend_arrow = "&#9660;"  # down triangle
    else:
        trend_color = "#94a3b8"
        trend_text = "No change from last week"
        trend_arrow = "&#8212;"  # dash

    # Score color
    if score >= 75:
        score_color = "#22C993"
    elif score >= 50:
        score_color = "#d4af37"
    else:
        score_color = "#F59E0B"

    # Action items HTML
    actions_html = ""
    for i, action in enumerate(actions[:3], 1):
        actions_html += f"""<tr><td style="padding:8px 0;border-bottom:1px solid #1e293b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="32" valign="top" style="padding-right:12px;">
<div style="width:28px;height:28px;background-color:rgba(212,175,55,0.15);border-radius:8px;text-align:center;line-height:28px;font-size:13px;font-weight:bold;color:#d4af37;">{i}</div>
</td>
<td valign="top">
<p style="margin:0;color:#f8fafc;font-size:14px;font-weight:600;">{action["title"]}</p>
<p style="margin:4px 0 0 0;color:#94a3b8;font-size:12px;line-height:1.4;">{action["detail"]}</p>
</td>
</tr></table>
</td></tr>"""

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0b1120;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1120;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:#0f1d35;border-radius:16px;border:1px solid #1e293b;">
<tr><td style="padding:32px;">

<p style="text-align:center;margin:0 0 4px 0;"><span style="font-size:22px;font-weight:bold;color:#d4af37;">CarryOn</span></p>
<p style="text-align:center;margin:0 0 24px 0;color:#64748b;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Weekly Estate Readiness Report</p>

<p style="color:#f8fafc;font-size:16px;margin:0 0 20px 0;">Hi {name},</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111b30;border-radius:12px;border:1px solid #1e293b;margin-bottom:24px;">
<tr><td style="padding:24px;text-align:center;">
<p style="margin:0 0 4px 0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Your Estate Readiness</p>
<p style="margin:0;font-size:48px;font-weight:bold;color:{score_color};">{score}%</p>
<p style="margin:8px 0 0 0;font-size:13px;color:{trend_color};">{trend_arrow} {trend_text}</p>
</td></tr>
</table>

<p style="color:#f8fafc;font-size:14px;font-weight:bold;margin:0 0 12px 0;">Top 3 actions to boost your score:</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
{actions_html}
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
<tr><td align="center">
<a href="{dashboard_url}" style="display:inline-block;background-color:#d4af37;color:#0b1120;font-size:14px;font-weight:bold;padding:14px 32px;border-radius:10px;text-decoration:none;">Open Dashboard</a>
</td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;padding-top:20px;border-top:1px solid #1e293b;">
<tr><td style="text-align:center;color:#475569;font-size:11px;">
<p style="margin:0 0 4px 0;">You're receiving this because you opted in to weekly digests.</p>
<p style="margin:0;">To unsubscribe, visit Settings in your CarryOn dashboard.</p>
</td></tr>
</table>

</td></tr>
</table>
</td></tr>
</table>
</body></html>"""


def prioritize_actions(doc_result: dict, msg_result: dict, checklist_result: dict) -> list:
    """Generate top 3 most impactful actions, ranked by potential score lift."""
    actions = []

    # Documents — each missing doc is ~14% of the docs pillar (1/7)
    if doc_result["missing"]:
        top_missing = doc_result["missing"][0]
        remaining = len(doc_result["missing"])
        actions.append(
            {
                "title": f"Upload your {top_missing}",
                "detail": f"{remaining} key document{'s' if remaining > 1 else ''} missing from your vault. Each one lifts your score.",
                "impact": (100 - doc_result["score"]) * 0.33,
                "category": "documents",
            }
        )

    # Messages — milestone messages for beneficiaries
    if msg_result["missing"]:
        top_msg = msg_result["missing"][0]
        actions.append(
            {
                "title": "Record milestone messages",
                "detail": top_msg,
                "impact": (100 - msg_result["score"]) * 0.33,
                "category": "messages",
            }
        )

    # Checklist — items to add or complete
    for gap in checklist_result.get("missing", []):
        if "Add" in gap:
            actions.append(
                {
                    "title": "Expand your action checklist",
                    "detail": f"{gap}. Use AI Suggest from Vault to auto-generate items.",
                    "impact": (100 - checklist_result["score"]) * 0.33 * 0.5,
                    "category": "checklist",
                }
            )
        elif "Complete" in gap:
            actions.append(
                {
                    "title": "Complete checklist items",
                    "detail": f"{gap} on your Immediate Action Checklist.",
                    "impact": (100 - checklist_result["score"]) * 0.33 * 0.5,
                    "category": "checklist",
                }
            )

    # If score is high and few gaps, add encouragement
    if len(actions) == 0:
        actions.append(
            {
                "title": "You're in great shape!",
                "detail": "Review your estate plan periodically to keep everything current.",
                "impact": 0,
                "category": "general",
            }
        )

    # Sort by impact and take top 3
    actions.sort(key=lambda a: a["impact"], reverse=True)
    return actions[:3]


async def send_digest_for_user(user: dict, dashboard_url: str) -> bool:
    """Send weekly digest to a single benefactor. Returns True if sent."""
    # Find their estates
    estates = await db.estates.find({"owner_id": user["id"]}, {"_id": 0}).to_list(10)

    if not estates:
        return False

    # Use primary estate
    estate = estates[0]
    estate_id = estate["id"]

    # Calculate current readiness
    result = await calculate_estate_readiness(estate_id)
    current_score = result["overall_score"]

    # Get previous week's score
    prev_snapshot = await db.readiness_history.find_one(
        {"estate_id": estate_id},
        {"_id": 0},
        sort=[("week_start", -1)],
    )
    prev_score = prev_snapshot["score"] if prev_snapshot else current_score

    # Store this week's snapshot
    now = datetime.now(timezone.utc)
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    await db.readiness_history.update_one(
        {"estate_id": estate_id, "week_start": week_start.isoformat()},
        {
            "$set": {
                "estate_id": estate_id,
                "user_id": user["id"],
                "score": current_score,
                "breakdown": {
                    "documents": result["documents"]["score"],
                    "messages": result["messages"]["score"],
                    "checklist": result["checklist"]["score"],
                },
                "week_start": week_start.isoformat(),
                "created_at": now.isoformat(),
            }
        },
        upsert=True,
    )

    # Generate top 3 actions
    actions = prioritize_actions(result["documents"], result["messages"], result["checklist"])

    # Build and send email
    name = user.get("name", "").split(" ")[0] or "there"
    html = build_digest_html(name, current_score, prev_score, actions, dashboard_url)

    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": SENDER_EMAIL,
                "to": [user["email"]],
                "subject": f"CarryOn™ Weekly: Your estate is {current_score}% ready",
                "html": html,
            },
        )
        logger.info(f"Weekly digest sent to {user['email']} (score: {current_score}%)")
        return True
    except Exception as e:
        logger.error(f"Failed to send digest to {user['email']}: {e}")
        return False


async def run_weekly_digest(dashboard_url: str):
    """Send weekly digest to all opted-in benefactors."""
    if not RESEND_API_KEY:
        logger.warning("Resend not configured — skipping weekly digest")
        return {"sent": 0, "skipped": 0}

    benefactors = await db.users.find({"role": "benefactor"}, {"_id": 0}).to_list(500)

    sent = 0
    skipped = 0
    for u in benefactors:
        # Check opt-out
        prefs = await db.user_preferences.find_one({"user_id": u["id"]}, {"_id": 0})
        if prefs and prefs.get("weekly_digest") is False:
            skipped += 1
            continue

        # Rate limit: Resend allows 2 req/sec
        if sent > 0:
            await asyncio.sleep(0.6)

        ok = await send_digest_for_user(u, dashboard_url)
        if ok:
            sent += 1
        else:
            skipped += 1

    logger.info(f"Weekly digest complete: {sent} sent, {skipped} skipped")
    return {"sent": sent, "skipped": skipped}


# ===================== API ENDPOINTS =====================

# Role-specific default sections
ROLE_DIGEST_SECTIONS = {
    "benefactor": {
        "family_tree": True,
        "connection_status": True,
        "readiness_score": True,
        "dashboard_tiles": True,
        "action_items": True,
        "missing_items": True,
    },
    "admin": {
        "financials": True,
        "subscription_analytics": True,
        "platform_health": True,
        "tier_breakdown": True,
        "action_items": True,
    },
    "ops_manager": {
        "queue_overview": True,
        "high_priority": True,
        "team_performance": True,
        "escalations": True,
        "shift_notes": True,
    },
    "ops_worker": {
        "my_tasks": True,
        "queue_counts": True,
        "recent_activity": True,
    },
}

SECTION_LABELS = {
    "family_tree": (
        "Family Connections Tree",
        "Visual tree with beneficiary nodes and status",
    ),
    "connection_status": (
        "Connection Status",
        "Linked accounts, invitations, primary beneficiary",
    ),
    "readiness_score": ("Estate Readiness Score", "Overall score with weekly trend"),
    "dashboard_tiles": ("Dashboard Tiles", "Documents, Messages, and Checklist scores"),
    "action_items": ("Action Items", "Top prioritized next steps"),
    "missing_items": ("Missing Items", "Specific gaps in each section"),
    "financials": ("Financials", "MRR, ARR, revenue this month"),
    "subscription_analytics": (
        "Subscription Analytics",
        "Conversion rate, churn, user funnel",
    ),
    "platform_health": ("Platform Health", "New signups, total users, trials"),
    "tier_breakdown": ("Tier Breakdown", "Subscribers and revenue per plan"),
    "queue_overview": ("Queue Overview", "TVT, DTS, MM, Support, Escalation counts"),
    "high_priority": ("High Priority Items", "Longest task in queue, urgent items"),
    "team_performance": ("Team Performance", "Operator activity and task completion"),
    "escalations": ("Escalations", "Open escalation count and details"),
    "shift_notes": ("Shift Notes", "Recent shift handoff notes"),
    "my_tasks": ("My Assigned Tasks", "Your active TVT, DTS, and Milestone tasks"),
    "queue_counts": ("Queue Counts", "Items in each queue awaiting work"),
    "recent_activity": ("Recent Activity", "Last 24h events across all queues"),
}


def get_digest_role_key(user: dict) -> str:
    role = user.get("role", "benefactor")
    if role == "admin":
        return "admin"
    if role == "operator":
        return "ops_manager" if user.get("operator_role") == "manager" else "ops_worker"
    return "benefactor"


def get_default_prefs(user: dict) -> dict:
    role_key = get_digest_role_key(user)
    return {
        "enabled": True,
        "frequency": "weekly",
        "sections": {**ROLE_DIGEST_SECTIONS.get(role_key, ROLE_DIGEST_SECTIONS["benefactor"])},
        "additional_recipients": [],
    }


@router.get("/digest/preferences")
async def get_digest_preferences(current_user: dict = Depends(get_current_user)):
    """Get the current user's digest email preferences (role-aware)."""
    prefs = await db.digest_preferences.find_one({"user_id": current_user["id"]}, {"_id": 0})
    defaults = get_default_prefs(current_user)
    if not prefs:
        prefs = {**defaults, "user_id": current_user["id"]}
    else:
        # Merge missing default sections
        for k, v in defaults["sections"].items():
            if k not in prefs.get("sections", {}):
                prefs.setdefault("sections", {})[k] = v
    prefs["weekly_digest"] = prefs.get("enabled", True)
    prefs["role_key"] = get_digest_role_key(current_user)
    prefs["section_labels"] = SECTION_LABELS
    return prefs


@router.put("/digest/preferences")
async def update_digest_preferences(body: dict, current_user: dict = Depends(get_current_user)):
    """Update the current user's digest email preferences."""
    allowed_fields = {
        "enabled",
        "frequency",
        "sections",
        "additional_recipients",
        "weekly_digest",
    }
    update = {k: v for k, v in body.items() if k in allowed_fields}

    # Back-compat: map weekly_digest to enabled
    if "weekly_digest" in update:
        update["enabled"] = update.pop("weekly_digest")

    if "frequency" in update:
        valid_frequencies = ["weekly", "biweekly", "monthly", "daily"]
        if update["frequency"] not in valid_frequencies:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid frequency. Must be one of: {', '.join(valid_frequencies)}",
            )

    if "sections" in update:
        role_key = get_digest_role_key(current_user)
        valid_sections = set(ROLE_DIGEST_SECTIONS.get(role_key, {}).keys())
        update["sections"] = {k: bool(v) for k, v in update["sections"].items() if k in valid_sections}

    if "additional_recipients" in update:
        if not isinstance(update["additional_recipients"], list):
            raise HTTPException(status_code=400, detail="additional_recipients must be an array")
        import re

        email_re = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
        for email in update["additional_recipients"]:
            if not email_re.match(email):
                raise HTTPException(status_code=400, detail=f"Invalid email address: {email}")

    update["user_id"] = current_user["id"]
    await db.digest_preferences.update_one({"user_id": current_user["id"]}, {"$set": update}, upsert=True)
    prefs = await db.digest_preferences.find_one({"user_id": current_user["id"]}, {"_id": 0})
    return prefs


@router.post("/digest/send-weekly")
async def trigger_weekly_digest(body: dict = None, current_user: dict = Depends(get_current_user)):
    """Manually trigger the weekly digest — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    dashboard_url = (body or {}).get("dashboard_url", "https://carryon.us/dashboard")
    result = await run_weekly_digest(dashboard_url)
    return result


@router.post("/digest/preview")
async def preview_digest(current_user: dict = Depends(get_current_user)):
    """Send a digest preview to the current user (for testing)."""
    if current_user["role"] not in ("admin", "benefactor"):
        raise HTTPException(status_code=403, detail="Not authorized")
    dashboard_url = "https://carryon.us/dashboard"
    ok = await send_digest_for_user(current_user, dashboard_url)
    if not ok:
        raise HTTPException(status_code=400, detail="No estates found or email failed")
    return {"message": "Preview digest sent to your email"}


# ===================== ENHANCED WEEKLY ESTATE HEALTH EMAIL =====================


def build_estate_health_email(
    name: str,
    readiness_score: int,
    prev_score: int,
    docs_result: dict,
    msgs_result: dict,
    checklist_result: dict,
    beneficiaries: list,
    owner_initials: str,
    actions: list,
    dashboard_url: str,
    app_url: str = "https://carryon.us",
) -> str:
    """Build a comprehensive weekly estate health email with family tree,
    connection status, dashboard tiles, and readiness score."""

    # Trend
    diff = readiness_score - prev_score
    if diff > 0:
        trend_color = "#22C993"
        trend_text = f"+{diff}% from last week"
        trend_arrow = "&#9650;"
    elif diff < 0:
        trend_color = "#ef4444"
        trend_text = f"{diff}% from last week"
        trend_arrow = "&#9660;"
    else:
        trend_color = "#94a3b8"
        trend_text = "No change from last week"
        trend_arrow = "&#8212;"

    # Score color
    if readiness_score >= 80:
        score_color = "#22C993"
        score_label = "Protected"
    elif readiness_score >= 60:
        score_color = "#2DD4BF"
        score_label = "Strong"
    elif readiness_score >= 40:
        score_color = "#FBBF24"
        score_label = "Building"
    else:
        score_color = "#F59E0B"
        score_label = "Getting Started"

    # Build family tree nodes HTML
    def get_ben_color(ben):
        if ben.get("is_primary"):
            return "#d4af37"
        if ben.get("is_linked"):
            return "#22C993"
        if ben.get("is_stub"):
            return "rgba(240,82,82,0.6)"
        return ben.get("avatar_color", "#60A5FA")

    def get_ben_status(ben):
        if ben.get("is_linked"):
            return ("Linked", "#22C993", "&#10003;")
        if ben.get("invitation_status") == "sent":
            return ("Invited", "#8B5CF6", "&#9993;")
        if ben.get("is_stub"):
            return ("Incomplete", "#F05252", "&#9888;")
        return ("Pending", "#F5A623", "&#9679;")

    def get_initials(ben):
        fn = ben.get("first_name", "")
        ln = ben.get("last_name", "")
        if fn and ln:
            return (fn[0] + ln[0]).upper()
        n = ben.get("name", "")
        if n:
            parts = n.split()
            return "".join(p[0] for p in parts[:2]).upper()
        return "??"

    # Sort: primary first, then by linked status
    sorted_bens = sorted(
        beneficiaries,
        key=lambda b: (0 if b.get("is_primary") else 1, 0 if b.get("is_linked") else 1),
    )

    # Beneficiary nodes
    ben_nodes_html = ""
    for ben in sorted_bens:
        initials = get_initials(ben)
        color = get_ben_color(ben)
        status_label, status_color, status_icon = get_ben_status(ben)
        ben_name = ben.get("first_name") or ben.get("name", "").split(" ")[0] or "?"
        relation = ben.get("relation", "")
        primary_tag = (
            ' <span style="color:#d4af37;font-size:9px;font-weight:bold;">(Primary)</span>'
            if ben.get("is_primary")
            else ""
        )

        ben_nodes_html += f"""
        <td align="center" valign="top" style="padding:0 8px;">
          <div style="width:2px;height:14px;background:{color};opacity:0.4;margin:0 auto;"></div>
          <div style="width:44px;height:44px;border-radius:50%;background:{color};border:2px solid {status_color};text-align:center;line-height:44px;font-size:14px;font-weight:bold;color:#080e1a;margin:0 auto;">
            {initials}
          </div>
          <p style="margin:3px 0 0 0;font-size:10px;font-weight:600;color:#f8fafc;text-align:center;">{ben_name}{primary_tag}</p>
          <p style="margin:1px 0 0 0;font-size:9px;color:#64748b;text-align:center;">{relation}</p>
          <p style="margin:2px 0 0 0;font-size:9px;font-weight:bold;color:{status_color};text-align:center;">{status_icon} {status_label}</p>
        </td>"""

    # Connection status summary
    total_bens = len(beneficiaries)
    linked_count = sum(1 for b in beneficiaries if b.get("is_linked"))
    invited_count = sum(1 for b in beneficiaries if b.get("invitation_status") == "sent" and not b.get("is_linked"))
    pending_count = total_bens - linked_count - invited_count
    has_primary = any(b.get("is_primary") for b in beneficiaries)

    connection_rows = ""
    connection_items = [
        (
            "Linked Accounts",
            f"{linked_count}/{total_bens}",
            "#22C993" if linked_count == total_bens else "#F5A623",
        ),
        (
            "Invitations Sent",
            f"{linked_count + invited_count}/{total_bens}",
            "#22C993" if linked_count + invited_count == total_bens else "#F5A623",
        ),
        (
            "Primary Beneficiary",
            "Designated" if has_primary else "Not Set",
            "#22C993" if has_primary else "#F05252",
        ),
        (
            "Pending Action",
            f"{pending_count} beneficiar{'y' if pending_count == 1 else 'ies'}"
            if pending_count > 0
            else "All connected",
            "#F5A623" if pending_count > 0 else "#22C993",
        ),
    ]
    for label, value, color in connection_items:
        connection_rows += f"""
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #1a2744;font-size:12px;color:#94a3b8;">{label}</td>
          <td style="padding:6px 0;border-bottom:1px solid #1a2744;font-size:12px;font-weight:bold;color:{color};text-align:right;">{value}</td>
        </tr>"""

    # Dashboard section tiles
    def tile_html(label, score, color, icon_char):
        bar_width = max(score, 4)
        return f"""
        <td width="33%" valign="top" style="padding:4px;">
          <div style="background:#111b30;border-radius:10px;border:1px solid #1e293b;padding:12px;text-align:center;">
            <div style="font-size:18px;margin-bottom:4px;">{icon_char}</div>
            <p style="margin:0;font-size:22px;font-weight:bold;color:{color};">{score}%</p>
            <p style="margin:3px 0 6px 0;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">{label}</p>
            <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:{bar_width}%;background:{color};border-radius:2px;"></div>
            </div>
          </div>
        </td>"""

    docs_color = "#2563eb"
    msgs_color = "#8b5cf6"
    checklist_color = "#f97316"

    # Missing items callouts
    missing_callouts = ""
    if docs_result.get("missing"):
        missing_list = ", ".join(docs_result["missing"][:3])
        missing_callouts += f"""
        <tr><td style="padding:6px 12px;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">
            <span style="color:#2563eb;font-weight:bold;">Documents:</span> Missing {missing_list}
          </p>
        </td></tr>"""
    if msgs_result.get("missing"):
        missing_callouts += f"""
        <tr><td style="padding:6px 12px;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">
            <span style="color:#8b5cf6;font-weight:bold;">Messages:</span> {msgs_result["missing"][0]}
          </p>
        </td></tr>"""
    if checklist_result.get("missing"):
        missing_callouts += f"""
        <tr><td style="padding:6px 12px;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">
            <span style="color:#f97316;font-weight:bold;">Checklist:</span> {checklist_result["missing"][0]}
          </p>
        </td></tr>"""

    # Action items
    actions_html = ""
    for i, action in enumerate(actions[:3], 1):
        actions_html += f"""
        <tr><td style="padding:8px 0;border-bottom:1px solid #1a2744;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="28" valign="top" style="padding-right:10px;">
              <div style="width:24px;height:24px;background:rgba(212,175,55,0.15);border-radius:6px;text-align:center;line-height:24px;font-size:11px;font-weight:bold;color:#d4af37;">{i}</div>
            </td>
            <td valign="top">
              <p style="margin:0;color:#f8fafc;font-size:13px;font-weight:600;">{action["title"]}</p>
              <p style="margin:3px 0 0 0;color:#94a3b8;font-size:11px;">{action["detail"]}</p>
            </td>
          </tr></table>
        </td></tr>"""

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0b1120;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1120;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#0f1d35;border-radius:16px;border:1px solid #1e293b;">

<!-- Header -->
<tr><td style="padding:28px 28px 0 28px;text-align:center;">
  <img src="{app_url}/carryon-logo.jpg" alt="CarryOn" style="width:60px;height:auto;margin-bottom:12px;" />
  <p style="margin:0 0 2px 0;"><span style="font-size:20px;font-weight:bold;color:#d4af37;">CarryOn&trade;</span></p>
  <p style="margin:0 0 20px 0;color:#64748b;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;">Weekly Estate Health Report</p>
  <p style="color:#f8fafc;font-size:15px;margin:0 0 16px 0;text-align:left;">Hi {name},</p>
  <p style="color:#94a3b8;font-size:12px;margin:0 0 20px 0;text-align:left;line-height:1.5;">Here's your weekly snapshot of your estate's health — your connections, your readiness, and what to focus on next.</p>
</td></tr>

<!-- ═══ SECTION 1: FAMILY TREE ═══ -->
<tr><td style="padding:0 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;margin-bottom:16px;">
    <tr><td style="padding:16px 16px 8px 16px;">
      <p style="margin:0 0 12px 0;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;text-align:center;">Your Family Connections</p>
      <!-- Owner node -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr><td align="center">
          <div style="width:52px;height:52px;border-radius:50%;background:#d4af37;border:2px solid {
        score_color
    };box-shadow:0 0 12px {
        score_color
    }40;text-align:center;line-height:52px;font-size:16px;font-weight:bold;color:#080e1a;margin:0 auto;">
            {owner_initials}
          </div>
          <p style="margin:3px 0 0 0;font-size:11px;font-weight:bold;color:#f8fafc;">{name}</p>
          <p style="margin:1px 0 0 0;font-size:9px;color:#d4af37;">Benefactor</p>
        </td></tr>
      </table>
      <!-- Connector -->
      <div style="width:2px;height:16px;background:{score_color};opacity:0.4;margin:0 auto;"></div>
      <!-- Beneficiary nodes -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>{
        ben_nodes_html
        if ben_nodes_html
        else '<td style="padding:8px;text-align:center;"><p style="color:#64748b;font-size:11px;font-style:italic;">No beneficiaries enrolled yet</p></td>'
    }</tr>
      </table>
    </td></tr>
    <!-- Legend -->
    <tr><td style="padding:8px 16px 14px 16px;text-align:center;">
      <span style="font-size:9px;color:#22C993;margin-right:12px;">&#10003; Linked</span>
      <span style="font-size:9px;color:#8B5CF6;margin-right:12px;">&#9993; Invited</span>
      <span style="font-size:9px;color:#F5A623;margin-right:12px;">&#9679; Pending</span>
      <span style="font-size:9px;color:#F05252;">&#9888; Incomplete</span>
    </td></tr>
  </table>
</td></tr>

<!-- ═══ SECTION 2: CONNECTION STATUS ═══ -->
<tr><td style="padding:0 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;margin-bottom:16px;">
    <tr><td style="padding:14px 16px;">
      <p style="margin:0 0 10px 0;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Connection Status</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        {connection_rows}
      </table>
    </td></tr>
  </table>
</td></tr>

<!-- ═══ SECTION 3: READINESS SCORE ═══ -->
<tr><td style="padding:0 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;margin-bottom:16px;">
    <tr><td style="padding:20px;text-align:center;">
      <p style="margin:0 0 4px 0;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Estate Readiness Score</p>
      <p style="margin:0;font-size:52px;font-weight:bold;color:{score_color};">{readiness_score}%</p>
      <p style="margin:4px 0 0 0;font-size:12px;font-weight:bold;color:{score_color};">{score_label}</p>
      <p style="margin:6px 0 0 0;font-size:11px;color:{trend_color};">{trend_arrow} {trend_text}</p>
    </td></tr>
  </table>
</td></tr>

<!-- ═══ SECTION 4: DASHBOARD TILES ═══ -->
<tr><td style="padding:0 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
    <tr>
      {tile_html("Documents", docs_result["score"], docs_color, "&#128196;")}
      {tile_html("Messages", msgs_result["score"], msgs_color, "&#128172;")}
      {tile_html("Checklist", checklist_result["score"], checklist_color, "&#9745;")}
    </tr>
  </table>
</td></tr>

<!-- Missing items callouts -->
{
        f'''<tr><td style="padding:0 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c1628;border-radius:10px;border:1px solid #1e293b;margin-bottom:16px;">
    {missing_callouts}
  </table>
</td></tr>'''
        if missing_callouts
        else ""
    }

<!-- ═══ SECTION 5: TOP ACTIONS ═══ -->
<tr><td style="padding:0 28px;">
  <p style="color:#f8fafc;font-size:13px;font-weight:bold;margin:0 0 10px 0;">Top actions to boost your score:</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    {actions_html}
  </table>
</td></tr>

<!-- CTA Button -->
<tr><td style="padding:20px 28px;" align="center">
  <a href="{
        app_url
    }/login" style="display:inline-block;background-color:#d4af37;color:#0b1120;font-size:13px;font-weight:bold;padding:13px 36px;border-radius:10px;text-decoration:none;">Open Your Dashboard</a>
</td></tr>

<!-- Footer -->
<tr><td style="padding:16px 28px 24px 28px;border-top:1px solid #1e293b;text-align:center;">
  <p style="margin:0 0 4px 0;color:#475569;font-size:10px;">You're receiving this because you opted in to weekly estate reports.</p>
  <p style="margin:0;color:#475569;font-size:10px;">To unsubscribe, visit Settings in your CarryOn dashboard.</p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>"""


# ===================== OPS MANAGER DIGEST EMAIL =====================


async def gather_ops_manager_data():
    """Gather data for the operations manager digest."""
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()

    dts_active = await db.dts_tasks.count_documents(
        {
            "soft_deleted": {"$ne": True},
            "status": {"$in": ["submitted", "quoted", "approved", "ready"]},
        }
    )
    dts_unassigned = await db.dts_tasks.count_documents(
        {
            "soft_deleted": {"$ne": True},
            "assigned_to": None,
            "status": {"$ne": "destroyed"},
        }
    )
    tvt_pending = await db.death_certificates.count_documents({"status": "pending"})
    tvt_reviewing = await db.death_certificates.count_documents({"status": "reviewing"})
    mm_pending = await db.milestone_deliveries.count_documents({"status": "pending_review"})
    support_unread = await db.support_messages.count_documents(
        {"sender_role": {"$nin": ["admin", "operator"]}, "read": False}
    )
    support_open = await db.support_conversations.count_documents(
        {"status": {"$ne": "resolved"}, "deleted_at": {"$exists": False}}
    )
    escalations_open = await db.escalations.count_documents({"status": "open"})

    oldest_dts = await db.dts_tasks.find_one(
        {
            "soft_deleted": {"$ne": True},
            "status": {"$in": ["submitted", "quoted", "approved"]},
        },
        {"_id": 0, "id": 1, "title": 1, "created_at": 1, "status": 1, "task_type": 1},
        sort=[("created_at", 1)],
    )
    oldest_tvt = await db.death_certificates.find_one(
        {"status": {"$in": ["pending", "reviewing"]}},
        {"_id": 0, "id": 1, "estate_id": 1, "created_at": 1, "status": 1},
        sort=[("created_at", 1)],
    )

    operators = await db.users.find(
        {"role": "operator"},
        {"_id": 0, "id": 1, "name": 1, "operator_role": 1, "last_login_at": 1},
    ).to_list(50)

    audit_pipeline = [
        {"$match": {"timestamp": {"$gte": week_ago}}},
        {"$group": {"_id": "$actor_id", "actions_7d": {"$sum": 1}}},
    ]
    actions_by_op = {r["_id"]: r["actions_7d"] for r in await db.audit_trail.aggregate(audit_pipeline).to_list(100)}

    team_stats = []
    for op in operators:
        is_online = False
        if op.get("last_login_at"):
            try:
                ll = datetime.fromisoformat(op["last_login_at"].replace("Z", "+00:00"))
                is_online = (now - ll).total_seconds() < 3600
            except (ValueError, TypeError):
                pass
        team_stats.append(
            {
                "name": op.get("name", "Unknown"),
                "role": op.get("operator_role", "worker"),
                "actions_7d": actions_by_op.get(op["id"], 0),
                "is_online": is_online,
            }
        )

    shift_notes = (
        await db.shift_notes.find(
            {},
            {"_id": 0, "id": 1, "content": 1, "author_name": 1, "category": 1, "created_at": 1},
        )
        .sort("created_at", -1)
        .to_list(3)
    )

    return {
        "queues": {
            "dts_active": dts_active,
            "dts_unassigned": dts_unassigned,
            "tvt_pending": tvt_pending,
            "tvt_reviewing": tvt_reviewing,
            "mm_pending": mm_pending,
            "support_open": support_open,
            "support_unread": support_unread,
            "escalations_open": escalations_open,
        },
        "oldest_dts": oldest_dts,
        "oldest_tvt": oldest_tvt,
        "team_stats": sorted(team_stats, key=lambda x: -x["actions_7d"]),
        "shift_notes": shift_notes,
    }


def build_ops_manager_email(name, data, app_url="https://carryon.us"):
    q = data["queues"]
    total_queue = (
        q["dts_active"]
        + q["tvt_pending"]
        + q["tvt_reviewing"]
        + q["mm_pending"]
        + q["support_open"]
        + q["escalations_open"]
    )

    queue_items = [
        ("DTS Requests", q["dts_active"], q["dts_unassigned"], "#d4af37"),
        (
            "TVT Reviews",
            q["tvt_pending"] + q["tvt_reviewing"],
            q["tvt_pending"],
            "#60A5FA",
        ),
        ("Milestone Msgs", q["mm_pending"], q["mm_pending"], "#8b5cf6"),
        ("Support", q["support_open"], q["support_unread"], "#22C993"),
        ("Escalations", q["escalations_open"], q["escalations_open"], "#ef4444"),
    ]
    queue_html = ""
    for label, total, urgent, color in queue_items:
        urgent_badge = (
            f'<span style="background:{color};color:#0b1120;font-size:9px;font-weight:bold;padding:2px 6px;border-radius:4px;margin-left:6px;">{urgent} need attention</span>'
            if urgent > 0
            else ""
        )
        queue_html += f"""
        <tr><td style="padding:8px 12px;border-bottom:1px solid #1a2744;">
          <span style="color:#f8fafc;font-size:13px;">{label}</span>{urgent_badge}
        </td><td style="padding:8px 12px;border-bottom:1px solid #1a2744;text-align:right;">
          <span style="color:{color};font-size:18px;font-weight:bold;">{total}</span>
        </td></tr>"""

    hi_priority_html = ""
    if data.get("oldest_dts"):
        d = data["oldest_dts"]
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(d["created_at"].replace("Z", "+00:00"))).days
        hi_priority_html += f'<tr><td style="padding:8px 0;border-bottom:1px solid #1a2744;"><span style="color:#F5A623;font-size:12px;font-weight:bold;">DTS</span> <span style="color:#f8fafc;font-size:12px;">{d.get("title", "Untitled")}</span><br/><span style="color:#ef4444;font-size:11px;">{age} days in queue</span></td></tr>'
    if data.get("oldest_tvt"):
        d = data["oldest_tvt"]
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(d["created_at"].replace("Z", "+00:00"))).days
        hi_priority_html += f'<tr><td style="padding:8px 0;border-bottom:1px solid #1a2744;"><span style="color:#60A5FA;font-size:12px;font-weight:bold;">TVT</span> <span style="color:#f8fafc;font-size:12px;">Certificate Review - {d.get("status", "pending")}</span><br/><span style="color:#ef4444;font-size:11px;">{age} days in queue</span></td></tr>'

    team_html = ""
    for t in data.get("team_stats", [])[:5]:
        status = (
            '<span style="color:#22C993;font-size:9px;">Online</span>'
            if t["is_online"]
            else '<span style="color:#64748b;font-size:9px;">Offline</span>'
        )
        team_html += f'<tr><td style="padding:6px 0;border-bottom:1px solid #1a2744;"><span style="color:#f8fafc;font-size:12px;font-weight:600;">{t["name"]}</span> <span style="color:#64748b;font-size:10px;">{t["role"]}</span> {status}</td><td style="padding:6px 0;border-bottom:1px solid #1a2744;text-align:right;"><span style="color:#d4af37;font-size:13px;font-weight:bold;">{t["actions_7d"]}</span><span style="color:#64748b;font-size:10px;"> actions</span></td></tr>'

    notes_html = ""
    for n in data.get("shift_notes", []):
        notes_html += f'<tr><td style="padding:6px 0;border-bottom:1px solid #1a2744;"><span style="color:#d4af37;font-size:10px;font-weight:bold;">{n.get("author_name", "")}</span> <span style="color:#64748b;font-size:10px;">({n.get("category", "")})</span><br/><span style="color:#94a3b8;font-size:11px;">{n.get("content", "")[:120]}</span></td></tr>'

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0b1120;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1120;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#0f1d35;border-radius:16px;border:1px solid #1e293b;">
<tr><td style="padding:28px 28px 0 28px;text-align:center;">
  <img src="{app_url}/carryon-logo.jpg" alt="CarryOn" style="width:60px;height:auto;margin-bottom:12px;" />
  <p style="margin:0 0 2px 0;"><span style="font-size:20px;font-weight:bold;color:#d4af37;">CarryOn&trade;</span></p>
  <p style="margin:0 0 16px 0;color:#64748b;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;">Operations Manager Digest</p>
  <p style="color:#f8fafc;font-size:15px;margin:0 0 8px 0;text-align:left;">Hi {name},</p>
  <p style="color:#94a3b8;font-size:12px;margin:0 0 16px 0;text-align:left;">Here's your operations snapshot.</p>
</td></tr>
<tr><td style="padding:0 28px 16px 28px;text-align:center;">
  <div style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;padding:16px;">
    <p style="margin:0;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Total Items in Queue</p>
    <p style="margin:4px 0 0 0;font-size:44px;font-weight:bold;color:{"#22C993" if total_queue < 5 else "#F5A623" if total_queue < 15 else "#ef4444"};">{total_queue}</p>
  </div>
</td></tr>
<tr><td style="padding:0 28px 16px 28px;"><div style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;padding:14px 16px;"><p style="margin:0 0 10px 0;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Queue Breakdown</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{queue_html}</table></div></td></tr>
{'<tr><td style="padding:0 28px 16px 28px;"><div style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;padding:14px 16px;"><p style="margin:0 0 10px 0;font-size:10px;font-weight:bold;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">Longest in Queue</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + hi_priority_html + "</table></div></td></tr>" if hi_priority_html else ""}
<tr><td style="padding:0 28px 16px 28px;"><div style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;padding:14px 16px;"><p style="margin:0 0 10px 0;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Team Activity (7 days)</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{team_html if team_html else '<tr><td style="color:#64748b;font-size:12px;padding:8px 0;">No team members yet</td></tr>'}</table></div></td></tr>
{'<tr><td style="padding:0 28px 16px 28px;"><div style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;padding:14px 16px;"><p style="margin:0 0 10px 0;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Recent Shift Notes</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + notes_html + "</table></div></td></tr>" if notes_html else ""}
<tr><td style="padding:16px 28px;" align="center"><a href="{app_url}/login" style="display:inline-block;background-color:#d4af37;color:#0b1120;font-size:13px;font-weight:bold;padding:13px 36px;border-radius:10px;text-decoration:none;">Open Ops Dashboard</a></td></tr>
<tr><td style="padding:12px 28px 20px 28px;border-top:1px solid #1e293b;text-align:center;"><p style="margin:0;color:#475569;font-size:10px;">CarryOn&trade; Operations Digest</p></td></tr>
</table></td></tr></table></body></html>"""


# ===================== OPS WORKER DIGEST EMAIL =====================


async def gather_ops_worker_data(user_id: str):
    """Gather data for an individual ops team member."""
    now = datetime.now(timezone.utc)
    day_ago = (now - timedelta(hours=24)).isoformat()

    my_dts = (
        await db.dts_tasks.find(
            {
                "assigned_to": user_id,
                "soft_deleted": {"$ne": True},
                "status": {"$in": ["submitted", "quoted", "approved", "ready"]},
            },
            {"_id": 0, "id": 1, "title": 1, "status": 1, "task_type": 1, "created_at": 1},
        )
        .sort("created_at", 1)
        .to_list(20)
    )
    my_tvt = (
        await db.death_certificates.find(
            {"reviewer_id": user_id, "status": {"$in": ["pending", "reviewing"]}},
            {"_id": 0, "id": 1, "estate_id": 1, "status": 1, "created_at": 1},
        )
        .sort("created_at", 1)
        .to_list(20)
    )
    my_mm = (
        await db.milestone_deliveries.find(
            {"reviewer_id": user_id, "status": "pending_review"},
            {"_id": 0, "id": 1, "milestone_type": 1, "status": 1, "created_at": 1},
        )
        .sort("created_at", 1)
        .to_list(20)
    )

    dts_total = await db.dts_tasks.count_documents(
        {
            "soft_deleted": {"$ne": True},
            "status": {"$in": ["submitted", "quoted", "approved", "ready"]},
        }
    )
    tvt_total = await db.death_certificates.count_documents({"status": {"$in": ["pending", "reviewing"]}})
    mm_total = await db.milestone_deliveries.count_documents({"status": "pending_review"})
    support_total = await db.support_conversations.count_documents(
        {"status": {"$ne": "resolved"}, "deleted_at": {"$exists": False}}
    )
    escalations_total = await db.escalations.count_documents({"status": "open"})
    my_actions = await db.audit_trail.count_documents({"actor_id": user_id, "timestamp": {"$gte": day_ago}})

    return {
        "my_dts": my_dts,
        "my_tvt": my_tvt,
        "my_mm": my_mm,
        "my_total": len(my_dts) + len(my_tvt) + len(my_mm),
        "my_actions_24h": my_actions,
        "queues": {
            "dts": dts_total,
            "tvt": tvt_total,
            "mm": mm_total,
            "support": support_total,
            "escalations": escalations_total,
        },
    }


def build_ops_worker_email(name, data, app_url="https://carryon.us"):
    my_total = data["my_total"]

    tasks_html = ""
    for t in data.get("my_dts", []):
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))).days
        tasks_html += f'<tr><td style="padding:6px 0;border-bottom:1px solid #1a2744;"><span style="color:#d4af37;font-size:10px;font-weight:bold;">DTS</span> <span style="color:#f8fafc;font-size:12px;">{t.get("title", "Untitled")}</span> <span style="color:#64748b;font-size:10px;">({t.get("status", "")})</span><br/><span style="color:#94a3b8;font-size:10px;">{age}d in queue</span></td></tr>'
    for t in data.get("my_tvt", []):
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))).days
        tasks_html += f'<tr><td style="padding:6px 0;border-bottom:1px solid #1a2744;"><span style="color:#60A5FA;font-size:10px;font-weight:bold;">TVT</span> <span style="color:#f8fafc;font-size:12px;">Certificate Review</span> <span style="color:#64748b;font-size:10px;">({t.get("status", "")})</span><br/><span style="color:#94a3b8;font-size:10px;">{age}d in queue</span></td></tr>'
    for t in data.get("my_mm", []):
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))).days
        tasks_html += f'<tr><td style="padding:6px 0;border-bottom:1px solid #1a2744;"><span style="color:#8b5cf6;font-size:10px;font-weight:bold;">MM</span> <span style="color:#f8fafc;font-size:12px;">Milestone - {t.get("milestone_type", "Unknown")}</span><br/><span style="color:#94a3b8;font-size:10px;">{age}d in queue</span></td></tr>'

    q = data["queues"]
    queue_items = [
        ("DTS", q["dts"], "#d4af37"),
        ("TVT", q["tvt"], "#60A5FA"),
        ("MM", q["mm"], "#8b5cf6"),
        ("Support", q["support"], "#22C993"),
        ("Escalations", q["escalations"], "#ef4444"),
    ]
    queue_tiles = ""
    for label, count, color in queue_items:
        queue_tiles += f'<td style="padding:4px;text-align:center;"><div style="background:#0c1628;border-radius:8px;border:1px solid #1e293b;padding:10px 6px;"><p style="margin:0;font-size:20px;font-weight:bold;color:{color};">{count}</p><p style="margin:2px 0 0 0;font-size:9px;color:#64748b;text-transform:uppercase;">{label}</p></div></td>'

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0b1120;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1120;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#0f1d35;border-radius:16px;border:1px solid #1e293b;">
<tr><td style="padding:28px 28px 0 28px;text-align:center;">
  <img src="{app_url}/carryon-logo.jpg" alt="CarryOn" style="width:60px;height:auto;margin-bottom:12px;" />
  <p style="margin:0 0 2px 0;"><span style="font-size:20px;font-weight:bold;color:#d4af37;">CarryOn&trade;</span></p>
  <p style="margin:0 0 16px 0;color:#64748b;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;">Team Member Task Digest</p>
  <p style="color:#f8fafc;font-size:15px;margin:0 0 8px 0;text-align:left;">Hi {name},</p>
  <p style="color:#94a3b8;font-size:12px;margin:0 0 16px 0;text-align:left;">Here's your task summary.</p>
</td></tr>
<tr><td style="padding:0 28px 16px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td width="50%" style="padding:4px;"><div style="background:#0c1628;border-radius:10px;border:1px solid #1e293b;padding:14px;text-align:center;"><p style="margin:0;font-size:36px;font-weight:bold;color:{"#22C993" if my_total == 0 else "#F5A623"};">{my_total}</p><p style="margin:3px 0 0 0;font-size:10px;color:#64748b;text-transform:uppercase;">Assigned Tasks</p></div></td>
  <td width="50%" style="padding:4px;"><div style="background:#0c1628;border-radius:10px;border:1px solid #1e293b;padding:14px;text-align:center;"><p style="margin:0;font-size:36px;font-weight:bold;color:#d4af37;">{data["my_actions_24h"]}</p><p style="margin:3px 0 0 0;font-size:10px;color:#64748b;text-transform:uppercase;">Actions (24h)</p></div></td>
</tr></table></td></tr>
<tr><td style="padding:0 28px 16px 28px;"><div style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;padding:14px 16px;"><p style="margin:0 0 10px 0;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;">My Active Tasks</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{tasks_html if tasks_html else '<tr><td style="color:#22C993;font-size:12px;padding:8px 0;">All clear</td></tr>'}</table></div></td></tr>
<tr><td style="padding:0 28px 16px 28px;"><p style="margin:0 0 8px 0;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;padding-left:4px;">Global Queue Status</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>{queue_tiles}</tr></table></td></tr>
<tr><td style="padding:16px 28px;" align="center"><a href="{app_url}/login" style="display:inline-block;background-color:#d4af37;color:#0b1120;font-size:13px;font-weight:bold;padding:13px 36px;border-radius:10px;text-decoration:none;">Open Dashboard</a></td></tr>
<tr><td style="padding:12px 28px 20px 28px;border-top:1px solid #1e293b;text-align:center;"><p style="margin:0;color:#475569;font-size:10px;">CarryOn&trade; Team Digest</p></td></tr>
</table></td></tr></table></body></html>"""


async def send_enhanced_digest_for_user(user: dict, dashboard_url: str) -> bool:
    """Send enhanced weekly estate health email to a single benefactor."""
    estates = await db.estates.find({"owner_id": user["id"]}, {"_id": 0}).to_list(10)
    if not estates:
        return False
    estate = estates[0]
    estate_id = estate["id"]
    result = await calculate_estate_readiness(estate_id)
    current_score = result["overall_score"]
    prev_snapshot = await db.readiness_history.find_one({"estate_id": estate_id}, {"_id": 0}, sort=[("week_start", -1)])
    prev_score = prev_snapshot["score"] if prev_snapshot else current_score
    bens = await db.beneficiaries.find(
        {"estate_id": estate_id},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "first_name": 1,
            "last_name": 1,
            "relation": 1,
            "is_primary": 1,
            "is_stub": 1,
            "user_id": 1,
            "invitation_status": 1,
            "avatar_color": 1,
        },
    ).to_list(50)
    for b in bens:
        b["is_linked"] = bool(b.get("user_id") or b.get("invitation_status") == "accepted")
    name = user.get("name", "").split(" ")[0] or "there"
    full_name = user.get("name", "")
    parts = full_name.split()
    owner_initials = "".join(p[0] for p in parts[:2]).upper() if parts else "??"
    actions = prioritize_actions(result["documents"], result["messages"], result["checklist"])
    html = build_estate_health_email(
        name=name,
        readiness_score=current_score,
        prev_score=prev_score,
        docs_result=result["documents"],
        msgs_result=result["messages"],
        checklist_result=result["checklist"],
        beneficiaries=bens,
        owner_initials=owner_initials,
        actions=actions,
        dashboard_url=dashboard_url,
    )
    try:
        prefs = await db.digest_preferences.find_one({"user_id": user["id"]}, {"_id": 0})
        recipients = [user["email"]]
        if prefs and prefs.get("additional_recipients"):
            recipients.extend(prefs["additional_recipients"])
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": SENDER_EMAIL,
                "to": recipients,
                "subject": f"CarryOn\u2122 Weekly: Your estate is {current_score}% ready",
                "html": html,
            },
        )
        logger.info(f"Enhanced estate health digest sent to {user['email']} (score: {current_score}%)")
        return True
    except Exception as e:
        logger.error(f"Failed to send enhanced digest to {user['email']}: {e}")
        return False


async def send_role_digest(user: dict) -> bool:
    """Send role-appropriate digest email to a user."""
    role_key = get_digest_role_key(user)
    name = user.get("name", "").split(" ")[0] or "there"
    app_url = "https://carryon.us"

    try:
        if role_key == "admin":
            from routes.admin_digest import (
                gather_weekly_analytics,
                build_analytics_digest_html,
            )

            data = await gather_weekly_analytics()
            html = build_analytics_digest_html(data, app_url)
            subject = f"CarryOn\u2122 Founder Digest \u2014 {datetime.now(timezone.utc).strftime('%b %d, %Y')}"
        elif role_key == "ops_manager":
            data = await gather_ops_manager_data()
            html = build_ops_manager_email(name, data, app_url)
            subject = f"CarryOn\u2122 Ops Manager Digest \u2014 {datetime.now(timezone.utc).strftime('%b %d, %Y')}"
        elif role_key == "ops_worker":
            data = await gather_ops_worker_data(user["id"])
            html = build_ops_worker_email(name, data, app_url)
            subject = f"CarryOn\u2122 Task Digest \u2014 {datetime.now(timezone.utc).strftime('%b %d, %Y')}"
        else:
            return await send_enhanced_digest_for_user(user, app_url)

        prefs = await db.digest_preferences.find_one({"user_id": user["id"]}, {"_id": 0})
        recipients = [user["email"]]
        if prefs and prefs.get("additional_recipients"):
            recipients.extend(prefs["additional_recipients"])

        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": SENDER_EMAIL,
                "to": recipients,
                "subject": subject,
                "html": html,
            },
        )
        logger.info(f"Role digest ({role_key}) sent to {user['email']}")
        return True
    except Exception as e:
        logger.error(f"Failed to send role digest to {user['email']}: {e}")
        return False


@router.post("/digest/preview-enhanced")
async def preview_enhanced_digest(body: dict = None, current_user: dict = Depends(get_current_user)):
    """Send the role-appropriate digest preview to the current user.
    Admin can pass {"send_to": "email"} to redirect, {"target_email": "email"} to preview for a user."""
    send_to_email = body.get("send_to") if body else None
    target = current_user

    if current_user["role"] == "admin" and body and body.get("target_email"):
        user_doc = await db.users.find_one({"email": body["target_email"]}, {"_id": 0, "password": 0})
        if not user_doc:
            raise HTTPException(status_code=404, detail="Target user not found")
        target = user_doc

    role_key = get_digest_role_key(target)

    # For benefactors with no estates, find a sample
    if role_key == "benefactor":
        estates = await db.estates.find({"owner_id": target["id"]}, {"_id": 0}).to_list(1)
        if not estates and current_user["role"] == "admin":
            sample_estate = await db.estates.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
            if sample_estate:
                owner = await db.users.find_one({"id": sample_estate["owner_id"]}, {"_id": 0, "password": 0})
                if owner:
                    target = owner

    # Override recipient email
    if send_to_email and current_user["role"] == "admin":
        target["email"] = send_to_email
    elif current_user["role"] == "admin" and not send_to_email:
        target["email"] = current_user["email"]

    ok = await send_role_digest(target)
    if not ok:
        raise HTTPException(status_code=400, detail="No data found or email failed")
    return {"message": f"Digest sent to {target['email']} (type: {get_digest_role_key(target)})"}
