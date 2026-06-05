"""CarryOn™ Backend — Estate Readiness Score Calculation & Seed Data"""

import uuid
from datetime import datetime, timezone

from config import db, logger
from utils import hash_password

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
            dob = datetime.fromisoformat(dob_str.replace("Z", "+00:00"))
            today = datetime.now(timezone.utc)
            age = (today - dob).days // 365
        except Exception:
            pass

    if relation in [
        "child",
        "son",
        "daughter",
        "grandchild",
        "grandson",
        "granddaughter",
    ]:
        if age is not None:
            if age < 12:
                milestones.extend(
                    [
                        "Elementary School Graduation",
                        "Middle School Graduation",
                        "High School Graduation",
                        "College Acceptance",
                        "College Graduation",
                        "Engagement",
                        "Marriage",
                        "First Child",
                        "First Home Purchase",
                    ]
                )
            elif age < 18:
                milestones.extend(
                    [
                        "High School Graduation",
                        "College Acceptance",
                        "College Graduation",
                        "Engagement",
                        "Marriage",
                        "First Child",
                        "First Home Purchase",
                    ]
                )
            elif age < 25:
                milestones.extend(
                    [
                        "College Graduation",
                        "Engagement",
                        "Marriage",
                        "First Child",
                        "First Home Purchase",
                        "30th Birthday",
                    ]
                )
            else:
                milestones.extend(
                    [
                        "Major Birthday",
                        "Marriage Anniversary",
                        "Career Achievement",
                        "First Home Purchase",
                    ]
                )
        else:
            milestones.extend(
                [
                    "High School Graduation",
                    "College Graduation",
                    "Marriage",
                    "First Child",
                    "Major Birthday",
                ]
            )

    elif relation in ["spouse", "wife", "husband", "partner"]:
        milestones.extend(
            [
                "First Anniversary After Passing",
                "Retirement",
                "First Grandchild",
                "Major Health Milestone",
                "Travel/Dream Vacation",
                "70th Birthday",
                "80th Birthday",
            ]
        )

    elif relation in ["parent", "mother", "father"]:
        milestones.extend(
            [
                "First Anniversary After Passing",
                "Major Birthday",
                "Health Milestone",
                "Special Occasion",
            ]
        )

    elif relation in ["sibling", "brother", "sister"]:
        milestones.extend(
            [
                "First Anniversary After Passing",
                "Major Life Event",
                "Retirement",
                "Special Family Occasion",
            ]
        )

    else:
        milestones.extend(["First Anniversary After Passing", "Special Occasion"])

    return milestones


# ===================== DEFAULT CHECKLIST ITEMS =====================

