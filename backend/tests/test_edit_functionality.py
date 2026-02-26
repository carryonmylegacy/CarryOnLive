"""
Test Edit Functionality for Beneficiaries and Documents
Tests PUT /api/beneficiaries/{id} and PUT /api/documents/{id} endpoints
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
BENEFACTOR_EMAIL = "barnetharris@gmail.com"
BENEFACTOR_PASSWORD = "Blh9170873"


class TestEditFunctionality:
    """Test edit functionality for beneficiaries and documents"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token using dev-login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip(f"Authentication failed: {response.text}")
        return response.json()["access_token"]

    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
        }

    @pytest.fixture(scope="class")
    def estate_id(self, auth_headers):
        """Get estate ID for the benefactor"""
        response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get estates: {response.text}"
        estates = response.json()
        assert len(estates) > 0, "No estates found for benefactor"
        return estates[0]["id"]

    # ==================== BENEFICIARY EDIT TESTS ====================

    def test_get_beneficiaries(self, auth_headers, estate_id):
        """Test GET /api/beneficiaries/{estate_id} - list all beneficiaries"""
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers
        )
        assert response.status_code == 200, (
            f"Failed to get beneficiaries: {response.text}"
        )
        beneficiaries = response.json()
        print(f"Found {len(beneficiaries)} beneficiaries")
        return beneficiaries

    def test_create_test_beneficiary(self, auth_headers, estate_id):
        """Create a test beneficiary for edit testing"""
        payload = {
            "estate_id": estate_id,
            "first_name": "TEST_Edit",
            "middle_name": "Middle",
            "last_name": "Beneficiary",
            "suffix": "",
            "email": f"test_edit_{int(time.time())}@example.com",
            "phone": "+1-555-0199",
            "relation": "Friend",
            "date_of_birth": "1990-01-15",
            "gender": "male",
            "address_street": "123 Test Street",
            "address_city": "Test City",
            "address_state": "CA",
            "address_zip": "90210",
            "ssn_last_four": "1234",
            "notes": "Original notes",
            "avatar_color": "#d4af37",
        }

        response = requests.post(
            f"{BASE_URL}/api/beneficiaries", json=payload, headers=auth_headers
        )
        assert response.status_code == 200, (
            f"Failed to create beneficiary: {response.text}"
        )

        beneficiary = response.json()
        assert beneficiary["first_name"] == "TEST_Edit"
        assert beneficiary["last_name"] == "Beneficiary"
        print(f"Created test beneficiary with ID: {beneficiary['id']}")
        return beneficiary

    def test_update_beneficiary(self, auth_headers, estate_id):
        """Test PUT /api/beneficiaries/{id} - update beneficiary"""
        # First create a test beneficiary
        create_payload = {
            "estate_id": estate_id,
            "first_name": "TEST_Update",
            "middle_name": "",
            "last_name": "Original",
            "suffix": "",
            "email": f"test_update_{int(time.time())}@example.com",
            "phone": "+1-555-0100",
            "relation": "Friend",
            "date_of_birth": "1985-06-20",
            "gender": "female",
            "address_street": "456 Original St",
            "address_city": "Original City",
            "address_state": "NY",
            "address_zip": "10001",
            "ssn_last_four": "5678",
            "notes": "Original notes before edit",
            "avatar_color": "#3b82f6",
        }

        create_response = requests.post(
            f"{BASE_URL}/api/beneficiaries", json=create_payload, headers=auth_headers
        )
        assert create_response.status_code == 200, (
            f"Failed to create beneficiary: {create_response.text}"
        )
        beneficiary = create_response.json()
        beneficiary_id = beneficiary["id"]

        # Now update the beneficiary
        update_payload = {
            "estate_id": estate_id,
            "first_name": "TEST_Updated",
            "middle_name": "NewMiddle",
            "last_name": "Modified",
            "suffix": "Jr.",
            "email": beneficiary["email"],  # Keep same email
            "phone": "+1-555-9999",
            "relation": "Sibling",
            "date_of_birth": "1985-06-20",
            "gender": "female",
            "address_street": "789 Updated Ave",
            "address_city": "Updated City",
            "address_state": "TX",
            "address_zip": "75001",
            "ssn_last_four": "9999",
            "notes": "Updated notes after edit",
            "avatar_color": "#10b981",
        }

        update_response = requests.put(
            f"{BASE_URL}/api/beneficiaries/{beneficiary_id}",
            json=update_payload,
            headers=auth_headers,
        )
        assert update_response.status_code == 200, (
            f"Failed to update beneficiary: {update_response.text}"
        )

        updated = update_response.json()

        # Verify all fields were updated
        assert updated["first_name"] == "TEST_Updated", (
            f"First name not updated: {updated['first_name']}"
        )
        assert updated["middle_name"] == "NewMiddle", (
            f"Middle name not updated: {updated['middle_name']}"
        )
        assert updated["last_name"] == "Modified", (
            f"Last name not updated: {updated['last_name']}"
        )
        assert updated["suffix"] == "Jr.", f"Suffix not updated: {updated['suffix']}"
        assert updated["relation"] == "Sibling", (
            f"Relation not updated: {updated['relation']}"
        )
        assert updated["phone"] == "+1-555-9999", (
            f"Phone not updated: {updated['phone']}"
        )
        assert updated["address_street"] == "789 Updated Ave", (
            f"Address not updated: {updated['address_street']}"
        )
        assert updated["address_city"] == "Updated City", (
            f"City not updated: {updated['address_city']}"
        )
        assert updated["address_state"] == "TX", (
            f"State not updated: {updated['address_state']}"
        )
        assert updated["notes"] == "Updated notes after edit", (
            f"Notes not updated: {updated['notes']}"
        )
        assert updated["avatar_color"] == "#10b981", (
            f"Avatar color not updated: {updated['avatar_color']}"
        )

        print(f"✓ Successfully updated beneficiary {beneficiary_id}")
        print(f"  Name: {updated['name']}")
        print(f"  Relation: {updated['relation']}")
        print(
            f"  Address: {updated['address_street']}, {updated['address_city']}, {updated['address_state']}"
        )

        # Cleanup - delete test beneficiary
        delete_response = requests.delete(
            f"{BASE_URL}/api/beneficiaries/{beneficiary_id}", headers=auth_headers
        )
        assert delete_response.status_code == 200, (
            f"Failed to delete test beneficiary: {delete_response.text}"
        )
        print(f"✓ Cleaned up test beneficiary {beneficiary_id}")

        return updated

    def test_update_beneficiary_not_found(self, auth_headers, estate_id):
        """Test PUT /api/beneficiaries/{id} with non-existent ID"""
        update_payload = {
            "estate_id": estate_id,
            "first_name": "Test",
            "last_name": "User",
            "email": "test@example.com",
            "relation": "Friend",
        }

        response = requests.put(
            f"{BASE_URL}/api/beneficiaries/non-existent-id-12345",
            json=update_payload,
            headers=auth_headers,
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Correctly returns 404 for non-existent beneficiary")

    # ==================== DOCUMENT EDIT TESTS ====================

    def test_get_documents(self, auth_headers, estate_id):
        """Test GET /api/documents/{estate_id} - list all documents"""
        response = requests.get(
            f"{BASE_URL}/api/documents/{estate_id}", headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get documents: {response.text}"
        documents = response.json()
        print(f"Found {len(documents)} documents")
        return documents

    def test_update_document(self, auth_headers, estate_id):
        """Test PUT /api/documents/{id} - update document metadata"""
        # First get existing documents
        docs_response = requests.get(
            f"{BASE_URL}/api/documents/{estate_id}", headers=auth_headers
        )
        assert docs_response.status_code == 200
        documents = docs_response.json()

        if len(documents) == 0:
            pytest.skip("No documents available to test edit functionality")

        # Pick the first document to update
        doc = documents[0]
        doc_id = doc["id"]
        original_name = doc.get("name", "Unknown")
        original_category = doc.get("category", "legal")

        print(f"Testing update on document: {original_name} (ID: {doc_id})")

        # Update document using Form data (as per backend implementation)
        update_data = {
            "name": f"EDITED_{original_name}",
            "category": "financial" if original_category != "financial" else "legal",
            "notes": "Updated via test at " + str(int(time.time())),
        }

        # Note: Backend expects Form data, not JSON
        update_response = requests.put(
            f"{BASE_URL}/api/documents/{doc_id}",
            data=update_data,  # Form data
            headers={
                "Authorization": auth_headers["Authorization"]
            },  # No Content-Type for form data
        )

        assert update_response.status_code == 200, (
            f"Failed to update document: {update_response.text}"
        )

        updated = update_response.json()
        assert updated["name"] == update_data["name"], (
            f"Name not updated: {updated['name']}"
        )
        assert updated["category"] == update_data["category"], (
            f"Category not updated: {updated['category']}"
        )
        assert updated["notes"] == update_data["notes"], (
            f"Notes not updated: {updated.get('notes')}"
        )

        print(f"✓ Successfully updated document {doc_id}")
        print(f"  Name: {original_name} -> {updated['name']}")
        print(f"  Category: {original_category} -> {updated['category']}")
        print(f"  Notes: {updated.get('notes')}")

        # Restore original values
        restore_data = {
            "name": original_name,
            "category": original_category,
            "notes": doc.get("notes", ""),
        }
        restore_response = requests.put(
            f"{BASE_URL}/api/documents/{doc_id}",
            data=restore_data,
            headers={"Authorization": auth_headers["Authorization"]},
        )
        assert restore_response.status_code == 200, (
            f"Failed to restore document: {restore_response.text}"
        )
        print("✓ Restored document to original values")

        return updated

    def test_update_document_not_found(self, auth_headers):
        """Test PUT /api/documents/{id} with non-existent ID"""
        update_data = {"name": "Test Document", "category": "legal"}

        response = requests.put(
            f"{BASE_URL}/api/documents/non-existent-doc-id-12345",
            data=update_data,
            headers={"Authorization": auth_headers["Authorization"]},
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Correctly returns 404 for non-existent document")

    def test_update_document_partial(self, auth_headers, estate_id):
        """Test partial update - only update name, leave other fields"""
        docs_response = requests.get(
            f"{BASE_URL}/api/documents/{estate_id}", headers=auth_headers
        )
        documents = docs_response.json()

        if len(documents) == 0:
            pytest.skip("No documents available to test partial update")

        doc = documents[0]
        doc_id = doc["id"]
        original_name = doc.get("name", "Unknown")
        original_category = doc.get("category", "legal")

        # Only update name
        update_data = {"name": f"PARTIAL_UPDATE_{original_name}"}

        response = requests.put(
            f"{BASE_URL}/api/documents/{doc_id}",
            data=update_data,
            headers={"Authorization": auth_headers["Authorization"]},
        )

        assert response.status_code == 200, f"Partial update failed: {response.text}"
        updated = response.json()

        # Name should be updated
        assert updated["name"] == update_data["name"]
        # Category should remain unchanged
        assert updated["category"] == original_category, (
            f"Category changed unexpectedly: {updated['category']}"
        )

        print("✓ Partial update successful - only name changed, category preserved")

        # Restore
        requests.put(
            f"{BASE_URL}/api/documents/{doc_id}",
            data={"name": original_name},
            headers={"Authorization": auth_headers["Authorization"]},
        )
        print("✓ Restored document name")


class TestCleanup:
    """Cleanup test data"""

    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": BENEFACTOR_EMAIL, "password": BENEFACTOR_PASSWORD},
        )
        if response.status_code != 200:
            pytest.skip("Authentication failed")
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    @pytest.fixture(scope="class")
    def estate_id(self, auth_headers):
        """Get estate ID"""
        response = requests.get(f"{BASE_URL}/api/estates", headers=auth_headers)
        if response.status_code != 200 or len(response.json()) == 0:
            pytest.skip("No estates found")
        return response.json()[0]["id"]

    def test_cleanup_test_beneficiaries(self, auth_headers, estate_id):
        """Clean up any TEST_ prefixed beneficiaries"""
        response = requests.get(
            f"{BASE_URL}/api/beneficiaries/{estate_id}", headers=auth_headers
        )
        if response.status_code != 200:
            return

        beneficiaries = response.json()
        deleted_count = 0

        for ben in beneficiaries:
            if ben.get("first_name", "").startswith("TEST_"):
                delete_response = requests.delete(
                    f"{BASE_URL}/api/beneficiaries/{ben['id']}", headers=auth_headers
                )
                if delete_response.status_code == 200:
                    deleted_count += 1
                    print(
                        f"Deleted test beneficiary: {ben['first_name']} {ben['last_name']}"
                    )

        print(f"✓ Cleaned up {deleted_count} test beneficiaries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
