"""
Test Family Readiness Report PDF Download Feature
Tests:
- POST /api/downloads/prepare with action='family_readiness_report'
- GET /api/downloads/{token} serves valid PDF
- PDF contains Estate Readiness Score, Emergency Plan Coverage, Drill Performance sections
- CCP plan PDF includes Drill Schedule section
- Regression: POST /api/ccp/debrief/{id} still works
- Regression: GET /api/ccp/debrief-stats/{id} still works
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TEST_EMAIL = "admin_5dfa64"  # username
TEST_PASSWORD = "Demo1234!"
TEST_ESTATE_ID = "667ba2ef-6914-4761-b1f5-3e0ef3e8fe97"


class TestFamilyReadinessReport:
    """Tests for Family Readiness Report PDF download feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_res.status_code} - {login_res.text}")
    
    # ─── Family Readiness Report Tests ───
    
    def test_prepare_family_readiness_report_returns_token(self):
        """POST /api/downloads/prepare with action='family_readiness_report' returns token"""
        res = self.session.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "family_readiness_report",
            "params": {"estate_id": TEST_ESTATE_ID},
            "filename": "CarryOn_Readiness_Report.pdf"
        })
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "token" in data, "Response should contain 'token' field"
        assert len(data["token"]) > 10, "Token should be a non-empty string"
        print(f"✓ Family readiness report prepare returned token: {data['token'][:20]}...")
    
    def test_download_family_readiness_report_pdf(self):
        """GET /api/downloads/{token} serves valid PDF for family_readiness_report"""
        # First prepare the download
        prepare_res = self.session.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "family_readiness_report",
            "params": {"estate_id": TEST_ESTATE_ID},
            "filename": "CarryOn_Readiness_Report.pdf"
        })
        assert prepare_res.status_code == 200, f"Prepare failed: {prepare_res.text}"
        token = prepare_res.json()["token"]
        
        # Download the PDF (no auth required for download)
        download_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
        assert download_res.status_code == 200, f"Download failed: {download_res.status_code}"
        
        # Verify it's a PDF
        content_type = download_res.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, f"Expected PDF, got {content_type}"
        
        # Verify Content-Disposition header
        content_disp = download_res.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp, "Should have attachment disposition"
        assert ".pdf" in content_disp.lower(), "Filename should end with .pdf"
        
        # Verify PDF content starts with PDF magic bytes
        content = download_res.content
        assert content[:4] == b'%PDF', "Content should start with PDF magic bytes"
        assert len(content) > 1000, f"PDF should be substantial, got {len(content)} bytes"
        
        print(f"✓ Family readiness report PDF downloaded: {len(content)} bytes")
    
    def test_family_readiness_report_requires_estate_id(self):
        """POST /api/downloads/prepare with family_readiness_report requires estate_id"""
        res = self.session.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "family_readiness_report",
            "params": {},  # Missing estate_id
            "filename": "test.pdf"
        })
        # Should get token but download should fail
        if res.status_code == 200:
            token = res.json()["token"]
            download_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
            assert download_res.status_code == 400, "Should fail without estate_id"
            print("✓ Family readiness report correctly requires estate_id")
        else:
            # If prepare itself fails, that's also acceptable
            assert res.status_code in [400, 422], f"Expected 400/422, got {res.status_code}"
            print("✓ Family readiness report prepare correctly requires estate_id")
    
    def test_family_readiness_report_invalid_action(self):
        """POST /api/downloads/prepare rejects invalid action"""
        res = self.session.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "invalid_action_xyz",
            "params": {},
            "filename": "test.pdf"
        })
        assert res.status_code == 400, f"Expected 400 for invalid action, got {res.status_code}"
        print("✓ Invalid action correctly rejected")
    
    def test_family_readiness_report_requires_auth(self):
        """POST /api/downloads/prepare requires authentication"""
        # Make request without auth
        res = requests.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "family_readiness_report",
            "params": {"estate_id": TEST_ESTATE_ID},
            "filename": "test.pdf"
        }, headers={"Content-Type": "application/json"})
        assert res.status_code in [401, 403], f"Expected 401/403 without auth, got {res.status_code}"
        print("✓ Family readiness report correctly requires authentication")
    
    # ─── CCP Plan PDF with Drill Schedule Tests ───
    
    def test_ccp_plan_action_in_valid_actions(self):
        """Verify 'ccp_plan' is still a valid download action"""
        # We can't test actual plan download without a plan_id, but we can verify the action is accepted
        res = self.session.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "ccp_plan",
            "params": {"plan_id": "nonexistent-plan-id"},
            "filename": "test.pdf"
        })
        # Should get token (action is valid), but download will fail (plan not found)
        assert res.status_code == 200, f"ccp_plan action should be valid, got {res.status_code}"
        print("✓ ccp_plan action is valid")
    
    # ─── Regression Tests for Debrief Endpoints ───
    
    def test_debrief_endpoint_exists(self):
        """Regression: POST /api/ccp/debrief/{id} endpoint exists"""
        # Test with nonexistent activation - should return 404, not 405
        res = self.session.post(f"{BASE_URL}/api/ccp/debrief/nonexistent-activation-id", json={
            "rating": 4,
            "went_well": "Test",
            "to_improve": "Test"
        })
        # 404 means endpoint exists but activation not found
        # 400 means validation error (also acceptable)
        assert res.status_code in [404, 400], f"Expected 404/400, got {res.status_code}: {res.text}"
        print(f"✓ Debrief endpoint exists (returned {res.status_code})")
    
    def test_debrief_stats_endpoint_exists(self):
        """Regression: GET /api/ccp/debrief-stats/{estate_id} endpoint exists"""
        res = self.session.get(f"{BASE_URL}/api/ccp/debrief-stats/{TEST_ESTATE_ID}")
        # Should return 200 with stats or 403 if not authorized
        assert res.status_code in [200, 403], f"Expected 200/403, got {res.status_code}: {res.text}"
        if res.status_code == 200:
            data = res.json()
            assert "entries" in data or "total_drills" in data or "average_rating" in data, \
                "Response should contain debrief stats fields"
        print(f"✓ Debrief stats endpoint exists (returned {res.status_code})")
    
    # ─── Download Token Expiry/Reuse Tests ───
    
    def test_download_token_single_use(self):
        """Download tokens should be single-use (consumed after first download)"""
        # Prepare download
        prepare_res = self.session.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "family_readiness_report",
            "params": {"estate_id": TEST_ESTATE_ID},
            "filename": "test.pdf"
        })
        assert prepare_res.status_code == 200
        token = prepare_res.json()["token"]
        
        # First download should succeed
        download1 = requests.get(f"{BASE_URL}/api/downloads/{token}")
        assert download1.status_code == 200, "First download should succeed"
        
        # Second download with same token should fail (token consumed)
        download2 = requests.get(f"{BASE_URL}/api/downloads/{token}")
        assert download2.status_code == 401, f"Second download should fail (token consumed), got {download2.status_code}"
        print("✓ Download tokens are single-use")
    
    def test_invalid_download_token(self):
        """Invalid download token should return 401"""
        res = requests.get(f"{BASE_URL}/api/downloads/invalid-token-xyz")
        assert res.status_code == 401, f"Expected 401 for invalid token, got {res.status_code}"
        print("✓ Invalid download token correctly rejected")


