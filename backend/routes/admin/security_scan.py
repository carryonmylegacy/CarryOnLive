"""CarryOn™ Backend — Admin: Security Scan (SOC 2 Audit Evidence)"""

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from config import (
    ENCRYPTION_KEY,
    JWT_SECRET,
    RESEND_API_KEY,
    VAPID_PRIVATE_KEY_INLINE,
    db,
)
from guards import require_admin

router = APIRouter()


@router.get("/admin/security-scan")
async def run_security_scan(current_user: dict = Depends(require_admin)):
    """Run automated security scan and return compliance report.
    Admin-only. Produces evidence for SOC 2 audits and App Store review."""
    now = datetime.now(timezone.utc).isoformat()
    checks = []
    passed = 0
    failed = 0
    warnings = 0

    def add_check(category, name, status, detail="", check_type="config"):
        nonlocal passed, failed, warnings
        if status == "PASS":
            passed += 1
        elif status == "FAIL":
            failed += 1
        else:
            warnings += 1
        checks.append(
            {
                "category": category,
                "check": name,
                "status": status,
                "detail": detail,
                # "live"   → measured against runtime state / live provider call
                # "config" → asserted from the codebase architecture (not probed)
                # "manual" → requires human evidence (collected out of band)
                "type": check_type,
            }
        )

    # --- 1. Authentication Controls ---
    platform_settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    otp_enabled = not (platform_settings or {}).get("otp_disabled", False)
    add_check(
        "Authentication",
        "OTP Two-Factor Authentication",
        "PASS" if otp_enabled else "WARN",
        "OTP is enabled for all logins" if otp_enabled else "OTP is currently DISABLED platform-wide",
        check_type="live",
    )

    add_check(
        "Authentication",
        "JWT Secret Configured",
        "PASS" if JWT_SECRET and len(JWT_SECRET) >= 32 else "FAIL",
        f"JWT secret is set ({len(JWT_SECRET)} chars)" if JWT_SECRET else "JWT_SECRET is missing",
        check_type="live",
    )

    add_check(
        "Authentication",
        "Token Blacklisting Active",
        "PASS",
        "Token blacklist collection with TTL index (auto-expire after token lifetime)",
    )

    # Session enforcement
    add_check(
        "Authentication",
        "Single-Session Enforcement",
        "PASS",
        "Non-admin users are limited to one active session at a time",
    )

    # Account lockout — values mirror routes/auth/login.py (25 failures within a
    # rolling 5-minute window → 5-minute lock). Asserted from code, not probed.
    add_check(
        "Authentication",
        "Account Lockout Policy",
        "PASS",
        "Accounts locked after 25 failed attempts within a rolling 5-minute window (5-minute lock)",
    )

    # --- 2. Encryption ---
    add_check(
        "Encryption",
        "Encryption Key Configured",
        "PASS" if ENCRYPTION_KEY and len(ENCRYPTION_KEY) >= 16 else "FAIL",
        "AES-256 encryption key is set (no fallback — server fails fast if missing)"
        if ENCRYPTION_KEY
        else "ENCRYPTION_KEY is missing",
        check_type="live",
    )

    add_check(
        "Encryption",
        "Per-Estate Encryption Salt",
        "PASS",
        "Each estate uses a unique cryptographic salt for encryption isolation",
    )

    add_check(
        "Encryption",
        "Password Hashing",
        "PASS",
        "bcrypt with auto-generated salt (adaptive cost factor)",
    )

    # --- 3. Rate Limiting ---
    add_check(
        "Rate Limiting",
        "Auth Endpoint Protection",
        "PASS",
        "Login/OTP/Password endpoints: 10 requests/minute (strict tier)",
    )

    add_check(
        "Rate Limiting",
        "Registration & Email Check Protection",
        "PASS",
        "Registration and email-check endpoints: 20 requests/minute (moderate tier)",
    )

    add_check(
        "Rate Limiting",
        "General API Protection",
        "PASS",
        "All other API endpoints: 120 requests/minute",
    )

    add_check(
        "Rate Limiting",
        "Request Body Size Limit",
        "PASS",
        "50MB max request body enforced at middleware level",
    )

    # --- 4. Security Headers ---
    add_check(
        "Security Headers",
        "Content-Security-Policy",
        "PASS",
        "CSP configured: default-src 'self', strict script/connect/frame sources",
    )

    add_check(
        "Security Headers",
        "Strict-Transport-Security (HSTS)",
        "PASS",
        "HSTS enabled: max-age=31536000; includeSubDomains; preload",
    )

    add_check(
        "Security Headers",
        "X-Frame-Options",
        "PASS",
        "Set to DENY — prevents clickjacking",
    )

    add_check(
        "Security Headers",
        "X-Content-Type-Options",
        "PASS",
        "Set to nosniff — prevents MIME type sniffing",
    )

    add_check(
        "Security Headers",
        "Referrer-Policy",
        "PASS",
        "strict-origin-when-cross-origin",
    )

    add_check(
        "Security Headers",
        "Cache-Control on API Responses",
        "PASS",
        "no-store, no-cache, must-revalidate, private on all /api/ endpoints",
    )

    # --- 5. CORS ---
    cors_origins = os.environ.get("CORS_ORIGINS", "")
    add_check(
        "CORS",
        "Allowed Origins Configured",
        "PASS" if cors_origins else "WARN",
        f"CORS origins: {cors_origins}" if cors_origins else "Using default origins",
        check_type="live",
    )

    # --- 6. File Upload Security ---
    add_check(
        "File Upload",
        "Blocked Extensions",
        "PASS",
        "Executable files blocked: .exe, .bat, .cmd, .sh, .ps1, .js, .vbs, .msi, .dll, .svg, etc.",
    )

    add_check(
        "File Upload",
        "Content-Type Allowlist",
        "PASS",
        "Only PDF, images (JPEG/PNG/WebP/HEIC), and Office documents allowed",
    )

    add_check(
        "File Upload",
        "File Size Limit",
        "PASS",
        "25MB per file upload",
    )

    # --- 7. Data Protection ---
    add_check(
        "Data Protection",
        "Password Not in API Responses",
        "PASS",
        "User queries exclude password_hash and OTP secret fields from API responses and GDPR exports",
    )

    add_check(
        "Data Protection",
        "MongoDB _id Exclusion",
        "PASS",
        "All user-facing queries exclude MongoDB internal _id field",
    )

    add_check(
        "Data Protection",
        "Sensitive Field Encryption",
        "PASS",
        "Document contents, wallet credentials, and message bodies encrypted at rest",
    )

    # --- 8. Database Indexes ---
    index_checks = [
        ("users", "email"),
        ("users", "id"),
        ("estates", "owner_id"),
        ("token_blacklist", "expires_at"),
        ("token_blacklist", "jti"),
        ("security_audit_log", "user_id"),
    ]
    for coll, field in index_checks:
        try:
            indexes = await db[coll].index_information()
            has_index = any(field in str(idx.get("key", "")) for idx in indexes.values())
            add_check(
                "Database",
                f"Index: {coll}.{field}",
                "PASS" if has_index else "WARN",
                f"Index exists on {coll}.{field}" if has_index else f"Missing index on {coll}.{field}",
                check_type="live",
            )
        except Exception:
            add_check(
                "Database",
                f"Index: {coll}.{field}",
                "WARN",
                f"Could not verify index on {coll}.{field}",
                check_type="live",
            )

    # --- 9. External Services ---
    add_check(
        "External Services",
        "Email Service (Resend)",
        "PASS" if RESEND_API_KEY else "WARN",
        "Resend API key configured for OTP delivery"
        if RESEND_API_KEY
        else "Resend API key missing — OTP emails will not send",
        check_type="live",
    )

    add_check(
        "External Services",
        "Push Notifications (VAPID)",
        "PASS" if VAPID_PRIVATE_KEY_INLINE else "WARN",
        "VAPID keys configured for web push"
        if VAPID_PRIVATE_KEY_INLINE
        else "VAPID private key not found — push notifications disabled",
        check_type="live",
    )

    stripe_key = os.environ.get("STRIPE_API_KEY", "")
    add_check(
        "External Services",
        "Payment Processing (Stripe)",
        "PASS" if stripe_key else "WARN",
        "Stripe API key configured" if stripe_key else "Stripe API key missing — payment processing unavailable",
        check_type="live",
    )

    # --- 10. Compliance ---
    add_check(
        "Compliance",
        "GDPR Data Export Endpoint",
        "PASS",
        "GET /api/compliance/data-export available and excludes encrypted credential secrets",
    )

    add_check(
        "Compliance",
        "GDPR Account Deletion Endpoint",
        "PASS",
        "POST /api/compliance/deletion-request available for right-to-erasure requests",
    )

    add_check(
        "Compliance",
        "Consent Management",
        "PASS",
        "User consent tracked with audit trail in consent_audit_log collection",
    )

    add_check(
        "Compliance",
        "Security Audit Logging",
        "PASS",
        "All sensitive actions logged to security_audit_log with timestamps",
    )

    # Data retention — verify the audit_trail TTL index actually matches the
    # advertised 7-year window (measured, not asserted).
    audit_ttl_ok = False
    audit_ttl_detail = "audit_trail TTL index not found"
    try:
        ainfo = await db.audit_trail.index_information()
        for _name, _meta in ainfo.items():
            if _meta.get("expireAfterSeconds") and "stored_at" in str(_meta.get("key", "")):
                yrs = round(_meta["expireAfterSeconds"] / (365 * 24 * 3600), 1)
                audit_ttl_ok = _meta["expireAfterSeconds"] >= 7 * 365 * 24 * 3600
                audit_ttl_detail = f"audit_trail.stored_at TTL = {yrs}yr"
                break
    except Exception as e:
        audit_ttl_detail = f"could not verify audit TTL: {str(e)[:80]}"
    add_check(
        "Compliance",
        "Data Retention Policy",
        "PASS" if audit_ttl_ok else "WARN",
        f"OTPs (15min), failed logins (1hr), download tokens (5min), audit logs 7yr. Measured: {audit_ttl_detail}",
        check_type="live",
    )

    # --- 11. Production Readiness ---
    add_check(
        "Production",
        "Dev-Switcher Access Control",
        "PASS",
        "Dev-switcher controls require an admin auth token and are isolated to founder/operator testing flows",
    )

    add_check(
        "Production",
        "OTP Timing-Safe Comparison",
        "PASS",
        "OTP verification uses hmac.compare_digest() to prevent timing attacks",
    )

    # --- Summary ---
    total = passed + failed + warnings
    grade = "A" if failed == 0 and warnings <= 2 else "B" if failed == 0 else "C" if failed <= 2 else "F"
    live_count = sum(1 for c in checks if c.get("type") == "live")
    config_count = sum(1 for c in checks if c.get("type") == "config")

    return {
        "scan_timestamp": now,
        "grade": grade,
        "summary": {
            "total_checks": total,
            "passed": passed,
            "failed": failed,
            "warnings": warnings,
            "live_measured": live_count,
            "config_asserted": config_count,
        },
        "evidence_note": (
            "Checks of type 'live' are measured against runtime state or a live "
            "provider call. Checks of type 'config' are asserted from the codebase "
            "architecture and are NOT probed at scan time — treat them as design "
            "evidence, not a runtime guarantee."
        ),
        "checks": checks,
        "report_version": "1.1.0",
        "platform": "CarryOn Estate Planning",
    }


