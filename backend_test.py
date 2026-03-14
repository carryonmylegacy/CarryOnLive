#!/usr/bin/env python3
"""
CarryOn Backend API Smoke Tests
Tests the route-based edit flows for benefactor portal
"""

import requests
import json
from typing import Dict, Optional

class BackendAPITest:
    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url.rstrip('/')
        self.api_url = f"{self.base_url}/api"
        self.email = email
        self.password = password
        self.access_token: Optional[str] = None
        self.user_info: Optional[Dict] = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'CarryOn-Backend-Test/1.0'
        })

    def set_auth_header(self):
        """Set Authorization header with current access token"""
        if self.access_token:
            self.session.headers.update({
                'Authorization': f'Bearer {self.access_token}'
            })

    def test_auth_login(self) -> Dict:
        """Test POST /api/auth/login with benefactor credentials"""
        print(f"🔐 Testing auth/login for {self.email}...")
        
        url = f"{self.api_url}/auth/login"
        payload = {
            "email": self.email,
            "password": self.password,
            "otp_method": "email"
        }
        
        try:
            response = self.session.post(url, json=payload, timeout=10)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                # Check if OTP is required
                if data.get("otp_required"):
                    print(f"   ❌ OTP required - {data.get('message', 'OTP verification needed')}")
                    return {
                        "success": False,
                        "error": "OTP_REQUIRED", 
                        "message": "OTP verification is required for this account",
                        "data": data
                    }
                
                # Check if account is sealed (transitioned)
                if data.get("sealed"):
                    print(f"   ❌ Account sealed - {data.get('message', 'Account is transitioned')}")
                    return {
                        "success": False,
                        "error": "ACCOUNT_SEALED",
                        "message": data.get("message", "Account is sealed"),
                        "data": data
                    }
                
                # Direct login successful
                self.access_token = data.get("access_token")
                self.user_info = data.get("user")
                
                if self.access_token and self.user_info:
                    self.set_auth_header()
                    print(f"   ✅ Login successful - User: {self.user_info.get('name')} ({self.user_info.get('role')})")
                    return {
                        "success": True,
                        "user": self.user_info,
                        "token": self.access_token
                    }
                else:
                    print("   ❌ Invalid response format - missing token or user info")
                    return {
                        "success": False,
                        "error": "INVALID_RESPONSE",
                        "message": "Missing access_token or user in response"
                    }
            else:
                error_text = response.text
                print(f"   ❌ Login failed: {error_text}")
                return {
                    "success": False,
                    "error": f"HTTP_{response.status_code}",
                    "message": error_text
                }
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error: {str(e)}")
            return {
                "success": False,
                "error": "NETWORK_ERROR",
                "message": str(e)
            }

    def test_get_estates(self) -> Dict:
        """Test GET /api/estates (should work for benefactor account)"""
        print(f"🏡 Testing GET /api/estates...")
        
        if not self.access_token:
            return {
                "success": False,
                "error": "NO_AUTH",
                "message": "Not authenticated - login first"
            }
        
        url = f"{self.api_url}/estates"
        
        try:
            response = self.session.get(url, timeout=10)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                estates = response.json()
                print(f"   ✅ Estates retrieved - Count: {len(estates)}")
                
                for i, estate in enumerate(estates):
                    estate_name = estate.get('name', 'Unnamed')
                    estate_id = estate.get('id', 'No ID')
                    status = estate.get('status', 'unknown')
                    print(f"      Estate {i+1}: {estate_name} ({estate_id[:8]}...) - {status}")
                
                return {
                    "success": True,
                    "estates": estates,
                    "count": len(estates)
                }
            else:
                error_text = response.text
                print(f"   ❌ Failed: {error_text}")
                return {
                    "success": False,
                    "error": f"HTTP_{response.status_code}",
                    "message": error_text
                }
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error: {str(e)}")
            return {
                "success": False,
                "error": "NETWORK_ERROR", 
                "message": str(e)
            }

    def test_get_beneficiaries(self, estate_id: str) -> Dict:
        """Test GET /api/beneficiaries/{estate_id}"""
        print(f"👥 Testing GET /api/beneficiaries/{estate_id[:8]}...")
        
        if not self.access_token:
            return {
                "success": False,
                "error": "NO_AUTH",
                "message": "Not authenticated - login first"
            }
        
        url = f"{self.api_url}/beneficiaries/{estate_id}"
        
        try:
            response = self.session.get(url, timeout=10)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                beneficiaries = response.json()
                print(f"   ✅ Beneficiaries retrieved - Count: {len(beneficiaries)}")
                
                for i, ben in enumerate(beneficiaries):
                    name = ben.get('name', 'Unnamed')
                    ben_id = ben.get('id', 'No ID')
                    relation = ben.get('relation', 'Unknown')
                    print(f"      Beneficiary {i+1}: {name} ({ben_id[:8]}...) - {relation}")
                
                return {
                    "success": True,
                    "beneficiaries": beneficiaries,
                    "count": len(beneficiaries)
                }
            else:
                error_text = response.text
                print(f"   ❌ Failed: {error_text}")
                return {
                    "success": False,
                    "error": f"HTTP_{response.status_code}",
                    "message": error_text
                }
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error: {str(e)}")
            return {
                "success": False,
                "error": "NETWORK_ERROR",
                "message": str(e)
            }

    def test_get_messages(self, estate_id: str) -> Dict:
        """Test GET /api/messages/{estate_id}"""
        print(f"📧 Testing GET /api/messages/{estate_id[:8]}...")
        
        if not self.access_token:
            return {
                "success": False,
                "error": "NO_AUTH",
                "message": "Not authenticated - login first"
            }
        
        url = f"{self.api_url}/messages/{estate_id}"
        
        try:
            response = self.session.get(url, timeout=10)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                messages = response.json()
                print(f"   ✅ Messages retrieved - Count: {len(messages)}")
                
                for i, msg in enumerate(messages):
                    title = msg.get('title', 'Untitled')
                    msg_id = msg.get('id', 'No ID')
                    msg_type = msg.get('message_type', 'unknown')
                    print(f"      Message {i+1}: {title} ({msg_id[:8]}...) - {msg_type}")
                
                return {
                    "success": True,
                    "messages": messages,
                    "count": len(messages)
                }
            else:
                error_text = response.text
                print(f"   ❌ Failed: {error_text}")
                return {
                    "success": False,
                    "error": f"HTTP_{response.status_code}",
                    "message": error_text
                }
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error: {str(e)}")
            return {
                "success": False,
                "error": "NETWORK_ERROR",
                "message": str(e)
            }

    def test_put_beneficiary(self, beneficiary_id: str, estate_id: str) -> Dict:
        """Test PUT /api/beneficiaries/{id} with edit-page payload shape"""
        print(f"✏️  Testing PUT /api/beneficiaries/{beneficiary_id[:8]}...")
        
        if not self.access_token:
            return {
                "success": False,
                "error": "NO_AUTH",
                "message": "Not authenticated - login first"
            }
        
        url = f"{self.api_url}/beneficiaries/{beneficiary_id}"
        
        # Test payload shape used by edit page
        payload = {
            "estate_id": estate_id,
            "first_name": "Test",
            "middle_name": "",
            "last_name": "Beneficiary",
            "suffix": "",
            "relation": "Other",
            "email": "test.beneficiary@example.com",
            "phone": "+1-555-0123",
            "date_of_birth": "1990-01-01",
            "gender": "other",
            "address_street": "123 Test Street",
            "address_city": "Test City", 
            "address_state": "CA",
            "address_zip": "90210",
            "address_line2": "",
            "ssn_last_four": "1234",
            "notes": "Updated via backend test",
            "avatar_color": "#3b82f6"
        }
        
        try:
            response = self.session.put(url, json=payload, timeout=10)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                updated_ben = response.json()
                print(f"   ✅ Beneficiary updated successfully")
                print(f"      Name: {updated_ben.get('name', 'N/A')}")
                print(f"      Email: {updated_ben.get('email', 'N/A')}")
                return {
                    "success": True,
                    "beneficiary": updated_ben
                }
            else:
                error_text = response.text
                print(f"   ❌ Update failed: {error_text}")
                return {
                    "success": False,
                    "error": f"HTTP_{response.status_code}",
                    "message": error_text
                }
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error: {str(e)}")
            return {
                "success": False,
                "error": "NETWORK_ERROR",
                "message": str(e)
            }

    def test_put_message(self, message_id: str) -> Dict:
        """Test PUT /api/messages/{id} with edit-page payload shape"""
        print(f"✏️  Testing PUT /api/messages/{message_id[:8]}...")
        
        if not self.access_token:
            return {
                "success": False,
                "error": "NO_AUTH",
                "message": "Not authenticated - login first"
            }
        
        url = f"{self.api_url}/messages/{message_id}"
        
        # Test payload shape used by edit page  
        payload = {
            "title": "Updated Test Message",
            "content": "This message was updated via backend test",
            "message_type": "text",
            "recipients": [],
            "trigger_type": "immediate",
            "trigger_value": None,
            "trigger_age": None,
            "trigger_date": None,
            "custom_event_label": None
        }
        
        try:
            response = self.session.put(url, json=payload, timeout=10)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                updated_msg = response.json()
                print(f"   ✅ Message updated successfully")
                print(f"      Title: {updated_msg.get('title', 'N/A')}")
                print(f"      Type: {updated_msg.get('message_type', 'N/A')}")
                return {
                    "success": True,
                    "message": updated_msg
                }
            else:
                error_text = response.text
                print(f"   ❌ Update failed: {error_text}")
                return {
                    "success": False,
                    "error": f"HTTP_{response.status_code}",
                    "message": error_text
                }
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Network error: {str(e)}")
            return {
                "success": False,
                "error": "NETWORK_ERROR",
                "message": str(e)
            }

    def run_smoke_tests(self) -> Dict:
        """Run all smoke tests in sequence"""
        print("🚀 Starting CarryOn Backend API Smoke Tests")
        print(f"   Target: {self.api_url}")
        print(f"   Account: {self.email}")
        print("=" * 60)
        
        results = {
            "login": None,
            "estates": None,
            "beneficiaries": None,
            "messages": None,
            "put_beneficiary": None,
            "put_message": None,
            "summary": {
                "total_tests": 6,
                "passed": 0,
                "failed": 0,
                "critical_failures": []
            }
        }
        
        # Test 1: Authentication
        results["login"] = self.test_auth_login()
        if results["login"]["success"]:
            results["summary"]["passed"] += 1
        else:
            results["summary"]["failed"] += 1
            results["summary"]["critical_failures"].append("Authentication failed")
            # Cannot continue without auth
            return results
        
        # Test 2: Get estates
        results["estates"] = self.test_get_estates()
        if results["estates"]["success"]:
            results["summary"]["passed"] += 1
        else:
            results["summary"]["failed"] += 1
            results["summary"]["critical_failures"].append("Cannot retrieve estates")
            # Cannot continue without estates
            return results
        
        estates = results["estates"].get("estates", [])
        if not estates:
            print("   ⚠️  No estates found - cannot test beneficiaries/messages/edits")
            results["summary"]["critical_failures"].append("No estates available for testing")
            return results
        
        # Use the first estate for remaining tests
        test_estate = estates[0]
        estate_id = test_estate.get("id")
        
        # Test 3: Get beneficiaries
        results["beneficiaries"] = self.test_get_beneficiaries(estate_id)
        if results["beneficiaries"]["success"]:
            results["summary"]["passed"] += 1
        else:
            results["summary"]["failed"] += 1
        
        # Test 4: Get messages  
        results["messages"] = self.test_get_messages(estate_id)
        if results["messages"]["success"]:
            results["summary"]["passed"] += 1
        else:
            results["summary"]["failed"] += 1
        
        # Test 5: PUT beneficiary (if we have one)
        beneficiaries = results["beneficiaries"].get("beneficiaries", [])
        if beneficiaries:
            first_ben = beneficiaries[0]
            ben_id = first_ben.get("id")
            results["put_beneficiary"] = self.test_put_beneficiary(ben_id, estate_id)
            if results["put_beneficiary"]["success"]:
                results["summary"]["passed"] += 1
            else:
                results["summary"]["failed"] += 1
        else:
            print("   ⚠️  No beneficiaries found - skipping PUT beneficiary test")
            results["put_beneficiary"] = {
                "success": False, 
                "error": "NO_BENEFICIARIES",
                "message": "No beneficiaries available for edit test"
            }
            results["summary"]["failed"] += 1
        
        # Test 6: PUT message (if we have one)
        messages = results["messages"].get("messages", [])
        if messages:
            first_msg = messages[0] 
            msg_id = first_msg.get("id")
            results["put_message"] = self.test_put_message(msg_id)
            if results["put_message"]["success"]:
                results["summary"]["passed"] += 1
            else:
                results["summary"]["failed"] += 1
        else:
            print("   ⚠️  No messages found - skipping PUT message test")
            results["put_message"] = {
                "success": False,
                "error": "NO_MESSAGES", 
                "message": "No messages available for edit test"
            }
            results["summary"]["failed"] += 1
        
        return results

