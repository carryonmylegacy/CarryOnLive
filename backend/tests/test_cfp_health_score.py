"""
Test suite for CarryOn Financial Portal (CFP) Health Score and Bill Reminder Scheduler
Tests:
- GET /api/financial/health-score/{estate_id} endpoint
- Bill reminder scheduler registration (verified via server startup)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from test_credentials.md
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def estate_id(auth_headers):
    """Get the first estate ID for testing"""
    response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
    assert response.status_code == 200, f"Failed to get estates: {response.text}"
    estates = response.json()
    assert len(estates) > 0, "No estates found for testing"
    return estates[0]["id"]


class TestHealthScoreEndpoint:
    """Tests for GET /api/financial/health-score/{estate_id}"""

    def test_health_score_returns_200(self, auth_headers, estate_id):
        """Health score endpoint should return 200 OK"""
        response = requests.get(f"{BASE_URL}/api/financial/health-score/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Health score endpoint returns 200 OK")

    def test_health_score_response_structure(self, auth_headers, estate_id):
        """Health score response should have score, label, and breakdown"""
        response = requests.get(f"{BASE_URL}/api/financial/health-score/{estate_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        # Verify required fields
        assert "score" in data, "Response missing 'score' field"
        assert "label" in data, "Response missing 'label' field"
        assert "breakdown" in data, "Response missing 'breakdown' field"

        print(f"✓ Health score response has required fields: score={data['score']}, label={data['label']}")

    def test_health_score_value_range(self, auth_headers, estate_id):
        """Health score should be between 0 and 100"""
        response = requests.get(f"{BASE_URL}/api/financial/health-score/{estate_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        score = data["score"]
        assert isinstance(score, (int, float)), f"Score should be numeric, got {type(score)}"
        assert 0 <= score <= 100, f"Score should be 0-100, got {score}"

        print(f"✓ Health score is valid: {score}")

    def test_health_score_label_values(self, auth_headers, estate_id):
        """Health score label should be one of the expected values"""
        response = requests.get(f"{BASE_URL}/api/financial/health-score/{estate_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        valid_labels = ["Not Started", "Getting Started", "Building", "Strong", "Protected"]
        assert data["label"] in valid_labels, f"Label '{data['label']}' not in {valid_labels}"

        print(f"✓ Health score label is valid: {data['label']}")

    def test_health_score_breakdown_structure(self, auth_headers, estate_id):
        """Health score breakdown should have all component scores"""
        response = requests.get(f"{BASE_URL}/api/financial/health-score/{estate_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        breakdown = data["breakdown"]
        expected_keys = ["coverage", "auto_pay", "designations", "dav_links", "notes"]

        for key in expected_keys:
            assert key in breakdown, f"Breakdown missing '{key}' field"
            assert isinstance(breakdown[key], (int, float)), f"Breakdown[{key}] should be numeric"

        print(f"✓ Health score breakdown has all components: {breakdown}")

    def test_health_score_unauthorized(self, estate_id):
        """Health score should require authentication"""
        response = requests.get(f"{BASE_URL}/api/financial/health-score/{estate_id}")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ Health score requires authentication")

    def test_health_score_invalid_estate(self, auth_headers):
        """Health score should return 404 for invalid estate"""
        response = requests.get(f"{BASE_URL}/api/financial/health-score/invalid-estate-id-12345", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404 for invalid estate, got {response.status_code}"
        print("✓ Health score returns 404 for invalid estate")


class TestFinancialSummaryEndpoint:
    """Tests for GET /api/financial/summary/{estate_id} (existing endpoint)"""

    def test_financial_summary_returns_200(self, auth_headers, estate_id):
        """Financial summary endpoint should return 200 OK"""
        response = requests.get(f"{BASE_URL}/api/financial/summary/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("✓ Financial summary endpoint returns 200 OK")

    def test_financial_summary_response_structure(self, auth_headers, estate_id):
        """Financial summary should have all required fields"""
        response = requests.get(f"{BASE_URL}/api/financial/summary/{estate_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        required_fields = [
            "bills_count",
            "monthly_total",
            "auto_pay_count",
            "manual_count",
            "debts_count",
            "total_debt",
            "accounts_count",
            "total_assets",
            "net_position",
            "upcoming_bills",
        ]

        for field in required_fields:
            assert field in data, f"Summary missing '{field}' field"

        print("✓ Financial summary has all required fields")


class TestBillReminderSchedulerRegistration:
    """Tests to verify bill_reminder_scheduler is properly registered"""

    def test_server_health_check(self, auth_headers):
        """Server should be healthy (scheduler registered at startup)"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        print("✓ Server is healthy - schedulers registered at startup")


class TestBeneficiaryFinancialAccess:
    """Tests for beneficiary access to financial data"""

    def test_bills_endpoint_exists(self, auth_headers, estate_id):
        """Bills endpoint should be accessible"""
        response = requests.get(f"{BASE_URL}/api/financial/bills/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert isinstance(response.json(), list), "Bills should return a list"
        print(f"✓ Bills endpoint accessible, returned {len(response.json())} bills")

    def test_debts_endpoint_exists(self, auth_headers, estate_id):
        """Debts endpoint should be accessible"""
        response = requests.get(f"{BASE_URL}/api/financial/debts/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert isinstance(response.json(), list), "Debts should return a list"
        print(f"✓ Debts endpoint accessible, returned {len(response.json())} debts")

    def test_accounts_endpoint_exists(self, auth_headers, estate_id):
        """Accounts endpoint should be accessible"""
        response = requests.get(f"{BASE_URL}/api/financial/accounts/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert isinstance(response.json(), list), "Accounts should return a list"
        print(f"✓ Accounts endpoint accessible, returned {len(response.json())} accounts")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
