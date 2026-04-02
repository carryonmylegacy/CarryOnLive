"""
Test suite for Universal Download Proxy (iOS PWA-compatible downloads)

Tests:
- POST /api/downloads/prepare — Creates download tokens (requires auth)
- GET /api/downloads/{token} — Serves files (validates token, one-time use)
- CCP plan PDF generation via download proxy
- Invalid action validation
- Token expiration and consumption
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestDownloadProxy:
    """Tests for the universal download proxy system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        self.token = None
        self.estate_id = None
        self.plan_id = None
        
        # Login
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if res.status_code == 200:
            data = res.json()
            self.token = data.get("access_token") or data.get("token")
        
        if not self.token:
            pytest.skip("Authentication failed - skipping download proxy tests")
        
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        # Get estate ID for CCP tests
        estates_res = requests.get(f"{BASE_URL}/api/estates", headers=self.headers)
        if estates_res.status_code == 200 and estates_res.json():
            self.estate_id = estates_res.json()[0].get("id")
    
    # ─── POST /api/downloads/prepare Tests ───
    
    def test_prepare_download_requires_auth(self):
        """POST /downloads/prepare should require authentication"""
        res = requests.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "document",
            "params": {"document_id": "test123"},
            "filename": "test.pdf"
        })
        assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"
        print("✓ POST /downloads/prepare requires auth (401/403 without token)")
    
    def test_prepare_download_valid_action(self):
        """POST /downloads/prepare with valid action returns token"""
        res = requests.post(f"{BASE_URL}/api/downloads/prepare", 
            headers=self.headers,
            json={
                "action": "document",
                "params": {"document_id": "test123"},
                "filename": "test.pdf"
            }
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "token" in data, "Response should contain 'token'"
        assert len(data["token"]) > 10, "Token should be a valid UUID"
        print(f"✓ POST /downloads/prepare returns token: {data['token'][:8]}...")
    
    def test_prepare_download_invalid_action(self):
        """POST /downloads/prepare with invalid action returns 400"""
        res = requests.post(f"{BASE_URL}/api/downloads/prepare",
            headers=self.headers,
            json={
                "action": "invalid_action_xyz",
                "params": {},
                "filename": "test.pdf"
            }
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}: {res.text}"
        print("✓ POST /downloads/prepare rejects invalid action (400)")
    
    def test_prepare_download_all_valid_actions(self):
        """POST /downloads/prepare accepts all valid action types"""
        valid_actions = [
            "message_pdf",
            "message_video",
            "message_voice",
            "document",
            "ega_checklist",
            "ega_todo",
            "ega_iac_report",
            "ega_transcript",
            "ega_plan",
            "beneficiary_iac",
            "ect_file",
            "ccp_plan",
        ]
        
        for action in valid_actions:
            res = requests.post(f"{BASE_URL}/api/downloads/prepare",
                headers=self.headers,
                json={
                    "action": action,
                    "params": {},
                    "filename": f"test_{action}.pdf"
                }
            )
            assert res.status_code == 200, f"Action '{action}' failed: {res.status_code} - {res.text}"
            assert "token" in res.json(), f"Action '{action}' should return token"
        
        print(f"✓ All {len(valid_actions)} valid actions accepted")
    
    # ─── GET /api/downloads/{token} Tests ───
    
    def test_download_invalid_token(self):
        """GET /downloads/{token} with invalid token returns 401"""
        res = requests.get(f"{BASE_URL}/api/downloads/invalid-token-12345")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("✓ GET /downloads/{invalid_token} returns 401")
    
    def test_download_token_one_time_use(self):
        """Download token should be consumed after first use"""
        # Create a token for ega_checklist (doesn't require specific params)
        prepare_res = requests.post(f"{BASE_URL}/api/downloads/prepare",
            headers=self.headers,
            json={
                "action": "ega_checklist",
                "params": {},
                "filename": "checklist.pdf"
            }
        )
        assert prepare_res.status_code == 200
        token = prepare_res.json()["token"]
        
        # First request - may succeed or fail based on data availability
        first_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
        first_status = first_res.status_code
        
        # Second request with same token should ALWAYS fail (token consumed)
        second_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
        assert second_res.status_code == 401, f"Second request should fail with 401, got {second_res.status_code}"
        
        print(f"✓ Token is one-time use (first: {first_status}, second: 401)")
    
    # ─── CCP Plan PDF Tests ───
    
    def test_ccp_plan_prepare_requires_plan_id(self):
        """CCP plan download requires plan_id in params"""
        # First create a token without plan_id
        prepare_res = requests.post(f"{BASE_URL}/api/downloads/prepare",
            headers=self.headers,
            json={
                "action": "ccp_plan",
                "params": {},  # Missing plan_id
                "filename": "plan.pdf"
            }
        )
        assert prepare_res.status_code == 200  # Token creation succeeds
        token = prepare_res.json()["token"]
        
        # But download should fail with 400 (plan_id required)
        download_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
        assert download_res.status_code == 400, f"Expected 400 for missing plan_id, got {download_res.status_code}"
        print("✓ CCP plan download requires plan_id (400 without it)")
    
    def test_ccp_plan_download_nonexistent_plan(self):
        """CCP plan download with nonexistent plan_id returns 404"""
        prepare_res = requests.post(f"{BASE_URL}/api/downloads/prepare",
            headers=self.headers,
            json={
                "action": "ccp_plan",
                "params": {"plan_id": "nonexistent-plan-id-12345"},
                "filename": "plan.pdf"
            }
        )
        assert prepare_res.status_code == 200
        token = prepare_res.json()["token"]
        
        download_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
        assert download_res.status_code == 404, f"Expected 404 for nonexistent plan, got {download_res.status_code}"
        print("✓ CCP plan download returns 404 for nonexistent plan")
    
    def test_ccp_plan_full_flow(self):
        """Full CCP plan creation and download flow"""
        if not self.estate_id:
            pytest.skip("No estate available for CCP plan test")
        
        # 1. Create a CCP plan
        plan_data = {
            "estate_id": self.estate_id,
            "name": "Test Emergency Plan",
            "plan_type": "natural_disaster",
            "rendezvous_points": [
                {"name": "Primary Location", "address": "123 Main St", "notes": "Meet here first"}
            ],
            "communication_plan": "Call each family member in order",
            "resource_locations": [
                {"name": "Emergency Kit", "location": "Garage shelf", "notes": "Contains water and food"}
            ],
            "instructions": "Step 1: Stay calm. Step 2: Follow the plan."
        }
        
        create_res = requests.post(f"{BASE_URL}/api/ccp/plans", 
            headers=self.headers,
            json=plan_data
        )
        
        if create_res.status_code != 200:
            # Plan creation might fail if user doesn't own estate
            print(f"⚠ CCP plan creation returned {create_res.status_code} - skipping full flow test")
            pytest.skip("Cannot create CCP plan - user may not own estate")
        
        plan = create_res.json()
        self.plan_id = plan.get("id")
        assert self.plan_id, "Plan should have an ID"
        
        # 2. Prepare download token
        prepare_res = requests.post(f"{BASE_URL}/api/downloads/prepare",
            headers=self.headers,
            json={
                "action": "ccp_plan",
                "params": {"plan_id": self.plan_id},
                "filename": f"CCP_Test_Plan.pdf"
            }
        )
        assert prepare_res.status_code == 200
        token = prepare_res.json()["token"]
        
        # 3. Download the PDF
        download_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
        assert download_res.status_code == 200, f"Expected 200, got {download_res.status_code}: {download_res.text}"
        assert download_res.headers.get("content-type") == "application/pdf", "Should return PDF"
        assert "attachment" in download_res.headers.get("content-disposition", ""), "Should have attachment disposition"
        assert len(download_res.content) > 100, "PDF should have content"
        
        # 4. Cleanup - delete the plan
        requests.delete(f"{BASE_URL}/api/ccp/plans/{self.plan_id}", headers=self.headers)
        
        print("✓ Full CCP plan creation → download flow works")
    
    # ─── Document Download Tests ───
    
    def test_document_download_nonexistent(self):
        """Document download with nonexistent ID returns appropriate error"""
        prepare_res = requests.post(f"{BASE_URL}/api/downloads/prepare",
            headers=self.headers,
            json={
                "action": "document",
                "params": {"document_id": "nonexistent-doc-id-12345"},
                "filename": "doc.pdf"
            }
        )
        assert prepare_res.status_code == 200
        token = prepare_res.json()["token"]
        
        download_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
        # Should return 404 or 500 (document not found)
        assert download_res.status_code in [404, 500], f"Expected 404/500, got {download_res.status_code}"
        print(f"✓ Document download returns {download_res.status_code} for nonexistent doc")
    
    # ─── Message PDF Download Tests ───
    
    def test_message_pdf_download_nonexistent(self):
        """Message PDF download with nonexistent ID returns appropriate error"""
        prepare_res = requests.post(f"{BASE_URL}/api/downloads/prepare",
            headers=self.headers,
            json={
                "action": "message_pdf",
                "params": {"message_id": "nonexistent-msg-id-12345"},
                "filename": "message.pdf"
            }
        )
        assert prepare_res.status_code == 200
        token = prepare_res.json()["token"]
        
        download_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
        # Should return 404 or 500 (message not found)
        assert download_res.status_code in [404, 500], f"Expected 404/500, got {download_res.status_code}"
        print(f"✓ Message PDF download returns {download_res.status_code} for nonexistent message")


class TestDownloadTokenService:
    """Tests for the download token service internals"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if res.status_code == 200:
            data = res.json()
            self.token = data.get("access_token") or data.get("token")
        else:
            pytest.skip("Authentication failed")
        
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_token_format(self):
        """Token should be a valid UUID format"""
        res = requests.post(f"{BASE_URL}/api/downloads/prepare",
            headers=self.headers,
            json={"action": "document", "params": {}, "filename": "test.pdf"}
        )
        assert res.status_code == 200
        token = res.json()["token"]
        
        # UUID format: 8-4-4-4-12 hex characters
        import re
        uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        assert re.match(uuid_pattern, token), f"Token should be UUID format: {token}"
        print(f"✓ Token is valid UUID format: {token}")
    
    def test_multiple_tokens_unique(self):
        """Each token request should generate a unique token"""
        tokens = []
        for _ in range(5):
            res = requests.post(f"{BASE_URL}/api/downloads/prepare",
                headers=self.headers,
                json={"action": "document", "params": {}, "filename": "test.pdf"}
            )
            assert res.status_code == 200
            tokens.append(res.json()["token"])
        
        assert len(set(tokens)) == 5, "All tokens should be unique"
        print("✓ Multiple token requests generate unique tokens")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
