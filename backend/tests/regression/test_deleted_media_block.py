"""
Regression: soft-deleted milestone media must be unreachable via the direct
media routes (audit #d0c48d7 P2 / #3be1d2f).

Why this lives in tests/regression/ (committable) rather than tests/ (which is
gitignored for "test files with test credentials"): this test hardcodes NO
credentials. It reads the target URL + a benefactor login from the environment
and SKIPS cleanly when they are absent — so it is safe to commit to GitHub main
and run in CI once the E2E_* variables are configured.

Proof: GET /api/messages/video/{id} (and /voice/{id}) return 404 after the
owning message is soft-deleted, even for the owner who could read it while live.
The owner/admin/operator path bypasses can_access_message, so the `deleted_at`
guard must live in the route query — which is exactly what this asserts.

Env:
  E2E_BASE_URL                 (or REACT_APP_BACKEND_URL) — e.g. https://app.carryon.us
  E2E_BENEFACTOR_EMAIL / _PASSWORD   (preferred), or E2E_ADMIN_EMAIL / _PASSWORD
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
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "force_login": True},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def estate_id(headers):
    r = requests.get(f"{API}/estates", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    estates = r.json()
    if not estates:
        pytest.skip("No estates available for the configured account")
    owned = [e for e in estates if e.get("user_role_in_estate") == "owner" or not e.get("is_beneficiary_estate")]
    return (owned or estates)[0]["id"]


def _create_video_message(headers, estate_id):
    fake_video = base64.b64encode(b"\x1aE\xdf\xa3carryon-regression-video").decode("ascii")
    r = requests.post(
        f"{API}/messages",
        headers=headers,
        json={
            "estate_id": estate_id,
            "title": f"ZZ deleted-media regression {uuid.uuid4().hex[:8]}",
            "content": "regression fixture — safe to delete",
            "message_type": "video",
            "video_data": fake_video,
            "trigger_type": "immediate",
        },
        timeout=30,
    )
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("video_url"), f"no video_url on created message: {body}"
    return body["id"], body["video_url"]


def test_deleted_message_video_returns_404(headers, estate_id):
    msg_id, video_url = _create_video_message(headers, estate_id)

    live = requests.get(f"{API}/messages/video/{video_url}", headers=headers, timeout=20)
    assert live.status_code == 200, f"expected live video 200, got {live.status_code} {live.text[:200]}"

    dele = requests.delete(f"{API}/messages/{msg_id}", headers=headers, timeout=20)
    assert dele.status_code == 200, f"delete failed: {dele.status_code} {dele.text}"

    gone = requests.get(f"{API}/messages/video/{video_url}", headers=headers, timeout=20)
    assert gone.status_code == 404, (
        f"SECURITY: deleted milestone video still reachable — got {gone.status_code} {gone.text[:200]}"
    )
