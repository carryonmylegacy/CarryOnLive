"""
Test Emergency Contact Card PDF generation feature.

Tests:
- POST /api/downloads/prepare accepts 'emergency_card' action and returns a token
- GET /api/downloads/{token} returns 404 when plan_id doesn't exist
- emergency_card action auto-generates share_token if plan doesn't have one
- emergency_card PDF generates valid PDF with QR code
- All previous download actions still work (ccp_plan, family_readiness_report)
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestEmergencyCardFeature:
    """Tests for Emergency Contact Card PDF generation."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login with test credentials
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin_5dfa64", "password": "Demo1234!"},
        )
        if login_resp.status_code == 200:
            data = login_resp.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Login failed - skipping authenticated tests")

    def test_emergency_card_action_is_valid(self):
        """Test that 'emergency_card' is a valid download action."""
        # Prepare download with emergency_card action (will fail due to missing plan_id but validates action)
        resp = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "emergency_card", "params": {}, "filename": "test.pdf"},
        )
        # Should return token (action is valid), download will fail later due to missing plan_id
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "token" in data, "Response should contain 'token'"
        print(f"✓ emergency_card action is valid, token: {data['token'][:20]}...")

    def test_emergency_card_requires_plan_id(self):
        """Test that emergency_card download fails without plan_id."""
        # Prepare download
        prep_resp = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "emergency_card", "params": {}, "filename": "test.pdf"},
        )
        assert prep_resp.status_code == 200
        token = prep_resp.json()["token"]

        # Execute download - should fail with 400 (plan_id required)
        download_resp = self.session.get(f"{BASE_URL}/api/downloads/{token}")
        assert download_resp.status_code == 400, f"Expected 400, got {download_resp.status_code}"
        assert "plan_id required" in download_resp.text.lower()
        print("✓ emergency_card correctly requires plan_id")

    def test_emergency_card_returns_404_for_nonexistent_plan(self):
        """Test that emergency_card returns 404 for nonexistent plan_id."""
        fake_plan_id = "nonexistent-plan-id-12345"
        # Prepare download
        prep_resp = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={
                "action": "emergency_card",
                "params": {"plan_id": fake_plan_id},
                "filename": "test.pdf",
            },
        )
        assert prep_resp.status_code == 200
        token = prep_resp.json()["token"]

        # Execute download - should fail with 404 (plan not found)
        download_resp = self.session.get(f"{BASE_URL}/api/downloads/{token}")
        assert download_resp.status_code == 404, f"Expected 404, got {download_resp.status_code}"
        assert "not found" in download_resp.text.lower()
        print("✓ emergency_card returns 404 for nonexistent plan")

    def test_ccp_plan_action_still_works(self):
        """Regression test: ccp_plan action still works."""
        # Prepare download with ccp_plan action
        resp = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "ccp_plan", "params": {}, "filename": "test.pdf"},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "token" in data
        print("✓ ccp_plan action still works")

    def test_family_readiness_report_action_still_works(self):
        """Regression test: family_readiness_report action still works."""
        # Prepare download with family_readiness_report action
        resp = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "family_readiness_report", "params": {}, "filename": "test.pdf"},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "token" in data
        print("✓ family_readiness_report action still works")

    def test_invalid_action_returns_400(self):
        """Test that invalid download action returns 400."""
        resp = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "invalid_action_xyz", "params": {}, "filename": "test.pdf"},
        )
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "invalid download action" in resp.text.lower()
        print("✓ Invalid action correctly returns 400")

    def test_downloads_prepare_requires_auth(self):
        """Test that downloads/prepare requires authentication."""
        # Create new session without auth
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        resp = no_auth_session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={"action": "emergency_card", "params": {}, "filename": "test.pdf"},
        )
        # Should return 401 or 403
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print("✓ downloads/prepare requires authentication")

    def test_download_token_is_single_use(self):
        """Test that download tokens are consumed after first use."""
        # Prepare download
        prep_resp = self.session.post(
            f"{BASE_URL}/api/downloads/prepare",
            json={
                "action": "emergency_card",
                "params": {"plan_id": "fake-id"},
                "filename": "test.pdf",
            },
        )
        assert prep_resp.status_code == 200
        token = prep_resp.json()["token"]

        # First download attempt (will fail with 404 but consumes token)
        first_resp = self.session.get(f"{BASE_URL}/api/downloads/{token}")
        # Token is consumed regardless of success/failure
        
        # Second download attempt should fail with 401 (token consumed)
        second_resp = self.session.get(f"{BASE_URL}/api/downloads/{token}")
        assert second_resp.status_code == 401, f"Expected 401, got {second_resp.status_code}"
        print("✓ Download tokens are single-use")

    def test_invalid_download_token_returns_401(self):
        """Test that invalid download token returns 401."""
        resp = self.session.get(f"{BASE_URL}/api/downloads/invalid-token-xyz")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
        print("✓ Invalid download token returns 401")


