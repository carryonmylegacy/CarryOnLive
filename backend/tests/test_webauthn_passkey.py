"""
CarryOn™ WebAuthn/Passkey API Tests - Iteration 62

Tests for:
- WebAuthn register-options endpoint (requires auth)
- WebAuthn login-options endpoint (no auth required)
- Backend error handling for invalid credentials
- iOS Share Extension file existence verification
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestHealthAndBasics:
    """Health check and basic endpoint tests"""

    def test_health_check(self):
        """Backend health check returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        print(f"✓ Health check passed: {data}")

    def test_subscription_plans_endpoint(self):
        """Subscription plans endpoint returns plans"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        data = response.json()
        assert "plans" in data
        assert len(data["plans"]) > 0
        print(f"✓ Subscription plans endpoint returned {len(data['plans'])} plans")


class TestAuthenticationFlow:
    """Login authentication tests"""

    def test_login_valid_credentials(self):
        """Login with valid credentials returns token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == "fulltest@test.com"
        print(f"✓ Login successful for {data['user']['email']}")
        return data["access_token"]

    def test_login_invalid_credentials(self):
        """Login with invalid credentials returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@test.com", "password": "wrongpassword"},
        )
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected with 401")


class TestWebAuthnLoginOptions:
    """WebAuthn login-options endpoint tests (no auth required)"""

    def test_login_options_without_email(self):
        """WebAuthn login-options returns challenge without email"""
        response = requests.post(
            f"{BASE_URL}/api/auth/webauthn/login-options",
            json={"email": ""},
        )
        assert response.status_code == 200
        data = response.json()
        assert "challenge" in data
        assert "rpId" in data
        assert data["rpId"] == "carryon.us"
        assert "userVerification" in data
        assert data["userVerification"] == "required"
        print(f"✓ Login options without email returned valid challenge")

    def test_login_options_with_email(self):
        """WebAuthn login-options returns challenge with email"""
        response = requests.post(
            f"{BASE_URL}/api/auth/webauthn/login-options",
            json={"email": "fulltest@test.com"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "challenge" in data
        assert "rpId" in data
        # allowCredentials will be empty if no passkeys registered
        assert "allowCredentials" in data
        print(f"✓ Login options with email returned valid challenge")

    def test_login_options_with_nonexistent_email(self):
        """WebAuthn login-options works with nonexistent email (graceful handling)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/webauthn/login-options",
            json={"email": "nonexistent@test.com"},
        )
        # Should still return 200 with empty allowCredentials for security
        assert response.status_code == 200
        data = response.json()
        assert "challenge" in data
        assert data["allowCredentials"] == []
        print("✓ Login options with nonexistent email handled gracefully")


class TestWebAuthnRegisterOptions:
    """WebAuthn register-options endpoint tests (requires auth)"""

    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed - skipping authenticated tests")

    def test_register_options_authenticated(self, auth_token):
        """WebAuthn register-options returns valid options when authenticated"""
        response = requests.post(
            f"{BASE_URL}/api/auth/webauthn/register-options",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={},
        )
        assert response.status_code == 200
        data = response.json()

        # Verify required fields for WebAuthn registration
        assert "rp" in data
        assert data["rp"]["id"] == "carryon.us"
        assert data["rp"]["name"] == "CarryOn™"

        assert "user" in data
        assert "id" in data["user"]
        assert "name" in data["user"]
        assert "displayName" in data["user"]

        assert "challenge" in data
        assert len(data["challenge"]) > 10  # Valid base64url challenge

        assert "pubKeyCredParams" in data
        assert len(data["pubKeyCredParams"]) > 0

        assert "authenticatorSelection" in data
        assert data["authenticatorSelection"]["authenticatorAttachment"] == "platform"
        assert data["authenticatorSelection"]["userVerification"] == "required"

        print(f"✓ Register options returned valid configuration for WebAuthn")

    def test_register_options_without_auth(self):
        """WebAuthn register-options returns 401/403 without authentication"""
        response = requests.post(
            f"{BASE_URL}/api/auth/webauthn/register-options",
            json={},
        )
        # Backend returns 403 (Forbidden) for missing auth, some frameworks use 401
        assert response.status_code in [401, 403]
        print("✓ Register options correctly requires authentication")


