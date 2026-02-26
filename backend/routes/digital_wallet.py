"""CarryOn™ Backend — Digital Wallet Vault"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status, Response, Form
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from config import db, logger
from utils import get_current_user, encrypt_data, decrypt_data, hash_password, verify_password, create_token, generate_otp, generate_backup_code, send_otp_email, send_otp_sms, log_activity, send_push_notification, send_push_to_all_admins
import uuid
import os
import asyncio
import base64
import json as json_module
import random

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
    category: str = "other"  # crypto, social_media, email, banking, cloud, subscription, other
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

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
async def get_digital_wallet(estate_id: str, current_user: dict = Depends(get_current_user)):
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")

    # Check if user is owner or assigned beneficiary (post-transition)
    is_owner = estate.get("owner_id") == current_user["id"]
    is_transitioned = estate.get("transitioned", False)

    entries = await db.digital_wallet.find({"estate_id": estate_id}, {"_id": 0}).to_list(200)

    if is_owner:
        # Owner sees all entries with decrypted passwords
        for entry in entries:
            if entry.get("encrypted_password"):
                try:
                    entry["password"] = decrypt_data(entry["encrypted_password"]).decode()
                except Exception:
                    entry["password"] = ""
            if entry.get("encrypted_additional"):
                try:
                    entry["additional_access"] = decrypt_data(entry["encrypted_additional"]).decode()
                except Exception:
                    entry["additional_access"] = ""
        return entries
    elif is_transitioned:
        # Beneficiary sees only entries assigned to them
        my_entries = [e for e in entries if e.get("assigned_beneficiary_id") == current_user["id"]]
        for entry in my_entries:
            if entry.get("encrypted_password"):
                try:
                    entry["password"] = decrypt_data(entry["encrypted_password"]).decode()
                except Exception:
                    entry["password"] = ""
            if entry.get("encrypted_additional"):
                try:
                    entry["additional_access"] = decrypt_data(entry["encrypted_additional"]).decode()
                except Exception:
                    entry["additional_access"] = ""
        return my_entries
    else:
        raise HTTPException(status_code=403, detail="Access denied")

@router.post("/digital-wallet")
async def create_digital_wallet_entry(data: DigitalWalletCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can add digital wallet entries")

    estates = await db.estates.find({"owner_id": current_user["id"]}, {"_id": 0}).to_list(1)
    if not estates:
        raise HTTPException(status_code=404, detail="No estate found")

    estate_id = estates[0]["id"]

    # Get beneficiary name if assigned
    ben_name = None
    if data.assigned_beneficiary_id:
        ben = await db.beneficiaries.find_one({"id": data.assigned_beneficiary_id}, {"_id": 0, "first_name": 1, "last_name": 1})
        if ben:
            ben_name = f"{ben.get('first_name', '')} {ben.get('last_name', '')}".strip()

    entry = DigitalWalletEntry(
        estate_id=estate_id,
        account_name=data.account_name,
        login_username=data.login_username,
        encrypted_password=encrypt_data(data.password.encode()) if data.password else None,
        additional_access=data.additional_access,
        notes=data.notes,
        assigned_beneficiary_id=data.assigned_beneficiary_id,
        assigned_beneficiary_name=ben_name,
        category=data.category,
    )

    doc = entry.model_dump()
    # Encrypt additional_access too
    if data.additional_access:
        doc["encrypted_additional"] = encrypt_data(data.additional_access.encode())
        doc["additional_access"] = None

    await db.digital_wallet.insert_one(doc)
    return {"id": entry.id, "message": "Digital wallet entry added"}

@router.put("/digital-wallet/{entry_id}")
async def update_digital_wallet_entry(entry_id: str, data: DigitalWalletUpdate, current_user: dict = Depends(get_current_user)):
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
        update["encrypted_password"] = encrypt_data(data.password.encode())
    if data.additional_access is not None:
        update["encrypted_additional"] = encrypt_data(data.additional_access.encode())
    if data.notes is not None:
        update["notes"] = data.notes
    if data.category is not None:
        update["category"] = data.category
    if data.assigned_beneficiary_id is not None:
        update["assigned_beneficiary_id"] = data.assigned_beneficiary_id
        if data.assigned_beneficiary_id:
            ben = await db.beneficiaries.find_one({"id": data.assigned_beneficiary_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            update["assigned_beneficiary_name"] = f"{ben.get('first_name', '')} {ben.get('last_name', '')}".strip() if ben else None
        else:
            update["assigned_beneficiary_name"] = None

    if update:
        await db.digital_wallet.update_one({"id": entry_id}, {"$set": update})

    return {"success": True, "message": "Entry updated"}

@router.delete("/digital-wallet/{entry_id}")
async def delete_digital_wallet_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    entry = await db.digital_wallet.find_one({"id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    estate = await db.estates.find_one({"id": entry["estate_id"]}, {"_id": 0})
    if not estate or estate.get("owner_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.digital_wallet.delete_one({"id": entry_id})
    return {"success": True, "message": "Entry deleted"}


