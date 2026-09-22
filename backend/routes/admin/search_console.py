"""Google Search Console — which public pages Google has indexed (Founder Portal → Marketing → Search Console).

Read-only. Auth is a Google Cloud service account added to the Search Console property as a
Restricted user. Key arrives via env (GSC_SERVICE_ACCOUNT_JSON_B64 or GSC_SERVICE_ACCOUNT_JSON);
GSC_SITE_URL is the property exactly as Search Console spells it (sc-domain:carryon.us or
https://www.carryon.us/). Nothing here is reachable without those two variables — the endpoints
answer {configured: false} with the setup steps instead.

Quota (Google): URL Inspection 2,000 calls/property/day — a full refresh uses ~22.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from config import db
from guards import require_admin

router = APIRouter()

SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
STALE_AFTER = timedelta(hours=24)
DOC_ID = "search_console"

# Canonical public pages — mirrors frontend/public/sitemap.xml (+ the founder story, which joins the
# sitemap only when public). Keep in step with the sitemap when a public page is added.
PUBLIC_PATHS = [
    "/",
    "/start",
    "/pricing",
    "/get-started",
    "/vs",
    "/vs/trustworthy",
    "/vs/everplans",
    "/vs/resolve-legacy",
    "/about",
    "/customers",
    "/changelog",
    "/readiness-score",
    "/sources",
    "/security",
    "/wind-down-promise",
    "/our-promise",
    "/voices",
    "/speak-with-us",
    "/partner-brief",
    "/accessibility",
    "/privacy",
    "/terms",
    "/ready",
    "/moments",
    "/founder-about",
]
CANONICAL_ORIGIN = "https://www.carryon.us"

SETUP_STEPS = [
    "Google Cloud Console → select or create a project → APIs & Services → Library → search “Google Search Console API” → Enable.",
    "IAM & Admin → Service Accounts → Create service account → name “carryon-search-console” → Done. Open it → Keys → Add key → Create new key → JSON → the file downloads.",
    "Search Console (search.google.com/search-console) → property carryon.us → Settings → Users and permissions → Add user → paste the service account e-mail from the JSON (…@…iam.gserviceaccount.com) → Permission: Restricted → Add.",
    "Render → carryon-api → Environment → Add: GSC_SITE_URL = sc-domain:carryon.us (or https://www.carryon.us/ if your property is URL-prefix) and GSC_SERVICE_ACCOUNT_JSON_B64 = the JSON file base64-encoded (Mac: `base64 -i key.json | pbcopy`) → Save → the service redeploys.",
    "Back here → Refresh now.",
]


def _credentials_info() -> dict | None:
    raw = os.environ.get("GSC_SERVICE_ACCOUNT_JSON")
    if not raw:
        encoded = os.environ.get("GSC_SERVICE_ACCOUNT_JSON_B64")
        if not encoded:
            return None
        raw = base64.b64decode(encoded).decode("utf-8")
    return json.loads(raw)


def _configured() -> bool:
    return bool(os.environ.get("GSC_SITE_URL")) and _credentials_info() is not None


def _service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds = service_account.Credentials.from_service_account_info(_credentials_info(), scopes=[SCOPE])
    return build("searchconsole", "v1", credentials=creds, cache_discovery=False)


def _refresh_sync() -> dict[str, Any]:
    """Runs in a worker thread: one URL Inspection per public page + one 28-day analytics query."""
    from googleapiclient.errors import HttpError

    site = os.environ["GSC_SITE_URL"]
    svc = _service()
    try:
        end = date.today() - timedelta(days=1)
        start = end - timedelta(days=27)
        rows = (
            svc.searchanalytics()
            .query(
                siteUrl=site,
                body={
                    "startDate": start.isoformat(),
                    "endDate": end.isoformat(),
                    "dimensions": ["page"],
                    "type": "web",
                    "rowLimit": 500,
                    "dataState": "final",
                },
            )
            .execute()
            .get("rows", [])
        )
    except HttpError as e:
        raise _friendly(e) from e
    perf = {r["keys"][0].rstrip("/") or CANONICAL_ORIGIN: r for r in rows}

    pages = []
    for path in PUBLIC_PATHS:
        url = f"{CANONICAL_ORIGIN}{path}"
        try:
            res = (
                svc.urlInspection()
                .index()
                .inspect(
                    body={
                        "inspectionUrl": url,
                        "siteUrl": site,
                        "languageCode": "en-US",
                    }
                )
                .execute()
                .get("inspectionResult", {})
            )
            idx = res.get("indexStatusResult", {})
            item = {
                "path": path,
                "url": url,
                "verdict": idx.get("verdict"),  # PASS | NEUTRAL | FAIL | VERDICT_UNSPECIFIED
                "coverage_state": idx.get("coverageState"),  # Google's own sentence, e.g. "Submitted and indexed"
                "indexing_state": idx.get("indexingState"),
                "last_crawl": idx.get("lastCrawlTime"),
                "robots": idx.get("robotsTxtState"),
                "google_canonical": idx.get("googleCanonical"),
                "inspection_link": res.get("inspectionResultLink"),
                "error": None,
            }
        except HttpError as e:
            if getattr(e.resp, "status", 0) in (401, 403):
                raise _friendly(e) from e
            item = {
                "path": path,
                "url": url,
                "verdict": None,
                "coverage_state": None,
                "indexing_state": None,
                "last_crawl": None,
                "robots": None,
                "google_canonical": None,
                "inspection_link": None,
                "error": f"HTTP {getattr(e.resp, 'status', '?')}",
            }
        p = perf.get(url.rstrip("/")) or perf.get(url) or {}
        item.update(
            {
                "clicks": int(p.get("clicks", 0) or 0),
                "impressions": int(p.get("impressions", 0) or 0),
                "ctr": round(float(p.get("ctr", 0) or 0) * 100, 1),
                "position": round(float(p["position"]), 1) if p.get("position") else None,
            }
        )
        pages.append(item)

    return {
        "_id": DOC_ID,
        "site_url": site,
        "refreshed_at": datetime.now(timezone.utc),
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "pages": pages,
        "error": None,
    }


def _friendly(e) -> HTTPException:
    status = getattr(e.resp, "status", 502)
    if status in (401, 403):
        return HTTPException(
            403,
            "Google refused the request. Check that the service account e-mail was added to the Search Console property (Settings → Users and permissions) and that GSC_SITE_URL matches the property exactly.",
        )
    if status == 429:
        return HTTPException(429, "Search Console daily quota reached — try again tomorrow.")
    return HTTPException(502, f"Search Console request failed (HTTP {status}).")


def _serialize(doc: dict | None) -> dict:
    if not doc:
        return {"refreshed_at": None, "pages": [], "window": None, "site_url": os.environ.get("GSC_SITE_URL")}
    refreshed = doc.get("refreshed_at")
    return {
        "site_url": doc.get("site_url"),
        "refreshed_at": refreshed.isoformat() if isinstance(refreshed, datetime) else refreshed,
        "stale": bool(refreshed and datetime.now(timezone.utc) - refreshed.replace(tzinfo=timezone.utc) > STALE_AFTER),
        "window": doc.get("window"),
        "pages": doc.get("pages", []),
    }


@router.get("/admin/seo/index-status")
async def get_index_status(current_user: dict = Depends(require_admin)):
    """Last snapshot (the card auto-refreshes when `stale`). {configured:false} + steps until env is set."""
    if not _configured():
        return {"configured": False, "steps": SETUP_STEPS, "pages": [], "refreshed_at": None}
    doc = await db.seo_index_status.find_one({"_id": DOC_ID})
    return {"configured": True, "steps": [], **_serialize(doc)}


@router.post("/admin/seo/index-status/refresh")
async def refresh_index_status(current_user: dict = Depends(require_admin)):
    """Pull fresh verdicts from Google (≈25 inspections + 1 analytics query; ~20 s)."""
    if not _configured():
        raise HTTPException(
            409,
            "Search Console is not configured — add GSC_SITE_URL and GSC_SERVICE_ACCOUNT_JSON_B64 on the API service.",
        )
    doc = await asyncio.to_thread(_refresh_sync)
    await db.seo_index_status.replace_one({"_id": DOC_ID}, doc, upsert=True)
    return {"configured": True, "steps": [], **_serialize(doc)}
