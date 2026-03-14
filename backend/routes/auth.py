"""CarryOn™ Backend — Authentication Routes"""

import os
import random
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
    verify_password,
)
from services.encryption import generate_estate_salt
from services.photo_urls import resolve_photo_url


def _user_response(user: dict, owns_estate: bool = False) -> UserResponse:
    """Build a UserResponse from a DB user dict, including multi-role flags."""
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user["role"],
        created_at=user["created_at"],
        photo_url=resolve_photo_url(user.get("photo_url", "")),
        operator_role=user.get("operator_role", ""),
        is_also_benefactor=user.get("is_also_benefactor", False) or owns_estate,
        is_also_beneficiary=user.get("is_also_beneficiary", False) or False,
    )


router = APIRouter()

TRIAL_DURATION_DAYS = 30


async def create_session_token(user_id, email, role):
    """Create a token and store the session_id on the user for single-session enforcement."""
    import uuid as _uuid

    session_id = str(_uuid.uuid4())
    token = create_token(user_id, email, role, session_id)
    # Admin is exempt from single-session — don't overwrite their session
    if role != "admin":
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


class EmailCheckRequest(BaseModel):
    email: str


@router.post("/auth/check-email")
async def check_email_exists(data: EmailCheckRequest):
    """Check if an email is already registered. Used during signup to prevent duplicates."""
    user = await db.users.find_one(
        {"email": data.email.lower().strip()}, {"_id": 0, "id": 1}
    )
    return {"exists": user is not None}


@router.post("/auth/check-benefactor-email")
async def check_benefactor_email(data: EmailCheckRequest):
    """Check if an email belongs to a user who owns an active estate."""
    email = data.email.lower().strip()
    user = await db.users.find_one(
        {"email": email}, {"_id": 0, "id": 1, "role": 1, "is_also_benefactor": 1}
    )
    if not user:
        return {
            "valid": False,
            "message": "No benefactor estates are associated with that email address.",
        }
    # User must either be a benefactor or have is_also_benefactor flag
    is_benefactor = user.get("role") == "benefactor" or user.get(
        "is_also_benefactor", False
    )
    if not is_benefactor:
        # Also check if they own any estate directly
        estate = await db.estates.find_one(
            {"owner_id": user["id"]}, {"_id": 0, "id": 1}
        )
        if not estate:
            return {
                "valid": False,
                "message": "No benefactor estates are associated with that email address.",
            }
        return {"valid": True}
    estate = await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1})
    if not estate:
        return {
            "valid": False,
            "message": "No benefactor estates are associated with that email address.",
        }
    return {"valid": True}


