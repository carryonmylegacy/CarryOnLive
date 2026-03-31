"""
Test Suite: Shift Swap Requests Feature
Tests the new shift swap request endpoints added to shift scheduling system.
Endpoints tested:
- POST /api/ops/shifts/swap-requests (create swap request)
- GET /api/ops/shifts/swap-requests (list swap requests)
- PUT /api/ops/shifts/swap-requests/{id} (approve/deny swap request)
"""

import pytest
import requests
import os
from uuid import uuid4
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers for API requests"""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest.fixture(scope="module")
def staff_list(auth_headers):
    """Get list of staff members for testing"""
    response = requests.get(f"{BASE_URL}/api/team/staff", headers=auth_headers)
    assert response.status_code == 200
    return response.json()


@pytest.fixture(scope="module")
def test_shift(auth_headers, staff_list):
    """Create a test shift for swap testing"""
    # Find an operator to assign the shift to
    operator = next((s for s in staff_list if s.get("role") in ["admin", "operator"]), None)
    assert operator, "No operator found in staff list"
    
    # Create a shift for tomorrow
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    unique_id = str(uuid4())[:8]
    
    response = requests.post(
        f"{BASE_URL}/api/ops/shifts",
        json={
            "operator_id": operator["id"],
            "shift_type": "day",
            "date": tomorrow,
            "notes": f"TEST_swap_shift_{unique_id}"
        },
        headers=auth_headers
    )
    assert response.status_code == 200, f"Failed to create test shift: {response.text}"
    shift = response.json()
    
    yield shift
    
    # Cleanup: Cancel the shift after tests
    requests.delete(f"{BASE_URL}/api/ops/shifts/{shift['id']}", headers=auth_headers)


class TestSwapRequestCreation:
    """Tests for POST /api/ops/shifts/swap-requests"""
    
    def test_create_swap_request_success(self, auth_headers, test_shift, staff_list):
        """Test creating a valid swap request"""
        # Find a different operator to swap with
        target = next(
            (s for s in staff_list if s["id"] != test_shift["operator_id"]),
            None
        )
        assert target, "No target operator found for swap"
        
        response = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": test_shift["id"],
                "target_operator_id": target["id"],
                "reason": "TEST_swap_reason"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Failed to create swap request: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "id" in data
        assert data["shift_id"] == test_shift["id"]
        assert data["target_operator_id"] == target["id"]
        assert data["status"] == "pending"
        assert "requester_name" in data
        assert "target_operator_name" in data
        assert "created_at" in data
    
    def test_create_swap_request_self_swap_rejected(self, auth_headers, staff_list):
        """Test that self-swap (target = current user) is rejected with 400"""
        # First get the current user's ID
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert me_resp.status_code == 200
        current_user_id = me_resp.json()["id"]
        
        # Create a shift for the current user
        tomorrow = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        unique_id = str(uuid4())[:8]
        
        shift_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts",
            json={
                "operator_id": current_user_id,
                "shift_type": "day",
                "date": tomorrow,
                "notes": f"TEST_self_swap_{unique_id}"
            },
            headers=auth_headers
        )
        assert shift_resp.status_code == 200
        shift = shift_resp.json()
        
        # Try to swap with yourself (target = current user)
        response = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": shift["id"],
                "target_operator_id": current_user_id,  # Same as current user
                "reason": "TEST_self_swap"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Expected 400 for self-swap, got {response.status_code}"
        assert "yourself" in response.json().get("detail", "").lower()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/ops/shifts/{shift['id']}", headers=auth_headers)
    
    def test_create_swap_request_invalid_shift(self, auth_headers, staff_list):
        """Test swap request with non-existent shift returns 404"""
        target = staff_list[0]
        
        response = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": "non-existent-shift-id",
                "target_operator_id": target["id"],
                "reason": "TEST_invalid_shift"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 404
    
    def test_create_swap_request_invalid_target(self, auth_headers, test_shift):
        """Test swap request with non-existent target operator returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": test_shift["id"],
                "target_operator_id": "non-existent-operator-id",
                "reason": "TEST_invalid_target"
            },
            headers=auth_headers
        )
        
        assert response.status_code == 404


