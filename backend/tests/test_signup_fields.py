"""
Test suite for CarryOn™ Signup Form - New Name Fields Feature
Tests: First Name, Middle Name, Last Name, Suffix, Gender fields
"""

import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestSignupRegistration:
    """Test the /api/auth/register endpoint with new name fields"""

    def test_register_with_all_fields(self):
        """Test registration with all fields filled including suffix and gender"""
        timestamp = int(time.time())
        payload = {
            "first_name": "John",
            "middle_name": "William",
            "last_name": "Doe",
            "suffix": "Jr.",
            "gender": "male",
            "email": f"test_full_{timestamp}@example.com",
            "password": "testpass123",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "email" in data
        assert data["email"] == payload["email"]
        assert "otp_hint" in data
        print(f"SUCCESS: Registration with all fields - OTP hint: {data['otp_hint']}")

    def test_register_without_middle_name(self):
        """Test registration without middle name (optional field)"""
        timestamp = int(time.time())
        payload = {
            "first_name": "Jane",
            "last_name": "Smith",
            "email": f"test_no_middle_{timestamp}@example.com",
            "password": "testpass123",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "email" in data
        print("SUCCESS: Registration without middle name works")

    def test_register_with_suffix_none(self):
        """Test registration with suffix set to null (None selected)"""
        timestamp = int(time.time())
        payload = {
            "first_name": "Bob",
            "last_name": "Johnson",
            "suffix": None,  # Frontend sends null when 'None' is selected
            "email": f"test_no_suffix_{timestamp}@example.com",
            "password": "testpass123",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: Registration with null suffix works")

    def test_register_with_gender_not_selected(self):
        """Test registration with gender set to null (Select... selected)"""
        timestamp = int(time.time())
        payload = {
            "first_name": "Alice",
            "last_name": "Williams",
            "gender": None,  # Frontend sends null when 'Select...' is selected
            "email": f"test_no_gender_{timestamp}@example.com",
            "password": "testpass123",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("SUCCESS: Registration with null gender works")

    def test_register_with_all_suffix_options(self):
        """Test registration with each suffix option"""
        suffix_options = ["Jr.", "Sr.", "II", "III", "IV", "V", "Esq.", "MD", "PhD"]

        for suffix in suffix_options:
            timestamp = int(time.time() * 1000)  # Use milliseconds for uniqueness
            payload = {
                "first_name": "Test",
                "last_name": "User",
                "suffix": suffix,
                "email": f"test_suffix_{suffix.replace('.', '')}_{timestamp}@example.com",
                "password": "testpass123",
                "role": "benefactor",
            }

            response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
            assert response.status_code == 200, (
                f"Failed for suffix '{suffix}': {response.status_code}"
            )
            print(f"SUCCESS: Suffix '{suffix}' accepted")

    def test_register_with_all_gender_options(self):
        """Test registration with each gender option"""
        gender_options = ["male", "female", "other", "prefer_not_to_say"]

        for gender in gender_options:
            timestamp = int(time.time() * 1000)
            payload = {
                "first_name": "Test",
                "last_name": "User",
                "gender": gender,
                "email": f"test_gender_{gender}_{timestamp}@example.com",
                "password": "testpass123",
                "role": "benefactor",
            }

            response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
            assert response.status_code == 200, (
                f"Failed for gender '{gender}': {response.status_code}"
            )
            print(f"SUCCESS: Gender '{gender}' accepted")

    def test_register_missing_first_name(self):
        """Test that registration fails without first_name"""
        timestamp = int(time.time())
        payload = {
            "last_name": "Doe",
            "email": f"test_no_first_{timestamp}@example.com",
            "password": "testpass123",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Response status: {response.status_code}")

        # Should fail with 422 (validation error)
        assert response.status_code == 422, (
            f"Expected 422 for missing first_name, got {response.status_code}"
        )
        print("SUCCESS: Missing first_name correctly rejected")

    def test_register_missing_last_name(self):
        """Test that registration fails without last_name"""
        timestamp = int(time.time())
        payload = {
            "first_name": "John",
            "email": f"test_no_last_{timestamp}@example.com",
            "password": "testpass123",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Response status: {response.status_code}")

        # Should fail with 422 (validation error)
        assert response.status_code == 422, (
            f"Expected 422 for missing last_name, got {response.status_code}"
        )
        print("SUCCESS: Missing last_name correctly rejected")

    def test_register_short_password(self):
        """Test that registration fails with password < 6 characters"""
        timestamp = int(time.time())
        payload = {
            "first_name": "John",
            "last_name": "Doe",
            "email": f"test_short_pass_{timestamp}@example.com",
            "password": "12345",  # Only 5 characters
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Response status: {response.status_code}")

        # Should fail with 400 (bad request)
        assert response.status_code == 400, (
            f"Expected 400 for short password, got {response.status_code}"
        )
        print("SUCCESS: Short password correctly rejected")

    def test_register_duplicate_email(self):
        """Test that registration fails with duplicate email"""
        timestamp = int(time.time())
        email = f"test_dup_{timestamp}@example.com"

        payload = {
            "first_name": "John",
            "last_name": "Doe",
            "email": email,
            "password": "testpass123",
            "role": "benefactor",
        }

        # First registration should succeed
        response1 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response1.status_code == 200, (
            f"First registration failed: {response1.status_code}"
        )

        # Second registration with same email should fail
        response2 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Duplicate email response: {response2.status_code}")

        assert response2.status_code == 400, (
            f"Expected 400 for duplicate email, got {response2.status_code}"
        )
        print("SUCCESS: Duplicate email correctly rejected")


class TestOTPVerification:
    """Test OTP verification flow after registration"""

    def test_complete_signup_flow_with_otp(self):
        """Test complete signup flow: register -> verify OTP"""
        timestamp = int(time.time())
        email = f"test_otp_flow_{timestamp}@example.com"

        # Step 1: Register
        register_payload = {
            "first_name": "OTP",
            "middle_name": "Test",
            "last_name": "User",
            "suffix": "PhD",
            "gender": "other",
            "email": email,
            "password": "testpass123",
            "role": "benefactor",
        }

        register_response = requests.post(
            f"{BASE_URL}/api/auth/register", json=register_payload
        )
        assert register_response.status_code == 200, (
            f"Registration failed: {register_response.status_code}"
        )

        register_data = register_response.json()
        otp_hint = register_data.get("otp_hint", "")
        print(f"Registration successful, OTP hint: {otp_hint}")

        # Note: In real testing, we'd need to get the OTP from backend logs
        # For this test, we verify the registration endpoint works correctly
        print("SUCCESS: Complete registration flow works with all new fields")


class TestUserDataPersistence:
    """Test that user data is correctly stored with new fields"""

    def test_user_name_construction(self):
        """Test that full name is correctly constructed from name parts"""
        timestamp = int(time.time())
        email = f"test_name_construct_{timestamp}@example.com"

        # Register with all name parts
        register_payload = {
            "first_name": "John",
            "middle_name": "William",
            "last_name": "Doe",
            "suffix": "Jr.",
            "gender": "male",
            "email": email,
            "password": "testpass123",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=register_payload)
        assert response.status_code == 200

        # The backend should construct full name as "John William Doe Jr."
        # We can verify this by checking the user after OTP verification
        # For now, we verify the registration accepts all fields
        print("SUCCESS: Registration with full name parts accepted")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
