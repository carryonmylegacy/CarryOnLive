"""
Estate Health Tab API Tests
Tests the GET /api/admin/estate-health endpoint and its response structure
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEstateHealthAPI:
    """Tests for the Estate Health analytics endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin and get token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "info@carryon.us",
            "password": "Demo1234!"
        })
        if login_response.status_code != 200:
            pytest.skip(f"Admin login failed: {login_response.status_code} - {login_response.text}")
        token = login_response.json().get("access_token")
        if not token:
            pytest.skip("No access_token in login response")
        return token
    
    def test_estate_health_endpoint_returns_200(self, admin_token):
        """Test that /api/admin/estate-health returns 200 for admin"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Estate health endpoint returns 200")
    
    def test_estate_health_response_has_summary(self, admin_token):
        """Test that response contains summary object with required fields"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "summary" in data, "Response must contain 'summary' key"
        summary = data["summary"]
        
        # Check required summary fields
        required_fields = [
            "total_estates", "total_beneficiaries", "linking_rate", 
            "completion_rate", "invitation_rate", "primary_designated_rate",
            "healthy_estates", "attention_estates", "critical_estates"
        ]
        for field in required_fields:
            assert field in summary, f"Summary must contain '{field}'"
            print(f"  - summary.{field}: {summary[field]}")
        
        print("PASS: Summary contains all required fields")
    
    def test_estate_health_response_has_estates_array(self, admin_token):
        """Test that response contains estates array"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "estates" in data, "Response must contain 'estates' key"
        assert isinstance(data["estates"], list), "Estates must be an array"
        print(f"PASS: Estates array found with {len(data['estates'])} estates")
    
    def test_estate_structure_has_required_fields(self, admin_token):
        """Test that each estate has the required structure"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data["estates"]) == 0:
            pytest.skip("No estates to validate structure")
        
        estate = data["estates"][0]
        
        # Check required estate fields
        assert "estate_id" in estate, "Estate must have estate_id"
        assert "estate_name" in estate, "Estate must have estate_name"
        assert "owner" in estate, "Estate must have owner"
        assert "beneficiaries" in estate, "Estate must have beneficiaries"
        assert "metrics" in estate, "Estate must have metrics"
        
        print(f"PASS: Estate structure valid - {estate['estate_name']}")
    
    def test_estate_metrics_has_health_score_and_status(self, admin_token):
        """Test that estate metrics contain health_score and health_status"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data["estates"]) == 0:
            pytest.skip("No estates to validate metrics")
        
        estate = data["estates"][0]
        metrics = estate["metrics"]
        
        assert "health_score" in metrics, "Metrics must have health_score"
        assert "health_status" in metrics, "Metrics must have health_status"
        assert isinstance(metrics["health_score"], (int, float)), "health_score must be numeric"
        assert 0 <= metrics["health_score"] <= 100, "health_score must be 0-100"
        assert metrics["health_status"] in ["healthy", "attention", "critical"], \
            f"health_status must be healthy/attention/critical, got {metrics['health_status']}"
        
        print(f"PASS: Estate metrics valid - score: {metrics['health_score']}, status: {metrics['health_status']}")
    
    def test_estate_beneficiaries_structure(self, admin_token):
        """Test beneficiary structure in estate response"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Find an estate with beneficiaries
        estate_with_bens = None
        for estate in data["estates"]:
            if len(estate.get("beneficiaries", [])) > 0:
                estate_with_bens = estate
                break
        
        if not estate_with_bens:
            pytest.skip("No estates with beneficiaries to validate")
        
        ben = estate_with_bens["beneficiaries"][0]
        
        # Check required beneficiary fields
        assert "id" in ben, "Beneficiary must have id"
        assert "is_linked" in ben, "Beneficiary must have is_linked"
        assert "is_stub" in ben, "Beneficiary must have is_stub"
        assert "invitation_status" in ben, "Beneficiary must have invitation_status"
        
        print(f"PASS: Beneficiary structure valid - {ben.get('name', 'Unknown')}")
    
    def test_estate_health_requires_admin_auth(self):
        """Test that endpoint requires admin authentication"""
        # Without token
        response = requests.get(f"{BASE_URL}/api/admin/estate-health")
        assert response.status_code in [401, 403], \
            f"Expected 401/403 without auth, got {response.status_code}"
        print("PASS: Endpoint requires authentication")
    
    def test_estate_health_summary_rates_are_percentages(self, admin_token):
        """Test that rates in summary are valid percentages"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        summary = data["summary"]
        
        rate_fields = ["linking_rate", "completion_rate", "invitation_rate", "primary_designated_rate"]
        for field in rate_fields:
            value = summary[field]
            assert isinstance(value, (int, float)), f"{field} must be numeric"
            assert 0 <= value <= 100, f"{field} must be 0-100, got {value}"
            print(f"  - {field}: {value}%")
        
        print("PASS: All rate fields are valid percentages")
    
    def test_estates_sorted_by_health_status(self, admin_token):
        """Test that estates are sorted: critical first, then attention, then healthy"""
        response = requests.get(
            f"{BASE_URL}/api/admin/estate-health",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data["estates"]) < 2:
            pytest.skip("Need at least 2 estates to verify sorting")
        
        statuses = [e["metrics"]["health_status"] for e in data["estates"]]
        order_map = {"critical": 0, "attention": 1, "healthy": 2}
        
        # Check that statuses are in non-decreasing order
        for i in range(len(statuses) - 1):
            current_order = order_map.get(statuses[i], 3)
            next_order = order_map.get(statuses[i + 1], 3)
            assert current_order <= next_order, \
                f"Estates not sorted correctly: {statuses[i]} before {statuses[i + 1]}"
        
        print(f"PASS: Estates sorted correctly by health status")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