@router.post("/auth/login")
async def login(data: UserLogin, request: Request):
    """Login — verifies credentials, then sends OTP unless user has a daily trust token."""
    client_ip = get_client_ip(request)

    # Check for account lockout (10 failed attempts in 3 minutes)
    lockout_window = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    recent_failures = await db.failed_logins.count_documents(
        {
            "email": data.email,
            "timestamp": {"$gte": lockout_window},
        }
    )
    if recent_failures >= 10:
        # Find the oldest failure in this window to calculate remaining lockout
        oldest_failure = await db.failed_logins.find_one(
            {"email": data.email, "timestamp": {"$gte": lockout_window}},
            {"_id": 0, "timestamp": 1},
            sort=[("timestamp", 1)],
        )
        retry_after = 180  # 3 minutes default
        if oldest_failure and oldest_failure.get("timestamp"):
            try:
                oldest_ts = datetime.fromisoformat(
                    oldest_failure["timestamp"].replace("Z", "+00:00")
                )
                unlock_at = oldest_ts + timedelta(minutes=3)
                retry_after = max(
                    1, int((unlock_at - datetime.now(timezone.utc)).total_seconds())
                )
            except (ValueError, TypeError):
                pass
        raise HTTPException(
            status_code=429,
            detail=f"Account temporarily locked. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    # Support login via username OR email
    login_input = data.email.strip()
    login_lower = login_input.lower()
    user = await db.users.find_one({"email": login_lower}, {"_id": 0})
    if not user:
        # Try username lookup (case-insensitive)
        user = await db.users.find_one({"username_lower": login_lower}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        # Record failed attempt
        await db.failed_logins.insert_one(
            {
                "email": login_input,
                "ip_address": client_ip,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Clear failed attempts on successful login
    await db.failed_logins.delete_many({"email": data.email})

    # Check estate ownership for multi-role flag (used in all response paths)
    _estate_list = await db.estates.find(
        {"owner_id": user["id"]}, {"_id": 0, "id": 1, "status": 1, "transitioned_at": 1}
    ).to_list(10)
    owns_estate = len(_estate_list) > 0

    # Check for transitioned benefactor accounts (sealed)
    if user.get("role") == "benefactor":
        transitioned_estate = next(
            (e for e in _estate_list if e.get("status") == "transitioned"), None
        )
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
    trust = await db.otp_trust.find_one(
        {"user_id": user["id"], "ip_address": client_ip}, {"_id": 0}
    )
    if trust:
        try:
            expires = datetime.fromisoformat(trust["expires_at"])
            if datetime.now(timezone.utc) < expires:
                # Trusted — skip OTP, return token directly
                token = await create_session_token(
                    user["id"], user["email"], user["role"]
                )
                return TokenResponse(
                    access_token=token,
                    user=_user_response(user, owns_estate=owns_estate),
                )
        except (ValueError, TypeError):
            pass
        # Expired trust — clean up
        await db.otp_trust.delete_one({"user_id": user["id"], "ip_address": client_ip})

    # Check platform-wide OTP toggle — if disabled, skip OTP entirely
    platform_settings = await db.platform_settings.find_one(
        {"_id": "global"}, {"_id": 0}
    )
    if platform_settings and platform_settings.get("otp_disabled"):
        token = await create_session_token(user["id"], user["email"], user["role"])
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
        )
        return TokenResponse(
            access_token=token,
            user=_user_response(user, owns_estate=owns_estate),
        )

    # Send OTP for verification
    otp_code = generate_otp()
    # For operators, use their contact_email for OTP delivery
    otp_target_email = (
        user.get("contact_email", data.email)
        if user.get("role") == "operator"
        else data.email
    )
    await db.otps.update_one(
        {"email": data.email},
        {
            "$set": {
                "otp": otp_code,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    # Send OTP via email
    email_sent = False
    try:
        email_sent = await send_otp_email(
            otp_target_email, otp_code, user["name"].split()[0]
        )
    except Exception:
        logger.warning(f"OTP email send failed for {data.email} — OTP still stored")

    return {
        "message": "OTP sent to your email"
        if email_sent
        else "Verification required — check your email or resend code",
        "otp_required": True,
        "email_sent": email_sent,
    }


@router.post("/auth/register")
async def register(data: UserCreate):
    """Register a new user account"""
    # Check if email already exists
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        existing_role = existing.get("role", "")
        if existing_role == "beneficiary" and data.role == "benefactor":
            raise HTTPException(
                status_code=400,
                detail="This email is already registered as a beneficiary. Please log in with your existing account — you can start your own estate plan from the beneficiary dashboard.",
            )
        raise HTTPException(
            status_code=400, detail="Email already registered. Please log in instead."
        )

    # Validate password — minimum security for sensitive estate data
    if len(data.password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters"
        )
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
    if any(
        s in special_statuses for s in ["military", "first_responder", "federal_agent"]
    ):
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
        "username": data.email,
        "username_lower": data.email.lower(),
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
        "role": data.role
        if data.role in ["benefactor", "beneficiary"]
        else "benefactor",
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
            initials = (
                (first[0] if first else "?") + (last[0] if last else "?")
            ).upper()
            full_name = " ".join(p for p in [first, middle, last] if p)
            beneficiaries_to_insert.append(
                {
                    "id": str(uuid.uuid4()),
                    "estate_id": estate_id,
                    "first_name": first,
                    "middle_name": middle,
                    "last_name": last,
                    "name": full_name,
                    "relation": ben.get("relation", ""),
                    "email": ben.get("email", "") or "",
                    "date_of_birth": ben.get("dob"),
                    "initials": initials,
                    "avatar_color": avatar_colors[i % len(avatar_colors)],
                    "invitation_status": "pending" if ben.get("email") else "draft",
                    "is_stub": not bool(first),
                    "address_street": ben.get("address_street")
                    if not ben.get("same_address")
                    else data.address_street,
                    "address_city": ben.get("address_city")
                    if not ben.get("same_address")
                    else data.address_city,
                    "address_state": ben.get("address_state")
                    if not ben.get("same_address")
                    else data.address_state,
                    "address_zip": ben.get("address_zip")
                    if not ben.get("same_address")
                    else data.address_zip,
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

    # --- Link beneficiary to benefactor's estate ---
    if user["role"] == "beneficiary" and data.benefactor_email:
        benefactor = await db.users.find_one(
            {"email": data.benefactor_email, "role": "benefactor"}, {"_id": 0, "id": 1}
        )
        if benefactor:
            estate = await db.estates.find_one(
                {"owner_id": benefactor["id"]}, {"_id": 0, "id": 1}
            )
            if estate:
                # Add to estate's beneficiaries list
                await db.estates.update_one(
                    {"id": estate["id"]},
                    {"$addToSet": {"beneficiaries": user_id}},
                )
                # Link to existing beneficiary record or create one
                existing_ben = await db.beneficiaries.find_one(
                    {"estate_id": estate["id"], "email": data.email}, {"_id": 0}
                )
                if existing_ben:
                    await db.beneficiaries.update_one(
                        {"id": existing_ben["id"]},
                        {
                            "$set": {
                                "user_id": user_id,
                                "invitation_status": "accepted",
                                "name": full_name,
                                "first_name": data.first_name,
                                "last_name": data.last_name,
                                "is_stub": False,
                            }
                        },
                    )
                    # Copy fields from beneficiary record to user if not already set
                    ben_fields_to_copy = {}
                    if existing_ben.get("date_of_birth") and not data.date_of_birth:
                        ben_fields_to_copy["date_of_birth"] = existing_ben[
                            "date_of_birth"
                        ]
                    if existing_ben.get("address_street"):
                        ben_fields_to_copy["address_street"] = existing_ben[
                            "address_street"
                        ]
                        ben_fields_to_copy["address_city"] = existing_ben.get(
                            "address_city", ""
                        )
                        ben_fields_to_copy["address_state"] = existing_ben.get(
                            "address_state", ""
                        )
                        ben_fields_to_copy["address_zip"] = existing_ben.get(
                            "address_zip", ""
                        )
                    if ben_fields_to_copy:
                        await db.users.update_one(
                            {"id": user_id}, {"$set": ben_fields_to_copy}
                        )
                else:
                    await db.beneficiaries.insert_one(
                        {
                            "id": str(uuid.uuid4()),
                            "estate_id": estate["id"],
                            "user_id": user_id,
                            "first_name": data.first_name,
                            "last_name": data.last_name,
                            "name": full_name,
                            "email": data.email,
                            "relation": "",
                            "initials": (
                                data.first_name[0] + data.last_name[0]
                            ).upper(),
                            "avatar_color": "#60A5FA",
                            "invitation_status": "accepted",
                            "is_stub": False,
                            "created_at": now.isoformat(),
                        }
                    )
                # Store the link on the user for quick lookup
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"benefactor_email": data.benefactor_email}},
                )

    # --- Validate B2B code at signup if provided ---
    if data.b2b_code and "enterprise" in special_statuses:
        code_str = data.b2b_code.strip().upper()
        code_doc = await db.b2b_codes.find_one(
            {"code": code_str, "active": True}, {"_id": 0}
        )
        if code_doc:
            discount = code_doc.get("discount_percent", 100)
            if (
                code_doc.get("max_uses", 0) == 0
                or code_doc["times_used"] < code_doc["max_uses"]
            ):
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
                await db.b2b_codes.update_one(
                    {"code": code_str}, {"$inc": {"times_used": 1}}
                )
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
        {"email": data.email},
        {"$set": {"otp": otp, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )

    # Send OTP via email
    await send_otp_email(data.email, otp, data.first_name)
    logger.info(f"Registration OTP sent for {data.email}")

    # NOTIFICATION: New user signup → founder
    import asyncio
    from services.notifications import notify

    asyncio.create_task(
        notify.founder(
            "New User Signup",
            f"{full_name} ({data.email}) registered as {user['role']}",
            url="/admin",
            priority="normal",
        )
    )

    return {
        "message": "Account created. Please verify with OTP.",
        "email": data.email,
    }


class VerifyPasswordRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/verify-password")
async def verify_password_endpoint(data: VerifyPasswordRequest):
    """Verify account password without logging in. Used for sensitive settings changes."""
    user = await db.users.find_one(
        {"email": data.email}, {"_id": 0, "id": 1, "password": 1}
    )
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"verified": True}


class ResendOTPRequest(BaseModel):
    email: str


@router.post("/auth/resend-otp")
async def resend_otp(data: ResendOTPRequest):
    """Resend OTP code to the user's email. Rate-limited to prevent abuse."""
    user = await db.users.find_one(
        {"email": data.email}, {"_id": 0, "id": 1, "name": 1}
    )
    if not user:
        # Don't reveal whether the email exists
        return {"message": "If an account exists, a new code has been sent."}

    otp_code = generate_otp()
    await db.otps.update_one(
        {"email": data.email},
        {
            "$set": {
                "otp": otp_code,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    email_sent = False
    try:
        email_sent = await send_otp_email(data.email, otp_code, user["name"].split()[0])
    except Exception:
        logger.warning(f"Resend OTP email failed for {data.email}")

    return {
        "message": "A new verification code has been sent to your email."
        if email_sent
        else "Failed to send code — please try again.",
        "email_sent": email_sent,
    }


class OTPVerifyWithTrust(BaseModel):
    email: str
    otp: str
    trust_today: bool = False


@router.post("/auth/verify-otp", response_model=TokenResponse)
async def verify_otp(data: OTPVerifyWithTrust, request: Request):
    """Verify OTP and return access token. Optionally trust this device for the rest of the day."""
    # Apple App Review demo bypass — configurable via env var
    demo_email = os.environ.get("DEMO_REVIEW_EMAIL", "")
    demo_otp = os.environ.get("DEMO_REVIEW_OTP", "")
    is_demo_bypass = (
        demo_email and demo_otp and data.email == demo_email and data.otp == demo_otp
    )

    if not is_demo_bypass:
        stored_otp = await db.otps.find_one({"email": data.email}, {"_id": 0})
        import hmac

        if not stored_otp or not hmac.compare_digest(stored_otp["otp"], data.otp):
            raise HTTPException(status_code=401, detail="Invalid OTP")

        # Check OTP expiry (10 minutes)
        otp_created = stored_otp.get("created_at", "")
        if otp_created:
            try:
                created_time = datetime.fromisoformat(
                    otp_created.replace("Z", "+00:00")
                )
                if datetime.now(timezone.utc) - created_time > timedelta(minutes=10):
                    await db.otps.delete_one({"email": data.email})
                    raise HTTPException(
                        status_code=401,
                        detail="OTP expired. Please request a new one.",
                    )
            except (ValueError, TypeError):
                pass

        # Delete used OTP
        await db.otps.delete_one({"email": data.email})

    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # If user opts to trust this device for today, store trust entry
    if data.trust_today:
        from zoneinfo import ZoneInfo

        et = ZoneInfo("America/New_York")
        now_et = datetime.now(et)
        # Midnight tonight Eastern Time
        midnight_et = now_et.replace(
            hour=0, minute=0, second=0, microsecond=0
        ) + timedelta(days=1)
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

    _owns = bool(
        await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1})
    )
    return TokenResponse(
        access_token=token,
        user=_user_response(user, owns_estate=_owns),
    )


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get the current authenticated user's profile with multi-role flags."""
    user_doc = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "password": 0}
    )
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    photo = user_doc.get("photo_url", "")

    # Fallback: if beneficiary has missing profile fields, pull from their beneficiary record
    ben_fallback = {}
    if current_user.get("role") == "beneficiary":
        ben_rec = await db.beneficiaries.find_one(
            {"user_id": current_user["id"]}, {"_id": 0}
        )
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
    owns_estate = await db.estates.find_one(
        {"owner_id": current_user["id"]}, {"_id": 0, "id": 1}
    )

    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "name": current_user["name"],
        "role": current_user["role"],
        "created_at": current_user["created_at"],
        "photo_url": resolve_photo_url(photo),
        "operator_role": current_user.get("operator_role", ""),
        "is_also_benefactor": user_doc.get("is_also_benefactor", False)
        or bool(owns_estate),
        "is_also_beneficiary": user_doc.get("is_also_beneficiary", False),
        "first_name": user_doc.get("first_name", ""),
        "last_name": user_doc.get("last_name", ""),
        "middle_name": user_doc.get("middle_name", ""),
        "suffix": user_doc.get("suffix", ""),
        "gender": user_doc.get("gender", "") or ben_fallback.get("gender", ""),
        "date_of_birth": user_doc.get("date_of_birth", "")
        or ben_fallback.get("date_of_birth", ""),
        "marital_status": user_doc.get("marital_status", "")
        or ben_fallback.get("marital_status", ""),
        "address_street": user_doc.get("address_street", "")
        or ben_fallback.get("address_street", ""),
        "address_city": user_doc.get("address_city", "")
        or ben_fallback.get("address_city", ""),
        "address_state": user_doc.get("address_state", "")
        or ben_fallback.get("address_state", ""),
        "address_zip": user_doc.get("address_zip", "")
        or ben_fallback.get("address_zip", ""),
        "address_line2": user_doc.get("address_line2", ""),
        "username": user_doc.get("username", ""),
    }


class ProfilePhotoUpdate(BaseModel):
    photo_data: str
    file_name: str = "photo.jpg"


@router.get("/auth/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get the current user's full profile."""
    user = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "password": 0}
    )
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
    }
    update = {k: v for k, v in body.items() if k in allowed_fields}
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # Rebuild display name if first/last changed
    if "first_name" in update or "last_name" in update:
        current = await db.users.find_one(
            {"id": current_user["id"]}, {"_id": 0, "first_name": 1, "last_name": 1}
        )
        fn = update.get("first_name", (current or {}).get("first_name", ""))
        ln = update.get("last_name", (current or {}).get("last_name", ""))
        update["name"] = f"{fn} {ln}".strip()

    await db.users.update_one({"id": current_user["id"]}, {"$set": update})
    user = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "password": 0}
    )
    return user


