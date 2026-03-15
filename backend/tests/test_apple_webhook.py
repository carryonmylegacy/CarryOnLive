"""Apple App Store Server Notifications v2 Webhook Tests.

Tests the NEW /api/webhook/apple endpoint for:
- Rejecting empty body (400)
- Rejecting missing signedPayload (400)
- Rejecting invalid/malformed JWS (400)
- Rejecting incomplete JWS (400)

Also tests subscription-related endpoints:
- /api/subscriptions/validate-apple-receipt error handling
- /api/subscriptions/plans returns plans
- /api/subscriptions/status returns status for authenticated user

Test credentials: fulltest@test.com / Password.123
"""

import os
import time
import pytest
import requests
import base64
import json

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


class TestAppleWebhookEndpoint:
    """Test Apple webhook endpoint error handling."""

    def test_webhook_rejects_empty_body(self):
        """Webhook returns 400 for empty body."""
        resp = requests.post(
            f"{BASE_URL}/api/webhook/apple",
            headers={"Content-Type": "application/json"},
            data="{}",
        )
        assert resp.status_code == 400
        data = resp.json()
        assert "Missing signedPayload" in data.get("detail", "")
        print("PASS: Webhook rejects empty body with 400")

    def test_webhook_rejects_no_signed_payload(self):
        """Webhook returns 400 when signedPayload is missing."""
        resp = requests.post(
            f"{BASE_URL}/api/webhook/apple",
            json={"foo": "bar"},
        )
        assert resp.status_code == 400
        data = resp.json()
        assert "Missing signedPayload" in data.get("detail", "")
        print("PASS: Webhook rejects missing signedPayload with 400")

    def test_webhook_rejects_malformed_jws(self):
        """Webhook returns 400 for malformed JWS (not 3 parts)."""
        resp = requests.post(
            f"{BASE_URL}/api/webhook/apple",
            json={"signedPayload": "abc"},
        )
        assert resp.status_code == 400
        data = resp.json()
        assert "Invalid signedPayload" in data.get("detail", "")
        print("PASS: Webhook rejects malformed JWS with 400")

    def test_webhook_rejects_invalid_base64_jws(self):
        """Webhook returns 400 for JWS with invalid base64."""
        # This is a 3-part JWS but with invalid base64 content
        resp = requests.post(
            f"{BASE_URL}/api/webhook/apple",
            json={"signedPayload": "a.b.c"},
        )
        assert resp.status_code == 400
        data = resp.json()
        assert "Invalid signedPayload" in data.get("detail", "")
        print("PASS: Webhook rejects invalid base64 JWS with 400")

    def test_webhook_rejects_jws_without_x5c(self):
        """Webhook returns 400 for JWS without x5c certificate chain."""
        # Create a valid-looking JWS header without x5c
        header = base64.urlsafe_b64encode(json.dumps({"alg": "ES256"}).encode()).decode().rstrip("=")
        payload = base64.urlsafe_b64encode(json.dumps({"test": "data"}).encode()).decode().rstrip("=")
        signature = base64.urlsafe_b64encode(b"fake_signature").decode().rstrip("=")
        fake_jws = f"{header}.{payload}.{signature}"

        resp = requests.post(
            f"{BASE_URL}/api/webhook/apple",
            json={"signedPayload": fake_jws},
        )
        assert resp.status_code == 400
        data = resp.json()
        assert "Invalid signedPayload" in data.get("detail", "")
        print("PASS: Webhook rejects JWS without x5c with 400")


class TestSubscriptionPlansEndpoint:
    """Test subscription plans endpoint."""

    def test_plans_returns_array(self):
        """Plans endpoint returns plans array."""
        resp = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert resp.status_code == 200
        data = resp.json()
        assert "plans" in data
        assert isinstance(data["plans"], list)
        assert len(data["plans"]) > 0
        # Verify premium plan exists
        plan_ids = [p["id"] for p in data["plans"]]
        assert "premium" in plan_ids
        assert "standard" in plan_ids
        assert "base" in plan_ids
        print(f"PASS: Plans endpoint returns {len(data['plans'])} plans")


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication."""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token for test user."""
        time.sleep(1)  # Rate limit buffer
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "fulltest@test.com", "password": "Password.123"},
        )
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        return resp.json()["access_token"]

    def test_subscription_status_returns_data(self, auth_token):
        """Subscription status returns valid data for authenticated user."""
        time.sleep(1)  # Rate limit buffer
        resp = requests.get(
            f"{BASE_URL}/api/subscriptions/status",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Verify response structure
        assert "trial" in data
        assert "beta_mode" in data
        assert "has_active_subscription" in data
        print(f"PASS: Subscription status returned - has_access={data.get('has_active_subscription')}")

    def test_apple_receipt_validation_rejects_empty_body(self, auth_token):
        """Apple receipt validation returns 400 for empty body."""
        time.sleep(1)  # Rate limit buffer
        resp = requests.post(
            f"{BASE_URL}/api/subscriptions/validate-apple-receipt",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={},
        )
        assert resp.status_code == 400
        data = resp.json()
        assert "Missing transaction_id or product_id" in data.get("detail", "")
        print("PASS: Apple receipt validation rejects empty body with 400")

    def test_apple_receipt_validation_rejects_unknown_product(self, auth_token):
        """Apple receipt validation returns 400 for unknown product ID."""
        time.sleep(1)  # Rate limit buffer
        resp = requests.post(
            f"{BASE_URL}/api/subscriptions/validate-apple-receipt",
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            json={
                "transaction_id": "TEST_txn_123",
                "product_id": "us.carryon.app.invalid_product",
            },
        )
        assert resp.status_code == 400
        data = resp.json()
        assert "Unknown product" in data.get("detail", "")
        print("PASS: Apple receipt validation rejects unknown product with 400")


class TestHealthAndBasics:
    """Test basic health endpoints."""

    def test_health_check(self):
        """Health endpoint returns healthy."""
        resp = requests.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "healthy"
        assert data.get("database") == "connected"
        print("PASS: Health check returned healthy")
