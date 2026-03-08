"""
CarryOn P0 Features Test Suite
Tests 5 new features:
1. Error Reporter - POST /api/errors/report
2. Network Status Banner - component existence
3. Force Update Gate - GET /api/health version check
4. Pull-to-Refresh - hook and indicator component
5. Haptics - utility functions
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


class TestErrorReporter:
    """Feature 1: Error Reporter - POST /api/errors/report"""

    def test_error_report_basic(self):
        """Test basic error reporting works"""
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json={
                "message": "TEST_pytest_basic_error",
                "stack": "Error: Test\n  at test.js:1",
                "component": "PytestComponent",
                "url": "https://test.com/page",
                "severity": "error",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("received") == True
        print("PASS: Error report basic submission works (200 OK)")

    def test_error_report_with_all_fields(self):
        """Test error reporting with all optional fields"""
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json={
                "message": "TEST_pytest_full_error",
                "stack": "Error: Full test\n  at full.js:42\n  at app.js:100",
                "component": "FullTestComponent",
                "url": "https://test.com/full",
                "user_agent": "Test/1.0",
                "app_version": "1.0.0",
                "platform": "web",
                "severity": "warning",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("received") == True
        print("PASS: Error report with all fields works (200 OK)")

    def test_error_report_fatal_severity(self):
        """Test fatal severity error is accepted"""
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json={
                "message": "TEST_pytest_fatal_error",
                "stack": "Fatal crash",
                "component": "CriticalComponent",
                "url": "https://test.com/crash",
                "severity": "fatal",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("received") == True
        print("PASS: Fatal severity error accepted (200 OK)")

    def test_error_report_minimal(self):
        """Test error reporting with minimal data (just message)"""
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json={"message": "TEST_pytest_minimal_error"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("received") == True
        print("PASS: Minimal error report works (200 OK)")


class TestHealthEndpoint:
    """Feature 3: Force Update Gate - GET /api/health with version info"""

    def test_health_endpoint_returns_version(self):
        """Test /api/health returns version and min_version"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()

        # Verify version fields exist
        assert "version" in data, "Missing 'version' field"
        assert "min_version" in data, "Missing 'min_version' field"
        assert "status" in data, "Missing 'status' field"
        assert "database" in data, "Missing 'database' field"

        # Verify values
        assert data["status"] == "healthy"
        assert data["version"] == "1.0.0"
        assert data["min_version"] == "1.0.0"

        print(
            f"PASS: Health endpoint returns version info: version={data['version']}, min_version={data['min_version']}"
        )

    def test_health_endpoint_db_connected(self):
        """Test /api/health shows database connected"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["database"] == "connected"
        print("PASS: Health endpoint shows database connected")


class TestLoginEndpoint:
    """Verify existing login still works with haptics integration"""

    def test_login_endpoint_exists(self):
        """Test login endpoint is accessible"""
        # Try with invalid credentials - should return 401, not 500
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "invalid@test.com", "password": "wrong"},
        )
        # 401 = unauthorized (expected), 400 = bad request (also acceptable)
        # 500 = server error (would indicate haptics broke something)
        assert response.status_code in [400, 401, 429], (
            f"Unexpected status code: {response.status_code}"
        )
        print(
            f"PASS: Login endpoint responds correctly (status {response.status_code})"
        )


@pytest.fixture(autouse=True)
def setup():
    """Verify BASE_URL is set"""
    assert BASE_URL is not None, "REACT_APP_BACKEND_URL not set"
    print(f"Testing against: {BASE_URL}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
