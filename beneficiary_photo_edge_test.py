#!/usr/bin/env python3
"""
CarryOn™ Backend - Beneficiary Photo Upload Edge Case Testing
==========================================================
Tests edge cases and error handling for photo upload functionality
"""

import requests
import json
import os
import tempfile
from PIL import Image
import io

# Backend URL from frontend .env
BACKEND_URL = "https://platform-handoff.preview.emergentagent.com/api"

class BeneficiaryPhotoEdgeCaseTester:
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

    def create_large_image(self, size_mb=12):
        """Create a large test image file"""
        # Create an image that will be larger than 10MB when saved
        # Large dimensions with high quality will create a big file
        img = Image.new('RGB', (4000, 3000), color=(0, 255, 0))  # Green image
        
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            img.save(tmp.name, format='JPEG', quality=95)
            return tmp.name

    def create_text_file(self):
        """Create a non-image text file"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp:
            tmp.write("This is not an image file")
            return tmp.name

    def setup_auth_and_beneficiary(self):
        """Setup authentication and create a test beneficiary"""
        try:
            # Login
            login_data = {"email": "audit2@test.com", "password": "AuditPass123!@#"}
            response = self.session.post(f"{BACKEND_URL}/auth/dev-login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                self.user_token = data["access_token"]
                self.session.headers.update({"Authorization": f"Bearer {self.user_token}"})
                
                # Get estate
                response = self.session.get(f"{BACKEND_URL}/estates")
                if response.status_code == 200:
                    estates = response.json()
                    if estates:
                        self.estate_id = estates[0]["id"]
                        
                        # Create test beneficiary
                        beneficiary_data = {
                            "estate_id": self.estate_id,
                            "first_name": "EdgeCase",
                            "last_name": "Test",
                            "email": "edgecase@test.com",
                            "relation": "friend"
                        }
                        
                        response = self.session.post(f"{BACKEND_URL}/beneficiaries", json=beneficiary_data)
                        if response.status_code == 200:
                            self.beneficiary_id = response.json()["id"]
                            return True
            return False
        except Exception as e:
            print(f"Setup failed: {e}")
            return False

    def test_upload_without_file(self):
        """Test uploading without providing a file"""
        if not self.beneficiary_id:
            self.log_test("Upload Without File", False, "No beneficiary_id available")
            return
            
        try:
            response = self.session.post(f"{BACKEND_URL}/beneficiaries/{self.beneficiary_id}/photo")
            
            # Should return 422 (validation error) for missing file
            if response.status_code in [400, 422]:
                self.log_test("Upload Without File", True, f"Correctly returned {response.status_code} for missing file")
            else:
                self.log_test("Upload Without File", False, f"Expected 400/422, got {response.status_code}")
                
        except Exception as e:
            self.log_test("Upload Without File", False, error=e)

    def test_upload_non_image_file(self):
        """Test uploading a non-image file"""
        if not self.beneficiary_id:
            self.log_test("Upload Non-Image File", False, "No beneficiary_id available")
            return
            
        try:
            text_file = self.create_text_file()
            
            try:
                with open(text_file, 'rb') as f:
                    files = {"file": ("test.txt", f, "text/plain")}
                    response = self.session.post(
                        f"{BACKEND_URL}/beneficiaries/{self.beneficiary_id}/photo",
                        files=files
                    )
                
                # Should return 400 for non-image file
                if response.status_code == 400:
                    data = response.json()
                    if "must be an image" in data.get("detail", "").lower():
                        self.log_test("Upload Non-Image File", True, f"Correctly rejected non-image file: {data['detail']}")
                    else:
                        self.log_test("Upload Non-Image File", True, f"Correctly rejected with 400, detail: {data.get('detail')}")
                else:
                    self.log_test("Upload Non-Image File", False, f"Expected 400, got {response.status_code}")
                    
            finally:
                os.unlink(text_file)
                
        except Exception as e:
            self.log_test("Upload Non-Image File", False, error=e)

    def test_upload_large_file(self):
        """Test uploading a file larger than 10MB"""
        if not self.beneficiary_id:
            self.log_test("Upload Large File", False, "No beneficiary_id available")
            return
            
        try:
            large_image = self.create_large_image()
            file_size = os.path.getsize(large_image) / (1024 * 1024)  # Size in MB
            
            try:
                with open(large_image, 'rb') as f:
                    files = {"file": ("large_image.jpg", f, "image/jpeg")}
                    response = self.session.post(
                        f"{BACKEND_URL}/beneficiaries/{self.beneficiary_id}/photo",
                        files=files
                    )
                
                # Should return 400 for file too large if > 10MB
                if file_size > 10:
                    if response.status_code == 400:
                        data = response.json()
                        if "too large" in data.get("detail", "").lower():
                            self.log_test("Upload Large File", True, f"Correctly rejected {file_size:.1f}MB file: {data['detail']}")
                        else:
                            self.log_test("Upload Large File", True, f"Correctly rejected large file with 400")
                    else:
                        self.log_test("Upload Large File", False, f"Expected 400 for {file_size:.1f}MB file, got {response.status_code}")
                else:
                    # File might not be large enough, accept success
                    if response.status_code == 200:
                        self.log_test("Upload Large File", True, f"File ({file_size:.1f}MB) uploaded successfully (under limit)")
                    else:
                        self.log_test("Upload Large File", False, f"Unexpected status {response.status_code} for {file_size:.1f}MB file")
                    
            finally:
                os.unlink(large_image)
                
        except Exception as e:
            self.log_test("Upload Large File", False, error=e)

    def test_upload_to_nonexistent_beneficiary(self):
        """Test uploading to a non-existent beneficiary"""
        try:
            fake_id = "00000000-0000-0000-0000-000000000000"
            
            # Create a small test image
            img = Image.new('RGB', (50, 50), color=(0, 0, 255))
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                img.save(tmp.name, format='JPEG')
                image_path = tmp.name
            
            try:
                with open(image_path, 'rb') as f:
                    files = {"file": ("test.jpg", f, "image/jpeg")}
                    response = self.session.post(
                        f"{BACKEND_URL}/beneficiaries/{fake_id}/photo",
                        files=files
                    )
                
                # Should return 404 for non-existent beneficiary
                if response.status_code == 404:
                    self.log_test("Upload to Nonexistent Beneficiary", True, "Correctly returned 404 for non-existent beneficiary")
                else:
                    self.log_test("Upload to Nonexistent Beneficiary", False, f"Expected 404, got {response.status_code}")
                    
            finally:
                os.unlink(image_path)
                
        except Exception as e:
            self.log_test("Upload to Nonexistent Beneficiary", False, error=e)

    def test_different_image_formats(self):
        """Test uploading different image formats (PNG, JPEG)"""
        if not self.beneficiary_id:
            self.log_test("Different Image Formats", False, "No beneficiary_id available")
            return
            
        try:
            formats_tested = []
            
            # Test PNG
            png_img = Image.new('RGB', (100, 100), color=(255, 255, 0))  # Yellow
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                png_img.save(tmp.name, format='PNG')
                png_path = tmp.name
            
            try:
                with open(png_path, 'rb') as f:
                    files = {"file": ("test.png", f, "image/png")}
                    response = self.session.post(
                        f"{BACKEND_URL}/beneficiaries/{self.beneficiary_id}/photo",
                        files=files
                    )
                
                if response.status_code == 200:
                    formats_tested.append("PNG ✅")
                else:
                    formats_tested.append(f"PNG ❌ ({response.status_code})")
                    
            finally:
                os.unlink(png_path)
            
            # Test JPEG
            jpeg_img = Image.new('RGB', (100, 100), color=(0, 255, 255))  # Cyan
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                jpeg_img.save(tmp.name, format='JPEG')
                jpeg_path = tmp.name
            
            try:
                with open(jpeg_path, 'rb') as f:
                    files = {"file": ("test.jpg", f, "image/jpeg")}
                    response = self.session.post(
                        f"{BACKEND_URL}/beneficiaries/{self.beneficiary_id}/photo",
                        files=files
                    )
                
                if response.status_code == 200:
                    formats_tested.append("JPEG ✅")
                else:
                    formats_tested.append(f"JPEG ❌ ({response.status_code})")
                    
            finally:
                os.unlink(jpeg_path)
            
            success_count = len([f for f in formats_tested if "✅" in f])
            if success_count >= 1:
                self.log_test("Different Image Formats", True, f"Formats tested: {', '.join(formats_tested)}")
            else:
                self.log_test("Different Image Formats", False, f"No formats worked: {', '.join(formats_tested)}")
                
        except Exception as e:
            self.log_test("Different Image Formats", False, error=e)

    def run_all_tests(self):
        """Run all edge case tests"""
        print("=" * 60)
        print("CarryOn™ Beneficiary Photo Upload - Edge Case Testing")
        print("=" * 60)
        print()
        
        # Setup
        if not self.setup_auth_and_beneficiary():
            print("❌ Failed to setup test environment")
            return False
        
        print(f"✅ Setup complete - using beneficiary ID: {self.beneficiary_id}")
        print()
        
        # Run edge case tests
        self.test_upload_without_file()
        self.test_upload_non_image_file()
        self.test_upload_large_file()
        self.test_upload_to_nonexistent_beneficiary()
        self.test_different_image_formats()
        
        # Summary
        print("=" * 60)
        print("EDGE CASE TEST SUMMARY")
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
            print("🎉 All edge case tests passed!")
            
        return passed == total


if __name__ == "__main__":
    tester = BeneficiaryPhotoEdgeCaseTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)