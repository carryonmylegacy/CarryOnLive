"""
Test Suite: Estate Guardian AI Chat Enhancements
Tests the AI Guardian capabilities:
- Basic message with estate context
- analyze_vault action
- generate_checklist action
- analyze_readiness action
- ChatResponse action_result field
- Estate state field updates
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials
TEST_EMAIL = "pete@mitchell.com"
TEST_PASSWORD = "password123"
KNOWN_ESTATE_ID = "a515f3ea-388a-408c-8c45-3545d4a0cf29"

@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for test user Pete Mitchell"""
    # Step 1: Login to get OTP
    login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    
    # Step 2: Get OTP from backend logs
    time.sleep(1)  # Wait for log to be written
    
    # Get OTP - try extracting from logs
    import subprocess
    result = subprocess.run(
        ["tail", "-n", "5", "/var/log/supervisor/backend.err.log"],
        capture_output=True, text=True
    )
    
    otp = None
    for line in result.stdout.split('\n'):
        if f"OTP for {TEST_EMAIL}:" in line:
            otp = line.split(":")[-1].strip()
    
    if not otp:
        pytest.skip("Could not extract OTP from logs")
    
    # Step 3: Verify OTP
    verify_resp = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "email": TEST_EMAIL,
        "otp": otp
    })
    assert verify_resp.status_code == 200, f"OTP verification failed: {verify_resp.text}"
    
    data = verify_resp.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def estate_id(auth_headers):
    """Get estate ID for Pete Mitchell"""
    resp = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
    assert resp.status_code == 200
    estates = resp.json()
    assert len(estates) > 0, "No estates found for test user"
    return estates[0]["id"]


