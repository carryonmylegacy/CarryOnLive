"""CarryOn™ Backend — Authentication Routes"""

import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from config import db, logger
from models import TokenResponse, UserCreate, UserLogin, UserResponse
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


def get_client_ip(request: Request) -> str:
    """Get real client IP, accounting for reverse proxies."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ===================== AUTH ROUTES =====================


@router.post("/auth/login")
async def login(data: UserLogin, request: Request):
    """Login — verifies credentials, then sends OTP unless user has a daily trust token."""
    client_ip = get_client_ip(request)

    # Check for account lockout (5 failed attempts in 15 minutes)
    lockout_window = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    recent_failures = await db.failed_logins.count_documents(
        {
            "email": data.email,
            "timestamp": {"$gte": lockout_window},
        }
    )
    if recent_failures >= 5:
        raise HTTPException(
            status_code=429,
            detail="Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.",
        )

    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        # Record failed attempt
        await db.failed_logins.insert_one(
            {
                "email": data.email,
                "ip_address": client_ip,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Clear failed attempts on successful login
    await db.failed_logins.delete_many({"email": data.email})

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
                    user=UserResponse(
                        id=user["id"],
                        email=user["email"],
                        name=user["name"],
                        role=user["role"],
                        created_at=user["created_at"],
                    ),
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
            user=UserResponse(
                id=user["id"],
                email=user["email"],
                name=user["name"],
                role=user["role"],
                created_at=user["created_at"],
            ),
        )

    # Send OTP for verification
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

    # Send OTP via email
    email_sent = False
    try:
        email_sent = await send_otp_email(data.email, otp_code, user["name"].split()[0])
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
        raise HTTPException(status_code=400, detail="Email already registered")

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
            first = ben.get("first_name", "").strip()
            middle = ben.get("middle_name", "").strip()
            last = ben.get("last_name", data.last_name).strip()
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
                    "dob": ben.get("dob"),
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
                        "name": f"Adult Dependent {i + 1}",
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
                        "name": f"Minor Dependent {i + 1}",
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
                "category": "first_week",
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
                "category": "first_week",
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
                "category": "first_week",
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
                "category": "first_week",
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
                "category": "first_month",
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
    user = await db.users.find_one({"email": data.email}, {"_id": 0, "password": 1})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"verified": True}


class ResendOTPRequest(BaseModel):
    email: str


@router.post("/auth/resend-otp")
async def resend_otp(data: ResendOTPRequest):
    """Resend OTP code to the user's email. Rate-limited to prevent abuse."""
    user = await db.users.find_one({"email": data.email}, {"_id": 0, "name": 1})
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
        if not stored_otp or stored_otp["otp"] != data.otp:
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

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            created_at=user["created_at"],
        ),
    )


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get the current authenticated user's profile."""
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        role=current_user["role"],
        created_at=current_user["created_at"],
    )


@router.post("/auth/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    """Logout — blacklists the current token server-side."""
    from services.token_blacklist import blacklist_token

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token_str = auth_header.split(" ")[1]
        await blacklist_token(token_str, current_user["id"], reason="logout")
    return {"message": "Logged out successfully"}


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

    token = await create_session_token(user["id"], user["email"], user["role"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            created_at=user["created_at"],
        ),
    )


@router.post("/auth/dev-switch")
async def dev_switch(data: DevSwitchRequest, request: Request):
    """Admin-only impersonation using stored dev_config credentials.
    The admin token is required. Password is looked up from dev_config on the server."""
    # Require a valid admin token
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=403, detail="Admin authorization required")
    try:
        token_str = auth_header.split(" ")[1]
        payload = decode_token(token_str)
        caller = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not caller or caller.get("role") != "admin":
            raise HTTPException(
                status_code=403, detail="Only admins can use dev-switch"
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid admin token")

    # Look up stored password from dev_config
    config = await db.dev_config.find_one({"id": "dev_switcher"}, {"_id": 0})
    if not config:
        raise HTTPException(status_code=404, detail="Dev switcher not configured")

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

    token = await create_session_token(user["id"], user["email"], user["role"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            created_at=user["created_at"],
        ),
    )