DEFAULT_CHECKLIST_ITEMS = [
    # Immediate (Day 1-3)
    {
        "title": "Notify immediate family members",
        "description": "Call or visit closest family members to inform them of the passing",
        "category": "immediate",
        "order": 1,
    },
    {
        "title": "Contact funeral home",
        "description": "Arrange for transportation and begin funeral planning",
        "category": "immediate",
        "order": 2,
    },
    {
        "title": "Secure the residence",
        "description": "Ensure home is locked and secure, collect mail, adjust thermostat",
        "category": "immediate",
        "order": 3,
    },
    {
        "title": "Locate important documents",
        "description": "Find will, trust documents, insurance policies, and financial records",
        "category": "immediate",
        "order": 4,
    },
    {
        "title": "Notify employer (if applicable)",
        "description": "Contact HR department about final paycheck and benefits",
        "category": "immediate",
        "order": 5,
    },
    {
        "title": "Contact estate attorney",
        "description": "Schedule meeting to review will and begin probate process",
        "category": "immediate",
        "order": 6,
    },
    {
        "title": "Obtain death certificates",
        "description": "Order at least 10-15 certified copies from funeral home or vital records",
        "category": "immediate",
        "order": 7,
    },
    # First Week
    {
        "title": "Notify financial institutions",
        "description": "Contact banks, credit unions, and investment firms about the passing",
        "category": "first_week",
        "order": 8,
    },
    {
        "title": "File life insurance claims",
        "description": "Contact insurance companies to begin the claims process",
        "category": "first_week",
        "order": 9,
    },
    {
        "title": "Notify Social Security Administration",
        "description": "Report the death and inquire about survivor benefits",
        "category": "first_week",
        "order": 10,
    },
    {
        "title": "Cancel or transfer utilities",
        "description": "Electric, gas, water, internet, phone services",
        "category": "first_week",
        "order": 11,
    },
    {
        "title": "Notify insurance companies",
        "description": "Auto, home, health insurance providers",
        "category": "first_week",
        "order": 12,
    },
    {
        "title": "Secure digital accounts",
        "description": "Email, social media, online banking - secure or memorialize",
        "category": "first_week",
        "order": 13,
    },
    {
        "title": "Review and organize mail",
        "description": "Set up mail forwarding, watch for bills and important correspondence",
        "category": "first_week",
        "order": 14,
    },
    # First Month
    {
        "title": "File for probate (if required)",
        "description": "Work with attorney to file will with probate court",
        "category": "first_month",
        "order": 15,
    },
    {
        "title": "Inventory all assets",
        "description": "Create comprehensive list of real estate, vehicles, accounts, valuables",
        "category": "first_month",
        "order": 16,
    },
    {
        "title": "Inventory all debts",
        "description": "List mortgages, loans, credit cards, and other obligations",
        "category": "first_month",
        "order": 17,
    },
    {
        "title": "Notify creditors",
        "description": "Send written notice to all known creditors",
        "category": "first_month",
        "order": 18,
    },
    {
        "title": "File final tax return",
        "description": "Prepare and file the deceased's final income tax return",
        "category": "first_month",
        "order": 19,
    },
    {
        "title": "Apply for EIN for estate",
        "description": "Get Employer Identification Number from IRS for the estate",
        "category": "first_month",
        "order": 20,
    },
    {
        "title": "Review beneficiary designations",
        "description": "Check 401(k), IRA, life insurance, and POD/TOD accounts",
        "category": "first_month",
        "order": 21,
    },
    # Ongoing
    {
        "title": "Distribute personal property",
        "description": "Follow will instructions for distributing personal belongings",
        "category": "ongoing",
        "order": 22,
    },
    {
        "title": "Maintain property and vehicles",
        "description": "Keep up maintenance until assets are transferred or sold",
        "category": "ongoing",
        "order": 23,
    },
    {
        "title": "Keep detailed records",
        "description": "Document all estate transactions, distributions, and expenses",
        "category": "ongoing",
        "order": 24,
    },
    {
        "title": "Final estate distribution",
        "description": "Once debts are settled, distribute remaining assets to beneficiaries",
        "category": "ongoing",
        "order": 25,
    },
]


# ===================== SCORE CALCULATIONS =====================


def _get_age(dob_str):
    """Calculate age from date of birth string."""
    if not dob_str:
        return None
    try:
        dob = datetime.fromisoformat(dob_str.replace("Z", "+00:00"))
        today = datetime.now(timezone.utc)
        age = today.year - dob.year
        if (today.month, today.day) < (dob.month, dob.day):
            age -= 1
        return age
    except Exception:
        return None


def get_expected_milestone_count(ben: dict) -> int:
    """Calculate expected number of milestone messages for a beneficiary
    based on their age and standard American life milestones.

    Under 14 (pre-high school): 8 milestones
      HS grad, college acceptance, college grad, engagement, marriage,
      first child, first home, major birthday
    14-17 (high school): 7 milestones
      HS grad, college acceptance, college grad, engagement, marriage,
      first child, first home
    18-22 (college age): 5 milestones
      College grad, engagement, marriage, first child, first home
    23-30 (young adult): 3 milestones
      Marriage, first child, major birthday
    31+ (past typical milestones): 1 milestone
      General upon-death / anniversary message
    Unknown age: 1 milestone (minimum expectation)
    """
    age = _get_age(ben.get("date_of_birth") or ben.get("dob"))
    if age is None:
        return 1
    if age < 14:
        return 8
    if age < 18:
        return 7
    if age < 23:
        return 5
    if age <= 30:
        return 3
    return 1