@router.put("/auth/profile-photo")
async def update_profile_photo(
    data: ProfilePhotoUpdate, current_user: dict = Depends(get_current_user)
):
    """Upload a profile photo. Processes and stores in object storage."""
    import base64

    from services.photo_storage import delete_photo, upload_photo

    if not data.photo_data:
        # Remove photo — delete from storage if it's a stored key
        user_doc = await db.users.find_one(
            {"id": current_user["id"]}, {"_id": 0, "id": 1, "photo_url": 1}
        )
        old_key = (user_doc or {}).get("photo_url", "")
        if old_key and not old_key.startswith("data:"):
            await delete_photo(old_key)
        await db.users.update_one(
            {"id": current_user["id"]}, {"$set": {"photo_url": ""}}
        )
        return {"photo_url": ""}

    try:
        raw = base64.b64decode(data.photo_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 data")

    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo must be under 5MB")

    # Delete old photo from storage if it exists
    user_doc = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "id": 1, "photo_url": 1}
    )
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
    """Logout — blacklists the current token server-side."""
    from services.token_blacklist import blacklist_token

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token_str = auth_header.split(" ")[1]
        await blacklist_token(token_str, current_user["id"], reason="logout")
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
        raise HTTPException(
            status_code=400, detail="New password must be at least 8 characters"
        )

    user_doc = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "id": 1, "password": 1}
    )
    if not user_doc or not verify_password(data.current_password, user_doc["password"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"id": current_user["id"]}, {"$set": {"password": new_hash}}
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


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str


@router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """Send a password reset OTP to the user's email."""
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If that email exists, a reset code has been sent."}

    otp = f"{random.randint(0, 999999):06d}"
    await db.otp_codes.insert_one(
        {
            "email": email,
            "code": otp,
            "purpose": "password_reset",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(minutes=10)
            ).isoformat(),
        }
    )

    first_name = (user.get("name") or "").split()[0] or "there"
    await send_otp_email(email, otp, first_name)
    return {"message": "If that email exists, a reset code has been sent."}


