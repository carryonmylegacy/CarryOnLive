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


# Life milestones based on age and relationship
def get_expected_milestones(beneficiary: dict) -> list:
    """Calculate expected milestone messages based on beneficiary demographics"""
    milestones = ["Upon Death"]  # Everyone gets this
    
    relation = beneficiary.get("relation", "").lower()
    dob_str = beneficiary.get("date_of_birth")
    
    # Calculate age if DOB is provided
    age = None
    if dob_str:
        try:
            dob = datetime.fromisoformat(dob_str.replace('Z', '+00:00'))
            today = datetime.now(timezone.utc)
            age = (today - dob).days // 365
        except Exception:
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

