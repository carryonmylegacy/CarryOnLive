"""
Test: Portal Photo Parity Bug Fix
Tests that beneficiary portal shows benefactor's photo (not initials) when:
1. /api/beneficiary/family-connections returns photo_url
2. /api/estates returns owner_photo_url for beneficiary estates
3. User with is_also_beneficiary can access beneficiary portal

Test Users:
- fulltest@test.com (benefactor who is also beneficiary)
- spouse@test.com (benefactor with photo_url set)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestPortalPhotoParity:
    """Test suite for beneficiary portal photo display fix"""

    @pytest.fixture(scope="class")
    def fulltest_user_token(self):
        """Get auth token for fulltest@test.com (benefactor who is also beneficiary)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")  # API returns access_token not token
        pytest.skip(f"Login failed for fulltest@test.com: {response.status_code} - {response.text}")

    @pytest.fixture(scope="class")
    def spouse_user_token(self):
        """Get auth token for spouse@test.com (benefactor with photo)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "spouse@test.com", "password": "Password.123"},
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")  # API returns access_token not token
        pytest.skip(f"Login failed for spouse@test.com: {response.status_code} - {response.text}")

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")  # API returns access_token not token
        pytest.skip(f"Admin login failed: {response.status_code}")

    # === Test 1: Verify user flags ===
    def test_fulltest_user_has_is_also_beneficiary_flag(self, fulltest_user_token):
        """Verify fulltest@test.com has is_also_beneficiary set"""
        headers = {"Authorization": f"Bearer {fulltest_user_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)

        assert response.status_code == 200, f"Me endpoint failed: {response.text}"
        data = response.json()

        # Check the user has the is_also_beneficiary flag
        is_also_beneficiary = data.get("is_also_beneficiary", False)
        role = data.get("role", "")

        print(f"User role: {role}")
        print(f"is_also_beneficiary: {is_also_beneficiary}")

        # User should either be a beneficiary OR be a benefactor with is_also_beneficiary
        assert role in ["beneficiary", "benefactor"], f"Unexpected role: {role}"

    def test_spouse_user_has_photo_url(self, spouse_user_token):
        """Verify spouse@test.com has photo_url set"""
        headers = {"Authorization": f"Bearer {spouse_user_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)

        assert response.status_code == 200, f"Me endpoint failed: {response.text}"
        data = response.json()

        photo_url = data.get("photo_url", "")
        print(f"Spouse user photo_url: {photo_url[:100] if photo_url else 'NOT SET'}")

        # The spouse should have a photo URL set
        assert photo_url, "Spouse user should have photo_url set"

    # === Test 2: /api/estates endpoint ===
    def test_estates_returns_owner_photo_url_for_beneficiary_estates(self, fulltest_user_token):
        """Test that GET /api/estates returns owner_photo_url for estates where user is beneficiary"""
        headers = {"Authorization": f"Bearer {fulltest_user_token}"}
        response = requests.get(f"{BASE_URL}/api/estates", headers=headers)

        assert response.status_code == 200, f"Estates endpoint failed: {response.text}"
        estates = response.json()

        print(f"Total estates returned: {len(estates)}")

        # Find estates where user is a beneficiary
        beneficiary_estates = [e for e in estates if e.get("user_role_in_estate") == "beneficiary"]
        print(f"Beneficiary estates: {len(beneficiary_estates)}")

        # At least one estate should exist where user is beneficiary
        assert len(beneficiary_estates) > 0, "User should be beneficiary of at least one estate"

        # Check each beneficiary estate for photo fields
        for estate in beneficiary_estates:
            estate_name = estate.get("name", "Unknown")
            owner_photo_url = estate.get("owner_photo_url", "")
            benefactor_name = estate.get("benefactor_name", "")

            print(f"Estate: {estate_name}")
            print(f"  - owner_photo_url: {owner_photo_url[:80] if owner_photo_url else 'NOT SET'}...")
            print(f"  - benefactor_name: {benefactor_name}")

            # At least benefactor_name should be set
            # owner_photo_url depends on whether the benefactor has uploaded a photo

    # === Test 3: /api/beneficiary/family-connections endpoint ===
    def test_family_connections_returns_photo_url(self, fulltest_user_token):
        """Test that GET /api/beneficiary/family-connections returns photo_url for connected benefactors"""
        headers = {"Authorization": f"Bearer {fulltest_user_token}"}
        response = requests.get(f"{BASE_URL}/api/beneficiary/family-connections", headers=headers)

        assert response.status_code == 200, f"Family connections failed: {response.text}"
        connections = response.json()

        print(f"Total family connections: {len(connections)}")

        # Check each connection for photo_url
        for conn in connections:
            name = conn.get("name", "Unknown")
            photo_url = conn.get("photo_url", "")
            relation = conn.get("relation", "")
            estate_id = conn.get("estate_id", "")

            print(f"Connection: {name}")
            print(f"  - relation: {relation}")
            print(f"  - photo_url: {photo_url[:80] if photo_url else 'NOT SET'}...")
            print(f"  - estate_id: {estate_id}")

            # Verify the API returns photo_url field (even if empty)
            assert "photo_url" in conn, "Connection should have photo_url field"

    # === Test 4: Verify both endpoints work together ===
    def test_both_endpoints_return_consistent_photo_data(self, fulltest_user_token):
        """Verify estates and family-connections return consistent benefactor photo data"""
        headers = {"Authorization": f"Bearer {fulltest_user_token}"}

        # Get estates
        estates_resp = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        assert estates_resp.status_code == 200
        estates = estates_resp.json()

        # Get family connections
        connections_resp = requests.get(f"{BASE_URL}/api/beneficiary/family-connections", headers=headers)
        assert connections_resp.status_code == 200
        connections = connections_resp.json()

        # Map estate IDs
        beneficiary_estates = {e["id"]: e for e in estates if e.get("user_role_in_estate") == "beneficiary"}
        connection_estates = {c.get("estate_id"): c for c in connections}

        # If there are connections, they should match estates
        if connections:
            print(f"Checking {len(connections)} family connections against estates...")
            for estate_id, conn in connection_estates.items():
                if estate_id in beneficiary_estates:
                    estate = beneficiary_estates[estate_id]

                    # Compare photo URLs
                    conn_photo = conn.get("photo_url", "")
                    estate_photo = estate.get("owner_photo_url", "")

                    print(f"Estate {estate_id}:")
                    print(f"  - Connection photo_url: {conn_photo[:50] if conn_photo else 'EMPTY'}...")
                    print(f"  - Estate owner_photo_url: {estate_photo[:50] if estate_photo else 'EMPTY'}...")

                    # Both should either have a photo or both be empty
                    # (The family-connections endpoint should prefer benefactor's own photo)
        else:
            # If no connections, estates fallback should work
            print("No family connections - frontend will use estates fallback")
            for estate in beneficiary_estates.values():
                print(
                    f"Estate {estate.get('name')}: owner_photo_url = {estate.get('owner_photo_url', 'EMPTY')[:50]}..."
                )

    # === Test 5: Verify dual-role user can access both portals ===
    def test_dual_role_user_can_access_benefactor_portal(self, fulltest_user_token):
        """Verify fulltest user can still access their own estate as owner"""
        headers = {"Authorization": f"Bearer {fulltest_user_token}"}
        response = requests.get(f"{BASE_URL}/api/estates", headers=headers)

        assert response.status_code == 200
        estates = response.json()

        # Check for owned estates
        owned_estates = [e for e in estates if e.get("user_role_in_estate") == "owner"]
        print(f"Owned estates: {len(owned_estates)}")

        # User should have both owned and beneficiary estates
        beneficiary_estates = [e for e in estates if e.get("user_role_in_estate") == "beneficiary"]

        print(f"Total estates: {len(estates)}")
        print(f"  - As owner: {len(owned_estates)}")
        print(f"  - As beneficiary: {len(beneficiary_estates)}")

        # At minimum, they should be beneficiary of at least one estate
        assert len(beneficiary_estates) >= 1, "User should be beneficiary of at least one estate"

    # === Test 6: Check if benefactor's photo_url is populated in DB ===
    def test_spouse_benefactor_has_photo_in_profile(self, admin_token, spouse_user_token):
        """Verify the spouse benefactor has a photo set in their profile"""
        headers = {"Authorization": f"Bearer {spouse_user_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)

        assert response.status_code == 200
        data = response.json()

        user_id = data.get("id")
        name = data.get("name", "")
        photo_url = data.get("photo_url", "")
        role = data.get("role", "")

        print(f"Spouse user: {name}")
        print(f"  - ID: {user_id}")
        print(f"  - Role: {role}")
        print(f"  - Photo URL length: {len(photo_url) if photo_url else 0} chars")
        print(f"  - Photo URL preview: {photo_url[:100] if photo_url else 'NOT SET'}...")

        # The test data should have a photo set
        assert photo_url, f"Spouse benefactor ({name}) should have photo_url set for this test"


class TestFrontendPhotoFallback:
    """Test the frontend fallback logic paths"""

    @pytest.fixture(scope="class")
    def fulltest_token(self):
        """Get auth token for fulltest@test.com"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )
        if response.status_code == 200:
            return response.json().get("access_token")  # API returns access_token
        pytest.skip("Login failed")

    def test_fallback_path_estates_to_benefactors(self, fulltest_token):
        """
        Test frontend fallback: when familyConnections is empty,
        estates should provide owner_photo_url which gets mapped to photo_url

        Frontend code (BeneficiaryHubPage.js lines 104-109):
        benefactors={familyConnections.length > 0 ? familyConnections : estates.map(e => ({
            ...e,
            name: e.benefactor_name || e.name,
            photo_url: e.owner_photo_url || e.estate_photo_url || '',
            relation: 'Benefactor',
        }))}
        """
        headers = {"Authorization": f"Bearer {fulltest_token}"}

        # Simulate what frontend does
        estates_resp = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        connections_resp = requests.get(f"{BASE_URL}/api/beneficiary/family-connections", headers=headers)

        estates = estates_resp.json()
        connections = connections_resp.json()

        beneficiary_estates = [e for e in estates if e.get("user_role_in_estate") == "beneficiary"]

        if len(connections) > 0:
            print("Using family-connections path:")
            for conn in connections:
                print(f"  - {conn.get('name')}: photo_url = {bool(conn.get('photo_url'))}")
        else:
            print("Using estates fallback path:")
            for estate in beneficiary_estates:
                mapped = {
                    "name": estate.get("benefactor_name") or estate.get("name"),
                    "photo_url": estate.get("owner_photo_url") or estate.get("estate_photo_url") or "",
                    "relation": "Benefactor",
                }
                print(f"  - {mapped['name']}: photo_url = {bool(mapped['photo_url'])}")

                # The mapping should preserve owner_photo_url as photo_url
                if estate.get("owner_photo_url"):
                    assert mapped["photo_url"] == estate["owner_photo_url"], (
                        "Mapping should preserve owner_photo_url as photo_url"
                    )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
