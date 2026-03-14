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
        primary_tag = ' <span style="color:#d4af37;font-size:9px;font-weight:bold;">(Primary)</span>' if ben.get("is_primary") else ""

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
        ("Linked Accounts", f"{linked_count}/{total_bens}", "#22C993" if linked_count == total_bens else "#F5A623"),
        ("Invitations Sent", f"{linked_count + invited_count}/{total_bens}", "#22C993" if linked_count + invited_count == total_bens else "#F5A623"),
        ("Primary Beneficiary", "Designated" if has_primary else "Not Set", "#22C993" if has_primary else "#F05252"),
        ("Pending Action", f"{pending_count} beneficiar{'y' if pending_count == 1 else 'ies'}" if pending_count > 0 else "All connected", "#F5A623" if pending_count > 0 else "#22C993"),
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
          <div style="width:52px;height:52px;border-radius:50%;background:#d4af37;border:2px solid {score_color};box-shadow:0 0 12px {score_color}40;text-align:center;line-height:52px;font-size:16px;font-weight:bold;color:#080e1a;margin:0 auto;">
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
        <tr>{ben_nodes_html if ben_nodes_html else '<td style="padding:8px;text-align:center;"><p style="color:#64748b;font-size:11px;font-style:italic;">No beneficiaries enrolled yet</p></td>'}</tr>
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
{f'''<tr><td style="padding:0 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c1628;border-radius:10px;border:1px solid #1e293b;margin-bottom:16px;">
    {missing_callouts}
  </table>
</td></tr>''' if missing_callouts else ''}

<!-- ═══ SECTION 5: TOP ACTIONS ═══ -->
<tr><td style="padding:0 28px;">
  <p style="color:#f8fafc;font-size:13px;font-weight:bold;margin:0 0 10px 0;">Top actions to boost your score:</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    {actions_html}
  </table>
</td></tr>

<!-- CTA Button -->
<tr><td style="padding:20px 28px;" align="center">
  <a href="{dashboard_url}" style="display:inline-block;background-color:#d4af37;color:#0b1120;font-size:13px;font-weight:bold;padding:13px 36px;border-radius:10px;text-decoration:none;">Open Your Dashboard</a>
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


async def send_enhanced_digest_for_user(user: dict, dashboard_url: str) -> bool:
    """Send enhanced weekly estate health email to a single benefactor."""
    estates = await db.estates.find({"owner_id": user["id"]}, {"_id": 0}).to_list(10)
    if not estates:
        return False

    estate = estates[0]
    estate_id = estate["id"]

    # Calculate readiness
    result = await calculate_estate_readiness(estate_id)
    current_score = result["overall_score"]

    # Previous score
    prev_snapshot = await db.readiness_history.find_one(
        {"estate_id": estate_id}, {"_id": 0}, sort=[("week_start", -1)]
    )
    prev_score = prev_snapshot["score"] if prev_snapshot else current_score

    # Beneficiaries with status info
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
        b["is_linked"] = bool(
            b.get("user_id") or b.get("invitation_status") == "accepted"
        )

    # Owner initials
    name = user.get("name", "").split(" ")[0] or "there"
    full_name = user.get("name", "")
    parts = full_name.split()
    owner_initials = "".join(p[0] for p in parts[:2]).upper() if parts else "??"

    # Actions
    actions = prioritize_actions(
        result["documents"], result["messages"], result["checklist"]
    )

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
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": SENDER_EMAIL,
                "to": [user["email"]],
                "subject": f"CarryOn\u2122 Weekly: Your estate is {current_score}% ready",
                "html": html,
            },
        )
        logger.info(
            f"Enhanced estate health digest sent to {user['email']} (score: {current_score}%)"
        )
        return True
    except Exception as e:
        logger.error(f"Failed to send enhanced digest to {user['email']}: {e}")
        return False


@router.post("/digest/preview-enhanced")
async def preview_enhanced_digest(
    body: dict = None, current_user: dict = Depends(get_current_user)
):
    """Send the enhanced estate health digest preview to the current user.
    Admin can pass {"target_email": "..."} to preview for a specific user."""
    if current_user["role"] not in ("admin", "benefactor"):
        raise HTTPException(status_code=403, detail="Not authorized")

    send_to_email = body.get("send_to") if body else None
    target = current_user

    if current_user["role"] == "admin" and body and body.get("target_email"):
        user_doc = await db.users.find_one(
            {"email": body["target_email"]}, {"_id": 0, "password": 0}
        )
        if not user_doc:
            raise HTTPException(status_code=404, detail="Target user not found")
        target = user_doc

    # If target has no estates, find the first benefactor with an estate to demo
    estates = await db.estates.find({"owner_id": target["id"]}, {"_id": 0}).to_list(1)
    if not estates and current_user["role"] == "admin":
        sample_estate = await db.estates.find_one(
            {}, {"_id": 0}, sort=[("created_at", -1)]
        )
        if sample_estate:
            owner = await db.users.find_one(
                {"id": sample_estate["owner_id"]}, {"_id": 0, "password": 0}
            )
            if owner:
                target = owner

    # Admin can override the recipient email
    if send_to_email and current_user["role"] == "admin":
        target["email"] = send_to_email
    elif not send_to_email and current_user["role"] == "admin":
        target["email"] = current_user["email"]

    dashboard_url = "https://carryon.us/dashboard"
    ok = await send_enhanced_digest_for_user(target, dashboard_url)
    if not ok:
        raise HTTPException(status_code=400, detail="No estates found or email failed")
    return {"message": f"Enhanced estate health digest sent to {target['email']}"}
