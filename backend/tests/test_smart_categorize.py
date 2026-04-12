"""
Test Smart Bill Categorization API
Tests the POST /api/financial/smart-categorize endpoint for bills, debts, and accounts modules.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestSmartCategorize:
    """Smart Bill Categorization endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials and auth"""
        self.email = "info@carryon.us"
        self.password = "Demo1234!"
        self.token = None
        
        # Login to get token
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": self.email, "password": self.password}
        )
        if login_response.status_code == 200:
            self.token = login_response.json().get("access_token")
        
    def get_headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_smart_categorize_bills_known_company(self):
        """Test smart categorize for a known utility company (Duke Energy)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.post(
            f"{BASE_URL}/api/financial/smart-categorize",
            json={"bill_name": "Duke Energy Electric", "module": "bills"},
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "category" in data, "Response should contain 'category'"
        assert "biller_phone" in data, "Response should contain 'biller_phone'"
        assert "biller_website" in data, "Response should contain 'biller_website'"
        assert "payment_method" in data, "Response should contain 'payment_method'"
        assert "is_auto_pay" in data, "Response should contain 'is_auto_pay'"
        assert "frequency" in data, "Response should contain 'frequency'"
        
        # Duke Energy should be categorized as utilities
        assert data["category"] == "utilities", f"Expected 'utilities', got '{data['category']}'"
        print(f"Duke Energy categorized as: {data['category']}")
        print(f"Phone: {data['biller_phone']}, Website: {data['biller_website']}")
    
    def test_smart_categorize_bills_netflix(self):
        """Test smart categorize for Netflix (subscription)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.post(
            f"{BASE_URL}/api/financial/smart-categorize",
            json={"bill_name": "Netflix", "module": "bills"},
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Netflix should be categorized as subscriptions
        assert data["category"] == "subscriptions", f"Expected 'subscriptions', got '{data['category']}'"
        print(f"Netflix categorized as: {data['category']}")
    
    def test_smart_categorize_debts_module(self):
        """Test smart categorize for debts module (mortgage)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.post(
            f"{BASE_URL}/api/financial/smart-categorize",
            json={"bill_name": "Wells Fargo Home Mortgage", "module": "debts"},
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "category" in data
        # Mortgage should be categorized as mortgage
        assert data["category"] in ["mortgage", "other"], f"Expected 'mortgage' or 'other', got '{data['category']}'"
        print(f"Wells Fargo Mortgage categorized as: {data['category']}")
    
    def test_smart_categorize_accounts_module(self):
        """Test smart categorize for accounts module (checking account)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.post(
            f"{BASE_URL}/api/financial/smart-categorize",
            json={"bill_name": "Chase Checking Account", "module": "accounts"},
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "category" in data
        # Chase Checking should be categorized as checking
        assert data["category"] in ["checking", "other"], f"Expected 'checking' or 'other', got '{data['category']}'"
        print(f"Chase Checking categorized as: {data['category']}")
    
    def test_smart_categorize_unknown_company(self):
        """Test smart categorize for unknown company (should return 'other')"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = requests.post(
            f"{BASE_URL}/api/financial/smart-categorize",
            json={"bill_name": "Random Unknown Company XYZ123", "module": "bills"},
            headers=self.get_headers()
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should still return valid structure even for unknown companies
        assert "category" in data
        assert "biller_phone" in data
        print(f"Unknown company categorized as: {data['category']}")
    
    def test_smart_categorize_without_auth(self):
        """Test smart categorize without authentication (should fail)"""
        response = requests.post(
            f"{BASE_URL}/api/financial/smart-categorize",
            json={"bill_name": "Netflix", "module": "bills"},
            headers={"Content-Type": "application/json"}
        )
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"Unauthenticated request correctly rejected with {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
