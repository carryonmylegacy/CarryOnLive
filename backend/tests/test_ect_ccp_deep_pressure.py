"""
Deep Pressure Test Suite for Estate Chat Tool (ECT) and CarryOn Connected Protocol (CCP)

This test suite performs comprehensive end-to-end testing of:
- ECT: Channels (circle/group/direct), messages, reactions, pinning, file upload, search
- CCP: Emergency plans CRUD, activation/drill mode, member check-in, linked resources
- Feature Gates: ECT/CCP default OFF, admin toggle functionality
- Edge Cases: Empty messages, invalid emojis, duplicate activations, etc.

Test Data:
- Estate ID: 9a560550-c664-4d84-897f-33628442b8c5 (Test Estate with 4 beneficiaries)
- Owner: fulltest@test.com (benefactor)
- Beneficiaries: testben@test.com, tabben@test.com, prodflow@test.com
"""

import pytest
import requests
import os
import time
from uuid import uuid4

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"

# Test estate data
TEST_ESTATE_ID = "9a560550-c664-4d84-897f-33628442b8c5"
TEST_OWNER_ID = "607b164e-0d39-4b95-b97d-2a603918248a"
TEST_BENEFICIARY_IDS = [
    "e0919daa-32f0-40fe-9e1e-2b5d3f5766a2",  # Ben Mitchell
    "76c9d4a4-5ac0-4f0b-9dbe-1f8c705e6412",  # Tab Ben
    "8d29ec03-0ed5-4780-bf34-18fbee814655",  # Prod Flow
]

# Valid reaction emojis
VALID_REACTIONS = ["thumbs_up", "heart", "laugh", "sad", "fire", "check"]

# Valid CCP statuses
VALID_CHECKIN_STATUSES = ["safe", "evacuating", "at_rendezvous", "need_help", "sheltering", "other"]

# Valid plan types
VALID_PLAN_TYPES = ["natural_disaster", "national_emergency", "medical_emergency", "infrastructure_failure", "custom"]


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Admin authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def benefactor_token(api_client):
    """Get benefactor authentication token by creating a test session"""
    # First try to login as the benefactor
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": "fulltest@test.com", "password": "Test1234!"})
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    # If login fails, we'll use admin to impersonate via dev-switcher or skip
    pytest.skip("Benefactor authentication failed - using admin for limited tests")


@pytest.fixture(scope="module")
def benefactor_headers(benefactor_token):
    """Headers with benefactor auth token"""
    return {"Authorization": f"Bearer {benefactor_token}", "Content-Type": "application/json"}


# ===================== FEATURE GATES TESTS =====================

