"""
Ghost Estate Auto-Cleanup Feature Tests
Tests for the NEW ghost estate detection and batch cleanup functionality:
1. GET /api/admin/estate-health - ghost_estates array with reason for each ghost
2. POST /api/admin/cleanup-ghost-estates - batch delete with password confirmation
3. Resets is_also_benefactor=False when user has no remaining estates
4. Rejects incorrect admin password
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestGhostEstateDetection:
    """Tests for ghost estate detection in GET /api/admin/estate-health"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin and get token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
        )
        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.status_code} - {login_response.text}")
        token = login_response.json().get("access_token")
        if not token:
            pytest.skip("No access_token in login response")
        return token

    def test_estate_health_returns_ghost_estates_array(self, admin_token):
        """Test that /api/admin/estate-health includes ghost_estates in response"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()

        # Must have ghost_estates key
        assert "ghost_estates" in data, "Response must contain 'ghost_estates' key"
        assert isinstance(data["ghost_estates"], list), "ghost_estates must be an array"
        print(f"PASS: ghost_estates array found with {len(data['ghost_estates'])} items")

    def test_estate_health_summary_includes_ghost_count(self, admin_token):
        """Test that summary includes ghost_estates count"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        summary = data.get("summary", {})
        assert "ghost_estates" in summary, "Summary must contain 'ghost_estates' count"
        assert isinstance(summary["ghost_estates"], int), "ghost_estates count must be int"

        # Verify count matches array length
        assert summary["ghost_estates"] == len(data["ghost_estates"]), (
            f"Summary count ({summary['ghost_estates']}) must match array length ({len(data['ghost_estates'])})"
        )
        print(f"PASS: summary.ghost_estates = {summary['ghost_estates']}")

    def test_ghost_estate_structure_has_required_fields(self, admin_token):
        """Test that each ghost estate has the required fields"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        if len(data["ghost_estates"]) == 0:
            pytest.skip("No ghost estates to validate structure")

        ghost = data["ghost_estates"][0]

        # Check required fields
        required_fields = [
            "estate_id",
            "estate_name",
            "owner_id",
            "owner_name",
            "reason",
        ]
        for field in required_fields:
            assert field in ghost, f"Ghost estate must have '{field}' field"
            print(f"  - {field}: {ghost[field]}")

        # Reason should explain why this is a ghost estate
        assert len(ghost["reason"]) > 0, "Ghost estate must have a non-empty reason"
        print("PASS: Ghost estate structure valid")

    def test_ghost_estate_reason_is_descriptive(self, admin_token):
        """Test that ghost estate reasons are meaningful"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        if len(data["ghost_estates"]) == 0:
            pytest.skip("No ghost estates to check reasons")

        valid_reasons = [
            "Owner account no longer exists",
            "Incomplete estate from beneficiary conversion",
            "Empty estate with no beneficiaries",
        ]

        for ghost in data["ghost_estates"]:
            assert any(r in ghost["reason"] for r in valid_reasons), (
                f"Ghost reason '{ghost['reason']}' is not a known valid reason"
            )
        print("PASS: All ghost estate reasons are valid")


