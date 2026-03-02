"""CarryOn™ Backend — Estate Transition Routes"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from config import db
from models import DeathCertificate, MilestoneReport, MilestoneReportCreate
from services.audit import audit_log
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

    await audit_log(
        action="transition.certificate_upload",
        user_id=current_user["id"],
        resource_type="death_certificate",
        resource_id=certificate.id,
        estate_id=estate_id,
        details={"file_name": file.filename, "encrypted": True},
    )

    return {
        "id": certificate.id,
        "status": "pending",
        "message": "Death certificate uploaded and encrypted for review",
    }


@router.get("/transition/certificates")
async def get_pending_certificates(current_user: dict = Depends(get_current_user)):
    """List pending death certificates for admin review."""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403, detail="Only admins can view pending certificates"
        )

    certificates = await db.death_certificates.find(
        {"status": "pending"}, {"_id": 0, "file_data": 0}
    ).to_list(100)
    return certificates


@router.post("/transition/begin-review/{certificate_id}")
async def begin_review(
    certificate_id: str, current_user: dict = Depends(get_current_user)
):
    """TVT member opens and begins reviewing a certificate"""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403, detail="Only TVT members can review certificates"
        )
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
    return {"message": "Review started"}


@router.post("/transition/approve/{certificate_id}")
async def approve_death_certificate(
    certificate_id: str, current_user: dict = Depends(get_current_user)
):
    """Approve or reject a death certificate."""
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403, detail="Only admins can approve certificates"
        )

    certificate = await db.death_certificates.find_one(
        {"id": certificate_id}, {"_id": 0}
    )
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
        {"estate_id": certificate["estate_id"]}, {"_id": 0, "user_id": 1}
    ).to_list(100)

    # Also check estate.beneficiaries array
    estate_doc = await db.estates.find_one(
        {"id": certificate["estate_id"]}, {"_id": 0, "beneficiaries": 1, "owner_id": 1}
    )
    all_ben_ids = set()
    for bl in beneficiary_links:
        if bl.get("user_id"):
            all_ben_ids.add(bl["user_id"])
    if estate_doc:
        for bid in estate_doc.get("beneficiaries", []):
            all_ben_ids.add(bid)

    grace_end = datetime.now(timezone.utc) + timedelta(days=30)
    for ben_id in all_ben_ids:
        existing = await db.beneficiary_grace_periods.find_one(
            {"beneficiary_id": ben_id}, {"_id": 0}
        )
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

    return {
        "message": "Certificate approved, benefactor sealed, beneficiary access granted",
        "beneficiaries_with_grace": len(all_ben_ids),
    }


@router.delete("/transition/certificates/{certificate_id}")
async def delete_certificate(
    certificate_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a transition certificate — admin only."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.death_certificates.delete_one({"id": certificate_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return {"deleted": True}


@router.get("/transition/status/{estate_id}")
async def get_transition_status(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    # Get the MOST RECENT certificate for this estate
    """Check the transition status of an estate."""
    certificates = (
        await db.death_certificates.find(
            {"estate_id": estate_id}, {"_id": 0, "file_data": 0}
        )
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
async def report_milestone(
    data: MilestoneReportCreate, current_user: dict = Depends(get_current_user)
):
    """Report a milestone event for a beneficiary."""
    if current_user["role"] != "beneficiary":
        raise HTTPException(
            status_code=403, detail="Only beneficiaries can report milestones"
        )

    report = MilestoneReport(
        estate_id=data.estate_id,
        beneficiary_id=current_user["id"],
        event_type=data.event_type,
        event_description=data.event_description,
        event_date=data.event_date,
    )
    await db.milestone_reports.insert_one(report.model_dump())

    # Check for messages to deliver based on this milestone
    messages = await db.messages.find(
        {
            "estate_id": data.estate_id,
            "recipients": current_user["id"],
            "trigger_type": "event",
            "trigger_value": data.event_type,
            "is_delivered": False,
        },
        {"_id": 0},
    ).to_list(100)

    for msg in messages:
        await db.messages.update_one(
            {"id": msg["id"]},
            {
                "$set": {
                    "is_delivered": True,
                    "delivered_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    return {"id": report.id, "messages_delivered": len(messages)}
