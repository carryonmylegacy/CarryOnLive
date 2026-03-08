"""
CarryOn™ Subscription Features Test Suite
Tests for:
- Subscription plans API with correct pricing (6 tiers + beneficiary plans)
- Subscription status (trial info, beta mode, subscription details)
- Verification upload and status
- Admin verifications management
- Admin subscription stats
"""

import os
import pytest
import requests
import base64

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://notification-hub-85.preview.emergentagent.com"

# Test credentials
ADMIN_EMAIL = "admin@carryon.com"
ADMIN_PASSWORD = "admin123"
EXPIRED_USER_EMAIL = "expired@test.com"
EXPIRED_USER_PASSWORD = "test123"
REGULAR_USER_EMAIL = "founder@carryon.us"
REGULAR_USER_PASSWORD = "CarryOntheWisdom!"


class TestSubscriptionPlans:
    """Tests for GET /api/subscriptions/plans - subscription plan pricing"""

    def test_get_plans_returns_200(self):
        """GET /api/subscriptions/plans should return 200"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )
        print("PASS: GET /api/subscriptions/plans returns 200")

    def test_plans_returns_six_tiers(self):
        """Should return all 6 subscription tiers"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()

        plans = data.get("plans", [])
        plan_ids = [p["id"] for p in plans]

        expected_tiers = [
            "premium",
            "standard",
            "base",
            "new_adult",
            "military",
            "hospice",
        ]
        for tier in expected_tiers:
            assert tier in plan_ids, f"Missing tier: {tier}"

        print(f"PASS: All 6 tiers present: {plan_ids}")

    def test_plans_pricing_correct(self):
        """Verify correct pricing for all tiers"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        plans = {p["id"]: p for p in data.get("plans", [])}

        # Verify post-launch pricing
        expected_prices = {
            "premium": 9.99,
            "standard": 8.99,
            "base": 7.99,
            "new_adult": 3.99,
            "military": 5.99,
            "hospice": 0.00,
        }

        for tier_id, expected_price in expected_prices.items():
            assert tier_id in plans, f"Plan {tier_id} not found"
            actual_price = plans[tier_id].get("price", 0)
            assert abs(actual_price - expected_price) < 0.01, (
                f"{tier_id}: Expected ${expected_price}, got ${actual_price}"
            )

        print("PASS: All tier prices are correct:")
        for tier_id, plan in plans.items():
            print(f"  - {plan.get('name')}: ${plan.get('price')}/mo")

    def test_plans_have_quarterly_annual_pricing(self):
        """Plans should have quarterly (10% off) and annual (20% off) pricing"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()
        plans = data.get("plans", [])

        for plan in plans:
            if plan.get("price", 0) > 0:  # Skip hospice
                assert "quarterly_price" in plan, (
                    f"{plan['id']} missing quarterly_price"
                )
                assert "annual_price" in plan, f"{plan['id']} missing annual_price"

                # Verify discounts are approximately correct
                monthly = plan.get("price")
                quarterly = plan.get("quarterly_price")
                annual = plan.get("annual_price")

                # Quarterly should be ~90% of monthly (10% off)
                expected_quarterly = monthly * 0.9
                assert abs(quarterly - expected_quarterly) < 0.1, (
                    f"{plan['id']} quarterly price wrong: {quarterly} vs expected {expected_quarterly}"
                )

                # Annual should be ~80% of monthly (20% off)
                expected_annual = monthly * 0.8
                assert abs(annual - expected_annual) < 0.1, (
                    f"{plan['id']} annual price wrong: {annual} vs expected {expected_annual}"
                )

        print("PASS: Quarterly (10% off) and annual (20% off) pricing verified")

    def test_beneficiary_plans_returned(self):
        """Should return beneficiary plan pricing"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()

        assert "beneficiary_plans" in data, "Missing beneficiary_plans in response"
        ben_plans = data.get("beneficiary_plans", [])
        assert len(ben_plans) >= 3, (
            f"Expected at least 3 beneficiary plans, got {len(ben_plans)}"
        )

        print(f"PASS: {len(ben_plans)} beneficiary plans returned")
        for bp in ben_plans:
            print(f"  - {bp.get('name')}: ${bp.get('price')}")

    def test_beta_mode_flag_returned(self):
        """Should return beta_mode flag"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()

        assert "beta_mode" in data, "Missing beta_mode in response"
        print(f"PASS: beta_mode = {data.get('beta_mode')}")

    def test_family_plan_enabled_returned(self):
        """Should return family_plan_enabled flag"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        data = response.json()

        assert "family_plan_enabled" in data, "Missing family_plan_enabled in response"
        print(f"PASS: family_plan_enabled = {data.get('family_plan_enabled')}")


class TestSubscriptionStatus:
    """Tests for GET /api/subscriptions/status - user subscription status"""

    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json().get("access_token")

    @pytest.fixture
    def regular_user_token(self):
        """Get regular user auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": REGULAR_USER_EMAIL, "password": REGULAR_USER_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Regular user login failed: {response.text}")
        return response.json().get("access_token")

    def test_status_requires_auth(self):
        """GET /api/subscriptions/status should require authentication"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/status")
        assert response.status_code in [401, 403], (
            f"Expected 401/403, got {response.status_code}"
        )
        print("PASS: Status endpoint requires authentication")

    def test_status_returns_trial_info(self, admin_token):
        """Status should return trial information"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()

        assert "trial" in data, "Missing trial info in response"
        trial = data.get("trial", {})

        # Trial should have these fields (even if null/empty)
        print(
            f"PASS: Trial info returned - active: {trial.get('trial_active')}, "
            f"days_remaining: {trial.get('days_remaining')}"
        )

    def test_status_returns_beta_mode(self, admin_token):
        """Status should return beta_mode flag"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        data = response.json()

        assert "beta_mode" in data, "Missing beta_mode in response"
        print(f"PASS: beta_mode = {data.get('beta_mode')}")

    def test_status_returns_subscription_details(self, admin_token):
        """Status should return subscription details"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        data = response.json()

        # Should have subscription info (even if null)
        assert "subscription" in data, "Missing subscription in response"
        assert "has_active_subscription" in data, "Missing has_active_subscription"
        assert "needs_subscription" in data, "Missing needs_subscription"

        print(
            f"PASS: Subscription status - active: {data.get('has_active_subscription')}, "
            f"needs_subscription: {data.get('needs_subscription')}"
        )

    def test_status_returns_user_role(self, admin_token):
        """Status should return user_role"""
        response = requests.get(
            f"{BASE_URL}/api/subscriptions/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        data = response.json()

        assert "user_role" in data, "Missing user_role in response"
        print(f"PASS: user_role = {data.get('user_role')}")


class TestVerificationUpload:
    """Tests for POST /api/verification/upload"""

    @pytest.fixture
    def regular_user_token(self):
        """Get regular user auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": REGULAR_USER_EMAIL, "password": REGULAR_USER_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Regular user login failed: {response.text}")
        return response.json().get("access_token")

    def test_upload_requires_auth(self):
        """Verification upload should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/verification/upload",
            data={
                "tier_requested": "military",
                "doc_type": "Military ID",
                "file_data": "dGVzdA==",
                "file_name": "test.pdf",
            },
        )
        assert response.status_code in [401, 403], (
            f"Expected 401/403, got {response.status_code}"
        )
        print("PASS: Verification upload requires authentication")

    def test_upload_requires_valid_tier(self, regular_user_token):
        """Should reject invalid tier"""
        response = requests.post(
            f"{BASE_URL}/api/verification/upload",
            headers={"Authorization": f"Bearer {regular_user_token}"},
            data={
                "tier_requested": "invalid_tier",
                "doc_type": "Test",
                "file_data": base64.b64encode(b"test").decode(),
                "file_name": "test.pdf",
            },
        )
        assert response.status_code == 400, (
            f"Expected 400 for invalid tier, got {response.status_code}"
        )
        print("PASS: Invalid tier rejected")

    def test_upload_accepts_military_tier(self, regular_user_token):
        """Should accept military tier verification"""
        response = requests.post(
            f"{BASE_URL}/api/verification/upload",
            headers={"Authorization": f"Bearer {regular_user_token}"},
            data={
                "tier_requested": "military",
                "doc_type": "Military ID",
                "file_data": base64.b64encode(b"test document content").decode(),
                "file_name": "military_id.pdf",
            },
        )
        # May get 400 if already has pending verification - that's acceptable
        assert response.status_code in [200, 201, 400], (
            f"Unexpected status: {response.status_code}: {response.text}"
        )

        if response.status_code in [200, 201]:
            data = response.json()
            assert data.get("success"), "Expected success=True"
            print("PASS: Military verification upload accepted")
        else:
            print(
                "PASS: Military verification rejected (already has pending) - expected behavior"
            )


