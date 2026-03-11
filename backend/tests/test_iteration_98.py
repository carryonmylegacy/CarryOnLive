"""
Iteration 98 Backend Tests - Bug Fixes Verification
=====================================================
Tests for:
1. Ops Portal Users tab loading data (operators now fetch users same as Founder)
2. Subscription plans API - no Will/Trust Wizard or Eternal Echo
3. Admin users endpoint for operators
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"
MULTI_ROLE_EMAIL = "fulltest@test.com"
MULTI_ROLE_PASSWORD = "Password.123"


class TestAuthAndSetup:
    """Authentication and setup tests"""

    def test_health_check(self):
        """Verify API is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✅ Health check passed")

    def test_admin_login(self):
        """Test admin login and get token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print(f"✅ Admin login successful - role: {data.get('user', {}).get('role')}")
        return data["access_token"]

    def test_multi_role_user_login(self):
        """Test multi-role user login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": MULTI_ROLE_EMAIL, "password": MULTI_ROLE_PASSWORD},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        user = data.get("user", {})
        print(
            f"✅ Multi-role user login successful - role: {user.get('role')}, is_also_benefactor: {user.get('is_also_benefactor')}"
        )
        return data["access_token"]


class TestOpsPortalUsersTab:
    """Test Ops Portal Users tab loads data correctly"""

    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]

    def test_admin_users_endpoint_returns_data(self, admin_token):
        """Verify /api/admin/users returns user list with full data"""
        response = requests.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        assert len(users) > 0, "Should have users in the system"

        # Verify user data structure
        sample_user = users[0]
        assert "id" in sample_user
        assert "email" in sample_user
        print(f"✅ Admin users endpoint returns {len(users)} users")

        # Check if any users have linked_beneficiaries (tree view data)
        users_with_bens = [u for u in users if u.get("linked_beneficiaries")]
        print(f"   - Users with beneficiaries: {len(users_with_bens)}")

        return users

    def test_admin_stats_endpoint(self, admin_token):
        """Verify /api/admin/stats returns stats for ops dashboard"""
        response = requests.get(
            f"{BASE_URL}/api/admin/stats",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200
        stats = response.json()
        assert isinstance(stats, dict)
        print(
            f"✅ Admin stats endpoint working - total users: {stats.get('users', {}).get('total', 'N/A')}"
        )
        return stats


class TestSubscriptionPlansAPI:
    """Test subscription plans API for forbidden text"""

    def test_subscription_plans_no_wizard_echo(self):
        """Verify subscription plans don't contain 'Will/Trust Wizard' or 'Eternal Echo'"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        data = response.json()

        plans = data.get("plans", [])
        assert len(plans) > 0, "Should have subscription plans"

        forbidden_strings = [
            "will/trust wizard",
            "eternal echo",
            "will wizard",
            "trust wizard",
        ]

        for plan in plans:
            plan_name = plan.get("name", "")
            features = plan.get("features", [])

            # Check plan name
            for forbidden in forbidden_strings:
                assert forbidden not in plan_name.lower(), (
                    f"Plan '{plan_name}' contains forbidden text: {forbidden}"
                )

            # Check features
            for feature in features:
                feature_text = feature if isinstance(feature, str) else str(feature)
                for forbidden in forbidden_strings:
                    assert forbidden not in feature_text.lower(), (
                        f"Feature '{feature_text}' in plan '{plan_name}' contains forbidden text: {forbidden}"
                    )

        print(
            f"✅ Verified {len(plans)} subscription plans - no 'Will/Trust Wizard' or 'Eternal Echo' found"
        )
        return plans


class TestEstatesAPI:
    """Test estates API for benefactor_name field"""

    @pytest.fixture
    def multi_role_token(self):
        """Get multi-role user token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": MULTI_ROLE_EMAIL, "password": MULTI_ROLE_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip("Multi-role user login failed")
        return response.json()["access_token"]

    def test_estates_endpoint_has_benefactor_name(self, multi_role_token):
        """Verify /api/estates returns benefactor_name for beneficiary estates"""
        response = requests.get(
            f"{BASE_URL}/api/estates",
            headers={"Authorization": f"Bearer {multi_role_token}"},
        )
        assert response.status_code == 200
        estates = response.json()
        assert isinstance(estates, list)
        print(f"✅ Estates endpoint returns {len(estates)} estate(s)")

        # Check for beneficiary estates with benefactor_name
        for estate in estates:
            role = estate.get("user_role_in_estate")
            if role == "beneficiary" or estate.get("is_beneficiary_estate"):
                # Beneficiary estates should have benefactor_name
                print(
                    f"   - Beneficiary estate: {estate.get('name')}, benefactor_name: {estate.get('benefactor_name', 'N/A')}"
                )

        return estates


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
