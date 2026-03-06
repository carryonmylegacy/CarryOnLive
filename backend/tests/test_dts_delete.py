"""
Test DTS Delete API with Admin Password Verification
Features tested:
- DELETE /api/dts/tasks/{task_id} - requires admin_password for admin users
- DELETE /api/dts/tasks/{task_id} - returns 400 if no admin_password provided by admin
- DELETE /api/dts/tasks/{task_id} - returns 403 if wrong admin_password
"""

import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Password.123"  # We'll try this or create admin
TEST_BENEFACTOR_EMAIL = "fulltest@test.com"
TEST_BENEFACTOR_PASSWORD = "Password.123"


def get_otp_from_logs(email: str) -> str:
    """Extract OTP from backend logs"""
    import subprocess
    import re

    time.sleep(0.5)
    result = subprocess.run(
        f'tail -n 30 /var/log/supervisor/backend.err.log | grep "OTP for {email}" | tail -1',
        shell=True,
        capture_output=True,
        text=True,
    )
    if result.stdout:
        match = re.search(r"OTP for .*: (\d+)", result.stdout)
        if match:
            return match.group(1)
    return ""


def login_user(session, email, password, trust_device=True):
    """Login helper that handles OTP flow"""
    # Step 1: Login to get OTP sent
    response = session.post(
        f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}
    )
    if response.status_code != 200:
        return None, None

    # Check if OTP is required
    data = response.json()
    if data.get("access_token"):
        # Direct login without OTP (trusted device)
        return data.get("access_token"), data.get("user", {})
    
    # OTP required
    if not data.get("requires_otp", False):
        return None, None
        
    # Step 2: Get OTP from logs
    otp = get_otp_from_logs(email)
    if not otp:
        return None, None

    # Step 3: Verify OTP
    response = session.post(
        f"{BASE_URL}/api/auth/verify-otp", 
        json={"email": email, "otp": otp, "trust_device": trust_device}
    )
    if response.status_code != 200:
        return None, None

    data = response.json()
    return data.get("access_token"), data.get("user", {})


