"""CarryOn™ Backend — Onboarding & Quick-Start Templates"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db
from models import ChecklistItem
from utils import get_current_user, update_estate_readiness

router = APIRouter()

# ===================== ONBOARDING PROGRESS =====================

ONBOARDING_STEPS = [
    {
        "key": "add_beneficiary",
        "label": "Add a Beneficiary",
        "description": "Add your first beneficiary to your estate plan",
        "optional": False,
    },
    {
        "key": "create_message",
        "label": "Leave a Milestone Message",
        "description": "Record a message for your loved ones",
        "optional": False,
    },
    {
        "key": "upload_document",
        "label": "Upload an Estate Document",
        "description": "Securely store your first important document",
        "optional": False,
    },
    {
        "key": "review_readiness",
        "label": "Consult the Estate Guardian",
        "description": "Get an AI analysis of your estate plan",
        "optional": False,
    },
    {
        "key": "customize_checklist",
        "label": "Customize Your Action Checklist",
        "description": "Review the steps your loved ones will follow",
        "optional": False,
    },
    {
        "key": "designate_primary",
        "label": "Set Your Succession Order",
        "description": "Arrange your beneficiary succession hierarchy",
        "optional": True,
    },
    {
        "key": "add_credential",
        "label": "Store a Digital Account Credential",
        "description": "Add a login and password to your Digital Access Vault",
        "optional": True,
    },
    {
        "key": "review_settings",
        "label": "Review Your Settings",
        "description": "Open Settings and Security Settings to customize your portal",
        "optional": False,
    },
    {
        "key": "build_financial_picture",
        "label": "Build Your Financial Picture",
        "description": "Add bills, debts, accounts, or property to your CFP",
        "optional": False,
    },
]


@router.get("/onboarding/progress")
async def get_onboarding_progress(current_user: dict = Depends(get_current_user)):
    """Get the user's onboarding progress — always checks real data for completion."""
    progress = await db.onboarding_progress.find_one({"user_id": current_user["id"]}, {"_id": 0})

    if not progress:
        progress = {
            "user_id": current_user["id"],
            "completed_steps": {},
            "dismissed": False,
        }

    # Always re-check completion from LIVE data — reset to false if counts go to 0
    estates = await db.estates.find({"owner_id": current_user["id"]}, {"_id": 0, "id": 1}).to_list(1)
    estate_id = estates[0]["id"] if estates else None

    # Replay mode (Feb 26 2026) — when the user toggles ON the
    # "Getting Started Guide" in Settings after having already
    # completed it, `/onboarding/reset` flips `replay_mode=True` and
    # clears `completed_steps`. While in replay mode we *do not*
    # auto-detect from live data — we only honor the explicit
    # `complete-step` POSTs the user makes as they walk through the
    # wizard again. This guarantees the wizard starts at 1 of 7 even
    # when the underlying beneficiaries / docs / messages already
    # exist. Replay mode auto-clears below when all 7 steps have been
    # re-completed.
    replay_mode = bool(progress.get("replay_mode", False))

    completed = {}
    if replay_mode:
        # Pull completion strictly from the stored map (gradually
        # populated by the user re-walking through the wizard).
        stored = progress.get("completed_steps", {})
        for step in ONBOARDING_STEPS:
            if stored.get(step["key"]):
                completed[step["key"]] = True
    elif estate_id:
        # At least one beneficiary added
        completed["add_beneficiary"] = await db.beneficiaries.count_documents({"estate_id": estate_id}) > 0
        completed["upload_document"] = await db.documents.count_documents({"estate_id": estate_id}) > 0
        completed["create_message"] = await db.messages.count_documents({"estate_id": estate_id}) > 0
        # Primary beneficiary designated
        completed["designate_primary"] = (
            await db.beneficiaries.count_documents({"estate_id": estate_id, "is_primary": True}) > 0
        )
        # Checklist customized: at least one item has activation_status set (accepted/edited/removed)
        completed["customize_checklist"] = (
            await db.checklists.count_documents({"estate_id": estate_id, "activation_status": {"$ne": None}}) > 0
        )
        # DAV credential stored
        completed["add_credential"] = await db.digital_wallet.count_documents({"estate_id": estate_id}) > 0
        # Build Your Financial Picture — completed once the user has
        # ANY entry across bills/debts/accounts/property on the CFP.
        # Mirrors the dashboard's empty-CFP visibility gate exactly so
        # this checklist step flips green the moment the standalone
        # tile would have hidden itself.
        cfp_any = (
            await db.bills.count_documents({"estate_id": estate_id, "deleted_at": None}) > 0
            or await db.debts.count_documents({"estate_id": estate_id, "deleted_at": None}) > 0
            or await db.financial_accounts.count_documents({"estate_id": estate_id, "deleted_at": None}) > 0
            or await db.property_assets.count_documents({"estate_id": estate_id, "deleted_at": None}) > 0
        )
        completed["build_financial_picture"] = cfp_any

    # review_readiness is manual — preserve from stored progress
    if not replay_mode and progress.get("completed_steps", {}).get("review_readiness"):
        completed["review_readiness"] = True
    # review_settings is manual — preserve from stored progress
    if not replay_mode and progress.get("completed_steps", {}).get("review_settings"):
        completed["review_settings"] = True
    # Optional steps that were skipped are marked complete
    stored_completed = progress.get("completed_steps", {})
    if not replay_mode:
        for step in ONBOARDING_STEPS:
            if step.get("optional") and stored_completed.get(step["key"]):
                completed[step["key"]] = True

    # Persist updated completion
    await db.onboarding_progress.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"completed_steps": completed, "user_id": current_user["id"]}},
        upsert=True,
    )

    steps_with_status = []
    for step in ONBOARDING_STEPS:
        steps_with_status.append(
            {
                **step,
                "completed": completed.get(step["key"], False),
                "optional": step.get("optional", False),
            }
        )

    total = len(ONBOARDING_STEPS)
    done = sum(1 for s in steps_with_status if s["completed"])
    all_complete = done == total

    # Auto-clear replay mode the moment all 7 steps have been re-
    # completed during this replay session so subsequent fetches go
    # back to the normal auto-detect path.
    if replay_mode and all_complete:
        await db.onboarding_progress.update_one(
            {"user_id": current_user["id"]},
            {"$set": {"replay_mode": False}},
        )
        replay_mode = False

    # Auto-dismiss if all complete, auto-restore if steps become incomplete again
    # BUT: once celebration_shown is True, the user finished onboarding once — never re-show
    already_graduated = progress.get("celebration_shown", False)
    if all_complete:
        update_set = {"dismissed": True}
        if not already_graduated:
            update_set["completed_once"] = True
        await db.onboarding_progress.update_one(
            {"user_id": current_user["id"]},
            {"$set": update_set},
        )
    elif progress.get("dismissed") and not all_complete and not already_graduated:
        # Steps went back to incomplete — un-dismiss so the guide reappears
        # ONLY if user hasn't already graduated AND hasn't manually dismissed
        if not progress.get("manually_dismissed"):
            await db.onboarding_progress.update_one(
                {"user_id": current_user["id"]},
                {"$set": {"dismissed": False}},
            )

    # Get beneficiary names for personalization
    ben_names = []
    if estate_id:
        bens = await db.beneficiaries.find(
            {"estate_id": estate_id, "is_stub": {"$ne": True}},
            {"_id": 0, "id": 1, "first_name": 1, "name": 1},
        ).to_list(10)
        ben_names = [
            b.get("first_name") or b.get("name", "").split(" ")[0] for b in bens if b.get("first_name") or b.get("name")
        ]

    manually_dismissed = progress.get("manually_dismissed", False)
    # `resume_banner_hidden` is set explicitly when the user toggles OFF
    # the "Getting Started Guide" preference in Settings. It is NOT set
    # when the user merely closes the wizard via its X button. The two
    # surfaces (wizard + "Pick Up Where You Left Off" resume banner)
    # share `manually_dismissed`, but the resume banner should ALSO
    # respect this stronger Settings-driven preference. See
    # DashboardPage banner gate.
    resume_banner_hidden = bool(progress.get("resume_banner_hidden", False))

    return {
        "steps": steps_with_status,
        "completed_count": done,
        "total_steps": total,
        "progress_pct": int((done / total) * 100) if total else 0,
        "all_complete": all_complete,
        "dismissed": all_complete or already_graduated or manually_dismissed,
        "celebration_shown": already_graduated,
        "already_graduated": already_graduated,
        "manually_dismissed": manually_dismissed,
        "resume_banner_hidden": resume_banner_hidden,
        "beneficiary_names": ben_names[:3],
    }


