"""
Regression: milestone-message media pathways (audit #50f324c).

Covers two fixes:
  • P1 — voice playback storage-key mismatch. Voice blobs are stored
    estate-scoped (estates/{estate_id}/{voice_id}); the GET route used to
    download voices/{voice_id} and 404'd every newly-created voice milestone.
  • P2 — soft-deleted messages must be unreachable / unmodifiable via the
    privileged direct + mutation routes (owner/admin/operator bypass
    can_access_message): /download, /attachment GET, PUT, upload-attachment.

Credential-free (env-driven) so it is safe to commit and runs in CI once the
E2E_* variables are configured; SKIPS cleanly otherwise. Self-cleaning — only
touches throwaway messages it creates and then soft-deletes.

Env:
  E2E_BASE_URL (or REACT_APP_BACKEND_URL)
  E2E_BENEFACTOR_EMAIL / _PASSWORD  (preferred), or E2E_ADMIN_EMAIL / _PASSWORD
"""

import base64
import os
import uuid

import pytest
import requests

BASE = (os.environ.get("E2E_BASE_URL") or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
EMAIL = os.environ.get("E2E_BENEFACTOR_EMAIL") or os.environ.get("E2E_ADMIN_EMAIL")
PASSWORD = os.environ.get("E2E_BENEFACTOR_PASSWORD") or os.environ.get("E2E_ADMIN_PASSWORD")
API = f"{BASE}/api" if BASE else None

pytestmark = pytest.mark.skipif(
    not (BASE and EMAIL and PASSWORD),
    reason="Set E2E_BASE_URL + E2E_BENEFACTOR_EMAIL/_PASSWORD (or E2E_ADMIN_*) to run.",
)


@pytest.fixture(scope="module")
def headers():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD, "force_login": True}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def estate_id(headers):
    r = requests.get(f"{API}/estates", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    estates = r.json()
    if not estates:
        pytest.skip("No estates available for the configured account")
    owned = [e for e in estates if e.get("user_role_in_estate") == "owner" or not e.get("is_beneficiary_estate")]
    return (owned or estates)[0]["id"]


def _create(headers, estate_id, **extra):
    body = {
        "estate_id": estate_id,
        "title": f"ZZ media-pathway {uuid.uuid4().hex[:8]}",
        "content": "regression fixture — safe to delete",
        "trigger_type": "immediate",
        **extra,
    }
    r = requests.post(f"{API}/messages", headers=headers, json=body, timeout=30)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    return r.json()


# ── Issue 1: voice playback works (estate-scoped key) ───────────────────────
def test_voice_milestone_playback_succeeds(headers, estate_id):
    voice_b64 = base64.b64encode(b"\x1aE\xdf\xa3carryon-regression-voice").decode("ascii")
    msg = _create(headers, estate_id, message_type="voice", voice_data=voice_b64)
    voice_url = msg.get("voice_url")
    assert voice_url, f"no voice_url on created voice message: {msg}"
    try:
        r = requests.get(f"{API}/messages/voice/{voice_url}", headers=headers, timeout=20)
        assert r.status_code == 200, f"voice playback should be 200, got {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("audio/"), r.headers.get("content-type")
    finally:
        requests.delete(f"{API}/messages/{msg['id']}", headers=headers, timeout=20)


# ── Issue 2: deleted messages blocked on privileged pathways ────────────────
def test_deleted_text_download_returns_404(headers, estate_id):
    msg = _create(headers, estate_id, message_type="text")
    assert requests.get(f"{API}/messages/{msg['id']}/download", headers=headers, timeout=20).status_code == 200
    assert requests.delete(f"{API}/messages/{msg['id']}", headers=headers, timeout=20).status_code == 200
    gone = requests.get(f"{API}/messages/{msg['id']}/download", headers=headers, timeout=20)
    assert gone.status_code == 404, f"deleted text still downloadable: {gone.status_code} {gone.text[:200]}"


def test_deleted_message_attachment_download_returns_404(headers, estate_id):
    msg = _create(headers, estate_id, message_type="text")
    files = {"file": ("note.txt", b"regression attachment bytes", "text/plain")}
    up = requests.post(
        f"{API}/messages/{msg['id']}/upload-attachment",
        headers={"Authorization": headers["Authorization"]},
        files=files,
        timeout=30,
    )
    assert up.status_code == 200, f"attachment upload failed: {up.status_code} {up.text[:200]}"
    assert requests.get(f"{API}/messages/{msg['id']}/attachment", headers=headers, timeout=20).status_code == 200
    assert requests.delete(f"{API}/messages/{msg['id']}", headers=headers, timeout=20).status_code == 200
    gone = requests.get(f"{API}/messages/{msg['id']}/attachment", headers=headers, timeout=20)
    assert gone.status_code == 404, f"deleted attachment still downloadable: {gone.status_code} {gone.text[:200]}"


def test_edit_deleted_message_returns_404(headers, estate_id):
    msg = _create(headers, estate_id, message_type="text")
    assert requests.delete(f"{API}/messages/{msg['id']}", headers=headers, timeout=20).status_code == 200
    edit = requests.put(
        f"{API}/messages/{msg['id']}",
        headers=headers,
        json={"title": "tampered after delete", "content": "should be rejected"},
        timeout=20,
    )
    assert edit.status_code == 404, f"deleted message still editable: {edit.status_code} {edit.text[:200]}"


def test_upload_attachment_to_deleted_message_returns_404(headers, estate_id):
    msg = _create(headers, estate_id, message_type="text")
    assert requests.delete(f"{API}/messages/{msg['id']}", headers=headers, timeout=20).status_code == 200
    files = {"file": ("late.txt", b"too late", "text/plain")}
    up = requests.post(
        f"{API}/messages/{msg['id']}/upload-attachment",
        headers={"Authorization": headers["Authorization"]},
        files=files,
        timeout=30,
    )
    assert up.status_code == 404, f"upload to deleted message allowed: {up.status_code} {up.text[:200]}"
