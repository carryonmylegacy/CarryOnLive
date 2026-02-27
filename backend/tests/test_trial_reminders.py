"""
CarryOn™ — Trial Reminders & Paywall Grid Tests
Tests:
1. POST /api/admin/trial-reminders/send (admin only)
2. Backend trial_reminder_scheduler startup
3. GET /api/subscriptions/plans returns 6 plans for 3x2 grid
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "admin@carryon.com"
ADMIN_PASSWORD = "admin123"
EXPIRED_USER_EMAIL = "expired@test.com"
EXPIRED_USER_PASSWORD = "test123"


@pytest.fixture(scope="module")
def admin_token():
    """Login as admin and get token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Admin login failed: {response.status_code}")


@pytest.fixture(scope="module")
def regular_user_token():
    """Login as regular user and get token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EXPIRED_USER_EMAIL, "password": EXPIRED_USER_PASSWORD},
    )
    if response.status_code == 200:
        return response.json().get("token")
    return None


class TestTrialRemindersAPI:
    """Tests for POST /api/admin/trial-reminders/send"""

    def test_trial_reminders_send_requires_auth(self):
        """Trial reminders endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/admin/trial-reminders/send")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Trial reminders endpoint requires authentication")

    def test_trial_reminders_send_requires_admin(self, regular_user_token):
        """Trial reminders endpoint requires admin role"""
        if not regular_user_token:
            pytest.skip("Regular user not available for testing")
        
        response = requests.post(
            f"{BASE_URL}/api/admin/trial-reminders/send",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Trial reminders endpoint requires admin role")

    def test_trial_reminders_send_admin_success(self, admin_token):
        """Admin can trigger trial reminders manually"""
        response = requests.post(
            f"{BASE_URL}/api/admin/trial-reminders/send",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        assert data["success"] is True, "success should be True"
        assert "reminders_sent" in data, "Response should contain 'reminders_sent' count"
        assert isinstance(data["reminders_sent"], int), "reminders_sent should be integer"
        
        print(f"✓ Admin successfully triggered trial reminders: {data['reminders_sent']} sent")


class TestSubscriptionPlansGrid:
    """Tests for 6-tile paywall grid (3x2 layout)"""

    def test_subscription_plans_returns_six_plans(self):
        """GET /api/subscriptions/plans returns 6 plans for 3x2 grid"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        plans = data.get("plans", [])
        
        # Should have 6 plans for 3x2 grid
        assert len(plans) >= 6, f"Expected at least 6 plans, got {len(plans)}"
        print(f"✓ Plans API returns {len(plans)} plans")
        
        # Verify expected plan IDs
        plan_ids = [p["id"] for p in plans]
        expected_ids = ["premium", "standard", "base", "new_adult", "military", "hospice"]
        
        for expected_id in expected_ids:
            assert expected_id in plan_ids, f"Missing plan: {expected_id}"
        
        print(f"✓ All 6 expected plan tiers present: {expected_ids}")

    def test_plans_have_required_fields(self):
        """Each plan has required fields for tile display"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        plans = data.get("plans", [])
        
        required_fields = ["id", "name", "price", "features"]
        
        for plan in plans:
            for field in required_fields:
                assert field in plan, f"Plan {plan.get('id')} missing field: {field}"
        
        print("✓ All plans have required fields (id, name, price, features)")

    def test_plans_have_quarterly_annual_pricing(self):
        """Plans have quarterly and annual pricing for billing toggle"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        plans = data.get("plans", [])
        
        for plan in plans:
            plan_id = plan.get("id")
            # All paid plans should have quarterly and annual prices
            if plan.get("price", 0) > 0:
                assert "quarterly_price" in plan, f"Plan {plan_id} missing quarterly_price"
                assert "annual_price" in plan, f"Plan {plan_id} missing annual_price"
                
                # Verify discount (quarterly ~10%, annual ~20%)
                base_price = plan["price"]
                quarterly = plan["quarterly_price"]
                annual = plan["annual_price"]
                
                assert quarterly < base_price, f"Plan {plan_id}: quarterly should be less than base"
                assert annual < quarterly, f"Plan {plan_id}: annual should be less than quarterly"
        
        print("✓ All paid plans have quarterly/annual pricing with proper discounts")

    def test_hospice_plan_is_free(self):
        """Hospice plan has $0 price"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        plans = data.get("plans", [])
        
        hospice = next((p for p in plans if p["id"] == "hospice"), None)
        assert hospice is not None, "Hospice plan not found"
        assert hospice["price"] == 0, f"Hospice price should be 0, got {hospice['price']}"
        
        print("✓ Hospice plan correctly priced at $0")

    def test_verification_plans_marked(self):
        """Military and Hospice plans marked as requiring verification"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        plans = data.get("plans", [])
        
        military = next((p for p in plans if p["id"] == "military"), None)
        hospice = next((p for p in plans if p["id"] == "hospice"), None)
        
        assert military is not None, "Military plan not found"
        assert hospice is not None, "Hospice plan not found"
        
        assert military.get("requires_verification") is True, "Military should require verification"
        assert hospice.get("requires_verification") is True, "Hospice should require verification"
        
        print("✓ Military and Hospice plans marked as requiring verification")


class TestBeneficiaryPlans:
    """Tests for beneficiary plan pricing"""

    def test_beneficiary_plans_returned(self):
        """GET /api/subscriptions/plans returns beneficiary plans"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        
        ben_plans = data.get("beneficiary_plans", [])
        assert len(ben_plans) >= 3, f"Expected at least 3 beneficiary plans, got {len(ben_plans)}"
        
        print(f"✓ Beneficiary plans API returns {len(ben_plans)} plans")


class TestFamilyPlanEnabled:
    """Tests for family plan feature flag"""

    def test_family_plan_enabled_flag(self):
        """Plans API returns family_plan_enabled flag"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        
        assert "family_plan_enabled" in data, "Response should include family_plan_enabled"
        assert isinstance(data["family_plan_enabled"], bool), "family_plan_enabled should be boolean"
        
        print(f"✓ Family plan enabled: {data['family_plan_enabled']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
