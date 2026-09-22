"""Regression — audit hash chain: pre-CAS era is hash-verified, links enforced from the atomic head.

Production held a fork from May 20 2026 (read-latest-then-insert race before the CAS head
shipped June 5 2026). Founder decision Sep 22 2026: report it as a historical fork, not a
break; still catch any content edit anywhere; enforce links from the first CAS-era row.
Runs against a scratch database so the real audit_trail is never touched.
"""

import asyncio
import hashlib
import json
import os
from datetime import datetime, timedelta, timezone

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

from services import audit

GENESIS = "0" * 64
T0 = datetime(2026, 5, 18, 12, 0, 0, tzinfo=timezone.utc)
ANCHOR = datetime(2026, 6, 5, 19, 0, 0, tzinfo=timezone.utc)


def _row(i: int, prev: str, when: datetime, details: str = "{}") -> dict:
    entry = {
        "actor_id": f"u{i}",
        "actor_email": f"u{i}@x.test",
        "actor_role": "admin",
        "action": f"act_{i}",
        "category": "security",
        "resource_type": "t",
        "resource_id": str(i),
        "details": details,
        "ip_address": "",
        "severity": "info",
        "session_id": "",
        "timestamp": when.isoformat(),
        "prev_hash": prev,
    }
    entry["integrity_hash"] = hashlib.sha256(json.dumps(entry, sort_keys=True).encode()).hexdigest()
    entry["stored_at"] = when
    return entry


async def _seed(db, with_head: bool = True):
    await db.audit_trail.delete_many({})
    await db.audit_chain_state.delete_many({})
    await db.audit_repair_queue.delete_many({})
    g = _row(0, GENESIS, T0)
    a = _row(1, g["integrity_hash"], T0 + timedelta(minutes=1))
    b = _row(2, g["integrity_hash"], T0 + timedelta(minutes=2))  # fork twin — same predecessor as `a`
    c = _row(3, b["integrity_hash"], T0 + timedelta(days=2))
    d = _row(4, c["integrity_hash"], ANCHOR + timedelta(seconds=5))  # first CAS-era row
    e = _row(5, d["integrity_hash"], ANCHOR + timedelta(minutes=1))
    rows = [g, a, b, c, d, e]
    await db.audit_trail.insert_many(rows)
    if with_head:
        await db.audit_chain_state.insert_one({"key": "chain_head", "hash": e["integrity_hash"], "created_at": ANCHOR})
    return rows


def _scratch_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], tz_aware=True)
    return client, client["carryon_audit_chain_test"]


def _run(coro):
    return asyncio.run(coro)


def test_precas_fork_reported_not_broken():
    async def _body():
        client, sdb = _scratch_db()
        try:
            await sdb.command("ping")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Mongo unavailable: {e}")
        real_db = audit.db
        audit.db = sdb
        try:
            rows = await _seed(sdb)
            for windowed in (False, True):
                r = await audit.verify_audit_chain(limit=100, latest_window=windowed)
                assert r["ok"] is True, r
                assert r["chain_links_ok"] is True
                assert r["entries_checked"] == 6
                assert r["pre_cas_rows"] == 4
                assert r["historical_forks"] == 1
                assert r["first_fork_at"] == rows[2]["timestamp"]
                assert r["link_enforced_from"] == ANCHOR.isoformat()
        finally:
            audit.db = real_db
            await client.drop_database("carryon_audit_chain_test")

    _run(_body())


def test_precas_content_edit_still_breaks():
    async def _body():
        client, sdb = _scratch_db()
        try:
            await sdb.command("ping")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Mongo unavailable: {e}")
        real_db = audit.db
        audit.db = sdb
        try:
            rows = await _seed(sdb)
            await sdb.audit_trail.update_one({"_id": rows[1]["_id"]}, {"$set": {"details": '{"edited": true}'}})
            r = await audit.verify_audit_chain(limit=100, latest_window=True)
            assert r["ok"] is False
            assert r["chain_links_ok"] is False
            assert r["first_break_id"] == str(rows[1]["_id"])
        finally:
            audit.db = real_db
            await client.drop_database("carryon_audit_chain_test")

    _run(_body())


def test_cas_era_link_break_still_caught():
    async def _body():
        client, sdb = _scratch_db()
        try:
            await sdb.command("ping")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Mongo unavailable: {e}")
        real_db = audit.db
        audit.db = sdb
        try:
            rows = await _seed(sdb)
            # A CAS-era twin (same predecessor as `e`) must be a break, not a "historical fork".
            twin = _row(6, rows[4]["integrity_hash"], ANCHOR + timedelta(minutes=2))
            await sdb.audit_trail.insert_one(twin)
            await sdb.audit_chain_state.update_one({"key": "chain_head"}, {"$set": {"hash": twin["integrity_hash"]}})
            r = await audit.verify_audit_chain(limit=100, latest_window=True)
            assert r["ok"] is False
            assert r["first_break_id"] == str(twin["_id"])
            assert r["historical_forks"] == 1  # only the pre-CAS one
        finally:
            audit.db = real_db
            await client.drop_database("carryon_audit_chain_test")

    _run(_body())


def test_without_anchor_links_enforced_everywhere():
    async def _body():
        client, sdb = _scratch_db()
        try:
            await sdb.command("ping")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Mongo unavailable: {e}")
        real_db = audit.db
        audit.db = sdb
        try:
            rows = await _seed(sdb, with_head=False)
            r = await audit.verify_audit_chain(limit=100, latest_window=False)
            assert r["chain_links_ok"] is False
            assert r["first_break_id"] == str(rows[2]["_id"])
            assert r["link_enforced_from"] is None
            assert r["historical_forks"] == 0
        finally:
            audit.db = real_db
            await client.drop_database("carryon_audit_chain_test")

    _run(_body())
