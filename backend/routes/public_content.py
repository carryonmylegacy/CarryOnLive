"""CarryOn™ Backend — PUBLIC site content (no auth).

Lives in its own file with a standard `router` so it is (a) discoverable by the
route-policy scanner and (b) mounted at the API root WITHOUT the founder-scope
dependency that gates the admin platform routes. The logged-out marketing
homepage reads its YouTube video IDs + footer from here, so this MUST stay
unauthenticated — otherwise visitors get 401 and the page falls back to a stale
hardcoded default video.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from config import db
from guards import require_admin
from routes.admin.trial_policy import get_trial_days

router = APIRouter()

CSP_REPORT_MAX_BYTES = 16_384
CSP_REPORT_TTL_SECONDS = 30 * 24 * 3600


@router.post(
    "/public/csp-report", status_code=204
)  # pre-push-invariants: allow-public-mutation (browser CSP violation sink, no auth by spec)
async def receive_csp_report(request: Request):
    """Browsers POST here for the frontend's Content-Security-Policy-Report-Only header
    (report-uri). Stores a trimmed copy for 30 days so the founder can see what an
    enforced CSP would block before it is switched on. Never errors toward the browser."""
    body = await request.body()
    if not body or len(body) > CSP_REPORT_MAX_BYTES:
        return Response(status_code=204)
    import json
    from datetime import datetime, timezone

    try:
        payload = json.loads(body)
    except ValueError:
        return Response(status_code=204)
    # Legacy report-uri wraps in {"csp-report": {...}}; the Reporting API sends a list of {"body": {...}}.
    reports = payload if isinstance(payload, list) else [payload]
    docs = []
    for r in reports[:10]:
        inner = (
            r.get("csp-report")
            if isinstance(r, dict) and "csp-report" in r
            else (r.get("body") if isinstance(r, dict) else None) or r
        )
        if not isinstance(inner, dict):
            continue
        docs.append(
            {
                "created_at": datetime.now(timezone.utc),
                "document_uri": str(inner.get("document-uri") or inner.get("documentURL") or "")[:300],
                "directive": str(
                    inner.get("effective-directive")
                    or inner.get("effectiveDirective")
                    or inner.get("violated-directive")
                    or ""
                )[:80],
                "blocked_uri": str(inner.get("blocked-uri") or inner.get("blockedURL") or "")[:300],
                "source_file": str(inner.get("source-file") or inner.get("sourceFile") or "")[:300],
                "line": inner.get("line-number") or inner.get("lineNumber"),
                "ua": (request.headers.get("user-agent") or "")[:200],
            }
        )
    if docs:
        await db.csp_reports.create_index("created_at", expireAfterSeconds=CSP_REPORT_TTL_SECONDS)
        await db.csp_reports.insert_many(docs)
    return Response(status_code=204)


@router.get("/admin/csp-reports")
async def list_csp_reports(current_user: dict = Depends(require_admin)):
    """Founder Portal → Compliance → SOC2 Readiness: what the report-only CSP would have blocked, grouped."""
    pipeline = [
        {
            "$group": {
                "_id": {"directive": "$directive", "blocked_uri": "$blocked_uri"},
                "count": {"$sum": 1},
                "last_seen": {"$max": "$created_at"},
                "sample_page": {"$last": "$document_uri"},
            }
        },
        {"$sort": {"count": -1}},
        {"$limit": 100},
    ]
    rows = await db.csp_reports.aggregate(pipeline).to_list(100)
    total = await db.csp_reports.count_documents({})
    return {
        "total": total,
        "groups": [
            {
                "directive": r["_id"]["directive"],
                "blocked_uri": r["_id"]["blocked_uri"],
                "count": r["count"],
                "last_seen": r["last_seen"].isoformat() if r.get("last_seen") else None,
                "sample_page": r.get("sample_page", ""),
            }
            for r in rows
        ],
    }


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
            # Embedded by <img> on carryon.us while the API lives on another host —
            # the middleware default (same-origin) would make browsers drop the image.
            "Cross-Origin-Resource-Policy": "cross-origin",
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
        # Third-party reviews (homepage trust block + onboarding review ask); empty until the founder sets it
        "trustpilot_url": settings.get("trustpilot_url", ""),
        # Founder story (/founder-about): False = request-access gate, True = open to everyone
        "founder_story_public": bool(settings.get("founder_story_public", False)),
        "show_live_stats": settings.get("show_live_stats", "auto"),
        # Public, non-sensitive feature flags (mirrors prior admin/platform behavior).
        "offline_mode": settings.get("offline_mode", "off"),
        "subscriptions_enabled": settings.get("subscriptions_enabled", True),
        "platform_free_mode": bool(settings.get("platform_free_mode", False)),
    }
