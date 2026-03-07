"""
Backend Tests for Subscription Billing, Document Thumbnails, and Beneficiary Lifecycle Features
Tests: Iteration 41 - Subscription UI billing toggle, beneficiary plans, family plan request, lifecycle status
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNjA3YjE2NGUtMGQzOS00Yjk1LWI5N2QtMmE2MDM5MTgyNDhhIiwiZW1haWwiOiJmdWxsdGVzdEB0ZXN0LmNvbSIsInJvbGUiOiJiZW5lZmFjdG9yIiwiaXNzdWVkX2F0IjoiMjAyNi0wMi0yOFQxOToyMTo0MC42ODI0NDcrMDA6MDAiLCJleHAiOjE3NzIzMzUzMDB9.pk5w6rPA0G1XR0CgfmZ2uWfFBddrKwjeae-lY2GtwYk"


# Admin login to get fresh token
def get_admin_token():
    """Get admin token via login"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "founder@carryon.us", "password": "CarryOntheWisdom!"},
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    return None


@pytest.fixture
def auth_headers():
    """Auth headers for test user (benefactor role)"""
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture
def admin_headers():
    """Auth headers for admin user"""
    token = get_admin_token()
    return {"Authorization": f"Bearer {token}"}


class TestSubscriptionPlansEndpoint:
    """Tests for GET /api/subscriptions/plans"""

    def test_plans_returns_200(self):
        """Plans endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

    def test_plans_contains_beneficiary_plans(self):
        """Response should include beneficiary_plans array"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        assert "beneficiary_plans" in data, "beneficiary_plans key missing"
        assert len(data["beneficiary_plans"]) >= 4, (
            "Expected at least 4 beneficiary plans"
        )

    def test_beneficiary_plans_have_quarterly_price(self):
        """All beneficiary plans should have quarterly_price"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        for plan in data["beneficiary_plans"]:
            assert "quarterly_price" in plan, (
                f"Plan {plan['id']} missing quarterly_price"
            )
            assert isinstance(plan["quarterly_price"], (int, float)), (
                "quarterly_price should be numeric"
            )

    def test_beneficiary_plans_have_annual_price(self):
        """All beneficiary plans should have annual_price"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        for plan in data["beneficiary_plans"]:
            assert "annual_price" in plan, f"Plan {plan['id']} missing annual_price"
            assert isinstance(plan["annual_price"], (int, float)), (
                "annual_price should be numeric"
            )

    def test_default_plans_have_quarterly_annual_prices(self):
        """Default plans should also have quarterly and annual prices"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        for plan in data["plans"]:
            assert "quarterly_price" in plan, (
                f"Plan {plan['id']} missing quarterly_price"
            )
            assert "annual_price" in plan, f"Plan {plan['id']} missing annual_price"

    def test_quarterly_price_is_10_percent_discount(self):
        """Quarterly price should be roughly 10% off monthly"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        for plan in data["beneficiary_plans"]:
            if plan["price"] > 0:
                expected = round(plan["price"] * 0.9, 2)
                assert abs(plan["quarterly_price"] - expected) < 0.05, (
                    f"Plan {plan['id']} quarterly price incorrect"
                )

    def test_annual_price_is_20_percent_discount(self):
        """Annual price should be roughly 20% off monthly"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        for plan in data["beneficiary_plans"]:
            if plan["price"] > 0:
                expected = round(plan["price"] * 0.8, 2)
                assert abs(plan["annual_price"] - expected) < 0.05, (
                    f"Plan {plan['id']} annual price incorrect"
                )


class TestSubscriptionCheckout:
    """Tests for POST /api/subscriptions/checkout"""

    def test_checkout_returns_beta_mode_error(self, auth_headers):
        """Checkout should return beta mode error when beta is enabled"""
        response = requests.post(
            f"{BASE_URL}/api/subscriptions/checkout",
            json={
                "plan_id": "premium",
                "billing_cycle": "monthly",
                "origin_url": "https://benef-layout-fix.preview.emergentagent.com",
            },
            headers=auth_headers,
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "beta" in response.json().get("detail", "").lower()

    def test_checkout_requires_auth(self):
        """Checkout should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/subscriptions/checkout",
            json={
                "plan_id": "premium",
                "billing_cycle": "monthly",
                "origin_url": "https://benef-layout-fix.preview.emergentagent.com",
            },
        )
        assert response.status_code in [401, 403], (
            f"Expected 401/403, got {response.status_code}"
        )


