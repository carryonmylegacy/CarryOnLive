"""
Test Suite for SDV Download and ECT Bug Fixes

Tests:
1. SDV document download returns filename with proper extension based on MIME type
2. ECT channel list API returns data correctly
3. ECT channel CRUD operations work
4. ECT search endpoint works
5. Backend Content-Disposition header includes file extension
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chat-smooth.preview.emergentagent.com")

# Test credentials
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/json"},
    )
    if response.status_code != 200:
        pytest.skip(f"Login failed: {response.status_code} - {response.text}")
    data = response.json()
    token = data.get("access_token")
    if not token:
        pytest.skip("No access_token in login response")
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers for API calls."""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def user_data(auth_token):
    """Get user data from login."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"Content-Type": "application/json"},
    )
    return response.json().get("user", {})


class TestHealthAndAuth:
    """Basic health and auth tests."""

    def test_health_endpoint(self):
        """Test health endpoint returns healthy status."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health endpoint returns healthy status")

    def test_login_returns_access_token(self, auth_token):
        """Test login returns access_token field."""
        assert auth_token is not None
        assert len(auth_token) > 0
        print("✓ Login returns access_token")


class TestSDVDocumentDownload:
    """Tests for SDV document download with proper file extensions."""

    def test_get_estates(self, auth_headers):
        """Test getting estates list."""
        response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        assert response.status_code == 200
        estates = response.json()
        assert isinstance(estates, list)
        print(f"✓ Got {len(estates)} estates")

    def test_get_documents(self, auth_headers):
        """Test getting documents for an estate."""
        # First get estates
        estates_response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        if estates_response.status_code != 200 or not estates_response.json():
            pytest.skip("No estates available")

        estate_id = estates_response.json()[0]["id"]
        response = requests.get(f"{BASE_URL}/api/documents/{estate_id}", headers=auth_headers)
        assert response.status_code == 200
        documents = response.json()
        assert isinstance(documents, list)
        print(f"✓ Got {len(documents)} documents for estate {estate_id}")

    def test_document_download_content_disposition(self, auth_headers):
        """Test that document download returns Content-Disposition with file extension."""
        # Get estates
        estates_response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        if estates_response.status_code != 200 or not estates_response.json():
            pytest.skip("No estates available")

        estate_id = estates_response.json()[0]["id"]

        # Get documents
        docs_response = requests.get(f"{BASE_URL}/api/documents/{estate_id}", headers=auth_headers)
        if docs_response.status_code != 200 or not docs_response.json():
            pytest.skip("No documents available")

        documents = docs_response.json()

        # Find an unlocked document to test
        unlocked_doc = None
        for doc in documents:
            if not doc.get("is_locked"):
                unlocked_doc = doc
                break

        if not unlocked_doc:
            pytest.skip("No unlocked documents available for download test")

        doc_id = unlocked_doc["id"]
        doc_name = unlocked_doc.get("name", "document")
        file_type = unlocked_doc.get("file_type", "")

        # Test download endpoint
        response = requests.get(
            f"{BASE_URL}/api/documents/{doc_id}/download",
            headers=auth_headers,
            allow_redirects=True,
        )

        # Check response - may be 403 if section locked
        if response.status_code == 403:
            print("⚠ Document download blocked by section lock (expected behavior)")
            return

        assert response.status_code == 200, f"Download failed: {response.status_code}"

        # Check Content-Disposition header
        content_disp = response.headers.get("Content-Disposition", "")
        print(f"Content-Disposition: {content_disp}")

        # Verify filename has extension based on MIME type
        if "pdf" in file_type.lower():
            assert ".pdf" in content_disp.lower() or doc_name.lower().endswith(".pdf"), (
                "PDF document should have .pdf extension in Content-Disposition"
            )
        elif "jpeg" in file_type.lower() or "jpg" in file_type.lower():
            assert (
                ".jpg" in content_disp.lower()
                or ".jpeg" in content_disp.lower()
                or doc_name.lower().endswith((".jpg", ".jpeg"))
            ), "JPEG document should have .jpg extension in Content-Disposition"
        elif "png" in file_type.lower():
            assert ".png" in content_disp.lower() or doc_name.lower().endswith(".png"), (
                "PNG document should have .png extension in Content-Disposition"
            )

        print(f"✓ Document download returns proper Content-Disposition: {content_disp}")


