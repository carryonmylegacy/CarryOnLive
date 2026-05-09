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
                               AND caller's user_id is in entities_share.now_beneficiary_ids
     c. Per-credential visibility:
          - 'private'         → omit entirely
          - 'posthumous_only' → only if transitioned
          - 'show_now'        → if transitioned OR (show_now enabled AND caller allowed)

The wire shape is intentionally read-only: no IDs that would let the
client drive a write are exposed beyond what the chart needs to render.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from config import db
from utils import get_current_user

from ._core import router


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
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    is_owner = estate.get("owner_id") == current_user["id"]
    is_admin = current_user.get("role") == "admin"
    is_beneficiary = current_user["id"] in (estate.get("beneficiaries") or [])
    if not (is_owner or is_admin or is_beneficiary):
        raise HTTPException(status_code=403, detail="Not authorized")

    share = await _load_share(estate)
    if is_owner or is_admin:
        return share
    # Beneficiary view: don't reveal which OTHER beneficiaries can see now.
    return {
        "show_now": bool(share["show_now"]),
        "you_can_see_now": bool(share["show_now"] and current_user["id"] in share["now_beneficiary_ids"]),
    }


@router.patch("/financial/entities-share/{estate_id}")
async def patch_entities_share(
    estate_id: str,
    payload: EntitiesShareSettings,
    current_user: dict = Depends(get_current_user),
):
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate.get("owner_id") == current_user["id"]
    is_admin = current_user.get("role") == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only the estate owner can change sharing")

    # Validate that every now_beneficiary_id is actually a beneficiary
    # of this estate. Silently drop invalid IDs rather than 400-erroring
    # so a stale UI selection doesn't block save.
    valid = set(estate.get("beneficiaries") or [])
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


def _credential_is_visible(cred: dict, *, is_transitioned: bool, beneficiary_can_see_now: bool) -> bool:
    vis = (cred or {}).get("beneficiary_visibility") or "private"
    if vis == "private":
        return False
    if vis == "posthumous_only":
        return bool(is_transitioned)
    if vis == "show_now":
        return bool(is_transitioned or beneficiary_can_see_now)
    return False


def _credential_for_beneficiary(cred: dict) -> dict:
    """Strip the credential to only the fields a beneficiary should see."""
    return {
        "id": cred.get("id"),
        "account_name": cred.get("account_name"),
        "login_username": cred.get("login_username"),
        "password": cred.get("password"),
        "additional_access": cred.get("additional_access"),
        "notes": cred.get("notes"),
        "linked_entity_id": cred.get("linked_entity_id"),
    }


@router.get("/financial/entities/beneficiary-view/{estate_id}")
async def get_entities_beneficiary_view(estate_id: str, current_user: dict = Depends(get_current_user)):
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate.get("owner_id") == current_user["id"]
    is_admin = current_user.get("role") == "admin"
    is_beneficiary = current_user["id"] in (estate.get("beneficiaries") or [])
    if not (is_owner or is_admin or is_beneficiary):
        raise HTTPException(status_code=403, detail="Not authorized")

    is_transitioned = estate.get("status") == "transitioned"
    share = await _load_share(estate)
    beneficiary_can_see_now = bool(share["show_now"] and current_user["id"] in share["now_beneficiary_ids"])

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
            {"id": {"$in": list(referenced_doc_ids)}, "deleted_at": None},
            {
                "_id": 0,
                "id": 1,
                "name": 1,
                "title": 1,
                "category": 1,
                "file_type": 1,
                "size": 1,
                "uploaded_at": 1,
            },
        )
        documents = await doc_cursor.to_list(5000)

    # Credentials — filtered by visibility + transition state.
    cred_cursor = db.digital_wallet.find(
        {
            "estate_id": estate_id,
            "deleted_at": None,
            "linked_entity_id": {"$ne": None, "$exists": True},
        },
        {"_id": 0},
    )
    raw_creds = await cred_cursor.to_list(5000)
    visible_creds: List[dict] = []
    for c in raw_creds:
        if _credential_is_visible(c, is_transitioned=is_transitioned, beneficiary_can_see_now=beneficiary_can_see_now):
            visible_creds.append(_credential_for_beneficiary(c))

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
