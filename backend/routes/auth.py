"""CarryOn™ Backend — Authentication Routes"""

import asyncio
import os
import random
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from config import db, logger
from models import TokenResponse, UserCreate, UserLogin, UserResponse
from services.audit import log_audit_event
from utils import (
    create_token,
    decode_token,
    generate_otp,
    get_current_user,
    hash_password,
    send_otp_email,
    send_otp_sms,
    verify_password,
)
from services.encryption import generate_estate_salt
from services.photo_urls import resolve_photo_url


def _user_response(user: dict, owns_estate: bool = False) -> UserResponse:
    """Build a UserResponse from a DB user dict, including multi-role flags."""
    raw_scope = user.get("admin_scope", "")
    scope_val = raw_scope if isinstance(raw_scope, list) else ([raw_scope] if raw_scope else [])
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user["role"],
        created_at=user["created_at"],
        username=user.get("username", ""),
        photo_url=resolve_photo_url(user.get("photo_url", "")),
        operator_role=user.get("operator_role", ""),
        admin_scope=scope_val,
        is_also_benefactor=user.get("is_also_benefactor", False) or owns_estate,
        is_also_beneficiary=user.get("is_also_beneficiary", False) or False,
        is_beta_tester=user.get("is_beta_tester", False),
        beta_accepted=bool(user.get("beta_accepted_at")),
    )


async def generate_unique_username(first_name: str, last_name: str) -> str:
    """Generate a unique username from first_name + last_name (no dot, lowercase).
    If collision, appends 2, 3, etc. Handles non-ASCII and edge cases."""
    # Strip to alphanumeric only, lowercase
    clean_first = re.sub(r"[^a-zA-Z0-9]", "", first_name or "").lower()
    clean_last = re.sub(r"[^a-zA-Z0-9]", "", last_name or "").lower()
    base = clean_first + clean_last
    if len(base) < 3:
        # Fallback: use "user" + random digits
        base = "user" + str(random.randint(1000, 9999))

    # Check uniqueness
    candidate = base
    suffix = 2
    while True:
        existing = await db.users.find_one({"username_lower": candidate}, {"_id": 0, "id": 1})
        if not existing:
            return candidate
        candidate = f"{base}{suffix}"
        suffix += 1
        if suffix > 999:
            # Extreme edge case — add random digits
            candidate = f"{base}{random.randint(10000, 99999)}"


def validate_username(username: str) -> str | None:
    """Validate username format. Returns error message or None if valid."""
    if not username or len(username.strip()) < 3:
        return "Username must be at least 3 characters"
    if len(username.strip()) > 30:
        return "Username must be 30 characters or less"
    if "@" in username:
        return "Username cannot be an email address. Choose a unique name instead."
    if not re.match(r"^[a-zA-Z0-9_]+$", username.strip()):
        return "Username can only contain letters, numbers, and underscores"
    return None


async def resolve_user_by_identifier(identifier: str) -> dict | None:
    """Resolve a login identifier (username or email) to a user.
    Tries username_lower first, then email. If email matches multiple users, returns None."""
    identifier_lower = identifier.strip().lower()
    # Try username first (always unique)
    user = await db.users.find_one({"username_lower": identifier_lower}, {"_id": 0})
    if user:
        return user
    # Try email — but only if exactly one user has this email
    users_with_email = await db.users.find({"email": identifier_lower}, {"_id": 0}).to_list(2)
    if len(users_with_email) == 1:
        return users_with_email[0]
    # Multiple users share this email, or no match
    return None


async def _reconcile_beneficiary_by_email(user: dict):
    """Auto-link any unlinked beneficiary records that match this user's email.

    When a beneficiary signs up directly (not through the invitation link),
    their user account exists but the beneficiaries collection still has
    no user_id for them. This helper bridges that gap on every login.
    """
    email = (user.get("email") or "").lower().strip()
    if not email:
        return
    user_id = user["id"]

    # Find beneficiary records with this email that have no user_id set
    unlinked = await db.beneficiaries.find(
        {
            "email": email,
            "$or": [{"user_id": {"$exists": False}}, {"user_id": ""}, {"user_id": None}],
        },
        {"_id": 0, "id": 1, "estate_id": 1},
    ).to_list(50)

    if not unlinked:
        # Also reconcile already-linked records (status sync)
        if user.get("role") == "beneficiary" or user.get("is_also_beneficiary"):
            await db.beneficiaries.update_many(
                {"user_id": user_id, "invitation_status": {"$ne": "accepted"}},
                {"$set": {"invitation_status": "accepted"}},
            )
        return

    # Link each unlinked record to this user
    estate_ids = []
    for ben in unlinked:
        await db.beneficiaries.update_one(
            {"id": ben["id"]},
            {"$set": {"user_id": user_id, "invitation_status": "accepted"}},
        )
        if ben.get("estate_id"):
            estate_ids.append(ben["estate_id"])

    # Add user to each estate's beneficiaries array
    for eid in estate_ids:
        await db.estates.update_one(
            {"id": eid},
            {"$addToSet": {"beneficiaries": user_id}},
        )

    # Mark the user as also being a beneficiary (if they're a benefactor)
    if user.get("role") == "benefactor":
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"is_also_beneficiary": True}},
        )
        user["is_also_beneficiary"] = True

    # Also ensure any previously-linked records have accepted status
    await db.beneficiaries.update_many(
        {"user_id": user_id, "invitation_status": {"$ne": "accepted"}},
        {"$set": {"invitation_status": "accepted"}},
    )

    logger.info(f"Auto-linked {len(unlinked)} beneficiary record(s) for user {user_id} ({email})")


router = APIRouter()

TRIAL_DURATION_DAYS = 30


async def create_session_token(user_id, email, role):
    """Create a token and store the session_id on the user for single-session enforcement."""
    import uuid as _uuid

    session_id = str(_uuid.uuid4())
    token = create_token(user_id, email, role, session_id)
    # Admin and session_exempt users are exempt from single-session enforcement
    if role != "admin":
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "session_exempt": 1})
        if not (user_doc and user_doc.get("session_exempt")):
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"active_session_id": session_id}},
            )
    return token


async def create_dev_session_token(user_id, email, role):
    """Create a dev-impersonation token that does NOT invalidate the real user's session."""
    import uuid as _uuid

    session_id = str(_uuid.uuid4())
    return create_token(user_id, email, role, session_id, dev_session=True)


