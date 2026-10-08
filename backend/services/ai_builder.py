"""Shared plumbing for every "describe it → draft → review → build" AI Builder.

One place for: the xAI call with light→flagship fallback, the burn guard, the
cost ledger, and the fenced-JSON parse. Builders (entities, financial
picture, beneficiaries, …) only supply messages + a validator. Nothing here
writes estate data — drafts are returned to the client for review and the
client creates rows through the ordinary CRUD endpoints.
"""

import asyncio
import json
import re
import time
from typing import Optional

from fastapi import HTTPException

from config import XAI_MODEL, XAI_MODEL_LIGHT, logger, xai_client
from services.ai_burn_guard import require_ai_burn_budget
from services.llm_cost_ledger import record_xai_response

_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.S)


def extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    m = _FENCE_RE.search(text)
    blob = m.group(1) if m else None
    if blob is None:
        start, end = text.find("{"), text.rfind("}")
        blob = text[start : end + 1] if start >= 0 and end > start else None
    if not blob:
        return None
    try:
        parsed = json.loads(blob)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


async def run_ai_draft(
    *,
    current_user: dict,
    estate_id: str,
    feature: str,
    messages: list[dict[str, str]],
    max_tokens: int = 3000,
    temperature: float = 0.2,
) -> tuple[dict, str]:
    """Call xAI (light model first, flagship as fallback) and return (raw_json, model_used)."""
    if not xai_client:
        raise HTTPException(status_code=503, detail="AI service not configured. Please contact support.")
    from routes.feature_gates import is_feature_enabled_for_user  # local: avoids a routes↔services import cycle

    if not await is_feature_enabled_for_user(current_user, "aib"):
        raise HTTPException(
            status_code=403, detail="AI Builders are not included in your plan. You can still add everything by hand."
        )
    await require_ai_burn_budget(current_user, feature)

    completion, used_model, last_err = None, None, None
    for model_name in (XAI_MODEL_LIGHT, XAI_MODEL):
        started = time.time()
        try:
            completion = await asyncio.wait_for(
                asyncio.to_thread(
                    xai_client.chat.completions.create,
                    model=model_name,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                ),
                timeout=70.0,
            )
            used_model = model_name
            await record_xai_response(
                completion,
                endpoint=feature,
                model=model_name,
                user_id=current_user["id"],
                estate_id=estate_id,
                started_at=started,
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning(f"AI draft ({feature}) failed on {model_name}: {exc}")
    if completion is None:
        raise HTTPException(
            status_code=503, detail=f"AI service unavailable — please try again in a minute. ({last_err})"
        )

    raw = extract_json(completion.choices[0].message.content or "")
    if raw is None:
        raise HTTPException(status_code=502, detail="The AI reply could not be read. Please try describing it again.")
    return raw, used_model


_SOURCE_TAG_RE = re.compile(r"\s*\((?:source|per|from)\s*:\s*[^)]*\)", re.I)
_PLACEHOLDERS = {
    "unknown",
    "n/a",
    "na",
    "none",
    "null",
    "not stated",
    "not provided",
    "not specified",
    "not mentioned",
    "not given",
    "tbd",
}


def clean_str(v, limit: int) -> Optional[str]:
    """Trim, cap, and drop the "(source: speaker description)" tag the safety preamble makes the model add."""
    if v is None:
        return None
    s = _SOURCE_TAG_RE.sub("", str(v)).strip()
    if s.lower() in _PLACEHOLDERS:
        return None
    return s[:limit] if s else None


def clean_num(v, lo: float = 0, hi: float = 1e12) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        f = float(str(v).replace("$", "").replace(",", "").replace("%", "").strip())
    except (TypeError, ValueError):
        return None
    return round(f, 2) if lo <= f <= hi else None


def clean_int(v, lo: int, hi: int) -> Optional[int]:
    f = clean_num(v, lo, hi)
    return int(f) if f is not None else None


def pick(v, allowed, default=None):
    return v if v in allowed else default
