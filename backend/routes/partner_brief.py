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
            "A short overview of the platform, the nine pillars, and how each one "
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
        "title": "2. The Nine Pillars of Family Readiness",
        "intro": (
            "These are the official names we use everywhere in CarryOn. Always include the ™ on Estate Guardian."
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
                "desc": "Encrypted storage for the documents a family will actually need — wills, trusts, deeds, insurance policies, medical directives — locked and released to the right people at the right time.",
            },
            {
                "n": "03",
                "name": "Estate Guardian™ AI",
                "abbr": "EGA",
                "desc": "A digital assistant that lives inside the benefactor’s vault, trained on the estate law of all 50 U.S. states. Its only job: review the documents in the vault and tell the benefactor where their estate plan has gaps, seams, or contradictions — so they can make it air-tight while they’re still alive to fix it.",
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
                "desc": "Pre-written emergency plans the person sets up while healthy — what to do if they’re in an accident, hospitalized, declared incapacitated, or pass — with the right people pre-notified and the right documents ready to go.",
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
                "desc": "Encrypted storage for digital account logins — banking, email, social, password manager, crypto wallet keys — so the family can actually GET INTO the accounts the will mentions.",
            },
            {
                "n": "08",
                "name": "Family & Friends Notification",
                "abbr": "FFN",
                "desc": "Organized, dignified notification of everyone who needs to know — in the order and through the channel the person chose, while they were the one writing the message.",
            },
            {
                "n": "09",
                "name": "CarryOn Financial Picture",
                "abbr": "CFP",
                "desc": "A complete, living picture of the household’s bills, debts, accounts, and properties — so the family knows what’s owed, what’s owned, and what to do with all of it.",
            },
        ],
        "foundational": (
            "Building block (not one of the nine pillars): Beneficiaries — every "
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
                "pillars": "SDV (where the policy lives), EGA (analyzes the benefactor’s estate plan for gaps so the policy is properly named in the right documents), FFN (the agent gets notified when something happens), IAC (claims-filing step lives in the checklist), CFP (the policy shows up in the household financial picture).",
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
                "pillars": "CFP (full household picture), SDV (estate documents in one place), EGA (an estate-law AI that spots gaps in the client’s plan and gives the advisor a clean punch-list to address), MM (the personal-legacy piece advisors can’t deliver themselves), CCP (plans for accident or incapacity), DAV (the digital-access gap most advisors quietly worry about).",
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
                "pillars": 'IAC (the "first 30 days after death" page), FFN (notifying the right people, in the right order, in the family’s voice), MM (the legacy piece — funeral homes are more and more being asked for video tribute services), SDV (death certificate, obituary draft, service plan).',
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
                "pillars": "SDV (their documents live there, locked and released correctly), EGA (an estate-law AI that flags gaps and contradictions in the client’s plan — gives the attorney a clean punch-list), IAC (the action checklist their POA / executor will actually use), DAV (the digital-account access the will references but the family can never find), CCP (separate plans for incapacity vs death).",
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
                "frame": "Selling CarryOn as a workplace benefit. Pillars: full nine, presented as financial-wellness + family-preparedness. Screen on plan-sponsor count, age skew, current EAP / financial-wellness offering.",
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
                "frame": 'CarryOn has Military and Veteran tier discounts. Pillars: full nine, presented as "leave nothing for your family to figure out." Screen on org type, member count, and how often members deploy if active-duty.',
            },
            {
                "name": "Senior-living operators / CCRCs",
                "frame": "Resident move-in and family-coordination angle. Pillars: full nine. Screen on resident count, independent vs assisted vs memory-care mix.",
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
                "line": "Pre-recorded video, audio, or written messages a person leaves to be delivered to specific loved ones at specific future moments.",
            },
            {
                "abbr": "SDV",
                "line": "Encrypted document storage — the documents the family will actually need, released at the right time to the right person.",
            },
            {
                "abbr": "EGA",
                "line": "An estate-law AI that lives inside the benefactor’s vault and reviews their documents to find gaps, seams, or contradictions — so the plan is air-tight before anything happens.",
            },
            {
                "abbr": "IAC",
                "line": "A personalized step-by-step playbook for what to do in the hours, days, and weeks after someone passes.",
            },
            {
                "abbr": "CCP",
                "line": "Pre-written emergency plans for accident, incapacity, hospitalization, or death — set up while the person is healthy, ready to go when needed.",
            },
            {
                "abbr": "ECT",
                "line": "A private, family-only secure messaging space — so the hard conversations don’t happen on text threads or social media.",
            },
            {
                "abbr": "DAV",
                "line": "Encrypted login storage so the family can actually access the digital accounts the will mentions.",
            },
            {
                "abbr": "FFN",
                "line": "Organized, dignified notification of everyone who needs to know, in the order and tone the person chose.",
            },
            {
                "abbr": "CFP",
                "line": "A complete, up-to-date picture of the household’s bills, debts, accounts, and properties — so the family knows what’s owed, owned, and what to do with it.",
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
