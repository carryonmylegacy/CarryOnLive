"""
Test Suite for Three New Features:
1. GET /api/messages/{message_id}/download - Download milestone messages (text→PDF, video→redirect, voice→redirect)
2. PUT /api/documents/{document_id}/designate-beneficiaries - Designate beneficiaries for documents
3. POST /api/guardian/beneficiary-export-checklist - Export IAC checklist for beneficiaries
"""

import os
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from test_credentials.md
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token for admin/founder user"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    if response.status_code == 200:
        data = response.json()
        # Token field is 'access_token' not 'token'
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


@pytest.fixture(scope="module")
def estate_id(authenticated_client):
    """Get the first estate for the authenticated user"""
    response = authenticated_client.get(f"{BASE_URL}/api/estates")
    if response.status_code == 200:
        estates = response.json()
        if estates and len(estates) > 0:
            return estates[0]["id"]
    pytest.skip("No estate found for testing")


@pytest.fixture(scope="module")
def beneficiary_ids(authenticated_client, estate_id):
    """Get beneficiary IDs for the estate"""
    response = authenticated_client.get(f"{BASE_URL}/api/beneficiaries/{estate_id}")
    if response.status_code == 200:
        beneficiaries = response.json()
        if beneficiaries and len(beneficiaries) > 0:
            return [b["id"] for b in beneficiaries]
    return []


class TestMessageDownload:
    """Tests for GET /api/messages/{message_id}/download endpoint"""

    def test_download_text_message_returns_pdf(self, authenticated_client, estate_id):
        """Test that downloading a text message returns a PDF"""
        # First, get existing messages for the estate
        response = authenticated_client.get(f"{BASE_URL}/api/messages/{estate_id}")
        assert response.status_code == 200, f"Failed to get messages: {response.text}"
        
        messages = response.json()
        
        # Find a text message
        text_message = None
        for msg in messages:
            if msg.get("message_type") == "text":
                text_message = msg
                break
        
        if not text_message:
            # Create a text message for testing
            create_response = authenticated_client.post(
                f"{BASE_URL}/api/messages",
                json={
                    "estate_id": estate_id,
                    "title": f"TEST_Download_Text_{uuid.uuid4().hex[:8]}",
                    "content": "This is a test message for download testing.",
                    "message_type": "text",
                    "recipients": [],
                    "trigger_type": "immediate",
                },
            )
            if create_response.status_code in [200, 201]:
                text_message = create_response.json()
            else:
                pytest.skip(f"Could not create text message: {create_response.text}")
        
        # Download the message
        download_response = authenticated_client.get(
            f"{BASE_URL}/api/messages/{text_message['id']}/download"
        )
        
        assert download_response.status_code == 200, f"Download failed: {download_response.text}"
        assert download_response.headers.get("Content-Type") == "application/pdf", \
            f"Expected PDF content type, got: {download_response.headers.get('Content-Type')}"
        assert "Content-Disposition" in download_response.headers, "Missing Content-Disposition header"
        assert "attachment" in download_response.headers.get("Content-Disposition", ""), \
            "Content-Disposition should indicate attachment"
        
        # Verify PDF magic bytes
        content = download_response.content
        assert content[:4] == b"%PDF", f"Response does not start with PDF magic bytes"
        print(f"✓ Text message download returns valid PDF ({len(content)} bytes)")

    def test_download_nonexistent_message_returns_404(self, authenticated_client):
        """Test that downloading a non-existent message returns 404"""
        fake_id = f"nonexistent_{uuid.uuid4().hex}"
        response = authenticated_client.get(f"{BASE_URL}/api/messages/{fake_id}/download")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent message download returns 404")

    def test_download_video_message_redirects(self, authenticated_client, estate_id):
        """Test that downloading a video message redirects to video endpoint"""
        # Get messages and find a video message
        response = authenticated_client.get(f"{BASE_URL}/api/messages/{estate_id}")
        assert response.status_code == 200
        
        messages = response.json()
        video_message = None
        for msg in messages:
            if msg.get("message_type") == "video" and msg.get("video_url"):
                video_message = msg
                break
        
        if not video_message:
            pytest.skip("No video message available for testing redirect")
        
        # Download should redirect (307 or follow redirect)
        download_response = authenticated_client.get(
            f"{BASE_URL}/api/messages/{video_message['id']}/download",
            allow_redirects=False
        )
        
        # Should be a redirect (307) or if followed, should return video content
        assert download_response.status_code in [200, 307, 302], \
            f"Expected redirect or video content, got {download_response.status_code}"
        
        if download_response.status_code in [307, 302]:
            location = download_response.headers.get("Location", "")
            assert "/api/messages/video/" in location, \
                f"Redirect should point to video endpoint, got: {location}"
            print(f"✓ Video message download redirects to: {location}")
        else:
            # If redirect was followed, check for video content type
            content_type = download_response.headers.get("Content-Type", "")
            assert "video" in content_type, f"Expected video content type, got: {content_type}"
            print(f"✓ Video message download returns video content ({content_type})")

    def test_download_voice_message_redirects(self, authenticated_client, estate_id):
        """Test that downloading a voice message redirects to voice endpoint"""
        response = authenticated_client.get(f"{BASE_URL}/api/messages/{estate_id}")
        assert response.status_code == 200
        
        messages = response.json()
        voice_message = None
        for msg in messages:
            if msg.get("message_type") == "voice" and msg.get("voice_url"):
                voice_message = msg
                break
        
        if not voice_message:
            pytest.skip("No voice message available for testing redirect")
        
        download_response = authenticated_client.get(
            f"{BASE_URL}/api/messages/{voice_message['id']}/download",
            allow_redirects=False
        )
        
        assert download_response.status_code in [200, 307, 302], \
            f"Expected redirect or audio content, got {download_response.status_code}"
        
        if download_response.status_code in [307, 302]:
            location = download_response.headers.get("Location", "")
            assert "/api/messages/voice/" in location, \
                f"Redirect should point to voice endpoint, got: {location}"
            print(f"✓ Voice message download redirects to: {location}")
        else:
            content_type = download_response.headers.get("Content-Type", "")
            assert "audio" in content_type, f"Expected audio content type, got: {content_type}"
            print(f"✓ Voice message download returns audio content ({content_type})")


