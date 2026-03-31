"""
CarryOn™ — Phase 2 & Phase 3 Features Test Suite

Tests for:
- Session Policy (Admin session inactivity timeout)
- Team Chat (Internal messaging/team chat)
- Shift Scheduling
- Training Completion Tracker
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    data = response.json()
    token = data.get("access_token")
    if not token:
        pytest.skip("No access_token in login response")
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    """Get auth headers for API calls"""
    return {"Authorization": f"Bearer {admin_token}"}


# ============== SESSION POLICY TESTS ==============

class TestSessionPolicy:
    """Session Policy endpoint tests"""

    def test_get_session_policies_returns_5_roles(self, auth_headers):
        """GET /api/admin/session-policy returns 5 role types"""
        response = requests.get(f"{BASE_URL}/api/admin/session-policy", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 5, f"Expected 5 role types, got {len(data)}"
        
        role_types = [p["role_type"] for p in data]
        expected_roles = ["admin", "manager", "worker", "benefactor", "beneficiary"]
        for role in expected_roles:
            assert role in role_types, f"Missing role type: {role}"
        
        # Verify structure
        for policy in data:
            assert "role_type" in policy
            assert "label" in policy
            assert "timeout_minutes" in policy
            assert "enabled" in policy
            assert isinstance(policy["enabled"], bool)

    def test_update_session_policy(self, auth_headers):
        """PUT /api/admin/session-policy updates a role's timeout and enabled state"""
        # First get current state
        get_response = requests.get(f"{BASE_URL}/api/admin/session-policy", headers=auth_headers)
        assert get_response.status_code == 200
        
        # Update worker policy
        update_data = {
            "role_type": "worker",
            "timeout_minutes": 30,
            "enabled": True
        }
        response = requests.put(
            f"{BASE_URL}/api/admin/session-policy",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("success") is True
        assert result.get("role_type") == "worker"
        assert result.get("enabled") is True
        
        # Verify the update persisted
        verify_response = requests.get(f"{BASE_URL}/api/admin/session-policy", headers=auth_headers)
        assert verify_response.status_code == 200
        policies = verify_response.json()
        worker_policy = next((p for p in policies if p["role_type"] == "worker"), None)
        assert worker_policy is not None
        assert worker_policy["enabled"] is True
        assert worker_policy["timeout_minutes"] == 30
        
        # Reset to disabled
        reset_data = {
            "role_type": "worker",
            "timeout_minutes": 15,
            "enabled": False
        }
        requests.put(f"{BASE_URL}/api/admin/session-policy", json=reset_data, headers=auth_headers)

    def test_session_policy_invalid_role_type(self, auth_headers):
        """PUT /api/admin/session-policy rejects invalid role type"""
        update_data = {
            "role_type": "invalid_role",
            "timeout_minutes": 30,
            "enabled": True
        }
        response = requests.put(
            f"{BASE_URL}/api/admin/session-policy",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 400

    def test_session_policy_invalid_timeout(self, auth_headers):
        """PUT /api/admin/session-policy rejects invalid timeout values"""
        # Timeout too low
        update_data = {
            "role_type": "worker",
            "timeout_minutes": 0,
            "enabled": True
        }
        response = requests.put(
            f"{BASE_URL}/api/admin/session-policy",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 400

    def test_auth_me_returns_session_timeout(self, auth_headers):
        """GET /api/auth/me returns session_timeout_minutes field"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "session_timeout_minutes" in data, "session_timeout_minutes field missing from /auth/me"


# ============== TEAM CHAT TESTS ==============

class TestTeamChat:
    """Team Chat endpoint tests"""

    def test_get_channels_returns_6_system_channels(self, auth_headers):
        """GET /api/team/channels returns 6 system channels"""
        response = requests.get(f"{BASE_URL}/api/team/channels", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        system_channels = [c for c in data if c.get("type") == "system"]
        assert len(system_channels) == 6, f"Expected 6 system channels, got {len(system_channels)}"
        
        expected_ids = ["general", "ops", "finance", "marketing", "compliance", "platform"]
        channel_ids = [c["id"] for c in system_channels]
        for expected_id in expected_ids:
            assert expected_id in channel_ids, f"Missing system channel: {expected_id}"

    def test_send_message_and_retrieve(self, auth_headers):
        """POST /api/team/messages sends a message and returns it"""
        import uuid
        test_content = f"Test message {uuid.uuid4().hex[:8]}"
        
        # Send message to general channel
        send_data = {
            "channel_id": "general",
            "content": test_content
        }
        response = requests.post(
            f"{BASE_URL}/api/team/messages",
            json=send_data,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        message = response.json()
        assert message.get("content") == test_content
        assert message.get("channel_id") == "general"
        assert "id" in message
        assert "sender_id" in message
        assert "sender_name" in message
        assert "created_at" in message

    def test_get_messages_chronological_order(self, auth_headers):
        """GET /api/team/messages/{channel_id} returns messages in chronological order"""
        response = requests.get(
            f"{BASE_URL}/api/team/messages/general",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        messages = response.json()
        assert isinstance(messages, list), "Response should be a list"
        
        # Verify chronological order (oldest first)
        if len(messages) >= 2:
            for i in range(len(messages) - 1):
                assert messages[i]["created_at"] <= messages[i + 1]["created_at"], \
                    "Messages should be in chronological order"

    def test_send_empty_message_rejected(self, auth_headers):
        """POST /api/team/messages rejects empty messages"""
        send_data = {
            "channel_id": "general",
            "content": "   "
        }
        response = requests.post(
            f"{BASE_URL}/api/team/messages",
            json=send_data,
            headers=auth_headers
        )
        assert response.status_code == 400

    def test_get_staff_members(self, auth_headers):
        """GET /api/team/staff returns list of staff members"""
        response = requests.get(f"{BASE_URL}/api/team/staff", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify structure if there are staff members
        if len(data) > 0:
            staff = data[0]
            assert "id" in staff
            assert "name" in staff
            assert "role" in staff


# ============== SHIFT SCHEDULING TESTS ==============

class TestShiftScheduling:
    """Shift Scheduling endpoint tests"""

    def test_get_shifts(self, auth_headers):
        """GET /api/ops/shifts returns shifts with operator names"""
        response = requests.get(f"{BASE_URL}/api/ops/shifts", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"

    def test_create_shift_validation(self, auth_headers):
        """POST /api/ops/shifts validates shift type"""
        # Invalid shift type
        shift_data = {
            "operator_id": "test-id",
            "shift_type": "invalid_type",
            "date": "2026-01-15"
        }
        response = requests.post(
            f"{BASE_URL}/api/ops/shifts",
            json=shift_data,
            headers=auth_headers
        )
        assert response.status_code == 400, f"Expected 400 for invalid shift type, got {response.status_code}"

    def test_get_shift_summary(self, auth_headers):
        """GET /api/ops/shifts/summary returns weekly coverage data"""
        response = requests.get(f"{BASE_URL}/api/ops/shifts/summary", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "week_start" in data
        assert "summary" in data
        assert isinstance(data["summary"], list)
        assert len(data["summary"]) == 7, "Summary should have 7 days"
        
        # Verify structure of each day
        for day in data["summary"]:
            assert "date" in day
            assert "day_name" in day
            assert "total" in day
            assert "by_type" in day
            assert isinstance(day["by_type"], dict)

    def test_update_nonexistent_shift(self, auth_headers):
        """PUT /api/ops/shifts/{id} returns 404 for non-existent shift"""
        response = requests.put(
            f"{BASE_URL}/api/ops/shifts/nonexistent-shift-id",
            json={"status": "confirmed"},
            headers=auth_headers
        )
        assert response.status_code == 404

    def test_delete_nonexistent_shift(self, auth_headers):
        """DELETE /api/ops/shifts/{id} returns 404 for non-existent shift"""
        response = requests.delete(
            f"{BASE_URL}/api/ops/shifts/nonexistent-shift-id",
            headers=auth_headers
        )
        assert response.status_code == 404


# ============== TRAINING TRACKER TESTS ==============

class TestTrainingTracker:
    """Training Tracker endpoint tests"""

    def test_get_training_modules(self, auth_headers):
        """GET /api/ops/training/modules returns training modules"""
        response = requests.get(f"{BASE_URL}/api/ops/training/modules", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Verify structure if there are modules
        if len(data) > 0:
            module = data[0]
            assert "id" in module
            assert "title" in module
            assert "completed" in module
            assert isinstance(module["completed"], bool)

    def test_mark_training_complete(self, auth_headers):
        """POST /api/ops/training/complete marks a module as completed"""
        # First get modules
        modules_response = requests.get(f"{BASE_URL}/api/ops/training/modules", headers=auth_headers)
        assert modules_response.status_code == 200
        
        modules = modules_response.json()
        if len(modules) == 0:
            pytest.skip("No training modules available to test")
        
        # Find an uncompleted module or use first one
        test_module = next((m for m in modules if not m.get("completed")), modules[0])
        module_id = test_module["id"]
        
        # Mark as complete
        response = requests.post(
            f"{BASE_URL}/api/ops/training/complete",
            json={"article_id": module_id},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("success") is True or result.get("already_completed") is True

    def test_get_team_progress(self, auth_headers):
        """GET /api/ops/training/team-progress returns team completion percentages"""
        response = requests.get(f"{BASE_URL}/api/ops/training/team-progress", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "progress" in data
        assert "total_modules" in data
        assert isinstance(data["progress"], list)
        
        # Verify structure of progress entries
        if len(data["progress"]) > 0:
            member = data["progress"][0]
            assert "user_id" in member
            assert "name" in member
            assert "completed" in member
            assert "total" in member
            assert "percentage" in member
            assert isinstance(member["percentage"], int)


# ============== INTEGRATION TESTS ==============

class TestIntegration:
    """Integration tests for cross-feature functionality"""

    def test_full_shift_lifecycle(self, auth_headers):
        """Test create -> update -> delete shift flow"""
        # Get staff to find an operator
        staff_response = requests.get(f"{BASE_URL}/api/team/staff", headers=auth_headers)
        if staff_response.status_code != 200 or len(staff_response.json()) == 0:
            # Use admin's own ID from /auth/me
            me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
            assert me_response.status_code == 200
            operator_id = me_response.json()["id"]
        else:
            operator_id = staff_response.json()[0]["id"]
        
        # Create shift
        import uuid
        test_date = "2026-02-15"
        shift_data = {
            "operator_id": operator_id,
            "shift_type": "day",
            "date": test_date,
            "notes": f"Test shift {uuid.uuid4().hex[:8]}"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/ops/shifts",
            json=shift_data,
            headers=auth_headers
        )
        
        if create_response.status_code == 409:
            # Shift already exists, skip this test
            pytest.skip("Shift already exists for this date/operator")
        
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        shift = create_response.json()
        shift_id = shift["id"]
        
        # Update shift status
        update_response = requests.put(
            f"{BASE_URL}/api/ops/shifts/{shift_id}",
            json={"status": "confirmed"},
            headers=auth_headers
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Delete (cancel) shift
        delete_response = requests.delete(
            f"{BASE_URL}/api/ops/shifts/{shift_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
