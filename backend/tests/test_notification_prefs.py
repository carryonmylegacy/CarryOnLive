"""
Test suite for Notification Preferences & Admin Categories feature.

Tests:
- GET /api/notification-prefs - returns user preferences with categories, auto-seeds defaults
- PUT /api/notification-prefs - updates master_enabled and/or individual toggles
- GET /api/admin/notification-categories - returns all categories, auto-seeds 5 defaults
- POST /api/admin/notification-categories - creates new category with auto-generated ID
- PUT /api/admin/notification-categories/{id} - updates category label/description/defaults
- DELETE /api/admin/notification-categories/{id} - soft deletes category
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


def get_admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if response.status_code == 200:
        data = response.json()
        # Try both token and access_token
        return data.get("access_token") or data.get("token")
    elif response.status_code == 202:
        # OTP required - use demo bypass
        otp_response = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={"email": ADMIN_EMAIL, "otp": "000000"})
        if otp_response.status_code == 200:
            data = otp_response.json()
            return data.get("access_token") or data.get("token")
    return None


# Module-level token cache
_admin_token = None


def get_auth_headers():
    """Get auth headers for requests"""
    global _admin_token
    if _admin_token is None:
        _admin_token = get_admin_token()
    if _admin_token is None:
        pytest.skip("Could not authenticate admin user")
    return {"Authorization": f"Bearer {_admin_token}", "Content-Type": "application/json"}


class TestNotificationPrefsSetup:
    """Setup and authentication tests"""

    def test_backend_health(self):
        """Verify backend is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Backend health check failed: {response.status_code}"
        print("✓ Backend health check passed")

    def test_admin_login(self):
        """Verify admin can login"""
        token = get_admin_token()
        assert token is not None, "Admin login failed"
        print("✓ Admin login successful")


