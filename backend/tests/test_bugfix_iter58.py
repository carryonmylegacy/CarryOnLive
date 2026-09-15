"""Iteration 58 — Founder photo upload via base64 JSON (production proxy fix)."""
import base64
import io
import os

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chat-smooth.preview.emergentagent.com").rstrip("/")


def _make_jpeg_b64() -> str:
    img = Image.new("RGB", (20, 20), color=(200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "info@carryon.us", "password": "Demo1234!"},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token")
    assert tok, f"no access_token in {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# --- Bug fix: JSON base64 founder photo upload ---
def test_founder_photo_upload_json_base64(auth_headers):
    payload = {"photo_data": _make_jpeg_b64()}
    r = requests.post(f"{BASE_URL}/api/admin/founder-photo", json=payload, headers=auth_headers, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert data.get("success") is True
    assert isinstance(data.get("photo_url"), str) and data["photo_url"]
    pytest.photo_url = data["photo_url"]


def test_public_site_content_reflects_founder_photo(auth_headers):
    r = requests.get(f"{BASE_URL}/api/public/site-content", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data.get("founder_photo_url") == getattr(pytest, "photo_url", None)


# --- Bug fix: rejects missing/invalid base64 ---
def test_founder_photo_upload_missing_data(auth_headers):
    r = requests.post(f"{BASE_URL}/api/admin/founder-photo", json={}, headers=auth_headers, timeout=30)
    assert r.status_code == 400


def test_founder_photo_upload_invalid_base64(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/admin/founder-photo",
        json={"photo_data": "!!!not-base64!!!"},
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 400


def test_founder_photo_requires_auth():
    r = requests.post(
        f"{BASE_URL}/api/admin/founder-photo", json={"photo_data": _make_jpeg_b64()}, timeout=30
    )
    assert r.status_code in (401, 403)


# --- Regression: PUT /admin/platform-settings persists founder fields ---
def test_update_platform_settings_persists_founder(auth_headers):
    payload = {
        "founder_name": "Barnet Harris",
        "founder_title": "Founder & CEO",
        "founder_bio": "Test bio iter58.",
        "founder_linkedin_url": "https://linkedin.com/in/barnetharris",
    }
    r = requests.put(
        f"{BASE_URL}/api/admin/platform-settings", json=payload, headers=auth_headers, timeout=30
    )
    assert r.status_code == 200

    g = requests.get(f"{BASE_URL}/api/public/site-content", timeout=30)
    assert g.status_code == 200
    d = g.json()
    assert d["founder_name"] == "Barnet Harris"
    assert d["founder_title"] == "Founder & CEO"
    assert d["founder_bio"] == "Test bio iter58."
    assert d["founder_linkedin_url"] == "https://linkedin.com/in/barnetharris"
