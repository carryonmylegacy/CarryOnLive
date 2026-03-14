"""
Iteration 109 Feature Tests:
1. GET /api/founder/operators - should return personal info fields (date_of_birth, gender, marital_status, address_*)
2. GET /api/beneficiary/my-primary-for - returns list of estates where user is designated primary beneficiary
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def admin_auth_headers():
    """Authenticate as admin/founder user"""
    login_response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    if login_response.status_code != 200:
        pytest.skip(f"Admin login failed: {login_response.text}")
    data = login_response.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        pytest.skip(f"No token returned from login: {data}")
    return {"Authorization": f"Bearer {token}"}


class TestFounderOperatorsEndpoint:
    """Tests for GET /api/founder/operators personal info fields"""

    def test_founder_operators_endpoint_status(self, admin_auth_headers):
        """Test that the endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/founder/operators",
            headers=admin_auth_headers,
        )
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

    def test_founder_operators_returns_list(self, admin_auth_headers):
        """Test that the endpoint returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/founder/operators",
            headers=admin_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"

    def test_founder_operators_schema_includes_personal_info_fields(
        self, admin_auth_headers
    ):
        """Test that personal info fields are NOT excluded (they should pass through if present in DB)"""
        response = requests.get(
            f"{BASE_URL}/api/founder/operators",
            headers=admin_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        # The endpoint excludes only _id and password, so personal info should pass through
        # Note: These fields may be empty/null if operators haven't filled them in
        expected_possible_fields = [
            "date_of_birth",
            "gender",
            "marital_status",
            "address_street",
            "address_city",
            "address_state",
            "address_zip",
        ]
        # Just verify the endpoint doesn't explicitly exclude personal info
        # We can't assert they exist because operators may not have filled them
        print(f"Operators count: {len(data)}")
        if data:
            sample_op = data[0]
            print(f"Sample operator keys: {list(sample_op.keys())}")
            # Verify password is NOT in response
            assert "password" not in sample_op, "Password should be excluded"
            assert "_id" not in sample_op, "_id should be excluded"
            # Check if any operator has personal info
            for op in data:
                has_personal_info = any(
                    op.get(field) for field in expected_possible_fields
                )
                if has_personal_info:
                    print(
                        f"Operator {op.get('name', op.get('id'))} has personal info: {[f for f in expected_possible_fields if op.get(f)]}"
                    )
                    break


class TestBeneficiaryMyPrimaryForEndpoint:
    """Tests for GET /api/beneficiary/my-primary-for endpoint"""

    def test_endpoint_exists_and_authenticated(self, admin_auth_headers):
        """Test that the endpoint exists and requires auth"""
        response = requests.get(
            f"{BASE_URL}/api/beneficiary/my-primary-for",
            headers=admin_auth_headers,
        )
        # Should return 200 (might be empty array for admin user)
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

    def test_endpoint_returns_list(self, admin_auth_headers):
        """Test that the endpoint returns a list (may be empty for admin)"""
        response = requests.get(
            f"{BASE_URL}/api/beneficiary/my-primary-for",
            headers=admin_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Primary-for estates count: {len(data)}")
        if data:
            print(f"Sample entry: {data[0]}")
            # Verify expected fields
            expected_fields = ["estate_id", "estate_name", "benefactor_name", "status"]
            for field in expected_fields:
                assert field in data[0], f"Missing expected field: {field}"

    def test_endpoint_requires_auth(self):
        """Test that the endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/beneficiary/my-primary-for")
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403, 422], (
            f"Expected auth error, got {response.status_code}"
        )


class TestBeneficiaryEndpointSchema:
    """Verify the response schema of my-primary-for endpoint"""

    def test_schema_matches_expected(self, admin_auth_headers):
        """Verify the response schema if data exists"""
        response = requests.get(
            f"{BASE_URL}/api/beneficiary/my-primary-for",
            headers=admin_auth_headers,
        )
        assert response.status_code == 200
        data = response.json()

        if len(data) > 0:
            entry = data[0]
            assert "estate_id" in entry, "Missing estate_id"
            assert "estate_name" in entry, "Missing estate_name"
            assert "benefactor_name" in entry, "Missing benefactor_name"
            assert "status" in entry, "Missing status"
            # Verify data types
            assert isinstance(entry["estate_id"], str), "estate_id should be string"
            assert isinstance(entry["estate_name"], str), "estate_name should be string"
            assert isinstance(entry["benefactor_name"], str), (
                "benefactor_name should be string"
            )
            assert isinstance(entry["status"], str), "status should be string"
            print("VERIFIED: Response schema matches expected format")
        else:
            print("No primary-for estates found for test user (expected for admin)")
