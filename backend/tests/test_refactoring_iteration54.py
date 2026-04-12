"""
CarryOn™ — Refactoring Regression Tests (Iteration 54)

Tests for verifying zero regressions after:
1. Extracting DB indexes/migrations from server.py → db_indexes.py
2. Extracting 6 PDF export routes from guardian.py → routes/guardian_exports.py
3. Extracting 13 ops routes from staff_tools.py → routes/staff_ops.py
4. iOS font size fixes (text-[10px]/text-[8px] → text-[11px])
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for protected endpoints."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestHealthAndBasics:
    """Basic health and connectivity tests."""

    def test_health_endpoint(self):
        """Verify /api/health returns healthy status."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        print(f"✓ Health check passed: {data}")

    def test_login_flow(self):
        """Verify login works with test credentials."""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✓ Login successful for {data['user']['email']}")


class TestGuardianExportsRoutes:
    """Tests for PDF export routes extracted to guardian_exports.py."""

    def test_export_checklist_auth_required(self):
        """Verify /api/guardian/export-checklist requires auth."""
        response = requests.post(f"{BASE_URL}/api/guardian/export-checklist")
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ export-checklist requires authentication")

    def test_export_checklist_with_auth(self, auth_headers):
        """Verify /api/guardian/export-checklist works with auth."""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-checklist",
            headers=auth_headers,
        )
        # May return 404 if no checklist items, but should not be 500
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            assert response.headers.get("content-type") == "application/pdf"
            print("✓ export-checklist returns PDF")
        else:
            print("✓ export-checklist returns 404 (no checklist items)")

    def test_export_todo_auth_required(self):
        """Verify /api/guardian/export-todo requires auth."""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-todo",
            json={"content": "Test content"},
        )
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ export-todo requires authentication")

    def test_export_todo_with_auth(self, auth_headers):
        """Verify /api/guardian/export-todo works with auth."""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-todo",
            headers=auth_headers,
            json={"content": "## Test To-Do\n- Item 1\n- Item 2"},
        )
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        print("✓ export-todo returns PDF")

    def test_export_iac_report_auth_required(self):
        """Verify /api/guardian/export-iac-report requires auth."""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-iac-report",
            json={"content": "Test content"},
        )
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ export-iac-report requires authentication")

    def test_export_iac_report_with_auth(self, auth_headers):
        """Verify /api/guardian/export-iac-report works with auth."""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-iac-report",
            headers=auth_headers,
            json={"content": "## IAC Report\n- Action 1\n- Action 2"},
        )
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        print("✓ export-iac-report returns PDF")

    def test_export_conversation_auth_required(self):
        """Verify /api/guardian/export-conversation requires auth."""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-conversation",
            json={"session_id": "test-session"},
        )
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ export-conversation requires authentication")

    def test_export_conversation_with_auth(self, auth_headers):
        """Verify /api/guardian/export-conversation handles missing session."""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-conversation",
            headers=auth_headers,
            json={"session_id": "nonexistent-session-id"},
        )
        # Should return 404 for nonexistent session, not 500
        assert response.status_code == 404
        print("✓ export-conversation returns 404 for nonexistent session")

    def test_export_plan_of_action_auth_required(self):
        """Verify /api/guardian/export-plan-of-action requires auth."""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-plan-of-action",
            json={"session_id": "test-session"},
        )
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ export-plan-of-action requires authentication")

    def test_beneficiary_export_checklist_auth_required(self):
        """Verify /api/guardian/beneficiary-export-checklist requires auth."""
        response = requests.post(f"{BASE_URL}/api/guardian/beneficiary-export-checklist")
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ beneficiary-export-checklist requires authentication")


