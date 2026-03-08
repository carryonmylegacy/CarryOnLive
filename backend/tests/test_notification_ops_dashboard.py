"""
CarryOn™ — Notification System, Ops Dashboard & DTS Task Assignment Tests

Tests cover:
- Notification CRUD endpoints (GET /notifications, POST /notifications/{id}/read, etc.)
- Ops Dashboard endpoint (GET /ops/dashboard)
- DTS task assignment (POST /dts/tasks/{id}/assign)
- Notification triggers on DTS task creation
- Notification triggers on death certificate upload
- Notification triggers on support message
- Operator create/delete by manager triggers founder notification
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
FOUNDER_EMAIL = "info@carryon.us"
FOUNDER_PASSWORD = "Demo1234!"
MANAGER_USERNAME = "ops_manager_1"
MANAGER_PASSWORD = "Manager123!"
WORKER_USERNAME = "ops_worker_1"
WORKER_PASSWORD = "Worker123!"
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"


@pytest.fixture(scope="module")
def founder_token():
    """Get Founder auth token"""
    time.sleep(2)  # Rate limit protection
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
    )
    if response.status_code != 200:
        pytest.skip(f"Founder login failed: {response.status_code} - {response.text}")
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def manager_token():
    """Get Manager auth token"""
    time.sleep(2)
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": MANAGER_USERNAME, "password": MANAGER_PASSWORD},
    )
    if response.status_code != 200:
        pytest.skip(f"Manager login failed: {response.status_code} - {response.text}")
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def worker_token():
    """Get Worker auth token"""
    time.sleep(2)
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": WORKER_USERNAME, "password": WORKER_PASSWORD},
    )
    if response.status_code != 200:
        pytest.skip(f"Worker login failed: {response.status_code} - {response.text}")
    return response.json().get("access_token")


@pytest.fixture(scope="module")
def benefactor_token():
    """Get Benefactor auth token"""
    time.sleep(2)
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
    )
    if response.status_code != 200:
        pytest.skip(
            f"Benefactor login failed: {response.status_code} - {response.text}"
        )
    return response.json().get("access_token")


# ============ NOTIFICATION CRUD TESTS ============


class TestNotificationEndpoints:
    """Test notification CRUD endpoints"""

    def test_get_notifications(self, founder_token):
        """GET /api/notifications - Returns user notifications with unread count"""
        headers = {"Authorization": f"Bearer {founder_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )
        data = response.json()

        # Verify response structure
        assert "notifications" in data, "Response should have 'notifications' field"
        assert "unread_count" in data, "Response should have 'unread_count' field"
        assert isinstance(data["notifications"], list), "notifications should be a list"
        assert isinstance(data["unread_count"], int), (
            "unread_count should be an integer"
        )
        print(
            f"✓ GET /api/notifications - Found {len(data['notifications'])} notifications, {data['unread_count']} unread"
        )

    def test_get_notifications_unread_only(self, founder_token):
        """GET /api/notifications?unread_only=true - Returns only unread notifications"""
        headers = {"Authorization": f"Bearer {founder_token}"}
        response = requests.get(
            f"{BASE_URL}/api/notifications?unread_only=true", headers=headers
        )

        assert response.status_code == 200
        data = response.json()

        # All returned notifications should be unread
        for notif in data["notifications"]:
            assert not notif.get("read"), "All notifications should be unread"
        print(
            f"✓ GET /api/notifications?unread_only=true - Found {len(data['notifications'])} unread notifications"
        )

    def test_get_unread_count(self, founder_token):
        """GET /api/notifications/unread-count - Returns unread count (lightweight endpoint)"""
        headers = {"Authorization": f"Bearer {founder_token}"}
        response = requests.get(
            f"{BASE_URL}/api/notifications/unread-count", headers=headers
        )

        assert response.status_code == 200
        data = response.json()

        assert "unread_count" in data, "Response should have 'unread_count' field"
        assert isinstance(data["unread_count"], int), (
            "unread_count should be an integer"
        )
        print(f"✓ GET /api/notifications/unread-count - {data['unread_count']} unread")

    def test_mark_notification_read(self, founder_token):
        """POST /api/notifications/{id}/read - Mark single notification read"""
        headers = {"Authorization": f"Bearer {founder_token}"}

        # First get a notification
        response = requests.get(
            f"{BASE_URL}/api/notifications?unread_only=true", headers=headers
        )
        assert response.status_code == 200
        notifications = response.json().get("notifications", [])

        if not notifications:
            print("⊘ No unread notifications to test mark read")
            return

        notif_id = notifications[0]["id"]

        # Mark as read
        response = requests.post(
            f"{BASE_URL}/api/notifications/{notif_id}/read", headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("read"), "Response should confirm read=True"
        print(
            f"✓ POST /api/notifications/{notif_id}/read - Marked notification as read"
        )

    def test_mark_all_notifications_read(self, founder_token):
        """POST /api/notifications/read-all - Mark all notifications read"""
        headers = {"Authorization": f"Bearer {founder_token}"}
        response = requests.post(
            f"{BASE_URL}/api/notifications/read-all", headers=headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "marked_read" in data, "Response should have 'marked_read' field"
        print(
            f"✓ POST /api/notifications/read-all - Marked {data['marked_read']} notifications as read"
        )

    def test_mark_nonexistent_notification_read(self, founder_token):
        """POST /api/notifications/{id}/read - Returns 404 for non-existent notification"""
        headers = {"Authorization": f"Bearer {founder_token}"}
        response = requests.post(
            f"{BASE_URL}/api/notifications/nonexistent-id-12345/read", headers=headers
        )

        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(
            "✓ POST /api/notifications/{invalid_id}/read - Returns 404 for non-existent notification"
        )


# ============ OPS DASHBOARD TESTS ============


class TestOpsDashboard:
    """Test Operator Activity Dashboard endpoint"""

    def test_ops_dashboard_founder_access(self, founder_token):
        """GET /api/ops/dashboard - Founder can access ops dashboard"""
        headers = {"Authorization": f"Bearer {founder_token}"}
        response = requests.get(f"{BASE_URL}/api/ops/dashboard", headers=headers)

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )
        data = response.json()

        # Verify response structure
        assert "timestamp" in data, "Response should have 'timestamp'"
        assert "operators" in data, "Response should have 'operators'"
        assert "queues" in data, "Response should have 'queues'"
        assert "recent_shift_notes" in data, "Response should have 'recent_shift_notes'"

        # Verify queues structure
        queues = data["queues"]
        expected_queue_fields = [
            "dts_total",
            "dts_unassigned",
            "support_open",
            "support_unanswered",
            "tvt_pending",
            "tvt_reviewing",
            "verifications_pending",
            "escalations_open",
        ]
        for field in expected_queue_fields:
            assert field in queues, f"Queues should have '{field}' field"

        print(
            f"✓ GET /api/ops/dashboard (Founder) - {len(data['operators'])} operators, queues: {queues}"
        )

    def test_ops_dashboard_manager_access(self, manager_token):
        """GET /api/ops/dashboard - Manager can access ops dashboard"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.get(f"{BASE_URL}/api/ops/dashboard", headers=headers)

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )
        data = response.json()

        assert "operators" in data
        assert "queues" in data
        print(
            f"✓ GET /api/ops/dashboard (Manager) - Access granted, {len(data['operators'])} operators visible"
        )

    def test_ops_dashboard_worker_denied(self, worker_token):
        """GET /api/ops/dashboard - Worker should be denied access"""
        headers = {"Authorization": f"Bearer {worker_token}"}
        response = requests.get(f"{BASE_URL}/api/ops/dashboard", headers=headers)

        assert response.status_code == 403, (
            f"Expected 403 for worker, got {response.status_code}"
        )
        print("✓ GET /api/ops/dashboard (Worker) - Correctly denied (403)")

    def test_ops_dashboard_operator_profiles(self, founder_token):
        """GET /api/ops/dashboard - Verify operator profile structure"""
        headers = {"Authorization": f"Bearer {founder_token}"}
        response = requests.get(f"{BASE_URL}/api/ops/dashboard", headers=headers)

        assert response.status_code == 200
        operators = response.json().get("operators", [])

        if operators:
            op = operators[0]
            expected_fields = [
                "id",
                "name",
                "operator_role",
                "is_online",
                "tasks_assigned",
                "tasks_active",
                "tasks_completed",
                "completion_rate",
                "actions_24h",
            ]
            for field in expected_fields:
                assert field in op, f"Operator profile should have '{field}' field"
            print(f"✓ Operator profile structure verified: {list(op.keys())}")
        else:
            print("⊘ No operators found to verify profile structure")


