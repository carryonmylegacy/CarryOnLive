"""CarryOn™ Backend — Admin Routes"""
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

from models import UserResponse

router = APIRouter()

# ===================== ADMIN ROUTES =====================

class DevSwitcherConfig(BaseModel):
    benefactor_email: str = ""
    benefactor_password: str = ""
    beneficiary_email: str = ""
    beneficiary_password: str = ""
    enabled: bool = True

@router.get("/admin/dev-switcher")
async def get_dev_switcher_config(current_user: dict = Depends(get_current_user)):
    """Get dev switcher configuration — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    config = await db.dev_config.find_one({"id": "dev_switcher"}, {"_id": 0})
    if not config:
        config = {"id": "dev_switcher", "benefactor_email": "", "benefactor_password": "", 
                  "beneficiary_email": "", "beneficiary_password": "", "enabled": True}
        await db.dev_config.insert_one(config)
    
    # Don't expose passwords in GET response - just indicate if set
    return {
        "benefactor_email": config.get("benefactor_email", ""),
        "benefactor_configured": bool(config.get("benefactor_password")),
        "beneficiary_email": config.get("beneficiary_email", ""),
        "beneficiary_configured": bool(config.get("beneficiary_password")),
        "enabled": config.get("enabled", True)
    }

@router.put("/admin/dev-switcher")
async def update_dev_switcher_config(data: DevSwitcherConfig, current_user: dict = Depends(get_current_user)):
    """Update dev switcher configuration — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Validate that the accounts exist if provided
    if data.benefactor_email:
        user = await db.users.find_one({"email": data.benefactor_email}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=400, detail=f"Benefactor account not found: {data.benefactor_email}")
        if user["role"] != "benefactor":
            raise HTTPException(status_code=400, detail=f"Account is not a benefactor: {data.benefactor_email}")
    
    if data.beneficiary_email:
        user = await db.users.find_one({"email": data.beneficiary_email}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=400, detail=f"Beneficiary account not found: {data.beneficiary_email}")
        if user["role"] != "beneficiary":
            raise HTTPException(status_code=400, detail=f"Account is not a beneficiary: {data.beneficiary_email}")
    
    await db.dev_config.update_one(
        {"id": "dev_switcher"},
        {"$set": {
            "benefactor_email": data.benefactor_email,
            "benefactor_password": data.benefactor_password,
            "beneficiary_email": data.beneficiary_email,
            "beneficiary_password": data.beneficiary_password,
            "enabled": data.enabled
        }},
        upsert=True
    )
    
    return {"message": "Dev switcher config updated"}

@router.get("/dev-switcher/config")
async def get_public_dev_switcher_config():
    """Get dev switcher config for frontend (public, returns credentials for dev login)"""
    config = await db.dev_config.find_one({"id": "dev_switcher"}, {"_id": 0})
    if not config or not config.get("enabled", True):
        return {"enabled": False}
    
    return {
        "enabled": config.get("enabled", True),
        "benefactor": {
            "email": config.get("benefactor_email", ""),
            "password": config.get("benefactor_password", "")
        } if config.get("benefactor_email") else None,
        "beneficiary": {
            "email": config.get("beneficiary_email", ""),
            "password": config.get("beneficiary_password", "")
        } if config.get("beneficiary_email") else None
    }

@router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    """Get all users — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return users

@router.get("/admin/stats")
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    """Get platform stats — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    total_users = await db.users.count_documents({})
    benefactors = await db.users.count_documents({"role": "benefactor"})
    beneficiaries = await db.users.count_documents({"role": "beneficiary"})
    admins = await db.users.count_documents({"role": "admin"})
    total_estates = await db.estates.count_documents({})
    transitioned = await db.estates.count_documents({"status": "transitioned"})
    total_docs = await db.documents.count_documents({})
    total_messages = await db.messages.count_documents({})
    pending_certs = await db.death_certificates.count_documents({"status": "pending"})
    return {
        "users": {"total": total_users, "benefactors": benefactors, "beneficiaries": beneficiaries, "admins": admins},
        "estates": {"total": total_estates, "transitioned": transitioned, "active": total_estates - transitioned},
        "documents": total_docs,
        "messages": total_messages,
        "pending_certificates": pending_certs
    }

@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a user — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


