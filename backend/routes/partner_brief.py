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
        "eyebrow": "For partners considering a CarryOn relationship",
        "title": "CarryOn™ Partner Brief",
        "intro": (
            "An overview of the platform, the nine pillars, and how each maps to "
            "the businesses we partner with — life insurance, financial planning, "
            "funeral homes, estate planning attorneys, and adjacent verticals. "
            "Used by our team to qualify partner conversations before a discovery "
            "call with the founder."
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
        "title": "2. The Nine Pillars of Family Readiness",
        "intro": (
            "These are the canonical names used across all CarryOn surfaces. "
            "The TM mark on Estate Guardian is required."
        ),
        "items": [
            {
                "n": "01",
                "name": "Milestone Messages",
                "abbr": "MM",
                "desc": "Recorded video, audio, or written messages a person leaves to be delivered to specific loved ones at specific future moments — a wedding, a graduation, a 30th birthday, the day after they pass.",
            },
            {
                "n": "02",
                "name": "Secure Document Vault",
                "abbr": "SDV",
                "desc": "Encrypted storage for the documents a family will actually need — wills, trusts, deeds, insurance policies, medical directives — sealed and released to the right people at the right time.",
            },
            {
                "n": "03",
                "name": "Estate Guardian™ AI",
                "abbr": "EGA",
                "desc": "An AI assistant trained on this specific family’s plan that can answer the family’s questions when the person isn’t there — “where is dad’s life insurance?”, “what did mom want for the house?”",
            },
            {
                "n": "04",
                "name": "Immediate Action Checklist",
                "abbr": "IAC",
                "desc": "A step-by-step playbook of what to do in the first hours, days, and weeks after someone passes — personalized to that family’s situation.",
            },
            {
                "n": "05",
                "name": "CarryOn Contingency Protocols",
                "abbr": "CCP",
                "desc": "Pre-authored emergency plans the person sets up while healthy — what to do if they’re in an accident, hospitalized, declared incapacitated, or pass — with the right people pre-notified and the right documents pre-routed.",
            },
            {
                "n": "06",
                "name": "Estate Communications Tool",
                "abbr": "ECT",
                "desc": "A private, family-only secure messaging space — so coordination during a hard time happens inside the platform, not on group texts that get forwarded or screenshotted.",
            },
            {
                "n": "07",
                "name": "Digital Access Vault",
                "abbr": "DAV",
                "desc": "Encrypted storage for digital account credentials — banking, email, social, password manager, crypto wallet keys — so the family can actually GET INTO the accounts the will mentions.",
            },
            {
                "n": "08",
                "name": "Family & Friends Notification",
                "abbr": "FFN",
                "desc": "Coordinated, dignified notification of everyone who needs to know — in the order and through the channel the person chose, while they were the one writing the message.",
            },
            {
                "n": "09",
                "name": "CarryOn Financial Picture",
                "abbr": "CFP",
                "desc": "A complete, living picture of the household’s bills, debts, accounts, and properties — so the family knows what’s owed, what’s owned, and what to do with all of it.",
            },
        ],
        "foundational": (
            "Foundational element (not a pillar): Beneficiaries — every pillar is "
            "built around designated beneficiaries with role-based, granular "
            "access. The benefactor decides who sees what, when."
        ),
    },
    "verticals": {
        "title": "3. Use cases by partner vertical",
        "intro": "For each vertical: what they’re solving for, which pillars resonate first, and the qualifying questions our team will ask.",
        "items": [
            {
                "id": "life-insurance",
                "title": "A. Life Insurance Agents / Brokers",
                "cares": [
                    'Higher policy retention (clients lapse less when they feel "set up").',
                    "Better claims experience — beneficiaries know the policy exists, can find it, can act on it without a 6-month battle.",
                    "Differentiation in a commoditized market — they want to be the agent who also helped the family get organized.",
                    "Compliance comfort: nothing in CarryOn replaces or alters the policy itself.",
                ],
                "pillars": 'SDV (where the policy lives), EGA (so the family can ask "where’s dad’s policy"), FFN (the agent gets notified when a transition event occurs), IAC (claims-filing step lives in the checklist), CFP (policy shows up in the household financial picture).',
                "questions": [
                    "Are you looking for a tool to offer your existing book of business, or are you exploring this as a referral / affiliate channel for new client acquisition?",
                    "Roughly how many policies do you have under management?",
                    'Do you currently have any post-sale "family preparedness" or "legacy" service you offer clients today, even informally?',
                    "Are you part of a larger agency / IMO / FMO, or independent?",
                ],
                "disqualify": "They’re really looking for a CRM, a quoting engine, or a lead-generation service. We’re not those.",
            },
            {
                "id": "financial-planners",
                "title": "B. Financial Planners / Wealth Advisors / RIAs",
                "cares": [
                    'Estate-planning gap: clients have wealth but no organized "go-time" plan for the family.',
                    "Practice differentiation: high-net-worth clients increasingly expect holistic family-readiness support.",
                    "Continuity: when the primary client passes, the surviving spouse often leaves the advisor within 2 years. CarryOn keeps the family inside an organized hand-off.",
                    "Fiduciary comfort: CarryOn doesn’t give financial advice; it organizes what the advisor and client have already decided.",
                ],
                "pillars": "CFP (full household picture), SDV (estate documents in one place), EGA (family asks the AI, not the advisor at 11pm), MM (the human-legacy piece advisors can’t deliver themselves), CCP (incapacity protocols), DAV (the digital-access gap most advisors quietly worry about).",
                "questions": [
                    "What does your current estate-organization handoff look like for a client family today?",
                    "Are you AUM-based, fee-only, hybrid? (Just for context — affects how a partnership would feel for them.)",
                    "Roughly how many client households, and what’s the typical age range of the primary?",
                    "Do you work inside a broker-dealer / RIA umbrella, or independently?",
                    "Have you had a client family go through a transition event in the last 18 months? (If yes, ask gently what that hand-off looked like.)",
                ],
                "disqualify": "",
            },
            {
                "id": "funeral-homes",
                "title": "C. Funeral Homes / Cemetery Operators / Pre-Need Planners",
                "cares": [
                    "Pre-need conversion: families who plan ahead spend more, dispute less, and refer more.",
                    "After-care: the bereaved family doesn’t just need a service, they need help with the next 90 days.",
                    "Differentiation from corporate consolidators — independents need a digital story.",
                    "Their families are often older and tech-anxious — they need something a 70-year-old will actually use.",
                ],
                "pillars": 'IAC (the "first 30 days after death" surface), FFN (notifying the right people, in the right order, in the family’s voice), MM (the legacy piece — funeral homes are increasingly asked for video tribute services), SDV (death certificate, obituary draft, service plan).',
                "questions": [
                    "Do you offer pre-need / pre-arrangement today, and what does that intake look like?",
                    "Are you independent, part of a regional group, or under a larger umbrella?",
                    "Do you have an after-care program — six-month follow-ups, grief resources?",
                    "Roughly how many services per year? (Sizing question — DON’T quote pricing.)",
                    "Are you exploring this as something you’d offer at intake, give as part of pre-need, or refer to as an aftercare partner?",
                ],
                "disqualify": "",
            },
            {
                "id": "estate-attorneys",
                "title": "D. Estate Planning Attorneys / Trust & Estate Firms",
                "cares": [
                    "Their work product (the will, the trust, the POA) sits in a drawer until the day it’s needed — and on that day, the family can’t find it, doesn’t understand it, and calls the attorney in a panic.",
                    "Document delivery + family education is the bottleneck of their practice — they want the document used correctly, not just filed.",
                    "Liability comfort: anything the family does inside CarryOn must not contradict or substitute for the legal instrument.",
                    "They want to look modern to younger clients without learning new software themselves.",
                ],
                "pillars": "SDV (their documents live there, sealed and released correctly), EGA (the AI that explains the document to the family in plain English without giving legal advice), IAC (the action checklist their POA / executor will actually use), DAV (digital-asset access the will references but the family can never find), CCP (incapacity vs death protocols).",
                "questions": [
                    "How does your firm currently hand off the executed plan to the client family — copy, secure portal, document vault?",
                    "Do you offer plan-review or update services post-execution, or is it largely engagement-by-engagement?",
                    "Roughly how many active client families, and how many new plans per year?",
                    "Are you a solo / boutique firm, or part of a larger T&E practice?",
                    "Do you already use a document portal vendor (Trust & Will, Wealth.com, Vanilla, EncoreEstate)? (Asking because that affects how a partnership would feel — NOT to compare features.)",
                ],
                "disqualify": "",
            },
        ],
    },
    "adjacent": {
        "title": "4. Adjacent verticals",
        "items": [
            {
                "name": "Employee-benefits brokers / HR-tech",
                "frame": "Selling CarryOn as a workplace benefit. Pillars: full nine, framed as financial-wellness + family-preparedness. Qualify on plan-sponsor count, age skew, current EAP / financial-wellness offering.",
            },
            {
                "name": "Hospice / palliative care providers",
                "frame": "CarryOn is free for every American in hospice care — so this is a referral / awareness partnership, not a revenue partnership. Pillars: IAC, MM, SDV, FFN, CCP. Qualify on patient volume + service area.",
            },
            {
                "name": "Faith communities / clergy",
                "frame": 'Same family-preparedness frame, often paired with a "blessing the plan" intake. Pillars: MM (legacy messages), FFN (community notification), IAC. Qualify on congregation size + member-benefit vs referral.',
            },
            {
                "name": "Military / veteran service organizations",
                "frame": 'CarryOn has Military and Veteran tier discounts. Pillars: full nine, framed as "leave nothing for your family to figure out." Qualify on org type, member count, deployment cadence if active-duty.',
            },
            {
                "name": "Senior-living operators / CCRCs",
                "frame": "Resident-onboarding and family-coordination angle. Pillars: full nine. Qualify on resident count, independent vs assisted vs memory-care mix.",
            },
        ],
    },
    "screening": {
        "title": "5. Screening posture",
        "intro": "The team’s job on a first call is to listen, qualify, and book — not to demo, quote, or technically educate.",
        "escalated_label": "Always escalated to the founder",
        "escalated": [
            "White-label or co-branding requests.",
            "API access, SSO, data integrations.",
            "Pricing, revenue share, referral fees.",
            "HIPAA / SOC 2 / GDPR specifics, data residency, encryption-at-rest details.",
            "Roadmap or unreleased features.",
            "Acquisition, investment, or M&A conversations.",
            "Specific integrations with named vendors.",
            "Anything beginning with “Could CarryOn build…” or “Would you be willing to…”",
        ],
        "captured_label": "Captured on every screening call",
        "captured": [
            "Full name, title, company, email, mobile.",
            "Vertical and rough company size.",
            "Independent vs. part of a larger entity.",
            "Why now? — what prompted them to reach out this week.",
            "Decision-maker or scoping for one.",
            "The specific feature or use case they led with (verbatim).",
            "Geography, source of referral, anything they want the founder to know up front.",
        ],
    },
    "elevator": {
        "title": "6. Quick reference — elevator answers",
        "intro": "Ten-second confirmations, not demo scripts. Designed to keep the conversation moving toward a discovery call with the founder.",
        "items": [
            {
                "abbr": "MM",
                "line": "Pre-recorded video, audio, or written messages a person leaves to be delivered to specific loved ones at specific future moments.",
            },
            {
                "abbr": "SDV",
                "line": "Encrypted, beneficiary-keyed storage for the documents the family will actually need, released at the right time to the right person.",
            },
            {
                "abbr": "EGA",
                "line": "An AI guide trained on the family’s specific plan, so the family can ask questions and get answers grounded in this specific household — not generic advice.",
            },
            {
                "abbr": "IAC",
                "line": "A personalized step-by-step playbook for what to do in the hours, days, and weeks after someone passes.",
            },
            {
                "abbr": "CCP",
                "line": "Pre-authored emergency plans for accident, incapacity, hospitalization, or death — set up while the person is healthy, ready to fire when needed.",
            },
            {
                "abbr": "ECT",
                "line": "A private, family-only secure messaging space — so the hard conversations don’t happen on text threads or social media.",
            },
            {
                "abbr": "DAV",
                "line": "Encrypted credential storage so the family can actually access the digital accounts the will references.",
            },
            {
                "abbr": "FFN",
                "line": "Coordinated, dignified notification of everyone who needs to know, in the order and tone the person chose.",
            },
            {
                "abbr": "CFP",
                "line": "A complete, living picture of the household’s bills, debts, accounts, and properties — so the family knows what’s owed, owned, and what to do with it.",
            },
        ],
    },
    "footer": {
        "line1": "Discovery and demos are run personally by the founder on the live platform. To schedule, reply to the introduction that brought you here.",
        "line2": "CarryOn™ · Confidential. For partner consideration only — not a public marketing document.",
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
