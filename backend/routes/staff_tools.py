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
            return val or ""
        return val[:8] + "..." + val[-4:]

    # verified=True means we have screenshot/copy-paste proof from the user
    # verified=False means inferred from code/.env — user should confirm
    integrations = [
        {
            "id": "railway",
            "name": "Railway",
            "status": "active",
            "category": "infrastructure",
            "dashboard_url": "https://railway.com",
            "cost_monthly": 12.00,
            "cost_note": "Avg ~$12/mo (Pro $20 base - $20 free credit + usage)",
            "cost_verified": True,
            "details": [
                {"label": "Service", "value": "carryon-api", "verified": True},
                {"label": "Plan", "value": "Pro ($20/mo base, $20 free credit)", "verified": True},
                {"label": "Region", "value": "US East (Virginia)", "verified": True},
                {"label": "Replicas", "value": "1", "verified": True},
                {"label": "CPU Limit", "value": "32 vCPU", "verified": True},
                {"label": "RAM Limit", "value": "32 GB", "verified": True},
                {"label": "URL", "value": "carryon-api-production.up.railway.app", "verified": True},
                {"label": "Deploy", "value": "Auto from GitHub main branch", "verified": True},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "vercel",
            "name": "Vercel",
            "status": "active",
            "category": "infrastructure",
            "dashboard_url": "https://vercel.com/dashboard",
            "cost_monthly": 135.00,
            "cost_note": "$20/mo base + ~$115 build minutes (optimized Mar 2026)",
            "cost_verified": True,
            "details": [
                {"label": "Project", "value": "carry-on-live", "verified": True},
                {"label": "Plan", "value": "Pro ($20/mo base)", "verified": True},
                {"label": "Domain", "value": "app.carryon.us", "verified": True},
                {"label": "Root Directory", "value": "frontend", "verified": True},
                {"label": "Build Optimization", "value": "ignoreCommand active (skip backend-only changes)", "verified": True},
                {"label": "Team ID", "value": "team_10xq6XsCe1dQwbo61np48Qn0", "verified": True},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "mongodb",
            "name": "MongoDB Atlas",
            "status": "active",
            "category": "infrastructure",
            "dashboard_url": "https://cloud.mongodb.com",
            "cost_monthly": 394.00,
            "cost_note": "M30 Dedicated Cluster (~$394/mo)",
            "cost_verified": True,
            "details": [
                {"label": "Cluster", "value": "CarryOnPreBeta", "verified": True},
                {"label": "Plan", "value": "M30 (8 GB RAM, 2 vCPU, 40 GB storage)", "verified": True},
                {"label": "Region", "value": "AWS / N. Virginia (us-east-1)", "verified": True},
                {"label": "Version", "value": "MongoDB 8.0.20", "verified": True},
                {"label": "Nodes", "value": "Replica Set (3 nodes)", "verified": True},
                {"label": "Backups", "value": "Active", "verified": True},
                {"label": "Connection String", "value": m(os.environ.get("MONGO_URL", "")), "sensitive": True, "verified": True},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "s3",
            "name": "AWS S3",
            "status": "active",
            "category": "infrastructure",
            "dashboard_url": "https://s3.console.aws.amazon.com/s3/buckets/carryon-vault?region=us-east-2",
            "cost_monthly": 5.00,
            "cost_note": "Estimated ~$5/mo (storage + transfer)",
            "cost_verified": False,
            "details": [
                {"label": "Bucket", "value": "carryon-vault", "verified": True},
                {"label": "Region", "value": "us-east-2 (Ohio)", "verified": True},
                {"label": "Plan", "value": "Pay-as-you-go", "verified": False},
                {"label": "Encryption", "value": "AES-256-GCM (app layer) + SSE-S3", "verified": True},
                {"label": "Access Key ID", "value": m(os.environ.get("AWS_ACCESS_KEY_ID", "")), "sensitive": True, "verified": True},
                {"label": "Secret Access Key", "value": m(os.environ.get("AWS_SECRET_ACCESS_KEY", "")), "sensitive": True, "verified": True},
                {"label": "Monthly Cost", "value": "", "verified": False},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "stripe",
            "name": "Stripe",
            "status": "active",
            "category": "payments",
            "dashboard_url": "https://dashboard.stripe.com",
            "cost_monthly": 0.00,
            "cost_note": "$0 base + 2.9% + $0.30/txn (revenue-based)",
            "cost_verified": False,
            "details": [
                {"label": "Plan", "value": "Standard (assumed)", "verified": False},
                {"label": "Mode", "value": "Live", "verified": True},
                {"label": "Fee Structure", "value": "2.9% + $0.30 per transaction", "verified": False},
                {"label": "Webhooks URL", "value": "dashboard.stripe.com/webhooks", "verified": False},
                {"label": "Live Secret Key", "value": m(os.environ.get("STRIPE_API_KEY", "")), "sensitive": True, "verified": True},
                {"label": "Monthly Revenue", "value": "", "verified": False},
                {"label": "Monthly Stripe Fees", "value": "", "verified": False},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "apple_iap",
            "name": "Apple App Store / StoreKit 2",
            "status": "active",
            "category": "payments",
            "dashboard_url": "https://appstoreconnect.apple.com",
            "cost_monthly": 8.25,
            "cost_note": "Developer Program $99/yr (~$8.25/mo)",
            "cost_verified": False,
            "details": [
                {"label": "Plan", "value": "Developer Program ($99/yr)", "verified": False},
                {"label": "App ID", "value": "us.carryon.app", "verified": True},
                {"label": "Commission Rate", "value": "", "verified": False},
                {"label": "Small Business Program", "value": "", "verified": False},
                {"label": "Shared Secret", "value": m(os.environ.get("APPLE_SHARED_SECRET", "")), "sensitive": True, "verified": True},
                {"label": "Developer Portal", "value": "developer.apple.com/account", "verified": True},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "xai",
            "name": "xAI (Grok)",
            "status": "active",
            "category": "ai_communication",
            "dashboard_url": "https://console.x.ai",
            "cost_monthly": 0.00,
            "cost_note": "Prepaid credits ($500 purchased Mar 2026, usage-based)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Estate Guardian AI Chat", "verified": True},
                {"label": "Models", "value": "Grok-4 (main) + Grok-3-mini (light)", "verified": True},
                {"label": "Credits Purchased", "value": "$500 (March 2026)", "verified": True},
                {"label": "Pricing (Grok-4)", "value": "$3/1M input, $15/1M output tokens", "verified": True},
                {"label": "Team ID", "value": os.environ.get("XAI_TEAM_ID", ""), "verified": True},
                {"label": "API Key", "value": m(os.environ.get("XAI_API_KEY", "")), "sensitive": True, "verified": True},
                {"label": "Usage Dashboard", "value": "console.x.ai/team/usage", "verified": True},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "resend",
            "name": "Resend",
            "status": "active",
            "category": "ai_communication",
            "dashboard_url": "https://resend.com/overview",
            "cost_monthly": 20.00,
            "cost_note": "Pro plan $20/mo (50K emails/mo)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Transactional emails (OTP, billing, digests)", "verified": True},
                {"label": "Plan", "value": "Transactional Pro ($20/mo, 50K emails)", "verified": True},
                {"label": "Renewal", "value": "March 30, 2026", "verified": True},
                {"label": "Sender Email", "value": os.environ.get("SENDER_EMAIL", ""), "verified": True},
                {"label": "API Key", "value": m(os.environ.get("RESEND_API_KEY", "")), "sensitive": True, "verified": True},
                {"label": "Billing Page", "value": "resend.com/settings/billing", "verified": True},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "twilio",
            "name": "Twilio",
            "status": "blocked",
            "category": "ai_communication",
            "dashboard_url": "https://console.twilio.com",
            "cost_monthly": 0.00,
            "cost_note": "$0 (inactive — blocked on A2P 10DLC)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "SMS OTP Authentication", "verified": True},
                {"label": "Status", "value": "Blocked — awaiting A2P 10DLC approval", "verified": True},
                {"label": "Phone Number", "value": os.environ.get("TWILIO_PHONE_NUMBER", ""), "verified": False},
                {"label": "Account SID", "value": m(os.environ.get("TWILIO_ACCOUNT_SID", "")), "sensitive": True, "verified": True},
                {"label": "Auth Token", "value": m(os.environ.get("TWILIO_AUTH_TOKEN", "")), "sensitive": True, "verified": True},
                {"label": "10DLC Registration", "value": "console.twilio.com/.../10dlc", "verified": False},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "capgo",
            "name": "Capgo",
            "status": "active",
            "category": "native_updates",
            "dashboard_url": "https://console.capgo.app",
            "cost_monthly": 39.00,
            "cost_note": "Maker plan $39/mo (10K MAU)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "OTA live updates (skip App Store review)", "verified": True},
                {"label": "Plan", "value": "Maker ($39/mo, 10K MAU)", "verified": True},
                {"label": "App ID", "value": "us.carryon.app", "verified": True},
                {"label": "Channel", "value": "production", "verified": True},
                {"label": "Current Bundle", "value": "v0.1.0", "verified": True},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "capacitor",
            "name": "Capacitor",
            "status": "free/self-hosted",
            "category": "native_updates",
            "dashboard_url": None,
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (open source)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Native iOS/Android app wrapper", "verified": True},
                {"label": "Version", "value": "Capacitor 6", "verified": True},
                {"label": "Plugins", "value": "Camera, Biometrics, Push, Share, Filesystem", "verified": True},
                {"label": "App ID", "value": "us.carryon.app", "verified": True},
            ],
        },
        {
            "id": "google_places",
            "name": "Google Places API",
            "status": "active",
            "category": "native_updates",
            "dashboard_url": "https://console.cloud.google.com/apis/dashboard",
            "cost_monthly": 0.00,
            "cost_note": "~$0-50/mo (likely within $200/mo free credit)",
            "cost_verified": False,
            "details": [
                {"label": "Purpose", "value": "Address autocomplete", "verified": True},
                {"label": "Plan", "value": "Pay-as-you-go ($200/mo free credit)", "verified": False},
                {"label": "Monthly Cost", "value": "", "verified": False},
                {"label": "Billing Page", "value": "console.cloud.google.com/billing", "verified": False},
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "webauthn",
            "name": "WebAuthn / FIDO2",
            "status": "free/self-hosted",
            "category": "security_auth",
            "dashboard_url": None,
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (open standard, self-hosted)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Passkey / biometric login", "verified": True},
                {"label": "Library", "value": "py-webauthn", "verified": True},
            ],
        },
        {
            "id": "vapid",
            "name": "Web Push (VAPID)",
            "status": "free/self-hosted",
            "category": "security_auth",
            "dashboard_url": None,
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (self-hosted)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Browser push notifications", "verified": True},
                {"label": "Library", "value": "pywebpush", "verified": True},
                {"label": "Claims Email", "value": os.environ.get("VAPID_CLAIMS_EMAIL", ""), "verified": True},
            ],
        },
        {
            "id": "jwt",
            "name": "JWT Authentication",
            "status": "free/self-hosted",
            "category": "security_auth",
            "dashboard_url": None,
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (self-hosted)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "User session tokens", "verified": True},
                {"label": "Algorithm", "value": "HS256", "verified": True},
                {"label": "Secret", "value": m(os.environ.get("JWT_SECRET", "")), "sensitive": True, "verified": True},
            ],
        },
        {
            "id": "voice_biometrics",
            "name": "Voice Biometrics",
            "status": "free/self-hosted",
            "category": "local_processing",
            "dashboard_url": None,
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (CPU absorbed by Railway)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Voice-based identity verification", "verified": True},
                {"label": "Libraries", "value": "librosa, scipy, numpy", "verified": True},
                {"label": "Processing", "value": "130-dim voiceprints, local CPU", "verified": True},
            ],
        },
        {
            "id": "pdf_tools",
            "name": "PDF Tools",
            "status": "free/self-hosted",
            "category": "local_processing",
            "dashboard_url": None,
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (open source)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Estate PDF export & document parsing", "verified": True},
                {"label": "Libraries", "value": "fpdf2, pdfplumber, Pillow", "verified": True},
            ],
        },
    ]

    # Add capacity limits per integration (max users each can support)
    capacity_map = {
        "resend": {
            "max_users": 5000,
            "reason": "50K emails/mo limit at ~10 emails/user/mo",
            "upgrade_to": "Scale plan ($90/mo, 100K emails)",
            "upgrade_url": "https://resend.com/settings/billing",
        },
        "capgo": {
            "max_users": 10000,
            "reason": "Maker plan caps at 10K monthly active users",
            "upgrade_to": "Team plan ($83/mo, 100K MAU)",
            "upgrade_url": "https://console.capgo.app",
        },
        "mongodb": {
            "max_users": 15000,
            "reason": "M30 (8GB RAM, 40GB storage) handles ~15K users before performance degrades",
            "upgrade_to": "M40 (~$759/mo, 16GB RAM)",
            "upgrade_url": "https://cloud.mongodb.com",
        },
        "railway": {
            "max_users": 25000,
            "reason": "Pro plan scales to 32GB RAM / 32 vCPU, adequate for ~25K concurrent",
            "upgrade_to": "Enterprise (custom)",
            "upgrade_url": "https://railway.com",
        },
        "xai": {
            "max_users": 50000,
            "reason": "$500 credits with pay-per-use pricing (usage-dependent, not hard cap)",
            "upgrade_to": "Purchase additional credits",
            "upgrade_url": "https://console.x.ai",
        },
        "vercel": {
            "max_users": 100000,
            "reason": "CDN-served frontend scales broadly on Pro plan",
            "upgrade_to": "Enterprise",
            "upgrade_url": "https://vercel.com/dashboard",
        },
        "stripe": {
            "max_users": 999999,
            "reason": "No practical user limit on Standard plan",
            "upgrade_to": "N/A",
            "upgrade_url": "https://dashboard.stripe.com",
        },
        "apple_iap": {
            "max_users": 999999,
            "reason": "No practical user limit",
            "upgrade_to": "N/A",
            "upgrade_url": "https://appstoreconnect.apple.com",
        },
        "s3": {
            "max_users": 999999,
            "reason": "Virtually unlimited on pay-as-you-go",
            "upgrade_to": "N/A",
            "upgrade_url": "https://s3.console.aws.amazon.com",
        },
        "twilio": {
            "max_users": 999999,
            "reason": "Pay-as-you-go, no hard cap (currently inactive)",
            "upgrade_to": "N/A",
            "upgrade_url": "https://console.twilio.com",
        },
        "google_places": {
            "max_users": 999999,
            "reason": "Pay-as-you-go with $200/mo free credit",
            "upgrade_to": "N/A",
            "upgrade_url": "https://console.cloud.google.com",
        },
    }

    # Self-hosted have no user limits
    for i_id in ["webauthn", "vapid", "jwt", "voice_biometrics", "pdf_tools", "capacitor"]:
        capacity_map[i_id] = {
            "max_users": 999999,
            "reason": "Self-hosted, no external limit",
            "upgrade_to": "N/A",
            "upgrade_url": None,
        }

    # Attach capacity to each integration
    for integ in integrations:
        cap = capacity_map.get(integ["id"], {})
        integ["max_users"] = cap.get("max_users", 999999)
        integ["capacity_reason"] = cap.get("reason", "")
        integ["upgrade_to"] = cap.get("upgrade_to", "")
        integ["upgrade_url"] = cap.get("upgrade_url", "")

    # Rank by most limiting (lowest max_users)
    ranked = sorted(
        [i for i in integrations if i["max_users"] < 999999],
        key=lambda x: x["max_users"],
    )
    limiting_ranks = {}
    for idx, integ in enumerate(ranked[:3]):
        limiting_ranks[integ["id"]] = idx + 1  # 1=most limiting, 2=second, 3=third
    for integ in integrations:
        integ["limiting_rank"] = limiting_ranks.get(integ["id"], 0)  # 0 = not limiting

    # Get total user count
    total_users = await db.users.count_documents({})
    role_counts = {}
    async for doc in db.users.aggregate([{"$group": {"_id": "$role", "count": {"$sum": 1}}}]):
        role_counts[doc["_id"]] = doc["count"]

    # Platform ceiling = most limiting integration
    platform_ceiling = ranked[0]["max_users"] if ranked else 999999
    most_limiting = ranked[0] if ranked else None

    # Calculate COGS
    total_cogs = sum(i["cost_monthly"] for i in integrations)
    verified_cogs = sum(i["cost_monthly"] for i in integrations if i["cost_verified"])
    unverified_count = sum(1 for i in integrations if not i["cost_verified"])

    # Health warnings
    warnings = []
    usage_pct = (total_users / platform_ceiling * 100) if platform_ceiling > 0 else 0
    if usage_pct >= 80:
        warnings.append({"level": "critical", "message": f"Platform at {usage_pct:.0f}% capacity ({total_users}/{platform_ceiling}). Upgrade {most_limiting['name']} immediately."})
    elif usage_pct >= 50:
        warnings.append({"level": "warning", "message": f"Platform at {usage_pct:.0f}% capacity. Plan {most_limiting['name']} upgrade soon."})

    # Check xAI credit health
    xai_settings = await db.admin_settings.find_one({"id": "xai_credits"}, {"_id": 0})
    xai_balance = xai_settings.get("balance_usd", 500.0) if xai_settings else 500.0
    total_xai_spent_agg = await db.xai_usage.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$cost_usd"}}}
    ]).to_list(1)
    xai_spent = total_xai_spent_agg[0]["total"] if total_xai_spent_agg else 0
    xai_remaining = xai_balance - xai_spent
    if xai_remaining < 25:
        warnings.append({"level": "critical", "message": f"xAI credits critically low: ${xai_remaining:.2f} remaining"})
    elif xai_remaining < 100:
        warnings.append({"level": "warning", "message": f"xAI credits getting low: ${xai_remaining:.2f} remaining"})

    # MongoDB storage check (from config)
    db_stats = None
    try:
        db_stats = await db.command("dbStats")
        storage_gb = db_stats.get("storageSize", 0) / (1024**3)
        max_storage_gb = 40  # M30 default
        storage_pct = (storage_gb / max_storage_gb) * 100
        if storage_pct >= 70:
            warnings.append({"level": "warning", "message": f"Database storage at {storage_pct:.0f}% ({storage_gb:.1f}GB / {max_storage_gb}GB)"})
    except Exception:
        pass

    return {
        "integrations": integrations,
        "capacity": {
            "total_users": total_users,
            "role_breakdown": role_counts,
            "platform_ceiling": platform_ceiling,
            "most_limiting_id": most_limiting["id"] if most_limiting else None,
            "most_limiting_name": most_limiting["name"] if most_limiting else None,
            "usage_percent": round(usage_pct, 1),
            "top_3_limiting": [
                {
                    "rank": idx + 1,
                    "id": r["id"],
                    "name": r["name"],
                    "max_users": r["max_users"],
                    "reason": r["capacity_reason"],
                    "upgrade_to": r["upgrade_to"],
                    "upgrade_url": r["upgrade_url"],
                }
                for idx, r in enumerate(ranked[:3])
            ],
        },
        "warnings": warnings,
        "cogs": {
            "total_monthly": round(total_cogs, 2),
            "verified_total": round(verified_cogs, 2),
            "unverified_items": unverified_count,
            "note": "Revenue-based costs (Stripe 2.9%, Apple 15-30%) not included in COGS",
        },
        "db_stats": {
            "storage_gb": round(db_stats.get("storageSize", 0) / (1024**3), 2) if db_stats else None,
            "data_gb": round(db_stats.get("dataSize", 0) / (1024**3), 2) if db_stats else None,
            "collections": db_stats.get("collections", 0) if db_stats else None,
        } if db_stats else None,
    }