@router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Verify OTP and set new password."""
    email = data.email.lower().strip()

    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters"
        )

    # Find valid OTP
    otp_doc = await db.otp_codes.find_one(
        {"email": email, "code": data.otp, "purpose": "password_reset"},
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
    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    new_hash = hash_password(data.new_password)
    await db.users.update_one({"id": user["id"]}, {"$set": {"password": new_hash}})

    # Clean up OTP
    await db.otp_codes.delete_many({"email": email, "purpose": "password_reset"})

    return {
        "message": "Password reset successfully. You can now log in with your new password."
    }


class DevSwitchRequest(BaseModel):
    email: str


@router.post("/auth/dev-login")
async def dev_login(data: UserLogin, request: Request):
    """Admin impersonation: allows admin to login as any user via DevSwitcher.
    Requires either: (1) target is an admin account, or (2) a valid admin Bearer token."""
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # If the target user is admin, allow directly
    if user.get("role") != "admin":
        # Non-admin target: require a valid admin token in Authorization header
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=403, detail="Admin authorization required for impersonation"
            )
        try:
            token_str = auth_header.split(" ")[1]
            payload = decode_token(token_str)
            caller = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
            if not caller or caller.get("role") != "admin":
                raise HTTPException(
                    status_code=403, detail="Only admins can impersonate users"
                )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=403, detail="Invalid admin token for impersonation"
            )

    token = await create_dev_session_token(user["id"], user["email"], user["role"])
    _owns = bool(
        await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1})
    )
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
        caller = await db.users.find_one(
            {"id": payload["user_id"]}, {"_id": 0, "id": 1, "email": 1, "role": 1}
        )
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
    elif config.get("beneficiary_email") == data.email:
        stored_password = config.get("beneficiary_password")

    if not stored_password:
        raise HTTPException(
            status_code=400, detail="Email not configured in dev switcher"
        )

    # Verify the stored password against the user
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(stored_password, user["password"]):
        raise HTTPException(
            status_code=401,
            detail="Stored password is incorrect. Update it in Admin → Dev Switcher.",
        )

    token = await create_dev_session_token(user["id"], user["email"], user["role"])
    _owns = bool(
        await db.estates.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1})
    )
    return TokenResponse(
        access_token=token,
        user=_user_response(user, owns_estate=_owns),
    )


class UsernameUpdate(BaseModel):
    username: str


@router.get("/auth/username")
async def get_username(current_user: dict = Depends(get_current_user)):
    """Get the current user's username."""
    user_doc = await db.users.find_one(
        {"id": current_user["id"]}, {"_id": 0, "id": 1, "username": 1}
    )
    return {"username": (user_doc or {}).get("username", "")}


@router.put("/auth/username")
async def set_username(
    data: UsernameUpdate, current_user: dict = Depends(get_current_user)
):
    """Set or update the current user's username. Must be unique."""
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

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
        {"$set": {"username": username, "username_lower": username_lower}},
    )
    return {"username": username}


class DisplayNameUpdate(BaseModel):
    name: str


@router.put("/auth/display-name")
async def update_display_name(
    data: DisplayNameUpdate, current_user: dict = Depends(get_current_user)
):
    """Update the current user's display name."""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"name": name}},
    )
    return {"name": name}
