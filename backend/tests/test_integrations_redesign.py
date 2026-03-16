"""Tests for Redesigned Integrations Tab (iteration 123)

New features tested:
- POST /api/admin/integrations/unlock - Now returns COGS object, cost_monthly, cost_verified, category
- POST /api/admin/integrations/soc2-report - SOC 2 PDF export endpoint
- Sub-tab filtering by category (All, Infrastructure, Payments, etc.)
- Verified/unverified field flagging in details
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"
VAULT_PASSWORD = "Blh9170873"
WRONG_PASSWORD = "wrongpassword123"


class TestIntegrationsUnlockRedesign:
    """Tests for redesigned unlock endpoint with COGS and categories"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )

        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Admin login failed")

    def test_unlock_returns_cogs_object(self):
        """Test that unlock returns a COGS object with total_monthly, verified_total, unverified_items"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200, f"Expected 200 but got {response.status_code}"
        data = response.json()

        # Verify COGS object exists
        assert "cogs" in data, "Response should contain 'cogs' key"
        cogs = data["cogs"]

        # Verify COGS structure
        assert "total_monthly" in cogs, "COGS should have total_monthly"
        assert "verified_total" in cogs, "COGS should have verified_total"
        assert "unverified_items" in cogs, "COGS should have unverified_items"

        # Verify types
        assert isinstance(cogs["total_monthly"], (int, float)), "total_monthly should be numeric"
        assert isinstance(cogs["verified_total"], (int, float)), "verified_total should be numeric"
        assert isinstance(cogs["unverified_items"], int), "unverified_items should be integer"

        # Verify values are reasonable
        assert cogs["total_monthly"] > 0, "Total monthly COGS should be positive"
        assert cogs["verified_total"] >= 0, "Verified total should be non-negative"
        assert cogs["unverified_items"] >= 0, "Unverified items should be non-negative"

        print(
            f"✓ COGS object returned: total=${cogs['total_monthly']}, verified=${cogs['verified_total']}, unverified={cogs['unverified_items']}"
        )

    def test_cogs_has_note_field(self):
        """Test that COGS includes explanatory note"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200
        cogs = response.json()["cogs"]

        assert "note" in cogs, "COGS should have a note field"
        assert len(cogs["note"]) > 0, "Note should not be empty"
        print(f"✓ COGS note: {cogs['note']}")

    def test_integrations_have_cost_monthly(self):
        """Test that each integration has cost_monthly field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200
        integrations = response.json()["integrations"]

        costs_found = 0
        for integ in integrations:
            assert "cost_monthly" in integ, f"Integration {integ['id']} missing cost_monthly"
            assert isinstance(integ["cost_monthly"], (int, float)), f"cost_monthly for {integ['id']} should be numeric"
            costs_found += 1

        print(f"✓ All {costs_found} integrations have cost_monthly field")

    def test_integrations_have_cost_verified(self):
        """Test that each integration has cost_verified flag"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200
        integrations = response.json()["integrations"]

        verified_count = 0
        unverified_count = 0

        for integ in integrations:
            assert "cost_verified" in integ, f"Integration {integ['id']} missing cost_verified"
            assert isinstance(integ["cost_verified"], bool), f"cost_verified for {integ['id']} should be boolean"

            if integ["cost_verified"]:
                verified_count += 1
            else:
                unverified_count += 1

        print(f"✓ Verified costs: {verified_count}, Unverified costs: {unverified_count}")

    def test_integrations_have_cost_note(self):
        """Test that integrations have cost_note field explaining pricing"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200
        integrations = response.json()["integrations"]

        notes_found = 0
        for integ in integrations:
            assert "cost_note" in integ, f"Integration {integ['id']} missing cost_note"
            if integ["cost_note"]:
                notes_found += 1

        assert notes_found > 0, "At least some integrations should have cost notes"
        print(f"✓ {notes_found} integrations have cost_note explanations")

    def test_integrations_have_category_field(self):
        """Test that each integration has a category field for sub-tab filtering"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200
        integrations = response.json()["integrations"]

        # Expected categories matching frontend CATEGORIES array
        valid_categories = [
            "infrastructure",
            "payments",
            "ai_communication",
            "native_updates",
            "security_auth",
            "local_processing",
        ]

        category_counts = {}
        for integ in integrations:
            assert "category" in integ, f"Integration {integ['id']} missing category"
            assert integ["category"] in valid_categories, f"Invalid category '{integ['category']}' for {integ['id']}"

            category_counts[integ["category"]] = category_counts.get(integ["category"], 0) + 1

        print(f"✓ Category distribution: {category_counts}")

    def test_infrastructure_category_has_4_integrations(self):
        """Test that Infrastructure category has exactly 4 integrations"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200
        integrations = response.json()["integrations"]

        infra = [i for i in integrations if i["category"] == "infrastructure"]
        assert len(infra) == 4, f"Expected 4 infrastructure integrations but got {len(infra)}"

        infra_ids = {i["id"] for i in infra}
        expected = {"railway", "vercel", "mongodb", "s3"}
        assert infra_ids == expected, f"Expected {expected} but got {infra_ids}"

        print(f"✓ Infrastructure category: {[i['id'] for i in infra]}")

    def test_payments_category_has_2_integrations(self):
        """Test that Payments category has exactly 2 integrations"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200
        integrations = response.json()["integrations"]

        payments = [i for i in integrations if i["category"] == "payments"]
        assert len(payments) == 2, f"Expected 2 payment integrations but got {len(payments)}"

        payment_ids = {i["id"] for i in payments}
        expected = {"stripe", "apple_iap"}
        assert payment_ids == expected, f"Expected {expected} but got {payment_ids}"

        print(f"✓ Payments category: {[i['id'] for i in payments]}")

    def test_integration_details_have_verified_flag(self):
        """Test that integration details have verified flag for highlighting"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200
        integrations = response.json()["integrations"]

        verified_count = 0
        unverified_count = 0

        for integ in integrations:
            for detail in integ["details"]:
                if "verified" in detail:
                    if detail["verified"]:
                        verified_count += 1
                    else:
                        unverified_count += 1

        assert verified_count > 0, "Should have some verified detail fields"
        assert unverified_count > 0, "Should have some unverified detail fields for highlighting"

        print(f"✓ Detail fields: {verified_count} verified, {unverified_count} unverified (for highlighting)")

    def test_cogs_totals_match_integration_costs(self):
        """Test that COGS total_monthly equals sum of all integration cost_monthly"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        assert response.status_code == 200
        data = response.json()

        integrations = data["integrations"]
        cogs = data["cogs"]

        calculated_total = sum(i["cost_monthly"] for i in integrations)
        calculated_verified = sum(i["cost_monthly"] for i in integrations if i["cost_verified"])
        calculated_unverified = sum(1 for i in integrations if not i["cost_verified"])

        # Allow small floating point difference
        assert abs(cogs["total_monthly"] - calculated_total) < 0.01, (
            f"COGS total ({cogs['total_monthly']}) doesn't match sum ({calculated_total})"
        )
        assert abs(cogs["verified_total"] - calculated_verified) < 0.01, (
            f"COGS verified ({cogs['verified_total']}) doesn't match sum ({calculated_verified})"
        )
        assert cogs["unverified_items"] == calculated_unverified, (
            f"Unverified count ({cogs['unverified_items']}) doesn't match ({calculated_unverified})"
        )

        print(f"✓ COGS totals verified: ${cogs['total_monthly']:.2f} total, ${cogs['verified_total']:.2f} verified")


