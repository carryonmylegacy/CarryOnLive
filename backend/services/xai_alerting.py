"""CarryOn™ — xAI health, spend, substitution & fallback alerting (Jun 2026).

Founder-approved design. Four daily checks; tripped checks email
founder@carryon.us via Resend. Alert bodies contain model names, counts,
and dollar figures ONLY — never user content.

  1. Key health   — GET https://api.x.ai/v1/api-key; alert on team_blocked /
                    api_key_blocked / api_key_disabled or non-200.
  2. Daily spend  — sum of llm_cost_ledger.estimated_cost_usd for the UTC
                    day ≥ configurable threshold (default $5).
  3. Substitution — share of the day's calls where served_model ≠ requested
                    model above a configurable share (default 10%). xAI
                    silently redirects retired model names — this is how the
                    Jun 2026 cost overrun went unnoticed. Never again silently.
  4. Fallback rate— ai_fallback_events count for the UTC day ≥ configurable
                    count (default 3), split BEC vs Estate Guardian (EGA).

Thresholds live in platform_settings {_id: "global"} and are editable from
Admin → Platform → Integrations → AI Alerting. One email per check per UTC
day (deduped via db.alert_state); "Run checks now" bypasses the dedup.
"""

from __future__ import annotations

from datetime import datetime, timezone

import httpx

from config import XAI_API_KEY, db, logger

ALERT_RECIPIENT = "founder@carryon.us"

CONFIG_DEFAULTS = {
    "xai_alerting_enabled": True,
    "xai_spend_alert_usd": 5.0,
    "xai_substitution_alert_pct": 10,
    "ai_fallback_alert_count": 3,
}


async def get_alert_config() -> dict:
    settings = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0}) or {}
    cfg = {k: settings.get(k, v) for k, v in CONFIG_DEFAULTS.items()}
    cfg["recipient"] = ALERT_RECIPIENT
    return cfg


def _utc_day():
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0), now


async def _check_key_health() -> dict:
    check = {"check": "key_health", "label": "API key health", "status": "ok"}
    if not XAI_API_KEY:
        check.update(status="alert", summary="XAI_API_KEY is not configured on this deployment.")
        return check
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://api.x.ai/v1/api-key",
                headers={"Authorization": f"Bearer {XAI_API_KEY}"},
            )
        if r.status_code != 200:
            check.update(status="alert", summary=f"xAI key endpoint returned HTTP {r.status_code}.")
            return check
        info = r.json()
        blocked = [flag for flag in ("team_blocked", "api_key_blocked", "api_key_disabled") if info.get(flag)]
        if blocked:
            check.update(
                status="alert",
                summary=f"xAI key is blocked: {', '.join(blocked)}. AI features are degraded until credits/key are restored.",
            )
        else:
            check["summary"] = "Key active — no blocking flags."
    except Exception as e:  # noqa: BLE001
        check.update(status="alert", summary=f"Could not reach xAI key endpoint ({type(e).__name__}).")
    return check