def get_client_ip(request: Request) -> str:
    """Get real client IP, accounting for reverse proxies."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ===================== AUTH ROUTES =====================


class UsernameCheckRequest(BaseModel):
    username: str


@router.post("/auth/check-username")
async def check_username_available(data: UsernameCheckRequest):
    """Check if a username is available. Used during signup for real-time validation."""
    username = data.username.strip()
    error = validate_username(username)
    if error:
        return {"available": False, "message": error}
    existing = await db.users.find_one({"username_lower": username.lower()}, {"_id": 0, "id": 1})
    return {"available": existing is None}


@router.post("/auth/check-email")
async def check_email_exists(data: dict):
    """Check if an email is already registered. Kept for backward compatibility."""
    email = (data.get("email") or "").lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    return {"exists": user is not None}


@router.post("/auth/login")
async def login(data: UserLogin, request: Request):
    """Login — verifies credentials, then sends OTP unless user has a daily trust token."""
    client_ip = get_client_ip(request)

    # Check for account lockout (25 failed attempts in 5 minutes) — skip for admin accounts
    lockout_window = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    lockout_email = data.email.strip().lower()
    # Pre-check if this is an admin or session-exempt account — exempt from lockout
    # Check both email and username since login supports either
    admin_check = await db.users.find_one(
        {"$or": [{"email": lockout_email}, {"username_lower": lockout_email}]},
        {"_id": 0, "id": 1, "role": 1, "session_exempt": 1},
    )
    is_admin = admin_check and admin_check.get("role") == "admin"
    is_exempt = admin_check and admin_check.get("session_exempt", False)
    if is_admin or is_exempt:
        # Admin/exempt accounts are fully exempt — also clear any existing lockout entries
        await db.failed_logins.delete_many({"email": lockout_email})
    if not is_admin and not is_exempt:
        recent_failures = await db.failed_logins.count_documents(
            {
                "email": lockout_email,
                "timestamp": {"$gte": lockout_window},
            }
        )
        if recent_failures >= 25:
            # Find the oldest failure in this window to calculate remaining lockout
            oldest_failure = await db.failed_logins.find_one(
                {"email": lockout_email, "timestamp": {"$gte": lockout_window}},
                {"_id": 0, "id": 1, "timestamp": 1},
                sort=[("timestamp", 1)],
            )
            retry_after = 300  # 5 minutes default
            if oldest_failure and oldest_failure.get("timestamp"):
                try:
                    oldest_ts = datetime.fromisoformat(oldest_failure["timestamp"].replace("Z", "+00:00"))
                    unlock_at = oldest_ts + timedelta(minutes=5)
                    retry_after = max(1, int((unlock_at - datetime.now(timezone.utc)).total_seconds()))
                except (ValueError, TypeError):
                    pass
            raise HTTPException(
                status_code=429,
                detail=f"Account temporarily locked. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    # Support login via username OR email — username takes priority
    login_input = data.email.strip()
    login_lower = login_input.lower()
    # Try username first (always unique)
    user = await db.users.find_one({"username_lower": login_lower}, {"_id": 0})
    if not user:
        # Try email — but handle shared emails
        users_with_email = await db.users.find({"email": login_lower}, {"_id": 0}).to_list(2)
        if len(users_with_email) == 1:
            user = users_with_email[0]
        elif len(users_with_email) > 1:
            raise HTTPException(
                status_code=400,
                detail="Multiple accounts use this email. Please log in with your username instead.",
            )
    if not user or not verify_password(data.password, user["password"]):
        # Check if this email has a pending beneficiary invitation
        if not user:
            pending_invite = await db.beneficiaries.find_one(
                {"email": login_lower, "invitation_status": {"$in": ["sent", "pending"]}},
                {"_id": 0, "id": 1},
            )
            if pending_invite:
                raise HTTPException(
                    status_code=401,
                    detail="This email has a pending invitation. Please check your email and click the invitation link to create your account.",
                )
        # Record failed attempt
        await db.failed_logins.insert_one(
            {
                "email": login_lower,
                "ip_address": client_ip,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        # SOC 2 CC6.1: Audit log for failed login
        await log_audit_event(
            actor_id="",
            actor_email=login_lower,
            actor_role="",
            action="login_failed",
            category="auth",
            ip_address=client_ip,
            severity="warning",
            details={"reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Clear failed attempts on successful login
    await db.failed_logins.delete_many({"email": login_lower})

    # ── IP Whitelist enforcement ──
    from routes.admin.ip_whitelist import check_ip_whitelist

    ip_allowed = await check_ip_whitelist(
        user.get("role", ""),
        user.get("operator_role", ""),
        client_ip,
    )
    if not ip_allowed:
        await log_audit_event(
            actor_id=user["id"],
            actor_email=user["email"],
            actor_role=user.get("role", ""),
            action="login_ip_blocked",
            category="auth",
            ip_address=client_ip,
            severity="critical",
            details={"reason": "ip_not_whitelisted"},
        )
        raise HTTPException(
            status_code=403,
            detail="Access denied: Your IP address is not authorized for this account type.",
        )

    # ── Single-session enforcement at login time ──
    # If user already has an active session and didn't request force, block login.
    # Admin is exempt. Sessions older than 24h are considered stale.
    if (
        not data.force_login
        and user.get("role") != "admin"
        and not user.get("session_exempt", False)
        and user.get("active_session_id")
    ):
        # Treat sessions older than 24h as stale (app crash, lost device, etc.)
        last_login = user.get("last_login_at")
        session_is_fresh = False
        if last_login:
            try:
                login_dt = datetime.fromisoformat(last_login.replace("Z", "+00:00"))
                session_is_fresh = (datetime.now(timezone.utc) - login_dt) < timedelta(hours=24)
            except (ValueError, TypeError):
                pass
        if session_is_fresh:
            return {
                "active_session_exists": True,
                "message": "This account is currently signed in on another device. Sign in here to end the other session.",
            }

    # Check estate ownership for multi-role flag (used in all response paths)
    _estate_list = await db.estates.find(
        {"owner_id": user["id"]}, {"_id": 0, "id": 1, "status": 1, "transitioned_at": 1}
    ).to_list(10)
    owns_estate = len(_estate_list) > 0

    # Check for transitioned benefactor accounts (sealed)
    if user.get("role") == "benefactor":
        transitioned_estate = next((e for e in _estate_list if e.get("status") == "transitioned"), None)
        if transitioned_estate:
            # Return sealed flag — frontend shows locked screen
            return {
                "sealed": True,
                "transitioned_at": transitioned_estate.get("transitioned_at", ""),
                "message": "This account has been transitioned and is immutably sealed.",
            }

    # Operators use their contact_email for OTP (not their username)
    if user.get("role") == "operator":
        otp_email = user.get("contact_email", "")
        if not otp_email:
            # No contact email — skip OTP, direct login
            token = await create_session_token(user["id"], user["email"], user["role"])
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
            )
            await log_audit_event(
                actor_id=user["id"],
                actor_email=user["email"],
                actor_role="operator",
                action="login",
                category="auth",
                ip_address=client_ip,
                severity="info",
            )
            return TokenResponse(
                access_token=token,
                user=_user_response(user, owns_estate=owns_estate),
            )
        # Has contact_email — use it for OTP (override the login email for OTP sending)

    # Check if user has a valid daily OTP trust (skip OTP for today)
    trust = await db.otp_trust.find_one({"user_id": user["id"], "ip_address": client_ip}, {"_id": 0})
    if trust:
        try:
            expires = datetime.fromisoformat(trust["expires_at"])
            if datetime.now(timezone.utc) < expires:
                # Trusted — skip OTP, return token directly
                token = await create_session_token(user["id"], user["email"], user["role"])
                await _reconcile_beneficiary_by_email(user)
                return TokenResponse(
                    access_token=token,
                    user=_user_response(user, owns_estate=owns_estate),
                )
        except (ValueError, TypeError):
            pass
        # Expired trust — clean up
        await db.otp_trust.delete_one({"user_id": user["id"], "ip_address": client_ip})

    # Check platform-wide OTP toggle — if disabled, skip OTP entirely
    platform_settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    if platform_settings and platform_settings.get("otp_disabled"):
        token = await create_session_token(user["id"], user["email"], user["role"])
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
        )
        await _reconcile_beneficiary_by_email(user)
        return TokenResponse(
            access_token=token,
            user=_user_response(user, owns_estate=owns_estate),
        )

    # Check per-user OTP preference — if user has disabled their own 2FA, skip OTP
    if user.get("otp_enabled") is False:
        token = await create_session_token(user["id"], user["email"], user["role"])
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
        )
        await _reconcile_beneficiary_by_email(user)
        return TokenResponse(
            access_token=token,
            user=_user_response(user, owns_estate=owns_estate),
        )

    # Send OTP for verification
    otp_code = generate_otp()
    # For operators, use their contact_email for OTP delivery
    otp_target_email = user.get("contact_email", user["email"]) if user.get("role") == "operator" else user["email"]
    await db.otps.update_one(
        {"user_id": user["id"]},
        {
            "$set": {
                "user_id": user["id"],
                "otp": otp_code,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    # Send OTP via email or SMS based on user preference
    email_sent = False
    sms_sent = False
    otp_method = "email"
    if user.get("sms_otp_enabled") and user.get("sms_phone_number"):
        otp_method = "sms"
        try:
            sms_sent = await send_otp_sms(user["sms_phone_number"], otp_code)
        except Exception:
            logger.warning(f"OTP SMS send failed for {data.email} — falling back to email")
        if not sms_sent:
            otp_method = "email"

    if otp_method == "email":
        try:
            email_sent = await send_otp_email(otp_target_email, otp_code, user["name"].split()[0])
        except Exception:
            logger.warning(f"OTP email send failed for {data.email} — OTP still stored")

    # Mask the phone for the frontend
    masked_phone = None
    if user.get("sms_phone_number"):
        ph = user["sms_phone_number"]
        masked_phone = f"***-***-{ph[-4:]}" if len(ph) >= 4 else "***"

    return {
        "message": "OTP sent via SMS"
        if sms_sent
        else ("OTP sent to your email" if email_sent else "Verification required — check your email or resend code"),
        "otp_required": True,
        "email_sent": email_sent,
        "sms_sent": sms_sent,
        "otp_method": otp_method,
        "has_sms": bool(user.get("sms_otp_enabled")),
        "masked_phone": masked_phone,
        "user_id": user["id"],
    }


@router.post("/auth/register")
async def register(data: UserCreate):
    """Register a new user account. Signup always creates benefactors.
    Beneficiaries join via invitation only."""
    # Username validation — if provided, check format and uniqueness
    if data.username:
        error = validate_username(data.username)
        if error:
            raise HTTPException(status_code=400, detail=error)
        username = data.username.strip()
        username_lower = username.lower()
        existing_username = await db.users.find_one({"username_lower": username_lower}, {"_id": 0, "id": 1})
        if existing_username:
            raise HTTPException(status_code=400, detail="That username is already taken. Please choose another.")
    else:
        # Auto-generate username from first + last name (no dot)
        username = await generate_unique_username(data.first_name, data.last_name)
        username_lower = username.lower()

    # Validate password — minimum security for sensitive estate data
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    has_upper = any(c.isupper() for c in data.password)
    has_lower = any(c.islower() for c in data.password)
    has_digit = any(c.isdigit() for c in data.password)
    if not (has_upper and has_lower and has_digit):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least one uppercase letter, one lowercase letter, and one number",
        )

    # Build full name
    name_parts = [data.first_name]
    if data.middle_name:
        name_parts.append(data.middle_name)
    name_parts.append(data.last_name)
    if data.suffix:
        name_parts.append(data.suffix)
    full_name = " ".join(name_parts)

    # Create user
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    trial_ends_at = (now + timedelta(days=TRIAL_DURATION_DAYS)).isoformat()

    # Determine eligible tier from age and special status
    eligible_tier = None
    special_statuses = data.special_status or []
    if data.date_of_birth and data.role == "benefactor":
        try:
            dob = datetime.fromisoformat(data.date_of_birth)
            age = (now - dob.replace(tzinfo=timezone.utc)).days // 365
            if 18 <= age <= 25:
                eligible_tier = "new_adult"
        except (ValueError, TypeError):
            pass
    # Special status overrides age-based tier
    if any(s in special_statuses for s in ["military", "first_responder", "federal_agent"]):
        eligible_tier = "military"
    elif "veteran" in special_statuses:
        eligible_tier = "veteran"
    elif "hospice" in special_statuses:
        eligible_tier = "hospice"
    elif "enterprise" in special_statuses:
        eligible_tier = "enterprise"

    user = {
        "id": user_id,
        "email": data.email,
        "username": username,
        "username_lower": username_lower,
        "password": hash_password(data.password),
        "name": full_name,
        "first_name": data.first_name,
        "middle_name": data.middle_name,
        "last_name": data.last_name,
        "suffix": data.suffix,
        "gender": data.gender,
        "date_of_birth": data.date_of_birth,
        "marital_status": data.marital_status,
        "dependents_over_18": data.dependents_over_18 or 0,
        "dependents_under_18": data.dependents_under_18 or 0,
        "address_street": data.address_street,
        "address_city": data.address_city,
        "address_state": data.address_state,
        "address_zip": data.address_zip,
        "special_status": special_statuses,
        "eligible_tier": eligible_tier,
        "role": "benefactor",
        "trial_ends_at": trial_ends_at,
        "subscription_status": "trialing",
        "created_at": now.isoformat(),
    }
    await db.users.insert_one(user)

    # --- Auto-create estate and beneficiary stubs for benefactors ---
    if user["role"] == "benefactor":
        estate_id = str(uuid.uuid4())
        estate = {
            "id": estate_id,
            "owner_id": user_id,
            "name": f"{data.last_name} Family Estate",
            "status": "pre-transition",
            "beneficiaries": [],
            "encryption_salt": generate_estate_salt().hex(),
            "created_at": now.isoformat(),
        }
        await db.estates.insert_one(estate)

        avatar_colors = [
            "#d4af37",
            "#3b82f6",
            "#10b981",
            "#8b5cf6",
            "#ef4444",
            "#f59e0b",
            "#ec4899",
            "#06b6d4",
        ]
        beneficiaries_to_insert = []

        # Use enrolled beneficiaries from signup if provided
        enrollments = data.beneficiary_enrollments or []
        for i, ben in enumerate(enrollments):
            first = (ben.get("first_name") or "").strip()
            middle = (ben.get("middle_name") or "").strip()
            last = (ben.get("last_name") or data.last_name).strip()
            initials = ((first[0] if first else "?") + (last[0] if last else "?")).upper()
            full_name = " ".join(p for p in [first, middle, last] if p)
            ben_email = (ben.get("email") or "").strip()
            has_email = bool(ben_email)
            beneficiaries_to_insert.append(
                {
                    "id": str(uuid.uuid4()),
                    "estate_id": estate_id,
                    "first_name": first,
                    "middle_name": middle,
                    "last_name": last,
                    "name": full_name,
                    "relation": ben.get("relation", ""),
                    "email": ben_email,
                    "date_of_birth": ben.get("dob"),
                    "initials": initials,
                    "avatar_color": avatar_colors[i % len(avatar_colors)],
                    "invitation_status": "pending" if has_email else "draft",
                    "invitation_token": str(uuid.uuid4()) if has_email else None,
                    "is_stub": not bool(first),
                    "address_street": ben.get("address_street") if not ben.get("same_address") else data.address_street,
                    "address_city": ben.get("address_city") if not ben.get("same_address") else data.address_city,
                    "address_state": ben.get("address_state") if not ben.get("same_address") else data.address_state,
                    "address_zip": ben.get("address_zip") if not ben.get("same_address") else data.address_zip,
                    "created_at": now.isoformat(),
                }
            )

        # Fallback: if no enrollments but marital/dependents info, create stubs
        if not enrollments:
            if data.marital_status in ("married", "domestic_partnership"):
                beneficiaries_to_insert.append(
                    {
                        "id": str(uuid.uuid4()),
                        "estate_id": estate_id,
                        "first_name": "",
                        "last_name": data.last_name,
                        "name": f"Spouse ({data.last_name})",
                        "relation": "Spouse",
                        "email": "",
                        "initials": "SP",
                        "avatar_color": avatar_colors[0],
                        "invitation_status": "draft",
                        "is_stub": True,
                        "created_at": now.isoformat(),
                    }
                )
            for i in range(data.dependents_over_18 or 0):
                beneficiaries_to_insert.append(
                    {
                        "id": str(uuid.uuid4()),
                        "estate_id": estate_id,
                        "first_name": "",
                        "last_name": data.last_name,
                        "name": f"Adult Beneficiary {i + 1}",
                        "relation": "Son",
                        "email": "",
                        "initials": f"A{i + 1}",
                        "avatar_color": avatar_colors[(i + 1) % len(avatar_colors)],
                        "invitation_status": "draft",
                        "is_stub": True,
                        "created_at": now.isoformat(),
                    }
                )
            for i in range(data.dependents_under_18 or 0):
                beneficiaries_to_insert.append(
                    {
                        "id": str(uuid.uuid4()),
                        "estate_id": estate_id,
                        "first_name": "",
                        "last_name": data.last_name,
                        "name": f"Minor Beneficiary {i + 1}",
                        "relation": "Son",
                        "email": "",
                        "initials": f"M{i + 1}",
                        "avatar_color": avatar_colors[(i + 2) % len(avatar_colors)],
                        "invitation_status": "draft",
                        "is_stub": True,
                        "created_at": now.isoformat(),
                    }
                )

        if beneficiaries_to_insert:
            await db.beneficiaries.insert_many(beneficiaries_to_insert)

            # Auto-send invitation emails to beneficiaries with email addresses
            from services.invitation_sender import send_invitation_email

            benefactor_info = {"name": full_name, "first_name": data.first_name}
            for ben_doc in beneficiaries_to_insert:
                if ben_doc.get("email") and ben_doc.get("invitation_token"):
                    asyncio.create_task(send_invitation_email(ben_doc, benefactor_info))

        # Seed 5 default Immediate Action Checklist items
        default_checklist = [
            {
                "id": str(uuid.uuid4()),
                "estate_id": estate_id,
                "title": "Call your designated executor — they have instructions",
                "description": "Your first call should be to the person you've designated to handle your estate. Edit this item to add their name and phone number.",
                "category": "immediate",
                "priority": "critical",
                "order": 1,
                "is_default": True,
                "activation_status": None,
                "created_at": now.isoformat(),
            },
            {
                "id": str(uuid.uuid4()),
                "estate_id": estate_id,
                "title": "Contact employer HR to report the death and ask about benefits",
                "description": "Life insurance through work, final paycheck, COBRA health coverage, and any survivor benefits.",
                "category": "immediate",
                "priority": "critical",
                "order": 2,
                "is_default": True,
                "activation_status": None,
                "created_at": now.isoformat(),
            },
            {
                "id": str(uuid.uuid4()),
                "estate_id": estate_id,
                "title": "Request 10 certified copies of the death certificate",
                "description": "Banks, insurance companies, and government agencies each require an original. Most families don't request enough.",
                "category": "immediate",
                "priority": "high",
                "order": 3,
                "is_default": True,
                "activation_status": None,
                "created_at": now.isoformat(),
            },
            {
                "id": str(uuid.uuid4()),
                "estate_id": estate_id,
                "title": "Freeze or monitor all joint financial accounts",
                "description": "Notify banks of the death. Prevent unauthorized transactions. Do not close accounts until the executor advises.",
                "category": "immediate",
                "priority": "high",
                "order": 4,
                "is_default": True,
                "activation_status": None,
                "created_at": now.isoformat(),
            },
            {
                "id": str(uuid.uuid4()),
                "estate_id": estate_id,
                "title": "Do NOT make any major financial decisions for 30 days",
                "description": "Grief impairs judgment. Avoid selling property, changing investments, or lending money during the initial period.",
                "category": "immediate",
                "priority": "high",
                "order": 5,
                "is_default": True,
                "activation_status": None,
                "created_at": now.isoformat(),
            },
        ]
        await db.checklists.insert_many(default_checklist)

    # Beneficiary signup via invitation only — no self-signup linking needed

    # --- Validate B2B code at signup if provided ---
    if data.b2b_code and "enterprise" in special_statuses:
        code_str = data.b2b_code.strip().upper()
        code_doc = await db.b2b_codes.find_one({"code": code_str, "active": True}, {"_id": 0})
        if code_doc:
            discount = code_doc.get("discount_percent", 100)
            if code_doc.get("max_uses", 0) == 0 or code_doc["times_used"] < code_doc["max_uses"]:
                await db.users.update_one(
                    {"id": user_id},
                    {
                        "$set": {
                            "b2b_code": code_str,
                            "b2b_partner": code_doc.get("partner_name", ""),
                            "b2b_discount_percent": discount,
                            "verified_tier": "enterprise",
                        }
                    },
                )
                await db.b2b_codes.update_one({"code": code_str}, {"$inc": {"times_used": 1}})
                # Auto-approve verification
                await db.tier_verifications.insert_one(
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "user_email": data.email,
                        "tier_requested": "enterprise",
                        "status": "approved",
                        "doc_type": "B2B Partner Code",
                        "notes": f"Code: {code_str} | Partner: {code_doc.get('partner_name', '')} | Discount: {discount}%",
                        "created_at": now.isoformat(),
                        "reviewed_at": now.isoformat(),
                    }
                )
                if discount >= 100:
                    await db.subscription_overrides.update_one(
                        {"user_id": user_id},
                        {"$set": {"user_id": user_id, "free_access": True}},
                        upsert=True,
                    )

    # Generate OTP for verification
    otp = generate_otp()
    await db.otps.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "otp": otp, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )

    # Send OTP via email
    await send_otp_email(data.email, otp, data.first_name)
    logger.info(f"Registration OTP sent for {data.email} (username: {username})")

    # NOTIFICATION: New user signup → founder
    from services.notifications import notify

    asyncio.create_task(
        notify.founder(
            "New User Signup",
            f"{full_name} ({data.email}, @{username}) registered as {user['role']}",
            url="/admin",
            priority="normal",
        )
    )

    return {
        "message": "Account created. Please verify with OTP.",
        "email": data.email,
        "username": username,
        "user_id": user_id,
    }


class VerifyPasswordRequest(BaseModel):
    email: str  # Can be email or username
    password: str


@router.post("/auth/verify-password")
async def verify_password_endpoint(data: VerifyPasswordRequest):
    """Verify account password without logging in. Used for sensitive settings changes."""
    user = await resolve_user_by_identifier(data.email)
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"verified": True}


class ResendOTPRequest(BaseModel):
    email: str  # Can be email or username
    method: str = "email"  # "email" or "sms"


@router.post("/auth/resend-otp")
async def resend_otp(data: ResendOTPRequest):
    """Resend OTP code to the user's email or phone. Rate-limited to prevent abuse."""
    user = await resolve_user_by_identifier(data.email)
    if not user:
        # Don't reveal whether the account exists
        return {"message": "If an account exists, a new code has been sent."}

    otp_code = generate_otp()
    await db.otps.update_one(
        {"user_id": user["id"]},
        {
            "$set": {
                "user_id": user["id"],
                "otp": otp_code,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    sent = False
    method_used = data.method
    if data.method == "sms" and user.get("sms_otp_enabled") and user.get("sms_phone_number"):
        try:
            sent = await send_otp_sms(user["sms_phone_number"], otp_code)
        except Exception:
            logger.warning(f"Resend OTP SMS failed for {user['email']}")
        if not sent:
            method_used = "email"

    if method_used == "email" or not sent:
        try:
            sent = await send_otp_email(user["email"], otp_code, user["name"].split()[0])
            method_used = "email"
        except Exception:
            logger.warning(f"Resend OTP email failed for {user['email']}")

    return {
        "message": f"A new verification code has been sent via {'SMS' if method_used == 'sms' else 'email'}."
        if sent
        else "Failed to send code — please try again.",
        "email_sent": sent and method_used == "email",
        "sms_sent": sent and method_used == "sms",
        "otp_method": method_used,
    }


class OTPVerifyWithTrust(BaseModel):
    email: str  # Can be email or username — resolves to user
    otp: str
    trust_today: bool = False


@router.post("/auth/verify-otp", response_model=TokenResponse)
async def verify_otp(data: OTPVerifyWithTrust, request: Request):
    """Verify OTP and return access token. Optionally trust this device for the rest of the day."""
    # Resolve the identifier to a user first
    user = await resolve_user_by_identifier(data.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Apple App Review demo bypass — configurable via env var
    demo_email = os.environ.get("DEMO_REVIEW_EMAIL", "")
    demo_otp = os.environ.get("DEMO_REVIEW_OTP", "")
    is_demo_bypass = demo_email and demo_otp and data.email == demo_email and data.otp == demo_otp

    if not is_demo_bypass:
        stored_otp = await db.otps.find_one({"user_id": user["id"]}, {"_id": 0})
        import hmac

        if not stored_otp or not hmac.compare_digest(stored_otp["otp"], data.otp):
            raise HTTPException(status_code=401, detail="Invalid OTP")

        # Check OTP expiry (10 minutes)
        otp_created = stored_otp.get("created_at", "")
        if otp_created:
            try:
                created_time = datetime.fromisoformat(otp_created.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) - created_time > timedelta(minutes=10):
                    await db.otps.delete_one({"user_id": user["id"]})
                    raise HTTPException(
                        status_code=401,
                        detail="OTP expired. Please request a new one.",
                    )
            except (ValueError, TypeError):
                pass

        # Delete used OTP
        await db.otps.delete_one({"user_id": user["id"]})

    # User already resolved above — no need for email lookup

    # If user opts to trust this device for today, store trust entry
    if data.trust_today:
        from zoneinfo import ZoneInfo

        et = ZoneInfo("America/New_York")
        now_et = datetime.now(et)
        # Midnight tonight Eastern Time
        midnight_et = now_et.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        expires_utc = midnight_et.astimezone(timezone.utc)

        client_ip = get_client_ip(request)
        await db.otp_trust.update_one(
            {"user_id": user["id"], "ip_address": client_ip},
            {
                "$set": {
                    "user_id": user["id"],
                    "ip_address": client_ip,
                    "expires_at": expires_utc.isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )

    token = await create_session_token(user["id"], user["email"], user["role"])
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
    )

    # Reconcile beneficiary invitation status on login
    await _reconcile_beneficiary_by_email(user)

    # Audit log for operator/founder logins
    if user["role"] in ("admin", "operator"):
        await log_audit_event(
            actor_id=user["id"],
            actor_email=user["email"],
            actor_role=user["role"],
            action="login",
            category="auth",
            ip_address=client_ip,
            severity="info",
        )

    _owns = bool(await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1}))
    return TokenResponse(
        access_token=token,
        user=_user_response(user, owns_estate=_owns),
    )


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get the current authenticated user's profile with multi-role flags."""
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    photo = user_doc.get("photo_url", "")

    # Fallback: if beneficiary has missing profile fields, pull from their beneficiary record
    ben_fallback = {}
    if current_user.get("role") == "beneficiary":
        ben_rec = await db.beneficiaries.find_one({"user_id": current_user["id"]}, {"_id": 0})
        if ben_rec:
            if not photo:
                photo = ben_rec.get("photo_url", "")
            # Map beneficiary fields to user profile fields for fallback
            for field in [
                "date_of_birth",
                "address_street",
                "address_city",
                "address_state",
                "address_zip",
                "gender",
                "marital_status",
            ]:
                if not user_doc.get(field) and ben_rec.get(field):
                    ben_fallback[field] = ben_rec[field]

    # Check if user owns any estates (for beneficiaries who created estates)
    owns_estate = await db.estates.find_one({"owner_id": current_user["id"]}, {"_id": 0, "id": 1})

    # Fetch session timeout policy for staff users
    session_timeout = None
    if current_user.get("role") in ("admin", "operator"):
        from routes.admin.session_policy import get_session_timeout_for_user

        session_timeout = await get_session_timeout_for_user(user_doc)

    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "name": current_user["name"],
        "role": current_user["role"],
        "created_at": current_user["created_at"],
        "photo_url": resolve_photo_url(photo),
        "operator_role": current_user.get("operator_role", ""),
        "admin_scope": user_doc.get("admin_scope", "")
        if isinstance(user_doc.get("admin_scope"), list)
        else ([user_doc["admin_scope"]] if user_doc.get("admin_scope") else []),
        "is_also_benefactor": user_doc.get("is_also_benefactor", False) or bool(owns_estate),
        "is_also_beneficiary": user_doc.get("is_also_beneficiary", False),
        "first_name": user_doc.get("first_name", ""),
        "last_name": user_doc.get("last_name", ""),
        "middle_name": user_doc.get("middle_name", ""),
        "suffix": user_doc.get("suffix", ""),
        "gender": user_doc.get("gender", "") or ben_fallback.get("gender", ""),
        "date_of_birth": user_doc.get("date_of_birth", "") or ben_fallback.get("date_of_birth", ""),
        "marital_status": user_doc.get("marital_status", "") or ben_fallback.get("marital_status", ""),
        "address_street": user_doc.get("address_street", "") or ben_fallback.get("address_street", ""),
        "address_city": user_doc.get("address_city", "") or ben_fallback.get("address_city", ""),
        "address_state": user_doc.get("address_state", "") or ben_fallback.get("address_state", ""),
        "address_zip": user_doc.get("address_zip", "") or ben_fallback.get("address_zip", ""),
        "address_line2": user_doc.get("address_line2", ""),
        "username": user_doc.get("username", ""),
        "needs_username_review": user_doc.get("needs_username_review", False),
        "is_beta_tester": user_doc.get("is_beta_tester", False),
        "beta_accepted": bool(user_doc.get("beta_accepted_at")),
        "hide_benefactor_reminder": user_doc.get("hide_benefactor_reminder", False),
        "otp_enabled": user_doc.get("otp_enabled", True),
        "primary_estate_id": user_doc.get("primary_estate_id", ""),
        "session_timeout_minutes": session_timeout,
    }


class ProfilePhotoUpdate(BaseModel):
    photo_data: str
    file_name: str = "photo.jpg"


@router.get("/auth/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get the current user's full profile."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/auth/profile")
async def update_profile(body: dict, current_user: dict = Depends(get_current_user)):
    """Update the current user's personal information."""
    allowed_fields = {
        "first_name",
        "middle_name",
        "last_name",
        "phone",
        "date_of_birth",
        "gender",
        "marital_status",
        "address_street",
        "address_line2",
        "address_city",
        "address_state",
        "address_zip",
        "hide_benefactor_reminder",
    }
    update = {k: v for k, v in body.items() if k in allowed_fields}
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # Rebuild display name if first/last changed
    if "first_name" in update or "last_name" in update:
        current = await db.users.find_one(
            {"id": current_user["id"]}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1}
        )
        fn = update.get("first_name", (current or {}).get("first_name", ""))
        ln = update.get("last_name", (current or {}).get("last_name", ""))
        update["name"] = f"{fn} {ln}".strip()

    await db.users.update_one({"id": current_user["id"]}, {"$set": update})

    # When the user changes their address_state in Settings, keep all their
    # owned estates in sync so the EGA, PDFs, and readiness reports always
    # reflect the user's current declared state of residence.
    if "address_state" in update and update["address_state"]:
        await db.estates.update_many(
            {"owner_id": current_user["id"]},
            {"$set": {"state": update["address_state"]}},
        )

    # Notify benefactors when a beneficiary updates key contact fields
    notify_fields = {
        "first_name",
        "last_name",
        "phone",
        "address_street",
        "address_city",
        "address_state",
        "address_zip",
    }
    changed_contact_fields = notify_fields & set(update.keys())
    if changed_contact_fields:
        try:
            from services.notifications import send_notification

            beneficiary_name = current_user.get("name", "A beneficiary")
            # Find all estates where this user is linked as a beneficiary
            linked_bens = await db.beneficiaries.find(
                {"user_id": current_user["id"]},
                {"_id": 0, "estate_id": 1, "id": 1},
            ).to_list(100)
            estate_ids = [b["estate_id"] for b in linked_bens if b.get("estate_id")]
            if estate_ids:
                estates = await db.estates.find(
                    {"id": {"$in": estate_ids}},
                    {"_id": 0, "owner_id": 1, "id": 1},
                ).to_list(100)
                notified = set()
                for est in estates:
                    owner_id = est.get("owner_id")
                    if owner_id and owner_id != current_user["id"] and owner_id not in notified:
                        await send_notification(
                            owner_id,
                            "Contact Info Updated",
                            f"{beneficiary_name} updated their contact information. Review their profile to keep your records current.",
                            url="/beneficiaries",
                            notification_type="beneficiary_profile_update",
                            priority="normal",
                        )
                        notified.add(owner_id)
        except Exception as e:
            logger.warning(f"Failed to send beneficiary update notification: {e}")

    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    return user


@router.put("/auth/profile-photo")
async def update_profile_photo(data: ProfilePhotoUpdate, current_user: dict = Depends(get_current_user)):
    """Upload a profile photo. Processes and stores in object storage."""
    import base64

    from services.photo_storage import delete_photo, upload_photo

    if not data.photo_data:
        # Remove photo — delete from storage if it's a stored key
        user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "photo_url": 1})
        old_key = (user_doc or {}).get("photo_url", "")
        if old_key and not old_key.startswith("data:"):
            await delete_photo(old_key)
        await db.users.update_one({"id": current_user["id"]}, {"$set": {"photo_url": ""}})
        return {"photo_url": ""}

    try:
        raw = base64.b64decode(data.photo_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")

    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo must be under 5MB")

    # Delete old photo from storage if it exists
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "photo_url": 1})
    old_key = (user_doc or {}).get("photo_url", "")
    if old_key and not old_key.startswith("data:"):
        await delete_photo(old_key)

    # Upload new photo
    photo_url = await upload_photo(raw, "users", current_user["id"])

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"photo_url": photo_url}},
    )

    return {"photo_url": resolve_photo_url(photo_url)}


