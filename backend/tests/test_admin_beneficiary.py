"""
Backend Tests for CarryOn™ Admin & Beneficiary APIs
Tests for: Admin dashboard endpoints, beneficiary login flow, admin user management
"""

import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://benefactor-join.preview.emergentagent.com"


class TestAdminEndpoints:
    """Admin API endpoint tests - requires admin authentication"""

    @pytest.fixture
    def admin_session(self):
        """Authenticate as admin and return session with token"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})

        # Login request
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@carryon.com", "password": "admin123"},
        )
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"

        # Get OTP from backend logs (in test env we extract from response hint)
        # For this test, we'll use the OTP from logs
        import subprocess

        result = subprocess.run(
            "tail -n 5 /var/log/supervisor/backend.err.log | grep -oP 'OTP for admin@carryon.com: \\K\\d+' | tail -1",
            shell=True,
            capture_output=True,
            text=True,
        )
        otp = result.stdout.strip()
        if not otp:
            pytest.skip("Could not retrieve OTP from logs")

        # Verify OTP
        verify_resp = session.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"email": "admin@carryon.com", "otp": otp},
        )
        assert verify_resp.status_code == 200, (
            f"OTP verification failed: {verify_resp.text}"
        )

        data = verify_resp.json()
        token = data.get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session

    def test_admin_users_endpoint(self, admin_session):
        """GET /api/admin/users returns all users (admin only)"""
        response = admin_session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 200, f"Failed: {response.text}"

        users = response.json()
        assert isinstance(users, list), "Users should be a list"
        assert len(users) > 0, "Should have at least one user"

        # Verify user structure - should not contain password
        user = users[0]
        assert "email" in user, "User should have email"
        assert "password" not in user, "User should NOT have password field"
        print(f"✓ Admin users endpoint returned {len(users)} users")

    def test_admin_stats_endpoint(self, admin_session):
        """GET /api/admin/stats returns platform stats"""
        response = admin_session.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 200, f"Failed: {response.text}"

        stats = response.json()
        assert "users" in stats, "Stats should have users field"
        assert "estates" in stats, "Stats should have estates field"
        assert "documents" in stats, "Stats should have documents field"
        assert "messages" in stats, "Stats should have messages field"
        assert "pending_certificates" in stats, (
            "Stats should have pending_certificates field"
        )

        # Verify users breakdown
        user_stats = stats["users"]
        assert "total" in user_stats, "User stats should have total"
        assert "benefactors" in user_stats, "User stats should have benefactors"
        assert "beneficiaries" in user_stats, "User stats should have beneficiaries"
        assert "admins" in user_stats, "User stats should have admins"

        print(
            f"✓ Admin stats: {user_stats['total']} total users, {stats['estates']['total']} estates"
        )

    def test_admin_users_unauthorized(self):
        """GET /api/admin/users should require admin authentication"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 401 or response.status_code == 403, (
            "Admin endpoint should reject unauthenticated requests"
        )
        print("✓ Admin users endpoint correctly rejects unauthenticated requests")


