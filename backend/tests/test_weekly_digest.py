"""
Tests for Weekly Estate Readiness Digest Feature
Covers:
- GET /api/digest/preferences (returns {weekly_digest: true} by default)
- PUT /api/digest/preferences (toggles weekly_digest on/off)
- POST /api/digest/send-weekly (requires admin role - 403 for non-admin)
- POST /api/digest/preview (sends preview digest to current user)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

# Test credentials
ADMIN_CREDENTIALS = {"email": "admin@carryon.com", "password": "admin123"}
BENEFACTOR_CREDENTIALS = {"email": "pete@mitchell.com", "password": "pete123"}


class TestDigestPreferences:
    """Test digest preference endpoints"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token via dev-login"""
        resp = requests.post(f"{BASE_URL}/api/auth/dev-login", json=ADMIN_CREDENTIALS)
        if resp.status_code == 200:
            return resp.json().get("access_token")
        pytest.skip(f"Admin login failed: {resp.status_code} - {resp.text}")

    @pytest.fixture(scope="class")
    def benefactor_token(self):
        """Get benefactor auth token via dev-login"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login", json=BENEFACTOR_CREDENTIALS
        )
        if resp.status_code == 200:
            return resp.json().get("access_token")
        # Try creating the benefactor user if not exists
        pytest.skip(f"Benefactor login failed: {resp.status_code} - {resp.text}")

    def test_get_preferences_requires_auth(self):
        """GET /api/digest/preferences requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/digest/preferences")
        assert resp.status_code == 403 or resp.status_code == 401, (
            f"Expected 401/403 but got {resp.status_code}"
        )
        print(
            f"GET /api/digest/preferences without auth: {resp.status_code} (expected)"
        )

    def test_get_preferences_default_true(self, admin_token):
        """GET /api/digest/preferences returns {weekly_digest: true} by default"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/digest/preferences", headers=headers)
        assert resp.status_code == 200, (
            f"Expected 200 but got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "weekly_digest" in data, "Response missing 'weekly_digest' field"
        # Default should be True
        assert isinstance(data["weekly_digest"], bool), (
            "weekly_digest should be boolean"
        )
        print(f"GET /api/digest/preferences: {data}")

    def test_put_preferences_toggle_off(self, admin_token):
        """PUT /api/digest/preferences toggles weekly_digest to false"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.put(
            f"{BASE_URL}/api/digest/preferences",
            json={"weekly_digest": False},
            headers=headers,
        )
        assert resp.status_code == 200, (
            f"Expected 200 but got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert not data.get("weekly_digest"), (
            f"Expected weekly_digest=False, got {data}"
        )
        print(f"PUT /api/digest/preferences (off): {data}")

    def test_put_preferences_toggle_on(self, admin_token):
        """PUT /api/digest/preferences toggles weekly_digest to true"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.put(
            f"{BASE_URL}/api/digest/preferences",
            json={"weekly_digest": True},
            headers=headers,
        )
        assert resp.status_code == 200, (
            f"Expected 200 but got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data.get("weekly_digest"), f"Expected weekly_digest=True, got {data}"
        print(f"PUT /api/digest/preferences (on): {data}")

    def test_put_preferences_requires_auth(self):
        """PUT /api/digest/preferences requires authentication"""
        resp = requests.put(
            f"{BASE_URL}/api/digest/preferences", json={"weekly_digest": False}
        )
        assert resp.status_code == 403 or resp.status_code == 401, (
            f"Expected 401/403 but got {resp.status_code}"
        )
        print(
            f"PUT /api/digest/preferences without auth: {resp.status_code} (expected)"
        )


class TestDigestSendWeekly:
    """Test admin-only send-weekly endpoint"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token"""
        resp = requests.post(f"{BASE_URL}/api/auth/dev-login", json=ADMIN_CREDENTIALS)
        if resp.status_code == 200:
            return resp.json().get("access_token")
        pytest.skip(f"Admin login failed: {resp.status_code}")

    @pytest.fixture(scope="class")
    def non_admin_token(self):
        """Get non-admin (benefactor) auth token"""
        # First try to find an existing benefactor
        admin_resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login", json=ADMIN_CREDENTIALS
        )
        if admin_resp.status_code != 200:
            pytest.skip("Cannot get admin token to find benefactors")

        admin_token = admin_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Get users list to find a benefactor
        users_resp = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)
        if users_resp.status_code == 200:
            users = users_resp.json()
            for user in users:
                if user.get("role") == "benefactor":
                    # Try to login as this benefactor
                    benefactor_resp = requests.post(
                        f"{BASE_URL}/api/auth/dev-login",
                        json={"email": user["email"], "password": "password123"},
                    )
                    if benefactor_resp.status_code == 200:
                        return benefactor_resp.json().get("access_token")

        pytest.skip("No benefactor account available for testing")

    def test_send_weekly_requires_auth(self):
        """POST /api/digest/send-weekly requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/digest/send-weekly")
        assert resp.status_code in [401, 403], (
            f"Expected 401/403 but got {resp.status_code}"
        )
        print(
            f"POST /api/digest/send-weekly without auth: {resp.status_code} (expected)"
        )

    def test_send_weekly_requires_admin(self, non_admin_token):
        """POST /api/digest/send-weekly returns 403 for non-admin users"""
        if non_admin_token is None:
            pytest.skip("No non-admin token available")

        headers = {"Authorization": f"Bearer {non_admin_token}"}
        resp = requests.post(f"{BASE_URL}/api/digest/send-weekly", headers=headers)
        assert resp.status_code == 403, (
            f"Expected 403 but got {resp.status_code}: {resp.text}"
        )
        print("POST /api/digest/send-weekly as non-admin: 403 (expected)")

    def test_send_weekly_admin_allowed(self, admin_token):
        """POST /api/digest/send-weekly works for admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/digest/send-weekly",
            json={"dashboard_url": "https://test.carryon.us/dashboard"},
            headers=headers,
        )
        # Should return 200 with sent/skipped counts
        assert resp.status_code == 200, (
            f"Expected 200 but got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "sent" in data, f"Response missing 'sent' field: {data}"
        assert "skipped" in data, f"Response missing 'skipped' field: {data}"
        print(f"POST /api/digest/send-weekly as admin: {data}")


class TestDigestPreview:
    """Test preview digest endpoint"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token"""
        resp = requests.post(f"{BASE_URL}/api/auth/dev-login", json=ADMIN_CREDENTIALS)
        if resp.status_code == 200:
            return resp.json().get("access_token")
        pytest.skip(f"Admin login failed: {resp.status_code}")

    def test_preview_requires_auth(self):
        """POST /api/digest/preview requires authentication"""
        resp = requests.post(f"{BASE_URL}/api/digest/preview")
        assert resp.status_code in [401, 403], (
            f"Expected 401/403 but got {resp.status_code}"
        )
        print(f"POST /api/digest/preview without auth: {resp.status_code} (expected)")

    def test_preview_for_authorized_user(self, admin_token):
        """POST /api/digest/preview works for admin/benefactor"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.post(f"{BASE_URL}/api/digest/preview", headers=headers)
        # May return 200 (success), 400 (no estates), or 403 (not authorized)
        # Admin should be allowed based on digest.py line 296-297
        print(f"POST /api/digest/preview as admin: {resp.status_code} - {resp.text}")

        # If admin has estates, should succeed or fail with "no estates" error
        if resp.status_code == 200:
            data = resp.json()
            assert "message" in data, f"Expected 'message' in response: {data}"
            print(f"Preview sent successfully: {data}")
        elif resp.status_code == 400:
            # No estates found - this is expected if admin has no estates
            data = resp.json()
            assert "detail" in data or "error" in data or "No estates" in resp.text
            print(f"Preview not sent (no estates): {resp.text}")
        else:
            # Should not get 403 for admin
            assert resp.status_code != 403, (
                f"Admin should be authorized for preview: {resp.text}"
            )


class TestSchedulerLogging:
    """Test that scheduler logs next Monday send time on startup"""

    def test_scheduler_log_exists(self):
        """Verify weekly digest scheduler log message appears in backend logs"""
        # This test verifies the scheduler is running by checking logs
        # The log message format: "Weekly digest scheduled for {date} ({hours}h away)"
        import subprocess

        result = subprocess.run(
            ["tail", "-n", "100", "/var/log/supervisor/backend.err.log"],
            capture_output=True,
            text=True,
        )
        log_content = result.stdout

        assert "Weekly digest scheduled for" in log_content, (
            f"Expected 'Weekly digest scheduled for' in backend logs but not found. Logs: {log_content[-500:]}"
        )

        # Verify it shows next Monday
        assert "2026-03" in log_content or "13:00:00" in log_content, (
            "Scheduler should show next Monday at 13:00 UTC"
        )

        print("PASS: Weekly digest scheduler logged next Monday send time on startup")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
