"""E2E test for founder headshot CORP hotfix (headers, HEIC, audit)."""
import io
import os
import time
import pytest
import requests
from PIL import Image
from pillow_heif import register_heif_opener

register_heif_opener()

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://chat-smooth.preview.emergentagent.com").rstrip("/")
EMAIL = "founder@carryon.us"
PWD = "CarryOntheWisdom!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PWD, "force_login": True}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_headshot_get_headers():
    r = requests.get(f"{BASE}/api/public/founder-headshot", timeout=30)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/jpeg")
    assert r.headers.get("cross-origin-resource-policy", "").lower() == "cross-origin"


def test_site_content_headers_default_same_origin():
    r = requests.get(f"{BASE}/api/public/site-content", timeout=30)
    assert r.status_code == 200
    assert r.headers.get("cross-origin-resource-policy", "").lower() == "same-origin"
    j = r.json()
    assert j.get("founder_photo_url")
    assert j.get("founder_photo_updated_at")


def test_heic_upload_and_convert(token):
    # Build HEIC
    img = Image.new("RGB", (300, 400), (120, 80, 200))
    heic_path = "/tmp/hotfix_test.heic"
    img.save(heic_path, format="HEIF")
    with open(heic_path, "rb") as fh:
        files = {"file": ("t.heic", fh, "image/heic")}
        r = requests.post(
            f"{BASE}/api/admin/site-content/founder-headshot",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            timeout=60,
        )
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    # Now confirm GET is jpeg
    time.sleep(1)
    g = requests.get(f"{BASE}/api/public/founder-headshot", timeout=30)
    assert g.status_code == 200
    assert g.headers.get("content-type", "").startswith("image/jpeg")


def test_reject_text_upload(token):
    files = {"file": ("bad.txt", io.BytesIO(b"not an image"), "text/plain")}
    r = requests.post(
        f"{BASE}/api/admin/site-content/founder-headshot",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        timeout=30,
    )
    assert r.status_code == 400