async def calculate_document_score(estate_id: str) -> dict:
    """Calculate document completeness score (0-100)

    Scoring tiers:
      80% = Will + Trust + at least 1 Power of Attorney (3 core docs)
      100% = 80% base PLUS any of:
        - A second Power of Attorney (financial AND medical)
        - A Healthcare Directive / Living Will
        - A deed, title, or other estate/property document

    Below 3 core docs = proportional (each core doc = ~27%)
    """
    documents = await db.documents.find(
        {"estate_id": estate_id}, {"_id": 0, "id": 1, "name": 1, "category": 1}
    ).to_list(200)
    doc_names_lower = [d.get("name", d.get("title", "")).lower() for d in documents]
    doc_categories = [d.get("category", "").lower() for d in documents]

    # Detect core documents
    has_will = any(
        ("will" in n and "living will" not in n) or "last will" in n or "testament" in n for n in doc_names_lower
    )
    has_trust = any("trust" in n for n in doc_names_lower)
    has_financial_poa = any(
        ("financial" in n and "power" in n) or ("financial" in n and "attorney" in n) or "financial poa" in n
        for n in doc_names_lower
    )
    has_medical_poa = any(
        ("medical" in n and "power" in n)
        or ("medical" in n and "attorney" in n)
        or ("healthcare" in n and "power" in n)
        or "medical poa" in n
        for n in doc_names_lower
    )
    has_any_poa = has_financial_poa or has_medical_poa
    has_both_poa = has_financial_poa and has_medical_poa

    # Healthcare directive — could be standalone or embedded in will
    has_directive = any(
        "directive" in n
        or "living will" in n
        or "advance directive" in n
        or ("healthcare" in n and ("directive" in n or "wish" in n))
        for n in doc_names_lower
    )
    # If the will document name suggests it includes healthcare directives
    if not has_directive and has_will:
        has_directive = any(
            ("will" in n and ("healthcare" in n or "directive" in n or "medical" in n)) for n in doc_names_lower
        )

    # Deed or estate property document
    has_deed = any("deed" in n or "title" in n or "property" in n or "mortgage" in n for n in doc_names_lower) or any(
        c in ("property", "real estate", "deed") for c in doc_categories
    )

    # Calculate score
    core_count = sum([has_will, has_trust, has_any_poa])
    missing = []

    if core_count < 3:
        # Below 80% tier — proportional
        score = int((core_count / 3) * 80)
        if not has_will:
            missing.append("Last Will and Testament")
        if not has_trust:
            missing.append("Revocable Living Trust")
        if not has_any_poa:
            missing.append("Power of Attorney (Financial or Medical)")
    else:
        # Have all 3 core docs → base 80%
        bonus_items = sum([has_both_poa, has_directive, has_deed])
        if bonus_items > 0:
            score = 100
        else:
            score = 80
            if not has_both_poa:
                missing.append("Second Power of Attorney (Financial or Medical)")
            if not has_directive:
                missing.append("Healthcare Directive / Living Will")
            missing.append("Property deed or estate document (any one for 100%)")

    return {
        "score": min(score, 100),
        "found": len(documents),
        "required": 3,
        "missing": missing[:3],
    }


async def calculate_messages_score(estate_id: str) -> dict:
    """Calculate milestone messages completeness score (0-100)

    For each beneficiary, expected milestones are based on age:
      <14: 8, 14-17: 7, 18-22: 5, 23-30: 3, 31+: 1

    A message sent to multiple recipients counts toward EACH recipient.
    Score = total messages found / total expected across all beneficiaries.
    """
    beneficiaries = await db.beneficiaries.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(200)
    messages = await db.messages.find({"estate_id": estate_id}, {"_id": 0}).to_list(500)

    if not beneficiaries:
        return {
            "score": 0,
            "found": 0,
            "required": 1,
            "missing": ["Add at least one beneficiary"],
        }

    total_expected = 0
    total_found = 0
    missing_info = []

    for ben in beneficiaries:
        expected = get_expected_milestone_count(ben)
        total_expected += expected
        ben_id = ben["id"]
        ben_user_id = ben.get("user_id")

        # Count messages that include this beneficiary as a recipient
        # Group messages (sent to multiple people) count for each recipient
        ben_msg_count = sum(
            1
            for m in messages
            if ben_id in m.get("recipients", [])
            or (ben_user_id and ben_user_id in m.get("recipients", []))
            or not m.get("recipients")  # messages with no recipients = sent to all
        )
        found_for_ben = min(ben_msg_count, expected)
        total_found += found_for_ben

        if found_for_ben < expected:
            remaining = expected - found_for_ben
            name = ben.get("name") or ben.get("first_name") or "Unnamed"
            missing_info.append(f"{name}: {remaining} more message{'s' if remaining != 1 else ''} needed")

    score = int((total_found / max(total_expected, 1)) * 100)
    return {
        "score": min(score, 100),
        "found": total_found,
        "required": total_expected,
        "missing": missing_info[:5],
    }


