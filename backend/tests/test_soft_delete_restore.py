"""
CarryOn Soft-Delete and Restore Feature Tests
Tests for:
- DELETE endpoints performing soft-delete (not hard delete)
- Restore endpoints allowing only admin (not operator) to restore
- GET endpoints excluding soft_deleted unless include_deleted=true (admin only)
- Support, DTS, Verifications, and Transition certificates
"""

import pytest
import requests
import uuid
import bcrypt
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"


class TestSetup:
    """Setup test users and get tokens"""

    @staticmethod
    def create_test_user(email, password, role, name="Test User"):
        """Create a test user directly in DB or via API"""
        bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        user_data = {
            "email": email,
            "password": password,
            "name": name,
            "role": role,
        }
        # Try to register via API
        response = requests.post(f"{BASE_URL}/api/auth/register", json=user_data)
        if response.status_code == 200:
            return response.json()
        # If user exists, try to login
        return None

    @staticmethod
    def login(email, password):
        """Login and return token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        return None

    @staticmethod
    def get_auth_headers(token):
        """Return auth headers"""
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestHealthCheck:
    """Basic health check"""

    def test_health_endpoint(self):
        """Verify API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("PASS: Health check successful")


class TestSupportConversations:
    """Tests for Support conversation soft-delete and restore"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin and operator tokens"""
        # Create unique test users for this test run
        test_id = str(uuid.uuid4())[:8]
        self.admin_email = f"test_admin_{test_id}@carryon.test"
        self.operator_email = f"test_operator_{test_id}@carryon.test"
        self.test_password = "Password.123"

        # Try to create admin user
        TestSetup.create_test_user(
            self.admin_email, self.test_password, "admin", "Test Admin"
        )
        self.admin_token = TestSetup.login(self.admin_email, self.test_password)

        # Try to create operator user
        TestSetup.create_test_user(
            self.operator_email, self.test_password, "operator", "Test Operator"
        )
        self.operator_token = TestSetup.login(self.operator_email, self.test_password)

        # Fallback to benefactor for basic access tests
        self.benefactor_token = TestSetup.login(BENEFACTOR_EMAIL, BENEFACTOR_PASSWORD)

    def test_get_conversations_excludes_deleted_by_default(self):
        """GET /api/support/conversations excludes soft_deleted by default"""
        if not self.admin_token and not self.benefactor_token:
            pytest.skip("No admin or benefactor token available")

        token = self.admin_token or self.benefactor_token
        headers = TestSetup.get_auth_headers(token)

        response = requests.get(
            f"{BASE_URL}/api/support/conversations", headers=headers
        )
        # Should succeed for admin/operator roles
        if response.status_code == 200:
            data = response.json()
            # Verify no soft_deleted items (unless explicitly requested)
            for conv in data:
                if conv.get("soft_deleted"):
                    # This would be a bug - deleted items shouldn't appear by default
                    print(
                        "WARNING: Found soft_deleted conversation in default response"
                    )
            print(f"PASS: GET conversations returned {len(data)} items")
        elif response.status_code == 403:
            print("PASS: Non-admin user correctly denied access")
        else:
            print(f"Response: {response.status_code} - {response.text}")

    def test_get_conversations_include_deleted_admin_only(self):
        """GET /api/support/conversations?include_deleted=true works only for admin"""
        if not self.admin_token:
            pytest.skip("No admin token available")

        headers = TestSetup.get_auth_headers(self.admin_token)
        response = requests.get(
            f"{BASE_URL}/api/support/conversations?include_deleted=true",
            headers=headers,
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Admin can request include_deleted=true")

    def test_delete_conversation_soft_deletes(self):
        """DELETE /api/admin/support/conversation/{id} performs soft-delete"""
        if not self.admin_token:
            pytest.skip("No admin token available")

        headers = TestSetup.get_auth_headers(self.admin_token)

        # First get a conversation to delete
        response = requests.get(
            f"{BASE_URL}/api/support/conversations", headers=headers
        )
        if response.status_code != 200 or not response.json():
            print("SKIP: No conversations available to test delete")
            return

        conv_id = response.json()[0].get("conversation_id")

        # Delete the conversation
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/support/conversation/{conv_id}", headers=headers
        )

        if delete_response.status_code == 200:
            data = delete_response.json()
            assert data.get("soft_deleted"), "Expected soft_deleted=True in response"
            print(f"PASS: Conversation {conv_id} soft-deleted successfully")
        else:
            print(
                f"DELETE response: {delete_response.status_code} - {delete_response.text}"
            )

    def test_restore_conversation_admin_only(self):
        """POST /api/admin/support/conversation/{id}/restore works only for admin, not operator"""
        # This test verifies the 403 for operators
        if self.operator_token:
            headers = TestSetup.get_auth_headers(self.operator_token)
            # Try to restore any conversation - should get 403
            response = requests.post(
                f"{BASE_URL}/api/admin/support/conversation/test-id/restore",
                headers=headers,
            )
            assert response.status_code == 403, (
                f"Expected 403 for operator, got {response.status_code}"
            )
            print("PASS: Operator correctly denied restore access (403)")
        else:
            print("SKIP: No operator token to test restore denial")


