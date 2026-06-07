"""CarryOn™ — Token Blacklist for Session Revocation

Provides token revocation capability so that:
- Logout actually invalidates the token server-side
- Password changes invalidate all existing sessions
- Admin can revoke compromised tokens
- Tokens are checked against blacklist on every authenticated request

SOC2 (audit #5391e8b #4): we NEVER persist the raw JWT. Each revoked token is
stored as a SHA-256 hash plus its `jti` (the token's session_id) and an
`expires_at` BSON Date that drives the TTL index (`db_indexes.py` →
token_blacklist.expires_at, expireAfterSeconds=0) so rows self-purge once the
token would have expired anyway.
"""

import hashlib
from datetime import datetime, timedelta, timezone

import jwt

from config import JWT_ALGORITHM, JWT_SECRET, db

# Fallback TTL if a token can't be decoded, so the row is still eventually reaped.
_DEFAULT_TTL_DAYS = 2


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _token_claims(token: str) -> dict:
    """Best-effort decode (ignoring expiry) to extract exp + session_id."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"verify_exp": False})
    except Exception:
        try:
            return jwt.decode(token, options={"verify_signature": False})
        except Exception:
            return {}


async def blacklist_token(token: str, user_id: str, reason: str = "logout"):
    """Revoke a single token. Stores only a SHA-256 hash + jti + expiry."""
    claims = _token_claims(token)
    exp = claims.get("exp")
    if isinstance(exp, (int, float)):
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
    else:
        expires_at = datetime.now(timezone.utc) + timedelta(days=_DEFAULT_TTL_DAYS)
    token_hash = _token_hash(token)
    await db.token_blacklist.update_one(
        {"token_hash": token_hash},
        {
            "$set": {
                "token_hash": token_hash,
                "jti": claims.get("session_id") or "",
                "user_id": user_id,
                "reason": reason,
                "blacklisted_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": expires_at,  # BSON Date → drives the TTL index
            }
        },
        upsert=True,
    )


async def is_token_blacklisted(token: str) -> bool:
    """Fail-closed revocation check. Matches new hash rows AND any legacy
    raw-token rows that haven't been purged yet."""
    token_hash = _token_hash(token)
    entry = await db.token_blacklist.find_one({"$or": [{"token_hash": token_hash}, {"token": token}]})
    return entry is not None


async def purge_legacy_raw_token_rows() -> int:
    """One-shot migration: drop pre-hash rows that stored the raw JWT in
    `token`. The hash rows + TTL index supersede them. Idempotent."""
    result = await db.token_blacklist.delete_many({"token": {"$exists": True}})
    return result.deleted_count


async def revoke_all_user_tokens(user_id: str, reason: str = "password_change"):
    """Mark all tokens for a user as revoked by storing a revocation timestamp."""
    await db.token_revocations.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "revoked_at": datetime.now(timezone.utc).isoformat(),
                "reason": reason,
            }
        },
        upsert=True,
    )


async def is_user_tokens_revoked(user_id: str, token_issued_at: str) -> bool:
    """Check if user's tokens issued before a certain time are revoked."""
    revocation = await db.token_revocations.find_one({"user_id": user_id}, {"_id": 0})
    if not revocation:
        return False
    try:
        revoked_at = datetime.fromisoformat(revocation["revoked_at"])
        issued_at = datetime.fromisoformat(token_issued_at)
        return issued_at < revoked_at
    except Exception:
        return False
