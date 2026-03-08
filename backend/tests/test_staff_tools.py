"""Tests for new Staff Tools API endpoints (Founder & Operations portals)

Features tested:
- Announcements (CRUD, founder-only create/delete)
- System Health (founder-only access)
- Escalations (create, list, resolve)
- Shift Notes (create, list, acknowledge)
- Knowledge Base (CRUD, founder-only write)
- Quick Search (staff access)
- My Activity (staff audit trail)
- RBAC - benefactors cannot access staff endpoints
"""

import pytest
import requests
import os
from uuid import uuid4

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
FOUNDER_EMAIL = "admin@carryon.com"
FOUNDER_PASSWORD = "Demo1234!"
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"


@pytest.fixture(scope="module")
def founder_token():
    """Get founder (admin) auth token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
    )
    if response.status_code != 200:
        pytest.skip(f"Founder login failed: {response.status_code} - {response.text}")
    data = response.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="module")
def benefactor_token():
    """Get benefactor auth token - should NOT have access to staff endpoints"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
    )
    if response.status_code != 200:
        pytest.skip(f"Benefactor login failed: {response.status_code}")
    data = response.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture
def founder_headers(founder_token):
    return {
        "Authorization": f"Bearer {founder_token}",
        "Content-Type": "application/json",
    }


@pytest.fixture
def benefactor_headers(benefactor_token):
    return {
        "Authorization": f"Bearer {benefactor_token}",
        "Content-Type": "application/json",
    }


# ══════════════════════════════════════════════════════════
# ANNOUNCEMENTS TESTS
# ══════════════════════════════════════════════════════════


