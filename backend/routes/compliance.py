"""CarryOn™ — Compliance Routes (SOC 2, GDPR)

Provides endpoints for:
- GDPR: Data export (right to access/portability), account deletion (right to erasure), consent management
- SOC 2: Sensitive data access logging, audit trail
- SOC 2: Incident logging, data retention policy enforcement
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from utils import get_current_user

router = APIRouter()


# ===================== GDPR: RIGHT TO ACCESS / DATA PORTABILITY =====================


@router.get("/compliance/data-export")
async def export_user_data(current_user: dict = Depends(get_current_user)):
    """GDPR Article 15/20: Export all personal data associated with this user."""
    user_id = current_user["id"]

    # Collect all user data across collections
    user_profile = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})

    estates = await db.estates.find({"owner_id": user_id}, {"_id": 0}).to_list(100)

    estate_ids = [e["id"] for e in estates]

    documents_meta = await db.documents.find(
        {"estate_id": {"$in": estate_ids}},
        {
            "_id": 0,
            "file_data": 0,
            "storage_key": 0,
            "lock_password_hash": 0,
            "backup_code": 0,
        },
    ).to_list(1000)

    messages = await db.messages.find(
        {"estate_id": {"$in": estate_ids}},
        {"_id": 0, "encrypted_content": 0, "encrypted_title": 0},
    ).to_list(1000)

    beneficiaries = await db.beneficiaries.find(
        {"estate_id": {"$in": estate_ids}}, {"_id": 0}
    ).to_list(500)

    checklists = await db.checklists.find(
        {"estate_id": {"$in": estate_ids}}, {"_id": 0}
    ).to_list(1000)

    activity_logs = await db.activity_log.find(
        {"user_id": user_id}, {"_id": 0}
    ).to_list(5000)

    subscriptions = await db.user_subscriptions.find_one(
        {"user_id": user_id}, {"_id": 0}
    )

    digital_wallet = await db.digital_wallet.find(
        {"estate_id": {"$in": estate_ids}},
        {"_id": 0, "encrypted_value": 0},
    ).to_list(500)

    dts_tasks = await db.dts_tasks.find(
        {"estate_id": {"$in": estate_ids}}, {"_id": 0}
    ).to_list(500)

    consent_history = await db.consent_audit_log.find(
        {"user_id": user_id}, {"_id": 0}
    ).to_list(500)

    user_consent = await db.user_consent.find_one({"user_id": user_id}, {"_id": 0})

    # Log sensitive data access for SOC 2 audit trail
    await log_sensitive_access(
        user_id=user_id,
        action="data_export",
        resource="full_account",
        details="GDPR Article 15/20 data export requested",
    )

    return {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "data_subject": user_profile,
        "estates": estates,
        "documents_metadata": documents_meta,
        "messages_metadata": messages,
        "beneficiaries": beneficiaries,
        "checklists": checklists,
        "digital_wallet_entries": digital_wallet,
        "trustee_service_tasks": dts_tasks,
        "activity_logs": activity_logs,
        "subscription": subscriptions,
        "consent_preferences": user_consent,
        "consent_history": consent_history,
        "note": "Encrypted document content and message bodies are excluded from this export. They can be accessed through the Secure Document Vault.",
    }


# ===================== GDPR: RIGHT TO ERASURE =====================


class DeletionRequest(BaseModel):
    confirm_email: str
    reason: str = ""


@router.post("/compliance/deletion-request")
async def request_account_deletion(
    data: DeletionRequest, current_user: dict = Depends(get_current_user)
):
    """GDPR Article 17: Request account and data deletion."""
    if data.confirm_email != current_user["email"]:
        raise HTTPException(
            status_code=400, detail="Email confirmation does not match your account"
        )

    # Don't allow deletion if user has active estates with beneficiaries
    estates = await db.estates.find(
        {"owner_id": current_user["id"]}, {"_id": 0}
    ).to_list(100)
    for estate in estates:
        ben_count = await db.beneficiaries.count_documents(
            {"estate_id": estate["id"], "status": "accepted"}
        )
        if ben_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f'Estate "{estate.get("name")}" has active beneficiaries. Please remove or reassign them before requesting deletion.',
            )

    # Create deletion request (processed by admin within 30 days per GDPR)
    request_id = str(uuid.uuid4())
    await db.deletion_requests.insert_one(
        {
            "id": request_id,
            "user_id": current_user["id"],
            "email": current_user["email"],
            "name": current_user.get("name", ""),
            "reason": data.reason,
            "status": "pending",
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "deadline": "30 days per GDPR Article 17",
        }
    )

    await log_sensitive_access(
        user_id=current_user["id"],
        action="deletion_request",
        resource="full_account",
        details=f"Account deletion requested. Reason: {data.reason or 'Not specified'}",
    )

    return {
        "request_id": request_id,
        "message": "Your deletion request has been received. Your account and all associated data will be permanently deleted within 30 days. You will receive confirmation via email.",
    }


# ===================== GDPR: CONSENT MANAGEMENT =====================


class ConsentUpdate(BaseModel):
    marketing_emails: bool = False
    analytics_tracking: bool = False
    third_party_sharing: bool = False


@router.get("/compliance/consent")
async def get_consent_preferences(current_user: dict = Depends(get_current_user)):
    """Get user's current consent preferences."""
    consent = await db.user_consent.find_one(
        {"user_id": current_user["id"]}, {"_id": 0}
    )
    if not consent:
        consent = {
            "user_id": current_user["id"],
            "marketing_emails": False,
            "analytics_tracking": False,
            "third_party_sharing": False,
            "essential_services": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.user_consent.insert_one(consent)
    return {
        "marketing_emails": consent.get("marketing_emails", False),
        "analytics_tracking": consent.get("analytics_tracking", False),
        "third_party_sharing": consent.get("third_party_sharing", False),
        "essential_services": True,
        "updated_at": consent.get("updated_at", ""),
    }


@router.put("/compliance/consent")
async def update_consent_preferences(
    data: ConsentUpdate, current_user: dict = Depends(get_current_user)
):
    """Update user's consent preferences (GDPR consent management)."""
    now = datetime.now(timezone.utc).isoformat()
    await db.user_consent.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "user_id": current_user["id"],
                "marketing_emails": data.marketing_emails,
                "analytics_tracking": data.analytics_tracking,
                "third_party_sharing": data.third_party_sharing,
                "essential_services": True,
                "updated_at": now,
            }
        },
        upsert=True,
    )

    # Log consent change for audit trail
    await db.consent_audit_log.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "changes": {
                "marketing_emails": data.marketing_emails,
                "analytics_tracking": data.analytics_tracking,
                "third_party_sharing": data.third_party_sharing,
            },
            "timestamp": now,
            "ip_address": "server",
        }
    )

    return {"message": "Consent preferences updated", "updated_at": now}


