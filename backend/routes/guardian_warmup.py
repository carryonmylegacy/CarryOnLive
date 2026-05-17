"""CarryOn™ Backend — xAI Connection Warmup

Extracted from `routes/guardian.py` on Feb 17, 2026 as part of the
monolith-reduction pass. Owns:

  POST /warmup                        (on-demand warmup when user opens EGA)
  async def warmup_xai()              (one-time startup warmup; called by server.py)

Why isolated: this is a tiny, self-contained "keep the xAI HTTP pool
warm" surface that has no business living next to the multi-thousand-
line chat pipeline. Now its retry strategy / cadence can evolve without
touching anything else. The `_xai_ping` helper that fires the minimal
keep-alive request is package-private (single underscore) and lives in
this module only.

The same `warmup_xai` import path used by `server.py` is preserved:
`from routes.guardian_warmup import warmup_xai`.

Mounted in `server.py` alongside the rest of the guardian routers.
"""

import asyncio

from fastapi import APIRouter, Depends

from config import XAI_MODEL_LIGHT, logger, xai_client
from utils import get_current_user

router = APIRouter()


async def _xai_ping() -> bool:
    """Send a minimal request to xAI to warm the HTTP connection pool.

    Returns True on success, False on any error (network, auth, rate-
    limit). Errors are logged at WARNING and swallowed so warmup never
    crashes the calling path.
    """
    try:
        await asyncio.to_thread(
            xai_client.chat.completions.create,
            model=XAI_MODEL_LIGHT,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
        )
        return True
    except Exception as e:
        logger.warning(f"xAI warmup ping failed: {e}")
        return False


async def warmup_xai() -> None:
    """One-time warmup at server startup (no background loop).

    Called from `server.py` via `asyncio.create_task(warmup_xai())`
    during application startup so the very first user's chat doesn't
    pay the cold-connection latency tax. If `xai_client` isn't
    configured (e.g., local dev without the key), this is a no-op.
    """
    if not xai_client:
        return
    ok = await _xai_ping()
    if ok:
        logger.info("xAI connection warmed up successfully at startup")


@router.post("/warmup")
async def warmup_endpoint(current_user: dict = Depends(get_current_user)):
    """Warm the xAI connection on demand.

    Triggered by the frontend the moment a user opens the Guardian page.
    By the time the user finishes typing their first message, the xAI
    HTTPS connection is already established and the model is warm — a
    sub-second tail-latency saving on the first chat-completion call.
    """
    if not xai_client:
        return {"status": "no_client"}
    ok = await _xai_ping()
    return {"status": "warm" if ok else "failed"}
