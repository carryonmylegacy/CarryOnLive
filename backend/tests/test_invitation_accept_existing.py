"""
Test suite for invitation acceptance flows:
- POST /api/invitations/accept-existing (link existing account)
- POST /api/invitations/accept (create new account)
- GET /api/invitations/{token} (get invitation details)
"""

import os
import pytest
import requests
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://estate-chat-menu.preview.emergentagent.com").rstrip("/")


class TestInvitationAcceptExisting:
    """Tests for the accept-existing invitation flow"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as admin and get estate_id"""
        # Login as admin
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": "admin_62bc79", "password": "Demo1234!"}
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json()["access_token"]
        self.admin_user = login_resp.json()["user"]

        # Get estate_id
        estates_resp = requests.get(f"{BASE_URL}/api/estates", headers={"Authorization": f"Bearer {self.token}"})
        assert estates_resp.status_code == 200, f"Get estates failed: {estates_resp.text}"
        estates = estates_resp.json()
        assert len(estates) > 0, "No estates found"
        self.estate_id = estates[0]["id"]

    def create_test_beneficiary(self, prefix="TEST"):
        """Helper to create a test beneficiary with invitation"""
        timestamp = int(time.time() * 1000)
        ben_resp = requests.post(
            f"{BASE_URL}/api/beneficiaries",
            headers={"Authorization": f"Bearer {self.token}"},
            json={
                "estate_id": self.estate_id,
                "first_name": f"{prefix}First",
                "last_name": f"Last{timestamp}",
                "email": f"{prefix.lower()}{timestamp}@example.com",
                "relation": "Friend",
            },
        )
        assert ben_resp.status_code == 200, f"Create beneficiary failed: {ben_resp.text}"
        return ben_resp.json()

    def test_get_invitation_details_valid_token(self):
        """GET /api/invitations/{token} returns beneficiary and benefactor info for valid pending invitation"""
        # Create a beneficiary
        ben = self.create_test_beneficiary("GETINV")
        inv_token = ben["invitation_token"]

        # Get invitation details
        resp = requests.get(f"{BASE_URL}/api/invitations/{inv_token}")

        assert resp.status_code == 200
        data = resp.json()
        assert "beneficiary" in data
        assert "benefactor_name" in data
        assert data["beneficiary"]["first_name"] == ben["first_name"]
        assert data["beneficiary"]["last_name"] == ben["last_name"]
        assert data["beneficiary"]["email"] == ben["email"]
        assert data["beneficiary"]["relation"] == ben["relation"]

    def test_get_invitation_details_invalid_token(self):
        """GET /api/invitations/{token} returns 404 for invalid token"""
        resp = requests.get(f"{BASE_URL}/api/invitations/invalid-token-12345")

        assert resp.status_code == 404
        assert "Invalid or expired invitation" in resp.json()["detail"]

    def test_accept_existing_invalid_token(self):
        """POST /api/invitations/accept-existing returns 404 for invalid token"""
        resp = requests.post(
            f"{BASE_URL}/api/invitations/accept-existing",
            json={"token": "invalid-token-12345", "username": "admin_62bc79", "password": "Demo1234!"},
        )

        assert resp.status_code == 404
        assert "Invalid or expired invitation" in resp.json()["detail"]

    def test_accept_existing_wrong_credentials(self):
        """POST /api/invitations/accept-existing returns 401 for wrong credentials"""
        # Create a beneficiary
        ben = self.create_test_beneficiary("WRONGCRED")
        inv_token = ben["invitation_token"]

        # Try to accept with wrong password
        resp = requests.post(
            f"{BASE_URL}/api/invitations/accept-existing",
            json={"token": inv_token, "username": "admin_62bc79", "password": "WrongPassword123!"},
        )

        assert resp.status_code == 401
        assert "Invalid username or password" in resp.json()["detail"]

    def test_accept_existing_wrong_username(self):
        """POST /api/invitations/accept-existing returns 401 for non-existent username"""
        # Create a beneficiary
        ben = self.create_test_beneficiary("WRONGUSER")
        inv_token = ben["invitation_token"]

        # Try to accept with non-existent username
        resp = requests.post(
            f"{BASE_URL}/api/invitations/accept-existing",
            json={"token": inv_token, "username": "nonexistent_user_12345", "password": "Demo1234!"},
        )

        assert resp.status_code == 401
        assert "Invalid username or password" in resp.json()["detail"]

    def test_accept_existing_success(self):
        """POST /api/invitations/accept-existing successfully links existing user to estate invitation"""
        # Create a beneficiary
        ben = self.create_test_beneficiary("LINKACCT")
        inv_token = ben["invitation_token"]

        # Accept with existing admin credentials
        resp = requests.post(
            f"{BASE_URL}/api/invitations/accept-existing",
            json={"token": inv_token, "username": "admin_62bc79", "password": "Demo1234!"},
        )

        assert resp.status_code == 200
        data = resp.json()

        # Verify response structure
        assert data["message"] == "Account linked successfully"
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "user" in data

        # Verify user object
        user = data["user"]
        assert user["id"] == self.admin_user["id"]
        assert user["email"] == self.admin_user["email"]
        assert "role" in user
        assert "created_at" in user

    def test_accept_existing_already_accepted(self):
        """POST /api/invitations/accept-existing returns 400 for already accepted invitation"""
        # Create a beneficiary
        ben = self.create_test_beneficiary("ALREADYACC")
        inv_token = ben["invitation_token"]

        # Accept first time
        resp1 = requests.post(
            f"{BASE_URL}/api/invitations/accept-existing",
            json={"token": inv_token, "username": "admin_62bc79", "password": "Demo1234!"},
        )
        assert resp1.status_code == 200

        # Try to accept again
        resp2 = requests.post(
            f"{BASE_URL}/api/invitations/accept-existing",
            json={"token": inv_token, "username": "admin_62bc79", "password": "Demo1234!"},
        )

        assert resp2.status_code == 400
        assert "already been accepted" in resp2.json()["detail"]


