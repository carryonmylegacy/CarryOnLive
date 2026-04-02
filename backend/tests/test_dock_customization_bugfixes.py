"""
Test suite for dock customization feature and bug fixes:
1. ECT delete - toast import fix (code review)
2. MM download - navigator.share bypass (code review)
3. ECT keyboard - iOS scroll listener (code review)
4. NEW: Dock customization backend API
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestDockCustomizationAPI:
    """Test the new dock customization backend endpoints."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token."""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Login as admin
        login_res = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": "info@carryon.us", "password": "Demo1234!"}
        )
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Login failed - cannot test dock API")

    def test_get_dock_preferences_empty(self):
        """GET /api/user-preferences/dock returns empty items for new user."""
        res = self.session.get(f"{BASE_URL}/api/user-preferences/dock")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "items" in data, "Response should have 'items' field"
        assert isinstance(data["items"], list), "items should be a list"

    def test_save_dock_preferences(self):
        """PUT /api/user-preferences/dock saves dock items."""
        test_items = ["/admin", "/admin/support", "/admin/dts", "/admin/verifications", "/settings"]
        res = self.session.put(f"{BASE_URL}/api/user-preferences/dock", json={"items": test_items})
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["items"] == test_items, f"Expected {test_items}, got {data['items']}"

    def test_get_dock_preferences_after_save(self):
        """GET /api/user-preferences/dock returns saved items."""
        # First save
        test_items = ["/admin/transition", "/admin/support", "/admin", "/admin/dts", "/admin/verifications"]
        self.session.put(f"{BASE_URL}/api/user-preferences/dock", json={"items": test_items})

        # Then get
        res = self.session.get(f"{BASE_URL}/api/user-preferences/dock")
        assert res.status_code == 200
        data = res.json()
        assert data["items"] == test_items, f"Expected {test_items}, got {data['items']}"

    def test_dock_preferences_max_5_items(self):
        """PUT /api/user-preferences/dock truncates to max 5 items."""
        too_many_items = ["/a", "/b", "/c", "/d", "/e", "/f", "/g"]
        res = self.session.put(f"{BASE_URL}/api/user-preferences/dock", json={"items": too_many_items})
        assert res.status_code == 200
        data = res.json()
        assert len(data["items"]) == 5, f"Expected 5 items, got {len(data['items'])}"
        assert data["items"] == too_many_items[:5], "Should keep first 5 items"

    def test_dock_preferences_empty_items(self):
        """PUT /api/user-preferences/dock accepts empty items list."""
        res = self.session.put(f"{BASE_URL}/api/user-preferences/dock", json={"items": []})
        assert res.status_code == 200
        data = res.json()
        assert data["items"] == [], "Should accept empty items"

    def test_dock_preferences_unauthorized(self):
        """GET /api/user-preferences/dock requires auth."""
        no_auth_session = requests.Session()
        res = no_auth_session.get(f"{BASE_URL}/api/user-preferences/dock")
        assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"


class TestHealthCheck:
    """Basic health check."""

    def test_api_health(self):
        """API health endpoint returns healthy."""
        res = requests.get(f"{BASE_URL}/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
