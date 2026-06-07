"""CarryOn access-control helpers for estate-scoped release rules.

These helpers intentionally sit below individual routes. Estate membership
answers "does this person belong here?"; release access answers "does this
specific item belong to this person right now?"
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from config import db


ESSENTIAL_PRE_TRANSITION_DOCUMENT_CATEGORIES = {
    "living_will",
    "healthcare_directive",
    "general_poa",
    "financial_poa",
    "poa",
}


def _as_clean_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _id_set(values: list[Any] | tuple[Any, ...] | set[Any] | None) -> set[str]:
    result: set[str] = set()
    for value in values or []:
        clean = _as_clean_str(value)
        if clean:
            result.add(clean)
    return result


def _email(value: Any) -> str | None:
    clean = _as_clean_str(value)
    return clean.lower() if clean else None


async def resolve_estate_actor(estate_id: str, current_user: dict) -> dict[str, Any]:
    """Resolve the current user's relationship to an estate.

    The same human may appear as:
      - users.id
      - beneficiaries.id
      - beneficiaries.user_id
      - beneficiaries.email

    Legacy feature rows use a mix of those identifiers, so callers should use
    `release_ids` when matching item-level designations.
    """
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    user_id = _as_clean_str(current_user.get("id"))
    # SECURITY (impersonation guard): only trust the account email for
    # authorization once it has been verified via OTP. An unverified or
    # freshly-changed email must never match a beneficiary record — otherwise a
    # user could point their email at a victim's address and inherit their
    # estate access. user_id (immutable) is always trusted.
    email_verified = bool(current_user.get("email_verified"))
    user_email = _email(current_user.get("email")) if email_verified else None
    role = current_user.get("role") or ""

    ors: list[dict[str, Any]] = []
    if user_id:
        ors.append({"user_id": user_id})
    if user_email:
        ors.append({"email": user_email})

    beneficiary_records: list[dict[str, Any]] = []
    if ors:
        beneficiary_records = await db.beneficiaries.find(
            {
                "estate_id": estate_id,
                "deleted_at": None,
                "$or": ors,
            },
            {"_id": 0},
        ).to_list(50)

    estate_beneficiary_user_ids = _id_set(estate.get("beneficiaries") or [])
    beneficiary_user_ids: set[str] = set()
    beneficiary_record_ids: set[str] = set()
    release_ids: set[str] = set()
    emails: set[str] = set()

    if user_id:
        release_ids.add(user_id)
        if user_id in estate_beneficiary_user_ids:
            beneficiary_user_ids.add(user_id)
    if user_email:
        release_ids.add(user_email)
        emails.add(user_email)

    for ben in beneficiary_records:
        ben_id = _as_clean_str(ben.get("id"))
        ben_user_id = _as_clean_str(ben.get("user_id"))
        ben_email = _email(ben.get("email"))
        if ben_id:
            beneficiary_record_ids.add(ben_id)
            release_ids.add(ben_id)
        if ben_user_id:
            beneficiary_user_ids.add(ben_user_id)
            release_ids.add(ben_user_id)
        if ben_email:
            emails.add(ben_email)
            release_ids.add(ben_email)

    is_owner = bool(user_id and estate.get("owner_id") == user_id)
    is_admin = role == "admin"
    is_operator = role == "operator"
    is_beneficiary = bool((user_id and user_id in estate_beneficiary_user_ids) or beneficiary_records)
    is_primary_beneficiary = any(bool(b.get("is_primary")) for b in beneficiary_records)

    active_emergency_grants: list[dict[str, Any]] = []
    emergency_scopes: set[str] = set()
    if user_id:
        now = datetime.now(timezone.utc).isoformat()
        active_emergency_grants = await db.emergency_access.find(
            {
                "estate_id": estate_id,
                "requester_id": user_id,
                "status": "approved",
                "access_expires_at": {"$gt": now},
            },
            {"_id": 0},
        ).to_list(20)
        for grant in active_emergency_grants:
            emergency_scopes.update(_id_set(grant.get("granted_scopes") or []))

    return {
        "estate": estate,
        "estate_id": estate_id,
        "user_id": user_id,
        "role": role,
        "is_owner": is_owner,
        "is_admin": is_admin,
        "is_operator": is_operator,
        "is_staff": is_admin or is_operator,
        "is_beneficiary": is_beneficiary,
        "is_primary_beneficiary": is_primary_beneficiary,
        "is_estate_member": is_owner or is_admin or is_beneficiary,
        "beneficiary_records": beneficiary_records,
        "beneficiary_record_ids": beneficiary_record_ids,
        "beneficiary_user_ids": beneficiary_user_ids,
        "emails": emails,
        "release_ids": release_ids,
        "is_transitioned": estate.get("status") == "transitioned",
        "active_emergency_grants": active_emergency_grants,
        "emergency_scopes": emergency_scopes,
    }


async def require_estate_actor(
    estate_id: str,
    current_user: dict,
    *,
    allow_staff: bool = False,
) -> dict[str, Any]:
    actor = await resolve_estate_actor(estate_id, current_user)
    if actor["is_estate_member"] or (allow_staff and actor["is_staff"]):
        return actor
    raise HTTPException(status_code=403, detail="Access denied")


def _designation_matches(designated: Any, actor: dict[str, Any]) -> bool:
    designated_ids = _id_set(designated if isinstance(designated, list) else [designated])
    if not designated_ids:
        # FAIL-CLOSED: an item with no explicit designation is private to the
        # owner. CarryOn's promise is "released only to the people the benefactor
        # names" — so an un-named item is released to nobody.
        return False
    if "all" in designated_ids:
        return True
    return bool(designated_ids & actor.get("release_ids", set()))


def _timing_for_actor(timing: Any, actor: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(timing, dict):
        return None
    for rid in actor.get("release_ids", set()):
        raw = timing.get(rid)
        if isinstance(raw, dict):
            return raw
    return None


def emergency_scope_allows(actor: dict[str, Any], scope: str) -> bool:
    scopes = actor.get("emergency_scopes") or set()
    return scope in scopes or "*" in scopes


# ── Beneficiary section permissions (server-side enforcement) ────────────────
# The benefactor / primary beneficiary can disable whole sections for a
# beneficiary (db.section_permissions.sections[key]). Historically that toggle
# was only honored by the frontend (Sidebar / TransitionGate). These helpers
# make the decision authoritative on the backend so a disabled section can no
# longer be reached by calling the data API directly.
#
# Keys mirror routes/section_permissions.ALL_SECTIONS.
SECTION_KEYS = {
    "vault",
    "messages",
    "checklist",
    "guardian",
    "digital_wallet",
    "timeline",
    "financial_portal",
}


async def beneficiary_section_enabled(actor: dict[str, Any], section_key: str) -> bool:
    """True when this actor may access the given estate section.

    Owner / admin / operator always bypass section gating. A beneficiary is
    allowed UNLESS one of their beneficiary records has the section explicitly
    set to False (most-restrictive wins, fail-safe to "enabled" when no
    override row exists — matching the product default that all sections are
    visible until the benefactor turns one off).
    """
    if actor.get("is_owner") or actor.get("is_admin") or actor.get("is_operator"):
        return True
    if not actor.get("is_beneficiary"):
        return False
    record_ids = list(actor.get("beneficiary_record_ids") or [])
    if not record_ids:
        # Recognized as a beneficiary via estate.beneficiaries (user_id) with no
        # standalone record — no per-section override can exist. Default enabled.
        return True
    perms_docs = await db.section_permissions.find(
        {"estate_id": actor.get("estate_id"), "beneficiary_id": {"$in": record_ids}},
        {"_id": 0, "sections": 1},
    ).to_list(20)
    for perms in perms_docs:
        sections = perms.get("sections") or {}
        if sections.get(section_key) is False:
            return False
    return True


async def require_beneficiary_section_access(actor: dict[str, Any], section_key: str) -> None:
    """Raise 403 when a beneficiary's section is disabled. No-op for owner/admin."""
    if not await beneficiary_section_enabled(actor, section_key):
        raise HTTPException(status_code=403, detail="This section is not available to you.")


