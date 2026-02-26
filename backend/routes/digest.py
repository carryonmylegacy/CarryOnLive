"""CarryOn™ Backend — Weekly Estate Readiness Digest"""

import asyncio
from datetime import datetime, timedelta, timezone

import resend
from fastapi import APIRouter, Depends, HTTPException

from config import RESEND_API_KEY, SENDER_EMAIL, db, logger
from services.readiness import calculate_estate_readiness
from utils import get_current_user

router = APIRouter()


def build_digest_html(
    name: str, score: int, prev_score: int, actions: list, dashboard_url: str
) -> str:
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


def prioritize_actions(
    doc_result: dict, msg_result: dict, checklist_result: dict
) -> list:
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
    week_start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
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
    actions = prioritize_actions(
        result["documents"], result["messages"], result["checklist"]
    )

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


@router.get("/digest/preferences")
async def get_digest_preferences(current_user: dict = Depends(get_current_user)):
    """Get user's digest email preferences."""
    prefs = await db.user_preferences.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    return {"weekly_digest": prefs.get("weekly_digest", True) if prefs else True}


@router.put("/digest/preferences")
async def update_digest_preferences(
    body: dict, current_user: dict = Depends(get_current_user)
):
    """Update user's digest email preferences."""
    weekly_digest = body.get("weekly_digest", True)
    await db.user_preferences.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"user_id": current_user["id"], "weekly_digest": weekly_digest}},
        upsert=True,
    )
    return {"weekly_digest": weekly_digest}


@router.post("/digest/send-weekly")
async def trigger_weekly_digest(
    body: dict = None, current_user: dict = Depends(get_current_user)
):
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
