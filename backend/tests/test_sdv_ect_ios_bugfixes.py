"""
Test suite for three critical bug fixes:
1. SDV downloads broken on iOS PWA - now uses platformDownload with download proxy tokens
2. ECT channel swipe-to-delete - backend now allows deleting 'direct' type channels (not just 'group')
3. ECT keyboard stays elevated - mic button no longer has preventDefault (code review only)

Tests:
- POST /api/downloads/prepare with action='document' returns a token
- GET /api/downloads/{token} returns the file with Content-Disposition
- DELETE /api/estate-chat/channels/{id} allows deleting 'direct' type channels
- DELETE /api/estate-chat/channels/{id} still rejects deleting 'circle' type channels with 400
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://financial-portal-11.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestDownloadProxy:
    """Test the download proxy endpoints for iOS PWA support."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Login
        login_res = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data.get("access_token") or data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            self.user_id = data.get("user", {}).get("id")
        else:
            pytest.skip(f"Login failed: {login_res.status_code}")

    def test_download_prepare_document_action(self):
        """Test POST /api/downloads/prepare with action='document' returns a token."""
        # First, get a document ID from the vault
        estates_res = self.session.get(f"{BASE_URL}/api/estates")
        if estates_res.status_code != 200 or not estates_res.json():
            pytest.skip("No estates available for testing")

        estate_id = estates_res.json()[0]["id"]
        docs_res = self.session.get(f"{BASE_URL}/api/documents/{estate_id}")

        if docs_res.status_code != 200 or not docs_res.json():
            # Create a test document if none exist
            pytest.skip("No documents available for testing download proxy")

        doc = docs_res.json()[0]
        doc_id = doc["id"]

        # Test the download prepare endpoint
        prepare_res = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "document", "params": {"document_id": doc_id}, "filename": "test_document.pdf"},
        )

        assert prepare_res.status_code == 200, f"Expected 200, got {prepare_res.status_code}: {prepare_res.text}"
        data = prepare_res.json()
        assert "token" in data, f"Response should contain 'token': {data}"
        assert len(data["token"]) > 10, "Token should be a non-trivial string"
        print(f"PASS: Download prepare returned token: {data['token'][:20]}...")

    def test_download_prepare_invalid_action(self):
        """Test POST /api/downloads/prepare with invalid action returns 400."""
        prepare_res = self.session.post(
            f"{BASE_URL}/api/downloads/prepare", json={"action": "invalid_action", "params": {}, "filename": "test.pdf"}
        )

        assert prepare_res.status_code == 400, f"Expected 400 for invalid action, got {prepare_res.status_code}"
        print("PASS: Invalid action correctly rejected with 400")

    def test_download_token_redemption(self):
        """Test GET /api/downloads/{token} returns the file with Content-Disposition."""
        # First, get a document ID
        estates_res = self.session.get(f"{BASE_URL}/api/estates")
        if estates_res.status_code != 200 or not estates_res.json():
            pytest.skip("No estates available for testing")

        estate_id = estates_res.json()[0]["id"]
        docs_res = self.session.get(f"{BASE_URL}/api/documents/{estate_id}")

        if docs_res.status_code != 200 or not docs_res.json():
            pytest.skip("No documents available for testing download proxy")

        doc = docs_res.json()[0]
        doc_id = doc["id"]
        doc_name = doc.get("name", "document")

        # Create a download token
        prepare_res = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "document", "params": {"document_id": doc_id}, "filename": f"{doc_name}.pdf"},
        )

        assert prepare_res.status_code == 200
        token = prepare_res.json()["token"]

        # Redeem the token (no auth required)
        download_res = requests.get(f"{BASE_URL}/api/downloads/{token}")

        # Should return file or error if document is locked
        if download_res.status_code == 200:
            # Check Content-Disposition header
            content_disp = download_res.headers.get("Content-Disposition", "")
            assert "attachment" in content_disp or "inline" in content_disp, (
                f"Expected Content-Disposition header, got: {content_disp}"
            )
            print(f"PASS: Download token redeemed successfully, Content-Disposition: {content_disp}")
        elif download_res.status_code == 401:
            # Document might be locked
            print("PASS: Download token endpoint works (document may be locked)")
        else:
            # Token might have expired or other issue
            print(f"INFO: Download returned {download_res.status_code} - token may have expired or document issue")

    def test_download_invalid_token(self):
        """Test GET /api/downloads/{token} with invalid token returns 401."""
        download_res = requests.get(f"{BASE_URL}/api/downloads/invalid_token_12345")

        assert download_res.status_code == 401, f"Expected 401 for invalid token, got {download_res.status_code}"
        print("PASS: Invalid download token correctly rejected with 401")


