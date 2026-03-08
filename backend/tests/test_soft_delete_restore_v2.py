"""
CarryOn Soft-Delete and Restore API Tests - V2
Tests using pre-created admin and operator users in database
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Pre-created test credentials
ADMIN_EMAIL = "test_admin_t1@example.com"
ADMIN_PASSWORD = "Password.123"
OPERATOR_EMAIL = "test_operator_t1@example.com"
OPERATOR_PASSWORD = "Password.123"
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"

def get_token(email, password):
    """Get auth token for user"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if resp.status_code == 200:
        return resp.json().get("access_token")
    return None

def get_headers(token):
    """Return auth headers"""
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Verify API is accessible"""
        resp = requests.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200
        print("PASS: API health check")


class TestAuthentication:
    """Test authentication for different roles"""
    
    def test_admin_login(self):
        """Admin can login"""
        token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert token is not None, "Admin login failed"
        print(f"PASS: Admin login successful")
        
    def test_operator_login(self):
        """Operator can login"""
        token = get_token(OPERATOR_EMAIL, OPERATOR_PASSWORD)
        assert token is not None, "Operator login failed"
        print(f"PASS: Operator login successful")


class TestSupportConversations:
    """Support conversation soft-delete and restore tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.admin_token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        self.operator_token = get_token(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    
    def test_get_conversations_admin(self):
        """Admin can GET /api/support/conversations"""
        if not self.admin_token:
            pytest.skip("No admin token")
        headers = get_headers(self.admin_token)
        resp = requests.get(f"{BASE_URL}/api/support/conversations", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"PASS: Admin can get conversations, count: {len(resp.json())}")
    
    def test_get_conversations_operator(self):
        """Operator can GET /api/support/conversations"""
        if not self.operator_token:
            pytest.skip("No operator token")
        headers = get_headers(self.operator_token)
        resp = requests.get(f"{BASE_URL}/api/support/conversations", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"PASS: Operator can get conversations, count: {len(resp.json())}")
    
    def test_get_conversations_include_deleted_admin(self):
        """Admin can request include_deleted=true"""
        if not self.admin_token:
            pytest.skip("No admin token")
        headers = get_headers(self.admin_token)
        resp = requests.get(f"{BASE_URL}/api/support/conversations?include_deleted=true", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print("PASS: Admin can get conversations with include_deleted")
    
    def test_operator_cannot_restore_conversation(self):
        """Operator gets 403 on restore endpoint"""
        if not self.operator_token:
            pytest.skip("No operator token")
        headers = get_headers(self.operator_token)
        resp = requests.post(f"{BASE_URL}/api/admin/support/conversation/fake-id/restore", headers=headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Operator correctly denied restore (403)")


class TestDTSTasks:
    """DTS task soft-delete and restore tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.admin_token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        self.operator_token = get_token(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    
    def test_get_dts_tasks_admin(self):
        """Admin can GET /api/dts/tasks/all"""
        if not self.admin_token:
            pytest.skip("No admin token")
        headers = get_headers(self.admin_token)
        resp = requests.get(f"{BASE_URL}/api/dts/tasks/all", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"PASS: Admin can get DTS tasks, count: {len(resp.json())}")
    
    def test_get_dts_tasks_operator(self):
        """Operator can GET /api/dts/tasks/all"""
        if not self.operator_token:
            pytest.skip("No operator token")
        headers = get_headers(self.operator_token)
        resp = requests.get(f"{BASE_URL}/api/dts/tasks/all", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"PASS: Operator can get DTS tasks, count: {len(resp.json())}")
    
    def test_get_dts_tasks_include_deleted(self):
        """Admin can request include_deleted=true"""
        if not self.admin_token:
            pytest.skip("No admin token")
        headers = get_headers(self.admin_token)
        resp = requests.get(f"{BASE_URL}/api/dts/tasks/all?include_deleted=true", headers=headers)
        assert resp.status_code == 200
        print("PASS: Admin can get DTS tasks with include_deleted")
    
    def test_operator_cannot_restore_dts_task(self):
        """Operator gets 403 on DTS restore endpoint"""
        if not self.operator_token:
            pytest.skip("No operator token")
        headers = get_headers(self.operator_token)
        resp = requests.post(f"{BASE_URL}/api/dts/tasks/fake-id/restore", headers=headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Operator correctly denied DTS restore (403)")


class TestVerifications:
    """Tier Verification soft-delete and restore tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.admin_token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        self.operator_token = get_token(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    
    def test_get_verifications_admin(self):
        """Admin can GET /api/admin/verifications"""
        if not self.admin_token:
            pytest.skip("No admin token")
        headers = get_headers(self.admin_token)
        resp = requests.get(f"{BASE_URL}/api/admin/verifications", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"PASS: Admin can get verifications, count: {len(resp.json())}")
    
    def test_get_verifications_operator(self):
        """Operator can GET /api/admin/verifications"""
        if not self.operator_token:
            pytest.skip("No operator token")
        headers = get_headers(self.operator_token)
        resp = requests.get(f"{BASE_URL}/api/admin/verifications", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"PASS: Operator can get verifications, count: {len(resp.json())}")
    
    def test_get_verifications_include_deleted(self):
        """Admin can request include_deleted=true"""
        if not self.admin_token:
            pytest.skip("No admin token")
        headers = get_headers(self.admin_token)
        resp = requests.get(f"{BASE_URL}/api/admin/verifications?include_deleted=true", headers=headers)
        assert resp.status_code == 200
        print("PASS: Admin can get verifications with include_deleted")
    
    def test_operator_cannot_restore_verification(self):
        """Operator gets 403 on verification restore endpoint"""
        if not self.operator_token:
            pytest.skip("No operator token")
        headers = get_headers(self.operator_token)
        resp = requests.post(f"{BASE_URL}/api/admin/verifications/fake-id/restore", headers=headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Operator correctly denied verification restore (403)")


class TestTransitionCertificates:
    """Transition Certificate soft-delete and restore tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.admin_token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
        self.operator_token = get_token(OPERATOR_EMAIL, OPERATOR_PASSWORD)
    
    def test_get_certificates_admin(self):
        """Admin can GET /api/transition/certificates/all"""
        if not self.admin_token:
            pytest.skip("No admin token")
        headers = get_headers(self.admin_token)
        resp = requests.get(f"{BASE_URL}/api/transition/certificates/all", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"PASS: Admin can get certificates, count: {len(resp.json())}")
    
    def test_get_certificates_operator(self):
        """Operator can GET /api/transition/certificates/all"""
        if not self.operator_token:
            pytest.skip("No operator token")
        headers = get_headers(self.operator_token)
        resp = requests.get(f"{BASE_URL}/api/transition/certificates/all", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"PASS: Operator can get certificates, count: {len(resp.json())}")
    
    def test_get_certificates_include_deleted(self):
        """Admin can request include_deleted=true"""
        if not self.admin_token:
            pytest.skip("No admin token")
        headers = get_headers(self.admin_token)
        resp = requests.get(f"{BASE_URL}/api/transition/certificates/all?include_deleted=true", headers=headers)
        assert resp.status_code == 200
        print("PASS: Admin can get certificates with include_deleted")
    
    def test_operator_cannot_restore_certificate(self):
        """Operator gets 403 on certificate restore endpoint"""
        if not self.operator_token:
            pytest.skip("No operator token")
        headers = get_headers(self.operator_token)
        resp = requests.post(f"{BASE_URL}/api/transition/certificates/fake-id/restore", headers=headers)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        print("PASS: Operator correctly denied certificate restore (403)")


class TestRestoreEndpointsPermissions:
    """Verify all restore endpoints return 403 for operator"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.operator_token = get_token(OPERATOR_EMAIL, OPERATOR_PASSWORD)
        self.admin_token = get_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    
    def test_all_restore_endpoints_deny_operator(self):
        """All restore endpoints return 403 for operator"""
        if not self.operator_token:
            pytest.skip("No operator token")
        
        headers = get_headers(self.operator_token)
        
        restore_endpoints = [
            "/api/admin/support/conversation/fake-id/restore",
            "/api/dts/tasks/fake-id/restore",
            "/api/admin/verifications/fake-id/restore",
            "/api/transition/certificates/fake-id/restore",
        ]
        
        all_denied = True
        for endpoint in restore_endpoints:
            resp = requests.post(f"{BASE_URL}{endpoint}", headers=headers)
            if resp.status_code != 403:
                print(f"FAIL: {endpoint} returned {resp.status_code}, expected 403")
                all_denied = False
            else:
                print(f"PASS: {endpoint} correctly returned 403")
        
        assert all_denied, "Some restore endpoints did not return 403 for operator"
        print("PASS: All restore endpoints correctly deny operator access")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
