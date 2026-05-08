"""Financial Portal — Entities & Structures (CFP org-chart feature).

Manages user-defined legal entities (LLCs, trusts, foundations, etc.),
lightweight "external people" (third parties not in the beneficiaries
list), and the relationships that connect them.

Three soft-deleted collections:
  - cfp_entities
  - cfp_external_people
  - cfp_entity_relationships

All endpoints are estate-scoped and require owner/admin access. Beneficiaries
do not see this surface — entities are a benefactor-only structural layer.
"""

from datetime import datetime, timezone
from typing import Literal, Optional
import uuid

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from config import db
from utils import get_current_user

from ._core import router, _verify_estate_access


# ===================== STRICT ENUMS =====================

EntityCategory = Literal["business", "trust", "charity", "property", "specialized"]
NodeType = Literal["entity", "user", "beneficiary", "external_person"]
RoleType = Literal[
    "owner",
    "trustee",
    "beneficiary",
    "grantor",
    "manager",
    "officer",
    "director",
    "gp",
    "lp",
]


# ===================== PYDANTIC MODELS =====================


class EntityCreate(BaseModel):
    estate_id: str
    category: EntityCategory
    type: str  # catalog id, e.g. "flp", "dapt", "revocable_living"
    name: str = Field(..., min_length=1, max_length=200)
    formation_state: Optional[str] = None
    ein_last_four: Optional[str] = None
    formation_date: Optional[str] = None
    tax_election: Optional[str] = None
    registered_agent: Optional[str] = None
    notes: Optional[str] = None


class EntityUpdate(BaseModel):
    category: Optional[EntityCategory] = None
    type: Optional[str] = None
    name: Optional[str] = None
    formation_state: Optional[str] = None
    ein_last_four: Optional[str] = None
    formation_date: Optional[str] = None
    tax_election: Optional[str] = None
    registered_agent: Optional[str] = None
    notes: Optional[str] = None


class ExternalPersonCreate(BaseModel):
    estate_id: str
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class ExternalPersonUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    notes: Optional[str] = None


class RelationshipCreate(BaseModel):
    estate_id: str
    source_id: str  # user_id, beneficiary id, external_person id, or entity id
    source_type: NodeType
    target_id: str  # MUST be an entity id (relationships are AT entities)
    target_type: Literal["entity"] = "entity"
    role: RoleType
    ownership_pct: Optional[float] = None  # 0-100, only meaningful for owner/gp/lp
    notes: Optional[str] = None


class RelationshipUpdate(BaseModel):
    role: Optional[RoleType] = None
    ownership_pct: Optional[float] = None
    notes: Optional[str] = None