@router.post("/auth/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    """Logout — blacklists the current token and clears active session."""
    from services.token_blacklist import blacklist_token

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token_str = auth_header.split(" ")[1]
        await blacklist_token(token_str, current_user["id"], reason="logout")
    # Clear active session so the user can log in from another device
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {"active_session_id": ""}},
    )
    return {"message": "Logged out successfully"}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/change-password")
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Change the current user's password. Requires current password verification."""
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "password": 1})
    if not user_doc or not verify_password(data.current_password, user_doc["password"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    new_hash = hash_password(data.new_password)
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"password": new_hash}})

    # SOC 2 CC6.1: Revoke all other sessions on password change
    from services.token_blacklist import revoke_all_user_tokens

    await revoke_all_user_tokens(current_user["id"])
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {"active_session_id": "", "last_login_at": ""}},
    )

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user["role"],
        action="password_change",
        category="auth",
        ip_address=get_client_ip(request),
        severity="info",
    )

    return {"message": "Password changed successfully"}


class TwoFAPreferenceRequest(BaseModel):
    otp_enabled: bool


@router.put("/auth/2fa-preference")
async def update_2fa_preference(
    data: TwoFAPreferenceRequest,
    current_user: dict = Depends(get_current_user),
):
    """Toggle the current user's personal 2FA preference."""
    # Check if global 2FA is disabled — if so, user can't enable their own
    platform_settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    if platform_settings and platform_settings.get("otp_disabled") and data.otp_enabled:
        raise HTTPException(
            status_code=400,
            detail="2FA is currently disabled platform-wide. Contact your administrator.",
        )

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"otp_enabled": data.otp_enabled}},
    )
    return {"otp_enabled": data.otp_enabled}