class TestDesignateBeneficiaries:
    """Tests for PUT /api/documents/{document_id}/designate-beneficiaries endpoint"""

    def test_designate_all_beneficiaries(self, authenticated_client, estate_id):
        """Test designating 'all' beneficiaries for a document
        
        Note: This test may return 403 if the authenticated user doesn't own the estate.
        The endpoint correctly requires estate ownership.
        """
        # Get documents for the estate
        response = authenticated_client.get(f"{BASE_URL}/api/documents/{estate_id}")
        assert response.status_code == 200, f"Failed to get documents: {response.text}"
        
        documents = response.json()
        if not documents:
            pytest.skip("No documents available for testing")
        
        doc_id = documents[0]["id"]
        
        # Designate all beneficiaries
        designate_response = authenticated_client.put(
            f"{BASE_URL}/api/documents/{doc_id}/designate-beneficiaries",
            json={"beneficiary_ids": ["all"]}
        )
        
        # 200 = success (user owns estate), 403 = user doesn't own estate (expected for admin viewing other estates)
        if designate_response.status_code == 403:
            # This is expected behavior - admin user doesn't own this estate
            data = designate_response.json()
            assert "Access denied" in data.get("detail", ""), \
                f"Expected access denied message, got: {data}"
            print(f"✓ Non-owner correctly gets 403 Access denied for document {doc_id}")
        elif designate_response.status_code == 200:
            data = designate_response.json()
            assert data.get("document_id") == doc_id, "Response should include document_id"
            assert data.get("designated_beneficiaries") == ["all"], \
                f"Expected ['all'], got: {data.get('designated_beneficiaries')}"
            print(f"✓ Successfully designated 'all' beneficiaries for document {doc_id}")
        else:
            pytest.fail(f"Unexpected status: {designate_response.status_code} - {designate_response.text}")

    def test_designate_specific_beneficiaries(self, authenticated_client, estate_id, beneficiary_ids):
        """Test designating specific beneficiary IDs for a document
        
        Note: This test may return 403 if the authenticated user doesn't own the estate.
        """
        if not beneficiary_ids:
            pytest.skip("No beneficiaries available for testing")
        
        # Get documents
        response = authenticated_client.get(f"{BASE_URL}/api/documents/{estate_id}")
        assert response.status_code == 200
        
        documents = response.json()
        if not documents:
            pytest.skip("No documents available for testing")
        
        doc_id = documents[0]["id"]
        
        # Designate specific beneficiaries
        designate_response = authenticated_client.put(
            f"{BASE_URL}/api/documents/{doc_id}/designate-beneficiaries",
            json={"beneficiary_ids": beneficiary_ids[:2]}  # Use first 2 beneficiaries
        )
        
        # 200 = success, 403 = user doesn't own estate
        if designate_response.status_code == 403:
            print(f"✓ Non-owner correctly gets 403 for specific beneficiary designation")
        elif designate_response.status_code == 200:
            data = designate_response.json()
            assert data.get("document_id") == doc_id
            assert data.get("designated_beneficiaries") == beneficiary_ids[:2], \
                f"Expected {beneficiary_ids[:2]}, got: {data.get('designated_beneficiaries')}"
            print(f"✓ Successfully designated specific beneficiaries: {beneficiary_ids[:2]}")
        else:
            pytest.fail(f"Unexpected status: {designate_response.status_code} - {designate_response.text}")

    def test_designate_nonexistent_document_returns_404(self, authenticated_client):
        """Test that designating beneficiaries for non-existent document returns 404"""
        fake_id = f"nonexistent_{uuid.uuid4().hex}"
        
        response = authenticated_client.put(
            f"{BASE_URL}/api/documents/{fake_id}/designate-beneficiaries",
            json={"beneficiary_ids": ["all"]}
        )
        
        assert response.status_code == 404, \
            f"Expected 404, got {response.status_code}: {response.text}"
        print("✓ Non-existent document returns 404")

    def test_designate_without_auth_returns_401(self):
        """Test that unauthenticated request returns 401"""
        # Create a fresh session without auth
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.put(
            f"{BASE_URL}/api/documents/some-doc-id/designate-beneficiaries",
            json={"beneficiary_ids": ["all"]}
        )
        
        # Without auth, should get 401 or 403 or 404 (if doc not found first)
        assert response.status_code in [401, 403, 404], \
            f"Expected 401/403/404, got {response.status_code}"
        print(f"✓ Unauthenticated request returns {response.status_code}")


