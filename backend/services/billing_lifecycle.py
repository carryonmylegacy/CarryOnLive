"""CarryOn™ — Billing Lifecycle Manager

Handles:
- Detecting expired subscriptions → grace period (past_due, 30 days)
- Daily email reminders during grace period
- Transition to dormant after 30-day grace
- Reactivation on successful payment
- Admin notifications for payment issues
"""

import asyncio
from datetime import datetime, timedelta, timezone

from config import db, logger

GRACE_PERIOD_DAYS = 30


def _grace_email_html(name: str, days_remaining: int, settings_url: str) -> str:
    """Build the grace period reminder email."""
    urgency = (
        "immediately" if days_remaining <= 3 else "soon" if days_remaining <= 7 else "at your earliest convenience"
    )
    urgency_color = "#EF4444" if days_remaining <= 3 else "#F5A623" if days_remaining <= 7 else "#d4af37"

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0b1120;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1120;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:#0f1d35;border-radius:16px;border:1px solid #1e293b;">
<tr><td style="padding:40px;">

<p style="text-align:center;margin:0 0 24px 0;"><span style="font-size:24px;font-weight:bold;color:#d4af37;">CarryOn</span></p>

<h1 style="color:#f8fafc;font-size:20px;margin:0 0 16px 0;">Payment Update Required</h1>

<p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
Hi {name},
</p>

<p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
We were unable to process your recent subscription payment. To maintain full access to all CarryOn features, please update your payment method <span style="color:{urgency_color};font-weight:bold;">{urgency}</span>.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:16px;background-color:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.25);border-radius:12px;">
<p style="color:{urgency_color};font-size:24px;font-weight:bold;text-align:center;margin:0 0 4px 0;">{days_remaining} day{"s" if days_remaining != 1 else ""} remaining</p>
<p style="color:#94a3b8;font-size:14px;text-align:center;margin:0;">in your grace period</p>
</td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
<tr><td align="center">
<a href="{settings_url}" style="display:inline-block;background-color:#d4af37;color:#0b1120;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:10px;text-decoration:none;">Update Payment Method</a>
</td></tr>
</table>

<p style="color:#64748b;font-size:14px;line-height:1.6;margin:24px 0 0 0;">
If your grace period expires, your account will become dormant. You will retain read-only access to your existing data, but you will not be able to upload, edit, or access DTS services until payment is restored.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;padding-top:24px;border-top:1px solid #1e293b;">
<tr><td style="text-align:center;color:#64748b;font-size:12px;">
<p style="margin:0 0 4px 0;">AES-256 Encrypted &middot; Zero-Knowledge &middot; 2FA Protected</p>
<p style="margin:0;">CarryOn &mdash; Every American Family. Ready.</p>
</td></tr>
</table>

</td></tr>
</table>
</td></tr>
</table>
</body></html>"""


def _dormant_email_html(name: str, settings_url: str) -> str:
    """Build the dormant account notification email."""
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0b1120;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1120;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:#0f1d35;border-radius:16px;border:1px solid #1e293b;">
<tr><td style="padding:40px;">

<p style="text-align:center;margin:0 0 24px 0;"><span style="font-size:24px;font-weight:bold;color:#d4af37;">CarryOn</span></p>

<h1 style="color:#f8fafc;font-size:20px;margin:0 0 16px 0;">Your Account Is Now Dormant</h1>

<p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
Hi {name},
</p>

<p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
Your 30-day grace period has expired. Your CarryOn account is now in a dormant state. Here's what this means:
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
<tr><td style="padding:16px;background-color:rgba(240,82,82,0.08);border:1px solid rgba(240,82,82,0.25);border-radius:12px;">
<p style="color:#F05252;font-size:14px;font-weight:bold;margin:0 0 8px 0;">Restricted:</p>
<p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0;">
&bull; No new uploads or edits<br/>
&bull; DTS services suspended<br/>
&bull; Beneficiary transitions paused<br/>
&bull; CarryOn execution guarantees suspended
</p>
</td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
<tr><td style="padding:16px;background-color:rgba(34,201,147,0.08);border:1px solid rgba(34,201,147,0.25);border-radius:12px;">
<p style="color:#22C993;font-size:14px;font-weight:bold;margin:0 0 8px 0;">Still accessible:</p>
<p style="color:#94a3b8;font-size:14px;line-height:1.8;margin:0;">
&bull; All your existing data (read-only)<br/>
&bull; Beneficiary access to POA and Living Will documents
</p>
</td></tr>
</table>

<p style="color:#f8fafc;font-size:16px;font-weight:bold;line-height:1.6;margin:16px 0;">
Restore full access instantly by updating your payment method:
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
<tr><td align="center">
<a href="{settings_url}" style="display:inline-block;background-color:#d4af37;color:#0b1120;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:10px;text-decoration:none;">Reactivate My Account</a>
</td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;padding-top:24px;border-top:1px solid #1e293b;">
<tr><td style="text-align:center;color:#64748b;font-size:12px;">
<p style="margin:0 0 4px 0;">Your data is safe and encrypted. We'll keep it secure until you're ready to return.</p>
<p style="margin:0;">CarryOn &mdash; Every American Family. Ready.</p>
</td></tr>
</table>

</td></tr>
</table>
</td></tr>
</table>
</body></html>"""