class TestUserNotificationPrefs:
    """Tests for user notification preferences endpoints"""

    def test_get_notification_prefs_returns_200(self):
        """GET /api/notification-prefs returns user preferences with categories"""
        headers = get_auth_headers()
        response = requests.get(f"{BASE_URL}/api/notification-prefs", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        # Verify response structure
        assert "preferences" in data, "Response should contain 'preferences'"
        assert "categories" in data, "Response should contain 'categories'"

        prefs = data["preferences"]
        assert "master_enabled" in prefs, "Preferences should have 'master_enabled'"
        assert "toggles" in prefs, "Preferences should have 'toggles'"
        assert "user_id" in prefs, "Preferences should have 'user_id'"

        print(f"✓ GET /api/notification-prefs returns 200 with {len(data['categories'])} categories")

    def test_get_notification_prefs_auto_seeds_defaults(self):
        """GET /api/notification-prefs auto-seeds 5 default categories"""
        headers = get_auth_headers()
        response = requests.get(f"{BASE_URL}/api/notification-prefs", headers=headers)
        assert response.status_code == 200
        data = response.json()

        categories = data["categories"]
        # Should have at least 5 default categories
        assert len(categories) >= 5, f"Expected at least 5 categories, got {len(categories)}"

        # Verify default category IDs exist
        category_ids = [c["id"] for c in categories]
        expected_defaults = ["emergency_alerts", "estate_chat", "estate_updates", "milestone_messages", "system"]
        for expected_id in expected_defaults:
            assert expected_id in category_ids, f"Missing default category: {expected_id}"

        print(f"✓ Auto-seeded {len(categories)} categories including all 5 defaults")

    def test_get_notification_prefs_emergency_alerts_is_critical(self):
        """Emergency alerts category should have is_critical=true"""
        headers = get_auth_headers()
        response = requests.get(f"{BASE_URL}/api/notification-prefs", headers=headers)
        assert response.status_code == 200
        data = response.json()

        emergency_cat = next((c for c in data["categories"] if c["id"] == "emergency_alerts"), None)
        assert emergency_cat is not None, "emergency_alerts category not found"
        assert emergency_cat.get("is_critical"), "emergency_alerts should have is_critical=true"

        print("✓ emergency_alerts category has is_critical=true")

    def test_put_notification_prefs_update_master_enabled(self):
        """PUT /api/notification-prefs updates master_enabled"""
        headers = get_auth_headers()

        # First get current state
        get_response = requests.get(f"{BASE_URL}/api/notification-prefs", headers=headers)
        assert get_response.status_code == 200
        original_master = get_response.json()["preferences"]["master_enabled"]

        # Toggle master_enabled
        new_value = not original_master
        response = requests.put(
            f"{BASE_URL}/api/notification-prefs", headers=headers, json={"master_enabled": new_value}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.json().get("success")

        # Verify change persisted
        verify_response = requests.get(f"{BASE_URL}/api/notification-prefs", headers=headers)
        assert verify_response.status_code == 200
        assert verify_response.json()["preferences"]["master_enabled"] == new_value

        # Restore original value
        requests.put(f"{BASE_URL}/api/notification-prefs", headers=headers, json={"master_enabled": original_master})

        print(f"✓ PUT /api/notification-prefs successfully updated master_enabled to {new_value}")

    def test_put_notification_prefs_update_individual_toggles(self):
        """PUT /api/notification-prefs updates individual category toggles"""
        headers = get_auth_headers()

        # Get current state
        get_response = requests.get(f"{BASE_URL}/api/notification-prefs", headers=headers)
        assert get_response.status_code == 200
        original_toggles = get_response.json()["preferences"]["toggles"]

        # Toggle estate_chat
        original_estate_chat = original_toggles.get("estate_chat", True)
        new_value = not original_estate_chat

        response = requests.put(
            f"{BASE_URL}/api/notification-prefs", headers=headers, json={"toggles": {"estate_chat": new_value}}
        )
        assert response.status_code == 200
        assert response.json().get("success")

        # Verify change persisted
        verify_response = requests.get(f"{BASE_URL}/api/notification-prefs", headers=headers)
        assert verify_response.status_code == 200
        assert verify_response.json()["preferences"]["toggles"]["estate_chat"] == new_value

        # Restore original value
        requests.put(
            f"{BASE_URL}/api/notification-prefs",
            headers=headers,
            json={"toggles": {"estate_chat": original_estate_chat}},
        )

        print(f"✓ PUT /api/notification-prefs successfully updated estate_chat toggle to {new_value}")

    def test_notification_prefs_requires_auth(self):
        """Notification prefs endpoints require authentication"""
        # GET without auth
        response = requests.get(f"{BASE_URL}/api/notification-prefs")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"

        # PUT without auth
        response = requests.put(f"{BASE_URL}/api/notification-prefs", json={"master_enabled": False})
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"

        print("✓ Notification prefs endpoints require authentication")


class TestAdminNotificationCategories:
    """Tests for admin notification categories endpoints"""

    def test_get_admin_categories_returns_200(self):
        """GET /api/admin/notification-categories returns all categories"""
        headers = get_auth_headers()
        response = requests.get(f"{BASE_URL}/api/admin/notification-categories", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 5, f"Expected at least 5 categories, got {len(data)}"

        # Verify category structure
        if len(data) > 0:
            cat = data[0]
            assert "id" in cat, "Category should have 'id'"
            assert "label" in cat, "Category should have 'label'"
            assert "description" in cat, "Category should have 'description'"
            assert "default_enabled" in cat, "Category should have 'default_enabled'"
            assert "is_critical" in cat, "Category should have 'is_critical'"

        print(f"✓ GET /api/admin/notification-categories returns {len(data)} categories")

    def test_post_admin_categories_creates_new_category(self):
        """POST /api/admin/notification-categories creates new category with auto-generated ID"""
        headers = get_auth_headers()
        import time

        ts = int(time.time())
        test_label = f"TEST Weather Alerts {ts}"

        response = requests.post(
            f"{BASE_URL}/api/admin/notification-categories",
            headers=headers,
            json={
                "label": test_label,
                "description": "Weather-related notifications",
                "default_enabled": True,
                "is_critical": False,
            },
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        # Verify auto-generated ID
        assert "id" in data, "Response should contain 'id'"
        expected_id = f"test_weather_alerts_{ts}"  # lowercase, underscored, no parens
        assert data["id"] == expected_id, f"Expected ID '{expected_id}', got '{data['id']}'"

        assert data["label"] == test_label
        assert data["description"] == "Weather-related notifications"
        assert data["default_enabled"]
        assert not data["is_critical"]

        # Cleanup - delete the test category
        requests.delete(f"{BASE_URL}/api/admin/notification-categories/{data['id']}", headers=headers)

        print(f"✓ POST /api/admin/notification-categories created category with ID '{data['id']}'")

    def test_post_admin_categories_duplicate_returns_409(self):
        """POST /api/admin/notification-categories returns 409 for duplicate"""
        headers = get_auth_headers()
        # Try to create a category with same name as existing (System -> system)
        response = requests.post(
            f"{BASE_URL}/api/admin/notification-categories",
            headers=headers,
            json={
                "label": "System",  # Same as default "system" category
                "description": "Duplicate test",
                "default_enabled": True,
                "is_critical": False,
            },
        )
        assert response.status_code == 409, f"Expected 409 for duplicate, got {response.status_code}"

        print("✓ POST /api/admin/notification-categories returns 409 for duplicate category")

    def test_post_admin_categories_empty_label_returns_400(self):
        """POST /api/admin/notification-categories returns 400 for empty label"""
        headers = get_auth_headers()
        response = requests.post(
            f"{BASE_URL}/api/admin/notification-categories",
            headers=headers,
            json={
                "label": "   ",  # Empty/whitespace
                "description": "Test",
                "default_enabled": True,
                "is_critical": False,
            },
        )
        assert response.status_code == 400, f"Expected 400 for empty label, got {response.status_code}"

        print("✓ POST /api/admin/notification-categories returns 400 for empty label")

    def test_put_admin_categories_updates_category(self):
        """PUT /api/admin/notification-categories/{id} updates category"""
        headers = get_auth_headers()
        import time

        ts = int(time.time())

        # First create a test category
        create_response = requests.post(
            f"{BASE_URL}/api/admin/notification-categories",
            headers=headers,
            json={
                "label": f"TEST Update Category {ts}",
                "description": "Original description",
                "default_enabled": True,
                "is_critical": False,
            },
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        cat_id = create_response.json()["id"]

        # Update the category
        response = requests.put(
            f"{BASE_URL}/api/admin/notification-categories/{cat_id}",
            headers=headers,
            json={"label": f"TEST Updated Label {ts}", "description": "Updated description", "is_critical": True},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()

        assert data["label"] == f"TEST Updated Label {ts}"
        assert data["description"] == "Updated description"
        assert data["is_critical"]

        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/notification-categories/{cat_id}", headers=headers)

        print(f"✓ PUT /api/admin/notification-categories/{cat_id} successfully updated category")

    def test_put_admin_categories_nonexistent_returns_404(self):
        """PUT /api/admin/notification-categories/{id} returns 404 for nonexistent"""
        headers = get_auth_headers()
        response = requests.put(
            f"{BASE_URL}/api/admin/notification-categories/nonexistent_category_xyz",
            headers=headers,
            json={"label": "Test"},
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"

        print("✓ PUT /api/admin/notification-categories returns 404 for nonexistent category")

    def test_delete_admin_categories_soft_deletes(self):
        """DELETE /api/admin/notification-categories/{id} soft deletes category"""
        headers = get_auth_headers()

        # Use unique name with timestamp
        import time

        unique_label = f"TEST Delete Category {int(time.time())}"

        # First create a test category
        create_response = requests.post(
            f"{BASE_URL}/api/admin/notification-categories",
            headers=headers,
            json={"label": unique_label, "description": "To be deleted", "default_enabled": True, "is_critical": False},
        )
        assert create_response.status_code == 200
        cat_id = create_response.json()["id"]

        # Delete the category
        response = requests.delete(f"{BASE_URL}/api/admin/notification-categories/{cat_id}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.json().get("success")

        # Verify it's no longer in the list (soft deleted)
        list_response = requests.get(f"{BASE_URL}/api/admin/notification-categories", headers=headers)
        assert list_response.status_code == 200
        category_ids = [c["id"] for c in list_response.json()]
        assert cat_id not in category_ids, "Deleted category should not appear in list"

        print(f"✓ DELETE /api/admin/notification-categories/{cat_id} soft deleted category")

    def test_delete_admin_categories_nonexistent_returns_404(self):
        """DELETE /api/admin/notification-categories/{id} returns 404 for nonexistent"""
        headers = get_auth_headers()
        response = requests.delete(
            f"{BASE_URL}/api/admin/notification-categories/nonexistent_category_xyz", headers=headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"

        print("✓ DELETE /api/admin/notification-categories returns 404 for nonexistent category")

    def test_admin_categories_requires_admin_role(self):
        """Admin notification categories endpoints require admin role"""
        # GET without auth
        response = requests.get(f"{BASE_URL}/api/admin/notification-categories")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"

        # POST without auth
        response = requests.post(
            f"{BASE_URL}/api/admin/notification-categories", json={"label": "Test", "description": "Test"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"

        print("✓ Admin notification categories endpoints require admin role")


class TestCCPPushNotificationIntegration:
    """Code review tests for CCP push notification integration"""

    def test_ccp_activate_has_notify_call(self):
        """Verify CCP activate endpoint calls _notify_if_allowed"""
        ccp_file = "/app/backend/routes/connected_protocol.py"

        with open(ccp_file, "r") as f:
            content = f.read()

        # Check that _notify_if_allowed is defined
        assert "async def _notify_if_allowed" in content, "_notify_if_allowed helper not found"

        # Check that it's called in activate
        assert "asyncio.create_task(_notify_if_allowed" in content, "_notify_if_allowed not called in activate"

        # Check that should_notify is imported and used
        assert "from routes.notification_prefs import should_notify" in content, "should_notify not imported"
        assert 'await should_notify(user_id, "emergency_alerts")' in content, (
            "should_notify not called with emergency_alerts"
        )

        print("✓ CCP activate endpoint correctly calls _notify_if_allowed with should_notify check")

    def test_ccp_deactivate_has_notify_call(self):
        """Verify CCP deactivate endpoint calls _notify_if_allowed"""
        ccp_file = "/app/backend/routes/connected_protocol.py"

        with open(ccp_file, "r") as f:
            content = f.read()

        # Check deactivate function has notification call
        # Find the deactivate function and check for _notify_if_allowed
        deactivate_section = content[content.find("async def deactivate(") :]
        deactivate_end = deactivate_section.find("@router.")
        if deactivate_end > 0:
            deactivate_section = deactivate_section[:deactivate_end]

        assert "_notify_if_allowed" in deactivate_section, "_notify_if_allowed not called in deactivate"

        print("✓ CCP deactivate endpoint correctly calls _notify_if_allowed")

    def test_ccp_checkin_has_notify_call(self):
        """Verify CCP checkin endpoint calls _notify_if_allowed"""
        ccp_file = "/app/backend/routes/connected_protocol.py"

        with open(ccp_file, "r") as f:
            content = f.read()

        # Check checkin function has notification call
        checkin_section = content[content.find("async def check_in(") :]
        checkin_end = checkin_section.find("@router.")
        if checkin_end > 0:
            checkin_section = checkin_section[:checkin_end]

        assert "_notify_if_allowed" in checkin_section, "_notify_if_allowed not called in checkin"

        print("✓ CCP checkin endpoint correctly calls _notify_if_allowed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
