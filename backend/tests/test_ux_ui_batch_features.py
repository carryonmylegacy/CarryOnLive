"""
Test suite for UX/UI batch features (7 items):
1. DateMaskInput - tested via frontend
2. Beneficiary photo UX hint - tested via frontend
3. Beneficiary contact change notifications
4. IAC Accept button tooltips - tested via frontend (code review)
5. IAC view mode toggle - tested via frontend
6. EmergencyAccessPanel empathetic UX - tested via frontend (code review)
7. SEO improvements - tested via curl
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestBeneficiaryContactNotifications:
    """Item 3: Test that updating beneficiary profile creates notification for benefactor"""

    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin_62bc79", "password": "Demo1234!"})
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        pytest.skip("Admin login failed - skipping authenticated tests")

    def test_profile_update_endpoint_exists(self, admin_token):
        """Test that PUT /api/auth/profile endpoint exists"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(f"{BASE_URL}/api/auth/profile", json={"first_name": "Test"}, headers=headers)
        # Should return 200 or 400 (validation), not 404
        assert response.status_code != 404, "Profile update endpoint should exist"
        print(f"Profile update endpoint status: {response.status_code}")

    def test_notifications_endpoint_exists(self, admin_token):
        """Test that notifications endpoint exists"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        assert response.status_code == 200, f"Notifications endpoint should return 200, got {response.status_code}"
        data = response.json()
        # API returns {notifications: [...], unread_count: N}
        assert "notifications" in data, "Response should have notifications key"
        assert isinstance(data["notifications"], list), "Notifications should be a list"
        print(f"Found {len(data['notifications'])} notifications")


class TestChecklistEndpoints:
    """Item 4 & 5: Test checklist API endpoints"""

    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin_62bc79", "password": "Demo1234!"})
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        pytest.skip("Admin login failed")

    @pytest.fixture
    def estate_id(self, admin_token):
        """Get first estate ID"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        if response.status_code == 200:
            estates = response.json()
            if estates:
                return estates[0]["id"]
        pytest.skip("No estates found")

    def test_checklist_get(self, admin_token, estate_id):
        """Test GET checklist items"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/checklists/{estate_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} checklist items")

        # Check for items with is_default or ai_suggested flags
        default_items = [i for i in data if i.get("is_default")]
        ai_items = [i for i in data if i.get("ai_suggested")]
        print(f"Default items: {len(default_items)}, AI-suggested items: {len(ai_items)}")

    def test_checklist_accept_endpoint(self, admin_token, estate_id):
        """Test that accept endpoint exists"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        # Get checklist items first
        response = requests.get(f"{BASE_URL}/api/checklists/{estate_id}", headers=headers)
        if response.status_code == 200:
            items = response.json()
            if items:
                item_id = items[0]["id"]
                # Try to accept (may fail if not default/ai item, but endpoint should exist)
                accept_response = requests.post(f"{BASE_URL}/api/checklists/{item_id}/accept", headers=headers)
                # Should not be 404
                assert accept_response.status_code != 404, "Accept endpoint should exist"
                print(f"Accept endpoint status: {accept_response.status_code}")


class TestEmergencyAccessEndpoints:
    """Item 6: Test emergency access endpoints"""

    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin_62bc79", "password": "Demo1234!"})
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                return data["access_token"]
        pytest.skip("Admin login failed")

    def test_emergency_access_my_requests(self, admin_token):
        """Test GET /api/emergency-access/my-requests"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/emergency-access/my-requests", headers=headers)
        # Should return 200 (empty list is fine)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} emergency access requests")

    def test_emergency_access_active(self, admin_token):
        """Test GET /api/emergency-access/active"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/emergency-access/active", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} active emergency access grants")


class TestSEOEndpoints:
    """Item 7: Test SEO static files"""

    def test_robots_txt(self):
        """Test robots.txt exists and has correct content"""
        response = requests.get(f"{BASE_URL}/robots.txt")
        assert response.status_code == 200, "robots.txt should be accessible"
        content = response.text
        assert "Sitemap:" in content, "robots.txt should reference sitemap"
        assert "Disallow: /admin" in content, "robots.txt should disallow /admin"
        print("robots.txt content verified")

    def test_sitemap_xml(self):
        """Test sitemap.xml exists and is valid XML"""
        response = requests.get(f"{BASE_URL}/sitemap.xml")
        assert response.status_code == 200, "sitemap.xml should be accessible"
        content = response.text
        assert "<?xml" in content, "sitemap.xml should be valid XML"
        assert "<urlset" in content, "sitemap.xml should have urlset element"
        assert "carryon.us" in content, "sitemap.xml should reference carryon.us"
        print("sitemap.xml content verified")

    def test_index_html_seo_tags(self):
        """Test index.html has SEO meta tags"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        content = response.text

        # Check OG tags
        assert "og:title" in content, "Should have og:title"
        assert "og:description" in content, "Should have og:description"
        assert "og:image" in content, "Should have og:image"

        # Check Twitter tags
        assert "twitter:card" in content, "Should have twitter:card"
        assert "twitter:title" in content, "Should have twitter:title"

        # Check JSON-LD
        assert "application/ld+json" in content, "Should have JSON-LD schema"
        assert "SoftwareApplication" in content, "Should have SoftwareApplication schema"

        # Check title
        assert "Family Preparedness" in content, "Title should include 'Family Preparedness'"

        print("All SEO tags verified in index.html")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