# ===================== HELPERS =====================


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_id(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


# ===================== ENTITY CRUD =====================


@router.get("/financial/entities/{estate_id}")
async def list_entities(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Return all entities, external people, and relationships for an estate.

    Only the owner/admin sees this surface — beneficiaries get an empty payload
    rather than a 403 so the frontend can render-then-hide gracefully.
    """
    estate, can_manage = await _verify_estate_access(estate_id, current_user)
    if not can_manage:
        return {"entities": [], "external_people": [], "relationships": []}

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

    return {"entities": entities, "external_people": people, "relationships": rels}


@router.post("/financial/entities")
async def create_entity(payload: EntityCreate, current_user: dict = Depends(get_current_user)):
    estate, can_manage = await _verify_estate_access(payload.estate_id, current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can create entities")

    doc = {
        "id": str(uuid.uuid4()),
        "estate_id": payload.estate_id,
        "owner_user_id": current_user["id"],
        "category": payload.category,
        "type": payload.type,
        "name": payload.name.strip(),
        "formation_state": (payload.formation_state or None),
        "ein_last_four": (payload.ein_last_four or None),
        "formation_date": (payload.formation_date or None),
        "tax_election": (payload.tax_election or None),
        "registered_agent": (payload.registered_agent or None),
        "notes": (payload.notes or None),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "deleted_at": None,
    }
    await db.cfp_entities.insert_one(doc)
    return _strip_id(doc)


@router.patch("/financial/entities/{entity_id}")
async def update_entity(
    entity_id: str,
    payload: EntityUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.cfp_entities.find_one({"id": entity_id, "deleted_at": None}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entity not found")
    estate, can_manage = await _verify_estate_access(existing["estate_id"], current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can edit entities")

    update_fields = payload.model_dump(exclude_unset=True)
    if "name" in update_fields and isinstance(update_fields["name"], str):
        update_fields["name"] = update_fields["name"].strip()
    update_fields["updated_at"] = _now_iso()
    await db.cfp_entities.update_one({"id": entity_id}, {"$set": update_fields})
    refreshed = await db.cfp_entities.find_one({"id": entity_id}, {"_id": 0})
    return refreshed


@router.delete("/financial/entities/{entity_id}")
async def delete_entity(entity_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.cfp_entities.find_one({"id": entity_id, "deleted_at": None}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entity not found")
    estate, can_manage = await _verify_estate_access(existing["estate_id"], current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can delete entities")

    now = _now_iso()
    await db.cfp_entities.update_one({"id": entity_id}, {"$set": {"deleted_at": now, "updated_at": now}})
    # Cascade soft-delete: all relationships touching this entity (as source OR target)
    await db.cfp_entity_relationships.update_many(
        {
            "estate_id": existing["estate_id"],
            "deleted_at": None,
            "$or": [
                {"target_id": entity_id, "target_type": "entity"},
                {"source_id": entity_id, "source_type": "entity"},
            ],
        },
        {"$set": {"deleted_at": now}},
    )
    return {"ok": True}


# ===================== EXTERNAL PEOPLE CRUD =====================


@router.post("/financial/external-people")
async def create_external_person(
    payload: ExternalPersonCreate,
    current_user: dict = Depends(get_current_user),
):
    estate, can_manage = await _verify_estate_access(payload.estate_id, current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can add people")

    doc = {
        "id": str(uuid.uuid4()),
        "estate_id": payload.estate_id,
        "owner_user_id": current_user["id"],
        "first_name": payload.first_name.strip(),
        "last_name": (payload.last_name or "").strip() or None,
        "notes": (payload.notes or None),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "deleted_at": None,
    }
    await db.cfp_external_people.insert_one(doc)
    return _strip_id(doc)


@router.patch("/financial/external-people/{person_id}")
async def update_external_person(
    person_id: str,
    payload: ExternalPersonUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.cfp_external_people.find_one({"id": person_id, "deleted_at": None}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Person not found")
    estate, can_manage = await _verify_estate_access(existing["estate_id"], current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can edit people")

    update_fields = payload.model_dump(exclude_unset=True)
    for k in ("first_name", "last_name"):
        if k in update_fields and isinstance(update_fields[k], str):
            update_fields[k] = update_fields[k].strip() or None
    update_fields["updated_at"] = _now_iso()
    await db.cfp_external_people.update_one({"id": person_id}, {"$set": update_fields})
    refreshed = await db.cfp_external_people.find_one({"id": person_id}, {"_id": 0})
    return refreshed


@router.delete("/financial/external-people/{person_id}")
async def delete_external_person(person_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.cfp_external_people.find_one({"id": person_id, "deleted_at": None}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Person not found")
    estate, can_manage = await _verify_estate_access(existing["estate_id"], current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can delete people")

    now = _now_iso()
    await db.cfp_external_people.update_one({"id": person_id}, {"$set": {"deleted_at": now, "updated_at": now}})
    # Cascade soft-delete relationships sourced from this person
    await db.cfp_entity_relationships.update_many(
        {
            "estate_id": existing["estate_id"],
            "deleted_at": None,
            "source_id": person_id,
            "source_type": "external_person",
        },
        {"$set": {"deleted_at": now}},
    )
    return {"ok": True}


# ===================== RELATIONSHIP CRUD =====================


@router.post("/financial/entity-relationships")
async def create_relationship(
    payload: RelationshipCreate,
    current_user: dict = Depends(get_current_user),
):
    estate, can_manage = await _verify_estate_access(payload.estate_id, current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can add relationships")

    # Sanity-check: ownership_pct must be 0-100 if set
    pct = payload.ownership_pct
    if pct is not None and (pct < 0 or pct > 100):
        raise HTTPException(status_code=400, detail="ownership_pct must be between 0 and 100")

    # Sanity-check: target entity exists and belongs to this estate
    target_entity = await db.cfp_entities.find_one(
        {"id": payload.target_id, "estate_id": payload.estate_id, "deleted_at": None},
        {"_id": 0, "id": 1},
    )
    if not target_entity:
        raise HTTPException(status_code=404, detail="Target entity not found")

    doc = {
        "id": str(uuid.uuid4()),
        "estate_id": payload.estate_id,
        "owner_user_id": current_user["id"],
        "source_id": payload.source_id,
        "source_type": payload.source_type,
        "target_id": payload.target_id,
        "target_type": "entity",
        "role": payload.role,
        "ownership_pct": pct,
        "notes": (payload.notes or None),
        "created_at": _now_iso(),
        "deleted_at": None,
    }
    await db.cfp_entity_relationships.insert_one(doc)
    return _strip_id(doc)


@router.patch("/financial/entity-relationships/{rel_id}")
async def update_relationship(
    rel_id: str,
    payload: RelationshipUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.cfp_entity_relationships.find_one({"id": rel_id, "deleted_at": None}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Relationship not found")
    estate, can_manage = await _verify_estate_access(existing["estate_id"], current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can edit relationships")

    update_fields = payload.model_dump(exclude_unset=True)
    if "ownership_pct" in update_fields and update_fields["ownership_pct"] is not None:
        if update_fields["ownership_pct"] < 0 or update_fields["ownership_pct"] > 100:
            raise HTTPException(status_code=400, detail="ownership_pct must be between 0 and 100")
    await db.cfp_entity_relationships.update_one({"id": rel_id}, {"$set": update_fields})
    refreshed = await db.cfp_entity_relationships.find_one({"id": rel_id}, {"_id": 0})
    return refreshed


@router.delete("/financial/entity-relationships/{rel_id}")
async def delete_relationship(rel_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.cfp_entity_relationships.find_one({"id": rel_id, "deleted_at": None}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Relationship not found")
    estate, can_manage = await _verify_estate_access(existing["estate_id"], current_user, require_owner=True)
    if not can_manage:
        raise HTTPException(status_code=403, detail="Only the estate owner can delete relationships")

    await db.cfp_entity_relationships.update_one({"id": rel_id}, {"$set": {"deleted_at": _now_iso()}})
    return {"ok": True}