async def _check_daily_spend(threshold_usd: float) -> dict:
    day_start, _ = _utc_day()
    pipeline = [
        {"$match": {"created_at": {"$gte": day_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$estimated_cost_usd"}, "calls": {"$sum": 1}}},
    ]
    rows = await db.llm_cost_ledger.aggregate(pipeline).to_list(1)
    total = round((rows[0]["total"] if rows else 0) or 0, 4)
    calls = rows[0]["calls"] if rows else 0
    check = {
        "check": "daily_spend",
        "label": "Daily spend",
        "status": "alert" if total >= threshold_usd else "ok",
        "summary": f"${total:.2f} across {calls} call(s) today (UTC); threshold ${threshold_usd:.2f}.",
        "spend_usd": total,
        "calls": calls,
        "threshold_usd": threshold_usd,
    }
    return check


async def _check_model_substitution(pct_threshold: float) -> dict:
    day_start, _ = _utc_day()
    match = {"created_at": {"$gte": day_start}, "served_model": {"$type": "string"}}
    total = await db.llm_cost_ledger.count_documents(match)
    check = {
        "check": "model_substitution",
        "label": "Model substitution",
        "status": "ok",
        "threshold_pct": pct_threshold,
    }
    if total == 0:
        check["summary"] = "No calls with a served_model recorded today."
        return check
    pipeline = [
        {"$match": {**match, "$expr": {"$ne": ["$served_model", "$model"]}}},
        {"$group": {"_id": {"requested": "$model", "served": "$served_model"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    pairs = await db.llm_cost_ledger.aggregate(pipeline).to_list(20)
    mismatched = sum(p["count"] for p in pairs)
    share = round(100 * mismatched / total, 1)
    pair_text = "; ".join(f"{p['_id']['requested']} → {p['_id']['served']} ({p['count']}×)" for p in pairs)
    check.update(
        status="alert" if share > pct_threshold else "ok",
        summary=(
            f"{mismatched}/{total} calls ({share}%) served by a different model than requested"
            + (f": {pair_text}." if pair_text else ".")
        ),
        mismatched=mismatched,
        total=total,
        share_pct=share,
    )
    return check


async def _check_fallback_rate(count_threshold: int) -> dict:
    day_start, _ = _utc_day()
    # ai_fallback_events.created_at is an ISO-8601 string — lexicographic
    # comparison against an ISO prefix is correct.
    match = {"created_at": {"$gte": day_start.isoformat()}}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$surface", "count": {"$sum": 1}}},
    ]
    rows = await db.ai_fallback_events.aggregate(pipeline).to_list(10)
    by_surface = {r["_id"]: r["count"] for r in rows}
    total = sum(by_surface.values())
    detail = ", ".join(f"{k.upper()}: {v}" for k, v in sorted(by_surface.items())) or "none"
    return {
        "check": "fallback_rate",
        "label": "AI fallback rate",
        "status": "alert" if total >= count_threshold else "ok",
        "summary": f"{total} fallback event(s) today (UTC) — {detail}; threshold {count_threshold}.",
        "total": total,
        "by_surface": by_surface,
        "threshold_count": count_threshold,
    }


async def _not_yet_alerted_today(check_name: str, date_str: str) -> bool:
    """True exactly once per (check, UTC day) — dedup via upsert."""
    key = f"xai_alert:{check_name}:{date_str}"
    result = await db.alert_state.update_one(
        {"_id": key},
        {"$setOnInsert": {"sent_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return result.upserted_id is not None


async def run_xai_health_checks(force: bool = False) -> dict:
    """Run all four checks; email tripped ones (deduped per UTC day).

    `force=True` (the founder-portal "Run checks now" button) bypasses the
    per-day dedup so alerting can be verified end-to-end from production.
    """
    cfg = await get_alert_config()
    enabled = bool(cfg.get("xai_alerting_enabled", True))
    day_start, now = _utc_day()
    date_str = day_start.strftime("%Y-%m-%d")

    if not enabled and not force:
        # Founder toggled alerting OFF — the daily job does nothing.
        return {
            "date": date_str,
            "ran_at": now.isoformat(),
            "overall": "disabled",
            "checks": [],
            "alerts_sent": 0,
            "enabled": False,
            "recipient": ALERT_RECIPIENT,
            "config": {k: cfg[k] for k in CONFIG_DEFAULTS},
        }

    checks = [
        await _check_key_health(),
        await _check_daily_spend(float(cfg["xai_spend_alert_usd"])),
        await _check_model_substitution(float(cfg["xai_substitution_alert_pct"])),
        await _check_fallback_rate(int(cfg["ai_fallback_alert_count"])),
    ]
    tripped = [c for c in checks if c["status"] == "alert"]

    to_send = []
    for c in tripped:
        if force or await _not_yet_alerted_today(c["check"], date_str):
            to_send.append(c)

    alerts_sent = 0
    # Toggle OFF + Run-now: run the checks and show results, send nothing.
    if to_send and enabled:
        items = "".join(
            f"<li style='margin-bottom:8px'><strong>{c['label']}:</strong> {c['summary']}</li>" for c in to_send
        )
        html = (
            f"<h2 style='margin:0 0 12px'>CarryOn AI alert — {date_str} (UTC)</h2>"
            f"<ul style='padding-left:18px'>{items}</ul>"
            "<p style='color:#666;font-size:13px'>Thresholds are configurable in "
            "Admin → Platform → Integrations → AI Alerting. This alert contains "
            "model names, counts, and dollar figures only — never user content.</p>"
        )
        try:
            from services.email import send_email

            await send_email(
                ALERT_RECIPIENT,
                f"CarryOn AI alert — {len(to_send)} issue(s) on {date_str}",
                html,
            )
            alerts_sent = len(to_send)
        except Exception as e:  # noqa: BLE001
            logger.error(f"xAI alert email failed: {e}")

    result = {
        "date": date_str,
        "ran_at": now.isoformat(),
        "overall": "alert" if tripped else "ok",
        "checks": checks,
        "alerts_sent": alerts_sent,
        "enabled": enabled,
        "recipient": ALERT_RECIPIENT,
        "config": {k: cfg[k] for k in CONFIG_DEFAULTS},
    }
    logger.info(
        f"xAI health checks: overall={result['overall']} "
        f"tripped={[c['check'] for c in tripped]} alerts_sent={alerts_sent}"
    )
    return result