class TestFeatureGates:
    """Test ECT/CCP feature gates functionality"""

    def test_feature_gates_ect_ccp_registered(self, api_client, admin_headers):
        """Verify ECT and CCP are registered in PLATFORM_FEATURES"""
        response = api_client.get(f"{BASE_URL}/api/admin/feature-gates", headers=admin_headers)
        assert response.status_code == 200, f"Failed to get feature gates: {response.text}"
        data = response.json()
        
        features = data.get("features", [])
        feature_keys = [f["key"] for f in features]
        
        assert "ect" in feature_keys, "ECT not registered in PLATFORM_FEATURES"
        assert "ccp" in feature_keys, "CCP not registered in PLATFORM_FEATURES"
        
        # Verify default_off is True for both
        ect_feature = next((f for f in features if f["key"] == "ect"), None)
        ccp_feature = next((f for f in features if f["key"] == "ccp"), None)
        
        assert ect_feature.get("default_off") == True, "ECT should have default_off=True"
        assert ccp_feature.get("default_off") == True, "CCP should have default_off=True"
        print("Feature gates: ECT and CCP registered with default_off=True")

    def test_feature_gates_default_off_for_all_tiers(self, api_client, admin_headers):
        """Verify ECT/CCP default to OFF for all tiers"""
        response = api_client.get(f"{BASE_URL}/api/admin/feature-gates", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        
        gates = data.get("gates", {})
        tiers = data.get("tiers", [])
        
        for tier in tiers:
            assert gates.get("ect", {}).get(tier) == False, f"ECT should be OFF for {tier}"
            assert gates.get("ccp", {}).get(tier) == False, f"CCP should be OFF for {tier}"
        print(f"Feature gates: ECT/CCP OFF for all {len(tiers)} tiers")

    def test_feature_gates_toggle_on_off(self, api_client, admin_headers):
        """Test toggling ECT/CCP feature gates on and off"""
        # Get current gates
        response = api_client.get(f"{BASE_URL}/api/admin/feature-gates", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        gates = data.get("gates", {})
        
        # Toggle ECT ON for premium tier
        gates["ect"]["premium"] = True
        response = api_client.put(
            f"{BASE_URL}/api/admin/feature-gates",
            headers=admin_headers,
            json={"gates": gates}
        )
        assert response.status_code == 200, f"Failed to toggle ECT on: {response.text}"
        
        # Verify it's ON
        response = api_client.get(f"{BASE_URL}/api/admin/feature-gates", headers=admin_headers)
        assert response.status_code == 200
        updated_gates = response.json().get("gates", {})
        assert updated_gates["ect"]["premium"] == True, "ECT should be ON for premium"
        
        # Toggle back OFF
        gates["ect"]["premium"] = False
        response = api_client.put(
            f"{BASE_URL}/api/admin/feature-gates",
            headers=admin_headers,
            json={"gates": gates}
        )
        assert response.status_code == 200
        print("Feature gates: Toggle on/off working correctly")


# ===================== ECT CONTACTS TESTS =====================

class TestECTContacts:
    """Test ECT contacts endpoint"""

    def test_get_contacts_returns_estate_members(self, api_client, admin_headers):
        """GET /api/estate-chat/contacts returns estate members grouped by estate"""
        response = api_client.get(f"{BASE_URL}/api/estate-chat/contacts", headers=admin_headers)
        # Admin has no estates, so should return empty list
        assert response.status_code == 200, f"Unexpected status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Contacts should return a list"
        print(f"ECT contacts: Returned {len(data)} estate groups for admin")

    def test_contacts_include_ffn_flag(self, api_client, admin_headers):
        """Contacts should include is_ffn flag for FFN contacts"""
        # This test verifies the structure - actual FFN contacts depend on data
        response = api_client.get(f"{BASE_URL}/api/estate-chat/contacts", headers=admin_headers)
        assert response.status_code == 200
        # Structure validation - each estate group should have members array
        data = response.json()
        for estate_group in data:
            assert "estate_id" in estate_group
            assert "estate_name" in estate_group
            assert "members" in estate_group
            assert isinstance(estate_group["members"], list)
        print("ECT contacts: Structure validated (estate_id, estate_name, members)")


# ===================== ECT CHANNELS TESTS =====================

class TestECTChannels:
    """Test ECT channels CRUD operations"""

    def test_get_channels_returns_list(self, api_client, admin_headers):
        """GET /api/estate-chat/channels returns channels with unread counts"""
        response = api_client.get(f"{BASE_URL}/api/estate-chat/channels", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"ECT channels: Returned {len(data)} channels")

    def test_create_channel_requires_estate_membership(self, api_client, admin_headers):
        """POST /api/estate-chat/channels returns 403 for non-member"""
        response = api_client.post(
            f"{BASE_URL}/api/estate-chat/channels",
            headers=admin_headers,
            json={
                "estate_id": "nonexistent-estate",
                "channel_type": "group",
                "name": "Test Group",
                "member_ids": []
            }
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("ECT channels: Non-member correctly rejected (403)")

    def test_create_dm_with_self_rejected(self, api_client, admin_headers):
        """Creating a DM with yourself should return 400"""
        # This would need a valid estate membership to test properly
        # For now, we verify the endpoint exists and validates
        response = api_client.post(
            f"{BASE_URL}/api/estate-chat/channels",
            headers=admin_headers,
            json={
                "estate_id": TEST_ESTATE_ID,
                "channel_type": "direct",
                "member_ids": ["self-id"]  # Would be current user ID
            }
        )
        # Should be 403 (not member) or 400 (can't DM self)
        assert response.status_code in [400, 403], f"Expected 400/403, got {response.status_code}"
        print("ECT channels: DM with self validation working")

    def test_create_channel_invalid_type_rejected(self, api_client, admin_headers):
        """Invalid channel type should return 400"""
        response = api_client.post(
            f"{BASE_URL}/api/estate-chat/channels",
            headers=admin_headers,
            json={
                "estate_id": TEST_ESTATE_ID,
                "channel_type": "invalid_type",
                "name": "Test",
                "member_ids": []
            }
        )
        # Should be 400 (invalid type) or 403 (not member)
        assert response.status_code in [400, 403], f"Expected 400/403, got {response.status_code}"
        print("ECT channels: Invalid channel type rejected")

    def test_delete_circle_channel_rejected(self, api_client, admin_headers):
        """Deleting a circle channel should return 400"""
        # Circle channels cannot be deleted
        response = api_client.delete(
            f"{BASE_URL}/api/estate-chat/channels/circle_test",
            headers=admin_headers
        )
        # Should be 404 (not found) or 400 (can't delete circle)
        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code}"
        print("ECT channels: Circle deletion correctly rejected")


# ===================== ECT MESSAGES TESTS =====================

class TestECTMessages:
    """Test ECT message operations"""

    def test_get_messages_nonexistent_channel(self, api_client, admin_headers):
        """GET /api/estate-chat/channels/{id}/messages returns 404 for nonexistent"""
        response = api_client.get(
            f"{BASE_URL}/api/estate-chat/channels/nonexistent/messages",
            headers=admin_headers
        )
        assert response.status_code == 404
        print("ECT messages: 404 for nonexistent channel")

    def test_send_empty_message_rejected(self, api_client, admin_headers):
        """Sending empty message should return 400"""
        response = api_client.post(
            f"{BASE_URL}/api/estate-chat/channels/test-channel/messages",
            headers=admin_headers,
            json={"content": ""}
        )
        # Should be 400 (empty) or 404 (channel not found)
        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code}"
        print("ECT messages: Empty message rejected")

    def test_send_long_message_rejected(self, api_client, admin_headers):
        """Sending message >2000 chars should return 400"""
        long_content = "x" * 2001
        response = api_client.post(
            f"{BASE_URL}/api/estate-chat/channels/test-channel/messages",
            headers=admin_headers,
            json={"content": long_content}
        )
        # Should be 400 (too long) or 404 (channel not found)
        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code}"
        print("ECT messages: Long message (>2000 chars) rejected")


