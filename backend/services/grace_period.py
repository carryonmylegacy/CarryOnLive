"""CarryOn™ — Grace Period Management Service

Manages 90-day data retention grace periods after subscription expiration.

Rules:
- Benefactor sub expires → 90 days to download, then eligible for purge
- Hospice user estate transitions → 90 days from transition date
- Transitioned estate with expired sub → auto-pause until staff confirms
- Admin can place a "hold" to pause the grace period indefinitely
- Re-subscription within 90 days cancels the grace period
- Countdown emails at: 90, 60, 30, 15, 10, 5, 4, 3, 2, 1 days remaining
- Purge keeps metadata records but removes file content
- Milestone Messages are NEVER purged (only eligibility to report new milestones is revoked)
"""

import uuid
from datetime import datetime, timezone, timedelta

from config import db, logger
from services.email import send_email
from services.audit import log_audit_event

COUNTDOWN_DAYS = [90, 60, 30, 15, 10, 5, 4, 3, 2, 1]


async def create_grace_period(
    estate_id: str,
    user_id: str,
    trigger: str,
    is_transitioned: bool = False,
):
    """Create a grace period for an estate/user.

    trigger: "subscription_expired", "trial_ended", "transition_hospice"
    """
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=90)

    # Auto-pause for transitioned estates until staff confirms
    auto_paused = is_transitioned and trigger == "subscription_expired"

    # Gather ALL emails associated with the estate
    all_emails = await _gather_estate_emails(estate_id, user_id)

    # Check if a grace period already exists for this estate+user
    existing = await db.grace_periods.find_one(
        {"estate_id": estate_id, "user_id": user_id, "status": {"$in": ["active", "paused"]}},
        {"_id": 0},
    )
    if existing:
        logger.info(f"Grace period already exists for estate {estate_id} user {user_id}")
        return existing

    grace = {
        "id": str(uuid.uuid4()),
        "estate_id": estate_id,
        "user_id": user_id,
        "trigger": trigger,
        "started_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "status": "paused" if auto_paused else "active",
        "paused_by": "system" if auto_paused else None,
        "paused_reason": "Auto-paused: transitioned estate with expired subscription — awaiting staff confirmation"
        if auto_paused
        else None,
        "hold_active": False,
        "notifications_sent": [],
        "all_emails": all_emails,
        "is_transitioned_estate": is_transitioned,
        "created_at": now.isoformat(),
    }
    await db.grace_periods.insert_one(grace)
    grace.pop("_id", None)

    # Audit
    await log_audit_event(
        actor_id="system",
        actor_email="system@carryon.us",
        actor_role="system",
        action="grace_period_created",
        category="subscription",
        resource_type="grace_period",
        resource_id=grace["id"],
        details={
            "estate_id": estate_id,
            "user_id": user_id,
            "trigger": trigger,
            "expires_at": expires_at.isoformat(),
            "auto_paused": auto_paused,
        },
        severity="info",
    )

    # Notify staff if auto-paused
    if auto_paused:
        from services.notifications import notify

        await notify.p2_alert(
            "Grace Period Auto-Paused — Transitioned Estate",
            f"A subscription expired for a transitioned estate. "
            f"Grace period auto-paused until staff confirms. "
            f"Estate: {estate_id}, User: {user_id}",
            url="/ops/grace-periods",
            metadata={"grace_period_id": grace["id"], "estate_id": estate_id},
        )

    # Send first countdown email (90 days)
    await _send_countdown_email(grace, 90)

    logger.info(f"Grace period created: estate={estate_id} user={user_id} trigger={trigger} auto_paused={auto_paused}")
    return grace


async def cancel_grace_period(estate_id: str, user_id: str, reason: str = "re-subscribed"):
    """Cancel grace period when user re-subscribes."""
    result = await db.grace_periods.update_many(
        {"estate_id": estate_id, "user_id": user_id, "status": {"$in": ["active", "paused"]}},
        {
            "$set": {
                "status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
                "cancel_reason": reason,
            }
        },
    )
    if result.modified_count > 0:
        logger.info(f"Grace period cancelled for estate={estate_id} user={user_id} reason={reason}")

        await log_audit_event(
            actor_id=user_id,
            actor_email="",
            actor_role="benefactor",
            action="grace_period_cancelled",
            category="subscription",
            resource_type="grace_period",
            resource_id=estate_id,
            details={"reason": reason},
            severity="info",
        )
    return result.modified_count


