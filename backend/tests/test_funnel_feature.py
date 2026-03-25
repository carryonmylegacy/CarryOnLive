"""
Test suite for Social Media Campaign Acquisition Funnel feature.
Tests all funnel API endpoints and admin analytics.
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Admin credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    pytest.skip("Admin authentication failed - skipping admin tests")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


class TestFunnelStart:
    """Tests for POST /api/funnel/start endpoint"""

    def test_funnel_start_creates_session(self, api_client):
        """Test that funnel/start creates a new session and returns session_id"""
        response = api_client.post(
            f"{BASE_URL}/api/funnel/start",
            json={
                "utm_source": "instagram",
                "utm_medium": "social",
                "utm_campaign": "test_campaign_2026",
                "utm_content": "test_content",
                "utm_term": "estate planning",
                "referrer_url": "https://instagram.com",
                "landing_url": "https://carryon.us/get-started?utm_source=instagram",
            },
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        # Verify response structure
        assert "session_id" in data, "Response should contain session_id"
        assert "device_type" in data, "Response should contain device_type"
        assert "demographics" in data, "Response should contain demographics"

        # Verify session_id is a valid UUID
        try:
            uuid.UUID(data["session_id"])
        except ValueError:
            pytest.fail("session_id should be a valid UUID")

        # Verify device_type is one of expected values
        assert data["device_type"] in ["mobile", "tablet", "desktop"], f"Unexpected device_type: {data['device_type']}"

        print(f"✓ Funnel session created: {data['session_id'][:8]}... device={data['device_type']}")

    def test_funnel_start_without_utm_params(self, api_client):
        """Test that funnel/start works without UTM params"""
        response = api_client.post(f"{BASE_URL}/api/funnel/start", json={})

        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        print("✓ Funnel session created without UTM params")

    def test_funnel_start_returns_geo_data(self, api_client):
        """Test that funnel/start returns geo demographics"""
        response = api_client.post(f"{BASE_URL}/api/funnel/start", json={"utm_source": "facebook"})

        assert response.status_code == 200
        data = response.json()

        # Demographics should be a dict (may be empty if IP lookup fails)
        assert isinstance(data.get("demographics"), dict), "demographics should be a dict"
        print(f"✓ Geo data returned: {data.get('demographics')}")


class TestFunnelStep:
    """Tests for POST /api/funnel/step endpoint"""

    def test_funnel_step_records_interests(self, api_client):
        """Test recording Step 1 (interests) completion"""
        # First create a session
        start_resp = api_client.post(f"{BASE_URL}/api/funnel/start", json={})
        session_id = start_resp.json()["session_id"]

        # Record step 1
        response = api_client.post(
            f"{BASE_URL}/api/funnel/step",
            json={
                "session_id": session_id,
                "step": 1,
                "name": "interests",
                "selections": ["protect_family", "organize_docs", "plan_unexpected"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data.get("ok"), "Response should have ok=True"
        print(f"✓ Step 1 (interests) recorded for session {session_id[:8]}...")

    def test_funnel_step_records_family(self, api_client):
        """Test recording Step 2 (family) completion"""
        start_resp = api_client.post(f"{BASE_URL}/api/funnel/start", json={})
        session_id = start_resp.json()["session_id"]

        response = api_client.post(
            f"{BASE_URL}/api/funnel/step",
            json={
                "session_id": session_id,
                "step": 2,
                "name": "family",
                "selections": {
                    "familySize": "Family with kids",
                    "estateStatus": "Some documents",
                    "urgency": "Planning ahead",
                },
            },
        )

        assert response.status_code == 200
        assert response.json().get("ok")
        print(f"✓ Step 2 (family) recorded for session {session_id[:8]}...")

    def test_funnel_step_requires_session_id(self, api_client):
        """Test that step endpoint requires session_id"""
        response = api_client.post(
            f"{BASE_URL}/api/funnel/step", json={"step": 1, "name": "interests", "selections": ["protect_family"]}
        )

        # Should return 400 error
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Step endpoint validates session_id requirement")


class TestFunnelComplete:
    """Tests for POST /api/funnel/complete endpoint"""

    def test_funnel_complete_marks_session(self, api_client):
        """Test marking funnel as completed"""
        # Create session and complete steps
        start_resp = api_client.post(f"{BASE_URL}/api/funnel/start", json={})
        session_id = start_resp.json()["session_id"]

        # Complete the funnel
        response = api_client.post(
            f"{BASE_URL}/api/funnel/complete", json={"session_id": session_id, "referral_email": None}
        )

        assert response.status_code == 200
        assert response.json().get("ok")
        print(f"✓ Funnel marked complete for session {session_id[:8]}...")

    def test_funnel_complete_with_referral(self, api_client):
        """Test completing funnel with referral email"""
        start_resp = api_client.post(f"{BASE_URL}/api/funnel/start", json={})
        session_id = start_resp.json()["session_id"]

        response = api_client.post(
            f"{BASE_URL}/api/funnel/complete",
            json={"session_id": session_id, "referral_email": "test_referral@example.com"},
        )

        assert response.status_code == 200
        assert response.json().get("ok")
        print(f"✓ Funnel completed with referral email for session {session_id[:8]}...")

    def test_funnel_complete_requires_session_id(self, api_client):
        """Test that complete endpoint requires session_id"""
        response = api_client.post(f"{BASE_URL}/api/funnel/complete", json={"referral_email": "test@example.com"})

        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Complete endpoint validates session_id requirement")


class TestFunnelConvert:
    """Tests for POST /api/funnel/convert endpoint"""

    def test_funnel_convert_links_user(self, api_client):
        """Test linking funnel session to user"""
        # Create and complete a session
        start_resp = api_client.post(f"{BASE_URL}/api/funnel/start", json={})
        session_id = start_resp.json()["session_id"]

        api_client.post(f"{BASE_URL}/api/funnel/complete", json={"session_id": session_id})

        # Convert with a test user_id
        response = api_client.post(
            f"{BASE_URL}/api/funnel/convert",
            json={"session_id": session_id, "user_id": "test_user_" + str(uuid.uuid4())[:8]},
        )

        assert response.status_code == 200
        assert response.json().get("ok")
        print(f"✓ Funnel session converted for {session_id[:8]}...")

    def test_funnel_convert_requires_both_ids(self, api_client):
        """Test that convert requires both session_id and user_id"""
        # Missing user_id
        response = api_client.post(f"{BASE_URL}/api/funnel/convert", json={"session_id": "test-session"})
        assert response.status_code == 400, f"Expected 400 for missing user_id, got {response.status_code}"

        # Missing session_id
        response = api_client.post(f"{BASE_URL}/api/funnel/convert", json={"user_id": "test-user"})
        assert response.status_code == 400, f"Expected 400 for missing session_id, got {response.status_code}"

        print("✓ Convert endpoint validates required fields")


class TestFunnelAnalytics:
    """Tests for GET /api/admin/funnel/analytics endpoint"""

    def test_analytics_requires_auth(self, api_client):
        """Test that analytics endpoint requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/admin/funnel/analytics")

        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print("✓ Analytics endpoint requires authentication")

    def test_analytics_returns_data(self, api_client, admin_headers):
        """Test that analytics returns aggregated funnel data"""
        response = api_client.get(f"{BASE_URL}/api/admin/funnel/analytics", headers=admin_headers)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        # Verify all expected fields are present
        expected_fields = [
            "total_sessions",
            "completed",
            "converted",
            "completion_rate",
            "conversion_rate",
            "drop_offs",
            "by_source",
            "by_campaign",
            "by_device",
            "by_state",
            "by_interest",
            "referrals_sent",
            "recent_sessions",
        ]

        for field in expected_fields:
            assert field in data, f"Missing field: {field}"

        # Verify data types
        assert isinstance(data["total_sessions"], int)
        assert isinstance(data["completed"], int)
        assert isinstance(data["converted"], int)
        assert isinstance(data["completion_rate"], (int, float))
        assert isinstance(data["conversion_rate"], (int, float))
        assert isinstance(data["drop_offs"], dict)
        assert isinstance(data["by_source"], list)
        assert isinstance(data["by_campaign"], list)
        assert isinstance(data["by_device"], dict)
        assert isinstance(data["by_state"], list)
        assert isinstance(data["by_interest"], list)
        assert isinstance(data["referrals_sent"], int)
        assert isinstance(data["recent_sessions"], list)

        print(
            f"✓ Analytics returned: {data['total_sessions']} sessions, {data['completed']} completed, {data['converted']} converted"
        )
        print(f"  Completion rate: {data['completion_rate']}%, Conversion rate: {data['conversion_rate']}%")
        print(f"  Sources: {len(data['by_source'])}, Campaigns: {len(data['by_campaign'])}")
        print(f"  Referrals sent: {data['referrals_sent']}")


