"""Auth — Profile management (get, update, photo, username, display name)."""

from fastapi import Depends, HTTPException
from pydantic import BaseModel, EmailStr

from config import db, logger
from utils import get_current_user
from services.photo_urls import resolve_photo_url

from ._core import router, validate_username


# Sensitive auth/security fields that must never be returned by the profile API
# (SOC2 / data-minimization — audit P1.3). Excluded via a Mongo projection.
_SENSITIVE_USER_FIELDS = (
    "password",
    "otp_secret",
    "otp_code",
    "totp_secret",
    "two_factor_secret",
    "offline_credentials",
    "offline_credential",
    "vault_master_key_hash",
    "security_answers",
    "reset_token",
    "reset_token_expires",
    "password_reset_token",
    "verify_token",
    "verification_token",
    "email_verification_token",
)
_SAFE_PROFILE_PROJECTION = {"_id": 0, **{f: 0 for f in _SENSITIVE_USER_FIELDS}}

# Defense-in-depth (audit 18a9d44 F-18-11): rather than relying solely on the
# denylist above (which a developer must remember to extend for every new
# sensitive field), also strip any key whose NAME matches a sensitive pattern.
# This auto-excludes future fields like `*_secret`, `*_token`, `*_hash`, etc.
# from the profile responses even if nobody updates _SENSITIVE_USER_FIELDS.
_PROFILE_SENSITIVE_PATTERNS = (
    "password",
    "secret",
    "token",
    "otp",
    "_hash",
    "security_answer",
    "offline_credential",
    "private_key",
    "recovery_code",
    "backup_code",
)


def _project_profile(doc: dict | None) -> dict | None:
    """Return a copy of a user doc with sensitive fields removed — both the
    explicit denylist AND any key matching a sensitive name pattern."""
    if not doc:
        return doc
    out = {}
    for k, v in doc.items():
        if k == "_id" or k in _SENSITIVE_USER_FIELDS:
            continue
        if any(p in k.lower() for p in _PROFILE_SENSITIVE_PATTERNS):
            continue
        out[k] = v
    return out


@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get the current authenticated user's profile with multi-role flags."""
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    photo = user_doc.get("photo_url", "")
    ben_fallback = {}
    if current_user.get("role") == "beneficiary":
        ben_rec = await db.beneficiaries.find_one({"user_id": current_user["id"]}, {"_id": 0})
        if ben_rec:
            if not photo:
                photo = ben_rec.get("photo_url", "")
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

    owns_estate = await db.estates.find_one({"owner_id": current_user["id"]}, {"_id": 0, "id": 1})

    # Public Device Mode — derive an effective flag from EVERY estate the
    # user can see (owned + beneficiary memberships). If ANY of those
    # estates has it on, the user's session inherits it. Idle timeout
    # uses the MIN across enabling estates so the strictest setting wins.
    pdm_active = False
    pdm_idle_seconds = None  # set on first match; resolved to 90 default below
    pdm_estate_ids: list[str] = []
    owned_cursor = db.estates.find({"owner_id": current_user["id"]}, {"_id": 0, "id": 1})
    async for est in owned_cursor:
        pdm_estate_ids.append(est["id"])
    ben_links = await db.beneficiaries.find({"user_id": current_user["id"]}, {"_id": 0, "estate_id": 1}).to_list(
        100
    )  # pre-push-invariants: allow-missing-id (downstream reads only estate_id)
    pdm_estate_ids.extend(b["estate_id"] for b in ben_links if b.get("estate_id"))
    if pdm_estate_ids:
        cursor = db.estates.find(
            {"id": {"$in": list(set(pdm_estate_ids))}, "public_device_mode": True},
            {"_id": 0, "id": 1, "public_device_idle_seconds": 1},
        )
        async for est in cursor:
            pdm_active = True
            secs = est.get("public_device_idle_seconds") or 90
            if pdm_idle_seconds is None or secs < pdm_idle_seconds:
                pdm_idle_seconds = secs
    if pdm_idle_seconds is None:
        pdm_idle_seconds = 90

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
        "admin_scope": (
            user_doc.get("admin_scope", "")
            if isinstance(user_doc.get("admin_scope"), list)
            else ([user_doc["admin_scope"]] if user_doc.get("admin_scope") else [])
        ),
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
        "public_device_mode": pdm_active,
        "public_device_idle_seconds": pdm_idle_seconds if pdm_active else 0,
        # ── Partner co-branding (B2B / Enterprise) ─────────────────
        # `partner_slug` drives the AuthContext effect that fetches
        # the partner's logo + company name and swaps the CarryOn
        # mark across the authenticated shell. Direct consumer
        # signups never have these fields, so their UX is untouched.
        "partner_slug": user_doc.get("partner_slug", "") or "",
        "partner_company": user_doc.get("partner_company", "") or "",
        # ── Trustee Mode (TMA) ────────────────────────────────────
        # When the current session was created via a trustee login,
        # `current_user` (resolved in utils.get_current_user) carries
        # `_trustee_mode=True`. Expose it on /auth/me so the
        # frontend can render the persistent banner and grey out
        # the trustee management surface.
        "trustee_mode": bool(current_user.get("_trustee_mode", False)),
        "trustee_display_name": current_user.get("_trustee_display_name", "") or "",
        "trustee_can_access_beneficiaries": bool(current_user.get("_trustee_can_access_beneficiaries", False)),
    }


