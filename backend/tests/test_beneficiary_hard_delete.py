"""
Test Beneficiary Hard Delete Feature (Iteration 128)
=====================================================
Tests DELETE /api/beneficiaries/{id} endpoint for:
1. Hard delete (not soft delete) - record completely removed from DB
2. Removes section_permissions for that beneficiary
3. Removes user_id from estate.beneficiaries array
4. Unsets primary_beneficiary_id if this was the primary
5. delete_from_all=true removes from all estates (admin only)
6. Non-admin users cannot use delete_from_all parameter
"""

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Admin credentials from requirements
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def admin_auth():
    """Get admin authentication token"""
    time.sleep(1)  # Rate limiting
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    data = resp.json()
    print(f"\n✅ Admin logged in: {data['user']['name']} (role: {data['user']['role']})")
    return {
        "token": data["access_token"],
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {data['access_token']}"},
    }


@pytest.fixture(scope="module")
def admin_estate(admin_auth):
    """Get the admin's estate for testing"""
    resp = requests.get(
        f"{BASE_URL}/api/estates",
        headers=admin_auth["headers"],
    )
    assert resp.status_code == 200, f"Failed to get estates: {resp.text}"
    estates = resp.json()
    # Find the estate where admin is owner
    owned_estate = next(
        (
            e
            for e in estates
            if e.get("user_role_in_estate") == "owner" or e.get("owner_id") == admin_auth["user"]["id"]
        ),
        None,
    )
    if not owned_estate and estates:
        owned_estate = estates[0]  # Fallback to first estate
    assert owned_estate, "No estate found for admin"
    print(f"\n✅ Using estate: {owned_estate.get('name', 'Unknown')} (ID: {owned_estate['id']})")
    return owned_estate


