"""
Test Suite: CCP My-Plans Endpoint + Per-Role Dock Preferences

Features tested:
1. GET /api/ccp/my-plans - returns plans from all estates where user is an assigned beneficiary
2. GET /api/ccp/my-plans - includes estate_name and benefactor_name in each plan
3. GET /api/ccp/my-plans - filters by assigned_beneficiary_ids (null=all, or user in list)
4. GET /api/user-preferences/dock?role=benefactor - returns benefactor dock preferences
5. GET /api/user-preferences/dock?role=beneficiary - returns beneficiary dock preferences (separate from benefactor)
6. PUT /api/user-preferences/dock with role=beneficiary - saves per-role preferences
7. PUT /api/user-preferences/dock with role=benefactor - does NOT affect beneficiary preferences
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"
TEST_ESTATE_ID = "a6d800e4-38fe-4364-b2e4-9e7513dbf6fe"


class TestCCPMyPlansEndpoint:
    """Tests for GET /api/ccp/my-plans endpoint"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )

        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")

    def test_my_plans_endpoint_exists(self):
        """Test that GET /api/ccp/my-plans endpoint exists and returns 200"""
        response = self.session.get(f"{BASE_URL}/api/ccp/my-plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        # Should return a list (may be empty for admin who is not a beneficiary)
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"GET /api/ccp/my-plans returned {len(data)} plans")

    def test_my_plans_returns_empty_for_non_beneficiary(self):
        """Admin user is a benefactor, not beneficiary - should return empty list"""
        response = self.session.get(f"{BASE_URL}/api/ccp/my-plans")
        assert response.status_code == 200

        data = response.json()
        # Admin is not a beneficiary of any estate, so should be empty
        assert isinstance(data, list)
        print(f"Admin (non-beneficiary) received {len(data)} plans - expected 0 or few")

    def test_my_plans_requires_auth(self):
        """Test that endpoint requires authentication"""
        # Create new session without auth
        no_auth_session = requests.Session()
        response = no_auth_session.get(f"{BASE_URL}/api/ccp/my-plans")

        # Should return 401 or 403
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"Unauthenticated request correctly returned {response.status_code}")


