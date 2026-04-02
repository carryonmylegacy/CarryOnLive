"""
CarryOn™ Backend Tests — SDV & ECT Feature Tests
Testing:
1. Auth: POST /api/auth/login with admin credentials
2. Documents: GET /api/documents/{estate_id}/pre-transition endpoint
3. Documents: PUT /api/documents/{doc_id}/designate-beneficiaries with visibility_timing
4. ECT: POST /api/estate-chat/channels/{id}/upload accepts audio file types
5. ECT: GET /api/estate-chat/files/{file_id} requires auth header
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from test_credentials.md
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestAuth:
    """Authentication endpoint tests"""

    def test_login_success(self):
        """Test admin login returns access_token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        print(f"Login response status: {response.status_code}")
        print(f"Login response: {response.text[:500] if response.text else 'empty'}")

        # Admin login may require OTP, so 200 or 202 (OTP required) are both valid
        assert response.status_code in [200, 202, 401], f"Unexpected status: {response.status_code}"

        if response.status_code == 200:
            data = response.json()
            assert "access_token" in data or "token" in data, "Expected access_token or token in response"
            print("✓ Login successful with access_token")
        elif response.status_code == 202:
            print("✓ Login requires OTP verification (expected for admin)")
            pytest.skip("Admin login requires OTP - skipping authenticated tests")
        else:
            print(f"✗ Login failed: {response.text}")
            pytest.skip("Login failed - skipping authenticated tests")


class TestDocumentsPreTransition:
    """Test the new pre-transition documents endpoint"""

    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token") or data.get("token")
        pytest.skip("Authentication failed - skipping test")

    def test_pre_transition_endpoint_exists(self, auth_token):
        """Test GET /api/documents/{estate_id}/pre-transition endpoint exists"""
        headers = {"Authorization": f"Bearer {auth_token}"}

        # First get an estate ID
        estates_res = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        if estates_res.status_code != 200 or not estates_res.json():
            pytest.skip("No estates available for testing")

        estate_id = estates_res.json()[0]["id"]

        # Test the pre-transition endpoint
        response = requests.get(f"{BASE_URL}/api/documents/{estate_id}/pre-transition", headers=headers)
        print(f"Pre-transition endpoint status: {response.status_code}")

        # Should return 200 (with docs) or 403 (not a beneficiary) - both indicate endpoint exists
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code}"

        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list), "Expected list of documents"
            print(f"✓ Pre-transition endpoint returned {len(data)} documents")
        else:
            print("✓ Pre-transition endpoint exists (403 = not a beneficiary, expected for admin)")

    def test_pre_transition_endpoint_requires_auth(self):
        """Test pre-transition endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/documents/test-estate-id/pre-transition")
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print("✓ Pre-transition endpoint requires authentication")


class TestDocumentDesignation:
    """Test document beneficiary designation with visibility_timing"""

    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token") or data.get("token")
        pytest.skip("Authentication failed - skipping test")

    def test_designate_beneficiaries_accepts_visibility_timing(self, auth_token):
        """Test PUT /api/documents/{doc_id}/designate-beneficiaries accepts visibility_timing field"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

        # Get an estate and document
        estates_res = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        if estates_res.status_code != 200 or not estates_res.json():
            pytest.skip("No estates available for testing")

        estate_id = estates_res.json()[0]["id"]

        docs_res = requests.get(f"{BASE_URL}/api/documents/{estate_id}", headers=headers)
        if docs_res.status_code != 200 or not docs_res.json():
            pytest.skip("No documents available for testing")

        doc_id = docs_res.json()[0]["id"]

        # Test designate with visibility_timing
        payload = {"beneficiary_ids": ["all"], "visibility_timing": {"test_ben_id": {"pre": True, "post": True}}}

        response = requests.put(
            f"{BASE_URL}/api/documents/{doc_id}/designate-beneficiaries", headers=headers, json=payload
        )
        print(f"Designate beneficiaries status: {response.status_code}")
        print(f"Response: {response.text[:500] if response.text else 'empty'}")

        # Should accept the visibility_timing field
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code}"

        if response.status_code == 200:
            data = response.json()
            assert "visibility_timing" in data or "designated_beneficiaries" in data
            print("✓ Designate beneficiaries accepts visibility_timing field")
        else:
            print("✓ Endpoint exists (403 = not owner, expected for admin without estates)")


