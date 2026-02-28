"""
Test Guardian Chat Sessions - Backend API Tests
Tests for:
- GET /api/chat/sessions - List chat sessions
- DELETE /api/chat/sessions/{session_id} - Delete a session
- GET /api/chat/history/{session_id} - Get messages for a session
- POST /api/chat/guardian - Send message (creates session)
"""

import os
import pytest
import requests
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestGuardianSessions:
    """Tests for Guardian chat session management APIs"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Authenticate and get token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": "admin@carryon.com", "password": "admin123"}
        )
        if response.status_code != 200:
            pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
        data = response.json()
        return data.get("access_token")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Return authorization headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    # ──────────────────────────────────────────────
    # TEST: GET /api/chat/sessions
    # ──────────────────────────────────────────────
    def test_get_sessions_returns_list(self, headers):
        """GET /api/chat/sessions should return list of sessions"""
        response = requests.get(f"{BASE_URL}/api/chat/sessions", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list), "Response should be a list"
        
        # If sessions exist, validate structure
        if len(data) > 0:
            session = data[0]
            assert "session_id" in session, "Session should have session_id"
            assert "title" in session, "Session should have title"
            assert "last_message_at" in session, "Session should have last_message_at"
            assert "message_count" in session, "Session should have message_count"
            print(f"✓ GET /api/chat/sessions - Found {len(data)} sessions")
        else:
            print("✓ GET /api/chat/sessions - No sessions yet (empty list)")
    
    def test_get_sessions_limit(self, headers):
        """Sessions endpoint should limit to 20 results"""
        response = requests.get(f"{BASE_URL}/api/chat/sessions", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        # API should limit to 20 sessions
        assert len(data) <= 20, f"Expected max 20 sessions, got {len(data)}"
        print(f"✓ Sessions limit check - {len(data)} sessions (max 20)")
    
    # ──────────────────────────────────────────────
    # TEST: POST /api/chat/guardian (create session)
    # ──────────────────────────────────────────────
    def test_create_new_chat_session(self, headers):
        """POST /api/chat/guardian should create a new chat session"""
        # Generate unique session ID for test
        test_session_id = f"test_session_{int(time.time())}"
        
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=headers,
            json={
                "message": "TEST_SESSION: What is estate planning?",
                "session_id": test_session_id,
                "estate_id": None,
                "action": None
            },
            timeout=60
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "response" in data, "Response should have 'response' field"
        assert "session_id" in data, "Response should have 'session_id' field"
        assert len(data["response"]) > 0, "Response should not be empty"
        
        # Session ID should be returned (either the one we sent or new one)
        assert data["session_id"], "Session ID should not be empty"
        print(f"✓ POST /api/chat/guardian - Created session: {data['session_id'][:30]}...")
        
        # Return session_id for cleanup
        return data["session_id"]
    
    # ──────────────────────────────────────────────
    # TEST: GET /api/chat/history/{session_id}
    # ──────────────────────────────────────────────
    def test_get_chat_history_valid_session(self, headers):
        """GET /api/chat/history/{session_id} should return messages"""
        # First get sessions to find a valid session_id
        sessions_response = requests.get(f"{BASE_URL}/api/chat/sessions", headers=headers)
        
        if sessions_response.status_code != 200 or len(sessions_response.json()) == 0:
            pytest.skip("No sessions available to test history")
        
        session_id = sessions_response.json()[0]["session_id"]
        
        response = requests.get(
            f"{BASE_URL}/api/chat/history/{session_id}",
            headers=headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should be a list of messages
        assert isinstance(data, list), "History should be a list"
        
        # If messages exist, validate structure
        if len(data) > 0:
            msg = data[0]
            assert "role" in msg, "Message should have 'role' field"
            assert "content" in msg, "Message should have 'content' field"
            assert msg["role"] in ["user", "assistant"], f"Role should be 'user' or 'assistant', got {msg['role']}"
            print(f"✓ GET /api/chat/history/{session_id[:20]}... - Found {len(data)} messages")
        else:
            print(f"✓ GET /api/chat/history/{session_id[:20]}... - Empty history")
    
    def test_get_chat_history_nonexistent_session(self, headers):
        """GET /api/chat/history with nonexistent session should return empty list"""
        fake_session = "nonexistent_session_12345"
        
        response = requests.get(
            f"{BASE_URL}/api/chat/history/{fake_session}",
            headers=headers
        )
        
        # Should return 200 with empty list (not 404)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        assert len(data) == 0, "Should return empty list for nonexistent session"
        print("✓ GET /api/chat/history with nonexistent session - Returns empty list")
    
    # ──────────────────────────────────────────────
    # TEST: DELETE /api/chat/sessions/{session_id}
    # ──────────────────────────────────────────────
    def test_delete_session(self, headers):
        """DELETE /api/chat/sessions/{session_id} should remove session"""
        # First create a test session to delete
        test_session_id = f"test_delete_{int(time.time())}"
        
        # Create a message to create the session
        create_response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=headers,
            json={
                "message": "TEST_DELETE: This session will be deleted",
                "session_id": test_session_id,
                "estate_id": None,
                "action": None
            },
            timeout=60
        )
        
        if create_response.status_code != 200:
            pytest.skip("Could not create test session for deletion")
        
        session_id = create_response.json()["session_id"]
        
        # Now delete it
        delete_response = requests.delete(
            f"{BASE_URL}/api/chat/sessions/{session_id}",
            headers=headers
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        data = delete_response.json()
        
        assert "success" in data, "Response should have 'success' field"
        assert data["success"] == True, "success should be True"
        assert "deleted" in data, "Response should have 'deleted' count"
        assert data["deleted"] >= 1, "Should have deleted at least 1 message"
        
        print(f"✓ DELETE /api/chat/sessions/{session_id[:20]}... - Deleted {data['deleted']} messages")
        
        # Verify it's actually deleted - history should be empty
        verify_response = requests.get(
            f"{BASE_URL}/api/chat/history/{session_id}",
            headers=headers
        )
        assert verify_response.status_code == 200
        assert len(verify_response.json()) == 0, "Session history should be empty after delete"
        print("✓ Verified session deleted - history is empty")
    
    def test_delete_nonexistent_session(self, headers):
        """DELETE nonexistent session should return 404"""
        fake_session = "fake_session_to_delete_999"
        
        response = requests.delete(
            f"{BASE_URL}/api/chat/sessions/{fake_session}",
            headers=headers
        )
        
        assert response.status_code == 404, f"Expected 404 for nonexistent session, got {response.status_code}"
        print("✓ DELETE nonexistent session - Returns 404")
    
    # ──────────────────────────────────────────────
    # TEST: Authentication required
    # ──────────────────────────────────────────────
    def test_sessions_require_auth(self):
        """Sessions endpoints should require authentication"""
        # No auth header
        response = requests.get(f"{BASE_URL}/api/chat/sessions")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ GET /api/chat/sessions requires authentication")
    
    def test_delete_session_requires_auth(self):
        """Delete session should require authentication"""
        response = requests.delete(f"{BASE_URL}/api/chat/sessions/fake_id")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ DELETE /api/chat/sessions requires authentication")
    
    def test_history_requires_auth(self):
        """History endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/chat/history/fake_id")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ GET /api/chat/history requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
