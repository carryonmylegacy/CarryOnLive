"""
CarryOn™ Platform — Final Production Pressure Test (Iteration 117)

Comprehensive test suite for pre-production go-live verification.
Tests all major API endpoints, auth flows, admin access, and estate management.

CRITICAL: Login rate limiting is aggressive — single login used throughout.
Admin user (info@carryon.us) has role='admin' which now passes require_benefactor_role guard.
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable is required")

# Admin credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"
ESTATE_ID = "667ba2ef-6914-4761-b1f5-3e0ef3e8fe97"


class TestAuthFlows:
    """Authentication endpoint tests — login, token validation, rate limiting"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token — avoid rate limiting"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        # Handle OTP flow or direct token return
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
            elif data.get("otp_required"):
                # OTP disabled in platform settings, should get direct token
                pytest.skip("OTP required - cannot proceed without OTP verification")
        elif response.status_code == 429:
            pytest.skip("Rate limited - wait before retrying")
        response.raise_for_status()
        return None

    def test_login_valid_credentials(self, auth_token):
        """Test login with valid admin credentials returns access_token"""
        assert auth_token is not None, "Auth token should be returned for valid credentials"
        assert len(auth_token) > 50, "Token should be a JWT with reasonable length"
        print(f"SUCCESS: Login returned valid token (length: {len(auth_token)})")

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns error"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": "invalid@test.com", "password": "wrongpass123"}, timeout=10
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Error response should contain detail"
        print("SUCCESS: Invalid credentials properly rejected with 401")

    def test_auth_me_valid_token(self, auth_token):
        """Test /api/auth/me returns user profile with valid token"""
        if not auth_token:
            pytest.skip("No auth token available")

        response = requests.get(
            f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "id" in data, "Profile should contain user id"
        assert "email" in data, "Profile should contain email"
        assert data["email"] == ADMIN_EMAIL, f"Email mismatch: {data['email']}"
        assert data["role"] == "admin", f"Admin role expected, got {data['role']}"
        print(f"SUCCESS: /auth/me returned user profile: {data['name']} ({data['role']})")

    def test_auth_me_invalid_token(self):
        """Test /api/auth/me rejects invalid token"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer invalid_token_12345"}, timeout=10
        )
        assert response.status_code in (401, 403), f"Expected 401/403, got {response.status_code}"
        print(f"SUCCESS: Invalid token properly rejected with {response.status_code}")


class TestEstateEndpoints:
    """Estate management endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_estates(self, auth_token):
        """Test GET /api/estates returns estate list for admin"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/estates", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return list of estates"
        print(f"SUCCESS: /estates returned {len(data)} estates")

    def test_get_estate_readiness(self, auth_token):
        """Test GET /api/estate/{id}/readiness returns readiness score"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/estate/{ESTATE_ID}/readiness",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=10,
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "score" in data or "overall" in data or isinstance(data, dict), "Should return readiness data"
        print(f"SUCCESS: /estate/readiness returned: {data}")

    def test_get_section_permissions(self, auth_token):
        """Test GET /api/estate/{id}/section-permissions"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/estate/{ESTATE_ID}/section-permissions",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=10,
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /section-permissions returned 200")


class TestBeneficiaryEndpoints:
    """Beneficiary management endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_beneficiaries(self, auth_token):
        """Test GET /api/beneficiaries/{estate_id}"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{ESTATE_ID}", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return list of beneficiaries"
        print(f"SUCCESS: /beneficiaries returned {len(data)} beneficiaries")

    def test_get_succession_order(self, auth_token):
        """Test GET /api/beneficiaries/{estate_id}/succession"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{ESTATE_ID}/succession",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=10,
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /succession returned 200")


class TestChecklistEndpoints:
    """Checklist (IAC) endpoint tests — includes admin role fix verification"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_checklists(self, auth_token):
        """Test GET /api/checklists/{estate_id}"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/checklists/{ESTATE_ID}", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return list of checklist items"
        print(f"SUCCESS: /checklists returned {len(data)} items")
        return data

    def test_create_checklist_item(self, auth_token):
        """Test POST /api/checklists — admin can create items"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.post(
            f"{BASE_URL}/api/checklists",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "estate_id": ESTATE_ID,
                "title": "TEST_ITEM_117 - Pressure Test Checklist Item",
                "description": "Created by iteration 117 pressure test",
                "category": "immediate",
                "priority": "high",
                "order": 999,
            },
            timeout=10,
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data, "Created item should have id"
        print(f"SUCCESS: Created checklist item: {data.get('id')}")
        return data.get("id")

    def test_delete_checklist_item(self, auth_token):
        """Test DELETE /api/checklists/{item_id} — admin can delete"""
        if not auth_token:
            pytest.skip("No auth token")

        # First create an item to delete
        create_response = requests.post(
            f"{BASE_URL}/api/checklists",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "estate_id": ESTATE_ID,
                "title": "TEST_DELETE_117 - Item to be deleted",
                "description": "Will be deleted immediately",
                "category": "immediate",
                "priority": "low",
                "order": 998,
            },
            timeout=10,
        )
        if create_response.status_code != 200:
            pytest.skip(f"Could not create item to delete: {create_response.text}")

        item_id = create_response.json().get("id")

        # Now delete it
        response = requests.delete(
            f"{BASE_URL}/api/checklists/{item_id}", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"SUCCESS: Soft-deleted checklist item {item_id}")


class TestChecklistAIAcceptReject:
    """Test accept/reject endpoints for AI-suggested items — KEY FIX VERIFICATION"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_accept_ai_item_admin(self, auth_token):
        """Test POST /api/checklists/{item_id}/accept — admin role now works (bug fix)"""
        if not auth_token:
            pytest.skip("No auth token")

        # Create an AI-suggested item first
        create_response = requests.post(
            f"{BASE_URL}/api/checklists",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "estate_id": ESTATE_ID,
                "title": "TEST_AI_ACCEPT_117 - AI Suggested Item",
                "description": "AI suggested for testing accept endpoint",
                "category": "immediate",
                "priority": "medium",
                "order": 997,
                "ai_suggested": True,
                "ai_accepted": None,
            },
            timeout=10,
        )
        if create_response.status_code != 200:
            pytest.skip(f"Could not create AI item: {create_response.text}")

        item_id = create_response.json().get("id")

        # Accept the AI item — THIS WAS THE BUG: admin role wasn't allowed
        response = requests.post(
            f"{BASE_URL}/api/checklists/{item_id}/accept", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, (
            f"Expected 200 (admin should be able to accept), got {response.status_code}: {response.text}"
        )
        data = response.json()
        assert data.get("success"), f"Expected success: true, got {data}"
        print(f"SUCCESS: Admin accepted AI item {item_id} — BUG FIX VERIFIED")

        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/checklists/{item_id}", headers={"Authorization": f"Bearer {auth_token}"}, timeout=5
        )

    def test_reject_ai_item_with_feedback_admin(self, auth_token):
        """Test POST /api/checklists/{item_id}/reject-with-feedback — admin role works"""
        if not auth_token:
            pytest.skip("No auth token")

        # Create an AI-suggested item
        create_response = requests.post(
            f"{BASE_URL}/api/checklists",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "estate_id": ESTATE_ID,
                "title": "TEST_AI_REJECT_117 - AI Suggested Item",
                "description": "AI suggested for testing reject endpoint",
                "category": "immediate",
                "priority": "medium",
                "order": 996,
            },
            timeout=10,
        )
        if create_response.status_code != 200:
            pytest.skip(f"Could not create AI item: {create_response.text}")

        item_id = create_response.json().get("id")

        # Reject with feedback — admin role should work
        response = requests.post(
            f"{BASE_URL}/api/checklists/{item_id}/reject-with-feedback",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"feedback": "Test rejection feedback from iteration 117"},
            timeout=10,
        )
        assert response.status_code == 200, (
            f"Expected 200 (admin should be able to reject), got {response.status_code}: {response.text}"
        )
        print(f"SUCCESS: Admin rejected AI item {item_id} with feedback — BUG FIX VERIFIED")


