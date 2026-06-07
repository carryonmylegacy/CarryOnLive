"""
SDV deleted-document finality (audit #5391e8b #1).

A soft-deleted document must be unreachable across EVERY SDV pathway — not even
the estate owner or an admin can download, preview, update, lock/unlock, pin, or
AI-enable it. The guard lives in two places, both covered here:
  • Pure: can_access_document() returns False for a deleted doc even for
    owner/admin/beneficiary actors (deleted_at is the first fail-closed check).
  • Integration (env-driven, skips without creds): the direct document routes
    now query {"deleted_at": None} and 404 after delete.
"""

import io
import os
import uuid

import pytest
import requests

from services.access_control import can_access_document


# ── Pure unit: the access-control core ──────────────────────────────────────
DELETED_DOC = {
    "id": "doc-1",
    "estate_id": "est-1",
    "deleted_at": "2026-06-07T00:00:00+00:00",
    "designated_beneficiaries": ["ben-1"],
    "category": "will",
}


@pytest.mark.parametrize(
    "actor",
    [
        {"is_owner": True},
        {"is_admin": True},
        {"is_operator": True},
        {"is_beneficiary": True, "is_transitioned": True, "beneficiary_record_ids": {"ben-1"}},
    ],
)
def test_deleted_document_denied_for_every_actor(actor):
    assert can_access_document(DELETED_DOC, actor) is False


def test_live_document_still_allowed_for_owner():
    live = {**DELETED_DOC, "deleted_at": None}
    assert can_access_document(live, {"is_owner": True}) is True


# ── Integration: the direct document routes 404 after soft-delete ───────────
BASE = (os.environ.get("E2E_BASE_URL") or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
EMAIL = os.environ.get("E2E_BENEFACTOR_EMAIL") or os.environ.get("E2E_ADMIN_EMAIL")
PASSWORD = os.environ.get("E2E_BENEFACTOR_PASSWORD") or os.environ.get("E2E_ADMIN_PASSWORD")
API = f"{BASE}/api" if BASE else None

_integration = pytest.mark.skipif(
    not (BASE and EMAIL and PASSWORD),
    reason="Set E2E_BASE_URL + E2E_BENEFACTOR_EMAIL/_PASSWORD (or E2E_ADMIN_*) to run.",
)


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD, "force_login": True}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def estate_id(headers):
    r = requests.get(f"{API}/estates", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    estates = r.json()
    if not estates:
        pytest.skip("No estates available")
    owned = [e for e in estates if e.get("user_role_in_estate") == "owner" or not e.get("is_beneficiary_estate")]
    return (owned or estates)[0]["id"]


@_integration
def test_deleted_document_routes_return_404(headers, estate_id):
    files = {
        "file": (
            "regression.pdf",
            io.BytesIO(b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
            "application/pdf",
        )
    }
    params = {"estate_id": estate_id, "name": f"ZZ del-doc {uuid.uuid4().hex[:8]}", "category": "other"}
    up = requests.post(f"{API}/documents/upload", headers=headers, params=params, files=files, timeout=30)
    if up.status_code == 403:
        pytest.skip(f"Upload blocked (subscription): {up.text[:120]}")
    assert up.status_code in (200, 201), f"upload failed: {up.status_code} {up.text[:200]}"
    doc_id = up.json().get("id") or up.json().get("document", {}).get("id")
    assert doc_id, f"no document id in response: {up.text[:200]}"

    # Live first.
    assert requests.get(f"{API}/documents/{doc_id}/download", headers=headers, timeout=20).status_code == 200

    # Soft-delete.
    assert requests.delete(f"{API}/documents/{doc_id}", headers=headers, timeout=20).status_code == 200

    # Every privileged pathway must now 404.
    assert requests.get(f"{API}/documents/{doc_id}/download", headers=headers, timeout=20).status_code == 404
    assert requests.get(f"{API}/documents/{doc_id}/preview", headers=headers, timeout=20).status_code == 404
    assert (
        requests.put(f"{API}/documents/{doc_id}", headers=headers, json={"name": "tampered"}, timeout=20).status_code
        == 404
    )
    assert (
        requests.put(
            f"{API}/documents/{doc_id}/pin-offline", headers=headers, params={"pinned": True}, timeout=20
        ).status_code
        == 404
    )
    assert (
        requests.put(
            f"{API}/documents/{doc_id}/ai-eligible", headers=headers, params={"eligible": True}, timeout=20
        ).status_code
        == 404
    )
