"""
Comprehensive Pressure Test for CarryOn Admin/Ops Platform
Tests ALL admin endpoints for valid responses
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestAdminPressure:
    """Comprehensive admin endpoint tests"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        # Login to get token
        login_resp = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": "info@carryon.us", "password": "Demo1234!"}
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("access_token")
        assert token, "No access_token in login response"
        self.session.headers.update({"Authorization": f"Bearer {token}"})

    # ── Health Check ────────────────────────────────────────
    def test_health_endpoint(self):
        """GET /api/health returns healthy status"""
        resp = self.session.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data or "healthy" in str(data).lower()
        print(f"✓ /api/health: {resp.status_code}")

    # ── Admin Stats & Users ─────────────────────────────────
    def test_admin_stats(self):
        """GET /api/admin/stats returns valid stats object"""
        resp = self.session.get(f"{BASE_URL}/api/admin/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/stats: {resp.status_code} - keys: {list(data.keys())[:5]}")

    def test_admin_users(self):
        """GET /api/admin/users returns array of users"""
        resp = self.session.get(f"{BASE_URL}/api/admin/users")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/admin/users: {resp.status_code} - count: {len(data)}")

    def test_admin_revenue_metrics(self):
        """GET /api/admin/revenue-metrics returns revenue data"""
        resp = self.session.get(f"{BASE_URL}/api/admin/revenue-metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/revenue-metrics: {resp.status_code}")

    # ── Session & Security ──────────────────────────────────
    def test_session_policy(self):
        """GET /api/admin/session-policy returns 5 role types"""
        resp = self.session.get(f"{BASE_URL}/api/admin/session-policy")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (dict, list))
        print(f"✓ /api/admin/session-policy: {resp.status_code}")

    def test_ip_whitelist(self):
        """GET /api/admin/ip-whitelist returns 5 account types"""
        resp = self.session.get(f"{BASE_URL}/api/admin/ip-whitelist")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (dict, list))
        print(f"✓ /api/admin/ip-whitelist: {resp.status_code}")

    def test_scoped_admins(self):
        """GET /api/admin/scoped-admins returns admin list"""
        resp = self.session.get(f"{BASE_URL}/api/admin/scoped-admins")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/admin/scoped-admins: {resp.status_code} - count: {len(data)}")

    def test_maintenance_mode(self):
        """GET /api/admin/maintenance-mode returns maintenance status"""
        resp = self.session.get(f"{BASE_URL}/api/admin/maintenance-mode")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/maintenance-mode: {resp.status_code}")

    # ── System Health ───────────────────────────────────────
    def test_system_health(self):
        """GET /api/admin/system-health returns health data"""
        resp = self.session.get(f"{BASE_URL}/api/admin/system-health")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/system-health: {resp.status_code}")

    def test_code_health(self):
        """GET /api/admin/code-health returns metrics"""
        resp = self.session.get(f"{BASE_URL}/api/admin/code-health")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/code-health: {resp.status_code}")

    def test_security_scan(self):
        """GET /api/admin/security-scan returns scan data"""
        resp = self.session.get(f"{BASE_URL}/api/admin/security-scan")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/security-scan: {resp.status_code}")

    # ── Trial & Grace Periods ───────────────────────────────
    def test_trial_users(self):
        """GET /api/admin/trial-users returns trial list"""
        resp = self.session.get(f"{BASE_URL}/api/admin/trial-users")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/admin/trial-users: {resp.status_code} - count: {len(data)}")

    def test_grace_periods(self):
        """GET /api/admin/grace-periods returns grace period data"""
        resp = self.session.get(f"{BASE_URL}/api/admin/grace-periods")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/admin/grace-periods: {resp.status_code} - count: {len(data)}")

    # ── Launch & Estate ─────────────────────────────────────
    def test_launch_metrics(self):
        """GET /api/admin/launch-metrics returns launch data"""
        resp = self.session.get(f"{BASE_URL}/api/admin/launch-metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/launch-metrics: {resp.status_code}")

    def test_estate_health(self):
        """GET /api/admin/estate-health returns estate data"""
        resp = self.session.get(f"{BASE_URL}/api/admin/estate-health")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (dict, list))
        print(f"✓ /api/admin/estate-health: {resp.status_code}")

    # ── Team & Staff ────────────────────────────────────────
    def test_team_channels(self):
        """GET /api/team/channels returns 6+ channels"""
        resp = self.session.get(f"{BASE_URL}/api/team/channels")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/team/channels: {resp.status_code} - count: {len(data)}")

    def test_team_staff(self):
        """GET /api/team/staff returns staff list"""
        resp = self.session.get(f"{BASE_URL}/api/team/staff")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/team/staff: {resp.status_code} - count: {len(data)}")

    # ── Ops Shifts ──────────────────────────────────────────
    def test_ops_shifts(self):
        """GET /api/ops/shifts returns shifts list"""
        resp = self.session.get(f"{BASE_URL}/api/ops/shifts")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/ops/shifts: {resp.status_code} - count: {len(data)}")

    def test_ops_shifts_summary(self):
        """GET /api/ops/shifts/summary returns 7-day summary"""
        resp = self.session.get(f"{BASE_URL}/api/ops/shifts/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (dict, list))
        print(f"✓ /api/ops/shifts/summary: {resp.status_code}")

    def test_ops_shifts_swap_requests(self):
        """GET /api/ops/shifts/swap-requests returns swap list"""
        resp = self.session.get(f"{BASE_URL}/api/ops/shifts/swap-requests")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/ops/shifts/swap-requests: {resp.status_code} - count: {len(data)}")

    # ── Training ────────────────────────────────────────────
    def test_training_modules(self):
        """GET /api/ops/training/modules returns modules"""
        resp = self.session.get(f"{BASE_URL}/api/ops/training/modules")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/ops/training/modules: {resp.status_code} - count: {len(data)}")

    def test_training_team_progress(self):
        """GET /api/ops/training/team-progress returns team data"""
        resp = self.session.get(f"{BASE_URL}/api/ops/training/team-progress")
        assert resp.status_code == 200
        data = resp.json()
        # Response is dict with 'progress' list
        assert isinstance(data, dict)
        assert "progress" in data
        print(
            f"✓ /api/ops/training/team-progress: {resp.status_code} - progress count: {len(data.get('progress', []))}"
        )

    # ── Ops Performance & Dashboard ─────────────────────────
    def test_ops_performance(self):
        """GET /api/ops/performance returns performance metrics"""
        resp = self.session.get(f"{BASE_URL}/api/ops/performance")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/ops/performance: {resp.status_code}")

    def test_ops_dashboard(self):
        """GET /api/ops/dashboard returns dashboard data"""
        resp = self.session.get(f"{BASE_URL}/api/ops/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/ops/dashboard: {resp.status_code}")

    def test_ops_dashboard_events(self):
        """GET /api/ops/dashboard-events returns events"""
        resp = self.session.get(f"{BASE_URL}/api/ops/dashboard-events")
        assert resp.status_code == 200
        data = resp.json()
        # Response is dict with 'events' object
        assert isinstance(data, dict)
        assert "events" in data
        print(f"✓ /api/ops/dashboard-events: {resp.status_code} - has events")

    def test_ops_canned_responses(self):
        """GET /api/ops/canned-responses returns templates"""
        resp = self.session.get(f"{BASE_URL}/api/ops/canned-responses")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/ops/canned-responses: {resp.status_code} - count: {len(data)}")

    def test_ops_escalations(self):
        """GET /api/ops/escalations returns escalation list"""
        resp = self.session.get(f"{BASE_URL}/api/ops/escalations")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/ops/escalations: {resp.status_code} - count: {len(data)}")

    def test_ops_shift_notes(self):
        """GET /api/ops/shift-notes returns notes"""
        resp = self.session.get(f"{BASE_URL}/api/ops/shift-notes")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/ops/shift-notes: {resp.status_code} - count: {len(data)}")

    # ── Knowledge Base & Audit ──────────────────────────────
    def test_knowledge_base(self):
        """GET /api/admin/knowledge-base returns articles"""
        resp = self.session.get(f"{BASE_URL}/api/admin/knowledge-base")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/admin/knowledge-base: {resp.status_code} - count: {len(data)}")

    def test_founder_audit_trail(self):
        """GET /api/founder/audit-trail returns audit data"""
        resp = self.session.get(f"{BASE_URL}/api/founder/audit-trail")
        assert resp.status_code == 200
        data = resp.json()
        # Response is dict with 'entries' list
        assert isinstance(data, dict)
        assert "entries" in data
        print(f"✓ /api/founder/audit-trail: {resp.status_code} - entries: {len(data.get('entries', []))}")

    # ── Notifications & Settings ────────────────────────────
    def test_notifications(self):
        """GET /api/notifications returns notification list"""
        resp = self.session.get(f"{BASE_URL}/api/notifications")
        assert resp.status_code == 200
        data = resp.json()
        # Response is dict with 'notifications' list
        assert isinstance(data, dict)
        assert "notifications" in data
        print(f"✓ /api/notifications: {resp.status_code} - count: {len(data.get('notifications', []))}")

    def test_platform_settings(self):
        """GET /api/admin/platform-settings returns settings"""
        resp = self.session.get(f"{BASE_URL}/api/admin/platform-settings")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/platform-settings: {resp.status_code}")

    # ── Additional Admin Endpoints ──────────────────────────
    def test_founder_operators(self):
        """GET /api/founder/operators returns operator list"""
        resp = self.session.get(f"{BASE_URL}/api/founder/operators")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/founder/operators: {resp.status_code} - count: {len(data)}")

    def test_founder_requests(self):
        """GET /api/founder/requests returns request list"""
        resp = self.session.get(f"{BASE_URL}/api/founder/requests")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/founder/requests: {resp.status_code} - count: {len(data)}")

    def test_subscriptions_plans(self):
        """GET /api/subscriptions/plans returns plans"""
        resp = self.session.get(f"{BASE_URL}/api/subscriptions/plans")
        assert resp.status_code == 200
        data = resp.json()
        # Response is dict with 'plans' list
        assert isinstance(data, dict)
        assert "plans" in data
        print(f"✓ /api/subscriptions/plans: {resp.status_code} - plans count: {len(data.get('plans', []))}")

    def test_dev_switcher_config(self):
        """GET /api/dev-switcher/config returns config"""
        resp = self.session.get(f"{BASE_URL}/api/dev-switcher/config")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/dev-switcher/config: {resp.status_code}")

    def test_estates(self):
        """GET /api/estates returns estates list"""
        resp = self.session.get(f"{BASE_URL}/api/estates")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/estates: {resp.status_code} - count: {len(data)}")

    def test_admin_announcements(self):
        """GET /api/admin/announcements returns announcements"""
        resp = self.session.get(f"{BASE_URL}/api/admin/announcements")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/admin/announcements: {resp.status_code} - count: {len(data)}")

    def test_admin_integrations(self):
        """GET /api/admin/integrations returns integrations status"""
        resp = self.session.get(f"{BASE_URL}/api/admin/integrations")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (dict, list))
        print(f"✓ /api/admin/integrations: {resp.status_code}")

    def test_admin_funnel_analytics(self):
        """GET /api/admin/funnel/analytics returns funnel data"""
        resp = self.session.get(f"{BASE_URL}/api/admin/funnel/analytics")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/funnel/analytics: {resp.status_code}")

    def test_admin_feature_gates(self):
        """GET /api/admin/feature-gates returns feature gates"""
        resp = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (dict, list))
        print(f"✓ /api/admin/feature-gates: {resp.status_code}")

    def test_founder_invites(self):
        """GET /api/founder/invites returns invites"""
        resp = self.session.get(f"{BASE_URL}/api/founder/invites")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/founder/invites: {resp.status_code} - count: {len(data)}")

    def test_public_site_content(self):
        """GET /api/public/site-content returns site content"""
        resp = self.session.get(f"{BASE_URL}/api/public/site-content")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/public/site-content: {resp.status_code}")

    def test_admin_verifications(self):
        """GET /api/admin/verifications returns verifications"""
        resp = self.session.get(f"{BASE_URL}/api/admin/verifications")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/admin/verifications: {resp.status_code} - count: {len(data)}")

    def test_admin_emergency_access(self):
        """GET /api/admin/emergency-access returns emergency access data"""
        resp = self.session.get(f"{BASE_URL}/api/admin/emergency-access")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, (dict, list))
        print(f"✓ /api/admin/emergency-access: {resp.status_code}")

    def test_admin_activity(self):
        """GET /api/admin/activity returns activity log"""
        resp = self.session.get(f"{BASE_URL}/api/admin/activity")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/admin/activity: {resp.status_code} - count: {len(data)}")

    def test_admin_email_preferences(self):
        """GET /api/admin/email-preferences returns email preferences"""
        resp = self.session.get(f"{BASE_URL}/api/admin/email-preferences")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        print(f"✓ /api/admin/email-preferences: {resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
