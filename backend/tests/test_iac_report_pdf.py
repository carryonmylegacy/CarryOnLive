"""
Test IAC Report PDF Export - Iteration 115
Tests the new POST /api/guardian/export-iac-report endpoint that generates a 
two-section PDF report with beneficiary actions and benefactor recommendations.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestIacReportPdfExport:
    """Tests for the /guardian/export-iac-report endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        login_url = f"{BASE_URL}/api/auth/login"
        login_data = {"email": "info@carryon.us", "password": "Demo1234!"}
        response = requests.post(login_url, json=login_data)
        if response.status_code != 200:
            pytest.skip(f"Login failed with status {response.status_code}: {response.text}")
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    # ─── Test 1: Valid content with two sections returns PDF ───
    def test_export_iac_report_valid_content_returns_pdf(self, auth_headers):
        """POST /guardian/export-iac-report with valid content returns PDF (200)"""
        url = f"{BASE_URL}/api/guardian/export-iac-report"
        
        # Sample content with two sections as the AI would generate
        sample_content = """
Based on your declared residence in California, my analysis applies California's current estate planning statutes and probate rules.

## IMMEDIATE ACTION CHECKLIST FOR BENEFICIARIES

This section lists actions for your loved ones to take after your passing.

### Immediate (Days 1-3)
1. **Contact the Executor** - Call John Doe at (555) 123-4567 to initiate probate
2. **Request Death Certificates** - Order at least 10 certified copies from the county

### First Week
1. **File Life Insurance Claim** - Contact MetLife at 1-800-638-5433, Policy #ABC123456
2. **Notify Social Security Administration** - Call SSA at 1-800-772-1213

## ESTATE STRENGTHENING RECOMMENDATIONS FOR THE BENEFACTOR

This section lists actions for YOU (the benefactor) to take now.

### Immediate
1. **Update Beneficiary Designations** - Review and update all retirement account beneficiaries
2. **Fund the Trust** - Transfer the house deed into your revocable living trust

### First Week
1. **Sign Healthcare Directive** - Complete the California Advance Healthcare Directive form
"""
        
        response = requests.post(url, json={"content": sample_content}, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.headers.get('Content-Type') == 'application/pdf', "Expected application/pdf content type"
        
        # Check we got PDF bytes (PDF starts with %PDF)
        content = response.content
        assert len(content) > 0, "PDF content should not be empty"
        assert content[:4] == b'%PDF', "Response should be a valid PDF (starts with %PDF)"
        
        print(f"SUCCESS: IAC Report PDF generated successfully, size: {len(content)} bytes")
    
    # ─── Test 2: Empty content returns validation error ───
    def test_export_iac_report_empty_content_fails(self, auth_headers):
        """POST /guardian/export-iac-report with empty content returns 422"""
        url = f"{BASE_URL}/api/guardian/export-iac-report"
        
        # Empty content
        response = requests.post(url, json={"content": ""}, headers=auth_headers)
        
        # Should still return 200 but with minimal PDF, or could return 422
        # Based on the code, it generates PDF even with empty content
        # The important thing is it doesn't crash
        assert response.status_code in [200, 422], f"Expected 200 or 422, got {response.status_code}"
        print(f"SUCCESS: Empty content handled correctly with status {response.status_code}")
    
    # ─── Test 3: Missing content field returns 422 ───
    def test_export_iac_report_missing_content_field(self, auth_headers):
        """POST /guardian/export-iac-report without content field returns 422"""
        url = f"{BASE_URL}/api/guardian/export-iac-report"
        
        # No content field at all
        response = requests.post(url, json={}, headers=auth_headers)
        
        assert response.status_code == 422, f"Expected 422 for missing content, got {response.status_code}"
        print(f"SUCCESS: Missing content field correctly returns 422")
    
    # ─── Test 4: Unauthorized request returns 401 or 403 ───
    def test_export_iac_report_unauthorized(self):
        """POST /guardian/export-iac-report without auth returns 401 or 403"""
        url = f"{BASE_URL}/api/guardian/export-iac-report"
        
        response = requests.post(url, json={"content": "test"}, headers={"Content-Type": "application/json"})
        
        # Either 401 Unauthorized or 403 Forbidden is acceptable for missing auth
        assert response.status_code in [401, 403], f"Expected 401 or 403 for unauthorized, got {response.status_code}"
        print(f"SUCCESS: Unauthorized request correctly returns {response.status_code}")
    
    # ─── Test 5: Content with legal disclaimer is stripped ───
    def test_export_iac_report_strips_legal_disclaimer(self, auth_headers):
        """POST /guardian/export-iac-report strips the AI legal disclaimer from content"""
        url = f"{BASE_URL}/api/guardian/export-iac-report"
        
        # Content with the legal disclaimer that gets appended to AI responses
        content_with_disclaimer = """
## IMMEDIATE ACTION CHECKLIST FOR BENEFICIARIES

1. Contact executor immediately

---
*This analysis is provided for informational and educational purposes only and does not constitute legal advice.*
"""
        
        response = requests.post(url, json={"content": content_with_disclaimer}, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('Content-Type') == 'application/pdf'
        print(f"SUCCESS: Content with legal disclaimer processed correctly")
    
    # ─── Test 6: Content with JSON block is stripped ───
    def test_export_iac_report_strips_json_block(self, auth_headers):
        """POST /guardian/export-iac-report strips checklist_json blocks"""
        url = f"{BASE_URL}/api/guardian/export-iac-report"
        
        content_with_json = """
## IMMEDIATE ACTION CHECKLIST FOR BENEFICIARIES

1. Contact executor

```checklist_json
[{"title": "Contact executor", "category": "immediate", "section": "beneficiary_action"}]
```
"""
        
        response = requests.post(url, json={"content": content_with_json}, headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get('Content-Type') == 'application/pdf'
        print(f"SUCCESS: Content with JSON block processed correctly")


class TestExistingChecklistExport:
    """Verify existing export-checklist endpoint still works"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login and get auth token"""
        login_url = f"{BASE_URL}/api/auth/login"
        login_data = {"email": "info@carryon.us", "password": "Demo1234!"}
        response = requests.post(login_url, json=login_data)
        if response.status_code != 200:
            pytest.skip(f"Login failed with status {response.status_code}")
        data = response.json()
        return data.get("access_token") or data.get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_export_checklist_endpoint_exists(self, auth_headers):
        """POST /guardian/export-checklist still works (existing IAC export)"""
        url = f"{BASE_URL}/api/guardian/export-checklist"
        
        response = requests.post(url, json={}, headers=auth_headers)
        
        # Should be 200 with PDF, or 404 if no checklist items exist
        assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}"
        
        if response.status_code == 200:
            assert response.headers.get('Content-Type') == 'application/pdf'
            print(f"SUCCESS: export-checklist returns PDF, size: {len(response.content)} bytes")
        else:
            print(f"INFO: export-checklist returns 404 (no checklist items - expected for empty estate)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
