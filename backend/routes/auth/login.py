"""Auth — Login, OTP verification, resend-OTP, username/email availability checks."""

import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from pydantic import BaseModel

from config import db, logger
from models import TokenResponse, UserLogin
from services.audit import get_client_ip, log_audit_event
from utils import generate_otp, send_otp_email, send_otp_sms, verify_password

from ._core import (
    _reconcile_beneficiary_by_email,
    _user_response,
    create_session_token,
    resolve_user_by_identifier,
    router,
)


class UsernameCheckRequest(BaseModel):
    username: str


@router.post("/auth/check-username")
async def check_username_available(data: UsernameCheckRequest):
    """Check if a username is available. Used during signup for real-time validation."""
    from ._core import validate_username

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

    lockout_window = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    lockout_email = data.email.strip().lower()

    admin_check = await db.users.find_one(
        {"$or": [{"email": lockout_email}, {"username_lower": lockout_email}]},
        {"_id": 0, "id": 1, "role": 1, "session_exempt": 1},
    )
    is_admin = admin_check and admin_check.get("role") == "admin"
    is_exempt = admin_check and admin_check.get("session_exempt", False)
    if is_admin or is_exempt:
        await db.failed_logins.delete_many({"email": lockout_email})
    if not is_admin and not is_exempt:
        recent_failures = await db.failed_logins.count_documents(
            {"email": lockout_email, "timestamp": {"$gte": lockout_window}}
        )
        if recent_failures >= 25:
            oldest_failure = await db.failed_logins.find_one(
                {"email": lockout_email, "timestamp": {"$gte": lockout_window}},
                {"_id": 0, "id": 1, "timestamp": 1},
                sort=[("timestamp", 1)],
            )
            retry_after = 300
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

    login_input = data.email.strip()
    login_lower = login_input.lower()
    user = await db.users.find_one({"username_lower": login_lower}, {"_id": 0})
    if not user:
        users_with_email = await db.users.find({"email": login_lower}, {"_id": 0}).to_list(2)
        if len(users_with_email) == 1:
            user = users_with_email[0]
        elif len(users_with_email) > 1:
            raise HTTPException(
                status_code=400,
                detail="Multiple accounts use this email. Please log in with your username instead.",
            )

    # ── Trustee Mode (TMA) login fast-path ────────────────────────────────
    # If no CarryOn user account matches the identifier, check the
    # `trustee_grants` collection. A valid match issues a JWT whose
    # `user_id` is the benefactor and whose `acting_as` claim carries
    # the same value. Every downstream handler then operates on the
    # benefactor's identity (see utils.get_current_user). The path is
    # additionally gated on the `tma` feature key for the benefactor's
    # active tier so the founder's per-tier toggle in Admin → Subs is
    # respected (a grant cannot be used while TMA is disabled for that
    # benefactor's plan).
    if not user:
        from routes.trustee_access import find_active_trustee_grant_by_username

        trustee_grant = await find_active_trustee_grant_by_username(login_lower)
        if trustee_grant and verify_password(data.password, trustee_grant.get("password_hash", "")):
            benefactor = await db.users.find_one({"id": trustee_grant["benefactor_id"]}, {"_id": 0})
            if not benefactor:
                raise HTTPException(status_code=401, detail="Benefactor account not found.")

            # Feature-gate check — respect founder's per-tier toggle.
            try:
                from routes.feature_gates import is_feature_enabled_for_user

                if not await is_feature_enabled_for_user(benefactor, "tma"):
                    raise HTTPException(
                        status_code=403,
                        detail="Trustee Mode is not enabled on this account's plan.",
                    )
            except HTTPException:
                raise
            except Exception:
                # If the resolver fails for any reason we fail closed.
                raise HTTPException(
                    status_code=503,
                    detail="Trustee login is temporarily unavailable. Please try again shortly.",
                )

            from utils import create_token
            import uuid as _uuid

            session_id = str(_uuid.uuid4())
            extra_claims = {
                "acting_as": trustee_grant["benefactor_id"],
                "trustee_grant_id": trustee_grant["id"],
                "trustee_display_name": trustee_grant.get("trustee_display_name", "Trustee"),
            }
            token = create_token(
                user_id=benefactor["id"],
                email=benefactor["email"],
                role=benefactor.get("role", "benefactor"),
                session_id=session_id,
                extra_claims=extra_claims,
            )
            await db.trustee_grants.update_one(
                {"id": trustee_grant["id"]},
                {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}},
            )
            await db.failed_logins.delete_many({"email": login_lower})
            await log_audit_event(
                actor_id=benefactor["id"],
                actor_email=benefactor["email"],
                actor_role=benefactor.get("role", ""),
                action="trustee_login",
                category="auth",
                ip_address=client_ip,
                severity="info",
                details={
                    "grant_id": trustee_grant["id"],
                    "trustee_username": trustee_grant.get("trustee_username", ""),
                },
            )
            # Tag the response so the frontend can react (banner, greyed UI).
            benefactor_response = _user_response(benefactor, owns_estate=True)
            benefactor_response_dict = (
                benefactor_response.model_dump()
                if hasattr(benefactor_response, "model_dump")
                else benefactor_response.dict()
            )
            benefactor_response_dict["trustee_mode"] = True
            benefactor_response_dict["trustee_display_name"] = trustee_grant.get("trustee_display_name", "")
            benefactor_response_dict["trustee_can_access_beneficiaries"] = bool(
                trustee_grant.get("include_beneficiaries", False)
            )
            return {"access_token": token, "token_type": "bearer", "user": benefactor_response_dict}

    if not user or not verify_password(data.password, user["password"]):
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
        await db.failed_logins.insert_one(
            {
                "email": login_lower,
                "ip_address": client_ip,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
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

    await db.failed_logins.delete_many({"email": login_lower})

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

    if (
        not data.force_login
        and user.get("role") != "admin"
        and not user.get("session_exempt", False)
        and user.get("active_session_id")
    ):
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

    _estate_list = await db.estates.find(
        {"owner_id": user["id"]}, {"_id": 0, "id": 1, "status": 1, "transitioned_at": 1}
    ).to_list(10)
    owns_estate = len(_estate_list) > 0

    if user.get("role") == "benefactor":
        transitioned_estate = next((e for e in _estate_list if e.get("status") == "transitioned"), None)
        if transitioned_estate:
            return {
                "sealed": True,
                "transitioned_at": transitioned_estate.get("transitioned_at", ""),
                "message": "This account has been transitioned and is immutably sealed.",
            }

    if user.get("role") == "operator":
        otp_email = user.get("contact_email", "")
        if not otp_email:
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

    trust = await db.otp_trust.find_one({"user_id": user["id"], "ip_address": client_ip}, {"_id": 0})
    if trust:
        try:
            expires = datetime.fromisoformat(trust["expires_at"])
            if datetime.now(timezone.utc) < expires:
                token = await create_session_token(user["id"], user["email"], user["role"])
                await _reconcile_beneficiary_by_email(user)
                return TokenResponse(
                    access_token=token,
                    user=_user_response(user, owns_estate=owns_estate),
                )
        except (ValueError, TypeError):
            pass
        await db.otp_trust.delete_one({"user_id": user["id"], "ip_address": client_ip})

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

    otp_code = generate_otp()
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

    masked_phone = None
    if user.get("sms_phone_number"):
        ph = user["sms_phone_number"]
        masked_phone = f"***-***-{ph[-4:]}" if len(ph) >= 4 else "***"

    return {
        "message": (
            "OTP sent via SMS"
            if sms_sent
            else ("OTP sent to your email" if email_sent else "Verification required — check your email or resend code")
        ),
        "otp_required": True,
        "email_sent": email_sent,
        "sms_sent": sms_sent,
        "otp_method": otp_method,
        "has_sms": bool(user.get("sms_otp_enabled")),
        "masked_phone": masked_phone,
        "user_id": user["id"],
    }


class ResendOTPRequest(BaseModel):
    email: str
    method: str = "email"


@router.post("/auth/resend-otp")
async def resend_otp(data: ResendOTPRequest):
    """Resend OTP code to the user's email or phone."""
    user = await resolve_user_by_identifier(data.email)
    if not user:
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
        "message": (
            f"A new verification code has been sent via {'SMS' if method_used == 'sms' else 'email'}."
            if sent
            else "Failed to send code — please try again."
        ),
        "email_sent": sent and method_used == "email",
        "sms_sent": sent and method_used == "sms",
        "otp_method": method_used,
    }


class OTPVerifyWithTrust(BaseModel):
    email: str
    otp: str
    trust_today: bool = False


@router.post("/auth/verify-otp", response_model=TokenResponse)
async def verify_otp(data: OTPVerifyWithTrust, request: Request):
    """Verify OTP and return access token."""
    user = await resolve_user_by_identifier(data.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    demo_email = os.environ.get("DEMO_REVIEW_EMAIL", "")
    demo_otp = os.environ.get("DEMO_REVIEW_OTP", "")
    is_demo_bypass = demo_email and demo_otp and data.email == demo_email and data.otp == demo_otp

    if not is_demo_bypass:
        stored_otp = await db.otps.find_one({"user_id": user["id"]}, {"_id": 0})
        import hmac

        if not stored_otp or not hmac.compare_digest(stored_otp["otp"], data.otp):
            raise HTTPException(status_code=401, detail="Invalid OTP")

        otp_created = stored_otp.get("created_at", "")
        if otp_created:
            try:
                created_time = datetime.fromisoformat(otp_created.replace("Z", "+00:00"))
                if datetime.now(timezone.utc) - created_time > timedelta(minutes=10):
                    await db.otps.delete_one({"user_id": user["id"]})
                    raise HTTPException(status_code=401, detail="OTP expired. Please request a new one.")
            except (ValueError, TypeError):
                pass

        await db.otps.delete_one({"user_id": user["id"]})

    if data.trust_today:
        from zoneinfo import ZoneInfo

        et = ZoneInfo("America/New_York")
        now_et = datetime.now(et)
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
    await _reconcile_beneficiary_by_email(user)

    client_ip = get_client_ip(request)
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
