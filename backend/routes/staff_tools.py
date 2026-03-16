"""CarryOn™ — Staff Tools Routes (SOC 2 Compliant)

New endpoints for Founder and Operations portals:
  Founder: Announcements, System Health
  Operator: My Activity, Search, Escalations, Shift Notes, Knowledge Base
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from config import db
from services.audit import get_client_ip, log_audit_event
from utils import get_current_user

router = APIRouter()


import hashlib
import os


def require_staff(user: dict):
    if user.get("role") not in ("admin", "operator"):
        raise HTTPException(status_code=403, detail="Staff access required")


def require_founder(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Founder access required")


# ══════════════════════════════════════════════════════════
# INTEGRATIONS VAULT (Password-protected)
# ══════════════════════════════════════════════════════════

INTEGRATIONS_PASSWORD_HASH = hashlib.sha256(b"Blh9170873").hexdigest()


class IntegrationsUnlockRequest(BaseModel):
    password: str


@router.post("/admin/integrations/unlock")
async def unlock_integrations(data: IntegrationsUnlockRequest, current_user: dict = Depends(get_current_user)):
    """Unlock integrations vault with secondary password."""
    require_founder(current_user)

    if hashlib.sha256(data.password.encode()).hexdigest() != INTEGRATIONS_PASSWORD_HASH:
        raise HTTPException(status_code=403, detail="Invalid password")

    def m(val):
        """Mask a credential value for display."""
        if not val or len(val) < 12:
            return val or "N/A"
        return val[:8] + "..." + val[-4:]

    integrations = [
        {
            "id": "railway",
            "name": "Railway",
            "status": "active",
            "dashboard_url": "https://railway.com",
            "details": [
                {"label": "Service", "value": "carryon-api"},
                {"label": "Plan", "value": "Pro ($20/mo base, $20 free credit)"},
                {"label": "Region", "value": "US East (Virginia)"},
                {"label": "Replicas", "value": "1"},
                {"label": "CPU Limit", "value": "32 vCPU"},
                {"label": "RAM Limit", "value": "32 GB"},
                {"label": "URL", "value": "carryon-api-production.up.railway.app"},
                {"label": "Deploy", "value": "Auto from GitHub main branch"},
                {"label": "Login", "value": "founder@carryon.us", "sensitive": True},
            ],
        },
        {
            "id": "vercel",
            "name": "Vercel",
            "status": "active",
            "dashboard_url": "https://vercel.com/dashboard",
            "details": [
                {"label": "Project", "value": "carry-on-live"},
                {"label": "Plan", "value": "Pro ($20/mo base)"},
                {"label": "Domain", "value": "app.carryon.us"},
                {"label": "Root Dir", "value": "frontend"},
                {"label": "Build Opt", "value": "ignoreCommand active (skip backend-only changes)"},
                {"label": "Team ID", "value": "team_10xq6XsCe1dQwbo61np48Qn0"},
                {"label": "Login", "value": "founder@carryon.us", "sensitive": True},
            ],
        },
        {
            "id": "mongodb",
            "name": "MongoDB Atlas",
            "status": "active",
            "dashboard_url": "https://cloud.mongodb.com",
            "details": [
                {"label": "Cluster", "value": "CarryOnPreBeta"},
                {"label": "Plan", "value": "M30 (~$394/mo)"},
                {"label": "Region", "value": "AWS / N. Virginia (us-east-1)"},
                {"label": "Version", "value": "MongoDB 8.0.20"},
                {"label": "Nodes", "value": "Replica Set (3 nodes)"},
                {"label": "Backups", "value": "Active"},
                {"label": "Connection", "value": m(os.environ.get("MONGO_URL", "")), "sensitive": True},
                {"label": "Login", "value": "founder@carryon.us", "sensitive": True},
            ],
        },
        {
            "id": "s3",
            "name": "AWS S3",
            "status": "active",
            "dashboard_url": "https://s3.console.aws.amazon.com/s3/buckets/carryon-vault?region=us-east-2",
            "details": [
                {"label": "Bucket", "value": "carryon-vault"},
                {"label": "Region", "value": "us-east-2 (Ohio)"},
                {"label": "Plan", "value": "Pay-as-you-go (~$5/mo current)"},
                {"label": "Encryption", "value": "AES-256-GCM (app) + SSE-S3"},
                {"label": "Access Key", "value": m(os.environ.get("AWS_ACCESS_KEY_ID", "")), "sensitive": True},
                {"label": "Secret Key", "value": m(os.environ.get("AWS_SECRET_ACCESS_KEY", "")), "sensitive": True},
                {"label": "IAM Console", "value": "console.aws.amazon.com/iam"},
            ],
        },
        {
            "id": "stripe",
            "name": "Stripe",
            "status": "active",
            "dashboard_url": "https://dashboard.stripe.com",
            "details": [
                {"label": "Plan", "value": "Standard (2.9% + $0.30/txn)"},
                {"label": "Mode", "value": "Live"},
                {"label": "Webhooks", "value": "dashboard.stripe.com/webhooks"},
                {"label": "Live Key", "value": m(os.environ.get("STRIPE_API_KEY", "")), "sensitive": True},
                {"label": "Login", "value": "founder@carryon.us", "sensitive": True},
            ],
        },
        {
            "id": "apple_iap",
            "name": "Apple App Store / StoreKit 2",
            "status": "active",
            "dashboard_url": "https://appstoreconnect.apple.com",
            "details": [
                {"label": "Plan", "value": "Developer Program ($99/yr)"},
                {"label": "App ID", "value": "us.carryon.app"},
                {"label": "Commission", "value": "15% (Small Business) or 30%"},
                {"label": "Shared Secret", "value": m(os.environ.get("APPLE_SHARED_SECRET", "")), "sensitive": True},
                {"label": "Developer Portal", "value": "developer.apple.com/account"},
                {"label": "Login", "value": "founder@carryon.us", "sensitive": True},
            ],
        },
        {
            "id": "xai",
            "name": "xAI (Grok)",
            "status": "active",
            "dashboard_url": "https://console.x.ai",
            "details": [
                {"label": "Purpose", "value": "Estate Guardian AI Chat"},
                {"label": "Models", "value": "Grok-4 (heavy) + Grok-3-mini (light)"},
                {"label": "Credits", "value": "$500 purchased (tracked in System Health)"},
                {"label": "Pricing", "value": "Grok-4: $3/$15 per 1M tokens (in/out)"},
                {"label": "Team ID", "value": os.environ.get("XAI_TEAM_ID", "N/A")},
                {"label": "API Key", "value": m(os.environ.get("XAI_API_KEY", "")), "sensitive": True},
                {"label": "Usage", "value": "console.x.ai/team/usage"},
            ],
        },
        {
            "id": "resend",
            "name": "Resend",
            "status": "active",
            "dashboard_url": "https://resend.com/overview",
            "details": [
                {"label": "Purpose", "value": "Transactional emails (OTP, billing, digests)"},
                {"label": "Plan", "value": "Pro ($20/mo, 50K emails)"},
                {"label": "Sender", "value": os.environ.get("SENDER_EMAIL", "N/A")},
                {"label": "API Key", "value": m(os.environ.get("RESEND_API_KEY", "")), "sensitive": True},
                {"label": "Billing", "value": "resend.com/settings/billing"},
                {"label": "Login", "value": "founder@carryon.us", "sensitive": True},
            ],
        },
        {
            "id": "twilio",
            "name": "Twilio",
            "status": "blocked",
            "dashboard_url": "https://console.twilio.com",
            "details": [
                {"label": "Purpose", "value": "SMS OTP Authentication"},
                {"label": "Status", "value": "Blocked — awaiting A2P 10DLC approval"},
                {"label": "Phone", "value": os.environ.get("TWILIO_PHONE_NUMBER", "N/A")},
                {"label": "Account SID", "value": m(os.environ.get("TWILIO_ACCOUNT_SID", "")), "sensitive": True},
                {"label": "Auth Token", "value": m(os.environ.get("TWILIO_AUTH_TOKEN", "")), "sensitive": True},
                {"label": "10DLC Status", "value": "console.twilio.com/.../10dlc"},
            ],
        },
        {
            "id": "capgo",
            "name": "Capgo",
            "status": "active",
            "dashboard_url": "https://console.capgo.app",
            "details": [
                {"label": "Purpose", "value": "OTA live updates (skip App Store review)"},
                {"label": "Plan", "value": "Maker ($39/mo, 10K MAU)"},
                {"label": "App ID", "value": "us.carryon.app"},
                {"label": "Channel", "value": "production"},
                {"label": "Current Version", "value": "0.1.0"},
                {"label": "Login", "value": "founder@carryon.us", "sensitive": True},
            ],
        },
        {
            "id": "capacitor",
            "name": "Capacitor",
            "status": "free/self-hosted",
            "dashboard_url": None,
            "details": [
                {"label": "Purpose", "value": "Native iOS/Android app wrapper"},
                {"label": "Version", "value": "Capacitor 6"},
                {"label": "Cost", "value": "$0/mo (open source)"},
                {"label": "Plugins", "value": "Camera, Biometrics, Push, Share, Filesystem"},
                {"label": "App ID", "value": "us.carryon.app"},
            ],
        },
        {
            "id": "google_places",
            "name": "Google Places API",
            "status": "active",
            "dashboard_url": "https://console.cloud.google.com/apis/dashboard",
            "details": [
                {"label": "Purpose", "value": "Address autocomplete"},
                {"label": "Plan", "value": "Pay-as-you-go ($200/mo free credit)"},
                {"label": "Cost", "value": "~$0-50/mo"},
                {"label": "Billing", "value": "console.cloud.google.com/billing"},
            ],
        },
        {
            "id": "webauthn",
            "name": "WebAuthn / FIDO2",
            "status": "free/self-hosted",
            "dashboard_url": None,
            "details": [
                {"label": "Purpose", "value": "Passkey / biometric login"},
                {"label": "Library", "value": "py-webauthn"},
                {"label": "Cost", "value": "$0/mo (open standard)"},
            ],
        },
        {
            "id": "vapid",
            "name": "Web Push (VAPID)",
            "status": "free/self-hosted",
            "dashboard_url": None,
            "details": [
                {"label": "Purpose", "value": "Browser push notifications"},
                {"label": "Library", "value": "pywebpush"},
                {"label": "Cost", "value": "$0/mo (self-hosted)"},
                {"label": "Claims Email", "value": os.environ.get("VAPID_CLAIMS_EMAIL", "N/A")},
            ],
        },
        {
            "id": "jwt",
            "name": "JWT Authentication",
            "status": "free/self-hosted",
            "dashboard_url": None,
            "details": [
                {"label": "Purpose", "value": "User session tokens"},
                {"label": "Algorithm", "value": "HS256"},
                {"label": "Cost", "value": "$0/mo"},
                {"label": "Secret", "value": m(os.environ.get("JWT_SECRET", "")), "sensitive": True},
            ],
        },
        {
            "id": "voice_biometrics",
            "name": "Voice Biometrics",
            "status": "free/self-hosted",
            "dashboard_url": None,
            "details": [
                {"label": "Purpose", "value": "Voice-based identity verification"},
                {"label": "Libraries", "value": "librosa, scipy, numpy"},
                {"label": "Processing", "value": "130-dim voiceprints, local CPU"},
                {"label": "Cost", "value": "$0/mo (CPU absorbed by Railway)"},
            ],
        },
        {
            "id": "pdf_tools",
            "name": "PDF Tools",
            "status": "free/self-hosted",
            "dashboard_url": None,
            "details": [
                {"label": "Purpose", "value": "Estate PDF export & document parsing"},
                {"label": "Libraries", "value": "fpdf2, pdfplumber, Pillow"},
                {"label": "Cost", "value": "$0/mo"},
            ],
        },
    ]

    return {"integrations": integrations}


# ══════════════════════════════════════════════════════════
# ANNOUNCEMENTS (Founder creates, everyone reads)
# ══════════════════════════════════════════════════════════


class AnnouncementCreate(BaseModel):
    title: str
    body: str
    audience: str = "all"  # all, benefactors, beneficiaries, operators
    priority: str = "info"  # info, warning, critical


@router.post("/admin/announcements")
async def create_announcement(
    data: AnnouncementCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_founder(current_user)
    now = datetime.now(timezone.utc)
    announcement = {
        "id": str(uuid4()),
        "title": data.title,
        "body": data.body,
        "audience": data.audience,
        "priority": data.priority,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", current_user["email"]),
        "created_at": now.isoformat(),
        "is_active": True,
    }
    await db.announcements.insert_one(announcement)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="announcement_create",
        category="platform",
        resource_type="announcement",
        resource_id=announcement["id"],
        details={"title": data.title, "audience": data.audience},
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {k: v for k, v in announcement.items() if k != "_id"}


@router.get("/admin/announcements")
async def list_announcements(
    active_only: bool = Query(True),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    query = {"is_active": True} if active_only else {}
    items = await db.announcements.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


@router.delete("/admin/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_founder(current_user)
    result = await db.announcements.update_one(
        {"id": announcement_id},
        {
            "$set": {
                "is_active": False,
                "deactivated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="announcement_delete",
        category="platform",
        resource_type="announcement",
        resource_id=announcement_id,
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {"deleted": True}


# ══════════════════════════════════════════════════════════
# SYSTEM HEALTH (Founder only)
# ══════════════════════════════════════════════════════════


@router.get("/admin/xai-credits")
async def get_xai_credits(current_user: dict = Depends(get_current_user)):
    """Get xAI credit balance and usage for the founder dashboard."""
    require_founder(current_user)
    import os

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Get the admin-configured credit balance (set initial = $500 default)
    settings = await db.admin_settings.find_one({"id": "xai_credits"}, {"_id": 0})
    initial_balance = settings.get("balance_usd", 500.0) if settings else 500.0

    # Aggregate total usage from internal tracking
    pipeline = [
        {"$group": {"_id": None, "total_cost": {"$sum": "$cost_usd"}, "total_input": {"$sum": "$input_tokens"}, "total_output": {"$sum": "$output_tokens"}}}
    ]
    total_usage = await db.xai_usage.aggregate(pipeline).to_list(1)
    total_spent = total_usage[0]["total_cost"] if total_usage else 0.0

    # This month's usage
    month_pipeline = [
        {"$match": {"timestamp": {"$gte": month_start}}},
        {"$group": {"_id": None, "cost": {"$sum": "$cost_usd"}, "input_t": {"$sum": "$input_tokens"}, "output_t": {"$sum": "$output_tokens"}, "calls": {"$sum": 1}}}
    ]
    month_usage = await db.xai_usage.aggregate(month_pipeline).to_list(1)
    month_data = month_usage[0] if month_usage else {"cost": 0, "input_t": 0, "output_t": 0, "calls": 0}

    # Today's usage
    today_pipeline = [
        {"$match": {"timestamp": {"$gte": today_start}}},
        {"$group": {"_id": None, "cost": {"$sum": "$cost_usd"}, "calls": {"$sum": 1}}}
    ]
    today_usage = await db.xai_usage.aggregate(today_pipeline).to_list(1)
    today_data = today_usage[0] if today_usage else {"cost": 0, "calls": 0}

    # Daily breakdown (last 7 days)
    seven_days_ago = (now - __import__("datetime").timedelta(days=7)).isoformat()
    daily_pipeline = [
        {"$match": {"timestamp": {"$gte": seven_days_ago}}},
        {"$group": {"_id": "$date", "cost": {"$sum": "$cost_usd"}, "calls": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    daily_breakdown = await db.xai_usage.aggregate(daily_pipeline).to_list(7)

    remaining = round(initial_balance - total_spent, 2)

    # Warning levels
    if remaining <= 25:
        warning_level = "critical"
    elif remaining <= 100:
        warning_level = "warning"
    else:
        warning_level = "healthy"

    # Guardian sessions
    guardian_today = await db.guardian_sessions.count_documents({"updated_at": {"$gte": today_start}})
    guardian_month = await db.guardian_sessions.count_documents({"updated_at": {"$gte": month_start}})

    return {
        "initial_balance_usd": initial_balance,
        "total_spent_usd": round(total_spent, 2),
        "balance_usd": remaining,
        "warning_level": warning_level,
        "month_spent_usd": round(month_data["cost"], 2),
        "month_calls": month_data.get("calls", 0),
        "month_input_tokens": month_data.get("input_t", 0),
        "month_output_tokens": month_data.get("output_t", 0),
        "today_spent_usd": round(today_data["cost"], 4),
        "today_calls": today_data.get("calls", 0),
        "daily_breakdown": [{"date": d["_id"], "cost": round(d["cost"], 4), "calls": d["calls"]} for d in daily_breakdown],
        "guardian_sessions_today": guardian_today,
        "guardian_sessions_month": guardian_month,
    }


class XAICreditBalanceUpdate(BaseModel):
    balance_usd: float


@router.post("/admin/xai-credits/set-balance")
async def set_xai_credit_balance(data: XAICreditBalanceUpdate, current_user: dict = Depends(get_current_user)):
    """Set the xAI credit balance (call this when you top up credits)."""
    require_founder(current_user)

    # Reset: set new initial balance and clear all tracked usage
    await db.admin_settings.update_one(
        {"id": "xai_credits"},
        {"$set": {"id": "xai_credits", "balance_usd": data.balance_usd, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    # Clear usage history since we're resetting the balance
    await db.xai_usage.delete_many({})

    return {"success": True, "balance_usd": data.balance_usd}


@router.get("/admin/system-health")
async def get_system_health(current_user: dict = Depends(get_current_user)):
    require_staff(current_user)
    now = datetime.now(timezone.utc)

    # Collection stats
    users_count = await db.users.count_documents({})
    estates_count = await db.estates.count_documents({})
    docs_count = await db.documents.count_documents({})
    msgs_count = await db.messages.count_documents({})
    audit_count = await db.audit_trail.count_documents({})

    # Active sessions (tokens issued in last 24h)
    from datetime import timedelta

    day_ago = (now - timedelta(hours=24)).isoformat()
    active_sessions = await db.users.count_documents({"last_login": {"$gte": day_ago}})

    # Recent errors (last 24h)
    recent_errors = await db.client_errors.count_documents({"created_at": {"$gte": day_ago}})

    # Audit events today
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    audit_today = await db.audit_trail.count_documents({"timestamp": {"$gte": today_start}})

    # Support queue
    open_tickets = await db.support_conversations.count_documents(
        {"status": {"$ne": "resolved"}, "deleted_at": {"$exists": False}}
    )

    return {
        "timestamp": now.isoformat(),
        "database": {
            "users": users_count,
            "estates": estates_count,
            "documents": docs_count,
            "messages": msgs_count,
            "audit_entries": audit_count,
        },
        "activity": {
            "active_sessions_24h": active_sessions,
            "client_errors_24h": recent_errors,
            "audit_events_today": audit_today,
        },
        "queues": {
            "open_support_tickets": open_tickets,
        },
        "status": "healthy",
    }


# ══════════════════════════════════════════════════════════
# MY ACTIVITY LOG (Operator sees own actions)
# ══════════════════════════════════════════════════════════


@router.get("/ops/my-activity")
async def get_my_activity(
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    entries = (
        await db.audit_trail.find({"actor_id": current_user["id"]}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
        .to_list(limit)
    )
    return entries


# ══════════════════════════════════════════════════════════
# QUICK SEARCH (Search across all queues)
# ══════════════════════════════════════════════════════════


@router.get("/ops/search")
async def quick_search(
    q: str = Query(..., min_length=2),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    query_lower = q.lower()
    results = []

    # Search support conversations
    support = await db.support_conversations.find(
        {"deleted_at": {"$exists": False}},
        {"_id": 0, "id": 1, "user_email": 1, "user_name": 1, "status": 1, "subject": 1},
    ).to_list(500)
    for s in support:
        if (
            query_lower in (s.get("user_email", "") or "").lower()
            or query_lower in (s.get("user_name", "") or "").lower()
            or query_lower in (s.get("subject", "") or "").lower()
        ):
            results.append(
                {
                    "type": "support",
                    "id": s["id"],
                    "title": s.get("subject", s.get("user_name", "Support Ticket")),
                    "subtitle": s.get("user_email", ""),
                    "status": s.get("status", ""),
                }
            )

    # Search users
    users = await db.users.find(
        {
            "$or": [
                {"email": {"$regex": q, "$options": "i"}},
                {"name": {"$regex": q, "$options": "i"}},
            ]
        },
        {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1},
    ).to_list(20)
    for u in users:
        results.append(
            {
                "type": "user",
                "id": u["id"],
                "title": u.get("name", u["email"]),
                "subtitle": u["email"],
                "status": u.get("role", ""),
            }
        )

    # Search DTS tasks
    dts = await db.dts_tasks.find(
        {"deleted_at": {"$exists": False}},
        {"_id": 0, "id": 1, "benefactor_name": 1, "benefactor_email": 1, "status": 1},
    ).to_list(500)
    for d in dts:
        if (
            query_lower in (d.get("benefactor_email", "") or "").lower()
            or query_lower in (d.get("benefactor_name", "") or "").lower()
        ):
            results.append(
                {
                    "type": "dts",
                    "id": d["id"],
                    "title": d.get("benefactor_name", "DTS Task"),
                    "subtitle": d.get("benefactor_email", ""),
                    "status": d.get("status", ""),
                }
            )

    # Search verifications
    verifications = await db.id_verifications.find(
        {"deleted_at": {"$exists": False}},
        {
            "_id": 0,
            "id": 1,
            "user_email": 1,
            "user_name": 1,
            "status": 1,
            "verification_type": 1,
        },
    ).to_list(500)
    for v in verifications:
        if (
            query_lower in (v.get("user_email", "") or "").lower()
            or query_lower in (v.get("user_name", "") or "").lower()
        ):
            results.append(
                {
                    "type": "verification",
                    "id": v["id"],
                    "title": v.get("user_name", "Verification"),
                    "subtitle": v.get("verification_type", v.get("user_email", "")),
                    "status": v.get("status", ""),
                }
            )

    return results[:50]


# ══════════════════════════════════════════════════════════
# ESCALATIONS (Operator creates, Founder sees/resolves)
# ══════════════════════════════════════════════════════════


class EscalationCreate(BaseModel):
    subject: str
    description: str
    priority: str = "normal"  # low, normal, high, critical
    related_type: str = ""  # support, dts, verification, tvt
    related_id: str = ""


@router.post("/ops/escalations")
async def create_escalation(
    data: EscalationCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    now = datetime.now(timezone.utc)
    escalation = {
        "id": str(uuid4()),
        "subject": data.subject,
        "description": data.description,
        "priority": data.priority,
        "related_type": data.related_type,
        "related_id": data.related_id,
        "status": "open",
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name", current_user["email"]),
        "created_at": now.isoformat(),
        "resolved_at": None,
        "resolved_by": None,
        "resolution_note": None,
    }
    await db.escalations.insert_one(escalation)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "operator"),
        action="escalation_create",
        category="operations",
        resource_type="escalation",
        resource_id=escalation["id"],
        details={"subject": data.subject, "priority": data.priority},
        ip_address=get_client_ip(request),
        severity="warning" if data.priority in ("high", "critical") else "info",
    )
    return {k: v for k, v in escalation.items() if k != "_id"}


@router.get("/ops/escalations")
async def list_escalations(
    status: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    query = {}
    if status:
        query["status"] = status
    # Operators see their own; founders see all
    if current_user.get("role") == "operator":
        query["created_by"] = current_user["id"]
    items = await db.escalations.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items


class EscalationResolve(BaseModel):
    resolution_note: str


@router.put("/ops/escalations/{escalation_id}/resolve")
async def resolve_escalation(
    escalation_id: str,
    data: EscalationResolve,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_founder(current_user)
    now = datetime.now(timezone.utc)
    result = await db.escalations.update_one(
        {"id": escalation_id, "status": "open"},
        {
            "$set": {
                "status": "resolved",
                "resolved_at": now.isoformat(),
                "resolved_by": current_user["id"],
                "resolved_by_name": current_user.get("name", current_user["email"]),
                "resolution_note": data.resolution_note,
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Escalation not found or already resolved")
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="escalation_resolve",
        category="operations",
        resource_type="escalation",
        resource_id=escalation_id,
        details={"resolution_note": data.resolution_note[:200]},
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {"resolved": True}


# ══════════════════════════════════════════════════════════
# SHIFT NOTES (Operators leave notes for each other)
# ══════════════════════════════════════════════════════════


class ShiftNoteCreate(BaseModel):
    content: str
    category: str = "general"  # general, urgent, followup


@router.post("/ops/shift-notes")
async def create_shift_note(
    data: ShiftNoteCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    now = datetime.now(timezone.utc)
    note = {
        "id": str(uuid4()),
        "content": data.content,
        "category": data.category,
        "author_id": current_user["id"],
        "author_name": current_user.get("name", current_user["email"]),
        "created_at": now.isoformat(),
        "acknowledged_by": [],
    }
    await db.shift_notes.insert_one(note)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user.get("role", "operator"),
        action="shift_note_create",
        category="operations",
        resource_type="shift_note",
        resource_id=note["id"],
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {k: v for k, v in note.items() if k != "_id"}


@router.get("/ops/shift-notes")
async def list_shift_notes(
    limit: int = Query(30, le=100),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    items = await db.shift_notes.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items


@router.post("/ops/shift-notes/{note_id}/acknowledge")
async def acknowledge_shift_note(
    note_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    await db.shift_notes.update_one(
        {"id": note_id},
        {
            "$addToSet": {
                "acknowledged_by": {
                    "user_id": current_user["id"],
                    "name": current_user.get("name", current_user["email"]),
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            }
        },
    )
    return {"acknowledged": True}


# ══════════════════════════════════════════════════════════
# KNOWLEDGE BASE / SOPs (Founder creates, operators read)
# ══════════════════════════════════════════════════════════


class KBArticleCreate(BaseModel):
    title: str
    content: str
    category: str = "general"  # general, support, verification, dts, tvt
    tags: list[str] = []


@router.post("/admin/knowledge-base")
async def create_kb_article(
    data: KBArticleCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_founder(current_user)
    now = datetime.now(timezone.utc)
    article = {
        "id": str(uuid4()),
        "title": data.title,
        "content": data.content,
        "category": data.category,
        "tags": data.tags,
        "author_id": current_user["id"],
        "author_name": current_user.get("name", current_user["email"]),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.knowledge_base.insert_one(article)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="kb_article_create",
        category="platform",
        resource_type="kb_article",
        resource_id=article["id"],
        details={"title": data.title},
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {k: v for k, v in article.items() if k != "_id"}


@router.get("/admin/knowledge-base")
async def list_kb_articles(
    category: str = Query(""),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    query = {"deleted_at": None}
    if category:
        query["category"] = category
    items = await db.knowledge_base.find(query, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return items


@router.put("/admin/knowledge-base/{article_id}")
async def update_kb_article(
    article_id: str,
    data: KBArticleCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_founder(current_user)
    result = await db.knowledge_base.update_one(
        {"id": article_id},
        {
            "$set": {
                "title": data.title,
                "content": data.content,
                "category": data.category,
                "tags": data.tags,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"updated": True}


@router.delete("/admin/knowledge-base/{article_id}")
async def delete_kb_article(
    article_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    require_founder(current_user)
    result = await db.knowledge_base.update_one(
        {"id": article_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )  # soft_delete
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role="admin",
        action="kb_article_delete",
        category="platform",
        resource_type="kb_article",
        resource_id=article_id,
        ip_address=get_client_ip(request),
        severity="info",
    )
    return {"deleted": True}