class TestAnnouncements:
    """Announcements endpoint tests - Founder creates, Staff reads"""

    def test_create_announcement_founder(self, founder_headers):
        """POST /api/admin/announcements - founder can create"""
        response = requests.post(
            f"{BASE_URL}/api/admin/announcements",
            headers=founder_headers,
            json={
                "title": f"TEST_Announcement_{uuid4().hex[:8]}",
                "body": "Test announcement body for testing",
                "audience": "all",
                "priority": "info",
            },
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["title"].startswith("TEST_")
        assert data["is_active"]
        return data["id"]

    def test_list_announcements_founder(self, founder_headers):
        """GET /api/admin/announcements - founder can list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/announcements?active_only=false",
            headers=founder_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} announcements")

    def test_delete_announcement_founder(self, founder_headers):
        """DELETE /api/admin/announcements/{id} - founder can deactivate"""
        # First create one
        create_resp = requests.post(
            f"{BASE_URL}/api/admin/announcements",
            headers=founder_headers,
            json={
                "title": f"TEST_ToDelete_{uuid4().hex[:8]}",
                "body": "Will be deleted",
                "audience": "all",
                "priority": "info",
            },
        )
        assert create_resp.status_code == 200
        announcement_id = create_resp.json()["id"]

        # Now delete
        response = requests.delete(
            f"{BASE_URL}/api/admin/announcements/{announcement_id}",
            headers=founder_headers,
        )
        assert response.status_code == 200
        assert response.json()["deleted"]

    def test_announcements_blocked_for_benefactor(self, benefactor_headers):
        """Benefactor cannot access announcements endpoints"""
        # Try to list
        response = requests.get(
            f"{BASE_URL}/api/admin/announcements", headers=benefactor_headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"

        # Try to create
        response = requests.post(
            f"{BASE_URL}/api/admin/announcements",
            headers=benefactor_headers,
            json={"title": "Should fail", "body": "Blocked"},
        )
        assert response.status_code == 403


# ══════════════════════════════════════════════════════════
# SYSTEM HEALTH TESTS
# ══════════════════════════════════════════════════════════


class TestSystemHealth:
    """System Health endpoint tests - Founder only"""

    def test_get_system_health_founder(self, founder_headers):
        """GET /api/admin/system-health - founder can access"""
        response = requests.get(
            f"{BASE_URL}/api/admin/system-health", headers=founder_headers
        )
        assert response.status_code == 200
        data = response.json()

        # Validate structure
        assert "timestamp" in data
        assert "database" in data
        assert "activity" in data
        assert "queues" in data
        assert "status" in data

        # Validate database stats
        db = data["database"]
        assert "users" in db
        assert "estates" in db
        assert "documents" in db

        # Validate activity metrics
        activity = data["activity"]
        assert "active_sessions_24h" in activity
        assert "client_errors_24h" in activity
        assert "audit_events_today" in activity

        print(
            f"System health: {data['status']}, Users: {db['users']}, Estates: {db['estates']}"
        )

    def test_system_health_blocked_for_benefactor(self, benefactor_headers):
        """Benefactor cannot access system health"""
        response = requests.get(
            f"{BASE_URL}/api/admin/system-health", headers=benefactor_headers
        )
        assert response.status_code == 403


# ══════════════════════════════════════════════════════════
# ESCALATIONS TESTS
# ══════════════════════════════════════════════════════════


class TestEscalations:
    """Escalations endpoint tests - Staff creates, Founder resolves"""

    def test_create_escalation(self, founder_headers):
        """POST /api/ops/escalations - staff can create"""
        response = requests.post(
            f"{BASE_URL}/api/ops/escalations",
            headers=founder_headers,
            json={
                "subject": f"TEST_Escalation_{uuid4().hex[:8]}",
                "description": "Test escalation description",
                "priority": "high",
                "related_type": "support",
                "related_id": "",
            },
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["status"] == "open"
        assert data["priority"] == "high"
        return data["id"]

    def test_list_escalations(self, founder_headers):
        """GET /api/ops/escalations - staff can list"""
        response = requests.get(
            f"{BASE_URL}/api/ops/escalations", headers=founder_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} escalations")

    def test_list_escalations_with_filter(self, founder_headers):
        """GET /api/ops/escalations?status=open - filter by status"""
        response = requests.get(
            f"{BASE_URL}/api/ops/escalations?status=open", headers=founder_headers
        )
        assert response.status_code == 200
        data = response.json()
        # All should be open
        for item in data:
            assert item["status"] == "open"

    def test_resolve_escalation_founder(self, founder_headers):
        """PUT /api/ops/escalations/{id}/resolve - founder can resolve"""
        # First create one
        create_resp = requests.post(
            f"{BASE_URL}/api/ops/escalations",
            headers=founder_headers,
            json={
                "subject": f"TEST_ToResolve_{uuid4().hex[:8]}",
                "description": "Will be resolved",
                "priority": "normal",
            },
        )
        assert create_resp.status_code == 200
        escalation_id = create_resp.json()["id"]

        # Now resolve
        response = requests.put(
            f"{BASE_URL}/api/ops/escalations/{escalation_id}/resolve",
            headers=founder_headers,
            json={"resolution_note": "Issue resolved via testing"},
        )
        assert response.status_code == 200
        assert response.json()["resolved"]

    def test_escalations_blocked_for_benefactor(self, benefactor_headers):
        """Benefactor cannot access escalations endpoints"""
        response = requests.get(
            f"{BASE_URL}/api/ops/escalations", headers=benefactor_headers
        )
        assert response.status_code == 403


# ══════════════════════════════════════════════════════════
# SHIFT NOTES TESTS
# ══════════════════════════════════════════════════════════


class TestShiftNotes:
    """Shift Notes endpoint tests - Staff creates, acknowledges"""

    def test_create_shift_note(self, founder_headers):
        """POST /api/ops/shift-notes - staff can create"""
        response = requests.post(
            f"{BASE_URL}/api/ops/shift-notes",
            headers=founder_headers,
            json={
                "content": f"TEST_ShiftNote_{uuid4().hex[:8]} - Test handoff note",
                "category": "general",
            },
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["content"].startswith("TEST_")
        assert data["category"] == "general"
        return data["id"]

    def test_list_shift_notes(self, founder_headers):
        """GET /api/ops/shift-notes - staff can list"""
        response = requests.get(
            f"{BASE_URL}/api/ops/shift-notes", headers=founder_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} shift notes")

    def test_acknowledge_shift_note(self, founder_headers):
        """POST /api/ops/shift-notes/{id}/acknowledge - staff can acknowledge"""
        # First create one
        create_resp = requests.post(
            f"{BASE_URL}/api/ops/shift-notes",
            headers=founder_headers,
            json={"content": f"TEST_ToAck_{uuid4().hex[:8]}", "category": "urgent"},
        )
        assert create_resp.status_code == 200
        note_id = create_resp.json()["id"]

        # Acknowledge it
        response = requests.post(
            f"{BASE_URL}/api/ops/shift-notes/{note_id}/acknowledge",
            headers=founder_headers,
        )
        assert response.status_code == 200
        assert response.json()["acknowledged"]

    def test_shift_notes_blocked_for_benefactor(self, benefactor_headers):
        """Benefactor cannot access shift notes endpoints"""
        response = requests.get(
            f"{BASE_URL}/api/ops/shift-notes", headers=benefactor_headers
        )
        assert response.status_code == 403


# ══════════════════════════════════════════════════════════
# KNOWLEDGE BASE TESTS
# ══════════════════════════════════════════════════════════


class TestKnowledgeBase:
    """Knowledge Base endpoint tests - Founder creates, Staff reads"""

    def test_create_kb_article_founder(self, founder_headers):
        """POST /api/admin/knowledge-base - founder can create"""
        response = requests.post(
            f"{BASE_URL}/api/admin/knowledge-base",
            headers=founder_headers,
            json={
                "title": f"TEST_KB_{uuid4().hex[:8]}",
                "content": "Test SOP content for testing purposes",
                "category": "support",
                "tags": ["test", "support"],
            },
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["title"].startswith("TEST_")
        assert data["category"] == "support"
        return data["id"]

    def test_list_kb_articles(self, founder_headers):
        """GET /api/admin/knowledge-base - staff can list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/knowledge-base", headers=founder_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} KB articles")

    def test_list_kb_articles_with_filter(self, founder_headers):
        """GET /api/admin/knowledge-base?category=support - filter by category"""
        response = requests.get(
            f"{BASE_URL}/api/admin/knowledge-base?category=support",
            headers=founder_headers,
        )
        assert response.status_code == 200
        data = response.json()
        for item in data:
            assert item["category"] == "support"

    def test_update_kb_article_founder(self, founder_headers):
        """PUT /api/admin/knowledge-base/{id} - founder can update"""
        # First create one
        create_resp = requests.post(
            f"{BASE_URL}/api/admin/knowledge-base",
            headers=founder_headers,
            json={
                "title": f"TEST_ToUpdate_{uuid4().hex[:8]}",
                "content": "Original content",
                "category": "general",
                "tags": [],
            },
        )
        assert create_resp.status_code == 200
        article_id = create_resp.json()["id"]

        # Update
        response = requests.put(
            f"{BASE_URL}/api/admin/knowledge-base/{article_id}",
            headers=founder_headers,
            json={
                "title": f"TEST_Updated_{uuid4().hex[:8]}",
                "content": "Updated content via testing",
                "category": "verification",
                "tags": ["updated"],
            },
        )
        assert response.status_code == 200
        assert response.json()["updated"]

    def test_delete_kb_article_founder(self, founder_headers):
        """DELETE /api/admin/knowledge-base/{id} - founder can delete"""
        # First create one
        create_resp = requests.post(
            f"{BASE_URL}/api/admin/knowledge-base",
            headers=founder_headers,
            json={
                "title": f"TEST_ToDelete_{uuid4().hex[:8]}",
                "content": "Will be deleted",
                "category": "general",
                "tags": [],
            },
        )
        assert create_resp.status_code == 200
        article_id = create_resp.json()["id"]

        # Delete
        response = requests.delete(
            f"{BASE_URL}/api/admin/knowledge-base/{article_id}", headers=founder_headers
        )
        assert response.status_code == 200
        assert response.json()["deleted"]

    def test_kb_blocked_for_benefactor(self, benefactor_headers):
        """Benefactor cannot access knowledge base endpoints"""
        response = requests.get(
            f"{BASE_URL}/api/admin/knowledge-base", headers=benefactor_headers
        )
        assert response.status_code == 403