@router.post("/onboarding/complete-step/{step_key}")
async def complete_onboarding_step(step_key: str, current_user: dict = Depends(get_current_user)):
    """Mark an onboarding step as complete."""
    valid_keys = [s["key"] for s in ONBOARDING_STEPS]
    if step_key not in valid_keys:
        raise HTTPException(status_code=400, detail=f"Invalid step: {step_key}")

    await db.onboarding_progress.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                f"completed_steps.{step_key}": True,
                "user_id": current_user["id"],
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
    return {"success": True, "step": step_key}


class DismissOnboardingBody(BaseModel):
    """Optional body for `/onboarding/dismiss`.

    `hide_resume_banner=True` is sent ONLY by the Settings toggle path,
    expressing a stronger user preference ("don't show this guide on
    my dashboard at all" — including the "Pick Up Where You Left Off"
    resume banner). The wizard's own X button posts an empty body so
    the resume banner stays visible (its whole purpose).
    """

    hide_resume_banner: bool = False


@router.post("/onboarding/dismiss")
async def dismiss_onboarding(
    body: DismissOnboardingBody | None = None,
    current_user: dict = Depends(get_current_user),
):
    """Permanently dismiss the onboarding wizard until user re-enables in Settings."""
    update: dict = {"dismissed": True, "manually_dismissed": True, "user_id": current_user["id"]}
    if body and body.hide_resume_banner:
        update["resume_banner_hidden"] = True
    await db.onboarding_progress.update_one(
        {"user_id": current_user["id"]},
        {"$set": update},
        upsert=True,
    )
    return {"success": True}


