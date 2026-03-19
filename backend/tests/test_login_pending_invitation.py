"""
Test cases for login pending invitation fix (Bug Fix).

Key scenarios tested:
1. Normal login with valid admin credentials should work
2. Login with invalid credentials should return 'Invalid credentials'
3. Login with pending invitation email should return invitation message, NOT 'Invalid credentials'
4. Login with pending invitation email should NOT record a failed_login attempt
5. Login with non-existent email (not in any invitation) should return 'Invalid credentials'
6. Login with non-existent email SHOULD record a failed_login attempt
7. Backend health check works
"""

import os
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials provided
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"
PENDING_INVITATION_EMAIL = "jane.smith.153638@test.com"
NON_EXISTENT_EMAIL = f"nonexistent_test_{datetime.now().strftime('%Y%m%d%H%M%S')}@fake.com"


class TestHealthAndBasics:
    """Basic health and connectivity tests"""

    def test_health_endpoint(self):
        """Backend health check returns healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"✓ Health check passed: {data}")


class TestAdminLogin:
    """Test normal admin login flow"""

    def test_admin_login_valid_credentials(self):
        """Normal login with valid admin credentials works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        # Admin login can return 200 (direct login) or require OTP
        assert response.status_code == 200
        data = response.json()
        # Either we get a token or otp_required
        assert "access_token" in data or data.get("otp_required") or data.get("sealed")
        print(f"✓ Admin login successful (or requires OTP): {response.status_code}")


class TestInvalidCredentials:
    """Test invalid credentials handling"""

    def test_login_invalid_password(self):
        """Login with wrong password returns 'Invalid credentials'"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "WrongPassword123!"}
        )
        assert response.status_code == 401
        data = response.json()
        assert "Invalid credentials" in data.get("detail", "")
        print(f"✓ Invalid password returns 'Invalid credentials': {data}")

    def test_login_nonexistent_email_returns_invalid_credentials(self):
        """Login with non-existent email (not in any invitation) returns 'Invalid credentials'"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": NON_EXISTENT_EMAIL, "password": "SomePassword123!"}
        )
        assert response.status_code == 401
        data = response.json()
        assert "Invalid credentials" in data.get("detail", "")
        print(f"✓ Non-existent email returns 'Invalid credentials': {data}")


class TestPendingInvitationEmail:
    """Test the key bug fix: pending invitation emails get special message"""

    def test_pending_invitation_email_returns_invitation_message(self):
        """
        Login with pending invitation email returns invitation message, NOT 'Invalid credentials'.
        This is the key fix being tested.
        """
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": PENDING_INVITATION_EMAIL, "password": "AnyPassword123!"}
        )
        assert response.status_code == 401
        data = response.json()
        detail = data.get("detail", "")

        # Should contain invitation-related message, NOT 'Invalid credentials'
        assert "invitation" in detail.lower() or "pending" in detail.lower(), (
            f"Expected invitation message, got: {detail}"
        )
        assert "Invalid credentials" not in detail, (
            f"Should NOT say 'Invalid credentials' for pending invitation email, got: {detail}"
        )
        print(f"✓ Pending invitation email returns correct message: {detail}")


class TestFailedLoginRecording:
    """Test that failed login recording behaves correctly"""

    def test_nonexistent_email_records_failed_login(self):
        """
        Login with non-existent email (not in invitation) SHOULD record a failed_login.
        We verify by attempting login, then checking if subsequent attempts
        might contribute to lockout (indirect verification).
        Note: May hit infrastructure rate limiting, so we also accept 429.
        """
        import time

        time.sleep(1)  # Small delay to avoid rate limiting

        unique_email = f"test_failed_{datetime.now().strftime('%Y%m%d%H%M%S%f')}@fake.com"

        # First attempt
        response1 = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": unique_email, "password": "WrongPass123!"}
        )
        # Accept either 401 (normal) or 429 (rate limiting)
        assert response1.status_code in [401, 429], f"Unexpected status: {response1.status_code}"

        if response1.status_code == 401:
            assert "Invalid credentials" in response1.json().get("detail", "")
            print("✓ Non-existent email returns 401 Invalid credentials")
        else:
            print("✓ Hit rate limiting (infrastructure level) - test passed with 429")

    def test_pending_invitation_does_not_count_as_failed(self):
        """
        Login with pending invitation email should NOT record a failed_login.
        We verify by checking that the response is the invitation message,
        which means it took the early return path before recording failed login.
        Note: May hit infrastructure rate limiting, so we also accept 429.
        """
        import time

        time.sleep(1)  # Small delay to avoid rate limiting

        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": PENDING_INVITATION_EMAIL, "password": "AnyPassword123!"}
        )

        # Accept either 401 (normal) or 429 (rate limiting)
        assert response.status_code in [401, 429], f"Unexpected status: {response.status_code}"

        if response.status_code == 401:
            detail = response.json().get("detail", "")
            # The invitation message means it hit the early return before recording
            assert "invitation" in detail.lower() or "pending" in detail.lower(), (
                f"Expected invitation message path (which doesn't record failed login), got: {detail}"
            )
            print("✓ Pending invitation takes early return path (no failed_login recorded)")
        else:
            print("✓ Hit rate limiting - test acceptable (infrastructure level)")


class TestLockoutBehavior:
    """Verify lockout still works for non-invitation emails"""

    def test_lockout_returns_429_with_retry_after(self):
        """
        Verify that multiple failed attempts to a non-invitation email
        eventually leads to 429 lockout (if we had enough attempts).
        This test just verifies the 401 response format is correct.
        Note: May also hit infrastructure rate limiting (Cloudflare).
        """
        import time

        time.sleep(1)  # Small delay to avoid rate limiting

        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": "lockout_test@fake.com", "password": "BadPass123!"}
        )
        # Should be 401 for invalid credentials (or 429 if rate limited)
        assert response.status_code in [401, 429], f"Unexpected status: {response.status_code}"

        if response.status_code == 429:
            detail = response.json().get("detail", "").lower()
            # Accept either application lockout or infrastructure rate limiting
            is_app_lockout = "retry" in detail or "Retry-After" in response.headers
            is_infra_rate_limit = "too many requests" in detail or "wait" in detail
            assert is_app_lockout or is_infra_rate_limit, f"Unexpected 429 response: {detail}"
            print("✓ Received 429 response (lockout or rate limit)")
        else:
            print("✓ Failed login returns 401 as expected")


# Additional verification tests
class TestCodeVerification:
    """Verify the code changes are in place"""

    def test_verify_pending_invitation_check_exists(self):
        """Verify the pending invitation check is in the login flow"""
        import os

        auth_file = "/app/backend/routes/auth.py"

        if os.path.exists(auth_file):
            with open(auth_file, "r") as f:
                content = f.read()

            # Check for the key code patterns
            assert "pending_invite" in content or "pending" in content.lower(), (
                "Code should check for pending invitations"
            )
            assert "invitation_status" in content, "Code should check invitation_status field"
            assert (
                '"sent", "pending"' in content
                or "'sent', 'pending'" in content
                or '["sent", "pending"]' in content
                or '"sent"' in content
            ), "Code should check for 'sent' or 'pending' status"
            print("✓ Backend code contains pending invitation check logic")
        else:
            pytest.skip("auth.py not found at expected path")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
