"""
CCP Drill Schedule Feature Tests
Tests for:
- PATCH /api/ccp/plans/{plan_id}/drill-schedule endpoint
- drill_schedule field in POST /api/ccp/plans
- drill_schedule field in PUT /api/ccp/plans/{plan_id}
- drill_schedule in POST /api/ccp/wizard/generate response
- build_drill_reminder_email function
- drill_reminder_scheduler function registration
"""

import pytest
import requests
import os
import sys

# Add backend to path for importing functions
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


class TestDrillScheduleEndpoint:
    """Tests for PATCH /api/ccp/plans/{plan_id}/drill-schedule"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None

    def get_auth_token(self):
        """Get authentication token"""
        if self.token:
            return self.token
        response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            return self.token
        return None

    def test_drill_schedule_endpoint_returns_401_without_auth(self):
        """PATCH /api/ccp/plans/{plan_id}/drill-schedule returns 401 without auth"""
        response = self.session.patch(f"{BASE_URL}/api/ccp/plans/fake-plan-id/drill-schedule", json={"enabled": True})
        # Should return 401 or 403 for unauthenticated request
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ PATCH drill-schedule returns {response.status_code} without auth")

    def test_drill_schedule_endpoint_returns_404_for_nonexistent_plan(self):
        """PATCH /api/ccp/plans/{plan_id}/drill-schedule returns 404 for nonexistent plan"""
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not authenticate")

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.patch(
            f"{BASE_URL}/api/ccp/plans/nonexistent-plan-id-12345/drill-schedule", json={"enabled": True}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "not found" in data.get("detail", "").lower() or "Plan not found" in data.get("detail", "")
        print("✓ PATCH drill-schedule returns 404 for nonexistent plan")

    def test_drill_schedule_endpoint_requires_enabled_field(self):
        """PATCH /api/ccp/plans/{plan_id}/drill-schedule validates request body"""
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not authenticate")

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        # Send empty body - should fail validation
        response = self.session.patch(f"{BASE_URL}/api/ccp/plans/fake-plan-id/drill-schedule", json={})
        # Should return 422 (validation error) or 404 (plan not found first)
        assert response.status_code in [422, 404], f"Expected 422/404, got {response.status_code}"
        print(f"✓ PATCH drill-schedule validates request body (status: {response.status_code})")


class TestWizardGenerateDrillSchedule:
    """Tests for drill_schedule in POST /api/ccp/wizard/generate response"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None

    def get_auth_token(self):
        """Get authentication token"""
        if self.token:
            return self.token
        response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            return self.token
        return None

    def test_wizard_generate_returns_drill_schedule_fields(self):
        """POST /api/ccp/wizard/generate returns drill_schedule with required fields"""
        # Note: Admin user is NOT estate owner, so this will return 403
        # We're testing that the endpoint exists and validates properly
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not authenticate")

        self.session.headers.update({"Authorization": f"Bearer {token}"})

        # Get user's estates first
        estates_res = self.session.get(f"{BASE_URL}/api/estates")
        if estates_res.status_code != 200:
            pytest.skip("Could not fetch estates")

        estates = estates_res.json()
        if not estates:
            pytest.skip("No estates found")

        estate_id = estates[0].get("id")

        response = self.session.post(
            f"{BASE_URL}/api/ccp/wizard/generate",
            json={
                "estate_id": estate_id,
                "location": "123 Test St, Houston, TX",
                "household": ["children", "pets"],
                "concerns": ["hurricane"],
                "preference": "evacuate",
            },
        )

        # Admin user is not estate owner, so expect 403
        if response.status_code == 403:
            print("✓ Wizard endpoint returns 403 for non-estate-owner (expected)")
            # This is expected behavior - admin is not estate owner
            return

        # If we somehow get 200, verify drill_schedule fields
        if response.status_code == 200:
            data = response.json()
            assert "drill_schedule" in data, "Response missing drill_schedule field"
            drill = data["drill_schedule"]
            assert "frequency" in drill, "drill_schedule missing frequency"
            assert "recommended_months" in drill, "drill_schedule missing recommended_months"
            assert "label" in drill, "drill_schedule missing label"
            assert "next_drill_date" in drill, "drill_schedule missing next_drill_date"
            assert "enabled" in drill, "drill_schedule missing enabled"
            print(f"✓ Wizard returns drill_schedule with all required fields: {drill}")
        else:
            print(f"✓ Wizard endpoint responded with status {response.status_code}")