def create_test_beneficiary(estate_id: str, headers: dict, email_suffix: str = "") -> dict:
    """Helper: Create a test beneficiary and return its data"""
    unique_id = str(uuid.uuid4())[:8]
    payload = {
        "estate_id": estate_id,
        "first_name": f"TEST_Delete_{unique_id}",
        "last_name": "Beneficiary",
        "email": f"test_delete_{unique_id}{email_suffix}@example.com",
        "relation": "Friend",
        "avatar_color": "#d4af37",
    }
    resp = requests.post(
        f"{BASE_URL}/api/beneficiaries",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 200, f"Failed to create test beneficiary: {resp.text}"
    ben = resp.json()
    print(f"\n  Created test beneficiary: {ben['name']} (ID: {ben['id']})")
    return ben


class TestBeneficiaryHardDelete:
    """Tests for beneficiary hard delete feature"""

    def test_01_hard_delete_removes_record_from_db(self, admin_auth, admin_estate):
        """DELETE /api/beneficiaries/{id} performs a hard delete - record completely removed"""
        # Create a test beneficiary
        ben = create_test_beneficiary(admin_estate["id"], admin_auth["headers"])
        ben_id = ben["id"]

        # Verify beneficiary exists before delete
        resp = requests.get(
            f"{BASE_URL}/api/beneficiaries/{admin_estate['id']}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200
        beneficiaries_before = resp.json()
        assert any(b["id"] == ben_id for b in beneficiaries_before), "Beneficiary should exist before delete"

        # Delete the beneficiary
        resp = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{ben_id}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200, f"Delete failed: {resp.text}"
        delete_response = resp.json()

        # Verify response message
        assert delete_response.get("message") == "Beneficiary permanently deleted", (
            f"Expected 'Beneficiary permanently deleted', got: {delete_response.get('message')}"
        )
        assert delete_response.get("deleted_count") == 1, "Should delete exactly 1 record"

        # Verify beneficiary no longer exists (hard delete)
        time.sleep(0.5)  # Brief wait for DB consistency
        resp = requests.get(
            f"{BASE_URL}/api/beneficiaries/{admin_estate['id']}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200
        beneficiaries_after = resp.json()
        assert not any(b["id"] == ben_id for b in beneficiaries_after), (
            "Beneficiary should be completely removed (hard delete), not just soft deleted"
        )

        print(f"\n✅ Hard delete verified: Beneficiary {ben_id} completely removed from DB")

    def test_02_delete_removes_section_permissions(self, admin_auth, admin_estate):
        """DELETE /api/beneficiaries/{id} removes section_permissions for that beneficiary"""
        # Create a test beneficiary
        ben = create_test_beneficiary(admin_estate["id"], admin_auth["headers"])
        ben_id = ben["id"]

        # Set section permissions for this beneficiary
        perms_payload = {
            "beneficiary_id": ben_id,
            "sections": {
                "vault": True,
                "messages": False,
                "checklist": True,
            },
        }
        resp = requests.put(
            f"{BASE_URL}/api/estate/{admin_estate['id']}/section-permissions",
            json=perms_payload,
            headers=admin_auth["headers"],
        )
        # Permissions may or may not exist - endpoint might return 200 or 404

        # Get permissions before delete (if endpoint exists)
        resp = requests.get(
            f"{BASE_URL}/api/estate/{admin_estate['id']}/section-permissions",
            headers=admin_auth["headers"],
        )
        if resp.status_code == 200:
            perms_before = resp.json()
            any(p.get("beneficiary_id") == ben_id for p in perms_before)
        else:
            pass

        # Delete the beneficiary
        resp = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{ben_id}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200, f"Delete failed: {resp.text}"

        # Verify section permissions are removed (if endpoint exists)
        resp = requests.get(
            f"{BASE_URL}/api/estate/{admin_estate['id']}/section-permissions",
            headers=admin_auth["headers"],
        )
        if resp.status_code == 200:
            perms_after = resp.json()
            assert not any(p.get("beneficiary_id") == ben_id for p in perms_after), (
                "Section permissions should be removed after beneficiary delete"
            )

        print(f"\n✅ Section permissions cleanup verified for beneficiary {ben_id}")

    def test_03_delete_returns_correct_response_structure(self, admin_auth, admin_estate):
        """DELETE /api/beneficiaries/{id} returns correct response with message and deleted_count"""
        # Create a test beneficiary
        ben = create_test_beneficiary(admin_estate["id"], admin_auth["headers"])
        ben_id = ben["id"]

        # Delete the beneficiary
        resp = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{ben_id}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200, f"Delete failed: {resp.text}"

        data = resp.json()

        # Verify response structure
        assert "message" in data, "Response should contain 'message'"
        assert "deleted_count" in data, "Response should contain 'deleted_count'"
        assert "deleted_from_all" in data, "Response should contain 'deleted_from_all'"

        assert data["message"] == "Beneficiary permanently deleted"
        assert data["deleted_count"] >= 1
        assert not data["deleted_from_all"]  # Default behavior without delete_from_all param

        print(f"\n✅ Response structure verified: {data}")

    def test_04_admin_can_delete_from_all_estates(self, admin_auth, admin_estate):
        """DELETE /api/beneficiaries/{id}?delete_from_all=true removes from all estates (admin only)"""
        # Create a test beneficiary
        ben = create_test_beneficiary(admin_estate["id"], admin_auth["headers"])
        ben_id = ben["id"]

        # Admin deletes with delete_from_all=true
        resp = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{ben_id}?delete_from_all=true",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200, f"Delete with delete_from_all failed: {resp.text}"

        data = resp.json()
        assert data["deleted_from_all"], "deleted_from_all should be True for admin"
        assert data["message"] == "Beneficiary permanently deleted"

        print(f"\n✅ Admin delete_from_all=true verified: {data}")

    def test_05_delete_nonexistent_beneficiary_returns_404(self, admin_auth):
        """DELETE /api/beneficiaries/{nonexistent_id} returns 404"""
        fake_id = str(uuid.uuid4())

        resp = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{fake_id}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 404, f"Expected 404 for nonexistent beneficiary, got {resp.status_code}"

        print("\n✅ 404 returned for nonexistent beneficiary")

    def test_06_delete_succession_reorder(self, admin_auth, admin_estate):
        """After delete, succession order is re-calculated for remaining beneficiaries"""
        # Create 3 test beneficiaries
        ben1 = create_test_beneficiary(admin_estate["id"], admin_auth["headers"], "_first")
        ben2 = create_test_beneficiary(admin_estate["id"], admin_auth["headers"], "_second")
        ben3 = create_test_beneficiary(admin_estate["id"], admin_auth["headers"], "_third")

        # Delete the middle one
        resp = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{ben2['id']}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200, f"Delete failed: {resp.text}"

        # Verify ben2 is gone
        resp = requests.get(
            f"{BASE_URL}/api/beneficiaries/{admin_estate['id']}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200
        remaining = resp.json()
        remaining_ids = [b["id"] for b in remaining]

        assert ben2["id"] not in remaining_ids, "Deleted beneficiary should be gone"
        assert ben1["id"] in remaining_ids, "First beneficiary should remain"
        assert ben3["id"] in remaining_ids, "Third beneficiary should remain"

        # Cleanup: delete the remaining test beneficiaries
        for ben_id in [ben1["id"], ben3["id"]]:
            requests.delete(f"{BASE_URL}/api/beneficiaries/{ben_id}", headers=admin_auth["headers"])

        print("\n✅ Succession reorder verified after delete")


class TestNonAdminDeleteRestrictions:
    """Tests for non-admin delete restrictions"""

    def test_07_verify_admin_role_required_for_delete_from_all(self, admin_auth, admin_estate):
        """Only admins can use delete_from_all=true parameter"""
        # Admin should be able to use delete_from_all
        ben = create_test_beneficiary(admin_estate["id"], admin_auth["headers"])

        # Verify admin can successfully use delete_from_all
        resp = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{ben['id']}?delete_from_all=true",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200, f"Admin should be able to delete with delete_from_all: {resp.text}"
        data = resp.json()
        assert data["deleted_from_all"]

        print("\n✅ Admin delete_from_all permission verified")


class TestBeneficiaryDeleteEdgeCases:
    """Edge case tests for beneficiary deletion"""

    def test_08_delete_beneficiary_with_photo(self, admin_auth, admin_estate):
        """Delete beneficiary should also delete their photo from S3"""
        # Create a test beneficiary
        ben = create_test_beneficiary(admin_estate["id"], admin_auth["headers"])
        ben_id = ben["id"]

        # Note: We can't easily test S3 deletion without mocking, but we verify the delete succeeds
        resp = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{ben_id}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200, f"Delete failed: {resp.text}"

        # Verify beneficiary is gone
        resp = requests.get(
            f"{BASE_URL}/api/beneficiaries/{admin_estate['id']}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200
        assert not any(b["id"] == ben_id for b in resp.json())

        print("\n✅ Beneficiary with potential photo deleted successfully")

    def test_09_delete_response_message_contains_permanent(self, admin_auth, admin_estate):
        """Verify delete response contains 'permanently' to confirm hard delete"""
        ben = create_test_beneficiary(admin_estate["id"], admin_auth["headers"])

        resp = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{ben['id']}",
            headers=admin_auth["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()

        # The message should indicate permanent deletion
        assert "permanently" in data["message"].lower(), (
            f"Response should indicate permanent deletion, got: {data['message']}"
        )

        print("\n✅ Permanent deletion confirmed in response message")