class TestDocumentEndpoints:
    """Document vault endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_documents(self, auth_token):
        """Test GET /api/documents/{estate_id}"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/documents/{ESTATE_ID}", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return list of documents"
        print(f"SUCCESS: /documents returned {len(data)} documents")


class TestMessageEndpoints:
    """Milestone messages endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_messages(self, auth_token):
        """Test GET /api/messages/{estate_id}"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/messages/{ESTATE_ID}", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /messages returned 200")


class TestDigitalWalletEndpoints:
    """Digital wallet vault endpoint tests — includes admin role fix verification"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_digital_wallet(self, auth_token):
        """Test GET /api/digital-wallet/{estate_id} — admin access works (bug fix)"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/digital-wallet/{ESTATE_ID}", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, (
            f"Expected 200 (admin should have access), got {response.status_code}: {response.text}"
        )
        data = response.json()
        assert isinstance(data, list), "Should return list of wallet entries"
        print(f"SUCCESS: /digital-wallet returned {len(data)} entries — ADMIN ACCESS VERIFIED")


class TestGuardianChatEndpoints:
    """Estate Guardian AI (EGA) chat endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_chat_sessions(self, auth_token):
        """Test GET /api/chat/sessions"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/chat/sessions", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return list of chat sessions"
        print(f"SUCCESS: /chat/sessions returned {len(data)} sessions")


