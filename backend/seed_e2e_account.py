"""Dedicated CI/E2E test-account seed.

Idempotently ensures a DEDICATED, non-human benefactor account exists so the
Playwright smoke suite never logs in as a real user. Logging in as a real human
(e.g. info@carryon.us) tripped single-session enforcement (signed the human's
device out) and broke whenever that human's password rotated.

PRODUCTION-SAFE BY DESIGN: this seed only runs when `SEED_E2E_ACCOUNT=true` is
explicitly present in the environment. We set that flag ONLY in the
preview/staging backend `.env` — never in production — so a predictable-
credential account can never exist on prod. The password is supplied via
`E2E_SEED_PASSWORD` (never hardcoded); if it is missing the seed no-ops.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

from config import db, logger
from services.encryption import generate_estate_salt
from utils import hash_password, verify_password


async def _ensure_estate(owner_id: str) -> None:
    if await db.estates.find_one({"owner_id": owner_id}, {"_id": 0, "id": 1}):
        return
    now = datetime.now(timezone.utc)
    await db.estates.insert_one(
        {
            "id": str(uuid.uuid4()),
            "owner_id": owner_id,
            "name": "E2E Test Estate",
            "status": "pre-transition",
            "beneficiaries": [],
            "encryption_salt": generate_estate_salt().hex(),
            "created_at": now.isoformat(),
        }
    )


async def seed_e2e_account() -> None:
    """Create or repair the dedicated E2E benefactor account. No-op on prod."""
    if os.environ.get("SEED_E2E_ACCOUNT", "").strip().lower() != "true":
        return

    email = os.environ.get("E2E_SEED_EMAIL", "e2e@carryon.us").strip()
    password = os.environ.get("E2E_SEED_PASSWORD", "").strip()
    if not password:
        logger.warning("[seed_e2e] SEED_E2E_ACCOUNT=true but E2E_SEED_PASSWORD is unset — skipping")
        return

    email_lower = email.lower()
    # Lazy import to avoid any circular import at module load.
    from routes.auth._core import generate_unique_username

    existing = await db.users.find_one({"email_lower": email_lower}, {"_id": 0})
    if existing:
        updates = {}
        if not verify_password(password, existing.get("password", "")):
            updates["password"] = hash_password(password)
        if not existing.get("email_verified"):
            updates["email_verified"] = True
        if not existing.get("is_e2e_account"):
            updates["is_e2e_account"] = True
        if updates:
            await db.users.update_one({"id": existing["id"]}, {"$set": updates})
            logger.info(f"[seed_e2e] repaired E2E account {email} ({list(updates.keys())})")
        await _ensure_estate(existing["id"])
        return

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    username = await generate_unique_username("E2E", "Tester")
    await db.users.insert_one(
        {
            "id": user_id,
            "email": email,
            "email_lower": email_lower,
            "email_verified": True,
            "username": username,
            "username_lower": username.lower(),
            "password": hash_password(password),
            "name": "E2E Tester",
            "first_name": "E2E",
            "last_name": "Tester",
            "role": "benefactor",
            "subscription_status": "trialing",
            "trial_ends_at": (now + timedelta(days=3650)).isoformat(),
            "is_e2e_account": True,
            "created_at": now.isoformat(),
        }
    )
    await _ensure_estate(user_id)
    logger.info(f"[seed_e2e] created dedicated E2E account {email} (username={username})")
