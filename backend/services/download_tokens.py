"""Universal download token system for iOS PWA-compatible file downloads.

Creates short-lived tokens that allow unauthenticated GET requests to serve
files with Content-Disposition: attachment — triggering the native iOS download tile.

Tokens are stored in MongoDB so they survive backend restarts and work
across multiple Render instances.
"""

from datetime import datetime, timezone
from uuid import uuid4

from config import db

TOKEN_TTL_SECONDS = 300  # 5 minutes

# Data minimization (SOC2 / privacy): a download token only needs the caller's
# identity + role to re-authorize the download on consume. Never persist the
# full user document (password hash, OTP state, offline-credential metadata,
# etc.) into db.download_tokens.
_TOKEN_USER_FIELDS = (
    "id",
    "email",
    "email_verified",
    "role",
    "name",
    "admin_scope",
    "operator_role",
    "is_also_benefactor",
    "is_also_beneficiary",
)


def _minimal_user_snapshot(user: dict) -> dict:
    return {k: user.get(k) for k in _TOKEN_USER_FIELDS if k in user}


async def create_token(user: dict, action: str, params: dict, filename: str) -> str:
    """Create a short-lived download token in MongoDB."""
    token = str(uuid4())
    now = datetime.now(timezone.utc)
    await db.download_tokens.insert_one(
        {
            "token": token,
            "user": _minimal_user_snapshot(user),
            "action": action,
            "params": params,
            "filename": filename,
            "created_at": now.isoformat(),
            # Real BSON datetime so the Mongo TTL index can auto-expire rows even
            # if the inline cleanup below never runs (multi-pod safety).
            "expires_at": now,
        }
    )
    # Background cleanup of expired tokens
    cutoff = datetime.now(timezone.utc).timestamp() - TOKEN_TTL_SECONDS
    cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
    await db.download_tokens.delete_many({"created_at": {"$lt": cutoff_iso}})
    return token


async def consume_token(token: str) -> dict | None:
    """Validate and consume a download token (one-time use)."""
    data = await db.download_tokens.find_one_and_delete({"token": token}, {"_id": 0})
    if not data:
        return None
    created = data.get("created_at", "")
    if isinstance(created, str):
        created_dt = datetime.fromisoformat(created)
    else:
        created_dt = created
    age = (datetime.now(timezone.utc) - created_dt).total_seconds()
    if age > TOKEN_TTL_SECONDS:
        return None
    return data
