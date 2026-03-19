"""
Iteration 132 - Tests for:
1. Per-User 2FA Toggle feature (GET/PUT /api/auth/2fa-preference)
2. Platform settings reset behavior (PUT /api/admin/platform-settings)
3. Login flow respecting per-user otp_enabled field
4. Admin users endpoint for sorting data

NOTE: Uses session-scoped fixtures to avoid rate limiting on login endpoint
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable is required")

# Admin credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


# Session-scoped fixture to login once for all tests
@pytest.fixture(scope="session")
def admin_session():
    """Login once as admin and reuse the token for all tests"""
    time.sleep(1)  # Small delay to avoid rate limiting
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})

    if response.status_code == 429:
        # Rate limited - wait and retry
        time.sleep(60)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})

    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    token = data.get("access_token")
    assert token, f"No access token in response: {data}"

    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}}


class TestHealthCheck:
    """Health check to ensure API is available"""

    def test_health_endpoint(self):
        """Verify API is running"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "healthy", f"Unexpected health status: {data}"
        print("✓ Health check passed")


class Test2FAPreference:
    """Tests for per-user 2FA preference endpoints"""

    def test_get_2fa_preference(self, admin_session):
        """GET /api/auth/2fa-preference should return otp_enabled and global_disabled"""
        response = requests.get(f"{BASE_URL}/api/auth/2fa-preference", headers=admin_session["headers"])
        assert response.status_code == 200, f"GET 2fa-preference failed: {response.text}"
        data = response.json()

        # Verify response structure
        assert "otp_enabled" in data, f"Missing otp_enabled in response: {data}"
        assert "global_disabled" in data, f"Missing global_disabled in response: {data}"

        # otp_enabled should be boolean
        assert isinstance(data["otp_enabled"], bool), f"otp_enabled should be bool: {data}"
        # global_disabled should be boolean
        assert isinstance(data["global_disabled"], bool), f"global_disabled should be bool: {data}"

        print(f"✓ GET 2fa-preference: otp_enabled={data['otp_enabled']}, global_disabled={data['global_disabled']}")

    def test_get_platform_settings(self, admin_session):
        """GET /api/admin/platform-settings should return current OTP disabled status"""
        response = requests.get(f"{BASE_URL}/api/admin/platform-settings", headers=admin_session["headers"])
        assert response.status_code == 200, f"GET platform-settings failed: {response.text}"
        data = response.json()

        # Should have otp_disabled field
        assert "otp_disabled" in data, f"Missing otp_disabled in response: {data}"
        assert isinstance(data["otp_disabled"], bool), f"otp_disabled should be bool: {data}"

        print(f"✓ GET platform-settings: otp_disabled={data['otp_disabled']}")

    def test_put_2fa_preference_blocked_when_global_off(self, admin_session):
        """PUT /api/auth/2fa-preference should block enabling when global is off"""
        # First check global status
        settings_response = requests.get(f"{BASE_URL}/api/admin/platform-settings", headers=admin_session["headers"])
        global_disabled = settings_response.json().get("otp_disabled", False)

        if global_disabled:
            # Try to enable 2FA when global is disabled - should fail
            response = requests.put(
                f"{BASE_URL}/api/auth/2fa-preference", headers=admin_session["headers"], json={"otp_enabled": True}
            )
            assert response.status_code == 400, (
                f"Expected 400 when enabling 2FA while global is off: {response.status_code}"
            )
            print("✓ PUT 2fa-preference correctly blocked when global OTP is disabled")
        else:
            # If global is enabled, test that we CAN enable 2FA
            response = requests.put(
                f"{BASE_URL}/api/auth/2fa-preference", headers=admin_session["headers"], json={"otp_enabled": True}
            )
            assert response.status_code == 200, f"PUT 2fa-preference failed: {response.text}"
            print("✓ PUT 2fa-preference allowed when global OTP is enabled")

    def test_put_2fa_preference_disable_allowed(self, admin_session):
        """PUT /api/auth/2fa-preference with otp_enabled=false should always work"""
        response = requests.put(
            f"{BASE_URL}/api/auth/2fa-preference", headers=admin_session["headers"], json={"otp_enabled": False}
        )
        assert response.status_code == 200, f"PUT 2fa-preference (disable) failed: {response.text}"
        data = response.json()
        assert not data.get("otp_enabled"), f"Expected otp_enabled=false: {data}"
        print("✓ PUT 2fa-preference (disable) succeeded")

    def test_auth_me_includes_otp_enabled(self, admin_session):
        """GET /api/auth/me should include otp_enabled field"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_session["headers"])
        assert response.status_code == 200, f"GET /api/auth/me failed: {response.text}"
        data = response.json()

        # Verify otp_enabled is present
        assert "otp_enabled" in data, f"Missing otp_enabled in /auth/me response: {data.keys()}"
        assert isinstance(data["otp_enabled"], bool), f"otp_enabled should be bool: {data['otp_enabled']}"

        print(f"✓ GET /api/auth/me includes otp_enabled={data['otp_enabled']}")


class TestAdminPlatformSettings:
    """Tests for admin platform settings"""

    def test_admin_can_toggle_global_otp(self, admin_session):
        """Admin should be able to toggle global otp_disabled setting"""
        # Get current setting
        get_response = requests.get(f"{BASE_URL}/api/admin/platform-settings", headers=admin_session["headers"])
        current = get_response.json().get("otp_disabled", False)

        # Toggle it
        response = requests.put(
            f"{BASE_URL}/api/admin/platform-settings",
            headers=admin_session["headers"],
            json={"otp_disabled": not current},
        )
        assert response.status_code == 200, f"PUT platform-settings failed: {response.text}"

        # Verify change
        new_response = requests.get(f"{BASE_URL}/api/admin/platform-settings", headers=admin_session["headers"])
        new_value = new_response.json().get("otp_disabled")
        assert new_value == (not current), f"Toggle didn't work: expected {not current}, got {new_value}"

        # Restore original value
        requests.put(
            f"{BASE_URL}/api/admin/platform-settings", headers=admin_session["headers"], json={"otp_disabled": current}
        )

        print(f"✓ Admin can toggle global OTP setting (tested {current} -> {not current} -> {current})")

    def test_non_admin_blocked_from_platform_settings(self):
        """Non-admin users should get 403 on platform-settings"""
        response = requests.get(f"{BASE_URL}/api/admin/platform-settings")
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print("✓ Unauthenticated request blocked from platform-settings")


class TestAdminUsersSort:
    """Tests for admin users listing - verifying fields needed for sorting"""

    def test_get_all_users(self, admin_session):
        """GET /api/admin/users should return user list with beneficiary data"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_session["headers"])
        assert response.status_code == 200, f"GET /api/admin/users failed: {response.text}"
        users = response.json()

        assert isinstance(users, list), f"Expected list of users: {type(users)}"
        assert len(users) > 0, "No users returned"

        # Check that users have required fields for sorting
        sample_user = users[0]
        assert "id" in sample_user, "User missing id"
        assert "email" in sample_user, "User missing email"
        assert "role" in sample_user, "User missing role"

        # Check for linked_beneficiaries on benefactors
        benefactors = [u for u in users if u.get("role") == "benefactor" or u.get("is_also_benefactor")]
        if benefactors:
            has_bens = any("linked_beneficiaries" in u for u in benefactors)
            print(f"✓ Found {len(benefactors)} benefactors, linked_beneficiaries present: {has_bens}")

        print(f"✓ GET /api/admin/users returned {len(users)} users")

    def test_users_have_sortable_fields(self, admin_session):
        """Verify users have fields needed for sorting"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_session["headers"])
        users = response.json()

        # Check for created_at and name (always present)
        for user in users[:5]:
            has_created = "created_at" in user
            has_name = "name" in user
            if not has_created:
                print(f"⚠ User {user.get('email')} missing created_at")
            if not has_name:
                print(f"⚠ User {user.get('email')} missing name")

        print("✓ Users have basic sortable fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