@router.get("/auth/2fa-preference")
async def get_2fa_preference(current_user: dict = Depends(get_current_user)):
    """Get the current user's 2FA preference and global status."""
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "otp_enabled": 1})
    platform_settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    global_disabled = (platform_settings or {}).get("otp_disabled", False)
    return {
        "otp_enabled": user.get("otp_enabled", True),
        "global_disabled": global_disabled,
    }


# ===================== SMS OTP SETUP =====================


class SMSOTPSetupRequest(BaseModel):
    phone_number: str
    sms_consent: bool = False


@router.post("/auth/sms-otp-setup")
async def sms_otp_setup(data: SMSOTPSetupRequest, current_user: dict = Depends(get_current_user)):
    """Send a verification OTP to the user's phone number to set up SMS 2FA."""
    import re

    phone = re.sub(r"[^\d+]", "", data.phone_number.strip())
    if not phone.startswith("+"):
        phone = f"+1{phone}"  # Default to US
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number")
    if not data.sms_consent:
        raise HTTPException(status_code=400, detail="You must consent to receive SMS verification codes")

    otp_code = generate_otp()
    await db.sms_otp_verifications.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "phone_number": phone,
                "otp": otp_code,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "verified": False,
            }
        },
        upsert=True,
    )

    sms_sent = await send_otp_sms(phone, otp_code)
    if not sms_sent:
        raise HTTPException(status_code=500, detail="Failed to send SMS. Please check your phone number and try again.")

    masked = f"***-***-{phone[-4:]}" if len(phone) >= 4 else "***"
    return {"message": f"Verification code sent to {masked}", "masked_phone": masked}


