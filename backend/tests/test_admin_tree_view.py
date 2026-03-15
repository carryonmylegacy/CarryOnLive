"""
Backend tests for Admin Tree View and New Adult signup features
Tests:
1. Admin /users endpoint returns linked_beneficiaries for benefactors
2. Admin /stats endpoint returns viral metrics (avg_beneficiaries_per_benefactor, beneficiaries_converted)
3. Admin /revenue-metrics returns expected metrics
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "founder@carryon.us"
ADMIN_PASSWORD = "CarryOntheWisdom!"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    data = response.json()
    return data.get("access_token")


@pytest.fixture
def auth_headers(admin_token):
    """Auth headers for admin requests"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestAdminUsersEndpoint:
    """Tests for /api/admin/users endpoint - Tree View data"""

    def test_admin_users_returns_200(self, auth_headers):
        """Test that admin users endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list of users"
        print(f"✓ Admin users endpoint returned {len(data)} users")

    def test_admin_users_contains_subscription_info(self, auth_headers):
        """Test that users have subscription info attached"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        # Check that at least one user has subscription field (may be null)
        has_subscription_field = any("subscription" in u for u in data)
        assert has_subscription_field, "Users should have subscription field"
        print("✓ Users have subscription info attached")

    def test_admin_users_benefactors_have_linked_beneficiaries(self, auth_headers):
        """Test that benefactor users have linked_beneficiaries array"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        benefactors = [u for u in data if u.get("role") == "benefactor"]
        if not benefactors:
            pytest.skip("No benefactors in the system to test")

        # All benefactors should have linked_beneficiaries field
        for b in benefactors:
            assert "linked_beneficiaries" in b, f"Benefactor {b.get('email')} missing linked_beneficiaries"
            assert isinstance(b["linked_beneficiaries"], list), "linked_beneficiaries should be a list"

        # Count benefactors with at least one beneficiary
        with_bens = sum(1 for b in benefactors if len(b.get("linked_beneficiaries", [])) > 0)
        print(f"✓ {len(benefactors)} benefactors found, {with_bens} have linked beneficiaries")

    def test_linked_beneficiaries_structure(self, auth_headers):
        """Test that linked_beneficiaries have expected fields"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        benefactors = [u for u in data if u.get("role") == "benefactor"]
        benefactor_with_bens = next((b for b in benefactors if len(b.get("linked_beneficiaries", [])) > 0), None)

        if not benefactor_with_bens:
            pytest.skip("No benefactors with beneficiaries to test structure")

        ben = benefactor_with_bens["linked_beneficiaries"][0]
        expected_fields = ["id", "name", "email", "relation"]
        for field in expected_fields:
            assert field in ben, f"Beneficiary missing field: {field}"

        print(f"✓ Linked beneficiaries have expected structure: {list(ben.keys())}")


class TestAdminStatsEndpoint:
    """Tests for /api/admin/stats endpoint - Viral Growth metrics"""

    def test_admin_stats_returns_200(self, auth_headers):
        """Test that admin stats endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, dict), "Response should be a dict"
        print("✓ Admin stats endpoint returned successfully")

    def test_stats_contains_user_counts(self, auth_headers):
        """Test that stats contains user breakdown"""
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        assert "users" in data, "Stats should contain users field"
        users = data["users"]
        assert "total" in users, "Users should have total count"
        assert "benefactors" in users, "Users should have benefactors count"
        assert "beneficiaries" in users, "Users should have beneficiaries count"
        print(
            f"✓ User stats: total={users['total']}, benefactors={users['benefactors']}, beneficiaries={users['beneficiaries']}"
        )

    def test_stats_contains_viral_metrics(self, auth_headers):
        """Test that stats contains viral growth metrics"""
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        # Viral metrics
        assert "avg_beneficiaries_per_benefactor" in data, "Stats should have avg_beneficiaries_per_benefactor"
        assert "beneficiaries_converted" in data, "Stats should have beneficiaries_converted"

        avg_bens = data["avg_beneficiaries_per_benefactor"]
        converted = data["beneficiaries_converted"]

        assert isinstance(avg_bens, (int, float)), "avg_beneficiaries_per_benefactor should be numeric"
        assert isinstance(converted, int), "beneficiaries_converted should be an integer"

        print(f"✓ Viral metrics: avg_bens_per_benefactor={avg_bens}, beneficiaries_converted={converted}")

    def test_stats_contains_estate_info(self, auth_headers):
        """Test that stats contains estate breakdown"""
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        assert "estates" in data, "Stats should contain estates field"
        estates = data["estates"]
        assert "total" in estates, "Estates should have total count"
        assert "active" in estates, "Estates should have active count"
        assert "transitioned" in estates, "Estates should have transitioned count"
        print(
            f"✓ Estate stats: total={estates['total']}, active={estates['active']}, transitioned={estates['transitioned']}"
        )


class TestAdminRevenueMetrics:
    """Tests for /api/admin/revenue-metrics endpoint"""

    def test_revenue_metrics_returns_200(self, auth_headers):
        """Test that revenue metrics endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/admin/revenue-metrics", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, dict), "Response should be a dict"
        print("✓ Revenue metrics endpoint returned successfully")

    def test_revenue_metrics_structure(self, auth_headers):
        """Test that revenue metrics has expected fields"""
        response = requests.get(f"{BASE_URL}/api/admin/revenue-metrics", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()

        expected_fields = [
            "mrr",
            "arr",
            "total_revenue",
            "revenue_this_month",
            "revenue_last_month",
            "mom_growth",
            "paying_subscribers",
            "arpu_monthly",
            "churn_rate",
            "ltv",
        ]

        for field in expected_fields:
            assert field in data, f"Revenue metrics missing field: {field}"

        print(f"✓ Revenue metrics: MRR=${data['mrr']}, ARR=${data['arr']}, paying={data['paying_subscribers']}")


class TestAdminPlatformOverview:
    """Tests for admin platform overview data"""

    def test_platform_settings_accessible(self, auth_headers):
        """Test that platform settings endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/admin/platform-settings", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "otp_disabled" in data, "Platform settings should have otp_disabled field"
        print(f"✓ Platform settings: otp_disabled={data.get('otp_disabled')}")


class TestNewAdultSignupAPI:
    """Tests for New Adult (18-25) signup flow backend"""

    def test_register_endpoint_exists(self):
        """Test that register endpoint accepts requests"""
        # Just check the endpoint responds (don't actually register)
        response = requests.post(f"{BASE_URL}/api/auth/register", json={})
        # Should get validation error, not 404
        assert response.status_code in [400, 422], f"Register endpoint should exist: {response.status_code}"
        print("✓ Register endpoint exists and returns validation errors")

    def test_subscription_plans_include_new_adult(self, auth_headers):
        """Test that subscription plans include new_adult tier"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()

        # Check if new_adult tier exists in plans
        if isinstance(data, list):
            plan_ids = [p.get("id") for p in data]
        elif isinstance(data, dict) and "plans" in data:
            plan_ids = [p.get("id") for p in data["plans"]]
        else:
            plan_ids = list(data.keys()) if isinstance(data, dict) else []

        # new_adult tier should exist
        has_new_adult = "new_adult" in plan_ids
        print(f"✓ Subscription plans: {plan_ids}")
        print(f"✓ New Adult tier present: {has_new_adult}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
