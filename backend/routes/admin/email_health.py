"""CarryOn™ — Email Domain Health Check (DKIM / DMARC / SPF)

Lightweight admin endpoint that DNS-resolves the SPF, DKIM (Resend's
default selector), and DMARC records for the configured sender domain
and reports a simple PASS / WARN / FAIL summary.

Why this exists
---------------
Onboarding drip emails (and every other transactional email we send via
Resend) only land in the inbox if our sender domain has correct DNS
records. If those records get deleted or misconfigured (a registrar
migration, an accidental edit), our deliverability silently collapses
and we won't know until users start telling us their welcome email never
showed up. This admin check surfaces that risk on demand.

Cached for 1 hour so accidental UI hammering doesn't melt anyone's
recursive resolver.
"""

import asyncio
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends

from config import db, logger
from guards import require_admin

router = APIRouter()

CACHE_TTL_SECONDS = 3600  # 1 hour

# Resend's default DKIM selector is `resend`. If you switch to a custom
# domain DKIM via Resend, the selector becomes `resend-<id>` — update
# here when that happens.
DKIM_SELECTOR = "resend"


async def _resolve_txt(name: str) -> list[str]:
    """Resolve a TXT record via the system resolver. Returns a list of
    rdata strings or an empty list on failure."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "dig",
            "+short",
            "TXT",
            name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=5.0)
        out = stdout.decode("utf-8", "replace").strip()
        if not out:
            return []
        # `dig +short` puts each TXT record on its own line, with the
        # rdata wrapped in double quotes and possibly split across multiple
        # quoted strings. Collapse those.
        records = []
        for line in out.splitlines():
            joined = "".join(re.findall(r'"([^"]*)"', line))
            if joined:
                records.append(joined)
        return records
    except (asyncio.TimeoutError, FileNotFoundError, Exception):
        return []


def _classify_spf(records: list[str]) -> dict[str, Any]:
    spf = next((r for r in records if r.lower().startswith("v=spf1")), None)
    if not spf:
        return {"status": "FAIL", "detail": "No v=spf1 TXT record at apex.", "raw": None}
    has_resend = "resend" in spf.lower() or "amazonses" in spf.lower()
    has_terminator = "-all" in spf or "~all" in spf
    if not has_resend:
        return {
            "status": "WARN",
            "detail": "SPF found but does not include Resend. Mail may soft-fail at strict receivers.",
            "raw": spf,
        }
    if not has_terminator:
        return {"status": "WARN", "detail": "SPF found but no -all/~all terminator.", "raw": spf}
    return {"status": "PASS", "detail": "SPF includes Resend with terminator.", "raw": spf}


def _classify_dkim(records: list[str]) -> dict[str, Any]:
    dkim = next((r for r in records if "v=DKIM1" in r), None)
    if not dkim:
        return {
            "status": "FAIL",
            "detail": f"No DKIM TXT record at {DKIM_SELECTOR}._domainkey. Resend will not be able to sign your mail.",
            "raw": None,
        }
    if "p=" not in dkim:
        return {"status": "WARN", "detail": "DKIM record missing public key (p=).", "raw": dkim[:120]}
    if "p=;" in dkim or 'p=""' in dkim:
        return {
            "status": "FAIL",
            "detail": "DKIM record has empty public key — domain is in revocation state.",
            "raw": dkim[:120],
        }
    return {"status": "PASS", "detail": "DKIM record present with public key.", "raw": dkim[:120]}


def _classify_dmarc(records: list[str]) -> dict[str, Any]:
    dmarc = next((r for r in records if r.lower().startswith("v=dmarc1")), None)
    if not dmarc:
        return {
            "status": "FAIL",
            "detail": "No DMARC record at _dmarc subdomain. Major receivers (Gmail, Yahoo, Outlook) increasingly drop unsigned bulk mail.",
            "raw": None,
        }
    policy = "none"
    m = re.search(r"\bp=(none|quarantine|reject)\b", dmarc, re.IGNORECASE)
    if m:
        policy = m.group(1).lower()
    if policy == "none":
        return {
            "status": "WARN",
            "detail": "DMARC present but policy=none (monitoring only). Move to quarantine or reject for production.",
            "raw": dmarc,
        }
    return {"status": "PASS", "detail": f"DMARC policy={policy}.", "raw": dmarc}


def _domain_from_sender(sender: str) -> Optional[str]:
    if not sender:
        return None
    # Could be "name <addr@domain>" or "addr@domain"
    m = re.search(r"@([\w.-]+)", sender)
    return m.group(1).lower() if m else None


async def _run_check(domain: str) -> dict[str, Any]:
    spf_recs, dkim_recs, dmarc_recs = await asyncio.gather(
        _resolve_txt(domain),
        _resolve_txt(f"{DKIM_SELECTOR}._domainkey.{domain}"),
        _resolve_txt(f"_dmarc.{domain}"),
    )
    spf = _classify_spf(spf_recs)
    dkim = _classify_dkim(dkim_recs)
    dmarc = _classify_dmarc(dmarc_recs)

    statuses = [spf["status"], dkim["status"], dmarc["status"]]
    if "FAIL" in statuses:
        overall = "FAIL"
    elif "WARN" in statuses:
        overall = "WARN"
    else:
        overall = "PASS"

    return {
        "domain": domain,
        "overall": overall,
        "spf": spf,
        "dkim": {**dkim, "selector": DKIM_SELECTOR},
        "dmarc": dmarc,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/admin/email-health")
async def email_health(
    force: bool = False,
    _user: dict = Depends(require_admin),
):
    """Return cached SPF/DKIM/DMARC health for the configured sender domain.
    Pass `?force=true` to bypass the 1-hour cache."""
    import os as _os

    sender = _os.environ.get("SENDER_EMAIL") or "info@carryon.us"
    domain = _domain_from_sender(sender)
    if not domain:
        return {"error": "Could not derive sender domain from SENDER_EMAIL", "sender": sender}

    cache_key = f"email_health:{domain}"
    now = datetime.now(timezone.utc)
    if not force:
        cached = await db.platform_cache.find_one({"_id": cache_key})
        if cached:
            try:
                age = (now - datetime.fromisoformat(cached["checked_at"].replace("Z", "+00:00"))).total_seconds()
                if age < CACHE_TTL_SECONDS:
                    cached.pop("_id", None)
                    cached["cached"] = True
                    cached["cache_age_seconds"] = int(age)
                    return cached
            except (KeyError, ValueError, TypeError):
                pass

    result = await _run_check(domain)
    try:
        await db.platform_cache.update_one({"_id": cache_key}, {"$set": {**result, "_id": cache_key}}, upsert=True)
    except Exception as e:
        logger.warning(f"email_health: cache write failed: {e}")
    result["cached"] = False
    return result


async def email_health_scheduler():
    """Daily background refresh — keeps the cache warm and surfaces silent
    DNS regressions before a user happens to look at the admin tab."""
    import os as _os

    sender = _os.environ.get("SENDER_EMAIL") or "info@carryon.us"
    domain = _domain_from_sender(sender)
    if not domain:
        return
    while True:
        try:
            result = await _run_check(domain)
            await db.platform_cache.update_one(
                {"_id": f"email_health:{domain}"},
                {"$set": {**result, "_id": f"email_health:{domain}"}},
                upsert=True,
            )
            if result["overall"] != "PASS":
                logger.warning(
                    f"email_health weekly check: {result['overall']} for {domain} — "
                    f"SPF={result['spf']['status']}, DKIM={result['dkim']['status']}, "
                    f"DMARC={result['dmarc']['status']}"
                )
            else:
                logger.info(f"email_health weekly check: PASS for {domain}")
        except Exception as e:
            logger.error(f"email_health scheduler crashed: {e}")
        # Refresh once per day
        await asyncio.sleep(24 * 3600)


# Best-effort: ensure platform_cache collection exists. No specific index
# needed since lookups are by `_id`.
async def ensure_indexes():
    try:
        await db.platform_cache.create_index("_id")
    except Exception:
        pass