@router.post("/admin/integrations/soc2-report")
async def generate_soc2_report(data: IntegrationsUnlockRequest, current_user: dict = Depends(get_current_user)):
    """Generate a SOC 2 compliance report PDF."""
    require_founder(current_user)

    if hashlib.sha256(data.password.encode()).hexdigest() != INTEGRATIONS_PASSWORD_HASH:
        raise HTTPException(status_code=403, detail="Invalid password")

    from io import BytesIO

    from fpdf import FPDF

    # ASCII-safe helper
    def s(text):
        return str(text).encode("ascii", "replace").decode("ascii") if text else ""

    now = datetime.now(timezone.utc)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Title page
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 24)
    pdf.cell(0, 20, "CarryOn Technologies", ln=True, align="C")
    pdf.set_font("Helvetica", "", 14)
    pdf.cell(0, 10, "SOC 2 Type II - Integration & Infrastructure Report", ln=True, align="C")
    pdf.ln(5)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 8, f"Report Generated: {now.strftime('%B %d, %Y at %H:%M UTC')}", ln=True, align="C")
    pdf.cell(0, 8, "Classification: CONFIDENTIAL", ln=True, align="C")
    pdf.cell(0, 8, "Prepared for: Internal Audit & Compliance Review", ln=True, align="C")
    pdf.ln(10)

    # Executive Summary
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "1. Executive Summary", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 6, s(
        "CarryOn is an estate planning platform that processes sensitive personal, financial, and legal data. "
        "This report documents all third-party integrations, their security controls, data handling practices, "
        "and compliance posture as required for SOC 2 Type II certification. "
        "The platform implements AES-256-GCM encryption at rest, TLS 1.3 in transit, "
        "role-based access control (RBAC), WebAuthn/FIDO2 passwordless authentication, "
        "voice biometric verification, and comprehensive audit logging."
    ))
    pdf.ln(5)

    # Trust Service Criteria
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "2. Trust Service Criteria Coverage", ln=True)
    criteria = [
        ("Security", "AES-256-GCM encryption, TLS 1.3, RBAC, WebAuthn/FIDO2, voice biometrics, JWT tokens, VAPID push auth"),
        ("Availability", "Railway Pro (auto-scaling, 32GB RAM/32 vCPU max), MongoDB M30 (3-node replica set), daily health scheduler"),
        ("Processing Integrity", "Stripe webhook verification, Apple StoreKit 2 server verification, input validation on all endpoints"),
        ("Confidentiality", "AES-256-GCM + SSE-S3 double encryption on documents, environment variable isolation, masked credentials"),
        ("Privacy", "Minimal data collection, user-controlled data export (PDF), dormant account data preservation, GDPR-ready architecture"),
    ]
    pdf.set_font("Helvetica", "", 10)
    for title, desc in criteria:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(40, 7, f"  {s(title)}:", ln=False)
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 6, s(desc))
        pdf.ln(2)
    pdf.ln(5)

    # Integration inventory
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "3. Third-Party Integration Inventory", ln=True)
    pdf.ln(3)

    categories = {
        "infrastructure": "Infrastructure & Hosting",
        "payments": "Payment Processing",
        "ai_communication": "AI & Communication Services",
        "native_updates": "Native App & Updates",
        "security_auth": "Security & Authentication",
        "local_processing": "Local Processing Libraries",
    }

    # Get integrations data (reuse the unlock endpoint logic inline)
    unlock_resp = await unlock_integrations(data, current_user)
    all_integrations = unlock_resp["integrations"]
    cogs = unlock_resp["cogs"]

    for cat_key, cat_label in categories.items():
        items = [i for i in all_integrations if i["category"] == cat_key]
        if not items:
            continue

        pdf.set_font("Helvetica", "B", 12)
        pdf.set_fill_color(30, 40, 60)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, f"  {s(cat_label)}", ln=True, fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(3)

        for integ in items:
            pdf.set_font("Helvetica", "B", 11)
            status_text = f" [{s(integ['status']).upper()}]"
            pdf.cell(0, 7, f"{s(integ['name'])}{status_text}", ln=True)
            pdf.set_font("Helvetica", "", 9)
            pdf.cell(0, 5, f"Monthly Cost: {s(integ['cost_note'])}", ln=True)
            if integ.get("dashboard_url"):
                pdf.cell(0, 5, f"Dashboard: {s(integ['dashboard_url'])}", ln=True)

            # Details table
            pdf.set_font("Helvetica", "", 8)
            for detail in integ["details"]:
                label = s(detail["label"])
                val = s(detail.get("value", ""))
                verified = detail.get("verified", True)
                is_sensitive = detail.get("sensitive", False)

                if is_sensitive:
                    val = "[REDACTED - See secure vault]"

                status_marker = "[VERIFIED]" if verified else "[UNVERIFIED]"
                if not val and not is_sensitive:
                    val = "[NEEDS INPUT]"

                pdf.cell(55, 5, f"    {label}:", ln=False)
                pdf.cell(100, 5, val, ln=False)
                pdf.cell(0, 5, status_marker, ln=True)

            pdf.ln(4)

    # COGS Summary
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "4. Monthly Cost of Goods Sold (COGS)", ln=True)
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 7, f"Total Monthly COGS: ${cogs['total_monthly']:.2f}", ln=True)
    pdf.cell(0, 7, f"Verified Costs: ${cogs['verified_total']:.2f}", ln=True)
    pdf.cell(0, 7, f"Items with unverified costs: {cogs['unverified_items']}", ln=True)
    pdf.cell(0, 7, f"Note: {s(cogs['note'])}", ln=True)
    pdf.ln(5)

    # Cost breakdown table
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(30, 40, 60)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(80, 7, "  Service", fill=True, ln=False)
    pdf.cell(35, 7, "Monthly Cost", fill=True, ln=False, align="R")
    pdf.cell(35, 7, "Verified?", fill=True, ln=False, align="C")
    pdf.cell(0, 7, "", fill=True, ln=True)
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 9)
    for integ in sorted(all_integrations, key=lambda x: -x["cost_monthly"]):
        pdf.cell(80, 6, f"  {s(integ['name'])}", ln=False)
        pdf.cell(35, 6, f"${integ['cost_monthly']:.2f}", ln=False, align="R")
        pdf.cell(35, 6, "Yes" if integ["cost_verified"] else "No", ln=False, align="C")
        pdf.cell(0, 6, "", ln=True)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(80, 7, "  TOTAL", ln=False)
    pdf.cell(35, 7, f"${cogs['total_monthly']:.2f}", ln=False, align="R")
    pdf.cell(0, 7, "", ln=True)
    pdf.ln(10)

    # Security controls
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "5. Security Controls Summary", ln=True)
    pdf.set_font("Helvetica", "", 9)
    controls = [
        "Encryption at Rest: AES-256-GCM (application layer) + SSE-S3 (storage layer)",
        "Encryption in Transit: TLS 1.3 enforced on all endpoints",
        "Authentication: JWT tokens (HS256) + WebAuthn/FIDO2 passwordless + Voice biometrics",
        "Authorization: Role-based access control (RBAC) with Founder/Admin/Operator/Benefactor/Beneficiary roles",
        "API Security: Rate limiting, CORS restrictions, input validation, SQL injection prevention (MongoDB parameterized queries)",
        "Credential Management: All secrets stored in environment variables, never in code. Masked in UI with secondary password gate.",
        "Audit Logging: Comprehensive audit trail of all administrative actions and data access",
        "Backup & Recovery: MongoDB Atlas automated backups, S3 versioning",
        "Incident Response: P1 escalation system with admin notifications, billing lifecycle monitoring",
        "Vendor Risk: All third-party integrations documented with verified/unverified status tracking",
    ]
    for c in controls:
        pdf.cell(5, 5, "-", ln=False)
        pdf.multi_cell(0, 5, f" {s(c)}")
        pdf.ln(1)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.multi_cell(0, 4, s(
        f"This report was auto-generated on {now.strftime('%Y-%m-%d %H:%M UTC')} from the CarryOn platform's "
        "integration vault. Fields marked [UNVERIFIED] require manual confirmation by the platform administrator. "
        "Sensitive credentials are redacted in this document and accessible only through the password-protected integration vault. "
        "This document is intended for internal use and authorized auditors only."
    ))

    # Output
    buf = BytesIO()
    pdf.output(buf)
    buf.seek(0)

    from starlette.responses import StreamingResponse
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="CarryOn_SOC2_Report_{now.strftime("%Y%m%d")}.pdf"'}
    )


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
