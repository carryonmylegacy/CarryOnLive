"""Hotfix guard — admins/founders never receive DAV secret fields (Sep 2026).

Runs the two DAV-secret-bearing handlers (`GET /digital-wallet/{estate_id}` and
`GET /financial/entities/beneficiary-view/{estate_id}`) in a subprocess bound to a
throwaway scratch database, for four callers: owner, post-transition beneficiary, an
admin who does not own the estate, and an admin who does. `decrypt_field` is replaced
with a deterministic fake so the JSON is independent of ENCRYPTION_KEY.

Golden files under golden/dav_admin_plaintext/ were captured from the PRE-hotfix code
(main@12736374) with identical fixtures, so owner and beneficiary equality here is a
byte-identical before/after proof, not a shape check. Preview data is never touched.
"""

import json
import os
import subprocess
import sys
import uuid

import pytest
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")

GOLDEN = os.path.join(os.path.dirname(__file__), "golden", "dav_admin_plaintext")
SECRET_KEYS = {"password", "additional_access", "encrypted_password", "encrypted_additional"}

OWNER_ID = "owner-0000-0000-0000-000000000001"
ADMIN_ID = "admin-0000-0000-0000-000000000002"
BEN_USER_ID = "benuser-0000-0000-0000-00000000003"
BEN_REC_ID = "benrec-0000-0000-0000-000000000004"
ESTATE_ID = "estate-0000-0000-0000-00000000000a"
ENTITY_ID = "entity-0000-0000-0000-00000000000b"

RUNNER = f"""
import asyncio, json, sys
sys.path.insert(0, "/app/backend")
import routes.digital_wallet as dw
import routes.financial_portal.entities_share as es
fake = lambda ct, salt: f"PT<{{ct}}>"
dw.decrypt_field = fake
es.decrypt_field = fake
E = {ESTATE_ID!r}
OWNER = {{"id": {OWNER_ID!r}, "email": "owner@carryontest.io", "role": "benefactor", "name": "Owner", "email_verified": True}}
ADMIN = {{"id": {ADMIN_ID!r}, "email": "admin@carryontest.io", "role": "admin", "name": "Admin", "email_verified": True}}
BEN = {{"id": {BEN_USER_ID!r}, "email": "ben@carryontest.io", "role": "beneficiary", "name": "Ben", "email_verified": True}}
ADMIN_OWNER = {{**OWNER, "role": "admin"}}
async def main():
    out = {{}}
    for label, user in (("owner", OWNER), ("beneficiary", BEN), ("admin", ADMIN), ("admin_owner", ADMIN_OWNER)):
        out["wallet_" + label] = await dw.get_digital_wallet(E, None, user)
        out["entities_" + label] = await es.get_entities_beneficiary_view(E, user)
    return out
print("RESULT " + json.dumps(asyncio.run(main()), sort_keys=True, default=str))
"""


def _seed(db):
    db.estates.insert_one(
        {
            "id": ESTATE_ID,
            "name": "Fixture Estate",
            "owner_id": OWNER_ID,
            "status": "transitioned",
            "beneficiaries": [BEN_USER_ID],
            "encryption_salt": "11" * 32,
            "entities_share": {"show_now": False, "now_beneficiary_ids": []},
        }
    )
    db.beneficiaries.insert_one(
        {
            "id": BEN_REC_ID,
            "estate_id": ESTATE_ID,
            "user_id": BEN_USER_ID,
            "email": "ben@carryontest.io",
            "first_name": "Ben",
            "last_name": "Fixture",
            "deleted_at": None,
        }
    )
    db.cfp_entities.insert_one(
        {"id": ENTITY_ID, "estate_id": ESTATE_ID, "name": "Fixture LLC", "deleted_at": None, "document_ids": []}
    )
    db.digital_wallet.insert_many(
        [
            {
                "id": "dav-1",
                "estate_id": ESTATE_ID,
                "account_name": "Bank",
                "login_username": "owner-login",
                "encrypted_password": "CT-bank-pass",
                "encrypted_additional": "CT-bank-2fa",
                "additional_access": None,
                "notes": "main account",
                "assigned_beneficiary_id": BEN_REC_ID,
                "assigned_beneficiary_name": "Ben Fixture",
                "category": "banking",
                "linked_entity_id": ENTITY_ID,
                "beneficiary_visibility": "posthumous_only",
                "created_at": "2026-01-01T00:00:00+00:00",
                "deleted_at": None,
            },
            {
                "id": "dav-2",
                "estate_id": ESTATE_ID,
                "account_name": "Email",
                "login_username": "owner@mail",
                "encrypted_password": "CT-mail-pass",
                "additional_access": None,
                "notes": None,
                "assigned_beneficiary_id": None,
                "assigned_beneficiary_name": None,
                "category": "email",
                "linked_entity_id": None,
                "beneficiary_visibility": "private",
                "created_at": "2026-01-02T00:00:00+00:00",
                "deleted_at": None,
            },
            {
                # Pre-encryption row: secrets stored in clear in the row itself.
                "id": "dav-3",
                "estate_id": ESTATE_ID,
                "account_name": "Legacy plaintext row",
                "login_username": "legacy",
                "password": "PLAINTEXT-LEGACY",
                "encrypted_password": None,
                "additional_access": "LEGACY-PIN",
                "notes": "pre-encryption row",
                "assigned_beneficiary_id": BEN_REC_ID,
                "assigned_beneficiary_name": "Ben Fixture",
                "category": "other",
                "linked_entity_id": ENTITY_ID,
                "beneficiary_visibility": "show_now",
                "created_at": "2026-01-03T00:00:00+00:00",
                "deleted_at": None,
            },
        ]
    )


