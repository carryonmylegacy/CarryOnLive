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
from guards import require_admin
from routes.digital_wallet import _decrypt_wallet_entry
from routes.messages import _decrypt_message
from services.encryption import get_estate_salt
from utils import get_current_user

router = APIRouter()


# ===================== GDPR: RIGHT TO ACCESS / DATA PORTABILITY =====================


async def build_user_export(current_user: dict) -> dict:
    """GDPR Article 15/20: build the full personal-data export for this user.

    NOT an endpoint. The download route lives in routes/export_stepup.py and
    requires step-up authentication (password + passkey/OTP) before calling
    this builder — the export must never be reachable with a bearer token
    alone."""
    user_id = current_user["id"]

    # Collect all user data across collections
    user_profile = await db.users.find_one(
        {"id": user_id},
        {
            "_id": 0,
            "password": 0,
            "password_hash": 0,
            "otp_secret": 0,
            "backup_codes": 0,
            "vault_master_key_hash": 0,
            "security_answers": 0,
            # Per-device offline-login material (salts/credential ids). Not a
            # data-subject "personal data" item and pointless to hand back —
            # excluded to keep the export minimal (least-data principle).
            "offline_credentials": 0,
            "offline_credential": 0,
        },
    )

    estates = await db.estates.find({"owner_id": user_id}, {"_id": 0}).to_list(100)

    estate_ids = [e["id"] for e in estates]

    # Per-estate salts for decrypting the user's own encrypted fields (B1/B3:
    # the export must hand back message bodies and DAV secret values in
    # plaintext — the step-up gate in export_stepup.py protects the endpoint).
    salt_by_estate: dict = {}
    for eid in estate_ids:
        try:
            salt_by_estate[eid] = await get_estate_salt(eid)
        except Exception:
            salt_by_estate[eid] = None

    documents_meta = await db.documents.find(
        {"estate_id": {"$in": estate_ids}},
        {
            "_id": 0,
            "file_data": 0,
            "storage_key": 0,
            "lock_password_hash": 0,
            "backup_code": 0,
            "voice_passphrase_hash": 0,
            "voice_passphrase_backup_code": 0,
        },
    ).to_list(1000)

    messages_raw = await db.messages.find({"estate_id": {"$in": estate_ids}}, {"_id": 0}).to_list(1000)
    messages = []
    for msg in messages_raw:
        salt = salt_by_estate.get(msg.get("estate_id"))
        if salt:
            msg = await _decrypt_message(msg, salt)
        else:
            msg.pop("encrypted_title", None)
            msg.pop("encrypted_content", None)
        messages.append(msg)

    beneficiaries = await db.beneficiaries.find({"estate_id": {"$in": estate_ids}}, {"_id": 0}).to_list(500)

    checklists = await db.checklists.find({"estate_id": {"$in": estate_ids}}, {"_id": 0}).to_list(1000)

    activity_logs = await db.activity_log.find({"user_id": user_id}, {"_id": 0}).to_list(5000)

    subscriptions = await db.user_subscriptions.find_one({"user_id": user_id}, {"_id": 0})

    dav_raw = await db.digital_wallet.find({"estate_id": {"$in": estate_ids}}, {"_id": 0}).to_list(500)
    digital_wallet = []
    for entry in dav_raw:
        salt = salt_by_estate.get(entry.get("estate_id"))
        if salt:
            entry = _decrypt_wallet_entry(entry, salt)
        entry.pop("encrypted_value", None)
        entry.pop("encrypted_password", None)
        entry.pop("encrypted_additional", None)
        digital_wallet.append(entry)

    dts_tasks = await db.dts_tasks.find({"estate_id": {"$in": estate_ids}}, {"_id": 0}).to_list(500)

    in_estates = {"estate_id": {"$in": estate_ids}}

    ffn_contacts = await db.ffn_contacts.find(in_estates, {"_id": 0}).to_list(1000)

    financial_picture = {
        "bills": await db.bills.find(in_estates, {"_id": 0}).to_list(2000),
        "bill_payments": await db.bill_payments.find(in_estates, {"_id": 0}).to_list(5000),
        "debts": await db.debts.find(in_estates, {"_id": 0}).to_list(2000),
        "accounts": await db.financial_accounts.find(in_estates, {"_id": 0}).to_list(2000),
        "property_assets": await db.property_assets.find(in_estates, {"_id": 0}).to_list(2000),
        "custom_categories": await db.financial_custom_categories.find(in_estates, {"_id": 0}).to_list(500),
    }

    entities_structures = {
        "entities": await db.cfp_entities.find(in_estates, {"_id": 0}).to_list(2000),
        "external_people": await db.cfp_external_people.find(in_estates, {"_id": 0}).to_list(2000),
        "relationships": await db.cfp_entity_relationships.find(in_estates, {"_id": 0}).to_list(5000),
    }

    contingency_protocols = {
        "emergency_plans": await db.emergency_plans.find(in_estates, {"_id": 0}).to_list(500),
        "activations": await db.emergency_activations.find(in_estates, {"_id": 0}).to_list(500),
        "member_checkins": await db.member_checkins.find(in_estates, {"_id": 0}).to_list(2000),
        "plans": await db.ccp_plans.find(in_estates, {"_id": 0}).to_list(500),
        "household": await db.ccp_household.find(in_estates, {"_id": 0}).to_list(100),
        "go_bag": await db.ccp_go_bag.find(in_estates, {"_id": 0}).to_list(100),
        "rendezvous": await db.ccp_rendezvous.find(in_estates, {"_id": 0}).to_list(100),
        "out_of_area": await db.ccp_out_of_area.find(in_estates, {"_id": 0}).to_list(100),
        "risk_profile": await db.ccp_risk_profile.find(in_estates, {"_id": 0}).to_list(100),
        "ccp_activations": await db.ccp_activations.find(in_estates, {"_id": 0}).to_list(500),
        "drill_runs": await db.ccp_drill_runs.find(in_estates, {"_id": 0}).to_list(500),
    }

    plan_timeline = await db.edit_history.find(in_estates, {"_id": 0}).to_list(5000)

    consent_history = await db.consent_audit_log.find({"user_id": user_id}, {"_id": 0}).to_list(500)

    user_consent = await db.user_consent.find_one({"user_id": user_id}, {"_id": 0})

    # GDPR Article 15: a data subject can also be a BENEFICIARY in other people's
    # estates. Export the personal data CarryOn stores ABOUT this user in those
    # beneficiary records (name/email/phone/relationship/status) — but NEVER the
    # benefactor's estate contents (documents, messages, financials, secrets).
    ben_match: list = [{"user_id": user_id}]
    if current_user.get("email_verified") and current_user.get("email"):
        ben_match.append({"email": current_user["email"].lower().strip()})
    ben_records = await db.beneficiaries.find(
        {"$or": ben_match, "estate_id": {"$nin": estate_ids}, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "estate_id": 1,
            "name": 1,
            "email": 1,
            "phone": 1,
            "relationship": 1,
            "relation": 1,
            "is_primary": 1,
            "status": 1,
            "created_at": 1,
            "user_id": 1,
        },
    ).to_list(500)
    beneficiary_memberships: list = []
    if ben_records:
        ben_estate_ids = list({b.get("estate_id") for b in ben_records if b.get("estate_id")})
        est_rows = await db.estates.find({"id": {"$in": ben_estate_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        est_name_by_id = {e["id"]: e.get("name") for e in est_rows}
        beneficiary_memberships = [{**b, "estate_name": est_name_by_id.get(b.get("estate_id"))} for b in ben_records]

    # Log sensitive data access for SOC 2 audit trail
    await log_sensitive_access(
        user_id=user_id,
        action="data_export",
        resource="full_account",
        details="GDPR Article 15/20 data export requested",
    )

    # Ensure all data is JSON serializable (handle ObjectId, datetime, etc.)
    import json

    def make_serializable(obj):
        if isinstance(obj, dict):
            return {k: make_serializable(v) for k, v in obj.items() if k != "_id"}
        elif isinstance(obj, list):
            return [make_serializable(i) for i in obj]
        elif hasattr(obj, "isoformat"):
            return obj.isoformat()
        elif isinstance(obj, bytes):
            return "<binary data excluded>"
        else:
            try:
                json.dumps(obj)
                return obj
            except (TypeError, ValueError):
                return str(obj)

    export_data = make_serializable(
        {
            "export_date": datetime.now(timezone.utc).isoformat(),
            "data_subject": user_profile,
            "estates": estates,
            "documents_metadata": documents_meta,
            "messages": messages,
            "beneficiaries": beneficiaries,
            "beneficiary_memberships": beneficiary_memberships,
            "checklists": checklists,
            "digital_wallet_entries": digital_wallet,
            "friends_family_notification": ffn_contacts,
            "financial_picture": financial_picture,
            "entities_structures": entities_structures,
            "contingency_protocols": contingency_protocols,
            "estate_plan_timeline": plan_timeline,
            "trustee_service_tasks": dts_tasks,
            "activity_logs": activity_logs,
            "subscription": subscriptions,
            "consent_preferences": user_consent,
            "consent_history": consent_history,
            "note": "Milestone Message bodies, Digital Access Vault secret values, your financial picture, entities & structures, FFN contacts, contingency protocols, and your estate plan timeline ARE included in plaintext — store this file securely. Vault document FILE CONTENTS (including wills) are excluded; download them individually from the Secure Document Vault. OTP secrets and password hashes are never exported. 'beneficiary_memberships' lists estates where you are a named beneficiary; only your own personal data is included, never the estate owner's private contents.",
        }
    )

    return export_data


# ===================== GDPR: RIGHT TO ERASURE =====================


class DeletionRequest(BaseModel):
    confirm_email: str
    reason: str = ""


@router.post("/compliance/deletion-request")
async def request_account_deletion(data: DeletionRequest, current_user: dict = Depends(get_current_user)):
    """GDPR Article 17: Request account and data deletion."""
    if data.confirm_email != current_user["email"]:
        raise HTTPException(status_code=400, detail="Email confirmation does not match your account")

    # Don't allow deletion if user has active estates with beneficiaries
    estates = await db.estates.find({"owner_id": current_user["id"]}, {"_id": 0}).to_list(100)
    for estate in estates:
        ben_count = await db.beneficiaries.count_documents({"estate_id": estate["id"], "status": "accepted"})
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
    consent = await db.user_consent.find_one({"user_id": current_user["id"]}, {"_id": 0})
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
async def update_consent_preferences(data: ConsentUpdate, current_user: dict = Depends(get_current_user)):
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
async def report_security_incident(data: IncidentReport, current_user: dict = Depends(require_admin)):
    """SOC 2: Log a security incident for investigation."""

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
async def get_security_incidents(current_user: dict = Depends(require_admin)):
    """SOC 2: View security incidents (admin only)."""

    incidents = await db.security_incidents.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"incidents": incidents}


# ===================== ADMIN: DELETION REQUEST MANAGEMENT =====================


@router.get("/admin/deletion-requests")
async def get_deletion_requests(current_user: dict = Depends(require_admin)):
    """Admin: View pending account deletion requests."""

    requests = await db.deletion_requests.find({}, {"_id": 0}).sort("requested_at", -1).to_list(200)
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
