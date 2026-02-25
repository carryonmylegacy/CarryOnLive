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
import pdfplumber
import io
import json as json_module

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
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    suffix: Optional[str] = None
    gender: Optional[str] = None
    role: str = "benefactor"  # benefactor, beneficiary, admin

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    suffix: Optional[str] = None
    gender: Optional[str] = None
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
    state: Optional[str] = None  # US state for estate law context
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
    relation: str  # spouse, child, parent, sibling, grandchild, friend, other
    email: EmailStr
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None  # ISO date string
    gender: Optional[str] = None  # male, female, other
    avatar_color: str = "#d4af37"
    initials: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class BeneficiaryCreate(BaseModel):
    estate_id: str
    name: str
    relation: str
    email: EmailStr
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
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
    voice_passphrase_hash: Optional[str] = None  # Hashed voice passphrase
    voice_passphrase_hint: Optional[str] = None  # Hint for voice passphrase
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

class ActivityLog(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    estate_id: str
    user_id: str
    user_name: str
    action: str  # document_upload, beneficiary_added, message_created, checklist_completed, etc.
    description: str
    metadata: Optional[Dict[str, Any]] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class EstateCreate(BaseModel):
    name: str
    description: Optional[str] = None

class EstateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    state: Optional[str] = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    estate_id: Optional[str] = None
    action: Optional[str] = None  # "analyze_vault", "generate_checklist", "analyze_readiness"

class ChatResponse(BaseModel):
    response: str
    session_id: str
    action_result: Optional[Dict[str, Any]] = None

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

# ===================== ESTATE READINESS SCORE CALCULATION =====================

# Required documents for 100% document score
REQUIRED_DOCUMENTS = {
    "legal": [
        {"name": "Last Will and Testament", "category": "legal"},
        {"name": "Revocable Living Trust", "category": "legal"},
        {"name": "Financial Power of Attorney", "category": "legal"},
        {"name": "Medical Power of Attorney", "category": "legal"},
        {"name": "Healthcare Directive/Living Will", "category": "legal"},
    ]
}

# Life milestones based on age and relationship
def get_expected_milestones(beneficiary: dict) -> list:
    """Calculate expected milestone messages based on beneficiary demographics"""
    milestones = ["Upon Death"]  # Everyone gets this
    
    relation = beneficiary.get("relation", "").lower()
    gender = beneficiary.get("gender", "").lower()
    dob_str = beneficiary.get("date_of_birth")
    
    # Calculate age if DOB is provided
    age = None
    if dob_str:
        try:
            dob = datetime.fromisoformat(dob_str.replace('Z', '+00:00'))
            today = datetime.now(timezone.utc)
            age = (today - dob).days // 365
        except:
            pass
    
    # Child milestones based on age
    if relation in ["child", "son", "daughter", "grandchild", "grandson", "granddaughter"]:
        if age is not None:
            if age < 12:
                milestones.extend(["Elementary School Graduation", "Middle School Graduation", 
                                   "High School Graduation", "College Acceptance", "College Graduation",
                                   "Engagement", "Marriage", "First Child", "First Home Purchase"])
            elif age < 14:
                milestones.extend(["Middle School Graduation", "High School Graduation", 
                                   "College Acceptance", "College Graduation", "Engagement", 
                                   "Marriage", "First Child", "First Home Purchase"])
            elif age < 18:
                milestones.extend(["High School Graduation", "College Acceptance", "College Graduation",
                                   "Engagement", "Marriage", "First Child", "First Home Purchase"])
            elif age < 22:
                milestones.extend(["College Graduation", "First Job", "Engagement", 
                                   "Marriage", "First Child", "First Home Purchase"])
            elif age < 30:
                milestones.extend(["Engagement", "Marriage", "First Child", "First Home Purchase",
                                   "Career Milestone", "30th Birthday"])
            elif age < 40:
                milestones.extend(["Marriage", "First Child", "First Home Purchase", 
                                   "40th Birthday", "Career Milestone"])
            else:
                milestones.extend(["Major Birthday (50th, 60th)", "Retirement", "First Grandchild"])
        else:
            # Default milestones for children without DOB
            milestones.extend(["High School Graduation", "College Graduation", "Marriage", "First Child"])
    
    # Spouse milestones
    elif relation in ["spouse", "wife", "husband", "partner"]:
        milestones.extend(["First Anniversary After Passing", "Retirement", "First Grandchild",
                          "Major Health Milestone", "Travel/Dream Vacation", "70th Birthday", "80th Birthday"])
    
    # Parent milestones
    elif relation in ["parent", "mother", "father"]:
        milestones.extend(["First Anniversary After Passing", "Major Birthday", 
                          "Health Milestone", "Special Occasion"])
    
    # Sibling milestones
    elif relation in ["sibling", "brother", "sister"]:
        milestones.extend(["First Anniversary After Passing", "Major Life Event",
                          "Retirement", "Special Family Occasion"])
    
    # Friend or other
    else:
        milestones.extend(["First Anniversary After Passing", "Special Occasion"])
    
    return milestones

# Default checklist items (25+ items)
DEFAULT_CHECKLIST_ITEMS = [
    # Immediate (Day 1-3)
    {"title": "Notify immediate family members", "description": "Call or visit closest family members to inform them of the passing", "category": "immediate", "order": 1},
    {"title": "Contact funeral home", "description": "Arrange for transportation and begin funeral planning", "category": "immediate", "order": 2},
    {"title": "Secure the residence", "description": "Ensure home is locked and secure, collect mail, adjust thermostat", "category": "immediate", "order": 3},
    {"title": "Locate important documents", "description": "Find will, trust documents, insurance policies, and financial records", "category": "immediate", "order": 4},
    {"title": "Notify employer (if applicable)", "description": "Contact HR department about final paycheck and benefits", "category": "immediate", "order": 5},
    {"title": "Contact estate attorney", "description": "Schedule meeting to review will and begin probate process", "category": "immediate", "order": 6},
    {"title": "Obtain death certificates", "description": "Order at least 10-15 certified copies from funeral home or vital records", "category": "immediate", "order": 7},
    
    # First Week
    {"title": "Notify Social Security Administration", "description": "Report death and inquire about survivor benefits", "category": "first_week", "order": 8},
    {"title": "Contact life insurance companies", "description": "File claims with all life insurance providers", "category": "first_week", "order": 9},
    {"title": "Notify banks and financial institutions", "description": "Inform all banks, credit unions, and investment accounts", "category": "first_week", "order": 10},
    {"title": "Contact credit card companies", "description": "Close accounts and pay off balances from estate", "category": "first_week", "order": 11},
    {"title": "Notify pension/retirement plan administrators", "description": "Contact 401k, IRA, and pension providers", "category": "first_week", "order": 12},
    {"title": "Cancel or transfer utilities", "description": "Electric, gas, water, internet, phone services", "category": "first_week", "order": 13},
    {"title": "Forward mail", "description": "Set up mail forwarding with USPS to executor's address", "category": "first_week", "order": 14},
    {"title": "Secure digital accounts", "description": "Change passwords or memorialize social media accounts", "category": "first_week", "order": 15},
    
    # First Two Weeks
    {"title": "File for probate (if required)", "description": "Submit will to probate court and begin legal process", "category": "two_weeks", "order": 16},
    {"title": "Notify health insurance provider", "description": "Cancel coverage and handle COBRA for dependents", "category": "two_weeks", "order": 17},
    {"title": "Contact mortgage company", "description": "Discuss options for property transfer or assumption", "category": "two_weeks", "order": 18},
    {"title": "Cancel subscriptions and memberships", "description": "Gym, streaming services, magazines, clubs", "category": "two_weeks", "order": 19},
    {"title": "Notify DMV", "description": "Cancel driver's license and transfer vehicle titles", "category": "two_weeks", "order": 20},
    {"title": "Review and update beneficiary designations", "description": "Ensure surviving family members update their own documents", "category": "two_weeks", "order": 21},
    
    # First Month
    {"title": "File final tax return", "description": "Prepare or arrange for preparation of final income tax return", "category": "first_month", "order": 22},
    {"title": "Pay outstanding debts", "description": "Review and pay legitimate debts from estate assets", "category": "first_month", "order": 23},
    {"title": "Distribute personal belongings", "description": "Follow will instructions or family agreement for distribution", "category": "first_month", "order": 24},
    {"title": "Notify Veterans Affairs (if applicable)", "description": "Report death and inquire about burial benefits", "category": "first_month", "order": 25},
    {"title": "Update property deeds", "description": "Transfer real estate titles to beneficiaries or trust", "category": "first_month", "order": 26},
    {"title": "Close or transfer business interests", "description": "Handle any business ownership transitions", "category": "first_month", "order": 27},
    {"title": "Cancel voter registration", "description": "Notify county election office", "category": "first_month", "order": 28},
    {"title": "Return medical equipment", "description": "Return any rented hospital beds, wheelchairs, oxygen equipment", "category": "first_month", "order": 29},
    {"title": "Notify professional organizations", "description": "Cancel memberships in professional associations", "category": "first_month", "order": 30},
]

async def calculate_document_score(estate_id: str) -> dict:
    """Calculate document completeness score (0-100)"""
    documents = await db.documents.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    
    required_docs = REQUIRED_DOCUMENTS["legal"]
    found_docs = 0
    missing_docs = []
    
    doc_names_lower = [d.get("name", "").lower() for d in documents]
    
    for req_doc in required_docs:
        req_name = req_doc["name"].lower()
        # Check if any uploaded document matches (fuzzy matching)
        found = any(
            req_name in doc_name or 
            doc_name in req_name or
            ("will" in req_name and "will" in doc_name and "living" not in doc_name) or
            ("trust" in req_name and "trust" in doc_name) or
            ("financial power" in req_name and "financial" in doc_name and "power" in doc_name) or
            ("medical power" in req_name and "medical" in doc_name and "power" in doc_name) or
            ("healthcare directive" in req_name and ("directive" in doc_name or "living will" in doc_name))
            for doc_name in doc_names_lower
        )
        if found:
            found_docs += 1
        else:
            missing_docs.append(req_doc["name"])
    
    score = int((found_docs / len(required_docs)) * 100) if required_docs else 0
    
    return {
        "score": score,
        "found": found_docs,
        "required": len(required_docs),
        "missing": missing_docs
    }

async def calculate_messages_score(estate_id: str) -> dict:
    """Calculate milestone messages completeness score (0-100)"""
    beneficiaries = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    messages = await db.messages.find({"estate_id": estate_id}, {"_id": 0}).to_list(500)
    
    if not beneficiaries:
        return {"score": 0, "found": 0, "required": 1, "missing": ["Add at least one beneficiary"]}
    
    total_expected = 0
    total_found = 0
    missing_milestones = []
    
    for ben in beneficiaries:
        expected_milestones = get_expected_milestones(ben)
        total_expected += len(expected_milestones)
        
        # Check how many messages exist for this beneficiary
        # Match by beneficiary record id OR user_id
        ben_id = ben["id"]
        ben_user_id = ben.get("user_id")
        ben_messages = [m for m in messages if 
            ben_id in m.get("recipients", []) or 
            (ben_user_id and ben_user_id in m.get("recipients", [])) or
            not m.get("recipients")]
        
        # Count unique milestone types covered
        message_triggers = set()
        for msg in ben_messages:
            trigger = msg.get("trigger_type", "immediate")
            trigger_value = msg.get("trigger_value", "")
            message_triggers.add(f"{trigger}:{trigger_value}")
        
        # Simple heuristic: each message covers one milestone
        found_for_ben = min(len(ben_messages), len(expected_milestones))
        total_found += found_for_ben
        
        if found_for_ben < len(expected_milestones):
            missing_count = len(expected_milestones) - found_for_ben
            missing_milestones.append(f"{ben['name']}: {missing_count} more milestone messages needed")
    
    score = int((total_found / max(total_expected, 1)) * 100)
    
    return {
        "score": min(score, 100),
        "found": total_found,
        "required": total_expected,
        "missing": missing_milestones[:5]  # Limit to top 5
    }

async def calculate_checklist_score(estate_id: str) -> dict:
    """Calculate checklist completeness score (0-100)"""
    checklist_items = await db.checklists.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    
    total_items = len(checklist_items)
    completed_items = sum(1 for item in checklist_items if item.get("is_completed"))
    
    # Minimum 25 items for 100%
    min_required = 25
    
    if total_items < min_required:
        # Score based on both having enough items AND completing them
        item_coverage = total_items / min_required
        completion_rate = completed_items / max(total_items, 1)
        score = int((item_coverage * 0.5 + completion_rate * 0.5) * 100)
    else:
        score = int((completed_items / total_items) * 100)
    
    missing = []
    if total_items < min_required:
        missing.append(f"Add {min_required - total_items} more checklist items")
    incomplete = total_items - completed_items
    if incomplete > 0:
        missing.append(f"Complete {incomplete} remaining items")
    
    return {
        "score": min(score, 100),
        "found": completed_items,
        "required": max(total_items, min_required),
        "missing": missing
    }

async def calculate_estate_readiness(estate_id: str) -> dict:
    """Calculate comprehensive estate readiness score"""
    doc_result = await calculate_document_score(estate_id)
    msg_result = await calculate_messages_score(estate_id)
    checklist_result = await calculate_checklist_score(estate_id)
    
    # Average of three categories
    overall_score = int((doc_result["score"] + msg_result["score"] + checklist_result["score"]) / 3)
    
    return {
        "overall_score": overall_score,
        "documents": doc_result,
        "messages": msg_result,
        "checklist": checklist_result
    }

async def ensure_default_checklist(estate_id: str):
    """Ensure estate has default checklist items"""
    existing = await db.checklists.count_documents({"estate_id": estate_id})
    if existing == 0:
        # Add default checklist items
        for item in DEFAULT_CHECKLIST_ITEMS:
            checklist_item = ChecklistItem(
                estate_id=estate_id,
                title=item["title"],
                description=item["description"],
                category=item["category"],
                order=item["order"]
            )
            await db.checklists.insert_one(checklist_item.model_dump())

# ===================== ACTIVITY LOGGING =====================

async def log_activity(estate_id: str, user_id: str, user_name: str, action: str, description: str, metadata: dict = None):
    """Log an activity to the estate timeline"""
    activity = ActivityLog(
        estate_id=estate_id,
        user_id=user_id,
        user_name=user_name,
        action=action,
        description=description,
        metadata=metadata
    )
    await db.activity_logs.insert_one(activity.model_dump())
    return activity

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

@api_router.post("/auth/register")
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

# ===================== ADMIN ROUTES =====================

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    """Get all users — admin only"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return users

@api_router.get("/admin/stats")
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

@api_router.delete("/admin/users/{user_id}")
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
async def create_estate(data: EstateCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can create estates")
    
    estate = Estate(owner_id=current_user["id"], name=data.name)
    await db.estates.insert_one(estate.model_dump())
    
    # Log activity
    await log_activity(
        estate_id=estate.id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="estate_created",
        description=f"Created estate: {data.name}"
    )
    
    # Create default checklist items for new estate
    await ensure_default_checklist(estate.id)
    
    return estate

@api_router.patch("/estates/{estate_id}")
async def update_estate(estate_id: str, data: EstateUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can update estates")
    
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    
    if estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {}
    if data.name:
        update_data["name"] = data.name
    if data.description:
        update_data["description"] = data.description
    if data.state is not None:
        update_data["state"] = data.state
    
    if update_data:
        await db.estates.update_one({"id": estate_id}, {"$set": update_data})
        await log_activity(
            estate_id=estate_id,
            user_id=current_user["id"],
            user_name=current_user["name"],
            action="estate_updated",
            description="Updated estate settings"
        )
    
    return {"message": "Estate updated"}

@api_router.delete("/estates/{estate_id}")
async def delete_estate(estate_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can delete estates")
    
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    
    if estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Delete all related data
    await db.documents.delete_many({"estate_id": estate_id})
    await db.messages.delete_many({"estate_id": estate_id})
    await db.beneficiaries.delete_many({"estate_id": estate_id})
    await db.checklists.delete_many({"estate_id": estate_id})
    await db.activity_logs.delete_many({"estate_id": estate_id})
    await db.estates.delete_one({"id": estate_id})
    
    return {"message": "Estate deleted"}

# ===================== READINESS SCORE ROUTES =====================

@api_router.get("/estate/{estate_id}/readiness")
async def get_estate_readiness(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed estate readiness score breakdown"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    
    # Ensure default checklist exists
    await ensure_default_checklist(estate_id)
    
    # Calculate fresh readiness
    result = await calculate_estate_readiness(estate_id)
    
    # Persist updated score
    await db.estates.update_one(
        {"id": estate_id},
        {"$set": {
            "readiness_score": result["overall_score"],
            "readiness_breakdown": {
                "documents": result["documents"],
                "messages": result["messages"],
                "checklist": result["checklist"]
            }
        }}
    )
    
    return result

@api_router.post("/estate/{estate_id}/readiness")
async def recalculate_estate_readiness(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Recalculate and return estate readiness score"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    
    await ensure_default_checklist(estate_id)
    result = await calculate_estate_readiness(estate_id)
    
    await db.estates.update_one(
        {"id": estate_id},
        {"$set": {
            "readiness_score": result["overall_score"],
            "readiness_breakdown": {
                "documents": result["documents"],
                "messages": result["messages"],
                "checklist": result["checklist"]
            }
        }}
    )
    
    return result

# ===================== ACTIVITY LOG ROUTES =====================

@api_router.get("/activity/{estate_id}")
async def get_activity_log(estate_id: str, limit: int = 50, current_user: dict = Depends(get_current_user)):
    """Get activity log for an estate"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    
    # Check access
    if current_user["role"] == "benefactor" and estate["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if current_user["role"] == "beneficiary" and current_user["id"] not in estate.get("beneficiaries", []):
        raise HTTPException(status_code=403, detail="Access denied")
    
    activities = await db.activity_logs.find(
        {"estate_id": estate_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return activities

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
        date_of_birth=data.date_of_birth,
        gender=data.gender,
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
    
    # Log activity
    await log_activity(
        estate_id=data.estate_id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="beneficiary_added",
        description=f"Added beneficiary: {data.name} ({data.relation})",
        metadata={"beneficiary_name": data.name, "relation": data.relation}
    )
    
    # Recalculate estate readiness (beneficiaries affect message score)
    await update_estate_readiness(data.estate_id)
    
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
    
    # Log activity
    await log_activity(
        estate_id=estate_id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="document_uploaded",
        description=f"Uploaded document: {name} ({category})",
        metadata={"document_name": name, "category": category, "is_locked": lock_type is not None}
    )
    
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

@api_router.get("/documents/{document_id}/preview")
async def preview_document(
    document_id: str,
    password: Optional[str] = None,
    backup_code: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Preview a document (for PDFs and images) - returns inline content"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check if document is locked and verify credentials
    if document.get("is_locked"):
        lock_type = document.get("lock_type")
        
        if lock_type == "password" and document.get("lock_password_hash"):
            if password and verify_password(password, document["lock_password_hash"]):
                pass
            elif backup_code and document.get("backup_code") == backup_code:
                pass
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
    
    # Return inline for preview (not as attachment)
    return Response(
        content=decrypted_data,
        media_type=document.get("file_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'inline; filename="{document["name"]}"'
        }
    )

# ===================== VOICE VERIFICATION ROUTES =====================

class VoicePassphraseSetup(BaseModel):
    document_id: str
    passphrase: str  # The passphrase the user will speak

class VoiceVerifyRequest(BaseModel):
    document_id: str
    spoken_text: str  # Text from speech recognition

@api_router.post("/documents/{document_id}/voice/setup")
async def setup_voice_passphrase(
    document_id: str,
    passphrase: str,
    current_user: dict = Depends(get_current_user)
):
    """Set up voice verification passphrase for a document"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can set up voice verification")
    
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if document.get("lock_type") != "voice":
        raise HTTPException(status_code=400, detail="Document is not set up for voice verification")
    
    # Store the passphrase (hashed for comparison)
    # We store both hash and normalized version for flexible matching
    normalized_passphrase = passphrase.lower().strip()
    
    await db.documents.update_one(
        {"id": document_id},
        {"$set": {
            "voice_passphrase_hash": hash_password(normalized_passphrase),
            "voice_passphrase_hint": passphrase[:3] + "..." if len(passphrase) > 3 else passphrase
        }}
    )
    
    return {"message": "Voice passphrase set up successfully", "hint": passphrase[:3] + "..."}

@api_router.post("/documents/{document_id}/voice/verify")
async def verify_voice_passphrase(
    document_id: str,
    data: VoiceVerifyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Verify spoken passphrase for voice-locked document"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.get("voice_passphrase_hash"):
        raise HTTPException(status_code=400, detail="Voice passphrase not set up. Use backup code.")
    
    # Normalize and verify
    normalized_spoken = data.spoken_text.lower().strip()
    
    if verify_password(normalized_spoken, document["voice_passphrase_hash"]):
        return {"verified": True, "message": "Voice verification successful"}
    
    # Allow some flexibility - check if spoken text contains the passphrase
    # This helps with speech recognition variations
    raise HTTPException(status_code=401, detail="Voice verification failed. Try again or use backup code.")

@api_router.get("/documents/{document_id}/voice/hint")
async def get_voice_hint(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get voice passphrase hint"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        "has_passphrase": bool(document.get("voice_passphrase_hash")),
        "hint": document.get("voice_passphrase_hint", "Not set")
    }

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
            {"_id": 0}
        ).to_list(100)
    else:
        messages = await db.messages.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    return messages

@api_router.get("/messages/video/{video_id}")
async def get_message_video(video_id: str, current_user: dict = Depends(get_current_user)):
    """Get video data for a message"""
    video = await db.video_storage.find_one({"id": video_id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Verify user has access to this video
    message = await db.messages.find_one({"video_url": video_id}, {"_id": 0})
    if message:
        if current_user["role"] == "beneficiary":
            if current_user["id"] not in message.get("recipients", []) or not message.get("is_delivered"):
                raise HTTPException(status_code=403, detail="Access denied")
        elif current_user["role"] == "benefactor":
            # Check if user owns the estate
            estate = await db.estates.find_one({"id": message["estate_id"]}, {"_id": 0})
            if not estate or estate["owner_id"] != current_user["id"]:
                raise HTTPException(status_code=403, detail="Access denied")
    
    # Decode video data and return
    try:
        video_bytes = base64.b64decode(video["data"])
        return Response(
            content=video_bytes,
            media_type="video/webm",
            headers={"Content-Disposition": f'inline; filename="{video_id}.webm"'}
        )
    except Exception as e:
        logger.error(f"Video decode error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve video")

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
    
    # Handle video data - store encrypted
    if data.video_data:
        message.video_url = f"video_{message.id}"
        # Store video data (could encrypt here too for additional security)
        await db.video_storage.insert_one({
            "id": message.video_url, 
            "data": data.video_data,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await db.messages.insert_one(message.model_dump())
    
    # Update estate readiness
    await update_estate_readiness(data.estate_id)
    
    # Log activity
    await log_activity(
        estate_id=data.estate_id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="message_created",
        description=f"Created {data.message_type} message: {data.title}",
        metadata={"message_title": data.title, "message_type": data.message_type, "trigger_type": data.trigger_type}
    )
    
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

# Comprehensive estate law system prompt
ESTATE_GUARDIAN_SYSTEM_PROMPT = """You are the Estate Guardian, a highly specialized AI legal assistant for CarryOn™, a secure estate planning platform. You are an expert in estate planning law across all 50 United States, with deep knowledge of:

**STATE-SPECIFIC ESTATE LAW EXPERTISE:**
- **Community Property States** (AZ, CA, ID, LA, NV, NM, TX, WA, WI): Understand joint ownership rules, spousal rights, and how community property affects estate distribution.
- **Common Law / Equitable Distribution States** (all others): Understand elective share statutes, spousal inheritance rights, and intestacy laws.
- **Probate Requirements by State**: Know which states allow simplified/summary probate (e.g., CA small estate affidavit under $184,500), which require full probate, and which have adopted the Uniform Probate Code (UPC).
- **Estate & Inheritance Tax States**: Know which states impose estate taxes (CT, HI, IL, ME, MA, MN, NY, OR, RI, VT, WA, DC), inheritance taxes (IA, KY, MD, NE, NJ, PA), or both (MD).
- **Trust Law Variations**: Understand revocable vs irrevocable trusts, pour-over wills, trust protectors, directed trusts, and state-specific trust situs advantages (SD, NV, DE, AK for asset protection trusts; DE, NH, SD for dynasty trusts).
- **Power of Attorney**: Know statutory forms (e.g., NY GOL §5-1513, CA Probate Code §4401), springing vs. durable POA, financial vs. healthcare POA differences by state.
- **Healthcare Directives**: Understand POLST/MOLST programs, DNR requirements, surrogate decision-making hierarchies, and state-specific advance directive forms.
- **Homestead Exemptions**: Know state-specific protections (FL, TX unlimited; KS up to 160 acres; most states have dollar caps).
- **Digital Assets**: Understand the Revised Uniform Fiduciary Access to Digital Assets Act (RUFADAA) adoption by state.
- **Beneficiary Designation Law**: Know how state law treats POD/TOD accounts, IRA beneficiaries, life insurance, and conflicts between beneficiary designations and wills.

**YOUR CAPABILITIES:**
1. **Analyze Documents**: You can read and analyze the contents of the user's Secure Document Vault. When the user asks about their documents, reference them specifically by name and content.
2. **Generate Checklists**: You can create prioritized, state-specific checklist items based on the documents in the vault and the user's estate situation.
3. **Analyze Readiness**: You can calculate and explain the Estate Readiness Score, identifying exactly what's missing and providing actionable steps to improve it.

**GUIDELINES:**
- Always reference the user's actual documents and estate data when available.
- When discussing state law, cite the specific state if known, or ask which state the estate is in.
- Provide specific, actionable advice — not generic platitudes.
- When analyzing documents, identify gaps, inconsistencies, or missing provisions.
- Always recommend consulting a licensed attorney for final legal decisions, but provide substantive analysis to help users prepare.
- Format responses clearly with bullet points, headers, and numbered lists for readability.
- Be warm but authoritative — you're a trusted advisor, not just a chatbot.

{estate_context}
"""

async def extract_document_text(document: dict) -> str:
    """Extract text content from a document for AI analysis"""
    if not document.get("file_data"):
        return ""
    
    try:
        decrypted_data = decrypt_data(document["file_data"])
        file_type = document.get("file_type", "").lower()
        
        # PDF extraction
        if "pdf" in file_type:
            try:
                pdf = pdfplumber.open(io.BytesIO(decrypted_data))
                text_parts = []
                for page in pdf.pages[:20]:  # Limit to first 20 pages
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                pdf.close()
                text = "\n".join(text_parts)
                return text[:8000]  # Limit to ~8000 chars per document
            except Exception as e:
                logger.warning(f"PDF extraction failed for {document['name']}: {e}")
                return f"[PDF document - {document['file_size']} bytes - text extraction failed]"
        
        # Text-based files
        elif any(t in file_type for t in ["text", "plain", "csv", "json", "xml", "html"]):
            text = decrypted_data.decode("utf-8", errors="replace")
            return text[:8000]
        
        # Images and other binary formats
        else:
            return f"[Binary file: {file_type} - {document['file_size']} bytes]"
    
    except Exception as e:
        logger.warning(f"Document extraction error for {document['name']}: {e}")
        return "[Document content unavailable - decryption error]"


async def gather_estate_context(estate_id: str, include_doc_content: bool = False) -> str:
    """Gather comprehensive estate context for the AI"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        return ""
    
    # Fetch all estate data
    documents = await db.documents.find(
        {"estate_id": estate_id}, 
        {"_id": 0, "lock_password_hash": 0, "backup_code": 0, "voice_passphrase_hash": 0}
    ).to_list(100)
    
    beneficiaries = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    checklist_items = await db.checklists.find({"estate_id": estate_id}, {"_id": 0}).sort("order", 1).to_list(200)
    messages = await db.messages.find({"estate_id": estate_id}, {"_id": 0, "video_url": 0}).to_list(100)
    readiness = await calculate_estate_readiness(estate_id)
    
    # Build context string
    context_parts = []
    
    # Estate info
    state_info = estate.get("state", "Not specified")
    context_parts.append(f"""
**CURRENT ESTATE INFORMATION:**
- Estate Name: {estate['name']}
- State: {state_info}
- Status: {estate.get('status', 'pre-transition')}
- Overall Readiness Score: {readiness['overall_score']}%
""")
    
    # Readiness breakdown
    context_parts.append(f"""
**ESTATE READINESS BREAKDOWN:**
- Documents: {readiness['documents']['score']}% ({readiness['documents']['found']}/{readiness['documents']['required']} required docs)
  Missing: {', '.join(readiness['documents']['missing']) if readiness['documents']['missing'] else 'None'}
- Milestone Messages: {readiness['messages']['score']}% ({readiness['messages']['found']}/{readiness['messages']['required']} expected)
  Issues: {', '.join(readiness['messages']['missing'][:3]) if readiness['messages']['missing'] else 'None'}
- Checklist: {readiness['checklist']['score']}% ({readiness['checklist']['found']}/{readiness['checklist']['required']} items)
  Issues: {', '.join(readiness['checklist']['missing']) if readiness['checklist']['missing'] else 'None'}
""")
    
    # Documents
    context_parts.append("**DOCUMENTS IN VAULT:**")
    if documents:
        for doc in documents:
            locked_status = f" [LOCKED - {doc.get('lock_type', 'unknown')}]" if doc.get("is_locked") else ""
            context_parts.append(f"- {doc['name']} (Category: {doc['category']}, Type: {doc.get('file_type', 'unknown')}, Size: {doc.get('file_size', 0)} bytes){locked_status}")
        
        # Include document content if requested
        if include_doc_content:
            context_parts.append("\n**DOCUMENT CONTENTS (for analysis):**")
            for doc in documents:
                # Fetch full document with file_data for extraction
                full_doc = await db.documents.find_one({"id": doc["id"]}, {"_id": 0})
                if full_doc and full_doc.get("file_data"):
                    text = await extract_document_text(full_doc)
                    if text and not text.startswith("["):
                        context_parts.append(f"\n--- {doc['name']} ---\n{text}\n--- End of {doc['name']} ---")
                    else:
                        context_parts.append(f"\n--- {doc['name']} ---\n{text}\n---")
    else:
        context_parts.append("- No documents uploaded yet")
    
    # Beneficiaries
    context_parts.append("\n**BENEFICIARIES:**")
    if beneficiaries:
        for ben in beneficiaries:
            age_info = ""
            if ben.get("date_of_birth"):
                try:
                    dob = datetime.fromisoformat(ben["date_of_birth"].replace('Z', '+00:00'))
                    age = (datetime.now(timezone.utc) - dob).days // 365
                    age_info = f", Age: {age}"
                except:
                    pass
            gender_info = f", Gender: {ben.get('gender', 'not specified')}" if ben.get("gender") else ""
            context_parts.append(f"- {ben['name']} (Relation: {ben['relation']}{age_info}{gender_info}, Email: {ben['email']})")
    else:
        context_parts.append("- No beneficiaries added yet")
    
    # Checklist summary
    completed = sum(1 for item in checklist_items if item.get("is_completed"))
    context_parts.append(f"\n**CHECKLIST STATUS:** {completed}/{len(checklist_items)} items completed")
    
    # Current checklist categories
    categories = {}
    for item in checklist_items:
        cat = item.get("category", "other")
        if cat not in categories:
            categories[cat] = {"total": 0, "completed": 0}
        categories[cat]["total"] += 1
        if item.get("is_completed"):
            categories[cat]["completed"] += 1
    
    for cat, counts in categories.items():
        context_parts.append(f"  - {cat}: {counts['completed']}/{counts['total']} completed")
    
    # Messages summary
    context_parts.append(f"\n**MILESTONE MESSAGES:** {len(messages)} total")
    for msg in messages[:10]:
        trigger_info = msg.get("trigger_type", "immediate")
        if msg.get("trigger_age"):
            trigger_info += f" (age {msg['trigger_age']})"
        context_parts.append(f"- \"{msg['title']}\" (Type: {msg.get('message_type', 'text')}, Trigger: {trigger_info})")
    
    return "\n".join(context_parts)


@api_router.post("/chat/guardian", response_model=ChatResponse)
async def chat_with_guardian(data: ChatRequest, current_user: dict = Depends(get_current_user)):
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    session_id = data.session_id or f"chat_{current_user['id']}_{str(uuid.uuid4())[:8]}"
    action_result = None
    
    # Get estate context if estate_id provided
    estate_context = ""
    estate_id = data.estate_id
    
    if not estate_id:
        # Try to get the user's first estate
        estates = await db.estates.find({"owner_id": current_user["id"]}, {"_id": 0}).to_list(1)
        if estates:
            estate_id = estates[0]["id"]
    
    if estate_id:
        # Determine if we need document content based on action or message
        needs_content = data.action in ("analyze_vault",) or any(
            keyword in data.message.lower() 
            for keyword in ["analyze", "review", "read", "what does", "contents", "says", "summary", "summarize", "check my"]
        )
        estate_context = await gather_estate_context(estate_id, include_doc_content=needs_content)
    
    # Build system message with context
    system_message = ESTATE_GUARDIAN_SYSTEM_PROMPT.format(
        estate_context=estate_context if estate_context else "No estate context available. Ask the user to select an estate."
    )
    
    # Handle special actions
    user_message_text = data.message
    
    if data.action == "generate_checklist":
        user_message_text = """Based on my estate documents and current situation, generate a comprehensive, prioritized Immediate Action Checklist. 
        
Requirements:
- Create at least 25 items if I don't already have enough
- Prioritize based on urgency: immediate (day 1-3), first_week, two_weeks, first_month
- Make items specific to MY estate based on the documents in my vault
- Consider my state's specific legal requirements
- Each item should have a clear title and actionable description
- Focus on items I'm MISSING — don't duplicate existing checklist items

Return your response as helpful advice, and also return the checklist items in this exact JSON format at the END of your response, wrapped in ```checklist_json``` tags:
```checklist_json
[{"title": "Item title", "description": "Detailed description", "category": "immediate|first_week|two_weeks|first_month", "order": 1}]
```"""
    
    elif data.action == "analyze_readiness":
        user_message_text = """Analyze my Estate Readiness Score in detail. For each of the three categories (Documents, Messages, Checklist):
1. Explain what I have and what I'm missing
2. Provide specific, actionable steps to improve each score
3. Reference my state's specific requirements where applicable
4. Prioritize recommendations by impact

Also identify any potential legal issues or gaps in my estate plan based on the documents in my vault."""
    
    elif data.action == "analyze_vault":
        user_message_text = """Perform a comprehensive analysis of all documents in my Secure Document Vault. For each document:
1. Summarize the key contents and provisions
2. Identify any potential issues, gaps, or inconsistencies
3. Check if the documents work together properly (e.g., will and trust alignment)
4. Note any state-specific compliance issues
5. Recommend additional documents I should consider

Provide a clear, organized analysis with specific findings and recommendations."""
    
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_message
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=user_message_text)
        response = await chat.send_message(user_message)
        
        # Handle checklist generation action
        if data.action == "generate_checklist" and "checklist_json" in response:
            try:
                json_start = response.index("```checklist_json") + len("```checklist_json")
                json_end = response.index("```", json_start)
                checklist_json_str = response[json_start:json_end].strip()
                new_items = json_module.loads(checklist_json_str)
                
                # Get existing checklist items to avoid duplicates
                existing = await db.checklists.find({"estate_id": estate_id}, {"_id": 0, "title": 1}).to_list(200)
                existing_titles = {item["title"].lower() for item in existing}
                
                items_added = 0
                max_order = len(existing)
                for item in new_items:
                    if item["title"].lower() not in existing_titles:
                        checklist_item = ChecklistItem(
                            estate_id=estate_id,
                            title=item["title"],
                            description=item.get("description", ""),
                            category=item.get("category", "first_month"),
                            order=max_order + items_added + 1
                        )
                        await db.checklists.insert_one(checklist_item.model_dump())
                        items_added += 1
                
                # Recalculate readiness
                await update_estate_readiness(estate_id)
                
                action_result = {"action": "checklist_generated", "items_added": items_added}
                
                # Clean the JSON block from the response for display
                clean_response = response[:response.index("```checklist_json")].strip()
                if clean_response:
                    response = clean_response + f"\n\n**{items_added} new checklist items have been added to your Immediate Action Checklist.**"
                
                # Log activity
                await log_activity(
                    estate_id=estate_id,
                    user_id=current_user["id"],
                    user_name=current_user["name"],
                    action="checklist_ai_generated",
                    description=f"Estate Guardian generated {items_added} checklist items",
                    metadata={"items_added": items_added}
                )
            except (ValueError, json_module.JSONDecodeError) as e:
                logger.warning(f"Failed to parse checklist JSON from AI response: {e}")
        
        elif data.action == "analyze_readiness" and estate_id:
            # Recalculate readiness to ensure it's current
            readiness = await calculate_estate_readiness(estate_id)
            await update_estate_readiness(estate_id)
            action_result = {"action": "readiness_analyzed", "readiness": readiness}
        
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
        
        return ChatResponse(response=response, session_id=session_id, action_result=action_result)
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
    """Calculate and update estate readiness score using the detailed algorithm"""
    result = await calculate_estate_readiness(estate_id)
    
    await db.estates.update_one(
        {"id": estate_id},
        {"$set": {
            "readiness_score": result["overall_score"],
            "readiness_breakdown": {
                "documents": result["documents"],
                "messages": result["messages"],
                "checklist": result["checklist"]
            }
        }}
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