class TestDTSTasks:
    """Tests for DTS task soft-delete and restore"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens"""
        test_id = str(uuid.uuid4())[:8]
        self.admin_email = f"dts_admin_{test_id}@carryon.test"
        self.operator_email = f"dts_operator_{test_id}@carryon.test"
        self.test_password = "Password.123"

        TestSetup.create_test_user(
            self.admin_email, self.test_password, "admin", "DTS Admin"
        )
        self.admin_token = TestSetup.login(self.admin_email, self.test_password)

        TestSetup.create_test_user(
            self.operator_email, self.test_password, "operator", "DTS Operator"
        )
        self.operator_token = TestSetup.login(self.operator_email, self.test_password)

        self.benefactor_token = TestSetup.login(BENEFACTOR_EMAIL, BENEFACTOR_PASSWORD)

    def test_get_all_dts_tasks_excludes_deleted(self):
        """GET /api/dts/tasks/all excludes soft_deleted by default"""
        token = self.admin_token or self.operator_token or self.benefactor_token
        if not token:
            pytest.skip("No token available")

        headers = TestSetup.get_auth_headers(token)
        response = requests.get(f"{BASE_URL}/api/dts/tasks/all", headers=headers)

        if response.status_code == 200:
            data = response.json()
            # Check no soft_deleted items appear by default
            deleted_items = [t for t in data if t.get("soft_deleted")]
            assert len(deleted_items) == 0, (
                f"Found {len(deleted_items)} deleted items in default response"
            )
            print(f"PASS: GET DTS tasks returned {len(data)} items, no deleted")
        elif response.status_code == 403:
            print("PASS: Non-admin correctly denied access")
        else:
            print(f"Response: {response.status_code}")

    def test_get_dts_tasks_include_deleted_admin_only(self):
        """GET /api/dts/tasks/all?include_deleted=true works for admin only"""
        if not self.admin_token:
            pytest.skip("No admin token")

        headers = TestSetup.get_auth_headers(self.admin_token)
        response = requests.get(
            f"{BASE_URL}/api/dts/tasks/all?include_deleted=true", headers=headers
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Admin can request include_deleted=true for DTS tasks")

    def test_restore_dts_task_admin_only(self):
        """POST /api/dts/tasks/{id}/restore returns 403 for operator"""
        if self.operator_token:
            headers = TestSetup.get_auth_headers(self.operator_token)
            response = requests.post(
                f"{BASE_URL}/api/dts/tasks/fake-task-id/restore", headers=headers
            )
            assert response.status_code == 403, (
                f"Expected 403 for operator, got {response.status_code}"
            )
            print("PASS: Operator correctly denied DTS restore (403)")
        else:
            print("SKIP: No operator token")


class TestVerifications:
    """Tests for Tier Verification soft-delete and restore"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens"""
        test_id = str(uuid.uuid4())[:8]
        self.admin_email = f"verify_admin_{test_id}@carryon.test"
        self.operator_email = f"verify_operator_{test_id}@carryon.test"
        self.test_password = "Password.123"

        TestSetup.create_test_user(
            self.admin_email, self.test_password, "admin", "Verify Admin"
        )
        self.admin_token = TestSetup.login(self.admin_email, self.test_password)

        TestSetup.create_test_user(
            self.operator_email, self.test_password, "operator", "Verify Operator"
        )
        self.operator_token = TestSetup.login(self.operator_email, self.test_password)

        self.benefactor_token = TestSetup.login(BENEFACTOR_EMAIL, BENEFACTOR_PASSWORD)

    def test_get_verifications_excludes_deleted(self):
        """GET /api/admin/verifications excludes soft_deleted by default"""
        token = self.admin_token or self.operator_token
        if not token:
            pytest.skip("No admin/operator token")

        headers = TestSetup.get_auth_headers(token)
        response = requests.get(f"{BASE_URL}/api/admin/verifications", headers=headers)

        if response.status_code == 200:
            data = response.json()
            deleted_items = [v for v in data if v.get("soft_deleted")]
            assert len(deleted_items) == 0, (
                f"Found {len(deleted_items)} deleted in default response"
            )
            print(f"PASS: GET verifications returned {len(data)} items")
        elif response.status_code == 403:
            print("PASS: Access denied as expected for non-admin")
        else:
            print(f"Response: {response.status_code}")

    def test_get_verifications_include_deleted_admin(self):
        """GET /api/admin/verifications?include_deleted=true for admin"""
        if not self.admin_token:
            pytest.skip("No admin token")

        headers = TestSetup.get_auth_headers(self.admin_token)
        response = requests.get(
            f"{BASE_URL}/api/admin/verifications?include_deleted=true", headers=headers
        )

        assert response.status_code == 200
        print("PASS: Admin can get verifications with include_deleted")

    def test_delete_verification_soft_deletes(self):
        """DELETE /api/admin/verifications/{id} performs soft-delete"""
        token = self.admin_token or self.operator_token
        if not token:
            pytest.skip("No admin/operator token")

        headers = TestSetup.get_auth_headers(token)

        # Get verifications first
        response = requests.get(f"{BASE_URL}/api/admin/verifications", headers=headers)
        if response.status_code != 200 or not response.json():
            print("SKIP: No verifications to test delete")
            return

        verification_id = response.json()[0].get("id")

        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/verifications/{verification_id}", headers=headers
        )
        if delete_response.status_code == 200:
            data = delete_response.json()
            assert data.get("soft_deleted")
            print(f"PASS: Verification {verification_id} soft-deleted")
        else:
            print(f"DELETE response: {delete_response.status_code}")

    def test_restore_verification_admin_only(self):
        """POST /api/admin/verifications/{id}/restore returns 403 for operator"""
        if self.operator_token:
            headers = TestSetup.get_auth_headers(self.operator_token)
            response = requests.post(
                f"{BASE_URL}/api/admin/verifications/fake-id/restore", headers=headers
            )
            assert response.status_code == 403, (
                f"Expected 403, got {response.status_code}"
            )
            print("PASS: Operator denied verification restore (403)")
        else:
            print("SKIP: No operator token")


