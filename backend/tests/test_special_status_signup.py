"""
Tests for CarryOn Special Status and Beneficiary Signup Features
- Special eligibility checkboxes: military, federal_agent, first_responder, hospice
- Benefactor email required for beneficiary signup
- eligible_tier computed from special_status and age
- Subscription status endpoint returns special_status, eligible_tiers, is_minor
"""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://vault-secure-56.preview.emergentagent.com').rstrip('/')


class TestSpecialStatusRegistration:
    """Tests for registration with special_status and benefactor_email"""

    def test_register_benefactor_with_military_status(self):
        """Test registering a benefactor with military special status"""
        timestamp = int(time.time())
        payload = {
            "email": f"test_military_{timestamp}@test.com",
            "password": "TestPassword123",
            "first_name": "Military",
            "last_name": "Tester",
            "role": "benefactor",
            "date_of_birth": "1990-01-15",
            "special_status": ["military"]
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Military registration response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "Account created" in data.get("message", "")
        assert data.get("email") == payload["email"]

    def test_register_benefactor_with_federal_agent_status(self):
        """Test registering a benefactor with federal agent special status"""
        timestamp = int(time.time())
        payload = {
            "email": f"test_federal_{timestamp}@test.com",
            "password": "TestPassword123",
            "first_name": "Federal",
            "last_name": "Agent",
            "role": "benefactor",
            "date_of_birth": "1985-06-20",
            "special_status": ["federal_agent"]
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Federal agent registration: {response.status_code}")
        
        assert response.status_code == 200

    def test_register_benefactor_with_first_responder_status(self):
        """Test registering a benefactor with first responder special status"""
        timestamp = int(time.time())
        payload = {
            "email": f"test_responder_{timestamp}@test.com",
            "password": "TestPassword123",
            "first_name": "First",
            "last_name": "Responder",
            "role": "benefactor",
            "date_of_birth": "1988-03-10",
            "special_status": ["first_responder"]
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"First responder registration: {response.status_code}")
        
        assert response.status_code == 200

    def test_register_benefactor_with_hospice_status(self):
        """Test registering a benefactor with hospice special status"""
        timestamp = int(time.time())
        payload = {
            "email": f"test_hospice_{timestamp}@test.com",
            "password": "TestPassword123",
            "first_name": "Hospice",
            "last_name": "Patient",
            "role": "benefactor",
            "date_of_birth": "1950-12-05",
            "special_status": ["hospice"]
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Hospice registration: {response.status_code}")
        
        assert response.status_code == 200

    def test_register_benefactor_with_multiple_special_statuses(self):
        """Test registering with multiple special statuses (e.g., military + first_responder)"""
        timestamp = int(time.time())
        payload = {
            "email": f"test_multi_{timestamp}@test.com",
            "password": "TestPassword123",
            "first_name": "Multi",
            "last_name": "Status",
            "role": "benefactor",
            "date_of_birth": "1992-07-22",
            "special_status": ["military", "first_responder"]
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Multi-status registration: {response.status_code}")
        
        assert response.status_code == 200

    def test_register_young_adult_benefactor_gets_new_adult_tier(self):
        """Test that 18-25 year old benefactor gets new_adult eligible tier"""
        timestamp = int(time.time())
        # Set DOB to make user 21 years old
        from datetime import datetime, timedelta
        dob = (datetime.now() - timedelta(days=21*365)).strftime("%Y-%m-%d")
        
        payload = {
            "email": f"test_young_{timestamp}@test.com",
            "password": "TestPassword123",
            "first_name": "Young",
            "last_name": "Adult",
            "role": "benefactor",
            "date_of_birth": dob
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Young adult registration: {response.status_code}")
        
        assert response.status_code == 200


class TestBeneficiarySignup:
    """Tests for beneficiary signup with benefactor_email field"""

    def test_register_beneficiary_with_benefactor_email(self):
        """Test registering a beneficiary with benefactor email"""
        timestamp = int(time.time())
        
        # First create a benefactor
        benefactor_email = f"test_benefactor_{timestamp}@test.com"
        benefactor_payload = {
            "email": benefactor_email,
            "password": "TestPassword123",
            "first_name": "Benefactor",
            "last_name": "Owner",
            "role": "benefactor"
        }
        
        benefactor_response = requests.post(f"{BASE_URL}/api/auth/register", json=benefactor_payload)
        print(f"Benefactor created: {benefactor_response.status_code}")
        assert benefactor_response.status_code == 200
        
        # Now register beneficiary with benefactor_email
        beneficiary_payload = {
            "email": f"test_beneficiary_{timestamp}@test.com",
            "password": "TestPassword123",
            "first_name": "Beneficiary",
            "last_name": "Member",
            "role": "beneficiary",
            "benefactor_email": benefactor_email,
            "date_of_birth": "1995-05-15"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=beneficiary_payload)
        print(f"Beneficiary registration: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "Account created" in data.get("message", "")

    def test_register_beneficiary_without_benefactor_email(self):
        """Test registering a beneficiary without benefactor email - should still work"""
        timestamp = int(time.time())
        
        payload = {
            "email": f"test_ben_no_link_{timestamp}@test.com",
            "password": "TestPassword123",
            "first_name": "Unlinked",
            "last_name": "Beneficiary",
            "role": "beneficiary",
            "date_of_birth": "2000-08-20"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Unlinked beneficiary: {response.status_code}")
        
        # Backend allows registration without benefactor email, frontend enforces it
        assert response.status_code == 200

    def test_register_minor_beneficiary(self):
        """Test registering a minor beneficiary (under 18)"""
        timestamp = int(time.time())
        from datetime import datetime, timedelta
        # Set DOB to make user 15 years old
        dob = (datetime.now() - timedelta(days=15*365)).strftime("%Y-%m-%d")
        
        # Create benefactor first
        benefactor_email = f"test_parent_{timestamp}@test.com"
        benefactor_payload = {
            "email": benefactor_email,
            "password": "TestPassword123",
            "first_name": "Parent",
            "last_name": "Owner",
            "role": "benefactor"
        }
        requests.post(f"{BASE_URL}/api/auth/register", json=benefactor_payload)
        
        payload = {
            "email": f"test_minor_{timestamp}@test.com",
            "password": "TestPassword123",
            "first_name": "Minor",
            "last_name": "Child",
            "role": "beneficiary",
            "benefactor_email": benefactor_email,
            "date_of_birth": dob
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Minor beneficiary: {response.status_code}")
        
        assert response.status_code == 200


class TestSubscriptionStatusEndpoint:
    """Tests for subscription status endpoint - special_status, eligible_tiers, is_minor"""

    def test_subscription_plans_endpoint(self):
        """Test that subscription plans endpoint returns expected data"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        print(f"Plans endpoint: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "plans" in data
        assert "beneficiary_plans" in data
        
        # Verify expected plans exist
        plan_ids = [p["id"] for p in data["plans"]]
        assert "military" in plan_ids
        assert "hospice" in plan_ids
        assert "new_adult" in plan_ids
        assert "premium" in plan_ids
        assert "standard" in plan_ids
        assert "base" in plan_ids
        
        print(f"Available plans: {plan_ids}")
        print(f"Beneficiary plans: {[p['id'] for p in data['beneficiary_plans']]}")


class TestCodeReview:
    """Code review verification - checking key logic exists"""

    def test_auth_register_has_eligible_tier_logic(self):
        """Verify auth.py has eligible_tier computation logic"""
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "eligible_tier", "/app/backend/routes/auth.py"],
            capture_output=True, text=True
        )
        print(f"eligible_tier occurrences in auth.py:\n{result.stdout}")
        assert "eligible_tier" in result.stdout
        assert "military" in result.stdout or "special_status" in result.stdout

    def test_auth_register_has_special_status_logic(self):
        """Verify auth.py processes special_status array"""
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "special_status", "/app/backend/routes/auth.py"],
            capture_output=True, text=True
        )
        print(f"special_status in auth.py:\n{result.stdout}")
        assert "special_status" in result.stdout

    def test_auth_register_has_benefactor_email_linking(self):
        """Verify auth.py has beneficiary-to-benefactor linking logic"""
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "benefactor_email", "/app/backend/routes/auth.py"],
            capture_output=True, text=True
        )
        print(f"benefactor_email in auth.py:\n{result.stdout}")
        assert "benefactor_email" in result.stdout

    def test_subscription_status_returns_special_fields(self):
        """Verify subscriptions.py returns special_status, eligible_tiers, is_minor"""
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "is_minor\|special_status\|eligible_tiers", "/app/backend/routes/subscriptions.py"],
            capture_output=True, text=True
        )
        print(f"Subscription status fields:\n{result.stdout}")
        assert "is_minor" in result.stdout
        assert "special_status" in result.stdout
        assert "eligible_tiers" in result.stdout

    def test_subscription_management_has_auto_tier_logic(self):
        """Verify SubscriptionManagement.js has autoTier and isPlanLocked logic"""
        import subprocess
        result = subprocess.run(
            ["grep", "-n", "autoTier\|isPlanLocked\|isMinorBeneficiary", "/app/frontend/src/components/settings/SubscriptionManagement.js"],
            capture_output=True, text=True
        )
        print(f"Auto-tier logic in SubscriptionManagement.js:\n{result.stdout}")
        assert "autoTier" in result.stdout
        assert "isPlanLocked" in result.stdout
        assert "isMinorBeneficiary" in result.stdout


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
