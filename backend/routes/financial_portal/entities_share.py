"""Financial Portal — Entities & Structures BENEFICIARY-VIEW + SHARE settings.

Two surfaces, one file:

1. Benefactor (owner) endpoints to read/write the estate-level
   `entities_share` toggle:
     GET  /api/financial/entities-share/{estate_id}
     PATCH /api/financial/entities-share/{estate_id}
   Stored on the estate doc as:
     entities_share = {
         "show_now": bool,                  # default False (= posthumous-only)
         "now_beneficiary_ids": list[str],  # who sees it pre-transition; default []
     }

2. Beneficiary (read-only, INVIOLABLE) endpoint:
     GET /api/financial/entities/beneficiary-view/{estate_id}

   Layered gates:
     a. Caller must be a beneficiary of the estate (or admin / owner — owners
        can preview their own beneficiary view for QA).
     b. Estate transition state:
          - transitioned     → return everything that is NOT marked private
          - not transitioned → return entities only when entities_share.show_now is True
                               AND caller matches entities_share.now_beneficiary_ids
     c. Per-credential visibility:
          - 'private'         → omit entirely
          - 'posthumous_only' → only if transitioned
          - 'show_now'        → if transitioned OR (show_now enabled AND caller allowed)

The wire shape is intentionally read-only: no IDs that would let the
client drive a write are exposed beyond what the chart needs to render.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import Depends
from pydantic import BaseModel, Field

from config import db
from services.access_control import can_access_document
from services.encryption import decrypt_field, get_estate_salt
from services.photo_urls import resolve_photo_url
from utils import get_current_user

from ._core import _resolve_financial_actor, router


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ===================== ESTATE-LEVEL SHARE SETTINGS =====================


class EntitiesShareSettings(BaseModel):
    show_now: bool = False
    now_beneficiary_ids: List[str] = Field(default_factory=list)


async def _load_share(estate: dict) -> dict:
    raw = estate.get("entities_share") or {}
    return {
        "show_now": bool(raw.get("show_now", False)),
        "now_beneficiary_ids": list(raw.get("now_beneficiary_ids") or []),
    }


@router.get("/financial/entities-share/{estate_id}")
async def get_entities_share(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Return the current `entities_share` settings for an estate.

    Owners + admins see the raw doc. Beneficiaries get a slimmed-down
    version that only tells them whether THEY are allowed to see it
    pre-transition (no list of other beneficiaries leaked).
    """
    actor = await _resolve_financial_actor(estate_id, current_user)
    estate = actor["estate"]
    share = await _load_share(estate)
    if actor["is_owner"] or actor["is_admin"]:
        return share
    # Beneficiary view: don't reveal which OTHER beneficiaries can see now.
    allowed_now = bool(share["show_now"] and set(share["now_beneficiary_ids"]) & actor.get("release_ids", set()))
    return {
        "show_now": bool(share["show_now"]),
        "you_can_see_now": allowed_now,
    }


@router.patch("/financial/entities-share/{estate_id}")
async def patch_entities_share(
    estate_id: str,
    payload: EntitiesShareSettings,
    current_user: dict = Depends(get_current_user),
):
    actor = await _resolve_financial_actor(estate_id, current_user, require_owner=True)
    estate = actor["estate"]

    # Validate that every now_beneficiary_id is actually a beneficiary
    # of this estate. Silently drop invalid IDs rather than 400-erroring
    # so a stale UI selection doesn't block save.
    valid = set(estate.get("beneficiaries") or [])
    ben_rows = await db.beneficiaries.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0, "id": 1, "user_id": 1},
    ).to_list(500)
    for row in ben_rows:
        if row.get("id"):
            valid.add(row["id"])
        if row.get("user_id"):
            valid.add(row["user_id"])
    cleaned = [b for b in payload.now_beneficiary_ids if b in valid]

    new_doc = {
        "show_now": bool(payload.show_now),
        "now_beneficiary_ids": cleaned,
    }
    await db.estates.update_one(
        {"id": estate_id},
        {"$set": {"entities_share": new_doc, "updated_at": _now_iso()}},
    )
    return new_doc


# ===================== BENEFICIARY READ-ONLY VIEW =====================


def _entry_assigned_to_actor(cred: dict, actor: dict) -> bool:
    """A linked credential is only releasable to a beneficiary it was assigned
    to. Mirrors digital_wallet._entry_assigned_to_actor so the Entities chart
    can never hand out credentials the DAV itself would withhold."""
    assigned = (cred or {}).get("assigned_beneficiary_id")
    return bool(assigned and assigned in (actor.get("release_ids") or set()))


def _credential_is_visible(cred: dict, *, is_transitioned: bool, beneficiary_can_see_now: bool) -> bool:
    vis = (cred or {}).get("beneficiary_visibility") or "private"
    if vis == "private":
        return False
    if vis == "posthumous_only":
        return bool(is_transitioned)
    if vis == "show_now":
        return bool(is_transitioned or beneficiary_can_see_now)
    return False