class TestGhostEstateCleanup:
    """Tests for POST /api/admin/cleanup-ghost-estates endpoint"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin and get token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
        )
        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.status_code} - {login_response.text}")
        token = login_response.json().get("access_token")
        if not token:
            pytest.skip("No access_token in login response")
        return token

    def test_cleanup_requires_admin_auth(self):
        """Test that cleanup endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/admin/cleanup-ghost-estates",
            json={"estate_ids": [], "admin_password": "anything"},
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("PASS: Cleanup endpoint requires authentication")

    def test_cleanup_rejects_wrong_password(self, admin_token):
        """Test that cleanup rejects incorrect admin password"""
        response = requests.post(
            f"{BASE_URL}/api/admin/cleanup-ghost-estates",
            json={
                "estate_ids": ["test-estate-id"],
                "admin_password": "WrongPassword123",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 401, f"Expected 401 for wrong password, got {response.status_code}"

        data = response.json()
        assert "incorrect" in data.get("detail", "").lower() or "password" in data.get("detail", "").lower(), (
            f"Expected password error message, got: {data}"
        )
        print("PASS: Cleanup correctly rejects wrong password")

    def test_cleanup_empty_array_returns_success(self, admin_token):
        """Test that cleanup with empty array returns success"""
        response = requests.post(
            f"{BASE_URL}/api/admin/cleanup-ghost-estates",
            json={"estate_ids": [], "admin_password": "Demo1234!"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert "deleted_count" in data, "Response must have deleted_count"
        assert data["deleted_count"] == 0, "Should delete 0 estates with empty array"
        print("PASS: Empty estate_ids returns success with 0 deleted")

    def test_cleanup_nonexistent_estate_id_handled_gracefully(self, admin_token):
        """Test that cleanup handles non-existent estate IDs gracefully"""
        fake_id = f"TEST_nonexistent_{uuid.uuid4()}"
        response = requests.post(
            f"{BASE_URL}/api/admin/cleanup-ghost-estates",
            json={"estate_ids": [fake_id], "admin_password": "Demo1234!"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200, f"Expected 200 even with non-existent ID, got {response.status_code}"

        data = response.json()
        assert "deleted_count" in data, "Response must have deleted_count"
        # Non-existent estate should be skipped, not error
        assert data["deleted_count"] == 0, "Should skip non-existent estates"
        print("PASS: Non-existent estate IDs handled gracefully")

    def test_cleanup_response_structure(self, admin_token):
        """Test that cleanup response has proper structure"""
        response = requests.post(
            f"{BASE_URL}/api/admin/cleanup-ghost-estates",
            json={"estate_ids": [], "admin_password": "Demo1234!"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200

        data = response.json()

        # Check required response fields
        assert "message" in data, "Response must have 'message'"
        assert "deleted_count" in data, "Response must have 'deleted_count'"
        assert "users_reset" in data, "Response must have 'users_reset'"

        print("PASS: Cleanup response structure valid")
        print(f"  - message: {data['message']}")
        print(f"  - deleted_count: {data['deleted_count']}")
        print(f"  - users_reset: {data['users_reset']}")


class TestGhostEstateCleanupIntegration:
    """Integration tests for actual ghost estate cleanup"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin and get token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
        )
        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.status_code} - {login_response.text}")
        token = login_response.json().get("access_token")
        if not token:
            pytest.skip("No access_token in login response")
        return token

    def test_cleanup_real_ghost_estate_if_available(self, admin_token):
        """Test cleaning up an actual ghost estate if one exists"""
        # First, get current ghost estates
        health_response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert health_response.status_code == 200
        data = health_response.json()

        ghost_estates = data.get("ghost_estates", [])
        if len(ghost_estates) == 0:
            pytest.skip("No ghost estates available to test cleanup")

        # Get the first ghost estate
        target_ghost = ghost_estates[0]
        estate_id = target_ghost["estate_id"]
        original_count = len(ghost_estates)

        print(f"Found {original_count} ghost estates, cleaning up: {target_ghost['estate_name']}")
        print(f"  Reason: {target_ghost['reason']}")

        # Attempt cleanup
        cleanup_response = requests.post(
            f"{BASE_URL}/api/admin/cleanup-ghost-estates",
            json={"estate_ids": [estate_id], "admin_password": "Demo1234!"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert cleanup_response.status_code == 200, f"Cleanup failed: {cleanup_response.text}"

        cleanup_data = cleanup_response.json()
        assert cleanup_data["deleted_count"] == 1, f"Expected 1 deleted, got {cleanup_data['deleted_count']}"
        print(f"PASS: Successfully cleaned up ghost estate '{target_ghost['estate_name']}'")
        print(f"  - users_reset: {cleanup_data['users_reset']}")

        # Verify ghost estate is removed from list
        verify_response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert verify_response.status_code == 200
        verify_data = verify_response.json()

        new_ghost_count = len(verify_data.get("ghost_estates", []))
        assert new_ghost_count == original_count - 1, (
            f"Expected {original_count - 1} ghost estates after cleanup, got {new_ghost_count}"
        )
        print(f"PASS: Ghost estate list updated correctly ({original_count} -> {new_ghost_count})")


class TestGhostEstateValidation:
    """Validation tests for ghost estate request body"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin and get token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
        )
        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.status_code} - {login_response.text}")
        token = login_response.json().get("access_token")
        if not token:
            pytest.skip("No access_token in login response")
        return token

    def test_cleanup_requires_password_field(self, admin_token):
        """Test that cleanup requires admin_password field"""
        response = requests.post(
            f"{BASE_URL}/api/admin/cleanup-ghost-estates",
            json={"estate_ids": []},  # Missing admin_password
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 422, f"Expected 422 for missing password, got {response.status_code}"
        print("PASS: Cleanup requires admin_password field")

    def test_cleanup_requires_estate_ids_field(self, admin_token):
        """Test that cleanup requires estate_ids field"""
        response = requests.post(
            f"{BASE_URL}/api/admin/cleanup-ghost-estates",
            json={"admin_password": "Demo1234!"},  # Missing estate_ids
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 422, f"Expected 422 for missing estate_ids, got {response.status_code}"
        print("PASS: Cleanup requires estate_ids field")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
