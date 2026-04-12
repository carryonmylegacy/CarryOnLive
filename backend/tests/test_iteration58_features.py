"""
Test iteration 58 features:
1. Dashboard gauge layout (frontend only)
2. MM Attachment type - upload/download attachment endpoints
3. IAC page - Quick Templates removed (frontend only)
4. CCP Emergency Plans - beneficiary visibility note (frontend only)
5. Backend attachment endpoints for messages
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://family-prep-3.preview.emergentagent.com"

# Test credentials
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def estate_id(auth_headers):
    """Get estate ID for testing"""
    response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
    assert response.status_code == 200, f"Failed to get estates: {response.text}"
    estates = response.json()
    assert len(estates) > 0, "No estates found"
    return estates[0]["id"]


class TestDashboardReadiness:
    """Test dashboard readiness endpoint"""

    def test_get_estate_readiness(self, auth_headers, estate_id):
        """Test GET /api/estate/{estate_id}/readiness endpoint"""
        response = requests.get(f"{BASE_URL}/api/estate/{estate_id}/readiness", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get readiness: {response.text}"
        data = response.json()

        # Verify readiness structure has all required fields
        assert "overall_score" in data, "Missing overall_score"
        assert "documents" in data, "Missing documents readiness"
        assert "messages" in data, "Missing messages readiness"
        assert "checklist" in data, "Missing checklist readiness"
        assert "financials" in data, "Missing financials readiness"

        # Verify each section has a score
        assert "score" in data["documents"], "Missing documents score"
        assert "score" in data["messages"], "Missing messages score"
        assert "score" in data["checklist"], "Missing checklist score"
        assert "score" in data["financials"], "Missing financials score"

        print(
            f"Readiness scores: overall={data['overall_score']}, docs={data['documents']['score']}, msgs={data['messages']['score']}, checklist={data['checklist']['score']}, financials={data['financials']['score']}"
        )


class TestMessageAttachmentEndpoints:
    """Test message attachment upload/download endpoints"""

    def test_attachment_upload_and_download_flow(self, auth_headers, estate_id):
        """Test full attachment upload and download flow"""
        # First get beneficiaries
        ben_response = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers)
        assert ben_response.status_code == 200
        beneficiaries = ben_response.json()
        recipient_ids = [b.get("user_id") or b.get("id") for b in beneficiaries[:1]] if beneficiaries else []

        # Create message with attachment type
        payload = {
            "estate_id": estate_id,
            "title": "TEST_Attachment Message",
            "content": "This is a test message with attachment",
            "message_type": "attachment",
            "recipients": recipient_ids,
            "trigger_type": "immediate",
        }
        response = requests.post(f"{BASE_URL}/api/messages", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create message: {response.text}"
        data = response.json()
        assert "id" in data, "No message ID returned"
        message_id = data["id"]
        print(f"Created message with ID: {message_id}")

        # Upload attachment
        test_content = b"This is a test attachment file content for CarryOn testing."
        files = {"file": ("test_document.txt", test_content, "text/plain")}

        upload_response = requests.post(
            f"{BASE_URL}/api/messages/{message_id}/upload-attachment", files=files, headers=auth_headers
        )
        assert upload_response.status_code == 200, f"Failed to upload attachment: {upload_response.text}"
        upload_data = upload_response.json()
        assert upload_data.get("success") is True, "Upload not successful"
        assert "attachment_id" in upload_data, "No attachment_id returned"
        assert upload_data.get("file_name") == "test_document.txt", "File name mismatch"
        print(f"Uploaded attachment: {upload_data}")

        # Download attachment
        download_response = requests.get(f"{BASE_URL}/api/messages/{message_id}/attachment", headers=auth_headers)
        assert download_response.status_code == 200, f"Failed to download attachment: {download_response.text}"
        assert len(download_response.content) > 0, "Empty attachment content"
        assert b"test attachment file content" in download_response.content, "Content mismatch"
        print(f"Downloaded attachment: {len(download_response.content)} bytes")

        # Cleanup - delete the test message
        requests.delete(f"{BASE_URL}/api/messages/{message_id}", headers=auth_headers)
        print("Cleaned up test message")

    def test_attachment_not_found(self, auth_headers, estate_id):
        """Test attachment endpoint returns 404 for message without attachment"""
        # Create a message without attachment
        ben_response = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers)
        beneficiaries = ben_response.json()
        recipient_ids = [b.get("user_id") or b.get("id") for b in beneficiaries[:1]] if beneficiaries else []

        payload = {
            "estate_id": estate_id,
            "title": "TEST_No Attachment Message",
            "content": "This message has no attachment",
            "message_type": "text",
            "recipients": recipient_ids,
            "trigger_type": "immediate",
        }
        response = requests.post(f"{BASE_URL}/api/messages", json=payload, headers=auth_headers)
        assert response.status_code == 200
        message_id = response.json()["id"]

        # Try to download attachment - should fail
        response = requests.get(f"{BASE_URL}/api/messages/{message_id}/attachment", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly returned 404 for message without attachment")

        # Cleanup
        requests.delete(f"{BASE_URL}/api/messages/{message_id}", headers=auth_headers)


class TestCCPPlansEndpoints:
    """Test CCP plans endpoints for beneficiary visibility"""

    def test_get_ccp_plans(self, auth_headers, estate_id):
        """Test GET /api/ccp/plans/{estate_id} endpoint"""
        response = requests.get(f"{BASE_URL}/api/ccp/plans/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get CCP plans: {response.text}"
        plans = response.json()
        assert isinstance(plans, list), "Plans should be a list"
        print(f"Found {len(plans)} CCP plans")

    def test_create_and_delete_ccp_plan(self, auth_headers, estate_id):
        """Test POST /api/ccp/plans endpoint"""
        payload = {
            "estate_id": estate_id,
            "name": "TEST_Emergency Plan",
            "plan_type": "natural_disaster",
            "rendezvous_points": [{"name": "Test Location", "address": "123 Test St"}],
            "communication_plan": "Call each other",
            "instructions": "Stay safe",
        }
        response = requests.post(f"{BASE_URL}/api/ccp/plans", json=payload, headers=auth_headers)

        # Admin users may get 403 if they're not the estate owner/benefactor
        if response.status_code == 403:
            print("Skipping CCP plan creation - user is not benefactor for this estate")
            pytest.skip("User is not benefactor for this estate")

        assert response.status_code == 200, f"Failed to create CCP plan: {response.text}"
        data = response.json()
        assert "id" in data, "No plan ID returned"
        print(f"Created CCP plan with ID: {data['id']}")

        # Cleanup
        delete_response = requests.delete(f"{BASE_URL}/api/ccp/plans/{data['id']}", headers=auth_headers)
        assert delete_response.status_code in [200, 204], f"Failed to delete plan: {delete_response.text}"
        print("Cleaned up test CCP plan")


class TestChecklistEndpoints:
    """Test checklist endpoints"""

    def test_get_checklists(self, auth_headers, estate_id):
        """Test GET /api/checklists/{estate_id} endpoint"""
        response = requests.get(f"{BASE_URL}/api/checklists/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get checklists: {response.text}"
        checklists = response.json()
        assert isinstance(checklists, list), "Checklists should be a list"
        print(f"Found {len(checklists)} checklist items")


class TestCleanup:
    """Cleanup test data"""

    def test_cleanup_test_messages(self, auth_headers, estate_id):
        """Delete any TEST_ prefixed messages"""
        response = requests.get(f"{BASE_URL}/api/messages/{estate_id}", headers=auth_headers)
        if response.status_code == 200:
            messages = response.json()
            deleted = 0
            for msg in messages:
                if msg.get("title", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/messages/{msg['id']}", headers=auth_headers)
                    deleted += 1
            print(f"Cleaned up {deleted} test messages")
        assert True  # Always pass cleanup


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