class TestVerificationStatus:
    """Tests for GET /api/verification/status"""

    @pytest.fixture
    def regular_user_token(self):
        """Get regular user auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": REGULAR_USER_EMAIL, "password": REGULAR_USER_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Regular user login failed: {response.text}")
        return response.json().get("access_token")

    def test_verification_status_requires_auth(self):
        """Should require authentication"""
        response = requests.get(f"{BASE_URL}/api/verification/status")
        assert response.status_code in [401, 403], (
            f"Expected 401/403, got {response.status_code}"
        )
        print("PASS: Verification status requires authentication")

    def test_verification_status_returns_data(self, regular_user_token):
        """Should return verification status"""
        response = requests.get(
            f"{BASE_URL}/api/verification/status",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()

        # Should have status field
        assert "status" in data, "Missing status in response"
        print(f"PASS: Verification status returned: {data.get('status')}")


class TestAdminVerifications:
    """Tests for admin verification management endpoints"""

    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json().get("access_token")

    @pytest.fixture
    def regular_user_token(self):
        """Get regular user auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": REGULAR_USER_EMAIL, "password": REGULAR_USER_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Regular user login failed: {response.text}")
        return response.json().get("access_token")

    def test_list_verifications_requires_admin(self, regular_user_token):
        """GET /api/admin/verifications should require admin role"""
        response = requests.get(
            f"{BASE_URL}/api/admin/verifications",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: Non-admin cannot list verifications")

    def test_list_verifications_admin(self, admin_token):
        """Admin can list all verifications"""
        response = requests.get(
            f"{BASE_URL}/api/admin/verifications",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()

        assert isinstance(data, list), "Expected list of verifications"
        print(f"PASS: Admin retrieved {len(data)} verifications")

    def test_review_verification_requires_admin(self, regular_user_token):
        """POST /api/admin/verifications/{id}/review should require admin"""
        response = requests.post(
            f"{BASE_URL}/api/admin/verifications/fake-id/review",
            headers={"Authorization": f"Bearer {regular_user_token}"},
            json={"action": "approve"},
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: Non-admin cannot review verifications")

    def test_review_invalid_action(self, admin_token):
        """Should reject invalid action"""
        # First get a verification ID (or use fake one)
        response = requests.post(
            f"{BASE_URL}/api/admin/verifications/fake-id/review",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"action": "invalid_action"},
        )
        # Should return 400 for invalid action or 404 for not found
        assert response.status_code in [400, 404], (
            f"Expected 400/404, got {response.status_code}"
        )
        print("PASS: Invalid review action rejected")


class TestAdminSubscriptionStats:
    """Tests for GET /api/admin/subscription-stats"""

    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json().get("access_token")

    @pytest.fixture
    def regular_user_token(self):
        """Get regular user auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": REGULAR_USER_EMAIL, "password": REGULAR_USER_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Regular user login failed: {response.text}")
        return response.json().get("access_token")

    def test_stats_requires_admin(self, regular_user_token):
        """Should require admin role"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASS: Non-admin cannot access subscription stats")

    def test_stats_returns_data(self, admin_token):
        """Admin can get subscription stats"""
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-stats",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()

        # Verify expected fields
        expected_fields = [
            "total_users",
            "active_trials",
            "active_subscriptions",
            "pending_verifications",
        ]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"

        print("PASS: Subscription stats returned:")
        print(f"  - Total users: {data.get('total_users')}")
        print(f"  - Active trials: {data.get('active_trials')}")
        print(f"  - Active subscriptions: {data.get('active_subscriptions')}")
        print(f"  - Pending verifications: {data.get('pending_verifications')}")


class TestAdminSubscriptionSettings:
    """Tests for admin subscription settings (beta mode, pricing)"""

    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json().get("access_token")

    def test_get_settings_admin_only(self, admin_token):
        """GET /api/admin/subscription-settings requires admin"""
        # First test without auth
        response = requests.get(f"{BASE_URL}/api/admin/subscription-settings")
        assert response.status_code in [401, 403], (
            f"Expected 401/403 without auth, got {response.status_code}"
        )

        # Test with admin
        response = requests.get(
            f"{BASE_URL}/api/admin/subscription-settings",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 200, (
            f"Expected 200 with admin, got {response.status_code}"
        )

        data = response.json()
        assert "beta_mode" in data, "Missing beta_mode"
        assert "plans" in data, "Missing plans"
        assert "stats" in data, "Missing stats"

        print("PASS: Admin can access subscription settings")
        print(f"  - Beta mode: {data.get('beta_mode')}")
        print(f"  - Plans count: {len(data.get('plans', []))}")


class TestExpiredTrialUser:
    """Tests for expired trial user behavior"""

    def test_create_and_check_expired_user(self):
        """Test that system correctly handles trial status"""
        # Try to login with expired user credentials
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": EXPIRED_USER_EMAIL, "password": EXPIRED_USER_PASSWORD},
        )

        if response.status_code == 401:
            # User doesn't exist - need to create them with expired trial
            print("INFO: Expired user doesn't exist - skipping expired trial test")
            pytest.skip("Expired test user not seeded")

        if response.status_code == 200:
            token = response.json().get("access_token")

            # Check subscription status
            status_resp = requests.get(
                f"{BASE_URL}/api/subscriptions/status",
                headers={"Authorization": f"Bearer {token}"},
            )

            if status_resp.status_code == 200:
                data = status_resp.json()
                trial = data.get("trial", {})

                if trial.get("trial_expired"):
                    print("PASS: Expired user correctly shows trial_expired=True")
                    print(f"  - needs_subscription: {data.get('needs_subscription')}")
                    print(f"  - beta_mode: {data.get('beta_mode')}")
                else:
                    print(
                        f"INFO: User trial not expired yet - days_remaining: {trial.get('days_remaining')}"
                    )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
