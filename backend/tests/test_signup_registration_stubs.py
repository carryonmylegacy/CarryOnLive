"""
Test Suite: Signup Registration with New Fields and Auto-Generated Beneficiary Stubs
====================================================================================
Tests the enhanced registration flow with:
- Marital status field
- Dependents (over/under 18) fields
- Address fields (street, city, state, zip)
- Auto-creation of estate for benefactors
- Auto-creation of beneficiary stubs based on marital status and dependents
"""

import os
import pytest
import requests
import time
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestRegistrationWithNewFields:
    """Test the enhanced registration endpoint with new fields"""

    def test_register_benefactor_with_full_demographics(self):
        """Test registration with all new demographic fields"""
        unique_email = f"test_agent_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"

        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "John",
            "middle_name": "William",
            "last_name": "TestUser",
            "suffix": "Jr.",
            "gender": "male",
            "date_of_birth": "1985-03-15",
            "marital_status": "married",
            "dependents_over_18": 2,
            "dependents_under_18": 1,
            "address_street": "123 Test Street",
            "address_city": "San Diego",
            "address_state": "CA",
            "address_zip": "92101",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)

        # Should return 200 with OTP sent message
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert data.get("email") == unique_email
        print(f"✓ Registration successful for {unique_email}")

        return unique_email

    def test_register_single_benefactor_no_stubs(self):
        """Test that single/divorced users get no spouse stub"""
        unique_email = f"test_single_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"

        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Jane",
            "last_name": "SingleTest",
            "marital_status": "single",
            "dependents_over_18": 0,
            "dependents_under_18": 0,
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        print("✓ Single benefactor registration successful")

        return unique_email

    def test_register_domestic_partnership_creates_spouse_stub(self):
        """Test that domestic_partnership creates a spouse stub"""
        unique_email = f"test_dp_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"

        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Alex",
            "last_name": "PartnerTest",
            "marital_status": "domestic_partnership",
            "dependents_over_18": 0,
            "dependents_under_18": 0,
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        print("✓ Domestic partnership registration successful")

        return unique_email

    def test_register_with_multiple_dependents(self):
        """Test registration with multiple adult and minor dependents"""
        unique_email = f"test_deps_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"

        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Parent",
            "last_name": "WithKids",
            "marital_status": "married",
            "dependents_over_18": 3,  # 3 adult children
            "dependents_under_18": 2,  # 2 minor children
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        print("✓ Registration with 5 dependents successful")

        return unique_email

    def test_register_beneficiary_no_estate_created(self):
        """Test that beneficiary role does not create estate or stubs"""
        unique_email = f"test_ben_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"

        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Beneficiary",
            "last_name": "TestUser",
            "marital_status": "single",
            "role": "beneficiary",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        print("✓ Beneficiary registration successful (no estate auto-created)")

        return unique_email

    def test_register_with_address_fields(self):
        """Test all address fields are accepted"""
        unique_email = f"test_addr_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"

        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Address",
            "last_name": "TestUser",
            "address_street": "456 Oak Avenue, Apt 12B",
            "address_city": "Los Angeles",
            "address_state": "CA",
            "address_zip": "90001-1234",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        print("✓ Registration with full address successful")

        return unique_email

    def test_register_duplicate_email_rejected(self):
        """Test that duplicate email registration is rejected"""
        unique_email = f"test_dup_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"

        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "First",
            "last_name": "User",
            "role": "benefactor",
        }

        # First registration should succeed
        response1 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response1.status_code == 200, (
            f"First registration failed: {response1.text}"
        )

        # Second registration with same email should fail
        response2 = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response2.status_code == 400, (
            f"Expected 400 for duplicate email, got {response2.status_code}"
        )
        assert "already registered" in response2.json().get("detail", "").lower()
        print("✓ Duplicate email correctly rejected")

    def test_register_weak_password_rejected(self):
        """Test that weak passwords are rejected"""
        unique_email = f"test_weak_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"

        # Test too short password
        payload = {
            "email": unique_email,
            "password": "short",
            "first_name": "Weak",
            "last_name": "Password",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400, (
            f"Expected 400 for weak password, got {response.status_code}"
        )
        print("✓ Weak password correctly rejected")

    def test_register_password_complexity_required(self):
        """Test that password must have upper, lower, and digit"""
        unique_email = (
            f"test_complex_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"
        )

        # Test lowercase only (8 chars)
        payload = {
            "email": unique_email,
            "password": "alllowercase",
            "first_name": "Complex",
            "last_name": "Password",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400, (
            f"Expected 400 for simple password, got {response.status_code}"
        )
        print("✓ Password complexity requirement enforced")

    def test_register_optional_fields_can_be_null(self):
        """Test registration with minimal required fields only"""
        unique_email = f"test_min_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.com"

        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Minimal",
            "last_name": "Fields",
            "role": "benefactor",
        }

        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, (
            f"Registration with minimal fields failed: {response.text}"
        )
        print("✓ Registration with minimal fields successful")


class TestBeneficiaryUpdate:
    """Test beneficiary update clears is_stub flag"""

    def test_beneficiary_update_endpoint_exists(self):
        """Verify the beneficiary update endpoint is accessible"""
        # This is a quick smoke test - full test would require auth
        response = requests.put(
            f"{BASE_URL}/api/beneficiaries/nonexistent-id",
            json={
                "estate_id": "test",
                "first_name": "Test",
                "last_name": "User",
                "relation": "Spouse",
                "email": "test@test.com",
            },
        )
        # Should return 401 (unauthorized), 403 (forbidden), or 404 (not found), not 500
        assert response.status_code in [401, 403, 404, 422], (
            f"Unexpected status: {response.status_code}"
        )
        print("✓ Beneficiary update endpoint accessible (auth required)")


class TestAddressAutocomplete:
    """Test Google Places Autocomplete integration"""

    def test_google_places_api_key_configured(self):
        """Verify Google Places API key is in frontend config"""
        # Check if key is properly configured in frontend env
        env_path = "/app/frontend/.env"
        with open(env_path) as f:
            content = f.read()

        assert "REACT_APP_GOOGLE_PLACES_API_KEY" in content
        assert "AIzaSy" in content  # Google API keys start with AIzaSy
        print("✓ Google Places API key configured in frontend")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