class TestBeneficiaryAuth:
    """Beneficiary authentication and access tests"""

    @pytest.fixture
    def beneficiary_session(self):
        """Authenticate as beneficiary and return session with token"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})

        # Login request
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "penny@mitchell.com", "password": "password123"},
        )
        assert login_resp.status_code == 200, (
            f"Beneficiary login failed: {login_resp.text}"
        )

        # Get OTP from backend logs
        import subprocess

        result = subprocess.run(
            "tail -n 5 /var/log/supervisor/backend.err.log | grep -oP 'OTP for penny@mitchell.com: \\K\\d+' | tail -1",
            shell=True,
            capture_output=True,
            text=True,
        )
        otp = result.stdout.strip()
        if not otp:
            pytest.skip("Could not retrieve OTP from logs")

        # Verify OTP
        verify_resp = session.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"email": "penny@mitchell.com", "otp": otp},
        )
        assert verify_resp.status_code == 200, (
            f"OTP verification failed: {verify_resp.text}"
        )

        data = verify_resp.json()
        token = data.get("access_token")
        user = data.get("user")
        session.headers.update({"Authorization": f"Bearer {token}"})
        session.user = user
        return session

    def test_beneficiary_login_returns_beneficiary_role(self, beneficiary_session):
        """Verify beneficiary login returns correct role"""
        user = beneficiary_session.user
        assert user["role"] == "beneficiary", (
            f"Expected role 'beneficiary', got '{user['role']}'"
        )
        print(f"✓ Beneficiary login successful: {user['name']} ({user['email']})")

    def test_beneficiary_can_access_estates(self, beneficiary_session):
        """Beneficiary should be able to access their linked estates"""
        response = beneficiary_session.get(f"{BASE_URL}/api/estates")
        assert response.status_code == 200, f"Failed: {response.text}"

        estates = response.json()
        assert isinstance(estates, list), "Estates should be a list"
        # Penny Mitchell should have at least one estate (Mitchell Family)
        print(f"✓ Beneficiary has access to {len(estates)} estate(s)")

    def test_beneficiary_cannot_access_admin_endpoints(self, beneficiary_session):
        """Beneficiary should not be able to access admin endpoints"""
        response = beneficiary_session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 403, (
            f"Expected 403 for beneficiary accessing admin endpoint, got {response.status_code}"
        )
        print("✓ Beneficiary correctly denied access to admin endpoints")


class TestBenefactorAuth:
    """Benefactor authentication tests"""

    @pytest.fixture
    def benefactor_session(self):
        """Authenticate as benefactor and return session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})

        # Login request
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "pete@mitchell.com", "password": "password123"},
        )
        assert login_resp.status_code == 200, (
            f"Benefactor login failed: {login_resp.text}"
        )

        # Get OTP from backend logs
        import subprocess

        result = subprocess.run(
            "tail -n 5 /var/log/supervisor/backend.err.log | grep -oP 'OTP for pete@mitchell.com: \\K\\d+' | tail -1",
            shell=True,
            capture_output=True,
            text=True,
        )
        otp = result.stdout.strip()
        if not otp:
            pytest.skip("Could not retrieve OTP from logs")

        # Verify OTP
        verify_resp = session.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"email": "pete@mitchell.com", "otp": otp},
        )
        assert verify_resp.status_code == 200, (
            f"OTP verification failed: {verify_resp.text}"
        )

        data = verify_resp.json()
        token = data.get("access_token")
        user = data.get("user")
        session.headers.update({"Authorization": f"Bearer {token}"})
        session.user = user
        return session

    def test_benefactor_login_returns_benefactor_role(self, benefactor_session):
        """Verify benefactor login returns correct role"""
        user = benefactor_session.user
        assert user["role"] == "benefactor", (
            f"Expected role 'benefactor', got '{user['role']}'"
        )
        print(f"✓ Benefactor login successful: {user['name']} ({user['email']})")

    def test_benefactor_cannot_access_admin_endpoints(self, benefactor_session):
        """Benefactor should not be able to access admin endpoints"""
        response = benefactor_session.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 403, (
            f"Expected 403 for benefactor accessing admin endpoint, got {response.status_code}"
        )
        print("✓ Benefactor correctly denied access to admin endpoints")


class TestLoginFlow:
    """Test basic login flow without OTP (just initial authentication)"""

    def test_login_beneficiary_initiates_otp(self):
        """Login with beneficiary credentials should return OTP hint"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "penny@mitchell.com", "password": "password123"},
        )
        assert response.status_code == 200, f"Login failed: {response.text}"

        data = response.json()
        assert "otp_hint" in data, "Login should return OTP hint"
        assert "OTP sent" in data.get("message", ""), "Should indicate OTP sent"
        print(f"✓ Beneficiary login initiated, OTP hint: {data.get('otp_hint')}")

    def test_login_admin_initiates_otp(self):
        """Login with admin credentials should return OTP hint"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@carryon.com", "password": "admin123"},
        )
        assert response.status_code == 200, f"Login failed: {response.text}"

        data = response.json()
        assert "otp_hint" in data, "Login should return OTP hint"
        print(f"✓ Admin login initiated, OTP hint: {data.get('otp_hint')}")

    def test_login_invalid_credentials(self):
        """Login with invalid credentials should fail"""
        session = requests.Session()
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@test.com", "password": "wrongpassword"},
        )
        assert response.status_code == 401, (
            f"Expected 401 for invalid credentials, got {response.status_code}"
        )
        print("✓ Invalid credentials correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