class TestDTSDeleteAPI:
    """Test DTS Delete API with Admin Password Verification"""

    @pytest.fixture(scope="class")
    def admin_session(self):
        """Login as admin user"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Try with fulltest@test.com first (known working admin/benefactor)
        # Then try info@carryon.us
        for email, password in [
            (TEST_BENEFACTOR_EMAIL, TEST_BENEFACTOR_PASSWORD),
            (ADMIN_EMAIL, ADMIN_PASSWORD),
        ]:
            token, user = login_user(session, email, password)
            if token and user and user.get("role") == "admin":
                session.headers.update({"Authorization": f"Bearer {token}"})
                print(f"✓ Logged in as admin: {email}")
                return session, user, password
        
        pytest.skip("Could not login as admin user")

    @pytest.fixture(scope="class")
    def benefactor_session(self):
        """Login as benefactor user"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        token, user = login_user(session, TEST_BENEFACTOR_EMAIL, TEST_BENEFACTOR_PASSWORD)
        if token and user and user.get("role") == "benefactor":
            session.headers.update({"Authorization": f"Bearer {token}"})
            print(f"✓ Logged in as benefactor: {TEST_BENEFACTOR_EMAIL}")
            return session, user
        
        pytest.skip("Could not login as benefactor user")

    @pytest.fixture(scope="class")
    def estate_id(self, benefactor_session):
        """Get benefactor's estate ID"""
        session, user = benefactor_session
        response = session.get(f"{BASE_URL}/api/estates")
        if response.status_code != 200:
            pytest.skip("Could not get estates")
        estates = response.json()
        if not estates:
            pytest.skip("Benefactor has no estates")
        return estates[0]["id"]

    @pytest.fixture
    def test_dts_task(self, benefactor_session, estate_id):
        """Create a test DTS task for deletion tests"""
        session, user = benefactor_session
        task_data = {
            "estate_id": estate_id,
            "title": f"TEST_DELETE_TASK_{int(time.time())}",
            "description": "Test task for delete functionality testing",
            "task_type": "account_closure",
            "confidential": "full",
        }
        response = session.post(f"{BASE_URL}/api/dts/tasks", json=task_data)
        if response.status_code != 200:
            pytest.skip(f"Could not create test DTS task: {response.text}")
        task = response.json()
        print(f"✓ Created test DTS task: {task['id']}")
        return task

    def test_admin_delete_without_password_returns_400(self, admin_session, benefactor_session, estate_id):
        """Admin DELETE without admin_password should return 400"""
        # Create a task first
        bsession, _ = benefactor_session
        task_data = {
            "estate_id": estate_id,
            "title": f"TEST_NO_PASSWORD_{int(time.time())}",
            "description": "Task to test delete without password",
            "task_type": "delivery",
            "confidential": "full",
        }
        create_response = bsession.post(f"{BASE_URL}/api/dts/tasks", json=task_data)
        assert create_response.status_code == 200, f"Failed to create task: {create_response.text}"
        task_id = create_response.json()["id"]
        
        # Admin tries to delete without password
        session, user, _ = admin_session
        response = session.delete(f"{BASE_URL}/api/dts/tasks/{task_id}")
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "password" in data.get("detail", "").lower(), f"Error should mention password: {data}"
        print(f"✓ Admin delete without password correctly returns 400: {data.get('detail')}")

    def test_admin_delete_with_wrong_password_returns_403(self, admin_session, benefactor_session, estate_id):
        """Admin DELETE with wrong password should return 403"""
        # Create a task first
        bsession, _ = benefactor_session
        task_data = {
            "estate_id": estate_id,
            "title": f"TEST_WRONG_PASSWORD_{int(time.time())}",
            "description": "Task to test delete with wrong password",
            "task_type": "financial",
            "confidential": "partial",
        }
        create_response = bsession.post(f"{BASE_URL}/api/dts/tasks", json=task_data)
        assert create_response.status_code == 200, f"Failed to create task: {create_response.text}"
        task_id = create_response.json()["id"]
        
        # Admin tries to delete with wrong password
        session, user, _ = admin_session
        response = session.delete(f"{BASE_URL}/api/dts/tasks/{task_id}?admin_password=wrong_password_123")
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "incorrect" in data.get("detail", "").lower() or "password" in data.get("detail", "").lower(), \
            f"Error should mention incorrect password: {data}"
        print(f"✓ Admin delete with wrong password correctly returns 403: {data.get('detail')}")

    def test_admin_delete_with_correct_password_succeeds(self, admin_session, benefactor_session, estate_id):
        """Admin DELETE with correct password should succeed"""
        # Create a task first
        bsession, _ = benefactor_session
        task_data = {
            "estate_id": estate_id,
            "title": f"TEST_CORRECT_PASSWORD_{int(time.time())}",
            "description": "Task to test delete with correct password",
            "task_type": "communication",
            "confidential": "timed",
        }
        create_response = bsession.post(f"{BASE_URL}/api/dts/tasks", json=task_data)
        assert create_response.status_code == 200, f"Failed to create task: {create_response.text}"
        task_id = create_response.json()["id"]
        
        # Admin deletes with correct password
        session, user, password = admin_session
        response = session.delete(f"{BASE_URL}/api/dts/tasks/{task_id}?admin_password={password}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("success") == True, f"Expected success=True: {data}"
        print(f"✓ Admin delete with correct password succeeded: {data}")
        
        # Verify task is actually deleted
        verify_response = session.get(f"{BASE_URL}/api/dts/task/{task_id}")
        assert verify_response.status_code == 404, "Task should be deleted (404)"
        print("✓ Verified task is deleted (404 on GET)")

    def test_delete_nonexistent_task_returns_404(self, admin_session):
        """DELETE non-existent task should return 404"""
        session, user, password = admin_session
        fake_task_id = "nonexistent-task-id-12345"
        
        response = session.delete(f"{BASE_URL}/api/dts/tasks/{fake_task_id}?admin_password={password}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✓ Delete of non-existent task correctly returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
