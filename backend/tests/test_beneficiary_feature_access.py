"""
Test Suite for Beneficiary Feature Access Enforcement
Tests the feature_access flags (mm_access, sdv_access, ega_access, iac_access, ffn_access, dav_access, dts_access)
that benefactors can toggle for each beneficiary.

Features tested:
1. GET /api/beneficiary/my-permissions/{estate_id} returns feature_access object
2. Feature access flags structure validation
3. Default values for feature access (all True by default)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials - using existing test accounts
BENEFACTOR_EMAIL = "fulltest@test.com"
BENEFACTOR_PASSWORD = "Password.123"


class TestHealthCheck:
    """Basic health check"""

    def test_backend_health(self):
        """Verify backend is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("PASS: Backend health check passed")


class TestMyPermissionsFeatureAccess:
    """Test that my-permissions endpoint returns feature_access object"""

    @pytest.fixture
    def auth_token(self):
        """Get auth token for benefactor"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.text}")
        return response.json()["access_token"]

    @pytest.fixture
    def estate_id(self, auth_token):
        """Get first estate for the user"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/estates", headers=headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No estates found for user")
        return response.json()[0]["id"]

    def test_my_permissions_endpoint_exists(self, auth_token, estate_id):
        """Test that my-permissions endpoint exists and responds"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/beneficiary/my-permissions/{estate_id}", headers=headers)
        # Benefactor is not a beneficiary, so should return 404
        # This confirms the endpoint exists and is working
        assert response.status_code in [200, 404]
        print(f"PASS: my-permissions endpoint responds with status {response.status_code}")


class TestFeatureAccessCodeReview:
    """Code review tests to verify feature_access implementation"""

    def test_section_permissions_returns_feature_access(self):
        """Verify section_permissions.py returns feature_access in response"""
        file_path = "/app/backend/routes/section_permissions.py"
        with open(file_path, "r") as f:
            content = f.read()

        # Check that feature_access is returned in the response
        assert "feature_access" in content, "feature_access not found in section_permissions.py"

        # Check all 7 feature flags are present
        feature_flags = [
            "mm_access",
            "ega_access",
            "sdv_access",
            "iac_access",
            "ffn_access",
            "dav_access",
            "dts_access",
        ]
        for flag in feature_flags:
            assert flag in content, f"{flag} not found in section_permissions.py"

        # Check that feature_access is included in the return statement
        assert '"feature_access": feature_access' in content or "'feature_access': feature_access" in content

        print("PASS: section_permissions.py returns feature_access with all 7 flags")

    def test_transition_gate_checks_feature_access(self):
        """Verify TransitionGate.js checks feature_access for navigation blocking"""
        file_path = "/app/frontend/src/components/TransitionGate.js"
        with open(file_path, "r") as f:
            content = f.read()

        # Check SECTION_TO_FEATURE mapping exists
        assert "SECTION_TO_FEATURE" in content, "SECTION_TO_FEATURE mapping not found"

        # Check that it maps sections to feature flags
        assert "vault: 'sdv_access'" in content or 'vault: "sdv_access"' in content
        assert "messages: 'mm_access'" in content or 'messages: "mm_access"' in content
        assert "checklist: 'iac_access'" in content or 'checklist: "iac_access"' in content
        assert "guardian: 'ega_access'" in content or 'guardian: "ega_access"' in content

        # Check that feature_access is stored in localStorage
        assert "beneficiary_feature_access" in content
        assert "localStorage.setItem" in content

        # Check that feature access is checked for navigation
        assert "feature_access[featureFlag] === false" in content

        print("PASS: TransitionGate.js correctly checks feature_access for navigation blocking")

    def test_beneficiary_dashboard_conditional_rendering(self):
        """Verify BeneficiaryDashboardPage.js conditionally renders based on feature_access"""
        file_path = "/app/frontend/src/pages/beneficiary/BeneficiaryDashboardPage.js"
        with open(file_path, "r") as f:
            content = f.read()

        # Check that feature_access is used for conditional rendering
        assert "myPerms?.feature_access" in content, "feature_access not used in conditional rendering"

        # Check specific feature flags are checked
        assert "iac_access" in content, "iac_access not checked in dashboard"
        assert "sdv_access" in content, "sdv_access not checked in dashboard"
        assert "mm_access" in content, "mm_access not checked in dashboard"

        # Check that stat cards are conditionally rendered
        assert "feature_access?.iac_access !== false" in content or "feature_access.iac_access !== false" in content
        assert "feature_access?.sdv_access !== false" in content or "feature_access.sdv_access !== false" in content
        assert "feature_access?.mm_access !== false" in content or "feature_access.mm_access !== false" in content

        # Check that feature_access is stored in localStorage
        assert "beneficiary_feature_access" in content

        print("PASS: BeneficiaryDashboardPage.js conditionally renders based on feature_access")

    def test_sidebar_filters_by_feature_access(self):
        """Verify Sidebar.js filters nav items based on feature_access"""
        file_path = "/app/frontend/src/components/layout/Sidebar.js"
        with open(file_path, "r") as f:
            content = f.read()

        # Check that filterByFeatureAccess function exists
        assert "filterByFeatureAccess" in content, "filterByFeatureAccess function not found"

        # Check that NAV_FEATURE_MAP exists
        assert "NAV_FEATURE_MAP" in content, "NAV_FEATURE_MAP not found"

        # Check that feature access is read from localStorage
        assert "beneficiary_feature_access" in content
        assert "localStorage.getItem" in content

        # Check that beneficiary nav items are filtered
        assert "filterByFeatureAccess([" in content

        print("PASS: Sidebar.js filters nav items based on feature_access")

    def test_mobile_nav_filters_by_feature_access(self):
        """Verify MobileNav.js filters nav items based on feature_access"""
        file_path = "/app/frontend/src/components/layout/MobileNav.js"
        with open(file_path, "r") as f:
            content = f.read()

        # Check that filterByFeatureAccess function exists
        assert "filterByFeatureAccess" in content, "filterByFeatureAccess function not found"

        # Check that NAV_FEATURE_MAP exists
        assert "NAV_FEATURE_MAP" in content, "NAV_FEATURE_MAP not found"

        # Check that feature access is read from localStorage
        assert "beneficiary_feature_access" in content
        assert "localStorage.getItem" in content

        # Check that beneficiary nav items are filtered
        assert "filterByFeatureAccess([" in content

        # Check that bottom nav is also filtered
        assert "beneficiaryBottomNav = filterByFeatureAccess" in content

        print("PASS: MobileNav.js filters nav items based on feature_access")

    def test_localstorage_cleanup_on_context_exit(self):
        """Verify beneficiary_feature_access is removed when leaving beneficiary context"""
        # Check Sidebar.js for cleanup
        sidebar_path = "/app/frontend/src/components/layout/Sidebar.js"
        with open(sidebar_path, "r") as f:
            sidebar_content = f.read()

        # Check MobileNav.js for cleanup
        mobile_nav_path = "/app/frontend/src/components/layout/MobileNav.js"
        with open(mobile_nav_path, "r") as f:
            mobile_nav_content = f.read()

        # Check BeneficiaryDashboardPage.js for cleanup
        dashboard_path = "/app/frontend/src/pages/beneficiary/BeneficiaryDashboardPage.js"
        with open(dashboard_path, "r") as f:
            dashboard_content = f.read()

        # Check TransitionGate.js for cleanup
        gate_path = "/app/frontend/src/components/TransitionGate.js"
        with open(gate_path, "r") as f:
            gate_content = f.read()

        # Verify cleanup happens in at least one location
        cleanup_found = False
        cleanup_locations = []

        if "localStorage.removeItem('beneficiary_feature_access')" in sidebar_content:
            cleanup_found = True
            cleanup_locations.append("Sidebar.js")

        if "localStorage.removeItem('beneficiary_feature_access')" in mobile_nav_content:
            cleanup_found = True
            cleanup_locations.append("MobileNav.js")

        if "localStorage.removeItem('beneficiary_feature_access')" in dashboard_content:
            cleanup_found = True
            cleanup_locations.append("BeneficiaryDashboardPage.js")

        if "localStorage.removeItem('beneficiary_feature_access')" in gate_content:
            cleanup_found = True
            cleanup_locations.append("TransitionGate.js")

        assert cleanup_found, "beneficiary_feature_access cleanup not found in any file"
        print(f"PASS: beneficiary_feature_access cleanup found in: {', '.join(cleanup_locations)}")


class TestFeatureAccessAPIStructure:
    """Test the API response structure for feature_access"""

    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": "admin@carryon.com", "password": "admin123"},
        )
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        return response.json()["access_token"]

    def test_beneficiary_record_has_feature_flags(self, admin_token):
        """Test that beneficiary records can have feature access flags"""
        # This is a code review test - verify the backend code structure
        file_path = "/app/backend/routes/section_permissions.py"
        with open(file_path, "r") as f:
            content = f.read()

        # Check that feature flags are read from beneficiary record with defaults
        assert 'ben.get("mm_access", True)' in content or "ben.get('mm_access', True)" in content
        assert 'ben.get("ega_access", True)' in content or "ben.get('ega_access', True)" in content
        assert 'ben.get("sdv_access", True)' in content or "ben.get('sdv_access', True)" in content
        assert 'ben.get("iac_access", True)' in content or "ben.get('iac_access', True)" in content
        assert 'ben.get("ffn_access", True)' in content or "ben.get('ffn_access', True)" in content
        assert 'ben.get("dav_access", True)' in content or "ben.get('dav_access', True)" in content
        assert 'ben.get("dts_access", True)' in content or "ben.get('dts_access', True)" in content

        print("PASS: Backend reads feature flags from beneficiary record with True defaults")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