@router.get("/onboarding/status")
async def get_onboarding_status(current_user: dict = Depends(get_current_user)):
    """Lightweight read of the dismissal state — used by the Settings
    "Getting Started Guide" toggle so it reflects the true server state
    (not just localStorage). Needs to stay in lockstep with
    /onboarding/progress's `dismissed` / `manually_dismissed` semantics.
    """
    progress = await db.onboarding_progress.find_one({"user_id": current_user["id"]}) or {}
    manually_dismissed = bool(progress.get("manually_dismissed", False))
    celebration_shown = bool(progress.get("celebration_shown", False))
    resume_banner_hidden = bool(progress.get("resume_banner_hidden", False))
    # The Settings toggle reflects the strongest off-state: if the
    # user explicitly turned the feature OFF via Settings, the toggle
    # must come back as `dismissed=true` on next render. We treat
    # `resume_banner_hidden` as that authoritative settings-off
    # signal so a soft wizard-X dismissal doesn't accidentally flip
    # the Settings switch.
    dismissed = manually_dismissed or celebration_shown or resume_banner_hidden
    return {
        "dismissed": dismissed,
        "manually_dismissed": manually_dismissed,
        "celebration_shown": celebration_shown,
        "resume_banner_hidden": resume_banner_hidden,
    }


@router.post("/onboarding/celebration-shown")
async def mark_celebration_shown(current_user: dict = Depends(get_current_user)):
    """Mark the celebration as shown so it never appears again."""
    await db.onboarding_progress.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"celebration_shown": True, "user_id": current_user["id"]}},
        upsert=True,
    )
    return {"success": True}


