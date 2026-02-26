"""CarryOn™ Backend — Authentication Routes"""
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

from models import TokenResponse, UserResponse, UserLogin, UserCreate, OTPVerify

router = APIRouter()

# ===================== AUTH ROUTES =====================

@router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Generate and store OTP
    otp = generate_otp()
    otp_method = data.otp_method or "email"
    
    await db.otps.update_one(
        {"email": data.email},
        {"$set": {
            "otp": otp, 
            "created_at": datetime.now(timezone.utc).isoformat(),
            "method": otp_method,
            "phone": data.phone if otp_method == "sms" else None
        }},
        upsert=True
    )
    
    # Send OTP via selected method
    if otp_method == "sms" and data.phone:
        await send_otp_sms(data.phone, otp)
        logger.info(f"SMS OTP for {data.email} to {data.phone}: {otp}")
        return {
            "message": "OTP sent via SMS", 
            "email": data.email, 
            "otp_hint": otp[:2] + "****", 
            "otp_method": "sms",
            "phone_hint": data.phone[-4:] if data.phone else None,
            "dev_otp": otp
        }
    else:
        await send_otp_email(data.email, otp, user.get("name", "User"))
        logger.info(f"Email OTP for {data.email}: {otp}")
        return {
            "message": "OTP sent via email", 
            "email": data.email, 
            "otp_hint": otp[:2] + "****", 
            "otp_method": "email",
            "dev_otp": otp
        }

@router.post("/auth/register")
async def register(data: UserCreate):
    """Register a new user account"""
    # Check if email already exists
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate password
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Build full name
    name_parts = [data.first_name]
    if data.middle_name:
        name_parts.append(data.middle_name)
    name_parts.append(data.last_name)
    if data.suffix:
        name_parts.append(data.suffix)
    full_name = " ".join(name_parts)
    
    # Create user
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": data.email,
        "password": hash_password(data.password),
        "name": full_name,
        "first_name": data.first_name,
        "middle_name": data.middle_name,
        "last_name": data.last_name,
        "suffix": data.suffix,
        "gender": data.gender,
        "role": data.role if data.role in ["benefactor", "beneficiary"] else "benefactor",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    
    # Generate OTP for verification
    otp = generate_otp()
    await db.otps.update_one(
        {"email": data.email},
        {"$set": {"otp": otp, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    # Send OTP via email
    await send_otp_email(data.email, otp, data.first_name)
    logger.info(f"Registration OTP for {data.email}: {otp}")
    
    return {"message": "Account created. Please verify with OTP.", "email": data.email, "otp_hint": otp[:2] + "****"}

@router.post("/auth/verify-otp", response_model=TokenResponse)
async def verify_otp(data: OTPVerify):
    stored_otp = await db.otps.find_one({"email": data.email}, {"_id": 0})
    if not stored_otp or stored_otp["otp"] != data.otp:
        raise HTTPException(status_code=401, detail="Invalid OTP")
    
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete used OTP
    await db.otps.delete_one({"email": data.email})
    
    token = create_token(user["id"], user["email"], user["role"])
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            created_at=user["created_at"]
        )
    )

@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        role=current_user["role"],
        created_at=current_user["created_at"]
    )

@router.post("/auth/dev-login")
async def dev_login(data: UserLogin):
    """DEV ONLY: Skip OTP, instant login for development testing"""
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["email"], user["role"])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            role=user["role"],
            created_at=user["created_at"]
        )
    )


