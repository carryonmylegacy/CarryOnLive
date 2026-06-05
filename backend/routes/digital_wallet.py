"""CarryOn™ Backend — Digital Wallet Vault"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from config import db
from guards import require_benefactor_role
from services.audit import audit_log, log_audit_event, get_client_ip
from services.access_control import emergency_scope_allows, require_beneficiary_section_access, require_estate_actor
from services.encryption import decrypt_field, encrypt_field, get_estate_salt
from utils import get_current_user

router = APIRouter()

# ===================== DIGITAL WALLET VAULT =====================


def _entry_assigned_to_actor(entry: dict, actor: dict) -> bool:
    assigned = entry.get("assigned_beneficiary_id")
    return bool(assigned and assigned in (actor.get("release_ids") or set()))


def _entry_visible_to_beneficiary(entry: dict, actor: dict) -> bool:
    if not _entry_assigned_to_actor(entry, actor):
        return False
    if emergency_scope_allows(actor, "digital_wallet"):
        return True
    if actor.get("is_transitioned"):
        return True
    return entry.get("beneficiary_visibility") == "show_now"


def _decrypt_wallet_entry(entry: dict, estate_salt: bytes) -> dict:
    if entry.get("encrypted_password"):
        try:
            entry["password"] = decrypt_field(entry["encrypted_password"], estate_salt)
        except Exception:
            entry["password"] = ""
    if entry.get("encrypted_additional"):
        try:
            entry["additional_access"] = decrypt_field(entry["encrypted_additional"], estate_salt)
        except Exception:
            entry["additional_access"] = ""
    return entry


class DigitalWalletEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    estate_id: str
    account_name: str
    login_username: str
    encrypted_password: Optional[str] = None
    additional_access: Optional[str] = None  # 2FA codes, PINs, etc.
    notes: Optional[str] = None
    assigned_beneficiary_id: Optional[str] = None
    assigned_beneficiary_name: Optional[str] = None
    category: str = "other"  # crypto, social_media, email, banking, cloud, subscription, other
    linked_entity_id: Optional[str] = None  # CFP entity (LLC, trust, etc.) this credential belongs to
    beneficiary_visibility: str = "private"  # 'private' | 'posthumous_only' | 'show_now'
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DigitalWalletCreate(BaseModel):
    account_name: str
    login_username: str
    password: Optional[str] = None
    additional_access: Optional[str] = None
    notes: Optional[str] = None
    assigned_beneficiary_id: Optional[str] = None
    category: str = "other"
    linked_entity_id: Optional[str] = None
    beneficiary_visibility: Optional[str] = "private"


class DigitalWalletUpdate(BaseModel):
    account_name: Optional[str] = None
    login_username: Optional[str] = None
    password: Optional[str] = None
    additional_access: Optional[str] = None
    notes: Optional[str] = None
    assigned_beneficiary_id: Optional[str] = None
    category: Optional[str] = None
    linked_entity_id: Optional[str] = None
    beneficiary_visibility: Optional[str] = None


@router.get("/digital-wallet/{estate_id}")
async def get_digital_wallet(estate_id: str, request: Request = None, current_user: dict = Depends(get_current_user)):
    """List all digital wallet entries for an estate."""
    actor = await require_estate_actor(estate_id, current_user)
    await require_beneficiary_section_access(actor, "digital_wallet")
    is_owner = actor["is_owner"]
    is_admin = actor["is_admin"]

    entries = await db.digital_wallet.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(200)

    # Resolve linked_entity_id → linked_entity_name (single batch query)
    # so the DAV UI can render a "Linked to [Entity]" pill without
    # round-tripping per row. Soft-deleted entities are filtered.
    linked_ids = [e["linked_entity_id"] for e in entries if e.get("linked_entity_id")]
    if linked_ids:
        ent_rows = await db.cfp_entities.find(
            {"id": {"$in": list(set(linked_ids))}, "estate_id": estate_id, "deleted_at": None},
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(500)
        ent_name = {r["id"]: r.get("name") for r in ent_rows}
        for e in entries:
            eid = e.get("linked_entity_id")
            if eid and eid in ent_name:
                e["linked_entity_name"] = ent_name[eid]

    estate_salt = await get_estate_salt(estate_id)

    if is_owner or is_admin:
        # Owner sees all entries with decrypted passwords
        for entry in entries:
            _decrypt_wallet_entry(entry, estate_salt)
        # SOC 2 CC6.1: Audit sensitive data access
        await log_audit_event(
            actor_id=current_user["id"],
            actor_email=current_user.get("email", ""),
            actor_role=current_user.get("role", ""),
            action="digital_wallet_view",
            category="data_access",
            resource_type="digital_wallet",
            resource_id=estate_id,
            ip_address=get_client_ip(request) if request else "",
            severity="info",
            details={"entry_count": len(entries)},
        )
        return entries

    if actor["is_beneficiary"]:
        # Beneficiary sees only entries assigned to them. Pre-transition access
        # requires the benefactor's explicit "show_now" visibility; after
        # transition, assigned DAV entries release as the existing product
        # promise intended.
        my_entries = [e for e in entries if _entry_visible_to_beneficiary(e, actor)]
        for entry in my_entries:
            _decrypt_wallet_entry(entry, estate_salt)
        # SOC 2 CC6.1: Audit sensitive data access (beneficiary)
        await log_audit_event(
            actor_id=current_user["id"],
            actor_email=current_user.get("email", ""),
            actor_role=current_user.get("role", ""),
            action="digital_wallet_view",
            category="data_access",
            resource_type="digital_wallet",
            resource_id=estate_id,
            ip_address=get_client_ip(request) if request else "",
            severity="info",
            details={"entry_count": len(my_entries), "access_type": "beneficiary"},
        )
        return my_entries

    raise HTTPException(status_code=403, detail="Access denied")


@router.post("/digital-wallet")
async def create_digital_wallet_entry(data: DigitalWalletCreate, current_user: dict = Depends(get_current_user)):
    """Create a new digital wallet entry."""
    await require_benefactor_role(current_user, "add digital wallet entries")

    if current_user.get("role") == "admin":
        estates = await db.estates.find({}, {"_id": 0}).to_list(1)
    else:
        estates = await db.estates.find({"owner_id": current_user["id"]}, {"_id": 0}).to_list(1)
    if not estates:
        raise HTTPException(status_code=404, detail="No estate found")

    estate_id = estates[0]["id"]
    estate_salt = await get_estate_salt(estate_id)

    # Get beneficiary name if assigned. audit P2.3 — the assigned beneficiary
    # and any linked entity MUST belong to THIS estate; reject foreign/stale ids
    # rather than silently storing them (downstream release logic trusts them).
    ben_name = None
    if data.assigned_beneficiary_id:
        ben = await db.beneficiaries.find_one(
            {
                "estate_id": estate_id,
                "deleted_at": None,
                "$or": [{"id": data.assigned_beneficiary_id}, {"user_id": data.assigned_beneficiary_id}],
            },
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1},
        )
        if not ben:
            raise HTTPException(status_code=400, detail="Assigned beneficiary is not part of this estate.")
        ben_name = f"{ben.get('first_name', '')} {ben.get('last_name', '')}".strip()
    if data.linked_entity_id:
        ent = await db.cfp_entities.find_one(
            {"id": data.linked_entity_id, "estate_id": estate_id, "deleted_at": None},
            {"_id": 0, "id": 1},
        )
        if not ent:
            raise HTTPException(status_code=400, detail="Linked entity is not part of this estate.")

    entry = DigitalWalletEntry(
        estate_id=estate_id,
        account_name=data.account_name,
        login_username=data.login_username,
        encrypted_password=encrypt_field(data.password, estate_salt) if data.password else None,
        additional_access=data.additional_access,
        notes=data.notes,
        assigned_beneficiary_id=data.assigned_beneficiary_id,
        assigned_beneficiary_name=ben_name,
        category=data.category,
        linked_entity_id=data.linked_entity_id,
        beneficiary_visibility=(data.beneficiary_visibility or "private"),
    )

    doc = entry.model_dump()
    # Encrypt additional_access too
    if data.additional_access:
        doc["encrypted_additional"] = encrypt_field(data.additional_access, estate_salt)
        doc["additional_access"] = None

    await db.digital_wallet.insert_one(doc)

    await audit_log(
        action="wallet.create",
        user_id=current_user["id"],
        resource_type="digital_wallet",
        resource_id=entry.id,
        estate_id=estate_id,
        details={"account": data.account_name, "encrypted": True},
    )

    return {"id": entry.id, "message": "Digital wallet entry added"}


@router.put("/digital-wallet/{entry_id}")
async def update_digital_wallet_entry(
    entry_id: str,
    data: DigitalWalletUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update an existing wallet entry."""
    entry = await db.digital_wallet.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    estate = await db.estates.find_one({"id": entry["estate_id"]}, {"_id": 0})
    if not estate or (estate.get("owner_id") != current_user["id"] and current_user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    update = {}
    if data.account_name is not None:
        update["account_name"] = data.account_name
    if data.login_username is not None:
        update["login_username"] = data.login_username
    if data.password is not None:
        estate_salt = await get_estate_salt(entry["estate_id"])
        update["encrypted_password"] = encrypt_field(data.password, estate_salt)
    if data.additional_access is not None:
        estate_salt = await get_estate_salt(entry["estate_id"])
        update["encrypted_additional"] = encrypt_field(data.additional_access, estate_salt)
    if data.notes is not None:
        update["notes"] = data.notes
    if data.category is not None:
        update["category"] = data.category
    if data.assigned_beneficiary_id is not None:
        update["assigned_beneficiary_id"] = data.assigned_beneficiary_id or None
        if data.assigned_beneficiary_id:
            # audit P2.3 — the assigned beneficiary must belong to this estate.
            ben = await db.beneficiaries.find_one(
                {
                    "estate_id": entry["estate_id"],
                    "deleted_at": None,
                    "$or": [{"id": data.assigned_beneficiary_id}, {"user_id": data.assigned_beneficiary_id}],
                },
                {"_id": 0, "id": 1, "first_name": 1, "last_name": 1},
            )
            if not ben:
                raise HTTPException(status_code=400, detail="Assigned beneficiary is not part of this estate.")
            update["assigned_beneficiary_name"] = f"{ben.get('first_name', '')} {ben.get('last_name', '')}".strip()
        else:
            update["assigned_beneficiary_name"] = None
    if data.linked_entity_id is not None:
        # Allow attaching this DAV credential to a CFP entity (LLC,
        # trust, etc.) — surfaced when the entity wizard's
        # duplicate-login hint is accepted. audit P2.3 — the entity must
        # belong to this estate; reject foreign/stale ids.
        if data.linked_entity_id:
            ent = await db.cfp_entities.find_one(
                {"id": data.linked_entity_id, "estate_id": entry["estate_id"], "deleted_at": None},
                {"_id": 0, "id": 1},
            )
            if not ent:
                raise HTTPException(status_code=400, detail="Linked entity is not part of this estate.")
        update["linked_entity_id"] = data.linked_entity_id or None
    if data.beneficiary_visibility is not None:
        # 'private' (default), 'posthumous_only', or 'show_now'. Drives
        # what the beneficiary read-only view returns.
        valid = {"private", "posthumous_only", "show_now"}
        if data.beneficiary_visibility in valid:
            update["beneficiary_visibility"] = data.beneficiary_visibility

    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.digital_wallet.update_one({"id": entry_id}, {"$set": update})

        # Log edit for timeline
        changed_fields = [k for k in update if k not in ("updated_at", "assigned_beneficiary_name")]
        await db.edit_history.insert_one(
            {
                "id": str(uuid.uuid4()),
                "item_type": "digital_wallet",
                "item_id": entry_id,
                "estate_id": entry["estate_id"],
                "user_id": current_user["id"],
                "user_name": current_user.get("name", ""),
                "action": "edited",
                "changed_fields": changed_fields,
                "title": data.account_name or entry.get("account_name", ""),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    return {"success": True, "message": "Entry updated"}


@router.delete("/digital-wallet/{entry_id}")
async def delete_digital_wallet_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a digital wallet entry."""
    entry = await db.digital_wallet.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    estate = await db.estates.find_one({"id": entry["estate_id"]}, {"_id": 0})
    if not estate or (estate.get("owner_id") != current_user["id"] and current_user.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.digital_wallet.update_one(
        {"id": entry_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )  # soft_delete
    return {"success": True, "message": "Entry deleted"}
