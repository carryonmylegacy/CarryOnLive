"""CarryOn™ — Weekly Admin Analytics Digest

Sends a weekly email to admin(s) every Monday with key metrics:
MRR trend, new signups, trial conversions, churn summary, and tier breakdown.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import resend
from fastapi import APIRouter, Depends, HTTPException

from config import RESEND_API_KEY, SENDER_EMAIL, db, logger
from utils import get_current_user

router = APIRouter()

CHECK_INTERVAL_HOURS = 168  # weekly (only used as fallback)


async def gather_weekly_analytics():
    """Collect analytics data for the past 7 days."""
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    two_weeks_ago = (now - timedelta(days=14)).isoformat()
    now_iso = now.isoformat()

    # Current period counts
    new_signups = await db.users.count_documents({
        "created_at": {"$gte": week_ago, "$lte": now_iso}
    })
    prev_signups = await db.users.count_documents({
        "created_at": {"$gte": two_weeks_ago, "$lte": week_ago}
    })

    total_users = await db.users.count_documents({"role": {"$ne": "admin"}})
    active_trials = await db.users.count_documents({"trial_ends_at": {"$gt": now_iso}})
    expired_trials = await db.users.count_documents({
        "trial_ends_at": {"$lte": now_iso}, "role": {"$ne": "admin"}
    })

    active_subs = await db.user_subscriptions.count_documents({"status": "active"})
    cancelled_subs = await db.user_subscriptions.count_documents({"status": "cancelled"})

    new_cancellations = await db.user_subscriptions.count_documents({
        "status": "cancelled",
        "cancelled_at": {"$gte": week_ago},
    })
    new_conversions = await db.user_subscriptions.count_documents({
        "status": "active",
        "created_at": {"$gte": week_ago},
    })

    # MRR
    from routes.subscriptions import DEFAULT_PLANS, get_price_for_cycle
    plan_lookup = {p["id"]: p for p in DEFAULT_PLANS}
    mrr = 0.0
    tier_counts = {}
    active_sub_docs = await db.user_subscriptions.find(
        {"status": "active"}, {"_id": 0}
    ).to_list(5000)
    for sub in active_sub_docs:
        plan = plan_lookup.get(sub.get("plan_id", ""))
        if plan:
            mrr += get_price_for_cycle(plan, "monthly")
        tier_counts[sub.get("plan_id", "")] = tier_counts.get(sub.get("plan_id", ""), 0) + 1

    # Churn & conversion rates
    total_ever = active_subs + cancelled_subs
    churn_rate = round((cancelled_subs / total_ever) * 100, 1) if total_ever > 0 else 0
    left_trial = expired_trials + active_subs + cancelled_subs
    conversion_rate = round((active_subs / left_trial) * 100, 1) if left_trial > 0 else 0

    pending_verifications = await db.tier_verifications.count_documents({"status": "pending"})

    # Daily signups for sparkline
    daily_signups = []
    for i in range(7):
        day = now - timedelta(days=6 - i)
        ds = day.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        de = day.replace(hour=23, minute=59, second=59).isoformat()
        c = await db.users.count_documents({"created_at": {"$gte": ds, "$lte": de}})
        daily_signups.append({"day": day.strftime("%a"), "count": c})

    return {
        "new_signups": new_signups,
        "prev_signups": prev_signups,
        "signup_trend": "up" if new_signups > prev_signups else ("down" if new_signups < prev_signups else "flat"),
        "total_users": total_users,
        "active_trials": active_trials,
        "expired_trials": expired_trials,
        "active_subs": active_subs,
        "cancelled_subs": cancelled_subs,
        "new_conversions": new_conversions,
        "new_cancellations": new_cancellations,
        "mrr": round(mrr, 2),
        "arr": round(mrr * 12, 2),
        "churn_rate": churn_rate,
        "conversion_rate": conversion_rate,
        "tier_counts": tier_counts,
        "pending_verifications": pending_verifications,
        "daily_signups": daily_signups,
        "period_start": week_ago,
        "period_end": now_iso,
    }


def build_analytics_digest_html(data, app_url="https://app.carryon.us"):
    """Build HTML email for weekly admin analytics digest."""
    signup_delta = data["new_signups"] - data["prev_signups"]
    signup_arrow = "&#9650;" if signup_delta > 0 else ("&#9660;" if signup_delta < 0 else "&#8212;")
    signup_color = "#22C993" if signup_delta >= 0 else "#ef4444"
    signup_pct = (
        f"+{round((signup_delta / data['prev_signups']) * 100)}%"
        if data["prev_signups"] > 0 and signup_delta > 0
        else f"{round((signup_delta / data['prev_signups']) * 100)}%"
        if data["prev_signups"] > 0
        else "N/A"
    )

    # Sparkline bars
    max_count = max((d["count"] for d in data["daily_signups"]), default=1) or 1
    sparkline_html = ""
    for d in data["daily_signups"]:
        height = max(4, int((d["count"] / max_count) * 40))
        sparkline_html += f"""
        <td style="vertical-align:bottom;padding:0 2px;text-align:center;">
          <div style="width:20px;height:{height}px;background:#d4af37;border-radius:3px 3px 0 0;margin:0 auto;"></div>
          <div style="font-size:9px;color:#525C72;margin-top:3px;">{d["day"]}</div>
        </td>"""

    # Tier breakdown rows
    from routes.subscriptions import DEFAULT_PLANS
    tier_rows = ""
    for plan in DEFAULT_PLANS:
        count = data["tier_counts"].get(plan["id"], 0)
        rev = round(count * plan["price"], 2)
        tier_rows += f"""
        <tr>
          <td style="padding:6px 8px;color:#A0AABF;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.05);">{plan["name"]}</td>
          <td style="padding:6px 8px;color:#F1F3F8;font-size:13px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.05);">{count}</td>
          <td style="padding:6px 8px;color:#d4af37;font-size:13px;text-align:right;border-bottom:1px solid rgba(255,255,255,0.05);">${rev:.2f}</td>
        </tr>"""

    html = f"""
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0F1629;color:#F1F3F8;border-radius:16px;overflow:hidden;">
      <!-- Header -->
      <div style="padding:32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07);">
        <img src="{app_url}/carryon-logo.jpg" alt="CarryOn" style="width:60px;height:auto;margin-bottom:12px;" />
        <h1 style="font-size:22px;margin:0;color:#d4af37;">Weekly Analytics Digest</h1>
        <p style="color:#525C72;font-size:12px;margin:6px 0 0;">
          {datetime.now(timezone.utc).strftime("%b %d, %Y")} &middot; Past 7 days
        </p>
      </div>

      <!-- KPI Row -->
      <div style="padding:24px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:33%;text-align:center;padding:12px 8px;background:rgba(212,175,55,0.06);border-radius:12px;">
              <div style="font-size:11px;color:#525C72;text-transform:uppercase;letter-spacing:1px;font-weight:bold;">MRR</div>
              <div style="font-size:28px;font-weight:bold;color:#d4af37;font-family:'Georgia',serif;margin:4px 0;">${data["mrr"]:.2f}</div>
              <div style="font-size:10px;color:#525C72;">ARR: ${data["arr"]:.2f}</div>
            </td>
            <td style="width:8px;"></td>
            <td style="width:33%;text-align:center;padding:12px 8px;background:rgba(34,201,147,0.06);border-radius:12px;">
              <div style="font-size:11px;color:#525C72;text-transform:uppercase;letter-spacing:1px;font-weight:bold;">Conversion</div>
              <div style="font-size:28px;font-weight:bold;color:#22C993;font-family:'Georgia',serif;margin:4px 0;">{data["conversion_rate"]}%</div>
              <div style="font-size:10px;color:#525C72;">{data["new_conversions"]} new this week</div>
            </td>
            <td style="width:8px;"></td>
            <td style="width:33%;text-align:center;padding:12px 8px;background:rgba(239,68,68,0.06);border-radius:12px;">
              <div style="font-size:11px;color:#525C72;text-transform:uppercase;letter-spacing:1px;font-weight:bold;">Churn</div>
              <div style="font-size:28px;font-weight:bold;color:{"#ef4444" if data["churn_rate"] > 5 else "#22C993"};font-family:'Georgia',serif;margin:4px 0;">{data["churn_rate"]}%</div>
              <div style="font-size:10px;color:#525C72;">{data["new_cancellations"]} cancelled</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Signups Section -->
      <div style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.02);border-radius:12px;padding:16px;">
          <tr>
            <td style="padding:16px;">
              <div style="font-size:13px;color:#A0AABF;font-weight:bold;margin-bottom:8px;">New Signups</div>
              <div style="display:flex;align-items:baseline;gap:8px;">
                <span style="font-size:32px;font-weight:bold;color:#F1F3F8;font-family:'Georgia',serif;">{data["new_signups"]}</span>
                <span style="font-size:13px;color:{signup_color};font-weight:bold;">{signup_arrow} {signup_pct} vs last week</span>
              </div>
              <div style="margin-top:12px;">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>{sparkline_html}</tr></table>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- User Funnel -->
      <div style="padding:0 32px 24px;">
        <div style="font-size:13px;color:#A0AABF;font-weight:bold;margin-bottom:12px;">User Funnel</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 12px;background:rgba(96,165,250,0.08);border-radius:8px;margin-bottom:6px;">
              <span style="font-size:12px;color:#60A5FA;font-weight:bold;">Active Trials</span>
              <span style="float:right;font-size:14px;color:#F1F3F8;font-weight:bold;">{data["active_trials"]}</span>
            </td>
          </tr>
          <tr><td style="height:4px;"></td></tr>
          <tr>
            <td style="padding:8px 12px;background:rgba(34,201,147,0.08);border-radius:8px;">
              <span style="font-size:12px;color:#22C993;font-weight:bold;">Active Subscribers</span>
              <span style="float:right;font-size:14px;color:#F1F3F8;font-weight:bold;">{data["active_subs"]}</span>
            </td>
          </tr>
          <tr><td style="height:4px;"></td></tr>
          <tr>
            <td style="padding:8px 12px;background:rgba(245,158,11,0.08);border-radius:8px;">
              <span style="font-size:12px;color:#F59E0B;font-weight:bold;">Expired (No Sub)</span>
              <span style="float:right;font-size:14px;color:#F1F3F8;font-weight:bold;">{max(0, data["expired_trials"] - data["active_subs"] - data["cancelled_subs"])}</span>
            </td>
          </tr>
          <tr><td style="height:4px;"></td></tr>
          <tr>
            <td style="padding:8px 12px;background:rgba(239,68,68,0.08);border-radius:8px;">
              <span style="font-size:12px;color:#ef4444;font-weight:bold;">Churned</span>
              <span style="float:right;font-size:14px;color:#F1F3F8;font-weight:bold;">{data["cancelled_subs"]}</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Tier Breakdown -->
      <div style="padding:0 32px 24px;">
        <div style="font-size:13px;color:#A0AABF;font-weight:bold;margin-bottom:8px;">Tier Breakdown</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.02);border-radius:12px;overflow:hidden;">
          <tr style="background:rgba(255,255,255,0.04);">
            <th style="padding:8px;text-align:left;font-size:11px;color:#525C72;text-transform:uppercase;letter-spacing:0.5px;">Tier</th>
            <th style="padding:8px;text-align:center;font-size:11px;color:#525C72;text-transform:uppercase;letter-spacing:0.5px;">Subs</th>
            <th style="padding:8px;text-align:right;font-size:11px;color:#525C72;text-transform:uppercase;letter-spacing:0.5px;">Revenue</th>
          </tr>
          {tier_rows}
        </table>
      </div>

      <!-- Action Items -->
      {"" if data["pending_verifications"] == 0 else f'''
      <div style="padding:0 32px 24px;">
        <div style="padding:12px 16px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);border-radius:12px;">
          <span style="font-size:13px;color:#F59E0B;font-weight:bold;">&#9888; {data["pending_verifications"]} pending verification request{"s" if data["pending_verifications"] > 1 else ""}</span>
        </div>
      </div>
      '''}

      <!-- CTA -->
      <div style="padding:0 32px 24px;text-align:center;">
        <a href="{app_url}/admin/analytics" style="display:inline-block;padding:12px 28px;background:#d4af37;color:#0F1629;text-decoration:none;border-radius:10px;font-weight:bold;font-size:14px;">
          View Full Dashboard
        </a>
      </div>

      <!-- Footer -->
      <div style="padding:16px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.07);">
        <p style="color:#525C72;font-size:11px;margin:0;">
          Total Users: {data["total_users"]} &middot; CarryOn&trade; Admin Analytics
        </p>
      </div>
    </div>
    """
    return html


async def send_admin_analytics_digest():
    """Send weekly analytics digest to all admin users."""
    if not RESEND_API_KEY:
        logger.warning("Analytics digest skipped — RESEND_API_KEY not configured")
        return {"sent": 0, "reason": "no_api_key"}

    admins = await db.users.find(
        {"role": "admin"}, {"_id": 0, "email": 1, "name": 1}
    ).to_list(50)

    if not admins:
        logger.info("No admin users found for analytics digest")
        return {"sent": 0, "reason": "no_admins"}

    data = await gather_weekly_analytics()
    html = build_analytics_digest_html(data)
    subject = f"CarryOn™ Weekly Analytics — {datetime.now(timezone.utc).strftime('%b %d, %Y')}"

    sent = 0
    for admin in admins:
        try:
            await asyncio.to_thread(
                resend.Emails.send,
                {
                    "from": SENDER_EMAIL,
                    "to": [admin["email"]],
                    "subject": subject,
                    "html": html,
                },
            )
            sent += 1
            logger.info(f"Analytics digest sent to {admin['email']}")
        except Exception as e:
            logger.error(f"Failed to send analytics digest to {admin['email']}: {e}")

    return {"sent": sent, "data_summary": {
        "mrr": data["mrr"],
        "new_signups": data["new_signups"],
        "conversion_rate": data["conversion_rate"],
        "churn_rate": data["churn_rate"],
    }}


@router.post("/admin/analytics-digest/send")
async def trigger_analytics_digest(current_user: dict = Depends(get_current_user)):
    """Manually trigger the weekly analytics digest email (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await send_admin_analytics_digest()
    return {"success": True, **result}


@router.get("/admin/analytics-digest/preview")
async def preview_analytics_digest(current_user: dict = Depends(get_current_user)):
    """Preview the analytics digest email HTML (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    data = await gather_weekly_analytics()
    html = build_analytics_digest_html(data)
    return {"html": html, "data": data}
