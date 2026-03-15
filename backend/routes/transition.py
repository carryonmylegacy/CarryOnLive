"""CarryOn™ Backend — Estate Transition Routes"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from config import db
from models import DeathCertificate, MilestoneReport, MilestoneReportCreate
from services.audit import get_client_ip, log_audit_event
from services.encryption import encrypt_aes256, get_estate_salt
from utils import get_current_user

router = APIRouter()

# ===================== ESTATE TRANSITION ROUTES =====================


@router.post("/transition/upload-certificate")
async def upload_death_certificate(
    estate_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a death certificate for verification — encrypted with AES-256-GCM."""

    # Enforce subscription: the estate's benefactor must have an active subscription
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if estate:
        benefactor = await db.users.find_one({"id": estate.get("owner_id")}, {"_id": 0})
        if benefactor:
            from guards import get_subscription_access

            access = await get_subscription_access(
                {"id": benefactor["id"], "role": benefactor.get("role", "benefactor")}
            )
            if not access["has_access"]:
                raise HTTPException(
                    status_code=403,
                    detail="The estate owner's subscription is inactive. A subscription is required to process transition requests.",
                )

    content = await file.read()

    # Encrypt the death certificate with the estate's encryption key
    estate_salt = await get_estate_salt(estate_id)
    encrypted_data = encrypt_aes256(content, estate_salt)

    certificate = DeathCertificate(
        estate_id=estate_id,
        uploaded_by=current_user["id"],
        file_data=encrypted_data,
        file_name=file.filename or "death_certificate.pdf",
    )
    await db.death_certificates.insert_one(certificate.model_dump())

    # NOTIFICATION: Security alert to benefactor + Amber Alert to all staff
    from services.notifications import notify

    if estate:
        estate_name = estate.get("name", estate_id)
        owner_id = estate.get("owner_id")
        if owner_id:
            asyncio.create_task(
                notify.security_alert(
                    owner_id,
                    "Security Alert: Death Certificate Uploaded",
                    "A death certificate has been uploaded to your estate. If this was NOT authorized by you, tap here immediately.",
                    url="/support?priority=p1&reason=death_cert_error",
                    metadata={
                        "estate_id": estate_id,
                        "certificate_id": certificate.id,
                        "estate_name": estate_name,
                    },
                )
            )
        # P2 Alert to ALL staff — new TVT request (no Amber Alert)
        asyncio.create_task(
            notify.p2_alert(
                "New TVT Request",
                f"A death certificate has been uploaded for estate '{estate_name}'. TVT review required.",
                url="/ops/transition",
                metadata={
                    "estate_id": estate_id,
                    "estate_name": estate_name,
                    "certificate_id": certificate.id,
                },
            )
        )

    return {
        "id": certificate.id,
        "status": "pending",
        "message": "Death certificate uploaded and encrypted for review",
    }


@router.get("/transition/certificates")
async def get_pending_certificates(current_user: dict = Depends(get_current_user)):
    """List pending death certificates for admin review."""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Only admins can view pending certificates")

    certificates = await db.death_certificates.find({"status": "pending"}, {"_id": 0, "file_data": 0}).to_list(100)
    return certificates


