"""CarryOn™ — Launch War Room metrics (for nationwide campaign monitoring).

Single-endpoint dashboard data source showing real-time platform health during
marketing pushes. Designed to be polled every 15-30s by the admin UI.

Returns metrics across:
  • Traffic (signups, logins, recent requests)
  • Performance (p50/p95/p99 API latency, error rate)
  • Revenue (checkout sessions, FC activations, completed payments)
  • Infrastructure (DB status, scheduler health)
"""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends

from config import db
from utils import get_current_user
from guards import require_admin

router = APIRouter()


@router.get("/admin/launch-war-room")
async def launch_war_room(
    current_user: dict = Depends(get_current_user),
    _admin: bool = Depends(require_admin),
):
    """Real-time platform health snapshot for launch-day monitoring.

    Safe to poll every 15s (all queries are indexed + bounded + projected).
    """
    now = datetime.now(timezone.utc)
    one_hour_ago = now - timedelta(hours=1)
    five_min_ago = now - timedelta(minutes=5)
    one_day_ago = now - timedelta(days=1)

    # ── Traffic ───────────────────────────────────────────────────────
    # Signups in last 1h and last 5min (for burst detection)
    signups_1h = await db.users.count_documents({
        "created_at": {"$gte": one_hour_ago.isoformat()},
    })
    signups_5m = await db.users.count_documents({
        "created_at": {"$gte": five_min_ago.isoformat()},
    })
    signups_24h = await db.users.count_documents({
        "created_at": {"$gte": one_day_ago.isoformat()},
    })

    # Active sessions heuristic: users active in last 15 min
    active_cutoff = (now - timedelta(minutes=15)).isoformat()
    active_users = await db.users.count_documents({
        "last_active_at": {"$gte": active_cutoff},
    })

    # ── Performance (from in-process APIMetrics) ─────────────────────
    try:
        from middleware import api_metrics
        perf = api_metrics.get_summary()
    except Exception:
        perf = {}

    # ── Revenue (Stripe + Founders Circle) ──────────────────────────
    # Checkout sessions created in last 1h
    checkouts_1h = await db.payment_transactions.count_documents({
        "created_at": {"$gte": one_hour_ago.isoformat()},
    })
    # Payments completed (paid) in last 1h
    paid_1h = await db.payment_transactions.count_documents({
        "payment_status": "paid",
        "created_at": {"$gte": one_hour_ago.isoformat()},
    })
    # Sum of paid revenue in last 24h (cents → dollars)
    revenue_cursor = db.payment_transactions.aggregate([
        {"$match": {
            "payment_status": "paid",
            "created_at": {"$gte": one_day_ago.isoformat()},
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount_total"}}},
    ])
    revenue_24h_cents = 0
    async for row in revenue_cursor:
        revenue_24h_cents = row.get("total", 0) or 0
    # Founders Circle activations in last 24h
    fc_24h = await db.founders_circle.count_documents({
        "status": "active",
        "activated_at": {"$gte": one_day_ago.isoformat()},
    })

    # ── Infrastructure ────────────────────────────────────────────────
    # Scheduler locks — shows which schedulers are currently held and by whom
    scheduler_locks = []
    try:
        cursor = db.scheduler_locks.find(
            {"expires_at": {"$gt": now}},
            {"_id": 0, "name": 1, "holder": 1, "acquired_at": 1, "expires_at": 1},
        )
        async for doc in cursor:
            scheduler_locks.append({
                "name": doc.get("name"),
                "holder": doc.get("holder"),
                "acquired_at": (doc.get("acquired_at") or now).isoformat() if hasattr(doc.get("acquired_at") or now, "isoformat") else str(doc.get("acquired_at")),
            })
    except Exception:
        pass

    # DB ping
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "error"

    # ── Alerts: derive simple red flags ──────────────────────────────
    alerts = []
    p95 = perf.get("p95_response_ms", 0)
    err_rate = perf.get("error_rate_pct", 0)
    if p95 > 1500:
        alerts.append({"level": "warn", "text": f"API p95 is {p95}ms (normal <1000ms)"})
    if p95 > 3000:
        alerts.append({"level": "critical", "text": f"API p95 is {p95}ms — possible degradation"})
    if err_rate > 1:
        alerts.append({"level": "warn", "text": f"5xx error rate {err_rate}% (normal <0.5%)"})
    if err_rate > 5:
        alerts.append({"level": "critical", "text": f"5xx error rate {err_rate}% — investigate immediately"})
    if db_status != "connected":
        alerts.append({"level": "critical", "text": "MongoDB unreachable from this pod"})

    return {
        "generated_at": now.isoformat(),
        "traffic": {
            "signups_last_5m": signups_5m,
            "signups_last_1h": signups_1h,
            "signups_last_24h": signups_24h,
            "active_users_15m": active_users,
        },
        "performance": {
            "p50_response_ms": perf.get("avg_response_ms", 0),
            "p95_response_ms": perf.get("p95_response_ms", 0),
            "p99_response_ms": perf.get("p99_response_ms", 0),
            "total_requests": perf.get("total_requests", 0),
            "error_4xx": perf.get("error_4xx", 0),
            "error_5xx": perf.get("error_5xx", 0),
            "error_rate_pct": perf.get("error_rate_pct", 0),
            "uptime": perf.get("uptime_formatted", "—"),
            "slowest_endpoints": perf.get("slowest_endpoints", []),
            "sample_size": perf.get("sample_size", 0),
        },
        "revenue": {
            "checkouts_last_1h": checkouts_1h,
            "paid_last_1h": paid_1h,
            "revenue_last_24h_usd": round(revenue_24h_cents / 100, 2) if revenue_24h_cents else 0,
            "founders_circle_last_24h": fc_24h,
        },
        "infrastructure": {
            "database": db_status,
            "scheduler_locks_held": scheduler_locks,
            "scheduler_locks_count": len(scheduler_locks),
        },
        "alerts": alerts,
    }
