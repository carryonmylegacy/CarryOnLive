"""CarryOn™ Backend — Pydantic Models"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid


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
    photo_url: Optional[str] = None  # Base64 profile photo or URL
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
    description: str = ""
    category: str = "general"  # legal, financial, insurance, property, medical, personal, government, general
    priority: str = "medium"   # critical, high, medium, low
    action_type: str = "custom"  # call, email, visit, file_paperwork, notify, custom
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_address: Optional[str] = None
    notes: Optional[str] = None
    due_timeframe: str = "first_week"  # immediate, first_week, two_weeks, first_month, no_rush
    is_completed: bool = False
    completed_at: Optional[str] = None
    completed_by: Optional[str] = None
    order: int = 0
    created_by: str = "benefactor"  # benefactor or ai_suggested
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ChecklistItemCreate(BaseModel):
    estate_id: str
    title: str
    description: str = ""
    category: str = "general"
    priority: str = "medium"
    action_type: str = "custom"
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_address: Optional[str] = None
    notes: Optional[str] = None
    due_timeframe: str = "first_week"
    order: int = 0

class ChecklistItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    action_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    contact_address: Optional[str] = None
    notes: Optional[str] = None
    due_timeframe: Optional[str] = None
    order: Optional[int] = None

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