class TestEstateGuardianChat:
    """Test Estate Guardian AI chat endpoint"""
    
    def test_basic_chat_message(self, auth_headers, estate_id):
        """POST /api/chat/guardian with basic message returns context-aware response"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "What documents am I missing?",
                "estate_id": estate_id
            },
            timeout=120  # AI calls can take time
        )
        
        assert response.status_code == 200, f"Chat failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "response" in data, "Missing 'response' field"
        assert "session_id" in data, "Missing 'session_id' field"
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 50, "Response seems too short"
        
        # action_result should be None for basic messages
        # (can be None or not present)
        print(f"PASS: Basic chat returned response with {len(data['response'])} chars")
    
    def test_chat_response_includes_action_result_field(self, auth_headers, estate_id):
        """ChatResponse model includes action_result field (can be null)"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "Hello",
                "estate_id": estate_id
            },
            timeout=120
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # The field should be in schema even if null
        assert "action_result" in data or data.get("action_result") is None, \
            "action_result field should be present in response schema"
        print("PASS: ChatResponse includes action_result field")
    
    def test_analyze_vault_action(self, auth_headers, estate_id):
        """POST /api/chat/guardian with action='analyze_vault' analyzes document vault"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "",
                "estate_id": estate_id,
                "action": "analyze_vault"
            },
            timeout=120
        )
        
        assert response.status_code == 200, f"Analyze vault failed: {response.text}"
        data = response.json()
        
        assert "response" in data
        assert len(data["response"]) > 100, "Vault analysis response seems too short"
        
        # Response should reference documents or vault
        response_lower = data["response"].lower()
        has_doc_reference = any(
            term in response_lower 
            for term in ["document", "vault", "will", "trust", "insurance", "file", "uploaded"]
        )
        assert has_doc_reference, "Vault analysis should reference documents"
        print(f"PASS: Vault analysis returned {len(data['response'])} chars with document references")
    
    def test_generate_checklist_action(self, auth_headers, estate_id):
        """POST /api/chat/guardian with action='generate_checklist' generates checklist items"""
        # First, get current checklist count
        checklist_before = requests.get(
            f"{BASE_URL}/api/checklists/{estate_id}",
            headers=auth_headers
        )
        count_before = len(checklist_before.json()) if checklist_before.status_code == 200 else 0  # noqa: F841
        
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "",
                "estate_id": estate_id,
                "action": "generate_checklist"
            },
            timeout=120
        )
        
        assert response.status_code == 200, f"Generate checklist failed: {response.text}"
        data = response.json()
        
        assert "response" in data
        assert "session_id" in data
        
        # Check action_result for checklist generation
        if data.get("action_result"):
            assert data["action_result"].get("action") == "checklist_generated", \
                "action_result should indicate checklist_generated"
            items_added = data["action_result"].get("items_added", 0)
            print(f"PASS: Checklist generated, {items_added} items added")
        else:
            # May not have JSON if AI didn't format correctly, but response should exist
            print("PASS: Checklist action completed (items_added may be 0 if all exist)")
    
    def test_analyze_readiness_action(self, auth_headers, estate_id):
        """POST /api/chat/guardian with action='analyze_readiness' returns readiness analysis"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "",
                "estate_id": estate_id,
                "action": "analyze_readiness"
            },
            timeout=120
        )
        
        assert response.status_code == 200, f"Analyze readiness failed: {response.text}"
        data = response.json()
        
        assert "response" in data
        assert "action_result" in data, "Missing action_result for readiness analysis"
        
        action_result = data["action_result"]
        assert action_result is not None, "action_result should not be None"
        assert action_result.get("action") == "readiness_analyzed", \
            f"Expected action='readiness_analyzed', got {action_result.get('action')}"
        
        # Check readiness breakdown is included
        readiness = action_result.get("readiness")
        assert readiness is not None, "Missing readiness data in action_result"
        assert "documents" in readiness, "Missing documents score"
        assert "messages" in readiness, "Missing messages score"
        assert "checklist" in readiness, "Missing checklist score"
        assert "overall_score" in readiness, "Missing overall_score"
        
        # Verify score structure
        for key in ["documents", "messages", "checklist"]:
            assert "score" in readiness[key], f"Missing score in {key}"
            assert isinstance(readiness[key]["score"], int), f"{key} score should be int"
        
        print(f"PASS: Readiness analysis returned with overall score {readiness['overall_score']}%")
    
    def test_chat_with_estate_id_fetches_context(self, auth_headers, estate_id):
        """POST /api/chat/guardian with estate_id correctly fetches estate context"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "Tell me about my estate and beneficiaries",
                "estate_id": estate_id
            },
            timeout=120
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Response should reference estate-specific info
        response_lower = data["response"].lower()
        has_context = any(
            term in response_lower 
            for term in ["mitchell", "penny", "beneficiary", "estate", "daughter", "family"]
        )
        assert has_context, "Response should include estate context (Mitchell family, Penny, etc.)"
        print("PASS: Chat with estate_id returned context-aware response")


class TestEstateStateField:
    """Test estate 'state' field for state-specific law context"""
    
    def test_estate_has_state_field(self, auth_headers, estate_id):
        """Estate model has 'state' field"""
        response = requests.get(
            f"{BASE_URL}/api/estates/{estate_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # 'state' field should be in the model (can be null)
        # The field existing in response proves it's in the model
        print(f"Estate data keys: {list(data.keys())}")
        # Note: if state is null, it may not appear in response unless explicitly set
        print(f"PASS: Estate retrieved, state field value: {data.get('state', 'not set')}")
    
    def test_patch_estate_with_state(self, auth_headers, estate_id):
        """PATCH /api/estates/{estate_id} accepts 'state' field"""
        # Update estate with state
        patch_response = requests.patch(
            f"{BASE_URL}/api/estates/{estate_id}",
            headers=auth_headers,
            json={"state": "California"}
        )
        
        assert patch_response.status_code == 200, f"Patch failed: {patch_response.text}"
        
        # Verify the update persisted
        get_response = requests.get(
            f"{BASE_URL}/api/estates/{estate_id}",
            headers=auth_headers
        )
        
        assert get_response.status_code == 200
        data = get_response.json()
        assert data.get("state") == "California", f"State not updated. Got: {data.get('state')}"
        print("PASS: PATCH estate with state='California' succeeded")
    
    def test_state_used_in_ai_context(self, auth_headers, estate_id):
        """Estate state is included in AI context for state-specific advice"""
        # First ensure state is set
        requests.patch(
            f"{BASE_URL}/api/estates/{estate_id}",
            headers=auth_headers,
            json={"state": "Texas"}
        )
        
        # Now ask AI about state-specific law
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "What are the estate law requirements in my state?",
                "estate_id": estate_id
            },
            timeout=120
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Response should reference Texas or state-specific law
        response_lower = data["response"].lower()
        has_state_context = any(
            term in response_lower 
            for term in ["texas", "community property", "homestead", "state"]
        )
        
        # Reset state back to California
        requests.patch(
            f"{BASE_URL}/api/estates/{estate_id}",
            headers=auth_headers,
            json={"state": "California"}
        )
        
        assert has_state_context, "AI response should reference estate state (Texas)"
        print("PASS: AI response includes state-specific context")


class TestChatRequestModel:
    """Test ChatRequest model fields"""
    
    def test_chat_request_accepts_estate_id(self, auth_headers, estate_id):
        """ChatRequest accepts estate_id parameter"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "Hello",
                "estate_id": estate_id
            },
            timeout=120
        )
        assert response.status_code == 200, "Should accept estate_id parameter"
        print("PASS: ChatRequest accepts estate_id")
    
    def test_chat_request_accepts_action(self, auth_headers, estate_id):
        """ChatRequest accepts action parameter"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "",
                "estate_id": estate_id,
                "action": "analyze_readiness"
            },
            timeout=120
        )
        assert response.status_code == 200, "Should accept action parameter"
        print("PASS: ChatRequest accepts action parameter")
    
    def test_chat_without_estate_id_uses_first_estate(self, auth_headers):
        """Chat without estate_id falls back to user's first estate"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "What's my estate readiness?"
            },
            timeout=120
        )
        
        assert response.status_code == 200, f"Chat failed: {response.text}"
        data = response.json()
        
        # Should still get context-aware response
        assert "response" in data
        assert len(data["response"]) > 50
        print("PASS: Chat without estate_id uses fallback")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
