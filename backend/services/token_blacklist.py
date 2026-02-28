"""CarryOn™ — Token Blacklist for Session Revocation (SOC 2 Compliance Pending)

Provides token revocation capability so that:
- Logout actually invalidates the token server-side
- Password changes invalidate all existing sessions
- Admin can revoke compromised tokens
- Tokens are checked against blacklist on every authenticated request

Uses MongoDB with TTL index for automatic cleanup.
"""

from datetime import datetime, timezone

from config import db


async def blacklist_token(token: str, user_id: str, reason: str = "logout"):
    """Add a token to the blacklist."""
    await db.token_blacklist.insert_one(
        {
            "token": token,
            "user_id": user_id,
            "reason": reason,
            "blacklisted_at": datetime.now(timezone.utc).isoformat(),
        }
    )


async def is_token_blacklisted(token: str) -> bool:
    """Check if a token has been revoked."""
    entry = await db.token_blacklist.find_one({"token": token})
    return entry is not None


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
    revocation = await db.token_revocations.find_one(
        {"user_id": user_id}, {"_id": 0}
    )
    if not revocation:
        return False
    try:
        revoked_at = datetime.fromisoformat(revocation["revoked_at"])
        issued_at = datetime.fromisoformat(token_issued_at)
        return issued_at < revoked_at
    except Exception:
        return False
