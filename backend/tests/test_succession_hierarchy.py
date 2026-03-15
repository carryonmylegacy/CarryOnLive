"""
Tests for Beneficiary Succession Hierarchy Feature
- Iteration 112: Drag-to-reorder succession order
- PUT /api/beneficiaries/reorder/{estate_id} - sets succession_order + is_primary
- GET /api/beneficiaries/{estate_id}/succession - returns beneficiaries sorted by succession_order
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://guardian-hierarchy.preview.emergentagent.com"


class TestSuccessionHierarchy:
    """Test succession hierarchy feature endpoints"""

    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get auth token for a benefactor user"""
        # Login as admin (founder) who has benefactor estates
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    @pytest.fixture(scope="class")
    def estate_id(self, auth_headers):
        """Get an estate ID to test with"""
        # Get estates for the logged-in user
        estates_resp = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        assert estates_resp.status_code == 200, f"Get estates failed: {estates_resp.text}"
        estates = estates_resp.json()

        # Find an owned estate
        owned = [e for e in estates if e.get("user_role_in_estate") == "owner" or not e.get("user_role_in_estate")]
        if owned:
            return owned[0]["id"]

        # If no owned estate, use first available
        if estates:
            return estates[0]["id"]

        pytest.skip("No estates found for testing")

    def test_get_beneficiaries_returns_list(self, auth_headers, estate_id):
        """GET /api/beneficiaries/{estate_id} returns list of beneficiaries"""
        resp = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers)
        assert resp.status_code == 200, f"Get beneficiaries failed: {resp.text}"
        beneficiaries = resp.json()
        assert isinstance(beneficiaries, list), "Expected list of beneficiaries"
        print(f"Found {len(beneficiaries)} beneficiaries")
        return beneficiaries

    def test_get_succession_order_endpoint(self, auth_headers, estate_id):
        """GET /api/beneficiaries/{estate_id}/succession returns sorted succession list"""
        resp = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}/succession", headers=auth_headers)
        assert resp.status_code == 200, f"Get succession order failed: {resp.text}"

        succession = resp.json()
        assert isinstance(succession, list), "Expected list of beneficiaries"

        # Verify response contains expected fields
        if succession:
            first = succession[0]
            assert "id" in first, "Response should contain id"
            assert "name" in first, "Response should contain name"
            print(f"Succession order has {len(succession)} beneficiaries")
            for idx, ben in enumerate(succession):
                order = ben.get("succession_order")
                is_primary = ben.get("is_primary", False)
                print(f"  Position {idx}: {ben['name']} - succession_order={order}, is_primary={is_primary}")
        return succession

    def test_reorder_beneficiaries_sets_succession(self, auth_headers, estate_id):
        """PUT /api/beneficiaries/reorder/{estate_id} sets succession_order and is_primary"""
        # First get current beneficiaries
        get_resp = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers)
        assert get_resp.status_code == 200
        beneficiaries = get_resp.json()

        if len(beneficiaries) < 1:
            pytest.skip("Not enough beneficiaries to test reordering")

        # Create the ordered list (just use current order as test)
        ordered_ids = [b["id"] for b in beneficiaries]

        # Call reorder endpoint
        reorder_resp = requests.put(
            f"{BASE_URL}/api/beneficiaries/reorder/{estate_id}",
            headers=auth_headers,
            json={"ordered_ids": ordered_ids},
        )
        assert reorder_resp.status_code == 200, f"Reorder failed: {reorder_resp.text}"
        result = reorder_resp.json()
        assert result.get("success") is True, "Reorder should return success: true"
        print("Reorder API returned success")

        # Verify succession_order was set
        verify_resp = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers)
        assert verify_resp.status_code == 200
        updated = verify_resp.json()

        for idx, ben_id in enumerate(ordered_ids):
            ben = next((b for b in updated if b["id"] == ben_id), None)
            if ben:
                expected_primary = idx == 0
                assert ben.get("sort_order") == idx, f"sort_order should be {idx}"
                assert ben.get("succession_order") == idx, f"succession_order should be {idx}"
                assert ben.get("is_primary") == expected_primary, f"is_primary should be {expected_primary}"
                print(
                    f"  {ben['name']}: sort_order={ben.get('sort_order')}, succession_order={ben.get('succession_order')}, is_primary={ben.get('is_primary')}"
                )

    def test_reorder_swaps_primary(self, auth_headers, estate_id):
        """When reordering, the first position becomes Primary"""
        # Get current beneficiaries
        get_resp = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers)
        assert get_resp.status_code == 200
        beneficiaries = get_resp.json()

        if len(beneficiaries) < 2:
            pytest.skip("Need at least 2 beneficiaries to test primary swap")

        # Reverse the order to swap primary
        ordered_ids = [b["id"] for b in reversed(beneficiaries)]
        next((b["name"] for b in beneficiaries if b["id"] == ordered_ids[0]), "Unknown")

        # Reorder
        reorder_resp = requests.put(
            f"{BASE_URL}/api/beneficiaries/reorder/{estate_id}",
            headers=auth_headers,
            json={"ordered_ids": ordered_ids},
        )
        assert reorder_resp.status_code == 200, f"Reorder failed: {reorder_resp.text}"

        # Verify the new primary
        verify_resp = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}/succession", headers=auth_headers)
        assert verify_resp.status_code == 200
        succession = verify_resp.json()

        if succession:
            first = succession[0]
            assert first["id"] == ordered_ids[0], "First in succession should be new primary"
            assert first.get("is_primary") is True, "First should be marked as primary"
            print(f"New primary: {first['name']} (succession_order=0, is_primary=True)")

    def test_reorder_requires_auth(self, estate_id):
        """PUT /api/beneficiaries/reorder/{estate_id} requires authentication"""
        resp = requests.put(
            f"{BASE_URL}/api/beneficiaries/reorder/{estate_id}",
            json={"ordered_ids": ["test-id"]},
        )
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print("Reorder endpoint correctly requires auth")

    def test_succession_endpoint_requires_auth(self, estate_id):
        """GET /api/beneficiaries/{estate_id}/succession requires authentication"""
        resp = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}/succession")
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print("Succession endpoint correctly requires auth")


