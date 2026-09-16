"""Backend tests for Readiness Quiz (iteration 63)."""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "info@carryon.us", "password": "Demo1234!"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- POST /api/quiz/results scoring ----------
class TestQuizSubmission:
    def test_all_yes(self):
        r = requests.post(f"{API}/quiz/results", json={"answers": [2] * 8, "utm": {"utm_source": "qa"}, "page": "/"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["score"] == 100
        assert d["tier"] == "ahead"
        assert d["fixes"] == []
        assert "id" in d and len(d["id"]) >= 32

    def test_all_no(self):
        r = requests.post(f"{API}/quiz/results", json={"answers": [0] * 8, "utm": {"utm_source": "qa"}, "page": "/"})
        assert r.status_code == 200
        d = r.json()
        assert d["score"] == 0
        assert d["tier"] == "searching"
        assert len(d["fixes"]) == 3

    def test_mixed_56(self):
        r = requests.post(
            f"{API}/quiz/results", json={"answers": [2, 1, 0, 2, 1, 0, 2, 1], "utm": {"utm_source": "qa"}, "page": "/"}
        )
        assert r.status_code == 200
        d = r.json()
        assert d["score"] == 56
        assert d["tier"] == "gaps"
        assert len(d["fixes"]) == 3
        # First two fixes should correspond to Q3 (Passwords) and Q6 (encrypted vault) — the No answers (index 2 and 5)
        assert "Passwords & Accounts" in d["fixes"][0]
        assert "encrypted vault" in d["fixes"][1]

    def test_invalid_value(self):
        r = requests.post(f"{API}/quiz/results", json={"answers": [3, 0, 0, 0, 0, 0, 0, 0], "utm": {}, "page": "/"})
        assert r.status_code == 400
        assert "0, 1, or 2" in r.json().get("detail", "")

    def test_wrong_length(self):
        r = requests.post(f"{API}/quiz/results", json={"answers": [0] * 7, "utm": {}, "page": "/"})
        assert r.status_code == 422

    def test_missing_body(self):
        r = requests.post(f"{API}/quiz/results")
        assert r.status_code == 422


# ---------- POST /api/quiz/results/{id}/email ----------
class TestQuizEmail:
    @pytest.fixture(scope="class")
    def result_id(self):
        r = requests.post(
            f"{API}/quiz/results", json={"answers": [2, 1, 0, 2, 1, 0, 2, 1], "utm": {"utm_source": "qa"}, "page": "/"}
        )
        return r.json()["id"]

    def test_invalid_email_format(self, result_id):
        r = requests.post(f"{API}/quiz/results/{result_id}/email", json={"email": "not-an-email"})
        assert r.status_code == 400

    def test_blocked_test_domain(self, result_id):
        r = requests.post(f"{API}/quiz/results/{result_id}/email", json={"email": "a@test.com"})
        assert r.status_code == 400

    def test_unknown_id(self):
        r = requests.post(f"{API}/quiz/results/does-not-exist-uuid/email", json={"email": "qa.carryon@gmail.com"})
        assert r.status_code == 404


# ---------- GET /api/admin/quiz/analytics ----------
class TestQuizAnalytics:
    def test_unauth(self):
        r = requests.get(f"{API}/admin/quiz/analytics")
        assert r.status_code in (401, 403)

    def test_analytics_structure(self, admin_headers):
        r = requests.get(f"{API}/admin/quiz/analytics", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in (
            "total",
            "last_7d",
            "avg_score",
            "emails_captured",
            "emails_sent",
            "capture_rate",
            "by_tier",
            "by_device",
            "histogram",
            "questions",
            "by_source",
            "recent",
            "leads",
        ):
            assert k in d, f"missing key {k}"
        assert len(d["histogram"]) == 5
        assert [h["range"] for h in d["histogram"]] == ["0-19", "20-39", "40-59", "60-79", "80-100"]
        assert sum(h["count"] for h in d["histogram"]) == d["total"]
        assert len(d["questions"]) == 8
        # sorted by gap_pct desc
        gaps = [q["gap_pct"] for q in d["questions"]]
        assert gaps == sorted(gaps, reverse=True)
        for q in d["questions"]:
            assert set(q.keys()) >= {"index", "label", "yes", "partly", "no", "gap_pct"}
        assert len(d["recent"]) <= 20
        for lead in d["leads"]:
            assert lead.get("email")
        # qa source should be present since we submitted
        sources = [s["source"] for s in d["by_source"]]
        assert "qa" in sources
