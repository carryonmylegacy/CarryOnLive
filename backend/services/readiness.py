"""CarryOn™ Backend — Estate Readiness Score Calculation & Seed Data"""
from datetime import datetime, timezone
from config import db, logger
from utils import hash_password
import uuid


# ===================== REQUIRED DOCUMENTS =====================

REQUIRED_DOCUMENTS = {
    "legal": [
        {"name": "Last Will and Testament", "category": "legal"},
        {"name": "Revocable Living Trust", "category": "legal"},
        {"name": "Financial Power of Attorney", "category": "legal"},
        {"name": "Medical Power of Attorney", "category": "legal"},
        {"name": "Healthcare Directive/Living Will", "category": "legal"},
    ]
}


# ===================== MILESTONE CALCULATION =====================

def get_expected_milestones(beneficiary: dict) -> list:
    """Calculate expected milestone messages based on beneficiary demographics"""
    milestones = ["Upon Death"]
    relation = beneficiary.get("relation", "").lower()
    dob_str = beneficiary.get("date_of_birth")

    age = None
    if dob_str:
        try:
            dob = datetime.fromisoformat(dob_str.replace('Z', '+00:00'))
            today = datetime.now(timezone.utc)
            age = (today - dob).days // 365
        except Exception:
            pass

    if relation in ["child", "son", "daughter", "grandchild", "grandson", "granddaughter"]:
        if age is not None:
            if age < 12:
                milestones.extend(["Elementary School Graduation", "Middle School Graduation",
                                   "High School Graduation", "College Acceptance", "College Graduation",
                                   "Engagement", "Marriage", "First Child", "First Home Purchase"])
            elif age < 18:
                milestones.extend(["High School Graduation", "College Acceptance", "College Graduation",
                                   "Engagement", "Marriage", "First Child", "First Home Purchase"])
            elif age < 25:
                milestones.extend(["College Graduation", "Engagement", "Marriage",
                                   "First Child", "First Home Purchase", "30th Birthday"])
            else:
                milestones.extend(["Major Birthday", "Marriage Anniversary",
                                   "Career Achievement", "First Home Purchase"])
        else:
            milestones.extend(["High School Graduation", "College Graduation",
                               "Marriage", "First Child", "Major Birthday"])

    elif relation in ["spouse", "wife", "husband", "partner"]:
        milestones.extend(["First Anniversary After Passing", "Retirement", "First Grandchild",
                          "Major Health Milestone", "Travel/Dream Vacation", "70th Birthday", "80th Birthday"])

    elif relation in ["parent", "mother", "father"]:
        milestones.extend(["First Anniversary After Passing", "Major Birthday",
                          "Health Milestone", "Special Occasion"])

    elif relation in ["sibling", "brother", "sister"]:
        milestones.extend(["First Anniversary After Passing", "Major Life Event",
                          "Retirement", "Special Family Occasion"])

    else:
        milestones.extend(["First Anniversary After Passing", "Special Occasion"])

    return milestones


# ===================== DEFAULT CHECKLIST ITEMS =====================

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
    {"title": "Notify financial institutions", "description": "Contact banks, credit unions, and investment firms about the passing", "category": "first_week", "order": 8},
    {"title": "File life insurance claims", "description": "Contact insurance companies to begin the claims process", "category": "first_week", "order": 9},
    {"title": "Notify Social Security Administration", "description": "Report the death and inquire about survivor benefits", "category": "first_week", "order": 10},
    {"title": "Cancel or transfer utilities", "description": "Electric, gas, water, internet, phone services", "category": "first_week", "order": 11},
    {"title": "Notify insurance companies", "description": "Auto, home, health insurance providers", "category": "first_week", "order": 12},
    {"title": "Secure digital accounts", "description": "Email, social media, online banking - secure or memorialize", "category": "first_week", "order": 13},
    {"title": "Review and organize mail", "description": "Set up mail forwarding, watch for bills and important correspondence", "category": "first_week", "order": 14},
    # First Month
    {"title": "File for probate (if required)", "description": "Work with attorney to file will with probate court", "category": "first_month", "order": 15},
    {"title": "Inventory all assets", "description": "Create comprehensive list of real estate, vehicles, accounts, valuables", "category": "first_month", "order": 16},
    {"title": "Inventory all debts", "description": "List mortgages, loans, credit cards, and other obligations", "category": "first_month", "order": 17},
    {"title": "Notify creditors", "description": "Send written notice to all known creditors", "category": "first_month", "order": 18},
    {"title": "File final tax return", "description": "Prepare and file the deceased's final income tax return", "category": "first_month", "order": 19},
    {"title": "Apply for EIN for estate", "description": "Get Employer Identification Number from IRS for the estate", "category": "first_month", "order": 20},
    {"title": "Review beneficiary designations", "description": "Check 401(k), IRA, life insurance, and POD/TOD accounts", "category": "first_month", "order": 21},
    # Ongoing
    {"title": "Distribute personal property", "description": "Follow will instructions for distributing personal belongings", "category": "ongoing", "order": 22},
    {"title": "Maintain property and vehicles", "description": "Keep up maintenance until assets are transferred or sold", "category": "ongoing", "order": 23},
    {"title": "Keep detailed records", "description": "Document all estate transactions, distributions, and expenses", "category": "ongoing", "order": 24},
    {"title": "Final estate distribution", "description": "Once debts are settled, distribute remaining assets to beneficiaries", "category": "ongoing", "order": 25},
]