def _credential_view(cred: dict, estate_salt: bytes) -> dict:
    """Strip the credential to the beneficiary-facing fields, decrypting the
    encrypted secret fields ONLY after assignment + visibility have passed.
    Falls back to any legacy plaintext field when no encrypted blob exists."""
    password = cred.get("password") or ""
    if cred.get("encrypted_password"):
        try:
            password = decrypt_field(cred["encrypted_password"], estate_salt)
        except Exception:
            password = ""
    additional = cred.get("additional_access") or ""
    if cred.get("encrypted_additional"):
        try:
            additional = decrypt_field(cred["encrypted_additional"], estate_salt)
        except Exception:
            additional = ""
    return {
        "id": cred.get("id"),
        "account_name": cred.get("account_name"),
        "login_username": cred.get("login_username"),
        "password": password,  # decrypted for authorized beneficiary view (hk-14 reviewed)
        "additional_access": additional,
        "notes": cred.get("notes"),
        "linked_entity_id": cred.get("linked_entity_id"),
    }


@router.get("/financial/entities/beneficiary-view/{estate_id}")
async def get_entities_beneficiary_view(estate_id: str, current_user: dict = Depends(get_current_user)):
    actor = await _resolve_financial_actor(estate_id, current_user)
    estate = actor["estate"]
    is_owner = actor["is_owner"]
    is_admin = actor["is_admin"]

    is_transitioned = estate.get("status") == "transitioned"
    share = await _load_share(estate)
    beneficiary_can_see_now = bool(
        share["show_now"] and set(share["now_beneficiary_ids"]) & actor.get("release_ids", set())
    )

    # Hard gate. Pre-transition beneficiaries who weren't picked simply
    # get an empty payload — the frontend won't even render the tile.
    if not is_transitioned and not beneficiary_can_see_now and not is_owner and not is_admin:
        return {
            "visible": False,
            "is_transitioned": False,
            "entities": [],
            "external_people": [],
            "relationships": [],
            "documents": [],
            "credentials": [],
        }

    entities = await db.cfp_entities.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0},
    ).to_list(2000)
    people = await db.cfp_external_people.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0},
    ).to_list(2000)
    # Resolve external-person photo paths to S3 presigned URLs (mirrors
    # the benefactor list view in routes/financial_portal/entities.py).
    for p in people:
        if p.get("photo_url"):
            p["photo_url"] = resolve_photo_url(p["photo_url"])
    rels = await db.cfp_entity_relationships.find(
        {"estate_id": estate_id, "deleted_at": None},
        {"_id": 0},
    ).to_list(5000)

    # Linked SDV documents — only those referenced by entity.document_ids.
    referenced_doc_ids: set = set()
    for e in entities:
        for d in e.get("document_ids") or []:
            referenced_doc_ids.add(d)
    documents: list = []
    if referenced_doc_ids:
        doc_cursor = db.documents.find(
            {"estate_id": estate_id, "id": {"$in": list(referenced_doc_ids)}, "deleted_at": None},
            {
                "_id": 0,
                "id": 1,
                "name": 1,
                "title": 1,
                "category": 1,
                "file_type": 1,
                "size": 1,
                "uploaded_at": 1,
                "designated_beneficiaries": 1,
                "visibility_timing": 1,
                "deleted_at": 1,
            },
        )
        documents = await doc_cursor.to_list(5000)
        if not (is_owner or is_admin):
            phase = "post" if is_transitioned else "pre"
            documents = [doc for doc in documents if can_access_document(doc, actor, phase=phase)]

    # Credentials — owner/admin see every linked credential; a beneficiary
    # receives a linked credential ONLY when it is assigned to them AND its
    # visibility timing allows it. (Before June 2026 the assignment check was
    # missing, so any beneficiary who could see the entities chart received
    # every linked credential marked show_now / posthumous_only — fixed here.)
    cred_cursor = db.digital_wallet.find(
        {
            "estate_id": estate_id,
            "deleted_at": None,
            "linked_entity_id": {"$ne": None, "$exists": True},
        },
        {"_id": 0},
    )
    raw_creds = await cred_cursor.to_list(5000)
    estate_salt = await get_estate_salt(estate_id)
    visible_creds: List[dict] = []
    for c in raw_creds:
        if is_owner or is_admin:
            allowed = True
        else:
            allowed = _entry_assigned_to_actor(c, actor) and _credential_is_visible(
                c, is_transitioned=is_transitioned, beneficiary_can_see_now=beneficiary_can_see_now
            )
        if allowed:
            visible_creds.append(_credential_view(c, estate_salt))

    return {
        "visible": True,
        "is_transitioned": bool(is_transitioned),
        "beneficiary_can_see_now": bool(beneficiary_can_see_now),
        "entities": entities,
        "external_people": people,
        "relationships": rels,
        "documents": documents,
        "credentials": visible_creds,
    }
