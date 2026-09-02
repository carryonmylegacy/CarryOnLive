"""Erasure manifest drift guard (pre-push fast suite).

Fails when a collection that carries personal data exists in the live database, or is
written anywhere under routes/ or services/, without an entry in
services/erasure_manifest.py. This is how "orphans cannot recur": a new collection
cannot ship unless someone has decided what erasure does to it. ~1s, read-only.
"""

import glob
import os
import re
import sys

import pytest
from dotenv import load_dotenv
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"))

from services import erasure_manifest as m  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COVERED = m.covered_collections()
WRITE_RE = re.compile(
    r"db\.([a-z_0-9]+)\.(?:insert_one|insert_many|update_one|update_many|replace_one|find_one_and_update|bulk_write)\("
)


def _code_written_personal() -> dict:
    """collection -> file for every code write whose payload names a personal key."""
    found = {}
    files = glob.glob("/app/backend/routes/**/*.py", recursive=True) + glob.glob(
        "/app/backend/services/**/*.py", recursive=True
    )
    for f in files:
        with open(f, encoding="utf-8") as fh:
            src = fh.read()
        for match in WRITE_RE.finditer(src):
            coll = match.group(1)
            window = src[match.end() : match.end() + 1600]
            if any(f'"{k}"' in window for k in m.PERSONAL_KEYS):
                found.setdefault(coll, os.path.relpath(f, ROOT))
    return found


def test_every_code_written_personal_collection_is_in_manifest():
    missing = {c: f for c, f in _code_written_personal().items() if c not in COVERED}
    assert not missing, f"Collections written with personal keys but absent from erasure_manifest: {missing}"


def test_every_live_personal_collection_is_in_manifest():
    url = os.environ.get("MONGO_URL")
    if not url:
        pytest.skip("no MONGO_URL")
    client = MongoClient(url, serverSelectionTimeoutMS=1500)
    try:
        client.admin.command("ping")
    except Exception:
        pytest.skip("database unreachable (CI) — live check runs in the preview fast suite")
    db = client[os.environ["DB_NAME"]]
    missing = []
    for c in db.list_collection_names():
        if c.startswith("system.") or c.startswith("scratch_") or c in COVERED:
            continue
        if db[c].find_one({"$or": [{k: {"$exists": True}} for k in m.PERSONAL_KEYS]}, {"_id": 1}):
            missing.append(c)
    assert not missing, f"Live collections carrying personal keys but absent from erasure_manifest: {sorted(missing)}"


def test_manifest_entries_are_disjoint_and_well_formed():
    delete_sets = [set(m.ESTATE_DELETE), set(m.USER_DELETE), set(m.USER_DELETE_VIA_PARENT)]
    for name, entry in m.ANONYMISE.items():
        assert entry.get("match"), name
        assert entry.get("unset") or entry.get("set") or entry.get("hash"), name
    for name, entry in m.RETAIN.items():
        assert entry["period_days"] > 0 and "GDPR" in entry["basis"], name
    # a collection may be both estate- and user-deleted, but never deleted AND retained
    deleted = set().union(*delete_sets)
    overlap = deleted & set(m.RETAIN)
    assert not overlap, f"Deleted and retained at once: {overlap}"
    assert not (deleted & m.NO_PII), deleted & m.NO_PII


@pytest.mark.parametrize(
    "coll",
    ["chat_history", "beneficiary_concierge_messages", "digital_wallet", "binder_shares", "documents", "activity_log"],
)
def test_high_exposure_collections_are_deleted_on_estate_erasure(coll):
    assert coll in m.ESTATE_DELETE
