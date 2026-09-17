"""CarryOn™ Backend — Site Copy overrides (founder-editable public text).

Every public-facing string has a stable key in the frontend registry
(frontend/src/copy/siteCopy.js) with its built-in default. The founder can
override any of them from Admin → Marketing → Site Copy; overrides live here,
keyed by that string key, and the public site falls back to the default when
no override exists. Plain text only (line breaks allowed) — never rendered as HTML.

GET  /api/public/site-copy       — {overrides: {key: text}, updated_at}
PUT  /api/admin/site-copy        — {changes: {key: text | null}} (null/"" resets to default); founder or marketing scope
"""

import re
import unicodedata
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from config import db, logger
from guards import require_scope
from services.audit import get_client_ip, log_audit_event

router = APIRouter()

KEY_RE = re.compile(r"^[a-z0-9]+(?:\.[a-z0-9_-]+)+$")
MAX_LEN = 5000
MAX_CHANGES = 400


class SiteCopyChanges(BaseModel):
    changes: dict[str, str | None] = Field(..., description="key → new text, or null/empty to reset to default")


def clean_copy_value(value: str) -> str:
    """Plain text only: normalise, strip control chars except newline/tab, collapse CRLF."""
    text = unicodedata.normalize("NFC", value).replace("\r\n", "\n").replace("\r", "\n")
    text = "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch)[0] != "C")
    return text.strip()


def validate_key(key: str) -> str:
    if not isinstance(key, str) or len(key) > 120 or not KEY_RE.match(key):
        raise HTTPException(status_code=400, detail=f"Invalid copy key: {key!r}")
    return key


async def load_overrides() -> dict:
    overrides, latest = {}, ""
    async for doc in db.site_copy.find({}, {"_id": 1, "value": 1, "updated_at": 1}):
        overrides[doc["_id"]] = doc.get("value", "")
        latest = max(latest, doc.get("updated_at", "") or "")
    return {"overrides": overrides, "updated_at": latest}


@router.get("/public/site-copy")
async def get_public_site_copy():
    """Public — founder overrides for the marketing site's text."""
    return await load_overrides()


@router.put("/admin/site-copy")
async def put_site_copy(
    payload: SiteCopyChanges, request: Request, current_user: dict = Depends(require_scope("marketing"))
):
    if len(payload.changes) > MAX_CHANGES:
        raise HTTPException(status_code=400, detail=f"Too many changes in one save (max {MAX_CHANGES}).")
    now = datetime.now(timezone.utc).isoformat()
    actor = current_user.get("email", "")
    set_keys, reset_keys = [], []
    for raw_key, raw_value in payload.changes.items():
        key = validate_key(raw_key)
        value = clean_copy_value(raw_value) if isinstance(raw_value, str) else ""
        if not value:
            res = await db.site_copy.delete_one({"_id": key})
            if res.deleted_count:
                reset_keys.append(key)
            continue
        if len(value) > MAX_LEN:
            raise HTTPException(status_code=400, detail=f"{key}: text is too long (max {MAX_LEN} characters).")
        await db.site_copy.replace_one(
            {"_id": key},
            {"_id": key, "value": value, "updated_at": now, "updated_by": actor},
            upsert=True,
        )
        set_keys.append(key)
    if set_keys or reset_keys:
        logger.info(f"Site copy updated by {actor}: {len(set_keys)} set, {len(reset_keys)} reset")
        await log_audit_event(
            actor_id=current_user["id"],
            actor_email=actor,
            actor_role=current_user.get("role", "admin"),
            action="site_copy_update",
            category="platform",
            resource_type="site_copy",
            resource_id="public-site",
            details={"set": set_keys, "reset": reset_keys},
            ip_address=get_client_ip(request),
        )
    return await load_overrides()
