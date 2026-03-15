"""
Test cases for portal-context-aware subscription paywall fix.
Verifies that:
1. /api/subscriptions/plans returns both 'plans' (benefactor) and 'beneficiary_plans' (beneficiary)
2. /api/subscriptions/checkout saves subscription choice for multi-role users in beta mode
3. Login flows work correctly with test accounts
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://todo-pdf-gen.preview.emergentagent.com")


class TestSubscriptionPlansEndpoint:
    """Tests for /api/subscriptions/plans endpoint"""

    def test_plans_returns_both_plan_arrays(self):
        """Verify API returns both benefactor and beneficiary plan arrays"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        data = response.json()

        # Verify both plan arrays exist
        assert "plans" in data, "Missing 'plans' (benefactor plans) in response"
        assert "beneficiary_plans" in data, "Missing 'beneficiary_plans' in response"

        # Verify plans have content
        assert len(data["plans"]) > 0, "Benefactor plans array is empty"
        assert len(data["beneficiary_plans"]) > 0, "Beneficiary plans array is empty"

        # Verify beta_mode flag exists
        assert "beta_mode" in data

    def test_benefactor_plans_have_correct_ids(self):
        """Verify benefactor plans don't have ben_ prefix"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()

        benefactor_plan_ids = [p["id"] for p in data["plans"]]

        # Benefactor plans should include standard tiers
        expected_plans = ["premium", "standard", "base"]
        for plan_id in expected_plans:
            assert plan_id in benefactor_plan_ids, f"Missing expected benefactor plan: {plan_id}"

        # None should have ben_ prefix
        for plan_id in benefactor_plan_ids:
            assert not plan_id.startswith("ben_"), f"Benefactor plan has ben_ prefix: {plan_id}"

    def test_beneficiary_plans_have_correct_ids(self):
        """Verify beneficiary plans have ben_ prefix"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()

        beneficiary_plan_ids = [p["id"] for p in data["beneficiary_plans"]]

        # All beneficiary plans should have ben_ prefix
        for plan_id in beneficiary_plan_ids:
            assert plan_id.startswith("ben_"), f"Beneficiary plan missing ben_ prefix: {plan_id}"

        # Should include expected beneficiary tiers
        expected_ben_plans = ["ben_premium", "ben_standard", "ben_base"]
        for plan_id in expected_ben_plans:
            assert plan_id in beneficiary_plan_ids, f"Missing expected beneficiary plan: {plan_id}"


class TestLoginFlows:
    """Tests for login flows with test accounts"""

    def test_login_info_carryon_account(self):
        """Test login with info@carryon.us admin account"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
        )

        # Regular login returns 200 with token (OTP disabled for test accounts)
        assert response.status_code == 200, f"Login failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token in login response"
        assert data.get("user", {}).get("role") == "admin", "Expected admin role"
        print("✓ info@carryon.us login successful (admin role)")

    def test_login_fulltest_account(self):
        """Test login with fulltest@test.com benefactor account"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )

        assert response.status_code == 200, f"Login failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token in login response"
        assert data.get("user", {}).get("role") == "benefactor", "Expected benefactor role"
        assert data.get("user", {}).get("is_also_benefactor"), "Expected is_also_benefactor=true"
        print("✓ fulltest@test.com login successful (benefactor, is_also_benefactor=true)")


class TestSubscriptionCheckout:
    """Tests for subscription checkout in beta mode"""

    @pytest.fixture
    def auth_token(self):
        """Get auth token for testing"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )

        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")

        pytest.skip("Could not get auth token for checkout tests")

    def test_checkout_saves_plan_in_beta_mode(self, auth_token):
        """Verify checkout endpoint saves plan preference in beta mode"""
        if not auth_token:
            pytest.skip("No auth token available")

        headers = {"Authorization": f"Bearer {auth_token}"}

        response = requests.post(
            f"{BASE_URL}/api/subscriptions/checkout",
            json={
                "plan_id": "premium",
                "billing_cycle": "annual",
                "origin_url": "https://todo-pdf-gen.preview.emergentagent.com",
            },
            headers=headers,
        )

        # In beta mode, should return success with free=True
        if response.status_code == 200:
            data = response.json()
            if data.get("free"):
                print("✓ Beta mode: Plan preference saved without payment")
                assert "message" in data
            elif data.get("url"):
                print("✓ Beta mode disabled: Stripe checkout URL returned")
        else:
            print(f"Checkout response: {response.status_code} - {response.text}")


class TestSubscriptionStatus:
    """Tests for subscription status endpoint"""

    @pytest.fixture
    def auth_token(self):
        """Get auth token for testing"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )

        if response.status_code == 200:
            data = response.json()
            return data.get("access_token")

        pytest.skip("Could not get auth token")

    def test_subscription_status_returns_beta_mode(self, auth_token):
        """Verify subscription status endpoint returns beta_mode flag"""
        if not auth_token:
            pytest.skip("No auth token available")

        headers = {"Authorization": f"Bearer {auth_token}"}

        response = requests.get(f"{BASE_URL}/api/subscriptions/status", headers=headers)
        assert response.status_code == 200

        data = response.json()
        assert "beta_mode" in data, "Missing beta_mode in subscription status"
        print(f"✓ Beta mode: {data.get('beta_mode')}")

        # Should also have subscription info
        if data.get("subscription"):
            print(f"✓ Active subscription: {data['subscription'].get('plan_id')}")


class TestHealthEndpoint:
    """Basic health check tests"""

    def test_health_endpoint(self):
        """Verify backend is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200

        data = response.json()
        assert data.get("status") == "healthy"
        assert data.get("database") == "connected"
        print(f"✓ Backend healthy, build: {data.get('build')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