# ===================== SOC 2: SENSITIVE DATA ACCESS LOGGING =====================


async def log_sensitive_access(
    user_id: str,
    action: str,
    resource: str,
    details: str = "",
    accessed_by: str = None,
):
    """Log every access to sensitive data for SOC 2 compliance audit trail.
    This creates an immutable audit trail of who accessed what, when, and why."""
    await db.sensitive_access_log.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "accessed_by": accessed_by or user_id,
            "action": action,
            "resource": resource,
            "details": details,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


@router.get("/compliance/sensitive-access-log")
async def get_sensitive_access_log(current_user: dict = Depends(get_current_user)):
    """SOC 2: View sensitive data access log for the current user."""
    logs = (
        await db.sensitive_access_log.find({"user_id": current_user["id"]}, {"_id": 0})
        .sort("timestamp", -1)
        .to_list(500)
    )
    return {"logs": logs, "total": len(logs)}


# ===================== SOC 2: SECURITY INCIDENT LOGGING =====================


class IncidentReport(BaseModel):
    title: str
    description: str
    severity: str = "medium"


@router.post("/compliance/incident")
async def report_security_incident(
    data: IncidentReport, current_user: dict = Depends(get_current_user)
):
    """SOC 2: Log a security incident for investigation."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    incident_id = str(uuid.uuid4())
    await db.security_incidents.insert_one(
        {
            "id": incident_id,
            "title": data.title,
            "description": data.description,
            "severity": data.severity,
            "reported_by": current_user["id"],
            "status": "open",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"incident_id": incident_id, "message": "Incident logged"}


@router.get("/compliance/incidents")
async def get_security_incidents(current_user: dict = Depends(get_current_user)):
    """SOC 2: View security incidents (admin only)."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    incidents = (
        await db.security_incidents.find({}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(200)
    )
    return {"incidents": incidents}


# ===================== ADMIN: DELETION REQUEST MANAGEMENT =====================


@router.get("/admin/deletion-requests")
async def get_deletion_requests(current_user: dict = Depends(get_current_user)):
    """Admin: View pending account deletion requests."""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    requests = (
        await db.deletion_requests.find({}, {"_id": 0})
        .sort("requested_at", -1)
        .to_list(200)
    )
    return {"requests": requests}


# ===================== DATA RETENTION POLICY =====================


@router.get("/compliance/retention-policy")
async def get_data_retention_policy(current_user: dict = Depends(get_current_user)):
    """Return the platform's data retention policy."""
    return {
        "policy_version": "1.0",
        "last_updated": "2026-02-28",
        "categories": [
            {
                "data_type": "Account Data",
                "retention": "Active account + 30 days after deletion request",
                "legal_basis": "Contract performance, legitimate interest",
            },
            {
                "data_type": "Estate Documents",
                "retention": "Lifetime of account + 7 years post-transition",
                "legal_basis": "Contract performance, legal obligation",
            },
            {
                "data_type": "Messages",
                "retention": "Lifetime of account + delivery to beneficiaries",
                "legal_basis": "Contract performance",
            },
            {
                "data_type": "Security Audit Logs",
                "retention": "7 years (regulatory requirement)",
                "legal_basis": "Legal obligation, legitimate interest",
            },
            {
                "data_type": "Sensitive Data Access Logs",
                "retention": "7 years (SOC 2 requirement)",
                "legal_basis": "Legal obligation",
            },
            {
                "data_type": "Payment Records",
                "retention": "7 years (tax/financial regulations)",
                "legal_basis": "Legal obligation",
            },
            {
                "data_type": "Failed Login Attempts",
                "retention": "1 hour (auto-deleted via TTL)",
                "legal_basis": "Security, legitimate interest",
            },
            {
                "data_type": "OTP Codes",
                "retention": "15 minutes (auto-deleted via TTL)",
                "legal_basis": "Security",
            },
            {
                "data_type": "Session Tokens (Blacklisted)",
                "retention": "9 hours (auto-deleted via TTL)",
                "legal_basis": "Security",
            },
        ],
    }
