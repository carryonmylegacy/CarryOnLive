"""
Test Suite for Section Permissions & Transition Gating System
Iteration 64 - Tests:
  - Section permissions GET/PUT endpoints
  - My-permissions endpoint for beneficiaries
  - Account lock guard after transition
  - Benefactor account lock on TVT approval
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"


class TestHealthAndAuth:
    """Basic health check and authentication tests"""

    def test_health_check(self):
        """Verify backend is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        print("PASS: Health check returns healthy")

    def test_benefactor_login(self):
        """Test login with benefactor credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == BENEFACTOR_EMAIL
        print(f"PASS: Login successful for {BENEFACTOR_EMAIL}")


class TestSectionPermissions:
    """Test section permissions CRUD operations"""

    @pytest.fixture
    def auth_token(self):
        """Get auth token for benefactor"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip("Login failed")
        return response.json()["access_token"]

    @pytest.fixture
    def estate_id(self, auth_token):
        """Get first estate for the user"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No estates found for user")
        return response.json()[0]["id"]

    def test_get_section_permissions_authenticated_owner(self, auth_token, estate_id):
        """Test GET /api/estate/{id}/section-permissions for authenticated owner"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/estate/{estate_id}/section-permissions", headers=headers)
        assert response.status_code == 200
        data = response.json()
        # Should return a list (empty is valid for estates with no beneficiaries)
        assert isinstance(data, list)
        print(f"PASS: GET section-permissions returns {len(data)} beneficiary permissions")

    def test_get_section_permissions_unauthenticated(self, estate_id):
        """Test GET section-permissions without auth token fails"""
        response = requests.get(f"{BASE_URL}/api/estate/{estate_id}/section-permissions")
        assert response.status_code in [401, 403]
        print("PASS: GET section-permissions requires authentication")

    def test_put_section_permissions_structure(self, auth_token, estate_id):
        """Test PUT section-permissions accepts valid structure"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        # First get existing beneficiaries
        response = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=headers)
        if response.status_code != 200 or not response.json():
            # No beneficiaries - test that PUT with dummy ID returns 200 (upsert behavior)
            put_response = requests.put(
                f"{BASE_URL}/api/estate/{estate_id}/section-permissions",
                headers=headers,
                json={
                    "beneficiary_id": "test-dummy-id",
                    "sections": {
                        "vault": True,
                        "messages": True,
                        "checklist": True,
                        "guardian": True,
                        "digital_wallet": True,
                        "timeline": True,
                    },
                },
            )
            # Should succeed as upsert
            assert put_response.status_code == 200
            print("PASS: PUT section-permissions accepts valid structure (upsert mode)")
            return

        # If beneficiaries exist, test with real ID
        ben_id = response.json()[0]["id"]
        put_response = requests.put(
            f"{BASE_URL}/api/estate/{estate_id}/section-permissions",
            headers=headers,
            json={
                "beneficiary_id": ben_id,
                "sections": {
                    "vault": True,
                    "messages": False,
                    "checklist": True,
                    "guardian": False,
                    "digital_wallet": True,
                    "timeline": True,
                },
            },
        )
        assert put_response.status_code == 200
        data = put_response.json()
        assert data["success"] is True
        assert "sections" in data
        print(f"PASS: PUT section-permissions updates for beneficiary {ben_id}")

    def test_put_section_permissions_unauthenticated(self, estate_id):
        """Test PUT section-permissions without auth returns 401/403"""
        response = requests.put(
            f"{BASE_URL}/api/estate/{estate_id}/section-permissions",
            json={"beneficiary_id": "test-id", "sections": {"vault": True}},
        )
        assert response.status_code in [401, 403]
        print("PASS: PUT section-permissions requires authentication")


class TestMyPermissionsEndpoint:
    """Test beneficiary my-permissions endpoint"""

    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip("Login failed")
        return response.json()["access_token"]

    @pytest.fixture
    def estate_id(self, auth_token):
        """Get first estate"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No estates found")
        return response.json()[0]["id"]

    def test_my_permissions_non_beneficiary(self, auth_token, estate_id):
        """Test that non-beneficiary (benefactor) gets 404 from my-permissions"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/beneficiary/my-permissions/{estate_id}", headers=headers)
        # Benefactor is NOT a beneficiary, so should return 404
        assert response.status_code == 404
        data = response.json()
        assert "Not a beneficiary" in data.get("detail", "")
        print("PASS: my-permissions correctly rejects non-beneficiaries")

    def test_my_permissions_unauthenticated(self, estate_id):
        """Test my-permissions requires authentication"""
        response = requests.get(f"{BASE_URL}/api/beneficiary/my-permissions/{estate_id}")
        assert response.status_code in [401, 403]
        print("PASS: my-permissions requires authentication")


class TestAccountLockGuard:
    """Test require_account_not_locked guard exists"""

    def test_guard_exists_in_guards_file(self):
        """Verify require_account_not_locked function exists in guards.py"""
        guards_path = "/app/backend/guards.py"
        with open(guards_path, "r") as f:
            content = f.read()

        assert "require_account_not_locked" in content
        assert "account_locked" in content
        assert "HTTPException" in content
        print("PASS: require_account_not_locked guard exists in guards.py")


class TestTransitionApprovalLocks:
    """Test that transition approval locks benefactor account"""

    def test_transition_approval_code_locks_account(self):
        """Verify transition.py approve endpoint sets account_locked"""
        transition_path = "/app/backend/routes/transition.py"
        with open(transition_path, "r") as f:
            content = f.read()

        # Check that approve endpoint sets account_locked
        assert "account_locked" in content
        assert "locked_at" in content
        # Check that it updates the benefactor's user record
        assert 'estate_doc.get("owner_id")' in content or 'estate_doc["owner_id"]' in content
        print("PASS: Transition approval code includes account lock logic")


class TestTransitionStatus:
    """Test transition status endpoint"""

    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip("Login failed")
        return response.json()["access_token"]

    @pytest.fixture
    def estate_id(self, auth_token):
        """Get first estate"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No estates found")
        return response.json()[0]["id"]

    def test_transition_status_endpoint(self, auth_token, estate_id):
        """Test GET /api/transition/status/{estate_id}"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/transition/status/{estate_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "estate_status" in data
        # For pre-transition estate, certificate should be null
        print(f"PASS: Transition status returns estate_status='{data['estate_status']}'")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
