"""CarryOn™ Backend — Pydantic Models"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
    date_of_birth: Optional[str] = None
    marital_status: Optional[str] = None
    dependents_over_18: Optional[int] = 0
    dependents_under_18: Optional[int] = 0
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    special_status: Optional[list] = None
    username: Optional[str] = None
    b2b_code: Optional[str] = None
    address_line2: Optional[str] = None
    beneficiary_enrollments: Optional[list] = None
    role: str = "benefactor"


class UserLogin(BaseModel):
    email: str  # Can be email or username (operators use non-email usernames)
    password: str
    otp_method: str = "email"  # "email" or "sms"
    phone: Optional[str] = None  # Required if otp_method is "sms"
    force_login: bool = False  # Override active session on another device


class OTPVerify(BaseModel):
    email: str  # Can be email or username — used to resolve the user
    otp: str


class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    created_at: str
    username: str = ""
    photo_url: str = ""
    operator_role: str = ""
    admin_scope: str | list[str] = ""
    is_also_benefactor: bool = False
    is_also_beneficiary: bool = False
    is_beta_tester: bool = False
    beta_accepted: bool = False
    # Partner co-branding — drives the AuthContext effect that
    # fetches the partner's logo + company name so the auth'd
    # shell renders the partner's mark instead of CarryOn's.
    # Empty string for direct consumer signups (no behaviour change).
    partner_slug: str = ""
    partner_company: str = ""
    # Trustee Mode (TMA) — only present on the response when the
    # session was created via a trustee login. The frontend uses
    # `trustee_mode` to render the persistent banner and grey out
    # the trustee management panel.
    trustee_mode: bool = False
    trustee_display_name: str = ""
    trustee_can_access_beneficiaries: bool = False
    # Pro Client Setup — true when this user is the designated rep of a
    # B2B partner (users.partner_rep_for). Unlocks the /pro/clients nav.
    partner_rep: bool = False


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
    address_line2: Optional[str] = None
    # Additional fields
    ssn_last_four: Optional[str] = None  # Last 4 of SSN for estate planning
    notes: Optional[str] = None  # Special instructions or notes
    # ── CCP / emergency-readiness fields. Populated here (rather than on
    # a separate ccp_household record) so the same person can serve as
    # both an inheritor and a household member without duplicate entry.
    medical_conditions: Optional[str] = None
    allergies: Optional[str] = None
    prescriptions: Optional[str] = None
    blood_type: Optional[str] = None
    primary_doctor: Optional[str] = None
    school_or_employer: Optional[str] = None
    avatar_color: str = "#d4af37"
    initials: str = ""
    photo_url: Optional[str] = None  # Base64 profile photo or URL
    # Succession hierarchy — used purely for drag ORDER / contingency precedence.
    # None means the beneficiary has no explicit order yet (sorted last).
    succession_order: Optional[int] = None
    # Estate classification (May 28 2026 founder rule, revised). TWO INDEPENDENT
    # flags — a person can be one, both, or neither:
    #   • is_legal_beneficiary  — Legal Beneficiary: named in will / trust /
    #     beneficiary-designation drafts. This is the source of truth every AI
    #     surface uses when deciding who belongs in estate-document language.
    #   • is_carryon_beneficiary — CarryOn Only Beneficiary: receives CarryOn
    #     platform products (Milestone Messages, IAC hand-offs, FFN, etc.).
    # None = legacy default, resolved at read time (legal ≈ rank-0/is_primary;
    # carryon ≈ "not legal") so existing data renders unchanged.
    is_legal_beneficiary: Optional[bool] = None
    is_carryon_beneficiary: Optional[bool] = None
    # Gated account-change notifications. When ON, this beneficiary receives a
    # notification whenever the relevant actor changes the benefactor account.
    # Independent switches so the benefactor controls visibility per actor.
    notify_benefactor_changes: bool = False
    notify_trustee_changes: bool = False
    # Invitation tracking
    # NOTE: `succession_order` / `is_primary` below now drive the CarryOn
    # EXECUTOR succession ladder (Primary / Secondary / Tertiary … = who controls
    # the benefactor's CarryOn platform access after passing). This is a SEPARATE
    # dimension from the estate classification above.
    is_primary: bool = False  # rank-0 of the CarryOn executor succession ladder
    invitation_status: str = "pending"  # pending, sent, accepted
    invitation_token: Optional[str] = None
    invitation_sent_at: Optional[str] = None
    # Feature access toggles — benefactor controls which sections each beneficiary can access
    mm_access: bool = True  # Milestone Messages
    ega_access: bool = True  # Estate Guardian AI
    sdv_access: bool = True  # Secure Document Vault
    iac_access: bool = True  # Immediate Action Checklist
    ffn_access: bool = True  # Friends & Family Notification
    dav_access: bool = True  # Digital Access Vault
    dts_access: bool = True  # Designated Trustee Services
    cfp_access: bool = True  # CarryOn Financial Portal
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BeneficiaryCreate(BaseModel):
    estate_id: str
    first_name: str = Field(..., min_length=1)
    middle_name: Optional[str] = None
    last_name: str = Field(..., min_length=1)
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
    address_line2: Optional[str] = None
    ssn_last_four: Optional[str] = None
    notes: Optional[str] = None
    # CCP / emergency-readiness optional inputs
    medical_conditions: Optional[str] = None
    allergies: Optional[str] = None
    prescriptions: Optional[str] = None
    blood_type: Optional[str] = None
    primary_doctor: Optional[str] = None
    school_or_employer: Optional[str] = None
    avatar_color: str = "#d4af37"
    mm_access: bool = True
    ega_access: bool = True
    sdv_access: bool = True
    iac_access: bool = True
    ffn_access: bool = True
    dav_access: bool = True
    dts_access: bool = True
    cfp_access: bool = True


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
    message_type: str = "text"  # text, voice, video
    video_url: Optional[str] = None
    voice_url: Optional[str] = None
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
    video_thumbnail: Optional[str] = None  # Base64 encoded JPEG thumbnail
    voice_data: Optional[str] = None  # Base64 encoded voice
    recipients: List[str] = []
    trigger_type: str = "immediate"  # immediate, age_milestone, event, specific_date
    trigger_value: Optional[str] = None
    trigger_age: Optional[int] = None
    trigger_date: Optional[str] = None  # ISO date string for specific_date trigger
    custom_event_label: Optional[str] = None


class MessageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    message_type: Optional[str] = None
    video_data: Optional[str] = None
    video_thumbnail: Optional[str] = None
    voice_data: Optional[str] = None
    remove_video: Optional[bool] = None
    remove_voice: Optional[bool] = None
    remove_attachment: Optional[bool] = None
    recipients: Optional[List[str]] = None
    trigger_type: Optional[str] = None
    trigger_value: Optional[str] = None
    trigger_age: Optional[int] = None
    trigger_date: Optional[str] = None
    custom_event_label: Optional[str] = None


class ChecklistItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    estate_id: str
    title: str
    description: str = ""
    category: str = (
        "general"  # legal, financial, insurance, property, medical, personal, government, general, immediate
    )
    priority: str = "medium"  # critical, high, medium, low
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
    is_default: bool = False
    activation_status: Optional[str] = None
    ai_accepted: Optional[bool] = None
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
    activation_status: Optional[str] = None
    is_default: Optional[bool] = None
    ai_accepted: Optional[bool] = None
    is_completed: Optional[bool] = None


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
    # Public Device Mode — disaster-comms scenario. When ON, every member's
    # session on this estate aggressively wipes localStorage, sessionStorage,
    # the offline Dexie cache, and SW caches on `pagehide` (browser close /
    # tab close / navigate-away) AND after `public_device_idle_seconds` of
    # inactivity. Default OFF preserves the offline-first cache benefits
    # for the family's own devices.
    public_device_mode: Optional[bool] = None
    public_device_idle_seconds: Optional[int] = None  # 30..600; default 90 client-side
    # CFP global pre-transition visibility. False (default) = the entire
    # CarryOn Financial Picture module is hidden from beneficiaries until
    # the estate transitions. True = the module is exposed pre-transition,
    # in which case each item's per-beneficiary `visibility_timing.pre`
    # still gates which specific bills/accounts/debts/property show up.
    # Use case: benefactor going on a Eurotrip / scheduled hospital stay
    # flips this on for a week, then back off. Per-item pre/post settings
    # are preserved across toggles.
    cfp_pre_transition_visible: Optional[bool] = None


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
