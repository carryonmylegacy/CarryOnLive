"""
CarryOn Financial Portal (CFP) Backend Tests
Tests for Bill Tracker (CBT), Debt Tracker (CDT), and Accounts Registry (CAR)
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


class TestFinancialPortalAuth:
    """Authentication and setup for financial portal tests"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for admin user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in login response"
        return data["access_token"]

    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers for API calls"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    @pytest.fixture(scope="class")
    def estate_id(self, auth_headers):
        """Get the first estate ID for the authenticated user"""
        response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get estates: {response.text}"
        estates = response.json()
        assert len(estates) > 0, "No estates found for user"
        return estates[0]["id"]


class TestBillsCRUD(TestFinancialPortalAuth):
    """Test Bill Tracker CRUD operations"""

    def test_get_bills_empty_or_list(self, auth_headers, estate_id):
        """GET /api/financial/bills/{estate_id} - should return list"""
        response = requests.get(f"{BASE_URL}/api/financial/bills/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get bills: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Bills response should be a list"
        print(f"✓ GET bills returned {len(data)} bills")

    def test_create_bill(self, auth_headers, estate_id):
        """POST /api/financial/bills - create a new bill"""
        bill_data = {
            "estate_id": estate_id,
            "name": "TEST_Electric Bill - Duke Energy",
            "category": "utilities",
            "amount": 142.50,
            "is_recurring": True,
            "frequency": "monthly",
            "due_day": 15,
            "payment_method": "auto_pay",
            "is_auto_pay": True,
            "priority": "important",
            "notes": "Test bill for automated testing",
        }
        response = requests.post(f"{BASE_URL}/api/financial/bills", json=bill_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create bill: {response.text}"
        data = response.json()
        assert "id" in data, "Created bill should have an id"
        assert data["name"] == bill_data["name"], "Bill name mismatch"
        assert data["amount"] == bill_data["amount"], "Bill amount mismatch"
        assert data["is_auto_pay"], "Auto-pay flag mismatch"
        print(f"✓ Created bill with id: {data['id']}")

    def test_create_and_get_bill(self, auth_headers, estate_id):
        """Create bill then verify via GET"""
        # Create
        bill_data = {
            "estate_id": estate_id,
            "name": "TEST_Internet Bill - Spectrum",
            "category": "phone_internet",
            "amount": 89.99,
            "is_recurring": True,
            "frequency": "monthly",
            "due_day": 20,
            "payment_method": "manual_online",
            "is_auto_pay": False,
            "priority": "important",
        }
        create_response = requests.post(f"{BASE_URL}/api/financial/bills", json=bill_data, headers=auth_headers)
        assert create_response.status_code == 200
        created_bill = create_response.json()
        bill_id = created_bill["id"]

        # Verify via GET
        get_response = requests.get(f"{BASE_URL}/api/financial/bills/{estate_id}", headers=auth_headers)
        assert get_response.status_code == 200
        bills = get_response.json()
        found_bill = next((b for b in bills if b["id"] == bill_id), None)
        assert found_bill is not None, "Created bill not found in GET response"
        assert found_bill["name"] == bill_data["name"]
        assert found_bill["amount"] == bill_data["amount"]
        print(f"✓ Bill {bill_id} verified via GET")

    def test_update_bill(self, auth_headers, estate_id):
        """PUT /api/financial/bills/{bill_id} - update a bill"""
        # First create a bill
        bill_data = {"estate_id": estate_id, "name": "TEST_Update Bill", "category": "other", "amount": 50.00}
        create_response = requests.post(f"{BASE_URL}/api/financial/bills", json=bill_data, headers=auth_headers)
        assert create_response.status_code == 200
        bill_id = create_response.json()["id"]

        # Update the bill
        update_data = {"name": "TEST_Updated Bill Name", "amount": 75.00, "is_auto_pay": True}
        update_response = requests.put(
            f"{BASE_URL}/api/financial/bills/{bill_id}", json=update_data, headers=auth_headers
        )
        assert update_response.status_code == 200, f"Failed to update bill: {update_response.text}"
        updated_bill = update_response.json()
        assert updated_bill["name"] == update_data["name"], "Bill name not updated"
        assert updated_bill["amount"] == update_data["amount"], "Bill amount not updated"
        print(f"✓ Updated bill {bill_id}")

    def test_delete_bill(self, auth_headers, estate_id):
        """DELETE /api/financial/bills/{bill_id} - soft delete a bill"""
        # First create a bill
        bill_data = {"estate_id": estate_id, "name": "TEST_Delete Bill", "category": "other", "amount": 25.00}
        create_response = requests.post(f"{BASE_URL}/api/financial/bills", json=bill_data, headers=auth_headers)
        assert create_response.status_code == 200
        bill_id = create_response.json()["id"]

        # Delete the bill
        delete_response = requests.delete(f"{BASE_URL}/api/financial/bills/{bill_id}", headers=auth_headers)
        assert delete_response.status_code == 200, f"Failed to delete bill: {delete_response.text}"

        # Verify bill is no longer in list (soft deleted)
        get_response = requests.get(f"{BASE_URL}/api/financial/bills/{estate_id}", headers=auth_headers)
        bills = get_response.json()
        found_bill = next((b for b in bills if b["id"] == bill_id), None)
        assert found_bill is None, "Deleted bill should not appear in list"
        print(f"✓ Deleted bill {bill_id}")


class TestDebtsCRUD(TestFinancialPortalAuth):
    """Test Debt Tracker CRUD operations"""

    def test_get_debts_empty_or_list(self, auth_headers, estate_id):
        """GET /api/financial/debts/{estate_id} - should return list"""
        response = requests.get(f"{BASE_URL}/api/financial/debts/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get debts: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Debts response should be a list"
        print(f"✓ GET debts returned {len(data)} debts")

    def test_create_debt(self, auth_headers, estate_id):
        """POST /api/financial/debts - create a new debt"""
        debt_data = {
            "estate_id": estate_id,
            "name": "TEST_Home Mortgage - Wells Fargo",
            "category": "mortgage",
            "outstanding_balance": 287450.00,
            "original_amount": 320000.00,
            "interest_rate": 3.25,
            "monthly_payment": 1842.00,
            "loan_term_months": 360,
            "lender_name": "Wells Fargo",
            "priority": "critical",
            "status": "active",
        }
        response = requests.post(f"{BASE_URL}/api/financial/debts", json=debt_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create debt: {response.text}"
        data = response.json()
        assert "id" in data, "Created debt should have an id"
        assert data["name"] == debt_data["name"]
        assert data["outstanding_balance"] == debt_data["outstanding_balance"]
        print(f"✓ Created debt with id: {data['id']}")

    def test_create_and_get_debt(self, auth_headers, estate_id):
        """Create debt then verify via GET"""
        debt_data = {
            "estate_id": estate_id,
            "name": "TEST_Auto Loan - Toyota Financial",
            "category": "auto_loan",
            "outstanding_balance": 18500.00,
            "monthly_payment": 425.00,
            "interest_rate": 4.9,
            "priority": "important",
        }
        create_response = requests.post(f"{BASE_URL}/api/financial/debts", json=debt_data, headers=auth_headers)
        assert create_response.status_code == 200
        debt_id = create_response.json()["id"]

        # Verify via GET
        get_response = requests.get(f"{BASE_URL}/api/financial/debts/{estate_id}", headers=auth_headers)
        assert get_response.status_code == 200
        debts = get_response.json()
        found_debt = next((d for d in debts if d["id"] == debt_id), None)
        assert found_debt is not None, "Created debt not found in GET response"
        assert found_debt["outstanding_balance"] == debt_data["outstanding_balance"]
        print(f"✓ Debt {debt_id} verified via GET")

    def test_update_debt(self, auth_headers, estate_id):
        """PUT /api/financial/debts/{debt_id} - update a debt"""
        # Create
        debt_data = {
            "estate_id": estate_id,
            "name": "TEST_Update Debt",
            "category": "personal_loan",
            "outstanding_balance": 5000.00,
        }
        create_response = requests.post(f"{BASE_URL}/api/financial/debts", json=debt_data, headers=auth_headers)
        assert create_response.status_code == 200
        debt_id = create_response.json()["id"]

        # Update
        update_data = {"outstanding_balance": 4500.00, "status": "active"}
        update_response = requests.put(
            f"{BASE_URL}/api/financial/debts/{debt_id}", json=update_data, headers=auth_headers
        )
        assert update_response.status_code == 200
        updated_debt = update_response.json()
        assert updated_debt["outstanding_balance"] == update_data["outstanding_balance"]
        print(f"✓ Updated debt {debt_id}")

    def test_delete_debt(self, auth_headers, estate_id):
        """DELETE /api/financial/debts/{debt_id} - soft delete a debt"""
        # Create
        debt_data = {
            "estate_id": estate_id,
            "name": "TEST_Delete Debt",
            "category": "other",
            "outstanding_balance": 1000.00,
        }
        create_response = requests.post(f"{BASE_URL}/api/financial/debts", json=debt_data, headers=auth_headers)
        assert create_response.status_code == 200
        debt_id = create_response.json()["id"]

        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/financial/debts/{debt_id}", headers=auth_headers)
        assert delete_response.status_code == 200

        # Verify deleted
        get_response = requests.get(f"{BASE_URL}/api/financial/debts/{estate_id}", headers=auth_headers)
        debts = get_response.json()
        found_debt = next((d for d in debts if d["id"] == debt_id), None)
        assert found_debt is None, "Deleted debt should not appear in list"
        print(f"✓ Deleted debt {debt_id}")


class TestAccountsCRUD(TestFinancialPortalAuth):
    """Test Accounts Registry CRUD operations"""

    def test_get_accounts_empty_or_list(self, auth_headers, estate_id):
        """GET /api/financial/accounts/{estate_id} - should return list"""
        response = requests.get(f"{BASE_URL}/api/financial/accounts/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get accounts: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Accounts response should be a list"
        print(f"✓ GET accounts returned {len(data)} accounts")

    def test_create_account(self, auth_headers, estate_id):
        """POST /api/financial/accounts - create a new account"""
        account_data = {
            "estate_id": estate_id,
            "name": "TEST_Primary Checking - Chase",
            "category": "checking",
            "approximate_balance": 12450.00,
            "institution_name": "Chase Bank",
            "account_number_masked": "4892",
            "ownership_type": "individual",
            "priority": "critical",
            "status": "active",
        }
        response = requests.post(f"{BASE_URL}/api/financial/accounts", json=account_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create account: {response.text}"
        data = response.json()
        assert "id" in data, "Created account should have an id"
        assert data["name"] == account_data["name"]
        assert data["approximate_balance"] == account_data["approximate_balance"]
        print(f"✓ Created account with id: {data['id']}")

    def test_create_and_get_account(self, auth_headers, estate_id):
        """Create account then verify via GET"""
        account_data = {
            "estate_id": estate_id,
            "name": "TEST_Savings Account - Ally",
            "category": "savings",
            "approximate_balance": 25000.00,
            "interest_rate": 4.25,
            "institution_name": "Ally Bank",
            "priority": "important",
        }
        create_response = requests.post(f"{BASE_URL}/api/financial/accounts", json=account_data, headers=auth_headers)
        assert create_response.status_code == 200
        account_id = create_response.json()["id"]

        # Verify via GET
        get_response = requests.get(f"{BASE_URL}/api/financial/accounts/{estate_id}", headers=auth_headers)
        assert get_response.status_code == 200
        accounts = get_response.json()
        found_account = next((a for a in accounts if a["id"] == account_id), None)
        assert found_account is not None, "Created account not found in GET response"
        assert found_account["approximate_balance"] == account_data["approximate_balance"]
        print(f"✓ Account {account_id} verified via GET")

    def test_update_account(self, auth_headers, estate_id):
        """PUT /api/financial/accounts/{account_id} - update an account"""
        # Create
        account_data = {
            "estate_id": estate_id,
            "name": "TEST_Update Account",
            "category": "checking",
            "approximate_balance": 5000.00,
        }
        create_response = requests.post(f"{BASE_URL}/api/financial/accounts", json=account_data, headers=auth_headers)
        assert create_response.status_code == 200
        account_id = create_response.json()["id"]

        # Update
        update_data = {"approximate_balance": 6500.00, "institution_name": "Updated Bank"}
        update_response = requests.put(
            f"{BASE_URL}/api/financial/accounts/{account_id}", json=update_data, headers=auth_headers
        )
        assert update_response.status_code == 200
        updated_account = update_response.json()
        assert updated_account["approximate_balance"] == update_data["approximate_balance"]
        print(f"✓ Updated account {account_id}")

    def test_delete_account(self, auth_headers, estate_id):
        """DELETE /api/financial/accounts/{account_id} - soft delete an account"""
        # Create
        account_data = {
            "estate_id": estate_id,
            "name": "TEST_Delete Account",
            "category": "other",
            "approximate_balance": 100.00,
        }
        create_response = requests.post(f"{BASE_URL}/api/financial/accounts", json=account_data, headers=auth_headers)
        assert create_response.status_code == 200
        account_id = create_response.json()["id"]

        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/financial/accounts/{account_id}", headers=auth_headers)
        assert delete_response.status_code == 200

        # Verify deleted
        get_response = requests.get(f"{BASE_URL}/api/financial/accounts/{estate_id}", headers=auth_headers)
        accounts = get_response.json()
        found_account = next((a for a in accounts if a["id"] == account_id), None)
        assert found_account is None, "Deleted account should not appear in list"
        print(f"✓ Deleted account {account_id}")


class TestCustomCategories(TestFinancialPortalAuth):
    """Test custom category management"""

    def test_get_categories(self, auth_headers, estate_id):
        """GET /api/financial/categories/{estate_id} - get custom categories"""
        response = requests.get(f"{BASE_URL}/api/financial/categories/{estate_id}?module=bills", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get categories: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Categories response should be a list"
        print(f"✓ GET categories returned {len(data)} custom categories")

    def test_create_custom_category(self, auth_headers, estate_id):
        """POST /api/financial/categories - create a custom category"""
        import uuid

        unique_name = f"TEST_Custom Category {uuid.uuid4().hex[:8]}"
        category_data = {"estate_id": estate_id, "module": "bills", "name": unique_name, "color": "#ff5733"}
        response = requests.post(f"{BASE_URL}/api/financial/categories", json=category_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create category: {response.text}"
        data = response.json()
        assert "id" in data, "Created category should have an id"
        assert data["name"] == category_data["name"]
        print(f"✓ Created custom category with id: {data['id']}")

    def test_delete_custom_category(self, auth_headers, estate_id):
        """DELETE /api/financial/categories/{category_id} - delete a custom category"""
        import uuid

        unique_name = f"TEST_Delete Category {uuid.uuid4().hex[:8]}"
        # Create first
        category_data = {"estate_id": estate_id, "module": "debts", "name": unique_name}
        create_response = requests.post(
            f"{BASE_URL}/api/financial/categories", json=category_data, headers=auth_headers
        )
        assert create_response.status_code == 200, f"Failed to create category: {create_response.text}"
        category_id = create_response.json()["id"]

        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/financial/categories/{category_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        print(f"✓ Deleted custom category {category_id}")


class TestFinancialSummary(TestFinancialPortalAuth):
    """Test financial summary aggregation endpoint"""

    def test_get_financial_summary(self, auth_headers, estate_id):
        """GET /api/financial/summary/{estate_id} - get aggregated summary"""
        response = requests.get(f"{BASE_URL}/api/financial/summary/{estate_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get summary: {response.text}"
        data = response.json()

        # Verify summary structure
        assert "bills_count" in data, "Summary should have bills_count"
        assert "monthly_total" in data, "Summary should have monthly_total"
        assert "auto_pay_count" in data, "Summary should have auto_pay_count"
        assert "manual_count" in data, "Summary should have manual_count"
        assert "debts_count" in data, "Summary should have debts_count"
        assert "total_debt" in data, "Summary should have total_debt"
        assert "accounts_count" in data, "Summary should have accounts_count"
        assert "total_assets" in data, "Summary should have total_assets"
        assert "net_position" in data, "Summary should have net_position"
        assert "upcoming_bills" in data, "Summary should have upcoming_bills"

        # Verify data types
        assert isinstance(data["bills_count"], int)
        assert isinstance(data["monthly_total"], (int, float))
        assert isinstance(data["net_position"], (int, float))
        assert isinstance(data["upcoming_bills"], list)

        print(
            f"✓ Financial summary: {data['bills_count']} bills, {data['debts_count']} debts, {data['accounts_count']} accounts"
        )
        print(f"  Monthly total: ${data['monthly_total']}, Net position: ${data['net_position']}")


class TestBeneficiaryDesignation(TestFinancialPortalAuth):
    """Test beneficiary designation updates"""

    def test_update_bill_designation(self, auth_headers, estate_id):
        """PUT /api/financial/bills/{bill_id}/designation - update beneficiary designation"""
        # Create a bill first
        bill_data = {"estate_id": estate_id, "name": "TEST_Designation Bill", "category": "other", "amount": 100.00}
        create_response = requests.post(f"{BASE_URL}/api/financial/bills", json=bill_data, headers=auth_headers)
        assert create_response.status_code == 200
        bill_id = create_response.json()["id"]

        # Update designation
        designation_data = {"designated_beneficiaries": ["all"], "visibility_timing": {}}
        response = requests.put(
            f"{BASE_URL}/api/financial/bills/{bill_id}/designation", json=designation_data, headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update designation: {response.text}"
        print(f"✓ Updated bill designation for {bill_id}")

    def test_update_debt_designation(self, auth_headers, estate_id):
        """PUT /api/financial/debts/{debt_id}/designation - update beneficiary designation"""
        # Create a debt first
        debt_data = {
            "estate_id": estate_id,
            "name": "TEST_Designation Debt",
            "category": "other",
            "outstanding_balance": 1000.00,
        }
        create_response = requests.post(f"{BASE_URL}/api/financial/debts", json=debt_data, headers=auth_headers)
        assert create_response.status_code == 200
        debt_id = create_response.json()["id"]

        # Update designation
        designation_data = {"designated_beneficiaries": ["all"], "visibility_timing": {}}
        response = requests.put(
            f"{BASE_URL}/api/financial/debts/{debt_id}/designation", json=designation_data, headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update designation: {response.text}"
        print(f"✓ Updated debt designation for {debt_id}")

    def test_update_account_designation(self, auth_headers, estate_id):
        """PUT /api/financial/accounts/{account_id}/designation - update beneficiary designation"""
        # Create an account first
        account_data = {
            "estate_id": estate_id,
            "name": "TEST_Designation Account",
            "category": "checking",
            "approximate_balance": 500.00,
        }
        create_response = requests.post(f"{BASE_URL}/api/financial/accounts", json=account_data, headers=auth_headers)
        assert create_response.status_code == 200
        account_id = create_response.json()["id"]

        # Update designation
        designation_data = {"designated_beneficiaries": ["all"], "visibility_timing": {}}
        response = requests.put(
            f"{BASE_URL}/api/financial/accounts/{account_id}/designation", json=designation_data, headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update designation: {response.text}"
        print(f"✓ Updated account designation for {account_id}")


class TestBillPayments(TestFinancialPortalAuth):
    """Test bill payment tracking"""

    def test_mark_bill_paid(self, auth_headers, estate_id):
        """POST /api/financial/bills/{bill_id}/pay - mark bill as paid"""
        # Create a bill first
        bill_data = {"estate_id": estate_id, "name": "TEST_Payment Bill", "category": "utilities", "amount": 150.00}
        create_response = requests.post(f"{BASE_URL}/api/financial/bills", json=bill_data, headers=auth_headers)
        assert create_response.status_code == 200
        bill_id = create_response.json()["id"]

        # Mark as paid
        payment_data = {"bill_id": bill_id, "amount_paid": 150.00, "notes": "Paid via test"}
        response = requests.post(
            f"{BASE_URL}/api/financial/bills/{bill_id}/pay", json=payment_data, headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to mark bill paid: {response.text}"
        data = response.json()
        assert "id" in data, "Payment should have an id"
        assert data["amount_paid"] == payment_data["amount_paid"]
        print(f"✓ Marked bill {bill_id} as paid")

    def test_get_bill_payments(self, auth_headers, estate_id):
        """GET /api/financial/bills/{bill_id}/payments - get payment history"""
        # Create a bill and payment
        bill_data = {"estate_id": estate_id, "name": "TEST_Payment History Bill", "category": "other", "amount": 75.00}
        create_response = requests.post(f"{BASE_URL}/api/financial/bills", json=bill_data, headers=auth_headers)
        assert create_response.status_code == 200
        bill_id = create_response.json()["id"]

        # Add a payment
        payment_data = {"bill_id": bill_id, "amount_paid": 75.00}
        requests.post(f"{BASE_URL}/api/financial/bills/{bill_id}/pay", json=payment_data, headers=auth_headers)

        # Get payments
        response = requests.get(f"{BASE_URL}/api/financial/bills/{bill_id}/payments", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get payments: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Payments response should be a list"
        assert len(data) >= 1, "Should have at least one payment"
        print(f"✓ Got {len(data)} payments for bill {bill_id}")


class TestErrorHandling(TestFinancialPortalAuth):
    """Test error handling for invalid requests"""

    def test_get_bills_invalid_estate(self, auth_headers):
        """GET /api/financial/bills/{invalid_estate_id} - should return 404"""
        response = requests.get(f"{BASE_URL}/api/financial/bills/invalid-estate-id", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Invalid estate returns 404")

    def test_update_nonexistent_bill(self, auth_headers):
        """PUT /api/financial/bills/{invalid_id} - should return 404"""
        update_data = {"name": "Updated Name"}
        response = requests.put(
            f"{BASE_URL}/api/financial/bills/nonexistent-id", json=update_data, headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Update nonexistent bill returns 404")

    def test_delete_nonexistent_bill(self, auth_headers):
        """DELETE /api/financial/bills/{invalid_id} - should return 404"""
        response = requests.delete(f"{BASE_URL}/api/financial/bills/nonexistent-id", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Delete nonexistent bill returns 404")


# Cleanup fixture to remove test data after all tests
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup TEST_ prefixed data after all tests complete"""
    yield
    # Cleanup would happen here if needed
    print("\n✓ Test session complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
