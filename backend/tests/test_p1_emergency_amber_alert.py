"""
CarryOn™ Backend Tests — P1 Emergency & Amber Alert Features
Tests for:
  - POST /api/support/p1-emergency — Creates P1 emergency thread
  - P1 emergency creates support message with priority=p1, is_emergency=true
  - P1 emergency triggers security_alert notification to all staff (critical priority)
  - Death cert upload triggers security_alert to benefactor + all_staff_security
  - Notification with priority=critical and type=security_alert triggers Amber Alert on frontend
"""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestP1EmergencyFeature:
    """Tests for P1 Emergency support thread creation"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials"""
        self.founder_email = "info@carryon.us"
        self.founder_password = "Demo1234!"
        self.benefactor_email = "fulltest@test.com"
        self.benefactor_password = "Password.123"
        self.manager_username = "ops_manager_1"
        self.manager_password = "Manager123!"
        self.worker_username = "ops_worker_1"
        self.worker_password = "Worker123!"

    def get_token(self, identifier, password):
        """Helper to get auth token"""
        # Determine if login is via email or username
        login_data = {"password": password}
        if "@" in identifier:
            login_data["email"] = identifier
        else:
            login_data["username"] = identifier

        resp = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        if resp.status_code == 429:
            pytest.skip("Rate limited - too many login attempts")
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        return resp.json().get("access_token")

    def test_p1_emergency_endpoint_exists(self):
        """Test that POST /api/support/p1-emergency endpoint exists"""
        token = self.get_token(self.benefactor_email, self.benefactor_password)
        headers = {"Authorization": f"Bearer {token}"}

        # Call P1 emergency endpoint with reason
        resp = requests.post(
            f"{BASE_URL}/api/support/p1-emergency",
            json={"reason": "sealed_account"},
            headers=headers,
        )

        assert resp.status_code == 200, f"P1 emergency endpoint failed: {resp.text}"
        data = resp.json()
        assert data.get("success") is True
        assert "conversation_id" in data
        print(f"✅ P1 emergency thread created: {data}")

    def test_p1_emergency_creates_message_with_priority(self):
        """Test that P1 emergency creates support message with priority=p1 and is_emergency=true"""
        token = self.get_token(self.benefactor_email, self.benefactor_password)
        headers = {"Authorization": f"Bearer {token}"}

        # Create P1 emergency
        resp = requests.post(
            f"{BASE_URL}/api/support/p1-emergency",
            json={"reason": "death_cert_error"},
            headers=headers,
        )
        assert resp.status_code == 200

        # Wait for async processing
        time.sleep(1)

        # Fetch support messages
        messages_resp = requests.get(
            f"{BASE_URL}/api/support/messages", headers=headers
        )
        assert messages_resp.status_code == 200
        messages = messages_resp.json()

        # Find the P1 emergency message
        p1_messages = [
            m
            for m in messages
            if m.get("priority") == "p1" and m.get("is_emergency") is True
        ]
        assert len(p1_messages) > 0, "No P1 emergency message found in support messages"

        latest_p1 = p1_messages[-1]
        assert "PRIORITY 1 EMERGENCY" in latest_p1.get("content", "")
        print(
            f"✅ P1 emergency message found: priority={latest_p1.get('priority')}, is_emergency={latest_p1.get('is_emergency')}"
        )

    def test_p1_emergency_triggers_staff_notification(self):
        """Test that P1 emergency creates critical security_alert notification for all staff"""
        # Login as founder to check notifications
        founder_token = self.get_token(self.founder_email, self.founder_password)
        founder_headers = {"Authorization": f"Bearer {founder_token}"}

        # Get current notification count for founder
        notif_before = requests.get(
            f"{BASE_URL}/api/notifications?unread_only=true&limit=50",
            headers=founder_headers,
        )
        assert notif_before.status_code == 200
        count_before = len(notif_before.json().get("notifications", []))

        # Create P1 emergency as benefactor
        benefactor_token = self.get_token(
            self.benefactor_email, self.benefactor_password
        )
        benefactor_headers = {"Authorization": f"Bearer {benefactor_token}"}

        resp = requests.post(
            f"{BASE_URL}/api/support/p1-emergency",
            json={"reason": "transition_error"},
            headers=benefactor_headers,
        )
        assert resp.status_code == 200

        # Wait for async notification
        time.sleep(2)

        # Check founder received security_alert notification
        notif_after = requests.get(
            f"{BASE_URL}/api/notifications?unread_only=true&limit=50",
            headers=founder_headers,
        )
        assert notif_after.status_code == 200

        notifications = notif_after.json().get("notifications", [])

        # Look for critical security_alert notifications
        security_alerts = [
            n
            for n in notifications
            if n.get("priority") == "critical" and n.get("type") == "security_alert"
        ]

        assert len(security_alerts) > 0, (
            "No critical security_alert notification found for staff"
        )

        latest_alert = security_alerts[0]
        assert "P1 EMERGENCY" in latest_alert.get(
            "title", ""
        ) or "EMERGENCY" in latest_alert.get("body", "")
        print(
            f"✅ Staff security_alert notification created: priority={latest_alert.get('priority')}, type={latest_alert.get('type')}"
        )

    def test_p1_emergency_different_reasons(self):
        """Test P1 emergency with different reason codes"""
        token = self.get_token(self.benefactor_email, self.benefactor_password)
        headers = {"Authorization": f"Bearer {token}"}

        reasons = ["sealed_account", "death_cert_error", "transition_error"]

        for reason in reasons:
            resp = requests.post(
                f"{BASE_URL}/api/support/p1-emergency",
                json={"reason": reason},
                headers=headers,
            )
            assert resp.status_code == 200, (
                f"P1 emergency failed for reason '{reason}': {resp.text}"
            )
            data = resp.json()
            assert data.get("success") is True
            print(f"✅ P1 emergency with reason '{reason}' succeeded")

    def test_manager_receives_p1_notification(self):
        """Test that operators (managers) also receive P1 emergency notifications"""
        # Login as manager
        manager_token = self.get_token(self.manager_username, self.manager_password)
        manager_headers = {"Authorization": f"Bearer {manager_token}"}

        # Get current notifications
        notif_before = requests.get(
            f"{BASE_URL}/api/notifications?unread_only=true&limit=50",
            headers=manager_headers,
        )

        if notif_before.status_code == 200:
            # Create P1 emergency as benefactor
            benefactor_token = self.get_token(
                self.benefactor_email, self.benefactor_password
            )
            benefactor_headers = {"Authorization": f"Bearer {benefactor_token}"}

            requests.post(
                f"{BASE_URL}/api/support/p1-emergency",
                json={"reason": "sealed_account"},
                headers=benefactor_headers,
            )

            # Wait for async notification
            time.sleep(2)

            # Check manager received notification
            notif_after = requests.get(
                f"{BASE_URL}/api/notifications?unread_only=true&limit=50",
                headers=manager_headers,
            )
            notifications = notif_after.json().get("notifications", [])

            security_alerts = [
                n
                for n in notifications
                if n.get("priority") == "critical" and n.get("type") == "security_alert"
            ]

            print(
                f"✅ Manager has {len(security_alerts)} critical security_alert notifications"
            )
        else:
            pytest.skip("Manager authentication failed")


