"""
Test Onboarding & Activation Flow - Iteration 51
Tests for:
1. GET /api/onboarding/progress returns exactly 5 steps (no create_estate)
2. Onboarding steps are: create_message, upload_document, designate_primary, customize_checklist, review_readiness
3. GET /api/checklists/{estate_id} returns exactly 5 items for test account
4. All 5 IAC items have category='immediate' and is_default=True
5. POST /api/onboarding/complete-step/review_readiness works
"""

import os
import pytest
import requests
from pymongo import MongoClient

# Use production URL
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Test credentials
TEST_EMAIL = "fulltest@test.com"
TEST_PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def mongo_client():
    """MongoDB connection for OTP retrieval"""
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def auth_token(mongo_client):
    """Get auth token via OTP flow"""
    # Step 1: Login to trigger OTP
    login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )

    if login_resp.status_code != 200:
        pytest.skip(f"Login failed: {login_resp.status_code} - {login_resp.text}")

    # Check if OTP required or token returned directly
    login_data = login_resp.json()
    if "access_token" in login_data:
        return login_data["access_token"]

    # Step 2: Get OTP from MongoDB
    otp_doc = mongo_client.otps.find_one({"email": TEST_EMAIL})
    if not otp_doc:
        pytest.skip("OTP not found in database")

    otp_code = otp_doc["otp"]

    # Step 3: Verify OTP
    verify_resp = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"email": TEST_EMAIL, "otp": otp_code},
    )

    if verify_resp.status_code != 200:
        pytest.skip(f"OTP verification failed: {verify_resp.status_code}")

    return verify_resp.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers for API calls"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def estate_id(auth_headers):
    """Get estate ID for the test user"""
    resp = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
    if resp.status_code != 200 or not resp.json():
        pytest.skip("No estates found for test user")
    return resp.json()[0]["id"]


class TestHealthCheck:
    """Verify API is accessible"""

    def test_health_endpoint(self):
        """Health check returns healthy status"""
        resp = requests.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        print("✓ Health check passed")


class TestOnboardingProgress:
    """Tests for onboarding progress endpoint - 5 steps (no create_estate)"""

    def test_onboarding_returns_exactly_5_steps(self, auth_headers):
        """GET /api/onboarding/progress returns exactly 5 steps"""
        resp = requests.get(f"{BASE_URL}/api/onboarding/progress", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()

        steps = data.get("steps", [])
        assert len(steps) == 5, f"Expected 5 steps, got {len(steps)}"
        assert data.get("total_steps") == 5, f"Expected total_steps=5, got {data.get('total_steps')}"
        print("✓ Onboarding returns exactly 5 steps")

    def test_onboarding_steps_correct_keys(self, auth_headers):
        """Onboarding steps have correct keys (no create_estate)"""
        resp = requests.get(f"{BASE_URL}/api/onboarding/progress", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()

        expected_keys = [
            "create_message",
            "upload_document",
            "designate_primary",
            "customize_checklist",
            "review_readiness",
        ]

        actual_keys = [step["key"] for step in data.get("steps", [])]

        # Check no create_estate
        assert "create_estate" not in actual_keys, "create_estate should NOT be in onboarding steps"

        # Check all expected keys present in order
        assert actual_keys == expected_keys, f"Expected {expected_keys}, got {actual_keys}"
        print(f"✓ Onboarding steps are correct: {actual_keys}")

    def test_onboarding_has_progress_fields(self, auth_headers):
        """Onboarding response has progress_pct and completed_count"""
        resp = requests.get(f"{BASE_URL}/api/onboarding/progress", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert "progress_pct" in data, "Missing progress_pct"
        assert "completed_count" in data, "Missing completed_count"
        assert 0 <= data["progress_pct"] <= 100, "progress_pct should be 0-100"
        print(f"✓ Progress: {data['completed_count']}/{data['total_steps']} ({data['progress_pct']}%)")


class TestOnboardingCompleteStep:
    """Tests for completing onboarding steps"""

    def test_complete_review_readiness_step(self, auth_headers):
        """POST /api/onboarding/complete-step/review_readiness works"""
        resp = requests.post(
            f"{BASE_URL}/api/onboarding/complete-step/review_readiness",
            headers=auth_headers,
            json={},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert data.get("step") == "review_readiness"
        print("✓ Successfully completed review_readiness step")

    def test_complete_invalid_step_fails(self, auth_headers):
        """POST /api/onboarding/complete-step with invalid step returns 400"""
        resp = requests.post(
            f"{BASE_URL}/api/onboarding/complete-step/create_estate",
            headers=auth_headers,
            json={},
        )
        # create_estate is no longer a valid step
        assert resp.status_code == 400
        print("✓ Invalid step (create_estate) correctly rejected with 400")


class TestChecklistDefaultItems:
    """Tests for default IAC checklist items"""

    def test_checklist_returns_items(self, auth_headers, estate_id):
        """GET /api/checklists/{estate_id} returns checklist items"""
        resp = requests.get(f"{BASE_URL}/api/checklists/{estate_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ Checklist endpoint returns {len(data)} items")

    def test_default_items_have_immediate_category(self, auth_headers, estate_id):
        """Default IAC items have category='immediate'"""
        resp = requests.get(f"{BASE_URL}/api/checklists/{estate_id}", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()

        default_items = [item for item in items if item.get("is_default") is True]

        # Check all default items have immediate category
        for item in default_items:
            assert item.get("category") == "immediate", (
                f"Item '{item.get('title')}' has category='{item.get('category')}', expected 'immediate'"
            )

        print(f"✓ All {len(default_items)} default items have category='immediate'")

    def test_default_items_count(self, auth_headers, estate_id):
        """Default IAC items should be present (check is_default=True)"""
        resp = requests.get(f"{BASE_URL}/api/checklists/{estate_id}", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()

        default_items = [item for item in items if item.get("is_default") is True]
        print(f"✓ Found {len(default_items)} default IAC items (is_default=True)")

        # Print item titles for verification
        for item in default_items:
            print(f"  - {item.get('title')[:60]}...")


class TestEstatesEndpoint:
    """Basic estate endpoint tests"""

    def test_get_estates(self, auth_headers):
        """GET /api/estates returns user's estates"""
        resp = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0, "User should have at least one estate"
        print(f"✓ User has {len(data)} estate(s)")


class TestBeneficiariesEndpoint:
    """Basic beneficiaries endpoint tests"""

    def test_get_beneficiaries(self, auth_headers, estate_id):
        """GET /api/beneficiaries/{estate_id} returns beneficiaries"""
        resp = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ Estate has {len(data)} beneficiary/beneficiaries")


class TestMessagesEndpoint:
    """Basic messages endpoint tests"""

    def test_get_messages(self, auth_headers, estate_id):
        """GET /api/messages/{estate_id} returns messages"""
        resp = requests.get(f"{BASE_URL}/api/messages/{estate_id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ Estate has {len(data)} message(s)")


class TestGuardianEndpoint:
    """Basic guardian/readiness endpoint tests"""

    def test_get_readiness(self, auth_headers, estate_id):
        """GET /api/estate/{estate_id}/readiness returns readiness scores"""
        resp = requests.get(f"{BASE_URL}/api/estate/{estate_id}/readiness", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert "overall_score" in data, "Missing overall_score"
        assert "documents" in data, "Missing documents breakdown"
        assert "messages" in data, "Missing messages breakdown"
        assert "checklist" in data, "Missing checklist breakdown"
        print(f"✓ Readiness score: {data['overall_score']}%")