async def toggle_hold(grace_period_id: str, hold_active: bool, staff_user: dict, reason: str = ""):
    """Admin/ops can place or remove a hold on a grace period."""
    now = datetime.now(timezone.utc)
    update = {
        "hold_active": hold_active,
        "hold_toggled_by": staff_user["id"],
        "hold_toggled_by_name": staff_user.get("name", ""),
        "hold_toggled_at": now.isoformat(),
    }
    if hold_active:
        update["status"] = "paused"
        update["paused_by"] = staff_user["id"]
        update["paused_reason"] = reason or "Admin hold placed"
    else:
        update["status"] = "active"

    await db.grace_periods.update_one({"id": grace_period_id}, {"$set": update})

    await log_audit_event(
        actor_id=staff_user["id"],
        actor_email=staff_user.get("email", ""),
        actor_role=staff_user.get("role", ""),
        action="grace_period_hold_toggled",
        category="subscription",
        resource_type="grace_period",
        resource_id=grace_period_id,
        details={"hold_active": hold_active, "reason": reason},
        severity="info",
    )
    return True


async def confirm_transitioned_grace_period(grace_period_id: str, staff_user: dict):
    """Staff confirms auto-paused grace period for transitioned estate — starts the 90-day clock."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=90)

    await db.grace_periods.update_one(
        {"id": grace_period_id},
        {
            "$set": {
                "status": "active",
                "started_at": now.isoformat(),
                "expires_at": expires_at.isoformat(),
                "paused_by": None,
                "paused_reason": None,
                "confirmed_by": staff_user["id"],
                "confirmed_by_name": staff_user.get("name", ""),
                "confirmed_at": now.isoformat(),
            }
        },
    )

    await log_audit_event(
        actor_id=staff_user["id"],
        actor_email=staff_user.get("email", ""),
        actor_role=staff_user.get("role", ""),
        action="grace_period_confirmed",
        category="subscription",
        resource_type="grace_period",
        resource_id=grace_period_id,
        details={"new_expires_at": expires_at.isoformat()},
        severity="info",
    )
    return True


async def process_countdown_emails():
    """Called daily by scheduler. Sends countdown emails for active grace periods."""
    now = datetime.now(timezone.utc)

    active_periods = await db.grace_periods.find(
        {"status": "active", "hold_active": False},
        {"_id": 0},
    ).to_list(1000)

    for gp in active_periods:
        try:
            expires = datetime.fromisoformat(gp["expires_at"].replace("Z", "+00:00"))
            days_remaining = (expires - now).days

            already_sent = {n["day"] for n in gp.get("notifications_sent", [])}

            for day in COUNTDOWN_DAYS:
                if days_remaining <= day and day not in already_sent:
                    await _send_countdown_email(gp, day)
                    await db.grace_periods.update_one(
                        {"id": gp["id"]},
                        {
                            "$push": {
                                "notifications_sent": {
                                    "day": day,
                                    "sent_at": now.isoformat(),
                                }
                            }
                        },
                    )
                    break  # Only send one email per day per grace period
        except Exception as e:
            logger.error(f"Grace period countdown error for {gp['id']}: {e}")

    return len(active_periods)


async def get_purge_eligible():
    """Get grace periods that have expired and are eligible for purge."""
    now = datetime.now(timezone.utc)

    return await db.grace_periods.find(
        {
            "status": "active",
            "hold_active": False,
            "expires_at": {"$lt": now.isoformat()},
        },
        {"_id": 0},
    ).to_list(500)


async def execute_purge(grace_period_id: str, staff_id: str = "system"):
    """Purge file content for an expired grace period.

    - Removes file content (S3 objects) but keeps metadata records
    - Does NOT purge Milestone Messages
    - Logs every purged file for audit
    """
    gp = await db.grace_periods.find_one({"id": grace_period_id}, {"_id": 0})
    if not gp:
        return 0

    estate_id = gp["estate_id"]
    now = datetime.now(timezone.utc)
    purged_count = 0

    # Get all documents in the estate (NOT milestone messages)
    documents = await db.documents.find(
        {"estate_id": estate_id},
        {"_id": 0, "id": 1, "name": 1, "file_size": 1, "created_at": 1, "s3_key": 1},
    ).to_list(1000)

    for doc in documents:
        # Create purge record (metadata preserved)
        purge_record = {
            "id": str(uuid.uuid4()),
            "grace_period_id": grace_period_id,
            "estate_id": estate_id,
            "user_id": gp["user_id"],
            "resource_type": "document",
            "resource_id": doc["id"],
            "original_filename": doc.get("name", ""),
            "file_size": doc.get("file_size", 0),
            "uploaded_at": doc.get("created_at", ""),
            "purged_at": now.isoformat(),
            "purged_by": staff_id,
        }
        await db.purge_records.insert_one(purge_record)

        # Remove file content from S3 (if applicable)
        s3_key = doc.get("s3_key")
        if s3_key:
            try:
                from services.storage import storage

                await storage.delete(s3_key)
            except Exception as e:
                logger.error(f"S3 delete failed for {s3_key}: {e}")

        # Remove encrypted content from document record but keep metadata
        await db.documents.update_one(
            {"id": doc["id"]},
            {
                "$set": {
                    "purged": True,
                    "purged_at": now.isoformat(),
                    "file_data": None,
                    "s3_key": None,
                },
            },
        )
        purged_count += 1

    # Mark grace period as completed
    await db.grace_periods.update_one(
        {"id": grace_period_id},
        {
            "$set": {
                "status": "completed",
                "completed_at": now.isoformat(),
                "purged_count": purged_count,
            }
        },
    )

    await log_audit_event(
        actor_id=staff_id,
        actor_email="system@carryon.us",
        actor_role="system",
        action="grace_period_purge_executed",
        category="subscription",
        resource_type="grace_period",
        resource_id=grace_period_id,
        details={
            "estate_id": estate_id,
            "purged_files": purged_count,
        },
        severity="critical",
    )

    logger.info(f"Purge completed: grace_period={grace_period_id} estate={estate_id} files={purged_count}")
    return purged_count


async def _gather_estate_emails(estate_id: str, user_id: str):
    """Gather ALL emails associated with an estate for notifications."""
    emails = set()

    # Benefactor email
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
    if user and user.get("email"):
        emails.add(user["email"])

    # Estate owner email (might differ from user_id in beneficiary cases)
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "owner_id": 1})
    if estate:
        owner = await db.users.find_one({"id": estate["owner_id"]}, {"_id": 0, "email": 1})
        if owner and owner.get("email"):
            emails.add(owner["email"])

    # All beneficiary emails
    beneficiaries = await db.beneficiaries.find(
        {"estate_id": estate_id},
        {"_id": 0, "email": 1, "user_id": 1},
    ).to_list(100)
    for b in beneficiaries:
        if b.get("email"):
            emails.add(b["email"])
        if b.get("user_id"):
            ben_user = await db.users.find_one({"id": b["user_id"]}, {"_id": 0, "email": 1})
            if ben_user and ben_user.get("email"):
                emails.add(ben_user["email"])

    # FFN contacts
    ffn_contacts = await db.ffn_contacts.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0, "email": 1},
    ).to_list(100)
    for c in ffn_contacts:
        if c.get("email"):
            emails.add(c["email"])

    return list(emails)


async def _send_countdown_email(grace_period: dict, days_remaining: int):
    """Send a grace period countdown email to all associated emails."""
    urgency = "URGENT" if days_remaining <= 5 else "IMPORTANT" if days_remaining <= 15 else "NOTICE"

    subject = f"[{urgency}] CarryOn™ — {days_remaining} Day{'s' if days_remaining != 1 else ''} Until Data Removal"

    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0F1629; color: #E2E8F0; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://carryon.us/carryon-logo.png" alt="CarryOn" style="height: 40px;" />
        </div>

        <h2 style="color: {"#EF4444" if days_remaining <= 5 else "#F59E0B" if days_remaining <= 15 else "#D4AF37"}; text-align: center; margin-bottom: 16px;">
            {days_remaining} Day{"s" if days_remaining != 1 else ""} Remaining
        </h2>

        <p style="color: #94A3B8; line-height: 1.6;">
            This is a reminder that the data associated with your CarryOn estate will be permanently
            removed in <strong style="color: #E2E8F0;">{days_remaining} day{"s" if days_remaining != 1 else ""}</strong>
            due to an expired subscription.
        </p>

        <div style="background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.2); border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #D4AF37; font-weight: bold; margin: 0 0 8px 0;">What you should do:</p>
            <ul style="color: #94A3B8; margin: 0; padding-left: 20px; line-height: 1.8;">
                <li>Download any documents from your Secure Document Vault</li>
                <li>Save any Milestone Messages you want to keep</li>
                <li>Download any Estate Guardian AI reports</li>
                <li>Or <a href="https://carryon.us/login" style="color: #D4AF37;">renew your subscription</a> to retain full access</li>
            </ul>
        </div>

        <p style="color: #94A3B8; line-height: 1.6;">
            After the grace period expires, file content will be permanently removed. A record that
            these files existed will be retained for audit purposes. <strong style="color: #E2E8F0;">Milestone
            Messages that have already been delivered will remain accessible forever.</strong>
        </p>

        <div style="text-align: center; margin-top: 24px;">
            <a href="https://carryon.us/login" style="background: #D4AF37; color: #0F1629; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                Log In & Download Your Data
            </a>
        </div>

        <p style="color: #4A5568; font-size: 12px; text-align: center; margin-top: 24px;">
            CarryOn™ Estate Readiness Platform — carryon.us
        </p>
    </div>
    """

    sent_count = 0
    for email in grace_period.get("all_emails", []):
        try:
            success = await send_email(email, subject, html)
            if success:
                sent_count += 1
        except Exception as e:
            logger.error(f"Countdown email failed for {email}: {e}")

    logger.info(
        f"Countdown email ({days_remaining}d) sent to {sent_count}/{len(grace_period.get('all_emails', []))} recipients"
    )
    return sent_count
