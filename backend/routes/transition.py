"""CarryOn™ Backend — Estate Transition Routes"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from datetime import datetime, timezone
from config import db
from utils import get_current_user
import base64

from models import DeathCertificate, MilestoneReport, MilestoneReportCreate

router = APIRouter()

# ===================== ESTATE TRANSITION ROUTES =====================

@router.post("/transition/upload-certificate")
async def upload_death_certificate(
    estate_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    content = await file.read()
    file_data = base64.b64encode(content).decode()
    
    certificate = DeathCertificate(
        estate_id=estate_id,
        uploaded_by=current_user["id"],
        file_data=file_data,
        file_name=file.filename or "death_certificate.pdf"
    )
    await db.death_certificates.insert_one(certificate.model_dump())
    
    return {"id": certificate.id, "status": "pending", "message": "Death certificate uploaded for review"}

@router.get("/transition/certificates")
async def get_pending_certificates(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view pending certificates")
    
    certificates = await db.death_certificates.find({"status": "pending"}, {"_id": 0, "file_data": 0}).to_list(100)
    return certificates

@router.post("/transition/begin-review/{certificate_id}")
async def begin_review(certificate_id: str, current_user: dict = Depends(get_current_user)):
    """TVT member opens and begins reviewing a certificate"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only TVT members can review certificates")
    cert = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {"$set": {"status": "reviewing", "reviewed_by": current_user["id"], "review_started_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Review started"}

@router.post("/transition/approve/{certificate_id}")
async def approve_death_certificate(certificate_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can approve certificates")
    
    certificate = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")
    
    # Update certificate status — authenticated
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {"$set": {
            "status": "authenticated",
            "reviewed_by": current_user["id"],
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Seal the benefactor's estate (immutable)
    await db.estates.update_one(
        {"id": certificate["estate_id"]},
        {"$set": {
            "status": "transitioned",
            "transitioned_at": datetime.now(timezone.utc).isoformat(),
            "sealed_by": current_user["id"]
        }}
    )
    
    # Deliver all messages marked for immediate delivery
    await db.messages.update_many(
        {"estate_id": certificate["estate_id"], "trigger_type": "immediate"},
        {"$set": {"is_delivered": True, "delivered_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Mark certificate as fully complete
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {"$set": {"status": "approved", "transition_completed_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Certificate approved, benefactor sealed, beneficiary access granted"}

@router.get("/transition/status/{estate_id}")
async def get_transition_status(estate_id: str, current_user: dict = Depends(get_current_user)):
    # Get the MOST RECENT certificate for this estate
    certificates = await db.death_certificates.find(
        {"estate_id": estate_id},
        {"_id": 0, "file_data": 0}
    ).sort("created_at", -1).to_list(1)
    certificate = certificates[0] if certificates else None
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    
    return {
        "estate_status": estate["status"] if estate else "unknown",
        "certificate": certificate
    }

# ===================== MILESTONE REPORT ROUTES =====================

@router.post("/milestones/report")
async def report_milestone(data: MilestoneReportCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "beneficiary":
        raise HTTPException(status_code=403, detail="Only beneficiaries can report milestones")
    
    report = MilestoneReport(
        estate_id=data.estate_id,
        beneficiary_id=current_user["id"],
        event_type=data.event_type,
        event_description=data.event_description,
        event_date=data.event_date
    )
    await db.milestone_reports.insert_one(report.model_dump())
    
    # Check for messages to deliver based on this milestone
    messages = await db.messages.find({
        "estate_id": data.estate_id,
        "recipients": current_user["id"],
        "trigger_type": "event",
        "trigger_value": data.event_type,
        "is_delivered": False
    }, {"_id": 0}).to_list(100)
    
    for msg in messages:
        await db.messages.update_one(
            {"id": msg["id"]},
            {"$set": {"is_delivered": True, "delivered_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return {"id": report.id, "messages_delivered": len(messages)}



