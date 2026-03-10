"""
Test Suite: Multi-role user features for CarryOn estate planning
Tests login, /auth/me, /health, /debug/user-state endpoints
Focus: is_also_benefactor and is_also_beneficiary flags for multi-role users
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from problem statement
TEST_EMAIL = "fulltest@test.com"
TEST_PASSWORD = "Password.123"
ESTATE_ID = "9a560550-c664-4d84-897f-33628442b8c5"


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_returns_200(self):
        """Health endpoint should return 200 with build hash"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        print(f"Health response: {data}")
        
    def test_health_contains_build_hash(self):
        """Health endpoint should include build hash"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert "build" in data, "Response should contain 'build' field"
        assert data["build"], "Build hash should not be empty"
        print(f"Build hash: {data['build']}")


class TestLoginFlow:
    """Login endpoint tests for multi-role users"""
    
    def test_login_returns_token(self):
        """Login with trust token should return access_token directly (OTP bypassed)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        print(f"Login response keys: {list(data.keys())}")
        
        # Should return token directly due to trust token (OTP bypassed)
        assert "access_token" in data, f"Expected access_token in response, got: {data}"
        assert data["access_token"], "access_token should not be empty"
        
    def test_login_returns_user_with_multi_role_flags(self):
        """Login should return user object with is_also_benefactor and is_also_beneficiary"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "user" in data, f"Response should contain 'user' field, got: {list(data.keys())}"
        user = data["user"]
        
        # Verify multi-role flags are present
        assert "is_also_benefactor" in user, f"User should have is_also_benefactor, got: {list(user.keys())}"
        assert "is_also_beneficiary" in user, f"User should have is_also_beneficiary, got: {list(user.keys())}"
        
        print(f"User role: {user.get('role')}")
        print(f"is_also_benefactor: {user.get('is_also_benefactor')}")
        print(f"is_also_beneficiary: {user.get('is_also_beneficiary')}")
        
    def test_login_is_also_benefactor_true(self):
        """For fulltest@test.com, is_also_benefactor should be true"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        user = data["user"]
        
        # According to problem statement, this should be true
        assert user.get("is_also_benefactor") is True, \
            f"Expected is_also_benefactor=True, got {user.get('is_also_benefactor')}"


class TestAuthMeEndpoint:
    """Test /api/auth/me endpoint for multi-role flags"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for test user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200 and "access_token" in response.json():
            return response.json()["access_token"]
        pytest.skip("Could not get auth token - login may require OTP")
        
    def test_auth_me_returns_200(self, auth_token):
        """/auth/me should return 200 with valid token"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
    def test_auth_me_has_multi_role_fields(self, auth_token):
        """/auth/me should return is_also_benefactor and is_also_beneficiary fields"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "is_also_benefactor" in data, f"Should have is_also_benefactor, got: {list(data.keys())}"
        assert "is_also_beneficiary" in data, f"Should have is_also_beneficiary, got: {list(data.keys())}"
        
        print(f"/auth/me response: is_also_benefactor={data['is_also_benefactor']}, is_also_beneficiary={data['is_also_beneficiary']}")
        
    def test_auth_me_is_also_benefactor_true(self, auth_token):
        """/auth/me should return is_also_benefactor=true for this test user"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("is_also_benefactor") is True, \
            f"Expected is_also_benefactor=True, got {data.get('is_also_benefactor')}"


class TestDebugUserStateEndpoint:
    """Test /api/debug/user-state diagnostic endpoint"""
    
    def test_debug_user_state_returns_data(self):
        """Debug endpoint should return diagnostic data for user"""
        response = requests.get(f"{BASE_URL}/api/debug/user-state?email={TEST_EMAIL}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Should not return error
        assert "error" not in data, f"Got error: {data.get('error')}"
        
        print(f"Debug user-state response: {data}")
        
    def test_debug_user_state_has_build_hash(self):
        """Debug endpoint should include build hash for cache-busting verification"""
        response = requests.get(f"{BASE_URL}/api/debug/user-state?email={TEST_EMAIL}")
        assert response.status_code == 200
        data = response.json()
        
        assert "build" in data, f"Should have build hash, got: {list(data.keys())}"
        print(f"Build hash in debug: {data['build']}")
        
    def test_debug_user_state_has_multi_role_fields(self):
        """Debug endpoint should show multi-role state"""
        response = requests.get(f"{BASE_URL}/api/debug/user-state?email={TEST_EMAIL}")
        assert response.status_code == 200
        data = response.json()
        
        expected_fields = ["db_is_also_benefactor", "db_is_also_beneficiary", 
                         "owns_estates", "computed_is_also_benefactor"]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
            
        print(f"Multi-role state: db_is_also_benefactor={data.get('db_is_also_benefactor')}, "
              f"owns_estates={data.get('owns_estates')}, computed={data.get('computed_is_also_benefactor')}")
              
    def test_debug_user_state_computed_benefactor_true(self):
        """computed_is_also_benefactor should be true for user with estates"""
        response = requests.get(f"{BASE_URL}/api/debug/user-state?email={TEST_EMAIL}")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("computed_is_also_benefactor") is True, \
            f"Expected computed_is_also_benefactor=True, got {data.get('computed_is_also_benefactor')}"


class TestBeneficiariesEndpoint:
    """Test beneficiaries endpoint for estate"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for test user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200 and "access_token" in response.json():
            return response.json()["access_token"]
        pytest.skip("Could not get auth token")
        
    def test_beneficiaries_endpoint_exists(self, auth_token):
        """Beneficiaries endpoint should exist and return data"""
        response = requests.get(f"{BASE_URL}/api/beneficiaries/{ESTATE_ID}", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Found {len(data)} beneficiaries for estate {ESTATE_ID}")
        
    def test_beneficiaries_have_required_fields(self, auth_token):
        """Each beneficiary should have required fields"""
        response = requests.get(f"{BASE_URL}/api/beneficiaries/{ESTATE_ID}", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            ben = data[0]
            required_fields = ["id", "estate_id", "name"]
            for field in required_fields:
                assert field in ben, f"Beneficiary missing field: {field}"
            print(f"First beneficiary: {ben.get('name')} ({ben.get('email', 'no email')})")
        else:
            print("No beneficiaries found - this may be expected")


class TestOnboardingProgress:
    """Test onboarding progress endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for test user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200 and "access_token" in response.json():
            return response.json()["access_token"]
        pytest.skip("Could not get auth token")
        
    def test_onboarding_progress_endpoint(self, auth_token):
        """Onboarding progress endpoint should return data"""
        response = requests.get(f"{BASE_URL}/api/onboarding/progress", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "steps" in data, f"Should have steps, got: {list(data.keys())}"
        assert "progress_pct" in data, f"Should have progress_pct"
        
        print(f"Onboarding progress: {data.get('progress_pct')}% complete, {data.get('completed_count')}/{data.get('total_steps')} steps")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
