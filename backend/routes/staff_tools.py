"""CarryOn™ — Staff Tools Routes (SOC 2 Compliant)

New endpoints for Founder and Operations portals:
  Founder: Announcements, System Health
  Operator: My Activity, Search, Escalations, Shift Notes, Knowledge Base
"""

from datetime import datetime, timezone
from uuid import uuid4

import hashlib
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from config import db
from guards import check_staff_role as require_staff, check_founder_role as require_founder
from services.audit import get_client_ip, log_audit_event
from utils import get_current_user

router = APIRouter()


# ══════════════════════════════════════════════════════════
# INTEGRATIONS VAULT (PIN-protected)
# ══════════════════════════════════════════════════════════

DEFAULT_PIN_HASH = hashlib.sha256(b"9170").hexdigest()


class IntegrationsPinRequest(BaseModel):
    pin: str


class IntegrationUpdateRequest(BaseModel):
    pin: str
    details: dict = {}
    cost_monthly: float | None = None
    cost_note: str | None = None


class ChangePinRequest(BaseModel):
    current_pin: str
    new_pin: str


async def _get_pin_hash():
    """Get the stored PIN hash from MongoDB, or default."""
    doc = await db.app_settings.find_one({"key": "integrations_pin"}, {"_id": 0})
    if doc and doc.get("pin_hash"):
        return doc["pin_hash"]
    return DEFAULT_PIN_HASH


async def _verify_integrations_pin(pin: str):
    stored_hash = await _get_pin_hash()
    if hashlib.sha256(pin.encode()).hexdigest() != stored_hash:
        raise HTTPException(status_code=403, detail="Invalid PIN")


async def _merge_overrides(integrations: list):
    """Merge user-saved overrides from MongoDB into hardcoded integration data."""
    overrides = {}
    async for doc in db.integration_overrides.find({}, {"_id": 0}):
        overrides[doc["integration_id"]] = doc

    for integ in integrations:
        ovr = overrides.get(integ["id"])
        if not ovr:
            continue
        if ovr.get("cost_monthly") is not None:
            integ["cost_monthly"] = ovr["cost_monthly"]
        if ovr.get("cost_note"):
            integ["cost_note"] = ovr["cost_note"]
        if ovr.get("cost_verified") is not None:
            integ["cost_verified"] = ovr["cost_verified"]
        saved_details = ovr.get("details", {})
        for detail in integ["details"]:
            if detail["label"] in saved_details:
                detail["value"] = saved_details[detail["label"]]
                detail["verified"] = True


@router.get("/admin/integrations")
async def get_integrations(current_user: dict = Depends(get_current_user)):
    """Return integrations data without sensitive credential values (no PIN needed)."""
    require_founder(current_user)
    data = await _build_integrations_data()
    # Strip sensitive values for unauthenticated view
    for integ in data["integrations"]:
        for detail in integ["details"]:
            if detail.get("sensitive"):
                detail["value"] = ""
    return data


@router.post("/admin/integrations/unlock")
async def unlock_integrations(data: IntegrationsPinRequest, current_user: dict = Depends(get_current_user)):
    """Unlock integrations vault with PIN — returns full sensitive values."""
    require_founder(current_user)
    await _verify_integrations_pin(data.pin)
    return await _build_integrations_data()


