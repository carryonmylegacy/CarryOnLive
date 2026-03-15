"""
CarryOn™ Platform — Final Production Pressure Test (Iteration 117) V2

Optimized version using module-scoped token to avoid rate limiting.
Single login at start, token reused for all 40+ endpoint tests.
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL environment variable is required")

# Admin credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"
ESTATE_ID = "667ba2ef-6914-4761-b1f5-3e0ef3e8fe97"


# Module-scoped token — single login for entire test suite
@pytest.fixture(scope="module")
def auth_token():
    """Login once at module start, reuse token for all tests"""
    print(f"\n=== Logging in to {BASE_URL} as {ADMIN_EMAIL} ===")
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30
    )
    
    if response.status_code == 429:
        pytest.fail(f"Rate limited on login! Wait 3+ minutes and retry. Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        if "access_token" in data:
            print(f"SUCCESS: Got token (length: {len(data['access_token'])})")
            return data["access_token"]
        elif data.get("otp_required"):
            pytest.fail("OTP required - cannot proceed without OTP verification")
    
    pytest.fail(f"Login failed: {response.status_code} - {response.text}")


# ==================== AUTH TESTS ====================

def test_health_check():
    """Test health endpoint without auth"""
    response = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "healthy"
    assert data.get("database") == "connected"
    print("SUCCESS: Health check passed")


def test_login_invalid_credentials():
    """Test login with invalid credentials"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "invalid@test.com", "password": "wrongpass123"},
        timeout=10
    )
    assert response.status_code == 401
    print("SUCCESS: Invalid credentials rejected with 401")


def test_auth_me_valid_token(auth_token):
    """Test /auth/me with valid token"""
    response = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["role"] == "admin"
    print(f"SUCCESS: /auth/me returned: {data['name']} ({data['role']})")


def test_auth_me_invalid_token():
    """Test /auth/me rejects invalid token"""
    response = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": "Bearer invalid_token_12345"},
        timeout=10
    )
    assert response.status_code in (401, 403)
    print(f"SUCCESS: Invalid token rejected with {response.status_code}")


# ==================== ESTATE TESTS ====================

