"""
Test Suite for Triple Lock Section Security feature
Tests the security settings, verification, and management endpoints for sections:
- SDV (Secure Document Vault)
- MM (Milestone Messages)
- BM (Beneficiary Management)
- IAC (Immediate Action Checklist)
- DTS (Designated Trustee Services)
- EGA (Estate Guardian AI)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials from test request
ADMIN_EMAIL = "founder@carryon.us"
ADMIN_PASSWORD = "CarryOntheWisdom!"

# Section IDs
SECTION_IDS = ["sdv", "mm", "bm", "iac", "dts", "ega"]

# Test password for section security
TEST_PASSWORD = "testpass123"
TEST_SECURITY_QUESTION = "What was the name of your first pet?"
TEST_SECURITY_ANSWER = "Fluffy"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token using OTP flow"""
    # Step 1: Login to get dev_otp
    login_response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if login_response.status_code != 200:
        pytest.skip(f"Login failed: {login_response.text}")
    
    login_data = login_response.json()
    dev_otp = login_data.get("dev_otp")
    if not dev_otp:
        pytest.skip("No dev_otp returned from login")
    
    # Step 2: Verify OTP to get access_token
    verify_response = requests.post(
        f"{BASE_URL}/api/auth/verify-otp",
        json={"email": ADMIN_EMAIL, "otp": dev_otp}
    )
    if verify_response.status_code != 200:
        pytest.skip(f"OTP verification failed: {verify_response.text}")
    
    token = verify_response.json().get("access_token")
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestHealthEndpoint:
    """Test the health check endpoint"""
    
    def test_health_returns_healthy_status(self):
        """GET /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        
        data = response.json()
        assert data.get("status") == "healthy", f"Status not healthy: {data}"
        assert "database" in data, "Missing database status"
        print(f"✓ Health check passed: {data}")


class TestSecurityQuestions:
    """Test the preset security questions endpoint"""
    
    def test_get_security_questions(self, auth_headers):
        """GET /api/security/questions returns preset security questions list"""
        response = requests.get(
            f"{BASE_URL}/api/security/questions",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get questions: {response.text}"
        
        data = response.json()
        assert "questions" in data, "Missing 'questions' field"
        questions = data["questions"]
        assert isinstance(questions, list), "Questions should be a list"
        assert len(questions) > 0, "Questions list is empty"
        
        # Verify some expected questions exist
        assert any("pet" in q.lower() for q in questions), "Missing pet question"
        assert any("street" in q.lower() for q in questions), "Missing street question"
        print(f"✓ Retrieved {len(questions)} security questions")


class TestSecuritySettingsRetrieval:
    """Test retrieving security settings for all sections"""
    
    def test_get_security_settings_returns_all_sections(self, auth_headers):
        """GET /api/security/settings returns all 6 sections with default inactive state"""
        response = requests.get(
            f"{BASE_URL}/api/security/settings",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get settings: {response.text}"
        
        data = response.json()
        
        # Verify all 6 sections are returned
        for section_id in SECTION_IDS:
            assert section_id in data, f"Missing section: {section_id}"
            section = data[section_id]
            
            # Verify expected fields exist
            assert "section_id" in section, f"Missing section_id for {section_id}"
            assert "name" in section, f"Missing name for {section_id}"
            assert "password_enabled" in section, f"Missing password_enabled for {section_id}"
            assert "voice_enabled" in section, f"Missing voice_enabled for {section_id}"
            assert "security_question_enabled" in section, f"Missing security_question_enabled for {section_id}"
            assert "lock_mode" in section, f"Missing lock_mode for {section_id}"
            assert "is_active" in section, f"Missing is_active for {section_id}"
            
        print(f"✓ All 6 sections returned with expected fields")
    
    def test_security_settings_structure(self, auth_headers):
        """Verify security settings have correct structure and types"""
        response = requests.get(
            f"{BASE_URL}/api/security/settings",
            headers=auth_headers
        )
        data = response.json()
        
        for section_id in SECTION_IDS:
            section = data[section_id]
            
            # Check boolean fields
            assert isinstance(section["password_enabled"], bool)
            assert isinstance(section["voice_enabled"], bool)
            assert isinstance(section["security_question_enabled"], bool)
            assert isinstance(section["is_active"], bool)
            
            # Check string fields
            assert isinstance(section["section_id"], str)
            assert isinstance(section["name"], str)
            assert isinstance(section["lock_mode"], str)
            
        print("✓ Security settings have correct structure and types")


class TestPasswordSecurityLayer:
    """Test password-based security layer (Layer 1)"""
    
    def test_create_password_security_for_sdv(self, auth_headers):
        """PUT /api/security/settings/sdv with password_enabled=true creates password security"""
        # First, remove any existing security for clean test
        requests.delete(
            f"{BASE_URL}/api/security/settings/sdv",
            headers=auth_headers
        )
        
        # Create password security
        response = requests.put(
            f"{BASE_URL}/api/security/settings/sdv",
            headers=auth_headers,
            json={
                "password_enabled": True,
                "password": TEST_PASSWORD,
                "lock_mode": "manual"
            }
        )
        assert response.status_code == 200, f"Failed to create password security: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Success not true: {data}"
        assert data.get("section_id") == "sdv", f"Wrong section_id: {data}"
        print("✓ Password security created for SDV section")
        
        # Verify the setting was saved
        settings_response = requests.get(
            f"{BASE_URL}/api/security/settings",
            headers=auth_headers
        )
        settings = settings_response.json()
        assert settings["sdv"]["password_enabled"] == True, "Password not enabled"
        assert settings["sdv"]["has_password"] == True, "Password hash not saved"
        assert settings["sdv"]["is_active"] == True, "Section not active"
        print("✓ Password security verified in settings")
    
    def test_verify_correct_password(self, auth_headers):
        """POST /api/security/verify/sdv with correct password returns verified=true"""
        response = requests.post(
            f"{BASE_URL}/api/security/verify/sdv",
            headers=auth_headers,
            data={"password": TEST_PASSWORD}  # Form data
        )
        assert response.status_code == 200, f"Verification failed: {response.text}"
        
        data = response.json()
        assert data.get("verified") == True, f"Not verified: {data}"
        assert "results" in data, "Missing results"
        assert data["results"].get("password") == True, "Password verification result missing"
        print("✓ Correct password verification passed")
    
    def test_verify_wrong_password_returns_401(self, auth_headers):
        """POST /api/security/verify/sdv with wrong password returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/security/verify/sdv",
            headers=auth_headers,
            data={"password": "wrongpassword123"}  # Form data
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✓ Wrong password correctly rejected with 401")


