"""
Test xAI Credits Monitoring Feature
- GET /api/admin/xai-credits: Returns balance, warning_level, monthly spend, daily calls
- POST /api/admin/xai-credits/set-balance: Resets balance when user tops up credits
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestXAICreditsAPI:
    """Test xAI Credits monitoring endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        # Login as admin
        login_res = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.token = login_res.json().get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_get_xai_credits_returns_expected_fields(self):
        """GET /api/admin/xai-credits returns all expected fields"""
        res = requests.get(f"{BASE_URL}/api/admin/xai-credits", headers=self.headers)
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify all expected fields are present
        required_fields = [
            "initial_balance_usd",
            "total_spent_usd",
            "balance_usd",
            "warning_level",
            "month_spent_usd",
            "month_calls",
            "today_spent_usd",
            "today_calls",
            "daily_breakdown"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"xAI Credits data: balance_usd={data['balance_usd']}, warning_level={data['warning_level']}")
    
    def test_get_xai_credits_balance_is_numeric(self):
        """balance_usd should be a numeric value"""
        res = requests.get(f"{BASE_URL}/api/admin/xai-credits", headers=self.headers)
        assert res.status_code == 200
        data = res.json()
        
        assert isinstance(data["balance_usd"], (int, float)), "balance_usd should be numeric"
        assert isinstance(data["month_spent_usd"], (int, float)), "month_spent_usd should be numeric"
        assert isinstance(data["today_calls"], int), "today_calls should be int"
    
    def test_get_xai_credits_warning_level_valid(self):
        """warning_level should be one of: healthy, warning, critical"""
        res = requests.get(f"{BASE_URL}/api/admin/xai-credits", headers=self.headers)
        assert res.status_code == 200
        data = res.json()
        
        valid_levels = ["healthy", "warning", "critical"]
        assert data["warning_level"] in valid_levels, f"Invalid warning_level: {data['warning_level']}"
    
    def test_get_xai_credits_daily_breakdown_is_list(self):
        """daily_breakdown should be a list"""
        res = requests.get(f"{BASE_URL}/api/admin/xai-credits", headers=self.headers)
        assert res.status_code == 200
        data = res.json()
        
        assert isinstance(data["daily_breakdown"], list), "daily_breakdown should be a list"
        
        # If there are entries, check structure
        if data["daily_breakdown"]:
            entry = data["daily_breakdown"][0]
            assert "date" in entry, "daily_breakdown entry missing 'date'"
            assert "cost" in entry, "daily_breakdown entry missing 'cost'"
            assert "calls" in entry, "daily_breakdown entry missing 'calls'"
    
    def test_set_balance_requires_balance_usd(self):
        """POST /api/admin/xai-credits/set-balance requires balance_usd"""
        # Test without balance_usd
        res = requests.post(
            f"{BASE_URL}/api/admin/xai-credits/set-balance",
            headers=self.headers,
            json={}
        )
        assert res.status_code == 422, f"Should return 422 for missing balance_usd, got {res.status_code}"
    
    def test_set_balance_with_valid_amount(self):
        """POST /api/admin/xai-credits/set-balance accepts valid balance"""
        # Set balance to $500
        res = requests.post(
            f"{BASE_URL}/api/admin/xai-credits/set-balance",
            headers=self.headers,
            json={"balance_usd": 500.0}
        )
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        assert data.get("success") is True, "Expected success: true"
        assert data.get("balance_usd") == 500.0, f"Expected balance_usd=500.0, got {data.get('balance_usd')}"
    
    def test_set_balance_reflects_in_get(self):
        """After setting balance, GET should return the new balance"""
        # Set balance to $750
        set_res = requests.post(
            f"{BASE_URL}/api/admin/xai-credits/set-balance",
            headers=self.headers,
            json={"balance_usd": 750.0}
        )
        assert set_res.status_code == 200
        
        # Verify via GET
        get_res = requests.get(f"{BASE_URL}/api/admin/xai-credits", headers=self.headers)
        assert get_res.status_code == 200
        data = get_res.json()
        
        # Balance should be 750 (initial) - 0 (spent, since cleared) = 750
        assert data["initial_balance_usd"] == 750.0, f"Expected initial_balance_usd=750.0, got {data['initial_balance_usd']}"
        assert data["balance_usd"] == 750.0, f"Expected balance_usd=750.0, got {data['balance_usd']}"
        
        # Should be healthy since 750 > 100
        assert data["warning_level"] == "healthy", f"Expected healthy, got {data['warning_level']}"
    
    def test_warning_level_healthy_above_100(self):
        """Balance > $100 should show 'healthy' warning level"""
        # Set balance to $200
        requests.post(
            f"{BASE_URL}/api/admin/xai-credits/set-balance",
            headers=self.headers,
            json={"balance_usd": 200.0}
        )
        
        res = requests.get(f"{BASE_URL}/api/admin/xai-credits", headers=self.headers)
        assert res.status_code == 200
        data = res.json()
        
        assert data["warning_level"] == "healthy", f"Expected healthy for $200, got {data['warning_level']}"
    
    def test_warning_level_warning_between_25_and_100(self):
        """Balance between $25-$100 should show 'warning' level"""
        # Set balance to $50
        requests.post(
            f"{BASE_URL}/api/admin/xai-credits/set-balance",
            headers=self.headers,
            json={"balance_usd": 50.0}
        )
        
        res = requests.get(f"{BASE_URL}/api/admin/xai-credits", headers=self.headers)
        assert res.status_code == 200
        data = res.json()
        
        assert data["warning_level"] == "warning", f"Expected warning for $50, got {data['warning_level']}"
    
    def test_warning_level_critical_below_25(self):
        """Balance < $25 should show 'critical' level"""
        # Set balance to $10
        requests.post(
            f"{BASE_URL}/api/admin/xai-credits/set-balance",
            headers=self.headers,
            json={"balance_usd": 10.0}
        )
        
        res = requests.get(f"{BASE_URL}/api/admin/xai-credits", headers=self.headers)
        assert res.status_code == 200
        data = res.json()
        
        assert data["warning_level"] == "critical", f"Expected critical for $10, got {data['warning_level']}"
    
    def test_cleanup_reset_balance_to_500(self):
        """Cleanup: Reset balance to $500 for next test run"""
        res = requests.post(
            f"{BASE_URL}/api/admin/xai-credits/set-balance",
            headers=self.headers,
            json={"balance_usd": 500.0}
        )
        assert res.status_code == 200
        print("Cleanup: Balance reset to $500")


class TestXAICreditsUnauthorized:
    """Test unauthorized access to xAI credits endpoints"""
    
    def test_get_xai_credits_requires_auth(self):
        """GET /api/admin/xai-credits requires authentication"""
        res = requests.get(f"{BASE_URL}/api/admin/xai-credits")
        assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"
    
    def test_set_balance_requires_auth(self):
        """POST /api/admin/xai-credits/set-balance requires authentication"""
        res = requests.post(
            f"{BASE_URL}/api/admin/xai-credits/set-balance",
            json={"balance_usd": 100.0}
        )
        assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"
    
    def test_non_admin_cannot_access_xai_credits(self):
        """Non-admin users should not access xAI credits endpoints"""
        # Create a regular user and try to access
        # For now, skip if no test user credentials available
        pytest.skip("Need non-admin test credentials to verify this")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
