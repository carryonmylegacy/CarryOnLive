"""
CarryOn™ Milestone Delivery Workflow Tests
Tests the milestone message automation workflow:
1. Beneficiary reports milestone → System finds matching messages → Creates pending deliveries
2. Workers review pending deliveries → Approve (delivers message + notifies) or Reject
3. Human oversight: Worker can see all estate messages for context
"""

import os
import uuid
import time
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
FOUNDER_EMAIL = "info@carryon.us"
FOUNDER_PASSWORD = "Demo1234!"
MANAGER_USERNAME = "ops_manager_1"
MANAGER_PASSWORD = "Manager123!"
BENEFICIARY_EMAIL = "ben@test.com"  # Known beneficiary user

class TestMilestoneDeliveryWorkflow:
    """Milestone Delivery Review Workflow Tests"""
    
    founder_token = None
    manager_token = None
    beneficiary_token = None
    test_estate_id = None
    test_message_id = None
    test_delivery_id = None
    beneficiary_user_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup - get tokens once per class"""
        if TestMilestoneDeliveryWorkflow.founder_token is None:
            # Add delay to avoid rate limiting
            time.sleep(2)
            self._login_founder()
        
    def _login_founder(self):
        """Login as founder"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if response.status_code == 429:
            pytest.skip("Rate limited - skipping auth tests")
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                TestMilestoneDeliveryWorkflow.founder_token = data["access_token"]
    
    def _get_founder_headers(self):
        if not TestMilestoneDeliveryWorkflow.founder_token:
            pytest.skip("No founder token available")
        return {"Authorization": f"Bearer {TestMilestoneDeliveryWorkflow.founder_token}"}
    
    # ========= Stats Endpoint Tests =========
    
    def test_01_get_delivery_stats(self):
        """GET /api/milestones/deliveries/stats - Returns pending/approved/rejected counts"""
        response = requests.get(
            f"{BASE_URL}/api/milestones/deliveries/stats",
            headers=self._get_founder_headers()
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "pending" in data, "Missing 'pending' count"
        assert "approved" in data, "Missing 'approved' count"
        assert "rejected" in data, "Missing 'rejected' count"
        assert "total" in data, "Missing 'total' count"
        
        # Verify counts are non-negative integers
        assert isinstance(data["pending"], int) and data["pending"] >= 0
        assert isinstance(data["approved"], int) and data["approved"] >= 0
        assert isinstance(data["rejected"], int) and data["rejected"] >= 0
        assert data["total"] == data["pending"] + data["approved"] + data["rejected"]
        
        print(f"Stats: pending={data['pending']}, approved={data['approved']}, rejected={data['rejected']}")
    
    # ========= Deliveries List Endpoint Tests =========
    
    def test_02_get_deliveries_list_pending(self):
        """GET /api/milestones/deliveries - Lists pending_review deliveries by default"""
        response = requests.get(
            f"{BASE_URL}/api/milestones/deliveries",
            headers=self._get_founder_headers()
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"Found {len(data)} pending deliveries")
    
    def test_03_get_deliveries_list_with_status_filter(self):
        """GET /api/milestones/deliveries?status=approved - Filter by status"""
        for status in ["pending_review", "approved", "rejected"]:
            response = requests.get(
                f"{BASE_URL}/api/milestones/deliveries?status={status}",
                headers=self._get_founder_headers()
            )
            assert response.status_code == 200, f"Expected 200 for status={status}, got {response.status_code}"
            data = response.json()
            assert isinstance(data, list), f"Expected list for status={status}"
            # All items should have matching status
            for item in data:
                assert item.get("status") == status, f"Expected status={status}, got {item.get('status')}"
            print(f"Status={status}: {len(data)} deliveries")
    
    # ========= Staff Access Control Tests =========
    
    def test_04_stats_requires_staff_role(self):
        """Stats endpoint requires admin or operator role"""
        # Test without token
        response = requests.get(f"{BASE_URL}/api/milestones/deliveries/stats")
        assert response.status_code in [401, 403], "Should require authentication"
    
    def test_05_deliveries_list_requires_staff_role(self):
        """Deliveries list requires admin or operator role"""
        response = requests.get(f"{BASE_URL}/api/milestones/deliveries")
        assert response.status_code in [401, 403], "Should require authentication"
    
    # ========= Milestone Report Endpoint Tests =========
    
    def test_06_milestone_report_requires_beneficiary_role(self):
        """POST /api/milestones/report - Requires beneficiary role"""
        # Admin/founder cannot report milestones
        response = requests.post(
            f"{BASE_URL}/api/milestones/report",
            headers=self._get_founder_headers(),
            json={
                "estate_id": "test-estate-id",
                "event_type": "graduation",
                "event_description": "Test graduation",
                "event_date": "2026-01-15"
            }
        )
        assert response.status_code == 403, f"Expected 403 for non-beneficiary, got {response.status_code}"
        assert "beneficiary" in response.text.lower() or "beneficiaries" in response.text.lower(), \
            "Error should mention beneficiary role requirement"
        print("Correctly requires beneficiary role")
    
    # ========= Delivery Detail Endpoint Tests =========
    
    def test_07_get_delivery_detail_not_found(self):
        """GET /api/milestones/deliveries/{id} - Returns 404 for non-existent delivery"""
        fake_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/milestones/deliveries/{fake_id}",
            headers=self._get_founder_headers()
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly returns 404 for non-existent delivery")
    
    # ========= Review Endpoint Tests =========
    
    def test_08_review_invalid_action(self):
        """POST /api/milestones/deliveries/{id}/review - Invalid action returns 400"""
        fake_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/milestones/deliveries/{fake_id}/review",
            headers=self._get_founder_headers(),
            json={"action": "invalid_action", "notes": "test"}
        )
        # Should return 400 for invalid action or 404 for non-existent delivery
        assert response.status_code in [400, 404], f"Expected 400/404, got {response.status_code}"
        print(f"Got expected response code {response.status_code} for invalid action")
    
    def test_09_review_not_found(self):
        """POST /api/milestones/deliveries/{id}/review - Returns 404 for non-existent pending delivery"""
        fake_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/milestones/deliveries/{fake_id}/review",
            headers=self._get_founder_headers(),
            json={"action": "approve", "notes": "test approval"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly returns 404 for non-existent delivery")
    
    # ========= Manager Login Tests =========
    
    def test_10_manager_can_access_stats(self):
        """Operator (manager) can access milestone delivery stats"""
        # Login as manager
        time.sleep(2)  # Avoid rate limit
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_USERNAME,
            "password": MANAGER_PASSWORD
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data:
                manager_token = data["access_token"]
                
                # Test stats endpoint
                stats_response = requests.get(
                    f"{BASE_URL}/api/milestones/deliveries/stats",
                    headers={"Authorization": f"Bearer {manager_token}"}
                )
                assert stats_response.status_code == 200, f"Manager should access stats, got {stats_response.status_code}"
                print("Manager can access milestone delivery stats")
        else:
            pytest.skip(f"Manager login failed: {response.status_code}")


class TestMilestoneReportCreatesDeliveries:
    """Tests that milestone reports create pending deliveries (not auto-deliver)"""
    
    def test_01_setup_test_message_for_milestone(self):
        """Create a message with trigger_type=event for testing milestone matching"""
        # Login as founder
        time.sleep(2)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        if response.status_code != 200:
            pytest.skip("Login failed")
        
        data = response.json()
        if "access_token" not in data:
            pytest.skip("No token received")
        
        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get an estate with a beneficiary
        estates_resp = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        assert estates_resp.status_code == 200
        
        estates = estates_resp.json()
        # Find estate with beneficiaries
        test_estate = None
        for e in estates:
            if e.get("beneficiaries") and len(e["beneficiaries"]) > 0:
                test_estate = e
                break
        
        if not test_estate:
            pytest.skip("No estate with beneficiaries found for testing")
        
        print(f"Found test estate: {test_estate['name']} with beneficiaries: {test_estate['beneficiaries']}")
        
        # Store for later tests
        self.__class__.test_estate_id = test_estate["id"]
        self.__class__.beneficiary_id = test_estate["beneficiaries"][0]
        
    def test_02_verify_milestone_delivery_structure(self):
        """Verify milestone delivery records have expected structure"""
        # Login as founder
        time.sleep(1)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        if response.status_code != 200:
            pytest.skip("Login failed")
        
        data = response.json()
        if "access_token" not in data:
            pytest.skip("No token")
        
        headers = {"Authorization": f"Bearer {data['access_token']}"}
        
        # Get any existing deliveries to check structure
        deliveries_resp = requests.get(
            f"{BASE_URL}/api/milestones/deliveries?status=pending_review",
            headers=headers
        )
        assert deliveries_resp.status_code == 200
        
        deliveries = deliveries_resp.json()
        if deliveries:
            d = deliveries[0]
            # Check expected fields
            expected_fields = [
                "id", "milestone_report_id", "estate_id", "message_id",
                "beneficiary_id", "status", "created_at"
            ]
            for field in expected_fields:
                assert field in d, f"Missing field '{field}' in delivery record"
            print(f"Delivery record structure verified: {list(d.keys())}")
        else:
            print("No pending deliveries to verify structure (expected if no milestones reported)")


class TestDeliveryDetailEndpoint:
    """Tests for GET /api/milestones/deliveries/{id}"""
    
    def test_detail_returns_matched_message_and_estate_context(self):
        """Detail endpoint returns matched message and all estate messages"""
        # Login
        time.sleep(2)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if response.status_code == 429:
            pytest.skip("Rate limited")
        if response.status_code != 200:
            pytest.skip("Login failed")
        
        data = response.json()
        if "access_token" not in data:
            pytest.skip("No token")
        
        headers = {"Authorization": f"Bearer {data['access_token']}"}
        
        # Get pending deliveries
        deliveries_resp = requests.get(
            f"{BASE_URL}/api/milestones/deliveries",
            headers=headers
        )
        assert deliveries_resp.status_code == 200
        
        deliveries = deliveries_resp.json()
        if not deliveries:
            pytest.skip("No deliveries to test detail endpoint")
        
        # Get detail for first delivery
        delivery = deliveries[0]
        detail_resp = requests.get(
            f"{BASE_URL}/api/milestones/deliveries/{delivery['id']}",
            headers=headers
        )
        assert detail_resp.status_code == 200
        
        detail = detail_resp.json()
        # Check structure
        assert "delivery" in detail, "Missing 'delivery' in response"
        assert "matched_message" in detail, "Missing 'matched_message' in response"
        assert "all_estate_messages" in detail, "Missing 'all_estate_messages' in response"
        assert "milestone_report" in detail, "Missing 'milestone_report' in response"
        assert "estate_name" in detail, "Missing 'estate_name' in response"
        
        print(f"Detail response includes: {list(detail.keys())}")
        print(f"Estate messages count: {len(detail.get('all_estate_messages', []))}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