class TestSecurityQuestionLayer:
    """Test security question layer (Layer 3)"""
    
    def test_create_security_question_for_mm(self, auth_headers):
        """PUT /api/security/settings/mm with security_question creates question security"""
        # First, remove any existing security
        requests.delete(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers
        )
        
        response = requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={
                "security_question_enabled": True,
                "security_question": TEST_SECURITY_QUESTION,
                "security_answer": TEST_SECURITY_ANSWER,
                "lock_mode": "on_page_leave"
            }
        )
        assert response.status_code == 200, f"Failed to create security question: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Success not true: {data}"
        print("✓ Security question created for MM section")
        
        # Verify the setting was saved
        settings_response = requests.get(
            f"{BASE_URL}/api/security/settings",
            headers=auth_headers
        )
        settings = settings_response.json()
        assert settings["mm"]["security_question_enabled"] == True
        assert settings["mm"]["has_security_question"] == True
        assert settings["mm"]["security_question"] == TEST_SECURITY_QUESTION
        assert settings["mm"]["lock_mode"] == "on_page_leave"
        print("✓ Security question verified in settings")
    
    def test_verify_correct_security_answer(self, auth_headers):
        """POST /api/security/verify/mm with correct answer returns verified=true"""
        response = requests.post(
            f"{BASE_URL}/api/security/verify/mm",
            headers=auth_headers,
            data={"security_answer": TEST_SECURITY_ANSWER}
        )
        assert response.status_code == 200, f"Verification failed: {response.text}"
        
        data = response.json()
        assert data.get("verified") == True
        assert data.get("results", {}).get("security_question") == True
        print("✓ Correct security answer verification passed")
    
    def test_verify_wrong_security_answer_returns_401(self, auth_headers):
        """POST /api/security/verify/mm with wrong answer returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/security/verify/mm",
            headers=auth_headers,
            data={"security_answer": "WrongAnswer"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Wrong security answer correctly rejected with 401")


class TestLockModes:
    """Test the 3 lock behavior modes"""
    
    def test_lock_mode_manual(self, auth_headers):
        """Verify manual lock mode is saved correctly"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/bm",
            headers=auth_headers,
            json={
                "password_enabled": True,
                "password": "testpass",
                "lock_mode": "manual"
            }
        )
        assert response.status_code == 200
        
        settings = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers).json()
        assert settings["bm"]["lock_mode"] == "manual"
        print("✓ Manual lock mode saved correctly")
    
    def test_lock_mode_on_page_leave(self, auth_headers):
        """Verify on_page_leave lock mode is saved correctly"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/iac",
            headers=auth_headers,
            json={
                "password_enabled": True,
                "password": "testpass",
                "lock_mode": "on_page_leave"
            }
        )
        assert response.status_code == 200
        
        settings = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers).json()
        assert settings["iac"]["lock_mode"] == "on_page_leave"
        print("✓ On page leave lock mode saved correctly")
    
    def test_lock_mode_on_logout(self, auth_headers):
        """Verify on_logout lock mode is saved correctly"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/dts",
            headers=auth_headers,
            json={
                "password_enabled": True,
                "password": "testpass",
                "lock_mode": "on_logout"
            }
        )
        assert response.status_code == 200
        
        settings = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers).json()
        assert settings["dts"]["lock_mode"] == "on_logout"
        print("✓ On logout lock mode saved correctly")
    
    def test_invalid_lock_mode_rejected(self, auth_headers):
        """Invalid lock mode should be rejected"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/ega",
            headers=auth_headers,
            json={
                "password_enabled": True,
                "password": "testpass",
                "lock_mode": "invalid_mode"
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Invalid lock mode correctly rejected")


class TestRemoveSecurity:
    """Test removing security from sections"""
    
    def test_delete_security_settings(self, auth_headers):
        """DELETE /api/security/settings/sdv removes security from section"""
        # First ensure there's security to remove
        requests.put(
            f"{BASE_URL}/api/security/settings/sdv",
            headers=auth_headers,
            json={"password_enabled": True, "password": "testpass"}
        )
        
        # Delete the security
        response = requests.delete(
            f"{BASE_URL}/api/security/settings/sdv",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        print("✓ Security successfully removed from SDV")
        
        # Verify it's removed
        settings = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers).json()
        assert settings["sdv"]["is_active"] == False, "Section should be inactive"
        assert settings["sdv"]["password_enabled"] == False, "Password should be disabled"
        print("✓ SDV section verified as inactive")


class TestInvalidSectionHandling:
    """Test error handling for invalid section IDs"""
    
    def test_invalid_section_on_update(self, auth_headers):
        """PUT with invalid section_id returns 400"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/invalid_section",
            headers=auth_headers,
            json={"password_enabled": True, "password": "test"}
        )
        assert response.status_code == 400
        print("✓ Invalid section on update correctly rejected")
    
    def test_invalid_section_on_verify(self, auth_headers):
        """POST /api/security/verify/invalid returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/security/verify/invalid_section",
            headers=auth_headers,
            data={"password": "test"}
        )
        assert response.status_code == 400
        print("✓ Invalid section on verify correctly rejected")
    
    def test_invalid_section_on_delete(self, auth_headers):
        """DELETE with invalid section_id returns 400"""
        response = requests.delete(
            f"{BASE_URL}/api/security/settings/invalid_section",
            headers=auth_headers
        )
        assert response.status_code == 400
        print("✓ Invalid section on delete correctly rejected")


class TestNoSecurityConfigured:
    """Test verification when no security is configured"""
    
    def test_verify_no_security_returns_verified(self, auth_headers):
        """Verification passes when no security is configured for a section"""
        # Remove any existing security for EGA
        requests.delete(
            f"{BASE_URL}/api/security/settings/ega",
            headers=auth_headers
        )
        
        # Verify should pass without any credentials
        response = requests.post(
            f"{BASE_URL}/api/security/verify/ega",
            headers=auth_headers,
            data={}  # No credentials
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("verified") == True
        assert "No security configured" in data.get("message", "")
        print("✓ No security configured returns verified=true")


class TestCleanup:
    """Cleanup test data after all tests"""
    
    def test_cleanup_test_security_settings(self, auth_headers):
        """Remove all test security settings"""
        for section_id in SECTION_IDS:
            requests.delete(
                f"{BASE_URL}/api/security/settings/{section_id}",
                headers=auth_headers
            )
        print("✓ All test security settings cleaned up")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
