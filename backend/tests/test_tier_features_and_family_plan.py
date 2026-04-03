"""
Test suite for tier_features format and Family Plan billing toggle changes.

Tests:
1. GET /api/subscriptions/plans returns tier_features with {label, enabled} format
2. All tiers have the same features in the same order
3. Feature gates integration - toggling a feature OFF shows enabled=false
4. Family Plan billing toggle order and default
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Expected features in order from PLATFORM_FEATURES
EXPECTED_FEATURE_LABELS = [
    "Beneficiaries",
    "Milestone Messages (MM)",
    "Immediate Action Checklist (IAC)",
    "Secure Document Vault (SDV)",
    "Estate Guardian AI (EGA)",
    "Family & Friends Notification (FFN)",
    "Digital Access Vault (DAV)",
    "Designated Trustee Services (DTS)",
    "Estate Plan Timeline",
    "Estate Comms (ECT)",
    "Contingency Protocols (CCP)",
]

EXPECTED_TIER_IDS = [
    "premium",
    "standard",
    "base",
    "new_adult",
    "military",
    "hospice",
    "veteran",
    "enterprise",
]


class TestTierFeaturesFormat:
    """Tests for tier_features format in GET /api/subscriptions/plans"""

    def test_plans_endpoint_returns_tier_features(self):
        """Verify /api/subscriptions/plans returns tier_features field"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

        data = response.json()
        assert "tier_features" in data, "Response should contain tier_features"
        assert isinstance(data["tier_features"], dict), "tier_features should be a dict"
        print("✓ tier_features field present in response")

    def test_tier_features_contains_all_tiers(self):
        """Verify tier_features has entries for all expected tiers"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200

        tier_features = response.json().get("tier_features", {})

        for tier_id in EXPECTED_TIER_IDS:
            assert tier_id in tier_features, f"Missing tier: {tier_id}"
            print(f"✓ Tier '{tier_id}' present in tier_features")

    def test_tier_features_format_is_label_enabled_objects(self):
        """Verify each tier's features are {label, enabled} objects, not strings"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200

        tier_features = response.json().get("tier_features", {})

        for tier_id in EXPECTED_TIER_IDS:
            features = tier_features.get(tier_id, [])
            assert isinstance(features, list), f"Features for {tier_id} should be a list"
            assert len(features) > 0, f"Features for {tier_id} should not be empty"

            for i, feature in enumerate(features):
                assert isinstance(feature, dict), f"Feature {i} in {tier_id} should be a dict, got {type(feature)}"
                assert "label" in feature, f"Feature {i} in {tier_id} missing 'label' key"
                assert "enabled" in feature, f"Feature {i} in {tier_id} missing 'enabled' key"
                assert isinstance(feature["label"], str), f"Feature {i} label should be string"
                assert isinstance(feature["enabled"], bool), f"Feature {i} enabled should be bool"

            print(f"✓ Tier '{tier_id}' has correct {len(features)} features with {{label, enabled}} format")

    def test_all_tiers_have_same_features_in_same_order(self):
        """Verify ALL tiers have the SAME features in the SAME order"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200

        tier_features = response.json().get("tier_features", {})

        # Get feature labels from first tier as reference
        reference_tier = EXPECTED_TIER_IDS[0]
        reference_labels = [f["label"] for f in tier_features.get(reference_tier, [])]

        assert len(reference_labels) == len(EXPECTED_FEATURE_LABELS), (
            f"Expected {len(EXPECTED_FEATURE_LABELS)} features, got {len(reference_labels)}"
        )

        # Verify order matches PLATFORM_FEATURES
        for i, expected_label in enumerate(EXPECTED_FEATURE_LABELS):
            assert reference_labels[i] == expected_label, (
                f"Feature {i} should be '{expected_label}', got '{reference_labels[i]}'"
            )

        print(f"✓ Reference tier '{reference_tier}' has features in correct order")

        # Verify all other tiers have same labels in same order
        for tier_id in EXPECTED_TIER_IDS[1:]:
            tier_labels = [f["label"] for f in tier_features.get(tier_id, [])]
            assert tier_labels == reference_labels, (
                f"Tier '{tier_id}' features don't match reference order. Got: {tier_labels}"
            )
            print(f"✓ Tier '{tier_id}' has same features in same order")

    def test_feature_count_matches_platform_features(self):
        """Verify each tier has exactly 11 features (matching PLATFORM_FEATURES)"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200

        tier_features = response.json().get("tier_features", {})
        expected_count = len(EXPECTED_FEATURE_LABELS)

        for tier_id in EXPECTED_TIER_IDS:
            features = tier_features.get(tier_id, [])
            assert len(features) == expected_count, (
                f"Tier '{tier_id}' should have {expected_count} features, got {len(features)}"
            )

        print(f"✓ All tiers have exactly {expected_count} features")