class SMSOTPVerifyRequest(BaseModel):
    otp: str


@router.post("/auth/sms-otp-verify")
async def sms_otp_verify(data: SMSOTPVerifyRequest, current_user: dict = Depends(get_current_user)):
    """Verify the phone number OTP and enable SMS 2FA."""
    record = await db.sms_otp_verifications.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="No pending phone verification. Please start setup again.")

    # Check expiry (10 minutes)
    created = datetime.fromisoformat(record["created_at"])
    if datetime.now(timezone.utc) - created > timedelta(minutes=10):
        raise HTTPException(status_code=400, detail="Verification code expired. Please request a new one.")

    if record["otp"] != data.otp:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Enable SMS OTP on the user record
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "sms_otp_enabled": True,
                "sms_phone_number": record["phone_number"],
                "sms_otp_setup_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    # Clean up verification record
    await db.sms_otp_verifications.delete_one({"user_id": current_user["id"]})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user["role"],
        action="sms_otp_enabled",
        category="auth",
        details={"phone_last4": record["phone_number"][-4:]},
    )

    return {"message": "SMS verification enabled successfully", "sms_otp_enabled": True}


@router.delete("/auth/sms-otp")
async def sms_otp_disable(current_user: dict = Depends(get_current_user)):
    """Disable SMS 2FA and remove phone number."""
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$unset": {"sms_otp_enabled": "", "sms_phone_number": "", "sms_otp_setup_at": ""}},
    )
    await db.sms_otp_verifications.delete_many({"user_id": current_user["id"]})

    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user["email"],
        actor_role=current_user["role"],
        action="sms_otp_disabled",
        category="auth",
        details={},
    )

    return {"message": "SMS verification disabled", "sms_otp_enabled": False}


