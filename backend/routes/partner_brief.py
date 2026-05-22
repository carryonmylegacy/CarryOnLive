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

import asyncio
import base64
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import resend
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field

from config import RESEND_API_KEY, SENDER_EMAIL, XAI_MODEL, XAI_MODEL_LIGHT, db, logger, xai_client
from guards import require_admin_scope
from services.quickstart_ai import build_quickstart_prompt, parse_quickstart_response
from services.quickstart_pdf import build_quickstart_pdf
from utils import get_current_user

router = APIRouter()


# ── Anonymous "Try it on your own household" rate limits ─────────────
# B2B prospects landing on /partner-brief can click "Try it on your
# own household" → walk the QuickStart wizard without an account →
# get the PDF emailed to them. xAI Grok is metered so we cap both
# per-IP (anti-abuse) and platform-wide (cost ceiling). Counters live
# in `partner_brief_try_attempts` keyed by `ip` (24-hour window).
_TRY_LIMIT_PER_IP_24H = 5
_TRY_LIMIT_PLATFORM_24H = 200
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── Sample QuickStart Guide payload (deterministic — NO Grok call) ──
# Powers the public `Sample QuickStart Guide` button on the Partner
# Brief. Using a fixed payload here (instead of calling xAI on every
# B2B page-view) gives us: free, fast, deterministic output that we
# control. The visual rendering reuses `services/quickstart_pdf` so
# the sample is *visually identical* to what a real client's PDF
# looks like — only the data + AI text are pre-baked.
_SAMPLE_USER_NAME = "The Mitchell Family"
_SAMPLE_DATA: dict[str, Any] = {
    "residence": {"state": "CA", "address": "1234 Sample Lane, San Diego"},
    "household": {
        "marital_status": "married",
        "children_dependent": 2,
        "children_adult": 0,
        "special_needs_dependent": False,
    },
    "beneficiaries": {
        "beneficiaries": [
            {"name": "Jane Mitchell", "relationship": "Spouse"},
            {"name": "Bobby Mitchell", "relationship": "Son"},
            {"name": "Emma Mitchell", "relationship": "Daughter"},
        ]
    },
    "properties": {
        "list": [
            {"address": "555 Lake View Rd, Lake Tahoe", "state": "NV", "kind": "vacation"},
        ]
    },
    "life_insurance": {"policy_count": 2, "unsure": False},
    "business": {"none": True, "types": []},
    "existing_documents": {"counts": {"wills": 1, "trusts": 0}, "flags": []},
}
_SAMPLE_AI_PAYLOAD: dict[str, Any] = {
    "intro": (
        "Hi Mitchell family — you're already further along than most. With a will in place, a "
        "California primary residence, and life insurance covering Jane, Bobby, and Emma, the "
        "real work now is closing the gaps between those pieces so the family never has to "
        "scramble. Here's a one-page checklist you can take, verbatim, to each of your professionals."
    ),
    "professional_sections": [
        {
            "professional": "Estate Attorney",
            "why_them": (
                "California is a community-property state and your will alone doesn't avoid probate "
                "for the primary residence — your attorney can solve that in a single sitting."
            ),
            "checklist": [
                "Confirm whether your existing will is California-compliant and self-proving (saves the family weeks at probate).",
                "Add a revocable living trust to keep the primary residence out of California probate; retitle the deed accordingly.",
                "Draft a durable Power of Attorney + an Advance Healthcare Directive — neither is in your current packet.",
                "Add a guardianship designation for Bobby and Emma so the court isn't the one choosing.",
                "Confirm the life-insurance beneficiary designations match what your will intends — they override the will if they conflict.",
            ],
        },
        {
            "professional": "CPA / Tax Advisor",
            "why_them": (
                "Married-filing-jointly + California + retirement accounts have specific basis-step-up and beneficiary rules worth a 30-minute review."
            ),
            "checklist": [
                "Walk through the 401(k) / IRA beneficiary-designation chain and confirm Jane is primary, kids contingent.",
                "Discuss the step-up-in-basis on the primary residence so heirs don't pay tax on appreciation already realized.",
                "Confirm California's $13.61 M federal estate-tax exemption posture for your household — if you're well under, simplify accordingly.",
                "Set a recurring annual touchpoint to revisit retirement-account beneficiaries (these drift more than wills do).",
            ],
        },
        {
            "professional": "Financial Advisor",
            "why_them": (
                "You have retirement + checking but no brokerage / 529 — there's a clear gap your advisor can size against your goals."
            ),
            "checklist": [
                "Open or confirm 529 plans for Bobby and Emma — California-based or otherwise — and name Jane as successor owner.",
                "Confirm asset-allocation across retirement + emergency-fund + life-insurance face value is appropriate for a family of four.",
                "Review whether a brokerage account with Transfer-on-Death registration makes sense to avoid probate on liquid assets.",
                "Plan a 12-month and 36-month milestone review with your attorney CC'd so legal + financial stay aligned.",
            ],
        },
        {
            "professional": "Life Insurance Agent / Broker",
            "why_them": (
                "You have a policy — the question now is whether the coverage amount + beneficiaries actually match the household's income + dependents."
            ),
            "checklist": [
                "Confirm coverage face value covers at least 10× combined household income or fully replaces it through Emma's college years.",
                "Confirm Jane is primary beneficiary and Bobby + Emma are contingent (per stirpes, not per capita, in California).",
                "If term, confirm the term length lasts beyond the kids' college years; if whole, confirm the cash-value strategy is current.",
                "Add a 'where the policy lives' line to your family's preparedness binder so the claim isn't delayed at the worst time.",
            ],
        },
    ],
    "state_notes": (
        "California is a community-property state, which affects how the home and retirement accounts "
        "pass to Jane. Probate in California is unusually slow and expensive — a revocable trust is the "
        "single biggest move you can make. Healthcare directives and HIPAA releases are critical because "
        "California hospitals are strict about who can speak for whom."
    ),
    "next_step": (
        "Schedule a 45-minute consult with a California-licensed estate attorney this month. Bring this guide; "
        "they'll know exactly what you're after."
    ),
}


