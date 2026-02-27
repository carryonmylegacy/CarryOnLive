"""CarryOn™ — Trial Reminder Scheduler

Sends email reminders to users at 10 days and 5 days before trial expiration.
Runs as a background task alongside the weekly digest scheduler.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import resend

from config import RESEND_API_KEY, SENDER_EMAIL, db, logger

REMINDER_INTERVALS = [10, 5]  # days before trial ends
CHECK_INTERVAL_HOURS = 6  # how often to scan for reminders


def build_trial_reminder_email(user_name, days_remaining, app_url):
    """Build HTML email for trial reminder."""
    urgency = "urgent" if days_remaining <= 5 else "standard"
    subject = (
        f"Your CarryOn™ free trial ends in {days_remaining} days"
        if days_remaining > 1
        else "Your CarryOn™ free trial ends tomorrow!"
    )

    accent = "#ef4444" if urgency == "urgent" else "#d4af37"

    html = f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0F1629; color: #F1F3F8; border-radius: 16px; overflow: hidden;">
      <div style="padding: 40px 32px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.07);">
        <img src="{app_url}/carryon-logo.jpg" alt="CarryOn™" style="width: 80px; height: auto; margin-bottom: 16px;" />
        <h1 style="font-size: 24px; margin: 0 0 8px; color: {accent};">
          {"⏰ " if urgency == "urgent" else ""}Your Free Trial Ends in {days_remaining} Day{"s" if days_remaining > 1 else ""}
        </h1>
        <p style="color: #A0AABF; font-size: 14px; margin: 0;">
          Hi {user_name or "there"},
        </p>
      </div>

      <div style="padding: 32px;">
        <p style="color: #A0AABF; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          {"Your CarryOn™ free trial is almost over. Don't lose access to your secure estate planning tools." if urgency == "urgent" else "We hope you're enjoying CarryOn™! Your 30-day free trial is winding down."}
        </p>

        <div style="background: rgba(212,175,55,0.06); border: 1px solid rgba(212,175,55,0.15); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #d4af37; font-weight: bold; font-size: 14px; margin: 0 0 12px;">What you'll keep with a subscription:</p>
          <ul style="color: #A0AABF; font-size: 13px; padding-left: 18px; margin: 0; line-height: 1.8;">
            <li>Secure Document Vault (AES-256 encrypted)</li>
            <li>Beneficiary Management & Milestone Messages</li>
            <li>Estate Guardian™ AI Analysis</li>
            <li>Immediate Action Checklist</li>
          </ul>
        </div>

        <p style="color: #A0AABF; font-size: 13px; margin: 0 0 20px;">
          Plans start at just <strong style="color: #d4af37;">$7.99/mo</strong>. Military/First Responder and Hospice discounts available.
        </p>

        <div style="text-align: center;">
          <a href="{app_url}/settings" style="display: inline-block; padding: 14px 32px; background: #d4af37; color: #0F1629; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 14px;">
            Choose Your Plan
          </a>
        </div>
      </div>

      <div style="padding: 20px 32px; text-align: center; border-top: 1px solid rgba(255,255,255,0.07);">
        <p style="color: #525C72; font-size: 11px; margin: 0;">
          AES-256 Encrypted · Zero-Knowledge Architecture · Cancel anytime
        </p>
        <p style="color: #525C72; font-size: 11px; margin: 4px 0 0;">
          CarryOn™ · Secure Your Legacy
        </p>
      </div>
    </div>
    """
    return subject, html


async def send_trial_reminders():
    """Scan users and send reminders at 10-day and 5-day marks."""
    if not RESEND_API_KEY:
        logger.warning("Trial reminders skipped — RESEND_API_KEY not configured")
        return 0

    now = datetime.now(timezone.utc)
    sent_count = 0
    app_url = "https://app.carryon.us"

    for days in REMINDER_INTERVALS:
        # Find users whose trial ends in exactly `days` days (within a 12-hour window)
        target_start = now + timedelta(days=days - 0.25)
        target_end = now + timedelta(days=days + 0.25)

        users = await db.users.find(
            {
                "trial_ends_at": {
                    "$gte": target_start.isoformat(),
                    "$lte": target_end.isoformat(),
                },
                "subscription_status": {"$nin": ["active", "cancelled"]},
                f"trial_reminder_{days}d_sent": {"$ne": True},
            },
            {"_id": 0, "password": 0},
        ).to_list(500)

        for user in users:
            try:
                subject, html = build_trial_reminder_email(
                    user.get("name", user.get("first_name", "")),
                    days,
                    app_url,
                )

                await asyncio.to_thread(
                    resend.Emails.send,
                    {
                        "from": SENDER_EMAIL,
                        "to": [user["email"]],
                        "subject": subject,
                        "html": html,
                    },
                )

                # Mark as sent so we don't re-send
                await db.users.update_one(
                    {"id": user["id"]},
                    {"$set": {f"trial_reminder_{days}d_sent": True}},
                )

                sent_count += 1
                logger.info(
                    f"Trial reminder ({days}d) sent to {user['email']}"
                )
            except Exception as e:
                logger.error(
                    f"Failed to send trial reminder to {user.get('email')}: {e}"
                )

    return sent_count


async def trial_reminder_scheduler():
    """Background task: checks for trial reminders every 6 hours."""
    while True:
        try:
            count = await send_trial_reminders()
            if count > 0:
                logger.info(f"Trial reminders sent: {count}")
            else:
                logger.info("Trial reminder check — no reminders to send")
        except Exception as e:
            logger.error(f"Trial reminder scheduler error: {e}")

        await asyncio.sleep(CHECK_INTERVAL_HOURS * 3600)
