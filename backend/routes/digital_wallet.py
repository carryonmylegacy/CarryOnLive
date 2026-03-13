"""CarryOn™ Backend — Digital Wallet Vault"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from config import db
from guards import require_benefactor_role
from services.encryption import decrypt_field, encrypt_field, get_estate_salt
from services.audit import audit_log
from utils import get_current_user

router = APIRouter()

# ===================== DIGITAL WALLET VAULT =====================


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
    category: str = (
        "other"  # crypto, social_media, email, banking, cloud, subscription, other
    )
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class DigitalWalletCreate(BaseModel):
    account_name: str
    login_username: str
    password: Optional[str] = None
    additional_access: Optional[str] = None
    notes: Optional[str] = None
    assigned_beneficiary_id: Optional[str] = None
    category: str = "other"


class DigitalWalletUpdate(BaseModel):
    account_name: Optional[str] = None
    login_username: Optional[str] = None
    password: Optional[str] = None
    additional_access: Optional[str] = None
    notes: Optional[str] = None
    assigned_beneficiary_id: Optional[str] = None
    category: Optional[str] = None


@router.get("/digital-wallet/{estate_id}")
async def get_digital_wallet(
    estate_id: str, current_user: dict = Depends(get_current_user)
):
    """List all digital wallet entries for an estate."""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check if user is owner or assigned beneficiary (post-transition)
    is_owner = estate.get("owner_id") == current_user["id"]
    is_transitioned = estate.get("transitioned", False)

    entries = await db.digital_wallet.find(
        {"estate_id": estate_id, "deleted_at": None}, {"_id": 0}
    ).to_list(200)

    estate_salt = await get_estate_salt(estate_id)

    if is_owner:
        # Owner sees all entries with decrypted passwords
        for entry in entries:
            if entry.get("encrypted_password"):
                try:
                    entry["password"] = decrypt_field(
                        entry["encrypted_password"], estate_salt
                    )
                except Exception:
                    entry["password"] = ""
            if entry.get("encrypted_additional"):
                try:
                    entry["additional_access"] = decrypt_field(
                        entry["encrypted_additional"], estate_salt
                    )
                except Exception:
                    entry["additional_access"] = ""
        return entries
    elif is_transitioned:
        # Beneficiary sees only entries assigned to them
        my_entries = [
            e for e in entries if e.get("assigned_beneficiary_id") == current_user["id"]
        ]
        for entry in my_entries:
            if entry.get("encrypted_password"):
                try:
                    entry["password"] = decrypt_field(
                        entry["encrypted_password"], estate_salt
                    )
                except Exception:
                    entry["password"] = ""
            if entry.get("encrypted_additional"):
                try:
                    entry["additional_access"] = decrypt_field(
                        entry["encrypted_additional"], estate_salt
                    )
                except Exception:
                    entry["additional_access"] = ""
        return my_entries
    else:
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("/digital-wallet")
async def create_digital_wallet_entry(
    data: DigitalWalletCreate, current_user: dict = Depends(get_current_user)
):
    """Create a new digital wallet entry."""
    require_benefactor_role(current_user, "add digital wallet entries")

    estates = await db.estates.find(
        {"owner_id": current_user["id"]}, {"_id": 0}
    ).to_list(1)
    if not estates:
        raise HTTPException(status_code=404, detail="No estate found")

    estate_id = estates[0]["id"]
    estate_salt = await get_estate_salt(estate_id)

    # Get beneficiary name if assigned
    ben_name = None
    if data.assigned_beneficiary_id:
        ben = await db.beneficiaries.find_one(
            {"id": data.assigned_beneficiary_id},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1},
        )
        if ben:
            ben_name = f"{ben.get('first_name', '')} {ben.get('last_name', '')}".strip()

    entry = DigitalWalletEntry(
        estate_id=estate_id,
        account_name=data.account_name,
        login_username=data.login_username,
        encrypted_password=encrypt_field(data.password, estate_salt)
        if data.password
        else None,
        additional_access=data.additional_access,
        notes=data.notes,
        assigned_beneficiary_id=data.assigned_beneficiary_id,
        assigned_beneficiary_name=ben_name,
        category=data.category,
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
    if not estate or estate.get("owner_id") != current_user["id"]:
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
        update["encrypted_additional"] = encrypt_field(
            data.additional_access, estate_salt
        )
    if data.notes is not None:
        update["notes"] = data.notes
    if data.category is not None:
        update["category"] = data.category
    if data.assigned_beneficiary_id is not None:
        update["assigned_beneficiary_id"] = data.assigned_beneficiary_id
        if data.assigned_beneficiary_id:
            ben = await db.beneficiaries.find_one(
                {"id": data.assigned_beneficiary_id},
                {"_id": 0, "id": 1, "first_name": 1, "last_name": 1},
            )
            update["assigned_beneficiary_name"] = (
                f"{ben.get('first_name', '')} {ben.get('last_name', '')}".strip()
                if ben
                else None
            )
        else:
            update["assigned_beneficiary_name"] = None

    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.digital_wallet.update_one({"id": entry_id}, {"$set": update})

        # Log edit for timeline
        changed_fields = [
            k for k in update if k not in ("updated_at", "assigned_beneficiary_name")
        ]
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
async def delete_digital_wallet_entry(
    entry_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a digital wallet entry."""
    entry = await db.digital_wallet.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    estate = await db.estates.find_one({"id": entry["estate_id"]}, {"_id": 0})
    if not estate or estate.get("owner_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.digital_wallet.update_one(
        {"id": entry_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}},
    )  # soft_delete
    return {"success": True, "message": "Entry deleted"}