class TestFamilyPlanRequest:
    """Tests for POST /api/subscriptions/family-plan-request"""

    def test_family_plan_request_invalid_email_404(self, auth_headers):
        """Request with non-existent benefactor email should return 404"""
        response = requests.post(
            f"{BASE_URL}/api/subscriptions/family-plan-request",
            json={"benefactor_email": "nonexistent@nowhere.com"},
            headers=auth_headers,
        )
        assert response.status_code == 404
        assert "No benefactor account found" in response.json().get("detail", "")

    def test_family_plan_request_requires_auth(self):
        """Family plan request should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/subscriptions/family-plan-request",
            json={"benefactor_email": "test@test.com"},
        )
        assert response.status_code in [401, 403]

    def test_family_plan_request_accepts_benefactor_email(self, auth_headers):
        """Request should accept benefactor_email field"""
        response = requests.post(
            f"{BASE_URL}/api/subscriptions/family-plan-request",
            json={"benefactor_email": "fulltest@test.com"},
            headers=auth_headers,
        )
        # Could be 200 (success) or 400 (duplicate) - both are valid
        assert response.status_code in [200, 400]


class TestBeneficiaryLifecycleStatus:
    """Tests for GET /api/subscriptions/beneficiary/lifecycle-status"""

    def test_lifecycle_status_returns_200(self, auth_headers):
        """Lifecycle status should return 200 for authenticated user"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/beneficiary/lifecycle-status",
            headers=auth_headers,
        )
        assert response.status_code == 200

    def test_lifecycle_status_has_age_events(self, auth_headers):
        """Response should contain age_events array"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/beneficiary/lifecycle-status",
            headers=auth_headers,
        )
        data = response.json()
        assert "age_events" in data, "age_events key missing"
        assert isinstance(data["age_events"], list)

    def test_lifecycle_status_has_grace_period_info(self, auth_headers):
        """Response should contain grace_period info"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/beneficiary/lifecycle-status",
            headers=auth_headers,
        )
        data = response.json()
        assert "grace_period" in data, "grace_period key missing"

    def test_lifecycle_status_requires_auth(self):
        """Lifecycle status should require authentication"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/beneficiary/lifecycle-status"
        )
        assert response.status_code in [401, 403]


class TestAdminTriggerTransition:
    """Tests for POST /api/admin/beneficiary/trigger-transition"""

    def test_trigger_transition_requires_admin(self, auth_headers):
        """Trigger transition should require admin role"""
        response = requests.post(
            f"{BASE_URL}/api/admin/beneficiary/trigger-transition",
            data={"benefactor_id": "test-id"},
            headers=auth_headers,
        )
        assert response.status_code == 403

    def test_trigger_transition_works_for_admin(self, admin_headers):
        """Admin should be able to trigger transition"""
        response = requests.post(
            f"{BASE_URL}/api/admin/beneficiary/trigger-transition",
            data={"benefactor_id": "607b164e-0d39-4b95-b97d-2a603918248a"},
            headers=admin_headers,
        )
        # 200 or 404 depending on if benefactor exists
        assert response.status_code in [200, 404], (
            f"Expected 200/404, got {response.status_code}"
        )
        if response.status_code == 200:
            data = response.json()
            assert "success" in data
            assert "beneficiaries_notified" in data

    def test_trigger_transition_returns_404_for_invalid_benefactor(self, admin_headers):
        """Should return 404 for non-existent benefactor"""
        response = requests.post(
            f"{BASE_URL}/api/admin/beneficiary/trigger-transition",
            data={"benefactor_id": "non-existent-id"},
            headers=admin_headers,
        )
        assert response.status_code == 404


class TestDocumentPreviewForThumbnails:
    """Tests for document preview endpoint used by DocThumbnail component"""

    # Test document IDs from previous iteration
    PDF_DOC_ID = "52e87c23-ab92-4faf-a919-fc5b93720058"
    IMAGE_DOC_ID = "eee6042c-2187-471c-92f2-5aafc8f5858c"

    def test_preview_pdf_returns_blob(self, auth_headers):
        """Preview endpoint should return PDF blob for thumbnail rendering"""
        response = requests.get(
            f"{BASE_URL}/api/documents/{self.PDF_DOC_ID}/preview", headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "pdf" in response.headers.get("content-type", "").lower()

    def test_preview_image_returns_blob(self, auth_headers):
        """Preview endpoint should return image blob for thumbnail rendering"""
        response = requests.get(
            f"{BASE_URL}/api/documents/{self.IMAGE_DOC_ID}/preview",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert "image" in response.headers.get("content-type", "").lower()


class TestSubscriptionStatus:
    """Tests for GET /api/subscriptions/status"""

    def test_status_returns_user_role(self, auth_headers):
        """Subscription status should include user_role for role-aware plan display"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/status", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_role" in data, (
            "user_role key missing - needed for role-aware plan display"
        )
        assert data["user_role"] in ["benefactor", "beneficiary"]

    def test_status_includes_beta_mode(self, auth_headers):
        """Status should indicate beta mode for free feature access"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/status", headers=auth_headers
        )
        data = response.json()
        assert "beta_mode" in data
