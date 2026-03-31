"""CarryOn™ Backend — Background Schedulers
Periodic tasks: weekly digest, trial reminders, DOB-based subscription events.
"""

import asyncio

from config import logger


async def weekly_digest_scheduler():
    """Send weekly digest every Monday at 8 AM EST."""
    from datetime import datetime, timedelta, timezone

    from routes.admin_digest import send_admin_analytics_digest
    from routes.digest import run_weekly_digest

    while True:
        now = datetime.now(timezone.utc)
        days_until_monday = (7 - now.weekday()) % 7
        if days_until_monday == 0 and now.hour >= 13:
            days_until_monday = 7
        next_monday = now.replace(hour=13, minute=0, second=0, microsecond=0) + timedelta(days=days_until_monday)
        wait_seconds = (next_monday - now).total_seconds()
        logger.info(f"Weekly digest scheduled for {next_monday.isoformat()} ({wait_seconds / 3600:.1f}h away)")
        await asyncio.sleep(max(60, wait_seconds))

        try:
            result = await run_weekly_digest("https://carryon.us/dashboard")
            logger.info(f"Weekly digest sent: {result}")
        except Exception as e:
            logger.error(f"Weekly digest failed: {e}")

        try:
            admin_result = await send_admin_analytics_digest()
            logger.info(f"Admin analytics digest sent: {admin_result}")
        except Exception as e:
            logger.error(f"Admin analytics digest failed: {e}")

        try:
            from routes.admin_digest import send_audit_digest

            audit_result = await send_audit_digest()
            logger.info(f"SOC 2 audit digest sent: {audit_result}")
        except Exception as e:
            logger.error(f"SOC 2 audit digest failed: {e}")


async def daily_dob_check_scheduler():
    """Run DOB-based subscription event checks once daily."""
    await asyncio.sleep(300)  # Wait 5 min after startup
    while True:
        try:
            from routes.subscriptions import check_dob_subscription_events

            count = await check_dob_subscription_events()
            if count > 0:
                logger.info(f"DOB lifecycle check: {count} events triggered")
        except Exception as e:
            logger.error(f"DOB lifecycle check failed: {e}")
        await asyncio.sleep(86400)  # Run daily


async def data_retention_scheduler():
    """SOC 2 A1.2: Clean up stale sessions, expired tokens, and old failed logins daily."""
    await asyncio.sleep(600)  # Wait 10 min after startup
    while True:
        try:
            from datetime import datetime, timedelta, timezone

            from config import db as _db

            now = datetime.now(timezone.utc)

            # Purge expired OTP trust records
            result = await _db.otp_trust.delete_many({"expires_at": {"$lt": now.isoformat()}})
            purged_trust = result.deleted_count

            # Purge failed logins older than 7 days
            week_ago = (now - timedelta(days=7)).isoformat()
            result = await _db.failed_logins.delete_many({"timestamp": {"$lt": week_ago}})
            purged_failures = result.deleted_count

            # Purge stale OTP codes older than 1 hour
            hour_ago = (now - timedelta(hours=1)).isoformat()
            result = await _db.otp_codes.delete_many({"created_at": {"$lt": hour_ago}})
            purged_otps = result.deleted_count

            # Purge expired token blacklist entries older than 30 days
            month_ago = (now - timedelta(days=30)).isoformat()
            result = await _db.token_blacklist.delete_many({"revoked_at": {"$lt": month_ago}})
            purged_tokens = result.deleted_count

            total = purged_trust + purged_failures + purged_otps + purged_tokens
            if total > 0:
                logger.info(
                    f"Data retention cleanup: {purged_trust} trust, {purged_failures} failures, "
                    f"{purged_otps} OTPs, {purged_tokens} blacklisted tokens purged"
                )
        except Exception as e:
            logger.error(f"Data retention cleanup failed: {e}")
        await asyncio.sleep(86400)  # Run daily


async def milestone_delivery_scheduler():
    """Check for scheduled milestone deliveries daily at 9 AM EST (14:00 UTC)."""
    from datetime import datetime, timezone

    from config import db
    from services.notifications import notify

    while True:
        now = datetime.now(timezone.utc)
        # Target 14:00 UTC (9 AM EST)
        target_hour = 14
        if now.hour >= target_hour:
            wait_hours = 24 - (now.hour - target_hour)
        else:
            wait_hours = target_hour - now.hour
        wait_seconds = wait_hours * 3600 - now.minute * 60 - now.second
        logger.info(f"Milestone delivery scheduler: next check in {wait_seconds / 3600:.1f}h")
        await asyncio.sleep(max(60, wait_seconds))

        try:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            scheduled = await db.milestone_deliveries.find(
                {"status": "scheduled", "scheduled_date": {"$lte": today}},
                {"_id": 0},
            ).to_list(500)

            delivered = 0
            delivery_time = datetime.now(timezone.utc)

            for delivery in scheduled:
                await db.messages.update_one(
                    {"id": delivery["message_id"]},
                    {
                        "$set": {
                            "is_delivered": True,
                            "delivered_at": delivery_time.isoformat(),
                            "delivered_via": "scheduled_milestone",
                            "milestone_report_id": delivery["milestone_report_id"],
                            "delivered_by": delivery.get("reviewed_by", "system"),
                        }
                    },
                )
                await db.milestone_deliveries.update_one(
                    {"id": delivery["id"]},
                    {"$set": {"status": "approved", "delivered_at": delivery_time.isoformat()}},
                )
                try:
                    await notify.beneficiary(
                        delivery["beneficiary_id"],
                        "New Milestone Message Unlocked",
                        f"A milestone message '{delivery.get('message_title', 'Message')}' has been delivered to you.",
                        url="/beneficiary/messages",
                        priority="high",
                        metadata={"message_id": delivery["message_id"]},
                    )
                except Exception:
                    pass
                delivered += 1

            if delivered:
                logger.info(f"Milestone scheduler: delivered {delivered} scheduled message(s)")
        except Exception as e:
            logger.error(f"Milestone delivery scheduler failed: {e}")