# ============================================================================
# Secrets Inventory — name + presence + length only (never the value)
# ============================================================================
#
# Surfaces a redacted list of every secret env var the backend cares about so
# the founder can confirm at a glance which credentials are loaded after a
# Render deploy or a rotation. Useful next time we have to chase a "did the
# new password actually land?" moment without grepping logs.
#
# Hard rule: NEVER return the value. Return only:
#   - name (the env var key)
#   - present (bool)
#   - length (int — char count of the loaded value, or 0)
#   - tier ("critical" | "high" | "low") for ordering in the UI
#   - notes (one-liner human description)
#
# Add new secrets here as they're introduced. Order doesn't matter — the UI
# sorts by tier then name.

_TRACKED_SECRETS = [
    # --- critical: rotating these has the biggest blast radius ---
    ("MONGO_URL", "critical", "Atlas connection string (rotate password if leaked)"),
    ("ENCRYPTION_KEY", "critical", "KDF master key — DO NOT rotate without re-encryption migration"),
    ("JWT_SECRET", "critical", "Session signing secret (rotation invalidates all sessions)"),
    # --- high: 3rd-party service credentials ---
    ("EMERGENT_LLM_KEY", "high", "Universal LLM key (rotate via Emergent profile)"),
    ("XAI_API_KEY", "high", "xAI/Grok direct API key"),
    ("RESEND_API_KEY", "high", "Resend transactional email"),
    ("STRIPE_API_KEY", "high", "Stripe live secret key (sk_live_...)"),
    ("STRIPE_WEBHOOK_SECRET", "high", "Stripe webhook signing secret — without it, ALL webhooks are rejected"),
    ("AWS_ACCESS_KEY_ID", "high", "S3 / object storage access key"),
    ("AWS_SECRET_ACCESS_KEY", "high", "S3 / object storage secret"),
    ("TWILIO_AUTH_TOKEN", "high", "Twilio account auth token"),
    ("APPLE_SHARED_SECRET", "high", "App Store IAP receipt validation"),
    ("SENTRY_DSN", "high", "Sentry error monitoring — without it, prod errors are silent"),
    # --- low: rotation rarely needed, included for completeness ---
    ("VAPID_PRIVATE_KEY_INLINE", "low", "Web push signing key"),
    ("TWILIO_ACCOUNT_SID", "low", "Twilio account SID (not strictly secret)"),
    ("TWILIO_PHONE_NUMBER", "low", "Twilio sender number (not secret)"),
    ("SENDER_EMAIL", "low", "From address for outbound mail"),
    ("XAI_TEAM_ID", "low", "xAI team identifier (not secret)"),
    ("DEMO_REVIEW_EMAIL", "low", "App Store reviewer demo account"),
    ("DEMO_REVIEW_OTP", "low", "App Store reviewer demo OTP"),
]


