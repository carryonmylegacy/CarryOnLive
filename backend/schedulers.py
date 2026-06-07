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

        try:
            from routes.share_cards import send_voices_digest

            voices_result = await send_voices_digest()
            logger.info(f"Voices digest sent: {voices_result}")
        except Exception as e:
            logger.error(f"Voices digest failed: {e}")

        try:
            from routes.share_cards import send_voices_social_brief

            social_result = await send_voices_social_brief()
            logger.info(f"Voices social brief sent: {social_result}")
        except Exception as e:
            logger.error(f"Voices social brief failed: {e}")


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

            # Token blacklist: the TTL index on `expires_at` auto-reaps expired
            # rows. Additionally purge any legacy raw-token rows (pre hash-only
            # schema) as a one-shot migration. (audit #5391e8b #4)
            from services.token_blacklist import purge_legacy_raw_token_rows

            purged_tokens = await purge_legacy_raw_token_rows()

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
    from services.access_control import build_message_delivery_update, resolve_beneficiary_delivery_ids
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
                message = await db.messages.find_one({"id": delivery["message_id"]}, {"_id": 0})
                if not message:
                    continue
                delivery_ids = await resolve_beneficiary_delivery_ids(
                    delivery["estate_id"], delivery.get("beneficiary_id")
                )
                await db.messages.update_one(
                    {"id": delivery["message_id"]},
                    build_message_delivery_update(
                        message,
                        delivery_ids,
                        delivered_at=delivery_time.isoformat(),
                        delivered_via="scheduled_milestone",
                        milestone_report_id=delivery["milestone_report_id"],
                        delivered_by=delivery.get("reviewed_by", "system"),
                    ),
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


async def grace_period_scheduler():
    """Daily check: send countdown emails and auto-purge expired grace periods."""
    from datetime import datetime, timezone

    from services.grace_period import process_countdown_emails, get_purge_eligible, execute_purge

    while True:
        # Run daily at 10 AM EST (15:00 UTC)
        now = datetime.now(timezone.utc)
        target_hour = 15
        if now.hour >= target_hour:
            wait_hours = 24 - (now.hour - target_hour)
        else:
            wait_hours = target_hour - now.hour
        wait_seconds = wait_hours * 3600 - now.minute * 60 - now.second
        logger.info(f"Grace period scheduler: next check in {wait_seconds / 3600:.1f}h")
        await asyncio.sleep(max(60, wait_seconds))

        try:
            # Send countdown emails
            processed = await process_countdown_emails()
            logger.info(f"Grace period scheduler: checked {processed} active grace period(s)")

            # Auto-purge expired grace periods (no hold)
            eligible = await get_purge_eligible()
            for gp in eligible:
                try:
                    purged = await execute_purge(gp["id"])
                    logger.info(f"Grace period auto-purge: {gp['id']} — {purged} files purged")
                except Exception as e:
                    logger.error(f"Grace period auto-purge failed for {gp['id']}: {e}")

        except Exception as e:
            logger.error(f"Grace period scheduler failed: {e}")


async def bill_reminder_scheduler():
    """Daily check: send bill due-date reminders to beneficiaries of transitioned estates."""
    import calendar as cal_mod
    from datetime import datetime, timezone

    from config import db
    from services.notifications import notify

    await asyncio.sleep(900)  # Wait 15 min after startup
    while True:
        # Target 14:00 UTC (9 AM EST)
        now = datetime.now(timezone.utc)
        target_hour = 14
        if now.hour >= target_hour:
            wait_hours = 24 - (now.hour - target_hour)
        else:
            wait_hours = target_hour - now.hour
        wait_seconds = wait_hours * 3600 - now.minute * 60 - now.second
        logger.info(f"Bill reminder scheduler: next check in {wait_seconds / 3600:.1f}h")
        await asyncio.sleep(max(60, wait_seconds))

        try:
            today = datetime.now(timezone.utc)
            day_of_month = today.day
            _, days_in_month = cal_mod.monthrange(today.year, today.month)

            # Find all transitioned estates
            transitioned = await db.estates.find(
                {"status": "transitioned"},
                {"_id": 0, "id": 1, "name": 1, "beneficiaries": 1},
            ).to_list(1000)

            total_sent = 0
            for estate in transitioned:
                estate_id = estate["id"]
                bills = await db.bills.find(
                    {"estate_id": estate_id, "deleted_at": None, "status": "active"},
                    {"_id": 0},
                ).to_list(500)

                for bill in bills:
                    due_day = bill.get("due_day")
                    if not due_day:
                        continue
                    effective_due = min(due_day, days_in_month)
                    days_until = effective_due - day_of_month
                    if days_until < 0:
                        # Next month
                        next_mo = today.month + 1 if today.month < 12 else 1
                        next_yr = today.year if today.month < 12 else today.year + 1
                        _, next_days = cal_mod.monthrange(next_yr, next_mo)
                        days_until = min(due_day, next_days) + days_in_month - day_of_month

                    reminder_days = bill.get("reminder_days", [10, 7, 5, 1])
                    if days_until not in reminder_days and days_until != 0:
                        continue

                    # Build notification
                    bill_name = bill.get("name", "Bill")
                    amount = bill.get("amount")
                    is_auto = bill.get("is_auto_pay", False)
                    amt_str = f" (${amount:,.2f})" if amount else ""

                    if days_until == 0:
                        title = f"TODAY: {bill_name} is due"
                        body = f"{bill_name}{amt_str} is due today."
                        priority = "critical"
                    elif days_until == 1:
                        title = f"TOMORROW: {bill_name}{amt_str}"
                        body = f"{bill_name} is due tomorrow."
                        priority = "critical"
                    elif days_until <= 3:
                        title = f"Due in {days_until} days: {bill_name}"
                        body = f"{bill_name}{amt_str} is due in {days_until} days."
                        priority = "high"
                    else:
                        title = f"Reminder: {bill_name} due in {days_until} days"
                        body = f"{bill_name}{amt_str} is due in {days_until} days."
                        priority = "normal"

                    if is_auto:
                        payment_acct = bill.get("payment_account", "linked account")
                        body += f" Auto-Pay active — verify funds in {payment_acct}."
                    else:
                        portal = bill.get("biller_website")
                        if portal:
                            body += f" Pay at: {portal}"

                    notes = bill.get("notes")
                    if notes:
                        body += f" Note: {notes[:80]}"

                    # Find designated beneficiaries. Fail-closed: an undesignated
                    # bill notifies NOBODY (financial items are private until the
                    # benefactor explicitly decrees who may see them).
                    designated = bill.get("designated_beneficiaries") or []
                    ben_user_ids = []
                    if "all" in designated:
                        # All beneficiaries of this estate
                        all_bens = await db.beneficiaries.find(
                            {"estate_id": estate_id, "user_id": {"$ne": None}},
                            {"_id": 0, "user_id": 1, "id": 1},
                        ).to_list(100)
                        ben_user_ids = [b["user_id"] for b in all_bens if b.get("user_id")]
                    else:
                        specific_bens = await db.beneficiaries.find(
                            {"estate_id": estate_id, "id": {"$in": designated}, "user_id": {"$ne": None}},
                            {"_id": 0, "user_id": 1, "id": 1},
                        ).to_list(100)
                        for b in specific_bens:
                            # Check post-transition timing
                            timing = bill.get("visibility_timing", {}).get(b["id"], {"pre": False, "post": True})
                            if timing.get("post", True):
                                ben_user_ids.append(b["user_id"])

                    for uid in ben_user_ids:
                        try:
                            await notify.beneficiary(
                                uid,
                                title,
                                body,
                                url="/beneficiary/financial",
                                priority=priority,
                                metadata={"bill_id": bill["id"], "estate_id": estate_id},
                            )
                            total_sent += 1
                        except Exception:
                            pass

            if total_sent > 0:
                logger.info(f"Bill reminder scheduler: sent {total_sent} notification(s)")
        except Exception as e:
            logger.error(f"Bill reminder scheduler failed: {e}")