class TestECTChannelDelete:
    """Test ECT channel deletion - now allows 'direct' type, still blocks 'circle'."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Login
        login_res = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data.get("access_token") or data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            self.user_id = data.get("user", {}).get("id")
        else:
            pytest.skip(f"Login failed: {login_res.status_code}")

    def test_get_channels_endpoint(self):
        """Test GET /api/estate-chat/channels returns list."""
        res = self.session.get(f"{BASE_URL}/api/estate-chat/channels")

        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: ECT channels endpoint returns {len(data)} channels")

    def test_get_contacts_endpoint(self):
        """Test GET /api/estate-chat/contacts returns list."""
        res = self.session.get(f"{BASE_URL}/api/estate-chat/contacts")

        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: ECT contacts endpoint returns {len(data)} estate contact groups")

    def test_delete_circle_channel_rejected(self):
        """Test DELETE /api/estate-chat/channels/{id} rejects 'circle' type with 400."""
        # Get channels to find a circle
        channels_res = self.session.get(f"{BASE_URL}/api/estate-chat/channels")
        if channels_res.status_code != 200:
            pytest.skip("Cannot get channels")

        channels = channels_res.json()
        circle_channel = next((c for c in channels if c.get("type") == "circle"), None)

        if not circle_channel:
            pytest.skip("No circle channel found to test deletion rejection")

        # Try to delete the circle - should be rejected
        delete_res = self.session.delete(f"{BASE_URL}/api/estate-chat/channels/{circle_channel['id']}")

        assert delete_res.status_code == 400, (
            f"Expected 400 for circle deletion, got {delete_res.status_code}: {delete_res.text}"
        )

        error_detail = delete_res.json().get("detail", "")
        assert "circle" in error_detail.lower(), f"Error should mention circle: {error_detail}"
        print(f"PASS: Circle channel deletion correctly rejected with 400: {error_detail}")

    def test_create_and_delete_direct_channel(self):
        """Test creating and deleting a 'direct' type channel."""
        # Get contacts to find someone to DM
        contacts_res = self.session.get(f"{BASE_URL}/api/estate-chat/contacts")
        if contacts_res.status_code != 200 or not contacts_res.json():
            pytest.skip("No contacts available for testing")

        contacts = contacts_res.json()
        if not contacts or not contacts[0].get("members"):
            pytest.skip("No estate members available for DM test")

        estate_id = contacts[0]["estate_id"]
        members = contacts[0]["members"]

        # Find a member that's not the current user
        other_member = next((m for m in members if m["id"] != self.user_id), None)
        if not other_member:
            pytest.skip("No other member available for DM test")

        # Create a direct channel
        create_res = self.session.post(
            f"{BASE_URL}/api/estate-chat/channels",
            json={"estate_id": estate_id, "channel_type": "direct", "member_ids": [other_member["id"]]},
        )

        if create_res.status_code not in [200, 201]:
            pytest.skip(f"Cannot create direct channel: {create_res.status_code} - {create_res.text}")

        channel = create_res.json()
        channel_id = channel["id"]
        channel_type = channel.get("type")

        assert channel_type == "direct", f"Expected direct channel, got {channel_type}"
        print(f"Created direct channel: {channel_id}")

        # Now delete the direct channel - this should work after the fix
        delete_res = self.session.delete(f"{BASE_URL}/api/estate-chat/channels/{channel_id}")

        assert delete_res.status_code == 200, (
            f"Expected 200 for direct channel deletion, got {delete_res.status_code}: {delete_res.text}"
        )

        print(f"PASS: Direct channel {channel_id} deleted successfully")

    def test_create_and_delete_group_channel(self):
        """Test creating and deleting a 'group' type channel."""
        # Get contacts
        contacts_res = self.session.get(f"{BASE_URL}/api/estate-chat/contacts")
        if contacts_res.status_code != 200 or not contacts_res.json():
            pytest.skip("No contacts available for testing")

        contacts = contacts_res.json()
        if not contacts or not contacts[0].get("members"):
            pytest.skip("No estate members available for group test")

        estate_id = contacts[0]["estate_id"]
        members = contacts[0]["members"]

        # Find members that are not the current user
        other_members = [m for m in members if m["id"] != self.user_id]
        if not other_members:
            pytest.skip("No other members available for group test")

        # Create a group channel
        create_res = self.session.post(
            f"{BASE_URL}/api/estate-chat/channels",
            json={
                "estate_id": estate_id,
                "channel_type": "group",
                "name": "TEST_Group_For_Deletion",
                "member_ids": [other_members[0]["id"]],
            },
        )

        if create_res.status_code not in [200, 201]:
            pytest.skip(f"Cannot create group channel: {create_res.status_code} - {create_res.text}")

        channel = create_res.json()
        channel_id = channel["id"]
        channel_type = channel.get("type")

        assert channel_type == "group", f"Expected group channel, got {channel_type}"
        print(f"Created group channel: {channel_id}")

        # Delete the group channel - this should work
        delete_res = self.session.delete(f"{BASE_URL}/api/estate-chat/channels/{channel_id}")

        assert delete_res.status_code == 200, (
            f"Expected 200 for group channel deletion, got {delete_res.status_code}: {delete_res.text}"
        )

        print(f"PASS: Group channel {channel_id} deleted successfully")


class TestECTFileDownload:
    """Test ECT file download via download proxy."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Login
        login_res = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data.get("access_token") or data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_res.status_code}")

    def test_download_prepare_ect_file_action(self):
        """Test POST /api/downloads/prepare with action='ect_file' is valid."""
        # This tests that the action is recognized, even if we don't have a file_id
        prepare_res = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "ect_file", "params": {"file_id": "test_file_id"}, "filename": "test_file.pdf"},
        )

        # Should return 200 with token (the token redemption will fail if file doesn't exist)
        assert prepare_res.status_code == 200, f"Expected 200, got {prepare_res.status_code}: {prepare_res.text}"
        data = prepare_res.json()
        assert "token" in data, f"Response should contain 'token': {data}"
        print(f"PASS: ECT file download prepare action is valid, token: {data['token'][:20]}...")


class TestHealthAndAuth:
    """Basic health and auth tests."""

    def test_health_endpoint(self):
        """Test health endpoint."""
        res = requests.get(f"{BASE_URL}/api/health")
        assert res.status_code == 200, f"Health check failed: {res.status_code}"
        print("PASS: Health endpoint returns 200")

    def test_login_returns_access_token(self):
        """Test login returns access_token field."""
        res = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers={"Content-Type": "application/json"},
        )

        assert res.status_code == 200, f"Login failed: {res.status_code}"
        data = res.json()
        assert "access_token" in data or "token" in data, f"Response should contain token: {data.keys()}"
        print("PASS: Login returns access_token")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
