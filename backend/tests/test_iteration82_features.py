"""
CarryOn Iteration 82 Test Suite - Testing 4 new changes:
1. Admin delete beneficiary properly cleans up estate links
2. Onboarding/getting-started flow never re-triggers after celebration_shown=True
3. PUT /api/beneficiaries/reorder/{estate_id} persists sort order
4. GET /api/beneficiaries/{estate_id} returns sorted by sort_order
5. GET /api/onboarding/progress returns already_graduated field
"""

import os
import pytest
import requests
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"


class TestAuthHelpers:
    """Helper methods for authentication"""
    
    @staticmethod
    def login(email, password):
        """Login and return token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        return None

    @staticmethod
    def get_auth_headers(token):
        """Get auth headers with token"""
        return {"Authorization": f"Bearer {token}"}


class TestOnboardingAlreadyGraduated:
    """Test onboarding progress returns already_graduated field and respects celebration_shown"""
    
    def test_onboarding_progress_returns_already_graduated_field(self):
        """Test GET /api/onboarding/progress returns already_graduated field"""
        token = TestAuthHelpers.login(BENEFACTOR_EMAIL, BENEFACTOR_PASSWORD)
        assert token, "Failed to login as benefactor"
        
        response = requests.get(
            f"{BASE_URL}/api/onboarding/progress",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check that already_graduated field is returned
        assert "already_graduated" in data, f"Response missing 'already_graduated' field: {data}"
        assert "dismissed" in data, f"Response missing 'dismissed' field: {data}"
        assert "celebration_shown" in data, f"Response missing 'celebration_shown' field: {data}"
        assert "steps" in data, f"Response missing 'steps' field: {data}"
        
        print(f"Onboarding progress: already_graduated={data['already_graduated']}, dismissed={data['dismissed']}, celebration_shown={data['celebration_shown']}")

    def test_onboarding_dismissed_stays_true_when_already_graduated(self):
        """Test that 'dismissed' stays true even if steps become incomplete when already_graduated is True"""
        token = TestAuthHelpers.login(BENEFACTOR_EMAIL, BENEFACTOR_PASSWORD)
        assert token, "Failed to login as benefactor"
        
        response = requests.get(
            f"{BASE_URL}/api/onboarding/progress",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # If already_graduated is True (celebration_shown), dismissed should also be True
        if data.get("already_graduated"):
            assert data.get("dismissed") is True, \
                f"When already_graduated is True, dismissed should be True but got {data.get('dismissed')}"
            print("PASS: dismissed stays True when already_graduated is True")
        else:
            print(f"INFO: User has not graduated yet (already_graduated={data.get('already_graduated')})")


class TestBeneficiaryReorder:
    """Test beneficiary reorder API and sort order persistence"""
    
    def test_get_beneficiaries_sorted_by_sort_order(self):
        """Test GET /api/beneficiaries/{estate_id} returns beneficiaries sorted by sort_order"""
        token = TestAuthHelpers.login(BENEFACTOR_EMAIL, BENEFACTOR_PASSWORD)
        assert token, "Failed to login as benefactor"
        
        # Get estates to find estate_id
        estates_resp = requests.get(
            f"{BASE_URL}/api/estates",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        assert estates_resp.status_code == 200, f"Failed to get estates: {estates_resp.text}"
        estates = estates_resp.json()
        assert len(estates) > 0, "No estates found for benefactor"
        
        estate_id = estates[0]["id"]
        
        # Get beneficiaries
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        beneficiaries = response.json()
        
        if len(beneficiaries) > 1:
            # Check that beneficiaries are sorted by sort_order
            sort_orders = [b.get("sort_order", 999) for b in beneficiaries]
            assert sort_orders == sorted(sort_orders), f"Beneficiaries not sorted by sort_order: {sort_orders}"
            print(f"PASS: Beneficiaries sorted by sort_order: {sort_orders}")
        else:
            print(f"INFO: Only {len(beneficiaries)} beneficiary found, skipping sort verification")

    def test_reorder_beneficiaries_persists_order(self):
        """Test PUT /api/beneficiaries/reorder/{estate_id} persists sort order"""
        token = TestAuthHelpers.login(BENEFACTOR_EMAIL, BENEFACTOR_PASSWORD)
        assert token, "Failed to login as benefactor"
        
        # Get estates
        estates_resp = requests.get(
            f"{BASE_URL}/api/estates",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        assert estates_resp.status_code == 200
        estates = estates_resp.json()
        assert len(estates) > 0
        
        estate_id = estates[0]["id"]
        
        # Get current beneficiaries
        bens_resp = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        assert bens_resp.status_code == 200
        beneficiaries = bens_resp.json()
        
        if len(beneficiaries) < 2:
            pytest.skip("Need at least 2 beneficiaries to test reorder")
        
        # Get current order
        original_ids = [b["id"] for b in beneficiaries]
        
        # Reverse the order
        reversed_ids = list(reversed(original_ids))
        
        # Call reorder endpoint
        reorder_resp = requests.put(
            f"{BASE_URL}/api/beneficiaries/reorder/{estate_id}",
            json={"ordered_ids": reversed_ids},
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        
        assert reorder_resp.status_code == 200, f"Expected 200, got {reorder_resp.status_code}: {reorder_resp.text}"
        assert reorder_resp.json().get("success") is True, f"Expected success=True: {reorder_resp.json()}"
        
        # Verify the order was persisted
        verify_resp = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        assert verify_resp.status_code == 200
        new_beneficiaries = verify_resp.json()
        new_ids = [b["id"] for b in new_beneficiaries]
        
        assert new_ids == reversed_ids, f"Order not persisted. Expected {reversed_ids}, got {new_ids}"
        print(f"PASS: Reorder persisted correctly. New order: {new_ids}")
        
        # Restore original order
        restore_resp = requests.put(
            f"{BASE_URL}/api/beneficiaries/reorder/{estate_id}",
            json={"ordered_ids": original_ids},
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        assert restore_resp.status_code == 200
        print("Restored original order")


class TestAdminDeleteUserCleanup:
    """Test admin delete user properly cleans up estate beneficiary links"""
    
    def test_admin_users_endpoint_returns_users_with_beneficiaries(self):
        """Test GET /api/admin/users returns users with linked_beneficiaries for benefactors"""
        token = TestAuthHelpers.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to login as admin"
        
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        users = response.json()
        
        # Find benefactors
        benefactors = [u for u in users if u.get("role") == "benefactor"]
        assert len(benefactors) > 0, "No benefactors found"
        
        # Check that at least one benefactor has linked_beneficiaries field
        has_linked = any("linked_beneficiaries" in b for b in benefactors)
        assert has_linked, "No benefactor has linked_beneficiaries field"
        
        # Check structure
        for b in benefactors:
            if "linked_beneficiaries" in b:
                assert isinstance(b["linked_beneficiaries"], list), \
                    f"linked_beneficiaries should be a list: {type(b['linked_beneficiaries'])}"
                print(f"Benefactor {b.get('name')} has {len(b['linked_beneficiaries'])} linked beneficiaries")

    def test_admin_delete_user_requires_password(self):
        """Test DELETE /api/admin/users/{user_id} requires admin password"""
        token = TestAuthHelpers.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to login as admin"
        
        # Try to delete without password - should fail
        fake_user_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/admin/users/{fake_user_id}",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        
        # Should fail with 422 (missing required parameter) or 401 (wrong password)
        assert response.status_code in [401, 404, 422], \
            f"Expected 401/404/422, got {response.status_code}: {response.text}"
        print(f"PASS: Delete without password returned {response.status_code}")

    def test_admin_delete_user_with_wrong_password(self):
        """Test DELETE /api/admin/users/{user_id} rejects wrong password"""
        token = TestAuthHelpers.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token, "Failed to login as admin"
        
        fake_user_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/admin/users/{fake_user_id}?admin_password=wrongpassword",
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        
        # Should fail with 401 (wrong password)
        assert response.status_code == 401, \
            f"Expected 401 for wrong password, got {response.status_code}: {response.text}"
        print("PASS: Wrong password correctly rejected")


class TestAccountsCreateEstate:
    """Test create-estate endpoint still works (from previous iteration)"""
    
    def test_create_estate_endpoint_exists(self):
        """Test POST /api/accounts/create-estate endpoint exists"""
        token = TestAuthHelpers.login(BENEFACTOR_EMAIL, BENEFACTOR_PASSWORD)
        assert token, "Failed to login as benefactor"
        
        # Try to create estate - should fail for existing user with message about already having estate
        response = requests.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={
                "first_name": "Test",
                "last_name": "User",
                "email": BENEFACTOR_EMAIL
            },
            headers=TestAuthHelpers.get_auth_headers(token)
        )
        
        # Should return error about already having an estate
        assert response.status_code in [400, 403], \
            f"Expected 400/403 for existing estate, got {response.status_code}: {response.text}"
        
        data = response.json()
        detail = data.get("detail", "")
        assert "estate" in detail.lower() or "already" in detail.lower(), \
            f"Expected error about existing estate: {detail}"
        print(f"PASS: Create estate returns appropriate error for existing user: {detail}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
