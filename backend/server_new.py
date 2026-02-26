"""
CarryOn™ Backend - server.py
Refactored entry point. Shared config, utilities, and helpers are imported from:
- config.py: DB connection, env vars, external service clients
- utils.py: encryption, auth, email, SMS, push notifications, activity logging

Routes are organized by section within this file. Future refactoring will
move each section into /routes/*.py files.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status, Response, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import os
import random
import base64
import asyncio
import io
import json as json_module
import stripe

# Import shared modules
from config import db, logger, client, xai_client, XAI_MODEL, SENDER_EMAIL
from utils import (
    encrypt_data, decrypt_data, generate_backup_code,
    hash_password, verify_password, create_token, decode_token,
    get_current_user, generate_otp,
    send_otp_email, send_otp_sms,
    log_activity, send_push_notification, send_push_to_all_admins,
    vapid, vapid_private_key_for_webpush,
)
from config import security, VAPID_CLAIMS_EMAIL

# Create the main app
app = FastAPI(title="CarryOn™ API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")
