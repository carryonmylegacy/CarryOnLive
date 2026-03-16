"""Tests for Capacity Dashboard features (iteration 124)

New features tested:
- POST /api/admin/integrations/unlock - Now returns capacity object with:
  - total_users, platform_ceiling, most_limiting_name, usage_percent, top_3_limiting array
- Warnings array (health alerts) in response  
- db_stats object with storage_gb, data_gb, collections
- Each integration has: limiting_rank (1=Resend, 2=Capgo, 3=MongoDB, 0=others), max_users, capacity_reason fields
- Integration cards sorted by limiting rank first
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"
VAULT_PASSWORD = "Blh9170873"


class TestCapacityObject:
    """Tests for the new capacity object returned from /admin/integrations/unlock"""

    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Admin login failed")

    def test_unlock_returns_capacity_object(self):
        """Test that unlock returns a capacity object"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}"
        data = response.json()
        
        assert "capacity" in data, "Response should contain 'capacity' key"
        print("✓ Capacity object present in response")

    def test_capacity_has_total_users(self):
        """Test capacity object has total_users field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        capacity = response.json()["capacity"]
        
        assert "total_users" in capacity, "Capacity should have total_users"
        assert isinstance(capacity["total_users"], int), "total_users should be integer"
        assert capacity["total_users"] >= 0, "total_users should be non-negative"
        
        print(f"✓ total_users: {capacity['total_users']}")

    def test_capacity_has_platform_ceiling(self):
        """Test capacity object has platform_ceiling field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        capacity = response.json()["capacity"]
        
        assert "platform_ceiling" in capacity, "Capacity should have platform_ceiling"
        assert isinstance(capacity["platform_ceiling"], int), "platform_ceiling should be integer"
        assert capacity["platform_ceiling"] > 0, "platform_ceiling should be positive"
        
        print(f"✓ platform_ceiling: {capacity['platform_ceiling']}")

    def test_capacity_has_most_limiting_name(self):
        """Test capacity object has most_limiting_name field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        capacity = response.json()["capacity"]
        
        assert "most_limiting_name" in capacity, "Capacity should have most_limiting_name"
        # most_limiting_name could be None if no limiting integration
        if capacity["most_limiting_name"] is not None:
            assert isinstance(capacity["most_limiting_name"], str), "most_limiting_name should be string"
            assert len(capacity["most_limiting_name"]) > 0, "most_limiting_name should not be empty if set"
        
        print(f"✓ most_limiting_name: {capacity['most_limiting_name']}")

    def test_capacity_has_usage_percent(self):
        """Test capacity object has usage_percent field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        capacity = response.json()["capacity"]
        
        assert "usage_percent" in capacity, "Capacity should have usage_percent"
        assert isinstance(capacity["usage_percent"], (int, float)), "usage_percent should be numeric"
        assert capacity["usage_percent"] >= 0, "usage_percent should be non-negative"
        
        print(f"✓ usage_percent: {capacity['usage_percent']}%")

    def test_capacity_has_top_3_limiting(self):
        """Test capacity object has top_3_limiting array"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        capacity = response.json()["capacity"]
        
        assert "top_3_limiting" in capacity, "Capacity should have top_3_limiting"
        assert isinstance(capacity["top_3_limiting"], list), "top_3_limiting should be array"
        
        # Should have at most 3 items
        assert len(capacity["top_3_limiting"]) <= 3, "top_3_limiting should have at most 3 items"
        
        # Each item should have required fields
        for item in capacity["top_3_limiting"]:
            assert "rank" in item, "Each limiting item should have rank"
            assert "id" in item, "Each limiting item should have id"
            assert "name" in item, "Each limiting item should have name"
            assert "max_users" in item, "Each limiting item should have max_users"
            assert "reason" in item, "Each limiting item should have reason"
            assert "upgrade_to" in item, "Each limiting item should have upgrade_to"
            assert "upgrade_url" in item, "Each limiting item should have upgrade_url"
        
        print(f"✓ top_3_limiting: {[i['name'] for i in capacity['top_3_limiting']]}")

    def test_top_3_limiting_has_correct_ranks(self):
        """Test top_3_limiting items have ranks 1, 2, 3"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        capacity = response.json()["capacity"]
        top_3 = capacity["top_3_limiting"]
        
        if len(top_3) >= 1:
            assert top_3[0]["rank"] == 1, "First limiting should have rank 1"
        if len(top_3) >= 2:
            assert top_3[1]["rank"] == 2, "Second limiting should have rank 2"
        if len(top_3) >= 3:
            assert top_3[2]["rank"] == 3, "Third limiting should have rank 3"
        
        print(f"✓ top_3_limiting ranks are correct: {[i['rank'] for i in top_3]}")

    def test_resend_is_most_limiting(self):
        """Test Resend is the most limiting integration (rank 1, 5000 users)"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        capacity = response.json()["capacity"]
        
        # Most limiting should be Resend at 5000 users
        assert capacity["most_limiting_name"] == "Resend", f"Expected Resend but got {capacity['most_limiting_name']}"
        assert capacity["platform_ceiling"] == 5000, f"Expected 5000 but got {capacity['platform_ceiling']}"
        
        # First in top_3 should be Resend
        top_3 = capacity["top_3_limiting"]
        assert len(top_3) >= 1
        assert top_3[0]["id"] == "resend", f"Expected resend but got {top_3[0]['id']}"
        assert top_3[0]["max_users"] == 5000
        
        print("✓ Resend correctly identified as most limiting (5000 users)")

    def test_capgo_is_second_limiting(self):
        """Test Capgo is the second limiting integration (rank 2, 10000 users)"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        top_3 = response.json()["capacity"]["top_3_limiting"]
        
        assert len(top_3) >= 2
        assert top_3[1]["id"] == "capgo", f"Expected capgo but got {top_3[1]['id']}"
        assert top_3[1]["max_users"] == 10000
        assert top_3[1]["rank"] == 2
        
        print("✓ Capgo correctly identified as 2nd limiting (10000 users)")

    def test_mongodb_is_third_limiting(self):
        """Test MongoDB is the third limiting integration (rank 3, 15000 users)"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        top_3 = response.json()["capacity"]["top_3_limiting"]
        
        assert len(top_3) >= 3
        assert top_3[2]["id"] == "mongodb", f"Expected mongodb but got {top_3[2]['id']}"
        assert top_3[2]["max_users"] == 15000
        assert top_3[2]["rank"] == 3
        
        print("✓ MongoDB correctly identified as 3rd limiting (15000 users)")


class TestIntegrationLimitingRank:
    """Tests for limiting_rank field on each integration"""

    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Admin login failed")

    def test_integrations_have_limiting_rank(self):
        """Test that each integration has limiting_rank field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        integrations = response.json()["integrations"]
        
        for integ in integrations:
            assert "limiting_rank" in integ, f"Integration {integ['id']} missing limiting_rank"
            assert isinstance(integ["limiting_rank"], int), f"limiting_rank for {integ['id']} should be integer"
        
        print(f"✓ All {len(integrations)} integrations have limiting_rank field")

    def test_resend_has_rank_1(self):
        """Test Resend has limiting_rank = 1"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        integrations = response.json()["integrations"]
        resend = next((i for i in integrations if i["id"] == "resend"), None)
        
        assert resend is not None
        assert resend["limiting_rank"] == 1, f"Resend should have rank 1 but got {resend['limiting_rank']}"
        
        print(f"✓ Resend has limiting_rank = {resend['limiting_rank']}")

    def test_capgo_has_rank_2(self):
        """Test Capgo has limiting_rank = 2"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        integrations = response.json()["integrations"]
        capgo = next((i for i in integrations if i["id"] == "capgo"), None)
        
        assert capgo is not None
        assert capgo["limiting_rank"] == 2, f"Capgo should have rank 2 but got {capgo['limiting_rank']}"
        
        print(f"✓ Capgo has limiting_rank = {capgo['limiting_rank']}")

    def test_mongodb_has_rank_3(self):
        """Test MongoDB has limiting_rank = 3"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        integrations = response.json()["integrations"]
        mongodb = next((i for i in integrations if i["id"] == "mongodb"), None)
        
        assert mongodb is not None
        assert mongodb["limiting_rank"] == 3, f"MongoDB should have rank 3 but got {mongodb['limiting_rank']}"
        
        print(f"✓ MongoDB has limiting_rank = {mongodb['limiting_rank']}")

    def test_other_integrations_have_rank_0(self):
        """Test non-limiting integrations have limiting_rank = 0"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        integrations = response.json()["integrations"]
        
        # These should have rank 0 (not limiting)
        non_limiting_ids = ["stripe", "apple_iap", "s3", "twilio", "webauthn", "vapid", "jwt", 
                           "voice_biometrics", "pdf_tools", "capacitor", "google_places"]
        
        for integ_id in non_limiting_ids:
            integ = next((i for i in integrations if i["id"] == integ_id), None)
            if integ:
                assert integ["limiting_rank"] == 0, f"{integ_id} should have rank 0 but got {integ['limiting_rank']}"
        
        print(f"✓ Non-limiting integrations have rank 0")

    def test_integrations_have_max_users(self):
        """Test that each integration has max_users field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        integrations = response.json()["integrations"]
        
        for integ in integrations:
            assert "max_users" in integ, f"Integration {integ['id']} missing max_users"
            assert isinstance(integ["max_users"], int), f"max_users for {integ['id']} should be integer"
            assert integ["max_users"] > 0, f"max_users for {integ['id']} should be positive"
        
        print(f"✓ All integrations have max_users field")

    def test_integrations_have_capacity_reason(self):
        """Test that integrations have capacity_reason field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        integrations = response.json()["integrations"]
        
        for integ in integrations:
            assert "capacity_reason" in integ, f"Integration {integ['id']} missing capacity_reason"
        
        # Limiting integrations should have non-empty capacity_reason
        resend = next((i for i in integrations if i["id"] == "resend"), None)
        assert resend["capacity_reason"], "Resend should have a capacity_reason"
        
        print(f"✓ All integrations have capacity_reason field")