class TestSwapRequestListing:
    """Tests for GET /api/ops/shifts/swap-requests"""
    
    def test_get_swap_requests_returns_list(self, auth_headers):
        """Test that swap requests endpoint returns a list"""
        response = requests.get(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_swap_requests_with_status_filter(self, auth_headers):
        """Test filtering swap requests by status"""
        response = requests.get(
            f"{BASE_URL}/api/ops/shifts/swap-requests?status_filter=pending",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # All returned requests should be pending
        for req in data:
            assert req["status"] == "pending"


class TestSwapRequestActions:
    """Tests for PUT /api/ops/shifts/swap-requests/{id}"""
    
    def test_approve_swap_request(self, auth_headers, staff_list):
        """Test approving a swap request reassigns the shift"""
        # Create a fresh shift and swap request for this test
        operator = next((s for s in staff_list if s.get("role") in ["admin", "operator"]), None)
        target = next((s for s in staff_list if s["id"] != operator["id"]), None)
        
        tomorrow = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        unique_id = str(uuid4())[:8]
        
        # Create shift
        shift_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts",
            json={
                "operator_id": operator["id"],
                "shift_type": "evening",
                "date": tomorrow,
                "notes": f"TEST_approve_swap_{unique_id}"
            },
            headers=auth_headers
        )
        assert shift_resp.status_code == 200
        shift = shift_resp.json()
        
        # Create swap request
        swap_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": shift["id"],
                "target_operator_id": target["id"],
                "reason": "TEST_approve_swap"
            },
            headers=auth_headers
        )
        assert swap_resp.status_code == 200
        swap_req = swap_resp.json()
        
        # Approve the swap
        approve_resp = requests.put(
            f"{BASE_URL}/api/ops/shifts/swap-requests/{swap_req['id']}",
            json={"action": "approve", "notes": "TEST_approved"},
            headers=auth_headers
        )
        
        assert approve_resp.status_code == 200
        assert approve_resp.json()["status"] == "approved"
        
        # Verify the shift was reassigned
        shift_check = requests.get(
            f"{BASE_URL}/api/ops/shifts?start_date={tomorrow}&end_date={tomorrow}",
            headers=auth_headers
        )
        assert shift_check.status_code == 200
        updated_shift = next((s for s in shift_check.json() if s["id"] == shift["id"]), None)
        assert updated_shift is not None
        assert updated_shift["operator_id"] == target["id"], "Shift should be reassigned to target operator"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/ops/shifts/{shift['id']}", headers=auth_headers)
    
    def test_deny_swap_request(self, auth_headers, staff_list):
        """Test denying a swap request keeps original assignment"""
        operator = next((s for s in staff_list if s.get("role") in ["admin", "operator"]), None)
        target = next((s for s in staff_list if s["id"] != operator["id"]), None)
        
        tomorrow = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        unique_id = str(uuid4())[:8]
        
        # Create shift
        shift_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts",
            json={
                "operator_id": operator["id"],
                "shift_type": "night",
                "date": tomorrow,
                "notes": f"TEST_deny_swap_{unique_id}"
            },
            headers=auth_headers
        )
        assert shift_resp.status_code == 200
        shift = shift_resp.json()
        original_operator_id = shift["operator_id"]
        
        # Create swap request
        swap_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": shift["id"],
                "target_operator_id": target["id"],
                "reason": "TEST_deny_swap"
            },
            headers=auth_headers
        )
        assert swap_resp.status_code == 200
        swap_req = swap_resp.json()
        
        # Deny the swap
        deny_resp = requests.put(
            f"{BASE_URL}/api/ops/shifts/swap-requests/{swap_req['id']}",
            json={"action": "deny", "notes": "TEST_denied"},
            headers=auth_headers
        )
        
        assert deny_resp.status_code == 200
        assert deny_resp.json()["status"] == "denied"
        
        # Verify the shift was NOT reassigned
        shift_check = requests.get(
            f"{BASE_URL}/api/ops/shifts?start_date={tomorrow}&end_date={tomorrow}",
            headers=auth_headers
        )
        assert shift_check.status_code == 200
        unchanged_shift = next((s for s in shift_check.json() if s["id"] == shift["id"]), None)
        assert unchanged_shift is not None
        assert unchanged_shift["operator_id"] == original_operator_id, "Shift should remain with original operator"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/ops/shifts/{shift['id']}", headers=auth_headers)
    
    def test_invalid_action_rejected(self, auth_headers, staff_list):
        """Test that invalid action is rejected with 400"""
        operator = next((s for s in staff_list if s.get("role") in ["admin", "operator"]), None)
        target = next((s for s in staff_list if s["id"] != operator["id"]), None)
        
        tomorrow = (datetime.now() + timedelta(days=4)).strftime("%Y-%m-%d")
        unique_id = str(uuid4())[:8]
        
        # Create shift
        shift_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts",
            json={
                "operator_id": operator["id"],
                "shift_type": "on_call",
                "date": tomorrow,
                "notes": f"TEST_invalid_action_{unique_id}"
            },
            headers=auth_headers
        )
        assert shift_resp.status_code == 200
        shift = shift_resp.json()
        
        # Create swap request
        swap_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": shift["id"],
                "target_operator_id": target["id"],
                "reason": "TEST_invalid_action"
            },
            headers=auth_headers
        )
        assert swap_resp.status_code == 200
        swap_req = swap_resp.json()
        
        # Try invalid action
        invalid_resp = requests.put(
            f"{BASE_URL}/api/ops/shifts/swap-requests/{swap_req['id']}",
            json={"action": "invalid_action"},
            headers=auth_headers
        )
        
        assert invalid_resp.status_code == 400
        assert "approve" in invalid_resp.json().get("detail", "").lower() or "deny" in invalid_resp.json().get("detail", "").lower()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/ops/shifts/{shift['id']}", headers=auth_headers)
    
    def test_action_nonexistent_request_returns_404(self, auth_headers):
        """Test that actioning a non-existent request returns 404"""
        response = requests.put(
            f"{BASE_URL}/api/ops/shifts/swap-requests/non-existent-id",
            json={"action": "approve"},
            headers=auth_headers
        )
        
        assert response.status_code == 404