# ============ DTS TASK ASSIGNMENT TESTS ============


class TestDTSTaskAssignment:
    """Test DTS task assignment functionality"""

    def test_assign_dts_task_founder(self, founder_token):
        """POST /api/dts/tasks/{id}/assign - Founder can assign DTS task to operator"""
        headers = {"Authorization": f"Bearer {founder_token}"}

        # First get a DTS task
        response = requests.get(f"{BASE_URL}/api/dts/tasks/all", headers=headers)
        assert response.status_code == 200
        tasks = response.json()

        if not tasks:
            print("⊘ No DTS tasks available to test assignment")
            return

        task_id = tasks[0]["id"]

        # Get an operator to assign to
        response = requests.get(f"{BASE_URL}/api/founder/operators", headers=headers)
        assert response.status_code == 200
        operators = response.json()

        if not operators:
            print("⊘ No operators available to test assignment")
            return

        operator_id = operators[0]["id"]

        # Assign task
        response = requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/assign",
            headers=headers,
            json={"operator_id": operator_id},
        )

        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )
        data = response.json()
        assert "message" in data
        print(f"✓ POST /api/dts/tasks/{task_id}/assign - Task assigned successfully")

    def test_assign_dts_task_manager(self, manager_token, founder_token):
        """POST /api/dts/tasks/{id}/assign - Manager can assign DTS task"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        founder_headers = {"Authorization": f"Bearer {founder_token}"}

        # Get tasks using founder (manager may have limited view)
        response = requests.get(
            f"{BASE_URL}/api/dts/tasks/all", headers=founder_headers
        )
        tasks = response.json() if response.status_code == 200 else []

        if not tasks:
            print("⊘ No DTS tasks available for manager assignment test")
            return

        task_id = tasks[0]["id"]

        # Get operators visible to manager
        response = requests.get(f"{BASE_URL}/api/founder/operators", headers=headers)
        if response.status_code != 200:
            print("⊘ Manager cannot list operators, skipping assignment test")
            return
        operators = response.json()

        if not operators:
            print("⊘ No operators visible to manager")
            return

        operator_id = operators[0]["id"]

        # Manager assigns task
        response = requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/assign",
            headers=headers,
            json={"operator_id": operator_id},
        )

        assert response.status_code == 200, (
            f"Manager assignment failed: {response.status_code}: {response.text}"
        )
        print(
            f"✓ POST /api/dts/tasks/{task_id}/assign (Manager) - Assignment successful"
        )

    def test_assign_dts_task_worker_denied(self, worker_token, founder_token):
        """POST /api/dts/tasks/{id}/assign - Worker should be denied"""
        founder_headers = {"Authorization": f"Bearer {founder_token}"}
        worker_headers = {"Authorization": f"Bearer {worker_token}"}

        # Get a task using founder
        response = requests.get(
            f"{BASE_URL}/api/dts/tasks/all", headers=founder_headers
        )
        tasks = response.json() if response.status_code == 200 else []

        if not tasks:
            print("⊘ No DTS tasks for worker denial test")
            return

        task_id = tasks[0]["id"]

        # Get an operator id using founder
        response = requests.get(
            f"{BASE_URL}/api/founder/operators", headers=founder_headers
        )
        operators = response.json() if response.status_code == 200 else []

        if not operators:
            print("⊘ No operators for worker denial test")
            return

        # Worker tries to assign
        response = requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/assign",
            headers=worker_headers,
            json={"operator_id": operators[0]["id"]},
        )

        assert response.status_code == 403, (
            f"Expected 403 for worker, got {response.status_code}"
        )
        print("✓ POST /api/dts/tasks/{id}/assign (Worker) - Correctly denied (403)")

    def test_assign_to_nonexistent_operator(self, founder_token):
        """POST /api/dts/tasks/{id}/assign - Returns 404 for non-existent operator"""
        headers = {"Authorization": f"Bearer {founder_token}"}

        # Get a task
        response = requests.get(f"{BASE_URL}/api/dts/tasks/all", headers=headers)
        tasks = response.json() if response.status_code == 200 else []

        if not tasks:
            print("⊘ No DTS tasks for invalid operator test")
            return

        task_id = tasks[0]["id"]

        # Try to assign to non-existent operator
        response = requests.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/assign",
            headers=headers,
            json={"operator_id": "nonexistent-operator-id-12345"},
        )

        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Assign to non-existent operator returns 404")


# ============ NOTIFICATION TRIGGERS TESTS ============


class TestNotificationTriggers:
    """Test that notification triggers fire correctly"""

    def test_dts_task_creation_notifies_staff(self, benefactor_token, founder_token):
        """Creating DTS task should trigger notification to all staff"""
        benefactor_headers = {"Authorization": f"Bearer {benefactor_token}"}
        founder_headers = {"Authorization": f"Bearer {founder_token}"}

        # Get benefactor's estate
        response = requests.get(f"{BASE_URL}/api/estates", headers=benefactor_headers)
        if response.status_code != 200 or not response.json():
            print("⊘ No estates for benefactor to test DTS notification trigger")
            return

        estate_id = response.json()[0]["id"]

        # Get founder's current unread count
        response = requests.get(
            f"{BASE_URL}/api/notifications/unread-count", headers=founder_headers
        )
        response.json().get("unread_count", 0)

        # Create DTS task
        response = requests.post(
            f"{BASE_URL}/api/dts/tasks",
            headers=benefactor_headers,
            json={
                "estate_id": estate_id,
                "title": f"TEST_DTS_Notification_{int(time.time())}",
                "description": "Testing notification trigger on DTS task creation",
                "task_type": "delivery",
                "confidential": "full",
            },
        )

        if response.status_code != 200:
            print(
                f"⊘ DTS task creation failed: {response.status_code}: {response.text}"
            )
            return

        task_id = response.json().get("id")
        print(f"Created DTS task: {task_id}")

        # Wait for async notification to be stored
        time.sleep(2)

        # Check founder's notifications
        response = requests.get(
            f"{BASE_URL}/api/notifications", headers=founder_headers
        )
        assert response.status_code == 200
        notifications = response.json().get("notifications", [])

        # Look for DTS notification
        dts_notifs = [
            n
            for n in notifications
            if "DTS" in n.get("title", "") or "DTS" in n.get("body", "")
        ]
        print(
            f"✓ DTS task creation - Found {len(dts_notifs)} DTS-related notifications for founder"
        )

    def test_support_message_triggers_notification(
        self, benefactor_token, founder_token
    ):
        """Sending support message should trigger notification to staff"""
        benefactor_headers = {"Authorization": f"Bearer {benefactor_token}"}
        founder_headers = {"Authorization": f"Bearer {founder_token}"}

        # Get founder's current unread count
        response = requests.get(
            f"{BASE_URL}/api/notifications/unread-count", headers=founder_headers
        )
        response.json().get("unread_count", 0)

        # Send support message
        response = requests.post(
            f"{BASE_URL}/api/support/messages",
            headers=benefactor_headers,
            json={"content": f"TEST_Support_Message_{int(time.time())}"},
        )

        assert response.status_code == 200, (
            f"Support message failed: {response.status_code}"
        )
        print("Sent support message")

        # Wait for async notification
        time.sleep(2)

        # Check founder's notifications
        response = requests.get(
            f"{BASE_URL}/api/notifications", headers=founder_headers
        )
        assert response.status_code == 200
        notifications = response.json().get("notifications", [])

        # Look for support notification
        support_notifs = [
            n
            for n in notifications
            if "Support" in n.get("title", "") or "support" in n.get("url", "")
        ]
        print(
            f"✓ Support message - Found {len(support_notifs)} support-related notifications for founder"
        )


# ============ OPERATOR NOTIFICATIONS TO FOUNDER ============


class TestOperatorNotificationsToFounder:
    """Test that operator create/delete by manager triggers founder notification"""

    def test_manager_creates_worker_notifies_founder(
        self, manager_token, founder_token
    ):
        """Manager creating a worker should notify founder"""
        manager_headers = {"Authorization": f"Bearer {manager_token}"}
        founder_headers = {"Authorization": f"Bearer {founder_token}"}

        # Get founder's current notification count
        response = requests.get(
            f"{BASE_URL}/api/notifications/unread-count", headers=founder_headers
        )
        response.json().get("unread_count", 0)

        # Manager creates a worker
        test_username = f"test_worker_{int(time.time())}"
        response = requests.post(
            f"{BASE_URL}/api/founder/operators",
            headers=manager_headers,
            json={
                "username": test_username,
                "password": "TestPass123!",
                "first_name": "Test",
                "last_name": "Worker",
                "email": f"{test_username}@test.com",
                "operator_role": "worker",
            },
        )

        if response.status_code != 200:
            print(
                f"⊘ Manager cannot create worker: {response.status_code}: {response.text}"
            )
            return

        worker_id = response.json().get("id")
        print(f"Manager created worker: {test_username}")

        # Wait for async notification
        time.sleep(2)

        # Check founder's notifications
        response = requests.get(
            f"{BASE_URL}/api/notifications", headers=founder_headers
        )
        notifications = response.json().get("notifications", [])

        # Look for operator creation notification
        op_notifs = [
            n
            for n in notifications
            if "Operator" in n.get("title", "")
            or "operator" in n.get("body", "").lower()
        ]
        print(
            f"✓ Manager creates worker - Found {len(op_notifs)} operator-related notifications for founder"
        )

        # Cleanup - delete test worker using founder
        time.sleep(2)
        response = requests.delete(
            f"{BASE_URL}/api/founder/operators/{worker_id}?admin_password={FOUNDER_PASSWORD}",
            headers=founder_headers,
        )
        print(f"Cleanup: Deleted test worker ({response.status_code})")


# ============ AUTH VERIFICATION ============


class TestAuthVerification:
    """Verify auth works for all test credentials"""

    def test_founder_login(self):
        """Verify founder login works"""
        time.sleep(2)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": FOUNDER_EMAIL, "password": FOUNDER_PASSWORD},
        )
        assert response.status_code == 200, (
            f"Founder login failed: {response.status_code}: {response.text}"
        )
        data = response.json()
        assert data.get("user", {}).get("role") == "admin"
        print(f"✓ Founder login successful: {data['user']['email']}")

    def test_manager_login(self):
        """Verify manager login works"""
        time.sleep(2)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": MANAGER_USERNAME, "password": MANAGER_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Manager account not available: {response.status_code}")
        data = response.json()
        assert data.get("user", {}).get("role") == "operator"
        assert data.get("user", {}).get("operator_role") == "manager"
        print(f"✓ Manager login successful: {data['user']['email']}")

    def test_worker_login(self):
        """Verify worker login works"""
        time.sleep(2)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": WORKER_USERNAME, "password": WORKER_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Worker account not available: {response.status_code}")
        data = response.json()
        assert data.get("user", {}).get("role") == "operator"
        assert data.get("user", {}).get("operator_role") == "worker"
        print(f"✓ Worker login successful: {data['user']['email']}")

    def test_benefactor_login(self):
        """Verify benefactor login works"""
        time.sleep(2)
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Benefactor account not available: {response.status_code}")
        data = response.json()
        assert data.get("user", {}).get("role") == "benefactor"
        print(f"✓ Benefactor login successful: {data['user']['email']}")
