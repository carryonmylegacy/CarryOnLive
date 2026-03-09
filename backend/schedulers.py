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
        next_monday = now.replace(
            hour=13, minute=0, second=0, microsecond=0
        ) + timedelta(days=days_until_monday)
        wait_seconds = (next_monday - now).total_seconds()
        logger.info(
            f"Weekly digest scheduled for {next_monday.isoformat()} ({wait_seconds / 3600:.1f}h away)"
        )
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
