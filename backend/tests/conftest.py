"""Pytest configuration and shared fixtures for encryption upgrade tests"""

import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="session")
def admin_token():
    """Get admin auth token - session scoped to avoid rate limiting"""
    time.sleep(2)  # Rate limit buffer
    resp = requests.post(
        f"{BASE_URL}/api/auth/dev-login",
        json={"email": "admin@carryon.com", "password": "admin123"},
    )
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def benefactor_token(admin_token):
    """Get benefactor token via admin impersonation - session scoped"""
    time.sleep(1)  # Rate limit buffer
    resp = requests.post(
        f"{BASE_URL}/api/auth/dev-login",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"email": "vault.test@carryon.com", "password": "VaultTest123!"},
    )
    assert resp.status_code == 200, f"Benefactor impersonation failed: {resp.text}"
    data = resp.json()
    print(
        f"\n✅ Benefactor token obtained for: {data['user']['name']} ({data['user']['email']})"
    )
    return data["access_token"]


@pytest.fixture(scope="session")
def test_estate_id():
    """Test estate ID provided in requirements"""
    return "2fd7502b-8eca-421d-a380-2bebb0d0ad7b"