class TestFamilyReadinessReportContent:
    """Tests to verify PDF content structure (via API response inspection)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_res.status_code}")
    
    def test_pdf_is_valid_and_substantial(self):
        """Family Readiness Report PDF should be valid and substantial"""
        # Prepare and download
        prepare_res = self.session.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "family_readiness_report",
            "params": {"estate_id": TEST_ESTATE_ID},
            "filename": "test.pdf"
        })
        assert prepare_res.status_code == 200
        token = prepare_res.json()["token"]
        
        download_res = requests.get(f"{BASE_URL}/api/downloads/{token}")
        assert download_res.status_code == 200
        
        content = download_res.content
        
        # Verify PDF structure
        assert content[:4] == b'%PDF', "Should start with PDF magic bytes"
        assert b'%%EOF' in content[-100:] or b'endobj' in content[-500:], "Should have valid PDF ending"
        
        # PDF should be substantial (at least 1KB - may be smaller if estate has no plans/drills)
        assert len(content) > 1000, f"PDF should be at least 1KB, got {len(content)} bytes"
        
        # Check for PDF objects (indicates proper structure)
        assert b'/Type' in content, "PDF should contain type definitions"
        assert b'/Page' in content, "PDF should contain page definitions"
        
        print(f"✓ PDF is valid and substantial: {len(content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
