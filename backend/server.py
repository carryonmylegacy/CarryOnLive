from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import random
import base64
import asyncio
import resend
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'carryon-secure-jwt-secret')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Encryption Configuration
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'carryon-default-encryption-key-32b!')
ENCRYPTION_SALT = b'carryon_salt_2024'

# Resend Configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Create the main app
app = FastAPI(title="CarryOn™ API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ===================== MODELS =====================

class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = "benefactor"  # benefactor, beneficiary, admin

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str = "benefactor"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class Estate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    name: str
    status: str = "pre-transition"  # pre-transition, active, transitioned
    readiness_score: int = 0
    beneficiaries: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    transitioned_at: Optional[str] = None

class Beneficiary(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    estate_id: str
    user_id: Optional[str] = None
    name: str
    relation: str
    email: EmailStr
    phone: Optional[str] = None
    avatar_color: str = "#d4af37"
    initials: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class BeneficiaryCreate(BaseModel):
    estate_id: str
    name: str
    relation: str
    email: EmailStr
    phone: Optional[str] = None
    avatar_color: str = "#d4af37"

class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    estate_id: str
    name: str
    category: str  # financial, legal, personal, medical
    file_type: str
    file_size: int
    file_data: Optional[str] = None  # Base64 encoded and encrypted
    is_locked: bool = False
    lock_type: Optional[str] = None  # password, voice, backup
    lock_password_hash: Optional[str] = None  # Hashed password for password lock
    backup_code: Optional[str] = None  # Backup unlock code
    is_encrypted: bool = True  # Whether file data is encrypted
    uploaded_by: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class DocumentCreate(BaseModel):
    estate_id: str
    name: str
    category: str
    lock_type: Optional[str] = None

class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    estate_id: str
    title: str
    content: str
    message_type: str = "text"  # text, video
    video_url: Optional[str] = None
    recipients: List[str] = []
    trigger_type: str = "immediate"  # immediate, age_milestone, event
    trigger_value: Optional[str] = None
    trigger_age: Optional[int] = None
    is_delivered: bool = False
    delivered_at: Optional[str] = None
    created_by: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class MessageCreate(BaseModel):
    estate_id: str
    title: str
    content: str
    message_type: str = "text"
    video_data: Optional[str] = None  # Base64 encoded video
    recipients: List[str] = []
    trigger_type: str = "immediate"
    trigger_value: Optional[str] = None
    trigger_age: Optional[int] = None

class ChecklistItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    estate_id: str
    title: str
    description: str
    category: str
    is_completed: bool = False
    completed_at: Optional[str] = None
    order: int = 0

class ChecklistItemCreate(BaseModel):
    estate_id: str
    title: str
    description: str
    category: str
    order: int = 0

class DeathCertificate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    estate_id: str
    uploaded_by: str
    file_data: str  # Base64 encoded
    file_name: str
    status: str = "pending"  # pending, approved, rejected
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class MilestoneReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    estate_id: str
    beneficiary_id: str
    event_type: str  # marriage, graduation, birthday, custom
    event_description: str
    event_date: str
    proof_data: Optional[str] = None  # Base64 encoded
    status: str = "pending"  # pending, verified, rejected
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class MilestoneReportCreate(BaseModel):
    estate_id: str
    event_type: str
    event_description: str
    event_date: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str

class DocumentUnlockRequest(BaseModel):
    password: Optional[str] = None
    backup_code: Optional[str] = None

class DocumentUploadRequest(BaseModel):
    estate_id: str
    name: str
    category: str
    lock_type: Optional[str] = None
    lock_password: Optional[str] = None  # For password-protected docs

# ===================== ENCRYPTION HELPERS =====================

def get_encryption_key() -> bytes:
    """Generate a Fernet key from the encryption key"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=ENCRYPTION_SALT,
        iterations=480000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))
    return key

def encrypt_data(data: bytes) -> str:
    """Encrypt data and return base64 encoded string"""
    f = Fernet(get_encryption_key())
    encrypted = f.encrypt(data)
    return base64.b64encode(encrypted).decode()

def decrypt_data(encrypted_data: str) -> bytes:
    """Decrypt base64 encoded encrypted data"""
    f = Fernet(get_encryption_key())
    encrypted_bytes = base64.b64decode(encrypted_data.encode())
    return f.decrypt(encrypted_bytes)

def generate_backup_code() -> str:
    """Generate a random backup code"""
    return '-'.join([''.join([str(random.randint(0, 9)) for _ in range(4)]) for _ in range(3)])

# ===================== EMAIL HELPERS =====================

async def send_otp_email(email: str, otp: str, name: str = "User"):
    """Send OTP via Resend email"""
    if not RESEND_API_KEY:
        logger.info(f"Email not configured. OTP for {email}: {otp}")
        return False
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; background-color: #0b1120; color: #f8fafc; padding: 40px; }}
            .container {{ max-width: 500px; margin: 0 auto; background: #0f1d35; border-radius: 16px; padding: 40px; border: 1px solid rgba(255,255,255,0.1); }}
            .logo {{ text-align: center; margin-bottom: 24px; }}
            .logo-text {{ font-size: 24px; font-weight: bold; color: #d4af37; }}
            h1 {{ color: #f8fafc; font-size: 20px; margin-bottom: 16px; }}
            .otp-code {{ background: linear-gradient(135deg, #d4af37, #fcd34d); color: #0b1120; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px 40px; border-radius: 12px; text-align: center; margin: 24px 0; }}
            p {{ color: #94a3b8; line-height: 1.6; }}
            .footer {{ margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; color: #64748b; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">
                <span class="logo-text">CarryOn™</span>
            </div>
            <h1>Hello {name},</h1>
            <p>Your verification code for CarryOn™ is:</p>
            <div class="otp-code">{otp}</div>
            <p>This code will expire in 10 minutes. If you didn't request this code, please ignore this email.</p>
            <div class="footer">
                <p>AES-256 Encrypted · Zero-Knowledge · SOC 2 Compliant</p>
                <p>© 2024 CarryOn™ - Every American Family. Ready.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    params = {
        "from": SENDER_EMAIL,
        "to": [email],
        "subject": f"Your CarryOn™ Verification Code: {otp[:2]}****",
        "html": html_content
    }
    
    try:
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"OTP email sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP email: {e}")
        logger.info(f"Fallback - OTP for {email}: {otp}")
        return False

# ===================== AUTH HELPERS =====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def generate_otp() -> str:
    return ''.join([str(random.randint(0, 9)) for _ in range(6)])

# ===================== SEED DATA =====================

async def seed_mock_data():
    """Seed mock data for the Mitchell family"""
    # Check if data already exists
    existing_user = await db.users.find_one({"email": "pete@mitchell.com"})
    if existing_user:
        return
    
    logger.info("Seeding mock data for Mitchell family...")
    
    # Create Pete Mitchell (Benefactor)
    pete_id = str(uuid.uuid4())
    pete = {
        "id": pete_id,
        "email": "pete@mitchell.com",
        "password": hash_password("password123"),
        "name": "Pete Mitchell",
        "role": "benefactor",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(pete)
    
    # Create Penny Mitchell (Beneficiary)
    penny_id = str(uuid.uuid4())
    penny = {
        "id": penny_id,
        "email": "penny@mitchell.com",
        "password": hash_password("password123"),
        "name": "Penny Mitchell",
        "role": "beneficiary",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(penny)
    
    # Create Admin user
    admin_id = str(uuid.uuid4())
    admin = {
        "id": admin_id,
        "email": "admin@carryon.com",
        "password": hash_password("admin123"),
        "name": "CarryOn Admin",
        "role": "admin",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(admin)
    
    # Create Pete's Estate
    estate_id = str(uuid.uuid4())
    estate = {
        "id": estate_id,
        "owner_id": pete_id,
        "name": "Mitchell Family Estate",
        "status": "pre-transition",
        "readiness_score": 45,
        "beneficiaries": [penny_id],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.estates.insert_one(estate)
    
    # Create beneficiary record
    beneficiary = {
        "id": str(uuid.uuid4()),
        "estate_id": estate_id,
        "user_id": penny_id,
        "name": "Penny Mitchell",
        "relation": "Daughter",
        "email": "penny@mitchell.com",
        "phone": "+1-555-0102",
        "avatar_color": "#d4af37",
        "initials": "PM",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.beneficiaries.insert_one(beneficiary)
    
    # Create checklist items
    checklist_items = [
        {"title": "Upload Will", "description": "Upload your last will and testament", "category": "legal", "order": 1},
        {"title": "Add Beneficiaries", "description": "Add all family members who should receive assets", "category": "family", "order": 2},
        {"title": "Upload Financial Documents", "description": "Add bank statements, investment accounts, etc.", "category": "financial", "order": 3},
        {"title": "Create Milestone Messages", "description": "Record messages for special occasions", "category": "messages", "order": 4},
        {"title": "Assign Power of Attorney", "description": "Designate someone to handle affairs", "category": "legal", "order": 5},
        {"title": "Upload Insurance Policies", "description": "Add life insurance and other policy documents", "category": "financial", "order": 6},
        {"title": "Add Emergency Contacts", "description": "List important contacts for your family", "category": "family", "order": 7},
        {"title": "Review Estate Plan", "description": "Schedule annual review of your estate plan", "category": "legal", "order": 8},
    ]
    
    for idx, item in enumerate(checklist_items):
        checklist = {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "title": item["title"],
            "description": item["description"],
            "category": item["category"],
            "is_completed": idx < 2,  # First 2 items completed
            "completed_at": datetime.now(timezone.utc).isoformat() if idx < 2 else None,
            "order": item["order"]
        }
        await db.checklists.insert_one(checklist)
    
    # Create sample documents
    documents = [
        {"name": "Last Will & Testament", "category": "legal", "file_type": "pdf", "file_size": 245000, "is_locked": True, "lock_type": "password"},
        {"name": "Bank Statements 2024", "category": "financial", "file_type": "pdf", "file_size": 892000, "is_locked": False},
        {"name": "Life Insurance Policy", "category": "financial", "file_type": "pdf", "file_size": 156000, "is_locked": True, "lock_type": "backup"},
    ]
    
    for doc in documents:
        document = {
            "id": str(uuid.uuid4()),
            "estate_id": estate_id,
            "name": doc["name"],
            "category": doc["category"],
            "file_type": doc["file_type"],
            "file_size": doc["file_size"],
            "is_locked": doc.get("is_locked", False),
            "lock_type": doc.get("lock_type"),
            "uploaded_by": pete_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.documents.insert_one(document)
    
    # Create sample message
    message = {
        "id": str(uuid.uuid4()),
        "estate_id": estate_id,
        "title": "Happy 30th Birthday, Penny!",
        "content": "My dearest Penny, if you're reading this on your 30th birthday, I want you to know how proud I am of the woman you've become. Keep reaching for the stars.",
        "message_type": "text",
        "recipients": [penny_id],
        "trigger_type": "age_milestone",
        "trigger_age": 30,
        "is_delivered": False,
        "created_by": pete_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(message)
    
    logger.info("Mock data seeded successfully!")

# ===================== AUTH ROUTES =====================

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Generate and store OTP
    otp = generate_otp()
    await db.otps.update_one(
        {"email": data.email},
        {"$set": {"otp": otp, "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    # Send OTP via email (falls back to logging if not configured)
    await send_otp_email(data.email, otp, user.get("name", "User"))
    logger.info(f"OTP for {data.email}: {otp}")  # Also log for debugging
    
    return {"message": "OTP sent", "email": data.email, "otp_hint": otp[:2] + "****"}

@api_router.post("/auth/verify-otp", response_model=TokenResponse)
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

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        role=current_user["role"],
        created_at=current_user["created_at"]
    )

# ===================== ESTATE ROUTES =====================

@api_router.get("/estates")
async def get_estates(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "benefactor":
        estates = await db.estates.find({"owner_id": current_user["id"]}, {"_id": 0}).to_list(100)
    elif current_user["role"] == "beneficiary":
        estates = await db.estates.find({"beneficiaries": current_user["id"]}, {"_id": 0}).to_list(100)
    else:  # admin
        estates = await db.estates.find({}, {"_id": 0}).to_list(100)
    return estates

@api_router.get("/estates/{estate_id}")
async def get_estate(estate_id: str, current_user: dict = Depends(get_current_user)):
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    
    # Check access
    if current_user["role"] == "benefactor" and estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user["role"] == "beneficiary" and current_user["id"] not in estate["beneficiaries"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return estate

@api_router.post("/estates")
async def create_estate(name: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can create estates")
    
    estate = Estate(owner_id=current_user["id"], name=name)
    await db.estates.insert_one(estate.model_dump())
    return estate

# ===================== BENEFICIARY ROUTES =====================

@api_router.get("/beneficiaries/{estate_id}")
async def get_beneficiaries(estate_id: str, current_user: dict = Depends(get_current_user)):
    beneficiaries = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    return beneficiaries

@api_router.post("/beneficiaries")
async def create_beneficiary(data: BeneficiaryCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can add beneficiaries")
    
    # Generate initials
    initials = ''.join([n[0].upper() for n in data.name.split()[:2]])
    
    beneficiary = Beneficiary(
        estate_id=data.estate_id,
        name=data.name,
        relation=data.relation,
        email=data.email,
        phone=data.phone,
        avatar_color=data.avatar_color,
        initials=initials
    )
    await db.beneficiaries.insert_one(beneficiary.model_dump())
    
    # Add to estate's beneficiary list if user exists
    existing_user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing_user:
        await db.estates.update_one(
            {"id": data.estate_id},
            {"$addToSet": {"beneficiaries": existing_user["id"]}}
        )
    
    return beneficiary

@api_router.delete("/beneficiaries/{beneficiary_id}")
async def delete_beneficiary(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can remove beneficiaries")
    
    result = await db.beneficiaries.delete_one({"id": beneficiary_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    
    return {"message": "Beneficiary removed"}

# ===================== DOCUMENT ROUTES =====================

@api_router.get("/documents/{estate_id}")
async def get_documents(estate_id: str, current_user: dict = Depends(get_current_user)):
    documents = await db.documents.find(
        {"estate_id": estate_id}, 
        {"_id": 0, "file_data": 0, "lock_password_hash": 0, "backup_code": 0}
    ).to_list(100)
    return documents

@api_router.post("/documents/upload")
async def upload_document(
    estate_id: str,
    name: str,
    category: str,
    lock_type: Optional[str] = None,
    lock_password: Optional[str] = None,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can upload documents")
    
    content = await file.read()
    
    # Encrypt the file data
    encrypted_data = encrypt_data(content)
    
    # Generate backup code for locked documents
    backup_code = generate_backup_code() if lock_type else None
    
    # Hash password if provided
    password_hash = hash_password(lock_password) if lock_password and lock_type == "password" else None
    
    document = Document(
        estate_id=estate_id,
        name=name,
        category=category,
        file_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        file_data=encrypted_data,
        is_locked=lock_type is not None,
        lock_type=lock_type,
        lock_password_hash=password_hash,
        backup_code=backup_code,
        is_encrypted=True,
        uploaded_by=current_user["id"]
    )
    await db.documents.insert_one(document.model_dump())
    
    # Update estate readiness
    await update_estate_readiness(estate_id)
    
    response = {"id": document.id, "name": document.name, "message": "Document uploaded and encrypted"}
    if backup_code:
        response["backup_code"] = backup_code
        response["backup_message"] = "Save this backup code securely - it can be used to unlock this document"
    
    return response

@api_router.post("/documents/{document_id}/unlock")
async def unlock_document(
    document_id: str,
    unlock_data: DocumentUnlockRequest,
    current_user: dict = Depends(get_current_user)
):
    """Unlock a protected document"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.get("is_locked"):
        return {"message": "Document is not locked", "unlocked": True}
    
    lock_type = document.get("lock_type")
    
    # Verify unlock credentials
    if lock_type == "password":
        if not unlock_data.password:
            raise HTTPException(status_code=400, detail="Password required")
        if not document.get("lock_password_hash"):
            raise HTTPException(status_code=400, detail="Document has no password set")
        if not verify_password(unlock_data.password, document["lock_password_hash"]):
            # Try backup code
            if unlock_data.backup_code and document.get("backup_code") == unlock_data.backup_code:
                pass  # Backup code valid
            else:
                raise HTTPException(status_code=401, detail="Invalid password")
    
    elif lock_type == "backup":
        if not unlock_data.backup_code:
            raise HTTPException(status_code=400, detail="Backup code required")
        if document.get("backup_code") != unlock_data.backup_code:
            raise HTTPException(status_code=401, detail="Invalid backup code")
    
    elif lock_type == "voice":
        # Voice verification would be implemented with a voice recognition API
        # For now, accept backup code as fallback
        if not unlock_data.backup_code:
            raise HTTPException(status_code=400, detail="Voice verification not available. Use backup code.")
        if document.get("backup_code") != unlock_data.backup_code:
            raise HTTPException(status_code=401, detail="Invalid backup code")
    
    return {"message": "Document unlocked successfully", "unlocked": True, "document_id": document_id}

@api_router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    password: Optional[str] = None,
    backup_code: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Download a document (decrypted)"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check if document is locked and verify credentials
    if document.get("is_locked"):
        lock_type = document.get("lock_type")
        
        if lock_type == "password" and document.get("lock_password_hash"):
            if password and verify_password(password, document["lock_password_hash"]):
                pass  # Valid password
            elif backup_code and document.get("backup_code") == backup_code:
                pass  # Valid backup code
            else:
                raise HTTPException(status_code=401, detail="Invalid credentials for locked document")
        
        elif lock_type in ["backup", "voice"]:
            if not backup_code or document.get("backup_code") != backup_code:
                raise HTTPException(status_code=401, detail="Invalid backup code")
    
    # Decrypt the file data
    if not document.get("file_data"):
        raise HTTPException(status_code=404, detail="Document data not found")
    
    try:
        decrypted_data = decrypt_data(document["file_data"])
    except Exception as e:
        logger.error(f"Decryption error: {e}")
        raise HTTPException(status_code=500, detail="Failed to decrypt document")
    
    return Response(
        content=decrypted_data,
        media_type=document.get("file_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'attachment; filename="{document["name"]}"'
        }
    )

@api_router.delete("/documents/{document_id}")
async def delete_document(document_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can delete documents")
    
    result = await db.documents.delete_one({"id": document_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {"message": "Document deleted"}

# ===================== MESSAGE ROUTES =====================

@api_router.get("/messages/{estate_id}")
async def get_messages(estate_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] == "beneficiary":
        # Only show delivered messages to beneficiaries
        messages = await db.messages.find(
            {"estate_id": estate_id, "recipients": current_user["id"], "is_delivered": True},
            {"_id": 0, "video_url": 0}
        ).to_list(100)
    else:
        messages = await db.messages.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    return messages

@api_router.post("/messages")
async def create_message(data: MessageCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can create messages")
    
    message = Message(
        estate_id=data.estate_id,
        title=data.title,
        content=data.content,
        message_type=data.message_type,
        recipients=data.recipients,
        trigger_type=data.trigger_type,
        trigger_value=data.trigger_value,
        trigger_age=data.trigger_age,
        created_by=current_user["id"]
    )
    
    # Handle video data
    if data.video_data:
        message.video_url = f"video_{message.id}"
        await db.video_storage.insert_one({"id": message.video_url, "data": data.video_data})
    
    await db.messages.insert_one(message.model_dump())
    
    # Update estate readiness
    await update_estate_readiness(data.estate_id)
    
    return message

@api_router.delete("/messages/{message_id}")
async def delete_message(message_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can delete messages")
    
    result = await db.messages.delete_one({"id": message_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    
    return {"message": "Message deleted"}

# ===================== CHECKLIST ROUTES =====================

@api_router.get("/checklists/{estate_id}")
async def get_checklists(estate_id: str, current_user: dict = Depends(get_current_user)):
    checklists = await db.checklists.find({"estate_id": estate_id}, {"_id": 0}).sort("order", 1).to_list(100)
    return checklists

@api_router.post("/checklists")
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

@api_router.patch("/checklists/{item_id}/toggle")
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

# ===================== ESTATE TRANSITION ROUTES =====================

@api_router.post("/transition/upload-certificate")
async def upload_death_certificate(
    estate_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    content = await file.read()
    file_data = base64.b64encode(content).decode()
    
    certificate = DeathCertificate(
        estate_id=estate_id,
        uploaded_by=current_user["id"],
        file_data=file_data,
        file_name=file.filename or "death_certificate.pdf"
    )
    await db.death_certificates.insert_one(certificate.model_dump())
    
    return {"id": certificate.id, "status": "pending", "message": "Death certificate uploaded for review"}

@api_router.get("/transition/certificates")
async def get_pending_certificates(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view pending certificates")
    
    certificates = await db.death_certificates.find({"status": "pending"}, {"_id": 0, "file_data": 0}).to_list(100)
    return certificates

@api_router.post("/transition/approve/{certificate_id}")
async def approve_death_certificate(certificate_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can approve certificates")
    
    certificate = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")
    
    # Update certificate status
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {"$set": {
            "status": "approved",
            "reviewed_by": current_user["id"],
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Transition the estate
    await db.estates.update_one(
        {"id": certificate["estate_id"]},
        {"$set": {
            "status": "transitioned",
            "transitioned_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Deliver all messages marked for immediate delivery
    await db.messages.update_many(
        {"estate_id": certificate["estate_id"], "trigger_type": "immediate"},
        {"$set": {"is_delivered": True, "delivered_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Certificate approved, estate transitioned"}

@api_router.get("/transition/status/{estate_id}")
async def get_transition_status(estate_id: str, current_user: dict = Depends(get_current_user)):
    certificate = await db.death_certificates.find_one(
        {"estate_id": estate_id},
        {"_id": 0, "file_data": 0}
    )
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    
    return {
        "estate_status": estate["status"] if estate else "unknown",
        "certificate": certificate
    }

# ===================== MILESTONE REPORT ROUTES =====================

@api_router.post("/milestones/report")
async def report_milestone(data: MilestoneReportCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "beneficiary":
        raise HTTPException(status_code=403, detail="Only beneficiaries can report milestones")
    
    report = MilestoneReport(
        estate_id=data.estate_id,
        beneficiary_id=current_user["id"],
        event_type=data.event_type,
        event_description=data.event_description,
        event_date=data.event_date
    )
    await db.milestone_reports.insert_one(report.model_dump())
    
    # Check for messages to deliver based on this milestone
    messages = await db.messages.find({
        "estate_id": data.estate_id,
        "recipients": current_user["id"],
        "trigger_type": "event",
        "trigger_value": data.event_type,
        "is_delivered": False
    }, {"_id": 0}).to_list(100)
    
    for msg in messages:
        await db.messages.update_one(
            {"id": msg["id"]},
            {"$set": {"is_delivered": True, "delivered_at": datetime.now(timezone.utc).isoformat()}}
        )
    
    return {"id": report.id, "messages_delivered": len(messages)}

# ===================== AI CHAT ROUTES =====================

@api_router.post("/chat/guardian", response_model=ChatResponse)
async def chat_with_guardian(data: ChatRequest, current_user: dict = Depends(get_current_user)):
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    session_id = data.session_id or f"chat_{current_user['id']}_{str(uuid.uuid4())[:8]}"
    
    # Get chat history
    history = await db.chat_history.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
    
    system_message = """You are the Estate Guardian, a knowledgeable and compassionate AI assistant for CarryOn™, 
    a secure estate planning platform. Your role is to help users with:
    - Understanding estate planning concepts
    - Organizing their documents and assets
    - Creating meaningful milestone messages for loved ones
    - Navigating the transition process
    - Answering questions about wills, trusts, and beneficiary designations
    
    Be warm, professional, and helpful. If asked about specific legal or financial advice, 
    recommend consulting with qualified professionals. Focus on education and guidance."""
    
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_message
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=data.message)
        response = await chat.send_message(user_message)
        
        # Store in history
        await db.chat_history.insert_one({
            "session_id": session_id,
            "user_id": current_user["id"],
            "role": "user",
            "content": data.message,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        await db.chat_history.insert_one({
            "session_id": session_id,
            "user_id": current_user["id"],
            "role": "assistant",
            "content": response,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return ChatResponse(response=response, session_id=session_id)
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(status_code=500, detail="AI service temporarily unavailable")

@api_router.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, current_user: dict = Depends(get_current_user)):
    history = await db.chat_history.find(
        {"session_id": session_id, "user_id": current_user["id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return history

# ===================== HELPER FUNCTIONS =====================

async def update_estate_readiness(estate_id: str):
    """Calculate and update estate readiness score"""
    # Count completed checklist items
    total_items = await db.checklists.count_documents({"estate_id": estate_id})
    completed_items = await db.checklists.count_documents({"estate_id": estate_id, "is_completed": True})
    
    # Count documents
    doc_count = await db.documents.count_documents({"estate_id": estate_id})
    
    # Count beneficiaries
    beneficiary_count = await db.beneficiaries.count_documents({"estate_id": estate_id})
    
    # Count messages
    message_count = await db.messages.count_documents({"estate_id": estate_id})
    
    # Calculate score (weighted)
    checklist_score = (completed_items / max(total_items, 1)) * 40
    doc_score = min(doc_count * 10, 30)
    beneficiary_score = min(beneficiary_count * 5, 15)
    message_score = min(message_count * 5, 15)
    
    total_score = int(checklist_score + doc_score + beneficiary_score + message_score)
    
    await db.estates.update_one(
        {"id": estate_id},
        {"$set": {"readiness_score": min(total_score, 100)}}
    )

# ===================== STARTUP =====================

@app.on_event("startup")
async def startup_event():
    await seed_mock_data()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