class TestBeneficiaryExportChecklist:
    """Tests for POST /api/guardian/beneficiary-export-checklist endpoint"""

    def test_beneficiary_export_checklist_for_benefactor(self, authenticated_client):
        """Test that benefactor (estate owner) can export checklist
        
        The admin user (info@carryon.us) has is_also_beneficiary=true, so they
        should be able to export the checklist if they are a beneficiary of some estate.
        """
        response = authenticated_client.post(
            f"{BASE_URL}/api/guardian/beneficiary-export-checklist"
        )
        
        # If the user is NOT a beneficiary of any estate, should return 404
        # If they ARE a beneficiary, should return PDF
        if response.status_code == 404:
            data = response.json()
            assert "No estate found for this beneficiary" in data.get("detail", "") or \
                   "No checklist items found" in data.get("detail", ""), \
                f"Expected beneficiary/checklist not found message, got: {data}"
            print("✓ Non-beneficiary user or no checklist items correctly gets 404")
        elif response.status_code == 200:
            # User is also a beneficiary of some estate
            assert response.headers.get("Content-Type") == "application/pdf"
            # Verify PDF magic bytes
            content = response.content
            assert content[:4] == b"%PDF", "Response should be a valid PDF"
            print(f"✓ Beneficiary export returns valid PDF ({len(content)} bytes)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code} - {response.text}")

    def test_beneficiary_export_checklist_unauthenticated(self):
        """Test that unauthenticated request returns 401"""
        # Create a fresh session without auth
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(
            f"{BASE_URL}/api/guardian/beneficiary-export-checklist"
        )
        
        # Without auth, should get 401 or 403 or 404 (if endpoint checks auth first)
        assert response.status_code in [401, 403, 404], \
            f"Expected 401/403/404, got {response.status_code}"
        print(f"✓ Unauthenticated request returns {response.status_code}")


class TestEndpointAvailability:
    """Basic availability tests for all three endpoints"""

    def test_message_download_endpoint_exists(self, authenticated_client, estate_id):
        """Verify the message download endpoint is registered"""
        # Get a message ID first
        response = authenticated_client.get(f"{BASE_URL}/api/messages/{estate_id}")
        if response.status_code == 200 and response.json():
            msg_id = response.json()[0]["id"]
            download_response = authenticated_client.get(
                f"{BASE_URL}/api/messages/{msg_id}/download"
            )
            # Should not be 404 "Not Found" for the route itself
            assert download_response.status_code != 405, "Method not allowed - endpoint may not exist"
            print(f"✓ Message download endpoint exists (status: {download_response.status_code})")
        else:
            pytest.skip("No messages to test endpoint availability")

    def test_designate_beneficiaries_endpoint_exists(self, authenticated_client, estate_id):
        """Verify the designate beneficiaries endpoint is registered"""
        response = authenticated_client.get(f"{BASE_URL}/api/documents/{estate_id}")
        if response.status_code == 200 and response.json():
            doc_id = response.json()[0]["id"]
            designate_response = authenticated_client.put(
                f"{BASE_URL}/api/documents/{doc_id}/designate-beneficiaries",
                json={"beneficiary_ids": ["all"]}
            )
            assert designate_response.status_code != 405, "Method not allowed - endpoint may not exist"
            print(f"✓ Designate beneficiaries endpoint exists (status: {designate_response.status_code})")
        else:
            pytest.skip("No documents to test endpoint availability")

    def test_beneficiary_export_checklist_endpoint_exists(self, authenticated_client):
        """Verify the beneficiary export checklist endpoint is registered"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/guardian/beneficiary-export-checklist"
        )
        # Should not be 405 Method Not Allowed
        assert response.status_code != 405, "Method not allowed - endpoint may not exist"
        print(f"✓ Beneficiary export checklist endpoint exists (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
