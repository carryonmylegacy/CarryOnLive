"""CarryOn™ — Integrations automation layer (founder-approved Jun 2026).

Three jobs, all feeding Admin → Platform → Integrations:

  1. ENV-AWARE TILES  — ENV_BINDINGS maps each tile to the backend env keys
     that power it. The tab auto-reports "key configured / missing" so the
     founder never manually confirms a credential exists again.
  2. LIVE VERIFY      — verify_all() pings each service's cheapest
     authenticated endpoint and stamps ok/fail + checked_at into
     db.integration_health. Run from the "Verify all" button and nightly
     via integration_verify_scheduler.
  3. DRIFT DETECTION  — detect_drift() flags credential-looking env vars
     that belong to no tile (how Sentry slipped through untracked) and
     tiles whose env keys have vanished.

No check ever costs money: paid-per-call APIs (Google Places) are left as
manual. Frontend-only keys (Firebase, Meta Pixel — they live in Vercel's
env, not the backend's) can't be checked from here and stay manual too.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

import httpx

from config import db, logger

# Tile id → backend env keys that power it. Empty list = tile is real but
# not env-keyed from the backend (checked another way, or manual).
ENV_BINDINGS: dict[str, list[str]] = {
    "mongodb": ["MONGO_URL", "DB_NAME"],
    "s3": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    "stripe": ["STRIPE_API_KEY"],
    "apple_iap": ["APPLE_SHARED_SECRET"],
    "xai": ["XAI_API_KEY"],
    "resend": ["RESEND_API_KEY", "SENDER_EMAIL"],
    "twilio": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
    "jwt": ["JWT_SECRET"],
    "vapid": ["VAPID_PRIVATE_KEY_PATH", "VAPID_PUBLIC_KEY_PATH", "VAPID_CLAIMS_EMAIL"],
    "sentry": ["SENTRY_DSN"],
}

# Env keys that look like credentials but are accounted for outside
# ENV_BINDINGS — never flag these as drift.
_DRIFT_IGNORE = {
    "ENCRYPTION_KEY",  # internal KDF master key (security scan tracks it)
    "STRIPE_WEBHOOK_SECRET",  # stripe tile covers the service
    "XAI_TEAM_ID",  # xai tile
    "S3_BUCKET_NAME",
    "S3_REGION",
    "E2E_SEED_PASSWORD",  # preview-only CI seed
    "DEMO_REVIEW_OTP",  # Apple review bypass
    "CAPGO_TOKEN",  # capgo tile (CLI-side token)
    "SENTRY_ENVIRONMENT",
}

_CRED_SUFFIXES = (
    "_API_KEY",
    "_SECRET",
    "_TOKEN",
    "_DSN",
    "_ACCOUNT_SID",
    "_ACCESS_KEY_ID",
    "_SECRET_ACCESS_KEY",
    "_SHARED_SECRET",
    "_PASSWORD",
)


def detect_drift() -> list[str]:
    """Credential env vars with no tile + tiles missing their env keys."""
    bound = {k for keys in ENV_BINDINGS.values() for k in keys} | _DRIFT_IGNORE
    drift = []
    for key in sorted(os.environ):
        if key in bound or not key.strip():
            continue
        if key.startswith(("KUBERNETES_", "REACT_APP_", "SUPERVISOR_", "HOSTNAME")):
            continue
        if key.endswith(_CRED_SUFFIXES) and os.environ.get(key):
            drift.append(
                f"Untracked credential in backend environment: {key} — no integration tile covers it. "
                f"Add a tile or remove the env var."
            )
    for tile_id, keys in ENV_BINDINGS.items():
        missing = [k for k in keys if not os.environ.get(k)]
        if missing and tile_id != "sentry":  # sentry is deliberately env-gated optional
            drift.append(f"Integration '{tile_id}' is missing env key(s): {', '.join(missing)}")
    return drift


# ── Live checks — cheapest authenticated call per service ────────────────


async def _check_mongodb():
    await db.command("ping")
    return True, "Mongo ping ok"


async def _check_xai():
    key = os.environ.get("XAI_API_KEY")
    if not key:
        return False, "XAI_API_KEY not set"
    async with httpx.AsyncClient(timeout=12) as c:
        r = await c.get("https://api.x.ai/v1/api-key", headers={"Authorization": f"Bearer {key}"})
    if r.status_code != 200:
        return False, f"HTTP {r.status_code} from xAI key endpoint"
    info = r.json()
    blocked = [f for f in ("team_blocked", "api_key_blocked", "api_key_disabled") if info.get(f)]
    return (not blocked), ("key active" if not blocked else f"blocked: {', '.join(blocked)}")


async def _check_stripe():
    key = os.environ.get("STRIPE_API_KEY")
    if not key:
        return False, "STRIPE_API_KEY not set"
    async with httpx.AsyncClient(timeout=12) as c:
        r = await c.get("https://api.stripe.com/v1/balance", headers={"Authorization": f"Bearer {key}"})
    return (r.status_code == 200), (
        "live key valid (balance readable)" if r.status_code == 200 else f"HTTP {r.status_code} from Stripe"
    )


async def _check_resend():
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        return False, "RESEND_API_KEY not set"
    # Sending-only keys 401 on GET endpoints, so probe with an EMPTY send:
    # 422 (missing `to`) proves auth passed without sending anything; 401 = bad key.
    async with httpx.AsyncClient(timeout=12) as c:
        r = await c.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={},
        )
    if r.status_code == 401:
        return False, "invalid API key (401)"
    return True, f"key valid (auth probe HTTP {r.status_code}, nothing sent)"


async def _check_twilio():
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        return False, "Twilio SID/token not set"
    async with httpx.AsyncClient(timeout=12) as c:
        r = await c.get(f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json", auth=(sid, token))
    return (r.status_code == 200), (
        "account reachable" if r.status_code == 200 else f"HTTP {r.status_code} from Twilio"
    )


async def _check_s3():
    if not os.environ.get("AWS_ACCESS_KEY_ID"):
        return False, "AWS keys not set"

    def _head():
        import boto3

        client = boto3.client(
            "s3",
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
            region_name=os.environ.get("S3_REGION", "us-east-2"),
        )
        client.head_bucket(Bucket=os.environ.get("S3_BUCKET_NAME", "carryon-vault"))

    await asyncio.to_thread(_head)
    return True, "bucket reachable"


async def _check_render():
    # This code IS the Render service — if we're executing, it's up.
    return True, "backend service responding (self-check)"


async def _check_vercel():
    url = os.environ.get("FRONTEND_URL")
    if not url:
        return False, "FRONTEND_URL not set"
    async with httpx.AsyncClient(timeout=12, follow_redirects=True) as c:
        r = await c.get(url)
    return (r.status_code < 500), f"frontend HTTP {r.status_code}"


async def _check_sentry():
    # DSN presence only — pinging the ingest endpoint would file a fake event.
    if os.environ.get("SENTRY_DSN"):
        return True, "DSN configured (presence check)"
    return False, "SENTRY_DSN not set — error monitoring inactive"


CHECKS = {
    "mongodb": _check_mongodb,
    "xai": _check_xai,
    "stripe": _check_stripe,
    "resend": _check_resend,
    "twilio": _check_twilio,
    "s3": _check_s3,
    "render": _check_render,
    "vercel": _check_vercel,
    "sentry": _check_sentry,
}


async def _run_one(tile_id: str) -> dict:
    try:
        ok, detail = await asyncio.wait_for(CHECKS[tile_id](), timeout=20)
    except Exception as e:  # noqa: BLE001
        ok, detail = False, f"{type(e).__name__}: {str(e)[:120]}"
    return {"integration_id": tile_id, "ok": ok, "detail": detail}


async def verify_all() -> list[dict]:
    """Run every live check concurrently and persist results."""
    results = await asyncio.gather(*(_run_one(t) for t in CHECKS))
    now = datetime.now(timezone.utc).isoformat()
    for r in results:
        r["checked_at"] = now
        await db.integration_health.update_one(
            {"integration_id": r["integration_id"]},
            {"$set": r},
            upsert=True,
        )
    ok_n = sum(1 for r in results if r["ok"])
    logger.info(f"Integration verify-all: {ok_n}/{len(results)} ok")
    return results


async def get_health_map() -> dict[str, dict]:
    out = {}
    async for doc in db.integration_health.find({}, {"_id": 0}):
        out[doc["integration_id"]] = doc
    return out
