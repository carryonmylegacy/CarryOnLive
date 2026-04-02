"""
Test ECT (Estate Chat) Batch Delete Feature
Tests the POST /api/estate-chat/channels/batch-delete endpoint
and related functionality for bulk deleting chat channels.
"""

import pytest
import requests
import os
import time
from uuid import uuid4

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


class TestECTBatchDelete:
    """Tests for ECT batch delete functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get token"""
        # Wait to avoid rate limiting
        time.sleep(1)
        
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 429:
            time.sleep(5)
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                headers={"Content-Type": "application/json"}
            )
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Note: API returns 'access_token' not 'token'
        self.token = data.get("access_token")
        self.user = data.get("user", {})
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        yield
    
    def test_batch_delete_returns_401_or_403_without_auth(self):
        """Test that batch-delete returns 401 or 403 without authentication"""
        response = requests.post(
            f"{BASE_URL}/api/estate-chat/channels/batch-delete",
            json={"channel_ids": ["test-id"]},
            headers={"Content-Type": "application/json"}
        )
        # API may return 401 (Unauthorized) or 403 (Forbidden) - both are acceptable
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
    
    def test_batch_delete_returns_400_for_empty_list(self):
        """Test that batch-delete returns 400 for empty channel_ids list"""
        response = requests.post(
            f"{BASE_URL}/api/estate-chat/channels/batch-delete",
            json={"channel_ids": []},
            headers=self.headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "No channels specified" in data.get("detail", ""), f"Unexpected error: {data}"
    
    def test_batch_delete_returns_400_for_over_50_channels(self):
        """Test that batch-delete returns 400 when more than 50 channels specified"""
        # Create a list of 51 fake channel IDs
        channel_ids = [f"fake-channel-{i}" for i in range(51)]
        
        response = requests.post(
            f"{BASE_URL}/api/estate-chat/channels/batch-delete",
            json={"channel_ids": channel_ids},
            headers=self.headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "50" in data.get("detail", ""), f"Expected limit message, got: {data}"
    
    def test_batch_delete_returns_failed_for_nonexistent_channels(self):
        """Test that batch-delete returns failed array for non-existent channels"""
        fake_ids = [f"nonexistent-{uuid4()}", f"nonexistent-{uuid4()}"]
        
        response = requests.post(
            f"{BASE_URL}/api/estate-chat/channels/batch-delete",
            json={"channel_ids": fake_ids},
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should have empty deleted array and failed array with our IDs
        assert "deleted" in data, "Response should have 'deleted' field"
        assert "failed" in data, "Response should have 'failed' field"
        assert len(data["deleted"]) == 0, "No channels should be deleted"
        assert len(data["failed"]) == 2, f"Expected 2 failed, got {len(data['failed'])}"
        
        # Check that failed entries have correct structure
        for failed in data["failed"]:
            assert "id" in failed, "Failed entry should have 'id'"
            assert "reason" in failed, "Failed entry should have 'reason'"
            assert failed["reason"] == "Not found", f"Expected 'Not found', got {failed['reason']}"
    
    def test_get_channels_still_works(self):
        """Regression test: GET /api/estate-chat/channels still works"""
        response = requests.get(
            f"{BASE_URL}/api/estate-chat/channels",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"


class TestECTChannelCRUD:
    """Tests for ECT channel CRUD operations including single delete regression"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get token, find an estate"""
        time.sleep(1)
        
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 429:
            time.sleep(5)
            response = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                headers={"Content-Type": "application/json"}
            )
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        self.token = data.get("access_token")
        self.user = data.get("user", {})
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        # Get contacts to find an estate the user belongs to
        contacts_res = requests.get(
            f"{BASE_URL}/api/estate-chat/contacts",
            headers=self.headers
        )
        
        self.estate_id = None
        self.other_member_id = None
        
        if contacts_res.status_code == 200:
            contacts = contacts_res.json()
            if contacts and len(contacts) > 0:
                self.estate_id = contacts[0].get("estate_id")
                members = contacts[0].get("members", [])
                if members:
                    self.other_member_id = members[0].get("id")
        
        self.created_channels = []
        
        yield
        
        # Cleanup: delete any channels we created
        for ch_id in self.created_channels:
            try:
                requests.delete(
                    f"{BASE_URL}/api/estate-chat/channels/{ch_id}",
                    headers={"Authorization": f"Bearer {self.token}"}
                )
            except:
                pass
    
    def test_create_and_single_delete_channel(self):
        """Regression test: single channel delete still works"""
        if not self.estate_id or not self.other_member_id:
            pytest.skip("No estate or other member found for testing")
        
        # Create a direct message channel
        create_res = requests.post(
            f"{BASE_URL}/api/estate-chat/channels",
            json={
                "estate_id": self.estate_id,
                "channel_type": "direct",
                "member_ids": [self.other_member_id]
            },
            headers=self.headers
        )
        
        assert create_res.status_code == 200, f"Create channel failed: {create_res.text}"
        channel = create_res.json()
        channel_id = channel.get("id")
        assert channel_id, "Channel should have an ID"
        
        # Single delete
        delete_res = requests.delete(
            f"{BASE_URL}/api/estate-chat/channels/{channel_id}",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        
        assert delete_res.status_code == 200, f"Single delete failed: {delete_res.text}"
        data = delete_res.json()
        assert data.get("success") == True, "Delete should return success: true"
    
    def test_create_and_batch_delete_channels(self):
        """Test creating channels and batch deleting them"""
        if not self.estate_id or not self.other_member_id:
            pytest.skip("No estate or other member found for testing")
        
        # Create 2 direct message channels (they'll be the same channel since DM is unique per pair)
        # So let's create one DM channel
        create_res = requests.post(
            f"{BASE_URL}/api/estate-chat/channels",
            json={
                "estate_id": self.estate_id,
                "channel_type": "direct",
                "member_ids": [self.other_member_id]
            },
            headers=self.headers
        )
        
        assert create_res.status_code == 200, f"Create channel failed: {create_res.text}"
        channel = create_res.json()
        channel_id = channel.get("id")
        self.created_channels.append(channel_id)
        
        # Batch delete
        batch_res = requests.post(
            f"{BASE_URL}/api/estate-chat/channels/batch-delete",
            json={"channel_ids": [channel_id]},
            headers=self.headers
        )
        
        assert batch_res.status_code == 200, f"Batch delete failed: {batch_res.text}"
        data = batch_res.json()
        
        assert "deleted" in data, "Response should have 'deleted' field"
        assert "failed" in data, "Response should have 'failed' field"
        assert channel_id in data["deleted"], f"Channel {channel_id} should be in deleted list"
        assert len(data["failed"]) == 0, f"No channels should fail: {data['failed']}"
        
        # Remove from cleanup list since it's already deleted
        self.created_channels.remove(channel_id)
        
        # Verify channel is gone
        channels_res = requests.get(
            f"{BASE_URL}/api/estate-chat/channels",
            headers=self.headers
        )
        assert channels_res.status_code == 200
        channels = channels_res.json()
        channel_ids = [c.get("id") for c in channels]
        assert channel_id not in channel_ids, "Deleted channel should not appear in list"
    
    def test_batch_delete_mixed_valid_invalid(self):
        """Test batch delete with mix of valid and invalid channel IDs"""
        if not self.estate_id or not self.other_member_id:
            pytest.skip("No estate or other member found for testing")
        
        # Create a channel
        create_res = requests.post(
            f"{BASE_URL}/api/estate-chat/channels",
            json={
                "estate_id": self.estate_id,
                "channel_type": "direct",
                "member_ids": [self.other_member_id]
            },
            headers=self.headers
        )
        
        assert create_res.status_code == 200, f"Create channel failed: {create_res.text}"
        channel = create_res.json()
        valid_channel_id = channel.get("id")
        self.created_channels.append(valid_channel_id)
        
        fake_channel_id = f"nonexistent-{uuid4()}"
        
        # Batch delete with one valid and one invalid
        batch_res = requests.post(
            f"{BASE_URL}/api/estate-chat/channels/batch-delete",
            json={"channel_ids": [valid_channel_id, fake_channel_id]},
            headers=self.headers
        )
        
        assert batch_res.status_code == 200, f"Batch delete failed: {batch_res.text}"
        data = batch_res.json()
        
        # Valid channel should be deleted
        assert valid_channel_id in data["deleted"], "Valid channel should be deleted"
        
        # Invalid channel should be in failed
        failed_ids = [f["id"] for f in data["failed"]]
        assert fake_channel_id in failed_ids, "Fake channel should be in failed list"
        
        # Remove from cleanup
        self.created_channels.remove(valid_channel_id)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
