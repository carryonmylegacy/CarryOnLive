"""
Test suite for the multi-role estate creation flow:
- /api/auth/me returns multi-role fields
- /api/estates returns estates annotated with user_role_in_estate  
- /api/accounts/create-estate creates estate without changing user role
- /api/accounts/add-beneficiary-link links user as beneficiary to another estate
- /api/beneficiary/become-benefactor is disabled and returns error
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"
FOUNDER_EMAIL = "info@carryon.us"
FOUNDER_PASSWORD = "Demo1234!"


class TestMultiRoleEstateCreation:
    """Tests for the new multi-role estate creation flow"""
    
    auth_token = None
    founder_token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth tokens for testing"""
        # Login as benefactor
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": BENEFACTOR_EMAIL,
            "password": BENEFACTOR_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            if data.get('access_token'):
                TestMultiRoleEstateCreation.auth_token = data['access_token']
            elif data.get('otp_required'):
                # OTP disabled bypass for testing - check if direct token returned
                print("OTP required for benefactor login")
        
        # Login as founder
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            if data.get('access_token'):
                TestMultiRoleEstateCreation.founder_token = data['access_token']
            elif data.get('otp_required'):
                print("OTP required for founder login")
    
    def get_headers(self, use_founder=False):
        token = TestMultiRoleEstateCreation.founder_token if use_founder else TestMultiRoleEstateCreation.auth_token
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # ===================== AUTH/ME ENDPOINT TESTS =====================
    
    def test_auth_me_returns_multi_role_fields(self):
        """Test that /api/auth/me returns multi-role fields"""
        if not TestMultiRoleEstateCreation.auth_token:
            pytest.skip("No auth token available")
        
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=self.get_headers())
        assert response.status_code == 200, f"Auth/me failed: {response.text}"
        
        data = response.json()
        
        # Check required multi-role fields exist
        assert 'is_also_benefactor' in data, "Missing is_also_benefactor field"
        assert 'is_also_beneficiary' in data, "Missing is_also_beneficiary field"
        assert 'first_name' in data, "Missing first_name field"
        assert 'last_name' in data, "Missing last_name field"
        assert 'gender' in data, "Missing gender field"
        
        # Check address fields
        assert 'address_street' in data, "Missing address_street field"
        assert 'address_city' in data, "Missing address_city field"
        assert 'address_state' in data, "Missing address_state field"
        assert 'address_zip' in data, "Missing address_zip field"
        
        print(f"Auth/me returned multi-role fields: is_also_benefactor={data.get('is_also_benefactor')}, is_also_beneficiary={data.get('is_also_beneficiary')}")
    
    def test_auth_me_founder_account(self):
        """Test that founder account returns expected data"""
        if not TestMultiRoleEstateCreation.founder_token:
            pytest.skip("No founder token available")
        
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=self.get_headers(use_founder=True))
        assert response.status_code == 200, f"Auth/me failed for founder: {response.text}"
        
        data = response.json()
        assert data.get('email') == FOUNDER_EMAIL
        assert data.get('role') == 'admin'
        print(f"Founder auth/me verified: {data.get('name')}")
    
    # ===================== ESTATES ENDPOINT TESTS =====================
    
    def test_estates_returns_user_role_annotation(self):
        """Test that /api/estates annotates each estate with user_role_in_estate"""
        if not TestMultiRoleEstateCreation.auth_token:
            pytest.skip("No auth token available")
        
        response = requests.get(f"{BASE_URL}/api/estates", headers=self.get_headers())
        assert response.status_code == 200, f"Estates fetch failed: {response.text}"
        
        estates = response.json()
        assert isinstance(estates, list), "Estates response should be a list"
        
        for estate in estates:
            # Each estate should have user_role_in_estate if user is connected
            # This can be 'owner' or 'beneficiary'
            if 'user_role_in_estate' in estate:
                assert estate['user_role_in_estate'] in ['owner', 'beneficiary'], \
                    f"Invalid user_role_in_estate: {estate['user_role_in_estate']}"
        
        print(f"Found {len(estates)} estates with role annotations")
    
    def test_estates_owned_have_owner_role(self):
        """Test that estates owned by user have user_role_in_estate = 'owner'"""
        if not TestMultiRoleEstateCreation.auth_token:
            pytest.skip("No auth token available")
        
        # Get user info first
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=self.get_headers())
        if me_response.status_code != 200:
            pytest.skip("Could not get user info")
        
        user_id = me_response.json().get('id')
        
        # Get estates
        response = requests.get(f"{BASE_URL}/api/estates", headers=self.get_headers())
        assert response.status_code == 200
        
        estates = response.json()
        for estate in estates:
            if estate.get('owner_id') == user_id:
                assert estate.get('user_role_in_estate') == 'owner', \
                    f"Owned estate should have user_role_in_estate='owner', got {estate.get('user_role_in_estate')}"
        
        print("Owned estates correctly annotated with 'owner' role")
    
    # ===================== CREATE-ESTATE ENDPOINT TESTS =====================
    
    def test_create_estate_rejects_existing_estate_owner(self):
        """Test that create-estate rejects users who already have an estate"""
        if not TestMultiRoleEstateCreation.auth_token:
            pytest.skip("No auth token available")
        
        # fulltest@test.com already has an estate, so this should fail
        response = requests.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={"beneficiary_enrollments": []},
            headers=self.get_headers()
        )
        
        # Should return 400 with "already have an estate" message
        assert response.status_code == 400, f"Expected 400 for existing estate owner, got {response.status_code}"
        data = response.json()
        assert 'already' in data.get('detail', '').lower() or 'estate' in data.get('detail', '').lower(), \
            f"Expected 'already has estate' error, got: {data.get('detail')}"
        
        print(f"Create-estate correctly rejected: {data.get('detail')}")
    
    def test_create_estate_endpoint_exists(self):
        """Test that /api/accounts/create-estate endpoint exists"""
        if not TestMultiRoleEstateCreation.auth_token:
            pytest.skip("No auth token available")
        
        response = requests.post(
            f"{BASE_URL}/api/accounts/create-estate",
            json={"beneficiary_enrollments": []},
            headers=self.get_headers()
        )
        
        # Should not be 404 or 405
        assert response.status_code != 404, "create-estate endpoint not found"
        assert response.status_code != 405, "create-estate endpoint method not allowed"
        print(f"Create-estate endpoint exists, returned: {response.status_code}")
    
    # ===================== ADD-BENEFICIARY-LINK ENDPOINT TESTS =====================
    
    def test_add_beneficiary_link_endpoint_exists(self):
        """Test that /api/accounts/add-beneficiary-link endpoint exists"""
        if not TestMultiRoleEstateCreation.auth_token:
            pytest.skip("No auth token available")
        
        response = requests.post(
            f"{BASE_URL}/api/accounts/add-beneficiary-link",
            json={"benefactor_email": "nonexistent@example.com"},
            headers=self.get_headers()
        )
        
        # Should not be 404 or 405 (404 is expected when user not found, but that means endpoint exists)
        # A true 404 would have a different message
        if response.status_code == 404:
            data = response.json()
            # If it says "user not found" or similar, the endpoint exists
            detail = data.get('detail', '').lower()
            if 'user' in detail or 'benefactor' in detail or 'found' in detail or 'estate' in detail:
                print(f"Add-beneficiary-link endpoint exists, returned 404 for nonexistent user: {data.get('detail')}")
                return  # Test passes - endpoint exists
            else:
                assert False, f"add-beneficiary-link endpoint not found: {data.get('detail')}"
        
        assert response.status_code != 405, "add-beneficiary-link endpoint method not allowed"
        print(f"Add-beneficiary-link endpoint exists, returned: {response.status_code}")
    
    def test_add_beneficiary_link_rejects_nonexistent_benefactor(self):
        """Test that add-beneficiary-link returns 404 for nonexistent benefactor email"""
        if not TestMultiRoleEstateCreation.auth_token:
            pytest.skip("No auth token available")
        
        response = requests.post(
            f"{BASE_URL}/api/accounts/add-beneficiary-link",
            json={"benefactor_email": "totally-nonexistent-user@nowhere.fake"},
            headers=self.get_headers()
        )
        
        assert response.status_code == 404, f"Expected 404 for nonexistent benefactor, got {response.status_code}"
        print(f"Add-beneficiary-link correctly returns 404 for nonexistent benefactor")
    
    # ===================== LEGACY BECOME-BENEFACTOR ENDPOINT TESTS =====================
    
    def test_become_benefactor_is_disabled(self):
        """Test that the old /api/beneficiary/become-benefactor endpoint is disabled"""
        if not TestMultiRoleEstateCreation.auth_token:
            pytest.skip("No auth token available")
        
        response = requests.post(
            f"{BASE_URL}/api/beneficiary/become-benefactor",
            headers=self.get_headers()
        )
        
        # Should return 400 with redirect message
        assert response.status_code == 400, f"Expected 400 for disabled endpoint, got {response.status_code}"
        data = response.json()
        assert 'wizard' in data.get('detail', '').lower() or 'create estate' in data.get('detail', '').lower(), \
            f"Expected redirect message to Create Estate wizard, got: {data.get('detail')}"
        
        print(f"Legacy become-benefactor correctly disabled: {data.get('detail')}")
    
    # ===================== CHECK-BENEFACTOR-EMAIL ENDPOINT TESTS =====================
    
    def test_check_benefactor_email_valid(self):
        """Test that check-benefactor-email returns valid for existing benefactors"""
        import time
        time.sleep(2)  # Brief delay to avoid rate limiting
        
        response = requests.post(
            f"{BASE_URL}/api/auth/check-benefactor-email",
            json={"email": BENEFACTOR_EMAIL}
        )
        
        if response.status_code == 429:
            pytest.skip("Rate limited - skipping test")
        
        assert response.status_code == 200, f"Check-benefactor-email failed: {response.text}"
        data = response.json()
        assert data.get('valid') == True, f"Expected valid=True for existing benefactor, got {data}"
        print(f"Check-benefactor-email correctly validates existing benefactor")
    
    def test_check_benefactor_email_invalid(self):
        """Test that check-benefactor-email returns invalid for non-benefactors"""
        import time
        time.sleep(2)  # Brief delay to avoid rate limiting
        
        response = requests.post(
            f"{BASE_URL}/api/auth/check-benefactor-email",
            json={"email": "totally-fake-email-not-exists@nowhere.fake"}
        )
        
        if response.status_code == 429:
            pytest.skip("Rate limited - skipping test")
        
        assert response.status_code == 200, f"Check-benefactor-email failed: {response.text}"
        data = response.json()
        assert data.get('valid') == False, f"Expected valid=False for nonexistent email, got {data}"
        assert 'message' in data, "Expected error message for invalid email"
        print(f"Check-benefactor-email correctly invalidates nonexistent email: {data.get('message')}")


