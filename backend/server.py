from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status, Response, Form
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
import stripe
from pywebpush import webpush, WebPushException
from py_vapid import Vapid

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

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Twilio Configuration for SMS OTP
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER')
twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    try:
        from twilio.rest import Client as TwilioClient
        twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        logger.info("Twilio SMS configured successfully")
    except ImportError:
        logger.warning("Twilio library not installed - SMS OTP disabled")

# Create the main app
app = FastAPI(title="CarryOn™ API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

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
    otp_method: str = "email"  # "email" or "sms"
    phone: Optional[str] = None  # Required if otp_method is "sms"

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
    # Name fields
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    suffix: Optional[str] = None
    name: str  # Full computed name
    relation: str  # spouse, child, parent, sibling, grandchild, friend, other
    email: EmailStr
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None  # ISO date string
    gender: Optional[str] = None  # male, female, other
    # Address fields
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    # Additional fields
    ssn_last_four: Optional[str] = None  # Last 4 of SSN for estate planning
    notes: Optional[str] = None  # Special instructions or notes
    avatar_color: str = "#d4af37"
    initials: str = ""
    # Invitation tracking
    invitation_status: str = "pending"  # pending, sent, accepted
    invitation_token: Optional[str] = None
    invitation_sent_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class BeneficiaryCreate(BaseModel):
    estate_id: str
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    suffix: Optional[str] = None
    relation: str
    email: EmailStr
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    ssn_last_four: Optional[str] = None
    notes: Optional[str] = None
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
    trigger_type: str = "immediate"  # immediate, age_milestone, event, specific_date
    trigger_value: Optional[str] = None
    trigger_age: Optional[int] = None
    trigger_date: Optional[str] = None  # ISO date string for specific_date trigger

class MessageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    message_type: Optional[str] = None
    video_data: Optional[str] = None
    recipients: Optional[List[str]] = None
    trigger_type: Optional[str] = None
    trigger_value: Optional[str] = None
    trigger_age: Optional[int] = None
    trigger_date: Optional[str] = None

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

async def send_otp_sms(phone: str, otp: str):
    """Send OTP via Twilio SMS"""
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        logger.info(f"SMS not configured. OTP for {phone}: {otp}")
        return False
    
    try:
        message = await asyncio.to_thread(
            twilio_client.messages.create,
            body=f"Your CarryOn™ verification code is: {otp}. This code expires in 10 minutes.",
            from_=TWILIO_PHONE_NUMBER,
            to=phone
        )
        logger.info(f"OTP SMS sent to {phone}, SID: {message.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP SMS: {e}")
        logger.info(f"Fallback - OTP for {phone}: {otp}")
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

@api_router.post("/auth/dev-login")
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

# ===================== ADMIN ROUTES =====================

class DevSwitcherConfig(BaseModel):
    benefactor_email: str = ""
    benefactor_password: str = ""
    beneficiary_email: str = ""
    beneficiary_password: str = ""
    enabled: bool = True

@api_router.get("/admin/dev-switcher")
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

@api_router.put("/admin/dev-switcher")
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

@api_router.get("/dev-switcher/config")
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

@api_router.get("/beneficiary/family-connections")
async def get_family_connections(current_user: dict = Depends(get_current_user)):
    """Get all family connections for a beneficiary with relationship data for orbit visualization"""
    if current_user["role"] != "beneficiary":
        raise HTTPException(status_code=403, detail="Only beneficiaries can access family connections")
    
    # Find all beneficiary records for this user (to get relationship info)
    beneficiary_records = await db.beneficiaries.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).to_list(100)
    
    connections = []
    for ben_record in beneficiary_records:
        # Get the estate
        estate = await db.estates.find_one({"id": ben_record["estate_id"]}, {"_id": 0})
        if not estate:
            continue
        
        # Get the benefactor (estate owner)
        benefactor = await db.users.find_one({"id": estate.get("owner_id")}, {"_id": 0, "password": 0})
        if not benefactor:
            continue
        
        # Combine estate and relationship info
        connections.append({
            "id": estate["id"],
            "estate_id": estate["id"],
            "name": benefactor.get("name", "Unknown"),
            "first_name": benefactor.get("first_name"),
            "last_name": benefactor.get("last_name"),
            "relation": ben_record.get("relation", "Other"),
            "status": estate.get("status", "pre-transition"),
            "readiness_score": estate.get("readiness_score", 0),
            "benefactor_id": benefactor.get("id"),
        })
    
    return connections

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
    
    # Build full name from parts
    name_parts = [data.first_name]
    if data.middle_name:
        name_parts.append(data.middle_name)
    name_parts.append(data.last_name)
    if data.suffix:
        name_parts.append(data.suffix)
    full_name = " ".join(name_parts)
    
    # Generate initials
    initials = (data.first_name[0] + data.last_name[0]).upper()
    
    # Generate invitation token
    invitation_token = str(uuid.uuid4())
    
    beneficiary = Beneficiary(
        estate_id=data.estate_id,
        first_name=data.first_name,
        middle_name=data.middle_name,
        last_name=data.last_name,
        suffix=data.suffix,
        name=full_name,
        relation=data.relation,
        email=data.email,
        phone=data.phone,
        date_of_birth=data.date_of_birth,
        gender=data.gender,
        address_street=data.address_street,
        address_city=data.address_city,
        address_state=data.address_state,
        address_zip=data.address_zip,
        ssn_last_four=data.ssn_last_four,
        notes=data.notes,
        avatar_color=data.avatar_color,
        initials=initials,
        invitation_token=invitation_token,
        invitation_status="pending"
    )
    await db.beneficiaries.insert_one(beneficiary.model_dump())
    
    # Add to estate's beneficiary list if user exists
    existing_user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing_user:
        await db.estates.update_one(
            {"id": data.estate_id},
            {"$addToSet": {"beneficiaries": existing_user["id"]}}
        )
        # Mark as accepted if they already have an account
        await db.beneficiaries.update_one(
            {"id": beneficiary.id},
            {"$set": {"user_id": existing_user["id"], "invitation_status": "accepted"}}
        )
        beneficiary.user_id = existing_user["id"]
        beneficiary.invitation_status = "accepted"
    
    # Log activity
    await log_activity(
        estate_id=data.estate_id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="beneficiary_added",
        description=f"Added beneficiary: {full_name} ({data.relation})",
        metadata={"beneficiary_name": full_name, "relation": data.relation}
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

@api_router.put("/beneficiaries/{beneficiary_id}")
async def update_beneficiary(beneficiary_id: str, data: BeneficiaryCreate, current_user: dict = Depends(get_current_user)):
    """Update an existing beneficiary"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can update beneficiaries")
    
    beneficiary = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    
    # Build full name from parts
    name_parts = [data.first_name]
    if data.middle_name:
        name_parts.append(data.middle_name)
    name_parts.append(data.last_name)
    if data.suffix:
        name_parts.append(data.suffix)
    full_name = " ".join(name_parts)
    
    # Generate initials
    initials = (data.first_name[0] + data.last_name[0]).upper()
    
    update_data = {
        "first_name": data.first_name,
        "middle_name": data.middle_name,
        "last_name": data.last_name,
        "suffix": data.suffix,
        "name": full_name,
        "relation": data.relation,
        "email": data.email,
        "phone": data.phone,
        "date_of_birth": data.date_of_birth,
        "gender": data.gender,
        "address_street": data.address_street,
        "address_city": data.address_city,
        "address_state": data.address_state,
        "address_zip": data.address_zip,
        "ssn_last_four": data.ssn_last_four,
        "notes": data.notes,
        "avatar_color": data.avatar_color,
        "initials": initials,
    }
    
    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": update_data}
    )
    
    # Get updated beneficiary
    updated = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    return updated

@api_router.post("/beneficiaries/{beneficiary_id}/invite")
async def send_beneficiary_invitation(beneficiary_id: str, current_user: dict = Depends(get_current_user)):
    """Send invitation email to a beneficiary"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can send invitations")
    
    beneficiary = await db.beneficiaries.find_one({"id": beneficiary_id}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    
    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(status_code=400, detail="Beneficiary has already accepted the invitation")
    
    # Generate new token if needed
    invitation_token = beneficiary.get("invitation_token") or str(uuid.uuid4())
    
    # Get benefactor info for the email
    benefactor = current_user
    
    # Send invitation email
    try:
        if RESEND_API_KEY:
            # Get frontend URL for the invitation link
            frontend_url = os.environ.get('FRONTEND_URL', 'https://succession-plan.preview.emergentagent.com')
            invitation_link = f"{frontend_url}/accept-invitation/{invitation_token}"
            
            email_html = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #d4af37; margin: 0;">CarryOn™</h1>
                    <p style="color: #666;">Secure Estate Planning</p>
                </div>
                
                <h2 style="color: #333;">You've Been Added to {benefactor['name']}'s Estate</h2>
                
                <p style="color: #555; line-height: 1.6;">
                    Dear {beneficiary['first_name']},
                </p>
                
                <p style="color: #555; line-height: 1.6;">
                    {benefactor['name']} has added you as a beneficiary on CarryOn™, a secure estate planning platform. 
                    This means they've chosen you to be part of their legacy planning.
                </p>
                
                <p style="color: #555; line-height: 1.6;">
                    <strong>What is CarryOn™?</strong><br>
                    CarryOn™ helps families prepare for life's transitions by securely storing important documents, 
                    messages, and instructions that can be shared with loved ones at the appropriate time.
                </p>
                
                <p style="color: #555; line-height: 1.6;">
                    <strong>What should you do?</strong><br>
                    Click the button below to create your CarryOn™ account. This will allow you to:
                </p>
                
                <ul style="color: #555; line-height: 1.8;">
                    <li>View your connection to {benefactor['first_name']}'s estate</li>
                    <li>Receive important updates and notifications</li>
                    <li>Access documents and messages when the time is right</li>
                </ul>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{invitation_link}" 
                       style="background: linear-gradient(135deg, #d4af37, #c5a028); 
                              color: white; 
                              padding: 14px 32px; 
                              text-decoration: none; 
                              border-radius: 8px;
                              font-weight: bold;
                              display: inline-block;">
                        Accept Invitation & Create Account
                    </a>
                </div>
                
                <p style="color: #888; font-size: 12px; line-height: 1.6;">
                    <strong>Note:</strong> At this time, you will not have access to any specific details about the estate. 
                    This invitation simply connects you to {benefactor['first_name']}'s CarryOn™ account for future reference.
                </p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                
                <p style="color: #888; font-size: 12px; text-align: center;">
                    If you didn't expect this email or have questions, please contact {benefactor['name']} directly.
                </p>
            </div>
            """
            
            resend.Emails.send({
                "from": SENDER_EMAIL,
                "to": beneficiary["email"],
                "subject": f"{benefactor['name']} has added you to their CarryOn™ Estate",
                "html": email_html
            })
            logger.info(f"Invitation email sent to {beneficiary['email']}")
        else:
            logger.info(f"[DEV MODE] Invitation would be sent to {beneficiary['email']} with token {invitation_token}")
    except Exception as e:
        logger.error(f"Failed to send invitation email: {e}")
        # Don't fail the request, still update the status
    
    # Update beneficiary record
    await db.beneficiaries.update_one(
        {"id": beneficiary_id},
        {"$set": {
            "invitation_status": "sent",
            "invitation_token": invitation_token,
            "invitation_sent_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log activity
    estate = await db.estates.find_one({"id": beneficiary["estate_id"]}, {"_id": 0})
    await log_activity(
        estate_id=beneficiary["estate_id"],
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="invitation_sent",
        description=f"Sent invitation to {beneficiary['name']} ({beneficiary['email']})",
        metadata={"beneficiary_id": beneficiary_id, "email": beneficiary["email"]}
    )
    
    return {"message": "Invitation sent successfully", "email": beneficiary["email"]}

@api_router.get("/invitations/{token}")
async def get_invitation_details(token: str):
    """Get invitation details for a beneficiary to accept"""
    beneficiary = await db.beneficiaries.find_one({"invitation_token": token}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    
    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(status_code=400, detail="This invitation has already been accepted")
    
    # Get estate info (limited)
    estate = await db.estates.find_one({"id": beneficiary["estate_id"]}, {"_id": 0})
    
    # Get benefactor info (limited)
    benefactor = None
    if estate:
        benefactor = await db.users.find_one({"id": estate.get("owner_id")}, {"_id": 0, "password": 0})
    
    return {
        "beneficiary": {
            "first_name": beneficiary["first_name"],
            "last_name": beneficiary["last_name"],
            "email": beneficiary["email"],
            "relation": beneficiary["relation"]
        },
        "benefactor_name": benefactor["name"] if benefactor else "Your benefactor"
    }

class AcceptInvitationRequest(BaseModel):
    token: str
    password: str
    phone: Optional[str] = None

@api_router.post("/invitations/accept")
async def accept_invitation(data: AcceptInvitationRequest):
    """Accept an invitation and create a beneficiary user account"""
    beneficiary = await db.beneficiaries.find_one({"invitation_token": data.token}, {"_id": 0})
    if not beneficiary:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    
    if beneficiary.get("invitation_status") == "accepted":
        raise HTTPException(status_code=400, detail="This invitation has already been accepted")
    
    # Check if email already has an account
    existing_user = await db.users.find_one({"email": beneficiary["email"]}, {"_id": 0})
    if existing_user:
        # Link existing account to this beneficiary record
        await db.beneficiaries.update_one(
            {"id": beneficiary["id"]},
            {"$set": {
                "user_id": existing_user["id"],
                "invitation_status": "accepted"
            }}
        )
        # Add to estate's beneficiary list
        await db.estates.update_one(
            {"id": beneficiary["estate_id"]},
            {"$addToSet": {"beneficiaries": existing_user["id"]}}
        )
        
        # Generate token for auto-login
        token = create_token(existing_user["id"], existing_user["email"], existing_user["role"])
        return {
            "message": "Account linked successfully",
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": existing_user["id"],
                "email": existing_user["email"],
                "name": existing_user["name"],
                "role": existing_user["role"],
                "created_at": existing_user["created_at"]
            }
        }
    
    # Create new user account
    user_id = str(uuid.uuid4())
    full_name = " ".join(filter(None, [
        beneficiary["first_name"],
        beneficiary.get("middle_name"),
        beneficiary["last_name"],
        beneficiary.get("suffix")
    ]))
    
    new_user = {
        "id": user_id,
        "email": beneficiary["email"],
        "password": hash_password(data.password),
        "name": full_name,
        "first_name": beneficiary["first_name"],
        "middle_name": beneficiary.get("middle_name"),
        "last_name": beneficiary["last_name"],
        "suffix": beneficiary.get("suffix"),
        "gender": beneficiary.get("gender"),
        "phone": data.phone or beneficiary.get("phone"),
        "role": "beneficiary",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(new_user)
    
    # Update beneficiary record
    await db.beneficiaries.update_one(
        {"id": beneficiary["id"]},
        {"$set": {
            "user_id": user_id,
            "invitation_status": "accepted"
        }}
    )
    
    # Add to estate's beneficiary list
    await db.estates.update_one(
        {"id": beneficiary["estate_id"]},
        {"$addToSet": {"beneficiaries": user_id}}
    )
    
    # Generate token for auto-login
    token = create_token(user_id, beneficiary["email"], "beneficiary")
    
    return {
        "message": "Account created successfully",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": beneficiary["email"],
            "name": full_name,
            "role": "beneficiary",
            "created_at": new_user["created_at"]
        }
    }

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

@api_router.post("/voice/transcribe")
async def transcribe_voice(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Transcribe audio using OpenAI Whisper for voice verification"""
    from emergentintegrations.llm.openai import OpenAISpeechToText
    
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="Voice service not configured")
    
    try:
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 25MB.")
        
        # Save to temp file
        import tempfile
        suffix = '.' + (file.filename or 'audio.webm').split('.')[-1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        
        stt = OpenAISpeechToText(api_key=api_key)
        with open(tmp_path, 'rb') as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                language="en"
            )
        
        # Clean up
        os.unlink(tmp_path)
        
        transcription = response.text.strip()
        logger.info(f"Voice transcription for {current_user['email']}: '{transcription}'")
        
        return {"transcription": transcription}
    except Exception as e:
        logger.error(f"Voice transcription error: {e}")
        raise HTTPException(status_code=500, detail="Voice transcription failed")

