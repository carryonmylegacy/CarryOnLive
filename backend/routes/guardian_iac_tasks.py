"""CarryOn™ Backend — EGA IAC Task Management + SSE Stream

Extracted from `routes/guardian.py` on Feb 17, 2026 as part of the
monolith-reduction pass. Owns the 4 IAC-task-lifecycle endpoints:

  GET  /guardian/iac-task-status     (polling — legacy + SSE fallback)
  POST /guardian/iac-task/cancel     (user-initiated cancel)
  GET  /guardian/usage/today         (per-user xAI token telemetry)
  GET  /guardian/iac-task-stream     (Server-Sent Events live stream)

These endpoints share NO write-state with the rest of guardian.py — they
read the `ega_tasks` and `xai_usage` collections and act on them. The
`_get_user_estate` helper and `PER_USER_DAILY_TOKEN_BUDGET` constant are
imported from guardian.py to avoid duplication. (server.py mounts the
two routers independently; there's no circular-import risk because
guardian.py never imports from this module.)

Mounted in `server.py` alongside the rest of the guardian routers.
"""

import asyncio
import json as json_module
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from config import db
from routes.guardian import PER_USER_DAILY_TOKEN_BUDGET, _get_user_estate
from utils import get_current_user

router = APIRouter()


@router.get("/guardian/iac-task-status")
async def get_iac_task_status(current_user: dict = Depends(get_current_user)):
    """Get the latest IAC generation task status for the user's estate.

    Used by Dashboard and Checklist pages to poll for real-time updates
    while EGA is generating IAC items in the background.

    Includes a stale-task self-heal: if a task has been "running" for
    more than 9 minutes without an update, we mark it as ``error`` so
    the polling banner doesn't hang forever (covers pod restarts /
    backend crashes between the upsert and the completion write).
    Heavy IAC runs with the new richer prompt can legitimately take
    3-6 min on grok-3 + grok-4 failover, so the threshold is generous.
    """
    estates = await _get_user_estate(current_user, {"_id": 0, "id": 1})
    if not estates:
        return {"status": "none"}
    estate_id = estates[0]["id"]

    task = await db.ega_tasks.find_one(
        {"estate_id": estate_id, "type": "generate_iac"},
        {"_id": 0},
    )
    if not task:
        return {"status": "none"}

    # Stale-task self-heal
    if task.get("status") == "running":
        started_at = task.get("started_at")
        if started_at:
            try:
                started_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                age_s = (datetime.now(timezone.utc) - started_dt).total_seconds()
                if age_s > 540:
                    await db.ega_tasks.update_one(
                        {"id": task.get("id")},
                        {
                            "$set": {
                                "status": "error",
                                "error": "Generation timed out — please try again.",
                                "completed_at": datetime.now(timezone.utc).isoformat(),
                            }
                        },
                    )
                    task["status"] = "error"
                    task["error"] = "Generation timed out — please try again."
                    task["completed_at"] = datetime.now(timezone.utc).isoformat()
            except (ValueError, TypeError):
                pass

    return task


