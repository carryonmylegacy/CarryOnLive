"""CarryOn™ — Trustee Mode Access (TMA)

A benefactor-provisioned delegate identity. The benefactor creates a
separate username/password that, when used to log in, acts on behalf
of the benefactor with full mutation parity — with one hard exception:
the trustee can NEVER manage the trustee panel itself.

Every completed mutation by the trustee is captured as an audit event
with a pre-mutation snapshot and surfaced as an "Undo" notification on
the benefactor's account.

Collections
───────────
- `trustee_grants`   — one row per active or revoked grant
- `trustee_audit_events` — one row per completed trustee mutation

Endpoints
─────────
GET    /api/trustee/grants            — benefactor lists their grants
POST   /api/trustee/grants            — benefactor creates a grant
PATCH  /api/trustee/grants/{id}       — toggle beneficiary inclusion / extend expiry
DELETE /api/trustee/grants/{id}       — revoke
POST   /api/trustee/audit/{event_id}/undo — benefactor restores a snapshot

This module is additive. It does NOT modify any existing collection
schema. The single surgical hook in `utils.get_current_user` translates
a JWT with the `acting_as` claim into the benefactor's user document
with the flags `_trustee_mode`, `_trustee_can_access_beneficiaries`,
and `_trustee_grant_id` attached.
"""

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import db, logger
from utils import get_current_user, hash_password

router = APIRouter()


# ─── Models ────────────────────────────────────────────────────────────


class TrusteeGrantCreate(BaseModel):
    """Benefactor-provided fields for creating a new trustee grant."""

    trustee_username: str = Field(..., min_length=3, max_length=40)
    trustee_display_name: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=8, max_length=200)
    include_beneficiaries: bool = False
    duration: str = Field(..., description="indefinite | 1d | 3d | 5d | 1w | custom")
    custom_days: int | None = Field(default=None, ge=1, le=3650)


class TrusteeGrantUpdate(BaseModel):
    """Partial-update payload — every field optional."""

    include_beneficiaries: bool | None = None
    duration: str | None = None
    custom_days: int | None = Field(default=None, ge=1, le=3650)
    new_password: str | None = Field(default=None, min_length=8, max_length=200)


# ─── Helpers ───────────────────────────────────────────────────────────

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]+$")
TRUSTEE_USERNAME_PREFIX_HINT = "trustee_"  # Recommendation only; not enforced.

VALID_DURATIONS = {"indefinite", "1d", "3d", "5d", "1w", "custom"}


def _validate_username(name: str) -> None:
    if not name or len(name.strip()) < 3:
        raise HTTPException(status_code=400, detail="Trustee username must be at least 3 characters.")
    if not USERNAME_RE.match(name.strip()):
        raise HTTPException(
            status_code=400,
            detail="Trustee username can only contain letters, numbers, dots, hyphens, and underscores.",
        )


def _resolve_expiry(duration: str, custom_days: int | None) -> str | None:
    """Translate a duration choice into an absolute expiry timestamp."""
    if duration not in VALID_DURATIONS:
        raise HTTPException(status_code=400, detail="Invalid duration choice.")
    if duration == "indefinite":
        return None
    now = datetime.now(timezone.utc)
    if duration == "1d":
        return (now + timedelta(days=1)).isoformat()
    if duration == "3d":
        return (now + timedelta(days=3)).isoformat()
    if duration == "5d":
        return (now + timedelta(days=5)).isoformat()
    if duration == "1w":
        return (now + timedelta(weeks=1)).isoformat()
    if duration == "custom":
        if not custom_days or custom_days < 1:
            raise HTTPException(status_code=400, detail="Custom duration requires a positive number of days.")
        return (now + timedelta(days=custom_days)).isoformat()
    return None


def _grant_public(grant: dict) -> dict:
    """Shape a grant document for API responses (never leak the password hash)."""
    expires_at = grant.get("expires_at")
    is_expired = False
    if expires_at:
        try:
            is_expired = datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc)
        except (ValueError, TypeError):
            is_expired = False
    return {
        "id": grant["id"],
        "trustee_username": grant.get("trustee_username", ""),
        "trustee_display_name": grant.get("trustee_display_name", ""),
        "include_beneficiaries": bool(grant.get("include_beneficiaries", False)),
        "duration": grant.get("duration", "indefinite"),
        "custom_days": grant.get("custom_days"),
        "expires_at": expires_at,
        "is_expired": is_expired,
        "revoked_at": grant.get("revoked_at"),
        "last_used_at": grant.get("last_used_at"),
        "created_at": grant.get("created_at", ""),
    }


