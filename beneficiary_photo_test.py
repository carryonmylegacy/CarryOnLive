#!/usr/bin/env python3
"""
CarryOn™ Backend - Beneficiary Photo Upload Testing
=================================================
Tests the beneficiary photo upload and deletion functionality
"""

import requests
import json
import os
import tempfile
from PIL import Image
import io
import base64

# Backend URL from frontend .env
BACKEND_URL = "https://platform-handoff.preview.emergentagent.com/api"

class BeneficiaryPhotoTester:
    def __init__(self):
        self.session = requests.Session()
        self.user_token = None
        self.estate_id = None
        self.beneficiary_id = None
        self.results = []

    def log_test(self, test_name, success, details="", error=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "error": str(error) if error else None
        }
        self.results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"    Details: {details}")
        if error:
            print(f"    Error: {error}")
        print()

    def create_test_image(self, format='PNG', size=(100, 100)):
        """Create a simple test image file"""
        # Create a simple colored image
        img = Image.new('RGB', size, color=(255, 0, 0))  # Red image
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=f'.{format.lower()}', delete=False) as tmp:
            img.save(tmp.name, format=format)
            return tmp.name

    def test_dev_login(self):
        """Test 1: Login using dev-login with audit credentials"""
        try:
            login_data = {
                "email": "audit2@test.com",
                "password": "AuditPass123!@#"
            }
            
            response = self.session.post(f"{BACKEND_URL}/auth/dev-login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.user_token = data["access_token"]
                    self.session.headers.update({"Authorization": f"Bearer {self.user_token}"})
                    self.log_test("Dev Login", True, f"Successfully logged in as {login_data['email']}")
                else:
                    self.log_test("Dev Login", False, f"No access_token in response: {data}")
            else:
                self.log_test("Dev Login", False, f"Login failed with status {response.status_code}: {response.text}")
                
        except Exception as e:
            self.log_test("Dev Login", False, error=e)

    def test_get_estate(self):
        """Test 2: Get estate_id from estates API"""
        if not self.user_token:
            self.log_test("Get Estate", False, "No auth token available")
            return
            
        try:
            response = self.session.get(f"{BACKEND_URL}/estates")
            
            if response.status_code == 200:
                estates = response.json()
                if estates and len(estates) > 0:
                    self.estate_id = estates[0]["id"]
                    self.log_test("Get Estate", True, f"Retrieved estate_id: {self.estate_id}")
                else:
                    self.log_test("Get Estate", False, "No estates found for user")
            else:
                self.log_test("Get Estate", False, f"Failed to get estates: {response.status_code}")
                
        except Exception as e:
            self.log_test("Get Estate", False, error=e)

    def test_create_beneficiary(self):
        """Test 3: Create a test beneficiary for photo upload"""
        if not self.estate_id:
            self.log_test("Create Beneficiary", False, "No estate_id available")
            return
            
        try:
            beneficiary_data = {
                "estate_id": self.estate_id,
                "first_name": "Photo",
                "last_name": "Test",
                "email": "phototest@test.com",
                "relation": "friend"
            }
            
            response = self.session.post(f"{BACKEND_URL}/beneficiaries", json=beneficiary_data)
            
            if response.status_code == 200:
                beneficiary = response.json()
                if "id" in beneficiary:
                    self.beneficiary_id = beneficiary["id"]
                    self.log_test("Create Beneficiary", True, f"Created beneficiary with ID: {self.beneficiary_id}")
                else:
                    self.log_test("Create Beneficiary", False, f"No ID in response: {beneficiary}")
            else:
                self.log_test("Create Beneficiary", False, f"Failed to create beneficiary: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_test("Create Beneficiary", False, error=e)

    def test_upload_beneficiary_photo(self):
        """Test 4: Upload photo to beneficiary"""
        if not self.beneficiary_id:
            self.log_test("Upload Photo", False, "No beneficiary_id available")
            return
            
        try:
            # Create test image
            image_path = self.create_test_image('JPEG', (300, 300))
            
            try:
                with open(image_path, 'rb') as f:
                    files = {"file": ("test_photo.jpg", f, "image/jpeg")}
                    response = self.session.post(
                        f"{BACKEND_URL}/beneficiaries/{self.beneficiary_id}/photo",
                        files=files
                    )
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("success") and "photo_url" in data:
                        photo_url = data["photo_url"]
                        if photo_url.startswith("data:image/jpeg;base64,"):
                            self.log_test("Upload Photo", True, f"Photo uploaded successfully. URL format: data:image/jpeg;base64,... (length: {len(photo_url)})")
                        else:
                            self.log_test("Upload Photo", False, f"Invalid photo_url format: {photo_url[:50]}...")
                    else:
                        self.log_test("Upload Photo", False, f"Unexpected response format: {data}")
                else:
                    self.log_test("Upload Photo", False, f"Upload failed: {response.status_code} - {response.text}")
                    
            finally:
                # Clean up temp file
                os.unlink(image_path)
                
        except Exception as e:
            self.log_test("Upload Photo", False, error=e)

    def test_verify_photo_in_beneficiary(self):
        """Test 5: Verify photo_url is populated in beneficiary data"""
        if not self.estate_id:
            self.log_test("Verify Photo in Beneficiary", False, "No estate_id available")
            return
            
        try:
            response = self.session.get(f"{BACKEND_URL}/beneficiaries/{self.estate_id}")
            
            if response.status_code == 200:
                beneficiaries = response.json()
                
                # Find our test beneficiary
                test_beneficiary = None
                for beneficiary in beneficiaries:
                    if beneficiary.get("id") == self.beneficiary_id:
                        test_beneficiary = beneficiary
                        break
                
                if test_beneficiary:
                    if test_beneficiary.get("photo_url"):
                        photo_url = test_beneficiary["photo_url"]
                        if photo_url.startswith("data:image/jpeg;base64,"):
                            self.log_test("Verify Photo in Beneficiary", True, f"photo_url field correctly populated with base64 data")
                        else:
                            self.log_test("Verify Photo in Beneficiary", False, f"photo_url has unexpected format: {photo_url[:50]}...")
                    else:
                        self.log_test("Verify Photo in Beneficiary", False, "photo_url field is missing or null")
                else:
                    self.log_test("Verify Photo in Beneficiary", False, f"Test beneficiary {self.beneficiary_id} not found in list")
            else:
                self.log_test("Verify Photo in Beneficiary", False, f"Failed to get beneficiaries: {response.status_code}")
                
        except Exception as e:
            self.log_test("Verify Photo in Beneficiary", False, error=e)

    def test_delete_beneficiary_photo(self):
        """Test 6: Delete the beneficiary photo"""
        if not self.beneficiary_id:
            self.log_test("Delete Photo", False, "No beneficiary_id available")
            return
            
        try:
            response = self.session.delete(f"{BACKEND_URL}/beneficiaries/{self.beneficiary_id}/photo")
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    self.log_test("Delete Photo", True, "Photo deleted successfully")
                else:
                    self.log_test("Delete Photo", False, f"Unexpected response format: {data}")
            else:
                self.log_test("Delete Photo", False, f"Delete failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            self.log_test("Delete Photo", False, error=e)

    def test_verify_photo_cleared(self):
        """Test 7: Verify photo_url is now null after deletion"""
        if not self.estate_id:
            self.log_test("Verify Photo Cleared", False, "No estate_id available")
            return
            
        try:
            response = self.session.get(f"{BACKEND_URL}/beneficiaries/{self.estate_id}")
            
            if response.status_code == 200:
                beneficiaries = response.json()
                
                # Find our test beneficiary
                test_beneficiary = None
                for beneficiary in beneficiaries:
                    if beneficiary.get("id") == self.beneficiary_id:
                        test_beneficiary = beneficiary
                        break
                
                if test_beneficiary:
                    photo_url = test_beneficiary.get("photo_url")
                    if photo_url is None:
                        self.log_test("Verify Photo Cleared", True, "photo_url field is correctly set to null")
                    else:
                        self.log_test("Verify Photo Cleared", False, f"photo_url should be null but got: {photo_url}")
                else:
                    self.log_test("Verify Photo Cleared", False, f"Test beneficiary {self.beneficiary_id} not found in list")
            else:
                self.log_test("Verify Photo Cleared", False, f"Failed to get beneficiaries: {response.status_code}")
                
        except Exception as e:
            self.log_test("Verify Photo Cleared", False, error=e)

    def run_all_tests(self):
        """Run all beneficiary photo upload tests"""
        print("=" * 60)
        print("CarryOn™ Beneficiary Photo Upload Testing")
        print("=" * 60)
        print()
        
        # Run tests in sequence as specified in the request
        self.test_dev_login()
        self.test_get_estate()
        self.test_create_beneficiary()
        self.test_upload_beneficiary_photo()
        self.test_verify_photo_in_beneficiary()
        self.test_delete_beneficiary_photo()
        self.test_verify_photo_cleared()
        
        # Summary
        print("=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.results if r["success"])
        total = len(self.results)
        
        print(f"Total tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success rate: {(passed/total*100):.1f}%")
        print()
        
        if total - passed > 0:
            print("FAILED TESTS:")
            for result in self.results:
                if not result["success"]:
                    print(f"  ❌ {result['test']}: {result['error'] or result['details']}")
        else:
            print("🎉 All tests passed!")
            
        return passed == total


if __name__ == "__main__":
    tester = BeneficiaryPhotoTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)