@router.get("/auth/sms-otp-status")
async def sms_otp_status(current_user: dict = Depends(get_current_user)):
    """Get the current SMS OTP status for the user."""
    user = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "id": 1, "sms_otp_enabled": 1, "sms_phone_number": 1}
    )
    enabled = user.get("sms_otp_enabled", False) if user else False
    phone = user.get("sms_phone_number", "") if user else ""
    masked = f"***-***-{phone[-4:]}" if phone and len(phone) >= 4 else None
    return {"sms_otp_enabled": enabled, "masked_phone": masked}


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    username: str
    otp: str
    new_password: str


@router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """Send a password reset OTP. User enters their username."""
    username_lower = data.username.strip().lower()
    user = await db.users.find_one({"username_lower": username_lower}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    # Always return success to prevent username enumeration
    if not user:
        return {"message": "If that username exists, a reset code has been sent."}

    otp = f"{random.randint(0, 999999):06d}"
    await db.otp_codes.insert_one(
        {
            "user_id": user["id"],
            "code": otp,
            "purpose": "password_reset",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        }
    )

    first_name = (user.get("name") or "").split()[0] or "there"
    await send_otp_email(user["email"], otp, first_name)
    return {"message": "If that username exists, a reset code has been sent."}


@router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Verify OTP and set new password. User identifies by username."""
    username_lower = data.username.strip().lower()

    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    # Find the user by username
    user = await db.users.find_one({"username_lower": username_lower}, {"_id": 0, "id": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    # Find valid OTP by user_id
    otp_doc = await db.otp_codes.find_one(
        {"user_id": user["id"], "code": data.otp, "purpose": "password_reset"},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not otp_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")

    # Check expiry
    try:
        expires = datetime.fromisoformat(otp_doc["expires_at"].replace("Z", "+00:00"))
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(
                status_code=400,
                detail="Reset code has expired. Please request a new one.",
            )
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid reset code")

    # Update password
    new_hash = hash_password(data.new_password)
    await db.users.update_one({"id": user["id"]}, {"$set": {"password": new_hash}})

    # Clean up OTP
    await db.otp_codes.delete_many({"user_id": user["id"], "purpose": "password_reset"})

    return {"message": "Password reset successfully. You can now log in with your new password."}


@router.post("/auth/forgot-username")
async def forgot_username(data: dict):
    """Send the user their username(s) associated with an email address."""
    email = (data.get("email") or "").lower().strip()
    if not email:
        return {"message": "If that email exists, your username(s) have been sent."}

    users = await db.users.find({"email": email}, {"_id": 0, "username": 1, "name": 1, "id": 1}).to_list(10)

    if users:
        usernames = [u.get("username", "unknown") for u in users]
        names = [u.get("name", "") for u in users]
        # Send email with list of usernames
        username_list = "\n".join(f"  - {n}: {u}" for n, u in zip(names, usernames))
        from services.email import send_email

        await send_email(
            to=email,
            subject="Your CarryOn Username(s)",
            html=f"""
            <p>Hi,</p>
            <p>You requested your CarryOn username(s). Here they are:</p>
            <pre>{username_list}</pre>
            <p>Use your username to log in at carryon.us</p>
            <p>— The CarryOn Team</p>
            """,
        )

    # Always return generic message to prevent email enumeration
    return {"message": "If that email exists, your username(s) have been sent."}


class DevSwitchRequest(BaseModel):
    email: str


@router.post("/auth/dev-login")
async def dev_login(data: UserLogin, request: Request):
    """Admin impersonation: allows admin to login as any user via DevSwitcher.
    Requires either: (1) target is an admin account, or (2) a valid admin Bearer token."""
    user = await resolve_user_by_identifier(data.email)
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # If the target user is admin, allow directly
    if user.get("role") != "admin":
        # Non-admin target: require a valid admin token in Authorization header
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=403, detail="Admin authorization required for impersonation")
        try:
            token_str = auth_header.split(" ")[1]
            payload = decode_token(token_str)
            caller = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
            if not caller or caller.get("role") != "admin":
                raise HTTPException(status_code=403, detail="Only admins can impersonate users")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=403, detail="Invalid admin token for impersonation")

    token = await create_dev_session_token(user["id"], user["email"], user["role"])
    _owns = bool(await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1}))
    return TokenResponse(
        access_token=token,
        user=_user_response(user, owns_estate=_owns),
    )


@router.post("/auth/dev-switch")
async def dev_switch(data: DevSwitchRequest, request: Request):
    """Portal switcher: allows switching between configured dev accounts.
    Requires a valid session token (any role). Password is looked up from dev_config on the server.
    Security: stored passwords in dev_config are the access gate; only admins can configure them."""
    # Require a valid session token (any authenticated user)
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=403, detail="Authentication required")
    try:
        token_str = auth_header.split(" ")[1]
        payload = decode_token(token_str)
        caller = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0, "id": 1, "email": 1, "role": 1})
        if not caller:
            raise HTTPException(status_code=401, detail="User not found")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Look up dev_config to verify the caller is an admin or a configured dev account
    config = await db.dev_config.find_one({"id": "dev_switcher"}, {"_id": 0})
    if not config or not config.get("enabled", True):
        raise HTTPException(status_code=404, detail="Dev switcher not configured")

    configured_emails = {
        config.get("benefactor_email", ""),
        config.get("beneficiary_email", ""),
    }
    configured_emails.discard("")

    is_admin = caller.get("role") == "admin"
    is_configured_account = caller.get("email") in configured_emails
    if not is_admin and not is_configured_account:
        raise HTTPException(
            status_code=403,
            detail="Only admins or configured dev accounts can use portal switcher",
        )

    stored_password = None
    if config.get("benefactor_email") == data.email:
        stored_password = config.get("benefactor_password")
    if not stored_password and config.get("beneficiary_email") == data.email:
        stored_password = config.get("beneficiary_password")

    if not stored_password:
        raise HTTPException(status_code=400, detail="Email not configured in dev switcher")

    # Verify the stored password against the user
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(stored_password, user["password"]):
        raise HTTPException(
            status_code=401,
            detail="Stored password is incorrect. Update it in Admin → Dev Switcher.",
        )

    token = await create_dev_session_token(user["id"], user["email"], user["role"])
    _owns = bool(await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1}))
    return TokenResponse(
        access_token=token,
        user=_user_response(user, owns_estate=_owns),
    )


class UsernameUpdate(BaseModel):
    username: str


@router.get("/auth/username")
async def get_username(current_user: dict = Depends(get_current_user)):
    """Get the current user's username."""
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "username": 1})
    return {"username": (user_doc or {}).get("username", "")}


