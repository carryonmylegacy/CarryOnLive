"""CarryOn™ Backend — PUBLIC site content (no auth).

Lives in its own file with a standard `router` so it is (a) discoverable by the
route-policy scanner and (b) mounted at the API root WITHOUT the founder-scope
dependency that gates the admin platform routes. The logged-out marketing
homepage reads its YouTube video IDs + footer from here, so this MUST stay
unauthenticated — otherwise visitors get 401 and the page falls back to a stale
hardcoded default video.
"""

from fastapi import APIRouter, HTTPException, Request, Response

from config import db
from routes.admin.trial_policy import get_trial_days

router = APIRouter()


@router.get("/public/founder-headshot")
async def get_founder_headshot():
    """Public — founder headshot image for the About page (managed in the
    admin portal's Site Content tab). 404 until one is uploaded, which the
    About page treats as 'show the placeholder'."""
    asset = await db.site_assets.find_one({"_id": "founder_headshot"})
    if not asset:
        raise HTTPException(status_code=404, detail="No headshot uploaded")
    return Response(
        content=bytes(asset["data"]),
        media_type=asset.get("content_type", "image/jpeg"),
        headers={
            "Cache-Control": "public, max-age=300",
            "ETag": f'"{asset.get("updated_at", "")}"',
        },
    )


@router.get("/public/site-content")
async def get_public_site_content(request: Request):
    """Public — non-sensitive site content settings (video IDs, footer, public flags)."""
    settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0}) or {}
    headshot = await db.site_assets.find_one({"_id": "founder_headshot"}, {"_id": 1, "updated_at": 1})
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    # Prefer the proxy-visible host so the URL is reachable from the browser
    # (behind an ingress `request.url.netloc` can be an internal cluster name).
    host = (request.headers.get("x-forwarded-host") or request.url.netloc).split(",")[0].strip()
    api_base = f"{proto}://{host}"
    return {
        "homepage_video_id": settings.get("homepage_video_id", "KlZ8egF_Nyw"),
        "homepage_video_id_vertical": settings.get("homepage_video_id_vertical", "5fDJ9e7bEUo"),
        "footer_address_line1": settings.get("footer_address_line1", "1550 Wilson Boulevard 7th Floor"),
        "footer_address_line2": settings.get("footer_address_line2", "Arlington, VA 22209 U.S.A."),
        "footer_phone": settings.get("footer_phone", "(703) 889-0017"),
        "trial_days": await get_trial_days(),
        # Founder profile (About page, homepage FounderCard, Person JSON-LD)
        "founder_name": settings.get("founder_name", ""),
        "founder_title": settings.get("founder_title", ""),
        "founder_bio": settings.get("founder_bio", ""),
        "founder_photo_url": f"{api_base}/api/public/founder-headshot" if headshot else "",
        "founder_photo_updated_at": (headshot or {}).get("updated_at", ""),
        "founder_linkedin_url": settings.get("founder_linkedin_url", ""),
        "show_live_stats": settings.get("show_live_stats", "auto"),
        # Public, non-sensitive feature flags (mirrors prior admin/platform behavior).
        "offline_mode": settings.get("offline_mode", "off"),
        "subscriptions_enabled": settings.get("subscriptions_enabled", True),
        "platform_free_mode": bool(settings.get("platform_free_mode", False)),
    }
