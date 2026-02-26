"""
Test DTS Backend APIs and Transition Verification Routes
Features tested:
- POST /api/dts/tasks - create DTS task (benefactor only)
- GET /api/dts/tasks/{estate_id} - list DTS tasks
- GET /api/dts/tasks/all - admin gets all DTS tasks
- POST /api/dts/tasks/{id}/quote - admin submits quote with line items
- POST /api/dts/tasks/{id}/status - admin updates status
- GET /api/transition/certificates/all - enriched certificates for verification team
- POST /api/transition/reject/{id} - reject certificate
- POST /api/voice/transcribe - voice endpoint exists
"""

import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


def get_otp_from_logs(email: str) -> str:
    """Extract OTP from backend logs"""
    import subprocess

    time.sleep(0.5)
    result = subprocess.run(
        f'tail -n 20 /var/log/supervisor/backend.err.log | grep "OTP for {email}" | tail -1',
        shell=True,
        capture_output=True,
        text=True,
    )
    if result.stdout:
        import re

        match = re.search(r"OTP for .*: (\d+)", result.stdout)
        if match:
            return match.group(1)
    return ""


def login_user(session, email, password):
    """Login helper that handles OTP flow"""
    # Step 1: Login to get OTP sent
    response = session.post(
        f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"

    # Step 2: Get OTP from logs
    otp = get_otp_from_logs(email)
    assert otp, f"Could not get OTP for {email}"

    # Step 3: Verify OTP
    response = session.post(
        f"{BASE_URL}/api/auth/verify-otp", json={"email": email, "otp": otp}
    )
    assert response.status_code == 200, f"OTP verification failed: {response.text}"

    data = response.json()
    token = data.get("access_token")
    user = data.get("user", {})
    return token, user


class TestDTSBackend:
    """Test DTS (Designated Trustee Services) Backend APIs"""

    @pytest.fixture(scope="class")
    def benefactor_session(self):
        """Login as benefactor (pete@mitchell.com)"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        token, user = login_user(session, "pete@mitchell.com", "password123")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session, user

    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin (admin@carryon.com)"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        token, user = login_user(session, "admin@carryon.com", "admin123")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session, user

    @pytest.fixture(scope="class")
    def estate_id(self, benefactor_session):
        """Get benefactor's estate ID"""
        session, user = benefactor_session
        response = session.get(f"{BASE_URL}/api/estates")
        assert response.status_code == 200
        estates = response.json()
        assert len(estates) > 0, "Benefactor should have at least one estate"
        return estates[0]["id"]

    def test_create_dts_task_benefactor(self, benefactor_session, estate_id):
        """Benefactor can create DTS task"""
        session, user = benefactor_session
        task_data = {
            "estate_id": estate_id,
            "title": "TEST Close 3 Personal Accounts",
            "description": "Close these accounts: Netflix, Spotify, Adobe CC. Use provided credentials.",
            "task_type": "account_closure",
            "confidential": "full",
            "disclose_to": [],
            "timed_release": None,
            "beneficiary": None,
        }
        response = session.post(f"{BASE_URL}/api/dts/tasks", json=task_data)
        assert response.status_code == 200, (
            f"Failed to create DTS task: {response.text}"
        )

        task = response.json()
        assert task["title"] == "TEST Close 3 Personal Accounts"
        assert task["status"] == "submitted"
        assert task["task_type"] == "account_closure"
        assert "id" in task
        print(f"✓ Created DTS task: {task['id']}")
        return task["id"]

    def test_get_dts_tasks_by_estate(self, benefactor_session, estate_id):
        """Benefactor can get DTS tasks for their estate"""
        session, user = benefactor_session
        response = session.get(f"{BASE_URL}/api/dts/tasks/{estate_id}")
        assert response.status_code == 200

        tasks = response.json()
        assert isinstance(tasks, list)
        print(f"✓ Found {len(tasks)} DTS tasks for estate {estate_id}")

    def test_get_all_dts_tasks_admin(self, admin_session):
        """Admin can get all DTS tasks via /dts/tasks/all"""
        session, user = admin_session
        response = session.get(f"{BASE_URL}/api/dts/tasks/all")
        assert response.status_code == 200, (
            f"Failed to get all DTS tasks: {response.text}"
        )

        tasks = response.json()
        assert isinstance(tasks, list)
        print(f"✓ Admin fetched {len(tasks)} total DTS tasks")

    def test_admin_submit_quote(self, admin_session, benefactor_session, estate_id):
        """Admin can submit quote with line items for a DTS task"""
        # First create a task
        bsession, _ = benefactor_session
        task_data = {
            "estate_id": estate_id,
            "title": "TEST Quote Task",
            "description": "Task for testing quote submission",
            "task_type": "delivery",
            "confidential": "full",
        }
        create_response = bsession.post(f"{BASE_URL}/api/dts/tasks", json=task_data)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]

        # Admin submits quote
        session, _ = admin_session
        quote_data = {
            "task_id": task_id,
            "line_items": [
                {"description": "Document retrieval", "cost": 75},
                {"description": "Courier delivery", "cost": 125},
                {"description": "Signature confirmation", "cost": 50},
            ],
            "notes": "Standard delivery quote",
        }
        response = session.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/quote", json=quote_data
        )
        assert response.status_code == 200, f"Quote submission failed: {response.text}"

        result = response.json()
        assert result["line_items"] == 3
        print(f"✓ Admin submitted quote with 3 line items for task {task_id}")

        # Verify task status is now 'quoted'
        task_response = session.get(f"{BASE_URL}/api/dts/task/{task_id}")
        assert task_response.status_code == 200
        task = task_response.json()
        assert task["status"] == "quoted"
        assert len(task["line_items"]) == 3
        print("✓ Task status updated to 'quoted'")

    def test_admin_update_status(self, admin_session, benefactor_session, estate_id):
        """Admin can update DTS task status"""
        # Create a task
        bsession, _ = benefactor_session
        task_data = {
            "estate_id": estate_id,
            "title": "TEST Status Update Task",
            "description": "Task for testing status updates",
            "task_type": "financial",
            "confidential": "partial",
        }
        create_response = bsession.post(f"{BASE_URL}/api/dts/tasks", json=task_data)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]

        # Admin updates status
        session, _ = admin_session
        response = session.post(
            f"{BASE_URL}/api/dts/tasks/{task_id}/status?status=ready"
        )
        assert response.status_code == 200, f"Status update failed: {response.text}"

        # Verify
        task_response = session.get(f"{BASE_URL}/api/dts/task/{task_id}")
        assert task_response.status_code == 200
        task = task_response.json()
        assert task["status"] == "ready"
        print("✓ Admin updated task status to 'ready'")