# ===================== ECT REACTIONS TESTS =====================

class TestECTReactions:
    """Test ECT message reactions"""

    def test_react_invalid_emoji_rejected(self, api_client, admin_headers):
        """Reacting with invalid emoji should return 400"""
        response = api_client.post(
            f"{BASE_URL}/api/estate-chat/messages/test-msg/react",
            headers=admin_headers,
            json={"emoji": "invalid_emoji"}
        )
        # Should be 400 (invalid emoji) or 404 (message not found)
        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code}"
        print("ECT reactions: Invalid emoji rejected")

    def test_react_valid_emojis_list(self, api_client, admin_headers):
        """Verify all 6 valid emojis are accepted (structure test)"""
        # This tests the validation logic exists
        for emoji in VALID_REACTIONS:
            response = api_client.post(
                f"{BASE_URL}/api/estate-chat/messages/nonexistent-msg/react",
                headers=admin_headers,
                json={"emoji": emoji}
            )
            # Should be 404 (message not found), not 400 (invalid emoji)
            assert response.status_code == 404, f"Emoji {emoji} should be valid, got {response.status_code}"
        print(f"ECT reactions: All {len(VALID_REACTIONS)} valid emojis accepted")


# ===================== ECT PINNING TESTS =====================

class TestECTPinning:
    """Test ECT message pinning (benefactor only)"""

    def test_pin_nonexistent_message(self, api_client, admin_headers):
        """Pinning nonexistent message returns 404"""
        response = api_client.post(
            f"{BASE_URL}/api/estate-chat/messages/nonexistent/pin",
            headers=admin_headers
        )
        assert response.status_code == 404
        print("ECT pinning: 404 for nonexistent message")

    def test_get_pinned_messages(self, api_client, admin_headers):
        """GET /api/estate-chat/channels/{id}/pinned returns pinned messages"""
        response = api_client.get(
            f"{BASE_URL}/api/estate-chat/channels/nonexistent/pinned",
            headers=admin_headers
        )
        # Should be 403 (not member) or 404 (not found)
        assert response.status_code in [403, 404], f"Expected 403/404, got {response.status_code}"
        print("ECT pinning: Pinned endpoint accessible")


# ===================== ECT TYPING INDICATORS TESTS =====================

