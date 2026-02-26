#!/usr/bin/env python3
"""
CarryOn™ IAC (Immediate Action Checklist) CRUD Endpoints Test
Testing all CRUD operations with the new contact fields as per review request
"""
import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend/.env
BACKEND_URL = "https://platform-handoff.preview.emergentagent.com/api"

def print_test_result(test_name, success, details=""):
    """Print colored test results"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    if details:
        print(f"   {details}")
    print()

def test_auth_flow():
    """Test authentication and get access token"""
    print("🔐 Testing Authentication Flow...")
    
    # Step 1: Dev login
    login_data = {
        "email": "audit2@test.com",
        "password": "AuditPass123!@#"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/auth/dev-login", json=login_data)
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            print_test_result("Dev Login", True, f"Token received: {token[:20]}...")
            return token
        else:
            print_test_result("Dev Login", False, f"Status: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        print_test_result("Dev Login", False, f"Exception: {str(e)}")
        return None

def get_estate_id(headers):
    """Get estate ID for testing"""
    print("🏡 Getting Estate ID...")
    
    try:
        response = requests.get(f"{BACKEND_URL}/estates", headers=headers)
        if response.status_code == 200:
            estates = response.json()
            if estates and len(estates) > 0:
                estate_id = estates[0]["id"]
                print_test_result("Get Estates", True, f"Using estate_id: {estate_id}")
                return estate_id
            else:
                print_test_result("Get Estates", False, "No estates found")
                return None
        else:
            print_test_result("Get Estates", False, f"Status: {response.status_code}, Response: {response.text}")
            return None
    except Exception as e:
        print_test_result("Get Estates", False, f"Exception: {str(e)}")
        return None

def test_create_checklist_items(estate_id, headers):
    """Test creating checklist items with full fields"""
    print("➕ Testing Checklist Creation...")
    
    # Create first item with full fields
    item1_data = {
        "estate_id": estate_id,
        "title": "Call State Farm for life insurance claim",
        "description": "Policy #LF-123456. Call claims dept.",
        "category": "insurance",
        "priority": "critical",
        "action_type": "call",
        "contact_name": "State Farm Claims",
        "contact_phone": "1-800-732-5246",
        "contact_email": "claims@statefarm.com",
        "due_timeframe": "immediate"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/checklists", json=item1_data, headers=headers)
        if response.status_code == 200:
            item1 = response.json()
            item1_id = item1.get("id")
            
            # Verify all fields are returned
            required_fields = ["id", "estate_id", "title", "description", "category", "priority", 
                             "action_type", "contact_name", "contact_phone", "contact_email", "due_timeframe"]
            missing_fields = [field for field in required_fields if field not in item1]
            
            if not missing_fields:
                print_test_result("Create Checklist Item 1", True, 
                                f"Item created successfully with all fields. ID: {item1_id}")
            else:
                print_test_result("Create Checklist Item 1", False, 
                                f"Missing fields: {missing_fields}")
                return None, None
        else:
            print_test_result("Create Checklist Item 1", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
            return None, None
    except Exception as e:
        print_test_result("Create Checklist Item 1", False, f"Exception: {str(e)}")
        return None, None
    
    # Create second item
    item2_data = {
        "estate_id": estate_id,
        "title": "File will with probate court",
        "category": "legal",
        "priority": "high",
        "action_type": "file_paperwork",
        "contact_address": "123 Court St",
        "due_timeframe": "first_week"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/checklists", json=item2_data, headers=headers)
        if response.status_code == 200:
            item2 = response.json()
            item2_id = item2.get("id")
            print_test_result("Create Checklist Item 2", True, 
                            f"Item created successfully. ID: {item2_id}")
            return item1_id, item2_id
        else:
            print_test_result("Create Checklist Item 2", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
            return item1_id, None
    except Exception as e:
        print_test_result("Create Checklist Item 2", False, f"Exception: {str(e)}")
        return item1_id, None

def test_get_checklists(estate_id, headers, expected_count=2):
    """Test retrieving checklists and verify all fields"""
    print("📋 Testing Get Checklists...")
    
    try:
        response = requests.get(f"{BACKEND_URL}/checklists/{estate_id}", headers=headers)
        if response.status_code == 200:
            items = response.json()
            
            if len(items) >= expected_count:
                # Check first item has all the new fields
                item = items[0]
                contact_fields = ["contact_name", "contact_phone", "contact_email", "contact_address"]
                present_contact_fields = [field for field in contact_fields if field in item and item[field] is not None]
                
                print_test_result("Get Checklists", True, 
                                f"Retrieved {len(items)} items. Contact fields present: {present_contact_fields}")
                return items
            else:
                print_test_result("Get Checklists", False, 
                                f"Expected at least {expected_count} items, got {len(items)}")
                return items
        else:
            print_test_result("Get Checklists", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
            return []
    except Exception as e:
        print_test_result("Get Checklists", False, f"Exception: {str(e)}")
        return []

def test_update_checklist_item(item_id, headers):
    """Test updating a checklist item"""
    print("✏️ Testing Update Checklist Item...")
    
    update_data = {
        "title": "Call State Farm - URGENT"
    }
    
    try:
        response = requests.put(f"{BACKEND_URL}/checklists/{item_id}", json=update_data, headers=headers)
        if response.status_code == 200:
            updated_item = response.json()
            if updated_item.get("title") == "Call State Farm - URGENT":
                print_test_result("Update Checklist Item", True, 
                                f"Title updated successfully to: {updated_item.get('title')}")
                return True
            else:
                print_test_result("Update Checklist Item", False, 
                                f"Title not updated correctly. Got: {updated_item.get('title')}")
                return False
        else:
            print_test_result("Update Checklist Item", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        print_test_result("Update Checklist Item", False, f"Exception: {str(e)}")
        return False

def test_toggle_checklist_item(item_id, headers):
    """Test toggling checklist item completion"""
    print("🔄 Testing Toggle Checklist Item...")
    
    try:
        response = requests.patch(f"{BACKEND_URL}/checklists/{item_id}/toggle", headers=headers)
        if response.status_code == 200:
            result = response.json()
            if result.get("is_completed") == True:
                print_test_result("Toggle Checklist Item", True, 
                                f"Item marked as completed: {result.get('is_completed')}")
                return True
            else:
                print_test_result("Toggle Checklist Item", False, 
                                f"Unexpected completion status: {result.get('is_completed')}")
                return False
        else:
            print_test_result("Toggle Checklist Item", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        print_test_result("Toggle Checklist Item", False, f"Exception: {str(e)}")
        return False

def test_delete_checklist_item(item_id, headers):
    """Test deleting a checklist item"""
    print("🗑️ Testing Delete Checklist Item...")
    
    try:
        response = requests.delete(f"{BACKEND_URL}/checklists/{item_id}", headers=headers)
        if response.status_code == 200:
            result = response.json()
            if result.get("success") == True:
                print_test_result("Delete Checklist Item", True, 
                                f"Item deleted successfully: {result.get('message')}")
                return True
            else:
                print_test_result("Delete Checklist Item", False, 
                                f"Delete response unexpected: {result}")
                return False
        else:
            print_test_result("Delete Checklist Item", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        print_test_result("Delete Checklist Item", False, f"Exception: {str(e)}")
        return False

def test_reorder_checklists(item_id, headers):
    """Test reordering checklists"""
    print("🔢 Testing Reorder Checklists...")
    
    reorder_data = {
        "item_ids": [item_id]
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/checklists/reorder", json=reorder_data, headers=headers)
        if response.status_code == 200:
            result = response.json()
            if result.get("success") == True:
                print_test_result("Reorder Checklists", True, 
                                f"Reorder successful: {result.get('message')}")
                return True
            else:
                print_test_result("Reorder Checklists", False, 
                                f"Reorder response unexpected: {result}")
                return False
        else:
            print_test_result("Reorder Checklists", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        print_test_result("Reorder Checklists", False, f"Exception: {str(e)}")
        return False

def main():
    """Main test function following the specified test steps"""
    print("🚀 CarryOn™ IAC (Immediate Action Checklist) CRUD Endpoints Test")
    print("=" * 70)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test started at: {datetime.now().isoformat()}")
    print()
    
    # Test tracking
    passed_tests = 0
    total_tests = 0
    
    # Step 1: Authenticate
    token = test_auth_flow()
    if not token:
        print("❌ Authentication failed - cannot continue tests")
        return
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Step 2: Get estate ID
    estate_id = get_estate_id(headers)
    if not estate_id:
        print("❌ Estate ID retrieval failed - cannot continue tests")
        return
    
    # Step 3 & 4: Create checklist items
    item1_id, item2_id = test_create_checklist_items(estate_id, headers)
    total_tests += 2
    if item1_id:
        passed_tests += 1
    if item2_id:
        passed_tests += 1
    
    # Step 5: Get and verify checklists
    items = test_get_checklists(estate_id, headers, 2)
    total_tests += 1
    if len(items) >= 2:
        passed_tests += 1
    
    # Step 6: Update first item (only if we have it)
    if item1_id:
        update_success = test_update_checklist_item(item1_id, headers)
        total_tests += 1
        if update_success:
            passed_tests += 1
    
    # Step 7: Toggle first item completion (only if we have it)
    if item1_id:
        toggle_success = test_toggle_checklist_item(item1_id, headers)
        total_tests += 1
        if toggle_success:
            passed_tests += 1
    
    # Step 8: Delete second item (only if we have it)
    if item2_id:
        delete_success = test_delete_checklist_item(item2_id, headers)
        total_tests += 1
        if delete_success:
            passed_tests += 1
    
    # Step 9: Verify only first item remains
    remaining_items = test_get_checklists(estate_id, headers, 1)
    total_tests += 1
    if len(remaining_items) >= 1:
        # Check if the remaining item has the updated title
        if remaining_items[0].get("title") == "Call State Farm - URGENT":
            passed_tests += 1
            print_test_result("Verify Remaining Item", True, 
                            f"Correct item remains with updated title: {remaining_items[0].get('title')}")
        else:
            print_test_result("Verify Remaining Item", False, 
                            f"Item title not as expected: {remaining_items[0].get('title')}")
    
    # Step 10: Test reordering (only if we have remaining items)
    if remaining_items and len(remaining_items) > 0:
        remaining_id = remaining_items[0].get("id")
        if remaining_id:
            reorder_success = test_reorder_checklists(remaining_id, headers)
            total_tests += 1
            if reorder_success:
                passed_tests += 1
    
    # Final results
    print("=" * 70)
    print(f"📊 TEST RESULTS SUMMARY")
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
    
    if passed_tests == total_tests:
        print("🎉 ALL TESTS PASSED - IAC CRUD endpoints are fully functional!")
    else:
        print("⚠️ Some tests failed - see details above")
    
    return passed_tests, total_tests

if __name__ == "__main__":
    main()