@router.post("/transition/begin-review/{certificate_id}")
async def begin_review(
    certificate_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """TVT member opens and begins reviewing a certificate"""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Only TVT members can review certificates")
    cert = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {
            "$set": {
                "status": "reviewing",
                "reviewed_by": current_user["id"],
                "review_started_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user["role"],
        action="tvt_begin_review",
        category="tvt",
        resource_type="death_certificate",
        resource_id=certificate_id,
        details={"estate_id": cert.get("estate_id", "")},
        ip_address=get_client_ip(request),
    )

    return {"message": "Review started"}


@router.post("/transition/approve/{certificate_id}")
async def approve_death_certificate(
    certificate_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Approve or reject a death certificate."""
    if current_user["role"] not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Only authorized personnel can approve certificates")

    certificate = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")

    # Update certificate status — authenticated
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {
            "$set": {
                "status": "authenticated",
                "reviewed_by": current_user["id"],
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    # Seal the benefactor's estate (immutable)
    estate_doc = await db.estates.find_one(
        {"id": certificate["estate_id"]},
        {"_id": 0, "id": 1, "beneficiaries": 1, "owner_id": 1},
    )
    await db.estates.update_one(
        {"id": certificate["estate_id"]},
        {
            "$set": {
                "status": "transitioned",
                "transitioned_at": datetime.now(timezone.utc).isoformat(),
                "sealed_by": current_user["id"],
            }
        },
    )

    # Lock the benefactor's account permanently — no further edits allowed
    if estate_doc and estate_doc.get("owner_id"):
        await db.users.update_one(
            {"id": estate_doc["owner_id"]},
            {
                "$set": {
                    "account_locked": True,
                    "locked_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        # The deceased benefactor may also be a beneficiary on OTHER estates.
        # Promote the next person in the succession chain on those estates.
        asyncio.create_task(promote_succession(estate_doc["owner_id"], current_user["id"]))

    # Deliver all messages marked for immediate delivery
    await db.messages.update_many(
        {"estate_id": certificate["estate_id"], "trigger_type": "immediate"},
        {
            "$set": {
                "is_delivered": True,
                "delivered_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    # Mark certificate as fully complete
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {
            "$set": {
                "status": "approved",
                "transition_completed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    # Create 30-day grace periods for all beneficiaries of this estate
    beneficiary_links = await db.beneficiaries.find(
        {"estate_id": certificate["estate_id"]}, {"_id": 0, "id": 1, "user_id": 1}
    ).to_list(100)

    all_ben_ids = set()
    for bl in beneficiary_links:
        if bl.get("user_id"):
            all_ben_ids.add(bl["user_id"])
    if estate_doc:
        for bid in estate_doc.get("beneficiaries", []):
            all_ben_ids.add(bid)

    grace_end = datetime.now(timezone.utc) + timedelta(days=30)
    for ben_id in all_ben_ids:
        existing = await db.beneficiary_grace_periods.find_one({"beneficiary_id": ben_id}, {"_id": 0})
        if not existing:
            await db.beneficiary_grace_periods.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "beneficiary_id": ben_id,
                    "benefactor_id": estate_doc.get("owner_id") if estate_doc else "",
                    "reason": "benefactor_transition",
                    "grace_starts_at": datetime.now(timezone.utc).isoformat(),
                    "grace_ends_at": grace_end.isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user["role"],
        action="tvt_approve",
        category="tvt",
        resource_type="death_certificate",
        resource_id=certificate_id,
        details={
            "estate_id": certificate["estate_id"],
            "beneficiaries": len(all_ben_ids),
        },
        ip_address=get_client_ip(request),
        severity="critical",
    )

    # NOTIFICATION: Transition completed
    from services.notifications import notify

    estate_name = ""
    if estate_doc:
        e = await db.estates.find_one({"id": certificate["estate_id"]}, {"_id": 0, "id": 1, "name": 1})
        estate_name = (e or {}).get("name", "")

    # Notify beneficiaries
    for ben_id in all_ben_ids:
        asyncio.create_task(
            notify.beneficiary(
                ben_id,
                "Estate Transition Complete",
                f"The estate '{estate_name}' has been transitioned. You now have access to estate documents and messages.",
                url="/beneficiary/dashboard",
                priority="high",
            )
        )

    # Notify all staff
    asyncio.create_task(
        notify.all_staff(
            "Transition Completed",
            f"Estate '{estate_name}' has been fully transitioned and sealed.",
            url="/ops/transition",
            priority="normal",
        )
    )

    return {
        "message": "Certificate approved, benefactor sealed, beneficiary access granted",
        "beneficiaries_with_grace": len(all_ben_ids),
    }


async def promote_succession(deceased_user_id: str, actor_id: str):
    """When a beneficiary dies, promote the next person in line on ALL estates
    where the deceased was part of the succession chain.

    This is called after TVT verifies a death certificate — either via the
    standard benefactor-estate transition flow (above) or via a customer
    service request for a beneficiary who doesn't own an estate.
    """
    from services.notifications import notify

    # Find all beneficiary records linked to the deceased user across all estates
    deceased_links = await db.beneficiaries.find(
        {"user_id": deceased_user_id, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "succession_order": 1,
            "is_primary": 1,
            "name": 1,
        },
    ).to_list(100)

    promotions = []
    for link in deceased_links:
        estate_id = link["estate_id"]
        was_primary = link.get("is_primary", False)
        old_order = link.get("succession_order")

        # Remove the deceased from the succession chain
        await db.beneficiaries.update_one(
            {"id": link["id"]},
            {"$set": {"succession_order": None, "is_primary": False, "deceased": True}},
        )

        if old_order is None and not was_primary:
            continue  # Not in the succession chain — nothing to promote

        # Find all remaining beneficiaries in the succession chain for this estate
        remaining = await db.beneficiaries.find(
            {
                "estate_id": estate_id,
                "deleted_at": None,
                "succession_order": {"$ne": None},
                "id": {"$ne": link["id"]},
            },
            {"_id": 0, "id": 1, "name": 1, "succession_order": 1, "user_id": 1},
        ).to_list(100)
        remaining.sort(key=lambda b: b["succession_order"])

        # Re-index the succession chain (close the gap)
        for new_idx, ben in enumerate(remaining):
            new_is_primary = new_idx == 0
            await db.beneficiaries.update_one(
                {"id": ben["id"]},
                {"$set": {"succession_order": new_idx, "is_primary": new_is_primary}},
            )
            # If this person just became primary, notify them
            if new_is_primary and not ben.get("is_primary", False):
                promoted_name = ben.get("name", "Beneficiary")
                estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "name": 1})
                estate_name = (estate or {}).get("name", "an estate")
                promotions.append(
                    {
                        "user_id": ben.get("user_id"),
                        "name": promoted_name,
                        "estate_name": estate_name,
                        "estate_id": estate_id,
                    }
                )

    # Send notifications to newly promoted primary beneficiaries
    for promo in promotions:
        if not promo["user_id"]:
            continue
        title = "You Are Now Primary Beneficiary"
        body = (
            f"You have been promoted to Primary Beneficiary for the "
            f"{promo['estate_name']}. This means you are now the designated "
            f"trustee responsible for managing this estate during transition."
        )
        # In-app notification (shows in notification center + new badge)
        asyncio.create_task(
            notify.beneficiary(
                promo["user_id"],
                title,
                body,
                url="/beneficiary/dashboard",
                priority="high",
                metadata={
                    "type": "succession_promotion",
                    "estate_id": promo["estate_id"],
                    "show_login_toast": True,
                },
            )
        )
        # Email notification
        asyncio.create_task(_send_succession_email(promo["user_id"], promo["name"], promo["estate_name"]))

    return promotions


async def _send_succession_email(user_id: str, name: str, estate_name: str):
    """Send an email to the newly promoted primary beneficiary."""
    import resend

    from config import RESEND_API_KEY, SENDER_EMAIL, logger

    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "email": 1, "name": 1})
    if not user or not RESEND_API_KEY:
        return
    try:
        resend.emails.send(
            {
                "from": SENDER_EMAIL,
                "to": [user["email"]],
                "subject": f"CarryOn™ — You Are Now Primary Beneficiary for {estate_name}",
                "html": f"""
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #0a1628; color: #e2e8f0; border-radius: 16px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <img src="https://app.carryon.us/logo192.png" alt="CarryOn" style="width: 48px; height: 48px;" />
                    </div>
                    <h1 style="color: #d4af37; font-size: 22px; margin-bottom: 8px;">Succession Update</h1>
                    <p style="color: #94a3b8; font-size: 15px; line-height: 1.6;">
                        Dear {name},
                    </p>
                    <p style="color: #94a3b8; font-size: 15px; line-height: 1.6;">
                        You have been promoted to <strong style="color: #22C993;">Primary Beneficiary</strong>
                        for the <strong style="color: #d4af37;">{estate_name}</strong>.
                    </p>
                    <p style="color: #94a3b8; font-size: 15px; line-height: 1.6;">
                        As Primary Beneficiary, you are now the designated trustee responsible for managing
                        this estate during transition. Please log in to review your responsibilities.
                    </p>
                    <div style="text-align: center; margin: 28px 0;">
                        <a href="https://app.carryon.us/beneficiary/dashboard" style="display: inline-block; padding: 12px 32px; background: #d4af37; color: #0a1628; border-radius: 8px; text-decoration: none; font-weight: 600;">
                            View Your Dashboard
                        </a>
                    </div>
                    <p style="color: #64748b; font-size: 12px; text-align: center;">
                        CarryOn Technologies &middot; carryon.us
                    </p>
                </div>
                """,
            }
        )
    except Exception as e:
        logger.warning(f"Succession email failed for {user_id}: {e}")


@router.delete("/transition/certificates/{certificate_id}")
async def delete_certificate(
    certificate_id: str,
    admin_password: str = "",
    current_user: dict = Depends(get_current_user),
):
    """Delete a transition certificate and REVERSE the transition — admin only, requires password."""
    import bcrypt

    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    # Verify admin password
    if not admin_password:
        raise HTTPException(status_code=400, detail="Admin password required")
    admin_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "password": 1})
    if not admin_doc or not bcrypt.checkpw(admin_password.encode(), admin_doc["password"].encode()):
        raise HTTPException(status_code=401, detail="Incorrect admin password")

    # Find the certificate and its estate before deleting
    certificate = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")

    estate_id = certificate.get("estate_id")

    # Delete the certificate
    await db.death_certificates.delete_one({"id": certificate_id})

    # If this was an approved certificate, REVERSE the transition
    if certificate.get("status") in ("approved", "authenticated") and estate_id:
        # Re-open the estate (un-seal)
        await db.estates.update_one(
            {"id": estate_id},
            {
                "$set": {"status": "pre-transition"},
                "$unset": {"transitioned_at": "", "sealed_by": ""},
            },
        )

        # Unlock the benefactor's account
        estate_doc = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1})
        if estate_doc and estate_doc.get("owner_id"):
            await db.users.update_one(
                {"id": estate_doc["owner_id"]},
                {
                    "$set": {"account_locked": False},
                    "$unset": {"locked_at": ""},
                },
            )

        # Un-deliver ALL messages (full revert to pre-transition state)
        await db.messages.update_many(
            {"estate_id": estate_id, "is_delivered": True},
            {
                "$set": {"is_delivered": False},
                "$unset": {
                    "delivered_at": "",
                    "delivered_via": "",
                    "milestone_report_id": "",
                },
            },
        )

        # Remove milestone reports
        await db.milestone_reports.delete_many({"estate_id": estate_id})

        # Remove grace periods
        await db.beneficiary_grace_periods.delete_many({"reason": "benefactor_transition"})

    return {
        "deleted": True,
        "transition_reversed": certificate.get("status") in ("approved", "authenticated"),
    }


@router.get("/transition/status/{estate_id}")
async def get_transition_status(estate_id: str, current_user: dict = Depends(get_current_user)):
    # Get the MOST RECENT certificate for this estate
    """Check the transition status of an estate."""
    certificates = (
        await db.death_certificates.find({"estate_id": estate_id}, {"_id": 0, "file_data": 0})
        .sort("created_at", -1)
        .to_list(1)
    )
    certificate = certificates[0] if certificates else None
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})

    return {
        "estate_status": estate["status"] if estate else "unknown",
        "certificate": certificate,
    }


# ===================== MILESTONE REPORT ROUTES =====================


@router.post("/milestones/report")
async def report_milestone(data: MilestoneReportCreate, current_user: dict = Depends(get_current_user)):
    """Report a milestone event for a beneficiary."""
    if current_user["role"] != "beneficiary":
        raise HTTPException(status_code=403, detail="Only beneficiaries can report milestones")

    report = MilestoneReport(
        estate_id=data.estate_id,
        beneficiary_id=current_user["id"],
        event_type=data.event_type,
        event_description=data.event_description,
        event_date=data.event_date,
    )
    await db.milestone_reports.insert_one(report.model_dump())

    # Check for messages to deliver based on this milestone
    # Match standard events by trigger_value (birthday, graduation, marriage)
    # Match custom events by custom_event_label
    event_type_lower = data.event_type.lower().strip()

    query = {
        "estate_id": data.estate_id,
        "recipients": current_user["id"],
        "trigger_type": "event",
        "is_delivered": False,
        "$or": [
            # Standard event match (birthday, graduation, marriage)
            {"trigger_value": event_type_lower},
            # Custom event match by label
            {"trigger_value": "custom", "custom_event_label": data.event_type},
            {"trigger_value": "custom", "custom_event_label": data.event_description},
        ],
    }
    messages = await db.messages.find(query, {"_id": 0}).to_list(100)

    # Also check for age milestones if the event is an age-related one
    age_events = {"turned 18": 18, "turned 25": 25}
    if event_type_lower in age_events:
        age_messages = await db.messages.find(
            {
                "estate_id": data.estate_id,
                "recipients": current_user["id"],
                "trigger_type": "age_milestone",
                "trigger_age": age_events[event_type_lower],
                "is_delivered": False,
            },
            {"_id": 0},
        ).to_list(100)
        messages.extend(age_messages)

    # Also check specific_date messages if event_date matches
    if data.event_date:
        date_messages = await db.messages.find(
            {
                "estate_id": data.estate_id,
                "recipients": current_user["id"],
                "trigger_type": "specific_date",
                "trigger_date": data.event_date,
                "is_delivered": False,
            },
            {"_id": 0},
        ).to_list(100)
        messages.extend(date_messages)

    # Deduplicate by message id
    seen = set()
    unique_messages = []
    for msg in messages:
        if msg["id"] not in seen:
            seen.add(msg["id"])
            unique_messages.append(msg)

    # Create pending delivery records for worker review (NOT auto-deliver)
    deliveries_created = []
    for msg in unique_messages:
        delivery = {
            "id": str(uuid.uuid4()),
            "milestone_report_id": report.id,
            "estate_id": data.estate_id,
            "message_id": msg["id"],
            "message_title": msg.get("title", ""),
            "beneficiary_id": current_user["id"],
            "beneficiary_name": current_user.get("name", ""),
            "event_type": data.event_type,
            "event_description": data.event_description,
            "event_date": data.event_date,
            "status": "pending_review",  # pending_review, approved, rejected
            "reviewed_by": None,
            "reviewed_at": None,
            "review_notes": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.milestone_deliveries.insert_one(delivery)
        deliveries_created.append(delivery["id"])

    # NOTIFICATION: Notify all staff about milestone report
    from services.notifications import notify
    import asyncio

    if unique_messages:
        asyncio.create_task(
            notify.p3_alert(
                "Milestone Review Required",
                f"{current_user.get('name', 'Beneficiary')} reported a milestone ({data.event_type}). "
                f"{len(unique_messages)} matching message(s) found — review required before delivery.",
                url="/ops/milestones",
                metadata={
                    "report_id": report.id,
                    "event_type": data.event_type,
                    "matches": len(unique_messages),
                },
            )
        )
    else:
        asyncio.create_task(
            notify.p4_alert(
                "Milestone Reported",
                f"{current_user.get('name', 'Beneficiary')} reported a milestone: {data.event_type}. No matching messages at this time.",
                url="/ops/milestones",
                metadata={
                    "report_id": report.id,
                    "event_type": data.event_type,
                    "matches": 0,
                },
            )
        )

    return {
        "id": report.id,
        "matches_found": len(unique_messages),
        "pending_review": len(deliveries_created),
        "message": f"{len(unique_messages)} matching message(s) found. A CarryOn team member will review and deliver them shortly."
        if unique_messages
        else "Milestone recorded. No matching messages found at this time.",
    }
