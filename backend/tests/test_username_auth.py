"""
Test suite for username-based authentication migration
Tests: check-username, forgot-password (username-based), forgot-username, login, register
"""

import pytest
import requests
import os
import uuid
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from test_credentials.md
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"
ADMIN_USERNAME = "admin_62bc79"  # Auto-generated during migration


class TestCheckUsername:
    """Tests for POST /api/auth/check-username endpoint"""

    def test_check_username_available(self):
        """Available username returns {available: true}"""
        unique_username = f"testuser_{uuid.uuid4().hex[:8]}"
        response = requests.post(f"{BASE_URL}/api/auth/check-username", json={"username": unique_username})
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is True
        print(f"PASS: Available username '{unique_username}' returns available=true")

    def test_check_username_taken(self):
        """Taken username returns {available: false}"""
        response = requests.post(f"{BASE_URL}/api/auth/check-username", json={"username": ADMIN_USERNAME})
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is False
        print(f"PASS: Taken username '{ADMIN_USERNAME}' returns available=false")

    def test_check_username_email_format_rejected(self):
        """Email format in username returns error message"""
        response = requests.post(f"{BASE_URL}/api/auth/check-username", json={"username": "test@example.com"})
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is False
        assert "message" in data
        assert "email" in data["message"].lower() or "@" in data["message"]
        print(f"PASS: Email format rejected with message: {data['message']}")

    def test_check_username_too_short(self):
        """Username < 3 chars returns error"""
        response = requests.post(f"{BASE_URL}/api/auth/check-username", json={"username": "ab"})
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is False
        assert "message" in data
        print(f"PASS: Short username rejected with message: {data['message']}")


class TestCheckEmail:
    """Tests for POST /api/auth/check-email endpoint (backward compatibility)"""

    def test_check_email_exists(self):
        """Existing email returns {exists: true}"""
        response = requests.post(f"{BASE_URL}/api/auth/check-email", json={"email": ADMIN_EMAIL})
        assert response.status_code == 200
        data = response.json()
        assert data["exists"] is True
        print("PASS: Existing email returns exists=true")

    def test_check_email_not_exists(self):
        """Non-existing email returns {exists: false}"""
        response = requests.post(
            f"{BASE_URL}/api/auth/check-email", json={"email": f"nonexistent_{uuid.uuid4().hex[:8]}@test.com"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["exists"] is False
        print("PASS: Non-existing email returns exists=false")


class TestForgotPassword:
    """Tests for POST /api/auth/forgot-password (now username-based)"""

    def test_forgot_password_requires_username(self):
        """Forgot password now requires username field, not email"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"username": ADMIN_USERNAME})
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        # Should return generic message to prevent enumeration
        assert "reset code" in data["message"].lower() or "sent" in data["message"].lower()
        print(f"PASS: Forgot password with username returns: {data['message']}")

    def test_forgot_password_nonexistent_username(self):
        """Non-existent username still returns success (prevent enumeration)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/forgot-password", json={"username": f"nonexistent_{uuid.uuid4().hex[:8]}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"PASS: Non-existent username returns generic message: {data['message']}")


class TestForgotUsername:
    """Tests for POST /api/auth/forgot-username endpoint"""

    def test_forgot_username_with_email(self):
        """Forgot username with email returns success message"""
        response = requests.post(f"{BASE_URL}/api/auth/forgot-username", json={"email": ADMIN_EMAIL})
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        # Should return generic message to prevent enumeration
        assert "username" in data["message"].lower() or "sent" in data["message"].lower()
        print(f"PASS: Forgot username returns: {data['message']}")

    def test_forgot_username_nonexistent_email(self):
        """Non-existent email still returns success (prevent enumeration)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/forgot-username", json={"email": f"nonexistent_{uuid.uuid4().hex[:8]}@test.com"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"PASS: Non-existent email returns generic message: {data['message']}")


class TestLogin:
    """Tests for POST /api/auth/login with username support"""

    def test_login_with_email(self):
        """Login with email (admin: info@carryon.us) should work for unique emails"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert response.status_code == 200
        data = response.json()
        # Admin may get direct token or OTP required
        assert "access_token" in data or "otp_required" in data
        print(f"PASS: Login with email works - got {'token' if 'access_token' in data else 'OTP required'}")

    def test_login_with_username(self):
        """Login with username should work"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": ADMIN_USERNAME,  # Using username in email field
                "password": ADMIN_PASSWORD,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data or "otp_required" in data
        print(f"PASS: Login with username works - got {'token' if 'access_token' in data else 'OTP required'}")

    def test_login_invalid_credentials(self):
        """Invalid credentials return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_USERNAME, "password": "wrongpassword"}
        )
        assert response.status_code == 401
        print("PASS: Invalid credentials return 401")


class TestRegister:
    """Tests for POST /api/auth/register with username field"""

    def test_register_creates_user_with_username(self):
        """Registration creates user with username field (not email as username)"""
        unique_id = uuid.uuid4().hex[:8]
        test_username = f"testuser{unique_id}"
        test_email = f"test_{unique_id}@example.com"

        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": test_email,
                "password": "TestPass123!",
                "first_name": "Test",
                "last_name": "User",
                "username": test_username,
            },
        )
        assert response.status_code == 200
        data = response.json()

        # Verify response contains username
        assert "username" in data
        assert data["username"] == test_username
        assert "user_id" in data
        print(f"PASS: Registration creates user with username '{test_username}'")

    def test_register_auto_generates_username(self):
        """Registration auto-generates username from first+last name if not provided"""
        unique_id = uuid.uuid4().hex[:8]
        test_email = f"test_{unique_id}@example.com"

        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": test_email,
                "password": "TestPass123!",
                "first_name": "Auto",
                "last_name": f"Gen{unique_id}",
            },
        )
        assert response.status_code == 200
        data = response.json()

        # Verify username was auto-generated
        assert "username" in data
        assert data["username"] != test_email  # Should NOT be email
        assert "autogen" in data["username"].lower()  # Should be based on name
        print(f"PASS: Auto-generated username: '{data['username']}'")

    def test_register_rejects_duplicate_username(self):
        """Registration rejects duplicate username"""
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
                "password": "TestPass123!",
                "first_name": "Test",
                "last_name": "User",
                "username": ADMIN_USERNAME,  # Already taken
            },
        )
        assert response.status_code == 400
        data = response.json()
        assert "taken" in data["detail"].lower() or "already" in data["detail"].lower()
        print(f"PASS: Duplicate username rejected: {data['detail']}")


class TestRemovedEndpoints:
    """Tests for removed endpoints"""

    def test_check_benefactor_email_removed(self):
        """The old /api/auth/check-benefactor-email endpoint should return 404"""
        response = requests.post(f"{BASE_URL}/api/auth/check-benefactor-email", json={"email": "test@example.com"})
        # Should be 404 (removed) or 405 (method not allowed)
        assert response.status_code in [404, 405, 422]
        print(f"PASS: check-benefactor-email endpoint returns {response.status_code} (removed)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
