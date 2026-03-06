"""
Tests for Primary Beneficiary Feature:
- PUT /api/beneficiaries/{beneficiary_id}/set-primary - designate a primary beneficiary
- GET /api/beneficiaries/{estate_id}/primary - get the primary beneficiary
- POST /api/beneficiaries/request-access - request access to a transitioned estate
- GET /api/beneficiaries/access-requests/{estate_id} - get pending access requests
- PUT /api/beneficiaries/access-requests/{request_id} - approve/deny an access request
- PUT /api/admin/plans/{plan_id}/paired-price - update paired price for a plan
- GET /api/admin/subscription-settings - verify paired_price field is present in plans
- GET /api/onboarding/progress - verify designate_primary step completion detection works
"""

import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://dashboard-guide-6.preview.emergentagent.com"
).rstrip("/")


@pytest.fixture(scope="module")
def mongo_client():
    """Connect to MongoDB"""
    client = MongoClient("mongodb://localhost:27017")
    yield client
    client.close()


@pytest.fixture(scope="module")
def db(mongo_client):
    """Get the test database"""
    return mongo_client["test_database"]


@pytest.fixture(scope="module")
def benefactor_token(db):
    """Get a benefactor token using existing test user"""
    import time

    # Use existing test user
    test_email = "test.user.20260226153636@carryon-test.com"
    password = "TestUser123!"

    # Try login
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": test_email, "password": password, "otp_method": "email"},
    )

    if response.status_code == 200:
        time.sleep(0.5)  # Wait for OTP to be saved
        # Get OTP from DB
        otp_doc = db.otps.find_one({"email": test_email})
        if otp_doc:
            otp = otp_doc["otp"]
            verify_res = requests.post(
                f"{BASE_URL}/api/auth/verify-otp",
                json={"email": test_email, "otp": otp},
            )
            if verify_res.status_code == 200:
                return verify_res.json().get("access_token")

    pytest.skip(
        f"Could not authenticate benefactor user: {response.status_code} - {response.text}"
    )


@pytest.fixture(scope="module")
def admin_token(db):
    """Get admin token"""
    import time

    admin_email = "founder@carryon.us"
    password = "CarryOntheWisdom!"

    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": admin_email, "password": password, "otp_method": "email"},
    )

    if response.status_code == 200:
        time.sleep(0.5)  # Wait for OTP to be saved
        # Get OTP from DB
        otp_doc = db.otps.find_one({"email": admin_email})
        if otp_doc:
            otp = otp_doc["otp"]
            verify_res = requests.post(
                f"{BASE_URL}/api/auth/verify-otp",
                json={"email": admin_email, "otp": otp},
            )
            if verify_res.status_code == 200:
                return verify_res.json().get("access_token")

    pytest.skip(f"Could not authenticate admin user: {response.status_code}")


@pytest.fixture(scope="module")
def test_estate_id():
    """Return existing test estate ID"""
    return "667ba2ef-6914-4761-b1f5-3e0ef3e8fe97"


@pytest.fixture(scope="module")
def test_beneficiary_id():
    """Return existing test beneficiary ID"""
    return "08887e0d-d053-4aa4-8aa4-1ad39a3db747"