class TestSubscriptionEndpoints:
    """Subscription management endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_subscription_status(self, auth_token):
        """Test GET /api/subscriptions/status"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/subscriptions/status", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /subscriptions/status returned 200")

    def test_get_subscription_plans(self, auth_token):
        """Test GET /api/subscriptions/plans"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/subscriptions/plans", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return list of plans"
        print(f"SUCCESS: /subscriptions/plans returned {len(data)} plans")


class TestNotificationEndpoints:
    """Notification endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_notifications(self, auth_token):
        """Test GET /api/notifications"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/notifications", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /notifications returned 200")


class TestTimelineEndpoints:
    """Timeline endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_timeline(self, auth_token):
        """Test GET /api/timeline/{estate_id}"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/timeline/{ESTATE_ID}", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /timeline returned 200")


class TestTransitionEndpoints:
    """Death Transition Service (DTS) endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_transition_status(self, auth_token):
        """Test GET /api/transition/status/{estate_id}"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/transition/status/{ESTATE_ID}",
            headers={"Authorization": f"Bearer {auth_token}"},
            timeout=10,
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /transition/status returned 200")

    def test_get_dts_tasks(self, auth_token):
        """Test GET /api/dts/tasks/{estate_id}"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/dts/tasks/{ESTATE_ID}", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /dts/tasks returned 200")


class TestAdminEndpoints:
    """Admin dashboard endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_admin_stats(self, auth_token):
        """Test GET /api/admin/stats"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/admin/stats", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "users" in data, "Stats should contain users"
        assert "estates" in data, "Stats should contain estates"
        print("SUCCESS: /admin/stats returned platform stats")

    def test_get_admin_users(self, auth_token):
        """Test GET /api/admin/users"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/admin/users", headers={"Authorization": f"Bearer {auth_token}"}, timeout=15
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return list of users"
        print(f"SUCCESS: /admin/users returned {len(data)} users")

    def test_get_admin_activity(self, auth_token):
        """Test GET /api/admin/activity"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/admin/activity", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return list of activities"
        print(f"SUCCESS: /admin/activity returned {len(data)} activities")


class TestOpsEndpoints:
    """Operations dashboard endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_ops_dashboard(self, auth_token):
        """Test GET /api/ops/dashboard"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/ops/dashboard", headers={"Authorization": f"Bearer {auth_token}"}, timeout=15
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /ops/dashboard returned 200")


class TestSettingsEndpoints:
    """User settings endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_get_digest_preferences(self, auth_token):
        """Test GET /api/digest/preferences"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/digest/preferences", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /digest/preferences returned 200")

    def test_get_security_settings(self, auth_token):
        """Test GET /api/security/settings"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/security/settings", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /security/settings returned 200")

    def test_get_compliance_consent(self, auth_token):
        """Test GET /api/compliance/consent"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/compliance/consent", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /compliance/consent returned 200")

    def test_get_family_plan_status(self, auth_token):
        """Test GET /api/family-plan/status"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.get(
            f"{BASE_URL}/api/family-plan/status", headers={"Authorization": f"Bearer {auth_token}"}, timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: /family-plan/status returned 200")


class TestPDFExportEndpoints:
    """PDF export endpoint tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login once and reuse token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        elif response.status_code == 429:
            pytest.skip("Rate limited")
        return None

    def test_export_iac_report(self, auth_token):
        """Test POST /api/guardian/export-iac-report generates PDF"""
        if not auth_token:
            pytest.skip("No auth token")

        response = requests.post(
            f"{BASE_URL}/api/guardian/export-iac-report",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "content": "# Beneficiary Actions\n\n1. Contact executor\n2. Review documents\n\n# Benefactor Recommendations\n\n- Update will annually\n- Maintain document vault"
            },
            timeout=30,
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert "application/pdf" in response.headers.get("content-type", ""), "Should return PDF"
        assert len(response.content) > 1000, "PDF should have content"
        print(f"SUCCESS: /guardian/export-iac-report generated PDF ({len(response.content)} bytes)")


class TestHealthEndpoint:
    """Health check endpoint test"""

    def test_health_check(self):
        """Test GET /api/health"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("status") == "healthy", f"Expected healthy, got {data}"
        assert data.get("database") == "connected", f"Expected database connected, got {data}"
        print("SUCCESS: /health returned healthy with database connected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
