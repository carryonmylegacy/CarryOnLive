"""
Tests for CreateEstatePage Eligibility Step Feature
Tests the special_status and b2b_code fields in create-estate endpoint
and the eligible_tiers/special_status in subscription status endpoint.
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestEstateCreationWithEligibility:
    """Test create-estate endpoint with special_status and b2b_code"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Create test users for each test"""
        self.test_users = []
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def create_test_user(self, suffix=""):
        """Helper to create and login a test user"""
        import time

        email = f"test_eligibility_{int(time.time())}_{suffix}@test.com"

        # Register
        resp = self.session.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": email,
                "password": "Password.123",
                "first_name": "Test",
                "last_name": f"Eligibility{suffix}",
                "role": "beneficiary",
            },
        )
        assert resp.status_code in (200, 201), f"Failed to register: {resp.text}"

        # Login
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "password": "Password.123"},
        )
        assert login_resp.status_code == 200, f"Failed to login: {login_resp.text}"

        data = login_resp.json()
        return {
            "email": email,
            "token": data["access_token"],
            "user_id": data["user"]["id"],
        }

    def test_create_estate_with_military_special_status(self):
        """Test creating estate with military special status"""
        user = self.create_test_user("military")
        headers = {"Authorization": f"Bearer {user['token']}"}

        # Create estate with military special_status
        resp = self.session.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={"beneficiary_enrollments": [], "special_status": ["military"]},
            headers=headers,
        )

        assert resp.status_code == 200, f"Create estate failed: {resp.text}"
        data = resp.json()
        assert data["success"] is True
        assert "estate_id" in data

        # Verify subscription status shows military in eligible_tiers
        status_resp = self.session.get(
            f"{BASE_URL}/api/subscriptions/status", headers=headers
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()

        assert "military" in status_data.get("eligible_tiers", [])
        assert "military" in status_data.get("special_status", [])

    def test_create_estate_with_veteran_special_status(self):
        """Test creating estate with veteran special status"""
        user = self.create_test_user("veteran")
        headers = {"Authorization": f"Bearer {user['token']}"}

        resp = self.session.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={"beneficiary_enrollments": [], "special_status": ["veteran"]},
            headers=headers,
        )

        assert resp.status_code == 200

        # Verify
        status_resp = self.session.get(
            f"{BASE_URL}/api/subscriptions/status", headers=headers
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()

        assert "veteran" in status_data.get("eligible_tiers", [])
        assert "veteran" in status_data.get("special_status", [])

    def test_create_estate_with_hospice_special_status(self):
        """Test creating estate with hospice special status"""
        user = self.create_test_user("hospice")
        headers = {"Authorization": f"Bearer {user['token']}"}

        resp = self.session.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={"beneficiary_enrollments": [], "special_status": ["hospice"]},
            headers=headers,
        )

        assert resp.status_code == 200

        # Verify
        status_resp = self.session.get(
            f"{BASE_URL}/api/subscriptions/status", headers=headers
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()

        assert "hospice" in status_data.get("eligible_tiers", [])
        assert "hospice" in status_data.get("special_status", [])

    def test_create_estate_with_enterprise_and_b2b_code(self):
        """Test creating estate with enterprise status and b2b_code"""
        user = self.create_test_user("enterprise")
        headers = {"Authorization": f"Bearer {user['token']}"}

        resp = self.session.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={
                "beneficiary_enrollments": [],
                "special_status": ["enterprise"],
                "b2b_code": "TESTPARTNER123",
            },
            headers=headers,
        )

        assert resp.status_code == 200

        # Verify
        status_resp = self.session.get(
            f"{BASE_URL}/api/subscriptions/status", headers=headers
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()

        assert "enterprise" in status_data.get("eligible_tiers", [])
        assert "enterprise" in status_data.get("special_status", [])

    def test_create_estate_with_first_responder_special_status(self):
        """Test creating estate with first_responder special status - should map to military tier"""
        user = self.create_test_user("first_responder")
        headers = {"Authorization": f"Bearer {user['token']}"}

        resp = self.session.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={"beneficiary_enrollments": [], "special_status": ["first_responder"]},
            headers=headers,
        )

        assert resp.status_code == 200

        # Verify - first_responder maps to military tier
        status_resp = self.session.get(
            f"{BASE_URL}/api/subscriptions/status", headers=headers
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()

        # first_responder maps to military tier
        assert "military" in status_data.get("eligible_tiers", [])
        assert "first_responder" in status_data.get("special_status", [])

    def test_create_estate_without_special_status(self):
        """Test creating estate without any special status"""
        user = self.create_test_user("none")
        headers = {"Authorization": f"Bearer {user['token']}"}

        resp = self.session.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={"beneficiary_enrollments": []},
            headers=headers,
        )

        assert resp.status_code == 200

        # Verify - no special tiers
        status_resp = self.session.get(
            f"{BASE_URL}/api/subscriptions/status", headers=headers
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()

        # Should have empty or no special status
        assert (
            status_data.get("special_status", []) == []
            or status_data.get("special_status") is None
        )

    def test_create_estate_with_beneficiaries_and_special_status(self):
        """Test creating estate with beneficiaries AND special status"""
        user = self.create_test_user("with_ben")
        headers = {"Authorization": f"Bearer {user['token']}"}

        resp = self.session.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={
                "beneficiary_enrollments": [
                    {
                        "first_name": "Test",
                        "last_name": "Spouse",
                        "email": f"test_spouse_{user['user_id']}@test.com",
                        "relation": "Spouse",
                    }
                ],
                "special_status": ["military"],
            },
            headers=headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["beneficiaries_enrolled"] == 1

        # Verify special status also saved
        status_resp = self.session.get(
            f"{BASE_URL}/api/subscriptions/status", headers=headers
        )
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert "military" in status_data.get("eligible_tiers", [])


class TestExistingUserEstateDenial:
    """Test that users with existing estates cannot create new ones"""

    def test_existing_user_cannot_create_another_estate(self):
        """Existing user with estate should be denied"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})

        # Login as existing user with estate
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        # Try to create another estate
        resp = session.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={"beneficiary_enrollments": [], "special_status": ["military"]},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 400
        assert "already have an estate" in resp.json().get("detail", "").lower()


class TestSubscriptionStatusEligibleTiers:
    """Test subscription status returns eligible_tiers correctly"""

    def test_subscription_status_returns_eligible_tiers_and_special_status(self):
        """Verify subscription status endpoint returns eligible_tiers and special_status"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})

        # Login
        login_resp = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        # Get subscription status
        resp = session.get(
            f"{BASE_URL}/api/subscriptions/status",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert resp.status_code == 200
        data = resp.json()

        # Verify these fields exist in response
        assert "eligible_tiers" in data
        assert "special_status" in data
        assert isinstance(data["eligible_tiers"], list)
        assert isinstance(data["special_status"], list)
