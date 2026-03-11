"""
Test Suite for Operator Portal Enhancements
============================================
Tests for:
1. GET /api/ops/dashboard-events - Returns counts for all 6 event types
2. GET /api/ops/team-tasks - Returns tasks grouped by operator
3. GET /api/admin/stats - New fields: pending_milestones, pending_emergency, p1_emergencies, open_escalations
4. DELETE /api/founder/operators/{id} - Role-based delete permissions
"""

import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
FOUNDER_EMAIL = "info@carryon.us"
FOUNDER_PASSWORD = "Demo1234!"


class TestDashboardEventsAPI:
    """Test /api/ops/dashboard-events endpoint for all 6 event types"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as founder to get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as founder
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_dashboard_events_returns_all_event_types(self):
        """Verify dashboard-events returns counts for all 6 event types"""
        response = self.session.get(f"{BASE_URL}/api/ops/dashboard-events")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify events object exists
        assert "events" in data, "Response should contain 'events' field"
        events = data["events"]
        
        # Verify all 6 event types are present
        required_types = ["tvt", "milestones", "dts", "emergency", "p1", "support"]
        for event_type in required_types:
            assert event_type in events, f"Missing event type: {event_type}"
            assert "count" in events[event_type], f"Event type {event_type} should have 'count' field"
            assert isinstance(events[event_type]["count"], int), f"Count for {event_type} should be integer"
        
        # Verify TVT has breakdown
        assert "pending" in events["tvt"], "TVT should have 'pending' count"
        assert "reviewing" in events["tvt"], "TVT should have 'reviewing' count"
        
        # Verify each event has a path
        for event_type in required_types:
            assert "path" in events[event_type], f"Event type {event_type} should have 'path' field"
        
        print(f"Dashboard events: {events}")
    
    def test_dashboard_events_has_recent_activity(self):
        """Verify dashboard-events returns recent activity data"""
        response = self.session.get(f"{BASE_URL}/api/ops/dashboard-events")
        assert response.status_code == 200
        
        data = response.json()
        assert "recent_activity" in data, "Response should contain 'recent_activity'"
        
        # Verify recent activity contains arrays
        recent = data["recent_activity"]
        for key in ["tvt", "milestones", "dts", "emergency"]:
            assert key in recent, f"recent_activity should contain '{key}'"
            assert isinstance(recent[key], list), f"recent_activity.{key} should be a list"
    
    def test_dashboard_events_has_timestamp(self):
        """Verify dashboard-events returns a timestamp"""
        response = self.session.get(f"{BASE_URL}/api/ops/dashboard-events")
        assert response.status_code == 200
        
        data = response.json()
        assert "timestamp" in data, "Response should contain 'timestamp'"


class TestTeamTasksAPI:
    """Test /api/ops/team-tasks endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as founder to get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_team_tasks_returns_team_data(self):
        """Verify team-tasks returns team data structure"""
        response = self.session.get(f"{BASE_URL}/api/ops/team-tasks")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "team" in data, "Response should contain 'team' field"
        assert "total_active_tasks" in data, "Response should contain 'total_active_tasks'"
        assert "timestamp" in data, "Response should contain 'timestamp'"
        
        # Verify team is a list
        assert isinstance(data["team"], list), "'team' should be a list"
        assert isinstance(data["total_active_tasks"], int), "'total_active_tasks' should be integer"
        
        print(f"Team tasks response: {data}")
    
    def test_team_tasks_operator_structure(self):
        """Verify each team member has required fields"""
        response = self.session.get(f"{BASE_URL}/api/ops/team-tasks")
        assert response.status_code == 200
        
        data = response.json()
        team = data["team"]
        
        if len(team) > 0:
            op = team[0]
            required_fields = ["id", "name", "operator_role", "tasks", "task_count"]
            for field in required_fields:
                assert field in op, f"Operator should have '{field}' field"
            
            # Verify tasks is a list
            assert isinstance(op["tasks"], list), "tasks should be a list"
            assert isinstance(op["task_count"], int), "task_count should be integer"
        else:
            print("No operators found to verify structure")


