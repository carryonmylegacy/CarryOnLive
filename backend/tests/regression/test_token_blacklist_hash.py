"""
Token blacklist must never persist the raw JWT (audit #5391e8b #4) — only a
SHA-256 hash + jti + expires_at. Pure checks always run; the DB round-trip
skips cleanly if Mongo isn't reachable.
"""

import asyncio
import hashlib
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from config import JWT_ALGORITHM, JWT_SECRET
from services import token_blacklist as tb


def _make_token(session_id="sess-abc", hours=1):
    payload = {
        "user_id": "u-1",
        "session_id": session_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=hours),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def test_token_hash_is_sha256_and_not_raw():
    token = _make_token()
    h = tb._token_hash(token)
    assert h == hashlib.sha256(token.encode()).hexdigest()
    assert token not in h and len(h) == 64


def test_claims_extracts_session_id_and_exp():
    token = _make_token(session_id="sess-xyz")
    claims = tb._token_claims(token)
    assert claims.get("session_id") == "sess-xyz"
    assert isinstance(claims.get("exp"), (int, float))


def test_blacklist_round_trip_stores_hash_not_raw():
    token = _make_token(session_id="sess-rt")

    async def _body():
        from config import db

        try:
            await db.token_blacklist.delete_many({"jti": "sess-rt"})
        except Exception as e:  # Mongo unreachable in this environment
            pytest.skip(f"Mongo unavailable: {e}")
        await tb.blacklist_token(token, user_id="u-1", reason="logout")
        row = await db.token_blacklist.find_one({"token_hash": tb._token_hash(token)})
        assert row is not None, "blacklist row not written"
        assert "token" not in row, "raw JWT must NOT be stored"
        assert row.get("jti") == "sess-rt"
        assert isinstance(row.get("expires_at"), datetime)
        assert await tb.is_token_blacklisted(token) is True
        assert await tb.is_token_blacklisted(_make_token(session_id="other")) is False
        await db.token_blacklist.delete_many({"jti": "sess-rt"})

    asyncio.run(_body())
