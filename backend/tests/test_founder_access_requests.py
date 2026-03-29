"""
Test suite for Founder Access Request System
Tests the new request-based access flow (separate from invite links):
- POST /api/founder/requests — submit access request
- GET /api/founder/requests — admin lists all requests
- POST /api/founder/requests/:id/approve — admin approves with password
- POST /api/founder/requests/:id/deny — admin denies
- POST /api/founder/requests/:id/revoke — admin revokes approved access
- POST /api/founder-about/login — email+password verification
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"

# Module-level test data that persists across all tests
TEST_EMAIL = f"TEST_founder_{uuid.uuid4().hex[:8]}@test.com"
TEST_REQUEST_ID = None
TEST_PASSWORD = "TestPass123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Auth headers for admin requests"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestFounderAccessRequests:
    """Test the founder access request flow - tests run in order"""
    
    # ─── Submit Access Request (Public) ───
    
    def test_01_submit_request_success(self):
        """POST /api/founder/requests — submit new request"""
        global TEST_REQUEST_ID
        response = requests.post(f"{BASE_URL}/api/founder/requests", json={
            "name": "Test User",
            "email": TEST_EMAIL,
            "message": "I want to learn about the founder"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "submitted", f"Expected 'submitted', got {data}"
        assert "request_id" in data, "Response should include request_id"
        TEST_REQUEST_ID = data["request_id"]
        print(f"✓ Request submitted successfully: {TEST_REQUEST_ID}")
    
    def test_02_submit_duplicate_request_returns_already_pending(self):
        """POST /api/founder/requests — duplicate pending request returns already_pending"""
        response = requests.post(f"{BASE_URL}/api/founder/requests", json={
            "name": "Test User Again",
            "email": TEST_EMAIL,
            "message": "Trying again"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "already_pending", f"Expected 'already_pending', got {data}"
        print("✓ Duplicate request correctly returns 'already_pending'")
    
    def test_03_submit_request_missing_name(self):
        """POST /api/founder/requests — missing name returns 400"""
        response = requests.post(f"{BASE_URL}/api/founder/requests", json={
            "name": "",
            "email": "test@example.com"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Missing name correctly returns 400")
    
    def test_04_submit_request_missing_email(self):
        """POST /api/founder/requests — missing email returns 400"""
        response = requests.post(f"{BASE_URL}/api/founder/requests", json={
            "name": "Test User",
            "email": ""
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Missing email correctly returns 400")
    
    # ─── List Access Requests (Admin) ───
    
    def test_05_list_requests_requires_auth(self):
        """GET /api/founder/requests — requires authentication"""
        response = requests.get(f"{BASE_URL}/api/founder/requests")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ List requests correctly requires auth")
    
    def test_06_list_requests_success(self, auth_headers):
        """GET /api/founder/requests — admin can list all requests"""
        response = requests.get(f"{BASE_URL}/api/founder/requests", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Find our test request
        test_request = next((r for r in data if r.get("email") == TEST_EMAIL), None)
        assert test_request is not None, f"Test request not found in list. Looking for {TEST_EMAIL}"
        assert test_request.get("status") == "pending", "New request should be pending"
        print(f"✓ Listed {len(data)} requests, found test request")
    
    # ─── Approve Request (Admin) ───
    
    def test_07_approve_request_requires_auth(self):
        """POST /api/founder/requests/:id/approve — requires authentication"""
        response = requests.post(f"{BASE_URL}/api/founder/requests/fake-id/approve", json={
            "password": "test123"
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Approve request correctly requires auth")
    
    def test_08_approve_request_short_password(self, auth_headers):
        """POST /api/founder/requests/:id/approve — password too short returns 400"""
        global TEST_REQUEST_ID
        assert TEST_REQUEST_ID is not None, "Test request ID not set"
        
        response = requests.post(
            f"{BASE_URL}/api/founder/requests/{TEST_REQUEST_ID}/approve",
            json={"password": "abc"},  # Too short
            headers=auth_headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Short password correctly returns 400")
    
    def test_09_approve_request_success(self, auth_headers):
        """POST /api/founder/requests/:id/approve — admin can approve with password"""
        global TEST_REQUEST_ID
        assert TEST_REQUEST_ID is not None, "Test request ID not set"
        
        response = requests.post(
            f"{BASE_URL}/api/founder/requests/{TEST_REQUEST_ID}/approve",
            json={"password": TEST_PASSWORD},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "approved", f"Expected 'approved', got {data}"
        print("✓ Request approved successfully")
    
    def test_10_approve_nonexistent_request(self, auth_headers):
        """POST /api/founder/requests/:id/approve — nonexistent request returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/founder/requests/nonexistent-id/approve",
            json={"password": "test1234"},
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Nonexistent request correctly returns 404")
    
    # ─── Founder Login (Public) ───
    
    def test_11_founder_login_success(self):
        """POST /api/founder-about/login — valid credentials return valid=true"""
        response = requests.post(f"{BASE_URL}/api/founder-about/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("valid") == True, f"Expected valid=true, got {data}"
        print("✓ Founder login successful with correct credentials")
    
    def test_12_founder_login_wrong_password(self):
        """POST /api/founder-about/login — wrong password returns valid=false"""
        response = requests.post(f"{BASE_URL}/api/founder-about/login", json={
            "email": TEST_EMAIL,
            "password": "WrongPassword"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("valid") == False, f"Expected valid=false, got {data}"
        assert data.get("reason") == "wrong_password", f"Expected reason='wrong_password', got {data}"
        print("✓ Wrong password correctly returns valid=false")
    
    def test_13_founder_login_no_access(self):
        """POST /api/founder-about/login — unapproved email returns valid=false"""
        response = requests.post(f"{BASE_URL}/api/founder-about/login", json={
            "email": "nonexistent@test.com",
            "password": "anypassword"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("valid") == False, f"Expected valid=false, got {data}"
        assert data.get("reason") == "no_access", f"Expected reason='no_access', got {data}"
        print("✓ Unapproved email correctly returns valid=false with no_access")
    
    def test_14_founder_login_reusable(self):
        """POST /api/founder-about/login — can login multiple times"""
        for i in range(3):
            response = requests.post(f"{BASE_URL}/api/founder-about/login", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            })
            assert response.status_code == 200
            data = response.json()
            assert data.get("valid") == True, f"Login {i+1} failed: {data}"
        print("✓ Login is reusable (3 successful logins)")
    
    # ─── Revoke Access (Admin) ───
    
    def test_15_revoke_access_requires_auth(self):
        """POST /api/founder/requests/:id/revoke — requires authentication"""
        response = requests.post(f"{BASE_URL}/api/founder/requests/fake-id/revoke")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Revoke access correctly requires auth")
    
    def test_16_revoke_access_success(self, auth_headers):
        """POST /api/founder/requests/:id/revoke — admin can revoke approved access"""
        global TEST_REQUEST_ID
        assert TEST_REQUEST_ID is not None, "Test request ID not set"
        
        response = requests.post(
            f"{BASE_URL}/api/founder/requests/{TEST_REQUEST_ID}/revoke",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "revoked", f"Expected 'revoked', got {data}"
        print("✓ Access revoked successfully")
    
    def test_17_founder_login_after_revoke_fails(self):
        """POST /api/founder-about/login — revoked access returns valid=false"""
        response = requests.post(f"{BASE_URL}/api/founder-about/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("valid") == False, f"Expected valid=false after revoke, got {data}"
        assert data.get("reason") == "no_access", f"Expected reason='no_access', got {data}"
        print("✓ Login correctly fails after access revoked")
    
    # ─── Deny Request (Admin) ───
    
    def test_18_deny_request_requires_auth(self):
        """POST /api/founder/requests/:id/deny — requires authentication"""
        response = requests.post(f"{BASE_URL}/api/founder/requests/fake-id/deny")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("✓ Deny request correctly requires auth")
    
    def test_19_deny_request_success(self, auth_headers):
        """POST /api/founder/requests/:id/deny — admin can deny pending request"""
        # Create a new request to deny
        deny_email = f"TEST_deny_{uuid.uuid4().hex[:8]}@test.com"
        submit_response = requests.post(f"{BASE_URL}/api/founder/requests", json={
            "name": "Deny Test User",
            "email": deny_email,
            "message": "This will be denied"
        })
        assert submit_response.status_code == 200
        request_id = submit_response.json().get("request_id")
        
        # Deny it
        response = requests.post(
            f"{BASE_URL}/api/founder/requests/{request_id}/deny",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "denied", f"Expected 'denied', got {data}"
        print("✓ Request denied successfully")
    
    def test_20_deny_nonexistent_request(self, auth_headers):
        """POST /api/founder/requests/:id/deny — nonexistent request returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/founder/requests/nonexistent-id/deny",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Nonexistent request correctly returns 404")


class TestInviteLinksStillWork:
    """Verify existing invite link system still works independently"""
    
    def test_create_invite_link(self, auth_headers):
        """POST /api/founder/invites — can still create invite links"""
        response = requests.post(f"{BASE_URL}/api/founder/invites", json={
            "note": "TEST_access_request_coexist"
        }, headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "token" in data, "Response should include token"
        print(f"✓ Invite link created: {data['token'][:8]}...")
    
    def test_list_invite_links(self, auth_headers):
        """GET /api/founder/invites — can still list invite links"""
        response = requests.get(f"{BASE_URL}/api/founder/invites", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Listed {len(data)} invite links")
    
    def test_verify_invite_token(self, auth_headers):
        """GET /api/founder-about/verify/:token — token verification still works"""
        # Create a new invite
        create_response = requests.post(f"{BASE_URL}/api/founder/invites", json={
            "note": "TEST_verify_coexist"
        }, headers=auth_headers)
        token = create_response.json().get("token")
        
        # Verify it
        response = requests.get(f"{BASE_URL}/api/founder-about/verify/{token}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data.get("valid") == True, f"Expected valid=true, got {data}"
        print("✓ Invite token verification still works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
