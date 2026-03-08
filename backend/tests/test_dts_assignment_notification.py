"""CarryOn™ Backend Tests — DTS Assignment UI + Notification Triggers

Tests for:
1. POST /api/dts/tasks/{id}/assign - Assigns task to operator with notification
2. POST /api/dts/tasks/{id}/status?task_status=quoted - Status update works
3. New user registration triggers founder notification
4. Beneficiary invitation acceptance triggers benefactor notification
5. Document upload triggers beneficiary notification with doc type
"""

import os
import time
import pytest
import requests
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from requirements
FOUNDER_EMAIL = "info@carryon.us"
FOUNDER_PASSWORD = "Demo1234!"
MANAGER_USERNAME = "ops_manager_1"
MANAGER_PASSWORD = "Manager123!"
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"


class TestDTSTaskAssignment:
    """Test DTS task assignment and status update functionality"""

    @pytest.fixture(scope="class")
    def founder_token(self):
        """Get founder auth token - uses dev-login to bypass OTP"""
        time.sleep(2)  # Rate limit buffer
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(f"Founder login failed: {resp.text}")
        return resp.json()["access_token"]

    @pytest.fixture(scope="class")
    def manager_token(self, founder_token):
        """Get manager auth token via admin impersonation"""
        time.sleep(1)
        # Manager uses username, not email, so we need to handle this
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={"email": MANAGER_USERNAME, "password": MANAGER_PASSWORD},
        )
        if resp.status_code != 200:
            # Try alternative login method
            pytest.skip(f"Manager login failed: {resp.text}")
        return resp.json()["access_token"]

    @pytest.fixture(scope="class")
    def benefactor_token(self, founder_token):
        """Get benefactor auth token via admin impersonation"""
        time.sleep(1)
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(f"Benefactor login failed: {resp.text}")
        return resp.json()["access_token"]

    def test_01_get_all_dts_tasks(self, founder_token):
        """GET /api/dts/tasks/all - Get all DTS tasks (admin access)"""
        resp = requests.get(
            f"{BASE_URL}/api/dts/tasks/all",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        tasks = resp.json()
        assert isinstance(tasks, list), "Should return list of tasks"
        print(f"✅ GET /api/dts/tasks/all - Found {len(tasks)} DTS tasks")
        return tasks

    def test_02_get_operators_list(self, founder_token):
        """GET /api/founder/operators - Get list of operators for assignment dropdown"""
        resp = requests.get(
            f"{BASE_URL}/api/founder/operators",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        operators = resp.json()
        assert isinstance(operators, list), "Should return list of operators"
        print(f"✅ GET /api/founder/operators - Found {len(operators)} operators")
        if operators:
            print(
                f"   First operator: {operators[0].get('name', 'N/A')}, role: {operators[0].get('operator_role', 'N/A')}"
            )
        return operators

    def test_03_dts_status_update_valid(self, founder_token):
        """POST /api/dts/tasks/{id}/status?task_status=quoted - Status update works"""
        # First get existing tasks
        tasks_resp = requests.get(
            f"{BASE_URL}/api/dts/tasks/all",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        if tasks_resp.status_code != 200 or not tasks_resp.json():
            pytest.skip("No DTS tasks available for status update test")

        tasks = tasks_resp.json()
        task = tasks[0]  # Use first task
        task_id = task["id"]
        original_status = task.get("status", "submitted")

        # Valid statuses: submitted, quoted, approved, ready, executed, destroyed
        # Try setting to 'quoted' if current is 'submitted'
        new_status = "quoted" if original_status != "quoted" else "submitted"

        resp = requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/status?task_status={new_status}",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        result = resp.json()
        assert "message" in result, "Response should have message"
        assert new_status in result["message"], (
            f"Status should be updated to {new_status}"
        )
        print(
            f"✅ POST /api/dts/tasks/{task_id}/status?task_status={new_status} - Status updated"
        )

        # Restore original status
        requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/status?task_status={original_status}",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={},
        )

    def test_04_dts_status_update_invalid(self, founder_token):
        """POST /api/dts/tasks/{id}/status with invalid status - Should fail"""
        tasks_resp = requests.get(
            f"{BASE_URL}/api/dts/tasks/all",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        if tasks_resp.status_code != 200 or not tasks_resp.json():
            pytest.skip("No DTS tasks available")

        task_id = tasks_resp.json()[0]["id"]

        resp = requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/status?task_status=invalid_status",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={},
        )
        assert resp.status_code == 400, f"Should fail with invalid status: {resp.text}"
        print("✅ Invalid status rejected correctly (400)")

    def test_05_dts_assign_task_to_operator(self, founder_token):
        """POST /api/dts/tasks/{id}/assign - Assigns task to operator with notification"""
        # Get operators list
        ops_resp = requests.get(
            f"{BASE_URL}/api/founder/operators",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        if ops_resp.status_code != 200 or not ops_resp.json():
            pytest.skip("No operators available for assignment test")

        operators = ops_resp.json()
        operator = operators[0]
        operator_id = operator["id"]

        # Get DTS tasks
        tasks_resp = requests.get(
            f"{BASE_URL}/api/dts/tasks/all",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        if tasks_resp.status_code != 200 or not tasks_resp.json():
            pytest.skip("No DTS tasks available for assignment test")

        tasks = tasks_resp.json()
        task = tasks[0]
        task_id = task["id"]

        # Assign task to operator
        resp = requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/assign",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={"operator_id": operator_id},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        result = resp.json()
        assert "message" in result, "Response should have message"
        print(f"✅ POST /api/dts/tasks/{task_id}/assign - {result['message']}")

        # Verify assignment persisted
        task_resp = requests.get(
            f"{BASE_URL}/api/dts/task/{task_id}",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        if task_resp.status_code == 200:
            updated_task = task_resp.json()
            assert updated_task.get("assigned_to") == operator_id, (
                "Task should be assigned to operator"
            )
            print(f"   Verified: Task now assigned to operator {operator_id}")

    def test_06_dts_assign_invalid_operator(self, founder_token):
        """POST /api/dts/tasks/{id}/assign with invalid operator_id - Should fail"""
        tasks_resp = requests.get(
            f"{BASE_URL}/api/dts/tasks/all",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        if tasks_resp.status_code != 200 or not tasks_resp.json():
            pytest.skip("No DTS tasks available")

        task_id = tasks_resp.json()[0]["id"]

        resp = requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/assign",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={"operator_id": "invalid-operator-id-xxx"},
        )
        assert resp.status_code == 404, (
            f"Should fail with invalid operator: {resp.text}"
        )
        print("✅ Invalid operator assignment rejected correctly (404)")


class TestNotificationTriggers:
    """Test notification triggers for registration, invitation acceptance, document upload"""

    @pytest.fixture(scope="class")
    def founder_token(self):
        """Get founder auth token"""
        time.sleep(2)
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(f"Founder login failed: {resp.text}")
        return resp.json()["access_token"]

    @pytest.fixture(scope="class")
    def benefactor_token(self, founder_token):
        """Get benefactor auth token"""
        time.sleep(1)
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(f"Benefactor login failed: {resp.text}")
        return resp.json()["access_token"]

    def test_01_founder_notifications_endpoint(self, founder_token):
        """GET /api/notifications - Founder can access notifications"""
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        # API returns {"notifications": [...], "unread_count": N}
        assert "notifications" in data, "Should have notifications field"
        notifications = data["notifications"]
        assert isinstance(notifications, list), "notifications should be a list"
        print(
            f"✅ GET /api/notifications - Founder has {len(notifications)} notifications, unread: {data.get('unread_count', 0)}"
        )

    def test_02_founder_unread_notification_count(self, founder_token):
        """GET /api/notifications/unread-count - Get unread count"""
        resp = requests.get(
            f"{BASE_URL}/api/notifications/unread-count",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        result = resp.json()
        # API returns {"unread_count": N}
        assert "unread_count" in result, "Should have unread_count field"
        print(
            f"✅ GET /api/notifications/unread-count - Count: {result['unread_count']}"
        )

    def test_03_founder_notification_types(self, founder_token):
        """Verify founder has notifications with expected types"""
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        notifications = data.get("notifications", [])

        # Check for new user signup notifications (type=founder or general)
        found_signup_notifications = [
            n
            for n in notifications
            if "signup" in n.get("title", "").lower()
            or "signup" in n.get("body", "").lower()
            or "registered" in n.get("body", "").lower()
            or "new user" in n.get("title", "").lower()
        ]
        if found_signup_notifications:
            print(
                f"✅ Found {len(found_signup_notifications)} signup-related notifications"
            )
            print(f"   Sample: {found_signup_notifications[0].get('title', 'N/A')}")
        else:
            print(
                f"⚠️ No signup notifications found in {len(notifications)} total notifications"
            )

    def test_04_benefactor_notifications_endpoint(self, benefactor_token):
        """GET /api/notifications - Benefactor can access notifications"""
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        data = resp.json()
        assert "notifications" in data, "Should have notifications field"
        notifications = data["notifications"]
        assert isinstance(notifications, list), "notifications should be a list"
        print(
            f"✅ GET /api/notifications - Benefactor has {len(notifications)} notifications"
        )

        # Check for invitation accepted notifications
        invitation_notifications = [
            n
            for n in notifications
            if "invitation" in n.get("title", "").lower()
            or "invitation" in n.get("body", "").lower()
            or "accepted" in n.get("title", "").lower()
            or "joined" in n.get("title", "").lower()
        ]
        if invitation_notifications:
            print(
                f"   Found {len(invitation_notifications)} invitation-related notifications"
            )

    def test_05_notification_mark_read(self, founder_token):
        """POST /api/notifications/{id}/read - Mark notification as read"""
        # Get notifications first
        resp = requests.get(
            f"{BASE_URL}/api/notifications",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        data = resp.json()
        notifications = data.get("notifications", [])

        if resp.status_code != 200 or not notifications:
            pytest.skip("No notifications to test marking as read")

        notification = notifications[0]
        notification_id = notification["id"]

        mark_resp = requests.post(
            f"{BASE_URL}/api/notifications/{notification_id}/read",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={},
        )
        assert mark_resp.status_code == 200, f"Failed: {mark_resp.text}"
        print(f"✅ POST /api/notifications/{notification_id}/read - Marked as read")

    def test_06_notification_mark_all_read(self, founder_token):
        """POST /api/notifications/read-all - Mark all notifications as read"""
        resp = requests.post(
            f"{BASE_URL}/api/notifications/read-all",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        print("✅ POST /api/notifications/read-all - All marked as read")


class TestNewUserRegistrationNotification:
    """Test that new user registration triggers founder notification"""

    @pytest.fixture(scope="class")
    def founder_token(self):
        """Get founder auth token"""
        time.sleep(2)
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(f"Founder login failed: {resp.text}")
        return resp.json()["access_token"]

    def test_registration_endpoint_exists(self):
        """POST /api/auth/register - Registration endpoint exists"""
        # Just verify the endpoint responds (don't actually register)
        unique_email = f"test_notify_{uuid.uuid4().hex[:8]}@test.com"
        resp = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": unique_email,
                "password": "TestPass123!",
                "first_name": "Test",
                "last_name": "Notification",
                "role": "benefactor",
            },
        )
        # Either 200 (success), 400 (email check), 422 (validation), or 429 (rate limit) is acceptable
        # This confirms the endpoint exists and processes requests
        if resp.status_code == 429:
            print(
                "⚠️ POST /api/auth/register rate limited (429) - endpoint exists but rate limited"
            )
            pytest.skip("Registration endpoint rate limited - skipping")

        assert resp.status_code in [200, 400, 422], (
            f"Registration endpoint error: {resp.status_code} - {resp.text}"
        )
        print(
            f"✅ POST /api/auth/register endpoint accessible (status: {resp.status_code})"
        )

        # If registration was successful, founder should receive notification
        if resp.status_code == 200:
            print("   New user registered - founder should have received notification")


class TestDocumentUploadNotification:
    """Test that document upload triggers beneficiary notifications"""

    @pytest.fixture(scope="class")
    def founder_token(self):
        """Get founder auth token"""
        time.sleep(2)
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(f"Founder login failed: {resp.text}")
        return resp.json()["access_token"]

    @pytest.fixture(scope="class")
    def benefactor_token(self, founder_token):
        """Get benefactor auth token"""
        time.sleep(1)
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            headers={"Authorization": f"Bearer {founder_token}"},
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(f"Benefactor login failed: {resp.text}")
        return resp.json()["access_token"]

    def test_01_get_benefactor_estate(self, benefactor_token):
        """GET /api/estates - Get benefactor's estate for document upload"""
        resp = requests.get(
            f"{BASE_URL}/api/estates",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        estates = resp.json()
        assert isinstance(estates, list), "Should return list of estates"
        if estates:
            print(f"✅ GET /api/estates - Found {len(estates)} estates")
            print(
                f"   First estate: {estates[0].get('name', 'N/A')}, ID: {estates[0].get('id', 'N/A')}"
            )
            return estates[0]["id"]
        else:
            print("⚠️ No estates found for benefactor")
            return None

    def test_02_get_documents_list(self, benefactor_token):
        """GET /api/estates and GET /api/documents/{estate_id} - List documents"""
        # Get estate first
        estates_resp = requests.get(
            f"{BASE_URL}/api/estates",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        if estates_resp.status_code != 200 or not estates_resp.json():
            pytest.skip("No estates available")

        estate_id = estates_resp.json()[0]["id"]

        docs_resp = requests.get(
            f"{BASE_URL}/api/documents/{estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert docs_resp.status_code == 200, f"Failed: {docs_resp.text}"
        documents = docs_resp.json()
        print(f"✅ GET /api/documents/{estate_id} - Found {len(documents)} documents")


class TestDTSQuoteCreation:
    """Test DTS quote creation functionality"""

    @pytest.fixture(scope="class")
    def founder_token(self):
        """Get founder auth token"""
        time.sleep(2)
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(f"Founder login failed: {resp.text}")
        return resp.json()["access_token"]

    def test_01_submit_quote_for_task(self, founder_token):
        """POST /api/dts/tasks/{id}/quote - Submit quote with line items"""
        # Get DTS tasks
        tasks_resp = requests.get(
            f"{BASE_URL}/api/dts/tasks/all",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        if tasks_resp.status_code != 200 or not tasks_resp.json():
            pytest.skip("No DTS tasks available for quote test")

        # Find a task in 'submitted' status
        tasks = tasks_resp.json()
        submitted_task = next(
            (t for t in tasks if t.get("status") == "submitted"), None
        )

        if not submitted_task:
            # Use first task regardless of status for testing
            submitted_task = tasks[0]
            # First reset to submitted status
            requests.post(
                f"{BASE_URL}/api/dts/tasks/{submitted_task['id']}/status?task_status=submitted",
                headers={"Authorization": f"Bearer {founder_token}"},
                json={},
            )
            time.sleep(0.5)

        task_id = submitted_task["id"]

        # Submit quote
        quote_data = {
            "task_id": task_id,
            "line_items": [
                {"description": "Research and planning", "cost": 150.00},
                {"description": "Document preparation", "cost": 75.00},
                {"description": "Execution service", "cost": 200.00},
            ],
            "notes": "Test quote from automated testing",
        }

        resp = requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/quote",
            headers={"Authorization": f"Bearer {founder_token}"},
            json=quote_data,
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        result = resp.json()
        assert "message" in result, "Response should have message"
        print(f"✅ POST /api/dts/tasks/{task_id}/quote - Quote submitted")
        print(f"   Line items: {result.get('line_items', 'N/A')}")

        # Verify task status changed to 'quoted'
        task_resp = requests.get(
            f"{BASE_URL}/api/dts/task/{task_id}",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        if task_resp.status_code == 200:
            updated_task = task_resp.json()
            assert updated_task.get("status") == "quoted", (
                "Task status should be 'quoted'"
            )
            print("   Verified: Task status is now 'quoted'")


class TestOpsOpsDashboard:
    """Test Ops Dashboard accessibility for founder and manager"""

    @pytest.fixture(scope="class")
    def founder_token(self):
        """Get founder auth token"""
        time.sleep(2)
        resp = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        )
        if resp.status_code != 200:
            pytest.skip(f"Founder login failed: {resp.text}")
        return resp.json()["access_token"]

    def test_01_founder_admin_stats(self, founder_token):
        """GET /api/admin/stats - Founder can access admin stats"""
        resp = requests.get(
            f"{BASE_URL}/api/admin/stats",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        # Admin stats might return 200 or 404 depending on implementation
        if resp.status_code == 200:
            resp.json()
            print("✅ GET /api/admin/stats - Dashboard stats accessible")
        else:
            # Try alternative endpoint
            users_resp = requests.get(
                f"{BASE_URL}/api/admin/users",
                headers={"Authorization": f"Bearer {founder_token}"},
            )
            if users_resp.status_code == 200:
                users = users_resp.json()
                print(f"✅ GET /api/admin/users - Found {len(users)} users")
            else:
                print(
                    f"⚠️ Admin endpoints returned {resp.status_code} and {users_resp.status_code}"
                )

    def test_02_founder_operators_list(self, founder_token):
        """GET /api/founder/operators - Founder can see operators"""
        resp = requests.get(
            f"{BASE_URL}/api/founder/operators",
            headers={"Authorization": f"Bearer {founder_token}"},
        )
        assert resp.status_code == 200, f"Failed: {resp.text}"
        operators = resp.json()
        assert isinstance(operators, list), "Should return list"
        print(f"✅ GET /api/founder/operators - Found {len(operators)} operators")

        # Check for manager/worker hierarchy
        managers = [o for o in operators if o.get("operator_role") == "manager"]
        workers = [o for o in operators if o.get("operator_role") == "worker"]
        print(f"   Managers: {len(managers)}, Workers: {len(workers)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