async def calculate_checklist_score(estate_id: str) -> dict:
    """Calculate checklist preparation score (0-100)

    Score measures how many IAC items the BENEFACTOR has prepared for their
    beneficiaries to follow after transition. Creating items IS the work —
    completion happens post-transition by the family, not by the benefactor.

    15 items = 100%. Below 15 = proportional.
    """
    checklist_items = await db.checklists.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(200)
    total_items = len(checklist_items)

    target = 15
    if total_items == 0:
        score = 0
    elif total_items >= target:
        score = 100
    else:
        score = int((total_items / target) * 100)

    missing = []
    if total_items < target:
        missing.append(
            f"Add {target - total_items} more item{'s' if target - total_items != 1 else ''} for a complete checklist"
        )

    return {
        "score": min(score, 100),
        "found": total_items,
        "required": target,
        "missing": missing,
    }


async def calculate_financial_score(estate_id: str) -> dict:
    """Calculate financial documentation completeness score (0-100).
    Measures how thoroughly the benefactor has documented their financial picture."""
    bills = await db.bills.find({"estate_id": estate_id, "deleted_at": None, "status": "active"}, {"_id": 0}).to_list(
        500
    )
    debts = await db.debts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    accounts = await db.financial_accounts.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(500)
    property_assets = await db.property_assets.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(
        500
    )

    all_items = bills + debts + accounts + property_assets
    total_items = len(all_items)

    if total_items == 0:
        return {"score": 0, "details": "No financial data entered"}

    # Coverage (30 pts): Has the benefactor documented each area?
    coverage = 0
    if len(bills) > 0:
        coverage += 8
    if len(debts) > 0:
        coverage += 7
    if len(accounts) > 0:
        coverage += 8
    if len(property_assets) > 0:
        coverage += 7

    # Detail (25 pts): How thoroughly are items filled out?
    detail_total = 0
    detail_filled = 0
    for b in bills:
        detail_total += 3
        if b.get("amount"):
            detail_filled += 1
        if b.get("due_day"):
            detail_filled += 1
        if b.get("provider_phone") or b.get("provider_website"):
            detail_filled += 1
    for d in debts:
        detail_total += 2
        if d.get("outstanding_balance"):
            detail_filled += 1
        if d.get("institution_name"):
            detail_filled += 1
    for a in accounts:
        detail_total += 2
        if a.get("approximate_balance"):
            detail_filled += 1
        if a.get("institution_name"):
            detail_filled += 1
    for p in property_assets:
        detail_total += 2
        if p.get("estimated_value"):
            detail_filled += 1
        if p.get("location_address") or p.get("description"):
            detail_filled += 1
    detail = round((detail_filled / detail_total) * 25) if detail_total > 0 else 0

    # Designations (25 pts): % of items the benefactor has decreed (financial
    # items are private by default — a non-empty designation or any timing rule
    # means the benefactor made a sharing decision).
    designated_count = sum(
        1
        for item in all_items
        if (item.get("designated_beneficiaries") or []) or len(item.get("visibility_timing", {})) > 0
    )
    designations = round((designated_count / total_items) * 25)

    # Notes (20 pts): % of items with beneficiary notes
    notes_count = sum(1 for item in all_items if item.get("notes"))
    notes = round((notes_count / total_items) * 20)

    score = min(100, coverage + detail + designations + notes)
    return {"score": score, "details": f"{total_items} financial items documented"}


