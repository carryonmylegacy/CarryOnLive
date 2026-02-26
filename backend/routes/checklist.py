"""CarryOn™ Backend — Checklist Routes"""
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

# ===================== CHECKLIST ROUTES =====================

@router.get("/checklists/{estate_id}")
async def get_checklists(estate_id: str, current_user: dict = Depends(get_current_user)):
    checklists = await db.checklists.find({"estate_id": estate_id}, {"_id": 0}).sort("order", 1).to_list(100)
    return checklists

@router.post("/checklists")
async def create_checklist_item(data: ChecklistItemCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can create checklist items")
    
    item = ChecklistItem(
        estate_id=data.estate_id,
        title=data.title,
        description=data.description,
        category=data.category,
        order=data.order
    )
    await db.checklists.insert_one(item.model_dump())
    return item

@router.patch("/checklists/{item_id}/toggle")
async def toggle_checklist_item(item_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can update checklist items")
    
    item = await db.checklists.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    
    new_status = not item["is_completed"]
    await db.checklists.update_one(
        {"id": item_id},
        {"$set": {
            "is_completed": new_status,
            "completed_at": datetime.now(timezone.utc).isoformat() if new_status else None
        }}
    )
    
    # Update estate readiness
    await update_estate_readiness(item["estate_id"])
    
    return {"is_completed": new_status}