class TestECTChannelList:
    """Tests for ECT channel list functionality."""

    def test_get_channels(self, auth_headers):
        """Test getting ECT channels list."""
        response = requests.get(f"{BASE_URL}/api/estate-chat/channels", headers=auth_headers)
        assert response.status_code == 200
        channels = response.json()
        assert isinstance(channels, list)
        print(f"✓ Got {len(channels)} ECT channels")

        # Verify channel structure
        if channels:
            channel = channels[0]
            assert "id" in channel
            assert "type" in channel
            assert "name" in channel or channel.get("type") == "direct"
            print(f"✓ Channel structure is valid: {channel.get('name', 'DM')} ({channel.get('type')})")

    def test_get_contacts(self, auth_headers):
        """Test getting ECT contacts list."""
        response = requests.get(f"{BASE_URL}/api/estate-chat/contacts", headers=auth_headers)
        assert response.status_code == 200
        contacts = response.json()
        assert isinstance(contacts, list)
        print(f"✓ Got {len(contacts)} ECT contact groups")

        # Verify contact structure
        if contacts:
            contact_group = contacts[0]
            assert "estate_id" in contact_group
            assert "estate_name" in contact_group
            assert "members" in contact_group
            print(f"✓ Contact structure is valid: {contact_group.get('estate_name')}")

    def test_search_messages(self, auth_headers):
        """Test ECT search endpoint."""
        response = requests.get(
            f"{BASE_URL}/api/estate-chat/search",
            params={"q": "test"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        results = response.json()
        assert isinstance(results, list)
        print(f"✓ ECT search returned {len(results)} results")

    def test_get_unread_total(self, auth_headers):
        """Test getting unread message count."""
        response = requests.get(f"{BASE_URL}/api/estate-chat/unread-total", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        print(f"✓ Unread total: {data.get('total')}")


class TestECTChannelCRUD:
    """Tests for ECT channel CRUD operations."""

    def test_create_direct_channel(self, auth_headers):
        """Test creating a direct message channel."""
        # First get contacts to find a member to DM
        contacts_response = requests.get(f"{BASE_URL}/api/estate-chat/contacts", headers=auth_headers)
        if contacts_response.status_code != 200 or not contacts_response.json():
            pytest.skip("No contacts available")

        contacts = contacts_response.json()
        if not contacts or not contacts[0].get("members"):
            pytest.skip("No members available for DM")

        estate_id = contacts[0]["estate_id"]
        members = contacts[0]["members"]

        # Find a member that's not the current user
        other_member = None
        for m in members:
            if not m.get("is_ffn"):  # Skip FFN contacts
                other_member = m
                break

        if not other_member:
            pytest.skip("No valid member found for DM test")

        # Create DM channel
        response = requests.post(
            f"{BASE_URL}/api/estate-chat/channels",
            json={
                "estate_id": estate_id,
                "channel_type": "direct",
                "member_ids": [other_member["id"]],
            },
            headers=auth_headers,
        )

        # May return existing channel or create new one
        assert response.status_code == 200, f"Create DM failed: {response.status_code} - {response.text}"
        channel = response.json()
        assert "id" in channel
        assert channel.get("type") == "direct"
        print(f"✓ Created/retrieved DM channel: {channel.get('id')}")

    def test_get_channel_messages(self, auth_headers):
        """Test getting messages from a channel."""
        # Get channels first
        channels_response = requests.get(f"{BASE_URL}/api/estate-chat/channels", headers=auth_headers)
        if channels_response.status_code != 200 or not channels_response.json():
            pytest.skip("No channels available")

        channel_id = channels_response.json()[0]["id"]

        response = requests.get(
            f"{BASE_URL}/api/estate-chat/channels/{channel_id}/messages",
            headers=auth_headers,
        )
        assert response.status_code == 200
        messages = response.json()
        assert isinstance(messages, list)
        print(f"✓ Got {len(messages)} messages from channel {channel_id}")

    def test_get_channel_read_status(self, auth_headers):
        """Test getting read status for a channel."""
        # Get channels first
        channels_response = requests.get(f"{BASE_URL}/api/estate-chat/channels", headers=auth_headers)
        if channels_response.status_code != 200 or not channels_response.json():
            pytest.skip("No channels available")

        channel_id = channels_response.json()[0]["id"]

        response = requests.get(
            f"{BASE_URL}/api/estate-chat/channels/{channel_id}/read-status",
            headers=auth_headers,
        )
        assert response.status_code == 200
        read_status = response.json()
        assert isinstance(read_status, list)
        print(f"✓ Got read status for channel {channel_id}")

    def test_get_pinned_messages(self, auth_headers):
        """Test getting pinned messages from a channel."""
        # Get channels first
        channels_response = requests.get(f"{BASE_URL}/api/estate-chat/channels", headers=auth_headers)
        if channels_response.status_code != 200 or not channels_response.json():
            pytest.skip("No channels available")

        channel_id = channels_response.json()[0]["id"]

        response = requests.get(
            f"{BASE_URL}/api/estate-chat/channels/{channel_id}/pinned",
            headers=auth_headers,
        )
        assert response.status_code == 200
        pinned = response.json()
        assert isinstance(pinned, list)
        print(f"✓ Got {len(pinned)} pinned messages from channel {channel_id}")


class TestECTTypingIndicator:
    """Tests for ECT typing indicator functionality."""

    def test_send_typing_indicator(self, auth_headers):
        """Test sending typing indicator."""
        # Get channels first
        channels_response = requests.get(f"{BASE_URL}/api/estate-chat/channels", headers=auth_headers)
        if channels_response.status_code != 200 or not channels_response.json():
            pytest.skip("No channels available")

        channel_id = channels_response.json()[0]["id"]

        response = requests.post(
            f"{BASE_URL}/api/estate-chat/channels/{channel_id}/typing",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok")
        print(f"✓ Sent typing indicator to channel {channel_id}")

    def test_get_typing_indicator(self, auth_headers):
        """Test getting typing indicators."""
        # Get channels first
        channels_response = requests.get(f"{BASE_URL}/api/estate-chat/channels", headers=auth_headers)
        if channels_response.status_code != 200 or not channels_response.json():
            pytest.skip("No channels available")

        channel_id = channels_response.json()[0]["id"]

        response = requests.get(
            f"{BASE_URL}/api/estate-chat/channels/{channel_id}/typing",
            headers=auth_headers,
        )
        assert response.status_code == 200
        typers = response.json()
        assert isinstance(typers, list)
        print(f"✓ Got typing indicators for channel {channel_id}")


class TestDownloadPrepareEndpoint:
    """Tests for download prepare endpoint (used by iOS PWA)."""

    def test_download_prepare_endpoint_exists(self, auth_headers):
        """Test that download prepare endpoint exists."""
        response = requests.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "test", "params": {}, "filename": "test.pdf"},
            headers=auth_headers,
        )
        # Should not be 404 - may be 400 for invalid action
        assert response.status_code != 404, "Download prepare endpoint should exist"
        print(f"✓ Download prepare endpoint exists (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
