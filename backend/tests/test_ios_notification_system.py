"""
iOS-Style Notification System Tests
Tests the new notification infrastructure replacing old Sonner toasts
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestHealthAndErrorReporting:
    """Health and error reporting endpoint tests"""

    def test_health_endpoint_returns_correct_structure(self):
        """GET /api/health should return version info and DB status"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200

        data = response.json()
        assert "status" in data
        assert data["status"] == "healthy"
        assert "database" in data
        assert data["database"] == "connected"
        assert "version" in data
        assert "min_version" in data
        print(
            f"✓ Health endpoint: version={data['version']}, min_version={data['min_version']}"
        )

    def test_error_report_endpoint_accepts_basic_error(self):
        """POST /api/errors/report should accept error reports"""
        payload = {
            "message": "TEST_pytest_notification_test_error",
            "context": "Testing iOS notification error reporter",
        }
        response = requests.post(
            f"{BASE_URL}/api/errors/report", json=payload, timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert "received" in data
        assert data["received"] == True
        print("✓ Error report accepted")

    def test_error_report_with_severity(self):
        """POST /api/errors/report with severity field"""
        payload = {
            "message": "TEST_pytest_critical_error",
            "context": "Test critical error",
            "severity": "fatal",
            "url": "https://test.carryon.us/test",
            "userAgent": "pytest-test-agent",
        }
        response = requests.post(
            f"{BASE_URL}/api/errors/report", json=payload, timeout=10
        )
        assert response.status_code == 200
        print("✓ Error report with severity accepted")

    def test_error_report_minimal_data(self):
        """POST /api/errors/report with minimal required fields"""
        payload = {"message": "TEST_pytest_minimal"}
        response = requests.post(
            f"{BASE_URL}/api/errors/report", json=payload, timeout=10
        )
        assert response.status_code == 200
        print("✓ Minimal error report accepted")


class TestLoginErrorNotification:
    """Test login endpoint returns proper error for notification display"""

    def test_login_invalid_credentials_returns_401(self):
        """POST /api/auth/login with wrong credentials should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "wrong@test.com", "password": "wrongpassword"},
            timeout=10,
        )
        assert response.status_code == 401
        data = response.json()
        # Should have detail field with error message
        assert "detail" in data
        print(f"✓ Login error returns 401 with detail: {data['detail']}")

    def test_login_valid_credentials_returns_200(self):
        """POST /api/auth/login with valid founder credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "info@carryon.us", "password": "Demo1234!"},
            timeout=10,
        )
        # May be 200 or 202 (if OTP required)
        assert response.status_code in [200, 202]
        print(f"✓ Login with valid credentials: status={response.status_code}")


class TestAdminEndpoints:
    """Test admin endpoints that may trigger notifications"""

    @pytest.fixture
    def auth_headers(self):
        """Get auth token for admin"""
        # Try reading from token file
        try:
            with open("/tmp/admin_token.txt", "r") as f:
                token = f.read().strip()
            return {"Authorization": f"Bearer {token}"}
        except:
            pytest.skip("No admin token available")

    def test_admin_announcements_endpoint(self, auth_headers):
        """GET /api/admin/announcements should return list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/announcements", headers=auth_headers, timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Announcements endpoint: {len(data)} items")

    def test_admin_system_health_endpoint(self, auth_headers):
        """GET /api/admin/system-health should return health data"""
        response = requests.get(
            f"{BASE_URL}/api/admin/system-health", headers=auth_headers, timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert "status" in data or "healthy" in str(data).lower()
        print("✓ System health endpoint working")

    def test_admin_escalations_endpoint(self, auth_headers):
        """GET /api/ops/escalations should return list"""
        response = requests.get(
            f"{BASE_URL}/api/ops/escalations", headers=auth_headers, timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Escalations endpoint: {len(data)} items")

    def test_admin_knowledge_base_endpoint(self, auth_headers):
        """GET /api/admin/knowledge-base should return list"""
        response = requests.get(
            f"{BASE_URL}/api/admin/knowledge-base", headers=auth_headers, timeout=10
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Knowledge Base endpoint: {len(data)} items")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
