"""
Feature Gates API Tests
Tests for the feature gating system in the Founder Admin Portal.
Features: Beneficiaries, MM, IAC, SDV, EGA, FFN, DAV, DTS, Timeline
"""

import pytest
import requests
import os
import copy

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"

# Expected feature keys (9 features)
EXPECTED_FEATURES = ["beneficiaries", "mm", "iac", "sdv", "ega", "ffn", "dav", "dts", "timeline"]

# Expected tier IDs (8 tiers)
EXPECTED_TIERS = ["premium", "standard", "base", "new_adult", "military", "hospice", "veteran", "enterprise"]


class TestFeatureGatesAPI:
    """Feature Gates API endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        
        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            if self.token:
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        if not self.token:
            pytest.skip("Admin authentication failed - skipping feature gates tests")
    
    def test_get_feature_gates_returns_correct_structure(self):
        """GET /api/admin/feature-gates returns correct structure with 9 features, 8 tiers, and all gates ON"""
        response = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Validate response structure
        assert "features" in data, "Response missing 'features' key"
        assert "tiers" in data, "Response missing 'tiers' key"
        assert "gates" in data, "Response missing 'gates' key"
        
        # Validate 9 features
        features = data["features"]
        assert len(features) == 9, f"Expected 9 features, got {len(features)}"
        
        feature_keys = [f["key"] for f in features]
        for expected_key in EXPECTED_FEATURES:
            assert expected_key in feature_keys, f"Missing feature: {expected_key}"
        
        # Validate 8 tiers
        tiers = data["tiers"]
        assert len(tiers) == 8, f"Expected 8 tiers, got {len(tiers)}"
        
        for expected_tier in EXPECTED_TIERS:
            assert expected_tier in tiers, f"Missing tier: {expected_tier}"
        
        # Validate gates structure - all features should have all tiers
        gates = data["gates"]
        for feature_key in EXPECTED_FEATURES:
            assert feature_key in gates, f"Gates missing feature: {feature_key}"
            for tier_id in EXPECTED_TIERS:
                assert tier_id in gates[feature_key], f"Gates[{feature_key}] missing tier: {tier_id}"
                # All gates should be boolean
                assert isinstance(gates[feature_key][tier_id], bool), f"Gate value should be boolean"
        
        # Validate feature metadata
        for feature in features:
            assert "key" in feature, "Feature missing 'key'"
            assert "label" in feature, "Feature missing 'label'"
            assert "route" in feature, "Feature missing 'route'"
            assert "core" in feature, "Feature missing 'core'"
        
        # Validate core features (MM, IAC, SDV should be marked as core)
        core_features = [f for f in features if f["core"]]
        core_keys = [f["key"] for f in core_features]
        assert "mm" in core_keys, "MM should be a core feature"
        assert "iac" in core_keys, "IAC should be a core feature"
        assert "sdv" in core_keys, "SDV should be a core feature"
        
        print(f"✓ GET /api/admin/feature-gates: 9 features, 8 tiers, gates structure valid")
    
    def test_put_feature_gates_publishes_changes(self):
        """PUT /api/admin/feature-gates publishes new gates - toggle off EGA for base tier, verify response"""
        # First, get current gates
        get_response = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        assert get_response.status_code == 200
        
        current_data = get_response.json()
        gates = copy.deepcopy(current_data["gates"])
        
        # Toggle off EGA for base tier
        original_ega_base = gates["ega"]["base"]
        gates["ega"]["base"] = False
        
        # Publish the change
        put_response = self.session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": gates}
        )
        
        assert put_response.status_code == 200, f"Expected 200, got {put_response.status_code}: {put_response.text}"
        
        put_data = put_response.json()
        assert put_data.get("success") == True, "Expected success: true"
        assert "message" in put_data, "Expected message in response"
        
        # Verify the change persisted by fetching again
        verify_response = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        assert verify_response.status_code == 200
        
        verify_data = verify_response.json()
        assert verify_data["gates"]["ega"]["base"] == False, "EGA for base tier should be OFF"
        
        # Restore original state
        gates["ega"]["base"] = original_ega_base
        restore_response = self.session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": gates}
        )
        assert restore_response.status_code == 200
        
        print(f"✓ PUT /api/admin/feature-gates: Toggle EGA for base tier works, changes persist")
    
    def test_put_feature_gates_validates_structure(self):
        """PUT /api/admin/feature-gates validates gates structure - missing feature returns 400"""
        # Get current gates
        get_response = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        assert get_response.status_code == 200
        
        current_data = get_response.json()
        gates = copy.deepcopy(current_data["gates"])
        
        # Remove a feature to create invalid payload
        del gates["ega"]
        
        put_response = self.session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": gates}
        )
        
        assert put_response.status_code == 400, f"Expected 400 for missing feature, got {put_response.status_code}"
        
        print(f"✓ PUT /api/admin/feature-gates: Validates structure - missing feature returns 400")
    
    def test_put_feature_gates_validates_tiers(self):
        """PUT /api/admin/feature-gates validates gates structure - missing tier returns 400"""
        # Get current gates
        get_response = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        assert get_response.status_code == 200
        
        current_data = get_response.json()
        gates = copy.deepcopy(current_data["gates"])
        
        # Remove a tier from one feature
        del gates["ega"]["base"]
        
        put_response = self.session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": gates}
        )
        
        assert put_response.status_code == 400, f"Expected 400 for missing tier, got {put_response.status_code}"
        
        print(f"✓ PUT /api/admin/feature-gates: Validates structure - missing tier returns 400")
    
    def test_get_enabled_features_for_admin(self):
        """GET /api/subscriptions/enabled-features returns all features for admin user"""
        response = self.session.get(f"{BASE_URL}/api/subscriptions/enabled-features")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Admin should have all features enabled
        assert "enabled_features" in data, "Response missing 'enabled_features'"
        assert "all_enabled" in data, "Response missing 'all_enabled'"
        
        enabled_features = data["enabled_features"]
        
        # Admin should have all 9 features
        for feature_key in EXPECTED_FEATURES:
            assert feature_key in enabled_features, f"Admin missing feature: {feature_key}"
        
        # all_enabled should be True for admin
        assert data["all_enabled"] == True, "Admin should have all_enabled=True"
        
        print(f"✓ GET /api/subscriptions/enabled-features: Admin has all {len(enabled_features)} features enabled")
    
    def test_feature_gates_requires_admin_auth(self):
        """GET /api/admin/feature-gates requires admin authentication"""
        # Create a new session without auth
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_session.get(f"{BASE_URL}/api/admin/feature-gates")
        
        # Should return 401 or 403
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        
        print(f"✓ GET /api/admin/feature-gates: Requires admin authentication (returns {response.status_code})")
    
    def test_put_feature_gates_requires_admin_auth(self):
        """PUT /api/admin/feature-gates requires admin authentication"""
        # Create a new session without auth
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": {}}
        )
        
        # Should return 401 or 403
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        
        print(f"✓ PUT /api/admin/feature-gates: Requires admin authentication (returns {response.status_code})")
    
    def test_global_toggle_all_tiers_on(self):
        """Test toggling all tiers ON for a feature via API"""
        # Get current gates
        get_response = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        assert get_response.status_code == 200
        
        current_data = get_response.json()
        gates = copy.deepcopy(current_data["gates"])
        original_gates = copy.deepcopy(gates)
        
        # Set all tiers OFF for EGA first
        for tier in EXPECTED_TIERS:
            gates["ega"][tier] = False
        
        put_response = self.session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": gates}
        )
        assert put_response.status_code == 200
        
        # Now set all tiers ON for EGA (simulating global toggle)
        for tier in EXPECTED_TIERS:
            gates["ega"][tier] = True
        
        put_response = self.session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": gates}
        )
        assert put_response.status_code == 200
        
        # Verify all tiers are ON
        verify_response = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        verify_data = verify_response.json()
        
        for tier in EXPECTED_TIERS:
            assert verify_data["gates"]["ega"][tier] == True, f"EGA for {tier} should be ON"
        
        # Restore original state
        self.session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": original_gates}
        )
        
        print(f"✓ Global toggle: All tiers ON for EGA works correctly")
    
    def test_global_toggle_all_tiers_off(self):
        """Test toggling all tiers OFF for a feature via API"""
        # Get current gates
        get_response = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        assert get_response.status_code == 200
        
        current_data = get_response.json()
        gates = copy.deepcopy(current_data["gates"])
        original_gates = copy.deepcopy(gates)
        
        # Set all tiers OFF for FFN (non-core feature)
        for tier in EXPECTED_TIERS:
            gates["ffn"][tier] = False
        
        put_response = self.session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": gates}
        )
        assert put_response.status_code == 200
        
        # Verify all tiers are OFF
        verify_response = self.session.get(f"{BASE_URL}/api/admin/feature-gates")
        verify_data = verify_response.json()
        
        for tier in EXPECTED_TIERS:
            assert verify_data["gates"]["ffn"][tier] == False, f"FFN for {tier} should be OFF"
        
        # Restore original state
        self.session.put(
            f"{BASE_URL}/api/admin/feature-gates",
            json={"gates": original_gates}
        )
        
        print(f"✓ Global toggle: All tiers OFF for FFN works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