@router.post("/onboarding/reset")
async def reset_onboarding(current_user: dict = Depends(get_current_user)):
    """Re-enable the onboarding wizard and force a clean replay from step 1.

    Per Feb 26 2026 founder mandate: when the user toggles ON the
    "Getting Started Guide" in Settings — particularly if they had
    already completed it — the wizard must reappear at "1 of 7", not
    instantly skip ahead to whichever steps still happen to be auto-
    detected as complete. We achieve this by:

      • Clearing `completed_steps` so no manual flags carry over.
      • Clearing `celebration_shown` so the wizard isn't auto-hidden.
      • Setting `replay_mode=True` which makes
        `get_onboarding_progress` ignore live-data auto-detection
        until the user has re-completed every step in order.
    """
    await db.onboarding_progress.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "dismissed": False,
                "manually_dismissed": False,
                "resume_banner_hidden": False,
                "celebration_shown": False,
                "completed_steps": {},
                "replay_mode": True,
                "replay_started_at": datetime.now(timezone.utc).isoformat(),
                "user_id": current_user["id"],
            }
        },
        upsert=True,
    )
    return {"success": True, "replay_mode": True}


# ===================== QUICK-START TEMPLATES =====================

SCENARIO_TEMPLATES = {
    "hospice": {
        "name": "Hospice Care",
        "description": "For families with a loved one in hospice care. Focuses on immediate comfort, document gathering, and family communication.",
        "icon": "heart",
        "items": [
            {
                "title": "Gather all existing legal documents",
                "description": "Collect wills, trusts, powers of attorney, healthcare directives, and any other legal paperwork. Store originals in a safe place and upload copies to your CarryOn vault.",
                "category": "legal",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Verify healthcare directive is current",
                "description": "Ensure the healthcare directive (living will) reflects current wishes. Confirm it names the correct healthcare proxy.",
                "category": "medical",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Confirm Power of Attorney is in place",
                "description": "Verify both financial and healthcare POA documents are executed and that agents know their responsibilities.",
                "category": "legal",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Contact hospice social worker",
                "description": "The hospice social worker can help with advance care planning, family meetings, and connecting you with community resources.",
                "category": "medical",
                "priority": "high",
                "due_timeframe": "immediate",
            },
            {
                "title": "Notify life insurance companies",
                "description": "Contact all life insurance carriers. Some policies have accelerated death benefit provisions for terminal illness.",
                "category": "insurance",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Review beneficiary designations",
                "description": "Check beneficiary designations on retirement accounts (401k, IRA), life insurance, and bank accounts. These override the will.",
                "category": "financial",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Document digital accounts and passwords",
                "description": "Create a list of all online accounts, passwords, and digital assets. Store securely in your Digital Access Vault (DAV).",
                "category": "personal",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Record personal messages and wishes",
                "description": "If able, record video or written messages for loved ones. These become priceless treasures. Use CarryOn Milestone Messages.",
                "category": "personal",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Discuss funeral and memorial preferences",
                "description": "Have a gentle conversation about wishes for services, burial vs. cremation, music, readings, and any cultural or religious traditions.",
                "category": "personal",
                "priority": "medium",
                "due_timeframe": "first_week",
            },
            {
                "title": "Review property ownership and titles",
                "description": "Check how real estate, vehicles, and other titled property are held. Joint tenancy and TOD designations can avoid probate.",
                "category": "property",
                "priority": "medium",
                "due_timeframe": "two_weeks",
            },
            {
                "title": "Organize financial accounts overview",
                "description": "List all bank accounts, investment accounts, pensions, Social Security information, and outstanding debts.",
                "category": "financial",
                "priority": "medium",
                "due_timeframe": "two_weeks",
            },
            {
                "title": "Contact Veterans Affairs (if applicable)",
                "description": "If the person is a veteran, contact the VA for burial benefits, flag for casket, and survivor benefits information.",
                "category": "government",
                "priority": "medium",
                "due_timeframe": "two_weeks",
            },
            {
                "title": "Prepare obituary and contact list",
                "description": "Draft an obituary and compile a list of people to notify. Include colleagues, friends, religious community, and professional contacts.",
                "category": "personal",
                "priority": "low",
                "due_timeframe": "two_weeks",
            },
            {
                "title": "Review and update estate plan with attorney",
                "description": "Schedule a meeting with an estate planning attorney to review the complete plan and ensure everything is properly executed.",
                "category": "legal",
                "priority": "medium",
                "due_timeframe": "first_month",
            },
        ],
    },
    "military": {
        "name": "Military Deployment",
        "description": "For service members preparing for deployment. Covers powers of attorney, family readiness, and contingency planning.",
        "icon": "shield",
        "items": [
            {
                "title": "Execute Military Power of Attorney",
                "description": "Use JAG office to create a military-specific POA. This is recognized in all 50 states and covers financial, legal, and personal decisions.",
                "category": "legal",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Update SGLI beneficiary designation",
                "description": "Review and update Servicemembers' Group Life Insurance (SGLI) beneficiaries. This is separate from your will.",
                "category": "insurance",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Create or update your will",
                "description": "JAG provides free will preparation. Ensure it covers guardianship of minor children, asset distribution, and executor designation.",
                "category": "legal",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Complete Family Care Plan (if single parent)",
                "description": "Required for single parents and dual-military couples. Designate short-term and long-term caregivers for beneficiaries.",
                "category": "personal",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Set up allotments and auto-pay",
                "description": "Ensure mortgage, utilities, insurance, and other bills are on auto-pay. Set up allotments for family support.",
                "category": "financial",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Provide spouse/family member with account access",
                "description": "Share bank account access, investment login credentials, and important account information. Use CarryOn Digital Access Vault (DAV).",
                "category": "financial",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Record personal messages for family",
                "description": "Record video messages for birthdays, holidays, and milestones you might miss. Use CarryOn Milestone Messages for timed delivery.",
                "category": "personal",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Review healthcare directive",
                "description": "Ensure advance healthcare directive covers your wishes if incapacitated. Discuss preferences with your designated agent.",
                "category": "medical",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Upload important documents to vault",
                "description": "Upload marriage certificate, birth certificates, vehicle titles, mortgage documents, and insurance policies to your secure vault.",
                "category": "legal",
                "priority": "medium",
                "due_timeframe": "two_weeks",
            },
            {
                "title": "Contact unit Family Readiness Group",
                "description": "Connect your family with the FRG for support, resources, and community during deployment.",
                "category": "personal",
                "priority": "medium",
                "due_timeframe": "two_weeks",
            },
        ],
    },
    "new_parent": {
        "name": "New Parent",
        "description": "For new parents who want to protect their growing family. Focuses on guardianship, insurance, and future planning.",
        "icon": "baby",
        "items": [
            {
                "title": "Designate a legal guardian for your child",
                "description": "The most important step: choose and legally designate who would raise your child. This MUST be in your will.",
                "category": "legal",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Create or update your will",
                "description": "Your will should name guardians, specify any trusts for your child, and designate how assets should be managed for them.",
                "category": "legal",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Get or increase life insurance",
                "description": "Rule of thumb: 10-12x annual income. Consider a 20-year term policy that covers until your child is independent.",
                "category": "insurance",
                "priority": "critical",
                "due_timeframe": "first_week",
            },
            {
                "title": "Add child to health insurance",
                "description": "You typically have 30 days from birth to add your newborn. Don't miss this window.",
                "category": "insurance",
                "priority": "critical",
                "due_timeframe": "first_week",
            },
            {
                "title": "Update beneficiary designations",
                "description": "Add your child as contingent beneficiary on retirement accounts and life insurance. Consider a trust as beneficiary for minors.",
                "category": "financial",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Start a 529 education savings plan",
                "description": "The earlier you start, the more time for compound growth. Even small monthly contributions add up significantly.",
                "category": "financial",
                "priority": "medium",
                "due_timeframe": "two_weeks",
            },
            {
                "title": "Create a family emergency binder",
                "description": "Compile all important documents, account numbers, emergency contacts, and medical information in one place.",
                "category": "personal",
                "priority": "medium",
                "due_timeframe": "two_weeks",
            },
            {
                "title": "Consider disability insurance",
                "description": "Your ability to earn is your biggest asset. Long-term disability insurance protects your family if you can't work.",
                "category": "insurance",
                "priority": "medium",
                "due_timeframe": "first_month",
            },
            {
                "title": "Record a message for your child's 18th birthday",
                "description": "Write or record something your child can receive when they turn 18. Use CarryOn Milestone Messages with age-triggered delivery.",
                "category": "personal",
                "priority": "low",
                "due_timeframe": "first_month",
            },
        ],
    },
    "recently_married": {
        "name": "Recently Married",
        "description": "For newlyweds combining lives and finances. Covers name changes, account consolidation, and joint planning.",
        "icon": "rings",
        "items": [
            {
                "title": "Update your will to include spouse",
                "description": "If you have an existing will, update it. If not, create one. Your spouse should be addressed in your estate plan.",
                "category": "legal",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Update beneficiary designations",
                "description": "Update beneficiaries on all retirement accounts (401k, IRA), life insurance policies, and bank accounts to include your spouse.",
                "category": "financial",
                "priority": "critical",
                "due_timeframe": "immediate",
            },
            {
                "title": "Review and combine insurance policies",
                "description": "Compare auto, home/renters, and health insurance. Combining policies often saves money and improves coverage.",
                "category": "insurance",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Create healthcare directives for both spouses",
                "description": "Each spouse should have an advance healthcare directive naming the other as healthcare proxy.",
                "category": "medical",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Set up powers of attorney",
                "description": "Create financial and healthcare POAs for both spouses. This protects both of you in case of incapacity.",
                "category": "legal",
                "priority": "high",
                "due_timeframe": "first_week",
            },
            {
                "title": "Discuss and document financial accounts",
                "description": "Share all account information with each other. Decide what to keep separate vs. joint. Store details in CarryOn Digital Access Vault (DAV).",
                "category": "financial",
                "priority": "high",
                "due_timeframe": "two_weeks",
            },
            {
                "title": "Update Social Security name (if applicable)",
                "description": "If changing your name, update with SSA first. This must be done before updating other documents.",
                "category": "government",
                "priority": "medium",
                "due_timeframe": "two_weeks",
            },
            {
                "title": "Review property titles and deeds",
                "description": "Ensure property ownership is structured correctly (joint tenancy, tenancy by entirety, etc.) based on your state.",
                "category": "property",
                "priority": "medium",
                "due_timeframe": "first_month",
            },
            {
                "title": "Consider life insurance needs",
                "description": "Evaluate whether current coverage is sufficient now that you have a spouse depending on your income.",
                "category": "insurance",
                "priority": "medium",
                "due_timeframe": "first_month",
            },
        ],
    },
}


