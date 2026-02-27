"""
Test P0/P1/P2 Features:
- P0: AI Suggest from Vault (POST /chat/guardian with action=generate_checklist)
- P1: Admin Panel enhancements (user role management, activity log)
- P2: Web Push Notifications (VAPID keys)
"""

import os
import uuid

import pytest
import requests

# Use the public URL from environment
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test user credentials
TEST_USER_EMAIL = f"test_p0p1p2_{uuid.uuid4().hex[:8]}@example.com"
TEST_USER_PASSWORD = "testpass123"
ADMIN_EMAIL = "admin@carryon.com"
ADMIN_PASSWORD = "admin123"


class TestVapidPublicKey:
    """P2: Test VAPID public key endpoint (public, no auth)"""

    def test_vapid_public_key_returns_valid_key(self):
        """GET /api/push/vapid-public-key should return a valid VAPID public key"""
        response = requests.get(f"{BASE_URL}/api/push/vapid-public-key")

        # Status assertion
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        # Data assertions
        data = response.json()
        assert "public_key" in data, "Response should contain 'public_key'"
        assert isinstance(data["public_key"], str), "public_key should be a string"
        assert len(data["public_key"]) > 50, (
            "public_key should be a valid base64 VAPID key (50+ chars)"
        )
        print(f"PASS: VAPID public key returned: {data['public_key'][:30]}...")


class TestAdminAuth:
    """Helper fixture for admin authentication"""

    @staticmethod
    def get_admin_token():
        """Get admin auth token using dev-login"""
        # First try to find an existing admin
        login_response = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )

        if login_response.status_code == 200:
            return login_response.json()["access_token"]

        # Admin doesn't exist, try to create one (fallback)
        return None

    @staticmethod
    def get_auth_headers(token):
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestAdminActivityLog:
    """P1: Test admin activity log endpoint"""

    def test_activity_log_requires_admin_auth(self):
        """GET /api/admin/activity should require admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/activity")

        # Should return 401/403 without auth
        assert response.status_code in [401, 403, 422], (
            f"Expected 401/403/422, got {response.status_code}"
        )
        print("PASS: Activity log requires authentication")

    def test_activity_log_returns_array(self):
        """GET /api/admin/activity with admin auth should return activity array"""
        token = TestAdminAuth.get_admin_token()
        if not token:
            pytest.skip("Admin account not available for testing")

        headers = TestAdminAuth.get_auth_headers(token)
        response = requests.get(f"{BASE_URL}/api/admin/activity", headers=headers)

        # Status assertion
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        # Data assertions
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Activity log returned {len(data)} items")

        # If there are activities, verify structure
        if len(data) > 0:
            activity = data[0]
            assert "type" in activity, "Activity should have 'type'"
            assert "description" in activity, "Activity should have 'description'"
            print(
                f"PASS: First activity type: {activity['type']}, desc: {activity['description'][:50]}..."
            )


class TestAdminUserRole:
    """P1: Test admin user role management"""

    def test_role_change_requires_admin_auth(self):
        """PUT /api/admin/users/{id}/role should require admin authentication"""
        fake_user_id = "fake-user-id"
        response = requests.put(
            f"{BASE_URL}/api/admin/users/{fake_user_id}/role",
            json={"role": "beneficiary"},
        )

        # Should return 401/403 without auth
        assert response.status_code in [401, 403, 422], (
            f"Expected 401/403/422, got {response.status_code}"
        )
        print("PASS: Role change requires authentication")

    def test_role_change_validates_role(self):
        """PUT /api/admin/users/{id}/role should validate role value"""
        token = TestAdminAuth.get_admin_token()
        if not token:
            pytest.skip("Admin account not available for testing")

        headers = TestAdminAuth.get_auth_headers(token)

        # Try invalid role
        response = requests.put(
            f"{BASE_URL}/api/admin/users/fake-user-id/role",
            json={"role": "invalid_role"},
            headers=headers,
        )

        # Should return 400 for invalid role (or 404 if user not found first)
        assert response.status_code in [400, 404], (
            f"Expected 400/404, got {response.status_code}"
        )
        print("PASS: Invalid role is rejected")

    def test_admin_users_list(self):
        """GET /api/admin/users should return users list"""
        token = TestAdminAuth.get_admin_token()
        if not token:
            pytest.skip("Admin account not available for testing")

        headers = TestAdminAuth.get_auth_headers(token)
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=headers)

        # Status assertion
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        # Data assertions
        data = response.json()
        assert isinstance(data, list), "Response should be a list of users"
        print(f"PASS: Admin users list returned {len(data)} users")

        if len(data) > 0:
            user = data[0]
            assert "id" in user, "User should have 'id'"
            assert "email" in user, "User should have 'email'"
            assert "role" in user, "User should have 'role'"
            print(f"PASS: First user role: {user['role']}")


class TestAdminStats:
    """P1: Test admin stats endpoint"""

    def test_admin_stats(self):
        """GET /api/admin/stats should return platform statistics"""
        token = TestAdminAuth.get_admin_token()
        if not token:
            pytest.skip("Admin account not available for testing")

        headers = TestAdminAuth.get_auth_headers(token)
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=headers)

        # Status assertion
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        # Data assertions
        data = response.json()
        assert "users" in data, "Stats should have 'users'"
        assert "estates" in data, "Stats should have 'estates'"
        assert "documents" in data, "Stats should have 'documents'"
        assert "pending_certificates" in data, (
            "Stats should have 'pending_certificates'"
        )

        # Verify users breakdown
        users = data["users"]
        assert "total" in users, "Users should have 'total'"
        assert "benefactors" in users, "Users should have 'benefactors'"
        assert "beneficiaries" in users, "Users should have 'beneficiaries'"
        assert "admins" in users, "Users should have 'admins'"

        print(
            f"PASS: Stats - Total users: {users['total']}, Estates: {data['estates']['total']}, Documents: {data['documents']}, Pending certs: {data['pending_certificates']}"
        )


class TestAISuggestChecklist:
    """P0: Test AI Suggest from Vault (checklist generation)"""

    def test_ai_suggest_requires_auth(self):
        """POST /api/chat/guardian with action=generate_checklist requires auth"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            json={"action": "generate_checklist", "message": "Generate checklist"},
        )

        # Should return 401/403 without auth
        assert response.status_code in [401, 403, 422], (
            f"Expected 401/403/422, got {response.status_code}"
        )
        print("PASS: AI suggest requires authentication")


class TestPushSubscription:
    """P2: Test push subscription endpoints"""

    def test_push_subscribe_requires_auth(self):
        """POST /api/push/subscribe requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/push/subscribe",
            json={
                "endpoint": "https://test.endpoint",
                "keys": {"p256dh": "test", "auth": "test"},
            },
        )

        # Should return 401/403 without auth
        assert response.status_code in [401, 403, 422], (
            f"Expected 401/403/422, got {response.status_code}"
        )
        print("PASS: Push subscribe requires authentication")


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v", "--tb=short"])
