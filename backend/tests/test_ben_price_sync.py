"""
Test ben_price sync and billing cycle features:
- PUT /api/admin/beneficiary-plans/ben_premium/price should sync premium plan's ben_price field
- PUT /api/admin/beneficiary-plans/ben_standard/price should sync standard plan's ben_price field
- GET /api/subscriptions/plans should return family_benefactor_discount_percent and family_beneficiary_discount_percent
- After updating beneficiary plan price, GET /api/subscriptions/plans should show updated ben_price on benefactor plan
- PUT /api/admin/plans/{plan_id}/price should update quarterly_price (90%) and annual_price (80%) in lockstep
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestBenPriceSync:
    """Test ben_price sync when updating beneficiary plan prices"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login as admin and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )

        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.status_code} - {login_response.text}")

        login_data = login_response.json()
        token = login_data.get("access_token") or login_data.get("token")
        if not token:
            pytest.skip("No token in login response")

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token

    def _update_beneficiary_plan_price(self, plan_id, price):
        """Helper to update beneficiary plan price using proper form encoding"""
        headers = {k: v for k, v in self.session.headers.items() if k.lower() != "content-type"}
        return requests.put(
            f"{BASE_URL}/api/admin/beneficiary-plans/{plan_id}/price", data={"price": price}, headers=headers
        )

    def _update_plan_price(self, plan_id, price):
        """Helper to update benefactor plan price using proper form encoding"""
        headers = {k: v for k, v in self.session.headers.items() if k.lower() != "content-type"}
        return requests.put(f"{BASE_URL}/api/admin/plans/{plan_id}/price", data={"price": price}, headers=headers)

    # ==================== ben_price sync tests ====================

    def test_ben_premium_price_syncs_to_premium_ben_price(self):
        """PUT /admin/beneficiary-plans/ben_premium/price should sync premium plan's ben_price"""
        # Update ben_premium price to a specific value
        test_price = 3.49
        update_response = self._update_beneficiary_plan_price("ben_premium", test_price)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"

        # Verify via public plans endpoint
        plans_response = self.session.get(f"{BASE_URL}/api/subscriptions/plans")
        assert plans_response.status_code == 200

        data = plans_response.json()
        plans = data.get("plans", [])
        premium_plan = next((p for p in plans if p["id"] == "premium"), None)

        assert premium_plan is not None, "Premium plan not found"
        assert premium_plan.get("ben_price") == test_price, (
            f"Expected ben_price {test_price}, got {premium_plan.get('ben_price')}"
        )
        print(f"Premium plan ben_price synced correctly: ${test_price}")

        # Reset to original
        self._update_beneficiary_plan_price("ben_premium", 2.99)

    def test_ben_standard_price_syncs_to_standard_ben_price(self):
        """PUT /admin/beneficiary-plans/ben_standard/price should sync standard plan's ben_price"""
        # Update ben_standard price to a specific value
        test_price = 4.49
        update_response = self._update_beneficiary_plan_price("ben_standard", test_price)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"

        # Verify via public plans endpoint
        plans_response = self.session.get(f"{BASE_URL}/api/subscriptions/plans")
        assert plans_response.status_code == 200

        data = plans_response.json()
        plans = data.get("plans", [])
        standard_plan = next((p for p in plans if p["id"] == "standard"), None)

        assert standard_plan is not None, "Standard plan not found"
        assert standard_plan.get("ben_price") == test_price, (
            f"Expected ben_price {test_price}, got {standard_plan.get('ben_price')}"
        )
        print(f"Standard plan ben_price synced correctly: ${test_price}")

        # Reset to original
        self._update_beneficiary_plan_price("ben_standard", 3.99)

    def test_ben_base_price_syncs_to_base_ben_price(self):
        """PUT /admin/beneficiary-plans/ben_base/price should sync base plan's ben_price"""
        test_price = 5.49
        update_response = self._update_beneficiary_plan_price("ben_base", test_price)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"

        # Verify via public plans endpoint
        plans_response = self.session.get(f"{BASE_URL}/api/subscriptions/plans")
        assert plans_response.status_code == 200

        data = plans_response.json()
        plans = data.get("plans", [])
        base_plan = next((p for p in plans if p["id"] == "base"), None)

        assert base_plan is not None, "Base plan not found"
        assert base_plan.get("ben_price") == test_price, (
            f"Expected ben_price {test_price}, got {base_plan.get('ben_price')}"
        )
        print(f"Base plan ben_price synced correctly: ${test_price}")

        # Reset to original
        self._update_beneficiary_plan_price("ben_base", 4.99)

    # ==================== Public plans endpoint tests ====================

    def test_public_plans_returns_family_discount_percentages(self):
        """GET /subscriptions/plans should return family_benefactor_discount_percent and family_beneficiary_discount_percent"""
        response = self.session.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

        data = response.json()

        # Verify family discount fields are present
        assert "family_benefactor_discount_percent" in data, "Missing family_benefactor_discount_percent"
        assert "family_beneficiary_discount_percent" in data, "Missing family_beneficiary_discount_percent"

        # Verify they are numeric
        assert isinstance(data["family_benefactor_discount_percent"], (int, float)), (
            "family_benefactor_discount_percent should be numeric"
        )
        assert isinstance(data["family_beneficiary_discount_percent"], (int, float)), (
            "family_beneficiary_discount_percent should be numeric"
        )

        print(f"Family benefactor discount: {data['family_benefactor_discount_percent']}%")
        print(f"Family beneficiary discount: {data['family_beneficiary_discount_percent']}%")

    def test_public_plans_returns_ben_price_on_benefactor_plans(self):
        """GET /subscriptions/plans should return ben_price on benefactor plans"""
        response = self.session.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200

        data = response.json()
        plans = data.get("plans", [])

        # Check that premium, standard, base plans have ben_price
        for plan_id in ["premium", "standard", "base"]:
            plan = next((p for p in plans if p["id"] == plan_id), None)
            assert plan is not None, f"{plan_id} plan not found"
            assert "ben_price" in plan, f"{plan_id} plan missing ben_price field"
            assert isinstance(plan["ben_price"], (int, float)), f"{plan_id} ben_price should be numeric"
            print(f"{plan_id} plan ben_price: ${plan['ben_price']}")

    # ==================== Quarterly/Annual price lockstep tests ====================

    def test_plan_price_update_syncs_quarterly_and_annual(self):
        """PUT /admin/plans/{plan_id}/price should update quarterly_price (90%) and annual_price (80%)"""
        # Update premium plan to a specific price
        test_price = 10.00
        update_response = self._update_plan_price("premium", test_price)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"

        # Verify via admin settings endpoint
        settings_response = self.session.get(f"{BASE_URL}/api/admin/subscription-settings")
        assert settings_response.status_code == 200

        data = settings_response.json()
        plans = data.get("plans", [])
        premium_plan = next((p for p in plans if p["id"] == "premium"), None)

        assert premium_plan is not None, "Premium plan not found"

        # Verify quarterly_price = price * 0.9
        expected_quarterly = round(test_price * 0.9, 2)
        assert premium_plan.get("quarterly_price") == expected_quarterly, (
            f"Expected quarterly_price {expected_quarterly}, got {premium_plan.get('quarterly_price')}"
        )

        # Verify annual_price = price * 0.8
        expected_annual = round(test_price * 0.8, 2)
        assert premium_plan.get("annual_price") == expected_annual, (
            f"Expected annual_price {expected_annual}, got {premium_plan.get('annual_price')}"
        )

        print(f"Premium plan: price=${test_price}, quarterly=${expected_quarterly}, annual=${expected_annual}")

        # Reset to original
        self._update_plan_price("premium", 9.99)

    def test_beneficiary_plan_price_update_syncs_quarterly_and_annual(self):
        """PUT /admin/beneficiary-plans/{plan_id}/price should update quarterly_price (90%) and annual_price (80%)"""
        # Update ben_premium plan to a specific price
        test_price = 4.00
        update_response = self._update_beneficiary_plan_price("ben_premium", test_price)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"

        # Verify via admin settings endpoint
        settings_response = self.session.get(f"{BASE_URL}/api/admin/subscription-settings")
        assert settings_response.status_code == 200

        data = settings_response.json()
        ben_plans = data.get("beneficiary_plans", [])
        ben_premium_plan = next((p for p in ben_plans if p["id"] == "ben_premium"), None)

        assert ben_premium_plan is not None, "ben_premium plan not found"

        # Verify quarterly_price = price * 0.9
        expected_quarterly = round(test_price * 0.9, 2)
        assert ben_premium_plan.get("quarterly_price") == expected_quarterly, (
            f"Expected quarterly_price {expected_quarterly}, got {ben_premium_plan.get('quarterly_price')}"
        )

        # Verify annual_price = price * 0.8
        expected_annual = round(test_price * 0.8, 2)
        assert ben_premium_plan.get("annual_price") == expected_annual, (
            f"Expected annual_price {expected_annual}, got {ben_premium_plan.get('annual_price')}"
        )

        print(f"ben_premium plan: price=${test_price}, quarterly=${expected_quarterly}, annual=${expected_annual}")

        # Reset to original
        self._update_beneficiary_plan_price("ben_premium", 2.99)

    # ==================== Full flow test ====================

    def test_full_ben_price_sync_flow(self):
        """Full flow: change beneficiary price in admin -> verify it appears on public plans with updated ben_price"""
        # Step 1: Get current ben_premium price
        initial_response = self.session.get(f"{BASE_URL}/api/subscriptions/plans")
        assert initial_response.status_code == 200
        initial_data = initial_response.json()
        initial_plans = initial_data.get("plans", [])
        initial_premium = next((p for p in initial_plans if p["id"] == "premium"), None)
        initial_ben_price = initial_premium.get("ben_price")
        print(f"Initial premium ben_price: ${initial_ben_price}")

        # Step 2: Update ben_premium to a new price
        new_price = 3.79
        update_response = self._update_beneficiary_plan_price("ben_premium", new_price)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        print(f"Updated ben_premium price to: ${new_price}")

        # Step 3: Verify public plans endpoint shows updated ben_price
        updated_response = self.session.get(f"{BASE_URL}/api/subscriptions/plans")
        assert updated_response.status_code == 200
        updated_data = updated_response.json()
        updated_plans = updated_data.get("plans", [])
        updated_premium = next((p for p in updated_plans if p["id"] == "premium"), None)

        assert updated_premium.get("ben_price") == new_price, (
            f"Expected ben_price {new_price}, got {updated_premium.get('ben_price')}"
        )
        print(f"Verified premium ben_price updated to: ${new_price}")

        # Step 4: Reset to original
        self._update_beneficiary_plan_price("ben_premium", 2.99)
        print("Reset ben_premium price to $2.99")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