def can_access_document(document: dict[str, Any], actor: dict[str, Any], *, phase: str | None = None) -> bool:
    """True when the actor can access this SDV document."""
    # FAIL-CLOSED FIRST (audit #5391e8b #1): a soft-deleted document is
    # accessible to NO ONE — not even the estate owner, an admin, or an
    # operator. This check MUST precede the owner/admin bypass below so that
    # deletion is final across every SDV pathway.
    if document.get("deleted_at"):
        return False
    if actor.get("is_owner") or actor.get("is_admin"):
        return True
    if not actor.get("is_beneficiary"):
        return False
    if not _designation_matches(document.get("designated_beneficiaries"), actor):
        return False
    if emergency_scope_allows(actor, "documents"):
        return True

    effective_phase = phase or ("post" if actor.get("is_transitioned") else "pre")
    timing = _timing_for_actor(document.get("visibility_timing") or {}, actor)

    if effective_phase == "post":
        return True if timing is None else bool(timing.get("post", True))

    category = document.get("category") or ""
    if category in ESSENTIAL_PRE_TRANSITION_DOCUMENT_CATEGORIES:
        return True
    return bool(timing and timing.get("pre", False))


def filter_accessible_documents(
    documents: list[dict[str, Any]],
    actor: dict[str, Any],
    *,
    phase: str | None = None,
) -> list[dict[str, Any]]:
    return [doc for doc in documents if can_access_document(doc, actor, phase=phase)]


