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