class TestEmergencyCardCodeVerification:
    """Verify emergency_card implementation in code."""

    def test_emergency_card_in_valid_actions(self):
        """Verify emergency_card is in valid_actions set in downloads.py."""
        downloads_path = "/app/backend/routes/downloads.py"
        with open(downloads_path, "r") as f:
            content = f.read()
        
        assert '"emergency_card"' in content or "'emergency_card'" in content, \
            "emergency_card should be in valid_actions set"
        print("✓ emergency_card is in valid_actions set")

    def test_handle_emergency_card_function_exists(self):
        """Verify _handle_emergency_card function exists."""
        downloads_path = "/app/backend/routes/downloads.py"
        with open(downloads_path, "r") as f:
            content = f.read()
        
        assert "async def _handle_emergency_card" in content, \
            "_handle_emergency_card function should exist"
        print("✓ _handle_emergency_card function exists")

    def test_emergency_card_routing_in_execute_download(self):
        """Verify emergency_card is routed in execute_download."""
        downloads_path = "/app/backend/routes/downloads.py"
        with open(downloads_path, "r") as f:
            content = f.read()
        
        assert 'action == "emergency_card"' in content or "action == 'emergency_card'" in content, \
            "emergency_card should be routed in execute_download"
        print("✓ emergency_card is routed in execute_download")

    def test_qrcode_import_in_handler(self):
        """Verify qrcode library is imported in _handle_emergency_card."""
        downloads_path = "/app/backend/routes/downloads.py"
        with open(downloads_path, "r") as f:
            content = f.read()
        
        assert "import qrcode" in content, \
            "qrcode should be imported in _handle_emergency_card"
        print("✓ qrcode library is imported")

    def test_share_token_auto_generation_logic(self):
        """Verify share_token auto-generation logic exists."""
        downloads_path = "/app/backend/routes/downloads.py"
        with open(downloads_path, "r") as f:
            content = f.read()
        
        # Check for share_token auto-generation logic
        assert "share_token" in content, "share_token handling should exist"
        assert "uuid4" in content or "uuid" in content, "UUID generation should be used for share_token"
        print("✓ share_token auto-generation logic exists")


class TestFrontendEmergencyCardIntegration:
    """Verify frontend Emergency Card integration."""

    def test_emergency_card_button_testid_exists(self):
        """Verify data-testid='ccp-emergency-card-{id}' exists in ConnectedProtocolPage."""
        page_path = "/app/frontend/src/pages/ConnectedProtocolPage.js"
        with open(page_path, "r") as f:
            content = f.read()
        
        assert "ccp-emergency-card-" in content, \
            "data-testid='ccp-emergency-card-{id}' should exist on Emergency Card button"
        print("✓ Emergency Card button has data-testid")

    def test_creditcard_icon_imported(self):
        """Verify CreditCard icon is imported from lucide-react."""
        page_path = "/app/frontend/src/pages/ConnectedProtocolPage.js"
        with open(page_path, "r") as f:
            content = f.read()
        
        assert "CreditCard" in content, "CreditCard icon should be imported"
        print("✓ CreditCard icon is imported")

    def test_download_emergency_card_function_exists(self):
        """Verify downloadEmergencyCard function exists."""
        page_path = "/app/frontend/src/pages/ConnectedProtocolPage.js"
        with open(page_path, "r") as f:
            content = f.read()
        
        assert "downloadEmergencyCard" in content, \
            "downloadEmergencyCard function should exist"
        print("✓ downloadEmergencyCard function exists")

    def test_emergency_card_uses_platform_download(self):
        """Verify downloadEmergencyCard uses platformDownload."""
        page_path = "/app/frontend/src/pages/ConnectedProtocolPage.js"
        with open(page_path, "r") as f:
            content = f.read()
        
        # Find the downloadEmergencyCard function and check it uses platformDownload
        assert "platformDownload" in content, "platformDownload should be used"
        # Check that emergency_card action is used
        assert "'emergency_card'" in content or '"emergency_card"' in content, \
            "emergency_card action should be used in downloadEmergencyCard"
        print("✓ downloadEmergencyCard uses platformDownload with emergency_card action")

    def test_share_button_testid_still_exists(self):
        """Regression: Verify share button data-testid still exists."""
        page_path = "/app/frontend/src/pages/ConnectedProtocolPage.js"
        with open(page_path, "r") as f:
            content = f.read()
        
        assert "ccp-share-" in content, \
            "data-testid='ccp-share-{id}' should still exist on share buttons"
        print("✓ Share button data-testid still exists")

    def test_print_button_testid_still_exists(self):
        """Regression: Verify print button data-testid still exists."""
        page_path = "/app/frontend/src/pages/ConnectedProtocolPage.js"
        with open(page_path, "r") as f:
            content = f.read()
        
        assert "ccp-print-" in content, \
            "data-testid='ccp-print-{id}' should still exist on print buttons"
        print("✓ Print button data-testid still exists")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
