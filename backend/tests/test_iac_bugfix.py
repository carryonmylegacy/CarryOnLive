"""
Test IAC (Immediate Action Checklist) Bug Fix - Iteration 52
Tests for activation_status and is_default fields in ChecklistItemUpdate model
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestIACActivationStatus:
    """Tests for IAC checklist activation_status and is_default field updates"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        # Use test account credentials
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"}
        )
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
            
            # Get estate ID
            estates_res = requests.get(f"{BASE_URL}/api/estates", headers=self.headers)
            if estates_res.status_code == 200 and len(estates_res.json()) > 0:
                self.estate_id = estates_res.json()[0]["id"]
            else:
                pytest.skip("No estate found")
        else:
            pytest.skip("Authentication failed")
    
    def test_get_checklists_returns_is_default_field(self):
        """GET /api/checklists/{estate_id} should return is_default field"""
        response = requests.get(
            f"{BASE_URL}/api/checklists/{self.estate_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        items = response.json()
        assert len(items) > 0, "Should have checklist items"
        
        # Verify is_default field exists
        first_item = items[0]
        assert "is_default" in first_item, "is_default field should be present"
        assert isinstance(first_item["is_default"], bool), "is_default should be boolean"
    
    def test_get_checklists_returns_activation_status_field(self):
        """GET /api/checklists/{estate_id} should return activation_status field"""
        response = requests.get(
            f"{BASE_URL}/api/checklists/{self.estate_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        items = response.json()
        assert len(items) > 0, "Should have checklist items"
        
        # Verify activation_status field exists (can be null)
        first_item = items[0]
        assert "activation_status" in first_item, "activation_status field should be present"
    
    def test_put_checklist_with_activation_status_accepted(self):
        """PUT /api/checklists/{id} with activation_status='accepted' should succeed"""
        # First get a checklist item
        response = requests.get(
            f"{BASE_URL}/api/checklists/{self.estate_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        items = response.json()
        assert len(items) > 0
        
        # Find an item to update
        item_id = items[0]["id"]
        
        # Update with activation_status (this was failing before the fix with "No fields to update")
        update_response = requests.put(
            f"{BASE_URL}/api/checklists/{item_id}",
            headers=self.headers,
            json={"activation_status": "accepted"}
        )
        assert update_response.status_code == 200, f"PUT should succeed, got: {update_response.text}"
        
        # Verify the update
        updated_item = update_response.json()
        assert updated_item["activation_status"] == "accepted"
    
    def test_put_checklist_with_activation_status_edited(self):
        """PUT /api/checklists/{id} with activation_status='edited' should succeed"""
        response = requests.get(
            f"{BASE_URL}/api/checklists/{self.estate_id}",
            headers=self.headers
        )
        items = response.json()
        item_id = items[1]["id"] if len(items) > 1 else items[0]["id"]
        
        # Update with activation_status='edited' and a title change
        update_response = requests.put(
            f"{BASE_URL}/api/checklists/{item_id}",
            headers=self.headers,
            json={"activation_status": "edited", "title": "Updated title for test"}
        )
        assert update_response.status_code == 200
        assert update_response.json()["activation_status"] == "edited"
    
    def test_put_checklist_with_activation_status_removed(self):
        """PUT /api/checklists/{id} with activation_status='removed' should succeed"""
        response = requests.get(
            f"{BASE_URL}/api/checklists/{self.estate_id}",
            headers=self.headers
        )
        items = response.json()
        # Find a suitable item (not already removed)
        item_to_update = None
        for item in items:
            if item.get("activation_status") != "removed":
                item_to_update = item
                break
        
        if not item_to_update:
            pytest.skip("No suitable item to test removal")
        
        item_id = item_to_update["id"]
        
        update_response = requests.put(
            f"{BASE_URL}/api/checklists/{item_id}",
            headers=self.headers,
            json={"activation_status": "removed"}
        )
        assert update_response.status_code == 200
        assert update_response.json()["activation_status"] == "removed"
    
    def test_default_iac_items_have_category_immediate(self):
        """Default IAC items should have category='immediate'"""
        response = requests.get(
            f"{BASE_URL}/api/checklists/{self.estate_id}",
            headers=self.headers
        )
        assert response.status_code == 200
        items = response.json()
        
        # Check that default items have immediate category
        default_items = [i for i in items if i.get("is_default") == True]
        immediate_items = [i for i in default_items if i.get("category") == "immediate"]
        
        # At least some default items should be immediate
        assert len(immediate_items) > 0, "Should have immediate category items"


class TestSignupProgressStepper:
    """Code review verification for signup progress bubbles fix"""
    
    def test_signup_page_loads(self):
        """Verify signup page loads without errors"""
        response = requests.get(f"{BASE_URL}/signup")
        # Frontend routes return HTML regardless of status
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
