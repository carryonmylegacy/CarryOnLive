"""Auth — Profile management (get, update, photo, username, display name)."""

from fastapi import Depends, HTTPException
from pydantic import BaseModel

from config import db, logger
from utils import get_current_user
from services.photo_urls import resolve_photo_url

from ._core import router, validate_username


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
    ben_links = await db.beneficiaries.find({"user_id": current_user["id"]}, {"_id": 0, "estate_id": 1}).to_list(100)
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
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

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

    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password": 0})
    return user


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


@router.put("/auth/display-name")
async def update_display_name(data: DisplayNameUpdate, current_user: dict = Depends(get_current_user)):
    """Update the current user's display name."""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"name": name}})
    return {"name": name}