class TestSOC2Report:
    """Tests for SOC 2 PDF report generation endpoint"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )

        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Admin login failed")

    def test_soc2_report_wrong_password_returns_403(self):
        """Test that wrong password returns 403"""
        response = self.session.post(
            f"{BASE_URL}/api/admin/integrations/soc2-report", json={"password": WRONG_PASSWORD}
        )

        assert response.status_code == 403, f"Expected 403 but got {response.status_code}"
        print("✓ Wrong password correctly returned 403 for SOC 2 report")

    def test_soc2_report_returns_pdf(self):
        """Test that correct password returns a valid PDF file"""
        response = self.session.post(
            f"{BASE_URL}/api/admin/integrations/soc2-report", json={"password": VAULT_PASSWORD}
        )

        assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text[:200]}"

        # Check Content-Type is PDF
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, f"Expected application/pdf but got {content_type}"

        print(f"✓ SOC 2 report returned with Content-Type: {content_type}")

    def test_soc2_report_has_content_disposition(self):
        """Test that PDF has proper Content-Disposition header for download"""
        response = self.session.post(
            f"{BASE_URL}/api/admin/integrations/soc2-report", json={"password": VAULT_PASSWORD}
        )

        assert response.status_code == 200

        content_disposition = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disposition, "Should have attachment disposition"
        assert ".pdf" in content_disposition, "Filename should be .pdf"
        assert "CarryOn_SOC2" in content_disposition, "Filename should contain CarryOn_SOC2"

        print(f"✓ Content-Disposition: {content_disposition}")

    def test_soc2_report_is_valid_pdf(self):
        """Test that response starts with PDF magic bytes"""
        response = self.session.post(
            f"{BASE_URL}/api/admin/integrations/soc2-report", json={"password": VAULT_PASSWORD}
        )

        assert response.status_code == 200

        # PDF files start with %PDF
        content = response.content
        assert content.startswith(b"%PDF"), "Response should start with PDF magic bytes"

        # PDF files should be reasonable size (>1KB, <10MB for this report)
        size_kb = len(content) / 1024
        assert size_kb > 1, f"PDF too small: {size_kb:.1f}KB"
        assert size_kb < 10000, f"PDF too large: {size_kb:.1f}KB"

        print(f"✓ Valid PDF received: {size_kb:.1f}KB")

    def test_soc2_report_unauthenticated_returns_401(self):
        """Test that unauthenticated requests return 401"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})

        response = session.post(f"{BASE_URL}/api/admin/integrations/soc2-report", json={"password": VAULT_PASSWORD})

        assert response.status_code in [401, 403], f"Expected 401/403 but got {response.status_code}"
        print(f"✓ Unauthenticated SOC 2 request blocked with {response.status_code}")


