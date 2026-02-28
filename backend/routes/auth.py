"""CarryOn™ Backend — Authentication Routes"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from config import db, logger
from models import OTPVerify, TokenResponse, UserCreate, UserLogin, UserResponse
from utils import (
    create_token,
    decode_token,
    generate_otp,
    get_current_user,
    hash_password,
    send_otp_email,
    verify_password,
)

router = APIRouter()

TRIAL_DURATION_DAYS = 30

# ===================== AUTH ROUTES =====================


@router.post("/auth/login")
async def login(data: UserLogin, request: Request):
    """Login — returns token directly (OTP temporarily disabled)."""
    client_ip = request.client.host if request.client else "unknown"

    # Check for account lockout (5 failed attempts in 15 minutes)
    lockout_window = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    recent_failures = await db.failed_logins.count_documents({
        "email": data.email,
        "timestamp": {"$gte": lockout_window},
    })
    if recent_failures >= 5:
        raise HTTPException(
            status_code=429,
            detail="Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.",
        )

    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        # Record failed attempt
        await db.failed_logins.insert_one({
            "email": data.email,
            "ip_address": client_ip,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Clear failed attempts on successful login
    await db.failed_logins.delete_many({"email": data.email})

    token = create_token(user["id"], user["email"], user["role"])
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
        "role": data.role
        if data.role in ["benefactor", "beneficiary"]
        else "benefactor",
        "trial_ends_at": trial_ends_at,
        "subscription_status": "trialing",
        "created_at": now.isoformat(),
    }
    await db.users.insert_one(user)

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


@router.post("/auth/verify-otp", response_model=TokenResponse)
async def verify_otp(data: OTPVerify):
    """Verify OTP and return access token."""
    stored_otp = await db.otps.find_one({"email": data.email}, {"_id": 0})
    if not stored_otp or stored_otp["otp"] != data.otp:
        raise HTTPException(status_code=401, detail="Invalid OTP")

    # Check OTP expiry (10 minutes)
    otp_created = stored_otp.get("created_at", "")
    if otp_created:
        try:
            created_time = datetime.fromisoformat(otp_created.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - created_time > timedelta(minutes=10):
                await db.otps.delete_one({"email": data.email})
                raise HTTPException(status_code=401, detail="OTP expired. Please request a new one.")
        except (ValueError, TypeError):
            pass

    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete used OTP
    await db.otps.delete_one({"email": data.email})

    token = create_token(user["id"], user["email"], user["role"])

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

    token = create_token(user["id"], user["email"], user["role"])
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
            raise HTTPException(status_code=403, detail="Only admins can use dev-switch")
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
        raise HTTPException(status_code=400, detail="Email not configured in dev switcher")

    # Verify the stored password against the user
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(stored_password, user["password"]):
        raise HTTPException(status_code=401, detail="Stored password is incorrect. Update it in Admin → Dev Switcher.")

    token = create_token(user["id"], user["email"], user["role"])
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