@router.get("/admin/secrets-inventory")
async def get_secrets_inventory(current_user: dict = Depends(require_admin)):
    """Redacted inventory of every backend secret the app expects.

    Returns names + presence + length ONLY. Never returns the value.
    Useful for confirming a Render env update landed correctly after a
    credential rotation.
    """
    items = []
    for name, tier, notes in _TRACKED_SECRETS:
        # Read from os.environ directly so we capture the live process env
        # (config.py only re-exports a subset at import time).
        val = os.environ.get(name, "")
        items.append(
            {
                "name": name,
                "present": bool(val),
                "length": len(val),
                "tier": tier,
                "notes": notes,
            }
        )

    counts = {
        "total": len(items),
        "present": sum(1 for i in items if i["present"]),
        "missing": sum(1 for i in items if not i["present"]),
        "critical_missing": sum(1 for i in items if not i["present"] and i["tier"] == "critical"),
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": counts,
        "items": items,
    }


# ============================================================================
# Live self-test for each external service — closes the loop from
# "the key is loaded" to "the key actually works against the provider".
# ============================================================================
#
# Each test is read-only (no writes, no charges, no email sends) and runs
# under a strict 6-second timeout so a hung provider can't block the
# founder portal. Errors are caught and returned as `ok=False` + a
# truncated `error` string — never raised — so one broken service doesn't
# poison the UX for the others.
#
# Hard rule: NEVER include the secret value in the response. Only the
# provider's own response excerpt (already public per the provider's API
# contract) and a short error string if the call failed.

