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


async def create_token(user: dict, action: str, params: dict, filename: str) -> str:
    """Create a short-lived download token in MongoDB."""
    token = str(uuid4())
    await db.download_tokens.insert_one(
        {
            "token": token,
            "user": {k: v for k, v in user.items() if k != "_id"},
            "action": action,
            "params": params,
            "filename": filename,
            "created_at": datetime.now(timezone.utc).isoformat(),
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