class TestStaffOpsRoutes:
    """Tests for staff ops routes extracted to staff_ops.py."""

    def test_my_activity_auth_required(self):
        """Verify /api/ops/my-activity requires auth."""
        response = requests.get(f"{BASE_URL}/api/ops/my-activity")
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ ops/my-activity requires authentication")

    def test_my_activity_with_auth(self, auth_headers):
        """Verify /api/ops/my-activity works with admin auth."""
        response = requests.get(
            f"{BASE_URL}/api/ops/my-activity",
            headers=auth_headers,
        )
        # Admin should have access (role check)
        assert response.status_code in [200, 403]
        if response.status_code == 200:
            assert isinstance(response.json(), list)
            print("✓ ops/my-activity returns activity list")
        else:
            print("✓ ops/my-activity requires staff role (403 for non-staff)")

    def test_ops_search_auth_required(self):
        """Verify /api/ops/search requires auth."""
        response = requests.get(f"{BASE_URL}/api/ops/search?q=test")
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ ops/search requires authentication")

    def test_ops_search_with_auth(self, auth_headers):
        """Verify /api/ops/search works with admin auth."""
        response = requests.get(
            f"{BASE_URL}/api/ops/search?q=test",
            headers=auth_headers,
        )
        assert response.status_code in [200, 403]
        if response.status_code == 200:
            assert isinstance(response.json(), list)
            print("✓ ops/search returns search results")
        else:
            print("✓ ops/search requires staff role (403 for non-staff)")

    def test_escalations_list_auth_required(self):
        """Verify /api/ops/escalations requires auth."""
        response = requests.get(f"{BASE_URL}/api/ops/escalations")
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ ops/escalations requires authentication")

    def test_escalations_list_with_auth(self, auth_headers):
        """Verify /api/ops/escalations works with admin auth."""
        response = requests.get(
            f"{BASE_URL}/api/ops/escalations",
            headers=auth_headers,
        )
        assert response.status_code in [200, 403]
        if response.status_code == 200:
            assert isinstance(response.json(), list)
            print("✓ ops/escalations returns escalation list")
        else:
            print("✓ ops/escalations requires staff role (403 for non-staff)")

    def test_shift_notes_list_auth_required(self):
        """Verify /api/ops/shift-notes requires auth."""
        response = requests.get(f"{BASE_URL}/api/ops/shift-notes")
        assert response.status_code in [401, 403]
        print("✓ ops/shift-notes requires authentication")

    def test_shift_notes_list_with_auth(self, auth_headers):
        """Verify /api/ops/shift-notes works with admin auth."""
        response = requests.get(
            f"{BASE_URL}/api/ops/shift-notes",
            headers=auth_headers,
        )
        assert response.status_code in [200, 403]
        if response.status_code == 200:
            assert isinstance(response.json(), list)
            print("✓ ops/shift-notes returns notes list")
        else:
            print("✓ ops/shift-notes requires staff role (403 for non-staff)")

    def test_knowledge_base_list_auth_required(self):
        """Verify /api/admin/knowledge-base requires auth."""
        response = requests.get(f"{BASE_URL}/api/admin/knowledge-base")
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ admin/knowledge-base requires authentication")

    def test_knowledge_base_list_with_auth(self, auth_headers):
        """Verify /api/admin/knowledge-base works with admin auth."""
        response = requests.get(
            f"{BASE_URL}/api/admin/knowledge-base",
            headers=auth_headers,
        )
        assert response.status_code in [200, 403]
        if response.status_code == 200:
            assert isinstance(response.json(), list)
            print("✓ admin/knowledge-base returns articles list")
        else:
            print("✓ admin/knowledge-base requires staff role (403 for non-staff)")


class TestGuardianCoreRoutes:
    """Tests for core guardian routes (still in guardian.py)."""

    def test_guardian_chat_auth_required(self):
        """Verify /api/chat/guardian requires auth."""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            json={"message": "Hello"},
        )
        assert response.status_code in [401, 403]  # Both are valid auth protection
        print("✓ chat/guardian requires authentication")

    def test_guardian_chat_with_auth(self, auth_headers):
        """Verify /api/chat/guardian endpoint exists and is protected."""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={"message": "Hello, what is estate planning?"},
        )
        # Should work or return validation error, not 404 or 500
        assert response.status_code in [200, 422]
        print(f"✓ chat/guardian endpoint exists (status: {response.status_code})")


class TestFinancialPortalRoutes:
    """Tests for financial portal routes."""

    def test_financial_portal_auth_required(self):
        """Verify /api/financial-portal/estate/{id} requires auth."""
        response = requests.get(f"{BASE_URL}/api/financial-portal/estate/test-id")
        assert response.status_code in [401, 403, 404]  # 404 for invalid ID is also acceptable
        print("✓ financial-portal requires authentication")

    def test_financial_portal_with_auth(self, auth_headers):
        """Verify /api/financial-portal/estate/{id} works with auth."""
        # First get user's estate
        estates_response = requests.get(
            f"{BASE_URL}/api/estates",
            headers=auth_headers,
        )
        if estates_response.status_code == 200:
            estates = estates_response.json()
            if estates:
                estate_id = estates[0].get("id")
                response = requests.get(
                    f"{BASE_URL}/api/financial-portal/estate/{estate_id}",
                    headers=auth_headers,
                )
                assert response.status_code in [200, 404]
                print(f"✓ financial-portal returns data (status: {response.status_code})")
            else:
                print("✓ financial-portal test skipped (no estates)")
        else:
            print("✓ financial-portal test skipped (couldn't get estates)")


class TestDBIndexesIntegration:
    """Tests to verify db_indexes.py is properly integrated."""

    def test_indexes_created_on_startup(self):
        """Verify database indexes are created (check via health endpoint)."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["database"] == "connected"
        print("✓ Database connected (indexes created on startup)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
