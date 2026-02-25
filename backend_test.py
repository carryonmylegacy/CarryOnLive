#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime
import base64
import io

class CarryOnAPITester:
    def __init__(self, base_url="https://legacy-vault-37.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.estate_id = None
        self.beneficiary_id = None
        self.document_id = None
        self.message_id = None
        self.checklist_item_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    # Remove Content-Type for file uploads
                    headers.pop('Content-Type', None)
                    response = requests.post(url, data=data, files=files, headers=headers)
                else:
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json() if response.content else {}
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text}")

            return success, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_login_flow(self, email, password):
        """Test complete login flow with OTP"""
        print(f"\n🔐 Testing login flow for {email}")
        
        # Step 1: Login to get OTP
        success, response = self.run_test(
            "Login Request",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": password}
        )
        
        if not success:
            return False
            
        otp_hint = response.get('otp_hint', '')
        print(f"   OTP Hint: {otp_hint}")
        
        # For testing, we'll use known OTP codes from backend logs
        # In real scenario, this would come from email/SMS
        otp_codes = {
            "pete@mitchell.com": "544291",
            "penny@mitchell.com": "001254", 
            "admin@carryon.com": "800583"
        }
        
        if email in otp_codes:
            test_otp = otp_codes[email]
            
            # Step 2: Verify OTP
            success, response = self.run_test(
                "OTP Verification",
                "POST",
                "auth/verify-otp",
                200,
                data={"email": email, "otp": test_otp}
            )
            
            if success and 'access_token' in response:
                self.token = response['access_token']
                print(f"   ✅ Login successful for {response['user']['name']}")
                return True
        
        print(f"   ❌ OTP verification failed")
        return False

    def test_estates(self):
        """Test estate endpoints"""
        print(f"\n🏠 Testing Estate Management")
        
        success, response = self.run_test(
            "Get Estates",
            "GET",
            "estates",
            200
        )
        
        if success and response:
            self.estate_id = response[0]['id']
            print(f"   Estate ID: {self.estate_id}")
            print(f"   Estate Name: {response[0]['name']}")
            print(f"   Readiness Score: {response[0]['readiness_score']}%")
            return True
        return False

    def test_beneficiaries(self):
        """Test beneficiary management"""
        if not self.estate_id:
            return False
            
        print(f"\n👥 Testing Beneficiary Management")
        
        # Get existing beneficiaries
        success, response = self.run_test(
            "Get Beneficiaries",
            "GET",
            f"beneficiaries/{self.estate_id}",
            200
        )
        
        if success and response:
            self.beneficiary_id = response[0]['id']
            print(f"   Found beneficiary: {response[0]['name']}")
            return True
        return False

    def test_documents(self):
        """Test document management"""
        if not self.estate_id:
            return False
            
        print(f"\n📄 Testing Document Management")
        
        # Get documents
        success, response = self.run_test(
            "Get Documents",
            "GET",
            f"documents/{self.estate_id}",
            200
        )
        
        if success:
            if response:
                self.document_id = response[0]['id']
                print(f"   Found {len(response)} documents")
            return True
        return False

    def test_messages(self):
        """Test milestone messages"""
        if not self.estate_id:
            return False
            
        print(f"\n💌 Testing Milestone Messages")
        
        # Get messages
        success, response = self.run_test(
            "Get Messages",
            "GET",
            f"messages/{self.estate_id}",
            200
        )
        
        if success:
            if response:
                self.message_id = response[0]['id']
                print(f"   Found {len(response)} messages")
            return True
        return False

    def test_checklist(self):
        """Test action checklist"""
        if not self.estate_id:
            return False
            
        print(f"\n✅ Testing Action Checklist")
        
        # Get checklist items
        success, response = self.run_test(
            "Get Checklist",
            "GET",
            f"checklists/{self.estate_id}",
            200
        )
        
        if success and response:
            self.checklist_item_id = response[0]['id']
            print(f"   Found {len(response)} checklist items")
            
            # Test toggle checklist item
            success, _ = self.run_test(
                "Toggle Checklist Item",
                "PATCH",
                f"checklists/{self.checklist_item_id}/toggle",
                200
            )
            return success
        return False

    def test_ai_chat(self):
        """Test Estate Guardian AI chat"""
        print(f"\n🤖 Testing Estate Guardian AI")
        
        success, response = self.run_test(
            "AI Chat",
            "POST",
            "chat/guardian",
            200,
            data={"message": "What is estate planning?"}
        )
        
        if success and 'response' in response:
            print(f"   AI Response: {response['response'][:100]}...")
            return True
        return False

    def test_transition_status(self):
        """Test estate transition status"""
        if not self.estate_id:
            return False
            
        print(f"\n🔄 Testing Estate Transition")
        
        success, response = self.run_test(
            "Get Transition Status",
            "GET",
            f"transition/status/{self.estate_id}",
            200
        )
        
        if success:
            print(f"   Estate Status: {response.get('estate_status', 'unknown')}")
            return True
        return False

def main():
    """Main test execution"""
    print("🚀 Starting CarryOn™ API Tests")
    print("=" * 50)
    
    tester = CarryOnAPITester()
    
    # Test credentials from the review request
    test_accounts = [
        {"email": "pete@mitchell.com", "password": "password123", "role": "benefactor"},
        {"email": "penny@mitchell.com", "password": "password123", "role": "beneficiary"},
        {"email": "admin@carryon.com", "password": "admin123", "role": "admin"}
    ]
    
    all_tests_passed = True
    
    for account in test_accounts:
        print(f"\n{'='*20} Testing {account['role'].upper()} Account {'='*20}")
        
        # Test login flow
        if not tester.test_login_flow(account["email"], account["password"]):
            print(f"❌ Login failed for {account['email']}")
            all_tests_passed = False
            continue
        
        # Test user info
        success, response = tester.run_test(
            "Get User Info",
            "GET",
            "auth/me",
            200
        )
        
        if success:
            print(f"   User: {response['name']} ({response['role']})")
        
        # Role-specific tests
        if account['role'] == 'benefactor':
            # Test all benefactor features
            if not tester.test_estates():
                all_tests_passed = False
            if not tester.test_beneficiaries():
                all_tests_passed = False
            if not tester.test_documents():
                all_tests_passed = False
            if not tester.test_messages():
                all_tests_passed = False
            if not tester.test_checklist():
                all_tests_passed = False
            if not tester.test_ai_chat():
                all_tests_passed = False
            if not tester.test_transition_status():
                all_tests_passed = False
                
        elif account['role'] == 'beneficiary':
            # Test beneficiary-specific features
            if not tester.test_estates():
                all_tests_passed = False
            if not tester.test_messages():
                all_tests_passed = False
                
        elif account['role'] == 'admin':
            # Test admin features
            success, response = tester.run_test(
                "Get Pending Certificates",
                "GET",
                "transition/certificates",
                200
            )
            if not success:
                all_tests_passed = False
        
        # Reset token for next account
        tester.token = None
    
    # Print final results
    print(f"\n{'='*50}")
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if all_tests_passed and tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("❌ Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())