class TestWebAuthnLogin:
    """WebAuthn login endpoint tests"""

    def test_login_with_invalid_credential(self):
        """WebAuthn login with invalid credential ID returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/webauthn/login",
            json={
                "credential": {
                    "id": "invalid-credential-id",
                    "rawId": "aW52YWxpZC1jcmVkZW50aWFsLWlk",
                    "type": "public-key",
                    "response": {
                        "authenticatorData": "dGVzdA",
                        "clientDataJSON": "dGVzdA",
                        "signature": "dGVzdA",
                    },
                },
                "email": "",
            },
        )
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print("✓ Login with invalid credential correctly rejected")


class TestWebAuthnRegister:
    """WebAuthn register endpoint tests"""

    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed - skipping authenticated tests")

    def test_register_without_challenge(self, auth_token):
        """WebAuthn register fails without prior challenge generation"""
        # This should fail because we didn't call register-options first
        # (or the challenge may have expired/been used)
        response = requests.post(
            f"{BASE_URL}/api/auth/webauthn/register",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "credential": {
                    "id": "test-credential",
                    "rawId": "dGVzdC1jcmVkZW50aWFs",
                    "type": "public-key",
                    "response": {
                        "attestationObject": "dGVzdA",
                        "clientDataJSON": "dGVzdA",
                    },
                }
            },
        )
        # Should fail with 400 (no challenge) or 400 (verification failed)
        assert response.status_code == 400
        print("✓ Register without valid challenge correctly rejected")


class TestIOSShareExtensionFiles:
    """Verify iOS Share Extension files exist and are correctly structured"""

    def test_share_extension_swift_file_exists(self):
        """ShareViewController.swift exists"""
        filepath = "/app/frontend/ios/App/ShareExtension/ShareViewController.swift"
        assert os.path.exists(filepath), f"Missing: {filepath}"

        with open(filepath, "r") as f:
            content = f.read()
            # Verify key components
            assert "class ShareViewController" in content
            assert "group.us.carryon.app" in content
            assert "handleIncomingContent" in content
            assert "saveToAppGroup" in content

        print("✓ ShareViewController.swift exists with correct structure")

    def test_share_extension_info_plist_exists(self):
        """ShareExtension Info.plist exists"""
        filepath = "/app/frontend/ios/App/ShareExtension/Info.plist"
        assert os.path.exists(filepath), f"Missing: {filepath}"

        with open(filepath, "r") as f:
            content = f.read()
            # Verify it's a share extension
            assert "com.apple.share-services" in content
            assert "NSExtensionActivationRule" in content
            assert "ShareViewController" in content

        print("✓ ShareExtension Info.plist exists with correct configuration")

    def test_share_extension_entitlements_exists(self):
        """ShareExtension.entitlements exists with app group"""
        filepath = "/app/frontend/ios/App/ShareExtension/ShareExtension.entitlements"
        assert os.path.exists(filepath), f"Missing: {filepath}"

        with open(filepath, "r") as f:
            content = f.read()
            assert "com.apple.security.application-groups" in content
            assert "group.us.carryon.app" in content

        print("✓ ShareExtension.entitlements has app group configured")

    def test_app_entitlements_has_app_group(self):
        """App.entitlements includes app group for Share Extension communication"""
        filepath = "/app/frontend/ios/App/App/App.entitlements"
        assert os.path.exists(filepath), f"Missing: {filepath}"

        with open(filepath, "r") as f:
            content = f.read()
            assert "com.apple.security.application-groups" in content
            assert "group.us.carryon.app" in content

        print("✓ App.entitlements includes app group for Share Extension")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