def _reactivation_email_html(name: str, plan_name: str) -> str:
    """Build the reactivation confirmation email."""
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0b1120;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1120;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:#0f1d35;border-radius:16px;border:1px solid #1e293b;">
<tr><td style="padding:40px;">

<p style="text-align:center;margin:0 0 24px 0;"><span style="font-size:24px;font-weight:bold;color:#d4af37;">CarryOn</span></p>

<h1 style="color:#22C993;font-size:20px;margin:0 0 16px 0;">Your Account Has Been Reactivated!</h1>

<p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
Hi {name},
</p>

<p style="color:#94a3b8;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
Great news! Your payment has been received and your <strong style="color:#d4af37;">{plan_name}</strong> plan is fully active again. All features have been restored:
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
<tr><td style="padding:16px;background-color:rgba(34,201,147,0.08);border:1px solid rgba(34,201,147,0.25);border-radius:12px;">
<p style="color:#22C993;font-size:14px;line-height:1.8;margin:0;">
&#10003; Uploads and edits restored<br/>
&#10003; DTS services active<br/>
&#10003; Beneficiary transitions enabled<br/>
&#10003; Full CarryOn execution guarantees
</p>
</td></tr>
</table>

<p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:16px 0 0 0;">
Thank you for continuing to protect what matters most.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;padding-top:24px;border-top:1px solid #1e293b;">
<tr><td style="text-align:center;color:#64748b;font-size:12px;">
<p style="margin:0;">CarryOn &mdash; Every American Family. Ready.</p>
</td></tr>
</table>

