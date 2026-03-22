"""
Test Security PIN Feature - Voice Biometric Replacement
Tests the new PIN-based security layer (Layer 1) that replaced voice biometrics.
Security layers: Layer 1 = PIN (4-8 digits), Layer 2 = Password, Layer 3 = Security Question
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    if response.status_code == 200:
        data = response.json()
        # API returns 'access_token' not 'token'
        return data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestSecuritySettingsAPI:
    """Test GET /api/security/settings endpoint"""

    def test_get_security_settings_returns_pin_fields(self, auth_headers):
        """Verify settings response includes pin_enabled and has_pin fields"""
        response = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        # Check that at least one section exists
        assert len(data) > 0, "Expected at least one section in settings"

        # Check first section has required PIN fields
        first_section = list(data.values())[0]
        assert "pin_enabled" in first_section, "Missing pin_enabled field"
        assert "has_pin" in first_section, "Missing has_pin field"

        # Verify no voice biometric fields exist
        assert "voice_enabled" not in first_section, "voice_enabled should not exist (removed)"
        assert "voiceprint" not in first_section, "voiceprint should not exist (removed)"

    def test_get_security_settings_has_all_sections(self, auth_headers):
        """Verify all 6 lockable sections are returned"""
        response = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        expected_sections = ["sdv", "mm", "bm", "iac", "dts", "ega"]
        for section_id in expected_sections:
            assert section_id in data, f"Missing section: {section_id}"

    def test_get_security_settings_section_structure(self, auth_headers):
        """Verify each section has correct structure"""
        response = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        for section_id, section in data.items():
            # Required fields for each section
            assert "section_id" in section, f"Missing section_id in {section_id}"
            assert "name" in section, f"Missing name in {section_id}"
            assert "pin_enabled" in section, f"Missing pin_enabled in {section_id}"
            assert "has_pin" in section, f"Missing has_pin in {section_id}"
            assert "password_enabled" in section, f"Missing password_enabled in {section_id}"
            assert "has_password" in section, f"Missing has_password in {section_id}"
            assert "security_question_enabled" in section, f"Missing security_question_enabled in {section_id}"
            assert "has_security_question" in section, f"Missing has_security_question in {section_id}"
            assert "lock_mode" in section, f"Missing lock_mode in {section_id}"
            assert "is_active" in section, f"Missing is_active in {section_id}"


class TestSecuritySettingsUpdate:
    """Test PUT /api/security/settings/{section_id} endpoint"""

    def test_enable_pin_with_valid_4_digit_pin(self, auth_headers):
        """Enable PIN with minimum 4 digits"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={"pin_enabled": True, "pin": "1234", "lock_mode": "manual"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data.get("success")
        assert data.get("section_id") == "mm"

    def test_enable_pin_with_valid_8_digit_pin(self, auth_headers):
        """Enable PIN with maximum 8 digits"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={"pin_enabled": True, "pin": "12345678", "lock_mode": "manual"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

    def test_reject_pin_less_than_4_digits(self, auth_headers):
        """Reject PIN with less than 4 digits"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={
                "pin_enabled": True,
                "pin": "123",  # Only 3 digits
                "lock_mode": "manual",
            },
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"

    def test_reject_pin_more_than_8_digits(self, auth_headers):
        """Reject PIN with more than 8 digits"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={
                "pin_enabled": True,
                "pin": "123456789",  # 9 digits
                "lock_mode": "manual",
            },
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"

    def test_reject_non_numeric_pin(self, auth_headers):
        """Reject PIN with non-numeric characters"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={
                "pin_enabled": True,
                "pin": "12ab",  # Contains letters
                "lock_mode": "manual",
            },
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"

    def test_update_settings_persists_pin(self, auth_headers):
        """Verify PIN is persisted after update"""
        # Set PIN
        requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={"pin_enabled": True, "pin": "5678", "lock_mode": "manual"},
        )

        # Verify has_pin is True
        response = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        assert data["mm"]["has_pin"], "PIN should be set"
        assert data["mm"]["pin_enabled"], "PIN should be enabled"


