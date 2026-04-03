"""
Test subscription pricing features:
- PUT /api/admin/plans/{plan_id}/price for ALL tiers (including military, new_adult, hospice, veteran, enterprise)
- PUT /api/admin/beneficiary-plans/{plan_id}/price for all beneficiary plans
- GET /api/admin/subscription-settings returns family discount fields
- PUT /api/admin/family-discount-settings accepts and persists family discount percentages
- Validation: family discount values must be 0-100
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestSubscriptionPricing:
    """Test subscription pricing admin endpoints"""

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
        # Use access_token (not token) per the agent context
        token = login_data.get("access_token") or login_data.get("token")
        if not token:
            pytest.skip("No token in login response")

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token

    # ==================== GET /admin/subscription-settings ====================

    def test_get_subscription_settings_returns_family_discount_fields(self):
        """GET /admin/subscription-settings should return family_benefactor_discount_percent and family_beneficiary_discount_percent"""
        response = self.session.get(f"{BASE_URL}/api/admin/subscription-settings")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        # Verify family discount fields are present
        assert "family_benefactor_discount_percent" in data, "Missing family_benefactor_discount_percent field"
        assert "family_beneficiary_discount_percent" in data, "Missing family_beneficiary_discount_percent field"

        # Verify they are numeric
        assert isinstance(data["family_benefactor_discount_percent"], (int, float)), (
            "family_benefactor_discount_percent should be numeric"
        )
        assert isinstance(data["family_beneficiary_discount_percent"], (int, float)), (
            "family_beneficiary_discount_percent should be numeric"
        )

        # Verify plans and beneficiary_plans are present
        assert "plans" in data, "Missing plans field"
        assert "beneficiary_plans" in data, "Missing beneficiary_plans field"

        print(f"Family benefactor discount: {data['family_benefactor_discount_percent']}%")
        print(f"Family beneficiary discount: {data['family_beneficiary_discount_percent']}%")

    # ==================== PUT /admin/plans/{plan_id}/price ====================

    def _update_plan_price(self, plan_id, price):
        """Helper to update plan price using proper form encoding"""
        # Remove Content-Type header for form data (requests will set it automatically)
        headers = {k: v for k, v in self.session.headers.items() if k.lower() != "content-type"}
        return requests.put(f"{BASE_URL}/api/admin/plans/{plan_id}/price", data={"price": price}, headers=headers)

    def _update_beneficiary_plan_price(self, plan_id, price):
        """Helper to update beneficiary plan price using proper form encoding"""
        headers = {k: v for k, v in self.session.headers.items() if k.lower() != "content-type"}
        return requests.put(
            f"{BASE_URL}/api/admin/beneficiary-plans/{plan_id}/price", data={"price": price}, headers=headers
        )

    def test_update_premium_plan_price(self):
        """PUT /admin/plans/premium/price should work"""
        response = self._update_plan_price("premium", 9.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success"), f"Expected success=True, got {data}"

    def test_update_standard_plan_price(self):
        """PUT /admin/plans/standard/price should work"""
        response = self._update_plan_price("standard", 8.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    def test_update_base_plan_price(self):
        """PUT /admin/plans/base/price should work"""
        response = self._update_plan_price("base", 7.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    def test_update_military_plan_price(self):
        """PUT /admin/plans/military/price should work (previously blocked by adjustable:false)"""
        response = self._update_plan_price("military", 5.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success"), f"Military plan price update should succeed, got {data}"

    def test_update_new_adult_plan_price(self):
        """PUT /admin/plans/new_adult/price should work (previously blocked by adjustable:false)"""
        response = self._update_plan_price("new_adult", 3.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success"), f"New Adult plan price update should succeed, got {data}"

    def test_update_hospice_plan_price(self):
        """PUT /admin/plans/hospice/price should work (previously blocked by adjustable:false)"""
        response = self._update_plan_price("hospice", 0.00)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success"), f"Hospice plan price update should succeed, got {data}"

    def test_update_veteran_plan_price(self):
        """PUT /admin/plans/veteran/price should work (previously blocked by adjustable:false)"""
        response = self._update_plan_price("veteran", 5.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success"), f"Veteran plan price update should succeed, got {data}"

    def test_update_enterprise_plan_price(self):
        """PUT /admin/plans/enterprise/price should work (previously blocked by adjustable:false)"""
        response = self._update_plan_price("enterprise", 0.00)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success"), f"Enterprise plan price update should succeed, got {data}"

    def test_update_nonexistent_plan_returns_404(self):
        """PUT /admin/plans/nonexistent/price should return 404"""
        response = self._update_plan_price("nonexistent_plan", 9.99)

        assert response.status_code == 404, f"Expected 404 for nonexistent plan, got {response.status_code}"

    # ==================== PUT /admin/beneficiary-plans/{plan_id}/price ====================

    def test_update_ben_premium_plan_price(self):
        """PUT /admin/beneficiary-plans/ben_premium/price should work"""
        response = self._update_beneficiary_plan_price("ben_premium", 2.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    def test_update_ben_standard_plan_price(self):
        """PUT /admin/beneficiary-plans/ben_standard/price should work"""
        response = self._update_beneficiary_plan_price("ben_standard", 3.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    def test_update_ben_base_plan_price(self):
        """PUT /admin/beneficiary-plans/ben_base/price should work"""
        response = self._update_beneficiary_plan_price("ben_base", 4.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    def test_update_ben_military_plan_price(self):
        """PUT /admin/beneficiary-plans/ben_military/price should work"""
        response = self._update_beneficiary_plan_price("ben_military", 1.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    def test_update_ben_hospice_plan_price(self):
        """PUT /admin/beneficiary-plans/ben_hospice/price should work"""
        response = self._update_beneficiary_plan_price("ben_hospice", 4.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    def test_update_ben_veteran_plan_price(self):
        """PUT /admin/beneficiary-plans/ben_veteran/price should work"""
        response = self._update_beneficiary_plan_price("ben_veteran", 1.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    def test_update_ben_enterprise_plan_price(self):
        """PUT /admin/beneficiary-plans/ben_enterprise/price should work"""
        response = self._update_beneficiary_plan_price("ben_enterprise", 0.00)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    def test_update_ben_new_adult_plan_price(self):
        """PUT /admin/beneficiary-plans/ben_new_adult/price should work"""
        response = self._update_beneficiary_plan_price("ben_new_adult", 1.99)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")

    # ==================== PUT /admin/family-discount-settings ====================

    def test_update_family_benefactor_discount(self):
        """PUT /admin/family-discount-settings should accept family_benefactor_discount_percent"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/family-discount-settings", json={"family_benefactor_discount_percent": 15}
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")
        assert data.get("family_benefactor_discount_percent") == 15

    def test_update_family_beneficiary_discount(self):
        """PUT /admin/family-discount-settings should accept family_beneficiary_discount_percent"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/family-discount-settings", json={"family_beneficiary_discount_percent": 20}
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")
        assert data.get("family_beneficiary_discount_percent") == 20

    def test_update_both_family_discounts(self):
        """PUT /admin/family-discount-settings should accept both discount fields"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/family-discount-settings",
            json={"family_benefactor_discount_percent": 10, "family_beneficiary_discount_percent": 25},
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success")
        assert data.get("family_benefactor_discount_percent") == 10
        assert data.get("family_beneficiary_discount_percent") == 25

    def test_family_discount_persists(self):
        """Family discount settings should persist after update"""
        # Set specific values
        update_response = self.session.put(
            f"{BASE_URL}/api/admin/family-discount-settings",
            json={"family_benefactor_discount_percent": 12, "family_beneficiary_discount_percent": 18},
        )
        assert update_response.status_code == 200

        # Verify via GET
        get_response = self.session.get(f"{BASE_URL}/api/admin/subscription-settings")
        assert get_response.status_code == 200

        data = get_response.json()
        assert data.get("family_benefactor_discount_percent") == 12, (
            f"Expected 12, got {data.get('family_benefactor_discount_percent')}"
        )
        assert data.get("family_beneficiary_discount_percent") == 18, (
            f"Expected 18, got {data.get('family_beneficiary_discount_percent')}"
        )

    def test_family_discount_rejects_negative_value(self):
        """PUT /admin/family-discount-settings should reject values < 0"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/family-discount-settings", json={"family_benefactor_discount_percent": -5}
        )

        assert response.status_code == 400, f"Expected 400 for negative value, got {response.status_code}"

    def test_family_discount_rejects_over_100(self):
        """PUT /admin/family-discount-settings should reject values > 100"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/family-discount-settings", json={"family_beneficiary_discount_percent": 150}
        )

        assert response.status_code == 400, f"Expected 400 for value > 100, got {response.status_code}"

    def test_family_discount_accepts_zero(self):
        """PUT /admin/family-discount-settings should accept 0%"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/family-discount-settings", json={"family_benefactor_discount_percent": 0}
        )

        assert response.status_code == 200, f"Expected 200 for 0%, got {response.status_code}"

    def test_family_discount_accepts_100(self):
        """PUT /admin/family-discount-settings should accept 100%"""
        response = self.session.put(
            f"{BASE_URL}/api/admin/family-discount-settings", json={"family_beneficiary_discount_percent": 100}
        )

        assert response.status_code == 200, f"Expected 200 for 100%, got {response.status_code}"

    def test_family_discount_empty_body_returns_400(self):
        """PUT /admin/family-discount-settings with empty body should return 400"""
        response = self.session.put(f"{BASE_URL}/api/admin/family-discount-settings", json={})

        assert response.status_code == 400, f"Expected 400 for empty body, got {response.status_code}"

    # ==================== Verify price changes persist ====================

    def test_plan_price_change_persists(self):
        """Plan price changes should persist in subscription settings"""
        # Update military plan to a specific price
        update_response = self._update_plan_price("military", 6.49)
        assert update_response.status_code == 200

        # Verify via GET
        get_response = self.session.get(f"{BASE_URL}/api/admin/subscription-settings")
        assert get_response.status_code == 200

        data = get_response.json()
        plans = data.get("plans", [])
        military_plan = next((p for p in plans if p["id"] == "military"), None)

        assert military_plan is not None, "Military plan not found in settings"
        assert military_plan["price"] == 6.49, f"Expected price 6.49, got {military_plan['price']}"

        # Reset to original price
        self._update_plan_price("military", 5.99)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
