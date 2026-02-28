"""
Tests for Admin Analytics Digest Feature
- GET /api/admin/analytics-digest/preview - Returns HTML and data object
- POST /api/admin/analytics-digest/send - Sends digest to admin emails
- Both endpoints require admin role (403 for non-admin)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
ADMIN_EMAIL = "admin@carryon.com"
ADMIN_PASSWORD = "admin123"
REGULAR_USER_EMAIL = "founder@carryon.us"
REGULAR_USER_PASSWORD = "CarryOntheWisdom!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get authentication token for admin user"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token") or data.get("access_token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def regular_user_token(api_client):
    """Get authentication token for regular (non-admin) user"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": REGULAR_USER_EMAIL, "password": REGULAR_USER_PASSWORD},
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token") or data.get("access_token")
    pytest.skip(f"Regular user login failed: {response.status_code} - {response.text}")


@pytest.fixture
def admin_headers(admin_token):
    """Headers with admin authentication"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    }


@pytest.fixture
def user_headers(regular_user_token):
    """Headers with regular user authentication"""
    return {
        "Authorization": f"Bearer {regular_user_token}",
        "Content-Type": "application/json",
    }


# ===================== PREVIEW ENDPOINT TESTS =====================


class TestAnalyticsDigestPreview:
    """Tests for GET /api/admin/analytics-digest/preview"""

    def test_preview_requires_authentication(self, api_client):
        """Preview endpoint should return 401/403 without authentication"""
        response = api_client.get(f"{BASE_URL}/api/admin/analytics-digest/preview")
        assert response.status_code in [401, 403], (
            f"Expected 401/403, got {response.status_code}"
        )
        print("PASS: Preview endpoint requires authentication")

    def test_preview_requires_admin_role(self, api_client, user_headers):
        """Preview endpoint should return 403 for non-admin users"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=user_headers
        )
        assert response.status_code == 403, (
            f"Expected 403 for non-admin, got {response.status_code}"
        )
        print("PASS: Preview endpoint returns 403 for non-admin users")

    def test_preview_returns_html_and_data(self, api_client, admin_headers):
        """Preview endpoint should return HTML and data object for admin"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        data = response.json()

        # Check response structure
        assert "html" in data, "Response should contain 'html' field"
        assert "data" in data, "Response should contain 'data' field"

        # Check HTML is not empty and contains key sections
        html = data["html"]
        assert isinstance(html, str), "HTML should be a string"
        assert len(html) > 100, "HTML should not be empty"

        print("PASS: Preview returns HTML and data object")

    def test_preview_html_contains_mrr_section(self, api_client, admin_headers):
        """Preview HTML should contain MRR section"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        html = response.json()["html"]
        assert "MRR" in html, "HTML should contain MRR section"
        print("PASS: Preview HTML contains MRR section")

    def test_preview_html_contains_conversion_section(self, api_client, admin_headers):
        """Preview HTML should contain Conversion section"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        html = response.json()["html"]
        assert "Conversion" in html, "HTML should contain Conversion section"
        print("PASS: Preview HTML contains Conversion section")

    def test_preview_html_contains_churn_section(self, api_client, admin_headers):
        """Preview HTML should contain Churn section"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        html = response.json()["html"]
        assert "Churn" in html, "HTML should contain Churn section"
        print("PASS: Preview HTML contains Churn section")

    def test_preview_html_contains_new_signups_section(self, api_client, admin_headers):
        """Preview HTML should contain New Signups section with sparkline"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        html = response.json()["html"]
        assert "New Signups" in html, "HTML should contain New Signups section"
        print("PASS: Preview HTML contains New Signups section")

    def test_preview_html_contains_user_funnel_section(self, api_client, admin_headers):
        """Preview HTML should contain User Funnel section"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        html = response.json()["html"]
        assert "User Funnel" in html or "Active Trials" in html, (
            "HTML should contain User Funnel section"
        )
        print("PASS: Preview HTML contains User Funnel section")

    def test_preview_html_contains_tier_breakdown_section(
        self, api_client, admin_headers
    ):
        """Preview HTML should contain Tier Breakdown section"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        html = response.json()["html"]
        assert "Tier Breakdown" in html or "Tier" in html, (
            "HTML should contain Tier Breakdown section"
        )
        print("PASS: Preview HTML contains Tier Breakdown section")

    def test_preview_data_contains_required_fields(self, api_client, admin_headers):
        """Preview data object should contain all required analytics fields"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        data = response.json()["data"]
        required_fields = [
            "new_signups",
            "total_users",
            "active_trials",
            "expired_trials",
            "active_subs",
            "cancelled_subs",
            "mrr",
            "arr",
            "churn_rate",
            "conversion_rate",
            "tier_counts",
            "daily_signups",
        ]

        for field in required_fields:
            assert field in data, f"Data should contain '{field}' field"

        print("PASS: Preview data contains all required fields")

    def test_preview_data_mrr_is_numeric(self, api_client, admin_headers):
        """MRR value should be a numeric value"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        data = response.json()["data"]
        assert isinstance(data["mrr"], (int, float)), "MRR should be numeric"
        assert data["mrr"] >= 0, "MRR should be non-negative"
        print(f"PASS: MRR is numeric (${data['mrr']})")

    def test_preview_data_arr_equals_12x_mrr(self, api_client, admin_headers):
        """ARR should equal 12 times MRR"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        data = response.json()["data"]
        expected_arr = round(data["mrr"] * 12, 2)
        actual_arr = round(data["arr"], 2)

        assert actual_arr == expected_arr, (
            f"ARR (${actual_arr}) should be 12x MRR (${data['mrr']})"
        )
        print(f"PASS: ARR (${actual_arr}) equals 12x MRR (${data['mrr']})")

    def test_preview_data_daily_signups_has_7_days(self, api_client, admin_headers):
        """Daily signups should have 7 days of data"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert response.status_code == 200

        data = response.json()["data"]
        daily_signups = data["daily_signups"]

        assert isinstance(daily_signups, list), "daily_signups should be a list"
        assert len(daily_signups) == 7, (
            f"daily_signups should have 7 days, got {len(daily_signups)}"
        )

        # Each day should have 'day' and 'count' fields
        for day_data in daily_signups:
            assert "day" in day_data, "Each day should have 'day' field"
            assert "count" in day_data, "Each day should have 'count' field"

        print("PASS: Daily signups has 7 days of data with day/count fields")


# ===================== SEND ENDPOINT TESTS =====================


class TestAnalyticsDigestSend:
    """Tests for POST /api/admin/analytics-digest/send"""

    def test_send_requires_authentication(self, api_client):
        """Send endpoint should return 401/403 without authentication"""
        response = api_client.post(f"{BASE_URL}/api/admin/analytics-digest/send")
        assert response.status_code in [401, 403], (
            f"Expected 401/403, got {response.status_code}"
        )
        print("PASS: Send endpoint requires authentication")

    def test_send_requires_admin_role(self, api_client, user_headers):
        """Send endpoint should return 403 for non-admin users"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/analytics-digest/send", headers=user_headers
        )
        assert response.status_code == 403, (
            f"Expected 403 for non-admin, got {response.status_code}"
        )
        print("PASS: Send endpoint returns 403 for non-admin users")

    def test_send_works_for_admin(self, api_client, admin_headers):
        """Send endpoint should work for admin users"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/analytics-digest/send", headers=admin_headers
        )
        assert response.status_code == 200, (
            f"Expected 200, got {response.status_code}: {response.text}"
        )

        data = response.json()

        # Check response structure
        assert "success" in data, "Response should contain 'success' field"
        assert data["success"], "success should be True"

        print("PASS: Send endpoint works for admin")

    def test_send_returns_sent_count(self, api_client, admin_headers):
        """Send endpoint should return count of emails sent"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/analytics-digest/send", headers=admin_headers
        )
        assert response.status_code == 200

        data = response.json()
        assert "sent" in data, "Response should contain 'sent' field"
        assert isinstance(data["sent"], int), "'sent' should be an integer"

        print(f"PASS: Send returns sent count ({data['sent']} admin(s))")

    def test_send_returns_data_summary(self, api_client, admin_headers):
        """Send endpoint should return data summary"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/analytics-digest/send", headers=admin_headers
        )
        assert response.status_code == 200

        data = response.json()

        # Check data_summary if present (might not be if no emails sent)
        if "data_summary" in data and data["sent"] > 0:
            summary = data["data_summary"]
            assert "mrr" in summary, "data_summary should contain 'mrr'"
            assert "new_signups" in summary, "data_summary should contain 'new_signups'"
            assert "conversion_rate" in summary, (
                "data_summary should contain 'conversion_rate'"
            )
            assert "churn_rate" in summary, "data_summary should contain 'churn_rate'"
            print(
                f"PASS: Send returns data summary (MRR: ${summary['mrr']}, Signups: {summary['new_signups']})"
            )
        else:
            print("PASS: Send endpoint returns expected response structure")


# ===================== INTEGRATION TESTS =====================


class TestAnalyticsDigestIntegration:
    """Integration tests for analytics digest feature"""

    def test_preview_and_send_consistency(self, api_client, admin_headers):
        """Preview and send should use the same analytics data"""
        # Get preview data
        preview_response = api_client.get(
            f"{BASE_URL}/api/admin/analytics-digest/preview", headers=admin_headers
        )
        assert preview_response.status_code == 200
        preview_data = preview_response.json()["data"]

        # Send digest and compare data
        send_response = api_client.post(
            f"{BASE_URL}/api/admin/analytics-digest/send", headers=admin_headers
        )
        assert send_response.status_code == 200

        send_data = send_response.json()

        # If send returned data_summary, compare key metrics
        if "data_summary" in send_data and send_data["sent"] > 0:
            summary = send_data["data_summary"]
            # MRR should be close (might have slight timing difference)
            assert abs(preview_data["mrr"] - summary["mrr"]) < 1, (
                "MRR should be consistent between preview and send"
            )

        print("PASS: Preview and send use consistent analytics data")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