class TestSecurityVerification:
    """Test POST /api/security/verify/{section_id} endpoint"""

    def test_verify_correct_pin(self, auth_headers):
        """Verify section with correct PIN"""
        # First set a known PIN
        requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={"pin_enabled": True, "pin": "4321", "lock_mode": "manual"},
        )

        # Verify with correct PIN using form data
        response = requests.post(
            f"{BASE_URL}/api/security/verify/mm",
            headers={"Authorization": auth_headers["Authorization"]},
            data={"pin": "4321"},  # Form data, not JSON
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data.get("verified")

    def test_verify_wrong_pin_returns_401(self, auth_headers):
        """Verify wrong PIN returns 401 Incorrect PIN"""
        # First set a known PIN
        requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={"pin_enabled": True, "pin": "9999", "lock_mode": "manual"},
        )

        # Verify with wrong PIN
        response = requests.post(
            f"{BASE_URL}/api/security/verify/mm",
            headers={"Authorization": auth_headers["Authorization"]},
            data={"pin": "1111"},  # Wrong PIN
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"

        data = response.json()
        assert "Incorrect PIN" in data.get("detail", ""), f"Expected 'Incorrect PIN' in detail, got: {data}"

    def test_verify_missing_pin_returns_400(self, auth_headers):
        """Verify missing PIN returns 400"""
        # First set a known PIN
        requests.put(
            f"{BASE_URL}/api/security/settings/mm",
            headers=auth_headers,
            json={"pin_enabled": True, "pin": "8888", "lock_mode": "manual"},
        )

        # Verify without PIN
        response = requests.post(
            f"{BASE_URL}/api/security/verify/mm",
            headers={"Authorization": auth_headers["Authorization"]},
            data={},  # No PIN provided
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"


class TestSecurityQuestions:
    """Test GET /api/security/questions endpoint"""

    def test_get_security_questions(self, auth_headers):
        """Verify security questions endpoint returns list"""
        response = requests.get(f"{BASE_URL}/api/security/questions", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert "questions" in data, "Missing questions field"
        assert len(data["questions"]) > 0, "Expected at least one security question"


class TestRemoveSecurity:
    """Test DELETE /api/security/settings/{section_id} endpoint"""

    def test_remove_section_security(self, auth_headers):
        """Remove security from a section"""
        # First set security
        requests.put(
            f"{BASE_URL}/api/security/settings/iac",
            headers=auth_headers,
            json={"pin_enabled": True, "pin": "7777", "lock_mode": "manual"},
        )

        # Remove security
        response = requests.delete(f"{BASE_URL}/api/security/settings/iac", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        # Verify security is removed
        settings_response = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers)
        data = settings_response.json()
        assert not data["iac"]["is_active"], "Security should be removed"


class TestMultiLayerSecurity:
    """Test multiple security layers together"""

    def test_enable_all_three_layers(self, auth_headers):
        """Enable PIN + Password + Security Question"""
        response = requests.put(
            f"{BASE_URL}/api/security/settings/sdv",
            headers=auth_headers,
            json={
                "pin_enabled": True,
                "pin": "1234",
                "password_enabled": True,
                "password": "TestPass123!",
                "security_question_enabled": True,
                "security_question": "What is your pet's name?",
                "security_answer": "Fluffy",
                "lock_mode": "manual",
            },
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        # Verify all layers are enabled
        settings_response = requests.get(f"{BASE_URL}/api/security/settings", headers=auth_headers)
        data = settings_response.json()

        assert data["sdv"]["pin_enabled"]
        assert data["sdv"]["has_pin"]
        assert data["sdv"]["password_enabled"]
        assert data["sdv"]["has_password"]
        assert data["sdv"]["security_question_enabled"]
        assert data["sdv"]["has_security_question"]
        assert data["sdv"]["is_active"]

    def test_verify_all_three_layers(self, auth_headers):
        """Verify section with all three layers"""
        # Set all three layers
        requests.put(
            f"{BASE_URL}/api/security/settings/sdv",
            headers=auth_headers,
            json={
                "pin_enabled": True,
                "pin": "5555",
                "password_enabled": True,
                "password": "SecurePass!",
                "security_question_enabled": True,
                "security_question": "What city were you born in?",
                "security_answer": "New York",
                "lock_mode": "manual",
            },
        )

        # Verify with all credentials
        response = requests.post(
            f"{BASE_URL}/api/security/verify/sdv",
            headers={"Authorization": auth_headers["Authorization"]},
            data={"pin": "5555", "password": "SecurePass!", "security_answer": "New York"},
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data.get("verified")
        assert data.get("results", {}).get("pin")
        assert data.get("results", {}).get("password")
        assert data.get("results", {}).get("security_question")


# Cleanup fixture to reset test data
@pytest.fixture(scope="module", autouse=True)
def cleanup(auth_headers):
    """Cleanup test security settings after all tests"""
    yield
    # Remove security from test sections
    for section_id in ["mm", "sdv", "iac"]:
        try:
            requests.delete(f"{BASE_URL}/api/security/settings/{section_id}", headers=auth_headers)
        except Exception:
            pass
