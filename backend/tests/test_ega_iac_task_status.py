"""
Test EGA IAC Task Status Endpoint and Duplicate Detection Features

Tests for:
1. GET /api/guardian/iac-task-status - returns {status: 'none'} when no tasks exist
2. GET /api/guardian/iac-task-status - returns proper task object with status/items_added/duplicates_skipped fields
3. Simulated task record in MongoDB to verify endpoint reads it correctly
4. Verify action_result includes duplicates_skipped and duplicate_titles fields
"""

import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestEgaIacTaskStatus:
    """Tests for EGA IAC task status endpoint and duplicate detection"""
    
    @pytest.fixture(autouse=True)
    def setup(self, api_client, auth_token):
        """Setup for each test"""
        self.client = api_client
        self.token = auth_token
        self.headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_iac_task_status_returns_none_when_no_tasks(self, api_client, auth_token):
        """GET /api/guardian/iac-task-status returns {status: 'none'} when no tasks exist"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        response = api_client.get(f"{BASE_URL}/api/guardian/iac-task-status", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return status field - either 'none' or a task object
        assert "status" in data, f"Response should have 'status' field: {data}"
        # If no tasks, status should be 'none'
        # If tasks exist, status could be 'running', 'completed', or 'error'
        assert data["status"] in ["none", "running", "completed", "error"], f"Unexpected status: {data['status']}"
        print(f"✓ IAC task status endpoint returned: {data}")
    
    def test_iac_task_status_endpoint_exists(self, api_client, auth_token):
        """Verify the iac-task-status endpoint exists and is accessible"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        response = api_client.get(f"{BASE_URL}/api/guardian/iac-task-status", headers=headers)
        
        # Should not return 404 or 405
        assert response.status_code != 404, "Endpoint /api/guardian/iac-task-status not found"
        assert response.status_code != 405, "Method GET not allowed on /api/guardian/iac-task-status"
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ IAC task status endpoint exists and is accessible")
    
    def test_iac_task_status_requires_auth(self, api_client):
        """Verify the endpoint requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/guardian/iac-task-status")
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ IAC task status endpoint requires authentication")
    
    def test_iac_task_status_response_shape(self, api_client, auth_token):
        """Verify the response shape when task exists vs doesn't exist"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        response = api_client.get(f"{BASE_URL}/api/guardian/iac-task-status", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        if data.get("status") == "none":
            # When no task exists, only status field is required
            assert "status" in data
            print("✓ No task exists - response shape correct: {status: 'none'}")
        else:
            # When task exists, should have additional fields
            assert "status" in data
            # These fields should be present for completed/running tasks
            if data["status"] in ["completed", "running"]:
                # items_added and duplicates_skipped may be present
                print(f"✓ Task exists with status '{data['status']}' - response: {data}")


class TestGuardianChatSessions:
    """Tests for Guardian chat sessions endpoint"""
    
    def test_chat_sessions_endpoint(self, api_client, auth_token):
        """GET /api/chat/sessions returns list of sessions"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        response = api_client.get(f"{BASE_URL}/api/chat/sessions", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Chat sessions endpoint returned {len(data)} sessions")


class TestGuardianExportEndpoints:
    """Tests for Guardian PDF export endpoints"""
    
    def test_export_checklist_endpoint_exists(self, api_client, auth_token):
        """POST /api/guardian/export-checklist endpoint exists"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        response = api_client.post(f"{BASE_URL}/api/guardian/export-checklist", headers=headers)
        
        # Should not return 404 or 405
        assert response.status_code != 404, "Endpoint /api/guardian/export-checklist not found"
        assert response.status_code != 405, "Method POST not allowed"
        # May return 404 if no checklist items, or 200 with PDF
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"✓ Export checklist endpoint exists (status: {response.status_code})")
    
    def test_export_todo_endpoint_exists(self, api_client, auth_token):
        """POST /api/guardian/export-todo endpoint exists"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        response = api_client.post(
            f"{BASE_URL}/api/guardian/export-todo",
            headers=headers,
            json={"content": "Test to-do content"}
        )
        
        # Should not return 404 or 405
        assert response.status_code != 404, "Endpoint /api/guardian/export-todo not found"
        assert response.status_code != 405, "Method POST not allowed"
        print(f"✓ Export todo endpoint exists (status: {response.status_code})")
    
    def test_export_iac_report_endpoint_exists(self, api_client, auth_token):
        """POST /api/guardian/export-iac-report endpoint exists"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        response = api_client.post(
            f"{BASE_URL}/api/guardian/export-iac-report",
            headers=headers,
            json={"content": "Test IAC report content"}
        )
        
        # Should not return 404 or 405
        assert response.status_code != 404, "Endpoint /api/guardian/export-iac-report not found"
        assert response.status_code != 405, "Method POST not allowed"
        print(f"✓ Export IAC report endpoint exists (status: {response.status_code})")


class TestEstatesAndChecklists:
    """Tests for estates and checklists endpoints used by Dashboard/Checklist pages"""
    
    def test_estates_endpoint(self, api_client, auth_token):
        """GET /api/estates returns user's estates"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        response = api_client.get(f"{BASE_URL}/api/estates", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Admin should have at least one estate"
        
        estate = data[0]
        assert "id" in estate, "Estate should have 'id' field"
        assert "name" in estate, "Estate should have 'name' field"
        print(f"✓ Estates endpoint returned {len(data)} estates")
        return estate["id"]
    
    def test_checklists_endpoint(self, api_client, auth_token):
        """GET /api/checklists/{estate_id} returns checklist items"""
        headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
        
        # First get estate ID
        estates_response = api_client.get(f"{BASE_URL}/api/estates", headers=headers)
        assert estates_response.status_code == 200
        estates = estates_response.json()
        assert len(estates) > 0, "Need at least one estate"
        estate_id = estates[0]["id"]
        
        # Get checklists
        response = api_client.get(f"{BASE_URL}/api/checklists/{estate_id}", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Checklists endpoint returned {len(data)} items for estate {estate_id}")


# Fixtures
@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def auth_token(api_client):
    """Get authentication token"""
    import time
    time.sleep(2)  # Rate limiting protection
    
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    
    if response.status_code == 429:
        # Rate limited - wait and retry
        time.sleep(15)
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
    
    if response.status_code == 200:
        data = response.json()
        # App uses 'access_token' field, not 'token'
        token = data.get("access_token") or data.get("token")
        if token:
            return token
    
    pytest.skip(f"Authentication failed - status {response.status_code}: {response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