def main():
    """Run the backend smoke tests"""
    # Test credentials from review request
    BASE_URL = "https://founder-admin-dash.preview.emergentagent.com"
    EMAIL = "fulltest@test.com"
    PASSWORD = "Password.123"
    
    test = BackendAPITest(BASE_URL, EMAIL, PASSWORD)
    results = test.run_smoke_tests()
    
    # Print summary
    print("=" * 60)
    print("📊 Test Summary:")
    summary = results["summary"]
    print(f"   Total Tests: {summary['total_tests']}")
    print(f"   Passed: ✅ {summary['passed']}")
    print(f"   Failed: ❌ {summary['failed']}")
    
    if summary["critical_failures"]:
        print(f"   🚨 Critical Failures:")
        for failure in summary["critical_failures"]:
            print(f"      - {failure}")
    
    # Print detailed results for failures
    failed_tests = []
    for test_name, result in results.items():
        if test_name == "summary":
            continue
        if isinstance(result, dict) and not result.get("success"):
            failed_tests.append((test_name, result))
    
    if failed_tests:
        print("\n🔍 Failure Details:")
        for test_name, result in failed_tests:
            print(f"   {test_name.upper()}:")
            print(f"      Error: {result.get('error', 'Unknown')}")
            print(f"      Message: {result.get('message', 'No details')}")
    
    # Return appropriate exit code
    if summary["critical_failures"] or summary["failed"] > summary["passed"]:
        print("\n❌ Tests FAILED - blocking issues detected")
        exit(1)
    elif summary["failed"] > 0:
        print("\n⚠️  Tests completed with some failures")
        exit(0)
    else:
        print("\n✅ All tests PASSED")
        exit(0)

if __name__ == "__main__":
    main()