import asyncio  # noqa: E402  (kept beside the rest of the imports inside the same module)
import time  # noqa: E402

_SELF_TEST_TIMEOUT_S = 6.0


async def _test_mongo() -> dict:
    """Verifies the live MongoDB connection by issuing a `ping`."""
    start = time.monotonic()
    try:
        res = await asyncio.wait_for(db.command("ping"), timeout=_SELF_TEST_TIMEOUT_S)
        ok = bool(res and res.get("ok") == 1.0)
        return {
            "ok": ok,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "detail": "ping ok" if ok else "ping returned non-ok",
        }
    except Exception as e:
        return {
            "ok": False,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "error": str(e)[:300],
        }


async def _test_resend() -> dict:
    """Reads the list of verified domains via Resend's `/domains` endpoint.

    No email is sent. A 200 with a non-empty domains list proves the key
    works and the account has at least one verified sender domain.
    """
    import httpx

    start = time.monotonic()
    key = os.environ.get("RESEND_API_KEY", "")
    if not key:
        return {"ok": False, "error": "RESEND_API_KEY not set", "latency_ms": 0}
    try:
        async with httpx.AsyncClient(timeout=_SELF_TEST_TIMEOUT_S) as client:
            r = await client.get(
                "https://api.resend.com/domains",
                headers={"Authorization": f"Bearer {key}"},
            )
        latency_ms = int((time.monotonic() - start) * 1000)
        if r.status_code == 200:
            data = r.json() or {}
            domains = data.get("data", []) if isinstance(data, dict) else []
            return {
                "ok": True,
                "latency_ms": latency_ms,
                "detail": f"{len(domains)} verified domain(s)",
            }
        # Send-only Resend keys can't list /domains and return a 401 with
        # `restricted_api_key`. That response itself PROVES the key is
        # valid (only an authenticated request gets back the "you don't
        # have permission for THIS endpoint" message), so treat it as a
        # pass with a clear note.
        if r.status_code == 401 and "restricted_api_key" in (r.text or ""):
            return {
                "ok": True,
                "latency_ms": latency_ms,
                "detail": "key valid (send-only scope — domain listing restricted)",
            }
        return {
            "ok": False,
            "latency_ms": latency_ms,
            "error": f"HTTP {r.status_code}: {r.text[:200]}",
        }
    except Exception as e:
        return {
            "ok": False,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "error": str(e)[:300],
        }


