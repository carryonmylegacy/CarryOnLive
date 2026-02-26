#!/usr/bin/env python3
"""
Quick API Endpoint Structure Verification for CarryOn™ IAC
Verify that all endpoints return expected HTTP status codes and structures
"""
import requests
import json

BACKEND_URL = "https://platform-handoff.preview.emergentagent.com/api"

def test_endpoint_structure():
    """Test that all required endpoints exist and return correct status codes"""
    print("🔍 API Endpoint Structure Verification")
    print("=" * 50)
    
    # Get auth token
    login_response = requests.post(f"{BACKEND_URL}/auth/dev-login", 
                                 json={"email": "audit2@test.com", "password": "AuditPass123!@#"})
    
    if login_response.status_code != 200:
        print("❌ Authentication failed")
        return
    
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get estate ID
    estates_response = requests.get(f"{BACKEND_URL}/estates", headers=headers)
    estate_id = estates_response.json()[0]["id"]
    
    print(f"Using estate_id: {estate_id}")
    print()
    
    # Test all endpoints mentioned in review request
    endpoints = [
        ("POST", "/auth/dev-login", {"email": "audit2@test.com", "password": "AuditPass123!@#"}, None, 200),
        ("GET", "/estates", None, headers, 200),
        ("GET", f"/checklists/{estate_id}", None, headers, 200),
        ("POST", "/checklists/reorder", {"item_ids": []}, headers, 200),
    ]
    
    for method, endpoint, data, req_headers, expected_status in endpoints:
        try:
            if method == "POST":
                response = requests.post(f"{BACKEND_URL}{endpoint}", json=data, headers=req_headers)
            elif method == "GET":
                response = requests.get(f"{BACKEND_URL}{endpoint}", headers=req_headers)
            
            status_icon = "✅" if response.status_code == expected_status else "❌"
            print(f"{status_icon} {method} {endpoint} → {response.status_code} (expected {expected_status})")
            
        except Exception as e:
            print(f"❌ {method} {endpoint} → Exception: {str(e)}")
    
    print("\n📋 Checklist Item Structure Verification")
    
    # Get a checklist item to verify structure
    checklists_response = requests.get(f"{BACKEND_URL}/checklists/{estate_id}", headers=headers)
    if checklists_response.status_code == 200:
        items = checklists_response.json()
        if items:
            item = items[0]
            print(f"Sample item fields: {list(item.keys())}")
            
            # Check for new contact fields
            contact_fields = ["contact_name", "contact_phone", "contact_email", "contact_address"]
            present_fields = [field for field in contact_fields if field in item]
            print(f"Contact fields in schema: {present_fields}")
        else:
            print("No checklist items found")

if __name__ == "__main__":
    test_endpoint_structure()