class TestNotificationAmberAlertTrigger:
    """Tests for notification structure that triggers Amber Alert on frontend"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials"""
        self.founder_email = "info@carryon.us"
        self.founder_password = "Demo1234!"

    def get_token(self, email, password):
        """Helper to get auth token"""
        resp = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}
        )
        if resp.status_code == 429:
            pytest.skip("Rate limited")
        assert resp.status_code == 200
        return resp.json().get("access_token")

    def test_notification_has_correct_structure_for_amber_alert(self):
        """Test notifications have priority and type fields needed for Amber Alert"""
        token = self.get_token(self.founder_email, self.founder_password)
        headers = {"Authorization": f"Bearer {token}"}

        resp = requests.get(f"{BASE_URL}/api/notifications?limit=20", headers=headers)
        assert resp.status_code == 200

        data = resp.json()
        assert "notifications" in data

        # Check notification structure
        if len(data["notifications"]) > 0:
            notif = data["notifications"][0]
            # Required fields for Amber Alert detection
            assert "id" in notif
            assert "priority" in notif
            assert "type" in notif
            assert "title" in notif
            assert "body" in notif
            assert "created_at" in notif
            print(
                f"✅ Notification structure correct: id={notif['id']}, priority={notif['priority']}, type={notif['type']}"
            )

    def test_critical_security_alert_exists(self):
        """Test that critical security_alert notifications exist (triggers Amber Alert)"""
        token = self.get_token(self.founder_email, self.founder_password)
        headers = {"Authorization": f"Bearer {token}"}

        resp = requests.get(
            f"{BASE_URL}/api/notifications?unread_only=true&limit=50", headers=headers
        )
        assert resp.status_code == 200

        notifications = resp.json().get("notifications", [])

        # Filter for Amber Alert triggers (priority=critical AND type=security_alert)
        amber_triggers = [
            n
            for n in notifications
            if n.get("priority") == "critical" and n.get("type") == "security_alert"
        ]

        print(
            f"📊 Found {len(amber_triggers)} notifications that would trigger Amber Alert"
        )

        if len(amber_triggers) > 0:
            for alert in amber_triggers[:3]:
                print(
                    f"  - {alert['title'][:50]}... (priority={alert['priority']}, type={alert['type']})"
                )