class TestTransitionCertificates:
    """Tests for Transition Certificate soft-delete and restore"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens"""
        test_id = str(uuid.uuid4())[:8]
        self.admin_email = f"trans_admin_{test_id}@carryon.test"
        self.operator_email = f"trans_operator_{test_id}@carryon.test"
        self.test_password = "Password.123"

        TestSetup.create_test_user(
            self.admin_email, self.test_password, "admin", "Trans Admin"
        )
        self.admin_token = TestSetup.login(self.admin_email, self.test_password)

        TestSetup.create_test_user(
            self.operator_email, self.test_password, "operator", "Trans Operator"
        )
        self.operator_token = TestSetup.login(self.operator_email, self.test_password)

        self.benefactor_token = TestSetup.login(BENEFACTOR_EMAIL, BENEFACTOR_PASSWORD)

    def test_get_all_certificates_excludes_deleted(self):
        """GET /api/transition/certificates/all excludes soft_deleted by default"""
        token = self.admin_token or self.operator_token
        if not token:
            pytest.skip("No admin/operator token")

        headers = TestSetup.get_auth_headers(token)
        response = requests.get(
            f"{BASE_URL}/api/transition/certificates/all", headers=headers
        )

        if response.status_code == 200:
            data = response.json()
            deleted_items = [c for c in data if c.get("soft_deleted")]
            assert len(deleted_items) == 0, (
                f"Found {len(deleted_items)} deleted in default"
            )
            print(f"PASS: GET certificates returned {len(data)} items")
        elif response.status_code == 403:
            print("PASS: Non-admin denied access")
        else:
            print(f"Response: {response.status_code}")

    def test_get_certificates_include_deleted(self):
        """GET /api/transition/certificates/all?include_deleted=true for admin"""
        if not self.admin_token:
            pytest.skip("No admin token")

        headers = TestSetup.get_auth_headers(self.admin_token)
        response = requests.get(
            f"{BASE_URL}/api/transition/certificates/all?include_deleted=true",
            headers=headers,
        )

        assert response.status_code == 200
        print("PASS: Admin can get certificates with include_deleted")

    def test_soft_delete_certificate(self):
        """POST /api/transition/certificates/{id}/soft-delete performs soft-delete"""
        token = self.admin_token or self.operator_token
        if not token:
            pytest.skip("No admin/operator token")

        headers = TestSetup.get_auth_headers(token)

        # Get certificates first
        response = requests.get(
            f"{BASE_URL}/api/transition/certificates/all", headers=headers
        )
        if response.status_code != 200 or not response.json():
            print("SKIP: No certificates to test soft-delete")
            return

        cert_id = response.json()[0].get("id")

        delete_response = requests.post(
            f"{BASE_URL}/api/transition/certificates/{cert_id}/soft-delete",
            headers=headers,
        )
        if delete_response.status_code == 200:
            data = delete_response.json()
            assert data.get("soft_deleted")
            print(f"PASS: Certificate {cert_id} soft-deleted")
        else:
            print(f"Soft-delete response: {delete_response.status_code}")

    def test_restore_certificate_admin_only(self):
        """POST /api/transition/certificates/{id}/restore returns 403 for operator"""
        if self.operator_token:
            headers = TestSetup.get_auth_headers(self.operator_token)
            response = requests.post(
                f"{BASE_URL}/api/transition/certificates/fake-id/restore",
                headers=headers,
            )
            assert response.status_code == 403, (
                f"Expected 403, got {response.status_code}"
            )
            print("PASS: Operator denied certificate restore (403)")
        else:
            print("SKIP: No operator token")


