"""
Test Document Preview & PDFViewerModal Feature
Tests the Eye button preview functionality for PDF and image documents
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from the review request
TEST_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNjA3YjE2NGUtMGQzOS00Yjk1LWI5N2QtMmE2MDM5MTgyNDhhIiwiZW1haWwiOiJmdWxsdGVzdEB0ZXN0LmNvbSIsInJvbGUiOiJiZW5lZmFjdG9yIiwiaXNzdWVkX2F0IjoiMjAyNi0wMi0yOFQxOToyMTo0MC42ODI0NDcrMDA6MDAiLCJleHAiOjE3NzIzMzUzMDB9.pk5w6rPA0G1XR0CgfmZ2uWfFBddrKwjeae-lY2GtwYk"
PDF_DOC_ID = "52e87c23-ab92-4faf-a919-fc5b93720058"
IMAGE_DOC_ID = "eee6042c-2187-471c-92f2-5aafc8f5858c"


@pytest.fixture
def auth_headers():
    """Get auth headers with test token"""
    return {
        "Authorization": f"Bearer {TEST_TOKEN}",
        "Content-Type": "application/json"
    }


class TestDocumentPreviewEndpoint:
    """Test /api/documents/{document_id}/preview endpoint"""
    
    def test_preview_pdf_document_success(self, auth_headers):
        """Test preview endpoint returns PDF content for PDF document"""
        url = f"{BASE_URL}/api/documents/{PDF_DOC_ID}/preview"
        response = requests.get(url, headers=auth_headers)
        
        print(f"PDF Preview Status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type', 'N/A')}")
        print(f"Content-Length: {len(response.content)} bytes")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        # PDF content type should be application/pdf
        content_type = response.headers.get('Content-Type', '')
        assert 'pdf' in content_type.lower() or 'application' in content_type.lower(), f"Unexpected content-type: {content_type}"
        # Should return binary content
        assert len(response.content) > 0, "Response content is empty"
        
    def test_preview_image_document_success(self, auth_headers):
        """Test preview endpoint returns image content for image document"""
        url = f"{BASE_URL}/api/documents/{IMAGE_DOC_ID}/preview"
        response = requests.get(url, headers=auth_headers)
        
        print(f"Image Preview Status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type', 'N/A')}")
        print(f"Content-Length: {len(response.content)} bytes")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        # Image content type should be image/*
        content_type = response.headers.get('Content-Type', '')
        assert 'image' in content_type.lower() or 'application' in content_type.lower(), f"Unexpected content-type: {content_type}"
        # Should return binary content
        assert len(response.content) > 0, "Response content is empty"
        
    def test_preview_nonexistent_document(self, auth_headers):
        """Test preview endpoint returns 404 for non-existent document"""
        url = f"{BASE_URL}/api/documents/nonexistent-doc-id-12345/preview"
        response = requests.get(url, headers=auth_headers)
        
        print(f"Nonexistent doc preview status: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
    def test_preview_without_auth(self):
        """Test preview endpoint returns 401/403 without authentication"""
        url = f"{BASE_URL}/api/documents/{PDF_DOC_ID}/preview"
        response = requests.get(url)
        
        print(f"No-auth preview status: {response.status_code}")
        
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403, 422], f"Expected 401/403/422, got {response.status_code}"


class TestDocumentDownloadEndpoint:
    """Test /api/documents/{document_id}/download endpoint"""
    
    def test_download_pdf_document_success(self, auth_headers):
        """Test download endpoint returns PDF content for download"""
        url = f"{BASE_URL}/api/documents/{PDF_DOC_ID}/download"
        response = requests.get(url, headers=auth_headers)
        
        print(f"PDF Download Status: {response.status_code}")
        print(f"Content-Disposition: {response.headers.get('Content-Disposition', 'N/A')}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        # Should have Content-Disposition header for download
        content_disp = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disp.lower(), f"Expected attachment disposition, got: {content_disp}"
        
    def test_download_image_document_success(self, auth_headers):
        """Test download endpoint returns image content for download"""
        url = f"{BASE_URL}/api/documents/{IMAGE_DOC_ID}/download"
        response = requests.get(url, headers=auth_headers)
        
        print(f"Image Download Status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"


class TestDocumentListEndpoint:
    """Test /api/documents/{estate_id} endpoint"""
    
    def test_list_documents_success(self, auth_headers):
        """Test listing documents returns document list with file_type"""
        # First get estates to get estate_id
        estates_url = f"{BASE_URL}/api/estates"
        estates_response = requests.get(estates_url, headers=auth_headers)
        
        assert estates_response.status_code == 200, f"Failed to get estates: {estates_response.status_code}"
        estates = estates_response.json()
        assert len(estates) > 0, "No estates found for test user"
        
        estate_id = estates[0]['id']
        print(f"Using estate_id: {estate_id}")
        
        # Now list documents
        docs_url = f"{BASE_URL}/api/documents/{estate_id}"
        response = requests.get(docs_url, headers=auth_headers)
        
        print(f"Documents list status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        docs = response.json()
        
        print(f"Found {len(docs)} documents")
        
        # Verify documents have required fields for preview feature
        for doc in docs:
            print(f"  - {doc.get('name', 'N/A')}: file_type={doc.get('file_type', 'N/A')}, is_locked={doc.get('is_locked', 'N/A')}")
            assert 'id' in doc, "Document missing 'id' field"
            assert 'name' in doc, "Document missing 'name' field"
            assert 'file_type' in doc, "Document missing 'file_type' field"
            
        # Verify we have both test documents
        doc_ids = [doc['id'] for doc in docs]
        assert PDF_DOC_ID in doc_ids, f"Test PDF document {PDF_DOC_ID} not found"
        assert IMAGE_DOC_ID in doc_ids, f"Test image document {IMAGE_DOC_ID} not found"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