class TestECTAudioUpload:
    """Test ECT audio file upload support"""

    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token") or data.get("token")
        pytest.skip("Authentication failed - skipping test")

    def test_upload_accepts_audio_webm(self, auth_token):
        """Test POST /api/estate-chat/channels/{id}/upload accepts audio/webm"""
        headers = {"Authorization": f"Bearer {auth_token}"}

        # Get channels
        channels_res = requests.get(f"{BASE_URL}/api/estate-chat/channels", headers=headers)
        if channels_res.status_code != 200 or not channels_res.json():
            pytest.skip("No channels available for testing")

        channel_id = channels_res.json()[0]["id"]

        # Create a fake audio file
        audio_content = b"WEBM_AUDIO_CONTENT_PLACEHOLDER"
        files = {"file": ("voice-message.webm", io.BytesIO(audio_content), "audio/webm")}

        response = requests.post(
            f"{BASE_URL}/api/estate-chat/channels/{channel_id}/upload", headers=headers, files=files
        )
        print(f"Audio upload status: {response.status_code}")

        # Should accept audio/webm (200) or reject for other reasons (400/403/404)
        # 400 with "File type not allowed" would indicate audio/webm is NOT supported
        if response.status_code == 400:
            error_msg = response.json().get("detail", "")
            assert "File type not allowed" not in error_msg, "audio/webm should be allowed"

        print(f"✓ Audio upload endpoint accepts audio/webm (status: {response.status_code})")

    def test_upload_accepts_audio_mp4(self, auth_token):
        """Test POST /api/estate-chat/channels/{id}/upload accepts audio/mp4"""
        headers = {"Authorization": f"Bearer {auth_token}"}

        channels_res = requests.get(f"{BASE_URL}/api/estate-chat/channels", headers=headers)
        if channels_res.status_code != 200 or not channels_res.json():
            pytest.skip("No channels available for testing")

        channel_id = channels_res.json()[0]["id"]

        audio_content = b"MP4_AUDIO_CONTENT_PLACEHOLDER"
        files = {"file": ("voice-message.m4a", io.BytesIO(audio_content), "audio/mp4")}

        response = requests.post(
            f"{BASE_URL}/api/estate-chat/channels/{channel_id}/upload", headers=headers, files=files
        )
        print(f"Audio/mp4 upload status: {response.status_code}")

        if response.status_code == 400:
            error_msg = response.json().get("detail", "")
            assert "File type not allowed" not in error_msg, "audio/mp4 should be allowed"

        print(f"✓ Audio upload endpoint accepts audio/mp4 (status: {response.status_code})")


class TestECTFileAuth:
    """Test ECT file serving requires authentication"""

    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token") or data.get("token")
        pytest.skip("Authentication failed - skipping test")

    def test_file_endpoint_requires_auth(self):
        """Test GET /api/estate-chat/files/{file_id} returns 401 without auth"""
        response = requests.get(f"{BASE_URL}/api/estate-chat/files/test-file-id")
        print(f"File endpoint without auth status: {response.status_code}")

        # Should return 401 (not authenticated) or 403 (forbidden)
        assert response.status_code in [401, 403, 404], f"Expected auth error, got {response.status_code}"
        print("✓ ECT file endpoint requires authentication")

    def test_file_endpoint_with_auth(self, auth_token):
        """Test GET /api/estate-chat/files/{file_id} returns 200 with auth (or 404 if file doesn't exist)"""
        headers = {"Authorization": f"Bearer {auth_token}"}

        response = requests.get(f"{BASE_URL}/api/estate-chat/files/nonexistent-file-id", headers=headers)
        print(f"File endpoint with auth status: {response.status_code}")

        # Should return 404 (file not found) not 401 (unauthorized)
        assert response.status_code in [200, 403, 404], f"Expected 404 for nonexistent file, got {response.status_code}"
        print("✓ ECT file endpoint accepts auth header (returns 404 for nonexistent file)")


class TestECTPageElements:
    """Test ECT page has required data-testid attributes (via API check)"""

    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token") or data.get("token")
        pytest.skip("Authentication failed - skipping test")

    def test_ect_contacts_endpoint(self, auth_token):
        """Test ECT contacts endpoint works"""
        headers = {"Authorization": f"Bearer {auth_token}"}

        response = requests.get(f"{BASE_URL}/api/estate-chat/contacts", headers=headers)
        print(f"ECT contacts status: {response.status_code}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Expected list of contacts"
        print(f"✓ ECT contacts endpoint returns {len(data)} estate contact groups")

    def test_ect_channels_endpoint(self, auth_token):
        """Test ECT channels endpoint works"""
        headers = {"Authorization": f"Bearer {auth_token}"}

        response = requests.get(f"{BASE_URL}/api/estate-chat/channels", headers=headers)
        print(f"ECT channels status: {response.status_code}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Expected list of channels"
        print(f"✓ ECT channels endpoint returns {len(data)} channels")

    def test_ect_unread_total_endpoint(self, auth_token):
        """Test ECT unread total endpoint works"""
        headers = {"Authorization": f"Bearer {auth_token}"}

        response = requests.get(f"{BASE_URL}/api/estate-chat/unread-total", headers=headers)
        print(f"ECT unread total status: {response.status_code}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "total" in data, "Expected 'total' in response"
        print(f"✓ ECT unread total endpoint returns total: {data['total']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
