"""CarryOn Staff Tools API Tests - Iteration 68
Tests all new staff tool endpoints for Founder and Operations portals.
"""

import os
import pytest
import requests
from uuid import uuid4

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ops-portal-revamp.preview.emergentagent.com')

# Read admin token from file
def get_admin_token():
    try:
        with open('/tmp/admin_token.txt', 'r') as f:
            return f.read().strip()
    except:
        return None

ADMIN_TOKEN = get_admin_token()


@pytest.fixture
def admin_headers():
    return {
        "Authorization": f"Bearer {ADMIN_TOKEN}",
        "Content-Type": "application/json"
    }


class TestAnnouncements:
    """Test POST /api/admin/announcements - Founder creates announcements"""
    
    def test_create_announcement(self, admin_headers):
        response = requests.post(
            f"{BASE_URL}/api/admin/announcements",
            headers=admin_headers,
            json={
                "title": f"TEST_Announcement_{uuid4().hex[:8]}",
                "body": "Test announcement body for mobile testing",
                "audience": "all",
                "priority": "info"
            }
        )
        print(f"POST /api/admin/announcements: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["title"].startswith("TEST_Announcement_")
        assert data["is_active"] == True
        return data["id"]

    def test_list_announcements(self, admin_headers):
        response = requests.get(
            f"{BASE_URL}/api/admin/announcements",
            headers=admin_headers
        )
        print(f"GET /api/admin/announcements: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestSystemHealth:
    """Test GET /api/admin/system-health - Founder views health metrics"""
    
    def test_get_system_health(self, admin_headers):
        response = requests.get(
            f"{BASE_URL}/api/admin/system-health",
            headers=admin_headers
        )
        print(f"GET /api/admin/system-health: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "status" in data
        assert "database" in data
        assert "activity" in data
        assert "queues" in data
        # Validate structure
        assert "users" in data["database"]
        assert "estates" in data["database"]


class TestMyActivity:
    """Test GET /api/ops/my-activity - Operator sees own audit log"""
    
    def test_get_my_activity(self, admin_headers):
        response = requests.get(
            f"{BASE_URL}/api/ops/my-activity?limit=50",
            headers=admin_headers
        )
        print(f"GET /api/ops/my-activity: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)


class TestQuickSearch:
    """Test GET /api/ops/search - Search across all queues"""
    
    def test_search_with_query(self, admin_headers):
        response = requests.get(
            f"{BASE_URL}/api/ops/search?q=test",
            headers=admin_headers
        )
        print(f"GET /api/ops/search?q=test: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)


class TestShiftNotes:
    """Test POST /api/ops/shift-notes - Staff creates shift notes"""
    
    def test_create_shift_note(self, admin_headers):
        response = requests.post(
            f"{BASE_URL}/api/ops/shift-notes",
            headers=admin_headers,
            json={
                "content": f"TEST_ShiftNote_{uuid4().hex[:8]} - Testing mobile features",
                "category": "general"
            }
        )
        print(f"POST /api/ops/shift-notes: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["content"].startswith("TEST_ShiftNote_")
    
    def test_list_shift_notes(self, admin_headers):
        response = requests.get(
            f"{BASE_URL}/api/ops/shift-notes",
            headers=admin_headers
        )
        print(f"GET /api/ops/shift-notes: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestEscalations:
    """Test escalation CRUD operations"""
    
    def test_create_escalation(self, admin_headers):
        response = requests.post(
            f"{BASE_URL}/api/ops/escalations",
            headers=admin_headers,
            json={
                "subject": f"TEST_Escalation_{uuid4().hex[:8]}",
                "description": "Test escalation for mobile testing",
                "priority": "normal",
                "related_type": "support",
                "related_id": ""
            }
        )
        print(f"POST /api/ops/escalations: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["status"] == "open"
    
    def test_list_escalations(self, admin_headers):
        response = requests.get(
            f"{BASE_URL}/api/ops/escalations",
            headers=admin_headers
        )
        print(f"GET /api/ops/escalations: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestKnowledgeBase:
    """Test Knowledge Base CRUD - Founder creates, staff reads"""
    
    def test_create_kb_article(self, admin_headers):
        response = requests.post(
            f"{BASE_URL}/api/admin/knowledge-base",
            headers=admin_headers,
            json={
                "title": f"TEST_KBArticle_{uuid4().hex[:8]}",
                "content": "Test knowledge base article content for mobile testing",
                "category": "general",
                "tags": ["test", "mobile"]
            }
        )
        print(f"POST /api/admin/knowledge-base: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["title"].startswith("TEST_KBArticle_")
    
    def test_list_kb_articles(self, admin_headers):
        response = requests.get(
            f"{BASE_URL}/api/admin/knowledge-base",
            headers=admin_headers
        )
        print(f"GET /api/admin/knowledge-base: {response.status_code}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