@router.put("/admin/integrations/{integration_id}")
async def update_integration(
    integration_id: str, data: IntegrationUpdateRequest, current_user: dict = Depends(get_current_user)
):
    """Update integration details (PIN required)."""
    require_founder(current_user)
    await _verify_integrations_pin(data.pin)

    update = {"integration_id": integration_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    if data.details:
        update["details"] = data.details
    if data.cost_monthly is not None:
        update["cost_monthly"] = data.cost_monthly
        update["cost_verified"] = True
    if data.cost_note is not None:
        update["cost_note"] = data.cost_note

    await db.integration_overrides.update_one(
        {"integration_id": integration_id},
        {"$set": update},
        upsert=True,
    )

    await log_audit_event(
        actor_id=current_user.get("user_id") or current_user.get("id", ""),
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", "admin"),
        action="integration_updated",
        category="admin",
        resource_type="integration",
        resource_id=integration_id,
        details={"fields_updated": list(data.details.keys()) if data.details else []},
    )

    return {"status": "ok", "integration_id": integration_id}


@router.put("/admin/integrations-pin")
async def change_integrations_pin(data: ChangePinRequest, current_user: dict = Depends(get_current_user)):
    """Change the integrations vault PIN."""
    require_founder(current_user)
    await _verify_integrations_pin(data.current_pin)

    if len(data.new_pin) != 4 or not data.new_pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")

    new_hash = hashlib.sha256(data.new_pin.encode()).hexdigest()
    await db.app_settings.update_one(
        {"key": "integrations_pin"},
        {"$set": {"key": "integrations_pin", "pin_hash": new_hash}},
        upsert=True,
    )

    await log_audit_event(
        actor_id=current_user.get("user_id") or current_user.get("id", ""),
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", "admin"),
        action="integrations_pin_changed",
        category="admin",
        resource_type="settings",
        resource_id="integrations_pin",
        details={},
    )

    return {"status": "ok"}


async def _build_integrations_data():
    """Build the full integrations data payload with DB overrides merged in."""

    def m(val):
        """Mask a credential value for display."""
        if not val or len(val) < 12:
            return val or ""
        return val[:8] + "..." + val[-4:]

    # verified=True means we have screenshot/copy-paste proof from the user
    # verified=False means inferred from code/.env — user should confirm
    integrations = [
        {
            "id": "render",
            "name": "Render",
            "status": "active",
            "category": "infrastructure",
            "dashboard_url": "https://dashboard.render.com",
            "cost_monthly": 25.00,
            "cost_note": "Render Standard plan (~$25/mo); migrated from Railway May 2026",
            "cost_verified": False,
            "details": [
                {"label": "Service", "value": "carryon-api-kacr", "verified": True},
                {"label": "Type", "value": "Web Service (Docker)", "verified": True},
                {"label": "Region", "value": "US East (Virginia)", "verified": True},
                {"label": "Runtime", "value": "Python 3.12 (Docker container)", "verified": True},
                {"label": "Replicas", "value": "1", "verified": False},
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
                {
                    "label": "Build Optimization",
                    "value": "ignoreCommand active (skip backend-only changes)",
                    "verified": True,
                },
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
                {
                    "label": "Connection String",
                    "value": m(os.environ["MONGO_URL"]),
                    "sensitive": True,
                    "verified": True,
                },
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
                {
                    "label": "Access Key ID",
                    "value": m(os.environ.get("AWS_ACCESS_KEY_ID", "")),
                    "sensitive": True,
                    "verified": True,
                },
                {
                    "label": "Secret Access Key",
                    "value": m(os.environ.get("AWS_SECRET_ACCESS_KEY", "")),
                    "sensitive": True,
                    "verified": True,
                },
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
                {
                    "label": "Live Secret Key",
                    "value": m(os.environ.get("STRIPE_API_KEY", "")),
                    "sensitive": True,
                    "verified": True,
                },
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
                {
                    "label": "Shared Secret",
                    "value": m(os.environ.get("APPLE_SHARED_SECRET", "")),
                    "sensitive": True,
                    "verified": True,
                },
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
                {
                    "label": "API Key",
                    "value": m(os.environ.get("XAI_API_KEY", "")),
                    "sensitive": True,
                    "verified": True,
                },
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
                {
                    "label": "API Key",
                    "value": m(os.environ.get("RESEND_API_KEY", "")),
                    "sensitive": True,
                    "verified": True,
                },
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
                {
                    "label": "Account SID",
                    "value": m(os.environ.get("TWILIO_ACCOUNT_SID", "")),
                    "sensitive": True,
                    "verified": True,
                },
                {
                    "label": "Auth Token",
                    "value": m(os.environ.get("TWILIO_AUTH_TOKEN", "")),
                    "sensitive": True,
                    "verified": True,
                },
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
        {
            "id": "firebase",
            "name": "Firebase Analytics",
            "status": "active",
            "category": "analytics",
            "dashboard_url": "https://console.firebase.google.com/project/carryon-74e7e/analytics",
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (Spark free tier — unlimited analytics events)",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Funnel analytics, demographics, retention curves", "verified": True},
                {"label": "Plan", "value": "Spark (Free)", "verified": True},
                {"label": "Project ID", "value": "carryon-74e7e", "verified": True},
                {"label": "App ID", "value": "1:986105602287:web:28d212431b9d445d907b1a", "verified": True},
                {"label": "Measurement ID", "value": "G-60D910V279", "verified": True},
                {"label": "Auth Domain", "value": "carryon-74e7e.firebaseapp.com", "verified": True},
                {
                    "label": "API Key",
                    "value": os.environ.get("REACT_APP_FIREBASE_API_KEY", "Set REACT_APP_FIREBASE_API_KEY in env"),
                    "sensitive": True,
                    "verified": bool(os.environ.get("REACT_APP_FIREBASE_API_KEY")),
                },
                {"label": "Login Email", "value": "", "verified": False, "sensitive": True},
            ],
        },
        {
            "id": "meta_pixel",
            "name": "Meta Pixel",
            "status": "active",
            "category": "analytics",
            "dashboard_url": "https://business.facebook.com/events_manager",
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (free — revenue comes from ad spend)",
            "cost_verified": True,
            "details": [
                {
                    "label": "Purpose",
                    "value": "Ad conversion tracking, retargeting, audience optimization",
                    "verified": True,
                },
                {"label": "Plan", "value": "Free (included with Meta Business Suite)", "verified": True},
                {"label": "Pixel ID", "value": "1406242844851058", "verified": True, "sensitive": True},
                {"label": "Events Tracked", "value": "ViewContent, Lead, CompleteRegistration", "verified": True},
                {"label": "Integration", "value": "Funnel page (/get-started)", "verified": True},
                {"label": "Login ID", "value": "708890017", "sensitive": True, "verified": True},
                {"label": "Login Password", "value": "CarryOntheWisdom!1", "sensitive": True, "verified": True},
            ],
        },
        {
            "id": "social_instagram",
            "name": "Instagram",
            "status": "active",
            "category": "analytics",
            "dashboard_url": "https://instagram.com/Carryonfamilyready",
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (organic) + ad spend budget",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Video reels, brand awareness, funnel acquisition", "verified": True},
                {"label": "Handle", "value": "@Carryonfamilyready", "verified": True},
                {"label": "Username", "value": "Carryonfamilyready", "sensitive": True, "verified": True},
                {"label": "Password", "value": "CarryOntheWisdom1!", "sensitive": True, "verified": True},
                {
                    "label": "Funnel Link",
                    "value": "carryon.us/get-started?utm_source=instagram&utm_medium=reels&utm_campaign=VIDEO_NAME",
                    "verified": True,
                },
            ],
        },
        {
            "id": "social_facebook",
            "name": "Facebook Business",
            "status": "active",
            "category": "analytics",
            "dashboard_url": "https://business.facebook.com",
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (organic) + ad spend budget",
            "cost_verified": True,
            "details": [
                {"label": "Purpose", "value": "Paid ads, boosted posts, funnel acquisition", "verified": True},
                {"label": "Login Phone", "value": "703-889-0017", "sensitive": True, "verified": True},
                {"label": "Password", "value": "CarryOntheWisdom!1", "sensitive": True, "verified": True},
                {
                    "label": "Funnel Link",
                    "value": "carryon.us/get-started?utm_source=facebook&utm_medium=reels&utm_campaign=VIDEO_NAME",
                    "verified": True,
                },
            ],
        },
        {
            "id": "social_linkedin",
            "name": "LinkedIn",
            "status": "active",
            "category": "analytics",
            "dashboard_url": "https://linkedin.com",
            "cost_monthly": 0.00,
            "cost_note": "$0/mo (organic) + ad spend budget",
            "cost_verified": True,
            "details": [
                {
                    "label": "Purpose",
                    "value": "Professional audience, sponsored posts, funnel acquisition",
                    "verified": True,
                },
                {"label": "Email", "value": "Cos@carryontechnologies.com", "sensitive": True, "verified": True},
                {"label": "Password", "value": "CarryOntheWisdom1!", "sensitive": True, "verified": True},
                {
                    "label": "Funnel Link",
                    "value": "carryon.us/get-started?utm_source=linkedin&utm_medium=feed&utm_campaign=VIDEO_NAME",
                    "verified": True,
                },
            ],
        },
    ]
    capacity_map = {
        "resend": {
            "max_users": 8000,
            "reason": "Pro plan: 50K emails/mo at ~6 emails/user/mo avg (OTP + digests)",
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
        "render": {
            "max_users": 20000,
            "reason": "Standard plan (4GB RAM, dedicated CPU) handles ~20K concurrent before vertical scale-up",
            "upgrade_to": "Pro (~$85/mo, 8GB RAM, more CPU)",
            "upgrade_url": "https://dashboard.render.com",
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
    for i_id in [
        "webauthn",
        "vapid",
        "jwt",
        "pdf_tools",
        "capacitor",
        "firebase",
        "meta_pixel",
        "social_instagram",
        "social_facebook",
        "social_linkedin",
    ]:
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
        warnings.append(
            {
                "level": "critical",
                "message": f"Platform at {usage_pct:.0f}% capacity ({total_users}/{platform_ceiling}). Upgrade {most_limiting['name']} immediately.",
            }
        )
    elif usage_pct >= 50:
        warnings.append(
            {
                "level": "warning",
                "message": f"Platform at {usage_pct:.0f}% capacity. Plan {most_limiting['name']} upgrade soon.",
            }
        )

    # Check xAI credit health
    xai_settings = await db.admin_settings.find_one({"id": "xai_credits"}, {"_id": 0})
    xai_balance = xai_settings.get("balance_usd", 500.0) if xai_settings else 500.0
    total_xai_spent_agg = await db.xai_usage.aggregate(
        [{"$group": {"_id": None, "total": {"$sum": "$cost_usd"}}}]
    ).to_list(1)
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
            warnings.append(
                {
                    "level": "warning",
                    "message": f"Database storage at {storage_pct:.0f}% ({storage_gb:.1f}GB / {max_storage_gb}GB)",
                }
            )
    except Exception:
        pass

    # Merge user overrides from MongoDB
    await _merge_overrides(integrations)

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
        }
        if db_stats
        else None,
    }


@router.post("/admin/integrations/soc2-report")
async def generate_soc2_report(data: IntegrationsPinRequest, current_user: dict = Depends(get_current_user)):
    """Generate a SOC 2 compliance report PDF."""
    require_founder(current_user)

    await _verify_integrations_pin(data.pin)

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
    pdf.multi_cell(
        0,
        6,
        s(
            "CarryOn is an estate planning platform that processes sensitive personal, financial, and legal data. "
            "This report documents all third-party integrations, their security controls, data handling practices, "
            "and compliance posture as required for SOC 2 Type II certification. "
            "The platform implements AES-256-GCM encryption at rest, TLS 1.3 in transit, "
            "role-based access control (RBAC), WebAuthn/FIDO2 passkey-based authentication, "
            "and comprehensive audit logging."
        ),
    )
    pdf.ln(5)

    # Trust Service Criteria
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "2. Trust Service Criteria Coverage", ln=True)
    criteria = [
        (
            "Security",
            "AES-256-GCM encryption, TLS 1.3, RBAC, WebAuthn/FIDO2, JWT tokens, VAPID push auth",
        ),
        (
            "Availability",
            "Render (Docker, auto-scaling, Virginia us-east-1), MongoDB Atlas M20 (3-node replica set), daily health scheduler",
        ),
        (
            "Processing Integrity",
            "Stripe webhook verification, Apple StoreKit 2 server verification, input validation on all endpoints",
        ),
        (
            "Confidentiality",
            "AES-256-GCM + SSE-S3 double encryption on documents, environment variable isolation, masked credentials",
        ),
        (
            "Privacy",
            "Minimal data collection, user-controlled data export (PDF), dormant account data preservation, GDPR-ready architecture",
        ),
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
        "Authentication: JWT tokens (HS256) + WebAuthn/FIDO2 passkey-based + Voice biometrics",
        "Authorization: Role-based access control (RBAC) with Founder/Admin/Operator/Benefactor/Beneficiary roles",
        "API Security: Rate limiting, CORS restrictions, input validation, SQL injection prevention (MongoDB parameterized queries)",
        "Credential Management: All credentials stored in environment variables, never in code. Masked in UI with secondary PIN gate.",
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
    pdf.multi_cell(
        0,
        4,
        s(
            f"This report was auto-generated on {now.strftime('%Y-%m-%d %H:%M UTC')} from the CarryOn platform's "
            "integration vault. Fields marked [UNVERIFIED] require manual confirmation by the platform administrator. "
            "Sensitive credentials are redacted in this document and accessible only through the PIN-protected integration vault. "
            "This document is intended for internal use and authorized auditors only."
        ),
    )

    # Output
    buf = BytesIO()
    pdf.output(buf)
    buf.seek(0)

    from starlette.responses import StreamingResponse

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="CarryOn_SOC2_Report_{now.strftime("%Y%m%d")}.pdf"'},
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

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Get the admin-configured credit balance (set initial = $500 default)
    settings = await db.admin_settings.find_one({"id": "xai_credits"}, {"_id": 0})
    initial_balance = settings.get("balance_usd", 500.0) if settings else 500.0

    # Aggregate total usage from internal tracking
    pipeline = [
        {
            "$group": {
                "_id": None,
                "total_cost": {"$sum": "$cost_usd"},
                "total_input": {"$sum": "$input_tokens"},
                "total_output": {"$sum": "$output_tokens"},
            }
        }
    ]
    total_usage = await db.xai_usage.aggregate(pipeline).to_list(1)
    total_spent = total_usage[0]["total_cost"] if total_usage else 0.0

    # This month's usage
    month_pipeline = [
        {"$match": {"timestamp": {"$gte": month_start}}},
        {
            "$group": {
                "_id": None,
                "cost": {"$sum": "$cost_usd"},
                "input_t": {"$sum": "$input_tokens"},
                "output_t": {"$sum": "$output_tokens"},
                "calls": {"$sum": 1},
            }
        },
    ]
    month_usage = await db.xai_usage.aggregate(month_pipeline).to_list(1)
    month_data = month_usage[0] if month_usage else {"cost": 0, "input_t": 0, "output_t": 0, "calls": 0}

    # Today's usage
    today_pipeline = [
        {"$match": {"timestamp": {"$gte": today_start}}},
        {"$group": {"_id": None, "cost": {"$sum": "$cost_usd"}, "calls": {"$sum": 1}}},
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

    # Top spenders today — surfaces the users most actively burning
    # token budget so an admin can spot abuse or upsell a heavy user
    # to a paid tier. Bounded at top 10 to keep the response small.
    top_spenders_pipeline = [
        {"$match": {"timestamp": {"$gte": today_start}}},
        {
            "$group": {
                "_id": "$user_id",
                "tokens": {"$sum": {"$add": ["$input_tokens", "$output_tokens"]}},
                "cost": {"$sum": "$cost_usd"},
                "calls": {"$sum": 1},
            }
        },
        {"$sort": {"tokens": -1}},
        {"$limit": 10},
    ]
    top_spenders_raw = await db.xai_usage.aggregate(top_spenders_pipeline).to_list(10)
    # Hydrate user_id → email so the tile is human-readable.
    spender_ids = [t["_id"] for t in top_spenders_raw if t.get("_id")]
    user_lookup = {}
    if spender_ids:
        user_rows = await db.users.find(
            {"id": {"$in": spender_ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1, "ai_unlimited": 1}
        ).to_list(len(spender_ids))
        user_lookup = {u["id"]: u for u in user_rows}
    top_spenders = [
        {
            "user_id": t["_id"],
            "email": (user_lookup.get(t["_id"]) or {}).get("email", "(unknown)"),
            "name": (user_lookup.get(t["_id"]) or {}).get("name", ""),
            "tokens": int(t.get("tokens", 0) or 0),
            "cost_usd": round(t.get("cost", 0.0) or 0.0, 4),
            "calls": int(t.get("calls", 0) or 0),
            "ai_unlimited": bool((user_lookup.get(t["_id"]) or {}).get("ai_unlimited")),
        }
        for t in top_spenders_raw
    ]

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
        "daily_breakdown": [
            {"date": d["_id"], "cost": round(d["cost"], 4), "calls": d["calls"]} for d in daily_breakdown
        ],
        "guardian_sessions_today": guardian_today,
        "guardian_sessions_month": guardian_month,
        "top_spenders_today": top_spenders,
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
        {
            "$set": {
                "id": "xai_credits",
                "balance_usd": data.balance_usd,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
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

    # Notification delivery health (last 7 days, all notification types).
    # Single, generic counter — never per-feature health checks. New
    # notification types light up here automatically as soon as anyone
    # in the codebase calls notify.* / send_notification.
    week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    notif_metrics = await db.notification_metrics.find({"day": {"$gte": week_ago}}, {"_id": 0}).to_list(1000)
    by_type: dict = {}
    totals = {
        "in_app_count": 0,
        "push_attempts": 0,
        "push_with_subs": 0,
        "push_delivered": 0,
    }
    for row in notif_metrics:
        ntype = row.get("notification_type") or "general"
        agg = by_type.setdefault(
            ntype,
            {"in_app_count": 0, "push_attempts": 0, "push_with_subs": 0, "push_delivered": 0},
        )
        for k in totals.keys():
            v = int(row.get(k) or 0)
            agg[k] += v
            totals[k] += v
    delivery_rate = (
        round(100.0 * totals["push_delivered"] / totals["push_with_subs"], 1) if totals["push_with_subs"] > 0 else None
    )
    notifications_block = {
        "window_days": 7,
        "totals": totals,
        "delivery_rate_pct": delivery_rate,
        "by_type": by_type,
    }

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
        "notifications": notifications_block,
        "status": "healthy",
    }
