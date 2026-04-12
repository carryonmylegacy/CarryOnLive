"""
Test Quick Add (Bulk Bill Import) Feature
Tests the Quick Add flow which uses POST /api/financial/smart-categorize for AI categorization
and POST /api/financial/bills for batch creation.
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


class TestQuickAddFeature:
    """Quick Add (Bulk Bill Import) feature tests"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test credentials and auth"""
        self.email = "info@carryon.us"
        self.password = "Demo1234!"
        self.token = None
        self.estate_id = None
        self.created_bill_ids = []

        # Login to get token
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": self.email, "password": self.password}
        )
        if login_response.status_code == 200:
            self.token = login_response.json().get("access_token")
            
        # Get estate ID
        if self.token:
            estates_response = requests.get(
                f"{BASE_URL}/api/estates",
                headers=self.get_headers()
            )
            if estates_response.status_code == 200:
                estates = estates_response.json()
                if estates:
                    self.estate_id = estates[0].get("id")

    def teardown_method(self, method):
        """Cleanup: Delete any TEST_ prefixed bills created during tests"""
        if self.token and self.created_bill_ids:
            for bill_id in self.created_bill_ids:
                try:
                    requests.delete(
                        f"{BASE_URL}/api/financial/bills/{bill_id}",
                        headers=self.get_headers()
                    )
                except:
                    pass

    def get_headers(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def test_quick_add_step1_categorize_multiple_bills(self):
        """Test Step 1: AI categorizes multiple bill names"""
        if not self.token:
            pytest.skip("Authentication failed")

        bill_names = [
            "TEST_Duke Energy Electric",
            "TEST_Netflix Subscription",
            "TEST_State Farm Auto Insurance"
        ]
        
        results = []
        for name in bill_names:
            response = requests.post(
                f"{BASE_URL}/api/financial/smart-categorize",
                json={"bill_name": name, "module": "bills"},
                headers=self.get_headers(),
            )
            assert response.status_code == 200, f"Categorization failed for {name}: {response.text}"
            data = response.json()
            results.append({
                "name": name,
                "category": data.get("category"),
                "phone": data.get("biller_phone"),
                "website": data.get("biller_website"),
                "is_auto_pay": data.get("is_auto_pay", False)
            })
            
        # Verify all items were categorized
        assert len(results) == 3, f"Expected 3 results, got {len(results)}"
        
        # Verify categories are reasonable
        categories = [r["category"] for r in results]
        print(f"Categorized bills: {results}")
        
        # Duke Energy should be utilities
        assert results[0]["category"] == "utilities", f"Duke Energy should be utilities, got {results[0]['category']}"
        # Netflix should be subscriptions
        assert results[1]["category"] == "subscriptions", f"Netflix should be subscriptions, got {results[1]['category']}"
        # State Farm should be insurance
        assert results[2]["category"] in ["insurance", "auto_vehicle"], f"State Farm should be insurance, got {results[2]['category']}"

    def test_quick_add_step2_batch_create_bills(self):
        """Test Step 2: Batch create bills via POST /api/financial/bills"""
        if not self.token or not self.estate_id:
            pytest.skip("Authentication or estate not available")

        # First categorize
        categorized = []
        bill_names = ["TEST_Spectrum Internet", "TEST_T-Mobile Wireless"]
        
        for name in bill_names:
            cat_response = requests.post(
                f"{BASE_URL}/api/financial/smart-categorize",
                json={"bill_name": name, "module": "bills"},
                headers=self.get_headers(),
            )
            if cat_response.status_code == 200:
                data = cat_response.json()
                categorized.append({
                    "name": name,
                    "category": data.get("category", "other"),
                    "biller_phone": data.get("biller_phone"),
                    "biller_website": data.get("biller_website"),
                    "is_auto_pay": data.get("is_auto_pay", False),
                    "frequency": data.get("frequency", "monthly"),
                    "payment_method": data.get("payment_method", "manual_online")
                })

        # Now batch create
        created_count = 0
        for item in categorized:
            payload = {
                "estate_id": self.estate_id,
                "name": item["name"],
                "category": item["category"],
                "biller_phone": item["biller_phone"],
                "biller_website": item["biller_website"],
                "is_auto_pay": item["is_auto_pay"],
                "frequency": item["frequency"],
                "payment_method": item["payment_method"]
            }
            
            create_response = requests.post(
                f"{BASE_URL}/api/financial/bills",
                json=payload,
                headers=self.get_headers()
            )
            
            if create_response.status_code in [200, 201]:
                created_count += 1
                bill_data = create_response.json()
                if bill_data.get("id"):
                    self.created_bill_ids.append(bill_data["id"])
                print(f"Created bill: {item['name']} with ID {bill_data.get('id')}")
            else:
                print(f"Failed to create bill {item['name']}: {create_response.status_code} - {create_response.text}")

        assert created_count == len(categorized), f"Expected {len(categorized)} bills created, got {created_count}"

    def test_quick_add_verify_bills_persisted(self):
        """Test that batch-created bills are persisted and retrievable"""
        if not self.token or not self.estate_id:
            pytest.skip("Authentication or estate not available")

        # Create a test bill
        cat_response = requests.post(
            f"{BASE_URL}/api/financial/smart-categorize",
            json={"bill_name": "TEST_GEICO Car Insurance", "module": "bills"},
            headers=self.get_headers(),
        )
        
        if cat_response.status_code != 200:
            pytest.skip("Categorization failed")
            
        cat_data = cat_response.json()
        
        # Create the bill
        create_response = requests.post(
            f"{BASE_URL}/api/financial/bills",
            json={
                "estate_id": self.estate_id,
                "name": "TEST_GEICO Car Insurance",
                "category": cat_data.get("category", "insurance"),
                "biller_phone": cat_data.get("biller_phone"),
                "biller_website": cat_data.get("biller_website"),
                "is_auto_pay": cat_data.get("is_auto_pay", False),
                "frequency": cat_data.get("frequency", "monthly"),
                "payment_method": cat_data.get("payment_method", "manual_online")
            },
            headers=self.get_headers()
        )
        
        assert create_response.status_code in [200, 201], f"Bill creation failed: {create_response.text}"
        bill_data = create_response.json()
        bill_id = bill_data.get("id")
        
        if bill_id:
            self.created_bill_ids.append(bill_id)
        
        # Verify by fetching all bills
        get_response = requests.get(
            f"{BASE_URL}/api/financial/bills/{self.estate_id}",
            headers=self.get_headers()
        )
        
        assert get_response.status_code == 200, f"Failed to fetch bills: {get_response.text}"
        bills = get_response.json()
        
        # Find our test bill
        test_bill = next((b for b in bills if b.get("name") == "TEST_GEICO Car Insurance"), None)
        assert test_bill is not None, "Created bill not found in bills list"
        
        # Verify data was persisted correctly
        assert test_bill.get("category") == cat_data.get("category", "insurance"), "Category not persisted correctly"
        print(f"Bill persisted successfully: {test_bill}")

    def test_quick_add_debts_module(self):
        """Test Quick Add for debts module"""
        if not self.token or not self.estate_id:
            pytest.skip("Authentication or estate not available")

        # Categorize a debt
        cat_response = requests.post(
            f"{BASE_URL}/api/financial/smart-categorize",
            json={"bill_name": "TEST_Chase Credit Card", "module": "debts"},
            headers=self.get_headers(),
        )
        
        assert cat_response.status_code == 200, f"Categorization failed: {cat_response.text}"
        cat_data = cat_response.json()
        
        # Verify it's categorized as credit_card
        assert cat_data.get("category") in ["credit_card", "other"], f"Expected credit_card, got {cat_data.get('category')}"
        print(f"Chase Credit Card categorized as: {cat_data.get('category')}")

    def test_quick_add_accounts_module(self):
        """Test Quick Add for accounts module"""
        if not self.token or not self.estate_id:
            pytest.skip("Authentication or estate not available")

        # Categorize an account
        cat_response = requests.post(
            f"{BASE_URL}/api/financial/smart-categorize",
            json={"bill_name": "TEST_Fidelity 401k", "module": "accounts"},
            headers=self.get_headers(),
        )
        
        assert cat_response.status_code == 200, f"Categorization failed: {cat_response.text}"
        cat_data = cat_response.json()
        
        # Verify it's categorized as retirement
        assert cat_data.get("category") in ["retirement", "investment", "other"], f"Expected retirement/investment, got {cat_data.get('category')}"
        print(f"Fidelity 401k categorized as: {cat_data.get('category')}")
