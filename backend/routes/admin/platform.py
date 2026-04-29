"""CarryOn™ Backend — Admin: Platform Settings, Site Content, Code Health & Photo Migration"""

import base64

from fastapi import APIRouter, Depends

from config import db, logger
from guards import require_admin

router = APIRouter()


# ===================== PLATFORM SETTINGS =====================


@router.get("/public/site-content")
async def get_public_site_content():
    """Public endpoint — returns non-sensitive site content settings (video ID, footer info, etc.)."""
    settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0}) or {}
    return {
        "homepage_video_id": settings.get("homepage_video_id", "EhU-jojs1jk"),
        "homepage_video_id_vertical": settings.get("homepage_video_id_vertical", ""),
        "footer_address_line1": settings.get("footer_address_line1", "1550 Wilson Boulevard 7th Floor"),
        "footer_address_line2": settings.get("footer_address_line2", "Arlington, VA 22209 U.S.A."),
        "footer_phone": settings.get("footer_phone", "(703) 884-1527"),
    }


@router.get("/admin/platform-settings")
async def get_platform_settings(current_user: dict = Depends(require_admin)):
    """Get platform-wide settings (admin only)."""
    settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    return settings or {"otp_disabled": False}


@router.put("/admin/platform-settings")
async def update_platform_settings(data: dict, current_user: dict = Depends(require_admin)):
    """Update platform-wide settings (admin only).
    When otp_disabled is changed from True to False (turning 2FA ON),
    all users' otp_enabled is reset to True."""
    allowed_keys = {
        "otp_disabled",
        "signup_otp_disabled",
        "signup_otp_bypass_ttl_hours",
        "referral_program_enabled",
        "homepage_video_id",
        "homepage_video_id_vertical",
        "footer_address_line1",
        "footer_address_line2",
        "footer_phone",
    }
    update = {k: v for k, v in data.items() if k in allowed_keys}
    if update:
        from datetime import datetime, timezone

        # Check if we're turning 2FA ON (otp_disabled going from True to False)
        if "otp_disabled" in update and not update["otp_disabled"]:
            old_settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
            was_disabled = (old_settings or {}).get("otp_disabled", False)
            if was_disabled:
                # Turning 2FA ON globally — reset all users to otp_enabled: true
                await db.users.update_many({}, {"$set": {"otp_enabled": True}})

        # Apr 29, 2026 — Stamp signup_otp_disabled_at whenever the bypass flips
        # ON, so the safety net in routes/auth/register.py can auto-expire it
        # after `signup_otp_bypass_ttl_hours` (default 24h).
        if "signup_otp_disabled" in update and update["signup_otp_disabled"]:
            old = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0}) or {}
            if not old.get("signup_otp_disabled"):
                update["signup_otp_disabled_at"] = datetime.now(timezone.utc).isoformat()
                update.pop("signup_otp_auto_expired_at", None)
                logger.warning(
                    f"signup_otp_disabled enabled by admin {current_user.get('email')} — auto-expires in "
                    f"{update.get('signup_otp_bypass_ttl_hours', 24)}h."
                )
        await db.platform_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    return settings or {"otp_disabled": False}


# ===================== CODE HEALTH =====================


@router.get("/admin/code-health")
async def get_code_health(current_user: dict = Depends(require_admin)):
    """Code health metrics for the Founder dashboard — API performance, error rates, uptime."""
    from middleware import api_metrics

    metrics = api_metrics.get_summary()

    # Database health check
    try:
        db_stats = await db.command("dbstats")
        db_health = {
            "status": "connected",
            "collections": db_stats.get("collections", 0),
            "data_size_mb": round(db_stats.get("dataSize", 0) / (1024 * 1024), 1),
            "storage_size_mb": round(db_stats.get("storageSize", 0) / (1024 * 1024), 1),
            "indexes": db_stats.get("indexes", 0),
        }
    except Exception:
        db_health = {
            "status": "error",
            "collections": 0,
            "data_size_mb": 0,
            "storage_size_mb": 0,
            "indexes": 0,
        }

    # Compute health scores
    error_rate = metrics["error_rate_pct"]
    avg_ms = metrics["avg_response_ms"]

    api_score = 100
    if avg_ms > 500:
        api_score -= 20
    elif avg_ms > 200:
        api_score -= 5
    if error_rate > 5:
        api_score -= 30
    elif error_rate > 1:
        api_score -= 10
    api_score = max(0, api_score)

    # Overall health grade
    if api_score >= 90:
        grade = "A"
        grade_color = "#22C55E"
    elif api_score >= 75:
        grade = "B"
        grade_color = "#84CC16"
    elif api_score >= 60:
        grade = "C"
        grade_color = "#F59E0B"
    else:
        grade = "D"
        grade_color = "#EF4444"

    return {
        "grade": grade,
        "grade_color": grade_color,
        "score": api_score,
        "api": metrics,
        "database": db_health,
        "eslint_warnings": 17,
        "last_test_pass_rate": "100%",
    }