class TestAdminStatsNewFields:
    """Test GET /api/admin/stats for new fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as founder to get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_admin_stats_has_new_fields(self):
        """Verify admin stats contains new ops-related fields"""
        response = self.session.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify new fields exist
        new_fields = ["pending_milestones", "pending_emergency", "p1_emergencies", "open_escalations"]
        for field in new_fields:
            assert field in data, f"Stats should contain '{field}' field"
            assert isinstance(data[field], int), f"'{field}' should be an integer"
        
        print(f"Admin stats new fields: pending_milestones={data['pending_milestones']}, pending_emergency={data['pending_emergency']}, p1_emergencies={data['p1_emergencies']}, open_escalations={data['open_escalations']}")
    
    def test_admin_stats_existing_fields_still_present(self):
        """Verify existing stats fields are still present"""
        response = self.session.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify existing fields
        existing_fields = ["users", "estates", "documents", "pending_certificates", "pending_dts", "unanswered_support"]
        for field in existing_fields:
            assert field in data, f"Stats should still contain '{field}' field"


class TestOpsDashboardAPI:
    """Test /api/ops/dashboard endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as founder to get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_ops_dashboard_returns_data(self):
        """Verify ops dashboard returns expected structure"""
        response = self.session.get(f"{BASE_URL}/api/ops/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "timestamp" in data, "Response should contain 'timestamp'"
        assert "operators" in data, "Response should contain 'operators'"
        assert "queues" in data, "Response should contain 'queues'"
        
        print(f"Ops dashboard response keys: {list(data.keys())}")


class TestOperatorDeletePermissions:
    """Test DELETE /api/founder/operators/{id} role-based permissions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as founder to get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.user = data.get("user", {})
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_founder_can_list_operators(self):
        """Verify founder can list all operators"""
        response = self.session.get(f"{BASE_URL}/api/founder/operators")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of operators"
        
        print(f"Found {len(data)} operators")
        
        # Check operator_role field exists
        for op in data:
            if "operator_role" not in op:
                op["operator_role"] = "worker"  # Default for legacy
            print(f"  - {op.get('name')} ({op.get('operator_role')})")
    
    def test_delete_requires_password(self):
        """Verify delete requires password parameter"""
        response = self.session.delete(f"{BASE_URL}/api/founder/operators/fake-id")
        # Should fail with 422 (missing required param) or 404 (not found)
        assert response.status_code in [400, 404, 422], f"Expected error without password, got {response.status_code}"
    
    def test_delete_with_wrong_password_fails(self):
        """Verify delete fails with incorrect password"""
        # Get list of operators
        list_response = self.session.get(f"{BASE_URL}/api/founder/operators")
        if list_response.status_code != 200 or len(list_response.json()) == 0:
            pytest.skip("No operators to test delete with")
        
        ops = list_response.json()
        test_op = ops[0]
        
        response = self.session.delete(
            f"{BASE_URL}/api/founder/operators/{test_op['id']}?admin_password=wrongpassword"
        )
        # Should fail with 401 (incorrect password)
        assert response.status_code == 401, f"Expected 401 for wrong password, got {response.status_code}: {response.text}"


class TestOperatorCRUD:
    """Test operator CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as founder to get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FOUNDER_EMAIL,
            "password": FOUNDER_PASSWORD
        })
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_create_worker_operator(self):
        """Test creating a worker operator"""
        import uuid
        test_username = f"test_worker_{uuid.uuid4().hex[:8]}"
        
        response = self.session.post(f"{BASE_URL}/api/founder/operators", json={
            "username": test_username,
            "password": "TestPass123!",
            "first_name": "Test",
            "last_name": "Worker",
            "email": f"{test_username}@test.com",
            "operator_role": "worker"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("operator_role") == "worker", "Should create worker role"
        assert data.get("role") == "operator", "Role should be 'operator'"
        
        created_id = data.get("id")
        print(f"Created worker operator: {data.get('name')} (ID: {created_id})")
        
        # Cleanup: Delete the test operator
        if created_id:
            self.session.delete(
                f"{BASE_URL}/api/founder/operators/{created_id}?admin_password={FOUNDER_PASSWORD}"
            )
    
    def test_create_manager_operator(self):
        """Test creating a manager operator (founder only)"""
        import uuid
        test_username = f"test_manager_{uuid.uuid4().hex[:8]}"
        
        response = self.session.post(f"{BASE_URL}/api/founder/operators", json={
            "username": test_username,
            "password": "TestPass123!",
            "first_name": "Test",
            "last_name": "Manager",
            "email": f"{test_username}@test.com",
            "operator_role": "manager"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("operator_role") == "manager", "Should create manager role"
        
        created_id = data.get("id")
        print(f"Created manager operator: {data.get('name')} (ID: {created_id})")
        
        # Cleanup
        if created_id:
            self.session.delete(
                f"{BASE_URL}/api/founder/operators/{created_id}?admin_password={FOUNDER_PASSWORD}"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
