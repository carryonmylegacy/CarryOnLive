"""Tests for iteration 57 bug fixes: founder photo upload + site content."""

import io
import os
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chat-smooth.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


def _make_png_bytes():
    # Minimal 1x1 PNG
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = b"IHDR" + struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    ihdr_chunk = struct.pack(">I", 13) + ihdr + struct.pack(">I", zlib.crc32(ihdr) & 0xFFFFFFFF)
    raw = b"\x00\xff\x00\x00"
    comp = zlib.compress(raw)
    idat = b"IDAT" + comp
    idat_chunk = struct.pack(">I", len(comp)) + idat + struct.pack(">I", zlib.crc32(idat) & 0xFFFFFFFF)
    iend = b"IEND"
    iend_chunk = struct.pack(">I", 0) + iend + struct.pack(">I", zlib.crc32(iend) & 0xFFFFFFFF)
    return sig + ihdr_chunk + idat_chunk + iend_chunk


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        # try alternative field
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=15,
        )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


def test_public_site_content_returns_founder():
    r = requests.get(f"{BASE_URL}/api/public/site-content", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "founder_name" in data
    assert "founder_photo_url" in data
    assert "founder_linkedin_url" in data
    print(f"Founder name in DB: {data.get('founder_name')!r}")
    print(f"Founder photo url: {data.get('founder_photo_url')!r}")


def test_update_platform_settings_persists_founder(token):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "founder_name": "Barnet Harris",
        "founder_linkedin_url": "https://www.linkedin.com/in/barnetharris/",
    }
    r = requests.put(f"{BASE_URL}/api/admin/platform-settings", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    # Verify persistence via public endpoint
    r2 = requests.get(f"{BASE_URL}/api/public/site-content", timeout=15)
    d = r2.json()
    assert d.get("founder_name") == "Barnet Harris"
    assert d.get("founder_linkedin_url") == "https://www.linkedin.com/in/barnetharris/"


def test_founder_photo_upload(token):
    headers = {"Authorization": f"Bearer {token}"}
    png = _make_png_bytes()
    files = {"file": ("founder.png", io.BytesIO(png), "image/png")}
    r = requests.post(f"{BASE_URL}/api/admin/founder-photo", headers=headers, files=files, timeout=30)
    assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
    d = r.json()
    assert d.get("success") is True
    assert d.get("photo_url"), f"No photo_url returned: {d}"
    print(f"Uploaded photo_url: {d['photo_url']}")
    # Verify saved to platform_settings
    r2 = requests.get(f"{BASE_URL}/api/public/site-content", timeout=15)
    assert r2.json().get("founder_photo_url") == d["photo_url"]


def test_founder_photo_upload_rejects_no_auth():
    png = _make_png_bytes()
    files = {"file": ("founder.png", io.BytesIO(png), "image/png")}
    r = requests.post(f"{BASE_URL}/api/admin/founder-photo", files=files, timeout=15)
    assert r.status_code in (401, 403)