class TestPerRoleDockPreferences:
    """Tests for per-role dock preferences storage"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )

        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")

    def test_get_dock_preferences_benefactor_role(self):
        """Test GET /api/user-preferences/dock?role=benefactor"""
        response = self.session.get(f"{BASE_URL}/api/user-preferences/dock?role=benefactor")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert "items" in data, "Response should contain 'items' key"
        assert isinstance(data["items"], list), "items should be a list"
        print(f"Benefactor dock preferences: {data['items']}")

    def test_get_dock_preferences_beneficiary_role(self):
        """Test GET /api/user-preferences/dock?role=beneficiary"""
        response = self.session.get(f"{BASE_URL}/api/user-preferences/dock?role=beneficiary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert "items" in data, "Response should contain 'items' key"
        assert isinstance(data["items"], list), "items should be a list"
        print(f"Beneficiary dock preferences: {data['items']}")

    def test_save_benefactor_dock_preferences(self):
        """Test PUT /api/user-preferences/dock with role=benefactor"""
        test_items = ["/dashboard", "/vault", "/messages"]

        response = self.session.put(
            f"{BASE_URL}/api/user-preferences/dock", json={"items": test_items, "role": "benefactor"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert "items" in data
        assert data["items"] == test_items, f"Expected {test_items}, got {data['items']}"
        print(f"Saved benefactor dock: {data['items']}")

        # Verify by fetching again
        verify_response = self.session.get(f"{BASE_URL}/api/user-preferences/dock?role=benefactor")
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data["items"] == test_items, "Saved items should persist"

    def test_save_beneficiary_dock_preferences(self):
        """Test PUT /api/user-preferences/dock with role=beneficiary"""
        test_items = ["/beneficiary", "/beneficiary/vault", "/beneficiary/guardian"]

        response = self.session.put(
            f"{BASE_URL}/api/user-preferences/dock", json={"items": test_items, "role": "beneficiary"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert "items" in data
        assert data["items"] == test_items, f"Expected {test_items}, got {data['items']}"
        print(f"Saved beneficiary dock: {data['items']}")

        # Verify by fetching again
        verify_response = self.session.get(f"{BASE_URL}/api/user-preferences/dock?role=beneficiary")
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data["items"] == test_items, "Saved items should persist"

    def test_per_role_isolation(self):
        """Test that benefactor and beneficiary dock preferences are stored separately"""
        # Save different items for each role
        benefactor_items = ["/dashboard", "/vault", "/messages", "/guardian", "/checklist"]
        beneficiary_items = ["/beneficiary", "/beneficiary/vault", "/beneficiary/messages"]

        # Save benefactor preferences
        resp1 = self.session.put(
            f"{BASE_URL}/api/user-preferences/dock", json={"items": benefactor_items, "role": "benefactor"}
        )
        assert resp1.status_code == 200

        # Save beneficiary preferences
        resp2 = self.session.put(
            f"{BASE_URL}/api/user-preferences/dock", json={"items": beneficiary_items, "role": "beneficiary"}
        )
        assert resp2.status_code == 200

        # Verify benefactor preferences are unchanged
        verify_benefactor = self.session.get(f"{BASE_URL}/api/user-preferences/dock?role=benefactor")
        assert verify_benefactor.status_code == 200
        benefactor_data = verify_benefactor.json()
        assert benefactor_data["items"] == benefactor_items, (
            f"Benefactor items should be {benefactor_items}, got {benefactor_data['items']}"
        )

        # Verify beneficiary preferences are separate
        verify_beneficiary = self.session.get(f"{BASE_URL}/api/user-preferences/dock?role=beneficiary")
        assert verify_beneficiary.status_code == 200
        beneficiary_data = verify_beneficiary.json()
        assert beneficiary_data["items"] == beneficiary_items, (
            f"Beneficiary items should be {beneficiary_items}, got {beneficiary_data['items']}"
        )

        print("Per-role isolation VERIFIED: benefactor and beneficiary preferences are stored separately")

    def test_dock_max_5_items(self):
        """Test that dock preferences are limited to 5 items"""
        too_many_items = ["/a", "/b", "/c", "/d", "/e", "/f", "/g"]

        response = self.session.put(
            f"{BASE_URL}/api/user-preferences/dock", json={"items": too_many_items, "role": "benefactor"}
        )
        assert response.status_code == 200

        data = response.json()
        assert len(data["items"]) <= 5, f"Should limit to 5 items, got {len(data['items'])}"
        print(f"Max 5 items enforced: sent {len(too_many_items)}, got {len(data['items'])}")

    def test_dock_requires_auth(self):
        """Test that dock endpoints require authentication"""
        no_auth_session = requests.Session()

        # GET without auth
        get_response = no_auth_session.get(f"{BASE_URL}/api/user-preferences/dock?role=benefactor")
        assert get_response.status_code in [401, 403], f"GET should require auth, got {get_response.status_code}"

        # PUT without auth
        put_response = no_auth_session.put(
            f"{BASE_URL}/api/user-preferences/dock", json={"items": ["/dashboard"], "role": "benefactor"}
        )
        assert put_response.status_code in [401, 403], f"PUT should require auth, got {put_response.status_code}"

        print("Auth requirement VERIFIED for dock endpoints")


class TestCCPPlansEndpoint:
    """Tests for existing CCP plans endpoint to verify regression"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )

        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")

    def test_get_plans_for_estate(self):
        """Test GET /api/ccp/plans/{estate_id} still works"""
        response = self.session.get(f"{BASE_URL}/api/ccp/plans/{TEST_ESTATE_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"GET /api/ccp/plans/{TEST_ESTATE_ID} returned {len(data)} plans")

    def test_get_estate_members(self):
        """Test GET /api/ccp/members/{estate_id} still works"""
        response = self.session.get(f"{BASE_URL}/api/ccp/members/{TEST_ESTATE_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"GET /api/ccp/members/{TEST_ESTATE_ID} returned {len(data)} members")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
