"""CarryOn™ Backend — PUBLIC site content (no auth).

Lives in its own file with a standard `router` so it is (a) discoverable by the
route-policy scanner and (b) mounted at the API root WITHOUT the founder-scope
dependency that gates the admin platform routes. The logged-out marketing
homepage reads its YouTube video IDs + footer from here, so this MUST stay
unauthenticated — otherwise visitors get 401 and the page falls back to a stale
hardcoded default video.
"""

from fastapi import APIRouter

from config import db

router = APIRouter()


@router.get("/public/site-content")
async def get_public_site_content():
    """Public — non-sensitive site content settings (video IDs, footer, public flags)."""
    settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0}) or {}
    return {
        "homepage_video_id": settings.get("homepage_video_id", "KlZ8egF_Nyw"),
        "homepage_video_id_vertical": settings.get("homepage_video_id_vertical", "5fDJ9e7bEUo"),
        "footer_address_line1": settings.get("footer_address_line1", "1550 Wilson Boulevard 7th Floor"),
        "footer_address_line2": settings.get("footer_address_line2", "Arlington, VA 22209 U.S.A."),
        "footer_phone": settings.get("footer_phone", "(703) 889-0017"),
        # Public, non-sensitive feature flags (mirrors prior admin/platform behavior).
        "offline_mode": settings.get("offline_mode", "off"),
        "subscriptions_enabled": settings.get("subscriptions_enabled", True),
        "platform_free_mode": bool(settings.get("platform_free_mode", False)),
    }
