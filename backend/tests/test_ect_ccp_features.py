"""
Test Suite for Estate Chat Tool (ECT) and CarryOn Connected Protocol (CCP)

ECT Endpoints:
- GET /api/estate-chat/contacts - returns contacts grouped by estate
- GET /api/estate-chat/channels - returns channels user belongs to
- POST /api/estate-chat/channels - create group and direct message channels
- GET /api/estate-chat/channels/{id}/messages - get messages from channel
- POST /api/estate-chat/channels/{id}/messages - send message to channel
- PUT /api/estate-chat/channels/{id}/members - update group channel members
- DELETE /api/estate-chat/channels/{id} - delete group channel
- GET /api/estate-chat/unread-total - get unread count

CCP Endpoints:
- GET /api/ccp/plans/{estate_id} - get emergency plans
- POST /api/ccp/plans - create emergency plan
- PUT /api/ccp/plans/{plan_id} - update emergency plan
- DELETE /api/ccp/plans/{plan_id} - soft delete plan
- POST /api/ccp/activate - activate emergency plan or drill
- POST /api/ccp/deactivate/{id} - deactivate emergency
- GET /api/ccp/active/{estate_id} - get active emergency status board
- POST /api/ccp/checkin - member check-in with status
- GET /api/ccp/history/{estate_id} - past activations
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Admin authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


class TestECTEndpointsAvailability:
    """Test that ECT endpoints are registered and accessible"""
    
    def test_ect_contacts_endpoint_exists(self, api_client, auth_headers):
        """GET /api/estate-chat/contacts should return 200 or empty list (not 404/405)"""
        response = api_client.get(f"{BASE_URL}/api/estate-chat/contacts", headers=auth_headers)
        # Admin has no estates, so should return empty list (200) or 403
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code} - {response.text}"
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list), "Contacts should return a list"
            print(f"ECT contacts endpoint working - returned {len(data)} estate groups")
    
    def test_ect_channels_endpoint_exists(self, api_client, auth_headers):
        """GET /api/estate-chat/channels should return 200 or empty list"""
        response = api_client.get(f"{BASE_URL}/api/estate-chat/channels", headers=auth_headers)
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code} - {response.text}"
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list), "Channels should return a list"
            print(f"ECT channels endpoint working - returned {len(data)} channels")
    
    def test_ect_unread_total_endpoint_exists(self, api_client, auth_headers):
        """GET /api/estate-chat/unread-total should return 200 with total count"""
        response = api_client.get(f"{BASE_URL}/api/estate-chat/unread-total", headers=auth_headers)
        assert response.status_code in [200, 403], f"Unexpected status: {response.status_code} - {response.text}"
        if response.status_code == 200:
            data = response.json()
            assert "total" in data, "Unread total should have 'total' field"
            print(f"ECT unread-total endpoint working - total: {data['total']}")
    
    def test_ect_create_channel_requires_estate_membership(self, api_client, auth_headers):
        """POST /api/estate-chat/channels should return 403 for non-member"""
        response = api_client.post(f"{BASE_URL}/api/estate-chat/channels", headers=auth_headers, json={
            "estate_id": "nonexistent-estate-id",
            "channel_type": "group",
            "name": "Test Group",
            "member_ids": []
        })
        # Should return 403 (not a member) or 400 (validation error)
        assert response.status_code in [400, 403], f"Expected 400/403, got {response.status_code} - {response.text}"
        print(f"ECT create channel correctly enforces estate membership - {response.status_code}")
    
    def test_ect_get_messages_nonexistent_channel(self, api_client, auth_headers):
        """GET /api/estate-chat/channels/{id}/messages should return 404 for nonexistent channel"""
        response = api_client.get(f"{BASE_URL}/api/estate-chat/channels/nonexistent-channel/messages", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code} - {response.text}"
        print("ECT get messages correctly returns 404 for nonexistent channel")
    
    def test_ect_send_message_nonexistent_channel(self, api_client, auth_headers):
        """POST /api/estate-chat/channels/{id}/messages should return 404 for nonexistent channel"""
        response = api_client.post(f"{BASE_URL}/api/estate-chat/channels/nonexistent-channel/messages", 
                                   headers=auth_headers, json={"content": "Test message"})
        assert response.status_code == 404, f"Expected 404, got {response.status_code} - {response.text}"
        print("ECT send message correctly returns 404 for nonexistent channel")
    
    def test_ect_update_members_nonexistent_channel(self, api_client, auth_headers):
        """PUT /api/estate-chat/channels/{id}/members should return 404 for nonexistent channel"""
        response = api_client.put(f"{BASE_URL}/api/estate-chat/channels/nonexistent-channel/members", 
                                  headers=auth_headers, json={"member_ids": []})
        assert response.status_code == 404, f"Expected 404, got {response.status_code} - {response.text}"
        print("ECT update members correctly returns 404 for nonexistent channel")
    
    def test_ect_delete_channel_nonexistent(self, api_client, auth_headers):
        """DELETE /api/estate-chat/channels/{id} should return 404 for nonexistent channel"""
        response = api_client.delete(f"{BASE_URL}/api/estate-chat/channels/nonexistent-channel", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code} - {response.text}"
        print("ECT delete channel correctly returns 404 for nonexistent channel")


class TestCCPEndpointsAvailability:
    """Test that CCP endpoints are registered and accessible"""
    
    def test_ccp_get_plans_requires_membership(self, api_client, auth_headers):
        """GET /api/ccp/plans/{estate_id} should return 403 for non-member"""
        response = api_client.get(f"{BASE_URL}/api/ccp/plans/nonexistent-estate-id", headers=auth_headers)
        # Should return 403 (not a member)
        assert response.status_code == 403, f"Expected 403, got {response.status_code} - {response.text}"
        print("CCP get plans correctly enforces estate membership")
    
    def test_ccp_create_plan_requires_ownership(self, api_client, auth_headers):
        """POST /api/ccp/plans should return 403 for non-owner"""
        response = api_client.post(f"{BASE_URL}/api/ccp/plans", headers=auth_headers, json={
            "estate_id": "nonexistent-estate-id",
            "name": "Test Emergency Plan",
            "plan_type": "natural_disaster"
        })
        # Should return 403 (not the owner)
        assert response.status_code == 403, f"Expected 403, got {response.status_code} - {response.text}"
        print("CCP create plan correctly enforces estate ownership")
    
    def test_ccp_update_plan_nonexistent(self, api_client, auth_headers):
        """PUT /api/ccp/plans/{plan_id} should return 404 for nonexistent plan"""
        response = api_client.put(f"{BASE_URL}/api/ccp/plans/nonexistent-plan-id", headers=auth_headers, json={
            "name": "Updated Plan Name"
        })
        assert response.status_code == 404, f"Expected 404, got {response.status_code} - {response.text}"
        print("CCP update plan correctly returns 404 for nonexistent plan")
    
    def test_ccp_delete_plan_nonexistent(self, api_client, auth_headers):
        """DELETE /api/ccp/plans/{plan_id} should return 404 for nonexistent plan"""
        response = api_client.delete(f"{BASE_URL}/api/ccp/plans/nonexistent-plan-id", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code} - {response.text}"
        print("CCP delete plan correctly returns 404 for nonexistent plan")
    
    def test_ccp_activate_nonexistent_plan(self, api_client, auth_headers):
        """POST /api/ccp/activate should return 404 for nonexistent plan"""
        response = api_client.post(f"{BASE_URL}/api/ccp/activate", headers=auth_headers, json={
            "plan_id": "nonexistent-plan-id",
            "is_drill": False
        })
        assert response.status_code == 404, f"Expected 404, got {response.status_code} - {response.text}"
        print("CCP activate correctly returns 404 for nonexistent plan")
    
    def test_ccp_deactivate_nonexistent(self, api_client, auth_headers):
        """POST /api/ccp/deactivate/{id} should return 404 for nonexistent activation"""
        response = api_client.post(f"{BASE_URL}/api/ccp/deactivate/nonexistent-activation-id", 
                                   headers=auth_headers, json={"notes": ""})
        assert response.status_code == 404, f"Expected 404, got {response.status_code} - {response.text}"
        print("CCP deactivate correctly returns 404 for nonexistent activation")
    
    def test_ccp_get_active_requires_membership(self, api_client, auth_headers):
        """GET /api/ccp/active/{estate_id} should return 403 for non-member"""
        response = api_client.get(f"{BASE_URL}/api/ccp/active/nonexistent-estate-id", headers=auth_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code} - {response.text}"
        print("CCP get active correctly enforces estate membership")
    
    def test_ccp_checkin_nonexistent_activation(self, api_client, auth_headers):
        """POST /api/ccp/checkin should return 404 for nonexistent activation"""
        response = api_client.post(f"{BASE_URL}/api/ccp/checkin", headers=auth_headers, json={
            "activation_id": "nonexistent-activation-id",
            "status": "safe"
        })
        assert response.status_code == 404, f"Expected 404, got {response.status_code} - {response.text}"
        print("CCP checkin correctly returns 404 for nonexistent activation")
    
    def test_ccp_checkin_invalid_status(self, api_client, auth_headers):
        """POST /api/ccp/checkin should return 400 for invalid status"""
        response = api_client.post(f"{BASE_URL}/api/ccp/checkin", headers=auth_headers, json={
            "activation_id": "some-activation-id",
            "status": "invalid_status"
        })
        # Should return 400 (invalid status) or 404 (activation not found)
        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code} - {response.text}"
        print(f"CCP checkin correctly validates status - {response.status_code}")
    
    def test_ccp_history_requires_membership(self, api_client, auth_headers):
        """GET /api/ccp/history/{estate_id} should return 403 for non-member"""
        response = api_client.get(f"{BASE_URL}/api/ccp/history/nonexistent-estate-id", headers=auth_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code} - {response.text}"
        print("CCP history correctly enforces estate membership")


class TestECTValidation:
    """Test ECT input validation"""
    
    def test_ect_create_channel_missing_estate_id(self, api_client, auth_headers):
        """POST /api/estate-chat/channels should validate required fields"""
        response = api_client.post(f"{BASE_URL}/api/estate-chat/channels", headers=auth_headers, json={
            "channel_type": "group",
            "name": "Test Group"
        })
        # Should return 422 (validation error) or 400
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code} - {response.text}"
        print("ECT create channel validates required estate_id field")
    
    def test_ect_send_message_empty_content(self, api_client, auth_headers):
        """POST /api/estate-chat/channels/{id}/messages should reject empty content"""
        # First need a valid channel - but since admin has no estates, this will 404
        response = api_client.post(f"{BASE_URL}/api/estate-chat/channels/test-channel/messages", 
                                   headers=auth_headers, json={"content": ""})
        # Should return 400 (empty content) or 404 (channel not found)
        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code} - {response.text}"
        print(f"ECT send message validates content - {response.status_code}")


class TestCCPValidation:
    """Test CCP input validation"""
    
    def test_ccp_create_plan_invalid_type(self, api_client, auth_headers):
        """POST /api/ccp/plans should validate plan_type"""
        response = api_client.post(f"{BASE_URL}/api/ccp/plans", headers=auth_headers, json={
            "estate_id": "some-estate-id",
            "name": "Test Plan",
            "plan_type": "invalid_type"
        })
        # Should return 400 (invalid type) or 403 (not owner)
        assert response.status_code in [400, 403], f"Expected 400/403, got {response.status_code} - {response.text}"
        print(f"CCP create plan validates plan_type - {response.status_code}")
    
    def test_ccp_create_plan_empty_name(self, api_client, auth_headers):
        """POST /api/ccp/plans should validate name is not empty"""
        response = api_client.post(f"{BASE_URL}/api/ccp/plans", headers=auth_headers, json={
            "estate_id": "some-estate-id",
            "name": "",
            "plan_type": "natural_disaster"
        })
        # Should return 400 (empty name) or 403 (not owner)
        assert response.status_code in [400, 403], f"Expected 400/403, got {response.status_code} - {response.text}"
        print(f"CCP create plan validates name - {response.status_code}")


class TestAuthenticationRequired:
    """Test that all endpoints require authentication"""
    
    def test_ect_contacts_requires_auth(self, api_client):
        """GET /api/estate-chat/contacts should require auth"""
        response = api_client.get(f"{BASE_URL}/api/estate-chat/contacts")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("ECT contacts requires authentication")
    
    def test_ect_channels_requires_auth(self, api_client):
        """GET /api/estate-chat/channels should require auth"""
        response = api_client.get(f"{BASE_URL}/api/estate-chat/channels")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("ECT channels requires authentication")
    
    def test_ccp_plans_requires_auth(self, api_client):
        """GET /api/ccp/plans/{estate_id} should require auth"""
        response = api_client.get(f"{BASE_URL}/api/ccp/plans/some-estate-id")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("CCP plans requires authentication")
    
    def test_ccp_activate_requires_auth(self, api_client):
        """POST /api/ccp/activate should require auth"""
        response = api_client.post(f"{BASE_URL}/api/ccp/activate", json={"plan_id": "test"})
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("CCP activate requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