class TestOnboardingStepLabel:
    """Test that onboarding step label was updated"""

    @pytest.fixture
    def auth_headers(self):
        """Get auth token for a benefactor user"""
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
        )
        if login_resp.status_code != 200:
            pytest.skip("Could not login for onboarding test")
        token = login_resp.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_onboarding_has_succession_label(self, auth_headers):
        """Onboarding progress should show 'Set Your Succession Order' label"""
        resp = requests.get(f"{BASE_URL}/api/onboarding/progress", headers=auth_headers)
        # Might return 200 or 404 depending on user role
        if resp.status_code == 200:
            progress = resp.json()
            steps = progress.get("steps", [])
            designate_step = next((s for s in steps if s.get("key") == "designate_primary"), None)
            if designate_step:
                assert designate_step.get("label") == "Set Your Succession Order", (
                    f"Expected 'Set Your Succession Order', got '{designate_step.get('label')}'"
                )
                print(f"Onboarding step label verified: {designate_step.get('label')}")
            else:
                print("designate_primary step not found in onboarding (may be completed)")
        else:
            print(f"Onboarding not available for this user (status {resp.status_code})")


class TestBeneficiaryCardFields:
    """Test that beneficiary data includes succession fields"""

    @pytest.fixture
    def auth_headers(self):
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
        )
        if login_resp.status_code != 200:
            pytest.skip("Could not login")
        return {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    @pytest.fixture
    def estate_id(self, auth_headers):
        estates_resp = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        if estates_resp.status_code != 200:
            pytest.skip("Could not get estates")
        estates = estates_resp.json()
        owned = [e for e in estates if e.get("user_role_in_estate") == "owner" or not e.get("user_role_in_estate")]
        if owned:
            return owned[0]["id"]
        if estates:
            return estates[0]["id"]
        pytest.skip("No estates found")

    def test_beneficiaries_include_succession_order(self, auth_headers, estate_id):
        """GET /api/beneficiaries returns succession_order and is_primary fields"""
        resp = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers)
        assert resp.status_code == 200
        beneficiaries = resp.json()

        if not beneficiaries:
            print("No beneficiaries to verify fields")
            return

        for ben in beneficiaries:
            # After reorder, these should be set
            has_primary = "is_primary" in ben
            print(
                f"  {ben['name']}: sort_order={ben.get('sort_order')}, succession_order={ben.get('succession_order')}, is_primary={ben.get('is_primary')}"
            )
            assert has_primary, "Beneficiary should have is_primary field"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