class TestFullFunnelFlow:
    """End-to-end test of complete funnel flow"""

    def test_complete_funnel_flow(self, api_client):
        """Test complete funnel flow from start to convert"""
        # Step 0: Start session with UTM params
        start_resp = api_client.post(
            f"{BASE_URL}/api/funnel/start",
            json={
                "utm_source": "test_e2e",
                "utm_medium": "pytest",
                "utm_campaign": "funnel_test_2026",
                "referrer_url": "https://pytest.org",
                "landing_url": "https://carryon.us/get-started?utm_source=test_e2e",
            },
        )
        assert start_resp.status_code == 200
        session_id = start_resp.json()["session_id"]
        print(f"✓ Session started: {session_id[:8]}...")

        # Step 1: Record interests
        step1_resp = api_client.post(
            f"{BASE_URL}/api/funnel/step",
            json={
                "session_id": session_id,
                "step": 1,
                "name": "interests",
                "selections": ["protect_family", "organize_docs"],
            },
        )
        assert step1_resp.status_code == 200
        print("✓ Step 1 (interests) completed")

        # Step 2: Record family info
        step2_resp = api_client.post(
            f"{BASE_URL}/api/funnel/step",
            json={
                "session_id": session_id,
                "step": 2,
                "name": "family",
                "selections": {
                    "familySize": "Partner + me",
                    "estateStatus": "Nothing planned yet",
                    "urgency": "Just exploring",
                },
            },
        )
        assert step2_resp.status_code == 200
        print("✓ Step 2 (family) completed")

        # Step 3: Record plan/features
        step3_resp = api_client.post(
            f"{BASE_URL}/api/funnel/step",
            json={
                "session_id": session_id,
                "step": 3,
                "name": "plan",
                "selections": {
                    "kept": ["vault", "messages"],
                    "decisions": {"vault": True, "messages": True, "guardian": False},
                },
            },
        )
        assert step3_resp.status_code == 200
        print("✓ Step 3 (plan) completed")

        # Step 4: CTA
        step4_resp = api_client.post(
            f"{BASE_URL}/api/funnel/step",
            json={"session_id": session_id, "step": 4, "name": "cta", "selections": {"action": "start_trial"}},
        )
        assert step4_resp.status_code == 200
        print("✓ Step 4 (CTA) completed")

        # Step 5: Referral + Complete
        complete_resp = api_client.post(
            f"{BASE_URL}/api/funnel/complete",
            json={"session_id": session_id, "referral_email": "e2e_test_referral@example.com"},
        )
        assert complete_resp.status_code == 200
        print("✓ Step 5 (referral) + funnel completed")

        # Convert (simulate signup)
        convert_resp = api_client.post(
            f"{BASE_URL}/api/funnel/convert",
            json={"session_id": session_id, "user_id": f"e2e_test_user_{uuid.uuid4().hex[:8]}"},
        )
        assert convert_resp.status_code == 200
        print("✓ Funnel converted (user signed up)")

        print(f"\n✓ FULL FUNNEL FLOW COMPLETED for session {session_id[:8]}...")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