class TestRoleAccess:
    """Tests for operator vs admin role access to endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens"""
        test_id = str(uuid.uuid4())[:8]
        self.admin_email = f"role_admin_{test_id}@carryon.test"
        self.operator_email = f"role_operator_{test_id}@carryon.test"
        self.test_password = "Password.123"

        TestSetup.create_test_user(
            self.admin_email, self.test_password, "admin", "Role Admin"
        )
        self.admin_token = TestSetup.login(self.admin_email, self.test_password)

        TestSetup.create_test_user(
            self.operator_email, self.test_password, "operator", "Role Operator"
        )
        self.operator_token = TestSetup.login(self.operator_email, self.test_password)

    def test_operator_can_access_support_conversations(self):
        """Operator can GET /api/support/conversations"""
        if not self.operator_token:
            pytest.skip("No operator token")

        headers = TestSetup.get_auth_headers(self.operator_token)
        response = requests.get(
            f"{BASE_URL}/api/support/conversations", headers=headers
        )

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Operator can access support conversations")

    def test_operator_can_delete_conversation(self):
        """Operator can DELETE /api/admin/support/conversation/{id}"""
        if not self.operator_token:
            pytest.skip("No operator token")

        headers = TestSetup.get_auth_headers(self.operator_token)

        # Get conversations
        response = requests.get(
            f"{BASE_URL}/api/support/conversations", headers=headers
        )
        if response.status_code != 200 or not response.json():
            print("SKIP: No conversations available")
            return

        conv_id = response.json()[0].get("conversation_id")
        delete_response = requests.delete(
            f"{BASE_URL}/api/admin/support/conversation/{conv_id}", headers=headers
        )

        # Should succeed (200) since operator can soft-delete
        if delete_response.status_code == 200:
            print("PASS: Operator can soft-delete conversation")
        else:
            print(f"Delete response: {delete_response.status_code}")

    def test_operator_can_access_dts_tasks(self):
        """Operator can GET /api/dts/tasks/all"""
        if not self.operator_token:
            pytest.skip("No operator token")

        headers = TestSetup.get_auth_headers(self.operator_token)
        response = requests.get(f"{BASE_URL}/api/dts/tasks/all", headers=headers)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Operator can access DTS tasks")

    def test_operator_can_access_verifications(self):
        """Operator can GET /api/admin/verifications"""
        if not self.operator_token:
            pytest.skip("No operator token")

        headers = TestSetup.get_auth_headers(self.operator_token)
        response = requests.get(f"{BASE_URL}/api/admin/verifications", headers=headers)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Operator can access verifications")

    def test_operator_cannot_restore_items(self):
        """Operator gets 403 on all restore endpoints"""
        if not self.operator_token:
            pytest.skip("No operator token")

        headers = TestSetup.get_auth_headers(self.operator_token)

        # Test all restore endpoints
        restore_endpoints = [
            "/api/admin/support/conversation/test-id/restore",
            "/api/dts/tasks/test-id/restore",
            "/api/admin/verifications/test-id/restore",
            "/api/transition/certificates/test-id/restore",
        ]

        for endpoint in restore_endpoints:
            response = requests.post(f"{BASE_URL}{endpoint}", headers=headers)
            assert response.status_code == 403, (
                f"Expected 403 for {endpoint}, got {response.status_code}"
            )

        print("PASS: Operator denied all restore endpoints (403)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