def test_get_estates(auth_token):
    """Test GET /api/estates"""
    response = requests.get(
        f"{BASE_URL}/api/estates",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    print(f"SUCCESS: /estates returned {len(data)} estates")


def test_get_estate_readiness(auth_token):
    """Test GET /api/estate/{id}/readiness"""
    response = requests.get(
        f"{BASE_URL}/api/estate/{ESTATE_ID}/readiness",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /estate/readiness returned 200")


def test_get_section_permissions(auth_token):
    """Test GET /api/estate/{id}/section-permissions"""
    response = requests.get(
        f"{BASE_URL}/api/estate/{ESTATE_ID}/section-permissions",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /section-permissions returned 200")


# ==================== BENEFICIARY TESTS ====================

def test_get_beneficiaries(auth_token):
    """Test GET /api/beneficiaries/{estate_id}"""
    response = requests.get(
        f"{BASE_URL}/api/beneficiaries/{ESTATE_ID}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    print(f"SUCCESS: /beneficiaries returned {len(data)} beneficiaries")


def test_get_succession_order(auth_token):
    """Test GET /api/beneficiaries/{estate_id}/succession"""
    response = requests.get(
        f"{BASE_URL}/api/beneficiaries/{ESTATE_ID}/succession",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /succession returned 200")


# ==================== CHECKLIST TESTS (KEY BUG FIX VERIFICATION) ====================

def test_get_checklists(auth_token):
    """Test GET /api/checklists/{estate_id}"""
    response = requests.get(
        f"{BASE_URL}/api/checklists/{ESTATE_ID}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    print(f"SUCCESS: /checklists returned {len(data)} items")


def test_create_checklist_item_admin(auth_token):
    """Test POST /api/checklists — admin can create items"""
    response = requests.post(
        f"{BASE_URL}/api/checklists",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "estate_id": ESTATE_ID,
            "title": "TEST_CREATE_117 - Admin Created Item",
            "description": "Created by iteration 117 pressure test",
            "category": "immediate",
            "priority": "high",
            "order": 999
        },
        timeout=10
    )
    assert response.status_code == 200, f"Got {response.status_code}: {response.text}"
    data = response.json()
    assert "id" in data
    print(f"SUCCESS: Admin created checklist item: {data['id']}")
    
    # Cleanup
    requests.delete(
        f"{BASE_URL}/api/checklists/{data['id']}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=5
    )


def test_accept_ai_item_admin_bugfix(auth_token):
    """KEY BUG FIX: POST /api/checklists/{item_id}/accept — admin role now passes require_benefactor_role"""
    # Create test item
    create_resp = requests.post(
        f"{BASE_URL}/api/checklists",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "estate_id": ESTATE_ID,
            "title": "TEST_AI_ACCEPT_117 - AI Suggested Item",
            "description": "Testing admin accept",
            "category": "immediate",
            "priority": "medium",
            "order": 997
        },
        timeout=10
    )
    assert create_resp.status_code == 200
    item_id = create_resp.json()["id"]
    
    # Accept the item — THIS WAS THE BUG: admin role wasn't included in require_benefactor_role
    response = requests.post(
        f"{BASE_URL}/api/checklists/{item_id}/accept",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200, f"BUG: Admin should be able to accept! Got {response.status_code}: {response.text}"
    data = response.json()
    assert data.get("success") == True
    print(f"SUCCESS: Admin accepted AI item — BUG FIX VERIFIED ✓")
    
    # Cleanup
    requests.delete(
        f"{BASE_URL}/api/checklists/{item_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=5
    )


def test_reject_ai_item_with_feedback_admin_bugfix(auth_token):
    """KEY BUG FIX: POST /api/checklists/{item_id}/reject-with-feedback — admin role works"""
    # Create test item
    create_resp = requests.post(
        f"{BASE_URL}/api/checklists",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "estate_id": ESTATE_ID,
            "title": "TEST_AI_REJECT_117 - AI Suggested Item",
            "description": "Testing admin reject",
            "category": "immediate",
            "priority": "medium",
            "order": 996
        },
        timeout=10
    )
    assert create_resp.status_code == 200
    item_id = create_resp.json()["id"]
    
    # Reject with feedback — admin role should work
    response = requests.post(
        f"{BASE_URL}/api/checklists/{item_id}/reject-with-feedback",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={"feedback": "Test rejection feedback from iteration 117"},
        timeout=10
    )
    assert response.status_code == 200, f"BUG: Admin should be able to reject! Got {response.status_code}: {response.text}"
    print(f"SUCCESS: Admin rejected AI item with feedback — BUG FIX VERIFIED ✓")


def test_delete_checklist_item_admin(auth_token):
    """Test DELETE /api/checklists/{item_id} — admin can soft delete"""
    # Create item to delete
    create_resp = requests.post(
        f"{BASE_URL}/api/checklists",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "estate_id": ESTATE_ID,
            "title": "TEST_DELETE_117 - Item to Delete",
            "description": "Will be deleted",
            "category": "immediate",
            "priority": "low",
            "order": 998
        },
        timeout=10
    )
    assert create_resp.status_code == 200
    item_id = create_resp.json()["id"]
    
    # Delete it
    response = requests.delete(
        f"{BASE_URL}/api/checklists/{item_id}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print(f"SUCCESS: Admin soft-deleted checklist item {item_id}")


# ==================== DOCUMENT TESTS ====================

def test_get_documents(auth_token):
    """Test GET /api/documents/{estate_id}"""
    response = requests.get(
        f"{BASE_URL}/api/documents/{ESTATE_ID}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    print(f"SUCCESS: /documents returned {len(data)} documents")


# ==================== MESSAGES TESTS ====================

def test_get_messages(auth_token):
    """Test GET /api/messages/{estate_id}"""
    response = requests.get(
        f"{BASE_URL}/api/messages/{ESTATE_ID}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /messages returned 200")


# ==================== DIGITAL WALLET TESTS (KEY BUG FIX VERIFICATION) ====================

def test_get_digital_wallet_admin_bugfix(auth_token):
    """KEY BUG FIX: GET /api/digital-wallet/{estate_id} — admin has access"""
    response = requests.get(
        f"{BASE_URL}/api/digital-wallet/{ESTATE_ID}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200, f"BUG: Admin should have access! Got {response.status_code}: {response.text}"
    data = response.json()
    assert isinstance(data, list)
    print(f"SUCCESS: Admin accessed digital wallet ({len(data)} entries) — BUG FIX VERIFIED ✓")


# ==================== GUARDIAN/CHAT TESTS ====================

def test_get_chat_sessions(auth_token):
    """Test GET /api/chat/sessions"""
    response = requests.get(
        f"{BASE_URL}/api/chat/sessions",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    print(f"SUCCESS: /chat/sessions returned {len(data)} sessions")


# ==================== SUBSCRIPTION TESTS ====================

def test_get_subscription_status(auth_token):
    """Test GET /api/subscriptions/status"""
    response = requests.get(
        f"{BASE_URL}/api/subscriptions/status",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /subscriptions/status returned 200")


def test_get_subscription_plans(auth_token):
    """Test GET /api/subscriptions/plans"""
    response = requests.get(
        f"{BASE_URL}/api/subscriptions/plans",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    data = response.json()
    # API returns object with plans array, not a direct list
    assert "plans" in data or isinstance(data, list), "Should return plans data"
    plans = data.get("plans", data) if isinstance(data, dict) else data
    print(f"SUCCESS: /subscriptions/plans returned {len(plans)} plans")


# ==================== NOTIFICATION TESTS ====================

def test_get_notifications(auth_token):
    """Test GET /api/notifications"""
    response = requests.get(
        f"{BASE_URL}/api/notifications",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /notifications returned 200")


# ==================== TIMELINE TESTS ====================

def test_get_timeline(auth_token):
    """Test GET /api/timeline/{estate_id}"""
    response = requests.get(
        f"{BASE_URL}/api/timeline/{ESTATE_ID}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /timeline returned 200")


# ==================== TRANSITION/DTS TESTS ====================

def test_get_transition_status(auth_token):
    """Test GET /api/transition/status/{estate_id}"""
    response = requests.get(
        f"{BASE_URL}/api/transition/status/{ESTATE_ID}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /transition/status returned 200")


def test_get_dts_tasks(auth_token):
    """Test GET /api/dts/tasks/{estate_id}"""
    response = requests.get(
        f"{BASE_URL}/api/dts/tasks/{ESTATE_ID}",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /dts/tasks returned 200")


# ==================== ADMIN TESTS ====================

def test_get_admin_stats(auth_token):
    """Test GET /api/admin/stats"""
    response = requests.get(
        f"{BASE_URL}/api/admin/stats",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    data = response.json()
    assert "users" in data
    assert "estates" in data
    print(f"SUCCESS: /admin/stats returned platform stats")


def test_get_admin_users(auth_token):
    """Test GET /api/admin/users"""
    response = requests.get(
        f"{BASE_URL}/api/admin/users",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=15
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    print(f"SUCCESS: /admin/users returned {len(data)} users")


def test_get_admin_activity(auth_token):
    """Test GET /api/admin/activity"""
    response = requests.get(
        f"{BASE_URL}/api/admin/activity",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    print(f"SUCCESS: /admin/activity returned {len(data)} activities")


# ==================== OPS DASHBOARD TESTS ====================

def test_get_ops_dashboard(auth_token):
    """Test GET /api/ops/dashboard"""
    response = requests.get(
        f"{BASE_URL}/api/ops/dashboard",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=15
    )
    assert response.status_code == 200
    print("SUCCESS: /ops/dashboard returned 200")


# ==================== SETTINGS TESTS ====================

def test_get_digest_preferences(auth_token):
    """Test GET /api/digest/preferences"""
    response = requests.get(
        f"{BASE_URL}/api/digest/preferences",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /digest/preferences returned 200")


def test_get_security_settings(auth_token):
    """Test GET /api/security/settings"""
    response = requests.get(
        f"{BASE_URL}/api/security/settings",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /security/settings returned 200")


def test_get_compliance_consent(auth_token):
    """Test GET /api/compliance/consent"""
    response = requests.get(
        f"{BASE_URL}/api/compliance/consent",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /compliance/consent returned 200")


def test_get_family_plan_status(auth_token):
    """Test GET /api/family-plan/status"""
    response = requests.get(
        f"{BASE_URL}/api/family-plan/status",
        headers={"Authorization": f"Bearer {auth_token}"},
        timeout=10
    )
    assert response.status_code == 200
    print("SUCCESS: /family-plan/status returned 200")


# ==================== PDF EXPORT TESTS ====================

def test_export_iac_report(auth_token):
    """Test POST /api/guardian/export-iac-report generates PDF"""
    response = requests.post(
        f"{BASE_URL}/api/guardian/export-iac-report",
        headers={"Authorization": f"Bearer {auth_token}"},
        json={
            "content": "# Beneficiary Actions\n\n1. Contact executor\n2. Review documents\n\n# Benefactor Recommendations\n\n- Update will annually\n- Maintain document vault"
        },
        timeout=30
    )
    assert response.status_code == 200, f"Got {response.status_code}: {response.text}"
    assert "application/pdf" in response.headers.get("content-type", "")
    assert len(response.content) > 1000
    print(f"SUCCESS: /guardian/export-iac-report generated PDF ({len(response.content)} bytes)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