async def _test_stripe() -> dict:
    """Reads the Stripe account balance — confirms the secret key and the
    account is in good standing. No charges, no writes."""
    import stripe

    start = time.monotonic()
    key = os.environ.get("STRIPE_API_KEY", "")
    if not key:
        return {"ok": False, "error": "STRIPE_API_KEY not set", "latency_ms": 0}
    try:
        # Stripe SDK is sync — run in a thread so it respects the timeout.
        def _call():
            stripe.api_key = key
            return stripe.Balance.retrieve()

        bal = await asyncio.wait_for(asyncio.to_thread(_call), timeout=_SELF_TEST_TIMEOUT_S)
        latency_ms = int((time.monotonic() - start) * 1000)
        currencies = [b.get("currency") for b in (bal.get("available") or [])]
        return {
            "ok": True,
            "latency_ms": latency_ms,
            "detail": f"livemode={bal.get('livemode')}, currencies={currencies}",
        }
    except Exception as e:
        return {
            "ok": False,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "error": str(e)[:300],
        }


async def _test_aws_s3() -> dict:
    """Issues a `head_bucket` against the configured S3 bucket. Validates
    the access key + secret + bucket existence + read permission."""
    import boto3
    from botocore.exceptions import ClientError

    start = time.monotonic()
    access = os.environ.get("AWS_ACCESS_KEY_ID", "")
    secret = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
    bucket = os.environ.get("S3_BUCKET_NAME") or "carryon-vault"
    region = os.environ.get("AWS_REGION") or "us-east-2"
    if not access or not secret:
        return {"ok": False, "error": "AWS keys not set", "latency_ms": 0}
    try:

        def _call():
            client = boto3.client(
                "s3",
                aws_access_key_id=access,
                aws_secret_access_key=secret,
                region_name=region,
            )
            client.head_bucket(Bucket=bucket)
            return True

        await asyncio.wait_for(asyncio.to_thread(_call), timeout=_SELF_TEST_TIMEOUT_S)
        return {
            "ok": True,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "detail": f"bucket={bucket} region={region} reachable",
        }
    except ClientError as e:
        return {
            "ok": False,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "error": f"{e.response.get('Error', {}).get('Code', 'ClientError')}: {str(e)[:200]}",
        }
    except Exception as e:
        return {
            "ok": False,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "error": str(e)[:300],
        }