@router.put("/auth/username")
async def set_username(data: UsernameUpdate, current_user: dict = Depends(get_current_user)):
    """Set or update the current user's username. Must be unique."""
    username = data.username.strip()
    error = validate_username(username)
    if error:
        raise HTTPException(status_code=400, detail=error)

    username_lower = username.lower()

    # Check uniqueness (case-insensitive)
    existing = await db.users.find_one(
        {"username_lower": username_lower, "id": {"$ne": current_user["id"]}},
        {"_id": 0, "id": 1},
    )
    if existing:
        raise HTTPException(status_code=400, detail="That username is already taken")

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"username": username, "username_lower": username_lower, "needs_username_review": False}},
    )
    return {"username": username}


class DisplayNameUpdate(BaseModel):
    name: str


@router.put("/auth/display-name")
async def update_display_name(data: DisplayNameUpdate, current_user: dict = Depends(get_current_user)):
    """Update the current user's display name."""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"name": name}},
    )
    return {"name": name}


@router.post("/auth/notify-username-migration")
async def notify_username_migration(current_user: dict = Depends(get_current_user)):
    """Admin-only: Send an email to all migrated users notifying them of their new username.
    Only sends to users with needs_username_review=True."""
    if current_user.get("role") not in ("admin",) and current_user.get("operator_role") != "founder":
        raise HTTPException(status_code=403, detail="Admin access required")

    from services.email import send_email

    users = await db.users.find(
        {"needs_username_review": True},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "username": 1},
    ).to_list(10000)

    sent_count = 0
    for u in users:
        try:
            first_name = (u.get("name") or "there").split()[0]
            await send_email(
                to=u["email"],
                subject="CarryOn Update: Your New Username",
                html=f"""
                <p>Hi {first_name},</p>
                <p>CarryOn now uses <strong>usernames</strong> for signing in instead of email addresses.
                This means family members can share an email while each having their own secure account.</p>
                <p>Your username is: <strong>{u.get("username", "unknown")}</strong></p>
                <p>Next time you sign in, use your username instead of your email.
                You can change your username anytime after logging in.</p>
                <p>If you have any questions, reach out to us anytime.</p>
                <p>— The CarryOn Team</p>
                """,
            )
            sent_count += 1
        except Exception as e:
            logger.warning(f"Failed to send username notification to {u['email']}: {e}")

    return {"message": f"Sent username notification to {sent_count} users", "total": len(users), "sent": sent_count}