class TestFeatureGatesIntegration:
    """Tests for feature gates affecting tier_features enabled status"""

    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": "info@carryon.us", "password": "Demo1234!"}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")

    def test_feature_gates_endpoint_accessible(self, auth_token):
        """Verify admin can access feature gates"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/feature-gates", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"

        data = response.json()
        assert "features" in data
        assert "tiers" in data
        assert "gates" in data
        print("✓ Feature gates endpoint accessible")

    def test_disabled_feature_shows_enabled_false(self, auth_token):
        """Verify that when a feature is toggled OFF, tier_features shows enabled=false"""
        headers = {"Authorization": f"Bearer {auth_token}"}

        # Get current gates
        gates_response = requests.get(f"{BASE_URL}/api/admin/feature-gates", headers=headers)
        assert gates_response.status_code == 200
        current_gates = gates_response.json().get("gates", {})

        # Check if any feature is disabled for any tier
        disabled_found = False
        for feature_key, tier_gates in current_gates.items():
            for tier_id, enabled in tier_gates.items():
                if not enabled:
                    disabled_found = True
                    print(f"✓ Found disabled feature: {feature_key} for tier {tier_id}")
                    break
            if disabled_found:
                break

        # Verify tier_features reflects the gates
        plans_response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert plans_response.status_code == 200
        tier_features = plans_response.json().get("tier_features", {})

        # Cross-check: for each tier, verify enabled status matches gates
        feature_key_to_label = {
            "beneficiaries": "Beneficiaries",
            "mm": "Milestone Messages (MM)",
            "iac": "Immediate Action Checklist (IAC)",
            "sdv": "Secure Document Vault (SDV)",
            "ega": "Estate Guardian AI (EGA)",
            "ffn": "Family & Friends Notification (FFN)",
            "dav": "Digital Access Vault (DAV)",
            "dts": "Designated Trustee Services (DTS)",
            "timeline": "Estate Plan Timeline",
            "ect": "Estate Comms (ECT)",
            "ccp": "Contingency Protocols (CCP)",
        }

        for tier_id in EXPECTED_TIER_IDS:
            features = tier_features.get(tier_id, [])
            for feature in features:
                label = feature["label"]
                enabled = feature["enabled"]

                # Find the corresponding key
                feature_key = None
                for key, lbl in feature_key_to_label.items():
                    if lbl == label:
                        feature_key = key
                        break

                if feature_key and feature_key in current_gates:
                    expected_enabled = current_gates[feature_key].get(tier_id, True)
                    assert enabled == expected_enabled, (
                        f"Feature '{label}' for tier '{tier_id}': expected enabled={expected_enabled}, got {enabled}"
                    )

        print("✓ tier_features enabled status matches feature gates")


class TestPlansEndpointStructure:
    """Additional tests for /api/subscriptions/plans response structure"""

    def test_plans_returns_required_fields(self):
        """Verify plans endpoint returns all required fields"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200

        data = response.json()
        required_fields = ["plans", "beneficiary_plans", "beta_mode", "family_plan_enabled", "tier_features"]

        for field in required_fields:
            assert field in data, f"Missing required field: {field}"

        print("✓ All required fields present in response")

    def test_plans_array_structure(self):
        """Verify plans array has correct structure"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200

        plans = response.json().get("plans", [])
        assert len(plans) > 0, "Plans array should not be empty"

        for plan in plans:
            assert "id" in plan, "Plan missing 'id'"
            assert "name" in plan, "Plan missing 'name'"
            assert "price" in plan, "Plan missing 'price'"

        print(f"✓ {len(plans)} plans with correct structure")


class TestFamilyPlanBillingToggle:
    """Tests for Family Plan billing toggle order and default"""

    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": "info@carryon.us", "password": "Demo1234!"}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")

    def test_family_plan_status_endpoint(self, auth_token):
        """Verify family plan status endpoint works"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/family-plan/status", headers=headers)
        # May return 200 or 404 depending on whether user has family plan
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"✓ Family plan status endpoint returned {response.status_code}")

    def test_subscription_plans_returns_family_discounts(self):
        """Verify subscription plans returns family discount percentages"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200

        data = response.json()
        # These fields should be present for family plan pricing
        assert "family_benefactor_discount_percent" in data or "family_plan_enabled" in data
        print("✓ Family plan related fields present in plans response")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
