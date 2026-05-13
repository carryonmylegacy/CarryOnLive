"""Auth — User registration."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from config import db, logger
from models import UserCreate
from routes.admin.trial_policy import get_trial_days
from services.encryption import generate_estate_salt
from utils import generate_otp, hash_password, send_otp_email

from ._core import (
    _user_response,
    create_session_token,
    generate_unique_username,
    router,
    validate_username,
)


@router.post("/auth/register")
async def register(data: UserCreate):
    """Register a new benefactor account."""
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
        username = await generate_unique_username(data.first_name, data.last_name)
        username_lower = username.lower()

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

    name_parts = [data.first_name]
    if data.middle_name:
        name_parts.append(data.middle_name)
    name_parts.append(data.last_name)
    if data.suffix:
        name_parts.append(data.suffix)
    full_name = " ".join(name_parts)

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    trial_days = await get_trial_days()
    trial_ends_at = (now + timedelta(days=trial_days)).isoformat()

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

        avatar_colors = ["#d4af37", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b", "#ec4899", "#06b6d4"]
        beneficiaries_to_insert = []

        enrollments = data.beneficiary_enrollments or []
        for i, ben in enumerate(enrollments):
            first = (ben.get("first_name") or "").strip()
            middle = (ben.get("middle_name") or "").strip()
            last = (ben.get("last_name") or data.last_name).strip()
            initials = ((first[0] if first else "?") + (last[0] if last else "?")).upper()
            full_name_ben = " ".join(p for p in [first, middle, last] if p)
            ben_email = (ben.get("email") or "").strip().lower()
            has_email = bool(ben_email)
            beneficiaries_to_insert.append(
                {
                    "id": str(uuid.uuid4()),
                    "estate_id": estate_id,
                    "first_name": first,
                    "middle_name": middle,
                    "last_name": last,
                    "name": full_name_ben,
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

            from services.invitation_sender import send_invitation_email

            benefactor_info = {"name": full_name, "first_name": data.first_name}
            for ben_doc in beneficiaries_to_insert:
                if ben_doc.get("email") and ben_doc.get("invitation_token"):
                    asyncio.create_task(send_invitation_email(ben_doc, benefactor_info))

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

    otp = generate_otp()
    await db.otps.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "otp": otp, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )

    # Apr 27, 2026 — admin platform toggle to skip the signup-email-OTP gate.
    # Distinct from the per-login `otp_disabled` toggle. When ON, we still
    # create the user row + OTP row (so /auth/verify-otp continues to work
    # for users who DO get prompted), but we additionally issue a session
    # token in the response so the frontend can drop the user straight into
    # the dashboard. Off by default; flipped on by the founder for QA /
    # automation runs and turned back off afterwards.
    #
    # Apr 29, 2026 — LAUNCH SAFETY NET: when env LAUNCH_MODE=true the bypass
    # is force-disabled at the code level regardless of the DB toggle. This
    # guarantees the production launch cannot accidentally ship with the
    # bypass left on (it has been left on by mistake during prior QA sweeps).
    # The DB toggle is also auto-expiring — see _signup_otp_bypass_active().
    import os as _os

    platform_settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0}) or {}
    skip_signup_otp = bool(platform_settings.get("signup_otp_disabled", False))

    # Hard launch override
    if _os.environ.get("LAUNCH_MODE", "").lower() in ("true", "1", "yes"):
        if skip_signup_otp:
            logger.warning("LAUNCH_MODE=true — ignoring signup_otp_disabled DB toggle. OTP gate ENFORCED.")
        skip_signup_otp = False

    # Auto-expire the bypass after 24 hours unless the admin re-enables it.
    # The toggle row carries `signup_otp_disabled_at` so we know when it was
    # flipped on; if more than `signup_otp_bypass_ttl_hours` (default 24) have
    # elapsed, treat as disabled and atomically clean up the flag.
    if skip_signup_otp:
        bypass_at = platform_settings.get("signup_otp_disabled_at")
        ttl_hours = int(platform_settings.get("signup_otp_bypass_ttl_hours", 24) or 24)
        if bypass_at:
            try:
                set_at = datetime.fromisoformat(bypass_at.replace("Z", "+00:00"))
                if (datetime.now(timezone.utc) - set_at) > timedelta(hours=ttl_hours):
                    await db.platform_settings.update_one(
                        {"_id": "global"},
                        {
                            "$set": {
                                "signup_otp_disabled": False,
                                "signup_otp_auto_expired_at": datetime.now(timezone.utc).isoformat(),
                            }
                        },
                    )
                    logger.warning(f"signup_otp_disabled auto-expired after {ttl_hours}h — OTP gate restored.")
                    skip_signup_otp = False
            except (ValueError, TypeError):
                pass

    if skip_signup_otp:
        # Mark the user as already email-verified and hand back a token,
        # mirroring the login.py shape so the frontend can reuse its
        # post-login navigation logic.
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"email_verified": True, "last_login_at": datetime.now(timezone.utc).isoformat()}},
        )
        token = await create_session_token(user_id, data.email, user["role"])
        # Re-read to pick up the email_verified flag we just set.
        fresh_user = await db.users.find_one({"id": user_id}, {"_id": 0}) or user
        logger.info(f"Signup OTP bypass active — issued direct session token for {data.email} (@{username})")
    else:
        await send_otp_email(data.email, otp, data.first_name)
        logger.info(f"Registration OTP sent for {data.email} (username: {username})")

    from services.notifications import notify

    asyncio.create_task(
        notify.founder(
            "New User Signup",
            f"{full_name} ({data.email}, @{username}) registered as {user['role']}",
            url="/admin",
            priority="normal",
        )
    )

    if skip_signup_otp:
        # Brand-new account — hasn't built any estate state yet. Match the
        # login.py shape so the frontend can navigate straight into the
        # benefactor dashboard without an OTP modal.
        return {
            "message": "Account created — signup OTP gate is currently disabled by admin.",
            "email": data.email,
            "username": username,
            "user_id": user_id,
            "access_token": token,
            "user": _user_response(fresh_user, owns_estate=(user["role"] == "benefactor")),
            "skip_otp": True,
        }

    return {
        "message": "Account created. Please verify with OTP.",
        "email": data.email,
        "username": username,
        "user_id": user_id,
    }