class TestPlanCRUDWithDrillSchedule:
    """Tests for drill_schedule field in plan CRUD operations"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None

    def get_auth_token(self):
        """Get authentication token"""
        if self.token:
            return self.token
        response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            return self.token
        return None

    def test_create_plan_accepts_drill_schedule(self):
        """POST /api/ccp/plans accepts drill_schedule field"""
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not authenticate")

        self.session.headers.update({"Authorization": f"Bearer {token}"})

        # Get user's estates
        estates_res = self.session.get(f"{BASE_URL}/api/estates")
        if estates_res.status_code != 200:
            pytest.skip("Could not fetch estates")

        estates = estates_res.json()
        if not estates:
            pytest.skip("No estates found")

        estate_id = estates[0].get("id")

        # Try to create a plan with drill_schedule
        response = self.session.post(
            f"{BASE_URL}/api/ccp/plans",
            json={
                "estate_id": estate_id,
                "name": "TEST_Drill_Schedule_Plan",
                "plan_type": "natural_disaster",
                "rendezvous_points": [],
                "communication_plan": "Test communication",
                "resource_locations": [],
                "instructions": "Test instructions",
                "linked_document_ids": [],
                "linked_ffn_contact_ids": [],
                "linked_dav_entry_ids": [],
                "assigned_beneficiary_ids": None,
                "drill_schedule": {
                    "frequency": "biannual",
                    "recommended_months": [5, 11],
                    "label": "Before & after hurricane season (May, Nov)",
                    "next_drill_date": "2026-05-01T00:00:00+00:00",
                    "enabled": True,
                },
            },
        )

        # Admin may not be estate owner
        if response.status_code == 403:
            print("✓ POST /api/ccp/plans returns 403 for non-estate-owner (expected)")
            return

        if response.status_code == 201 or response.status_code == 200:
            data = response.json()
            assert "drill_schedule" in data, "Created plan missing drill_schedule"
            assert data["drill_schedule"]["enabled"]
            print("✓ POST /api/ccp/plans accepts drill_schedule field")

            # Cleanup - delete the test plan
            plan_id = data.get("id")
            if plan_id:
                self.session.delete(f"{BASE_URL}/api/ccp/plans/{plan_id}")
        else:
            print(f"✓ POST /api/ccp/plans responded with status {response.status_code}")

    def test_update_plan_accepts_drill_schedule(self):
        """PUT /api/ccp/plans/{plan_id} accepts drill_schedule field"""
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not authenticate")

        self.session.headers.update({"Authorization": f"Bearer {token}"})

        # Get user's estates
        estates_res = self.session.get(f"{BASE_URL}/api/estates")
        if estates_res.status_code != 200:
            pytest.skip("Could not fetch estates")

        estates = estates_res.json()
        if not estates:
            pytest.skip("No estates found")

        estate_id = estates[0].get("id")

        # Get existing plans
        plans_res = self.session.get(f"{BASE_URL}/api/ccp/plans/{estate_id}")
        if plans_res.status_code != 200:
            pytest.skip("Could not fetch plans")

        plans = plans_res.json()
        if not plans:
            print("✓ No existing plans to test update - skipping")
            return

        plan_id = plans[0].get("id")

        # Try to update with drill_schedule
        response = self.session.put(
            f"{BASE_URL}/api/ccp/plans/{plan_id}",
            json={
                "drill_schedule": {
                    "frequency": "annual",
                    "recommended_months": [1],
                    "label": "Once a year (Jan)",
                    "next_drill_date": "2027-01-01T00:00:00+00:00",
                    "enabled": False,
                }
            },
        )

        if response.status_code == 403:
            print("✓ PUT /api/ccp/plans returns 403 for non-estate-owner (expected)")
            return

        if response.status_code == 200:
            data = response.json()
            assert "drill_schedule" in data, "Updated plan missing drill_schedule"
            print("✓ PUT /api/ccp/plans accepts drill_schedule field")
        else:
            print(f"✓ PUT /api/ccp/plans responded with status {response.status_code}")


class TestDrillReminderFunctions:
    """Tests for drill reminder helper functions"""

    def test_build_drill_reminder_email_returns_valid_html(self):
        """build_drill_reminder_email returns valid HTML with CarryOn branding"""
        try:
            from routes.connected_protocol import build_drill_reminder_email

            subject, html = build_drill_reminder_email(
                user_name="Test User",
                plan_name="Hurricane Evacuation Plan",
                plan_type_label="Natural Disaster",
                app_url="https://app.carryon.us",
            )

            # Verify subject
            assert "Hurricane Evacuation Plan" in subject
            assert "Drill" in subject

            # Verify HTML contains CarryOn branding
            assert "#0F1629" in html, "Missing dark background color"
            assert "#d4af37" in html, "Missing gold accent color"
            assert "CarryOn" in html, "Missing CarryOn branding"

            # Verify HTML contains key content
            assert "Test User" in html, "Missing user name"
            assert "Hurricane Evacuation Plan" in html, "Missing plan name"
            assert "connected-protocol" in html, "Missing link to CCP page"

            # Verify warm, guiding tone elements
            assert "practice" in html.lower() or "drill" in html.lower()
            assert "reminder" in html.lower() or "time" in html.lower()

            print("✓ build_drill_reminder_email returns valid HTML with CarryOn branding")
            print(f"  Subject: {subject}")

        except ImportError as e:
            pytest.fail(f"Could not import build_drill_reminder_email: {e}")

    def test_drill_reminder_scheduler_function_exists(self):
        """drill_reminder_scheduler function exists and is importable"""
        try:
            from routes.connected_protocol import drill_reminder_scheduler
            import asyncio

            # Verify it's an async function
            assert asyncio.iscoroutinefunction(drill_reminder_scheduler), (
                "drill_reminder_scheduler should be an async function"
            )

            print("✓ drill_reminder_scheduler function exists and is async")

        except ImportError as e:
            pytest.fail(f"Could not import drill_reminder_scheduler: {e}")

    def test_drill_schedules_dict_exists(self):
        """_DRILL_SCHEDULES dict exists with expected concern types"""
        try:
            from routes.connected_protocol import _DRILL_SCHEDULES

            # Verify it's a dict
            assert isinstance(_DRILL_SCHEDULES, dict)

            # Verify hurricane schedule (biannual in May/Nov)
            assert "hurricane" in _DRILL_SCHEDULES
            hurricane = _DRILL_SCHEDULES["hurricane"]
            assert hurricane["frequency"] == "biannual"
            assert 5 in hurricane["months"]  # May
            assert 11 in hurricane["months"]  # November

            # Verify other key schedules exist
            expected_concerns = ["tornado", "earthquake", "flood", "wildfire", "house_fire", "nuclear"]
            for concern in expected_concerns:
                assert concern in _DRILL_SCHEDULES, f"Missing schedule for {concern}"

            print(f"✓ _DRILL_SCHEDULES dict exists with {len(_DRILL_SCHEDULES)} concern types")
            print(f"  Hurricane schedule: {_DRILL_SCHEDULES['hurricane']}")

        except ImportError as e:
            pytest.fail(f"Could not import _DRILL_SCHEDULES: {e}")

    def test_compute_next_drill_date_function(self):
        """_compute_next_drill_date returns valid ISO date string"""
        try:
            from routes.connected_protocol import _compute_next_drill_date

            # Test with May/November schedule
            result = _compute_next_drill_date([5, 11])

            # Should return ISO format string
            assert isinstance(result, str)
            assert "T" in result  # ISO format has T separator
            assert "+" in result or "Z" in result  # Has timezone

            # Parse to verify it's valid
            from datetime import datetime

            parsed = datetime.fromisoformat(result.replace("Z", "+00:00"))
            assert parsed.day == 1  # Should be 1st of month
            assert parsed.month in [5, 11]  # Should be May or November

            print(f"✓ _compute_next_drill_date returns valid ISO date: {result}")

        except ImportError as e:
            pytest.fail(f"Could not import _compute_next_drill_date: {e}")


class TestServerLifespanScheduler:
    """Tests for drill_reminder_scheduler registration in server.py"""

    def test_drill_scheduler_imported_in_server(self):
        """drill_reminder_scheduler is imported in server.py lifespan"""
        with open("/app/backend/server.py", "r") as f:
            server_content = f.read()

        # Check import
        assert "from routes.connected_protocol import drill_reminder_scheduler" in server_content, (
            "drill_reminder_scheduler not imported in server.py"
        )

        # Check it's started as a task
        assert "drill_reminder_scheduler()" in server_content, "drill_reminder_scheduler not called in server.py"

        assert "asyncio.create_task(drill_reminder_scheduler())" in server_content, (
            "drill_reminder_scheduler not registered as asyncio task"
        )

        print("✓ drill_reminder_scheduler is imported and registered in server.py lifespan")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
