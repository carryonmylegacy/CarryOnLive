"""
Test suite for Beneficiary Invitation Flow and Enhanced Demographics
Tests:
- Login with barnetharris@mac.com / 9170873
- Beneficiary CRUD with enhanced demographic fields
- Invitation send/accept flow
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBeneficiaryInvitationFlow:
    """Test beneficiary invitation and enhanced demographics"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.estate_id = None
        self.created_beneficiary_id = None
    
    def get_auth_headers(self):
        """Get authorization headers"""
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}
    
    def test_01_login_barnetharris(self):
        """Test login with barnetharris@mac.com / 9170873"""
        # Step 1: Login to get OTP
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "barnetharris@mac.com",
            "password": "9170873"
        })
        
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        login_data = login_response.json()
        assert "dev_otp" in login_data, "OTP not returned in dev mode"
        
        otp = login_data["dev_otp"]
        print(f"✓ Login step 1 passed, OTP: {otp}")
        
        # Step 2: Verify OTP
        verify_response = self.session.post(f"{BASE_URL}/api/auth/verify-otp", json={
            "email": "barnetharris@mac.com",
            "otp": otp
        })
        
        assert verify_response.status_code == 200, f"OTP verification failed: {verify_response.text}"
        verify_data = verify_response.json()
        assert "access_token" in verify_data, "No access token returned"
        assert "user" in verify_data, "No user data returned"
        
        self.__class__.token = verify_data["access_token"]
        print(f"✓ Login successful for {verify_data['user']['email']}")
        print(f"  User: {verify_data['user']['name']}, Role: {verify_data['user']['role']}")
    
    def test_02_get_estates(self):
        """Get user's estates"""
        assert self.__class__.token, "No token - login test must pass first"
        
        response = self.session.get(
            f"{BASE_URL}/api/estates",
            headers={"Authorization": f"Bearer {self.__class__.token}"}
        )
        
        assert response.status_code == 200, f"Failed to get estates: {response.text}"
        estates = response.json()
        assert len(estates) > 0, "No estates found for user"
        
        self.__class__.estate_id = estates[0]["id"]
        print(f"✓ Found {len(estates)} estate(s)")
        print(f"  Using estate: {estates[0]['name']} (ID: {self.__class__.estate_id})")
    
    def test_03_get_beneficiaries(self):
        """Get existing beneficiaries"""
        assert self.__class__.token and self.__class__.estate_id, "Prerequisites not met"
        
        response = self.session.get(
            f"{BASE_URL}/api/beneficiaries/{self.__class__.estate_id}",
            headers={"Authorization": f"Bearer {self.__class__.token}"}
        )
        
        assert response.status_code == 200, f"Failed to get beneficiaries: {response.text}"
        beneficiaries = response.json()
        print(f"✓ Found {len(beneficiaries)} existing beneficiary(ies)")
        
        for ben in beneficiaries:
            status = ben.get('invitation_status', 'pending')
            print(f"  - {ben['name']} ({ben['relation']}) - Status: {status}")
    
    def test_04_create_beneficiary_with_demographics(self):
        """Create beneficiary with all enhanced demographic fields"""
        assert self.__class__.token and self.__class__.estate_id, "Prerequisites not met"
        
        # Create beneficiary with all fields
        beneficiary_data = {
            "estate_id": self.__class__.estate_id,
            "first_name": "TEST_John",
            "middle_name": "Michael",
            "last_name": "TestBeneficiary",
            "suffix": "Jr.",
            "relation": "Son",
            "email": f"test_john_{os.urandom(4).hex()}@example.com",
            "phone": "+1-555-0199",
            "date_of_birth": "1995-06-15",
            "gender": "male",
            "address_street": "123 Test Street, Apt 4B",
            "address_city": "San Diego",
            "address_state": "CA",
            "address_zip": "92101",
            "ssn_last_four": "1234",
            "notes": "Test beneficiary for automated testing",
            "avatar_color": "#3b82f6"
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/beneficiaries",
            json=beneficiary_data,
            headers={"Authorization": f"Bearer {self.__class__.token}"}
        )
        
        assert response.status_code == 200, f"Failed to create beneficiary: {response.text}"
        created = response.json()
        
        # Verify all fields were saved
        assert created["first_name"] == "TEST_John", "First name not saved"
        assert created["middle_name"] == "Michael", "Middle name not saved"
        assert created["last_name"] == "TestBeneficiary", "Last name not saved"
        assert created["suffix"] == "Jr.", "Suffix not saved"
        assert created["relation"] == "Son", "Relation not saved"
        assert created["gender"] == "male", "Gender not saved"
        assert created["date_of_birth"] == "1995-06-15", "DOB not saved"
        assert created["address_street"] == "123 Test Street, Apt 4B", "Street not saved"
        assert created["address_city"] == "San Diego", "City not saved"
        assert created["address_state"] == "CA", "State not saved"
        assert created["address_zip"] == "92101", "ZIP not saved"
        assert created["ssn_last_four"] == "1234", "SSN last 4 not saved"
        assert created["notes"] == "Test beneficiary for automated testing", "Notes not saved"
        assert created["invitation_status"] == "pending", "Initial status should be pending"
        
        self.__class__.created_beneficiary_id = created["id"]
        print("✓ Created beneficiary with all demographic fields")
        print(f"  Name: {created['name']}")
        print(f"  ID: {created['id']}")
    
    def test_05_send_invitation(self):
        """Test sending invitation to beneficiary"""
        assert self.__class__.token and self.__class__.created_beneficiary_id, "Prerequisites not met"
        
        response = self.session.post(
            f"{BASE_URL}/api/beneficiaries/{self.__class__.created_beneficiary_id}/invite",
            headers={"Authorization": f"Bearer {self.__class__.token}"}
        )
        
        assert response.status_code == 200, f"Failed to send invitation: {response.text}"
        result = response.json()
        
        assert "message" in result, "No message in response"
        assert "email" in result, "No email in response"
        print(f"✓ Invitation sent successfully to {result['email']}")
        
        # Fetch beneficiary to get the invitation token
        ben_response = self.session.get(
            f"{BASE_URL}/api/beneficiaries/{self.__class__.estate_id}",
            headers={"Authorization": f"Bearer {self.__class__.token}"}
        )
        assert ben_response.status_code == 200
        beneficiaries = ben_response.json()
        
        test_ben = next((b for b in beneficiaries if b["id"] == self.__class__.created_beneficiary_id), None)
        assert test_ben, "Test beneficiary not found"
        assert test_ben.get("invitation_token"), "No invitation token set"
        assert test_ben.get("invitation_status") == "sent", f"Status should be 'sent', got: {test_ben.get('invitation_status')}"
        
        self.__class__.invitation_token = test_ben["invitation_token"]
        print(f"  Token: {self.__class__.invitation_token[:20]}...")
    
    def test_06_get_invitation_details(self):
        """Test getting invitation details by token"""
        assert hasattr(self.__class__, 'invitation_token'), "No invitation token"
        
        response = self.session.get(
            f"{BASE_URL}/api/invitations/{self.__class__.invitation_token}"
        )
        
        assert response.status_code == 200, f"Failed to get invitation: {response.text}"
        data = response.json()
        
        assert "beneficiary" in data, "No beneficiary data in response"
        assert "benefactor_name" in data, "No benefactor name in response"
        assert data["beneficiary"]["first_name"] == "TEST_John", "Wrong beneficiary data"
        
        print("✓ Invitation details retrieved")
        print(f"  Benefactor: {data['benefactor_name']}")
        print(f"  Beneficiary: {data['beneficiary']['first_name']} {data['beneficiary']['last_name']}")
    
    def test_07_accept_invitation(self):
        """Test accepting invitation and creating account"""
        assert hasattr(self.__class__, 'invitation_token'), "No invitation token"
        
        response = self.session.post(
            f"{BASE_URL}/api/invitations/accept",
            json={
                "token": self.__class__.invitation_token,
                "password": "testpassword123",
                "phone": "+1-555-0199"
            }
        )
        
        assert response.status_code == 200, f"Failed to accept invitation: {response.text}"
        data = response.json()
        
        assert "access_token" in data, "No access token returned"
        assert "user" in data, "No user data returned"
        assert data["user"]["role"] == "beneficiary", "User should be beneficiary role"
        
        print("✓ Invitation accepted, account created")
        print(f"  User ID: {data['user']['id']}")
        print(f"  Email: {data['user']['email']}")
    
    def test_08_verify_beneficiary_status_updated(self):
        """Verify beneficiary status is now 'accepted'"""
        assert self.__class__.token and self.__class__.created_beneficiary_id, "Prerequisites not met"
        
        response = self.session.get(
            f"{BASE_URL}/api/beneficiaries/{self.__class__.estate_id}",
            headers={"Authorization": f"Bearer {self.__class__.token}"}
        )
        
        assert response.status_code == 200, f"Failed to get beneficiaries: {response.text}"
        beneficiaries = response.json()
        
        # Find our test beneficiary
        test_ben = next((b for b in beneficiaries if b["id"] == self.__class__.created_beneficiary_id), None)
        assert test_ben, "Test beneficiary not found"
        assert test_ben["invitation_status"] == "accepted", f"Status should be 'accepted', got: {test_ben['invitation_status']}"
        assert test_ben.get("user_id"), "user_id should be set after acceptance"
        
        print("✓ Beneficiary status verified as 'accepted'")
        print(f"  user_id linked: {test_ben['user_id']}")
    
    def test_09_cleanup_test_beneficiary(self):
        """Clean up test beneficiary"""
        if not self.__class__.token or not self.__class__.created_beneficiary_id:
            pytest.skip("No test beneficiary to clean up")
        
        response = self.session.delete(
            f"{BASE_URL}/api/beneficiaries/{self.__class__.created_beneficiary_id}",
            headers={"Authorization": f"Bearer {self.__class__.token}"}
        )
        
        # Accept both 200 and 204 as success
        assert response.status_code in [200, 204], f"Failed to delete: {response.text}"
        print("✓ Test beneficiary cleaned up")


class TestExistingInvitationToken:
    """Test with the provided invitation token"""
    
    def test_get_kent_harris_invitation(self):
        """Test getting invitation for Kent Harris (provided token)"""
        token = "4ab000de-129d-4230-8b85-bec04d4b011e"
        
        response = requests.get(f"{BASE_URL}/api/invitations/{token}")
        
        if response.status_code == 200:
            data = response.json()
            print("✓ Kent Harris invitation found")
            print(f"  Benefactor: {data.get('benefactor_name', 'N/A')}")
            print(f"  Beneficiary: {data['beneficiary']['first_name']} {data['beneficiary']['last_name']}")
            print(f"  Relation: {data['beneficiary']['relation']}")
        elif response.status_code == 404:
            print("⚠ Invitation token not found or already used")
        else:
            print(f"⚠ Unexpected response: {response.status_code} - {response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
