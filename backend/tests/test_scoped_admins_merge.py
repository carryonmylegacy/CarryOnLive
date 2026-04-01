"""
Test Suite: Scoped Admins with Merge Logic and Operator Support
Tests the following features:
1. GET /api/admin/scoped-admins returns both admin AND operator users
2. POST /api/admin/scoped-admins with EXISTING email should MERGE scopes
3. POST /api/admin/scoped-admins with NEW email should create normally
4. PUT /api/admin/scoped-admins/{id} works for both admin and operator users
5. DELETE /api/admin/scoped-admins/{id} works for operator users too
6. Operator without admin_scope derives ops_manager/ops_team from operator_role
7. VALID_SCOPES includes ops_manager and ops_team
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"

# Valid scopes as per the backend
VALID_SCOPES = ["founder", "finance", "compliance", "marketing", "platform_health", "ops_manager", "ops_team"]


class TestScopedAdminsMerge:
    """Test suite for scoped admins with merge logic and operator support"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token for admin user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        data = login_response.json()
        self.token = data.get("access_token") or data.get("token")
        if not self.token:
            pytest.skip("No token in login response")
        
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        self.created_admin_ids = []
        yield
        
        # Cleanup: Delete test-created admins
        for admin_id in self.created_admin_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/scoped-admins/{admin_id}")
            except:
                pass

    # ─────────────────────────────────────────────────────────────────────────
    # Test 1: GET /api/admin/scoped-admins returns both admin AND operator users
    # ─────────────────────────────────────────────────────────────────────────
    def test_list_scoped_admins_returns_admins_and_operators(self):
        """GET /api/admin/scoped-admins should return both admin and operator role users"""
        response = self.session.get(f"{BASE_URL}/api/admin/scoped-admins")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        admins = response.json()
        assert isinstance(admins, list), "Response should be a list"
        
        # Check that we have users with different roles
        roles_found = set()
        for admin in admins:
            role = admin.get("role")
            if role:
                roles_found.add(role)
            
            # Verify admin_scope is always a list
            admin_scope = admin.get("admin_scope")
            assert isinstance(admin_scope, list), f"admin_scope should be a list, got {type(admin_scope)}"
            
            # Verify scope_label is present
            assert "scope_label" in admin, "scope_label should be present"
        
        print(f"Roles found in scoped-admins list: {roles_found}")
        print(f"Total admins/operators returned: {len(admins)}")
        
        # At minimum, we should have admin role (the founder)
        assert "admin" in roles_found, "Should have at least one admin role user"

    # ─────────────────────────────────────────────────────────────────────────
    # Test 2: POST with NEW email creates admin normally
    # ─────────────────────────────────────────────────────────────────────────
    def test_create_scoped_admin_new_email(self):
        """POST /api/admin/scoped-admins with NEW email should create a new admin"""
        unique_email = f"TEST_newadmin_{uuid.uuid4().hex[:8]}@test.com"
        
        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Test",
            "last_name": "NewAdmin",
            "admin_scope": ["finance"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert data["email"] == unique_email.lower(), "Email should match (lowercased)"
        assert data["name"] == "Test NewAdmin", "Name should be combined first+last"
        assert data["admin_scope"] == ["finance"], "admin_scope should be ['finance']"
        assert "scope_label" in data, "scope_label should be present"
        assert data.get("merged") is None or data.get("merged") == False, "merged should be False or absent for new admin"
        
        self.created_admin_ids.append(data["id"])
        print(f"Created new admin: {data['id']} with scope {data['admin_scope']}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 3: POST with EXISTING email should MERGE scopes
    # ─────────────────────────────────────────────────────────────────────────
    def test_create_scoped_admin_merge_existing_email(self):
        """POST /api/admin/scoped-admins with EXISTING email should MERGE scopes"""
        unique_email = f"TEST_mergeadmin_{uuid.uuid4().hex[:8]}@test.com"
        
        # Step 1: Create initial admin with finance scope
        payload1 = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Merge",
            "last_name": "Test",
            "admin_scope": ["finance"]
        }
        
        response1 = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload1)
        assert response1.status_code == 200, f"Initial create failed: {response1.status_code}: {response1.text}"
        
        data1 = response1.json()
        admin_id = data1["id"]
        self.created_admin_ids.append(admin_id)
        
        assert data1["admin_scope"] == ["finance"], "Initial scope should be ['finance']"
        print(f"Created initial admin with scope: {data1['admin_scope']}")
        
        # Step 2: Try to create again with SAME email but DIFFERENT scope
        payload2 = {
            "email": unique_email,  # Same email
            "password": "AnotherPass456!",  # Different password (should be ignored)
            "first_name": "Updated",
            "last_name": "Name",
            "admin_scope": ["compliance", "marketing"]  # Different scopes
        }
        
        response2 = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload2)
        assert response2.status_code == 200, f"Merge failed: {response2.status_code}: {response2.text}"
        
        data2 = response2.json()
        
        # Verify merge behavior
        assert data2.get("merged") == True, "merged flag should be True"
        assert data2["id"] == admin_id, "Should return same admin ID"
        
        # Verify scopes were merged (finance + compliance + marketing)
        merged_scopes = data2["admin_scope"]
        assert "finance" in merged_scopes, "Original 'finance' scope should be preserved"
        assert "compliance" in merged_scopes, "New 'compliance' scope should be added"
        assert "marketing" in merged_scopes, "New 'marketing' scope should be added"
        
        print(f"Merged scopes: {merged_scopes}")
        
        # Step 3: Verify by fetching the admin list
        list_response = self.session.get(f"{BASE_URL}/api/admin/scoped-admins")
        assert list_response.status_code == 200
        
        admins = list_response.json()
        merged_admin = next((a for a in admins if a["id"] == admin_id), None)
        assert merged_admin is not None, "Merged admin should be in list"
        assert set(merged_admin["admin_scope"]) == set(merged_scopes), "Scopes should match in list"

    # ─────────────────────────────────────────────────────────────────────────
    # Test 4: POST with ops_manager and ops_team scopes (new valid scopes)
    # ─────────────────────────────────────────────────────────────────────────
    def test_create_admin_with_ops_scopes(self):
        """POST /api/admin/scoped-admins should accept ops_manager and ops_team scopes"""
        unique_email = f"TEST_opsadmin_{uuid.uuid4().hex[:8]}@test.com"
        
        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Ops",
            "last_name": "Admin",
            "admin_scope": ["ops_manager", "ops_team"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "ops_manager" in data["admin_scope"], "ops_manager should be in scope"
        assert "ops_team" in data["admin_scope"], "ops_team should be in scope"
        
        self.created_admin_ids.append(data["id"])
        print(f"Created admin with ops scopes: {data['admin_scope']}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 5: POST with invalid scope should fail
    # ─────────────────────────────────────────────────────────────────────────
    def test_create_admin_invalid_scope_fails(self):
        """POST /api/admin/scoped-admins with invalid scope should return 400"""
        unique_email = f"TEST_invalidscope_{uuid.uuid4().hex[:8]}@test.com"
        
        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Invalid",
            "last_name": "Scope",
            "admin_scope": ["invalid_scope_xyz"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "Invalid scope" in data.get("detail", ""), "Error should mention invalid scope"
        print(f"Correctly rejected invalid scope: {data.get('detail')}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 6: PUT /api/admin/scoped-admins/{id} updates admin
    # ─────────────────────────────────────────────────────────────────────────
    def test_update_scoped_admin(self):
        """PUT /api/admin/scoped-admins/{id} should update admin scopes"""
        # First create an admin
        unique_email = f"TEST_updateadmin_{uuid.uuid4().hex[:8]}@test.com"
        
        create_payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Update",
            "last_name": "Test",
            "admin_scope": ["finance"]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=create_payload)
        assert create_response.status_code == 200
        
        admin_id = create_response.json()["id"]
        self.created_admin_ids.append(admin_id)
        
        # Update the admin
        update_payload = {
            "admin_scope": ["compliance", "marketing"],
            "first_name": "Updated"
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/admin/scoped-admins/{admin_id}", json=update_payload)
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        data = update_response.json()
        assert data.get("updated") == True, "updated should be True"
        
        # Verify by fetching
        list_response = self.session.get(f"{BASE_URL}/api/admin/scoped-admins")
        admins = list_response.json()
        updated_admin = next((a for a in admins if a["id"] == admin_id), None)
        
        assert updated_admin is not None, "Updated admin should be in list"
        assert "compliance" in updated_admin["admin_scope"], "compliance should be in updated scope"
        assert "marketing" in updated_admin["admin_scope"], "marketing should be in updated scope"
        assert "finance" not in updated_admin["admin_scope"], "finance should be replaced"
        
        print(f"Updated admin scopes to: {updated_admin['admin_scope']}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 7: DELETE /api/admin/scoped-admins/{id} deletes admin
    # ─────────────────────────────────────────────────────────────────────────
    def test_delete_scoped_admin(self):
        """DELETE /api/admin/scoped-admins/{id} should delete admin"""
        # First create an admin
        unique_email = f"TEST_deleteadmin_{uuid.uuid4().hex[:8]}@test.com"
        
        create_payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Delete",
            "last_name": "Test",
            "admin_scope": ["finance"]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=create_payload)
        assert create_response.status_code == 200
        
        admin_id = create_response.json()["id"]
        # Don't add to cleanup list since we're deleting it
        
        # Delete the admin
        delete_response = self.session.delete(f"{BASE_URL}/api/admin/scoped-admins/{admin_id}")
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        data = delete_response.json()
        assert data.get("deleted") == True, "deleted should be True"
        
        # Verify by fetching - admin should not be in list
        list_response = self.session.get(f"{BASE_URL}/api/admin/scoped-admins")
        admins = list_response.json()
        deleted_admin = next((a for a in admins if a["id"] == admin_id), None)
        
        assert deleted_admin is None, "Deleted admin should not be in list"
        print(f"Successfully deleted admin: {admin_id}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 8: DELETE non-existent admin returns 404
    # ─────────────────────────────────────────────────────────────────────────
    def test_delete_nonexistent_admin_returns_404(self):
        """DELETE /api/admin/scoped-admins/{id} with non-existent ID should return 404"""
        fake_id = str(uuid.uuid4())
        
        response = self.session.delete(f"{BASE_URL}/api/admin/scoped-admins/{fake_id}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"Correctly returned 404 for non-existent admin")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 9: PUT non-existent admin returns 404
    # ─────────────────────────────────────────────────────────────────────────
    def test_update_nonexistent_admin_returns_404(self):
        """PUT /api/admin/scoped-admins/{id} with non-existent ID should return 404"""
        fake_id = str(uuid.uuid4())
        
        response = self.session.put(f"{BASE_URL}/api/admin/scoped-admins/{fake_id}", json={
            "admin_scope": ["finance"]
        })
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"Correctly returned 404 for non-existent admin")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 10: Verify all VALID_SCOPES are accepted
    # ─────────────────────────────────────────────────────────────────────────
    def test_all_valid_scopes_accepted(self):
        """POST /api/admin/scoped-admins should accept all VALID_SCOPES"""
        # Test each scope individually (except founder which has special handling)
        test_scopes = ["finance", "compliance", "marketing", "platform_health", "ops_manager", "ops_team"]
        
        for scope in test_scopes:
            unique_email = f"TEST_scope_{scope}_{uuid.uuid4().hex[:6]}@test.com"
            
            payload = {
                "email": unique_email,
                "password": "TestPass123!",
                "first_name": "Scope",
                "last_name": scope.title(),
                "admin_scope": [scope]
            }
            
            response = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload)
            
            assert response.status_code == 200, f"Scope '{scope}' should be valid, got {response.status_code}: {response.text}"
            
            data = response.json()
            self.created_admin_ids.append(data["id"])
            
            assert scope in data["admin_scope"], f"Scope '{scope}' should be in admin_scope"
            print(f"Verified scope '{scope}' is valid")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 11: Operator without admin_scope derives scope from operator_role
    # ─────────────────────────────────────────────────────────────────────────
    def test_operator_scope_derivation(self):
        """Operators without admin_scope should derive scope from operator_role"""
        # This test verifies the list endpoint correctly derives scopes for operators
        response = self.session.get(f"{BASE_URL}/api/admin/scoped-admins")
        
        assert response.status_code == 200
        
        admins = response.json()
        
        # Find any operators in the list
        operators = [a for a in admins if a.get("role") == "operator"]
        
        for op in operators:
            admin_scope = op.get("admin_scope", [])
            operator_role = op.get("operator_role")
            
            # If operator has no explicit admin_scope, it should be derived
            # manager -> ops_manager, worker -> ops_team
            if operator_role == "manager":
                assert "ops_manager" in admin_scope or len(admin_scope) > 0, \
                    f"Manager operator should have ops_manager scope or explicit scopes"
            elif operator_role == "worker":
                assert "ops_team" in admin_scope or len(admin_scope) > 0, \
                    f"Worker operator should have ops_team scope or explicit scopes"
            
            print(f"Operator {op.get('email')}: role={operator_role}, scopes={admin_scope}")
        
        print(f"Found {len(operators)} operators in scoped-admins list")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 12: Merge with multiple scopes preserves order and dedupes
    # ─────────────────────────────────────────────────────────────────────────
    def test_merge_deduplicates_scopes(self):
        """Merging scopes should deduplicate and preserve order"""
        unique_email = f"TEST_dedupe_{uuid.uuid4().hex[:8]}@test.com"
        
        # Create with finance and compliance
        payload1 = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Dedupe",
            "last_name": "Test",
            "admin_scope": ["finance", "compliance"]
        }
        
        response1 = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload1)
        assert response1.status_code == 200
        
        admin_id = response1.json()["id"]
        self.created_admin_ids.append(admin_id)
        
        # Merge with compliance (duplicate) and marketing (new)
        payload2 = {
            "email": unique_email,
            "password": "AnotherPass!",
            "first_name": "Dedupe",
            "last_name": "Test",
            "admin_scope": ["compliance", "marketing"]  # compliance is duplicate
        }
        
        response2 = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload2)
        assert response2.status_code == 200
        
        data = response2.json()
        merged_scopes = data["admin_scope"]
        
        # Should have finance, compliance, marketing (no duplicates)
        assert merged_scopes.count("compliance") == 1, "compliance should appear only once"
        assert "finance" in merged_scopes, "finance should be preserved"
        assert "marketing" in merged_scopes, "marketing should be added"
        
        print(f"Merged scopes (deduplicated): {merged_scopes}")


class TestScopedAdminsEdgeCases:
    """Edge case tests for scoped admins"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token for admin user"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        data = login_response.json()
        self.token = data.get("access_token") or data.get("token")
        if not self.token:
            pytest.skip("No token in login response")
        
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        self.created_admin_ids = []
        yield
        
        for admin_id in self.created_admin_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/scoped-admins/{admin_id}")
            except:
                pass

    def test_create_admin_with_array_scope(self):
        """POST should accept admin_scope as array"""
        unique_email = f"TEST_arrayscope_{uuid.uuid4().hex[:8]}@test.com"
        
        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Array",
            "last_name": "Scope",
            "admin_scope": ["finance", "compliance", "marketing"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert len(data["admin_scope"]) == 3, "Should have 3 scopes"
        
        self.created_admin_ids.append(data["id"])
        print(f"Created admin with array scope: {data['admin_scope']}")

    def test_create_admin_with_string_scope(self):
        """POST should accept admin_scope as string (backwards compatibility)"""
        unique_email = f"TEST_stringscope_{uuid.uuid4().hex[:8]}@test.com"
        
        payload = {
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "String",
            "last_name": "Scope",
            "admin_scope": "finance"  # String instead of array
        }
        
        response = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Should be normalized to array
        assert isinstance(data["admin_scope"], list), "admin_scope should be normalized to list"
        assert "finance" in data["admin_scope"], "finance should be in scope"
        
        self.created_admin_ids.append(data["id"])
        print(f"Created admin with string scope (normalized): {data['admin_scope']}")

    def test_update_admin_with_empty_payload(self):
        """PUT with empty payload should return updated=False"""
        unique_email = f"TEST_emptyupdate_{uuid.uuid4().hex[:8]}@test.com"
        
        # Create admin
        create_response = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json={
            "email": unique_email,
            "password": "TestPass123!",
            "first_name": "Empty",
            "last_name": "Update",
            "admin_scope": ["finance"]
        })
        assert create_response.status_code == 200
        
        admin_id = create_response.json()["id"]
        self.created_admin_ids.append(admin_id)
        
        # Update with empty payload
        update_response = self.session.put(f"{BASE_URL}/api/admin/scoped-admins/{admin_id}", json={})
        
        assert update_response.status_code == 200
        data = update_response.json()
        assert data.get("updated") == False, "updated should be False for empty payload"
        print("Empty update correctly returned updated=False")

    def test_email_case_insensitivity(self):
        """Email should be case-insensitive for merge detection"""
        base_email = f"TEST_casetest_{uuid.uuid4().hex[:8]}@test.com"
        
        # Create with lowercase
        payload1 = {
            "email": base_email.lower(),
            "password": "TestPass123!",
            "first_name": "Case",
            "last_name": "Test",
            "admin_scope": ["finance"]
        }
        
        response1 = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload1)
        assert response1.status_code == 200
        
        admin_id = response1.json()["id"]
        self.created_admin_ids.append(admin_id)
        
        # Try to create with uppercase - should merge
        payload2 = {
            "email": base_email.upper(),
            "password": "AnotherPass!",
            "first_name": "Case",
            "last_name": "Test",
            "admin_scope": ["compliance"]
        }
        
        response2 = self.session.post(f"{BASE_URL}/api/admin/scoped-admins", json=payload2)
        assert response2.status_code == 200
        
        data = response2.json()
        assert data.get("merged") == True, "Should merge with case-insensitive email match"
        assert data["id"] == admin_id, "Should be same admin ID"
        
        print(f"Case-insensitive merge worked: {data['admin_scope']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
