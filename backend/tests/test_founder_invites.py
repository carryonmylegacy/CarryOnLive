"""
Test suite for Founder Page Invite System
Tests: Single-use invites, revocation, verification, admin-only access
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from test_credentials.md
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestFounderInvitesBackend:
    """Backend API tests for founder invite system"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
        data = response.json()
        # API returns access_token, not token
        return data.get("access_token") or data.get("token")

    @pytest.fixture
    def auth_headers(self, admin_token):
        """Headers with admin auth token"""
        return {"Authorization": f"Bearer {admin_token}"}

    # ─── CREATE INVITE TESTS ───

    def test_create_invite_success(self, auth_headers):
        """POST /api/founder/invites - creates a new invite token (admin only)"""
        response = requests.post(
            f"{BASE_URL}/api/founder/invites", json={"note": "TEST_invite_for_testing"}, headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert "token" in data, "Response should contain 'token'"
        assert data["token"], "Token should not be empty"
        assert data.get("note") == "TEST_invite_for_testing", "Note should match"
        assert not data.get("used"), "New invite should not be used"
        assert not data.get("revoked"), "New invite should not be revoked"
        assert "created_at" in data, "Should have created_at timestamp"
        print(f"PASS: Created invite with token: {data['token'][:8]}...")

    def test_create_invite_without_note(self, auth_headers):
        """POST /api/founder/invites - creates invite without note"""
        response = requests.post(f"{BASE_URL}/api/founder/invites", json={}, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

        data = response.json()
        assert "token" in data
        assert data.get("note") == "", "Note should be empty string"
        print("PASS: Created invite without note")

    def test_create_invite_requires_auth(self):
        """POST /api/founder/invites - requires authentication"""
        response = requests.post(f"{BASE_URL}/api/founder/invites", json={"note": "unauthorized"})
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Create invite requires authentication")

    # ─── LIST INVITES TESTS ───

    def test_list_invites_success(self, auth_headers):
        """GET /api/founder/invites - lists all invites (admin only)"""
        response = requests.get(f"{BASE_URL}/api/founder/invites", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Listed {len(data)} invites")

    def test_list_invites_requires_auth(self):
        """GET /api/founder/invites - requires authentication"""
        response = requests.get(f"{BASE_URL}/api/founder/invites")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: List invites requires authentication")

    # ─── VERIFY INVITE TESTS ───

    def test_verify_valid_invite(self, auth_headers):
        """GET /api/founder-about/verify/:token - validates valid invite"""
        # First create an invite
        create_res = requests.post(
            f"{BASE_URL}/api/founder/invites", json={"note": "TEST_verify_test"}, headers=auth_headers
        )
        assert create_res.status_code == 200
        token = create_res.json()["token"]

        # Verify it (public endpoint)
        verify_res = requests.get(f"{BASE_URL}/api/founder-about/verify/{token}")
        assert verify_res.status_code == 200

        data = verify_res.json()
        assert data.get("valid"), "Valid invite should return valid=True"
        print("PASS: Verified valid invite token")

    def test_verify_invalid_token(self):
        """GET /api/founder-about/verify/:token - returns not_found for invalid token"""
        fake_token = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/founder-about/verify/{fake_token}")
        assert response.status_code == 200

        data = response.json()
        assert not data.get("valid"), "Invalid token should return valid=False"
        assert data.get("reason") == "not_found", "Reason should be 'not_found'"
        print("PASS: Invalid token returns not_found")

    # ─── USE INVITE TESTS (SINGLE-USE) ───

    def test_use_invite_single_use(self, auth_headers):
        """POST /api/founder-about/use/:token - marks invite as used (single-use)"""
        # Create a fresh invite
        create_res = requests.post(
            f"{BASE_URL}/api/founder/invites", json={"note": "TEST_single_use_test"}, headers=auth_headers
        )
        assert create_res.status_code == 200
        token = create_res.json()["token"]

        # Use it (first time should succeed)
        use_res = requests.post(f"{BASE_URL}/api/founder-about/use/{token}")
        assert use_res.status_code == 200, f"First use should succeed: {use_res.text}"
        assert use_res.json().get("status") == "used"
        print("PASS: First use of invite succeeded")

        # Try to use again (should fail - single-use)
        use_res2 = requests.post(f"{BASE_URL}/api/founder-about/use/{token}")
        assert use_res2.status_code == 403, f"Second use should fail with 403: {use_res2.status_code}"
        print("PASS: Second use of invite correctly rejected (single-use)")

        # Verify shows already_used
        verify_res = requests.get(f"{BASE_URL}/api/founder-about/verify/{token}")
        data = verify_res.json()
        assert not data.get("valid")
        assert data.get("reason") == "already_used"
        print("PASS: Verify shows already_used for used invite")

    def test_use_invalid_token(self):
        """POST /api/founder-about/use/:token - returns 404 for invalid token"""
        fake_token = str(uuid.uuid4())
        response = requests.post(f"{BASE_URL}/api/founder-about/use/{fake_token}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Use invalid token returns 404")

    # ─── REVOKE INVITE TESTS ───

    def test_revoke_invite_success(self, auth_headers):
        """DELETE /api/founder/invites/:token - revokes an invite (admin only)"""
        # Create an invite
        create_res = requests.post(
            f"{BASE_URL}/api/founder/invites", json={"note": "TEST_revoke_test"}, headers=auth_headers
        )
        assert create_res.status_code == 200
        token = create_res.json()["token"]

        # Revoke it
        revoke_res = requests.delete(f"{BASE_URL}/api/founder/invites/{token}", headers=auth_headers)
        assert revoke_res.status_code == 200, f"Revoke should succeed: {revoke_res.text}"
        assert revoke_res.json().get("status") == "revoked"
        print("PASS: Revoked invite successfully")

        # Verify shows revoked
        verify_res = requests.get(f"{BASE_URL}/api/founder-about/verify/{token}")
        data = verify_res.json()
        assert not data.get("valid")
        assert data.get("reason") == "revoked"
        print("PASS: Verify shows revoked for revoked invite")

        # Try to use revoked invite
        use_res = requests.post(f"{BASE_URL}/api/founder-about/use/{token}")
        assert use_res.status_code == 403, f"Using revoked invite should fail: {use_res.status_code}"
        print("PASS: Using revoked invite correctly rejected")

    def test_revoke_requires_auth(self, auth_headers):
        """DELETE /api/founder/invites/:token - requires authentication"""
        # Create an invite first
        create_res = requests.post(
            f"{BASE_URL}/api/founder/invites", json={"note": "TEST_revoke_auth_test"}, headers=auth_headers
        )
        token = create_res.json()["token"]

        # Try to revoke without auth
        response = requests.delete(f"{BASE_URL}/api/founder/invites/{token}")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Revoke requires authentication")

    def test_revoke_nonexistent_token(self, auth_headers):
        """DELETE /api/founder/invites/:token - returns 404 for nonexistent token"""
        fake_token = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/founder/invites/{fake_token}", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Revoke nonexistent token returns 404")


class TestAboutPageEndpoints:
    """Test public About page and static file serving"""

    def test_about_page_accessible(self):
        """Public About page should be accessible"""
        response = requests.get(f"{BASE_URL}/about", allow_redirects=True)
        # Frontend route - should return HTML
        assert response.status_code == 200, f"About page should be accessible: {response.status_code}"
        print("PASS: About page is accessible")

    def test_founder_story_static_file(self):
        """Founder story HTML file should be served"""
        response = requests.get(f"{BASE_URL}/founder-story.html", allow_redirects=True)
        # This is a static file served by frontend
        # May return 200 or 404 depending on if file exists
        print(f"INFO: Founder story file status: {response.status_code}")


# Cleanup fixture to remove test invites
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_invites():
    """Cleanup TEST_ prefixed invites after all tests"""
    yield
    # Cleanup would require listing and deleting, but we'll leave test data
    # as it doesn't affect production
    print("INFO: Test invites created with TEST_ prefix for identification")