class TemplateApplyRequest(BaseModel):
    estate_id: str
    template_id: str


@router.get("/templates/scenarios")
async def get_scenario_templates(current_user: dict = Depends(get_current_user)):
    """Get all available quick-start checklist templates."""
    templates = []
    for tid, tdata in SCENARIO_TEMPLATES.items():
        templates.append(
            {
                "id": tid,
                "name": tdata["name"],
                "description": tdata["description"],
                "icon": tdata["icon"],
                "item_count": len(tdata["items"]),
            }
        )
    return templates


@router.post("/templates/apply")
async def apply_scenario_template(data: TemplateApplyRequest, current_user: dict = Depends(get_current_user)):
    """Apply a quick-start template to an estate's checklist."""
    if current_user["role"] not in ("benefactor", "admin"):
        raise HTTPException(status_code=403, detail="Only benefactors can apply templates")

    template = SCENARIO_TEMPLATES.get(data.template_id)
    if not template:
        raise HTTPException(status_code=404, detail=f"Template not found: {data.template_id}")

    # Get existing items to avoid duplicates
    existing = await db.checklists.find({"estate_id": data.estate_id}, {"_id": 0, "id": 1, "title": 1}).to_list(500)
    existing_titles = {item["title"].lower().strip() for item in existing}

    current_count = len(existing)
    items_added = 0

    for idx, item in enumerate(template["items"]):
        if item["title"].lower().strip() in existing_titles:
            continue

        checklist_item = ChecklistItem(
            estate_id=data.estate_id,
            title=item["title"],
            description=item["description"],
            category=item["category"],
            priority=item["priority"],
            due_timeframe=item["due_timeframe"],
            order=current_count + items_added + 1,
            created_by="template",
        )
        await db.checklists.insert_one(checklist_item.model_dump())
        items_added += 1

    await update_estate_readiness(data.estate_id)

    return {
        "success": True,
        "template": template["name"],
        "items_added": items_added,
        "message": f"{items_added} items from '{template['name']}' added to your checklist",
    }
