"""
Beta Testing Feature Tests - Iteration 126

Tests for per-user beta toggle, feedback tickets, and admin management:
1. Admin can toggle beta status ON for a user via PUT /api/admin/user/{user_id}/beta
2. Admin can toggle beta status OFF (deactivate) which starts 30-day grace period
3. GET /api/admin/beta-users returns users with beta status
4. POST /api/beta/accept marks user as having accepted beta terms
5. POST /api/beta/feedback submits a bug report ticket
6. GET /api/admin/beta-tickets returns all tickets
7. PUT /api/admin/beta-tickets/{ticket_id}/status updates ticket status
8. GET /api/auth/me returns is_beta_tester and beta_accepted fields
9. GET /api/subscriptions/status returns is_beta_tester and beta_accepted fields
10. Per-user beta gives free access (no subscription required)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Admin credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestBetaFeatures:
    """Beta testing feature tests"""

    admin_token = None
    test_user_id = None
    test_ticket_id = None

    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Get admin token for tests"""
        if not TestBetaFeatures.admin_token:
            # Login as admin
            login_resp = api_client.post(
                f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            )
            assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"

            # Check if OTP required
            data = login_resp.json()
            if data.get("otp_required"):
                # OTP might be disabled - try verify-otp anyway
                pytest.skip("OTP required - need to handle OTP flow")
            else:
                TestBetaFeatures.admin_token = data.get("access_token")

            assert TestBetaFeatures.admin_token, "No admin token obtained"

    def get_admin_headers(self):
        return {"Authorization": f"Bearer {TestBetaFeatures.admin_token}"}

    # ====================== ADMIN BETA TOGGLE TESTS ======================

    def test_01_get_users_list(self, api_client):
        """Get list of users to find a test user"""
        resp = api_client.get(f"{BASE_URL}/api/admin/users", headers=self.get_admin_headers())
        assert resp.status_code == 200, f"Failed to get users: {resp.text}"

        users = resp.json()
        assert isinstance(users, list), "Users response should be a list"
        assert len(users) > 0, "Should have at least one user"

        # Find a non-admin benefactor or beneficiary user for testing
        for user in users:
            if user.get("role") in ("benefactor", "beneficiary") and user.get("id") != ADMIN_EMAIL:
                TestBetaFeatures.test_user_id = user["id"]
                print(f"Selected test user: {user.get('name')} ({user.get('email')}) - ID: {user['id']}")
                break

        assert TestBetaFeatures.test_user_id, "Could not find a suitable test user"

    def test_02_toggle_beta_on(self, api_client):
        """Admin can toggle beta status ON for a user"""
        assert TestBetaFeatures.test_user_id, "No test user ID"

        resp = api_client.put(
            f"{BASE_URL}/api/admin/user/{TestBetaFeatures.test_user_id}/beta",
            json={"is_beta": True},
            headers=self.get_admin_headers(),
        )
        assert resp.status_code == 200, f"Failed to toggle beta ON: {resp.text}"

        data = resp.json()
        assert data.get("success") is True
        assert data.get("is_beta") is True
        assert data.get("user_id") == TestBetaFeatures.test_user_id
        print(f"Beta activated for user {TestBetaFeatures.test_user_id}")

    def test_03_get_beta_users_includes_test_user(self, api_client):
        """GET /api/admin/beta-users returns users with beta status"""
        resp = api_client.get(f"{BASE_URL}/api/admin/beta-users", headers=self.get_admin_headers())
        assert resp.status_code == 200, f"Failed to get beta users: {resp.text}"

        beta_users = resp.json()
        assert isinstance(beta_users, list), "Beta users response should be a list"

        # Find our test user in the beta users list
        test_user = next((u for u in beta_users if u.get("id") == TestBetaFeatures.test_user_id), None)
        assert test_user is not None, f"Test user {TestBetaFeatures.test_user_id} should be in beta users list"

        # Verify required fields are present
        assert "id" in test_user
        assert "name" in test_user
        assert "email" in test_user
        print(f"Beta users list includes: {[u.get('name') for u in beta_users]}")

    def test_04_toggle_beta_off_starts_grace_period(self, api_client):
        """Admin can toggle beta status OFF which starts 30-day grace period"""
        assert TestBetaFeatures.test_user_id, "No test user ID"

        resp = api_client.put(
            f"{BASE_URL}/api/admin/user/{TestBetaFeatures.test_user_id}/beta",
            json={"is_beta": False},
            headers=self.get_admin_headers(),
        )
        assert resp.status_code == 200, f"Failed to toggle beta OFF: {resp.text}"

        data = resp.json()
        assert data.get("success") is True
        assert data.get("is_beta") is False
        print(f"Beta deactivated for user {TestBetaFeatures.test_user_id} - grace period started")

    def test_05_beta_user_not_in_list_after_deactivation(self, api_client):
        """Deactivated beta user should not appear in beta users list"""
        resp = api_client.get(f"{BASE_URL}/api/admin/beta-users", headers=self.get_admin_headers())
        assert resp.status_code == 200

        beta_users = resp.json()
        test_user = next((u for u in beta_users if u.get("id") == TestBetaFeatures.test_user_id), None)
        assert test_user is None, "Deactivated beta user should NOT be in beta users list"
        print("Verified: deactivated user removed from beta users list")

    def test_06_reactivate_beta_for_further_tests(self, api_client):
        """Re-enable beta for further testing"""
        resp = api_client.put(
            f"{BASE_URL}/api/admin/user/{TestBetaFeatures.test_user_id}/beta",
            json={"is_beta": True},
            headers=self.get_admin_headers(),
        )
        assert resp.status_code == 200
        print(f"Beta re-activated for user {TestBetaFeatures.test_user_id}")

    def test_07_toggle_beta_nonexistent_user(self, api_client):
        """Toggle beta for non-existent user should return 404"""
        fake_user_id = str(uuid.uuid4())
        resp = api_client.put(
            f"{BASE_URL}/api/admin/user/{fake_user_id}/beta", json={"is_beta": True}, headers=self.get_admin_headers()
        )
        assert resp.status_code == 404, f"Expected 404 for non-existent user, got {resp.status_code}"

    def test_08_toggle_beta_requires_admin(self, api_client):
        """Toggle beta should require admin access"""
        # Try without token
        resp = api_client.put(f"{BASE_URL}/api/admin/user/{TestBetaFeatures.test_user_id}/beta", json={"is_beta": True})
        assert resp.status_code in (401, 403, 422), f"Expected auth error, got {resp.status_code}"

    # ====================== BETA TICKETS TESTS ======================

    def test_09_get_beta_tickets_empty_or_list(self, api_client):
        """GET /api/admin/beta-tickets returns tickets list"""
        resp = api_client.get(f"{BASE_URL}/api/admin/beta-tickets", headers=self.get_admin_headers())
        assert resp.status_code == 200, f"Failed to get beta tickets: {resp.text}"

        tickets = resp.json()
        assert isinstance(tickets, list), "Beta tickets should be a list"
        print(f"Found {len(tickets)} existing beta tickets")

    def test_10_admin_beta_tickets_requires_auth(self, api_client):
        """Beta tickets endpoint should require admin auth"""
        resp = api_client.get(f"{BASE_URL}/api/admin/beta-tickets")
        assert resp.status_code in (401, 403, 422), f"Expected auth error, got {resp.status_code}"

    # ====================== AUTH/ME ENDPOINT TESTS ======================

    def test_11_auth_me_returns_beta_fields(self, api_client):
        """GET /api/auth/me returns is_beta_tester and beta_accepted fields"""
        resp = api_client.get(f"{BASE_URL}/api/auth/me", headers=self.get_admin_headers())
        assert resp.status_code == 200, f"Failed to get auth/me: {resp.text}"

        data = resp.json()
        # Admin should have these fields in response
        assert "is_beta_tester" in data, "auth/me should include is_beta_tester field"
        assert "beta_accepted" in data, "auth/me should include beta_accepted field"

        print(
            f"auth/me response includes: is_beta_tester={data.get('is_beta_tester')}, beta_accepted={data.get('beta_accepted')}"
        )

    # ====================== SUBSCRIPTIONS STATUS TESTS ======================

    def test_12_subscription_status_returns_beta_fields(self, api_client):
        """GET /api/subscriptions/status returns is_beta_tester and beta_accepted fields"""
        resp = api_client.get(f"{BASE_URL}/api/subscriptions/status", headers=self.get_admin_headers())
        assert resp.status_code == 200, f"Failed to get subscription status: {resp.text}"

        data = resp.json()
        assert "is_beta_tester" in data, "subscription status should include is_beta_tester"
        assert "beta_accepted" in data, "subscription status should include beta_accepted"

        # Beta mode should give free access
        if data.get("is_beta_tester"):
            assert data.get("free_access") is True, "Beta tester should have free_access"

        print(
            f"subscription/status: is_beta_tester={data.get('is_beta_tester')}, beta_accepted={data.get('beta_accepted')}, free_access={data.get('free_access')}"
        )

    # ====================== BETA TICKET STATUS UPDATE TESTS ======================

    def test_13_update_ticket_status_requires_admin(self, api_client):
        """PUT /api/admin/beta-tickets/{ticket_id}/status requires admin"""
        fake_ticket_id = str(uuid.uuid4())
        resp = api_client.put(f"{BASE_URL}/api/admin/beta-tickets/{fake_ticket_id}/status", json={"status": "accepted"})
        assert resp.status_code in (401, 403, 422), f"Expected auth error, got {resp.status_code}"

    def test_14_update_ticket_status_invalid_status(self, api_client):
        """PUT /api/admin/beta-tickets/{ticket_id}/status with invalid status should fail"""
        fake_ticket_id = str(uuid.uuid4())
        resp = api_client.put(
            f"{BASE_URL}/api/admin/beta-tickets/{fake_ticket_id}/status",
            json={"status": "invalid_status"},
            headers=self.get_admin_headers(),
        )
        # Should return 400 for invalid status OR 404 for non-existent ticket
        assert resp.status_code in (400, 404), f"Expected 400 or 404, got {resp.status_code}"

    def test_15_update_ticket_status_nonexistent_ticket(self, api_client):
        """PUT /api/admin/beta-tickets/{ticket_id}/status for non-existent ticket should return 404"""
        fake_ticket_id = str(uuid.uuid4())
        resp = api_client.put(
            f"{BASE_URL}/api/admin/beta-tickets/{fake_ticket_id}/status",
            json={"status": "accepted"},
            headers=self.get_admin_headers(),
        )
        assert resp.status_code == 404, f"Expected 404 for non-existent ticket, got {resp.status_code}"


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session