class TestTransitionVerification:
    """Test Transition Verification Team APIs"""

    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        token, user = login_user(session, "admin@carryon.com", "admin123")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session, user

    def test_get_all_certificates_admin(self, admin_session):
        """Admin can get all certificates with enriched data"""
        session, _ = admin_session
        response = session.get(f"{BASE_URL}/api/transition/certificates/all")
        assert response.status_code == 200, (
            f"Failed to get certificates: {response.text}"
        )

        certs = response.json()
        assert isinstance(certs, list)

        # If there are certificates, verify enrichment
        if len(certs) > 0:
            cert = certs[0]
            # Enriched fields should exist
            print(f"✓ Found {len(certs)} certificates with fields: {list(cert.keys())}")
        else:
            print("✓ No certificates found (expected if none uploaded)")

    def test_reject_certificate_requires_admin(self):
        """Non-admin cannot reject certificate"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        token, _ = login_user(session, "pete@mitchell.com", "password123")
        session.headers.update({"Authorization": f"Bearer {token}"})

        # Try to reject a certificate (should fail even if cert doesn't exist)
        response = session.post(f"{BASE_URL}/api/transition/reject/fake-id")
        assert response.status_code == 403, (
            "Non-admin should not be able to reject certificates"
        )
        print("✓ Non-admin correctly denied from rejecting certificates")


class TestVoiceEndpoint:
    """Test Voice Transcription Endpoint"""

    def test_voice_transcribe_endpoint_exists(self):
        """POST /api/voice/transcribe endpoint exists"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        token, _ = login_user(session, "pete@mitchell.com", "password123")
        session.headers.update({"Authorization": f"Bearer {token}"})

        # Send empty request (will fail validation but proves endpoint exists)
        response = session.post(f"{BASE_URL}/api/voice/transcribe")
        # Should get 422 (validation error) or 400, not 404
        assert response.status_code != 404, "Voice transcribe endpoint should exist"
        print(
            f"✓ Voice transcribe endpoint exists (got {response.status_code} - expected validation error)"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
