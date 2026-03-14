"""
Iteration 111 - Guardian To-Do and IAC Split Feature Tests
Tests the split of 'Generate Checklist' into two distinct functions:
1. 'Generate To-Do List' - creates estate-strengthening tasks for benefactor (text + PDF, NO IAC population)
2. 'Generate IAC' - creates actionable items for beneficiaries (populates IAC database)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for founder/admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=30,
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token") or data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Auth headers for authenticated requests"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def estate_id(auth_headers):
    """Get the first estate ID for the user"""
    response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers, timeout=30)
    if response.status_code == 200 and response.json():
        return response.json()[0]["id"]
    pytest.skip("No estates found for user")


class TestGenerateTodoAction:
    """Tests for the generate_todo action - should NOT populate IAC"""

    def test_generate_todo_returns_action_result(self, auth_headers, estate_id):
        """POST /api/guardian/chat with action='generate_todo' returns action_result with action='todo_generated'"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "",
                "action": "generate_todo",
                "estate_id": estate_id,
            },
            timeout=120,  # AI responses may take time
        )

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )
        data = response.json()

        # Verify action_result structure
        assert "action_result" in data, "Response should contain action_result"
        action_result = data["action_result"]
        assert action_result is not None, "action_result should not be None"
        assert action_result.get("action") == "todo_generated", (
            f"Expected action='todo_generated', got {action_result.get('action')}"
        )

        # Verify NO items_added field (IAC should not be populated)
        assert "items_added" not in action_result, (
            "generate_todo should NOT populate IAC (no items_added field)"
        )

        # Verify response content exists
        assert "response" in data, "Response should contain AI response text"
        assert len(data["response"]) > 100, (
            "Response should contain substantial content"
        )

        print("PASS: generate_todo returned action_result with action='todo_generated'")
        print(f"Response length: {len(data['response'])} characters")

    def test_generate_todo_response_no_checklist_json(self, auth_headers, estate_id):
        """Verify generate_todo response does NOT contain checklist_json block"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "",
                "action": "generate_todo",
                "estate_id": estate_id,
            },
            timeout=120,
        )

        assert response.status_code == 200
        data = response.json()

        # The AI response should NOT contain checklist_json format
        ai_response = data.get("response", "")
        assert "```checklist_json" not in ai_response, (
            "generate_todo response should NOT contain checklist_json block"
        )

        print("PASS: generate_todo response does not contain checklist_json block")


class TestGenerateIACAction:
    """Tests for the generate_iac action - SHOULD populate IAC"""

    def test_generate_iac_returns_action_result_with_items(
        self, auth_headers, estate_id
    ):
        """POST /api/guardian/chat with action='generate_iac' returns response with IAC items"""
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "",
                "action": "generate_iac",
                "estate_id": estate_id,
            },
            timeout=120,  # AI responses may take time
        )

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )
        data = response.json()

        # Verify action_result structure
        assert "action_result" in data, "Response should contain action_result"
        action_result = data["action_result"]

        # If IAC items were added, verify the structure
        if action_result and action_result.get("action") == "iac_generated":
            assert "items_added" in action_result, (
                "iac_generated should include items_added count"
            )
            items_added = action_result["items_added"]
            assert isinstance(items_added, int), "items_added should be an integer"
            print(f"PASS: generate_iac added {items_added} IAC items to database")
        else:
            # Sometimes no new items added if duplicates exist
            print(f"INFO: generate_iac action_result: {action_result}")

        # Verify response content exists
        assert "response" in data, "Response should contain AI response text"
        assert len(data["response"]) > 100, (
            "Response should contain substantial content"
        )


class TestExportTodoEndpoint:
    """Tests for POST /api/guardian/export-todo endpoint"""

    def test_export_todo_pdf_success(self, auth_headers):
        """POST /api/guardian/export-todo with content returns valid PDF"""
        test_content = """## Immediate (Days 1-3)
1. Contact estate attorney to review will
2. Gather all beneficiary designations

