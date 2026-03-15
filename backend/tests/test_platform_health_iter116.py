"""
Iteration 116: Comprehensive Platform Health Tests
Tests core API endpoints not covered in iterations 114-115:
- Health check
- Authentication (/api/auth/me)
- Estates listing
- Beneficiaries listing
- Guardian chat sessions
- Navigation endpoints availability
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


class TestAPIHealth:
    """Basic API health and connectivity tests"""
    
    def test_health_check_returns_200(self):
        """API health endpoint should return 200 with database status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "database" in data
        assert "version" in data
        print(f"Health check passed: {data}")


class TestAuthentication:
    """Authentication flow tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Login and return auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - wait and retry")
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    def test_login_returns_token(self, auth_token):
        """Login should return a valid access token"""
        assert auth_token is not None
        assert len(auth_token) > 10
        print(f"Login successful, token received")
    
    def test_auth_me_returns_user_data(self, auth_token):
        """/api/auth/me should return user info with valid token"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "email" in data
        assert data["email"] == TEST_EMAIL
        print(f"User data retrieved: id={data.get('id')}, role={data.get('role')}")
    
    def test_auth_me_rejects_invalid_token(self):
        """/api/auth/me should reject invalid token"""
        headers = {"Authorization": "Bearer invalid_token_here"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code in [401, 403]


class TestEstates:
    """Estate management endpoint tests"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - wait and retry")
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_estates_list_returns_data(self, auth_headers):
        """/api/estates should return estate list"""
        response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            estate = data[0]
            assert "id" in estate
            assert "name" in estate
            print(f"Found {len(data)} estate(s), first: {estate.get('name')}")
        else:
            print("No estates found for user")
    
    def test_estates_readiness_endpoint(self, auth_headers):
        """/api/estate/{id}/readiness should return score"""
        # First get estates
        estates_res = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        assert estates_res.status_code == 200
        estates = estates_res.json()
        
        if len(estates) > 0:
            estate_id = estates[0]["id"]
            response = requests.get(f"{BASE_URL}/api/estate/{estate_id}/readiness", headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            assert "overall_score" in data or "documents" in data
            print(f"Readiness score retrieved for estate {estate_id}")
        else:
            pytest.skip("No estates to test readiness")


class TestBeneficiaries:
    """Beneficiary management endpoint tests"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - wait and retry")
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_beneficiaries_list_returns_data(self, auth_headers):
        """/api/beneficiaries/{estate_id} should return beneficiary list"""
        # First get estates
        estates_res = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        assert estates_res.status_code == 200
        estates = estates_res.json()
        
        if len(estates) > 0:
            estate_id = estates[0]["id"]
            response = requests.get(f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            print(f"Found {len(data)} beneficiary(ies) for estate {estate_id}")
        else:
            pytest.skip("No estates to test beneficiaries")


class TestGuardianChat:
    """Guardian AI chat endpoint tests"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - wait and retry")
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_chat_sessions_endpoint(self, auth_headers):
        """/api/chat/sessions should return chat history"""
        response = requests.get(f"{BASE_URL}/api/chat/sessions", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} chat session(s)")


class TestDocumentsAndMessages:
    """Documents and Messages endpoint tests"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - wait and retry")
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_documents_list(self, auth_headers):
        """/api/documents/{estate_id} should return documents"""
        estates_res = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        estates = estates_res.json()
        
        if len(estates) > 0:
            estate_id = estates[0]["id"]
            response = requests.get(f"{BASE_URL}/api/documents/{estate_id}", headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            print(f"Found {len(data)} document(s)")
        else:
            pytest.skip("No estates to test documents")
    
    def test_messages_list(self, auth_headers):
        """/api/messages/{estate_id} should return messages"""
        estates_res = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        estates = estates_res.json()
        
        if len(estates) > 0:
            estate_id = estates[0]["id"]
            response = requests.get(f"{BASE_URL}/api/messages/{estate_id}", headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            print(f"Found {len(data)} message(s)")
        else:
            pytest.skip("No estates to test messages")


class TestChecklist:
    """Checklist endpoint tests"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 429:
            pytest.skip("Rate limited - wait and retry")
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_checklists_list(self, auth_headers):
        """/api/checklists/{estate_id} should return checklist items"""
        estates_res = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        estates = estates_res.json()
        
        if len(estates) > 0:
            estate_id = estates[0]["id"]
            response = requests.get(f"{BASE_URL}/api/checklists/{estate_id}", headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            print(f"Found {len(data)} checklist item(s)")
        else:
            pytest.skip("No estates to test checklists")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
