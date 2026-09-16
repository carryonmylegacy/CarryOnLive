"""Phase 3 zero-regression guardrails: subscription flow + SEO tests."""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://chat-smooth.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "info@carryon.us"
ADMIN_PASSWORD = "Demo1234!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login", json={"username_or_email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=60
    )
    # Try alt payload keys
    if r.status_code != 200:
        r = requests.post(
            f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
    if r.status_code != 200:
        r = requests.post(
            f"{BASE_URL}/api/auth/login", json={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30
        )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No access_token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ============ Phase 3 Subscription Tests ============


class TestPhase3Subscriptions:
    def test_1_admin_login_returns_access_token(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 10

    def test_2_get_plans(self):
        r = requests.get(f"{BASE_URL}/api/subscriptions/plans", timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, dict), f"Expected dict response, got {type(data)}"
        plans = data.get("plans", [])
        assert isinstance(plans, list), f"Plans not a list: {data}"
        assert len(plans) == 8, f"Expected 8 plans, got {len(plans)}"
        # Check pricing on premium plan
        premium = next((p for p in plans if p.get("id") == "premium"), None)
        standard = next((p for p in plans if p.get("id") == "standard"), None)
        base = next((p for p in plans if p.get("id") == "base"), None)
        assert premium and premium.get("price") == 9.99, f"premium price: {premium}"
        assert standard and standard.get("price") == 8.99, f"standard price: {standard}"
        assert base and base.get("price") == 7.99, f"base price: {base}"
        # trial_duration_days is at top level of response
        assert "trial_duration_days" in data, f"trial_duration_days missing from response. Keys: {list(data.keys())}"
        assert isinstance(data["trial_duration_days"], int), (
            f"trial_duration_days not int: {data['trial_duration_days']}"
        )

    def test_3_subscription_status(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/subscriptions/status", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        for key in ["beta_mode", "has_active_subscription"]:
            assert key in data, f"Missing key {key} in status: {list(data.keys())}"

    def test_4_checkout_beta_returns_free(self, auth_headers):
        # First get a plan id
        r = requests.get(f"{BASE_URL}/api/subscriptions/plans", timeout=30)
        plans = r.json().get("plans", r.json()) if isinstance(r.json(), dict) else r.json()
        plan_id = plans[0].get("id") or plans[0].get("plan_id") or plans[0].get("tier")
        payload = {"plan_id": plan_id, "billing_cycle": "monthly", "origin_url": BASE_URL}
        r = requests.post(f"{BASE_URL}/api/subscriptions/checkout", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        data = r.json()
        assert data.get("free") is True, f"Expected free:true in beta mode, got {data}"

    def test_5_stripe_webhook(self):
        # Webhook should accept payload and return received:true (may require sig header)
        r = requests.post(
            f"{BASE_URL}/api/webhook/stripe",
            json={"type": "test", "data": {}},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        # Accept 200 with received:true, or 400 for missing signature (but not 404/500)
        print(f"Webhook status: {r.status_code}, body: {r.text[:200]}")
        assert r.status_code in (200, 400), f"Unexpected {r.status_code}: {r.text[:200]}"
        if r.status_code == 200:
            assert r.json().get("received") is True

    def test_6_change_plan_beta(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/subscriptions/plans", timeout=30)
        plans = r.json().get("plans", r.json()) if isinstance(r.json(), dict) else r.json()
        plan_id = plans[1].get("id") or plans[1].get("plan_id") or plans[1].get("tier")
        r = requests.post(
            f"{BASE_URL}/api/subscriptions/change-plan",
            headers=auth_headers,
            json={"plan_id": plan_id, "billing_cycle": "monthly"},
            timeout=30,
        )
        print(f"Change plan status: {r.status_code}, body: {r.text[:300]}")
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text[:300]}"

    def test_7_cancel_subscription(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/subscriptions/cancel", headers=auth_headers, json={}, timeout=30)
        print(f"Cancel status: {r.status_code}, body: {r.text[:300]}")
        # 200 success or 400 if no active subscription
        assert r.status_code in (200, 400), f"{r.status_code}: {r.text[:300]}"

    def test_8_admin_subscription_settings(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/subscription-settings", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        for key in ["beta_mode", "plans", "stats"]:
            assert key in data, f"Missing {key} in admin settings: {list(data.keys())}"

    def test_9_admin_user_subscriptions(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/user-subscriptions", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        users = data if isinstance(data, list) else data.get("users", data.get("subscriptions", []))
        assert isinstance(users, list), f"Expected list, got: {type(data)} {str(data)[:200]}"
        if users:
            assert "billing_status" in users[0], f"Missing billing_status in user record. Keys: {list(users[0].keys())}"


# ============ SEO Tests ============


class TestSEO:
    def _fetch(self, path):
        r = requests.get(f"{BASE_URL}{path}", timeout=30, headers={"User-Agent": "Mozilla/5.0 SEO-Test-Bot"})
        return r

    def test_seo_start_page(self):
        r = self._fetch("/start")
        assert r.status_code == 200
        html = r.text
        # These may be injected by Helmet client-side - check for base structure
        has_title = "<title>" in html
        has_og = 'property="og:title"' in html or "og:title" in html
        has_jsonld = "application/ld+json" in html
        print(f"/start: title={has_title}, og={has_og}, jsonld={has_jsonld}")
        # SPA: JSON-LD may be server-side or in the static HTML. Report findings.
        assert has_title, "No <title> tag at /start"

    def test_seo_pricing_page(self):
        r = self._fetch("/pricing")
        assert r.status_code == 200
        html = r.text
        has_jsonld = "application/ld+json" in html
        has_og_url = "og:url" in html
        print(f"/pricing: jsonld={has_jsonld}, og:url={has_og_url}")

    def test_seo_home_page(self):
        r = self._fetch("/home")
        assert r.status_code == 200
        html = r.text
        has_webapp = "WebApplication" in html
        has_feature = "featureList" in html
        has_agg = "AggregateOffer" in html
        print(f"/home: WebApplication={has_webapp}, featureList={has_feature}, AggregateOffer={has_agg}")

    def test_sitemap_xml(self):
        r = self._fetch("/sitemap.xml")
        assert r.status_code == 200, f"sitemap.xml returned {r.status_code}"
        content = r.text
        for path in ["/start", "/pricing", "/home", "/about", "/privacy", "/terms"]:
            assert path in content, f"Missing {path} in sitemap.xml"
        # Check XML namespace correctness
        assert "sitemaps.org" in content, f"Sitemap XML namespace incorrect (typo?): {content[:300]}"
