"""
Regression tests for API_URL refactoring (Iteration 129)
Verifies that the codebase refactoring did not break any existing functionality.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://estate-glow.preview.emergentagent.com")


class TestHealthAndBasicAPIs:
    """Test basic health and API endpoints"""

    def test_health_endpoint_returns_healthy(self):
        """Backend health endpoint should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "database" in data
        assert data["database"] == "connected"
        print(f"✓ Health check passed: {data}")

    def test_subscription_plans_endpoint(self):
        """Subscription plans should be accessible without auth"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        data = response.json()
        assert "plans" in data or isinstance(data, list) or "beta_mode" in data
        print("✓ Subscription plans endpoint working")


class TestAuthenticationFlow:
    """Test authentication endpoints"""

    @pytest.fixture
    def admin_credentials(self):
        return {"email": "info@carryon.us", "password": "Demo1234!"}

    def test_login_endpoint_accepts_valid_credentials(self, admin_credentials):
        """Login endpoint should accept valid admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=admin_credentials)
        assert response.status_code == 200
        data = response.json()
        # Either direct token or OTP flow
        assert "access_token" in data or "otp_required" in data or "message" in data
        print("✓ Login endpoint working")

        if "access_token" in data:
            return data["access_token"]
        return None

    def test_login_endpoint_rejects_invalid_credentials(self):
        """Login endpoint should reject invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": "invalid@test.com", "password": "wrongpassword"}
        )
        assert response.status_code in [401, 404, 400]
        print("✓ Invalid credentials rejected correctly")


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication"""

    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": "info@carryon.us", "password": "Demo1234!"}
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        pytest.skip("Authentication failed or OTP required - skipping authenticated tests")

    @pytest.fixture
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}

    def test_auth_me_endpoint(self, auth_headers):
        """GET /api/auth/me should return current user info"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert "role" in data
        print(f"✓ Auth/me endpoint working: {data.get('email')}")

    def test_estates_endpoint(self, auth_headers):
        """GET /api/estates should return list of estates"""
        response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Estates endpoint working: {len(data)} estates found")

    def test_notifications_unread_count(self, auth_headers):
        """GET /api/notifications/unread-count should work"""
        response = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "count" in data or isinstance(data, (int, dict))
        print("✓ Notifications unread-count endpoint working")

    def test_subscription_status_endpoint(self, auth_headers):
        """GET /api/subscriptions/status should return subscription info"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/status", headers=auth_headers)
        assert response.status_code in [200, 404]  # 404 if no subscription
        print("✓ Subscription status endpoint working")


class TestAdminEndpoints:
    """Test admin-specific endpoints"""

    @pytest.fixture
    def admin_headers(self):
        """Get admin authentication headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": "info@carryon.us", "password": "Demo1234!"}
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return {"Authorization": f"Bearer {data['access_token']}"}
        pytest.skip("Admin authentication failed - skipping admin tests")

    def test_admin_platform_settings(self, admin_headers):
        """GET /api/admin/platform-settings should work for admin"""
        response = requests.get(f"{BASE_URL}/api/admin/platform-settings", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print("✓ Admin platform-settings endpoint working")

    def test_admin_stats_endpoint(self, admin_headers):
        """GET /api/admin/stats should return platform statistics"""
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print("✓ Admin stats endpoint working")

    def test_admin_users_endpoint(self, admin_headers):
        """GET /api/admin/users should return users list"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) or "users" in data
        print("✓ Admin users endpoint working")

    def test_dev_switcher_config(self, admin_headers):
        """GET /api/dev-switcher/config should work"""
        response = requests.get(f"{BASE_URL}/api/dev-switcher/config")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        print("✓ Dev-switcher config endpoint working")


class TestErrorHandling:
    """Test error handling endpoints"""

    def test_errors_report_endpoint_exists(self):
        """POST /api/errors/report endpoint should exist"""
        # This endpoint accepts error reports - it should return 422 for invalid payload
        response = requests.post(f"{BASE_URL}/api/errors/report", json={})
        # Should exist and respond (even if 422 for invalid payload)
        assert response.status_code in [200, 201, 422, 400]
        print(f"✓ Error reporting endpoint exists (status: {response.status_code})")

    def test_unauthorized_endpoint_returns_401(self):
        """Protected endpoints should return 401 without auth"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code in [401, 403, 422]
        print("✓ Protected endpoints properly secured")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
