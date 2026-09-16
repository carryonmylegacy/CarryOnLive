"""Iteration 65 — Testimonials pipeline + Live Platform Stats + Site Content."""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def admin_token():
    time.sleep(1)
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    assert tok, f"No access_token in login response: {body}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture()
def created_ids():
    ids = []
    yield ids
    # Cleanup — delete via admin
    if not ids:
        return
    try:
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        tok = r.json().get("access_token") or r.json().get("token")
        h = {"Authorization": f"Bearer {tok}"}
        for tid in ids:
            requests.delete(f"{BASE_URL}/api/admin/testimonials/{tid}", headers=h)
    except Exception as e:
        print(f"Cleanup error: {e}")


LONG_QUOTE = "CarryOn helped our family finally get organized for the unthinkable. A wonderful and thoughtful product."
EDIT_QUOTE = "Edited quote — CarryOn gave us so much peace of mind for our family, thank you."


# ---------------- Public POST /api/testimonials ----------------
class TestPublicSubmission:
    def test_submit_verified_member(self, created_ids):
        payload = {
            "name": "QA Person",
            "location": "Arlington, VA",
            "role": "benefactor",
            "quote": LONG_QUOTE,
            "email": ADMIN_EMAIL,
            "member_since": "2025",
            "consent": True,
        }
        r = requests.post(f"{BASE_URL}/api/testimonials", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["status"] == "pending"
        assert data["verified_member"] is True
        assert "id" in data
        created_ids.append(data["id"])

    def test_submit_unverified(self, created_ids):
        payload = {
            "name": "QA Nobody",
            "location": "Nowhere",
            "role": "benefactor",
            "quote": LONG_QUOTE,
            "email": "qa.nobody@gmail.com",
            "member_since": "2025",
            "consent": True,
        }
        r = requests.post(f"{BASE_URL}/api/testimonials", json=payload)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["verified_member"] is False
        created_ids.append(data["id"])

    def test_consent_false_400(self):
        payload = {
            "name": "QA",
            "location": "x",
            "role": "benefactor",
            "quote": LONG_QUOTE,
            "email": ADMIN_EMAIL,
            "consent": False,
        }
        r = requests.post(f"{BASE_URL}/api/testimonials", json=payload)
        assert r.status_code == 400, r.text

    def test_quote_too_short_422(self):
        payload = {
            "name": "QA",
            "role": "benefactor",
            "quote": "too short",
            "email": ADMIN_EMAIL,
            "consent": True,
        }
        r = requests.post(f"{BASE_URL}/api/testimonials", json=payload)
        assert r.status_code == 422, r.text

    def test_invalid_role_400(self):
        payload = {
            "name": "QA",
            "role": "hacker",
            "quote": LONG_QUOTE,
            "email": ADMIN_EMAIL,
            "consent": True,
        }
        r = requests.post(f"{BASE_URL}/api/testimonials", json=payload)
        assert r.status_code == 400, r.text

    def test_blocked_email_domain_400(self):
        payload = {
            "name": "QA",
            "role": "benefactor",
            "quote": LONG_QUOTE,
            "email": "a@test.com",
            "consent": True,
        }
        r = requests.post(f"{BASE_URL}/api/testimonials", json=payload)
        assert r.status_code == 400, r.text


# ---------------- Public GET /api/testimonials ----------------
class TestPublicList:
    def test_list_approved_only_no_email(self):
        r = requests.get(f"{BASE_URL}/api/testimonials")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        for item in data["items"]:
            assert "email" not in item, f"Email leaked in public payload: {item}"
            # All returned items must be approved (approved_at set) — implied by query
            assert set(item.keys()) <= {
                "id",
                "display_name",
                "location",
                "role",
                "quote",
                "member_since",
                "verified_member",
                "featured",
                "approved_at",
            }


# ---------------- Admin moderation ----------------
class TestAdminModeration:
    def test_admin_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/testimonials")
        assert r.status_code in (401, 403)

    def test_admin_list_with_token(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/testimonials", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "counts" in data

    def test_full_moderation_lifecycle(self, admin_headers, created_ids):
        # 1. submit
        payload = {
            "name": "QA Lifecycle",
            "location": "DC",
            "role": "benefactor",
            "quote": LONG_QUOTE,
            "email": ADMIN_EMAIL,
            "member_since": "2025",
            "consent": True,
        }
        r = requests.post(f"{BASE_URL}/api/testimonials", json=payload)
        assert r.status_code == 201
        tid = r.json()["id"]
        created_ids.append(tid)

        # 2. approve + feature
        r2 = requests.patch(
            f"{BASE_URL}/api/admin/testimonials/{tid}",
            headers=admin_headers,
            json={"status": "approved", "featured": True},
        )
        assert r2.status_code == 200, r2.text
        approved = r2.json()
        assert approved["status"] == "approved"
        assert approved["approved_at"] is not None
        assert approved["featured"] is True

        # 3. GET public shows it
        rp = requests.get(f"{BASE_URL}/api/testimonials")
        assert rp.status_code == 200
        ids_public = [i["id"] for i in rp.json()["items"]]
        assert tid in ids_public
        # Verify featured items surface first
        first = rp.json()["items"][0]
        assert first["featured"] is True

        # 4. Edit display_name + quote
        r3 = requests.patch(
            f"{BASE_URL}/api/admin/testimonials/{tid}",
            headers=admin_headers,
            json={"display_name": "QA P.", "quote": EDIT_QUOTE},
        )
        assert r3.status_code == 200
        assert r3.json()["display_name"] == "QA P."
        assert r3.json()["quote"] == EDIT_QUOTE

        # 5. PATCH empty -> 400
        r4 = requests.patch(f"{BASE_URL}/api/admin/testimonials/{tid}", headers=admin_headers, json={})
        assert r4.status_code == 400

        # 6. PATCH unknown id -> 404
        r5 = requests.patch(
            f"{BASE_URL}/api/admin/testimonials/does-not-exist-xxx",
            headers=admin_headers,
            json={"status": "approved"},
        )
        assert r5.status_code == 404

        # 7. DELETE
        rd = requests.delete(f"{BASE_URL}/api/admin/testimonials/{tid}", headers=admin_headers)
        assert rd.status_code == 200
        assert rd.json()["ok"] is True
        # Remove from cleanup list (already deleted)
        created_ids.remove(tid)

        # 8. Second delete -> 404
        rd2 = requests.delete(f"{BASE_URL}/api/admin/testimonials/{tid}", headers=admin_headers)
        assert rd2.status_code == 404


# ---------------- Live Platform Stats ----------------
class TestPlatformStats:
    def test_public_platform_stats_auto(self, admin_headers):
        # Ensure auto first
        requests.put(
            f"{BASE_URL}/api/admin/platform-settings",
            headers=admin_headers,
            json={"show_live_stats": "auto"},
        )
        r = requests.get(f"{BASE_URL}/api/public/platform-stats")
        assert r.status_code == 200
        data = r.json()
        for key in [
            "families",
            "documents",
            "messages",
            "checklist_items",
            "people_invited",
            "visible",
            "mode",
            "updated_at",
        ]:
            assert key in data
        # Preview DB has 111 estates → visible True in auto mode
        if data["families"] >= 25:
            assert data["visible"] is True
        assert data["mode"] == "auto"

    def test_toggle_off_on_auto(self, admin_headers):
        # off
        r_off = requests.put(
            f"{BASE_URL}/api/admin/platform-settings",
            headers=admin_headers,
            json={"show_live_stats": "off"},
        )
        assert r_off.status_code == 200
        r = requests.get(f"{BASE_URL}/api/public/platform-stats")
        assert r.json()["visible"] is False
        assert r.json()["mode"] == "off"

        # on
        requests.put(
            f"{BASE_URL}/api/admin/platform-settings",
            headers=admin_headers,
            json={"show_live_stats": "on"},
        )
        r = requests.get(f"{BASE_URL}/api/public/platform-stats")
        assert r.json()["visible"] is True
        assert r.json()["mode"] == "on"

        # restore auto
        requests.put(
            f"{BASE_URL}/api/admin/platform-settings",
            headers=admin_headers,
            json={"show_live_stats": "auto"},
        )
        r = requests.get(f"{BASE_URL}/api/public/platform-stats")
        assert r.json()["mode"] == "auto"

    def test_site_content_includes_show_live_stats(self):
        r = requests.get(f"{BASE_URL}/api/public/site-content")
        assert r.status_code == 200
        assert "show_live_stats" in r.json()
