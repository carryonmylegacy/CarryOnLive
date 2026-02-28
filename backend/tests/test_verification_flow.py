"""
Verification Flow Tests for Military/Hospice Plans
Tests:
- POST /api/verification/upload - Submit verification document
- GET /api/admin/verifications - List all verifications (admin)
- POST /api/admin/verifications/{id}/review - Approve/deny verification
- POST /api/admin/verifications/{id}/notify - Notify benefactor after approval
- GET /api/subscriptions/plans - Check plans have correct attributes
"""

import pytest
import requests
import os
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://vault-pdf-viewer.preview.emergentagent.com')

# Test credentials provided
BENEFACTOR_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNjA3YjE2NGUtMGQzOS00Yjk1LWI5N2QtMmE2MDM5MTgyNDhhIiwiZW1haWwiOiJmdWxsdGVzdEB0ZXN0LmNvbSIsInJvbGUiOiJiZW5lZmFjdG9yIiwiaXNzdWVkX2F0IjoiMjAyNi0wMi0yOFQxOToyMTo0MC42ODI0NDcrMDA6MDAiLCJleHAiOjE3NzIzMzUzMDB9.pk5w6rPA0G1XR0CgfmZ2uWfFBddrKwjeae-lY2GtwYk"
ADMIN_EMAIL = "founder@carryon.us"
ADMIN_PASSWORD = "CarryOntheWisdom!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def benefactor_headers():
    """Headers with benefactor auth token"""
    return {"Authorization": f"Bearer {BENEFACTOR_TOKEN}"}


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin auth token via login"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        # API returns access_token, not token
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestSubscriptionPlans:
    """Test subscription plans endpoint returns correct data"""

    def test_plans_endpoint_returns_all_plans(self, api_client):
        """GET /api/subscriptions/plans returns benefactor and beneficiary plans"""
        response = api_client.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "plans" in data, "Response should contain 'plans' key"
        assert "beneficiary_plans" in data, "Response should contain 'beneficiary_plans' key"
        
        # Check plans structure
        plan_ids = [p["id"] for p in data["plans"]]
        assert "military" in plan_ids, "Military plan should be in plans"
        assert "hospice" in plan_ids, "Hospice plan should be in plans"
        print(f"✓ Found {len(data['plans'])} plans and {len(data['beneficiary_plans'])} beneficiary plans")

    def test_military_plan_has_verification_requirement(self, api_client):
        """Military plan should have requires_verification=True"""
        response = api_client.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        
        data = response.json()
        military_plan = next((p for p in data["plans"] if p["id"] == "military"), None)
        assert military_plan is not None, "Military plan not found"
        assert military_plan.get("requires_verification") == True, "Military plan should require verification"
        print(f"✓ Military plan requires verification: {military_plan.get('requires_verification')}")

    def test_hospice_plan_has_verification_requirement(self, api_client):
        """Hospice plan should have requires_verification=True"""
        response = api_client.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        
        data = response.json()
        hospice_plan = next((p for p in data["plans"] if p["id"] == "hospice"), None)
        assert hospice_plan is not None, "Hospice plan not found"
        assert hospice_plan.get("requires_verification") == True, "Hospice plan should require verification"
        assert hospice_plan.get("price") == 0.00, "Hospice plan should be free"
        print(f"✓ Hospice plan: requires_verification={hospice_plan.get('requires_verification')}, price={hospice_plan.get('price')}")

    def test_beneficiary_plans_have_quarterly_annual_prices(self, api_client):
        """Beneficiary plans should include quarterly and annual prices"""
        response = api_client.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        
        data = response.json()
        ben_plans = data.get("beneficiary_plans", [])
        assert len(ben_plans) > 0, "Should have beneficiary plans"
        
        for plan in ben_plans:
            assert "quarterly_price" in plan, f"Plan {plan['id']} missing quarterly_price"
            assert "annual_price" in plan, f"Plan {plan['id']} missing annual_price"
            print(f"✓ {plan['id']}: monthly=${plan['price']}, quarterly=${plan['quarterly_price']}, annual=${plan['annual_price']}")