def _require_benefactor(user: dict) -> None:
    """Only a real benefactor (not a trustee acting-as) can manage grants."""
    if user.get("_trustee_mode"):
        raise HTTPException(
            status_code=403,
            detail="Trustee accounts cannot manage trustee grants. Sign in as the benefactor.",
        )
    if user.get("role") not in ("benefactor", "admin"):
        raise HTTPException(status_code=403, detail="Only benefactors can manage trustee grants.")


async def find_active_trustee_grant_by_username(login_identifier: str) -> dict | None:
    """Resolve a login identifier to an active, non-expired, non-revoked grant."""
    ident = (login_identifier or "").strip().lower()
    if not ident:
        return None
    grant = await db.trustee_grants.find_one(
        {"trustee_username_lower": ident, "revoked_at": None},
        {"_id": 0},
    )
    if not grant:
        return None
    expires_at = grant.get("expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc):
                return None
        except (ValueError, TypeError):
            return None
    return grant


# ─── Endpoints — Benefactor management ────────────────────────────────


@router.get("/trustee/grants")
async def list_grants(current_user: dict = Depends(get_current_user)):
    """Benefactor lists every grant they have ever created."""
    _require_benefactor(current_user)
    rows = (
        await db.trustee_grants.find(
            {"benefactor_id": current_user["id"]},
            {"_id": 0},
        )
        .sort("created_at", -1)
        .to_list(50)
    )
    return {"grants": [_grant_public(r) for r in rows]}


@router.post("/trustee/grants")
async def create_grant(data: TrusteeGrantCreate, current_user: dict = Depends(get_current_user)):
    """Benefactor creates a new trustee credential."""
    _require_benefactor(current_user)
    _validate_username(data.trustee_username)
    uname = data.trustee_username.strip()
    uname_lower = uname.lower()

    # Must NOT collide with an existing user account (we share /login)
    existing_user = await db.users.find_one(
        {"$or": [{"username_lower": uname_lower}, {"email": uname_lower}]},
        {"_id": 0, "id": 1},
    )
    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="That username is already taken by a CarryOn account. Choose a different one.",
        )

    existing_grant = await db.trustee_grants.find_one(
        {"trustee_username_lower": uname_lower, "revoked_at": None},
        {"_id": 0, "id": 1},
    )
    if existing_grant:
        raise HTTPException(status_code=409, detail="A trustee grant with that username already exists.")

    expires_at = _resolve_expiry(data.duration, data.custom_days)
    grant_id = str(uuid.uuid4())
    grant = {
        "id": grant_id,
        "benefactor_id": current_user["id"],
        "trustee_username": uname,
        "trustee_username_lower": uname_lower,
        "trustee_display_name": data.trustee_display_name.strip(),
        "password_hash": hash_password(data.password),
        "include_beneficiaries": bool(data.include_beneficiaries),
        "duration": data.duration,
        "custom_days": data.custom_days if data.duration == "custom" else None,
        "expires_at": expires_at,
        "revoked_at": None,
        "last_used_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.trustee_grants.insert_one(grant)
    logger.info(f"[TMA] Grant created by benefactor={current_user['id']} username={uname}")
    return _grant_public(grant)


@router.patch("/trustee/grants/{grant_id}")
async def update_grant(
    grant_id: str,
    data: TrusteeGrantUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Benefactor toggles beneficiary inclusion, extends expiry, or rotates the password."""
    _require_benefactor(current_user)
    grant = await db.trustee_grants.find_one(
        {"id": grant_id, "benefactor_id": current_user["id"]},
        {"_id": 0},
    )
    if not grant:
        raise HTTPException(status_code=404, detail="Trustee grant not found.")

    updates: dict = {}
    if data.include_beneficiaries is not None:
        updates["include_beneficiaries"] = bool(data.include_beneficiaries)
    if data.duration is not None:
        updates["duration"] = data.duration
        updates["custom_days"] = data.custom_days if data.duration == "custom" else None
        updates["expires_at"] = _resolve_expiry(data.duration, data.custom_days)
    if data.new_password is not None:
        updates["password_hash"] = hash_password(data.new_password)

    if not updates:
        return _grant_public(grant)

    await db.trustee_grants.update_one({"id": grant_id}, {"$set": updates})
    grant.update(updates)
    return _grant_public(grant)


@router.delete("/trustee/grants/{grant_id}")
async def revoke_grant(grant_id: str, current_user: dict = Depends(get_current_user)):
    """Benefactor revokes (soft-deletes) a grant."""
    _require_benefactor(current_user)
    result = await db.trustee_grants.update_one(
        {"id": grant_id, "benefactor_id": current_user["id"], "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Trustee grant not found or already revoked.")
    logger.info(f"[TMA] Grant {grant_id} revoked by benefactor={current_user['id']}")
    return {"revoked": True}


# ─── Endpoints — Undo a trustee mutation ──────────────────────────────


@router.post("/trustee/audit/{event_id}/undo")
async def undo_trustee_event(event_id: str, current_user: dict = Depends(get_current_user)):
    """Restore the pre-mutation snapshot for a trustee-audit event."""
    _require_benefactor(current_user)
    event = await db.trustee_audit_events.find_one(
        {"id": event_id, "benefactor_id": current_user["id"]},
        {"_id": 0},
    )
    if not event:
        raise HTTPException(status_code=404, detail="Audit event not found.")
    if event.get("undone_at"):
        raise HTTPException(status_code=409, detail="This change has already been undone.")
    if not event.get("supports_undo"):
        raise HTTPException(
            status_code=400,
            detail="Automatic undo is unavailable for this change. Manual restore may be required.",
        )

    snapshot = event.get("snapshot_before") or {}
    collection = event.get("collection")
    primary_key = event.get("primary_key", "id")
    pk_value = event.get("primary_key_value")
    if not collection or not pk_value:
        raise HTTPException(
            status_code=400,
            detail="Audit event is incomplete — cannot undo automatically.",
        )

    mongo_collection = db[collection]
    if event.get("operation") == "delete":
        # Re-insert the deleted document. If a doc already exists at the
        # PK, treat it as a replace.
        existing = await mongo_collection.find_one({primary_key: pk_value}, {"_id": 0, primary_key: 1})
        if existing:
            await mongo_collection.replace_one({primary_key: pk_value}, snapshot)
        else:
            await mongo_collection.insert_one(snapshot)
    else:
        # Update / insert: restore the pre-mutation document.
        await mongo_collection.replace_one(
            {primary_key: pk_value},
            snapshot,
            upsert=True,
        )

    await db.trustee_audit_events.update_one(
        {"id": event_id},
        {
            "$set": {
                "undone_at": datetime.now(timezone.utc).isoformat(),
                "undone_by": current_user["id"],
            }
        },
    )
    # Mark the linked notification as resolved.
    notif_id = event.get("notification_id")
    if notif_id:
        await db.notifications.update_one(
            {"id": notif_id, "user_id": current_user["id"]},
            {
                "$set": {
                    "read": True,
                    "read_at": datetime.now(timezone.utc).isoformat(),
                    "undone": True,
                }
            },
        )
    return {"undone": True}


# ─── Audit recorder ───────────────────────────────────────────────────
# Called by the trustee_audit middleware on every successful trustee
# mutation. Records the pre/post snapshot and fires a notification on
# the benefactor's account.


async def record_trustee_mutation(
    *,
    benefactor_id: str,
    grant_id: str,
    trustee_display_name: str,
    method: str,
    path: str,
    collection: str | None,
    primary_key: str,
    primary_key_value: str | None,
    operation: str,
    snapshot_before: dict | None,
    snapshot_after: dict | None,
    summary: str,
    supports_undo: bool,
) -> None:
    """Persist a trustee audit event + create a benefactor notification."""
    event_id = str(uuid.uuid4())
    notif_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.trustee_audit_events.insert_one(
        {
            "id": event_id,
            "benefactor_id": benefactor_id,
            "grant_id": grant_id,
            "trustee_display_name": trustee_display_name,
            "method": method,
            "path": path,
            "collection": collection,
            "primary_key": primary_key,
            "primary_key_value": primary_key_value,
            "operation": operation,
            "snapshot_before": snapshot_before,
            "snapshot_after": snapshot_after,
            "summary": summary,
            "supports_undo": bool(supports_undo and snapshot_before is not None and collection is not None),
            "undone_at": None,
            "undone_by": None,
            "notification_id": notif_id,
            "created_at": now,
        }
    )
    await db.notifications.insert_one(
        {
            "id": notif_id,
            "user_id": benefactor_id,
            "type": "trustee_audit",
            "title": f"Trustee {trustee_display_name} made a change",
            "body": summary,
            "audit_event_id": event_id,
            "supports_undo": bool(supports_undo and snapshot_before is not None and collection is not None),
            "read": False,
            "created_at": now,
        }
    )