@router.get("/auth/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get the current user's full profile.

    For beneficiary users, mirrors `/auth/me`'s fallback semantics by
    backfilling fields that live on the `beneficiaries` record but not
    the `users` record — chiefly `photo_url`, plus DOB / address /
    gender / marital_status. Without this, warm-up's `taskProfile`
    (which hits this endpoint) returns an empty `photo_url` for
    beneficiaries and never persists the photo bytes to IndexedDB,
    so offline relaunches show a Camera placeholder where the
    avatar should be (founder report May 3 2026).
    """
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user = _project_profile(user)

    if current_user.get("role") == "beneficiary":
        ben_rec = await db.beneficiaries.find_one({"user_id": current_user["id"]}, {"_id": 0})
        if ben_rec:
            if not user.get("photo_url") and ben_rec.get("photo_url"):
                user["photo_url"] = ben_rec["photo_url"]
            for field in [
                "date_of_birth",
                "address_street",
                "address_city",
                "address_state",
                "address_zip",
                "gender",
                "marital_status",
            ]:
                if not user.get(field) and ben_rec.get(field):
                    user[field] = ben_rec[field]

    # Resolve the photo URL through our presigning helper so warmup
    # can fetch the bytes for offline use.
    if user.get("photo_url"):
        try:
            user["photo_url"] = resolve_photo_url(user["photo_url"])
        except Exception:
            pass

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

    if "first_name" in update or "last_name" in update:
        current = await db.users.find_one(
            {"id": current_user["id"]}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1}
        )
        fn = update.get("first_name", (current or {}).get("first_name", ""))
        ln = update.get("last_name", (current or {}).get("last_name", ""))
        update["name"] = f"{fn} {ln}".strip()

    await db.users.update_one({"id": current_user["id"]}, {"$set": update})

    if "address_state" in update and update["address_state"]:
        await db.estates.update_many(
            {"owner_id": current_user["id"]},
            {"$set": {"state": update["address_state"]}},
        )

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

    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return _project_profile(user)


class ProfilePhotoUpdate(BaseModel):
    photo_data: str
    file_name: str = "photo.jpg"


@router.put("/auth/profile-photo")
async def update_profile_photo(data: ProfilePhotoUpdate, current_user: dict = Depends(get_current_user)):
    """Upload a profile photo."""
    import base64
    from services.photo_storage import delete_photo, upload_photo

    if not data.photo_data:
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

    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "photo_url": 1})
    old_key = (user_doc or {}).get("photo_url", "")
    if old_key and not old_key.startswith("data:"):
        await delete_photo(old_key)

    photo_url = await upload_photo(raw, "users", current_user["id"])
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"photo_url": photo_url}})
    return {"photo_url": resolve_photo_url(photo_url)}


@router.get("/auth/username")
async def get_username(current_user: dict = Depends(get_current_user)):
    """Get the current user's username."""
    user_doc = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "id": 1, "username": 1})
    return {"username": (user_doc or {}).get("username", "")}


class UsernameUpdate(BaseModel):
    username: str