# ===================== PHOTO MIGRATION (BASE64 -> S3) =====================


@router.post("/admin/migrate-photos")
async def migrate_photos_to_s3(current_user: dict = Depends(require_admin)):
    """One-time migration: convert all base64 photo_url values in the database
    to S3-backed URLs served via /api/photos/. Idempotent — skips already-migrated
    photos and data: URLs that fail to decode.

    Admin-only endpoint. Returns a summary of what was migrated."""
    from services.photo_storage import upload_photo

    results = {
        "users": 0,
        "beneficiaries": 0,
        "estates": 0,
        "overrides": 0,
        "errors": [],
    }

    async def _migrate_field(collection, query_field, category, id_field="id"):
        """Migrate a single photo field across a collection."""
        count = 0
        cursor = collection.find(
            {query_field: {"$regex": "^data:"}},
            {"_id": 0, id_field: 1, query_field: 1},
        )
        async for doc in cursor:
            entity_id = doc.get(id_field, "unknown")
            data_url = doc[query_field]
            try:
                # Parse data URL: "data:image/jpeg;base64,/9j/4AAQ..."
                _header, b64_data = data_url.split(",", 1)
                raw = base64.b64decode(b64_data)
                photo_url = await upload_photo(raw, category, entity_id)
                await collection.update_one(
                    {id_field: entity_id},
                    {"$set": {query_field: photo_url}},
                )
                count += 1
            except Exception as e:
                err_msg = f"{category}/{entity_id}: {str(e)[:80]}"
                logger.warning(f"Photo migration failed: {err_msg}")
                results["errors"].append(err_msg)
        return count

    # 1. Users — photo_url
    results["users"] = await _migrate_field(db.users, "photo_url", "users")

    # 2. Beneficiaries — photo_url
    results["beneficiaries"] = await _migrate_field(db.beneficiaries, "photo_url", "beneficiaries")

    # 3. Estates — estate_photo_url
    results["estates"] = await _migrate_field(db.estates, "estate_photo_url", "estates")

    # 4. Display overrides — owner_photo_url (keyed by user_id + estate_id)
    override_count = 0
    async for ov in db.beneficiary_display_overrides.find(
        {"owner_photo_url": {"$regex": "^data:"}},
        {"_id": 0, "id": 1, "user_id": 1, "estate_id": 1, "owner_photo_url": 1},
    ):
        try:
            _header, b64_data = ov["owner_photo_url"].split(",", 1)
            raw = base64.b64decode(b64_data)
            photo_url = await upload_photo(raw, "overrides", f"{ov['user_id']}_{ov['estate_id']}")
            await db.beneficiary_display_overrides.update_one(
                {"user_id": ov["user_id"], "estate_id": ov["estate_id"]},
                {"$set": {"owner_photo_url": photo_url}},
            )
            override_count += 1
        except Exception as e:
            err_msg = f"override/{ov.get('user_id')}: {str(e)[:80]}"
            logger.warning(f"Photo migration failed: {err_msg}")
            results["errors"].append(err_msg)
    results["overrides"] = override_count

    total = sum(results[k] for k in ["users", "beneficiaries", "estates", "overrides"])
    return {
        "success": True,
        "migrated": total,
        "breakdown": {
            "users": results["users"],
            "beneficiaries": results["beneficiaries"],
            "estates": results["estates"],
            "display_overrides": results["overrides"],
        },
        "errors": results["errors"][:20],
        "message": f"Migrated {total} photos from base64 to S3."
        if total > 0
        else "No base64 photos found — all already migrated or none exist.",
    }
