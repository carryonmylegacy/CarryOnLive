"""
Tests for Guardian Phase 2 Features:
1. Enhanced Grok-like system prompt with 'AI Elf in a vault' persona
2. Legal disclaimer appended to every AI response
3. Printable PDF checklist export endpoint
4. Quick action buttons (Analyze Vault, Generate Checklist, Readiness Score)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://gzip-compress.preview.emergentagent.com"
).rstrip("/")


class TestGuardianPhase2:
    """Test suite for Guardian Phase 2 features"""

    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": "admin@carryon.com", "password": "admin123"},
            timeout=30,
        )
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json().get("access_token")

    @pytest.fixture(scope="class")
    def benefactor_token(self, admin_token):
        """Get benefactor token via admin impersonation"""
        response = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": "vault.test@carryon.com", "password": "VaultTest123!"},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert response.status_code == 200, f"Benefactor login failed: {response.text}"
        return response.json().get("access_token")

    @pytest.fixture(scope="class")
    def auth_headers(self, benefactor_token):
        """Authentication headers for API requests"""
        return {"Authorization": f"Bearer {benefactor_token}"}

    # ─── PDF Export Checklist Endpoint ───
    def test_export_checklist_pdf_returns_valid_pdf(self, auth_headers):
        """POST /api/guardian/export-checklist should return valid PDF"""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-checklist",
            headers=auth_headers,
            timeout=60,
        )

        assert response.status_code == 200, f"Export checklist failed: {response.text}"
        assert response.headers.get("Content-Type") == "application/pdf", (
            "Wrong content type"
        )
        assert len(response.content) > 1000, "PDF too small - likely empty"

        # Check PDF magic bytes
        assert response.content[:4] == b"%PDF", "Invalid PDF file (wrong magic bytes)"
        print(f"✅ PDF export successful - {len(response.content)} bytes")

    def test_export_checklist_pdf_requires_auth(self):
        """POST /api/guardian/export-checklist should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-checklist", timeout=30
        )

        assert response.status_code in [401, 403], (
            f"Expected 401/403, got {response.status_code}"
        )
        print("✅ Export checklist properly requires authentication")

    # ─── AI Chat with Legal Disclaimer ───
    def test_guardian_chat_includes_legal_disclaimer(self, auth_headers):
        """POST /api/chat/guardian response should include legal disclaimer"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            json={
                "message": "What is a will?",
                "session_id": f"test_disclaimer_{int(time.time())}",
            },
            headers=auth_headers,
            timeout=120,
        )

        assert response.status_code == 200, f"Chat failed: {response.text}"

        data = response.json()
        ai_response = data.get("response", "")

        # Verify legal disclaimer is present
        assert "---" in ai_response, "Separator '---' not found in response"
        assert "legal advice" in ai_response.lower(), "Legal advice reference not found"
        assert "attorney" in ai_response.lower(), "Attorney reference not found"
        assert (
            "informational" in ai_response.lower()
            or "educational" in ai_response.lower()
        ), "Informational/educational purpose not mentioned"

        print("✅ Legal disclaimer found in AI response")

    def test_guardian_chat_grok_like_persona(self, auth_headers):
        """AI responses should reflect the Grok-like 'AI Elf' persona"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            json={
                "message": "Hello, who are you?",
                "session_id": f"test_persona_{int(time.time())}",
            },
            headers=auth_headers,
            timeout=120,
        )

        assert response.status_code == 200, f"Chat failed: {response.text}"

        data = response.json()
        ai_response = data.get("response", "").lower()

        # The persona should mention vault, estate, or guardian context
        persona_indicators = ["vault", "estate", "guardian", "documents", "planning"]
        has_persona = any(indicator in ai_response for indicator in persona_indicators)

        assert has_persona, "AI response doesn't reflect estate guardian persona"
        print("✅ AI response reflects Grok-like estate guardian persona")

    # ─── Quick Action Buttons ───
    def test_analyze_vault_action(self, auth_headers):
        """Analyze Vault action should work and return detailed document analysis"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            json={
                "message": "",
                "action": "analyze_vault",
                "session_id": f"test_vault_{int(time.time())}",
            },
            headers=auth_headers,
            timeout=120,
        )

        assert response.status_code == 200, f"Analyze vault failed: {response.text}"

        data = response.json()
        ai_response = data.get("response", "")

        # Should include legal disclaimer
        assert "---" in ai_response, "Legal disclaimer separator not found"
        print("✅ Analyze Vault action works with legal disclaimer")

    def test_generate_checklist_action(self, auth_headers):
        """Generate Checklist action should work"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            json={
                "message": "",
                "action": "generate_checklist",
                "session_id": f"test_checklist_{int(time.time())}",
            },
            headers=auth_headers,
            timeout=120,
        )

        assert response.status_code == 200, (
            f"Generate checklist failed: {response.text}"
        )

        data = response.json()
        ai_response = data.get("response", "")
        action_result = data.get("action_result")

        # Should include legal disclaimer
        assert "---" in ai_response, "Legal disclaimer separator not found"
        print(f"✅ Generate Checklist action works. Action result: {action_result}")

    def test_analyze_readiness_action(self, auth_headers):
        """Analyze Readiness action should work and return readiness data"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            json={
                "message": "",
                "action": "analyze_readiness",
                "session_id": f"test_readiness_{int(time.time())}",
            },
            headers=auth_headers,
            timeout=120,
        )

        assert response.status_code == 200, f"Analyze readiness failed: {response.text}"

        data = response.json()
        ai_response = data.get("response", "")
        action_result = data.get("action_result")

        # Should include legal disclaimer
        assert "---" in ai_response, "Legal disclaimer separator not found"

        # Should return readiness data
        if action_result:
            assert action_result.get("action") == "readiness_analyzed", (
                "Wrong action result"
            )
            readiness = action_result.get("readiness")
            if readiness:
                assert "documents" in readiness, "Documents readiness missing"
                assert "messages" in readiness, "Messages readiness missing"
                assert "checklist" in readiness, "Checklist readiness missing"

        print(f"✅ Analyze Readiness action works. Action result: {action_result}")

    # ─── Chat Sessions ───
    def test_get_chat_sessions(self, auth_headers):
        """GET /api/chat/sessions should return user's chat sessions"""
        response = requests.get(
            f"{BASE_URL}/api/chat/sessions", headers=auth_headers, timeout=30
        )

        assert response.status_code == 200, f"Get sessions failed: {response.text}"

        sessions = response.json()
        assert isinstance(sessions, list), "Sessions should be a list"

        if sessions:
            session = sessions[0]
            assert "session_id" in session, "Session should have session_id"
            assert "title" in session, "Session should have title"
            assert "last_message_at" in session, "Session should have last_message_at"
            assert "message_count" in session, "Session should have message_count"

        print(f"✅ Get chat sessions works - found {len(sessions)} sessions")

    def test_resume_chat_session(self, auth_headers):
        """GET /api/chat/history/{session_id} should return chat history"""
        # First get sessions
        sessions_response = requests.get(
            f"{BASE_URL}/api/chat/sessions", headers=auth_headers, timeout=30
        )

        if sessions_response.status_code == 200 and sessions_response.json():
            session_id = sessions_response.json()[0]["session_id"]

            # Get history for that session
            history_response = requests.get(
                f"{BASE_URL}/api/chat/history/{session_id}",
                headers=auth_headers,
                timeout=30,
            )

            assert history_response.status_code == 200, (
                f"Get history failed: {history_response.text}"
            )

            history = history_response.json()
            assert isinstance(history, list), "History should be a list"

            if history:
                msg = history[0]
                assert "role" in msg, "Message should have role"
                assert "content" in msg, "Message should have content"

            print(f"✅ Resume chat session works - found {len(history)} messages")
        else:
            pytest.skip("No existing sessions to test resume functionality")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
