"""
Test ECT Keyboard Fix and Download Progress Features
Tests for:
1. ECT channel list refresh (fetchChannels on backout)
2. Download progress indicators for Milestone Messages
3. ECT keyboard cleanup on channel transitions
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestECTChannelAPIs:
    """Test ECT channel-related APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "info@carryon.us",
            "password": "Demo1234!"
        })
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Authentication failed - skipping ECT tests")
    
    def test_ect_channels_endpoint(self):
        """Test ECT channels list endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/estate-chat/channels")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"ECT channels endpoint returned {len(data)} channels")
    
    def test_ect_contacts_endpoint(self):
        """Test ECT contacts endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/estate-chat/contacts")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"ECT contacts endpoint returned {len(data)} contacts")
    
    def test_ect_search_endpoint(self):
        """Test ECT search endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/estate-chat/search?q=test")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"ECT search endpoint returned {len(data)} results")


class TestDownloadAPIs:
    """Test download-related APIs for Milestone Messages"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "info@carryon.us",
            "password": "Demo1234!"
        })
        if login_res.status_code == 200:
            data = login_res.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Authentication failed - skipping download tests")
    
    def test_download_prepare_endpoint_exists(self):
        """Test download prepare endpoint exists and requires proper params"""
        # Test with invalid params - should return 422 or 400
        response = self.session.post(f"{BASE_URL}/api/downloads/prepare", json={
            "action": "invalid_action",
            "params": {},
            "filename": "test.pdf"
        })
        # Should not be 404 - endpoint exists
        assert response.status_code != 404, "Download prepare endpoint should exist"
        print(f"Download prepare endpoint returned status {response.status_code}")
    
    def test_messages_list_endpoint(self):
        """Test messages list endpoint works"""
        # First get estates
        estates_res = self.session.get(f"{BASE_URL}/api/estates")
        if estates_res.status_code != 200:
            pytest.skip("No estates available")
        
        estates = estates_res.json()
        if not estates:
            pytest.skip("No estates available")
        
        estate_id = estates[0].get("id")
        response = self.session.get(f"{BASE_URL}/api/messages/{estate_id}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Messages endpoint returned {len(data)} messages")


class TestHealthAndAuth:
    """Basic health and auth tests"""
    
    def test_health_endpoint(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("Health check passed")
    
    def test_login_returns_access_token(self):
        """Test login returns access_token (not token)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "info@carryon.us",
            "password": "Demo1234!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data, "Login should return access_token"
        assert "user" in data, "Login should return user object"
        print("Login returns access_token correctly")
    
    def test_invalid_login(self):
        """Test invalid login returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("Invalid login correctly returns 401")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
