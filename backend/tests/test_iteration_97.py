"""
Test file for iteration 97 - UI/UX batch changes
Tests subscription plans API and validates 'Will/Trust Wizard & Eternal Echo' removal
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestSubscriptionPlans:
    """Tests for subscription plans API"""
    
    def test_plans_api_returns_200(self):
        """Verify plans API is accessible"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        data = response.json()
        assert "plans" in data
        print(f"✅ Plans API returned {len(data['plans'])} plans")
    
    def test_premium_plan_no_wizard_eternal_echo(self):
        """Verify Premium plan does NOT have 'Will/Trust Wizard & Eternal Echo' text"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        data = response.json()
        
        premium_plan = None
        for plan in data.get("plans", []):
            if plan.get("name") == "Premium" or plan.get("id") == "premium":
                premium_plan = plan
                break
        
        assert premium_plan is not None, "Premium plan not found"
        
        features = premium_plan.get("features", [])
        features_text = " ".join(features)
        
        assert "Will/Trust Wizard" not in features_text, f"Found 'Will/Trust Wizard' in Premium features: {features}"
        assert "Eternal Echo" not in features_text, f"Found 'Eternal Echo' in Premium features: {features}"
        print(f"✅ Premium plan features: {features}")
    
    def test_all_plans_no_wizard_eternal_echo(self):
        """Verify NO plan has 'Will/Trust Wizard & Eternal Echo' text"""
        response = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert response.status_code == 200
        data = response.json()
        
        for plan in data.get("plans", []):
            features = plan.get("features", [])
            features_text = " ".join(features)
            
            assert "Will/Trust Wizard" not in features_text, f"Plan {plan.get('name')} has 'Will/Trust Wizard'"
            assert "Eternal Echo" not in features_text, f"Plan {plan.get('name')} has 'Eternal Echo'"
        
        print(f"✅ All {len(data['plans'])} plans verified - no Will/Trust Wizard or Eternal Echo text")


class TestHealthCheck:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        """Verify health endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"✅ Health check passed: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