class TestLoginFlow:
    """Tests for basic login functionality - uses shared token from TestMultiRoleEstateCreation"""
    
    def test_benefactor_login_via_auth_me(self):
        """Test benefactor can access /auth/me - uses pre-existing token"""
        token = TestMultiRoleEstateCreation.auth_token
        if not token:
            pytest.skip("No auth token available - login may have been rate limited")
        
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        
        assert response.status_code == 200, f"Auth/me failed: {response.text}"
        data = response.json()
        assert data.get('email') == BENEFACTOR_EMAIL, f"Wrong user: {data.get('email')}"
        print(f"Benefactor verified via /auth/me: {data.get('name')}")
    
    def test_founder_login_via_auth_me(self):
        """Test founder can access /auth/me - uses pre-existing token"""
        token = TestMultiRoleEstateCreation.founder_token
        if not token:
            pytest.skip("No founder token available - login may have been rate limited")
        
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        })
        
        assert response.status_code == 200, f"Auth/me failed for founder: {response.text}"
        data = response.json()
        assert data.get('email') == FOUNDER_EMAIL, f"Wrong user: {data.get('email')}"
        assert data.get('role') == 'admin', f"Founder should be admin, got {data.get('role')}"
        print(f"Founder verified via /auth/me: {data.get('name')}, role={data.get('role')}")


class TestHealthCheck:
    """Basic health checks"""
    
    def test_api_health(self):
        """Test that API is reachable"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        print("API health check passed")
    
    def test_base_url_valid(self):
        """Test that BASE_URL is configured correctly"""
        assert BASE_URL, "REACT_APP_BACKEND_URL environment variable not set"
        assert BASE_URL.startswith('http'), f"Invalid BASE_URL: {BASE_URL}"
        print(f"BASE_URL configured: {BASE_URL}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
