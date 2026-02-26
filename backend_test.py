#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime
import base64
import io

class CarryOnAPITester:
    def __init__(self, base_url="https://platform-handoff.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.estate_id = None
        self.beneficiary_id = None
        self.document_id = None
        self.message_id = None
        self.checklist_item_id = None
        self.test_document_id = None
        self.test_backup_code = None

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

    def get_otp_from_logs(self, email):
        """Extract OTP from backend logs"""
        try:
            import subprocess
            result = subprocess.run(['tail', '-n', '20', '/var/log/supervisor/backend.err.log'], 
                                  capture_output=True, text=True)
            logs = result.stdout
            
            # Look for the most recent OTP line for this email
            otp = None
            for line in logs.split('\n'):
                if f"OTP for {email}:" in line:
                    otp = line.split(f"OTP for {email}: ")[1].strip()
            return otp  # Returns the last (most recent) OTP found
        except:
            return None

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
        
        # Get the actual OTP from backend logs
        import time
        time.sleep(0.5)  # Give logs time to write
        test_otp = self.get_otp_from_logs(email)
        
        if test_otp:
            print(f"   Found OTP: {test_otp}")
            
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
        """Test document management including new encryption and voice verification features"""
        if not self.estate_id:
            return False
            
        print(f"\n📄 Testing Document Management with Encryption & Voice Verification")
        
        # Get existing documents
        success, response = self.run_test(
            "Get Documents",
            "GET",
            f"documents/{self.estate_id}",
            200
        )
        
        if success:
            if response:
                self.document_id = response[0]['id']
                print(f"   Found {len(response)} existing documents")
        
        # Test document upload with password protection
        test_content = b"This is a test document for password protection"
        files = {'file': ('test_document.txt', io.BytesIO(test_content), 'text/plain')}
        
        upload_url = f"documents/upload?estate_id={self.estate_id}&name=Test%20Password%20Document&category=legal&lock_type=password&lock_password=testpass123"
        
        success, upload_response = self.run_test(
            "Upload Password-Protected Document",
            "POST",
            upload_url,
            200,
            files=files
        )
        
        password_test_success = False
        backup_test_success = False
        voice_test_success = False
        preview_test_success = False
        
        if success and 'backup_code' in upload_response:
            print(f"   ✅ Document uploaded with backup code: {upload_response['backup_code']}")
            self.test_document_id = upload_response['id']
            self.test_backup_code = upload_response['backup_code']
            
            # Test document unlock with password
            unlock_success, _ = self.run_test(
                "Unlock Document with Password",
                "POST",
                f"documents/{self.test_document_id}/unlock",
                200,
                data={"password": "testpass123"}
            )
            
            if unlock_success:
                print(f"   ✅ Document unlocked with password")
                password_test_success = True
            
            # Test document download with password
            download_url = f"documents/{self.test_document_id}/download?password=testpass123"
            download_success, _ = self.run_test(
                "Download Document with Password",
                "GET",
                download_url,
                200
            )
            
            if download_success:
                print(f"   ✅ Document downloaded successfully")
        
        # Test backup-only locked document
        backup_files = {'file': ('backup_test.txt', io.BytesIO(b"backup test content"), 'text/plain')}
        backup_upload_url = f"documents/upload?estate_id={self.estate_id}&name=Backup%20Test%20Document&category=legal&lock_type=backup"
        
        backup_success, backup_response = self.run_test(
            "Upload Backup-Only Document",
            "POST",
            backup_upload_url,
            200,
            files=backup_files
        )
        
        if backup_success and 'backup_code' in backup_response:
            backup_doc_id = backup_response['id']
            backup_code = backup_response['backup_code']
            
            unlock_backup_success, _ = self.run_test(
                "Unlock Backup Document with Code",
                "POST",
                f"documents/{backup_doc_id}/unlock",
                200,
                data={"backup_code": backup_code}
            )
            
            if unlock_backup_success:
                print(f"   ✅ Backup document unlocked with backup code")
                backup_test_success = True
        
        # Test voice verification features
        voice_files = {'file': ('voice_test.txt', io.BytesIO(b"voice verification test content"), 'text/plain')}
        voice_upload_url = f"documents/upload?estate_id={self.estate_id}&name=Voice%20Test%20Document&category=legal&lock_type=voice"
        
        voice_upload_success, voice_response = self.run_test(
            "Upload Voice-Protected Document",
            "POST",
            voice_upload_url,
            200,
            files=voice_files
        )
        
        if voice_upload_success and 'backup_code' in voice_response:
            voice_doc_id = voice_response['id']
            voice_backup_code = voice_response['backup_code']
            print(f"   ✅ Voice document uploaded with backup code: {voice_backup_code}")
            
            # Test voice passphrase setup
            voice_setup_success, setup_response = self.run_test(
                "Setup Voice Passphrase",
                "POST",
                f"documents/{voice_doc_id}/voice/setup?passphrase=open%20sesame",
                200
            )
            
            if voice_setup_success:
                print(f"   ✅ Voice passphrase set up successfully")
                
                # Test voice hint retrieval
                hint_success, hint_response = self.run_test(
                    "Get Voice Hint",
                    "GET",
                    f"documents/{voice_doc_id}/voice/hint",
                    200
                )
                
                if hint_success and hint_response.get('has_passphrase'):
                    print(f"   ✅ Voice hint retrieved: {hint_response.get('hint', 'N/A')}")
                    
                    # Test voice verification
                    verify_success, verify_response = self.run_test(
                        "Verify Voice Passphrase",
                        "POST",
                        f"documents/{voice_doc_id}/voice/verify",
                        200,
                        data={"document_id": voice_doc_id, "spoken_text": "open sesame"}
                    )
                    
                    if verify_success and verify_response.get('verified'):
                        print(f"   ✅ Voice verification successful")
                        voice_test_success = True
                    
                    # Test voice unlock with backup code fallback
                    voice_unlock_success, _ = self.run_test(
                        "Unlock Voice Document with Backup",
                        "POST",
                        f"documents/{voice_doc_id}/unlock",
                        200,
                        data={"backup_code": voice_backup_code}
                    )
                    
                    if voice_unlock_success:
                        print(f"   ✅ Voice document unlocked with backup code")
        
        # Test document preview functionality (NEW P1 FEATURE)
        # Create a PDF-like document for preview testing
        pdf_files = {'file': ('test_preview.pdf', io.BytesIO(b"fake PDF content for preview testing"), 'application/pdf')}
        pdf_upload_url = f"documents/upload?estate_id={self.estate_id}&name=Preview%20Test%20PDF&category=legal"
        
        pdf_success, pdf_response = self.run_test(
            "Upload PDF for Preview Test",
            "POST",
            pdf_upload_url,
            200,
            files=pdf_files
        )
        
        if pdf_success:
            pdf_doc_id = pdf_response['id']
            
            # Test document preview endpoint
            preview_success, _ = self.run_test(
                "Preview Document (PDF)",
                "GET",
                f"documents/{pdf_doc_id}/preview",
                200
            )
            
            if preview_success:
                print(f"   ✅ Document preview successful")
                preview_test_success = True
            
            # Test preview with locked document
            locked_pdf_files = {'file': ('locked_preview.pdf', io.BytesIO(b"locked PDF content"), 'application/pdf')}
            locked_pdf_url = f"documents/upload?estate_id={self.estate_id}&name=Locked%20Preview%20PDF&category=legal&lock_type=password&lock_password=preview123"
            
            locked_pdf_success, locked_pdf_response = self.run_test(
                "Upload Locked PDF for Preview",
                "POST",
                locked_pdf_url,
                200,
                files=locked_pdf_files
            )
            
            if locked_pdf_success:
                locked_pdf_id = locked_pdf_response['id']
                
                # Test preview with credentials
                locked_preview_success, _ = self.run_test(
                    "Preview Locked Document with Password",
                    "GET",
                    f"documents/{locked_pdf_id}/preview?password=preview123",
                    200
                )
                
                if locked_preview_success:
                    print(f"   ✅ Locked document preview with password successful")
        
        # Overall success check
        overall_success = (success and password_test_success and backup_test_success and 
                          voice_test_success and preview_test_success)
        
        if overall_success:
            print(f"   🎉 All document features tested successfully!")
        else:
            print(f"   ⚠️  Some document features failed: Password={password_test_success}, Backup={backup_test_success}, Voice={voice_test_success}, Preview={preview_test_success}")
        
        return overall_success

    def test_messages(self):
        """Test milestone messages including video messages"""
        if not self.estate_id:
            return False
            
        print(f"\n💌 Testing Milestone Messages with Video Support")
        
        # Get existing messages
        success, response = self.run_test(
            "Get Messages",
            "GET",
            f"messages/{self.estate_id}",
            200
        )
        
        if success:
            if response:
                self.message_id = response[0]['id']
                print(f"   Found {len(response)} existing messages")
        
        # Test creating a video message (only for benefactors)
        if hasattr(self, 'current_role') and self.current_role == 'benefactor':
            video_data = base64.b64encode(b"fake_video_data_for_testing").decode()
            
            video_message_data = {
                "estate_id": self.estate_id,
                "title": "Test Video Message",
                "content": "This is a test video message for milestone testing",
                "message_type": "video",
                "video_data": video_data,
                "recipients": [self.beneficiary_id] if self.beneficiary_id else [],
                "trigger_type": "age_milestone",
                "trigger_age": 25
            }
            
            video_success, video_response = self.run_test(
                "Create Video Message",
                "POST",
                "messages",
                200,
                data=video_message_data
            )
            
            if video_success and 'video_url' in video_response:
                print(f"   ✅ Video message created with video URL: {video_response['video_url']}")
                
                # Test video retrieval
                video_id = video_response['video_url']
                video_get_success, _ = self.run_test(
                    "Get Video Data",
                    "GET",
                    f"messages/video/{video_id}",
                    200
                )
                
                if video_get_success:
                    print(f"   ✅ Video data retrieved successfully")
                
                return success and video_success and video_get_success
        else:
            print(f"   ℹ️  Skipping video message creation (role: {getattr(self, 'current_role', 'unknown')})")
        
        return success

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

    def test_multi_estate_support(self):
        """Test multi-estate support (P2 feature)"""
        print(f"\n🏘️ Testing Multi-Estate Support (P2)")
        
        # Create a new estate
        new_estate_data = {
            "name": "Test Secondary Estate",
            "description": "Testing multi-estate functionality"
        }
        
        success, response = self.run_test(
            "Create New Estate",
            "POST",
            "estates",
            200,
            data=new_estate_data
        )
        
        if success and 'id' in response:
            new_estate_id = response['id']
            print(f"   ✅ New estate created: {response['name']} (ID: {new_estate_id})")
            
            # Get all estates to verify multi-estate support
            success, estates_response = self.run_test(
                "Get All Estates (Multi-Estate)",
                "GET",
                "estates",
                200
            )
            
            if success and len(estates_response) >= 2:
                print(f"   ✅ Found {len(estates_response)} estates - multi-estate support confirmed")
                
                # Test switching between estates by getting data for the new estate
                success, estate_data = self.run_test(
                    "Get Specific Estate Data",
                    "GET",
                    f"estates/{new_estate_id}",
                    200
                )
                
                if success:
                    print(f"   ✅ Successfully retrieved data for new estate")
                    
                    # Clean up - delete the test estate
                    delete_success, _ = self.run_test(
                        "Delete Test Estate",
                        "DELETE",
                        f"estates/{new_estate_id}",
                        200
                    )
                    
                    if delete_success:
                        print(f"   ✅ Test estate cleaned up successfully")
                    
                    return True
        
        return False

    def test_activity_timeline(self):
        """Test activity timeline (P2 feature)"""
        if not self.estate_id:
            return False
            
        print(f"\n📊 Testing Activity Timeline (P2)")
        
        success, response = self.run_test(
            "Get Activity Timeline",
            "GET",
            f"activity/{self.estate_id}",
            200
        )
        
        if success:
            activities = response if isinstance(response, list) else []
            print(f"   ✅ Found {len(activities)} activity entries")
            
            if activities:
                # Check activity structure
                first_activity = activities[0]
                required_fields = ['id', 'action', 'description', 'user_name', 'created_at']
                has_all_fields = all(field in first_activity for field in required_fields)
                
                if has_all_fields:
                    print(f"   ✅ Activity structure valid: {first_activity['action']} - {first_activity['description']}")
                    
                    # Test with limit parameter
                    limited_success, limited_response = self.run_test(
                        "Get Limited Activity Timeline",
                        "GET",
                        f"activity/{self.estate_id}?limit=5",
                        200
                    )
                    
                    if limited_success:
                        limited_activities = limited_response if isinstance(limited_response, list) else []
                        print(f"   ✅ Limited query returned {len(limited_activities)} activities (max 5)")
                        return True
                else:
                    print(f"   ❌ Activity structure missing required fields")
            else:
                print(f"   ℹ️  No activities found (this is normal for new estates)")
                return True
        
        return False

    def test_production_readiness(self):
        """Test production readiness - health check, auth endpoints, CORS headers"""
        print(f"\n🏥 Testing Production Readiness")
        
        # Test 1: Health check endpoint
        print(f"\n🔍 Testing Health Check Endpoint")
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health", 
            200
        )
        
        if success:
            expected_fields = ["status", "database", "version"]
            has_all_fields = all(field in response for field in expected_fields)
            
            if has_all_fields and response["status"] == "healthy" and response["version"] == "1.0.0":
                print(f"   ✅ Health check format correct: {response}")
                health_check_success = True
            else:
                print(f"   ❌ Health check format incorrect: {response}")
                health_check_success = False
        else:
            health_check_success = False
        
        # Test 2: Auth endpoints exist (not 404)
        print(f"\n🔐 Testing Auth Endpoints Exist")
        
        # Test register endpoint exists
        register_success, register_response = self.run_test(
            "Register Endpoint Exists",
            "POST",
            "auth/register",
            400,  # Expect 400 for missing data, not 404 for missing endpoint
            data={}
        )
        
        # Test login endpoint exists  
        login_success, login_response = self.run_test(
            "Login Endpoint Exists",
            "POST", 
            "auth/login",
            422,  # Expect validation error for missing data, not 404
            data={}
        )
        
        auth_endpoints_success = register_success and login_success
        
        # Test 3: CORS headers verification
        print(f"\n🌐 Testing CORS Headers")
        try:
            import requests
            url = f"{self.base_url}/health"
            
            # Make preflight request (OPTIONS)
            preflight_response = requests.options(url)
            cors_headers = preflight_response.headers
            
            # Check for required CORS headers
            required_cors_headers = [
                'access-control-allow-origin',
                'access-control-allow-methods', 
                'access-control-allow-headers'
            ]
            
            cors_headers_present = all(
                header.lower() in [h.lower() for h in cors_headers.keys()]
                for header in required_cors_headers
            )
            
            if cors_headers_present:
                print(f"   ✅ CORS headers present")
                print(f"      Origin: {cors_headers.get('Access-Control-Allow-Origin', 'Not set')}")
                print(f"      Methods: {cors_headers.get('Access-Control-Allow-Methods', 'Not set')}")
                print(f"      Headers: {cors_headers.get('Access-Control-Allow-Headers', 'Not set')}")
                cors_success = True
            else:
                print(f"   ❌ Missing CORS headers")
                print(f"      Available headers: {list(cors_headers.keys())}")
                cors_success = False
                
        except Exception as e:
            print(f"   ❌ CORS test failed: {str(e)}")
            cors_success = False
        
        overall_success = health_check_success and auth_endpoints_success and cors_success
        
        if overall_success:
            print(f"\n   🎉 Production readiness tests passed!")
        else:
            print(f"\n   ❌ Production readiness issues found")
            print(f"      Health Check: {'✅' if health_check_success else '❌'}")
            print(f"      Auth Endpoints: {'✅' if auth_endpoints_success else '❌'}")
            print(f"      CORS Headers: {'✅' if cors_success else '❌'}")
        
        return overall_success

def main():
    """Main test execution focused on production readiness"""
    print("🚀 Starting CarryOn™ Production Readiness Tests")
    print("=" * 60)
    
    tester = CarryOnAPITester()
    
    # Focus on production readiness tests
    production_ready = tester.test_production_readiness()
    
    # Print final results
    print(f"\n{'='*60}")
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if production_ready and tester.tests_passed == tester.tests_run:
        print("🎉 Backend is production ready!")
        return 0
    else:
        print("❌ Backend production readiness issues found")
        return 1

if __name__ == "__main__":
    sys.exit(main())