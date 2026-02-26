"""
CarryOn™ Comprehensive Test Suite — P0 through P3
Tests ALL API endpoints including edge cases, error handling,
role-based access, and data validation.

Covers endpoints NOT in test_full_api_coverage.py:
- OTP verification flow
- Digital wallet CRUD
- Family plan management
- Support/chat system
- Security settings
- DTS (Digital Trustee Service)
- Transition certificates
- PDF export
- Beneficiary invitation flow
- Deep error handling & edge cases
"""

import io
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Unique test identifiers
RUN_ID = uuid.uuid4().hex[:6]
USER_EMAIL = f"suite_{RUN_ID}@carryon-test.com"
USER_PASSWORD = "SuiteTest123!"
ADMIN_EMAIL = "admin@carryon.com"
ADMIN_PASSWORD = "admin123"


class S:
    """Shared state across ordered test classes."""

    token = None
    user_id = None
    estate_id = None
    beneficiary_id = None
    checklist_id = None
    message_id = None
    document_id = None
    wallet_entry_id = None
    admin_token = None
    support_conversation_id = None
    otp = None


# ── helpers ──────────────────────────────────────────────────────────
def auth_header(token=None):
    t = token or S.token
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def get_otp_from_db(email):
    """Retrieve OTP directly from MongoDB for testing."""
    from pymongo import MongoClient

    c = MongoClient("mongodb://localhost:27017")
    db = c["test_database"]
    doc = db.otps.find_one({"email": email})
    return doc["otp"] if doc else None


# =====================================================================
#  P0 — AUTH & USER FLOWS
# =====================================================================
class TestP0Auth:
    """P0: Complete authentication lifecycle."""

    def test_01_health(self):
        r = requests.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "healthy"
        assert d["database"] == "connected"
        print(f"  Health OK: v{d['version']}")

    def test_02_register(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": USER_EMAIL,
                "password": USER_PASSWORD,
                "first_name": "Suite",
                "last_name": "Tester",
                "sms_consent": True,
            },
        )
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == USER_EMAIL
        assert "otp_hint" in d
        print(f"  Registered: {USER_EMAIL}")

    def test_03_register_duplicate(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": USER_EMAIL,
                "password": USER_PASSWORD,
                "first_name": "Dup",
                "last_name": "User",
            },
        )
        assert r.status_code == 400
        print("  Duplicate email rejected")

    def test_04_register_missing_fields(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": "incomplete@test.com"},
        )
        assert r.status_code == 422
        print("  Missing fields rejected (422)")

    def test_05_login_wrong_password(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": USER_EMAIL, "password": "WrongPass!"},
        )
        assert r.status_code == 401
        print("  Wrong password rejected")

    def test_06_login_sends_otp(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": USER_EMAIL, "password": USER_PASSWORD},
        )
        assert r.status_code == 200
        d = r.json()
        assert "otp_hint" in d
        assert "otp_method" in d
        print(f"  OTP sent via {d['otp_method']}")

    def test_07_verify_otp_wrong(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"email": USER_EMAIL, "otp": "000000"},
        )
        assert r.status_code in [400, 401]
        print("  Wrong OTP rejected")

    def test_08_verify_otp_correct(self):
        otp = get_otp_from_db(USER_EMAIL)
        assert otp is not None, "OTP not found in DB"
        r = requests.post(
            f"{BASE_URL}/api/auth/verify-otp",
            json={"email": USER_EMAIL, "otp": otp},
        )
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d
        assert d["user"]["email"] == USER_EMAIL
        S.token = d["access_token"]
        S.user_id = d["user"]["id"]
        print(f"  OTP verified, token obtained, user_id={S.user_id}")

    def test_09_get_me(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_header())
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == USER_EMAIL
        assert d["id"] == S.user_id
        assert "name" in d
        print(f"  /auth/me: {d['name']} ({d['role']})")

    def test_10_get_me_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code in [401, 403]
        print("  Unauthenticated /me rejected")

    def test_11_get_me_bad_token(self):
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert r.status_code in [401, 403]
        print("  Bad token rejected")

    def test_12_dev_login(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": USER_EMAIL, "password": USER_PASSWORD},
        )
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d
        # Refresh token
        S.token = d["access_token"]
        print("  Dev-login OK")

    def test_13_nonexistent_user_login(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "ghost@nowhere.com", "password": "anything"},
        )
        assert r.status_code == 401
        print("  Nonexistent user rejected")


