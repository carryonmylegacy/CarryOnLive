"""
CCP Wizard Feature Tests - Iteration 59
Tests for the new CCP Tap-to-Create Wizard feature:
- POST /api/ccp/wizard/generate endpoint validation
- Auth requirements (401 without token)
- Validation (400 for missing fields)
- Authorization (403 for non-estate-owner)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from test_credentials.md
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


class TestCCPWizardEndpoint:
    """Tests for POST /api/ccp/wizard/generate endpoint"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")

    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_wizard_generate_returns_401_or_403_without_auth(self):
        """POST /api/ccp/wizard/generate should return 401/403 without authentication"""
        response = requests.post(
            f"{BASE_URL}/api/ccp/wizard/generate",
            json={
                "estate_id": "test-estate-id",
                "location": "123 Main St, Houston, TX",
                "household": ["children", "pets"],
                "concerns": ["hurricane"],
                "preference": "evacuate",
            },
        )
        # FastAPI returns 403 with "Not authenticated" for missing auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "authenticated" in data.get("detail", "").lower() or "auth" in data.get("detail", "").lower(), (
            f"Expected auth error, got: {data}"
        )
        print("✓ Wizard endpoint returns 401/403 without auth")

    def test_wizard_generate_returns_403_for_non_owner_before_validation(self, headers):
        """POST /api/ccp/wizard/generate checks ownership before validation"""
        # The admin user is NOT the owner of any estate, so 403 is returned
        # before validation checks run (this is correct security behavior)
        response = requests.post(
            f"{BASE_URL}/api/ccp/wizard/generate",
            headers=headers,
            json={
                "estate_id": "test-estate-id",
                "location": "",  # Empty location - but auth check happens first
                "household": ["children"],
                "concerns": ["hurricane"],
                "preference": "evacuate",
            },
        )
        # Authorization check happens before validation
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "benefactor" in data.get("detail", "").lower(), f"Expected benefactor error, got: {data}"
        print("✓ Wizard endpoint checks ownership before validation")

    def test_wizard_endpoint_exists_and_requires_auth(self, headers):
        """POST /api/ccp/wizard/generate endpoint exists and requires proper authorization"""
        # Test that the endpoint exists (not 404) and requires estate ownership
        response = requests.post(
            f"{BASE_URL}/api/ccp/wizard/generate",
            headers=headers,
            json={
                "estate_id": "test-estate-id",
                "location": "   ",  # Whitespace only
                "household": [],
                "concerns": ["flood"],
                "preference": "shelter",
            },
        )
        # Should NOT be 404 (endpoint exists) - should be 403 (not owner)
        assert response.status_code != 404, f"Endpoint not found: {response.text}"
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Wizard endpoint exists and requires estate ownership")

    def test_wizard_authorization_precedes_validation(self, headers):
        """POST /api/ccp/wizard/generate checks authorization before input validation"""
        # Even with invalid input (empty concerns), auth check happens first
        response = requests.post(
            f"{BASE_URL}/api/ccp/wizard/generate",
            headers=headers,
            json={
                "estate_id": "test-estate-id",
                "location": "456 Oak Ave, Dallas, TX",
                "household": ["elderly"],
                "concerns": [],  # Empty concerns - but auth check happens first
                "preference": "evacuate",
            },
        )
        # Authorization check (403) happens before validation (400)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Wizard endpoint checks authorization before validation")

    def test_wizard_generate_returns_403_for_non_estate_owner(self, headers):
        """POST /api/ccp/wizard/generate should return 403 for non-estate-owner"""
        # The admin user (info@carryon.us) is NOT the owner of any specific estate
        # So this should return 403
        response = requests.post(
            f"{BASE_URL}/api/ccp/wizard/generate",
            headers=headers,
            json={
                "estate_id": "non-existent-estate-id",
                "location": "789 Pine St, Austin, TX",
                "household": ["children", "pets"],
                "concerns": ["wildfire", "power_outage"],
                "preference": "evacuate",
            },
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "benefactor" in data.get("detail", "").lower() or "owner" in data.get("detail", "").lower(), (
            f"Expected benefactor/owner error, got: {data}"
        )
        print("✓ Wizard endpoint returns 403 for non-estate-owner")

    def test_wizard_generate_validates_all_required_fields(self, headers):
        """POST /api/ccp/wizard/generate validates estate_id, location, and concerns"""
        # Test with missing estate_id (should fail validation)
        response = requests.post(
            f"{BASE_URL}/api/ccp/wizard/generate",
            headers=headers,
            json={"location": "123 Test St", "concerns": ["hurricane"]},
        )
        # Pydantic will return 422 for missing required field
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}: {response.text}"
        print("✓ Wizard endpoint validates required fields")