# ===================== SCORE CALCULATIONS =====================

async def calculate_document_score(estate_id: str) -> dict:
    """Calculate document completeness score (0-100)"""
    documents = await db.documents.find({"estate_id": estate_id}, {"_id": 0, "name": 1, "category": 1}).to_list(100)
    doc_names_lower = [d["name"].lower() for d in documents]

    required_docs = []
    for docs in REQUIRED_DOCUMENTS.values():
        required_docs.extend(docs)

    if not required_docs:
        return {"score": 100, "found": 0, "required": 0, "missing": []}

    found_docs = 0
    missing_docs = []

    for req_doc in required_docs:
        req_name = req_doc["name"].lower()
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
    return {"score": score, "found": found_docs, "required": len(required_docs), "missing": missing_docs}


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
        ben_id = ben["id"]
        ben_user_id = ben.get("user_id")
        ben_messages = [m for m in messages if
            ben_id in m.get("recipients", []) or
            (ben_user_id and ben_user_id in m.get("recipients", [])) or
            not m.get("recipients")]
        found_for_ben = min(len(ben_messages), len(expected_milestones))
        total_found += found_for_ben
        if found_for_ben < len(expected_milestones):
            missing_count = len(expected_milestones) - found_for_ben
            missing_milestones.append(f"{ben['name']}: {missing_count} more milestone messages needed")

    score = int((total_found / max(total_expected, 1)) * 100)
    return {"score": min(score, 100), "found": total_found, "required": total_expected, "missing": missing_milestones[:5]}


async def calculate_checklist_score(estate_id: str) -> dict:
    """Calculate checklist completeness score (0-100)"""
    checklist_items = await db.checklists.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    total_items = len(checklist_items)
    completed_items = sum(1 for item in checklist_items if item.get("is_completed"))
    min_required = 25

    if total_items < min_required:
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

    return {"score": min(score, 100), "found": completed_items, "required": max(total_items, min_required), "missing": missing}


async def calculate_estate_readiness(estate_id: str) -> dict:
    """Calculate comprehensive estate readiness score"""
    doc_result = await calculate_document_score(estate_id)
    msg_result = await calculate_messages_score(estate_id)
    checklist_result = await calculate_checklist_score(estate_id)
    overall_score = int((doc_result["score"] + msg_result["score"] + checklist_result["score"]) / 3)
    return {
        "overall_score": overall_score,
        "documents": doc_result,
        "messages": msg_result,
        "checklist": checklist_result,
    }


async def ensure_default_checklist(estate_id: str):
    """Ensure estate has default checklist items"""
    from models import ChecklistItem
    existing = await db.checklists.count_documents({"estate_id": estate_id})
    if existing == 0:
        for item in DEFAULT_CHECKLIST_ITEMS:
            checklist_item = ChecklistItem(
                estate_id=estate_id,
                title=item["title"],
                description=item["description"],
                category=item["category"],
                order=item["order"],
            )
            await db.checklists.insert_one(checklist_item.model_dump())


# ===================== SEED DATA =====================

async def seed_mock_data():
    """Seed mock data for the Mitchell family"""
    existing_user = await db.users.find_one({"email": "pete@mitchell.com"})
    if existing_user:
        return

    logger.info("Seeding mock data for Mitchell family...")

    pete_id = str(uuid.uuid4())
    pete = {
        "id": pete_id,
        "email": "pete@mitchell.com",
        "password": hash_password("password123"),
        "name": "Pete Mitchell",
        "role": "benefactor",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(pete)

    penny_id = str(uuid.uuid4())
    penny = {
        "id": penny_id,
        "email": "penny@mitchell.com",
        "password": hash_password("password123"),
        "name": "Penny Mitchell",
        "role": "beneficiary",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(penny)

    admin_id = str(uuid.uuid4())
    admin = {
        "id": admin_id,
        "email": "admin@carryon.com",
        "password": hash_password("admin123"),
        "name": "CarryOn Admin",
        "role": "admin",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(admin)

    estate_id = str(uuid.uuid4())
    estate = {
        "id": estate_id,
        "owner_id": pete_id,
        "name": "Mitchell Family Estate",
        "status": "pre-transition",
        "readiness_score": 45,
        "beneficiaries": [penny_id],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.estates.insert_one(estate)

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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.beneficiaries.insert_one(beneficiary)

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
            "is_completed": idx < 2,
            "completed_at": datetime.now(timezone.utc).isoformat() if idx < 2 else None,
            "order": item["order"],
        }
        await db.checklists.insert_one(checklist)

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
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.documents.insert_one(document)

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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(message)

    logger.info("Mock data seeded successfully!")