def recipient_ids_for_actor(actor: dict[str, Any]) -> set[str]:
    ids = set(actor.get("beneficiary_record_ids") or set())
    user_id = actor.get("user_id")
    if user_id:
        ids.add(user_id)
    ids.update(actor.get("beneficiary_user_ids") or set())
    return ids


def message_recipient_matches(message: dict[str, Any], actor: dict[str, Any]) -> bool:
    recipients = _id_set(message.get("recipients") or [])
    if not recipients:
        # FAIL-CLOSED: a message with no named recipients is not addressed to any
        # beneficiary. Owner/admin/operator are already handled in
        # can_access_message before this check.
        return False
    if "all" in recipients:
        # "all" is an explicit broadcast to every beneficiary of the estate
        # (audit 05c1776 P2.1 — without this, broadcast messages matched nobody
        # and silently failed delivery).
        return True
    return bool(recipients & recipient_ids_for_actor(actor))


def message_delivered_to_actor(message: dict[str, Any], actor: dict[str, Any]) -> bool:
    if message.get("is_delivered"):
        return True

    actor_ids = recipient_ids_for_actor(actor)
    delivered_ids = _id_set(message.get("delivered_recipient_ids") or [])
    if delivered_ids & actor_ids:
        return True

    status = message.get("recipient_delivery_status") or {}
    if isinstance(status, dict):
        for rid in actor_ids:
            row = status.get(rid)
            if isinstance(row, dict) and row.get("status") == "delivered":
                return True
            if row == "delivered":
                return True
    return False


def can_access_message(message: dict[str, Any], actor: dict[str, Any], *, allow_staff: bool = True) -> bool:
    if actor.get("is_owner") or actor.get("is_admin") or (allow_staff and actor.get("is_operator")):
        return True
    if not actor.get("is_beneficiary"):
        return False
    if message.get("deleted_at"):
        return False
    if not message_recipient_matches(message, actor):
        return False
    if emergency_scope_allows(actor, "messages"):
        return True
    return message_delivered_to_actor(message, actor)


async def resolve_beneficiary_delivery_ids(estate_id: str, beneficiary_id: str | None) -> set[str]:
    """Resolve all identifiers that may represent one delivery recipient."""
    ids = _id_set([beneficiary_id])
    if not beneficiary_id:
        return ids

    records = await db.beneficiaries.find(
        {
            "estate_id": estate_id,
            "deleted_at": None,
            "$or": [{"id": beneficiary_id}, {"user_id": beneficiary_id}],
        },
        {"_id": 0, "id": 1, "user_id": 1, "email": 1},
    ).to_list(20)
    for record in records:
        ids.update(_id_set([record.get("id"), record.get("user_id"), _email(record.get("email"))]))
    return ids