</td></tr>
</table>
</td></tr>
</table>
</body></html>"""


async def handle_payment_failed(user_id: str):
    """Called when Stripe reports a payment failure. Starts grace period."""
    now = datetime.now(timezone.utc)
    grace_end = now + timedelta(days=GRACE_PERIOD_DAYS)

    sub = await db.user_subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    if not sub:
        return

    # Already in grace or dormant — don't reset
    if sub.get("status") in ("past_due", "dormant"):
        return

    await db.user_subscriptions.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "status": "past_due",
                "grace_period_start": now.isoformat(),
                "grace_period_end": grace_end.isoformat(),
                "payment_failed_at": now.isoformat(),
            }
        },
    )

    # Notify admins
    from services.notifications import notify

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1})
    user_name = user.get("name", user.get("email", "Unknown")) if user else "Unknown"
    asyncio.create_task(
        notify.founder(
            "Payment Failed — Grace Period Started",
            f"{user_name}'s payment failed. 30-day grace period started.",
            url="/admin",
        )
    )

    # Send first grace period email
    if user and user.get("email"):
        from services.email import send_email

        settings_url = "https://www.carryon.us/settings"
        name = user.get("name", "").split()[0] if user.get("name") else "there"
        await send_email(
            to=user["email"],
            subject="Action Required: Update Your CarryOn Payment Method",
            html=_grace_email_html(name, GRACE_PERIOD_DAYS, settings_url),
        )

    logger.info(f"Grace period started for user {user_id}, ends {grace_end.isoformat()}")


async def handle_payment_succeeded(user_id: str):
    """Called when payment succeeds. Reactivates account if in grace/dormant."""
    sub = await db.user_subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    if not sub:
        return

    was_dormant = sub.get("status") == "dormant"
    was_past_due = sub.get("status") == "past_due"

    if not (was_dormant or was_past_due):
        return

    now = datetime.now(timezone.utc)
    cycle = sub.get("billing_cycle", "monthly")
    if cycle == "annual":
        period_end = now + timedelta(days=365)
    elif cycle == "quarterly":
        period_end = now + timedelta(days=90)
    else:
        period_end = now + timedelta(days=30)

    await db.user_subscriptions.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "status": "active",
                "current_period_start": now.isoformat(),
                "current_period_end": period_end.isoformat(),
                "reactivated_at": now.isoformat(),
            },
            "$unset": {
                "grace_period_start": "",
                "grace_period_end": "",
                "payment_failed_at": "",
                "dormant_since": "",
            },
        },
    )

    # Send reactivation email
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1})
    if user and user.get("email"):
        from services.email import send_email

        name = user.get("name", "").split()[0] if user.get("name") else "there"
        plan_name = sub.get("plan_name", "CarryOn")
        await send_email(
            to=user["email"],
            subject="Your CarryOn Account Has Been Reactivated!",
            html=_reactivation_email_html(name, plan_name),
        )

    # Notify admins
    from services.notifications import notify

    user_name = user.get("name", user.get("email", "Unknown")) if user else "Unknown"
    status_was = "dormant" if was_dormant else "grace period"
    asyncio.create_task(
        notify.founder(
            "Account Reactivated",
            f"{user_name}'s account reactivated from {status_was}. Payment received.",
            url="/admin",
        )
    )

    logger.info(f"Account reactivated for user {user_id} (was {status_was})")


async def billing_lifecycle_scheduler():
    """Runs daily. Sends grace period reminders and transitions to dormant."""
    while True:
        try:
            await asyncio.sleep(60)  # Initial delay
            await _run_billing_lifecycle_check()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Billing lifecycle error: {e}")

        # Sleep until next day (run once per day)
        await asyncio.sleep(86400)


async def _run_billing_lifecycle_check():
    """Core lifecycle logic — called once per day."""
    now = datetime.now(timezone.utc)
    settings_url = "https://www.carryon.us/settings"

    # 1. Check for subscriptions past their period end that are still 'active'
    #    (Stripe webhook may not have fired, or using Apple IAP)
    active_expired = await db.user_subscriptions.find(
        {"status": "active", "current_period_end": {"$exists": True}},
        {"_id": 0},
    ).to_list(500)

    for sub in active_expired:
        try:
            period_end = datetime.fromisoformat(sub["current_period_end"].replace("Z", "+00:00"))
            if period_end.tzinfo is None:
                period_end = period_end.replace(tzinfo=timezone.utc)
            if now > period_end:
                # Skip beta/free plans
                if sub.get("beta_plan") or sub.get("free_plan"):
                    continue
                await handle_payment_failed(sub["user_id"])
        except (ValueError, KeyError):
            continue

    # 2. Send daily reminders for accounts in grace period
    past_due_subs = await db.user_subscriptions.find(
        {"status": "past_due", "grace_period_end": {"$exists": True}},
        {"_id": 0},
    ).to_list(500)

    for sub in past_due_subs:
        try:
            grace_end = datetime.fromisoformat(sub["grace_period_end"].replace("Z", "+00:00"))
            if grace_end.tzinfo is None:
                grace_end = grace_end.replace(tzinfo=timezone.utc)

            days_remaining = max(0, (grace_end - now).days)

            if days_remaining <= 0:
                # Grace period expired → transition to dormant
                await db.user_subscriptions.update_one(
                    {"user_id": sub["user_id"]},
                    {"$set": {"status": "dormant", "dormant_since": now.isoformat()}},
                )

                # Send dormant notification
                user = await db.users.find_one({"id": sub["user_id"]}, {"_id": 0, "name": 1, "email": 1})
                if user and user.get("email"):
                    from services.email import send_email

                    name = user.get("name", "").split()[0] if user.get("name") else "there"
                    await send_email(
                        to=user["email"],
                        subject="Your CarryOn Account Is Now Dormant",
                        html=_dormant_email_html(name, settings_url),
                    )

                # Notify admins
                from services.notifications import notify

                user_name = user.get("name", user.get("email", "Unknown")) if user else "Unknown"
                asyncio.create_task(
                    notify.founder(
                        "Account Went Dormant",
                        f"{user_name}'s account is now dormant after 30-day grace period.",
                        url="/admin",
                    )
                )
                logger.info(f"Account {sub['user_id']} transitioned to dormant")
            else:
                # Send daily reminder email
                user = await db.users.find_one({"id": sub["user_id"]}, {"_id": 0, "name": 1, "email": 1})
                if user and user.get("email"):
                    from services.email import send_email

                    name = user.get("name", "").split()[0] if user.get("name") else "there"
                    await send_email(
                        to=user["email"],
                        subject=f"CarryOn: {days_remaining} day{'s' if days_remaining != 1 else ''} to update your payment",
                        html=_grace_email_html(name, days_remaining, settings_url),
                    )

        except (ValueError, KeyError) as e:
            logger.warning(f"Billing lifecycle skip for {sub.get('user_id')}: {e}")

    processed = len(active_expired) + len(past_due_subs)
    if processed:
        logger.info(f"Billing lifecycle check complete: {processed} subscriptions reviewed")