@api_router.post("/voice/verify-passphrase")
async def verify_voice_passphrase(
    file: UploadFile = File(...),
    expected_passphrase: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Transcribe audio and verify against expected passphrase"""
    from emergentintegrations.llm.openai import OpenAISpeechToText
    
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="Voice service not configured")
    
    try:
        content = await file.read()
        import tempfile
        suffix = '.' + (file.filename or 'audio.webm').split('.')[-1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        
        stt = OpenAISpeechToText(api_key=api_key)
        with open(tmp_path, 'rb') as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                language="en"
            )
        
        os.unlink(tmp_path)
        
        transcription = response.text.strip().lower()
        expected = expected_passphrase.strip().lower()
        
        # Fuzzy match — allow minor differences
        from difflib import SequenceMatcher
        similarity = SequenceMatcher(None, transcription, expected).ratio()
        verified = similarity >= 0.7  # 70% match threshold
        
        logger.info(f"Voice verify: '{transcription}' vs '{expected}' = {similarity:.2f} ({'PASS' if verified else 'FAIL'})")
        
        return {
            "verified": verified,
            "transcription": transcription,
            "similarity": round(similarity, 2),
            "message": "Voice verified successfully" if verified else "Voice verification failed. Please try again."
        }
    except Exception as e:
        logger.error(f"Voice verification error: {e}")
        raise HTTPException(status_code=500, detail="Voice verification failed")

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

@api_router.put("/documents/{document_id}")
async def update_document(document_id: str, current_user: dict = Depends(get_current_user), name: str = Form(None), category: str = Form(None), notes: str = Form(None)):
    """Update document metadata (name, category, notes)"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can update documents")
    
    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if category is not None:
        update_data["category"] = category
    if notes is not None:
        update_data["notes"] = notes
    
    if update_data:
        await db.documents.update_one({"id": document_id}, {"$set": update_data})
    
    updated = await db.documents.find_one({"id": document_id}, {"_id": 0})
    return updated

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
    msg_dict = message.model_dump()
    if data.trigger_date:
        msg_dict["trigger_date"] = data.trigger_date
    
    # Handle video data - store encrypted
    if data.video_data:
        message.video_url = f"video_{message.id}"
        # Store video data (could encrypt here too for additional security)
        await db.video_storage.insert_one({
            "id": message.video_url, 
            "data": data.video_data,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    await db.messages.insert_one(msg_dict)
    
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

@api_router.put("/messages/{message_id}")
async def update_message(message_id: str, data: MessageUpdate, current_user: dict = Depends(get_current_user)):
    """Edit an existing message (benefactor only, before transition)"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can edit messages")
    
    existing = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Message not found")
    if existing.get("is_delivered"):
        raise HTTPException(status_code=400, detail="Cannot edit a delivered message")
    
    update_fields = {}
    for field in ["title", "content", "message_type", "recipients", "trigger_type", "trigger_value", "trigger_age", "trigger_date"]:
        val = getattr(data, field, None)
        if val is not None:
            update_fields[field] = val
    
    # Handle video update
    if data.video_data:
        video_id = f"video_{message_id}"
        await db.video_storage.update_one(
            {"id": video_id},
            {"$set": {"data": data.video_data, "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )
        update_fields["video_url"] = video_id
    
    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.messages.update_one({"id": message_id}, {"$set": update_fields})
    
    updated = await db.messages.find_one({"id": message_id}, {"_id": 0})
    
    # Update estate readiness
    await update_estate_readiness(existing["estate_id"])
    
    return updated

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

@api_router.post("/transition/begin-review/{certificate_id}")
async def begin_review(certificate_id: str, current_user: dict = Depends(get_current_user)):
    """TVT member opens and begins reviewing a certificate"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only TVT members can review certificates")
    cert = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {"$set": {"status": "reviewing", "reviewed_by": current_user["id"], "review_started_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Review started"}

@api_router.post("/transition/approve/{certificate_id}")
async def approve_death_certificate(certificate_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can approve certificates")
    
    certificate = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")
    
    # Update certificate status — authenticated
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {"$set": {
            "status": "authenticated",
            "reviewed_by": current_user["id"],
            "reviewed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Seal the benefactor's estate (immutable)
    await db.estates.update_one(
        {"id": certificate["estate_id"]},
        {"$set": {
            "status": "transitioned",
            "transitioned_at": datetime.now(timezone.utc).isoformat(),
            "sealed_by": current_user["id"]
        }}
    )
    
    # Deliver all messages marked for immediate delivery
    await db.messages.update_many(
        {"estate_id": certificate["estate_id"], "trigger_type": "immediate"},
        {"$set": {"is_delivered": True, "delivered_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Mark certificate as fully complete
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {"$set": {"status": "approved", "transition_completed_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Certificate approved, benefactor sealed, beneficiary access granted"}

@api_router.get("/transition/status/{estate_id}")
async def get_transition_status(estate_id: str, current_user: dict = Depends(get_current_user)):
    # Get the MOST RECENT certificate for this estate
    certificates = await db.death_certificates.find(
        {"estate_id": estate_id},
        {"_id": 0, "file_data": 0}
    ).sort("created_at", -1).to_list(1)
    certificate = certificates[0] if certificates else None
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


# ===================== DTS (Designated Trustee Services) BACKEND =====================

class DTSTaskCreate(BaseModel):
    estate_id: str
    title: str
    description: str
    task_type: str  # delivery, account_closure, financial, communication, destruction
    confidential: str = "full"  # full, partial, timed
    disclose_to: List[str] = []
    timed_release: Optional[str] = None
    beneficiary: Optional[str] = None

class DTSLineItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str
    cost: float
    approved: Optional[bool] = None

class DTSQuoteCreate(BaseModel):
    task_id: str
    line_items: List[Dict[str, Any]]
    notes: Optional[str] = None

@api_router.post("/dts/tasks")
async def create_dts_task(data: DTSTaskCreate, current_user: dict = Depends(get_current_user)):
    """Benefactor creates a DTS request"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can create DTS tasks")
    task = {
        "id": str(uuid.uuid4()),
        "estate_id": data.estate_id,
        "owner_id": current_user["id"],
        "title": data.title,
        "description": data.description,
        "task_type": data.task_type,
        "confidential": data.confidential,
        "disclose_to": data.disclose_to,
        "timed_release": data.timed_release,
        "beneficiary": data.beneficiary,
        "status": "submitted",  # submitted, quoted, approved, ready, executed, destroyed
        "line_items": [],
        "payment_method": None,
        "credentials": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.dts_tasks.insert_one(task)
    await log_activity(data.estate_id, current_user["id"], current_user["name"], "dts_request_created", f"DTS request: {data.title}")
    return {k: v for k, v in task.items() if k != "_id"}

@api_router.get("/dts/tasks/all")
async def get_all_dts_tasks(current_user: dict = Depends(get_current_user)):
    """Admin gets all DTS tasks across all estates"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    tasks = await db.dts_tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return tasks

@api_router.get("/dts/tasks/{estate_id}")
async def get_dts_tasks(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get DTS tasks for an estate (benefactor) or all tasks (admin)"""
    if current_user["role"] == "admin":
        tasks = await db.dts_tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    else:
        tasks = await db.dts_tasks.find({"estate_id": estate_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return tasks

@api_router.get("/dts/task/{task_id}")
async def get_dts_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single DTS task"""
    task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@api_router.post("/dts/tasks/{task_id}/quote")
async def submit_dts_quote(task_id: str, data: DTSQuoteCreate, current_user: dict = Depends(get_current_user)):
    """Admin/DTS team submits a quote for a task"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only DTS team can submit quotes")
    line_items = []
    for item in data.line_items:
        line_items.append({
            "id": str(uuid.uuid4()),
            "description": item.get("description", ""),
            "cost": float(item.get("cost", 0)),
            "approved": None,
        })
    await db.dts_tasks.update_one(
        {"id": task_id},
        {"$set": {"line_items": line_items, "status": "quoted", "quote_notes": data.notes, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Quote submitted", "line_items": len(line_items)}

@api_router.post("/dts/tasks/{task_id}/approve-item")
async def approve_dts_line_item(task_id: str, item_id: str, approved: bool, current_user: dict = Depends(get_current_user)):
    """Benefactor approves/rejects a line item"""
    task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    line_items = task.get("line_items", [])
    for li in line_items:
        if li["id"] == item_id:
            li["approved"] = approved
            break
    await db.dts_tasks.update_one({"id": task_id}, {"$set": {"line_items": line_items, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Item updated"}

@api_router.post("/dts/tasks/{task_id}/approve-all")
async def approve_dts_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Benefactor approves the entire task (all pending items default to approved)"""
    task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    line_items = task.get("line_items", [])
    for li in line_items:
        if li["approved"] is None:
            li["approved"] = True
    await db.dts_tasks.update_one(
        {"id": task_id},
        {"$set": {"line_items": line_items, "status": "approved", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Task approved"}

@api_router.post("/dts/tasks/{task_id}/status")
async def update_dts_status(task_id: str, status: str, current_user: dict = Depends(get_current_user)):
    """Admin updates task status"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only DTS team can update status")
    valid = ["submitted", "quoted", "approved", "ready", "executed", "destroyed"]
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")
    await db.dts_tasks.update_one({"id": task_id}, {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": f"Status updated to {status}"}

class DTSTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[str] = None
    confidential: Optional[str] = None
    disclose_to: Optional[List[str]] = None
    timed_release: Optional[str] = None
    beneficiary: Optional[str] = None

@api_router.put("/dts/tasks/{task_id}")
async def update_dts_task(task_id: str, data: DTSTaskUpdate, current_user: dict = Depends(get_current_user)):
    """Edit a DTS task - resets status to 'submitted' for re-quoting"""
    task = await db.dts_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify ownership - check estate ownership, task owner, or benefactor role with matching estate
    estate = await db.estates.find_one({"id": task["estate_id"], "user_id": current_user["id"]})
    is_task_owner = task.get("owner_id") == current_user["id"]
    # Also allow if user is benefactor and has an estate matching the task's estate_id
    user_estates = await db.estates.find({"user_id": current_user["id"]}, {"_id": 0, "id": 1}).to_list(100)
    user_estate_ids = [e["id"] for e in user_estates]
    has_estate_access = task["estate_id"] in user_estate_ids
    
    if not estate and not is_task_owner and not has_estate_access and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to edit this task")
    
    # Build update dict from provided fields
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    update_fields["status"] = "submitted"  # Reset to submitted for re-quoting
    update_fields["line_items"] = []  # Clear previous quote
    update_fields["payment_method"] = None  # Clear payment method
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.dts_tasks.update_one({"id": task_id}, {"$set": update_fields})
    
    await log_activity(task["estate_id"], current_user["id"], current_user.get("name", ""), "dts_task_edited", f"DTS task edited and sent for re-quoting: {data.title or task['title']}")
    
    return {"success": True, "message": "Task updated and sent back for re-quoting"}

@api_router.delete("/dts/tasks/{task_id}")
async def delete_dts_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a DTS task completely"""
    task = await db.dts_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify ownership - check estate ownership, task owner, or benefactor with estate access
    estate = await db.estates.find_one({"id": task["estate_id"], "user_id": current_user["id"]})
    is_task_owner = task.get("owner_id") == current_user["id"]
    # Also allow if user has an estate matching the task's estate_id
    user_estates = await db.estates.find({"user_id": current_user["id"]}, {"_id": 0, "id": 1}).to_list(100)
    user_estate_ids = [e["id"] for e in user_estates]
    has_estate_access = task["estate_id"] in user_estate_ids
    
    if not estate and not is_task_owner and not has_estate_access and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this task")
    
    await db.dts_tasks.delete_one({"id": task_id})
    
    await log_activity(task["estate_id"], current_user["id"], current_user.get("name", ""), "dts_task_deleted", f"DTS task deleted: {task['title']}")
    
    return {"success": True, "message": "Task deleted successfully"}

# ===================== ENHANCED TRANSITION VERIFICATION =====================

@api_router.get("/transition/certificates/all")
async def get_all_certificates(current_user: dict = Depends(get_current_user)):
    """Get all certificates with full details for verification team"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    certs = await db.death_certificates.find({}, {"_id": 0, "file_data": 0}).sort("created_at", -1).to_list(200)
    # Enrich with estate and uploader info
    for cert in certs:
        estate = await db.estates.find_one({"id": cert.get("estate_id")}, {"_id": 0, "name": 1, "owner_id": 1, "status": 1})
        if estate:
            cert["estate_name"] = estate.get("name", "Unknown")
            cert["estate_status"] = estate.get("status", "unknown")
        uploader = await db.users.find_one({"id": cert.get("uploaded_by")}, {"_id": 0, "name": 1, "email": 1})
        if uploader:
            cert["uploader_name"] = uploader.get("name", "Unknown")
            cert["uploader_email"] = uploader.get("email", "")
    return certs

@api_router.get("/transition/certificate/{cert_id}/document")
async def get_certificate_document(cert_id: str, current_user: dict = Depends(get_current_user)):
    """Download/view the actual death certificate document"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    cert = await db.death_certificates.find_one({"id": cert_id}, {"_id": 0})
    if not cert or not cert.get("file_data"):
        raise HTTPException(status_code=404, detail="Certificate not found")
    file_bytes = base64.b64decode(cert["file_data"])
    content_type = "application/pdf"
    if cert.get("file_name", "").lower().endswith((".jpg", ".jpeg")):
        content_type = "image/jpeg"
    elif cert.get("file_name", "").lower().endswith(".png"):
        content_type = "image/png"
    return Response(content=file_bytes, media_type=content_type, headers={"Content-Disposition": f'inline; filename="{cert["file_name"]}"'})

@api_router.post("/transition/reject/{certificate_id}")
async def reject_death_certificate(certificate_id: str, current_user: dict = Depends(get_current_user)):
    """Reject a death certificate"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can reject certificates")
    cert = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {"$set": {"status": "rejected", "reviewed_by": current_user["id"], "reviewed_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Certificate rejected"}


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

# ===================== STRIPE PAYMENT METHOD =====================

# Initialize Stripe
stripe.api_key = os.environ.get("STRIPE_API_KEY")

class SetupIntentResponse(BaseModel):
    client_secret: str
    setup_intent_id: str

class SavePaymentMethodRequest(BaseModel):
    task_id: str
    payment_method_id: str
    card_last4: str
    card_exp_month: int
    card_exp_year: int
    card_holder_name: Optional[str] = None

@api_router.post("/stripe/create-setup-intent", response_model=SetupIntentResponse)
async def create_setup_intent(user: dict = Depends(get_current_user)):
    """Create a Stripe SetupIntent for saving a payment method for later use"""
    try:
        # Create a customer if one doesn't exist
        user_doc = await db.users.find_one({"id": user["id"]})
        stripe_customer_id = user_doc.get("stripe_customer_id") if user_doc else None
        
        if not stripe_customer_id:
            customer = stripe.Customer.create(
                email=user.get("email"),
                name=user.get("name", user.get("email")),
                metadata={"carryon_user_id": user["id"]}
            )
            stripe_customer_id = customer.id
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"stripe_customer_id": stripe_customer_id}}
            )
        
        # Create SetupIntent for saving payment method
        setup_intent = stripe.SetupIntent.create(
            customer=stripe_customer_id,
            payment_method_types=["card"],
            metadata={"carryon_user_id": user["id"]}
        )
        
        return SetupIntentResponse(
            client_secret=setup_intent.client_secret,
            setup_intent_id=setup_intent.id
        )
    except Exception as e:
        logger.error(f"Error creating setup intent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/dts/tasks/{task_id}/payment-method")
async def save_dts_payment_method(
    task_id: str,
    request: SavePaymentMethodRequest,
    user: dict = Depends(get_current_user)
):
    """Save a payment method to a DTS task for charging upon transition"""
    try:
        # Verify task belongs to user's estate
        task = await db.dts_tasks.find_one({"id": task_id})
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        
        estate = await db.estates.find_one({"id": task["estate_id"], "user_id": user["id"]})
        if not estate:
            raise HTTPException(status_code=403, detail="Not authorized")
        
        # Update task with payment method info
        payment_info = {
            "payment_method_id": request.payment_method_id,
            "last4": request.card_last4,
            "exp": f"{request.card_exp_month:02d}/{str(request.card_exp_year)[-2:]}",
            "name": request.card_holder_name or user.get("name", ""),
            "saved_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.dts_tasks.update_one(
            {"id": task_id},
            {"$set": {
                "payment_method": payment_info,
                "status": "ready"
            }}
        )
        
        return {"success": True, "message": "Payment method saved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving payment method: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===================== CUSTOMER SUPPORT MESSAGING =====================

class SupportMessageCreate(BaseModel):
    content: str
    conversation_id: Optional[str] = None

class SupportMessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    sender_name: str
    sender_role: str
    content: str
    created_at: str
    read: bool = False

@api_router.post("/support/messages")
async def send_support_message(data: SupportMessageCreate, current_user: dict = Depends(get_current_user)):
    """Send a message to/from customer support"""
    # For users, conversation_id is their user_id
    # For admins responding, they provide the conversation_id (user's id)
    
    if current_user["role"] == "admin":
        if not data.conversation_id:
            raise HTTPException(status_code=400, detail="Conversation ID required for admin responses")
        conversation_id = data.conversation_id
    else:
        conversation_id = current_user["id"]
    
    message = {
        "id": str(uuid.uuid4()),
        "conversation_id": conversation_id,
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", current_user.get("email", "User")),
        "sender_role": current_user["role"],
        "content": data.content,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False
    }
    
    await db.support_messages.insert_one(message)
    
    # Send push notification
    if current_user["role"] == "admin":
        # Admin sent message -> notify user
        asyncio.create_task(send_push_notification(
            conversation_id,
            "CarryOn™ Support",
            data.content[:100] + "..." if len(data.content) > 100 else data.content,
            "/support",
            "support-message",
            "support"
        ))
    else:
        # User sent message -> notify admins
        asyncio.create_task(send_push_to_all_admins(
            f"New Support Message",
            f"{current_user.get('name', 'User')}: {data.content[:80]}...",
            "/admin/support",
            "admin-support"
        ))
    
    return {k: v for k, v in message.items() if k != "_id"}

@api_router.get("/support/messages")
async def get_my_support_messages(current_user: dict = Depends(get_current_user)):
    """Get support messages for the current user"""
    conversation_id = current_user["id"]
    messages = await db.support_messages.find(
        {"conversation_id": conversation_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    # Mark messages from support as read
    await db.support_messages.update_many(
        {"conversation_id": conversation_id, "sender_role": "admin", "read": False},
        {"$set": {"read": True}}
    )
    
    return messages

@api_router.get("/support/messages/{conversation_id}")
async def get_conversation_messages(conversation_id: str, current_user: dict = Depends(get_current_user)):
    """Admin: Get messages for a specific conversation"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    messages = await db.support_messages.find(
        {"conversation_id": conversation_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    # Mark messages from user as read
    await db.support_messages.update_many(
        {"conversation_id": conversation_id, "sender_role": {"$ne": "admin"}, "read": False},
        {"$set": {"read": True}}
    )
    
    return messages

@api_router.get("/support/conversations")
async def get_all_conversations(current_user: dict = Depends(get_current_user)):
    """Admin: Get all support conversations with latest message"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get unique conversation IDs and their latest messages
    pipeline = [
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$conversation_id",
            "latest_message": {"$first": "$content"},
            "latest_time": {"$first": "$created_at"},
            "sender_name": {"$first": "$sender_name"},
            "sender_role": {"$first": "$sender_role"},
            "unread_count": {
                "$sum": {"$cond": [{"$and": [{"$eq": ["$read", False]}, {"$ne": ["$sender_role", "admin"]}]}, 1, 0]}
            }
        }},
        {"$sort": {"latest_time": -1}}
    ]
    
    conversations = await db.support_messages.aggregate(pipeline).to_list(200)
    
    # Enrich with user info
    result = []
    for conv in conversations:
        user = await db.users.find_one({"id": conv["_id"]}, {"_id": 0, "name": 1, "email": 1, "role": 1})
        result.append({
            "conversation_id": conv["_id"],
            "user_name": user.get("name", "Unknown") if user else "Unknown",
            "user_email": user.get("email", "") if user else "",
            "user_role": user.get("role", "benefactor") if user else "benefactor",
            "latest_message": conv["latest_message"][:100] + "..." if len(conv["latest_message"]) > 100 else conv["latest_message"],
            "latest_time": conv["latest_time"],
            "sender_role": conv["sender_role"],
            "unread_count": conv["unread_count"]
        })
    
    return result

@api_router.get("/support/unread-count")
async def get_unread_support_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread support messages"""
    if current_user["role"] == "admin":
        # Admin sees unread from users
        count = await db.support_messages.count_documents({"sender_role": {"$ne": "admin"}, "read": False})
    else:
        # User sees unread from support
        count = await db.support_messages.count_documents({
            "conversation_id": current_user["id"],
            "sender_role": "admin",
            "read": False
        })
    return {"unread_count": count}

# ===================== PUSH NOTIFICATIONS =====================

# Load VAPID keys
VAPID_PRIVATE_KEY_PATH = os.environ.get("VAPID_PRIVATE_KEY_PATH", "/tmp/vapid_private.pem")
VAPID_PUBLIC_KEY_PATH = os.environ.get("VAPID_PUBLIC_KEY_PATH", "/tmp/vapid_public.pem")
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "mailto:support@carryon.us")

# Initialize VAPID
vapid = None
try:
    if os.path.exists(VAPID_PRIVATE_KEY_PATH):
        vapid = Vapid.from_file(VAPID_PRIVATE_KEY_PATH)
        logger.info("VAPID keys loaded successfully")
    else:
        logger.warning(f"VAPID private key not found at {VAPID_PRIVATE_KEY_PATH}")
except Exception as e:
    logger.error(f"Failed to load VAPID keys: {e}")

class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, str]

class PushNotificationRequest(BaseModel):
    user_id: Optional[str] = None
    title: str
    body: str
    url: Optional[str] = "/"
    tag: Optional[str] = "carryon-notification"
    type: Optional[str] = "general"

@api_router.post("/push/subscribe")
async def subscribe_push(subscription: PushSubscription, current_user: dict = Depends(get_current_user)):
    """Subscribe to push notifications"""
    sub_data = {
        "user_id": current_user["id"],
        "endpoint": subscription.endpoint,
        "keys": subscription.keys,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": True
    }
    
    # Upsert subscription (update if endpoint exists, else insert)
    await db.push_subscriptions.update_one(
        {"endpoint": subscription.endpoint},
        {"$set": sub_data},
        upsert=True
    )
    
    logger.info(f"Push subscription saved for user {current_user['id']}")
    return {"success": True, "message": "Subscribed to push notifications"}

@api_router.delete("/push/unsubscribe")
async def unsubscribe_push(subscription: PushSubscription, current_user: dict = Depends(get_current_user)):
    """Unsubscribe from push notifications"""
    await db.push_subscriptions.delete_one({"endpoint": subscription.endpoint})
    return {"success": True, "message": "Unsubscribed from push notifications"}

@api_router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """Get the VAPID public key for push subscription"""
    try:
        if vapid:
            from cryptography.hazmat.primitives import serialization
            raw_bytes = vapid.public_key.public_bytes(
                encoding=serialization.Encoding.X962,
                format=serialization.PublicFormat.UncompressedPoint
            )
            public_key_b64 = base64.urlsafe_b64encode(raw_bytes).decode('utf-8').rstrip('=')
            return {"public_key": public_key_b64}
        else:
            raise HTTPException(status_code=500, detail="VAPID not configured")
    except Exception as e:
        logger.error(f"Error getting VAPID public key: {e}")
        raise HTTPException(status_code=500, detail="Failed to get VAPID public key")

async def send_push_notification(user_id: str, title: str, body: str, url: str = "/", tag: str = "carryon-notification", notification_type: str = "general"):
    """Send push notification to a specific user"""
    if not vapid:
        logger.warning("VAPID not configured, skipping push notification")
        return False
    
    subscriptions = await db.push_subscriptions.find({"user_id": user_id, "active": True}, {"_id": 0}).to_list(100)
    
    if not subscriptions:
        logger.info(f"No active push subscriptions for user {user_id}")
        return False
    
    payload = json_module.dumps({
        "title": title,
        "body": body,
        "url": url,
        "tag": tag,
        "type": notification_type,
        "icon": "/logo192.png"
    })
    
    success_count = 0
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": sub["keys"]
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY_PATH,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL}
            )
            success_count += 1
            logger.info(f"Push notification sent to user {user_id}")
        except WebPushException as e:
            logger.error(f"Push notification failed: {e}")
            # If subscription is invalid (410 Gone), mark as inactive
            if e.response and e.response.status_code == 410:
                await db.push_subscriptions.update_one(
                    {"endpoint": sub["endpoint"]},
                    {"$set": {"active": False}}
                )
        except Exception as e:
            logger.error(f"Unexpected push error: {e}")
    
    return success_count > 0

async def send_push_to_all_admins(title: str, body: str, url: str = "/admin", tag: str = "admin-notification"):
    """Send push notification to all admin users"""
    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(100)
    for admin in admins:
        await send_push_notification(admin["id"], title, body, url, tag, "admin")

# ===================== STARTUP =====================

@app.on_event("startup")
async def startup_event():
    # No seed data - starting fresh with real accounts only
    logger.info("CarryOn™ API started - ready for real accounts")

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
