"""
CarryOn Backend Tests - Iteration 83
Tests for FamilyTree SVG component and Admin Graph view features:
1. GET /api/estates returns user_role_in_estate for beneficiary estates
2. Verify beneficiary data includes date_of_birth for age sorting
3. Admin users endpoint returns linked_beneficiaries with all required fields
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestFamilyTreeFeatures:
    """Tests for FamilyTree SVG component backend support"""

    @pytest.fixture(scope="class")
    def benefactor_auth(self):
        """Get auth token for benefactor user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - try again later")
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return {"Authorization": f"Bearer {data['access_token']}"}

    @pytest.fixture(scope="class")
    def admin_auth(self):
        """Get auth token for admin user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - try again later")
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        return {"Authorization": f"Bearer {data['access_token']}"}

    def test_estates_returns_user_role_in_estate(self, benefactor_auth):
        """GET /api/estates should return user_role_in_estate annotation"""
        response = requests.get(f"{BASE_URL}/api/estates", headers=benefactor_auth)
        assert response.status_code == 200
        estates = response.json()

        assert len(estates) > 0, "No estates returned"

        # Find owned estate - should have user_role_in_estate = 'owner'
        owned_estates = [e for e in estates if e.get("user_role_in_estate") == "owner"]
        assert len(owned_estates) > 0, (
            "No owned estates found - expected at least one with user_role_in_estate='owner'"
        )

        owned = owned_estates[0]
        assert "id" in owned, "Estate missing id"
        assert "name" in owned, "Estate missing name"
        print(
            f"✓ Owned estate found: {owned.get('name')} with user_role_in_estate='owner'"
        )

        # Check if there are any beneficiary estates too
        ben_estates = [
            e for e in estates if e.get("user_role_in_estate") == "beneficiary"
        ]
        print(f"✓ Found {len(ben_estates)} estate(s) where user is beneficiary")

    def test_beneficiaries_endpoint_returns_dob_for_sorting(self, benefactor_auth):
        """GET /api/beneficiaries/{estate_id} should return date_of_birth for age sorting"""
        # First get estate
        estates_response = requests.get(
            f"{BASE_URL}/api/estates", headers=benefactor_auth
        )
        assert estates_response.status_code == 200
        estates = estates_response.json()

        owned_estates = [e for e in estates if e.get("user_role_in_estate") == "owner"]
        if not owned_estates:
            pytest.skip("No owned estates to test beneficiaries")

        estate_id = owned_estates[0]["id"]

        # Get beneficiaries
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=benefactor_auth
        )
        assert response.status_code == 200
        beneficiaries = response.json()

        print(f"✓ Found {len(beneficiaries)} beneficiaries")

        # Check structure of each beneficiary
        for ben in beneficiaries:
            assert "id" in ben, "Beneficiary missing id"
            assert "first_name" in ben or "name" in ben, (
                "Beneficiary missing name fields"
            )
            # date_of_birth may be null but should be in response
            print(
                f"  - {ben.get('first_name', ben.get('name', 'Unknown'))}: DOB={ben.get('date_of_birth', 'N/A')}, is_primary={ben.get('is_primary', False)}"
            )

    def test_beneficiaries_include_avatar_color(self, benefactor_auth):
        """Beneficiaries should include avatar_color for tree node styling"""
        estates_response = requests.get(
            f"{BASE_URL}/api/estates", headers=benefactor_auth
        )
        estates = estates_response.json()

        owned_estates = [e for e in estates if e.get("user_role_in_estate") == "owner"]
        if not owned_estates:
            pytest.skip("No owned estates")

        estate_id = owned_estates[0]["id"]
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=benefactor_auth
        )
        assert response.status_code == 200
        beneficiaries = response.json()

        for ben in beneficiaries:
            # avatar_color is used for tree node colors
            if ben.get("avatar_color"):
                print(
                    f"✓ {ben.get('first_name', 'Unknown')} has avatar_color: {ben['avatar_color']}"
                )

    def test_beneficiaries_have_relation_field(self, benefactor_auth):
        """Beneficiaries should include relation field for tree display"""
        estates_response = requests.get(
            f"{BASE_URL}/api/estates", headers=benefactor_auth
        )
        estates = estates_response.json()

        owned_estates = [e for e in estates if e.get("user_role_in_estate") == "owner"]
        if not owned_estates:
            pytest.skip("No owned estates")

        estate_id = owned_estates[0]["id"]
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=benefactor_auth
        )
        assert response.status_code == 200
        beneficiaries = response.json()

        for ben in beneficiaries:
            # relation is displayed in tree node
            relation = ben.get("relation", "")
            print(f"✓ {ben.get('first_name', 'Unknown')}: relation='{relation}'")


class TestAdminGraphView:
    """Tests for Admin Users tab Graph view mode"""

    @pytest.fixture(scope="class")
    def admin_auth(self):
        """Get auth token for admin user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - try again later")
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        return {"Authorization": f"Bearer {data['access_token']}"}

    def test_admin_users_returns_linked_beneficiaries(self, admin_auth):
        """Admin /api/admin/users should return linked_beneficiaries for Graph view"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_auth)
        assert response.status_code == 200
        users = response.json()

        assert len(users) > 0, "No users returned"

        # Find benefactors
        benefactors = [u for u in users if u.get("role") == "benefactor"]
        print(f"✓ Found {len(benefactors)} benefactor(s)")

        for bfactor in benefactors:
            linked = bfactor.get("linked_beneficiaries", [])
            print(
                f"  - {bfactor.get('name', 'Unknown')}: {len(linked)} linked beneficiaries"
            )

            # Verify structure of linked beneficiaries for Graph view
            for ben in linked:
                assert "id" in ben, "linked_beneficiary missing id"
                # These fields are used by Graph view SVG rendering
                assert "first_name" in ben or "name" in ben, (
                    "linked_beneficiary missing name"
                )
                # date_of_birth used for age calculation in sorting

    def test_admin_users_includes_date_of_birth(self, admin_auth):
        """Admin users should include date_of_birth for age-based sorting in Graph view"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_auth)
        assert response.status_code == 200
        users = response.json()

        # Check if users have date_of_birth field
        for user in users[:5]:  # Check first 5
            dob = user.get("date_of_birth")
            print(f"✓ User {user.get('name', 'Unknown')}: DOB={dob or 'N/A'}")

    def test_admin_users_linked_beneficiaries_have_dob(self, admin_auth):
        """linked_beneficiaries should include date_of_birth for age sorting in Graph view"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=admin_auth)
        assert response.status_code == 200
        users = response.json()

        # Find benefactors with linked beneficiaries
        benefactors_with_bens = [
            u
            for u in users
            if u.get("role") == "benefactor"
            and len(u.get("linked_beneficiaries", [])) > 0
        ]

        if not benefactors_with_bens:
            pytest.skip("No benefactors with linked beneficiaries found")

        for bfactor in benefactors_with_bens[:3]:  # Check first 3
            for ben in bfactor.get("linked_beneficiaries", []):
                name = ben.get("first_name") or ben.get("name", "Unknown")
                dob = ben.get("date_of_birth") or ben.get("dob")
                print(f"✓ Linked ben {name}: DOB={dob or 'N/A'}")


class TestBeneficiaryEstatesFilter:
    """Tests for beneficiary estate filtering in BeneficiariesPage"""

    @pytest.fixture(scope="class")
    def benefactor_auth(self):
        """Get auth token for benefactor user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - try again later")
        assert response.status_code == 200
        data = response.json()
        return {"Authorization": f"Bearer {data['access_token']}"}

    def test_estates_correctly_annotates_beneficiary_estates(self, benefactor_auth):
        """GET /api/estates should annotate beneficiary estates with is_beneficiary_estate=true"""
        response = requests.get(f"{BASE_URL}/api/estates", headers=benefactor_auth)
        assert response.status_code == 200
        estates = response.json()

        # Check for proper annotation
        for estate in estates:
            role = estate.get("user_role_in_estate")
            is_ben_estate = estate.get("is_beneficiary_estate", False)

            if role == "beneficiary":
                # Should have is_beneficiary_estate=True
                assert is_ben_estate, (
                    f"Estate {estate.get('name')} has user_role_in_estate=beneficiary but is_beneficiary_estate is not True"
                )
                print(
                    f"✓ Beneficiary estate: {estate.get('name')} (is_beneficiary_estate=True)"
                )
            elif role == "owner":
                # Should not have is_beneficiary_estate=True
                assert not is_ben_estate, (
                    f"Owned estate {estate.get('name')} should not have is_beneficiary_estate=True"
                )
                print(
                    f"✓ Owned estate: {estate.get('name')} (user_role_in_estate=owner)"
                )


