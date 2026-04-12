"""
Property & Assets Feature Tests - Iteration 56
Tests the new Property & Assets CRUD endpoints and updated summary/coverage score
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


class TestPropertyAssets:
    """Property & Assets CRUD and integration tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get estate ID"""
        # Login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        data = login_resp.json()
        self.token = data.get("access_token")
        assert self.token, "No access_token in login response"
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        # Get estate
        estates_resp = requests.get(f"{BASE_URL}/api/estates", headers=self.headers)
        assert estates_resp.status_code == 200, f"Get estates failed: {estates_resp.text}"
        estates = estates_resp.json()
        assert len(estates) > 0, "No estates found"
        self.estate_id = estates[0]["id"]
        
        # Track created property IDs for cleanup
        self.created_property_ids = []
        yield
        
        # Cleanup: Delete test properties
        for prop_id in self.created_property_ids:
            try:
                requests.delete(f"{BASE_URL}/api/financial/property/{prop_id}", headers=self.headers)
            except:
                pass
    
    # ==================== PROPERTY CRUD TESTS ====================
    
    def test_create_real_estate_property(self):
        """POST /api/financial/property - Create real estate asset"""
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_Primary Residence",
            "category": "real_estate",
            "estimated_value": 450000,
            "location_address": "123 Oak Lane, Austin, TX 78701",
            "ownership_type": "joint",
            "joint_owner": "Jane Doe",
            "notes": "Family home since 2015"
        }
        resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert resp.status_code == 200, f"Create property failed: {resp.text}"
        
        data = resp.json()
        assert data["name"] == "TEST_Primary Residence"
        assert data["category"] == "real_estate"
        assert data["estimated_value"] == 450000
        assert data["location_address"] == "123 Oak Lane, Austin, TX 78701"
        assert data["ownership_type"] == "joint"
        assert data["joint_owner"] == "Jane Doe"
        assert "id" in data
        
        self.created_property_ids.append(data["id"])
        print(f"✓ Created real estate property: {data['id']}")
    
    def test_create_business_entity_property(self):
        """POST /api/financial/property - Create business entity with entity fields"""
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_Smith Holdings LLC",
            "category": "business_entity",
            "estimated_value": 250000,
            "location_address": "456 Business Park, Suite 200, Dallas, TX",
            "entity_type": "llc",
            "entity_state": "Delaware",
            "entity_ein": "1234",
            "ownership_type": "llc_owned"
        }
        resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert resp.status_code == 200, f"Create business entity failed: {resp.text}"
        
        data = resp.json()
        assert data["name"] == "TEST_Smith Holdings LLC"
        assert data["category"] == "business_entity"
        assert data["entity_type"] == "llc"
        assert data["entity_state"] == "Delaware"
        assert data["entity_ein"] == "1234"
        
        self.created_property_ids.append(data["id"])
        print(f"✓ Created business entity: {data['id']}")
    
    def test_create_vehicle_property(self):
        """POST /api/financial/property - Create vehicle asset"""
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_2023 Tesla Model Y",
            "category": "vehicle",
            "estimated_value": 55000,
            "serial_or_vin": "5YJ3E1EA1PF123456",
            "ownership_type": "individual"
        }
        resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert resp.status_code == 200, f"Create vehicle failed: {resp.text}"
        
        data = resp.json()
        assert data["name"] == "TEST_2023 Tesla Model Y"
        assert data["category"] == "vehicle"
        assert data["serial_or_vin"] == "5YJ3E1EA1PF123456"
        
        self.created_property_ids.append(data["id"])
        print(f"✓ Created vehicle: {data['id']}")
    
    def test_create_jewelry_property(self):
        """POST /api/financial/property - Create jewelry asset"""
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_Diamond Engagement Ring",
            "category": "jewelry",
            "estimated_value": 15000,
            "description": "2.5 carat diamond, platinum setting",
            "appraised_by": "GIA Certified Appraiser",
            "appraisal_date": "2024-06-15"
        }
        resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert resp.status_code == 200, f"Create jewelry failed: {resp.text}"
        
        data = resp.json()
        assert data["name"] == "TEST_Diamond Engagement Ring"
        assert data["category"] == "jewelry"
        assert data["estimated_value"] == 15000
        
        self.created_property_ids.append(data["id"])
        print(f"✓ Created jewelry: {data['id']}")
    
    def test_get_property_assets_list(self):
        """GET /api/financial/property/{estate_id} - Get property list"""
        # First create a property
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_Artwork Collection",
            "category": "artwork",
            "estimated_value": 75000
        }
        create_resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.created_property_ids.append(created["id"])
        
        # Get list
        resp = requests.get(f"{BASE_URL}/api/financial/property/{self.estate_id}", headers=self.headers)
        assert resp.status_code == 200, f"Get property list failed: {resp.text}"
        
        data = resp.json()
        assert isinstance(data, list)
        # Find our created property
        found = [p for p in data if p["id"] == created["id"]]
        assert len(found) == 1, "Created property not found in list"
        print(f"✓ Property list returned {len(data)} items")
    
    def test_update_property_asset(self):
        """PUT /api/financial/property/{property_id} - Update property"""
        # Create property
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_Update Property",
            "category": "collectible",
            "estimated_value": 5000
        }
        create_resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.created_property_ids.append(created["id"])
        
        # Update
        update_payload = {
            "name": "TEST_Updated Collectible",
            "estimated_value": 7500,
            "description": "Rare vintage item"
        }
        resp = requests.put(f"{BASE_URL}/api/financial/property/{created['id']}", json=update_payload, headers=self.headers)
        assert resp.status_code == 200, f"Update property failed: {resp.text}"
        
        # Verify update via GET
        get_resp = requests.get(f"{BASE_URL}/api/financial/property/{self.estate_id}", headers=self.headers)
        assert get_resp.status_code == 200
        props = get_resp.json()
        updated = [p for p in props if p["id"] == created["id"]]
        assert len(updated) == 1
        assert updated[0]["name"] == "TEST_Updated Collectible"
        assert updated[0]["estimated_value"] == 7500
        assert updated[0]["description"] == "Rare vintage item"
        print(f"✓ Property updated successfully")
    
    def test_delete_property_asset(self):
        """DELETE /api/financial/property/{property_id} - Soft delete property"""
        # Create property
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_Delete Property",
            "category": "other",
            "estimated_value": 1000
        }
        create_resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert create_resp.status_code == 200
        created = create_resp.json()
        
        # Delete
        resp = requests.delete(f"{BASE_URL}/api/financial/property/{created['id']}", headers=self.headers)
        assert resp.status_code == 200, f"Delete property failed: {resp.text}"
        
        # Verify deleted (should not appear in list)
        get_resp = requests.get(f"{BASE_URL}/api/financial/property/{self.estate_id}", headers=self.headers)
        assert get_resp.status_code == 200
        props = get_resp.json()
        found = [p for p in props if p["id"] == created["id"]]
        assert len(found) == 0, "Deleted property still appears in list"
        print(f"✓ Property soft-deleted successfully")
    
    # ==================== DESIGNATION TESTS ====================
    
    def test_update_property_designation(self):
        """PUT /api/financial/property/{item_id}/designation - Update beneficiary designations"""
        # Create property
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_Designation Property",
            "category": "real_estate",
            "estimated_value": 100000
        }
        create_resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.created_property_ids.append(created["id"])
        
        # Get beneficiaries
        bens_resp = requests.get(f"{BASE_URL}/api/beneficiaries/{self.estate_id}", headers=self.headers)
        bens = bens_resp.json() if bens_resp.status_code == 200 else []
        
        # Update designation
        designation_payload = {
            "designated_beneficiaries": ["all"],
            "visibility_timing": {}
        }
        resp = requests.put(f"{BASE_URL}/api/financial/property/{created['id']}/designation", 
                          json=designation_payload, headers=self.headers)
        assert resp.status_code == 200, f"Update designation failed: {resp.text}"
        print(f"✓ Property designation updated successfully")
    
    # ==================== SUMMARY TESTS ====================
    
    def test_financial_summary_includes_property(self):
        """GET /api/financial/summary/{estate_id} - Verify property_count and property_value"""
        # Create a property with known value
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_Summary Property",
            "category": "real_estate",
            "estimated_value": 200000,
            "status": "active"
        }
        create_resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert create_resp.status_code == 200
        created = create_resp.json()
        self.created_property_ids.append(created["id"])
        
        # Get summary
        resp = requests.get(f"{BASE_URL}/api/financial/summary/{self.estate_id}", headers=self.headers)
        assert resp.status_code == 200, f"Get summary failed: {resp.text}"
        
        data = resp.json()
        # Verify property fields exist
        assert "property_count" in data, "property_count missing from summary"
        assert "property_value" in data, "property_value missing from summary"
        assert "account_assets" in data, "account_assets missing from summary"
        assert "total_assets" in data, "total_assets missing from summary"
        
        # Verify total_assets = account_assets + property_value
        expected_total = data["account_assets"] + data["property_value"]
        assert data["total_assets"] == expected_total, f"total_assets mismatch: {data['total_assets']} != {expected_total}"
        
        print(f"✓ Summary includes property: count={data['property_count']}, value=${data['property_value']}, total_assets=${data['total_assets']}")
    
    # ==================== COVERAGE SCORE TESTS ====================
    
    def test_financial_coverage_score(self):
        """GET /api/financial/health-score/{estate_id} - Verify coverage-based scoring"""
        resp = requests.get(f"{BASE_URL}/api/financial/health-score/{self.estate_id}", headers=self.headers)
        assert resp.status_code == 200, f"Get coverage score failed: {resp.text}"
        
        data = resp.json()
        assert "score" in data, "score missing from coverage response"
        assert "label" in data, "label missing from coverage response"
        assert "breakdown" in data, "breakdown missing from coverage response"
        
        # Verify score is 0-100
        assert 0 <= data["score"] <= 100, f"Score out of range: {data['score']}"
        
        # Verify label is one of the expected values
        valid_labels = ["Not Started", "Getting Started", "Building", "Thorough", "Comprehensive"]
        assert data["label"] in valid_labels, f"Invalid label: {data['label']}"
        
        # Verify breakdown structure
        breakdown = data["breakdown"]
        assert "coverage" in breakdown
        assert "detail" in breakdown
        assert "designations" in breakdown
        assert "dav_links" in breakdown
        assert "notes" in breakdown
        
        print(f"✓ Coverage score: {data['score']}% ({data['label']})")
        print(f"  Breakdown: coverage={breakdown['coverage']}, detail={breakdown['detail']}, designations={breakdown['designations']}")
    
    def test_coverage_score_labels(self):
        """Verify coverage score label thresholds"""
        # This test verifies the label logic based on score ranges
        # Not Started: 0
        # Getting Started: 1-39
        # Building: 40-64
        # Thorough: 65-84
        # Comprehensive: 85+
        
        resp = requests.get(f"{BASE_URL}/api/financial/health-score/{self.estate_id}", headers=self.headers)
        assert resp.status_code == 200
        
        data = resp.json()
        score = data["score"]
        label = data["label"]
        
        if score == 0:
            assert label == "Not Started"
        elif score < 40:
            assert label == "Getting Started"
        elif score < 65:
            assert label == "Building"
        elif score < 85:
            assert label == "Thorough"
        else:
            assert label == "Comprehensive"
        
        print(f"✓ Coverage label '{label}' matches score {score}")


class TestPropertyEdgeCases:
    """Edge case and validation tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get estate ID"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_resp.status_code == 200
        data = login_resp.json()
        self.token = data.get("access_token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        
        estates_resp = requests.get(f"{BASE_URL}/api/estates", headers=self.headers)
        estates = estates_resp.json()
        self.estate_id = estates[0]["id"]
        self.created_property_ids = []
        yield
        
        for prop_id in self.created_property_ids:
            try:
                requests.delete(f"{BASE_URL}/api/financial/property/{prop_id}", headers=self.headers)
            except:
                pass
    
    def test_create_property_without_value(self):
        """Create property without estimated_value (optional field)"""
        payload = {
            "estate_id": self.estate_id,
            "name": "TEST_No Value Property",
            "category": "other"
        }
        resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
        assert resp.status_code == 200
        
        data = resp.json()
        assert data["estimated_value"] is None
        self.created_property_ids.append(data["id"])
        print(f"✓ Property created without value")
    
    def test_create_property_all_categories(self):
        """Test creating property in each category"""
        categories = ["real_estate", "vehicle", "jewelry", "artwork", "collectible", "business_entity", "other"]
        
        for cat in categories:
            payload = {
                "estate_id": self.estate_id,
                "name": f"TEST_{cat}_item",
                "category": cat,
                "estimated_value": 1000
            }
            resp = requests.post(f"{BASE_URL}/api/financial/property", json=payload, headers=self.headers)
            assert resp.status_code == 200, f"Failed to create {cat}: {resp.text}"
            self.created_property_ids.append(resp.json()["id"])
        
        print(f"✓ All {len(categories)} categories work correctly")
    
    def test_update_nonexistent_property(self):
        """Update non-existent property returns 404"""
        resp = requests.put(f"{BASE_URL}/api/financial/property/nonexistent-id-12345", 
                          json={"name": "Test"}, headers=self.headers)
        assert resp.status_code == 404
        print(f"✓ Non-existent property returns 404")
    
    def test_delete_nonexistent_property(self):
        """Delete non-existent property returns 404"""
        resp = requests.delete(f"{BASE_URL}/api/financial/property/nonexistent-id-12345", headers=self.headers)
        assert resp.status_code == 404
        print(f"✓ Delete non-existent property returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