def build_message_delivery_update(
    message: dict[str, Any],
    delivered_ids: set[str],
    *,
    delivered_at: str,
    delivered_via: str,
    delivered_by: str | None,
    milestone_report_id: str | None = None,
    all_recipient_ids: set[str] | None = None,
) -> dict[str, Any]:
    current_delivered = _id_set(message.get("delivered_recipient_ids") or [])
    next_delivered = current_delivered | delivered_ids
    intended = _id_set(message.get("recipients") or [])
    # A broadcast ("all") is only fully delivered once EVERY current beneficiary
    # has been delivered. The caller passes the authoritative set of current
    # beneficiary ids via all_recipient_ids; without it we fail-safe to "partial"
    # rather than marking a broadcast delivered off a single recipient
    # (audit 512bd5c F-18-07, correcting the 18a9d44 over-correction).
    if "all" in intended:
        if all_recipient_ids:
            all_intended_delivered = all_recipient_ids.issubset(next_delivered)
        else:
            all_intended_delivered = False
    else:
        all_intended_delivered = bool(intended) and intended.issubset(next_delivered)

    set_doc: dict[str, Any] = {
        "delivery_state": "delivered" if all_intended_delivered else "partial",
        "last_delivered_at": delivered_at,
        "delivered_via": delivered_via,
        "delivered_by": delivered_by,
    }
    if milestone_report_id:
        set_doc["milestone_report_id"] = milestone_report_id
    if all_intended_delivered:
        set_doc["is_delivered"] = True
        set_doc["delivered_at"] = delivered_at

    return {
        "$addToSet": {"delivered_recipient_ids": {"$each": sorted(next_delivered)}},
        "$set": set_doc,
    }


# ── FFN (Friends & Family Notification) visibility ───────────────────────────
def beneficiary_can_view_ffn(actor: dict[str, Any]) -> bool:
    """True when the actor may view the estate's FFN contacts.

    FFN is the benefactor's "who should my beneficiaries notify upon my
    passing" list — inherently post-transition information. Owner / admin /
    operator always pass. A beneficiary may view it ONLY after the estate has
    transitioned AND when none of their beneficiary records explicitly disable
    ffn_access (default-enabled, most-restrictive wins). Fail-closed
    pre-transition so a contact roster (names, phones, emails) is never exposed
    to beneficiaries while the benefactor is alive (audit 05c1776 P1.1).
    """
    if actor.get("is_owner") or actor.get("is_admin") or actor.get("is_operator"):
        return True
    if not actor.get("is_beneficiary"):
        return False
    if not actor.get("is_transitioned"):
        return False
    records = actor.get("beneficiary_records") or []
    if not records:
        # Recognized as a beneficiary via estate.beneficiaries with no standalone
        # record — no per-record override can exist; allow post-transition.
        return True
    # Most-restrictive wins: an explicit ffn_access=False on ANY of the actor's
    # (possibly duplicate/legacy) records denies access (audit 18a9d44 F-18-06).
    return all(r.get("ffn_access") is not False for r in records)


async def require_document_surface_access(actor: dict[str, Any], document: dict[str, Any]) -> None:
    """Enforce the Vault section gate on direct document actions (download /
    preview / pin-offline). Owner/admin/operator bypass. A beneficiary whose
    Vault section is disabled is blocked UNLESS the document is an essential,
    pre-transition category they can already read — so emergency access to
    critical paperwork isn't accidentally severed by a disabled Vault toggle
    (audit 05c1776 P1.4)."""
    if actor.get("is_owner") or actor.get("is_admin") or actor.get("is_operator"):
        return
    if await beneficiary_section_enabled(actor, "vault"):
        return
    category = document.get("category") or ""
    # Essential carve-out applies ONLY pre-transition — emergency access to
    # critical paperwork before death must not be severed by a disabled Vault,
    # but a post-transition beneficiary whose Vault is disabled gets no bypass
    # (audit 18a9d44 F-18-07).
    if (
        not actor.get("is_transitioned")
        and category in ESSENTIAL_PRE_TRANSITION_DOCUMENT_CATEGORIES
        and can_access_document(document, actor, phase="pre")
    ):
        return
    raise HTTPException(status_code=403, detail="This section is not available to you.")
