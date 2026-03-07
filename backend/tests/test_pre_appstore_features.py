"""
Test suite for CarryOn Pre-App Store Features (Iteration 63)

Tests:
1. Backend health check /api/health with min_version field
2. Error reporting endpoint /api/errors/report
3. X-Request-Id header in all API responses
4. RequestTraceMiddleware functionality
"""

import pytest
import requests
import os
import json
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthEndpoint:
    """Test /api/health endpoint with min_version field"""
    
    def test_health_check_returns_healthy(self):
        """Test health endpoint returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("status") == "healthy", f"Expected healthy status, got {data.get('status')}"
        assert "database" in data, "Missing database field in health response"
        print(f"✓ Health check passed: status={data.get('status')}, db={data.get('database')}")
    
    def test_health_check_has_min_version(self):
        """Test health endpoint returns min_version field for force update gate"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        
        data = response.json()
        assert "min_version" in data, "Missing min_version field in health response"
        assert data["min_version"] == "1.0.0", f"Expected min_version 1.0.0, got {data.get('min_version')}"
        print(f"✓ min_version field present: {data['min_version']}")
    
    def test_health_check_has_version(self):
        """Test health endpoint returns version field"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        
        data = response.json()
        assert "version" in data, "Missing version field in health response"
        assert data["version"] == "1.0.0", f"Expected version 1.0.0, got {data.get('version')}"
        print(f"✓ version field present: {data['version']}")


class TestErrorReportingEndpoint:
    """Test /api/errors/report endpoint for Sentry-style error tracking"""
    
    def test_error_report_accepts_valid_payload(self):
        """Test error reporting accepts valid client error report"""
        payload = {
            "message": "Test error from pytest",
            "stack": "Error: Test\n    at test.js:1:1",
            "component": "TestComponent",
            "url": "https://app.carryon.us/test",
            "user_agent": "pytest-test-agent",
            "app_version": "1.0.0",
            "platform": "web",
            "severity": "error"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("received") == True, f"Expected received:true, got {data}"
        print(f"✓ Error report accepted: {data}")
    
    def test_error_report_accepts_minimal_payload(self):
        """Test error reporting accepts minimal payload (only required fields)"""
        payload = {
            "message": "Minimal error test",
            "stack": ""
        }
        
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("received") == True
        print(f"✓ Minimal error report accepted: {data}")
    
    def test_error_report_fatal_severity(self):
        """Test error reporting handles fatal severity"""
        payload = {
            "message": "Fatal crash test from pytest",
            "stack": "Fatal error stack trace",
            "component": "AppRoot",
            "severity": "fatal",
            "platform": "ios"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("received") == True
        print(f"✓ Fatal error report accepted: {data}")
    
    def test_error_report_no_auth_required(self):
        """Test error reporting doesn't require authentication (for pre-login crashes)"""
        payload = {
            "message": "Unauthenticated error report",
            "stack": "Pre-login crash"
        }
        
        # Explicitly NOT providing Authorization header
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200, f"Error report should work without auth, got {response.status_code}"
        print("✓ Error reporting works without authentication")
    
    def test_error_report_truncates_long_message(self):
        """Test error reporting truncates overly long messages gracefully"""
        long_message = "X" * 5000  # Very long message
        payload = {
            "message": long_message,
            "stack": "Y" * 10000  # Very long stack trace
        }
        
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        # Should still accept but truncate
        assert response.status_code == 200, f"Should accept large payload, got {response.status_code}"
        print("✓ Long error payload handled gracefully")
    
    def test_error_report_rejects_missing_message(self):
        """Test error reporting rejects payload without message field"""
        payload = {
            "stack": "Some stack trace"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        # Pydantic validation should fail
        assert response.status_code == 422, f"Expected 422 validation error, got {response.status_code}"
        print("✓ Missing message field correctly rejected (422)")


class TestXRequestIdHeader:
    """Test X-Request-Id header is present in all API responses"""
    
    def test_health_has_request_id(self):
        """Test /api/health returns X-Request-Id header"""
        response = requests.get(f"{BASE_URL}/api/health")
        
        assert "X-Request-Id" in response.headers, "Missing X-Request-Id header in health response"
        request_id = response.headers["X-Request-Id"]
        assert len(request_id) > 0, "X-Request-Id header is empty"
        print(f"✓ Health endpoint X-Request-Id: {request_id}")
    
    def test_errors_report_has_request_id(self):
        """Test /api/errors/report returns X-Request-Id header"""
        payload = {"message": "Test for X-Request-Id", "stack": ""}
        response = requests.post(
            f"{BASE_URL}/api/errors/report",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        assert "X-Request-Id" in response.headers, "Missing X-Request-Id header in errors/report response"
        request_id = response.headers["X-Request-Id"]
        assert len(request_id) > 0
        print(f"✓ Errors report endpoint X-Request-Id: {request_id}")
    
    def test_auth_login_has_request_id(self):
        """Test /api/auth/login returns X-Request-Id header"""
        payload = {"email": "test@example.com", "password": "wrongpass"}
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        # Even failed auth should have X-Request-Id
        assert "X-Request-Id" in response.headers, "Missing X-Request-Id header in auth/login response"
        request_id = response.headers["X-Request-Id"]
        assert len(request_id) > 0
        print(f"✓ Auth login endpoint X-Request-Id: {request_id}")
    
    def test_subscription_plans_has_request_id(self):
        """Test /api/subscriptions/plans returns X-Request-Id header"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        
        assert "X-Request-Id" in response.headers, "Missing X-Request-Id header in subscriptions/plans response"
        request_id = response.headers["X-Request-Id"]
        assert len(request_id) > 0
        print(f"✓ Subscription plans endpoint X-Request-Id: {request_id}")
    
    def test_custom_request_id_preserved(self):
        """Test that custom X-Request-Id header is preserved if provided"""
        custom_id = "custom-test-" + str(uuid.uuid4())[:8]
        
        response = requests.get(
            f"{BASE_URL}/api/health",
            headers={"X-Request-Id": custom_id}
        )
        
        returned_id = response.headers.get("X-Request-Id", "")
        assert returned_id == custom_id, f"Expected custom request ID {custom_id}, got {returned_id}"
        print(f"✓ Custom X-Request-Id preserved: {returned_id}")


class TestLoginAndAuthentication:
    """Test login flow with test credentials"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        payload = {
            "email": "fulltest@test.com",
            "password": "Password.123"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200, f"Login failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "access_token" in data, "Missing access_token in login response"
        assert "user" in data, "Missing user in login response"
        
        # Verify X-Request-Id header
        assert "X-Request-Id" in response.headers
        
        print(f"✓ Login successful for fulltest@test.com")
        return data["access_token"]
    
    def test_authenticated_endpoint_has_request_id(self):
        """Test authenticated endpoints return X-Request-Id"""
        # First login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
            headers={"Content-Type": "application/json"}
        )
        
        if login_response.status_code != 200:
            pytest.skip("Login failed, skipping authenticated test")
        
        token = login_response.json().get("access_token")
        
        # Then test authenticated endpoint
        response = requests.get(
            f"{BASE_URL}/api/estates",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert "X-Request-Id" in response.headers, "Missing X-Request-Id in authenticated response"
        print(f"✓ Authenticated endpoint X-Request-Id: {response.headers['X-Request-Id']}")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