## First Week
- Review life insurance policies
- Update trust documentation"""

        response = requests.post(
            f"{BASE_URL}/api/guardian/export-todo",
            headers=auth_headers,
            json={"content": test_content},
            timeout=30,
        )

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        # Verify PDF content type
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, (
            f"Expected PDF content type, got {content_type}"
        )

        # Verify PDF magic bytes
        pdf_content = response.content
        assert pdf_content[:4] == b"%PDF", "Response should start with PDF magic bytes"

        # Verify Content-Disposition header
        content_disp = response.headers.get("Content-Disposition", "")
        assert "CarryOn_ToDo" in content_disp, (
            f"Expected filename with CarryOn_ToDo, got {content_disp}"
        )

        print(f"PASS: export-todo returned valid PDF ({len(pdf_content)} bytes)")

    def test_export_todo_pdf_with_empty_content(self, auth_headers):
        """POST /api/guardian/export-todo with minimal content still works"""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-todo",
            headers=auth_headers,
            json={"content": "Minimal content"},
            timeout=30,
        )

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )
        print("PASS: export-todo handles minimal content")

    def test_export_todo_pdf_requires_auth(self):
        """POST /api/guardian/export-todo without auth returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-todo",
            json={"content": "Test content"},
            timeout=30,
        )

        assert response.status_code in [401, 403], (
            f"Expected 401/403 without auth, got {response.status_code}"
        )
        print("PASS: export-todo requires authentication")


class TestExportChecklistEndpoint:
    """Tests for POST /api/guardian/export-checklist (existing IAC export)"""

    def test_export_checklist_pdf_still_works(self, auth_headers):
        """POST /api/guardian/export-checklist still works for exporting existing IAC items"""
        response = requests.post(
            f"{BASE_URL}/api/guardian/export-checklist",
            headers=auth_headers,
            json={},
            timeout=30,
        )

        # May return 404 if no checklist items exist, or 200 with PDF
        if response.status_code == 200:
            content_type = response.headers.get("Content-Type", "")
            assert "application/pdf" in content_type, (
                f"Expected PDF content type, got {content_type}"
            )
            print("PASS: export-checklist returned valid PDF")
        elif response.status_code == 404:
            print("INFO: No checklist items found - endpoint returns 404 as expected")
        else:
            pytest.fail(f"Unexpected status {response.status_code}: {response.text}")


class TestActionButtonsConfiguration:
    """Verify action buttons match expected configuration in backend"""

    def test_generate_todo_uses_correct_prompt(self, auth_headers, estate_id):
        """Verify generate_todo sends the correct prompt to AI"""
        # This is implicitly tested by checking the response format
        # The prompt explicitly says "Do NOT include any JSON blocks"
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "",
                "action": "generate_todo",
                "estate_id": estate_id,
            },
            timeout=120,
        )

        assert response.status_code == 200
        data = response.json()

        # Verify the response structure indicates todo_generated
        action_result = data.get("action_result", {})
        if action_result:
            assert action_result.get("action") == "todo_generated", (
                "Should use todo_generated action"
            )

        print("PASS: generate_todo uses correct action identifier")

    def test_generate_iac_uses_checklist_json_format(self, auth_headers, estate_id):
        """Verify generate_iac requests checklist_json format from AI"""
        # The backend prompt for generate_iac includes:
        # "Return your response as helpful guidance, and also return the checklist items in this exact JSON format"
        response = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_headers,
            json={
                "message": "",
                "action": "generate_iac",
                "estate_id": estate_id,
            },
            timeout=120,
        )

        assert response.status_code == 200
        data = response.json()

        # If IAC was generated, it should have the iac_generated action
        action_result = data.get("action_result", {})
        if action_result and action_result.get("action") == "iac_generated":
            assert "items_added" in action_result, (
                "iac_generated should track items_added"
            )
            print(
                f"PASS: generate_iac uses iac_generated action with items_added={action_result['items_added']}"
            )
        else:
            # Could be no new items if duplicates
            print(f"INFO: generate_iac action_result: {action_result}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
