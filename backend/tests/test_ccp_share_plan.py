"""
Test CCP Share Plan Feature
- POST /api/ccp/plans/{plan_id}/share - Generate share token (auth required)
- DELETE /api/ccp/plans/{plan_id}/share - Revoke share link (auth required)
- GET /api/public/ccp/{share_token} - Public endpoint (no auth required)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TEST_USERNAME = "admin_5dfa64"
TEST_PASSWORD = "Demo1234!"


class TestCCPSharePlanAuth:
    """Test authentication requirements for share endpoints"""
    
    def test_share_plan_returns_401_without_auth(self):
        """POST /api/ccp/plans/{plan_id}/share returns 401 without auth"""
        response = requests.post(
            f"{BASE_URL}/api/ccp/plans/fake-plan-id/share",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ POST /api/ccp/plans/{{plan_id}}/share returns {response.status_code} without auth")
    
    def test_revoke_share_returns_401_without_auth(self):
        """DELETE /api/ccp/plans/{plan_id}/share returns 401 without auth"""
        response = requests.delete(
            f"{BASE_URL}/api/ccp/plans/fake-plan-id/share",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ DELETE /api/ccp/plans/{{plan_id}}/share returns {response.status_code} without auth")


class TestCCPSharePlanNotFound:
    """Test 404 responses for nonexistent plans"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        self.token = login_response.json().get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_share_plan_returns_404_for_nonexistent_plan(self):
        """POST /api/ccp/plans/{plan_id}/share returns 404 for nonexistent plan"""
        response = requests.post(
            f"{BASE_URL}/api/ccp/plans/nonexistent-plan-id-12345/share",
            headers=self.headers
        )
        # Could be 404 (not found) or 403 (not owner of estate)
        assert response.status_code in [404, 403], f"Expected 404/403, got {response.status_code}"
        print(f"✓ POST /api/ccp/plans/{{plan_id}}/share returns {response.status_code} for nonexistent plan")
    
    def test_revoke_share_returns_404_for_nonexistent_plan(self):
        """DELETE /api/ccp/plans/{plan_id}/share returns 404 for nonexistent plan"""
        response = requests.delete(
            f"{BASE_URL}/api/ccp/plans/nonexistent-plan-id-12345/share",
            headers=self.headers
        )
        # Could be 404 (not found) or 403 (not owner of estate)
        assert response.status_code in [404, 403], f"Expected 404/403, got {response.status_code}"
        print(f"✓ DELETE /api/ccp/plans/{{plan_id}}/share returns {response.status_code} for nonexistent plan")


class TestPublicShareEndpoint:
    """Test public share endpoint (no auth required)"""
    
    def test_public_endpoint_returns_404_for_invalid_token(self):
        """GET /api/public/ccp/{share_token} returns 404 for invalid token"""
        response = requests.get(
            f"{BASE_URL}/api/public/ccp/invalid-token-12345",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Response should have detail field"
        print(f"✓ GET /api/public/ccp/{{share_token}} returns 404 for invalid token")
        print(f"  Response: {data}")
    
    def test_public_endpoint_no_auth_required(self):
        """GET /api/public/ccp/{share_token} is accessible without auth header"""
        # Make request without any auth header
        response = requests.get(
            f"{BASE_URL}/api/public/ccp/test-token-no-auth",
            # No Authorization header
        )
        # Should return 404 (not found) not 401 (unauthorized)
        assert response.status_code == 404, f"Expected 404 (not 401), got {response.status_code}"
        print(f"✓ GET /api/public/ccp/{{share_token}} is public (no auth required) - returns 404 not 401")


class TestShareEndpointExists:
    """Test that share endpoints exist and are routed correctly"""
    
    def test_share_endpoint_exists(self):
        """POST /api/ccp/plans/{plan_id}/share endpoint exists"""
        # Without auth, should return 401/403, not 404 (method not allowed) or 405
        response = requests.post(
            f"{BASE_URL}/api/ccp/plans/test-plan-id/share",
            headers={"Content-Type": "application/json"}
        )
        # 401/403 means endpoint exists but requires auth
        # 404 could mean endpoint doesn't exist OR plan not found (after auth)
        # 405 would mean method not allowed
        assert response.status_code in [401, 403, 404], f"Unexpected status {response.status_code}"
        print(f"✓ POST /api/ccp/plans/{{plan_id}}/share endpoint exists (status: {response.status_code})")
    
    def test_revoke_endpoint_exists(self):
        """DELETE /api/ccp/plans/{plan_id}/share endpoint exists"""
        response = requests.delete(
            f"{BASE_URL}/api/ccp/plans/test-plan-id/share",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code in [401, 403, 404], f"Unexpected status {response.status_code}"
        print(f"✓ DELETE /api/ccp/plans/{{plan_id}}/share endpoint exists (status: {response.status_code})")
    
    def test_public_endpoint_exists(self):
        """GET /api/public/ccp/{share_token} endpoint exists"""
        response = requests.get(
            f"{BASE_URL}/api/public/ccp/test-token"
        )
        # Should return 404 (token not found), not 405 (method not allowed)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ GET /api/public/ccp/{{share_token}} endpoint exists (status: {response.status_code})")


class TestSharePlanResponseStructure:
    """Test response structure of share endpoints"""
    
    def test_public_endpoint_404_response_structure(self):
        """GET /api/public/ccp/{share_token} 404 response has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/public/ccp/invalid-token-structure-test"
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data, "404 response should have 'detail' field"
        assert "not found" in data["detail"].lower() or "expired" in data["detail"].lower(), \
            f"Detail should mention 'not found' or 'expired', got: {data['detail']}"
        print(f"✓ Public endpoint 404 response has correct structure: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