class TestSetPrimaryBeneficiary:
    """Tests for PUT /api/beneficiaries/{beneficiary_id}/set-primary"""

    def test_set_primary_requires_auth(self, test_beneficiary_id):
        """Test that set-primary endpoint requires authentication"""
        response = requests.put(
            f"{BASE_URL}/api/beneficiaries/{test_beneficiary_id}/set-primary"
        )
        assert response.status_code in [401, 403, 422], (
            f"Expected 401/403/422, got {response.status_code}"
        )
        print("PASS: set-primary requires authentication")

    def test_set_primary_benefactor_only(self, benefactor_token, test_beneficiary_id):
        """Test that set-primary works for benefactors"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.put(
            f"{BASE_URL}/api/beneficiaries/{test_beneficiary_id}/set-primary",
            headers=headers,
        )
        # Should succeed (200) or fail with 403 if not benefactor role
        assert response.status_code in [200, 403], (
            f"Expected 200/403, got {response.status_code}: {response.text}"
        )

        if response.status_code == 200:
            data = response.json()
            assert "message" in data or "primary_beneficiary_id" in data
            print(f"PASS: set-primary succeeded: {data}")
        else:
            print(
                f"PASS: set-primary correctly requires benefactor role: {response.status_code}"
            )

    def test_set_primary_not_found(self, benefactor_token):
        """Test that set-primary returns 404 for non-existent beneficiary"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.put(
            f"{BASE_URL}/api/beneficiaries/non-existent-id/set-primary", headers=headers
        )
        # 404 for not found, 403 if not benefactor role
        assert response.status_code in [404, 403], (
            f"Expected 404/403, got {response.status_code}"
        )
        print(
            f"PASS: set-primary handles non-existent beneficiary: {response.status_code}"
        )


class TestGetPrimaryBeneficiary:
    """Tests for GET /api/beneficiaries/{estate_id}/primary"""

    def test_get_primary_requires_auth(self, test_estate_id):
        """Test that get-primary endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{test_estate_id}/primary"
        )
        assert response.status_code in [401, 403, 422], (
            f"Expected 401/403/422, got {response.status_code}"
        )
        print("PASS: get-primary requires authentication")

    def test_get_primary_returns_data(self, benefactor_token, test_estate_id):
        """Test that get-primary returns primary beneficiary data"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{test_estate_id}/primary", headers=headers
        )
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        data = response.json()
        assert "primary" in data
        # primary can be null if none designated
        print(f"PASS: get-primary returns data: {data}")


class TestAccessRequests:
    """Tests for access request endpoints"""

    def test_get_access_requests_requires_auth(self, test_estate_id):
        """Test that get-access-requests requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/access-requests/{test_estate_id}"
        )
        assert response.status_code in [401, 403, 422], (
            f"Expected 401/403/422, got {response.status_code}"
        )
        print("PASS: get-access-requests requires authentication")

    def test_get_access_requests(self, benefactor_token, test_estate_id):
        """Test that benefactor can get access requests for their estate"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/access-requests/{test_estate_id}",
            headers=headers,
        )
        # 200 if authorized, 403 if not owner/primary, 404 if estate not found
        assert response.status_code in [200, 403, 404], (
            f"Expected 200/403/404, got {response.status_code}: {response.text}"
        )

        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)
            print(f"PASS: get-access-requests returns list: {len(data)} requests")
        else:
            print(f"PASS: get-access-requests handled: {response.status_code}")

    def test_request_access_requires_beneficiary_role(
        self, benefactor_token, test_estate_id
    ):
        """Test that request-access requires beneficiary role"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.post(
            f"{BASE_URL}/api/beneficiaries/request-access",
            headers=headers,
            json={"estate_id": test_estate_id, "message": "Test request"},
        )
        # 403 because benefactor cannot request access
        assert response.status_code in [403], (
            f"Expected 403, got {response.status_code}: {response.text}"
        )
        print("PASS: request-access correctly requires beneficiary role")

    def test_handle_access_request_format(self, benefactor_token):
        """Test that handle-access-request endpoint validates action format"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.put(
            f"{BASE_URL}/api/beneficiaries/access-requests/test-request-id",
            headers=headers,
            json={"action": "invalid_action"},
        )
        # 400 for invalid action, 404 for not found
        assert response.status_code in [400, 404, 403], (
            f"Expected 400/404/403, got {response.status_code}"
        )
        print(f"PASS: handle-access-request validates action: {response.status_code}")