def _golden(name):
    with open(os.path.join(GOLDEN, f"{name}.json")) as fh:
        return json.load(fh)


def _keys(obj, found=None):
    found = set() if found is None else found
    if isinstance(obj, dict):
        for k, v in obj.items():
            found.add(k)
            _keys(v, found)
    elif isinstance(obj, list):
        for v in obj:
            _keys(v, found)
    return found


def _without_secrets(obj):
    if isinstance(obj, dict):
        return {k: _without_secrets(v) for k, v in obj.items() if k not in SECRET_KEYS}
    if isinstance(obj, list):
        return [_without_secrets(v) for v in obj]
    return obj


@pytest.fixture(scope="module")
def world():
    url = os.environ.get("MONGO_URL")
    if not url:
        pytest.skip("no MONGO_URL")
    name = f"scratch_dav_admin_{uuid.uuid4().hex[:8]}"
    client = MongoClient(url, serverSelectionTimeoutMS=3000)
    try:
        client.admin.command("ping")
    except Exception:
        pytest.skip("database unreachable")
    db = client[name]
    _seed(db)
    env = {**os.environ, "DB_NAME": name}
    p = subprocess.run(
        [sys.executable, "-c", RUNNER], cwd="/app/backend", env=env, capture_output=True, text=True, timeout=240
    )
    assert p.returncode == 0, p.stdout[-2000:] + p.stderr[-4000:]
    line = next(ln for ln in p.stdout.splitlines() if ln.startswith("RESULT "))
    out = json.loads(line[len("RESULT ") :])
    audit = list(db.audit_trail.find({}, {"_id": 0, "action": 1, "actor_id": 1, "actor_role": 1, "details": 1}))
    client.drop_database(name)
    yield {"out": out, "audit": audit}


# (b) owner and visible-beneficiary responses are byte-identical to the pre-hotfix goldens.
@pytest.mark.parametrize("name", ["wallet_owner", "wallet_beneficiary", "entities_owner", "entities_beneficiary"])
def test_owner_and_beneficiary_responses_unchanged(world, name):
    assert json.dumps(world["out"][name], sort_keys=True) == json.dumps(_golden(name), sort_keys=True)


# Admin who OWNS the estate stays on the owner path — proven against the owner golden.
@pytest.mark.parametrize("route", ["wallet", "entities"])
def test_admin_owner_is_identical_to_owner(world, route):
    assert json.dumps(world["out"][f"{route}_admin_owner"], sort_keys=True) == json.dumps(
        _golden(f"{route}_owner"), sort_keys=True
    )


# (a) admin/founder responses contain no secret field anywhere, on both routes, legacy plaintext rows included.
def test_admin_wallet_has_no_secret_keys(world):
    wallet = world["out"]["wallet_admin"]
    assert {e["id"] for e in wallet} == {"dav-1", "dav-2", "dav-3"}
    assert not (_keys(wallet) & SECRET_KEYS), sorted(_keys(wallet) & SECRET_KEYS)
    assert wallet == _without_secrets(_golden("wallet_owner"))


def test_admin_entities_view_has_no_secret_keys(world):
    view = world["out"]["entities_admin"]
    assert {c["id"] for c in view["credentials"]} == {"dav-1", "dav-3"}
    assert not (_keys(view) & SECRET_KEYS), sorted(_keys(view) & SECRET_KEYS)
    assert view == _without_secrets(_golden("entities_owner"))


def test_plaintext_values_never_appear_in_admin_payloads(world):
    blob = json.dumps(world["out"]["wallet_admin"]) + json.dumps(world["out"]["entities_admin"])
    for needle in ("PT<", "CT-bank", "CT-mail", "PLAINTEXT-LEGACY", "LEGACY-PIN"):
        assert needle not in blob, needle


# (4) audit — admin strips are recorded; owner audit details are unchanged.
def test_audit_rows(world):
    rows = world["audit"]
    admin_views = [r for r in rows if r["action"] == "digital_wallet_view" and r["actor_id"] == ADMIN_ID]
    assert admin_views and all(json.loads(r["details"]).get("secrets_stripped") is True for r in admin_views)
    owner_views = [r for r in rows if r["action"] == "digital_wallet_view" and r["actor_id"] == OWNER_ID]
    assert owner_views and all(json.loads(r["details"]) == {"entry_count": 3} for r in owner_views)
    stripped = [r for r in rows if r["action"] == "digital_wallet.admin_secrets_stripped"]
    assert len(stripped) == 1 and stripped[0]["actor_id"] == ADMIN_ID
    assert json.loads(stripped[0]["details"])["entry_count"] == 2