async def _test_twilio() -> dict:
    """Fetches the Twilio account record — proves the SID + auth token are
    a valid pair. No SMS sent."""
    import httpx

    start = time.monotonic()
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
    token = os.environ.get("TWILIO_AUTH_TOKEN", "")
    if not sid or not token:
        return {"ok": False, "error": "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set", "latency_ms": 0}
    try:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json"
        async with httpx.AsyncClient(timeout=_SELF_TEST_TIMEOUT_S) as client:
            r = await client.get(url, auth=(sid, token))
        latency_ms = int((time.monotonic() - start) * 1000)
        if r.status_code == 200:
            data = r.json() or {}
            return {
                "ok": True,
                "latency_ms": latency_ms,
                "detail": f"status={data.get('status', 'unknown')}",
            }
        return {
            "ok": False,
            "latency_ms": latency_ms,
            "error": f"HTTP {r.status_code}: {r.text[:200]}",
        }
    except Exception as e:
        return {
            "ok": False,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "error": str(e)[:300],
        }


async def _test_xai() -> dict:
    """Lists xAI models — the cheapest authenticated read on the xAI API.
    No completion run, no token billed."""
    import httpx

    start = time.monotonic()
    key = os.environ.get("XAI_API_KEY", "")
    if not key:
        return {"ok": False, "error": "XAI_API_KEY not set", "latency_ms": 0}
    try:
        async with httpx.AsyncClient(timeout=_SELF_TEST_TIMEOUT_S) as client:
            r = await client.get(
                "https://api.x.ai/v1/models",
                headers={"Authorization": f"Bearer {key}"},
            )
        latency_ms = int((time.monotonic() - start) * 1000)
        if r.status_code == 200:
            data = r.json() or {}
            models = data.get("data", []) if isinstance(data, dict) else []
            return {
                "ok": True,
                "latency_ms": latency_ms,
                "detail": f"{len(models)} model(s) available",
            }
        return {
            "ok": False,
            "latency_ms": latency_ms,
            "error": f"HTTP {r.status_code}: {r.text[:200]}",
        }
    except Exception as e:
        return {
            "ok": False,
            "latency_ms": int((time.monotonic() - start) * 1000),
            "error": str(e)[:300],
        }


# Registry — keep in sync with the frontend `TESTABLE_SERVICES` list.
_SELF_TESTS = {
    "mongo": ("MONGO_URL", _test_mongo),
    "resend": ("RESEND_API_KEY", _test_resend),
    "stripe": ("STRIPE_API_KEY", _test_stripe),
    "aws_s3": ("AWS_ACCESS_KEY_ID", _test_aws_s3),
    "twilio": ("TWILIO_AUTH_TOKEN", _test_twilio),
    "xai": ("XAI_API_KEY", _test_xai),
}


@router.post("/admin/secrets-self-test/{service_id}")
async def run_secret_self_test(service_id: str, current_user: dict = Depends(require_admin)):
    """Runs a live, read-only self-test against the provider for the given
    service. Admin-only. Strict 6-second timeout. Read-only — no charges,
    no email sends, no SMS, no writes.
    """
    entry = _SELF_TESTS.get(service_id)
    if entry is None:
        return {
            "service": service_id,
            "ok": False,
            "error": f"unknown service '{service_id}'",
            "tested_at": datetime.now(timezone.utc).isoformat(),
        }
    secret_name, runner = entry
    result = await runner()
    return {
        "service": service_id,
        "secret_name": secret_name,
        "tested_at": datetime.now(timezone.utc).isoformat(),
        **result,
    }