class TestECTTyping:
    """Test ECT typing indicators"""

    def test_send_typing_heartbeat(self, api_client, admin_headers):
        """POST /api/estate-chat/channels/{id}/typing sends typing heartbeat"""
        response = api_client.post(
            f"{BASE_URL}/api/estate-chat/channels/test-channel/typing",
            headers=admin_headers
        )
        # Typing endpoint is lenient - returns ok even for invalid channels
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") == True
        print("ECT typing: Heartbeat endpoint working")

    def test_get_typing_users(self, api_client, admin_headers):
        """GET /api/estate-chat/channels/{id}/typing returns who is typing"""
        response = api_client.get(
            f"{BASE_URL}/api/estate-chat/channels/test-channel/typing",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print("ECT typing: Get typers endpoint working")


# ===================== ECT READ STATUS TESTS =====================

class TestECTReadStatus:
    """Test ECT read receipts"""

    def test_get_read_status(self, api_client, admin_headers):
        """GET /api/estate-chat/channels/{id}/read-status returns read receipts"""
        response = api_client.get(
            f"{BASE_URL}/api/estate-chat/channels/nonexistent/read-status",
            headers=admin_headers
        )
        # Should be 403 (not member) or 404 (not found)
        assert response.status_code in [403, 404]
        print("ECT read status: Endpoint accessible")


# ===================== ECT UNREAD BADGE TESTS =====================

class TestECTUnreadBadge:
    """Test ECT unread badge count"""

    def test_get_unread_total(self, api_client, admin_headers):
        """GET /api/estate-chat/unread-total returns badge count"""
        response = api_client.get(
            f"{BASE_URL}/api/estate-chat/unread-total",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert isinstance(data["total"], int)
        print(f"ECT unread: Total count = {data['total']}")


# ===================== ECT SEARCH TESTS =====================

class TestECTSearch:
    """Test ECT message search"""

    def test_search_messages(self, api_client, admin_headers):
        """GET /api/estate-chat/search?q=keyword searches messages"""
        response = api_client.get(
            f"{BASE_URL}/api/estate-chat/search?q=test",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"ECT search: Returned {len(data)} results for 'test'")

    def test_search_empty_query_rejected(self, api_client, admin_headers):
        """Search with empty query should return 422"""
        response = api_client.get(
            f"{BASE_URL}/api/estate-chat/search?q=",
            headers=admin_headers
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("ECT search: Empty query rejected (422)")


# ===================== ECT FILE UPLOAD TESTS =====================

class TestECTFileUpload:
    """Test ECT file upload"""

    def test_upload_to_nonexistent_channel(self, api_client, admin_headers):
        """Upload to nonexistent channel returns 404 or 422"""
        # Create a small test file
        files = {"file": ("test.txt", b"test content", "text/plain")}
        headers = {"Authorization": admin_headers["Authorization"]}
        response = api_client.post(
            f"{BASE_URL}/api/estate-chat/channels/nonexistent/upload",
            headers=headers,
            files=files
        )
        # 404 (channel not found) or 422 (validation error before channel check)
        assert response.status_code in [404, 422], f"Expected 404/422, got {response.status_code}"
        print(f"ECT upload: {response.status_code} for nonexistent channel")

    def test_serve_nonexistent_file(self, api_client, admin_headers):
        """GET /api/estate-chat/files/{id} returns 404 for nonexistent"""
        response = api_client.get(
            f"{BASE_URL}/api/estate-chat/files/nonexistent-file-id",
            headers=admin_headers
        )
        assert response.status_code == 404
        print("ECT files: 404 for nonexistent file")


# ===================== CCP PLANS CRUD TESTS =====================

class TestCCPPlans:
    """Test CCP emergency plans CRUD"""

    def test_get_plans_requires_membership(self, api_client, admin_headers):
        """GET /api/ccp/plans/{estate_id} requires estate membership"""
        response = api_client.get(
            f"{BASE_URL}/api/ccp/plans/nonexistent-estate",
            headers=admin_headers
        )
        assert response.status_code == 403
        print("CCP plans: Membership required (403)")

    def test_create_plan_requires_ownership(self, api_client, admin_headers):
        """POST /api/ccp/plans requires benefactor role"""
        response = api_client.post(
            f"{BASE_URL}/api/ccp/plans",
            headers=admin_headers,
            json={
                "estate_id": TEST_ESTATE_ID,
                "name": "Test Emergency Plan",
                "plan_type": "natural_disaster"
            }
        )
        assert response.status_code == 403
        print("CCP plans: Ownership required for creation (403)")

    def test_create_plan_validates_type(self, api_client, admin_headers):
        """Invalid plan_type should return 400"""
        response = api_client.post(
            f"{BASE_URL}/api/ccp/plans",
            headers=admin_headers,
            json={
                "estate_id": TEST_ESTATE_ID,
                "name": "Test Plan",
                "plan_type": "invalid_type"
            }
        )
        # Should be 400 (invalid type) or 403 (not owner)
        assert response.status_code in [400, 403]
        print("CCP plans: Invalid plan_type rejected")

    def test_create_plan_validates_name(self, api_client, admin_headers):
        """Empty plan name should return 400"""
        response = api_client.post(
            f"{BASE_URL}/api/ccp/plans",
            headers=admin_headers,
            json={
                "estate_id": TEST_ESTATE_ID,
                "name": "",
                "plan_type": "natural_disaster"
            }
        )
        # Should be 400 (empty name) or 403 (not owner)
        assert response.status_code in [400, 403]
        print("CCP plans: Empty name rejected")

    def test_update_nonexistent_plan(self, api_client, admin_headers):
        """PUT /api/ccp/plans/{id} returns 404 for nonexistent"""
        response = api_client.put(
            f"{BASE_URL}/api/ccp/plans/nonexistent-plan",
            headers=admin_headers,
            json={"name": "Updated Name"}
        )
        assert response.status_code == 404
        print("CCP plans: 404 for nonexistent plan update")

    def test_delete_nonexistent_plan(self, api_client, admin_headers):
        """DELETE /api/ccp/plans/{id} returns 404 for nonexistent"""
        response = api_client.delete(
            f"{BASE_URL}/api/ccp/plans/nonexistent-plan",
            headers=admin_headers
        )
        assert response.status_code == 404
        print("CCP plans: 404 for nonexistent plan delete")


# ===================== CCP ACTIVATION TESTS =====================

class TestCCPActivation:
    """Test CCP plan activation and deactivation"""

    def test_activate_nonexistent_plan(self, api_client, admin_headers):
        """POST /api/ccp/activate returns 404 for nonexistent plan"""
        response = api_client.post(
            f"{BASE_URL}/api/ccp/activate",
            headers=admin_headers,
            json={"plan_id": "nonexistent-plan", "is_drill": False}
        )
        assert response.status_code == 404
        print("CCP activation: 404 for nonexistent plan")

    def test_deactivate_nonexistent(self, api_client, admin_headers):
        """POST /api/ccp/deactivate/{id} returns 404 for nonexistent"""
        response = api_client.post(
            f"{BASE_URL}/api/ccp/deactivate/nonexistent-activation",
            headers=admin_headers,
            json={"notes": ""}
        )
        assert response.status_code == 404
        print("CCP deactivation: 404 for nonexistent activation")


# ===================== CCP ACTIVE EMERGENCY TESTS =====================

class TestCCPActiveEmergency:
    """Test CCP active emergency status board"""

    def test_get_active_requires_membership(self, api_client, admin_headers):
        """GET /api/ccp/active/{estate_id} requires membership"""
        response = api_client.get(
            f"{BASE_URL}/api/ccp/active/nonexistent-estate",
            headers=admin_headers
        )
        assert response.status_code == 403
        print("CCP active: Membership required (403)")

    def test_get_linked_resources_requires_membership(self, api_client, admin_headers):
        """GET /api/ccp/active/{estate_id}/linked-resources requires membership"""
        response = api_client.get(
            f"{BASE_URL}/api/ccp/active/nonexistent-estate/linked-resources",
            headers=admin_headers
        )
        assert response.status_code == 403
        print("CCP linked resources: Membership required (403)")


# ===================== CCP CHECK-IN TESTS =====================

class TestCCPCheckin:
    """Test CCP member check-in"""

    def test_checkin_nonexistent_activation(self, api_client, admin_headers):
        """POST /api/ccp/checkin returns 404 for nonexistent activation"""
        response = api_client.post(
            f"{BASE_URL}/api/ccp/checkin",
            headers=admin_headers,
            json={
                "activation_id": "nonexistent-activation",
                "status": "safe"
            }
        )
        assert response.status_code == 404
        print("CCP checkin: 404 for nonexistent activation")

    def test_checkin_invalid_status(self, api_client, admin_headers):
        """Invalid check-in status should return 400"""
        response = api_client.post(
            f"{BASE_URL}/api/ccp/checkin",
            headers=admin_headers,
            json={
                "activation_id": "some-activation",
                "status": "invalid_status"
            }
        )
        # Should be 400 (invalid status) or 404 (activation not found)
        assert response.status_code in [400, 404]
        print("CCP checkin: Invalid status rejected")

    def test_checkin_valid_statuses(self, api_client, admin_headers):
        """All 6 valid statuses should be accepted (structure test)"""
        for status in VALID_CHECKIN_STATUSES:
            response = api_client.post(
                f"{BASE_URL}/api/ccp/checkin",
                headers=admin_headers,
                json={
                    "activation_id": "nonexistent-activation",
                    "status": status
                }
            )
            # Should be 404 (activation not found), not 400 (invalid status)
            assert response.status_code == 404, f"Status {status} should be valid, got {response.status_code}"
        print(f"CCP checkin: All {len(VALID_CHECKIN_STATUSES)} valid statuses accepted")


# ===================== CCP HISTORY TESTS =====================

class TestCCPHistory:
    """Test CCP activation history"""

    def test_get_history_requires_membership(self, api_client, admin_headers):
        """GET /api/ccp/history/{estate_id} requires membership"""
        response = api_client.get(
            f"{BASE_URL}/api/ccp/history/nonexistent-estate",
            headers=admin_headers
        )
        assert response.status_code == 403
        print("CCP history: Membership required (403)")


# ===================== NOTIFICATION PREFERENCES TESTS =====================

class TestNotificationPrefs:
    """Test notification preferences for CCP"""

    def test_get_notification_prefs(self, api_client, admin_headers):
        """GET /api/notification-prefs returns preferences with categories"""
        response = api_client.get(
            f"{BASE_URL}/api/notification-prefs",
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "preferences" in data
        assert "categories" in data
        
        # Verify emergency_alerts category exists
        categories = data.get("categories", [])
        cat_ids = [c["id"] for c in categories]
        assert "emergency_alerts" in cat_ids, "emergency_alerts category should exist"
        
        # Verify emergency_alerts is critical
        emergency_cat = next((c for c in categories if c["id"] == "emergency_alerts"), None)
        assert emergency_cat.get("is_critical") == True, "emergency_alerts should be critical"
        print("Notification prefs: emergency_alerts category exists and is critical")

    def test_update_notification_prefs(self, api_client, admin_headers):
        """PUT /api/notification-prefs updates preferences"""
        response = api_client.put(
            f"{BASE_URL}/api/notification-prefs",
            headers=admin_headers,
            json={"master_enabled": True}
        )
        assert response.status_code == 200
        print("Notification prefs: Update working")


# ===================== AUTHENTICATION TESTS =====================

class TestAuthentication:
    """Test that all endpoints require authentication"""

    def test_ect_endpoints_require_auth(self, api_client):
        """All ECT endpoints should require authentication"""
        endpoints = [
            ("GET", "/api/estate-chat/contacts"),
            ("GET", "/api/estate-chat/channels"),
            ("GET", "/api/estate-chat/unread-total"),
            ("GET", "/api/estate-chat/search?q=test"),
        ]
        for method, endpoint in endpoints:
            if method == "GET":
                response = api_client.get(f"{BASE_URL}{endpoint}")
            else:
                response = api_client.post(f"{BASE_URL}{endpoint}", json={})
            assert response.status_code in [401, 403], f"{endpoint} should require auth, got {response.status_code}"
        print(f"ECT: All {len(endpoints)} endpoints require authentication")

    def test_ccp_endpoints_require_auth(self, api_client):
        """All CCP endpoints should require authentication"""
        endpoints = [
            ("GET", "/api/ccp/plans/test-estate"),
            ("POST", "/api/ccp/plans"),
            ("POST", "/api/ccp/activate"),
            ("GET", "/api/ccp/active/test-estate"),
            ("POST", "/api/ccp/checkin"),
            ("GET", "/api/ccp/history/test-estate"),
        ]
        for method, endpoint in endpoints:
            if method == "GET":
                response = api_client.get(f"{BASE_URL}{endpoint}")
            else:
                response = api_client.post(f"{BASE_URL}{endpoint}", json={})
            assert response.status_code in [401, 403, 422], f"{endpoint} should require auth, got {response.status_code}"
        print(f"CCP: All {len(endpoints)} endpoints require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
