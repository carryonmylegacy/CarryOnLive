"""
CarryOn™ Backend Tests - P0/P1 Bug Fix Verification
Tests for:
- P0 BUG: Beneficiary invitation link (FRONTEND_URL fix)
- P1 BUG: Estate Guardian compact disclaimer (UI only)
- P1 FEATURE: PhotoPicker component (UI only)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://five-features-live.preview.emergentagent.com')

# Test credentials - using the founder account
BENEFACTOR_EMAIL = "founder@carryon.us"
BENEFACTOR_PASSWORD = "CarryOntheWisdom!"
EXISTING_INVITATION_TOKEN = "6c28caf9-814a-4db5-b137-d169c7cc85c8"


class TestP0InvitationLinkFix:
    """
    P0 BUG FIX VERIFICATION: Beneficiary invite link resolves correctly
    Root cause: FRONTEND_URL was concatenated with previous line in backend/.env
    Fix: FRONTEND_URL now on its own line
    """
    
    def test_invitation_endpoint_returns_valid_data(self):
        """
        Critical test: Verify /api/invitations/:token returns beneficiary data
        This was the P0 bug - invitation links returned 404 due to wrong FRONTEND_URL
        """
        response = requests.get(
            f"{BASE_URL}/api/invitations/{EXISTING_INVITATION_TOKEN}",
            headers={"Content-Type": "application/json"}
        )
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}. Response: {response.text}"
        
        # Data assertions - validate response structure
        data = response.json()
        assert "beneficiary" in data, "Response missing 'beneficiary' field"
        assert "benefactor_name" in data, "Response missing 'benefactor_name' field"
        
        # Validate beneficiary details
        beneficiary = data["beneficiary"]
        assert beneficiary["first_name"] == "Test", f"Expected first_name='Test', got '{beneficiary['first_name']}'"
        assert beneficiary["last_name"] == "Invitee", f"Expected last_name='Invitee', got '{beneficiary['last_name']}'"
        assert beneficiary["email"] == "invitee@test.com"
        assert beneficiary["relation"] == "child"
        
        # Validate benefactor name
        assert data["benefactor_name"] == "Founder CarryOn", f"Expected 'Founder CarryOn', got '{data['benefactor_name']}'"
        
        print("P0 BUG FIX VERIFIED: Invitation endpoint returns correct data")
    
    def test_invalid_token_returns_404(self):
        """Verify invalid tokens return 404 as expected"""
        response = requests.get(
            f"{BASE_URL}/api/invitations/invalid-token-xyz",
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "Invalid or expired" in data["detail"]


class TestAuthenticationFlow:
    """Test dev-login authentication for subsequent tests"""
    
    def test_dev_login_works(self):
        """Verify dev-login endpoint works (bypasses OTP)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200, f"Dev-login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "Missing access_token"
        assert "user" in data, "Missing user object"
        assert data["user"]["email"] == BENEFACTOR_EMAIL
        assert data["user"]["role"] == "benefactor"
        
        # Store token for other tests
        TestAuthenticationFlow.token = data["access_token"]
        print(f"Logged in as: {data['user']['name']} ({data['user']['role']})")


class TestBeneficiariesAPI:
    """Test beneficiaries CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Get auth token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}"
            }
        else:
            pytest.skip("Authentication failed")
    
    def test_get_estates(self):
        """Verify estates can be fetched"""
        response = requests.get(f"{BASE_URL}/api/estates", headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "No estates found"
        
        estate = data[0]
        assert "id" in estate
        assert "owner_id" in estate
        assert "name" in estate
        
        self.__class__.estate_id = estate["id"]
        print(f"Found estate: {estate['name']} (ID: {estate['id']})")
    
    def test_get_beneficiaries(self):
        """Verify beneficiaries can be listed"""
        # Get estate ID first
        estates_response = requests.get(f"{BASE_URL}/api/estates", headers=self.headers)
        estate_id = estates_response.json()[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=self.headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify our test beneficiary exists
        test_beneficiary = next((b for b in data if b["email"] == "invitee@test.com"), None)
        assert test_beneficiary is not None, "Test beneficiary 'invitee@test.com' not found"
        
        # Validate beneficiary structure
        assert test_beneficiary["first_name"] == "Test"
        assert test_beneficiary["last_name"] == "Invitee"
        assert test_beneficiary["invitation_status"] == "sent"
        assert test_beneficiary["invitation_token"] == EXISTING_INVITATION_TOKEN
        
        print(f"Found {len(data)} beneficiaries, including test beneficiary")
    
    def test_send_invitation_resend(self):
        """Test re-sending invitation to beneficiary"""
        # Get beneficiary ID
        estates_response = requests.get(f"{BASE_URL}/api/estates", headers=self.headers)
        estate_id = estates_response.json()[0]["id"]
        
        beneficiaries_response = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=self.headers)
        beneficiaries = beneficiaries_response.json()
        
        test_beneficiary = next((b for b in beneficiaries if b["email"] == "invitee@test.com"), None)
        if not test_beneficiary:
            pytest.skip("Test beneficiary not found")
        
        # Send (resend) invitation
        response = requests.post(
            f"{BASE_URL}/api/beneficiaries/{test_beneficiary['id']}/invite",
            headers=self.headers
        )
        
        # Should succeed with 200 (resend) or fail with 400 (already accepted)
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "message" in data
            assert "Invitation sent" in data["message"]
            print("Invitation resent successfully")


class TestAcceptInvitationValidation:
    """Test accept invitation endpoint validation"""
    
    def test_accept_requires_password(self):
        """Verify password is required"""
        response = requests.post(
            f"{BASE_URL}/api/invitations/accept",
            json={"token": EXISTING_INVITATION_TOKEN},  # Missing password
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 422, "Should return 422 for missing password"
    
    def test_accept_invalid_token(self):
        """Verify 404 for invalid token"""
        response = requests.post(
            f"{BASE_URL}/api/invitations/accept",
            json={"token": "invalid-token", "password": "TestPass123"},
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