@router.put("/auth/username")
async def set_username(data: UsernameUpdate, current_user: dict = Depends(get_current_user)):
    """Set or update the current user's username. Must be unique."""
    username = data.username.strip()
    error = validate_username(username)
    if error:
        raise HTTPException(status_code=400, detail=error)

    username_lower = username.lower()
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


class EmailUpdate(BaseModel):
    email: EmailStr


@router.put("/auth/email")
async def update_email(data: EmailUpdate, current_user: dict = Depends(get_current_user)):
    """Update the current user's email address.

    Email is one of two login identifiers (the other being username).
    Updating the email here:
      • Validates RFC 5322 format via pydantic EmailStr.
      • Enforces uniqueness against all other users (case-insensitive).
      • Updates both `email` and `email_lower` so subsequent logins
        with the new email resolve to this user.
      • Returns the new email so the frontend can refresh state.

    The admin Users tab reads from the same `users` collection, so the
    change propagates automatically — no separate admin write needed.
    """
    new_email = (data.email or "").strip()
    if not new_email:
        raise HTTPException(status_code=400, detail="Email cannot be empty")
    new_email_lower = new_email.lower()

    # Uniqueness check — scan both `email` and `email_lower` to cover
    # legacy users that may not have `email_lower` indexed yet.
    existing = await db.users.find_one(
        {
            "$and": [
                {"id": {"$ne": current_user["id"]}},
                {"$or": [{"email_lower": new_email_lower}, {"email": new_email_lower}]},
            ]
        },
        {"_id": 0, "id": 1},
    )
    if existing:
        raise HTTPException(status_code=400, detail="That email is already in use")

    old_email = (current_user.get("email") or "").strip()
    await db.users.update_one(
        {"id": current_user["id"]},
        # Login lowercases the input email before lookup (see
        # routes/auth/login.py), so store `email` lowercased to keep
        # email-based login working post-change. We also stamp
        # `email_lower` for any future queries that key off it.
        #
        # SECURITY: a changed email is UNVERIFIED until the user proves control
        # of the new address via OTP at next login (verify_otp sets it back to
        # True). Until then it must not grant any email-matched estate/
        # beneficiary access — see resolve_estate_actor + _reconcile_beneficiary_by_email.
        {"$set": {"email": new_email_lower, "email_lower": new_email_lower, "email_verified": False}},
    )
    logger.info(f"User {current_user['id']} updated email from {old_email!r} to {new_email!r}")

    # Account-takeover protection: notify BOTH the old and new email
    # address that the change occurred. Best-effort — never blocks
    # the response. Skip if old == new (defensive; uniqueness check
    # above already makes this unreachable for a real change).
    if old_email and old_email.lower() != new_email_lower:
        try:
            from services.email import send_email

            display_name = current_user.get("name") or current_user.get("first_name") or "there"
            subject = "Your CarryOn email address was changed"
            old_html = (
                f"<p>Hi {display_name},</p>"
                f"<p>The email address on your CarryOn account was just changed from "
                f"<strong>{old_email}</strong> to <strong>{new_email_lower}</strong>.</p>"
                f"<p>If this was you, no action is needed — future sign-in links and "
                f"notifications will go to your new address.</p>"
                f"<p><strong>If this was NOT you</strong>, reply to this email immediately "
                f'or contact <a href="mailto:founder@carryon.us">founder@carryon.us</a> '
                f"so we can lock down the account.</p>"
                f"<p>— The CarryOn team</p>"
            )
            new_html = (
                f"<p>Hi {display_name},</p>"
                f"<p>This is your new sign-in email for CarryOn. The change from "
                f"<strong>{old_email}</strong> to <strong>{new_email_lower}</strong> "
                f"was completed successfully.</p>"
                f"<p>Going forward, every CarryOn notification will land here.</p>"
                f"<p>— The CarryOn team</p>"
            )
            await send_email(old_email, subject, old_html)
            await send_email(new_email_lower, subject, new_html)
        except Exception as e:
            logger.warning(f"Email-change confirmation send failed: {e}")

    return {"email": new_email_lower}


@router.put("/auth/display-name")
async def update_display_name(data: DisplayNameUpdate, current_user: dict = Depends(get_current_user)):
    """Update the current user's display name."""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"name": name}})
    return {"name": name}
