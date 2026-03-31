"""CarryOn™ — Admin Portal Overhaul Tests

Tests for the major admin platform overhaul including:
- Scoped Admin Roles (founder, finance, compliance, marketing, platform_health)
- IP Whitelist per account type
- Maintenance Mode
- Canned Response Templates
- Worker Performance Metrics
- Task Claiming/Assignment
- Customer Context Panel
- Bulk Operations (tier assignment, beta toggle, CSV exports)
- Escalation Resolution with Founder Veto
- Subscription Plans with tier_features
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestAdminOverhaul:
    """Tests for the admin portal overhaul features"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.user_id = None

    def _login(self):
        """Login and get auth token"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        # API returns access_token, not token
        self.token = data.get("access_token") or data.get("token")
        self.user_id = data.get("user", {}).get("id")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        return data

    # ── Authentication Tests ──────────────────────────────────

    def test_admin_login(self):
        """Test admin login works correctly"""
        data = self._login()
        assert "access_token" in data or "token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        # admin_scope should default to founder (may be empty string if not set)
        admin_scope = data["user"].get("admin_scope", "founder")
        assert admin_scope in ("founder", ""), f"Unexpected admin_scope: {admin_scope}"
        print("✓ Admin login successful")

    # ── IP Whitelist Tests ────────────────────────────────────

    def test_ip_whitelist_get(self):
        """Test GET /api/admin/ip-whitelist returns 5 account types"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/admin/ip-whitelist")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 5, f"Expected 5 account types, got {len(data)}"
        account_types = [c["account_type"] for c in data]
        expected = ["admin", "operator_manager", "operator_worker", "benefactor", "beneficiary"]
        for at in expected:
            assert at in account_types, f"Missing account type: {at}"
        print(f"✓ IP Whitelist returns 5 account types: {account_types}")

    def test_ip_whitelist_toggle(self):
        """Test PUT /api/admin/ip-whitelist toggles enabled state"""
        self._login()
        # Get current state
        response = self.session.get(f"{BASE_URL}/api/admin/ip-whitelist")
        assert response.status_code == 200
        configs = response.json()
        admin_config = next((c for c in configs if c["account_type"] == "admin"), None)
        assert admin_config is not None

        # Toggle to opposite state
        new_enabled = not admin_config["enabled"]
        response = self.session.put(
            f"{BASE_URL}/api/admin/ip-whitelist",
            json={
                "account_type": "admin",
                "enabled": new_enabled,
                "allowed_ips": admin_config.get("allowed_ips", []),
                "notes": "Test toggle",
            },
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        result = response.json()
        assert result["success"] is True
        assert result["enabled"] == new_enabled

        # Revert back
        self.session.put(
            f"{BASE_URL}/api/admin/ip-whitelist",
            json={
                "account_type": "admin",
                "enabled": admin_config["enabled"],
                "allowed_ips": admin_config.get("allowed_ips", []),
                "notes": "",
            },
        )
        print("✓ IP Whitelist toggle works correctly")

    # ── Scoped Admins Tests ───────────────────────────────────

    def test_scoped_admins_list(self):
        """Test GET /api/admin/scoped-admins returns admin list"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/admin/scoped-admins")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        # Should have at least the current admin
        assert len(data) >= 1
        # Each admin should have admin_scope
        for admin in data:
            assert "admin_scope" in admin
            assert "scope_label" in admin
            assert admin["role"] == "admin"
        print(f"✓ Scoped Admins list returns {len(data)} admin(s)")

    # ── Maintenance Mode Tests ────────────────────────────────

    def test_maintenance_mode_get(self):
        """Test GET /api/admin/maintenance-mode returns status"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/admin/maintenance-mode")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "enabled" in data
        assert isinstance(data["enabled"], bool)
        print(f"✓ Maintenance mode status: enabled={data['enabled']}")

    def test_maintenance_mode_toggle(self):
        """Test PUT /api/admin/maintenance-mode toggles maintenance mode"""
        self._login()
        # Get current state
        response = self.session.get(f"{BASE_URL}/api/admin/maintenance-mode")
        assert response.status_code == 200
        current = response.json()

        # Toggle to enabled (briefly)
        response = self.session.put(
            f"{BASE_URL}/api/admin/maintenance-mode",
            json={
                "enabled": True,
                "message": "Test maintenance mode",
                "estimated_end": None,
            },
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        result = response.json()
        assert result["success"] is True
        assert result["enabled"] is True

        # Immediately disable
        response = self.session.put(
            f"{BASE_URL}/api/admin/maintenance-mode",
            json={
                "enabled": False,
                "message": "",
                "estimated_end": None,
            },
        )
        assert response.status_code == 200
        print("✓ Maintenance mode toggle works correctly")

    # ── Canned Responses Tests ────────────────────────────────

    def test_canned_responses_list(self):
        """Test GET /api/ops/canned-responses returns list"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/ops/canned-responses")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Canned responses returns {len(data)} template(s)")

    def test_canned_responses_crud(self):
        """Test CRUD operations for canned responses"""
        self._login()

        # Create
        response = self.session.post(
            f"{BASE_URL}/api/ops/canned-responses",
            json={
                "title": "TEST_Template",
                "body": "This is a test template body",
                "category": "general",
                "tags": ["test"],
            },
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        created = response.json()
        assert created["title"] == "TEST_Template"
        template_id = created["id"]
        print(f"✓ Created canned response: {template_id}")

        # Update
        response = self.session.put(
            f"{BASE_URL}/api/ops/canned-responses/{template_id}",
            json={"title": "TEST_Template_Updated"},
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        print("✓ Updated canned response")

        # Delete
        response = self.session.delete(f"{BASE_URL}/api/ops/canned-responses/{template_id}")
        assert response.status_code == 200, f"Delete failed: {response.text}"
        print("✓ Deleted canned response")

    # ── Performance Metrics Tests ─────────────────────────────

    def test_performance_metrics(self):
        """Test GET /api/ops/performance returns metrics"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/ops/performance")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "total_actions" in data
        assert "actions_today" in data
        assert "tasks_resolved" in data
        assert "tasks_active" in data
        assert "sla_breaches" in data
        assert "avg_actions_per_day" in data
        print(f"✓ Performance metrics: {data['total_actions']} total actions, {data['tasks_resolved']} resolved")

    # ── Task Claiming Tests ───────────────────────────────────

    def test_task_claim_invalid_type(self):
        """Test POST /api/ops/tasks/claim with invalid task type"""
        self._login()
        response = self.session.post(
            f"{BASE_URL}/api/ops/tasks/claim",
            json={"task_type": "invalid_type", "task_id": "test-123"},
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Task claim rejects invalid task type")

    def test_task_claim_not_found(self):
        """Test POST /api/ops/tasks/claim with non-existent task"""
        self._login()
        response = self.session.post(
            f"{BASE_URL}/api/ops/tasks/claim",
            json={"task_type": "support", "task_id": "nonexistent-task-id"},
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Task claim returns 404 for non-existent task")

    # ── Customer Context Tests ────────────────────────────────

    def test_customer_context(self):
        """Test GET /api/ops/customer-context/{user_id} returns consolidated view"""
        self._login()
        # Use the admin's own user_id for testing
        response = self.session.get(f"{BASE_URL}/api/ops/customer-context/{self.user_id}")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "user" in data
        assert "subscription" in data
        assert "estates" in data
        assert "beneficiaries" in data
        assert "documents_count" in data
        assert "recent_support" in data
        assert "recent_dts" in data
        assert "recent_activity" in data
        print(f"✓ Customer context returns consolidated view for user {self.user_id}")

    def test_customer_context_not_found(self):
        """Test GET /api/ops/customer-context with non-existent user"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/ops/customer-context/nonexistent-user-id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Customer context returns 404 for non-existent user")

    # ── Bulk Operations Tests ─────────────────────────────────

    def test_export_users_csv(self):
        """Test GET /api/admin/export/users returns CSV"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/admin/export/users")
        assert response.status_code == 200, f"Failed: {response.text}"
        assert "text/csv" in response.headers.get("content-type", "")
        assert "attachment" in response.headers.get("content-disposition", "")
        # Check CSV has header row
        content = response.text
        assert "id,email,name,role" in content
        print("✓ Export users CSV works correctly")

    def test_export_subscriptions_csv(self):
        """Test GET /api/admin/export/subscriptions returns CSV"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/admin/export/subscriptions")
        assert response.status_code == 200, f"Failed: {response.text}"
        assert "text/csv" in response.headers.get("content-type", "")
        print("✓ Export subscriptions CSV works correctly")

    # ── Subscription Plans with tier_features ─────────────────

    def test_subscription_plans_tier_features(self):
        """Test GET /api/subscriptions/plans returns tier_features field"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "plans" in data
        assert "tier_features" in data, "tier_features field missing from plans response"
        tier_features = data["tier_features"]
        assert isinstance(tier_features, dict)
        # Should have features for each tier
        expected_tiers = ["premium", "standard", "base"]
        for tier in expected_tiers:
            assert tier in tier_features, f"Missing tier: {tier}"
            assert isinstance(tier_features[tier], list)
        print(f"✓ Subscription plans include tier_features: {list(tier_features.keys())}")

    # ── Escalations Tests ─────────────────────────────────────

    def test_escalations_list(self):
        """Test GET /api/ops/escalations returns list"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/ops/escalations")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Escalations list returns {len(data)} item(s)")

    def test_escalation_crud_and_veto(self):
        """Test escalation create, resolve, and veto flow"""
        self._login()

        # Create escalation
        response = self.session.post(
            f"{BASE_URL}/api/ops/escalations",
            json={
                "subject": "TEST_Escalation",
                "description": "Test escalation for automated testing",
                "priority": "normal",
                "related_type": "support",
                "related_id": "",
            },
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        created = response.json()
        escalation_id = created["id"]
        assert created["status"] == "open"
        print(f"✓ Created escalation: {escalation_id}")

        # Resolve escalation (founder can resolve)
        response = self.session.put(
            f"{BASE_URL}/api/ops/escalations/{escalation_id}/resolve",
            json={"resolution_note": "Resolved by automated test"},
        )
        assert response.status_code == 200, f"Resolve failed: {response.text}"
        print("✓ Resolved escalation")

        # Veto the resolution (founder only)
        response = self.session.put(
            f"{BASE_URL}/api/ops/escalations/{escalation_id}/veto",
            json={"veto_note": "Vetoed by automated test"},
        )
        assert response.status_code == 200, f"Veto failed: {response.text}"
        result = response.json()
        assert result["vetoed"] is True
        print("✓ Vetoed escalation resolution")

        # Verify escalation is now open again
        response = self.session.get(f"{BASE_URL}/api/ops/escalations")
        assert response.status_code == 200
        escalations = response.json()
        test_esc = next((e for e in escalations if e["id"] == escalation_id), None)
        assert test_esc is not None
        assert test_esc["status"] == "open"
        assert test_esc["vetoed"] is True
        print("✓ Escalation reopened after veto")

    # ── SLA Config Tests ──────────────────────────────────────

    def test_sla_config(self):
        """Test GET /api/ops/sla-config returns SLA configuration"""
        self._login()
        response = self.session.get(f"{BASE_URL}/api/ops/sla-config")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "sla_hours" in data
        sla_hours = data["sla_hours"]
        expected_types = ["support", "dts", "tvt", "milestone", "emergency", "p1", "verification"]
        for task_type in expected_types:
            assert task_type in sla_hours, f"Missing SLA for: {task_type}"
        print(f"✓ SLA config returns hours for {len(sla_hours)} task types")

    # ── Auth Required Tests ───────────────────────────────────

    def test_ip_whitelist_requires_auth(self):
        """Test IP whitelist endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/ip-whitelist")
        assert response.status_code in (401, 403)
        print("✓ IP whitelist requires authentication")

    def test_scoped_admins_requires_auth(self):
        """Test scoped admins endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/scoped-admins")
        assert response.status_code in (401, 403)
        print("✓ Scoped admins requires authentication")

    def test_maintenance_mode_requires_auth(self):
        """Test maintenance mode endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/maintenance-mode")
        assert response.status_code in (401, 403)
        print("✓ Maintenance mode requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