@router.post("/guardian/iac-task/cancel")
async def cancel_iac_task(current_user: dict = Depends(get_current_user)):
    """Cancel the user's currently-running IAC generation task.

    Flips ``status: running`` → ``status: canceled`` so the frontend
    polling banner clears immediately, even when the user is on a
    different page from the one that kicked off the request.
    The actual backend xAI call (already in flight on the server)
    cannot be aborted mid-request, but it WILL no-op when it tries to
    write its own completion update because the filter only matches
    rows still in ``running``.
    """
    estates = await _get_user_estate(current_user, {"_id": 0, "id": 1})
    if not estates:
        return {"canceled": False, "reason": "no_estate"}
    estate_id = estates[0]["id"]

    result = await db.ega_tasks.update_one(
        {"estate_id": estate_id, "type": "generate_iac", "status": "running"},
        {
            "$set": {
                "status": "canceled",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"canceled": result.modified_count > 0}


@router.get("/guardian/usage/today")
async def get_my_ai_usage_today(current_user: dict = Depends(get_current_user)):
    """Return today's AI usage for the authenticated user.

    Powers an in-app "today's AI budget" indicator so users can see how
    much of their daily quota they've consumed before they're cut off.
    `tokens_remaining` is the live remaining budget (or "unlimited" for
    `ai_unlimited` users / admins).
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    agg = await db.xai_usage.aggregate(
        [
            {"$match": {"user_id": current_user["id"], "date": today}},
            {
                "$group": {
                    "_id": None,
                    "input_total": {"$sum": "$input_tokens"},
                    "output_total": {"$sum": "$output_tokens"},
                    "cost_total": {"$sum": "$cost_usd"},
                    "request_count": {"$sum": 1},
                }
            },
        ]
    ).to_list(1)
    used = 0
    cost = 0.0
    requests = 0
    if agg:
        used = (agg[0].get("input_total", 0) or 0) + (agg[0].get("output_total", 0) or 0)
        cost = round(agg[0].get("cost_total", 0.0) or 0.0, 4)
        requests = agg[0].get("request_count", 0) or 0
    unlimited = bool(current_user.get("ai_unlimited") or current_user.get("role") == "admin")
    return {
        "date": today,
        "tokens_used": used,
        "tokens_budget": PER_USER_DAILY_TOKEN_BUDGET,
        "tokens_remaining": "unlimited" if unlimited else max(0, PER_USER_DAILY_TOKEN_BUDGET - used),
        "ratio": (used / PER_USER_DAILY_TOKEN_BUDGET) if PER_USER_DAILY_TOKEN_BUDGET > 0 else 0,
        "unlimited": unlimited,
        "cost_usd": cost,
        "request_count": requests,
    }


@router.get("/guardian/iac-task-stream")
async def stream_iac_task_status(current_user: dict = Depends(get_current_user)):
    """Server-Sent Events stream of the current user's IAC task status.

    Replacement for the existing /iac-task-status polling endpoint when
    the frontend has SSE enabled. Pushes a JSON payload identical to
    the polling response shape any time the underlying task document
    changes, then auto-closes when the task reaches a terminal state
    (completed | error | canceled) OR after 10 minutes of no-change
    (defensive ceiling so a leaked connection can't live forever).

    Why SSE: at 1,000 active users each polling /iac-task-status every
    4 seconds, the platform receives ~250 req/sec just for this one
    feature. With SSE, the same load becomes ~1,000 idle long-lived
    connections — orders of magnitude less request-handler churn —
    AND clients see status changes within milliseconds instead of up
    to 4 s late. The endpoint is backwards-compatible with polling:
    if a proxy or environment strips SSE, the frontend falls back to
    the polling endpoint automatically.

    Implementation: we poll the task document internally every 2 s
    (cheaper than wiring Mongo change streams across the deployment)
    and only emit an event when the serialized payload actually
    differs from the previous emission. Final event is `event: close`
    so the client can cleanly tear down without firing onerror.
    """
    estates = await _get_user_estate(current_user, {"_id": 0, "id": 1})
    if not estates:

        async def _empty():
            yield 'event: close\ndata: {"status":"none"}\n\n'

        return StreamingResponse(_empty(), media_type="text/event-stream")
    estate_id = estates[0]["id"]

    MAX_STREAM_DURATION_S = 600  # 10-minute defensive ceiling per connection
    POLL_INTERVAL_S = 2
    PING_EVERY_S = 25  # idle heartbeat to keep proxies from killing the stream

    async def _event_stream():
        # Anti-buffering primer: emit ~16 KB of SSE comment padding on
        # connection so HTTP/1.1 proxies with default 4–8 KB output
        # buffers (nginx, ELB, Cloudflare, k8s ingress) are forced to
        # flush the chunk through to the client immediately. Without
        # this, the proxy holds the first `data:` frame in its buffer
        # until enough subsequent bytes accumulate — which never
        # happens on an idle EGA task. Comment lines (starting with
        # `:`) are explicitly ignored by the SSE / EventSource spec.
        # The kubernetes ingress in this deployment was observed to
        # buffer the entire response indefinitely with only a 2 KB
        # primer; 16 KB consistently breaks past every proxy buffer
        # we've tested. Cost: a one-time ~16 KB on connection — at
        # 1,000 active users that's 16 MB total, an acceptable price
        # for real-time event delivery.
        yield ":" + (" " * (16 * 1024)) + "\n\n"
        started = datetime.now(timezone.utc)
        last_payload_json = None
        last_event_ts = started
        while True:
            task = await db.ega_tasks.find_one(
                {"estate_id": estate_id, "type": "generate_iac"},
                {"_id": 0},
            )
            if not task:
                payload = {"status": "none"}
            else:
                payload = {
                    "status": task.get("status", "none"),
                    "started_at": task.get("started_at"),
                    "completed_at": task.get("completed_at"),
                    "items_added": task.get("items_added", 0),
                    "duplicates_skipped": task.get("duplicates_skipped", 0),
                    "error": task.get("error"),
                }
            payload_json = json_module.dumps(payload, default=str)
            now = datetime.now(timezone.utc)
            if payload_json != last_payload_json:
                yield f"data: {payload_json}\n\n"
                last_payload_json = payload_json
                last_event_ts = now
            else:
                # No payload change — emit a comment-only heartbeat every
                # PING_EVERY_S so intermediaries (Cloudflare, nginx, ELB)
                # don't reap the connection as idle. Comments are ignored
                # by the EventSource / fetch-stream parser.
                if (now - last_event_ts).total_seconds() >= PING_EVERY_S:
                    yield ": ping\n\n"
                    last_event_ts = now
            # Defensive ceiling so a leaked client connection can't
            # keep this coroutine running forever. We intentionally do
            # NOT close on terminal status (completed/error/canceled)
            # because the SAME client wants to be notified about the
            # NEXT run that may start a minute later. Closing on every
            # terminal state caused a client reconnect storm (~1/sec).
            age_s = (now - started).total_seconds()
            if age_s > MAX_STREAM_DURATION_S:
                yield 'event: close\ndata: {"reason":"timeout"}\n\n'
                return
            await asyncio.sleep(POLL_INTERVAL_S)

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # disable proxy buffering (nginx-style)
            "Connection": "keep-alive",
        },
    )