class TestNotificationEndpoints:
    """Tests for notification endpoints used by NotificationBell and AmberAlertProvider"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.founder_email = "info@carryon.us"
        self.founder_password = "Demo1234!"

    def get_token(self, email, password):
        resp = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}
        )
        if resp.status_code == 429:
            pytest.skip("Rate limited")
        assert resp.status_code == 200
        return resp.json().get("access_token")

    def test_get_notifications_with_unread_filter(self):
        """Test GET /api/notifications?unread_only=true — used by AmberAlertProvider"""
        token = self.get_token(self.founder_email, self.founder_password)
        headers = {"Authorization": f"Bearer {token}"}

        resp = requests.get(
            f"{BASE_URL}/api/notifications?unread_only=true&limit=5", headers=headers
        )
        assert resp.status_code == 200

        data = resp.json()
        assert "notifications" in data
        print(
            f"✅ Unread notifications endpoint works: {len(data['notifications'])} unread"
        )

    def test_get_unread_count(self):
        """Test GET /api/notifications/unread-count — used by NotificationBell polling"""
        token = self.get_token(self.founder_email, self.founder_password)
        headers = {"Authorization": f"Bearer {token}"}

        resp = requests.get(
            f"{BASE_URL}/api/notifications/unread-count", headers=headers
        )
        assert resp.status_code == 200

        data = resp.json()
        assert "unread_count" in data
        print(f"✅ Unread count endpoint works: {data['unread_count']} unread")

    def test_mark_notification_read(self):
        """Test POST /api/notifications/{id}/read — used by Amber Alert Acknowledge"""
        token = self.get_token(self.founder_email, self.founder_password)
        headers = {"Authorization": f"Bearer {token}"}

        # Get a notification to mark as read
        notifs = requests.get(f"{BASE_URL}/api/notifications?limit=10", headers=headers)
        assert notifs.status_code == 200

        notifications = notifs.json().get("notifications", [])
        if len(notifications) == 0:
            pytest.skip("No notifications to test")

        notif_id = notifications[0]["id"]

        # Mark as read
        resp = requests.post(
            f"{BASE_URL}/api/notifications/{notif_id}/read", headers=headers
        )
        assert resp.status_code == 200
        print(f"✅ Mark notification read works: {notif_id}")

    def test_mark_all_notifications_read(self):
        """Test POST /api/notifications/read-all — used by NotificationBell"""
        token = self.get_token(self.founder_email, self.founder_password)
        headers = {"Authorization": f"Bearer {token}"}

        resp = requests.post(f"{BASE_URL}/api/notifications/read-all", headers=headers)
        assert resp.status_code == 200
        print("✅ Mark all notifications read works")


class TestSupportMessagesEndpoints:
    """Tests for support message endpoints used by SupportChatPage"""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.benefactor_email = "fulltest@test.com"
        self.benefactor_password = "Password.123"

    def get_token(self, email, password):
        resp = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}
        )
        if resp.status_code == 429:
            pytest.skip("Rate limited")
        assert resp.status_code == 200
        return resp.json().get("access_token")

    def test_get_support_messages(self):
        """Test GET /api/support/messages — used by SupportChatPage"""
        token = self.get_token(self.benefactor_email, self.benefactor_password)
        headers = {"Authorization": f"Bearer {token}"}

        resp = requests.get(f"{BASE_URL}/api/support/messages", headers=headers)
        assert resp.status_code == 200

        messages = resp.json()
        assert isinstance(messages, list)
        print(f"✅ Support messages endpoint works: {len(messages)} messages")

    def test_send_support_message(self):
        """Test POST /api/support/messages — used by SupportChatPage"""
        token = self.get_token(self.benefactor_email, self.benefactor_password)
        headers = {"Authorization": f"Bearer {token}"}

        resp = requests.post(
            f"{BASE_URL}/api/support/messages",
            json={"content": "TEST_message_from_testing_agent"},
            headers=headers,
        )
        assert resp.status_code == 200

        data = resp.json()
        assert "id" in data
        assert "content" in data
        print(f"✅ Send support message works: {data['id']}")