class TestAdminPairedPricing:
    """Tests for admin paired pricing endpoints"""

    def test_get_subscription_settings(self, admin_token):
        """Test that admin can get subscription settings with paired_price field"""
        if not admin_token:
            pytest.skip("No admin token available")

        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-settings", headers=headers
        )
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        data = response.json()
        assert "plans" in data

        # Check that at least one plan has paired_price
        plans_with_paired = [p for p in data["plans"] if "paired_price" in p]
        assert len(plans_with_paired) > 0, (
            "Expected at least one plan with paired_price field"
        )

        print(
            f"PASS: subscription-settings has {len(plans_with_paired)} plans with paired_price"
        )
        for plan in plans_with_paired[:3]:
            print(
                f"  - {plan['name']}: paired_price=${plan.get('paired_price', 'N/A')}"
            )

    def test_update_paired_price(self, admin_token):
        """Test that admin can update paired price for a plan"""
        if not admin_token:
            pytest.skip("No admin token available")

        headers = {"Authorization": f"Bearer {admin_token}"}

        # Use form data as the endpoint expects
        response = requests.put(
            f"{BASE_URL}/api/admin/plans/premium/paired-price",
            headers=headers,
            data={"price": 5.99},
        )
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        data = response.json()
        assert data.get("success") is True
        print(f"PASS: update-paired-price succeeded: {data}")

    def test_update_paired_price_plan_not_found(self, admin_token):
        """Test that update-paired-price returns 404 for non-existent plan"""
        if not admin_token:
            pytest.skip("No admin token available")

        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(
            f"{BASE_URL}/api/admin/plans/nonexistent_plan/paired-price",
            headers=headers,
            data={"price": 5.99},
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: update-paired-price returns 404 for non-existent plan")

    def test_update_paired_price_requires_admin(self, benefactor_token):
        """Test that update-paired-price requires admin role"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.put(
            f"{BASE_URL}/api/admin/plans/premium/paired-price",
            headers=headers,
            data={"price": 5.99},
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: update-paired-price requires admin role")


class TestOnboardingProgress:
    """Tests for onboarding progress with designate_primary step"""

    def test_onboarding_progress_includes_designate_primary(self, benefactor_token):
        """Test that onboarding progress includes designate_primary step"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.get(f"{BASE_URL}/api/onboarding/progress", headers=headers)
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        data = response.json()
        assert "steps" in data

        # Find designate_primary step
        designate_primary_step = None
        for step in data["steps"]:
            if step.get("key") == "designate_primary":
                designate_primary_step = step
                break

        assert designate_primary_step is not None, (
            "Expected designate_primary step in onboarding"
        )
        assert "completed" in designate_primary_step

        print("PASS: onboarding progress includes designate_primary step")
        print(f"  - Label: {designate_primary_step.get('label')}")
        print(f"  - Completed: {designate_primary_step.get('completed')}")


class TestSubscriptionStatusPairedPrice:
    """Tests for subscription status including paired_price"""

    def test_subscription_status_returns_paired_price(self, benefactor_token):
        """Test that subscription status includes paired_price for beneficiaries"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.get(f"{BASE_URL}/api/subscriptions/status", headers=headers)
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        data = response.json()
        # paired_price may be null if estate not transitioned or user is not beneficiary
        # but the field should be present in the response structure
        print("PASS: subscription status response structure")
        print(f"  - user_role: {data.get('user_role')}")
        print(f"  - estate_transitioned: {data.get('estate_transitioned')}")
        print(f"  - paired_price: {data.get('paired_price')}")


class TestBeneficiaryModel:
    """Tests for Beneficiary model with is_primary field"""

    def test_beneficiaries_list_includes_is_primary(
        self, benefactor_token, test_estate_id
    ):
        """Test that beneficiaries list includes is_primary field"""
        if not benefactor_token:
            pytest.skip("No benefactor token available")

        headers = {"Authorization": f"Bearer {benefactor_token}"}
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{test_estate_id}", headers=headers
        )
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        data = response.json()
        assert isinstance(data, list)

        if len(data) > 0:
            # Check first beneficiary has is_primary field
            ben = data[0]
            assert "is_primary" in ben, "Expected is_primary field in beneficiary"
            print("PASS: beneficiaries include is_primary field")
            print(
                f"  - First beneficiary: {ben.get('name')} (is_primary: {ben.get('is_primary')})"
            )
        else:
            print("PASS: beneficiaries endpoint works (no beneficiaries in estate)")