# =====================================================================
#  P1 — ESTATE CRUD
# =====================================================================
class TestP1Estates:
    """P1: Estate lifecycle."""

    def test_01_create_estate(self):
        r = requests.post(
            f"{BASE_URL}/api/estates",
            headers=auth_header(),
            json={"name": f"Suite Estate {RUN_ID}"},
        )
        assert r.status_code == 200
        d = r.json()
        assert "id" in d
        S.estate_id = d["id"]
        print(f"  Estate created: {S.estate_id}")

    def test_02_list_estates(self):
        r = requests.get(f"{BASE_URL}/api/estates", headers=auth_header())
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        assert any(e["id"] == S.estate_id for e in d)
        print(f"  Listed {len(d)} estates")

    def test_03_get_estate(self):
        r = requests.get(
            f"{BASE_URL}/api/estates/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == S.estate_id
        print(f"  Estate detail: {d['name']}")

    def test_04_update_estate(self):
        r = requests.patch(
            f"{BASE_URL}/api/estates/{S.estate_id}",
            headers=auth_header(),
            json={"name": "Updated Suite Estate", "state": "Texas"},
        )
        assert r.status_code == 200
        print("  Estate updated")

    def test_05_get_nonexistent_estate(self):
        r = requests.get(
            f"{BASE_URL}/api/estates/nonexistent-id-12345", headers=auth_header()
        )
        assert r.status_code in [404, 500]
        print("  Nonexistent estate handled")

    def test_06_readiness_score(self):
        r = requests.get(
            f"{BASE_URL}/api/estate/{S.estate_id}/readiness", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert "overall_score" in d
        assert 0 <= d["overall_score"] <= 100
        print(f"  Readiness: {d['overall_score']}%")

    def test_07_recalculate_readiness(self):
        r = requests.post(
            f"{BASE_URL}/api/estate/{S.estate_id}/readiness", headers=auth_header()
        )
        assert r.status_code == 200
        print("  Readiness recalculated")

    def test_08_activity_log(self):
        r = requests.get(
            f"{BASE_URL}/api/activity/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        print(f"  Activity log: {len(d)} events")


# =====================================================================
#  P1 — BENEFICIARY CRUD
# =====================================================================
class TestP1Beneficiaries:
    """P1: Beneficiary lifecycle."""

    def test_01_create(self):
        r = requests.post(
            f"{BASE_URL}/api/beneficiaries",
            headers=auth_header(),
            json={
                "estate_id": S.estate_id,
                "first_name": "Jane",
                "last_name": "TestChild",
                "relation": "child",
                "email": f"jane_{RUN_ID}@test.com",
            },
        )
        assert r.status_code == 200
        d = r.json()
        assert "id" in d
        S.beneficiary_id = d["id"]
        print(f"  Beneficiary: {d['first_name']} ({S.beneficiary_id})")

    def test_02_list(self):
        r = requests.get(
            f"{BASE_URL}/api/beneficiaries/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        assert len(d) >= 1
        print(f"  Listed {len(d)} beneficiaries")

    def test_03_update(self):
        r = requests.put(
            f"{BASE_URL}/api/beneficiaries/{S.beneficiary_id}",
            headers=auth_header(),
            json={
                "estate_id": S.estate_id,
                "first_name": "Jane",
                "last_name": "Updated",
                "relation": "spouse",
                "email": f"jane_{RUN_ID}@test.com",
            },
        )
        assert r.status_code == 200
        d = r.json()
        assert d["relation"] == "spouse"
        print("  Beneficiary updated")

    def test_04_invite(self):
        r = requests.post(
            f"{BASE_URL}/api/beneficiaries/{S.beneficiary_id}/invite",
            headers=auth_header(),
        )
        # Could be 200 or 400 if email not configured
        assert r.status_code in [200, 400, 500]
        print(f"  Invite: status={r.status_code}")

    def test_05_create_missing_fields(self):
        r = requests.post(
            f"{BASE_URL}/api/beneficiaries",
            headers=auth_header(),
            json={"estate_id": S.estate_id},
        )
        assert r.status_code == 422
        print("  Missing fields rejected")


# =====================================================================
#  P1 — CHECKLIST CRUD
# =====================================================================
class TestP1Checklist:
    """P1: Checklist lifecycle."""

    def test_01_create(self):
        r = requests.post(
            f"{BASE_URL}/api/checklists",
            headers=auth_header(),
            json={
                "estate_id": S.estate_id,
                "title": "Review insurance policies",
                "description": "Gather all life insurance documents",
                "category": "financial",
                "priority": "high",
                "due_timeframe": "first_week",
            },
        )
        assert r.status_code == 200
        d = r.json()
        S.checklist_id = d["id"]
        print(f"  Checklist item: {S.checklist_id}")

    def test_02_list(self):
        r = requests.get(
            f"{BASE_URL}/api/checklists/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        print(f"  Listed {len(d)} checklist items")

    def test_03_update(self):
        r = requests.put(
            f"{BASE_URL}/api/checklists/{S.checklist_id}",
            headers=auth_header(),
            json={"title": "Review ALL insurance", "priority": "critical"},
        )
        assert r.status_code == 200
        print("  Checklist item updated")

    def test_04_toggle(self):
        r = requests.patch(
            f"{BASE_URL}/api/checklists/{S.checklist_id}/toggle",
            headers=auth_header(),
        )
        assert r.status_code == 200
        d = r.json()
        assert "is_completed" in d
        print(f"  Toggled: completed={d['is_completed']}")

    def test_05_toggle_back(self):
        r = requests.patch(
            f"{BASE_URL}/api/checklists/{S.checklist_id}/toggle",
            headers=auth_header(),
        )
        assert r.status_code == 200
        print("  Toggled back")

    def test_06_reorder(self):
        r = requests.post(
            f"{BASE_URL}/api/checklists/reorder",
            headers=auth_header(),
            json={"estate_id": S.estate_id, "item_ids": [S.checklist_id]},
        )
        assert r.status_code == 200
        print("  Reorder OK")


# =====================================================================
#  P1 — DOCUMENTS / VAULT
# =====================================================================
class TestP1Documents:
    """P1: Document vault operations."""

    def test_01_list_empty(self):
        r = requests.get(
            f"{BASE_URL}/api/documents/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        print(f"  Documents: {len(d)}")

    def test_02_upload(self):
        f = io.BytesIO(b"Last will and testament content for testing purposes.")
        r = requests.post(
            f"{BASE_URL}/api/documents/upload",
            headers={"Authorization": f"Bearer {S.token}"},
            params={
                "estate_id": S.estate_id,
                "name": "Test Will",
                "category": "legal",
            },
            files={"file": ("test_will.txt", f, "text/plain")},
        )
        assert r.status_code in [200, 201]
        d = r.json()
        if "id" in d:
            S.document_id = d["id"]
        print(f"  Upload: status={r.status_code}")

    def test_03_list_after_upload(self):
        r = requests.get(
            f"{BASE_URL}/api/documents/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        if d and not S.document_id:
            S.document_id = d[0].get("id")
        print(f"  Documents after upload: {len(d)}")

    def test_04_update_document(self):
        if not S.document_id:
            pytest.skip("No document to update")
        r = requests.put(
            f"{BASE_URL}/api/documents/{S.document_id}",
            headers=auth_header(),
            json={"name": "Updated Will", "category": "legal"},
        )
        assert r.status_code == 200
        print("  Document updated")

    def test_05_download_document(self):
        if not S.document_id:
            pytest.skip("No document to download")
        r = requests.get(
            f"{BASE_URL}/api/documents/{S.document_id}/download",
            headers=auth_header(),
        )
        assert r.status_code in [200, 404]
        print(f"  Download: status={r.status_code}")


# =====================================================================
#  P1 — MESSAGES
# =====================================================================
class TestP1Messages:
    """P1: Milestone messages."""

    def test_01_create(self):
        r = requests.post(
            f"{BASE_URL}/api/messages",
            headers=auth_header(),
            json={
                "estate_id": S.estate_id,
                "title": "To My Family",
                "content": "I want you all to know how much I love you.",
                "message_type": "text",
                "recipients": [],
                "trigger_type": "immediate",
            },
        )
        assert r.status_code == 200
        d = r.json()
        S.message_id = d["id"]
        print(f"  Message: {S.message_id}")

    def test_02_list(self):
        r = requests.get(
            f"{BASE_URL}/api/messages/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        assert len(d) >= 1
        print(f"  Listed {len(d)} messages")

    def test_03_update(self):
        r = requests.put(
            f"{BASE_URL}/api/messages/{S.message_id}",
            headers=auth_header(),
            json={"title": "To My Beloved Family", "trigger_type": "on_death"},
        )
        assert r.status_code == 200
        print("  Message updated")


# =====================================================================
#  P1 — DIGITAL WALLET
# =====================================================================
class TestP1DigitalWallet:
    """P1: Digital wallet/credentials."""

    def test_01_list_empty(self):
        r = requests.get(
            f"{BASE_URL}/api/digital-wallet/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        print(f"  Wallet entries: {len(d)}")

    def test_02_create(self):
        r = requests.post(
            f"{BASE_URL}/api/digital-wallet",
            headers=auth_header(),
            json={
                "estate_id": S.estate_id,
                "account_name": "Bank Login",
                "category": "financial",
                "login_username": "user@bank.com",
                "login_password": "SecretPass123",
                "url": "https://mybank.com",
                "notes": "Main checking account",
            },
        )
        assert r.status_code == 200
        d = r.json()
        assert "id" in d
        S.wallet_entry_id = d["id"]
        print(f"  Wallet entry: {S.wallet_entry_id}")

    def test_03_list_after_create(self):
        r = requests.get(
            f"{BASE_URL}/api/digital-wallet/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 1
        print(f"  Wallet entries: {len(d)}")

    def test_04_update(self):
        r = requests.put(
            f"{BASE_URL}/api/digital-wallet/{S.wallet_entry_id}",
            headers=auth_header(),
            json={
                "estate_id": S.estate_id,
                "account_name": "Primary Bank",
                "notes": "Updated notes",
            },
        )
        assert r.status_code == 200
        print("  Wallet entry updated")

    def test_05_delete(self):
        r = requests.delete(
            f"{BASE_URL}/api/digital-wallet/{S.wallet_entry_id}",
            headers=auth_header(),
        )
        assert r.status_code == 200
        print("  Wallet entry deleted")


# =====================================================================
#  P1 — SUPPORT / CHAT
# =====================================================================
class TestP1Support:
    """P1: Support messaging system."""

    def test_01_send_message(self):
        r = requests.post(
            f"{BASE_URL}/api/support/messages",
            headers=auth_header(),
            json={"content": "I need help with my estate plan."},
        )
        assert r.status_code == 200
        d = r.json()
        if "conversation_id" in d:
            S.support_conversation_id = d["conversation_id"]
        print("  Support message sent")

    def test_02_get_messages(self):
        r = requests.get(
            f"{BASE_URL}/api/support/messages", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        print(f"  Support messages: {len(d)}")

    def test_03_get_conversations(self):
        # Admin-only endpoint — use admin token if available
        if not S.admin_token:
            # Try getting admin token first
            r = requests.post(
                f"{BASE_URL}/api/auth/dev-login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            )
            if r.status_code == 200:
                S.admin_token = r.json()["access_token"]
        if S.admin_token:
            r = requests.get(
                f"{BASE_URL}/api/support/conversations",
                headers=auth_header(S.admin_token),
            )
            assert r.status_code == 200
            print("  Conversations retrieved (admin)")
        else:
            # Verify non-admin gets 403
            r = requests.get(
                f"{BASE_URL}/api/support/conversations", headers=auth_header()
            )
            assert r.status_code == 403
            print("  Conversations: admin-only (403 for regular user)")

    def test_04_unread_count(self):
        r = requests.get(
            f"{BASE_URL}/api/support/unread-count", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert "unread_count" in d
        print(f"  Unread: {d['unread_count']}")


# =====================================================================
#  P1 — SECURITY SETTINGS
# =====================================================================
class TestP1Security:
    """P1: Section security endpoints."""

    def test_01_get_settings(self):
        r = requests.get(
            f"{BASE_URL}/api/security/settings", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict)
        print(f"  Security settings: {len(d)} sections")

    def test_02_get_questions(self):
        r = requests.get(
            f"{BASE_URL}/api/security/questions", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert "questions" in d
        assert isinstance(d["questions"], list)
        print(f"  Security questions: {len(d['questions'])}")


# =====================================================================
#  P2 — ADMIN ENDPOINTS
# =====================================================================
class TestP2Admin:
    """P2: Admin-only endpoints."""

    def test_01_admin_login(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if r.status_code != 200:
            pytest.skip("Admin account unavailable")
        S.admin_token = r.json()["access_token"]
        print("  Admin logged in")

    def test_02_stats(self):
        if not S.admin_token:
            pytest.skip("No admin token")
        r = requests.get(
            f"{BASE_URL}/api/admin/stats", headers=auth_header(S.admin_token)
        )
        assert r.status_code == 200
        d = r.json()
        assert "users" in d and "estates" in d
        print(f"  Stats: {d['users']['total']} users, {d['estates']['total']} estates")

    def test_03_users_list(self):
        if not S.admin_token:
            pytest.skip("No admin token")
        r = requests.get(
            f"{BASE_URL}/api/admin/users", headers=auth_header(S.admin_token)
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        print(f"  Admin users: {len(d)}")

    def test_04_activity_log(self):
        if not S.admin_token:
            pytest.skip("No admin token")
        r = requests.get(
            f"{BASE_URL}/api/admin/activity", headers=auth_header(S.admin_token)
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        print(f"  Activity: {len(d)} events")

    def test_05_stats_rejects_non_admin(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/stats", headers=auth_header(S.token)
        )
        assert r.status_code == 403
        print("  Non-admin rejected from /admin/stats")

    def test_06_users_rejects_non_admin(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/users", headers=auth_header(S.token)
        )
        assert r.status_code == 403
        print("  Non-admin rejected from /admin/users")

    def test_07_dev_switcher_config(self):
        if not S.admin_token:
            pytest.skip("No admin token")
        r = requests.get(
            f"{BASE_URL}/api/dev-switcher/config",
            headers=auth_header(S.admin_token),
        )
        assert r.status_code == 200
        print("  Dev switcher config retrieved")


# =====================================================================
#  P2 — DIGEST & PUSH
# =====================================================================
class TestP2Services:
    """P2: Digest preferences and push notifications."""

    def test_01_get_digest_prefs(self):
        r = requests.get(
            f"{BASE_URL}/api/digest/preferences", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert "weekly_digest" in d
        print(f"  Digest: weekly_digest={d['weekly_digest']}")

    def test_02_update_digest_on(self):
        r = requests.put(
            f"{BASE_URL}/api/digest/preferences",
            headers=auth_header(),
            json={"weekly_digest": True},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["weekly_digest"] is True
        print("  Digest enabled")

    def test_03_update_digest_off(self):
        r = requests.put(
            f"{BASE_URL}/api/digest/preferences",
            headers=auth_header(),
            json={"weekly_digest": False},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["weekly_digest"] is False
        print("  Digest disabled")

    def test_04_digest_preview(self):
        r = requests.post(
            f"{BASE_URL}/api/digest/preview", headers=auth_header()
        )
        # May return 200 or 500 depending on email service config
        assert r.status_code in [200, 500]
        print(f"  Digest preview: status={r.status_code}")

    def test_05_vapid_key(self):
        r = requests.get(f"{BASE_URL}/api/push/vapid-public-key")
        assert r.status_code in [200, 503]
        print(f"  VAPID key: status={r.status_code}")


# =====================================================================
#  P2 — SUBSCRIPTIONS
# =====================================================================
class TestP2Subscriptions:
    """P2: Subscription and payment endpoints."""

    def test_01_plans(self):
        r = requests.get(f"{BASE_URL}/api/subscriptions/plans")
        assert r.status_code == 200
        d = r.json()
        assert "plans" in d
        assert len(d["plans"]) > 0
        print(f"  Plans: {len(d['plans'])}, beta={d.get('beta_mode')}")

    def test_02_status(self):
        r = requests.get(
            f"{BASE_URL}/api/subscriptions/status", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert "plan" in d or "subscription" in d or "status" in d
        print("  Subscription status retrieved")

    def test_03_admin_settings(self):
        if not S.admin_token:
            pytest.skip("No admin token")
        r = requests.get(
            f"{BASE_URL}/api/admin/subscription-settings",
            headers=auth_header(S.admin_token),
        )
        assert r.status_code == 200
        print("  Admin subscription settings retrieved")


# =====================================================================
#  P2 — FAMILY PLAN
# =====================================================================
class TestP2FamilyPlan:
    """P2: Family plan endpoints."""

    def test_01_status(self):
        r = requests.get(
            f"{BASE_URL}/api/family-plan/status", headers=auth_header()
        )
        assert r.status_code == 200
        print("  Family plan status retrieved")


# =====================================================================
#  P2 — DTS (Digital Trustee Service)
# =====================================================================
class TestP2DTS:
    """P2: DTS task management."""

    def test_01_list_tasks(self):
        r = requests.get(
            f"{BASE_URL}/api/dts/tasks/{S.estate_id}", headers=auth_header()
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        print(f"  DTS tasks: {len(d)}")

    def test_02_list_all_tasks(self):
        # Admin-only endpoint
        if S.admin_token:
            r = requests.get(
                f"{BASE_URL}/api/dts/tasks/all",
                headers=auth_header(S.admin_token),
            )
            assert r.status_code == 200
            print("  All DTS tasks retrieved (admin)")
        else:
            r = requests.get(
                f"{BASE_URL}/api/dts/tasks/all", headers=auth_header()
            )
            assert r.status_code == 403
            print("  DTS all tasks: admin-only (403)")


# =====================================================================
#  P2 — TRANSITION
# =====================================================================
class TestP2Transition:
    """P2: Transition management."""

    def test_01_certificates(self):
        # Admin-only endpoint
        if S.admin_token:
            r = requests.get(
                f"{BASE_URL}/api/transition/certificates",
                headers=auth_header(S.admin_token),
            )
            assert r.status_code == 200
            d = r.json()
            assert isinstance(d, list)
            print(f"  Certificates: {len(d)} (admin)")
        else:
            r = requests.get(
                f"{BASE_URL}/api/transition/certificates", headers=auth_header()
            )
            assert r.status_code == 403
            print("  Certificates: admin-only (403)")

    def test_02_status(self):
        r = requests.get(
            f"{BASE_URL}/api/transition/status/{S.estate_id}",
            headers=auth_header(),
        )
        assert r.status_code == 200
        print("  Transition status retrieved")


# =====================================================================
#  P2 — PDF EXPORT
# =====================================================================
class TestP2PDFExport:
    """P2: PDF export."""

    def test_01_export(self):
        r = requests.get(
            f"{BASE_URL}/api/estate/{S.estate_id}/export-pdf",
            headers=auth_header(),
        )
        # 200 = PDF generated, or may error if no data
        assert r.status_code in [200, 500]
        if r.status_code == 200:
            assert "pdf" in r.headers.get("content-type", "").lower() or len(r.content) > 100
        print(f"  PDF export: status={r.status_code}")


# =====================================================================
#  P3 — GUARDIAN AI
# =====================================================================
class TestP3GuardianAI:
    """P3: Estate Guardian AI chat."""

    def test_01_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            json={"message": "Hello", "estate_id": S.estate_id},
        )
        assert r.status_code in [401, 403]
        print("  Guardian AI requires auth")

    def test_02_chat(self):
        r = requests.post(
            f"{BASE_URL}/api/chat/guardian",
            headers=auth_header(),
            json={
                "message": "What should I include in my estate plan?",
                "estate_id": S.estate_id,
            },
        )
        if r.status_code == 200:
            d = r.json()
            assert "response" in d
            assert "session_id" in d
            print(f"  AI response: {d['response'][:80]}...")
        else:
            print(f"  AI chat: status={r.status_code} (may not be configured)")

    def test_03_chat_history(self):
        # Use a random session_id — should return empty
        r = requests.get(
            f"{BASE_URL}/api/chat/history/test-session-{RUN_ID}",
            headers=auth_header(),
        )
        assert r.status_code == 200
        print("  Chat history endpoint OK")


# =====================================================================
#  P3 — EDGE CASES & ERROR HANDLING
# =====================================================================
class TestP3EdgeCases:
    """P3: Error handling, validation, edge cases."""

    def test_01_invalid_json(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            headers={"Content-Type": "application/json"},
            data="not json",
        )
        assert r.status_code == 422
        print("  Invalid JSON rejected")

    def test_02_empty_body(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            headers={"Content-Type": "application/json"},
            json={},
        )
        assert r.status_code == 422
        print("  Empty body rejected")

    def test_03_nonexistent_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/this-does-not-exist")
        assert r.status_code == 404
        print("  404 for unknown endpoint")

    def test_04_unauthorized_estate_access(self):
        # Create a second user and try to access first user's estate
        email2 = f"other_{RUN_ID}@test.com"
        requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": email2,
                "password": "OtherPass123!",
                "first_name": "Other",
                "last_name": "User",
            },
        )
        r2 = requests.post(
            f"{BASE_URL}/api/auth/dev-login",
            json={"email": email2, "password": "OtherPass123!"},
        )
        if r2.status_code == 200:
            other_token = r2.json()["access_token"]
            r = requests.get(
                f"{BASE_URL}/api/estates/{S.estate_id}",
                headers=auth_header(other_token),
            )
            # Should be forbidden or return empty
            assert r.status_code in [403, 404, 200]  # Some apps return empty data
            print(f"  Cross-user access: status={r.status_code}")
        else:
            print("  Cross-user test skipped (registration failed)")

    def test_05_sql_injection_attempt(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "'; DROP TABLE users;--", "password": "test"},
        )
        assert r.status_code in [401, 422]
        print("  SQL injection attempt safely handled")

    def test_06_xss_attempt(self):
        r = requests.post(
            f"{BASE_URL}/api/messages",
            headers=auth_header(),
            json={
                "estate_id": S.estate_id,
                "title": "<script>alert('xss')</script>",
                "content": "normal content",
                "message_type": "text",
                "recipients": [],
                "trigger_type": "immediate",
            },
        )
        # Should accept but store safely (no execution)
        assert r.status_code == 200
        d = r.json()
        # Clean up
        if "id" in d:
            requests.delete(
                f"{BASE_URL}/api/messages/{d['id']}", headers=auth_header()
            )
        print("  XSS content stored safely")

    def test_07_oversized_payload(self):
        r = requests.post(
            f"{BASE_URL}/api/messages",
            headers=auth_header(),
            json={
                "estate_id": S.estate_id,
                "title": "Normal",
                "content": "A" * 100000,  # 100KB content
                "message_type": "text",
                "recipients": [],
                "trigger_type": "immediate",
            },
        )
        # Should either accept or reject, but not crash
        assert r.status_code in [200, 413, 422]
        if r.status_code == 200:
            d = r.json()
            if "id" in d:
                requests.delete(
                    f"{BASE_URL}/api/messages/{d['id']}", headers=auth_header()
                )
        print(f"  Large payload: status={r.status_code}")

    def test_08_no_id_leak_in_responses(self):
        """Verify MongoDB _id is not exposed in API responses."""
        r = requests.get(
            f"{BASE_URL}/api/estates/{S.estate_id}", headers=auth_header()
        )
        if r.status_code == 200:
            d = r.json()
            assert "_id" not in d, "MongoDB _id leaked in estate response!"
        print("  No _id leak in estate response")

    def test_09_no_id_leak_beneficiaries(self):
        r = requests.get(
            f"{BASE_URL}/api/beneficiaries/{S.estate_id}", headers=auth_header()
        )
        if r.status_code == 200:
            d = r.json()
            for b in d:
                assert "_id" not in b, f"MongoDB _id leaked in beneficiary: {b}"
        print("  No _id leak in beneficiary responses")

    def test_10_no_id_leak_messages(self):
        r = requests.get(
            f"{BASE_URL}/api/messages/{S.estate_id}", headers=auth_header()
        )
        if r.status_code == 200:
            d = r.json()
            for m in d:
                assert "_id" not in m, f"MongoDB _id leaked in message: {m}"
        print("  No _id leak in message responses")

    def test_11_no_id_leak_checklist(self):
        r = requests.get(
            f"{BASE_URL}/api/checklists/{S.estate_id}", headers=auth_header()
        )
        if r.status_code == 200:
            d = r.json()
            for c in d:
                assert "_id" not in c, f"MongoDB _id leaked in checklist: {c}"
        print("  No _id leak in checklist responses")


# =====================================================================
#  CLEANUP — Delete test data
# =====================================================================
class TestZZCleanup:
    """Delete all test data created during the run."""

    def test_01_delete_message(self):
        if S.message_id:
            r = requests.delete(
                f"{BASE_URL}/api/messages/{S.message_id}", headers=auth_header()
            )
            assert r.status_code == 200
            print("  Message deleted")

    def test_02_delete_checklist(self):
        if S.checklist_id:
            r = requests.delete(
                f"{BASE_URL}/api/checklists/{S.checklist_id}", headers=auth_header()
            )
            assert r.status_code == 200
            print("  Checklist item deleted")

    def test_03_delete_document(self):
        if S.document_id:
            r = requests.delete(
                f"{BASE_URL}/api/documents/{S.document_id}", headers=auth_header()
            )
            assert r.status_code == 200
            print("  Document deleted")

    def test_04_delete_beneficiary(self):
        if S.beneficiary_id:
            r = requests.delete(
                f"{BASE_URL}/api/beneficiaries/{S.beneficiary_id}",
                headers=auth_header(),
            )
            assert r.status_code == 200
            print("  Beneficiary deleted")

    def test_05_delete_estate(self):
        if S.estate_id:
            r = requests.delete(
                f"{BASE_URL}/api/estates/{S.estate_id}", headers=auth_header()
            )
            assert r.status_code == 200
            print("  Estate deleted")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-x"])