# ══════════════════════════════════════════════════════════
# QUICK SEARCH TESTS
# ══════════════════════════════════════════════════════════


class TestQuickSearch:
    """Quick Search endpoint tests - Staff only"""

    def test_search_query(self, founder_headers):
        """GET /api/ops/search?q=test - staff can search"""
        response = requests.get(
            f"{BASE_URL}/api/ops/search?q=test", headers=founder_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Search 'test' returned {len(data)} results")

    def test_search_requires_min_length(self, founder_headers):
        """GET /api/ops/search?q=a - requires at least 2 chars"""
        response = requests.get(
            f"{BASE_URL}/api/ops/search?q=a", headers=founder_headers
        )
        # Should return 422 validation error
        assert response.status_code == 422

    def test_search_blocked_for_benefactor(self, benefactor_headers):
        """Benefactor cannot access search endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/ops/search?q=test", headers=benefactor_headers
        )
        assert response.status_code == 403


# ══════════════════════════════════════════════════════════
# MY ACTIVITY TESTS
# ══════════════════════════════════════════════════════════


class TestMyActivity:
    """My Activity endpoint tests - Staff sees own audit trail"""

    def test_get_my_activity(self, founder_headers):
        """GET /api/ops/my-activity - staff can view own activity"""
        response = requests.get(
            f"{BASE_URL}/api/ops/my-activity?limit=50", headers=founder_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} activity entries for current user")

        # Verify structure of first entry if exists
        if len(data) > 0:
            entry = data[0]
            assert "timestamp" in entry
            assert "action" in entry

    def test_my_activity_blocked_for_benefactor(self, benefactor_headers):
        """Benefactor cannot access my-activity endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/ops/my-activity", headers=benefactor_headers
        )
        assert response.status_code == 403