def _render_sample_pdf() -> bytes:
    """Render the deterministic sample QuickStart PDF for the
    public Partner Brief CTA. Kept synchronous because fpdf2 is fast
    enough and the result is cached by the CDN / browser anyway."""
    return build_quickstart_pdf(
        user_name=_SAMPLE_USER_NAME,
        data=_SAMPLE_DATA,
        ai_payload=_SAMPLE_AI_PAYLOAD,
        generated_at=datetime.now(timezone.utc),
    )


# ── Default content (shipped with the app; matches the original
# PartnerBriefPage hardcoded copy 1:1 so an unconfigured deploy still
# shows the founder-approved version). Edit here to change the seed.
DEFAULTS: dict[str, Any] = {
    "header": {
        "eyebrow": "For partners thinking about working with CarryOn",
        "title": "CarryOn™ Partner Brief",
        "intro": (
            "A short overview of the platform — the AI-driven QuickStart that turns a 2-minute "
            "conversation into a professional-prep checklist, the ten pillars that organize the "
            "family's full picture, the platform-wide capabilities (Estate Binder, Entities & "
            "Structures, Trustee Mode, offline-first PWA, white-label partner experiences), and "
            "how each one fits the kinds of businesses we partner with — life insurance, financial "
            "planning, funeral homes, estate planning attorneys, and other related industries. "
            "Our team uses this brief to screen partner calls before a discovery call with the founder."
        ),
    },
    "one_breath": {
        "title": "1. The platform in one breath",
        "quote": (
            "CarryOn™ is the digital family preparedness platform that brings together every "
            "aspect of a person's life — so they and their loved ones can carry on through anything."
        ),
        "paragraph": (
            "A single, secure platform where someone organizes their entire life picture — important "
            "documents, financial accounts, digital logins, who needs to be told what when something "
            "happens, recorded messages for loved ones at future life moments, and an AI guide that "
            "can answer their family's questions when they're not there to. It's built so the family "
            "is genuinely ready, not scrambling."
        ),
    },
    "quickstart": {
        "title": "1.5 The QuickStart Guide — value in 2 minutes",
        "paragraph": (
            "Most adults have never thought seriously about estate planning. The QuickStart Wizard "
            "fixes that on Day 1. In about two minutes — a few conversational questions about state "
            "of residence, household, beneficiaries, real estate, accounts, life insurance, business "
            "ownership, and existing documents — the platform produces a state-aware, family-tailored "
            "one-page checklist the user can take, verbatim, to their estate attorney, CPA, financial "
            "advisor, and life-insurance agent. It is not legal advice; it's the prepared client every "
            "professional wishes they got. The guide opens the Estate Binder as the first section and "
            "is regenerable at any time."
        ),
        "bullets": [
            "Powered by the founder's own xAI Grok account — not an Emergent or third-party LLM key.",
            "State-aware: California community-property nuances look different than a Texas homestead conversation.",
            "Beneficiary-aware: every name the user enters becomes a tile the rest of the platform builds around.",
            "Printable + binder-ready — every partner's client family hands the same paper to the same professional.",
        ],
        "sample_label": "See a sample QuickStart Guide",
        "sample_pdf_url": "/api/partner-brief/sample-quickstart-pdf",
        "sample_caption": (
            "Sample household: a married California couple with two dependent kids, primary residence, "
            "401(k) + checking, life insurance, and a basic will. Same renderer the live platform uses."
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
    "capabilities": {
        "title": "2.5 Platform-wide capabilities",
        "intro": (
            "These aren't separate pillars — they're the connective tissue that makes the ten pillars "
            "work as one product. Every partner should know about them because each one closes a "
            "specific objection that comes up on discovery calls."
        ),
        "items": [
            {
                "name": "Estate Binder",
                "desc": (
                    "One combined PDF assembled live from the family's vault: Title page + TOC + the "
                    "QuickStart Guide + IAC + every other section the benefactor has built. The family "
                    "receives a single book to hand to an attorney, executor, or CPA — not a scavenger "
                    "hunt across email and file cabinets. Regenerable any time the underlying data "
                    "changes; partners can include it in their own deliverable packet."
                ),
            },
            {
                "name": "CarryOn Entities & Structures (CES)",
                "desc": (
                    "A visual, pan-and-zoom org-chart for trusts, LLCs, partnerships, S-corps, "
                    "C-corps, and the people / beneficiaries connected to each. Sits beside CFP "
                    "(the financial picture) — CFP shows what's there, CES shows how it's wired. "
                    "Built for households with anything more complex than a single will."
                ),
            },
            {
                "name": "Trustee Mode",
                "desc": (
                    "A designated trustee (attorney, advisor, executor, or trusted family member) can "
                    "step into the benefactor's account with a full audit trail — every change is "
                    "logged, every mutation is undoable, and a session banner makes the role explicit. "
                    "Big for attorney + financial-advisor verticals where the professional wants to "
                    "help the client maintain the platform without ever 'becoming' them."
                ),
            },
            {
                "name": "Offline-first PWA",
                "desc": (
                    "Installable on iOS and Android as a real Progressive Web App. Documents, "
                    "checklists, and pending changes sync via Dexie when the device comes back online — "
                    "so a beneficiary in a FEMA trailer, a library, or a hospital waiting room can "
                    "still use the platform when they need it most."
                ),
            },
            {
                "name": "White-label partner experiences",
                "desc": (
                    "Partner-branded sign-up flows with partner code support, brand override per "
                    "tenant (logo, palette, footer copy), and partner-specific intro packets. The "
                    "family experience stays familiar; the partner gets to be the brand the client sees."
                ),
            },
            {
                "name": "Permission-aware AI (xAI Grok)",
                "desc": (
                    "All AI work — Estate Guardian, the Beneficiary Concierge, the QuickStart Wizard — "
                    "runs on xAI Grok, with strict per-document permission scoping. The model only "
                    "sees what the benefactor explicitly released. No human team reads the documents; "
                    "no cross-account training; no third-party LLM key on the founder's AI surfaces."
                ),
            },
        ],
    },
    "verticals": {
        "title": "3. How it fits each kind of partner",
        "intro": (
            "For each industry: what problem they want to solve, which pillars + capabilities matter "
            "most to them, and the screening questions our team will ask."
        ),
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
                "pillars": (
                    "QuickStart (state-aware checklist the policy maps into on Day 1), SDV (where the "
                    "policy lives), EGA (analyzes the benefactor's estate plan for gaps so the policy "
                    "is properly named in the right documents), FFN (the agent gets notified when "
                    "something happens), IAC (claims-filing step lives in the checklist), CFP (the "
                    "policy shows up in the household financial picture), Estate Binder (the printable "
                    "packet the family hands to the claims processor), BEC (after the benefactor "
                    "passes, beneficiaries can ask the AI Concierge \u201cwhere is the policy?\u201d and "
                    "get a cited answer pulled from the documents the benefactor released to them)."
                ),
                "questions": [
                    "Are you looking for a tool to offer to the clients you already have, or a way to get referrals and earn on new clients you bring in?",
                    "Roughly how many policies do you have under management?",
                    'Do you currently offer any kind of "family preparedness" or "legacy" service to clients today, even informally?',
                    "Are you part of a larger agency / IMO / FMO, or independent?",
                ],
                "disqualify": "They're really looking for a CRM, a quoting engine, or a lead-generation service. We're not those.",
            },
            {
                "id": "financial-planners",
                "title": "B. Financial Planners / Wealth Advisors / RIAs",
                "cares": [
                    'Estate-planning gap: clients have wealth but no organized "when something happens" plan for the family.',
                    "Standing out from other advisors: wealthy clients more and more expect a complete family-readiness plan, not just money advice.",
                    "Keeping the family relationship: when the primary client passes, the surviving spouse often leaves the advisor within 2 years. CarryOn keeps the family inside an organized hand-off.",
                    "Peace of mind for compliance: CarryOn doesn't give financial advice — it just organizes what the advisor and client have already decided.",
                ],
                "pillars": (
                    "QuickStart (the conversation-starter the advisor reviews with the client), CFP "
                    "(full household picture), CES (the visual entity-and-structure chart for trust + "
                    "LLC clients), SDV (estate documents in one place), EGA (an estate-law AI that "
                    "spots gaps and gives the advisor a clean punch-list), MM (the personal-legacy "
                    "piece advisors can't deliver themselves), CCP (plans for accident or incapacity), "
                    "DAV (the digital-access gap most advisors quietly worry about), Trustee Mode "
                    "(advisor-assisted maintenance with audit trail), BEC (after transition the heirs "
                    "get cited answers — keeps the family from feeling lost on day one)."
                ),
                "questions": [
                    "What does your current family hand-off look like today when a client passes or becomes incapacitated?",
                    "Are you AUM-based, fee-only, hybrid? (Just for context — affects how a partnership would feel for them.)",
                    "Roughly how many client households, and what's the typical age range of the primary client?",
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
                    "After-care: the grieving family doesn't just need a service — they need help with the next 90 days.",
                    "Standing out from the big corporate chains — independents need a digital story.",
                    "Their families are often older and not comfortable with new tech — they need something a 70-year-old will actually use.",
                ],
                "pillars": (
                    'QuickStart (the gentle Day-1 on-ramp for pre-need clients), IAC (the "first 30 '
                    'days after death" page), FFN (notifying the right people, in the right order, '
                    "in the family's voice), MM (the legacy piece — funeral homes are more and more "
                    "being asked for video tribute services), SDV (death certificate, obituary draft, "
                    "service plan), Estate Binder (the printable book the family leaves the funeral "
                    "home with), BEC (the AI Concierge gives the grieving family answers from the "
                    "benefactor's actual documents — exactly what funeral homes wish they could give "
                    "every family but can't deliver themselves)."
                ),
                "questions": [
                    "Do you offer pre-need / pre-arrangement today, and what does that intake look like?",
                    "Are you independent, part of a regional chain, or part of a bigger company?",
                    "Do you have an after-care program — six-month follow-ups, grief resources?",
                    "Roughly how many services per year? (Sizing question — DON'T quote pricing.)",
                    "Are you thinking about offering this to families at intake, including it in pre-need, or just referring to it as an after-care partner?",
                ],
                "disqualify": "",
            },
            {
                "id": "estate-attorneys",
                "title": "D. Estate Planning Attorneys / Trust & Estate Firms",
                "cares": [
                    "Their work product (the will, the trust, the POA) sits in a drawer until the day it's needed — and on that day, the family can't find it, doesn't understand it, and calls the attorney in a panic.",
                    "Getting the documents to the family and explaining them is the slowest part of their job — they want the document actually used right, not just filed away.",
                    "Legal-risk comfort: nothing the family does inside CarryOn replaces or contradicts the actual legal document.",
                    "They want to look modern to younger clients without having to learn new software themselves.",
                ],
                "pillars": (
                    "QuickStart (clients show up to the first meeting already prepared with a state-"
                    "aware checklist — the prepared client every attorney wishes they got), SDV (their "
                    "documents live there, locked and released correctly), EGA (an estate-law AI that "
                    "flags gaps and contradictions in the client's plan — gives the attorney a clean "
                    "punch-list), CES (the visual structure chart for trust + LLC clients — the "
                    "diagram that takes the lawyer 20 minutes to draw on a whiteboard), IAC (the "
                    "action checklist their POA / executor will actually use), DAV (the digital-"
                    "account access the will references but the family can never find), CCP (separate "
                    "plans for incapacity vs death), Trustee Mode (firm-assisted plan maintenance "
                    'with a full audit trail — never "becoming" the client), Estate Binder (a '
                    "single book the attorney's family gets at execution), BEC (after death the heirs "
                    "can ask the AI Concierge plain-English questions grounded in the attorney's own "
                    "drafted documents — fewer panicked calls back to the firm)."
                ),
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
                "frame": (
                    "Selling CarryOn as a workplace benefit. The QuickStart Wizard is the Day-1 "
                    "on-ramp every employee sees — 2 minutes, no jargon, a printable guide they can "
                    "act on the same week. Then the full ten pillars + Estate Binder become the "
                    "family-preparedness piece on top of the usual financial-wellness stack. Screen "
                    "on plan-sponsor count, age skew, current EAP / financial-wellness offering."
                ),
            },
            {
                "name": "Hospice / palliative care providers",
                "frame": (
                    "CarryOn is free for every American in hospice care — so this is a referral / "
                    "awareness partnership, not a paid one. Pillars: IAC, MM, SDV, FFN, CCP, plus "
                    "Estate Binder so the family leaves hospice with a single book. Screen on "
                    "patient volume + service area."
                ),
            },
            {
                "name": "Religious communities / clergy",
                "frame": (
                    'Same family-preparedness pitch, often paired with a "blessing the plan" '
                    "intake. Pillars: MM (legacy messages), FFN (community notification), IAC. "
                    "Screen on congregation size + member-benefit vs referral."
                ),
            },
            {
                "name": "Military / veteran service organizations",
                "frame": (
                    "CarryOn has Military and Veteran tier discounts. Pillars: full ten + Estate "
                    "Binder + Trustee Mode (for spouse-assisted account management during deployment), "
                    'presented as "leave nothing for your family to figure out." Screen on org '
                    "type, member count, and how often members deploy if active-duty."
                ),
            },
            {
                "name": "Senior-living operators / CCRCs",
                "frame": (
                    "Resident move-in and family-coordination angle. Pillars: full ten + QuickStart "
                    "at intake + Estate Binder as the resident-and-family deliverable. Screen on "
                    "resident count, independent vs assisted vs memory-care mix."
                ),
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


@router.get("/partner-brief/sample-quickstart-pdf")
async def sample_quickstart_pdf() -> StreamingResponse:
    """Public, no-auth — streams the deterministic sample QuickStart
    PDF used by the Partner Brief's `See a sample QuickStart Guide`
    CTA. Renders synchronously on each request (fpdf2 is fast; the
    Brief itself is rarely loaded compared to consumer surfaces).
    No AI call is made — content is baked into `_SAMPLE_AI_PAYLOAD`."""
    pdf_bytes = _render_sample_pdf()
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="CarryOn_QuickStart_Sample.pdf"',
            "Cache-Control": "public, max-age=3600",
        },
    )


# ── POST /api/partner-brief/try-quickstart ──────────────────────────
class TryQuickStartPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    data: dict[str, Any] = Field(default_factory=dict)


async def _check_try_rate_limit(ip: str) -> None:
    """Mongo-backed sliding-window counter so anonymous trial runs
    can't be abused. Two ceilings — per-IP and platform-wide.
    Each successful call inserts a `partner_brief_try_attempts` row;
    we count rows in the trailing 24h window."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    ip_count = await db.partner_brief_try_attempts.count_documents({"ip": ip, "created_at": {"$gte": cutoff}})
    if ip_count >= _TRY_LIMIT_PER_IP_24H:
        raise HTTPException(
            status_code=429,
            detail=(
                "You've reached the trial limit from this network for the "
                "next 24 hours. Reach out at partnerships@carryon.us and "
                "we'll send you a tailored guide directly."
            ),
        )
    platform_count = await db.partner_brief_try_attempts.count_documents({"created_at": {"$gte": cutoff}})
    if platform_count >= _TRY_LIMIT_PLATFORM_24H:
        raise HTTPException(
            status_code=429,
            detail=(
                "We're at our daily trial capacity — please come back tomorrow "
                "or email partnerships@carryon.us so we can send you a guide directly."
            ),
        )


def _build_email_html(*, name: str, ai_intro: str, brand_url: str) -> str:
    safe_name = (name or "there").split(" ")[0]
    safe_intro = (ai_intro or "").replace("<", "&lt;").replace(">", "&gt;")
    return f"""<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#0f1629;color:#E5E7EB;padding:32px;">
<div style="max-width:560px;margin:0 auto;background:#111c33;border:1px solid rgba(212,175,55,0.25);border-radius:14px;padding:28px;">
<p style="font-size:22px;font-family:'Cormorant Garamond',Georgia,serif;color:#d4af37;margin:0 0 4px 0;">CarryOn&trade;</p>
<p style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#94A3B8;margin:0 0 24px 0;">Your QuickStart Estate Plan Guide</p>
<p style="font-size:16px;color:#F8FAFC;margin:0 0 14px 0;">Hi {safe_name},</p>
<p style="font-size:15px;line-height:1.6;color:#CBD5E1;margin:0 0 14px 0;">Your tailored QuickStart Estate Plan Guide is attached as a PDF. Take it, verbatim, to your estate attorney, CPA, financial advisor, and life-insurance agent &mdash; you&rsquo;ll walk in ready.</p>
<p style="font-size:14px;line-height:1.6;color:#94A3B8;font-style:italic;margin:0 0 22px 0;">{safe_intro}</p>
<p style="font-size:14px;line-height:1.6;color:#CBD5E1;margin:0 0 8px 0;">When you&rsquo;re ready to keep going &mdash; document vault, milestone messages, beneficiary access, and the rest &mdash; the full CarryOn platform picks up right where this guide leaves off:</p>
<p style="margin:18px 0 0 0;"><a href="{brand_url}" style="display:inline-block;padding:11px 22px;border-radius:10px;font-weight:700;font-size:14px;background:linear-gradient(135deg,#d4af37,#b8962e);color:#080e1a;text-decoration:none;">Explore CarryOn</a></p>
<p style="font-size:11px;color:#64748B;margin:28px 0 0 0;line-height:1.5;">This guide is a preparation tool, not legal, tax, or financial advice. Confirm specifics with the licensed professionals of your choice.</p>
</div></body></html>"""


@router.post("/partner-brief/try-quickstart")
async def try_quickstart(
    payload: TryQuickStartPayload,
    request: Request,
) -> StreamingResponse:
    """Public, no-auth — the B2B `Try it on your own household` CTA.
    A prospect walks the standard 10-step wizard locally in the browser
    (no per-step server saves; it's a one-shot trial), then POSTs the
    full data + name + email here. We:

      1. Rate-limit by IP + platform-wide (xAI is metered).
      2. Validate email + minimal required fields.
      3. Call xAI Grok (founder's `XAI_API_KEY`) to generate the
         tailored intro + per-professional checklists.
      4. Render the PDF via the *same* renderer the authenticated
         wizard uses (visually identical to a real client's PDF).
      5. Email the PDF as an attachment via Resend.
      6. Store the lead in `partner_brief_leads` so the founder can
         follow up.
      7. Stream the PDF back inline so the page can show it
         immediately, alongside the "check your inbox" confirmation.
    """
    if not xai_client:
        raise HTTPException(status_code=503, detail="AI service not configured.")
    if not _EMAIL_RE.match(payload.email):
        raise HTTPException(status_code=400, detail="Please use a valid email address.")
    state = (payload.data.get("residence") or {}).get("state") or (payload.data.get("state") or {}).get(
        "state_of_residence"
    )
    if not state or len(state) != 2:
        raise HTTPException(status_code=400, detail="Please choose your state of residence.")
    bens = (payload.data.get("beneficiaries") or {}).get("beneficiaries") or []
    if not isinstance(bens, list) or len(bens) == 0:
        raise HTTPException(
            status_code=400,
            detail="Please add at least one beneficiary so the guide can be tailored.",
        )

    ip = (request.client.host if request.client else "unknown") or "unknown"
    await _check_try_rate_limit(ip)

    # ── xAI Grok call (same pattern as the authenticated wizard) ──
    prompt_messages = build_quickstart_prompt(user_name=payload.name, data=payload.data)
    completion = None
    last_err: Exception | None = None
    for model_name in (XAI_MODEL_LIGHT, XAI_MODEL):
        try:
            completion = await asyncio.wait_for(
                asyncio.to_thread(
                    xai_client.chat.completions.create,
                    model=model_name,
                    messages=prompt_messages,
                    temperature=0.55,
                    max_tokens=4096,
                ),
                timeout=80.0,
            )
            break
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            logger.warning(f"Partner trial Grok failed on {model_name}: {exc}")
            continue
    if completion is None:
        logger.exception("Partner trial Grok failover exhausted")
        raise HTTPException(
            status_code=503,
            detail=f"AI service is temporarily unavailable — please try again. ({last_err})",
        )

    ai_text = completion.choices[0].message.content or ""
    parsed = parse_quickstart_response(ai_text)
    pdf_bytes = build_quickstart_pdf(
        user_name=payload.name,
        data=payload.data,
        ai_payload=parsed,
        generated_at=datetime.now(timezone.utc),
    )

    # ── Email the PDF (best-effort — surfaces error but does not
    # block returning the PDF inline). ──
    email_status = {"ok": False, "error": None}
    if RESEND_API_KEY:
        try:
            brand_url = "https://app.carryon.us"
            html_body = _build_email_html(name=payload.name, ai_intro=parsed.get("intro", ""), brand_url=brand_url)
            await asyncio.to_thread(
                resend.Emails.send,
                {
                    "from": SENDER_EMAIL,
                    "to": [payload.email],
                    "subject": "Your CarryOn QuickStart Estate Plan Guide",
                    "html": html_body,
                    "attachments": [
                        {
                            "filename": "CarryOn_QuickStart_Guide.pdf",
                            "content": base64.b64encode(pdf_bytes).decode("ascii"),
                            "content_type": "application/pdf",
                        }
                    ],
                },
            )
            email_status = {"ok": True, "error": None}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Partner trial email failed")
            email_status = {"ok": False, "error": str(exc)}
    else:
        email_status = {"ok": False, "error": "Email service not configured on this environment."}

    # ── Persist the lead + the attempt counter ──
    now_iso = datetime.now(timezone.utc).isoformat()
    lead_doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "email": payload.email,
        "state": state,
        "data": payload.data,
        "ai_summary": parsed.get("intro", "")[:600],
        "ip": ip,
        "user_agent": (request.headers.get("user-agent") or "")[:300],
        "email_sent": email_status["ok"],
        "email_error": email_status["error"],
        "created_at": now_iso,
        "source": "partner_brief_try",
    }
    await db.partner_brief_leads.insert_one(dict(lead_doc))
    await db.partner_brief_try_attempts.insert_one({"ip": ip, "email": payload.email, "created_at": now_iso})

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="CarryOn_QuickStart_Guide.pdf"',
            "Cache-Control": "private, no-store",
            "X-CarryOn-Email-Sent": "1" if email_status["ok"] else "0",
        },
    )


@router.get("/partner-brief/leads")
async def list_partner_brief_leads(
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Founder + marketing scope only — list the most recent 200
    leads captured by the `Try it on your own household` CTA so the
    team can follow up. Excludes `_id` and the full `data` blob to
    keep the response light; the `state` and `ai_summary` columns
    are usually enough to triage."""
    require_admin_scope(current_user, ["marketing"])
    cursor = (
        db.partner_brief_leads.find(
            {},
            {
                "_id": 0,
                "id": 1,
                "name": 1,
                "email": 1,
                "state": 1,
                "ai_summary": 1,
                "email_sent": 1,
                "created_at": 1,
                "source": 1,
            },
        )
        .sort("created_at", -1)
        .limit(200)
    )
    leads = await cursor.to_list(length=200)
    return {"leads": leads, "count": len(leads)}