async def calculate_estate_readiness(estate_id: str, enabled_features: list | None = None) -> dict:
    """Calculate comprehensive estate readiness score (now includes financials).
    If enabled_features is provided, only include components whose feature key is enabled.
    """
    doc_result = await calculate_document_score(estate_id)
    msg_result = await calculate_messages_score(estate_id)
    checklist_result = await calculate_checklist_score(estate_id)

    components = [doc_result["score"], msg_result["score"], checklist_result["score"]]
    result = {
        "documents": doc_result,
        "messages": msg_result,
        "checklist": checklist_result,
    }

    # Only include financials if CFP is enabled (or no feature list provided = all enabled)
    if enabled_features is None or "cfp" in enabled_features:
        financial_result = await calculate_financial_score(estate_id)
        components.append(financial_result["score"])
        result["financials"] = financial_result
    else:
        result["financials"] = {"score": 0, "details": "Feature disabled"}

    overall_score = int(sum(components) / len(components)) if components else 0
    result["overall_score"] = overall_score
    return result


GETTING_STARTED_CHECKLIST = [
    {
        "title": "Call your designated executor — they have instructions",
        "description": "Your first call should be to the person you've designated to handle your estate. Edit this item to add their name and phone number.",
        "category": "immediate",
        "order": 1,
    },
    {
        "title": "Contact employer HR to report the death and ask about benefits",
        "description": "Life insurance through work, final paycheck, COBRA health coverage, and any survivor benefits.",
        "category": "immediate",
        "order": 2,
    },
    {
        "title": "Request 10 certified copies of the death certificate",
        "description": "Banks, insurance companies, and government agencies each require an original. Most families don't request enough.",
        "category": "immediate",
        "order": 3,
    },
    {
        "title": "Freeze or monitor all joint financial accounts",
        "description": "Notify banks of the death. Prevent unauthorized transactions. Do not close accounts until the executor advises.",
        "category": "immediate",
        "order": 4,
    },
    {
        "title": "Do NOT make any major financial decisions for 30 days",
        "description": "Grief impairs judgment. Avoid selling property, changing investments, or lending money during the initial period.",
        "category": "immediate",
        "order": 5,
    },
]


async def ensure_default_checklist(estate_id: str):
    """Ensure estate has the 5 getting-started checklist items (not the full 25)"""
    from models import ChecklistItem

    existing = await db.checklists.count_documents({"estate_id": estate_id})
    if existing == 0:
        for item in GETTING_STARTED_CHECKLIST:
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
        {
            "title": "Upload Will",
            "description": "Upload your last will and testament",
            "category": "legal",
            "order": 1,
        },
        {
            "title": "Add Beneficiaries",
            "description": "Add all family members who should receive assets",
            "category": "family",
            "order": 2,
        },
        {
            "title": "Upload Financial Documents",
            "description": "Add bank statements, investment accounts, etc.",
            "category": "financial",
            "order": 3,
        },
        {
            "title": "Create Milestone Messages",
            "description": "Record messages for special occasions",
            "category": "messages",
            "order": 4,
        },
        {
            "title": "Assign Power of Attorney",
            "description": "Designate someone to handle affairs",
            "category": "legal",
            "order": 5,
        },
        {
            "title": "Upload Insurance Policies",
            "description": "Add life insurance and other policy documents",
            "category": "financial",
            "order": 6,
        },
        {
            "title": "Add Emergency Contacts",
            "description": "List important contacts for your family",
            "category": "family",
            "order": 7,
        },
        {
            "title": "Review Estate Plan",
            "description": "Schedule annual review of your estate plan",
            "category": "legal",
            "order": 8,
        },
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
        {
            "name": "Last Will & Testament",
            "category": "legal",
            "file_type": "pdf",
            "file_size": 245000,
            "is_locked": True,
            "lock_type": "password",
        },
        {
            "name": "Bank Statements 2024",
            "category": "financial",
            "file_type": "pdf",
            "file_size": 892000,
            "is_locked": False,
        },
        {
            "name": "Life Insurance Policy",
            "category": "financial",
            "file_type": "pdf",
            "file_size": 156000,
            "is_locked": True,
            "lock_type": "backup",
        },
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
