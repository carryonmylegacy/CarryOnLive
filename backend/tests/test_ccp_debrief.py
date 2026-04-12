"""
Test CCP Post-Drill Debrief Feature
- POST /api/ccp/debrief/{activation_id} - Submit debrief with rating and notes
- GET /api/ccp/debrief-stats/{estate_id} - Get drill debrief trend data
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials from test_credentials.md
TEST_EMAIL = "info@carryon.us"
TEST_PASSWORD = "Demo1234!"


class TestCCPDebriefEndpoints:
    """Test CCP Debrief API endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def get_auth_token(self):
        """Get authentication token"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        return None

    # ==================== POST /api/ccp/debrief/{activation_id} ====================

    def test_debrief_returns_401_without_auth(self):
        """POST /api/ccp/debrief/{activation_id} returns 401 without auth"""
        response = self.session.post(
            f"{BASE_URL}/api/ccp/debrief/fake-activation-id",
            json={"rating": 4, "went_well": "Test", "to_improve": "Test"},
        )
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ POST /api/ccp/debrief returns {response.status_code} without auth")

    def test_debrief_returns_400_for_invalid_rating_zero(self):
        """POST /api/ccp/debrief/{activation_id} returns 400 for rating 0"""
        token = self.get_auth_token()
        assert token, "Failed to get auth token"

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.post(
            f"{BASE_URL}/api/ccp/debrief/fake-activation-id",
            json={"rating": 0, "went_well": "Test", "to_improve": "Test"},
        )
        # Should return 400 for invalid rating
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "rating" in data.get("detail", "").lower() or "1" in data.get("detail", ""), (
            f"Expected rating error, got {data}"
        )
        print(f"✓ POST /api/ccp/debrief returns 400 for rating 0: {data.get('detail')}")

    def test_debrief_returns_400_for_invalid_rating_six(self):
        """POST /api/ccp/debrief/{activation_id} returns 400 for rating 6"""
        token = self.get_auth_token()
        assert token, "Failed to get auth token"

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.post(
            f"{BASE_URL}/api/ccp/debrief/fake-activation-id",
            json={"rating": 6, "went_well": "Test", "to_improve": "Test"},
        )
        # Should return 400 for invalid rating
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "rating" in data.get("detail", "").lower() or "5" in data.get("detail", ""), (
            f"Expected rating error, got {data}"
        )
        print(f"✓ POST /api/ccp/debrief returns 400 for rating 6: {data.get('detail')}")

    def test_debrief_returns_404_for_nonexistent_activation(self):
        """POST /api/ccp/debrief/{activation_id} returns 404 for nonexistent activation"""
        token = self.get_auth_token()
        assert token, "Failed to get auth token"

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.post(
            f"{BASE_URL}/api/ccp/debrief/nonexistent-activation-id",
            json={"rating": 4, "went_well": "Test went well", "to_improve": "Test to improve"},
        )
        # Should return 404 for nonexistent activation
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        data = response.json()
        assert "not found" in data.get("detail", "").lower(), f"Expected 'not found' error, got {data}"
        print(f"✓ POST /api/ccp/debrief returns 404 for nonexistent activation: {data.get('detail')}")

    # ==================== GET /api/ccp/debrief-stats/{estate_id} ====================

    def test_debrief_stats_returns_401_without_auth(self):
        """GET /api/ccp/debrief-stats/{estate_id} returns 401 without auth"""
        response = self.session.get(f"{BASE_URL}/api/ccp/debrief-stats/fake-estate-id")
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ GET /api/ccp/debrief-stats returns {response.status_code} without auth")

    def test_debrief_stats_returns_valid_structure(self):
        """GET /api/ccp/debrief-stats/{estate_id} returns valid structure"""
        token = self.get_auth_token()
        assert token, "Failed to get auth token"

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        # Use a fake estate ID - should return 403 (not a member) or valid empty structure
        response = self.session.get(f"{BASE_URL}/api/ccp/debrief-stats/fake-estate-id")

        # Admin user is not a member of fake estate, so expect 403
        if response.status_code == 403:
            print("✓ GET /api/ccp/debrief-stats returns 403 for non-member (expected)")
            return

        # If somehow we get 200, verify structure
        assert response.status_code == 200, f"Expected 200 or 403, got {response.status_code}"
        data = response.json()
        assert "entries" in data, "Response missing 'entries' field"
        assert "total_drills" in data, "Response missing 'total_drills' field"
        assert "average_rating" in data, "Response missing 'average_rating' field"
        assert isinstance(data["entries"], list), "'entries' should be a list"
        assert isinstance(data["total_drills"], int), "'total_drills' should be an int"
        assert isinstance(data["average_rating"], (int, float)), "'average_rating' should be a number"
        print(
            f"✓ GET /api/ccp/debrief-stats returns valid structure: entries={len(data['entries'])}, total_drills={data['total_drills']}, average_rating={data['average_rating']}"
        )


class TestDebriefRequestModel:
    """Test DebriefRequest Pydantic model validation"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def get_auth_token(self):
        """Get authentication token"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        return None

    def test_debrief_accepts_valid_rating_1(self):
        """Debrief accepts rating 1 (minimum valid)"""
        token = self.get_auth_token()
        assert token, "Failed to get auth token"

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.post(
            f"{BASE_URL}/api/ccp/debrief/test-activation", json={"rating": 1, "went_well": "", "to_improve": ""}
        )
        # Should NOT return 400 for valid rating (will return 404 for nonexistent activation)
        assert response.status_code != 400 or "rating" not in response.json().get("detail", "").lower(), (
            f"Rating 1 should be valid, got {response.status_code}: {response.json()}"
        )
        print(f"✓ Debrief accepts rating 1 (got {response.status_code} - not a rating validation error)")

    def test_debrief_accepts_valid_rating_5(self):
        """Debrief accepts rating 5 (maximum valid)"""
        token = self.get_auth_token()
        assert token, "Failed to get auth token"

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.post(
            f"{BASE_URL}/api/ccp/debrief/test-activation",
            json={"rating": 5, "went_well": "Everything was great", "to_improve": "Nothing to improve"},
        )
        # Should NOT return 400 for valid rating (will return 404 for nonexistent activation)
        assert response.status_code != 400 or "rating" not in response.json().get("detail", "").lower(), (
            f"Rating 5 should be valid, got {response.status_code}: {response.json()}"
        )
        print(f"✓ Debrief accepts rating 5 (got {response.status_code} - not a rating validation error)")

    def test_debrief_accepts_empty_notes(self):
        """Debrief accepts empty went_well and to_improve notes"""
        token = self.get_auth_token()
        assert token, "Failed to get auth token"

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.post(
            f"{BASE_URL}/api/ccp/debrief/test-activation", json={"rating": 3, "went_well": "", "to_improve": ""}
        )
        # Should NOT return 422 for empty notes (will return 404 for nonexistent activation)
        assert response.status_code != 422, (
            f"Empty notes should be valid, got {response.status_code}: {response.json()}"
        )
        print(f"✓ Debrief accepts empty notes (got {response.status_code})")


class TestDebriefStatsResponse:
    """Test debrief-stats endpoint response structure"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def get_auth_token(self):
        """Get authentication token"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        return None

    def test_debrief_stats_endpoint_exists(self):
        """GET /api/ccp/debrief-stats/{estate_id} endpoint exists"""
        token = self.get_auth_token()
        assert token, "Failed to get auth token"

        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/ccp/debrief-stats/test-estate")

        # Should NOT return 404 (endpoint not found) - 403 is expected for non-member
        assert response.status_code != 404 or "estate" in response.json().get("detail", "").lower(), (
            f"Endpoint should exist, got {response.status_code}: {response.json()}"
        )
        print(f"✓ GET /api/ccp/debrief-stats endpoint exists (got {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
