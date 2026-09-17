"""Regression — Site Copy overrides (Admin → Marketing → Site Copy).

Founder-editable public-site text. Unit-tests the sanitiser/key rules and,
when the API is reachable (REACT_APP_BACKEND_URL), round-trips an override
through PUT /api/admin/site-copy → GET /api/public/site-copy → reset.
"""

import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
FOUNDER = {"email": "founder@carryon.us", "password": "CarryOntheWisdom!", "force_login": True}
BENEFACTOR = {"email": "info@carryon.us", "password": "Demo1234!", "force_login": True}
PROBE_KEY = "qa.site_copy.probe"


def test_clean_copy_value_is_plain_text():
    from routes.site_copy import clean_copy_value

    assert clean_copy_value("  Hello\r\nworld\r\n ") == "Hello\nworld"
    assert clean_copy_value("a\u200bb\x07c") == "abc"  # zero-width + BEL stripped
    assert clean_copy_value("tab\tkept") == "tab\tkept"
    assert clean_copy_value("<b>not html</b>") == "<b>not html</b>"  # stored verbatim, rendered as text


@pytest.mark.parametrize(
    "key", ["home.hero.h1a", "home.tools.mm.title", "nav.start", "footer.winddown", "home.faq.1.q"]
)
def test_validate_key_accepts_registry_shape(key):
    from routes.site_copy import validate_key

    assert validate_key(key) == key


@pytest.mark.parametrize("key", ["", "home", "Home.hero", "home..x", "home.hero x", "$ne", "a" * 130, "home/hero"])
def test_validate_key_rejects_garbage(key):
    from fastapi import HTTPException

    from routes.site_copy import validate_key

    with pytest.raises(HTTPException) as e:
        validate_key(key)
    assert e.value.status_code == 400


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, r.text
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def founder_headers():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    return _login(FOUNDER)


@pytest.fixture(scope="module", autouse=True)
def _cleanup_probe(founder_headers):
    yield
    requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: None}}, headers=founder_headers, timeout=20
    )


def test_public_endpoint_is_open_and_shaped():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    r = requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["overrides"], dict)
    assert "updated_at" in body


def test_override_round_trip_and_reset(founder_headers):
    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {PROBE_KEY: "  Probe text\r\nline two  "}},
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    assert r.json()["overrides"][PROBE_KEY] == "Probe text\nline two"

    pub = requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()
    assert pub["overrides"][PROBE_KEY] == "Probe text\nline two"
    assert pub["updated_at"]

    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: ""}}, headers=founder_headers, timeout=20
    )
    assert r.status_code == 200
    assert PROBE_KEY not in r.json()["overrides"]
    assert PROBE_KEY not in requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["overrides"]


def test_rejects_bad_key_and_oversize(founder_headers):
    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {"$where": "x"}}, headers=founder_headers, timeout=20
    )
    assert r.status_code == 400
    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {PROBE_KEY: "x" * 5001}},
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 400


def test_non_admin_cannot_write():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    r = requests.put(f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: "nope"}}, timeout=20)
    assert r.status_code in (401, 403)
    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: "nope"}}, headers=_login(BENEFACTOR), timeout=20
    )
    assert r.status_code == 403