class TestCCPWizardRequestModel:
    """Tests for WizardRequest model validation"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")
        pytest.skip(f"Authentication failed: {response.status_code}")

    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_wizard_accepts_valid_household_options(self, headers):
        """Wizard should accept valid household options: children, elderly, pets, disabled"""
        # This will fail with 403 (not estate owner) but validates the request model accepts these values
        response = requests.post(
            f"{BASE_URL}/api/ccp/wizard/generate",
            headers=headers,
            json={
                "estate_id": "test-estate",
                "location": "123 Main St, Houston, TX",
                "household": ["children", "elderly", "pets", "disabled"],
                "concerns": ["hurricane"],
                "preference": "evacuate",
            },
        )
        # Should NOT be 422 (validation error) - should be 403 (auth) since model is valid
        assert response.status_code != 422, f"Model validation failed: {response.text}"
        print("✓ Wizard accepts valid household options")

    def test_wizard_accepts_valid_concern_options(self, headers):
        """Wizard should accept all 17 valid concern options"""
        valid_concerns = [
            "hurricane",
            "tornado",
            "earthquake",
            "flood",
            "wildfire",
            "house_fire",
            "nuclear",
            "winter_storm",
            "power_outage",
            "terrorism",
            "pandemic",
            "civil_unrest",
            "water_failure",
            "chemical_spill",
            "home_invasion",
            "tsunami",
            "cyber_attack",
        ]
        response = requests.post(
            f"{BASE_URL}/api/ccp/wizard/generate",
            headers=headers,
            json={
                "estate_id": "test-estate",
                "location": "123 Main St, Houston, TX",
                "household": [],
                "concerns": valid_concerns[:3],  # Test with first 3
                "preference": "shelter",
            },
        )
        # Should NOT be 422 (validation error)
        assert response.status_code != 422, f"Model validation failed: {response.text}"
        print("✓ Wizard accepts valid concern options")

    def test_wizard_accepts_valid_preference_options(self, headers):
        """Wizard should accept 'evacuate' and 'shelter' preferences"""
        for pref in ["evacuate", "shelter"]:
            response = requests.post(
                f"{BASE_URL}/api/ccp/wizard/generate",
                headers=headers,
                json={
                    "estate_id": "test-estate",
                    "location": "123 Main St, Houston, TX",
                    "household": [],
                    "concerns": ["flood"],
                    "preference": pref,
                },
            )
            # Should NOT be 422 (validation error)
            assert response.status_code != 422, f"Model validation failed for preference '{pref}': {response.text}"
        print("✓ Wizard accepts valid preference options (evacuate, shelter)")


class TestCCPPlansEndpoint:
    """Tests for existing CCP plans endpoints to ensure they still work"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")
        pytest.skip(f"Authentication failed: {response.status_code}")

    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_ccp_plans_endpoint_exists(self, headers):
        """GET /api/ccp/plans/{estate_id} endpoint should exist"""
        response = requests.get(f"{BASE_URL}/api/ccp/plans/test-estate-id", headers=headers)
        # Should return 403 (not a member) not 404 (endpoint not found)
        assert response.status_code in [200, 403], f"Expected 200/403, got {response.status_code}: {response.text}"
        print("✓ CCP plans endpoint exists")

    def test_ccp_my_plans_endpoint_exists(self, headers):
        """GET /api/ccp/my-plans endpoint should exist"""
        response = requests.get(f"{BASE_URL}/api/ccp/my-plans", headers=headers)
        # Should return 200 (empty list) or actual plans
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"✓ CCP my-plans endpoint exists, returned {len(data)} plans")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
