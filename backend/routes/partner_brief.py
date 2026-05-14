"""CarryOn™ — Partner Brief content storage.

Powers the public, shareable B2B partner brief at /partner-brief and the
admin editor at Admin → Marketing → Sales Brief.

The content is fully editable from the founder portal. We store ONE
document keyed by ``_id = "current"`` in the ``partner_brief_content``
collection. If the collection is empty (fresh install, or after a
reset), we fall back to ``DEFAULTS`` defined below.

Endpoints:
    GET  /api/partner-brief              public — returns the live brief
    PUT  /api/partner-brief              founder/marketing — saves edits
    POST /api/partner-brief/reset        founder/marketing — restores defaults

The shape of the document is intentionally flat and forgiving: if the
admin saves a partial document, GET merges it over DEFAULTS so a
typo or missing key never blanks the public page.
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from config import db
from guards import require_admin_scope
from utils import get_current_user

router = APIRouter()


# ── Default content (shipped with the app; matches the original
# PartnerBriefPage hardcoded copy 1:1 so an unconfigured deploy still
# shows the founder-approved version). Edit here to change the seed.
DEFAULTS: dict[str, Any] = {
    "header": {
        "eyebrow": "For partners thinking about working with CarryOn",
        "title": "CarryOn™ Partner Brief",
        "intro": (
            "A short overview of the platform, the ten pillars, and how each one "
            "fits the kinds of businesses we partner with — life insurance, "
            "financial planning, funeral homes, estate planning attorneys, and "
            "other related industries. Our team uses this brief to screen "
            "partner calls before a discovery call with the founder."
        ),
    },
    "one_breath": {
        "title": "1. The platform in one breath",
        "quote": (
            "CarryOn™ is the digital family preparedness platform that brings "
            "together every aspect of a person’s life — so they and their loved "
            "ones can carry on through anything."
        ),
        "paragraph": (
            "A single, secure platform where someone organizes their entire life "
            "picture — important documents, financial accounts, digital logins, "
            "who needs to be told what when something happens, recorded messages "
            "for loved ones at future life moments, and an AI guide that can "
            "answer their family’s questions when they’re not there to. It’s "
            "built so the family is genuinely ready, not scrambling."
        ),
    },
    "pillars": {
        "title": "2. The Ten Pillars of Family Readiness",
        "intro": (
            "These are the official names we use everywhere in CarryOn. Always include the ™ on Estate Guardian."
        ),
        "items": [
            {
                "n": "01",
                "name": "Milestone Messages",
                "abbr": "MM",
                "desc": (
                    "Recorded video, audio, or written messages a benefactor leaves for the milestones "
                    "they want to be part of — graduations, weddings, births, birthdays, or any moment "
                    "they choose. Created infinitely over time and delivered exactly as the benefactor "
                    "envisioned, even if they can't be there."
                ),
            },
            {
                "n": "02",
                "name": "Secure Document Vault",
                "abbr": "SDV",
                "desc": (
                    "An AES-256 encrypted, per-estate vault for the documents a family will actually "
                    "need — wills, trusts, deeds, insurance policies, medical directives. Triple-Lock "
                    "protected; the benefactor decides who sees what and when. The vault is also the "
                    "foundation that powers Estate Guardian™, the Immediate Action Checklist, and "
                    "the rest of the platform."
                ),
            },
            {
                "n": "03",
                "name": "Estate Guardian™ AI",
                "abbr": "EGA",
                "desc": (
                    "An AI estate-law analyst trained on U.S. law across all 50 states, working "
                    "entirely inside the benefactor's encrypted vault. EGA reviews their documents "
                    "for gaps, contradictions, outdated provisions, and missing pieces — surfacing "
                    "details like claim phone numbers, executor contacts, and filing deadlines, and "
                    "auto-populating the beginnings of the family's Immediate Action Checklist. No "
                    "human team reads the documents."
                ),
            },
            {
                "n": "04",
                "name": "Immediate Action Checklist",
                "abbr": "IAC",
                "desc": (
                    "A step-by-step playbook for what the family needs to do on the hardest days of "
                    "their lives. Partially auto-created by Estate Guardian™ from the documents in "
                    "the vault and fully customizable — so when a crisis hits, the family knows "
                    "exactly what to do, who to call, where every document lives, and what deadlines "
                    "matter."
                ),
            },
            {
                "n": "05",
                "name": "CarryOn Contingency Protocols",
                "abbr": "CCP",
                "desc": (
                    "Pre-built response plans for the scenarios a family might face — medical "
                    "emergencies, natural disasters, financial disruptions, incapacity, or the "
                    "passing of a loved one. A Tap-to-Create Wizard walks the benefactor through "
                    "building a protocol in minutes, connecting people, documents, checklists, and "
                    "communication channels into one coordinated plan the family can execute together."
                ),
            },
            {
                "n": "06",
                "name": "Estate Communications Tool",
                "abbr": "ECT",
                "desc": (
                    "Secure, end-to-end encrypted family messaging that doesn't depend on a phone "
                    "number or a specific device — so a beneficiary can log in from a friend's phone, "
                    "a library computer, or a FEMA trailer after a disaster and pick up exactly where "
                    "the family left off. Group and direct messaging, voice notes, image sharing, "
                    "location sharing, and message pinning. When a contingency protocol activates, "
                    "ECT is how the family coordinates."
                ),
            },
            {
                "n": "07",
                "name": "Digital Access Vault",
                "abbr": "DAV",
                "desc": (
                    "Encrypted storage for the modern family's digital credentials — banking and "
                    "brokerage logins, email, social, subscription accounts, password-manager seeds, "
                    "and crypto wallet keys — assigned to specific beneficiaries so nothing is lost "
                    "and nothing is forgotten."
                ),
            },
            {
                "n": "08",
                "name": "Friends & Family Notification",
                "abbr": "FFN",
                "desc": (
                    "A personalized notification list of family, friends, colleagues, and anyone the "
                    "beneficiaries should reach during a transition or emergency. Names, phone "
                    "numbers, relationships, and special notes — organized so the people who matter "
                    "most never hear the news through the grapevine."
                ),
            },
            {
                "n": "09",
                "name": "CarryOn Financial Picture",
                "abbr": "CFP",
                "desc": (
                    "A complete, encrypted picture of the household's financial life — bank accounts, "
                    "investment portfolios, insurance policies, bills, debts, and properties — with "
                    "balances tracked, anomalies flagged, and the right contact info attached to "
                    "every entry. When transition happens, the family sees the full financial "
                    "picture instantly instead of hunting through file cabinets and scattered logins."
                ),
            },
            {
                "n": "10",
                "name": "Beneficiary Estate Concierge",
                "abbr": "BEC",
                "desc": (
                    "An AI concierge that activates for beneficiaries after transition. Beneficiaries "
                    "can ask plain-English questions — \u201cWhere is the life insurance?\u201d "
                    "\u201cWho's the executor?\u201d \u201cWhat did Dad want for the cabin?\u201d — "
                    "and the Concierge answers using only the documents the benefactor specifically "
                    "released to them, with inline citations linking each answer back to the exact "
                    "source document. Clarity on the worst day of their life, without hunting through "
                    "a folder of PDFs."
                ),
            },
        ],
        "foundational": (
            "Building block (not one of the ten pillars): Beneficiaries — every "
            "pillar is built around the people the user has named as their "
            "beneficiaries, with separate permissions for each person. The "
            "benefactor decides who sees what, and when."
        ),
    },
    "verticals": {
        "title": "3. How it fits each kind of partner",
        "intro": "For each industry: what problem they want to solve, which pillars matter most to them, and the screening questions our team will ask.",
        "items": [
            {
                "id": "life-insurance",
                "title": "A. Life Insurance Agents / Brokers",
                "cares": [
                    'Higher policy retention — clients are less likely to cancel when they feel "set up."',
                    "Better claims experience — beneficiaries know the policy exists, can find it, and can act on it without a 6-month battle.",
                    "Standing out in a crowded market — they want to be the agent who also helped the family get organized.",
                    "Peace of mind on compliance: nothing in CarryOn changes or replaces the policy itself.",
                ],
                "pillars": "SDV (where the policy lives), EGA (analyzes the benefactor’s estate plan for gaps so the policy is properly named in the right documents), FFN (the agent gets notified when something happens), IAC (claims-filing step lives in the checklist), CFP (the policy shows up in the household financial picture), BEC (after the benefactor passes, beneficiaries can ask the AI Concierge \u201cwhere is the policy?\u201d and get a cited answer pulled from the documents the benefactor released to them).",
                "questions": [
                    "Are you looking for a tool to offer to the clients you already have, or a way to get referrals and earn on new clients you bring in?",
                    "Roughly how many policies do you have under management?",
                    'Do you currently offer any kind of "family preparedness" or "legacy" service to clients today, even informally?',
                    "Are you part of a larger agency / IMO / FMO, or independent?",
                ],
                "disqualify": "They’re really looking for a CRM, a quoting engine, or a lead-generation service. We’re not those.",
            },
            {
                "id": "financial-planners",
                "title": "B. Financial Planners / Wealth Advisors / RIAs",
                "cares": [
                    'Estate-planning gap: clients have wealth but no organized "when something happens" plan for the family.',
                    "Standing out from other advisors: wealthy clients more and more expect a complete family-readiness plan, not just money advice.",
                    "Keeping the family relationship: when the primary client passes, the surviving spouse often leaves the advisor within 2 years. CarryOn keeps the family inside an organized hand-off.",
                    "Peace of mind for compliance: CarryOn doesn’t give financial advice — it just organizes what the advisor and client have already decided.",
                ],
                "pillars": "CFP (full household picture), SDV (estate documents in one place), EGA (an estate-law AI that spots gaps in the client’s plan and gives the advisor a clean punch-list to address), MM (the personal-legacy piece advisors can’t deliver themselves), CCP (plans for accident or incapacity), DAV (the digital-access gap most advisors quietly worry about), BEC (after transition, the surviving spouse / heirs can ask the AI Concierge plain-English questions about the plan and get cited answers from the documents the benefactor designated — keeps the family from feeling lost on day one).",
                "questions": [
                    "What does your current family hand-off look like today when a client passes or becomes incapacitated?",
                    "Are you AUM-based, fee-only, hybrid? (Just for context — affects how a partnership would feel for them.)",
                    "Roughly how many client households, and what’s the typical age range of the primary client?",
                    "Do you work inside a broker-dealer / RIA umbrella, or independently?",
                    "Have you had a client family go through a death or major life event in the last 18 months? (If yes, gently ask what that hand-off looked like.)",
                ],
                "disqualify": "",
            },
            {
                "id": "funeral-homes",
                "title": "C. Funeral Homes / Cemetery Operators / Pre-Need Planners",
                "cares": [
                    "Pre-need conversion: families who plan ahead spend more, dispute less, and refer more.",
                    "After-care: the grieving family doesn’t just need a service — they need help with the next 90 days.",
                    "Standing out from the big corporate chains — independents need a digital story.",
                    "Their families are often older and not comfortable with new tech — they need something a 70-year-old will actually use.",
                ],
                "pillars": 'IAC (the "first 30 days after death" page), FFN (notifying the right people, in the right order, in the family\u2019s voice), MM (the legacy piece — funeral homes are more and more being asked for video tribute services), SDV (death certificate, obituary draft, service plan), BEC (the AI Concierge gives the grieving family answers from the benefactor\u2019s actual documents — exactly what funeral homes wish they could give every family but can\u2019t deliver themselves).',
                "questions": [
                    "Do you offer pre-need / pre-arrangement today, and what does that intake look like?",
                    "Are you independent, part of a regional chain, or part of a bigger company?",
                    "Do you have an after-care program — six-month follow-ups, grief resources?",
                    "Roughly how many services per year? (Sizing question — DON’T quote pricing.)",
                    "Are you thinking about offering this to families at intake, including it in pre-need, or just referring to it as an after-care partner?",
                ],
                "disqualify": "",
            },
            {
                "id": "estate-attorneys",
                "title": "D. Estate Planning Attorneys / Trust & Estate Firms",
                "cares": [
                    "Their work product (the will, the trust, the POA) sits in a drawer until the day it’s needed — and on that day, the family can’t find it, doesn’t understand it, and calls the attorney in a panic.",
                    "Getting the documents to the family and explaining them is the slowest part of their job — they want the document actually used right, not just filed away.",
                    "Legal-risk comfort: nothing the family does inside CarryOn replaces or contradicts the actual legal document.",
                    "They want to look modern to younger clients without having to learn new software themselves.",
                ],
                "pillars": "SDV (their documents live there, locked and released correctly), EGA (an estate-law AI that flags gaps and contradictions in the client’s plan — gives the attorney a clean punch-list), IAC (the action checklist their POA / executor will actually use), DAV (the digital-account access the will references but the family can never find), CCP (separate plans for incapacity vs death), BEC (after death, the heirs can ask the AI Concierge plain-English questions grounded in the documents the attorney drafted — fewer panicked calls back to the firm).",
                "questions": [
                    "How does your firm currently hand the signed plan off to the client family today — paper copy, secure portal, document vault?",
                    "Do you offer plan-review or update services after the will is signed, or is it mostly one-time per client?",
                    "Roughly how many active client families, and how many new plans per year?",
                    "Are you a solo / small specialty firm, or part of a larger Trust & Estate practice?",
                    "Do you already use a document portal vendor (Trust & Will, Wealth.com, Vanilla, EncoreEstate)? (Asking because that affects how a partnership would feel — NOT to compare features.)",
                ],
                "disqualify": "",
            },
        ],
    },
    "adjacent": {
        "title": "4. Other related industries",
        "items": [
            {
                "name": "Employee-benefits brokers / HR-tech",
                "frame": "Selling CarryOn as a workplace benefit. Pillars: full ten, presented as financial-wellness + family-preparedness. Screen on plan-sponsor count, age skew, current EAP / financial-wellness offering.",
            },
            {
                "name": "Hospice / palliative care providers",
                "frame": "CarryOn is free for every American in hospice care — so this is a referral / awareness partnership, not a paid one. Pillars: IAC, MM, SDV, FFN, CCP. Screen on patient volume + service area.",
            },
            {
                "name": "Religious communities / clergy",
                "frame": 'Same family-preparedness pitch, often paired with a "blessing the plan" intake. Pillars: MM (legacy messages), FFN (community notification), IAC. Screen on congregation size + member-benefit vs referral.',
            },
            {
                "name": "Military / veteran service organizations",
                "frame": 'CarryOn has Military and Veteran tier discounts. Pillars: full ten, presented as "leave nothing for your family to figure out." Screen on org type, member count, and how often members deploy if active-duty.',
            },
            {
                "name": "Senior-living operators / CCRCs",
                "frame": "Resident move-in and family-coordination angle. Pillars: full ten. Screen on resident count, independent vs assisted vs memory-care mix.",
            },
        ],
    },
    "screening": {
        "title": "5. How to run the call",
        "intro": "Your job on a first call is to listen, screen, and schedule — not to demo, give pricing, or explain the platform in detail.",
        "escalated_label": "Always send to the founder",
        "escalated": [
            "White-label or co-branding requests.",
            "API access, SSO, data integrations.",
            "Pricing, revenue share, referral fees.",
            "HIPAA / SOC 2 / GDPR specifics, data residency, encryption-at-rest details.",
            "Roadmap or unreleased features.",
            "Anyone wanting to buy, invest in, or merge with CarryOn.",
            "Specific integrations with named vendors.",
            "Anything starting with “Could CarryOn build…” or “Would you be willing to…”",
        ],
        "captured_label": "Write down on every call",
        "captured": [
            "Full name, title, company, email, mobile.",
            "Industry and rough company size.",
            "Independent or part of a larger company.",
            "Why now? — what made them reach out this week.",
            "Are they the decision-maker, or just researching for someone else?",
            "The specific feature or use case they led with — write it down word-for-word.",
            "Location, who referred them, and anything they want the founder to know up front.",
        ],
    },
    "elevator": {
        "title": "6. Quick reference — short answers",
        "intro": "Ten-second answers, not demos. The point is to keep the call moving toward a discovery call with the founder.",
        "items": [
            {
                "abbr": "MM",
                "line": "Pre-recorded video, audio, or written messages, delivered to specific loved ones at the milestones the benefactor chose — created infinitely over time and delivered exactly as the benefactor envisioned.",
            },
            {
                "abbr": "SDV",
                "line": "AES-256 encrypted, per-estate document vault for wills, trusts, policies, deeds — Triple-Lock protected and released to the right person at the right time.",
            },
            {
                "abbr": "EGA",
                "line": "An estate-law AI inside the benefactor\u2019s vault that finds gaps and contradictions across all 50 states\u2019 laws, surfaces critical details, and auto-starts the family\u2019s action plan. No human team reads the documents.",
            },
            {
                "abbr": "IAC",
                "line": "Personalized step-by-step playbook for the first hours, days, and weeks after transition. Partially auto-created by Estate Guardian\u2122; fully customizable by the benefactor.",
            },
            {
                "abbr": "CCP",
                "line": "Tap-to-Create response plans for accident, incapacity, disaster, or death — with people, documents, checklists, and channels pre-wired into one coordinated plan.",
            },
            {
                "abbr": "ECT",
                "line": "Family-only end-to-end encrypted messaging that works from any device — no phone number required, so a beneficiary can log in from a friend\u2019s phone or a library computer and stay in sync.",
            },
            {
                "abbr": "DAV",
                "line": "Encrypted storage for logins, password-manager seeds, and crypto keys, assigned to specific beneficiaries so nothing is lost.",
            },
            {
                "abbr": "FFN",
                "line": "Personalized contact list so the family can notify the right people in the right order — and nobody who matters most hears the news through the grapevine.",
            },
            {
                "abbr": "CFP",
                "line": "Living, encrypted picture of bank accounts, portfolios, policies, bills, debts, and properties — so the family knows what\u2019s owed, owned, and who to call.",
            },
            {
                "abbr": "BEC",
                "line": "An AI concierge for beneficiaries — answers post-transition questions in plain English, grounded only in the documents the benefactor designated for them, with inline citations to the exact source.",
            },
        ],
    },
    "footer": {
        "line1": "Discovery calls and demos are run personally by the founder on the live platform. To schedule, reply to the introduction that brought you here.",
        "line2": "CarryOn™ · Confidential. For partners only — not a public marketing document.",
    },
}


def _merge(base: Any, overlay: Any) -> Any:
    """Deep-merge ``overlay`` over ``base`` so a partial admin save never
    blanks unset fields. Lists in overlay replace lists in base wholesale
    (otherwise reordering / deletes wouldn't work)."""
    if isinstance(base, dict) and isinstance(overlay, dict):
        out = dict(base)
        for k, v in overlay.items():
            out[k] = _merge(base.get(k), v) if k in base else v
        return out
    return overlay if overlay is not None else base


@router.get("/partner-brief")
async def get_partner_brief() -> dict[str, Any]:
    """Public — returns the live partner-brief content document.
    Falls back to DEFAULTS for any keys the admin hasn't customized."""
    doc = await db.partner_brief_content.find_one({"_id": "current"}, {"_id": 0})
    saved_content = doc.get("content") if doc else None
    content = _merge(DEFAULTS, saved_content) if saved_content else DEFAULTS
    return {"content": content, "is_customized": doc is not None}


@router.put("/partner-brief")
async def update_partner_brief(
    payload: dict[str, Any],
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Founder + marketing scope only — overwrite the brief."""
    require_admin_scope(current_user, ["marketing"])
    content = payload.get("content")
    if not isinstance(content, dict):
        raise HTTPException(status_code=400, detail="content must be an object")
    doc = {
        "_id": "current",
        "content": content,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("email") or current_user.get("id"),
    }
    await db.partner_brief_content.replace_one(
        {"_id": "current"},
        doc,
        upsert=True,
    )
    merged = _merge(DEFAULTS, content)
    return {"content": merged, "is_customized": True, "updated_at": doc["updated_at"]}


@router.post("/partner-brief/reset")
async def reset_partner_brief(
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Founder + marketing scope only — restore the seed defaults
    by deleting the customized document. Subsequent GETs return DEFAULTS."""
    require_admin_scope(current_user, ["marketing"])
    await db.partner_brief_content.delete_one({"_id": "current"})
    return {"content": DEFAULTS, "is_customized": False}
