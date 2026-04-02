"""Universal download token system for iOS PWA-compatible file downloads.

Creates short-lived tokens that allow unauthenticated GET requests to serve
files with Content-Disposition: attachment — triggering the native iOS download tile.
"""

from datetime import datetime, timezone
from uuid import uuid4

_tokens: dict[str, dict] = {}

TOKEN_TTL_SECONDS = 300  # 5 minutes


def create_token(user: dict, action: str, params: dict, filename: str) -> str:
    """Create a short-lived download token."""
    token = str(uuid4())
    _tokens[token] = {
        "user": {k: v for k, v in user.items() if k != "_id"},
        "action": action,
        "params": params,
        "filename": filename,
        "created_at": datetime.now(timezone.utc),
    }
    _cleanup_expired()
    return token


def consume_token(token: str) -> dict | None:
    """Validate and consume a download token (one-time use)."""
    data = _tokens.pop(token, None)
    if not data:
        return None
    age = (datetime.now(timezone.utc) - data["created_at"]).total_seconds()
    if age > TOKEN_TTL_SECONDS:
        return None
    return data


def _cleanup_expired():
    """Remove expired tokens from memory."""
    cutoff = datetime.now(timezone.utc).timestamp() - TOKEN_TTL_SECONDS
    expired = [k for k, v in _tokens.items() if v["created_at"].timestamp() < cutoff]
    for k in expired:
        del _tokens[k]
