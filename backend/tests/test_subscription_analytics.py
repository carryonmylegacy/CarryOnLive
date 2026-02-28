"""
Subscription Analytics Dashboard Tests
Tests the new /api/admin/subscription-stats endpoint for analytics data
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "admin@carryon.com"
ADMIN_PASSWORD = "admin123"
REGULAR_USER_EMAIL = "founder@carryon.us"
REGULAR_USER_PASSWORD = "CarryOntheWisdom!"


class TestSubscriptionAnalyticsAPI:
    """Tests for GET /api/admin/subscription-stats endpoint"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login to get tokens"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Get admin token
        admin_login = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert admin_login.status_code == 200, f"Admin login failed: {admin_login.text}"
        self.admin_token = admin_login.json().get("access_token")

        # Get regular user token
        user_login = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": REGULAR_USER_EMAIL, "password": REGULAR_USER_PASSWORD},
        )
        if user_login.status_code == 200:
            self.user_token = user_login.json().get("access_token")
        else:
            self.user_token = None

    def test_subscription_stats_requires_auth(self):
        """Analytics endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/subscription-stats")
        assert response.status_code in [401, 403], (
            f"Expected 401/403, got {response.status_code}"
        )
        print("PASS: Analytics endpoint requires authentication")

    def test_subscription_stats_requires_admin_role(self):
        """Analytics endpoint should require admin role (403 for non-admin)"""
        if not self.user_token:
            pytest.skip("Regular user login failed")

        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.user_token}"},
        )
        assert response.status_code == 403, (
            f"Expected 403 for non-admin, got {response.status_code}"
        )
        print("PASS: Analytics endpoint requires admin role (403 for non-admin)")

    def test_subscription_stats_returns_mrr(self):
        """Analytics should return MRR (Monthly Recurring Revenue)"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()

        assert "mrr" in data, "Response missing 'mrr' field"
        assert isinstance(data["mrr"], (int, float)), "MRR should be a number"
        print(f"PASS: MRR returned: ${data['mrr']:.2f}")

    def test_subscription_stats_returns_arr(self):
        """Analytics should return ARR (Annual Recurring Revenue)"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        assert "arr" in data, "Response missing 'arr' field"
        assert isinstance(data["arr"], (int, float)), "ARR should be a number"
        # ARR should be ~12x MRR
        if data["mrr"] > 0:
            expected_arr = data["mrr"] * 12
            assert abs(data["arr"] - expected_arr) < 0.01, "ARR should be 12x MRR"
        print(f"PASS: ARR returned: ${data['arr']:.2f}")

    def test_subscription_stats_returns_trial_conversion_pct(self):
        """Analytics should return trial conversion percentage"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        assert "trial_conversion_pct" in data, (
            "Response missing 'trial_conversion_pct' field"
        )
        assert isinstance(data["trial_conversion_pct"], (int, float)), (
            "trial_conversion_pct should be a number"
        )
        assert 0 <= data["trial_conversion_pct"] <= 100, (
            "trial_conversion_pct should be 0-100"
        )
        print(f"PASS: Trial conversion: {data['trial_conversion_pct']}%")

    def test_subscription_stats_returns_churn_rate_pct(self):
        """Analytics should return churn rate percentage"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        assert "churn_rate_pct" in data, "Response missing 'churn_rate_pct' field"
        assert isinstance(data["churn_rate_pct"], (int, float)), (
            "churn_rate_pct should be a number"
        )
        assert 0 <= data["churn_rate_pct"] <= 100, "churn_rate_pct should be 0-100"
        print(f"PASS: Churn rate: {data['churn_rate_pct']}%")

    def test_subscription_stats_returns_tier_distribution(self):
        """Analytics should return tier distribution array"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        assert "tier_distribution" in data, "Response missing 'tier_distribution' field"
        assert isinstance(data["tier_distribution"], list), (
            "tier_distribution should be an array"
        )

        # Each tier should have tier name, id, count, and price
        for tier in data["tier_distribution"]:
            assert "tier" in tier, "Tier entry missing 'tier' name"
            assert "id" in tier, "Tier entry missing 'id'"
            assert "count" in tier, "Tier entry missing 'count'"
            assert "price" in tier, "Tier entry missing 'price'"

        print(
            f"PASS: Tier distribution: {len(data['tier_distribution'])} tiers returned"
        )

    def test_subscription_stats_returns_signup_trend(self):
        """Analytics should return 30-day signup trend"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        assert "signup_trend" in data, "Response missing 'signup_trend' field"
        assert isinstance(data["signup_trend"], list), "signup_trend should be an array"
        assert len(data["signup_trend"]) == 30, (
            f"Expected 30 days of data, got {len(data['signup_trend'])}"
        )

        # Each entry should have date and signups count
        for entry in data["signup_trend"]:
            assert "date" in entry, "Signup trend entry missing 'date'"
            assert "signups" in entry, "Signup trend entry missing 'signups'"

        print(f"PASS: Signup trend: {len(data['signup_trend'])} days of data")

    def test_subscription_stats_returns_trial_breakdown(self):
        """Analytics should return trial status breakdown"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        assert "trial_breakdown" in data, "Response missing 'trial_breakdown' field"
        breakdown = data["trial_breakdown"]

        # Should have active, expired_no_sub, converted, churned
        assert "active" in breakdown, "trial_breakdown missing 'active'"
        assert "expired_no_sub" in breakdown, "trial_breakdown missing 'expired_no_sub'"
        assert "converted" in breakdown, "trial_breakdown missing 'converted'"
        assert "churned" in breakdown, "trial_breakdown missing 'churned'"

        print(
            f"PASS: Trial breakdown - Active: {breakdown['active']}, Converted: {breakdown['converted']}, Churned: {breakdown['churned']}"
        )

    def test_subscription_stats_returns_revenue_by_tier(self):
        """Analytics should return revenue breakdown by tier"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        assert "revenue_by_tier" in data, "Response missing 'revenue_by_tier' field"
        assert isinstance(data["revenue_by_tier"], list), (
            "revenue_by_tier should be an array"
        )

        # Each entry should have tier, id, revenue, subscribers
        for tier in data["revenue_by_tier"]:
            assert "tier" in tier, "Revenue tier entry missing 'tier' name"
            assert "id" in tier, "Revenue tier entry missing 'id'"
            assert "revenue" in tier, "Revenue tier entry missing 'revenue'"
            assert "subscribers" in tier, "Revenue tier entry missing 'subscribers'"

        print(f"PASS: Revenue by tier: {len(data['revenue_by_tier'])} tiers")

    def test_subscription_stats_returns_all_expected_fields(self):
        """Analytics should return all expected analytics fields"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {self.admin_token}"},
        )
        assert response.status_code == 200
        data = response.json()

        # All required fields
        expected_fields = [
            "total_users",
            "non_admin_users",
            "active_trials",
            "expired_trials",
            "active_subscriptions",
            "cancelled_subscriptions",
            "pending_verifications",
            "free_overrides",
            "mrr",
            "arr",
            "trial_conversion_pct",
            "churn_rate_pct",
            "tier_distribution",
            "signup_trend",
            "trial_breakdown",
            "revenue_by_tier",
        ]

        missing_fields = [f for f in expected_fields if f not in data]
        assert not missing_fields, f"Missing fields: {missing_fields}"

        print("PASS: All expected analytics fields present")
        print(f"  - Total users: {data['total_users']}")
        print(f"  - Active trials: {data['active_trials']}")
        print(f"  - Active subscriptions: {data['active_subscriptions']}")
        print(f"  - MRR: ${data['mrr']:.2f}")
        print(f"  - Churn rate: {data['churn_rate_pct']}%")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
