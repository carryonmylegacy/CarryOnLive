"""
CarryOn™ Backend Tests — 5 New Enhancement Features
Tests: Onboarding Wizard, Quick-Start Templates, Emergency Access Protocol

Test credentials: founder@carryon.us / CarryOntheWisdom! (role: benefactor)
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# ==================== FIXTURES ====================


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for founder user (benefactor role)."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "founder@carryon.us", "password": "CarryOntheWisdom!"},
    )
    if response.status_code != 200:
        pytest.skip(f"Login failed with status {response.status_code}: {response.text}")
    data = response.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def estate_id(auth_headers):
    """Get the founder's estate ID."""
    response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
    if response.status_code != 200 or not response.json():
        pytest.skip("No estates found for founder user")
    return response.json()[0]["id"]


# ==================== FEATURE 1: ONBOARDING WIZARD ====================


class TestOnboardingWizard:
    """Tests for Onboarding Wizard feature - GET /api/onboarding/progress, POST complete-step, POST dismiss"""

    def test_onboarding_progress_requires_auth(self):
        """GET /api/onboarding/progress returns 401 without authentication."""
        response = requests.get(f"{BASE_URL}/api/onboarding/progress")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Onboarding progress requires authentication (401)")

    def test_onboarding_progress_returns_steps(self, auth_headers):
        """GET /api/onboarding/progress returns steps with completion status."""
        response = requests.get(f"{BASE_URL}/api/onboarding/progress", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        # Validate structure
        assert "steps" in data, "Response should contain 'steps'"
        assert "completed_count" in data, "Response should contain 'completed_count'"
        assert "total_steps" in data, "Response should contain 'total_steps'"
        assert "progress_pct" in data, "Response should contain 'progress_pct'"
        assert "dismissed" in data, "Response should contain 'dismissed'"

        # Validate steps structure
        assert len(data["steps"]) == 5, f"Expected 5 steps, got {len(data['steps'])}"

        expected_keys = [
            "create_estate",
            "add_beneficiary",
            "upload_document",
            "create_message",
            "review_readiness",
        ]
        step_keys = [s["key"] for s in data["steps"]]
        for key in expected_keys:
            assert key in step_keys, f"Step '{key}' should be in steps"

        # Each step should have key, label, description, completed
        for step in data["steps"]:
            assert "key" in step, "Step should have 'key'"
            assert "label" in step, "Step should have 'label'"
            assert "completed" in step, "Step should have 'completed'"

        print(
            f"✓ Onboarding progress returned {data['completed_count']}/{data['total_steps']} steps complete ({data['progress_pct']}%)"
        )
        print(f"  Steps: {[s['key'] for s in data['steps'] if s['completed']]}")

    def test_onboarding_founder_has_some_progress(self, auth_headers):
        """Founder user should have at least create_estate completed (since they have an estate)."""
        response = requests.get(f"{BASE_URL}/api/onboarding/progress", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        # Founder should have estate created
        estate_step = next((s for s in data["steps"] if s["key"] == "create_estate"), None)
        assert estate_step is not None, "create_estate step should exist"
        assert estate_step["completed"], "Founder should have create_estate completed"

        # According to test context, founder should have 2/5 complete (create_estate + add_beneficiary)
        assert data["completed_count"] >= 1, f"Expected at least 1 completed step, got {data['completed_count']}"
        print(f"✓ Founder has {data['completed_count']}/5 steps complete")

    def test_complete_step_requires_auth(self):
        """POST /api/onboarding/complete-step/{step} returns 401 without authentication."""
        response = requests.post(f"{BASE_URL}/api/onboarding/complete-step/review_readiness")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Complete step requires authentication (401)")

    def test_complete_step_invalid_step(self, auth_headers):
        """POST /api/onboarding/complete-step/{invalid} returns 400."""
        response = requests.post(
            f"{BASE_URL}/api/onboarding/complete-step/invalid_step_name",
            headers=auth_headers,
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Invalid step returns 400")

    def test_complete_step_review_readiness(self, auth_headers):
        """POST /api/onboarding/complete-step/review_readiness marks step complete."""
        response = requests.post(
            f"{BASE_URL}/api/onboarding/complete-step/review_readiness",
            headers=auth_headers,
            json={},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data.get("success"), "Response should indicate success"
        assert data.get("step") == "review_readiness", "Response should echo the step key"
        print("✓ Complete step 'review_readiness' succeeded")

    def test_dismiss_requires_auth(self):
        """POST /api/onboarding/dismiss returns 401 without authentication."""
        response = requests.post(f"{BASE_URL}/api/onboarding/dismiss")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Dismiss requires authentication (401)")

    def test_dismiss_onboarding(self, auth_headers):
        """POST /api/onboarding/dismiss hides the wizard."""
        response = requests.post(f"{BASE_URL}/api/onboarding/dismiss", headers=auth_headers, json={})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data.get("success"), "Response should indicate success"

        # Verify dismissed state
        progress_response = requests.get(f"{BASE_URL}/api/onboarding/progress", headers=auth_headers)
        assert progress_response.status_code == 200
        assert progress_response.json().get("dismissed"), "Dismissed should be True after dismiss"
        print("✓ Onboarding wizard dismissed successfully")


# ==================== FEATURE 4: QUICK-START TEMPLATES ====================


class TestQuickStartTemplates:
    """Tests for Quick-Start Templates feature - GET /api/templates/scenarios, POST /api/templates/apply"""

    def test_scenarios_requires_auth(self):
        """GET /api/templates/scenarios returns 401 without authentication."""
        response = requests.get(f"{BASE_URL}/api/templates/scenarios")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Templates scenarios requires authentication (401)")

    def test_get_scenario_templates(self, auth_headers):
        """GET /api/templates/scenarios returns 4 templates."""
        response = requests.get(f"{BASE_URL}/api/templates/scenarios", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        templates = response.json()
        assert isinstance(templates, list), "Response should be a list"
        assert len(templates) == 4, f"Expected 4 templates, got {len(templates)}"

        # Validate expected template IDs
        template_ids = [t["id"] for t in templates]
        expected_ids = ["hospice", "military", "new_parent", "recently_married"]
        for tid in expected_ids:
            assert tid in template_ids, f"Template '{tid}' should exist"

        # Validate template structure
        for t in templates:
            assert "id" in t, "Template should have 'id'"
            assert "name" in t, "Template should have 'name'"
            assert "description" in t, "Template should have 'description'"
            assert "icon" in t, "Template should have 'icon'"
            assert "item_count" in t, "Template should have 'item_count'"

        print(f"✓ Got 4 templates: {template_ids}")

    def test_template_item_counts(self, auth_headers):
        """Verify template item counts match expected values."""
        response = requests.get(f"{BASE_URL}/api/templates/scenarios", headers=auth_headers)
        assert response.status_code == 200

        templates = {t["id"]: t for t in response.json()}

        # Expected counts per requirements: hospice=14, military=10, new_parent=9, recently_married=9
        expected_counts = {
            "hospice": 14,
            "military": 10,
            "new_parent": 9,
            "recently_married": 9,
        }

        for tid, expected_count in expected_counts.items():
            actual_count = templates.get(tid, {}).get("item_count", 0)
            assert actual_count == expected_count, f"{tid} should have {expected_count} items, got {actual_count}"

        print("✓ Template item counts: hospice=14, military=10, new_parent=9, recently_married=9")

    def test_apply_template_requires_auth(self):
        """POST /api/templates/apply returns 401 without authentication."""
        response = requests.post(
            f"{BASE_URL}/api/templates/apply",
            json={"estate_id": "fake", "template_id": "hospice"},
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Apply template requires authentication (401)")

    def test_apply_template_invalid_template(self, auth_headers, estate_id):
        """POST /api/templates/apply returns 404 for invalid template ID."""
        response = requests.post(
            f"{BASE_URL}/api/templates/apply",
            headers=auth_headers,
            json={"estate_id": estate_id, "template_id": "invalid_template_id"},
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✓ Invalid template returns 404")

    def test_apply_hospice_template(self, auth_headers, estate_id):
        """POST /api/templates/apply applies hospice template (14 items)."""
        response = requests.post(
            f"{BASE_URL}/api/templates/apply",
            headers=auth_headers,
            json={"estate_id": estate_id, "template_id": "hospice"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data.get("success"), "Response should indicate success"
        assert "items_added" in data, "Response should contain 'items_added'"
        assert data.get("template") == "Hospice Care", "Response should identify template name"

        # Items added depends on whether they already exist (duplicates skipped)
        items_added = data.get("items_added", 0)
        print(f"✓ Applied Hospice template: {items_added} items added")

    def test_apply_military_template(self, auth_headers, estate_id):
        """POST /api/templates/apply applies military template (10 items)."""
        response = requests.post(
            f"{BASE_URL}/api/templates/apply",
            headers=auth_headers,
            json={"estate_id": estate_id, "template_id": "military"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data.get("success")
        print(f"✓ Applied Military Deployment template: {data.get('items_added', 0)} items added")


# ==================== FEATURE 5: EMERGENCY ACCESS PROTOCOL ====================


class TestEmergencyAccess:
    """Tests for Emergency Access Protocol - request/my-requests/admin endpoints"""

    def test_request_requires_auth(self):
        """POST /api/emergency-access/request returns 401 without authentication."""
        response = requests.post(
            f"{BASE_URL}/api/emergency-access/request",
            json={
                "estate_id": "fake",
                "reason": "test",
                "relationship_to_benefactor": "test",
            },
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Emergency access request requires authentication (401)")

    def test_request_forbidden_for_non_beneficiary(self, auth_headers, estate_id):
        """POST /api/emergency-access/request returns 403 for non-beneficiary (founder is the owner, not a beneficiary)."""
        response = requests.post(
            f"{BASE_URL}/api/emergency-access/request",
            headers=auth_headers,
            json={
                "estate_id": estate_id,
                "reason": "Test emergency access request",
                "relationship_to_benefactor": "child",
                "urgency": "high",
            },
        )
        # Founder user is the estate owner, not a beneficiary - should get 403
        assert response.status_code == 403, (
            f"Expected 403 for non-beneficiary, got {response.status_code}: {response.text}"
        )
        print("✓ Emergency access request correctly denied for non-beneficiary (403)")

    def test_my_requests_requires_auth(self):
        """GET /api/emergency-access/my-requests returns 401 without authentication."""
        response = requests.get(f"{BASE_URL}/api/emergency-access/my-requests")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ My requests requires authentication (401)")

    def test_my_requests_returns_list(self, auth_headers):
        """GET /api/emergency-access/my-requests returns a list (empty for founder)."""
        response = requests.get(f"{BASE_URL}/api/emergency-access/my-requests", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ My requests returned {len(data)} requests")

    def test_active_requires_auth(self):
        """GET /api/emergency-access/active returns 401 without authentication."""
        response = requests.get(f"{BASE_URL}/api/emergency-access/active")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Active emergency access requires authentication (401)")

    def test_active_returns_list(self, auth_headers):
        """GET /api/emergency-access/active returns a list."""
        response = requests.get(f"{BASE_URL}/api/emergency-access/active", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Active emergency access returned {len(data)} grants")

    def test_admin_endpoint_requires_auth(self):
        """GET /api/admin/emergency-access returns 401 without authentication."""
        response = requests.get(f"{BASE_URL}/api/admin/emergency-access")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Admin emergency access requires authentication (401)")

    def test_admin_endpoint_requires_admin_role(self, auth_headers):
        """GET /api/admin/emergency-access returns 403 for non-admin (founder is benefactor, not admin)."""
        response = requests.get(f"{BASE_URL}/api/admin/emergency-access", headers=auth_headers)
        # Founder user has role 'benefactor', not 'admin' - should get 403
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}: {response.text}"
        print("✓ Admin emergency access correctly denied for non-admin (403)")


# ==================== HEALTH CHECK ====================


class TestHealthCheck:
    """Basic health check to ensure API is running."""

    def test_health_endpoint(self):
        """GET /api/health returns healthy status."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

        data = response.json()
        assert data.get("status") == "healthy", "API should be healthy"
        print(f"✓ API health check passed: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