class TestPaidIntegrationsCosts:
    """Tests for specific integration cost values"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
        )

        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Admin login failed")

    def test_railway_cost(self):
        """Test Railway has cost ~$12/mo"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        integrations = response.json()["integrations"]
        railway = next((i for i in integrations if i["id"] == "railway"), None)

        assert railway is not None
        assert railway["cost_monthly"] == 12.00, f"Railway cost should be $12 but got ${railway['cost_monthly']}"
        assert railway["cost_verified"], "Railway cost should be verified"

        print(f"✓ Railway: ${railway['cost_monthly']}/mo (verified: {railway['cost_verified']})")

    def test_mongodb_cost(self):
        """Test MongoDB Atlas has cost ~$394/mo"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        integrations = response.json()["integrations"]
        mongodb = next((i for i in integrations if i["id"] == "mongodb"), None)

        assert mongodb is not None
        assert mongodb["cost_monthly"] == 394.00, f"MongoDB cost should be $394 but got ${mongodb['cost_monthly']}"

        print(f"✓ MongoDB: ${mongodb['cost_monthly']}/mo (verified: {mongodb['cost_verified']})")

    def test_free_integrations_have_zero_cost(self):
        """Test that free/self-hosted integrations have $0 cost"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={"password": VAULT_PASSWORD})

        integrations = response.json()["integrations"]

        free_ids = ["capacitor", "webauthn", "vapid", "jwt", "voice_biometrics", "pdf_tools"]

        for free_id in free_ids:
            integ = next((i for i in integrations if i["id"] == free_id), None)
            assert integ is not None, f"Missing integration: {free_id}"
            assert integ["cost_monthly"] == 0, f"{free_id} should be free but has ${integ['cost_monthly']}"

        print(f"✓ All free integrations have $0 cost: {free_ids}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