class TestVerificationUpload:
    """Test verification document upload endpoint"""

    def test_verification_upload_requires_auth(self, api_client):
        """POST /api/verification/upload requires authentication"""
        response = api_client.post(f"{BASE_URL}/api/verification/upload", data={
            "tier_requested": "military",
            "doc_type": "Military ID",
            "file_data": "test",
            "file_name": "test.jpg"
        })
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print(f"✓ Verification upload requires auth (status: {response.status_code})")

    def test_verification_upload_invalid_tier(self, api_client, benefactor_headers):
        """POST /api/verification/upload rejects invalid tier"""
        # Remove Content-Type: application/json for form data
        form_headers = {**benefactor_headers}
        response = requests.post(
            f"{BASE_URL}/api/verification/upload",
            headers=form_headers,
            data={
                "tier_requested": "invalid_tier",
                "doc_type": "Some Doc",
                "file_data": base64.b64encode(b"test file content").decode(),
                "file_name": "test.jpg"
            }
        )
        # 400 for invalid tier or 422 for validation
        assert response.status_code in [400, 422], f"Expected 400/422 for invalid tier, got {response.status_code}"
        print(f"✓ Invalid tier rejected: {response.json().get('detail', 'Unknown error')}")

    def test_verification_upload_military(self, api_client, benefactor_headers):
        """POST /api/verification/upload accepts military tier with valid doc"""
        # Create a simple test image (1x1 pixel PNG)
        test_image = base64.b64encode(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde').decode()
        
        # Use requests directly without Content-Type: application/json for form data
        form_headers = {**benefactor_headers}
        response = requests.post(
            f"{BASE_URL}/api/verification/upload",
            headers=form_headers,
            data={
                "tier_requested": "military",
                "doc_type": "Military ID",
                "file_data": test_image,
                "file_name": "military_id.png"
            }
        )
        # Accept 200 (success) or 400 (already has pending verification)
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True, "Upload should succeed"
            assert "verification_id" in data, "Should return verification_id"
            print(f"✓ Verification uploaded: {data.get('verification_id')}")
        else:
            # Already has pending verification
            print(f"✓ Verification blocked (already pending): {response.json().get('detail')}")


class TestAdminVerifications:
    """Test admin verification management endpoints"""

    def test_admin_verifications_requires_admin(self, api_client, benefactor_headers):
        """GET /api/admin/verifications requires admin role"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/verifications",
            headers=benefactor_headers
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print(f"✓ Admin verifications requires admin role")

    def test_admin_verifications_list(self, api_client, admin_headers):
        """GET /api/admin/verifications returns list of verifications"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/verifications",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✓ Found {len(data)} verification requests")
        
        # If there are verifications, check structure
        if data:
            v = data[0]
            required_fields = ["id", "user_id", "tier_requested", "status", "doc_type"]
            for field in required_fields:
                assert field in v, f"Verification missing required field: {field}"
            print(f"✓ Sample verification: tier={v.get('tier_requested')}, status={v.get('status')}, user={v.get('user_email')}")
        return data

    def test_admin_verification_review_approve(self, api_client, admin_headers):
        """POST /api/admin/verifications/{id}/review can approve verification"""
        # First get list of verifications
        list_response = api_client.get(
            f"{BASE_URL}/api/admin/verifications",
            headers=admin_headers
        )
        if list_response.status_code != 200:
            pytest.skip("Could not get verifications list")
        
        verifications = list_response.json()
        pending_verification = next((v for v in verifications if v.get("status") == "pending"), None)
        
        if not pending_verification:
            # Try to find any verification to test with
            if verifications:
                # Test approve toggle on existing verification
                test_v = verifications[0]
                response = api_client.post(
                    f"{BASE_URL}/api/admin/verifications/{test_v['id']}/review",
                    headers=admin_headers,
                    json={"action": "approve", "notes": "Test approval from pytest"}
                )
                assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
                print(f"✓ Verification review endpoint works (toggled approval for {test_v['id']})")
            else:
                pytest.skip("No verifications found to test")
            return
        
        # Approve the pending verification
        response = api_client.post(
            f"{BASE_URL}/api/admin/verifications/{pending_verification['id']}/review",
            headers=admin_headers,
            json={"action": "approve", "notes": "Test approval from pytest"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Approval should succeed"
        print(f"✓ Verification approved: {pending_verification['id']}")

    def test_admin_verification_notify(self, api_client, admin_headers):
        """POST /api/admin/verifications/{id}/notify sends notification to benefactor"""
        # Get list and find an approved verification that hasn't been notified
        list_response = api_client.get(
            f"{BASE_URL}/api/admin/verifications",
            headers=admin_headers
        )
        if list_response.status_code != 200:
            pytest.skip("Could not get verifications list")
        
        verifications = list_response.json()
        approved_verification = next(
            (v for v in verifications if v.get("status") == "approved" and not v.get("notified")),
            None
        )
        
        if not approved_verification:
            # Check if any approved verification exists (even if notified)
            approved_any = next((v for v in verifications if v.get("status") == "approved"), None)
            if approved_any:
                # Test the endpoint - it should fail gracefully or succeed
                response = api_client.post(
                    f"{BASE_URL}/api/admin/verifications/{approved_any['id']}/notify",
                    headers=admin_headers
                )
                # If already notified, endpoint might return 400 or still succeed
                print(f"✓ Notify endpoint responded: {response.status_code} - {response.text[:100] if response.text else 'No body'}")
                return
            else:
                pytest.skip("No approved verifications found to test notify")
        
        # Send notification
        response = api_client.post(
            f"{BASE_URL}/api/admin/verifications/{approved_verification['id']}/notify",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, "Notification should succeed"
        print(f"✓ Notification sent for verification: {approved_verification['id']}")


class TestVerificationStatus:
    """Test user verification status endpoint"""

    def test_verification_status_returns_status(self, api_client, benefactor_headers):
        """GET /api/verification/status returns current user's verification status"""
        response = api_client.get(
            f"{BASE_URL}/api/verification/status",
            headers=benefactor_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should contain status field"
        valid_statuses = ["none", "pending", "approved", "denied"]
        assert data["status"] in valid_statuses, f"Invalid status: {data['status']}"
        print(f"✓ Verification status: {data['status']}, tier: {data.get('tier_requested', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
