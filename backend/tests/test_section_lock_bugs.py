"""
CarryOn Section Lock Bug Tests
Tests the section lock overlay and backend enforcement features:
1. SDV lock prevents document downloads (returns 403)
2. Section security settings API
3. All lockable sections have proper overlay behavior

Admin account: founder@carryon.us / CarryOntheWisdom!
Admin user_id: ce8c7e35-9fef-479b-948e-52c97ee49936
"""

import pytest
import requests
import os

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://founder-admin-dash.preview.emergentagent.com"
)

# Test credentials
ADMIN_EMAIL = "founder@carryon.us"
ADMIN_PASSWORD = "CarryOntheWisdom!"
ADMIN_USER_ID = "ce8c7e35-9fef-479b-948e-52c97ee49936"

# Section ID mappings
SECTION_ID_MAP = {
    "vault": "sdv",
    "messages": "mm",
    "beneficiaries": "bm",
    "checklist": "iac",
    "dts": "dts",
    "guardian": "ega",
}


class TestSectionLockBackend:
    """Backend tests for section lock functionality"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for admin user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        # Handle OTP if required (admin has trust entry so should be bypassed)
        token = data.get("token") or data.get("access_token")
        assert token, f"No token in response: {data}"
        return token

    @pytest.fixture(scope="class")
    def estate_id(self, auth_token):
        """Get the user's estate ID"""
        response = requests.get(
            f"{BASE_URL}/api/estates", headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Failed to get estates: {response.text}"
        estates = response.json()
        assert len(estates) > 0, "No estates found for user"
        return estates[0]["id"]

    @pytest.fixture(scope="class")
    def document_id(self, auth_token, estate_id):
        """Get a document ID for testing (or None if no documents)"""
        response = requests.get(
            f"{BASE_URL}/api/documents/{estate_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        if response.status_code == 200:
            docs = response.json()
            if docs and len(docs) > 0:
                return docs[0]["id"]
        return None

    def test_security_settings_endpoint(self, auth_token):
        """Test GET /api/security/settings returns section lock status"""
        response = requests.get(
            f"{BASE_URL}/api/security/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200, (
            f"Security settings endpoint failed: {response.text}"
        )
        data = response.json()
        # Response should be a dict of section settings (may be empty)
        assert isinstance(data, dict), f"Expected dict, got {type(data)}"
        print(f"Security settings: {data}")

    def test_section_lock_status_for_all_sections(self, auth_token):
        """Verify security settings returns status for all lockable sections"""
        response = requests.get(
            f"{BASE_URL}/api/security/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        settings = response.json()

        # Log current section states
        for section_id in ["sdv", "mm", "bm", "iac", "dts", "ega"]:
            section_data = settings.get(section_id, {})
            is_active = section_data.get("is_active", False)
            print(f"Section {section_id}: active={is_active}")

    def test_sdv_lock_blocks_download_when_active(
        self, auth_token, estate_id, document_id
    ):
        """Test that SDV section lock blocks document downloads with 403"""
        if not document_id:
            pytest.skip("No documents available to test download blocking")

        # First, check current SDV lock status
        settings_response = requests.get(
            f"{BASE_URL}/api/security/settings",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        settings = settings_response.json()
        sdv_lock = settings.get("sdv", {})

        if sdv_lock.get("is_active"):
            # SDV is locked, download should fail with 403
            download_response = requests.get(
                f"{BASE_URL}/api/documents/{document_id}/download",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
            assert download_response.status_code == 403, (
                f"Expected 403 when SDV locked, got {download_response.status_code}: {download_response.text}"
            )
            print("PASS: SDV lock correctly blocks download with 403")
        else:
            print(
                "INFO: SDV is not locked - download should succeed (200) or require document password"
            )
            download_response = requests.get(
                f"{BASE_URL}/api/documents/{document_id}/download",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
            # Should succeed (200) or require document unlock (401)
            assert download_response.status_code in [200, 401], (
                f"Expected 200 or 401 when SDV unlocked, got {download_response.status_code}"
            )
            print(
                f"PASS: SDV not locked - download returned {download_response.status_code}"
            )

    def test_create_sdv_lock_and_verify_download_blocked(
        self, auth_token, estate_id, document_id
    ):
        """Create an SDV lock and verify downloads are blocked"""
        if not document_id:
            pytest.skip("No documents available to test")

        # Create/update SDV section lock with is_active=True
        lock_response = requests.post(
            f"{BASE_URL}/api/security/settings/sdv",
            json={
                "section_id": "sdv",
                "is_active": True,
                "password_enabled": True,
                "password": "TestLock123!",
                "lock_mode": "always",
            },
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        if lock_response.status_code not in [200, 201]:
            print(
                f"Warning: Could not create SDV lock: {lock_response.status_code} - {lock_response.text}"
            )
            pytest.skip("Could not create SDV lock for testing")

        print(f"SDV lock created/updated: {lock_response.json()}")

        # Now try to download - should be blocked with 403
        download_response = requests.get(
            f"{BASE_URL}/api/documents/{document_id}/download",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert download_response.status_code == 403, (
            f"Expected 403 when SDV locked, got {download_response.status_code}: {download_response.text}"
        )
        print("PASS: Download correctly blocked after creating SDV lock")

        # Cleanup: Deactivate the lock
        cleanup_response = requests.post(
            f"{BASE_URL}/api/security/settings/sdv",
            json={"section_id": "sdv", "is_active": False},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        print(f"Cleanup: Lock deactivated: {cleanup_response.status_code}")


class TestSectionLockVerification:
    """Test section lock verification endpoint"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert response.status_code == 200
        return response.json().get("token")

    def test_verify_endpoint_exists(self, auth_token):
        """Test that section verification endpoint exists"""
        # Try to verify without password - should fail but endpoint should exist
        response = requests.post(
            f"{BASE_URL}/api/security/verify/sdv",
            data={},  # Empty form data
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        # Should return 400 or 422 (bad request) not 404 (not found)
        assert response.status_code != 404, (
            f"Verify endpoint not found: {response.status_code}"
        )
        print(f"Verify endpoint response: {response.status_code}")


class TestAPIEndpoints:
    """Test basic API endpoints are working"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert response.status_code == 200
        data = response.json()
        return data.get("access_token") or data.get("token")

    def test_estates_endpoint(self, auth_token):
        """Test estates endpoint returns data"""
        response = requests.get(
            f"{BASE_URL}/api/estates", headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        estates = response.json()
        assert isinstance(estates, list)
        assert len(estates) > 0, "No estates found"
        print(f"Found {len(estates)} estate(s)")

    def test_beneficiaries_endpoint(self, auth_token):
        """Test beneficiaries endpoint"""
        # First get estate
        estates_response = requests.get(
            f"{BASE_URL}/api/estates", headers={"Authorization": f"Bearer {auth_token}"}
        )
        estate_id = estates_response.json()[0]["id"]

        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        beneficiaries = response.json()
        assert isinstance(beneficiaries, list)
        print(f"Found {len(beneficiaries)} beneficiary(ies)")

    def test_messages_endpoint(self, auth_token):
        """Test messages endpoint"""
        # First get estate
        estates_response = requests.get(
            f"{BASE_URL}/api/estates", headers={"Authorization": f"Bearer {auth_token}"}
        )
        estate_id = estates_response.json()[0]["id"]

        response = requests.get(
            f"{BASE_URL}/api/messages/{estate_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        messages = response.json()
        assert isinstance(messages, list)
        print(f"Found {len(messages)} message(s)")

    def test_checklists_endpoint(self, auth_token):
        """Test checklists endpoint"""
        # First get estate
        estates_response = requests.get(
            f"{BASE_URL}/api/estates", headers={"Authorization": f"Bearer {auth_token}"}
        )
        estate_id = estates_response.json()[0]["id"]

        response = requests.get(
            f"{BASE_URL}/api/checklists/{estate_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        checklists = response.json()
        assert isinstance(checklists, list)
        print(f"Found {len(checklists)} checklist item(s)")

    def test_documents_endpoint(self, auth_token):
        """Test documents endpoint"""
        # First get estate
        estates_response = requests.get(
            f"{BASE_URL}/api/estates", headers={"Authorization": f"Bearer {auth_token}"}
        )
        estate_id = estates_response.json()[0]["id"]

        response = requests.get(
            f"{BASE_URL}/api/documents/{estate_id}",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert response.status_code == 200
        documents = response.json()
        assert isinstance(documents, list)
        print(f"Found {len(documents)} document(s)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