class TestWarningsArray:
    """Tests for warnings array in response"""

    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Admin login failed")

    def test_unlock_returns_warnings_array(self):
        """Test that unlock returns warnings array"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "warnings" in data, "Response should contain 'warnings' key"
        assert isinstance(data["warnings"], list), "warnings should be an array"
        
        print(f"✓ Warnings array present with {len(data['warnings'])} warnings")

    def test_warnings_have_correct_structure(self):
        """Test that each warning has level and message fields"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        warnings = response.json()["warnings"]
        
        for warning in warnings:
            assert "level" in warning, "Warning should have level field"
            assert "message" in warning, "Warning should have message field"
            assert warning["level"] in ["critical", "warning"], f"Invalid warning level: {warning['level']}"
        
        print(f"✓ All warnings have correct structure")


class TestDbStats:
    """Tests for db_stats object in response"""

    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Admin login failed")

    def test_unlock_returns_db_stats(self):
        """Test that unlock returns db_stats object"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "db_stats" in data, "Response should contain 'db_stats' key"
        # db_stats could be None if dbStats command fails
        
        print(f"✓ db_stats key present in response")

    def test_db_stats_has_storage_gb(self):
        """Test db_stats has storage_gb field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        db_stats = response.json()["db_stats"]
        
        if db_stats:
            assert "storage_gb" in db_stats, "db_stats should have storage_gb"
            assert isinstance(db_stats["storage_gb"], (int, float)), "storage_gb should be numeric"
            print(f"✓ storage_gb: {db_stats['storage_gb']}GB")
        else:
            print("⚠ db_stats is None (dbStats command may have failed)")

    def test_db_stats_has_data_gb(self):
        """Test db_stats has data_gb field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        db_stats = response.json()["db_stats"]
        
        if db_stats:
            assert "data_gb" in db_stats, "db_stats should have data_gb"
            assert isinstance(db_stats["data_gb"], (int, float)), "data_gb should be numeric"
            print(f"✓ data_gb: {db_stats['data_gb']}GB")
        else:
            print("⚠ db_stats is None (dbStats command may have failed)")

    def test_db_stats_has_collections(self):
        """Test db_stats has collections field"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/unlock", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200
        db_stats = response.json()["db_stats"]
        
        if db_stats:
            assert "collections" in db_stats, "db_stats should have collections"
            assert isinstance(db_stats["collections"], int), "collections should be integer"
            print(f"✓ collections: {db_stats['collections']}")
        else:
            print("⚠ db_stats is None (dbStats command may have failed)")


class TestSOC2ReportStillWorks:
    """Ensure SOC 2 PDF export still works after capacity additions"""

    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup test session with admin auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Admin login failed")

    def test_soc2_report_still_returns_pdf(self):
        """Test SOC 2 PDF export still works"""
        response = self.session.post(f"{BASE_URL}/api/admin/integrations/soc2-report", json={
            "password": VAULT_PASSWORD
        })
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}"
        
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, f"Expected PDF but got {content_type}"
        
        content = response.content
        assert content.startswith(b'%PDF'), "Response should start with PDF magic bytes"
        
        print(f"✓ SOC 2 PDF export still works ({len(content)/1024:.1f}KB)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
