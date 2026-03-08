"""Test onboarding progress endpoint - verifies 6 steps are returned"""

import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://notification-hub-85.preview.emergentagent.com"
).rstrip("/")

# Test credentials
TEST_EMAIL = "fulltest@test.com"
TEST_PASSWORD = "Password.123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for test user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code}")


class TestOnboardingProgress:
    """Test onboarding progress endpoint"""

    def test_onboarding_returns_6_steps(self, auth_token):
        """Verify GET /api/onboarding/progress returns exactly 6 steps"""
        response = requests.get(
            f"{BASE_URL}/api/onboarding/progress",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # Verify total_steps is 6
        assert data["total_steps"] == 6, (
            f"Expected 6 total steps, got {data['total_steps']}"
        )

        # Verify steps array has 6 entries
        assert len(data["steps"]) == 6, (
            f"Expected 6 steps in array, got {len(data['steps'])}"
        )

    def test_onboarding_step_keys_correct(self, auth_token):
        """Verify the 6 step keys are exactly as specified"""
        response = requests.get(
            f"{BASE_URL}/api/onboarding/progress",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        expected_keys = [
            "create_message",
            "upload_document",
            "designate_primary",
            "customize_checklist",
            "add_credential",
            "review_readiness",
        ]

        actual_keys = [step["key"] for step in data["steps"]]

        assert actual_keys == expected_keys, (
            f"Step keys mismatch. Expected: {expected_keys}, Got: {actual_keys}"
        )

    def test_onboarding_add_credential_step_present(self, auth_token):
        """Verify add_credential (DAV) step is present as step 5"""
        response = requests.get(
            f"{BASE_URL}/api/onboarding/progress",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # Find add_credential step
        dav_step = next(
            (s for s in data["steps"] if s["key"] == "add_credential"), None
        )

        assert dav_step is not None, "add_credential step not found"
        assert dav_step["label"] == "Store a Digital Account Credential"

        # Verify it's the 5th step (index 4)
        step_index = data["steps"].index(dav_step)
        assert step_index == 4, (
            f"add_credential should be step 5 (index 4), but is at index {step_index}"
        )

    def test_onboarding_response_structure(self, auth_token):
        """Verify response structure has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/onboarding/progress",
            headers={"Authorization": f"Bearer {auth_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # Check required fields
        required_fields = [
            "steps",
            "completed_count",
            "total_steps",
            "progress_pct",
            "all_complete",
            "dismissed",
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"

        # Check each step has required fields
        for step in data["steps"]:
            step_fields = ["key", "label", "description", "completed"]
            for field in step_fields:
                assert field in step, f"Step missing field: {field}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
