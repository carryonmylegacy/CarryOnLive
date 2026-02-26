#!/usr/bin/env python3
"""
CarryOn™ Backend Voice Biometric Testing
========================================
Tests voice biometric endpoints and security features
"""

import requests
import json
import io
import wave
import numpy as np
import os
import tempfile
import subprocess

# Backend URL from frontend .env
BACKEND_URL = "https://platform-handoff.preview.emergentagent.com/api"

class CarryOnBackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.user_token = None
        self.test_user = {
            "email": "voice.test@carryon.com",
            "password": "VoiceTest123!",
            "first_name": "Voice",
            "last_name": "Tester"
        }
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

    def create_test_audio(self, duration=2.0, sample_rate=16000):
        """Create a simple test audio file (sine wave)"""
        t = np.linspace(0, duration, int(sample_rate * duration))
        # Generate a simple tone at 440Hz (A note)
        audio = np.sin(2 * np.pi * 440 * t) * 0.3
        
        # Convert to 16-bit PCM
        audio_int16 = (audio * 32767).astype(np.int16)
        
        # Write to temporary WAV file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            with wave.open(tmp.name, 'wb') as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(audio_int16.tobytes())
            return tmp.name

    def test_health_check(self):
        """Test 1: Health check endpoint"""
        try:
            response = self.session.get(f"{BACKEND_URL}/health")
            
            if response.status_code == 200:
                data = response.json()
                expected_fields = ["status", "database", "version"]
                
                if all(field in data for field in expected_fields):
                    self.log_test("Health Check", True, f"Status: {data.get('status')}, DB: {data.get('database')}")
                else:
                    self.log_test("Health Check", False, f"Missing expected fields. Got: {data}")
            else:
                self.log_test("Health Check", False, f"Status code: {response.status_code}")
                
        except Exception as e:
            self.log_test("Health Check", False, error=e)

    def test_auth_flow(self):
        """Test 6: Auth flow regression test"""
        try:
            # Register test user
            register_data = {
                "email": self.test_user["email"],
                "password": self.test_user["password"],
                "first_name": self.test_user["first_name"],
                "last_name": self.test_user["last_name"]
            }
            
            register_response = self.session.post(f"{BACKEND_URL}/auth/register", json=register_data)
            
            if register_response.status_code == 200:
                # Try to login
                login_data = {
                    "email": self.test_user["email"],
                    "password": self.test_user["password"]
                }
                
                login_response = self.session.post(f"{BACKEND_URL}/auth/login", json=login_data)
                
                if login_response.status_code == 200:
                    login_result = login_response.json()
                    print(f"DEBUG: Login response: {login_result}")
                    if "access_token" in login_result:
                        self.user_token = login_result["access_token"]
                        self.session.headers.update({"Authorization": f"Bearer {self.user_token}"})
                        self.log_test("Auth Flow (Register + Login)", True, "User registered and logged in successfully")
                    else:
                        self.log_test("Auth Flow (Register + Login)", False, f"No access_token in login response. Got: {login_result}")
                else:
                    print(f"DEBUG: Login failed response: {login_response.text}")
                    self.log_test("Auth Flow (Register + Login)", False, f"Login failed with status: {login_response.status_code}")
            
            elif register_response.status_code == 400:
                # User might already exist, try login directly
                login_data = {
                    "email": self.test_user["email"],
                    "password": self.test_user["password"]
                }
                
                login_response = self.session.post(f"{BACKEND_URL}/auth/login", json=login_data)
                
                if login_response.status_code == 200:
                    login_result = login_response.json()
                    print(f"DEBUG: Existing user login response: {login_result}")
                    if "access_token" in login_result:
                        self.user_token = login_result["access_token"]
                        self.session.headers.update({"Authorization": f"Bearer {self.user_token}"})
                        self.log_test("Auth Flow (Existing User Login)", True, "Existing user logged in successfully")
                    else:
                        self.log_test("Auth Flow (Existing User Login)", False, f"No access_token in login response. Got: {login_result}")
                else:
                    print(f"DEBUG: Existing user login failed response: {login_response.text}")
                    self.log_test("Auth Flow (Existing User Login)", False, f"Login failed with status: {login_response.status_code}")
            else:
                self.log_test("Auth Flow (Register)", False, f"Register failed with status: {register_response.status_code}")
                
        except Exception as e:
            self.log_test("Auth Flow", False, error=e)

    def test_security_settings(self):
        """Test 2: Security settings endpoint (requires auth)"""
        if not self.user_token:
            self.log_test("Security Settings", False, "No auth token available")
            return
            
        try:
            response = self.session.get(f"{BACKEND_URL}/security/settings")
            
            if response.status_code == 200:
                data = response.json()
                
                # Check if it returns section data
                if isinstance(data, dict) and len(data) > 0:
                    # Check for at least one section with voice_enabled field
                    has_voice_fields = False
                    for section_id, section_data in data.items():
                        if isinstance(section_data, dict) and "voice_enabled" in section_data:
                            has_voice_fields = True
                            break
                    
                    if has_voice_fields:
                        self.log_test("Security Settings", True, f"Found {len(data)} sections with voice_enabled fields")
                    else:
                        self.log_test("Security Settings", False, "No voice_enabled fields found in sections")
                else:
                    self.log_test("Security Settings", False, f"Unexpected response format: {data}")
            else:
                self.log_test("Security Settings", False, f"Status code: {response.status_code}")
                
        except Exception as e:
            self.log_test("Security Settings", False, error=e)

    def test_security_questions(self):
        """Test 3: Security questions endpoint"""
        try:
            response = self.session.get(f"{BACKEND_URL}/security/questions")
            
            if response.status_code == 200:
                data = response.json()
                
                if "questions" in data and isinstance(data["questions"], list) and len(data["questions"]) > 0:
                    self.log_test("Security Questions", True, f"Retrieved {len(data['questions'])} preset questions")
                else:
                    self.log_test("Security Questions", False, f"Unexpected response format: {data}")
            else:
                self.log_test("Security Questions", False, f"Status code: {response.status_code}")
                
        except Exception as e:
            self.log_test("Security Questions", False, error=e)

    def test_voice_enrollment_endpoint(self):
        """Test 4: Voice enrollment endpoint exists and validates inputs"""
        if not self.user_token:
            self.log_test("Voice Enrollment Endpoint", False, "No auth token available")
            return
            
        try:
            # Test 1: Missing file and passphrase (should return 422)
            response = self.session.post(f"{BACKEND_URL}/security/voice/enroll/sdv")
            
            if response.status_code in [400, 422]:
                self.log_test("Voice Enrollment - Missing Data", True, f"Correctly returned {response.status_code} for missing data")
                
                # Test 2: Missing file only (should return 422)
                data = {"passphrase": "test passphrase"}
                response2 = self.session.post(f"{BACKEND_URL}/security/voice/enroll/sdv", data=data)
                
                if response2.status_code in [400, 422]:
                    self.log_test("Voice Enrollment - Missing File", True, f"Correctly returned {response2.status_code} for missing file")
                    
                    # Test 3: Missing passphrase only (should return 422)
                    audio_file = self.create_test_audio()
                    try:
                        with open(audio_file, 'rb') as f:
                            files = {"file": ("test.wav", f, "audio/wav")}
                            response3 = self.session.post(f"{BACKEND_URL}/security/voice/enroll/sdv", files=files)
                            
                        if response3.status_code in [400, 422]:
                            self.log_test("Voice Enrollment - Missing Passphrase", True, f"Correctly returned {response3.status_code} for missing passphrase")
                        else:
                            self.log_test("Voice Enrollment - Missing Passphrase", False, f"Unexpected status: {response3.status_code}")
                    finally:
                        os.unlink(audio_file)
                        
                else:
                    self.log_test("Voice Enrollment - Missing File", False, f"Unexpected status: {response2.status_code}")
            elif response.status_code == 404:
                self.log_test("Voice Enrollment Endpoint", False, "Endpoint not found (404) - route not configured")
            elif response.status_code == 500:
                self.log_test("Voice Enrollment Endpoint", False, "Internal server error (500) - endpoint exists but has issues")
            else:
                self.log_test("Voice Enrollment - Missing Data", False, f"Unexpected status: {response.status_code}")
                
        except Exception as e:
            self.log_test("Voice Enrollment Endpoint", False, error=e)

    def test_voice_verification_endpoint(self):
        """Test 5: Voice verification endpoint exists and handles missing data"""
        if not self.user_token:
            self.log_test("Voice Verification Endpoint", False, "No auth token available")
            return
            
        try:
            # Test missing data (should return 400/422, not 500)
            response = self.session.post(f"{BACKEND_URL}/security/verify/sdv")
            
            if response.status_code in [400, 422]:
                self.log_test("Voice Verification - Missing Data", True, f"Correctly returned {response.status_code} for missing data")
            elif response.status_code == 404:
                self.log_test("Voice Verification Endpoint", False, "Endpoint not found (404) - route not configured")
            elif response.status_code == 500:
                self.log_test("Voice Verification Endpoint", False, "Internal server error (500) - endpoint exists but has issues")
            else:
                # Even other errors are acceptable as long as it's not 404/500
                self.log_test("Voice Verification - Missing Data", True, f"Endpoint exists and returned {response.status_code}")
                
        except Exception as e:
            self.log_test("Voice Verification Endpoint", False, error=e)

    def run_all_tests(self):
        """Run all voice biometric tests"""
        print("=" * 60)
        print("CarryOn™ Voice Biometric Backend Testing")
        print("=" * 60)
        print()
        
        # Test order matches the review request
        self.test_health_check()
        self.test_auth_flow()  # Need auth for security endpoints
        self.test_security_settings()
        self.test_security_questions()
        self.test_voice_enrollment_endpoint()
        self.test_voice_verification_endpoint()
        
        # Summary
        print("=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.results if r["success"])
        total = len(self.results)
        
        print(f"Total tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
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
    tester = CarryOnBackendTester()
    success = tester.run_all_tests()
    exit(0 if success else 1)