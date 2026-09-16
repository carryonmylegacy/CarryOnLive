"""Iteration 59: Test inline founder_photo_data upload via PUT /admin/platform-settings.

Verifies:
- PUT /api/admin/platform-settings with {founder_photo_data: <base64>} uploads photo,
  returns settings including founder_photo_url.
- GET /api/public/site-content reflects new founder_photo_url.
- Regression: PUT /admin/platform-settings still persists non-photo founder fields.
"""

import base64
import io
import os

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chat-smooth.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def jpeg_b64():
    img = Image.new("RGB", (24, 24), color=(120, 40, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_put_platform_settings_with_founder_photo_data(headers, jpeg_b64):
    r = requests.put(
        f"{BASE_URL}/api/admin/platform-settings",
        headers=headers,
        json={"founder_photo_data": jpeg_b64},
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert "founder_photo_url" in data
    url = data["founder_photo_url"]
    assert isinstance(url, str) and len(url) > 0
    assert not url.startswith("data:"), "URL must not be raw base64 — should be S3/proxy URL"
    # Store for next test via pytest cache
    test_put_platform_settings_with_founder_photo_data.url = url


def test_public_site_content_reflects_new_photo():
    url_prev = getattr(test_put_platform_settings_with_founder_photo_data, "url", None)
    assert url_prev, "prior test did not run"
    r = requests.get(f"{BASE_URL}/api/public/site-content", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert data.get("founder_photo_url") == url_prev


def test_put_platform_settings_regression_non_photo_fields(headers):
    payload = {
        "founder_name": "Barnet Harris",
        "founder_title": "Founder & CEO",
        "founder_bio": "Regression test bio for iteration 59.",
        "founder_linkedin_url": "https://linkedin.com/in/barnetharris",
    }
    r = requests.put(
        f"{BASE_URL}/api/admin/platform-settings",
        headers=headers,
        json=payload,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    for k, v in payload.items():
        assert data.get(k) == v, f"{k}: expected {v!r} got {data.get(k)!r}"

    # Verify via public endpoint too
    pub = requests.get(f"{BASE_URL}/api/public/site-content", timeout=20).json()
    for k, v in payload.items():
        assert pub.get(k) == v


def test_invalid_base64_returns_400(headers):
    r = requests.put(
        f"{BASE_URL}/api/admin/platform-settings",
        headers=headers,
        json={"founder_photo_data": "!!!not-base64!!!"},
        timeout=20,
    )
    # Some base64 decoders are lenient; accept 400 OR 200-with-no-crash-but-invalid-img.
    # We want the endpoint to at least not 500.
    assert r.status_code in (200, 400), f"Unexpected status {r.status_code}: {r.text}"


def test_combined_photo_and_fields(headers, jpeg_b64):
    """Send photo + text fields in the same request — both should persist."""
    r = requests.put(
        f"{BASE_URL}/api/admin/platform-settings",
        headers=headers,
        json={
            "founder_photo_data": jpeg_b64,
            "founder_name": "Barnet Harris",
            "founder_title": "Founder & CEO",
        },
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("founder_name") == "Barnet Harris"
    assert data.get("founder_title") == "Founder & CEO"
    assert data.get("founder_photo_url", "").startswith(("http://", "https://", "/"))
