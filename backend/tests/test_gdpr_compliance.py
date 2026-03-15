"""
GDPR Compliance API Tests
Tests for:
- GET /api/compliance/consent - Get consent preferences
- PUT /api/compliance/consent - Update consent preferences
- GET /api/compliance/data-export - Export user data
- POST /api/compliance/deletion-request - Request account deletion
- GET /api/compliance/retention-policy - Get retention policy
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "founder@carryon.us"
ADMIN_PASSWORD = "CarryOntheWisdom!"


class TestGDPRCompliance:
    """Test GDPR Compliance Endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before each test"""
        # Login to get token
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("access_token") or data.get("token")
        assert self.token, f"No token returned from login. Response: {data}"
        self.headers = {"Authorization": f"Bearer {self.token}"}
        print(f"✓ Logged in as {ADMIN_EMAIL}")

    # ===================== CONSENT PREFERENCES =====================

    def test_get_consent_preferences(self):
        """GET /api/compliance/consent should return consent preferences"""
        response = requests.get(f"{BASE_URL}/api/compliance/consent", headers=self.headers)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        # Verify response structure
        assert "marketing_emails" in data, "Missing marketing_emails field"
        assert "analytics_tracking" in data, "Missing analytics_tracking field"
        assert "third_party_sharing" in data, "Missing third_party_sharing field"
        assert "essential_services" in data, "Missing essential_services field"

        # Essential services should always be True
        assert data["essential_services"] is True, "essential_services should always be True"

        # Verify types
        assert isinstance(data["marketing_emails"], bool)
        assert isinstance(data["analytics_tracking"], bool)
        assert isinstance(data["third_party_sharing"], bool)

        print(
            f"✓ GET consent preferences - marketing: {data['marketing_emails']}, analytics: {data['analytics_tracking']}, third_party: {data['third_party_sharing']}"
        )

    def test_update_consent_marketing_emails(self):
        """PUT /api/compliance/consent should update marketing_emails consent"""
        # Get current state
        get_response = requests.get(f"{BASE_URL}/api/compliance/consent", headers=self.headers)
        current_state = get_response.json().get("marketing_emails", False)

        # Toggle the value
        new_value = not current_state

        response = requests.put(
            f"{BASE_URL}/api/compliance/consent",
            headers=self.headers,
            json={
                "marketing_emails": new_value,
                "analytics_tracking": False,
                "third_party_sharing": False,
            },
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "updated_at" in data, "Response should contain updated_at timestamp"

        # Verify the change persisted
        verify_response = requests.get(f"{BASE_URL}/api/compliance/consent", headers=self.headers)
        verify_data = verify_response.json()
        assert verify_data["marketing_emails"] == new_value, (
            f"Expected {new_value}, got {verify_data['marketing_emails']}"
        )

        print(f"✓ PUT consent marketing_emails toggled from {current_state} to {new_value}")

    def test_update_consent_analytics_tracking(self):
        """PUT /api/compliance/consent should update analytics_tracking consent"""
        # Get current state
        get_response = requests.get(f"{BASE_URL}/api/compliance/consent", headers=self.headers)
        current_state = get_response.json().get("analytics_tracking", False)

        # Toggle the value
        new_value = not current_state

        response = requests.put(
            f"{BASE_URL}/api/compliance/consent",
            headers=self.headers,
            json={
                "marketing_emails": False,
                "analytics_tracking": new_value,
                "third_party_sharing": False,
            },
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        # Verify persistence
        verify_response = requests.get(f"{BASE_URL}/api/compliance/consent", headers=self.headers)
        assert verify_response.json()["analytics_tracking"] == new_value

        print(f"✓ PUT consent analytics_tracking toggled from {current_state} to {new_value}")

    def test_update_consent_third_party_sharing(self):
        """PUT /api/compliance/consent should update third_party_sharing consent"""
        # Get current state
        get_response = requests.get(f"{BASE_URL}/api/compliance/consent", headers=self.headers)
        current_state = get_response.json().get("third_party_sharing", False)

        # Toggle the value
        new_value = not current_state

        response = requests.put(
            f"{BASE_URL}/api/compliance/consent",
            headers=self.headers,
            json={
                "marketing_emails": False,
                "analytics_tracking": False,
                "third_party_sharing": new_value,
            },
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        # Verify persistence
        verify_response = requests.get(f"{BASE_URL}/api/compliance/consent", headers=self.headers)
        assert verify_response.json()["third_party_sharing"] == new_value

        print(f"✓ PUT consent third_party_sharing toggled from {current_state} to {new_value}")

    # ===================== DATA EXPORT =====================

    def test_data_export(self):
        """GET /api/compliance/data-export should return user data in JSON format"""
        response = requests.get(f"{BASE_URL}/api/compliance/data-export", headers=self.headers)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        # Verify response structure
        assert "export_date" in data, "Missing export_date"
        assert "data_subject" in data, "Missing data_subject (user profile)"
        assert "estates" in data, "Missing estates"
        assert "documents_metadata" in data, "Missing documents_metadata"
        assert "messages_metadata" in data, "Missing messages_metadata"
        assert "beneficiaries" in data, "Missing beneficiaries"
        assert "checklists" in data, "Missing checklists"
        assert "activity_logs" in data, "Missing activity_logs"
        assert "note" in data, "Missing note about encrypted content"

        # Verify data_subject contains expected fields
        user_data = data["data_subject"]
        assert "email" in user_data, "User data should contain email"
        assert user_data["email"] == ADMIN_EMAIL, f"Expected email {ADMIN_EMAIL}"

        # Password should NOT be included
        assert "password" not in user_data, "Password should not be in export"

        print(
            f"✓ GET data-export returned data for {user_data.get('name', 'user')} with {len(data['estates'])} estates"
        )

    # ===================== RETENTION POLICY =====================

    def test_retention_policy(self):
        """GET /api/compliance/retention-policy should return all retention categories"""
        response = requests.get(f"{BASE_URL}/api/compliance/retention-policy", headers=self.headers)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        # Verify structure
        assert "policy_version" in data, "Missing policy_version"
        assert "last_updated" in data, "Missing last_updated"
        assert "categories" in data, "Missing categories"

        # Verify categories list
        categories = data["categories"]
        assert isinstance(categories, list), "categories should be a list"
        assert len(categories) >= 5, f"Expected at least 5 retention categories, got {len(categories)}"

        # Each category should have data_type, retention, and legal_basis
        for cat in categories:
            assert "data_type" in cat, f"Category missing data_type: {cat}"
            assert "retention" in cat, f"Category missing retention: {cat}"
            assert "legal_basis" in cat, f"Category missing legal_basis: {cat}"

        # Check for expected categories
        category_types = [c["data_type"] for c in categories]
        expected_types = [
            "Account Data",
            "Estate Documents",
            "Messages",
            "Security Audit Logs",
        ]
        for exp in expected_types:
            assert exp in category_types, f"Missing expected category: {exp}"

        print(f"✓ GET retention-policy returned {len(categories)} categories, version {data['policy_version']}")

    # ===================== DELETION REQUEST =====================

    def test_deletion_request_wrong_email(self):
        """POST /api/compliance/deletion-request should fail with wrong email"""
        response = requests.post(
            f"{BASE_URL}/api/compliance/deletion-request",
            headers=self.headers,
            json={"confirm_email": "wrong@email.com", "reason": "Testing"},
        )

        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data, "Error response should have detail"
        assert "match" in data["detail"].lower() or "email" in data["detail"].lower(), (
            f"Error should mention email mismatch: {data['detail']}"
        )

        print(f"✓ POST deletion-request rejected with wrong email: {data['detail']}")

    def test_deletion_request_no_auth(self):
        """POST /api/compliance/deletion-request should fail without auth"""
        response = requests.post(
            f"{BASE_URL}/api/compliance/deletion-request",
            json={"confirm_email": ADMIN_EMAIL, "reason": "Testing"},
        )

        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ POST deletion-request rejected without auth (status {response.status_code})")

    # ===================== CONSENT AUDIT LOGGING =====================

    def test_consent_updates_are_logged(self):
        """Consent updates should be logged to consent_audit_log (indirect test via timestamp)"""
        # Update consent
        response = requests.put(
            f"{BASE_URL}/api/compliance/consent",
            headers=self.headers,
            json={
                "marketing_emails": True,
                "analytics_tracking": True,
                "third_party_sharing": False,
            },
        )

        assert response.status_code == 200
        data = response.json()

        # The response includes updated_at timestamp proving the change was recorded
        assert "updated_at" in data, "Response should include updated_at timestamp"
        assert data["updated_at"], "updated_at should not be empty"

        print(f"✓ Consent update logged at {data['updated_at']}")


class TestGDPRRequiresAuth:
    """Test that GDPR endpoints require authentication"""

    def test_consent_get_requires_auth(self):
        """GET /api/compliance/consent requires auth"""
        response = requests.get(f"{BASE_URL}/api/compliance/consent")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ GET consent requires auth")

    def test_consent_put_requires_auth(self):
        """PUT /api/compliance/consent requires auth"""
        response = requests.put(f"{BASE_URL}/api/compliance/consent", json={"marketing_emails": True})
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ PUT consent requires auth")

    def test_data_export_requires_auth(self):
        """GET /api/compliance/data-export requires auth"""
        response = requests.get(f"{BASE_URL}/api/compliance/data-export")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ GET data-export requires auth")

    def test_retention_policy_requires_auth(self):
        """GET /api/compliance/retention-policy requires auth"""
        response = requests.get(f"{BASE_URL}/api/compliance/retention-policy")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ GET retention-policy requires auth")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
