"""CarryOn™ Auth — shared router, utilities, and helper functions.

All auth sub-modules import their shared state from here.
No route handlers live in this file.
"""

import random
import re
import uuid

from fastapi import APIRouter

from config import db, logger
from models import UserResponse
from services.photo_urls import resolve_photo_url
from utils import create_token

router = APIRouter()

TRIAL_DURATION_DAYS = 30


# ── Response builder ─────────────────────────────────────────────────────────


def _user_response(user: dict, owns_estate: bool = False) -> UserResponse:
    """Build a UserResponse from a DB user dict, including multi-role flags."""
    raw_scope = user.get("admin_scope", "")
    scope_val = raw_scope if isinstance(raw_scope, list) else ([raw_scope] if raw_scope else [])
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        role=user["role"],
        created_at=user["created_at"],
        username=user.get("username", ""),
        photo_url=resolve_photo_url(user.get("photo_url", "")),
        operator_role=user.get("operator_role", ""),
        admin_scope=scope_val,
        is_also_benefactor=user.get("is_also_benefactor", False) or owns_estate,
        is_also_beneficiary=user.get("is_also_beneficiary", False) or False,
        is_beta_tester=user.get("is_beta_tester", False),
        beta_accepted=bool(user.get("beta_accepted_at")),
        partner_slug=user.get("partner_slug", "") or "",
        partner_company=user.get("partner_company", "") or "",
        partner_rep=bool(user.get("partner_rep_for")),
    )


# ── Username helpers ─────────────────────────────────────────────────────────


async def generate_unique_username(first_name: str, last_name: str) -> str:
    """Generate a unique username from first_name + last_name (no dot, lowercase)."""
    clean_first = re.sub(r"[^a-zA-Z0-9]", "", first_name or "").lower()
    clean_last = re.sub(r"[^a-zA-Z0-9]", "", last_name or "").lower()
    base = clean_first + clean_last
    if len(base) < 3:
        base = "user" + str(random.randint(1000, 9999))

    candidate = base
    suffix = 2
    while True:
        existing = await db.users.find_one({"username_lower": candidate}, {"_id": 0, "id": 1})
        if not existing:
            return candidate
        candidate = f"{base}{suffix}"
        suffix += 1
        if suffix > 999:
            candidate = f"{base}{random.randint(10000, 99999)}"


def validate_username(username: str) -> str | None:
    """Validate username format. Returns error message or None if valid."""
    if not username or len(username.strip()) < 3:
        return "Username must be at least 3 characters"
    if len(username.strip()) > 30:
        return "Username must be 30 characters or less"
    if "@" in username:
        return "Username cannot be an email address. Choose a unique name instead."
    if not re.match(r"^[a-zA-Z0-9_]+$", username.strip()):
        return "Username can only contain letters, numbers, and underscores"
    return None


# ── User lookup ──────────────────────────────────────────────────────────────


async def resolve_user_by_identifier(identifier: str) -> dict | None:
    """Resolve a login identifier (username or email) to a user."""
    identifier_lower = identifier.strip().lower()
    user = await db.users.find_one({"username_lower": identifier_lower}, {"_id": 0})
    if user:
        return user
    users_with_email = await db.users.find({"email": identifier_lower}, {"_id": 0}).to_list(2)
    if len(users_with_email) == 1:
        return users_with_email[0]
    return None


# ── Beneficiary reconciliation ───────────────────────────────────────────────


async def _reconcile_beneficiary_by_email(user: dict):
    """Auto-link and status-sync beneficiary records for this user on every login.

    SECURITY: the email -> user_id binding only runs once the email is verified
    (set True on OTP success). This prevents a user who pointed their account
    email at a victim's address (via /auth/email, without re-verifying) from
    claiming the victim's beneficiary records on a subsequent trusted-device
    login that skips OTP.
    """
    if not user.get("email_verified"):
        return
    email = (user.get("email") or "").lower().strip()
    if not email:
        return
    user_id = user["id"]
    linked_any = False

    email_regex = f"^{re.escape(email)}$"
    unlinked = await db.beneficiaries.find(
        {
            "email": {"$regex": email_regex, "$options": "i"},
            "$or": [{"user_id": {"$exists": False}}, {"user_id": ""}, {"user_id": None}],
        },
        {"_id": 0, "id": 1, "estate_id": 1},
    ).to_list(50)

    for ben in unlinked:
        await db.beneficiaries.update_one(
            {"id": ben["id"]},
            {"$set": {"user_id": user_id, "invitation_status": "accepted"}},
        )
        if ben.get("estate_id"):
            await db.estates.update_one(
                {"id": ben["estate_id"]},
                {"$addToSet": {"beneficiaries": user_id}},
            )
        linked_any = True

    result = await db.beneficiaries.update_many(
        {"user_id": user_id, "invitation_status": {"$ne": "accepted"}},
        {"$set": {"invitation_status": "accepted"}},
    )
    if result.modified_count > 0:
        linked_any = True

    if linked_any or not user.get("is_also_beneficiary"):
        has_ben_records = await db.beneficiaries.find_one(
            {"user_id": user_id},
            {"_id": 0, "id": 1},
        )
        if has_ben_records and user.get("role") == "benefactor":
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"is_also_beneficiary": True}},
            )
            user["is_also_beneficiary"] = True

    if linked_any:
        logger.info(f"Reconciled beneficiary record(s) for user {user_id} ({email})")


# ── Session token factories ───────────────────────────────────────────────────


async def create_session_token(user_id, email, role):
    """Create a token and store the session_id on the user for single-session enforcement."""
    session_id = str(uuid.uuid4())
    token = create_token(user_id, email, role, session_id)
    if role != "admin":
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "session_exempt": 1})
        if not (user_doc and user_doc.get("session_exempt")):
            await db.users.update_one(
                {"id": user_id},
                {"$set": {"active_session_id": session_id}},
            )
    return token


async def create_dev_session_token(user_id, email, role):
    """Create a dev-impersonation token that does NOT invalidate the real user's session."""
    session_id = str(uuid.uuid4())
    return create_token(user_id, email, role, session_id, dev_session=True)
