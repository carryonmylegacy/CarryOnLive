"""
Test Suite: Beneficiary Auto-Invite & Benefactor Prompt Features (Iteration 127)

Tests:
1. POST /api/beneficiaries returns auto_invited: true when email is provided
2. POST /api/beneficiaries returns auto_invited: false when no email is provided
3. GET /api/auth/me returns hide_benefactor_reminder field
4. PUT /api/auth/profile accepts hide_benefactor_reminder field
"""

import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestBeneficiaryAutoInvite:
    """Test auto-invitation feature when creating beneficiaries"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin and get token"""
        # First login to get OTP requirement
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )

        if login_resp.status_code == 200:
            data = login_resp.json()
            # Check if OTP is required
            if data.get("otp_required"):
                # Use demo OTP bypass
                otp_resp = requests.post(
                    f"{BASE_URL}/api/auth/verify-otp", json={"email": ADMIN_EMAIL, "otp": "000000", "trust_today": True}
                )
                if otp_resp.status_code == 200:
                    return otp_resp.json().get("access_token")
                pytest.skip(f"OTP verification failed: {otp_resp.status_code}")
            elif data.get("access_token"):
                return data["access_token"]

        pytest.skip(f"Login failed: {login_resp.status_code} - {login_resp.text}")

    @pytest.fixture(scope="class")
    def estate_id(self, admin_token):
        """Get the admin's estate ID"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        resp = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        assert resp.status_code == 200, f"Failed to get estates: {resp.text}"
        estates = resp.json()
        owned = [
            e
            for e in estates
            if e.get("user_role_in_estate") == "owner"
            or (not e.get("user_role_in_estate") and not e.get("is_beneficiary_estate"))
        ]
        assert len(owned) > 0, "No owned estate found for admin"
        return owned[0]["id"]

    def test_create_beneficiary_with_email_returns_auto_invited_true(self, admin_token, estate_id):
        """POST /api/beneficiaries returns auto_invited: true when email is provided"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        unique_email = f"test_auto_invite_{uuid.uuid4().hex[:8]}@example.com"

        payload = {
            "estate_id": estate_id,
            "first_name": "AutoInvite",
            "last_name": "TestBen",
            "email": unique_email,
            "relation": "Friend",
        }

        resp = requests.post(f"{BASE_URL}/api/beneficiaries", json=payload, headers=headers)
        assert resp.status_code == 200, f"Create beneficiary failed: {resp.text}"

        data = resp.json()
        assert "auto_invited" in data, "Response should contain auto_invited field"
        assert data["auto_invited"] is True, (
            f"auto_invited should be true when email provided, got {data['auto_invited']}"
        )
        assert data.get("invitation_token") is not None, "Should have invitation_token when email provided"
        assert data.get("invitation_status") == "pending", (
            f"invitation_status should be pending, got {data.get('invitation_status')}"
        )

        # Cleanup
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/beneficiaries/{data['id']}", headers=headers)

    def test_create_beneficiary_without_email_is_rejected(self, admin_token, estate_id):
        """POST /api/beneficiaries rejects requests without valid email (email is required)"""
        headers = {"Authorization": f"Bearer {admin_token}"}

        payload = {
            "estate_id": estate_id,
            "first_name": "NoEmail",
            "last_name": "TestBen",
            "email": "",  # Empty email
            "relation": "Friend",
        }

        resp = requests.post(f"{BASE_URL}/api/beneficiaries", json=payload, headers=headers)
        # Email is required per the BeneficiaryCreate model, so this should fail validation
        assert resp.status_code == 422, f"Should reject empty email, got: {resp.status_code}"

        # Also test with None (omitted email)
        payload_no_email = {
            "estate_id": estate_id,
            "first_name": "NoEmail",
            "last_name": "TestBen",
            "relation": "Friend",
        }
        resp2 = requests.post(f"{BASE_URL}/api/beneficiaries", json=payload_no_email, headers=headers)
        assert resp2.status_code == 422, f"Should reject missing email, got: {resp2.status_code}"

    def test_invitation_token_generated_for_beneficiary_with_email(self, admin_token, estate_id):
        """Invitation token is generated for beneficiaries with emails during creation"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        unique_email = f"test_token_{uuid.uuid4().hex[:8]}@example.com"

        payload = {
            "estate_id": estate_id,
            "first_name": "TokenTest",
            "last_name": "Beneficiary",
            "email": unique_email,
            "relation": "Other",
        }

        resp = requests.post(f"{BASE_URL}/api/beneficiaries", json=payload, headers=headers)
        assert resp.status_code == 200, f"Create beneficiary failed: {resp.text}"

        data = resp.json()
        assert "invitation_token" in data, "Response should contain invitation_token"
        assert data["invitation_token"] is not None, "invitation_token should not be None"
        assert len(data["invitation_token"]) > 10, "invitation_token should be a valid UUID-like string"

        # Cleanup
        if data.get("id"):
            requests.delete(f"{BASE_URL}/api/beneficiaries/{data['id']}", headers=headers)


class TestBenefactorReminderSettings:
    """Test hide_benefactor_reminder field in user profile"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin and get token"""
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )

        if login_resp.status_code == 200:
            data = login_resp.json()
            if data.get("otp_required"):
                otp_resp = requests.post(
                    f"{BASE_URL}/api/auth/verify-otp", json={"email": ADMIN_EMAIL, "otp": "000000", "trust_today": True}
                )
                if otp_resp.status_code == 200:
                    return otp_resp.json().get("access_token")
                pytest.skip(f"OTP verification failed: {otp_resp.status_code}")
            elif data.get("access_token"):
                return data["access_token"]

        pytest.skip(f"Login failed: {login_resp.status_code}")

    def test_auth_me_returns_hide_benefactor_reminder(self, admin_token):
        """GET /api/auth/me returns hide_benefactor_reminder field"""
        headers = {"Authorization": f"Bearer {admin_token}"}

        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert resp.status_code == 200, f"GET /api/auth/me failed: {resp.text}"

        data = resp.json()
        assert "hide_benefactor_reminder" in data, "Response should contain hide_benefactor_reminder field"
        assert isinstance(data["hide_benefactor_reminder"], bool), "hide_benefactor_reminder should be a boolean"

    def test_update_profile_accepts_hide_benefactor_reminder(self, admin_token):
        """PUT /api/auth/profile accepts hide_benefactor_reminder field"""
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Get current value
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_resp.status_code == 200
        me_resp.json().get("hide_benefactor_reminder", False)

        # Set to true
        update_resp = requests.put(
            f"{BASE_URL}/api/auth/profile", json={"hide_benefactor_reminder": True}, headers=headers
        )
        assert update_resp.status_code == 200, f"PUT /api/auth/profile failed: {update_resp.text}"

        # Verify it was set
        verify_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert verify_resp.status_code == 200
        assert verify_resp.json().get("hide_benefactor_reminder") is True, (
            "hide_benefactor_reminder should be True after update"
        )

        # Set back to false
        restore_resp = requests.put(
            f"{BASE_URL}/api/auth/profile", json={"hide_benefactor_reminder": False}, headers=headers
        )
        assert restore_resp.status_code == 200

        # Verify restored
        final_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert final_resp.status_code == 200
        assert final_resp.json().get("hide_benefactor_reminder") is False, (
            "hide_benefactor_reminder should be False after restore"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