# ══════════════════════════════════════════════════════════
# RBAC COMPREHENSIVE TEST
# ══════════════════════════════════════════════════════════


class TestRBAC:
    """Comprehensive RBAC tests - benefactors blocked from all staff endpoints"""

    def test_benefactor_blocked_from_admin_get_endpoints(self, benefactor_headers):
        """Benefactor cannot access any /api/admin/* GET endpoints"""
        admin_endpoints = [
            "/api/admin/announcements",
            "/api/admin/system-health",
            "/api/admin/knowledge-base",
        ]

        for endpoint in admin_endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}", headers=benefactor_headers)
            assert response.status_code == 403, (
                f"GET {endpoint} should be blocked, got {response.status_code}"
            )
            print(f"✓ GET {endpoint} correctly blocked for benefactor")

    def test_benefactor_blocked_from_ops_get_endpoints(self, benefactor_headers):
        """Benefactor cannot access any /api/ops/* GET endpoints"""
        ops_endpoints = [
            "/api/ops/escalations",
            "/api/ops/shift-notes",
            "/api/ops/my-activity",
            "/api/ops/search?q=test",
        ]

        for endpoint in ops_endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}", headers=benefactor_headers)
            assert response.status_code == 403, (
                f"GET {endpoint} should be blocked, got {response.status_code}"
            )
            print(f"✓ GET {endpoint} correctly blocked for benefactor")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