class TestDuplicateSwapRequest:
    """Test duplicate pending swap request rejection"""
    
    def test_duplicate_pending_request_rejected(self, auth_headers, staff_list):
        """Test that duplicate pending swap request is rejected with 409"""
        operator = next((s for s in staff_list if s.get("role") in ["admin", "operator"]), None)
        target = next((s for s in staff_list if s["id"] != operator["id"]), None)
        
        tomorrow = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        unique_id = str(uuid4())[:8]
        
        # Create shift
        shift_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts",
            json={
                "operator_id": operator["id"],
                "shift_type": "day",
                "date": tomorrow,
                "notes": f"TEST_duplicate_{unique_id}"
            },
            headers=auth_headers
        )
        assert shift_resp.status_code == 200
        shift = shift_resp.json()
        
        # Create first swap request
        first_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": shift["id"],
                "target_operator_id": target["id"],
                "reason": "TEST_first_request"
            },
            headers=auth_headers
        )
        assert first_resp.status_code == 200
        
        # Try to create duplicate swap request
        duplicate_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": shift["id"],
                "target_operator_id": target["id"],
                "reason": "TEST_duplicate_request"
            },
            headers=auth_headers
        )
        
        assert duplicate_resp.status_code == 409, f"Expected 409 for duplicate, got {duplicate_resp.status_code}"
        assert "already exists" in duplicate_resp.json().get("detail", "").lower()
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/ops/shifts/{shift['id']}", headers=auth_headers)


class TestFullSwapLifecycle:
    """Test complete swap lifecycle: create shift -> request swap -> approve -> verify"""
    
    def test_full_swap_lifecycle(self, auth_headers, staff_list):
        """Test the complete swap workflow end-to-end"""
        # Get two different operators
        operators = [s for s in staff_list if s.get("role") in ["admin", "operator"]]
        assert len(operators) >= 2, "Need at least 2 operators for lifecycle test"
        
        original_operator = operators[0]
        target_operator = operators[1]
        
        # Step 1: Create a shift
        tomorrow = (datetime.now() + timedelta(days=6)).strftime("%Y-%m-%d")
        unique_id = str(uuid4())[:8]
        
        shift_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts",
            json={
                "operator_id": original_operator["id"],
                "shift_type": "evening",
                "date": tomorrow,
                "notes": f"TEST_lifecycle_{unique_id}"
            },
            headers=auth_headers
        )
        assert shift_resp.status_code == 200, f"Step 1 failed: {shift_resp.text}"
        shift = shift_resp.json()
        print(f"Step 1: Created shift {shift['id']} for {original_operator['name']}")
        
        # Step 2: Request swap
        swap_resp = requests.post(
            f"{BASE_URL}/api/ops/shifts/swap-requests",
            json={
                "shift_id": shift["id"],
                "target_operator_id": target_operator["id"],
                "reason": "TEST_lifecycle_swap"
            },
            headers=auth_headers
        )
        assert swap_resp.status_code == 200, f"Step 2 failed: {swap_resp.text}"
        swap_req = swap_resp.json()
        assert swap_req["status"] == "pending"
        print(f"Step 2: Created swap request {swap_req['id']} (pending)")
        
        # Step 3: Verify swap request appears in list
        list_resp = requests.get(
            f"{BASE_URL}/api/ops/shifts/swap-requests?status_filter=pending",
            headers=auth_headers
        )
        assert list_resp.status_code == 200
        pending_requests = list_resp.json()
        found = any(r["id"] == swap_req["id"] for r in pending_requests)
        assert found, "Swap request should appear in pending list"
        print(f"Step 3: Verified swap request in pending list")
        
        # Step 4: Approve the swap
        approve_resp = requests.put(
            f"{BASE_URL}/api/ops/shifts/swap-requests/{swap_req['id']}",
            json={"action": "approve", "notes": "TEST_lifecycle_approved"},
            headers=auth_headers
        )
        assert approve_resp.status_code == 200, f"Step 4 failed: {approve_resp.text}"
        assert approve_resp.json()["status"] == "approved"
        print(f"Step 4: Approved swap request")
        
        # Step 5: Verify shift reassignment
        shifts_resp = requests.get(
            f"{BASE_URL}/api/ops/shifts?start_date={tomorrow}&end_date={tomorrow}",
            headers=auth_headers
        )
        assert shifts_resp.status_code == 200
        updated_shift = next((s for s in shifts_resp.json() if s["id"] == shift["id"]), None)
        assert updated_shift is not None
        assert updated_shift["operator_id"] == target_operator["id"], \
            f"Shift should be reassigned to {target_operator['name']}"
        assert updated_shift["operator_name"] == target_operator["name"]
        print(f"Step 5: Verified shift reassigned to {target_operator['name']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/ops/shifts/{shift['id']}", headers=auth_headers)
        print("Lifecycle test completed successfully!")