class TestInvitationAcceptNewAccount:
    """Tests for the accept invitation (new account) flow"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as admin and get estate_id"""
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": "admin_62bc79", "password": "Demo1234!"}
        )
        assert login_resp.status_code == 200
        self.token = login_resp.json()["access_token"]

        estates_resp = requests.get(f"{BASE_URL}/api/estates", headers={"Authorization": f"Bearer {self.token}"})
        assert estates_resp.status_code == 200
        self.estate_id = estates_resp.json()[0]["id"]

    def create_test_beneficiary(self, prefix="TEST"):
        """Helper to create a test beneficiary with invitation"""
        timestamp = int(time.time() * 1000)
        ben_resp = requests.post(
            f"{BASE_URL}/api/beneficiaries",
            headers={"Authorization": f"Bearer {self.token}"},
            json={
                "estate_id": self.estate_id,
                "first_name": f"{prefix}First",
                "last_name": f"Last{timestamp}",
                "email": f"{prefix.lower()}{timestamp}@example.com",
                "relation": "Sibling",
            },
        )
        assert ben_resp.status_code == 200
        return ben_resp.json()

    def test_accept_new_account_success(self):
        """POST /api/invitations/accept creates new account successfully"""
        # Create a beneficiary
        ben = self.create_test_beneficiary("NEWACCT")
        inv_token = ben["invitation_token"]
        timestamp = int(time.time() * 1000)

        # Accept with new account
        resp = requests.post(
            f"{BASE_URL}/api/invitations/accept",
            json={
                "token": inv_token,
                "password": "TestPass123!",
                "phone": "+15551234567",
                "username": f"newuser{timestamp}",
            },
        )

        assert resp.status_code == 200
        data = resp.json()

        # Verify response structure
        assert data["message"] == "Account created successfully"
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "username" in data
        assert "user" in data

        # Verify user object
        user = data["user"]
        assert "id" in user
        assert user["email"] == ben["email"]
        assert user["role"] == "beneficiary"
        assert "created_at" in user

    def test_accept_new_account_invalid_token(self):
        """POST /api/invitations/accept returns 404 for invalid token"""
        resp = requests.post(
            f"{BASE_URL}/api/invitations/accept",
            json={"token": "invalid-token-12345", "password": "TestPass123!", "username": "testuser123"},
        )

        assert resp.status_code == 404
        assert "Invalid or expired invitation" in resp.json()["detail"]

    def test_accept_new_account_duplicate_username(self):
        """POST /api/invitations/accept returns 400 for duplicate username"""
        # Create a beneficiary
        ben = self.create_test_beneficiary("DUPUSER")
        inv_token = ben["invitation_token"]

        # Try to use existing admin username
        resp = requests.post(
            f"{BASE_URL}/api/invitations/accept",
            json={
                "token": inv_token,
                "password": "TestPass123!",
                "username": "admin_62bc79",  # Already exists
            },
        )

        assert resp.status_code == 400
        assert "already taken" in resp.json()["detail"].lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