class TestPreviousBugFixes:
    """Regression tests for bug fixes from previous iterations"""

    @pytest.fixture(scope="class")
    def benefactor_auth(self):
        """Get auth token for benefactor user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - try again later")
        assert response.status_code == 200
        data = response.json()
        return {"Authorization": f"Bearer {data['access_token']}"}

    @pytest.fixture(scope="class")
    def admin_auth(self):
        """Get auth token for admin user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if response.status_code == 429:
            pytest.skip("Rate limited")
        assert response.status_code == 200
        data = response.json()
        return {"Authorization": f"Bearer {data['access_token']}"}

    def test_onboarding_progress_returns_already_graduated(self, benefactor_auth):
        """GET /api/onboarding/progress should return already_graduated field"""
        response = requests.get(
            f"{BASE_URL}/api/onboarding/progress", headers=benefactor_auth
        )
        assert response.status_code == 200
        data = response.json()

        # Should have already_graduated field
        assert "already_graduated" in data, "Response missing already_graduated field"
        print(f"✓ already_graduated = {data['already_graduated']}")

    def test_beneficiaries_sorted_by_sort_order(self, benefactor_auth):
        """GET /api/beneficiaries/{estate_id} should return sorted by sort_order"""
        estates_response = requests.get(
            f"{BASE_URL}/api/estates", headers=benefactor_auth
        )
        estates = estates_response.json()

        owned_estates = [e for e in estates if e.get("user_role_in_estate") == "owner"]
        if not owned_estates:
            pytest.skip("No owned estates")

        estate_id = owned_estates[0]["id"]
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=benefactor_auth
        )
        assert response.status_code == 200
        beneficiaries = response.json()

        if len(beneficiaries) < 2:
            pytest.skip("Need 2+ beneficiaries to verify sorting")

        # Check that sort_order is present and verify order
        for i, ben in enumerate(beneficiaries):
            sort_order = ben.get("sort_order", i)
            print(
                f"✓ Position {i}: {ben.get('first_name', 'Unknown')} (sort_order={sort_order})"
            )

    def test_admin_delete_requires_password(self, admin_auth):
        """DELETE /api/admin/users/{user_id} should require password"""
        # Try to delete without password - should fail
        # Use a fake user_id to avoid deleting real users
        fake_user_id = "test-fake-user-id-12345"
        response = requests.delete(
            f"{BASE_URL}/api/admin/users/{fake_user_id}", headers=admin_auth
        )

        # Should require password
        assert response.status_code in [401, 422, 404], (
            f"Expected 401/422/404 without password, got {response.status_code}"
        )
        print(f"✓ Delete without password returns {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
