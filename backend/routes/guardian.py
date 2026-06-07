"""CarryOn™ Backend — Estate Guardian AI & PDF Export"""

import asyncio
import os
import io
import json as json_module
import uuid
from datetime import datetime, timedelta, timezone

import pdfplumber
from fastapi import APIRouter, Depends, HTTPException

from config import XAI_MODEL, XAI_MODEL_LIGHT, db, logger, xai_client
from models import ChatRequest, ChatResponse, ChecklistItem
from services.access_control import require_estate_actor
from services.ai_burn_guard import require_ai_burn_budget
from services.ai_safety import hardened_system_prompt
from services.encryption import decrypt_aes256, decrypt_field, get_estate_salt
from services.readiness import calculate_estate_readiness
from utils import get_current_user, log_activity, update_estate_readiness

router = APIRouter()


# ── Heavy-action concurrency cap ───────────────────────────────────
# Caps the number of in-flight heavy AI requests (IAC generation,
# inconsistency finder, vault analysis, etc.) PLATFORM-WIDE so a
# burst of simultaneous clicks can't blast xAI's per-API-key rate
# ceiling and trigger cascading 429s. xAI standard plan tolerates
# ~60 req/min — at 9-min worst-case per heavy task that's 9
# concurrent in flight before saturation, so we cap at 6 for
# headroom. Acquisitions over the cap wait up to 30s before
# returning a friendly "your analysis will start in a moment"
# 503 — long enough for typical demand spikes to drain, short
# enough that the UI doesn't appear hung.
_HEAVY_AI_SEMAPHORE = asyncio.Semaphore(6)
_HEAVY_AI_WAIT_TIMEOUT_S = 30.0

# Per-user daily token budget (input + output tokens summed across all
# heavy + light AI actions). Caps cost exposure when a single user
# uploads massive documents or hammers the chat. 500K tokens/day at
# blended grok-3 pricing (~$0.50/M in + $1.50/M out) is roughly $0.50
# worst-case per user per day — predictable for B2B unit economics.
# Override via env if a paid tier needs more.
PER_USER_DAILY_TOKEN_BUDGET = int(os.environ.get("PER_USER_DAILY_TOKEN_BUDGET", "500000"))


def _guardian_ai_guard_feature(action: str | None) -> str:
    heavy_actions = {
        "analyze_vault",
        "generate_todo",
        "generate_iac",
        "analyze_readiness",
        "state_law_brief",
        "find_inconsistencies",
        "quickstart_gap_check",
    }
    if action == "generate_iac":
        return "guardian_generate_iac"
    if action in heavy_actions:
        return "guardian_heavy"
    return "guardian_chat"


async def _get_user_estate(current_user: dict, projection: dict | None = None):
    """Get the first estate for a user, with admin fallback (all estates)."""
    proj = projection or {"_id": 0}
    if current_user.get("role") == "admin":
        return await db.estates.find({}, proj).to_list(1)
    return await db.estates.find({"owner_id": current_user["id"]}, proj).to_list(1)


# ── xAI warmup (POST /warmup + warmup_xai() startup hook) lives in
#    routes/guardian_warmup.py — extracted Feb 17 2026 monolith pass.
#    `server.py` imports `warmup_xai` directly from that module now.


# ===================== AI CHAT ROUTES =====================

# Comprehensive estate law system prompt — Grok-like persona
ESTATE_GUARDIAN_SYSTEM_PROMPT = hardened_system_prompt("""You are the Estate Guardian — the AI Elf that lives inside the CarryOn™ Secure Vault. Think of yourself as a panel of 50+ Harvard-trained estate attorneys, one for each U.S. state and territory, distilled into a single brilliant, straight-talking advisor who lives inside a bank vault alongside the user's most precious documents, digital passwords, and milestone messages. You've read everything in the vault. You know it cold.

**YOUR PERSONALITY (channel Grok's truth-biased, colloquial style):**
- Be direct and honest — don't sugarcoat problems you find in their estate plan. If something is missing or wrong, say it plainly.
- Be conversational and warm, like a sharp friend who happens to be an estate law expert. Use contractions. Be human.
- Inject occasional dry wit, but never at the expense of accuracy. The truth always comes first.
- When you don't know something specific to their situation, say so — don't hedge with vague platitudes.
- Make complex legal concepts digestible. Analogies are your friend.
- Be action-oriented. Every observation should point to a next step the user can take.

**STRICT SCOPE — THIS IS NON-NEGOTIABLE:**
You ONLY discuss topics that fall within these boundaries:
1. Estate planning law (wills, trusts, probate, POA, healthcare directives, beneficiary designations, estate/inheritance tax, digital assets, homestead exemptions, guardianship, conservatorship)
2. The user's specific estate documents, vault contents, beneficiaries, milestone messages, Digital Access Vault (DAV), and checklist items
3. Estate readiness analysis, document gap analysis, and action item generation
4. General financial planning concepts ONLY as they directly relate to estate planning (e.g., asset titling, beneficiary designations on retirement accounts, life insurance in estate context)

If the user asks about ANYTHING outside this scope — weather, sports, recipes, coding, general trivia, politics, entertainment, medical advice, tax preparation, investment advice, real estate transactions, business law, criminal law, immigration, or ANY other topic — respond with something like:
"I appreciate the question, but I'm laser-focused on estate planning — that's my entire world. For [topic], you'd want to talk to [appropriate resource]. Now, is there anything about your estate plan I can help with?"

Do NOT answer off-topic questions even if you know the answer. Do NOT get drawn into tangential conversations. Always steer back to the estate plan. You are the best estate planning mind in the country — act like it by staying in your lane with absolute discipline.

**STATE-SPECIFIC ESTATE LAW EXPERTISE (all 50 states + territories):**
- **Community Property States** (AZ, CA, ID, LA, NV, NM, TX, WA, WI): Joint ownership rules, spousal rights, community vs. separate property.
- **Common Law States** (all others): Elective share statutes, spousal inheritance rights, intestacy.
- **Probate**: Which states allow simplified probate (e.g., CA small estate affidavit under $184,500), UPC adoption states, full probate requirements.
- **Estate & Inheritance Tax**: Estate tax states (CT, HI, IL, ME, MA, MN, NY, OR, RI, VT, WA, DC), inheritance tax states (IA, KY, MD, NE, NJ, PA), both (MD).
- **Trust Law**: Revocable vs irrevocable, pour-over wills, trust protectors, dynasty trusts (SD, NV, DE, AK), asset protection trusts.
- **Power of Attorney**: Statutory forms by state (NY GOL §5-1513, CA Probate Code §4401), springing vs. durable, financial vs. healthcare.
- **Healthcare Directives**: POLST/MOLST, DNR, surrogate hierarchies, state-specific advance directive forms.
- **Homestead Exemptions**: FL and TX (unlimited), state-specific dollar caps.
- **Digital Assets**: RUFADAA adoption by state.
- **Beneficiary Designations**: POD/TOD, IRA beneficiaries, life insurance vs. will conflicts.

**YOUR CAPABILITIES:**
1. **Analyze Documents**: You can read the user's Secure Document Vault contents. Reference documents by name and call out specifics.
2. **Generate To-Do List**: Create a prioritized list of tasks for the benefactor to strengthen their estate plan. Be specific — "File Form X with Y county" not "consider updating your plan."
3. **Generate Immediate Action Checklist (IAC)**: By reading vault documents, create a specific, actionable checklist for the benefactor's BENEFICIARIES to follow in the days/weeks after the benefactor's death. Extract real phone numbers, policy numbers, trustee names, and institution contacts from the vault.
4. **Analyze Readiness**: Calculate and explain the Estate Readiness Score with actionable improvement steps.
5. **Answer Estate Law Questions**: For any of the 50 states and U.S. territories. Cite specific statutes when relevant.

**GUIDELINES:**
- **STATE ACKNOWLEDGMENT (MANDATORY for every analysis):** At the very beginning of every substantive response — before diving into the analysis — include a brief statement confirming the user's declared state of residence and that your analysis is informed by that state's current estate laws. Example: "Based on your declared residence in [State], my analysis applies [State]'s current estate planning statutes and probate rules." If the state is "Not specified," lead by asking for it before proceeding.
- **NO CANNED OPENERS:** NEVER begin any paragraph (especially the second paragraph) with "Hey there", "Hey", "Hi there", "So,", "Alright,", "Well,", or any other formulaic transition. These read like AI templates and break the warm-friend tone. Move directly into the substance — start the next paragraph with the next idea, not with a greeting or filler word. Vary your phrasing across responses; never reuse the same opening twice in one conversation.
- Always reference the user's actual documents and data when available. Don't guess — look at what's in the vault.
- When discussing state law, cite the specific state. If the state is unknown, ask.
- You will NEVER draft legal documents, fill in forms, or make changes. You advise — the user acts. That's the line.
- Format responses with clear headers, bullet points, and numbered lists. Make it scannable.
- Keep responses focused and practical. Quality over quantity.

{estate_context}""")

# Legal disclaimer appended to every AI response
LEGAL_DISCLAIMER = (
    "\n\n---\n*This analysis is provided for informational and educational purposes only "
    "and does not constitute legal advice. CarryOn™ Estate Guardian is an AI assistant, "
    "not a licensed attorney. For legally binding decisions, always consult a bar-certified "
    "attorney licensed in your jurisdiction. No attorney-client relationship is created "
    "by using this service.*"
)


async def extract_document_text(document: dict) -> str:
    """Extract text content from a document for AI analysis"""
    try:
        estate_salt = await get_estate_salt(document["estate_id"])

        # New architecture: blob in cloud storage
        if document.get("storage_key"):
            from services.storage import storage

            encrypted_blob = await storage.download(document["storage_key"])
            decrypted_data = decrypt_aes256(encrypted_blob.decode("ascii"), estate_salt)
        elif document.get("file_data"):
            decrypted_data = decrypt_aes256(document["file_data"], estate_salt)
        else:
            return ""

        file_type = document.get("file_type", "").lower()

        # PDF extraction
        if "pdf" in file_type:
            try:
                pdf = pdfplumber.open(io.BytesIO(decrypted_data))
                text_parts = []
                for page in pdf.pages[:20]:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                pdf.close()
                text = "\n".join(text_parts)
                return text[:8000]
            except Exception as e:
                logger.warning(f"PDF extraction failed for {document['name']}: {e}")
                return f"[PDF document - {document['file_size']} bytes - text extraction failed]"

        # Text-based files
        elif any(t in file_type for t in ["text", "plain", "csv", "json", "xml", "html"]):
            text = decrypted_data.decode("utf-8", errors="replace")
            return text[:8000]

        # Images and other binary formats
        else:
            return f"[Binary file: {file_type} - {document['file_size']} bytes]"

    except Exception as e:
        logger.warning(f"Document extraction error for {document['name']}: {e}")
        return "[Document content unavailable - decryption error]"


async def gather_estate_context(estate_id: str, include_doc_content: bool = False) -> str:
    """Gather comprehensive estate context for the AI"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        return ""

    # Get benefactor's address for state-specific legal advice
    benefactor = await db.users.find_one(
        {"id": estate.get("owner_id")},
        {
            "_id": 0,
            "name": 1,
            "address_state": 1,
            "address_city": 1,
            "address_street": 1,
            "address_zip": 1,
            "marital_status": 1,
            "date_of_birth": 1,
            "special_status": 1,
        },
    )
    # ALWAYS use the benefactor's CURRENT address from Settings (users collection).
    # The Settings page is the single source of truth for address/state — the
    # estate's cached "state" field is only a fallback if the user profile has
    # no state set at all (e.g. legacy accounts that predate the address fields).
    benefactor_state = (benefactor or {}).get("address_state") or estate.get("state") or "Not specified"
    benefactor_city = (benefactor or {}).get("address_city", "")
    benefactor_zip = (benefactor or {}).get("address_zip", "")
    benefactor_street = (benefactor or {}).get("address_street", "")
    benefactor_marital = (benefactor or {}).get("marital_status", "")
    benefactor_special = (benefactor or {}).get("special_status", [])
    benefactor_full_name = (benefactor or {}).get("name", "") or ""
    benefactor_first_name = benefactor_full_name.split(" ", 1)[0] if benefactor_full_name else "the benefactor"

    # Keep estate.state in sync with the user's current Settings address.
    # This ensures PDFs, readiness reports, and other estate-level features
    # also reflect the user's current declared state of residence.
    if benefactor_state != "Not specified" and estate.get("state") != benefactor_state:
        await db.estates.update_one({"id": estate_id}, {"$set": {"state": benefactor_state}})

    # Fetch all estate data in parallel
    (
        documents,
        beneficiaries,
        checklist_items,
        messages,
        readiness,
    ) = await asyncio.gather(
        db.documents.find(
            # Always exclude soft-deleted documents — the frontend
            # hides them from the Secure Document Vault, but without
            # this filter EGA still loads them, references them by
            # name in its analysis, and confuses users who can no
            # longer see those documents in their vault. Reported
            # May 6, 2026 ("Front:Back Side Cash Flow" surfaced
            # against a demo benefactor where the doc didn't exist).
            {"estate_id": estate_id, "deleted_at": None},
            {
                "_id": 0,
                "lock_password_hash": 0,
                "backup_code": 0,
                "voice_passphrase_hash": 0,
            },
        ).to_list(100),
        db.beneficiaries.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(100),
        db.checklists.find({"estate_id": estate_id}, {"_id": 0}).sort("order", 1).to_list(200),
        db.messages.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0, "video_url": 0}).to_list(100),
        calculate_estate_readiness(estate_id),
    )

    # Build context string
    context_parts = []

    # Estate info with benefactor's CURRENT residence (from Settings page) for state-specific legal advice
    context_parts.append(f"""
**CURRENT ESTATE INFORMATION:**
- Estate Name: {estate["name"]}
- Benefactor's Name: {benefactor_full_name or "Not specified"} (first name: {benefactor_first_name})
- Benefactor's Declared Address: {benefactor_street or "Not specified"}, {benefactor_city or "Not specified"}, {benefactor_state} {benefactor_zip or ""}
- Benefactor's State of Residence: {benefactor_state}
- Benefactor's City: {benefactor_city or "Not specified"}
- Benefactor's ZIP: {benefactor_zip or "Not specified"}
- Marital Status: {benefactor_marital or "Not specified"}
- Special Status: {", ".join(benefactor_special) if benefactor_special else "None"}
- Estate Status: {estate.get("status", "pre-transition")}
- Overall Readiness Score: {readiness["overall_score"]}%

**IMPORTANT: The benefactor's declared state of residence is {benefactor_state} (sourced from their current Settings/Profile page — this is always the most up-to-date value). ALL legal analysis, statutes, probate rules, homestead exemptions, community/common property rules, estate/inheritance tax thresholds, and filing requirements MUST be specific to {benefactor_state}. If the state is "Not specified", ask the user to update their address in Settings before providing state-specific advice.**
""")

    # Readiness breakdown
    context_parts.append(f"""
**ESTATE READINESS BREAKDOWN:**
- Documents: {readiness["documents"]["score"]}% ({readiness["documents"]["found"]}/{readiness["documents"]["required"]} required docs)
  Missing: {", ".join(readiness["documents"]["missing"]) if readiness["documents"]["missing"] else "None"}
- Milestone Messages: {readiness["messages"]["score"]}% ({readiness["messages"]["found"]}/{readiness["messages"]["required"]} expected)
  Issues: {", ".join(readiness["messages"]["missing"][:3]) if readiness["messages"]["missing"] else "None"}
- Checklist: {readiness["checklist"]["score"]}% ({readiness["checklist"]["found"]}/{readiness["checklist"]["required"]} items)
  Issues: {", ".join(readiness["checklist"]["missing"]) if readiness["checklist"]["missing"] else "None"}
""")

    # Documents
    context_parts.append("**DOCUMENTS IN VAULT:**")
    if documents:
        # Data-handling contract: ONLY documents the benefactor explicitly flags
        # as AI-eligible are ever sent to the model — names, metadata, AND
        # content. Everything else is summarised as a bare count so the model
        # knows it exists without us disclosing it. FAIL-CLOSED: if nothing is
        # flagged, no document names or content go to the AI. (Removes the
        # legacy `documents[:10]` fallback, which leaked the content of
        # un-flagged documents into the prompt — audit finding P1-07.)
        ai_docs = [d for d in documents if d.get("ai_eligible") is True]
        withheld_count = len(documents) - len(ai_docs)

        for doc in ai_docs:
            locked_status = f" [LOCKED - {doc.get('lock_type', 'unknown')}]" if doc.get("is_locked") else ""
            context_parts.append(
                f"- {doc['name']} (Category: {doc['category']}, Type: {doc.get('file_type', 'unknown')}, Size: {doc.get('file_size', 0)} bytes){locked_status} [AI-eligible]"
            )
        if withheld_count:
            context_parts.append(
                f"- (+{withheld_count} other document(s) in the vault not flagged for AI analysis — withheld from this prompt)"
            )
        if not ai_docs:
            context_parts.append(
                "- No documents have been flagged for AI analysis yet. Ask the benefactor to tap the gold AI badge on the documents they want analysed."
            )

        # Include document content if requested — only for AI-eligible docs.
        if include_doc_content and ai_docs:
            context_parts.append("\n**DOCUMENT CONTENTS (for analysis):**")

            # Adaptive per-doc cap. Grok-4 has a generous context window
            # but giant prompts are slow AND expensive. Scale the per-doc
            # text limit based on how many docs the user has flagged so
            # the total stays in a sane envelope (~80k chars across all
            # docs as a soft ceiling).
            n = len(ai_docs)
            if n <= 8:
                per_doc_cap = 4000
            elif n <= 16:
                per_doc_cap = 2500
            elif n <= 32:
                per_doc_cap = 1500
            else:
                per_doc_cap = 1000

            async def extract_one(doc):
                try:
                    full_doc = await db.documents.find_one({"id": doc["id"]}, {"_id": 0})
                    if not full_doc or not (full_doc.get("storage_key") or full_doc.get("file_data")):
                        return doc["name"], "[No content available]"
                    text = await asyncio.wait_for(extract_document_text(full_doc), timeout=15)
                    return doc["name"], text
                except asyncio.TimeoutError:
                    return doc["name"], "[Extraction timed out]"
                except Exception:
                    return doc["name"], "[Extraction error]"

            results = await asyncio.gather(*[extract_one(doc) for doc in ai_docs])
            for name, text in results:
                if text and not text.startswith("["):
                    context_parts.append(f"\n--- {name} ---\n{text[:per_doc_cap]}\n--- End of {name} ---")
                else:
                    context_parts.append(f"\n--- {name} ---\n{text}\n---")
    else:
        context_parts.append("- No documents uploaded yet")

    # Beneficiaries
    context_parts.append("\n**BENEFICIARIES:**")
    if beneficiaries:
        # Sort by succession_order ascending (None last). The first
        # entry in the resulting list is the PRIMARY beneficiary — the
        # default assignee for any IAC action item that the benefactor's
        # documents don't already designate by name.
        def _succ_key(b: dict) -> tuple:
            so = b.get("succession_order")
            return (0, so) if so is not None else (1, 0)

        sorted_bens = sorted(beneficiaries, key=_succ_key)
        primary_first_name = ""
        for idx, ben in enumerate(sorted_bens):
            age_info = ""
            if ben.get("date_of_birth"):
                try:
                    dob = datetime.fromisoformat(ben["date_of_birth"].replace("Z", "+00:00"))
                    age = (datetime.now(timezone.utc) - dob).days // 365
                    age_info = f", Age: {age}"
                except Exception:
                    pass
            gender_info = f", Gender: {ben.get('gender', 'not specified')}" if ben.get("gender") else ""
            full_name = ben.get("name") or f"{ben.get('first_name', '')} {ben.get('last_name', '')}".strip()
            first_name = ben.get("first_name") or (full_name.split(" ", 1)[0] if full_name else "")
            in_succession = ben.get("succession_order") is not None
            tier_label = f"Succession #{ben['succession_order'] + 1}" if in_succession else "Not in succession"
            primary_flag = (
                " ← PRIMARY BENEFICIARY (default assignee for IAC actions when no named individual takes precedence)"
                if (idx == 0 and in_succession)
                else ""
            )
            if idx == 0 and in_succession and not primary_first_name:
                primary_first_name = first_name
            context_parts.append(
                f"- {full_name} (First name: {first_name}, Relation: {ben.get('relation', 'unknown')}, "
                f"{tier_label}{age_info}{gender_info}, Email: {ben.get('email', 'not on file')}){primary_flag}"
            )
        if primary_first_name:
            context_parts.append(
                f"\n**PRIMARY BENEFICIARY (default assignee):** {primary_first_name}. "
                f"When an IAC action item is not already directed at a person named in a specific vault document "
                f"(e.g., the executor named in the will, the successor trustee named in the trust, the agent named "
                f"in a POA), address the item to {primary_first_name} by first name."
            )
    else:
        context_parts.append("- No beneficiaries added yet")

    # Checklist summary
    completed = sum(1 for item in checklist_items if item.get("is_completed"))
    context_parts.append(f"\n**CHECKLIST STATUS:** {completed}/{len(checklist_items)} items completed")

    # Current checklist categories
    categories = {}
    for item in checklist_items:
        cat = item.get("category", "other")
        if cat not in categories:
            categories[cat] = {"total": 0, "completed": 0}
        categories[cat]["total"] += 1
        if item.get("is_completed"):
            categories[cat]["completed"] += 1

    for cat, counts in categories.items():
        context_parts.append(f"  - {cat}: {counts['completed']}/{counts['total']} completed")

    # Messages summary
    context_parts.append(f"\n**MILESTONE MESSAGES:** {len(messages)} total")
    if messages:
        try:
            _msg_salt = await get_estate_salt(estate_id)
        except Exception:
            _msg_salt = None
        for msg in messages[:10]:
            trigger_info = msg.get("trigger_type", "immediate")
            if msg.get("trigger_age"):
                trigger_info += f" (age {msg['trigger_age']})"
            # audit #1798 P3 — decrypt the encrypted title before exposing it to
            # the model; fall back to the short display label, else omit.
            title = ""
            if msg.get("encrypted_title") and _msg_salt is not None:
                try:
                    title = decrypt_field(msg["encrypted_title"], _msg_salt)
                except Exception:
                    title = msg.get("title", "") or ""
            else:
                title = msg.get("title", "") or ""
            label = f'"{title}"' if title else "(untitled message)"
            context_parts.append(f"- {label} (Type: {msg.get('message_type', 'text')}, Trigger: {trigger_info})")

    return "\n".join(context_parts)


@router.post("/chat/guardian", response_model=ChatResponse)
async def chat_with_guardian(data: ChatRequest, current_user: dict = Depends(get_current_user)):
    """Send a message to the Estate Guardian AI."""
    from guards import get_subscription_access

    access = await get_subscription_access(current_user)
    if not access["has_access"]:
        raise HTTPException(
            status_code=403,
            detail="An active subscription is required to query Estate Guardian AI.",
        )

    if not xai_client:
        raise HTTPException(status_code=500, detail="AI service not configured")

    await require_ai_burn_budget(current_user, _guardian_ai_guard_feature(data.action))

    # ── Rate limits (per-user, rolling 24h) ──
    # `generate_iac` is a heavy full-vault analysis that ends in a PDF
    # download. Users very rarely change major estate docs more than
    # once per day, so capping at 1/day prevents accidental re-runs
    # eating token budget while preserving genuine same-day refreshes
    # via admin override. Everything else (regular EGA chat, analyze
    # readiness, state-law lookup, etc.) shares a 10/day pool.
    # Admins AND users flagged with `ai_unlimited=true` (founder
    # override, set via Admin → Users tab) bypass these limits.
    if current_user.get("role") != "admin" and not current_user.get("ai_unlimited"):
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        if data.action == "generate_iac":
            iac_count = await db.guardian_usage.count_documents(
                {
                    "user_id": current_user["id"],
                    "action": "generate_iac",
                    "created_at": {"$gte": since.isoformat()},
                }
            )
            if iac_count >= 1:
                raise HTTPException(
                    status_code=429,
                    detail="Daily limit reached — Immediate Action Checklist can be regenerated once per day. Try again tomorrow.",
                )
        else:
            ega_count = await db.guardian_usage.count_documents(
                {
                    "user_id": current_user["id"],
                    "action": {"$ne": "generate_iac"},
                    "created_at": {"$gte": since.isoformat()},
                }
            )
            if ega_count >= 10:
                raise HTTPException(
                    status_code=429,
                    detail="Daily limit reached — Estate Guardian AI allows 10 queries per day. Try again tomorrow.",
                )

        # Per-user daily TOKEN budget — catches users who use a lot of
        # context (giant vault, long chat history) and would otherwise
        # slip past the request-count check. Budget = sum of input +
        # output tokens across all actions in the last 24h. Defaults
        # to 500K tokens/day (covers ~5 heavy IAC runs at ~100K each
        # — generous for legit use, hard ceiling against abuse). The
        # cap is centralized in PER_USER_DAILY_TOKEN_BUDGET so an
        # admin can lift it via env var if a paying tier needs more.
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        token_usage_agg = await db.xai_usage.aggregate(
            [
                {"$match": {"user_id": current_user["id"], "date": today}},
                {
                    "$group": {
                        "_id": None,
                        "input_total": {"$sum": "$input_tokens"},
                        "output_total": {"$sum": "$output_tokens"},
                    }
                },
            ]
        ).to_list(1)
        if token_usage_agg:
            tokens_used = (token_usage_agg[0].get("input_total", 0) or 0) + (
                token_usage_agg[0].get("output_total", 0) or 0
            )
            if tokens_used >= PER_USER_DAILY_TOKEN_BUDGET:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"Daily AI budget reached ({tokens_used:,} of {PER_USER_DAILY_TOKEN_BUDGET:,} tokens used today). "
                        "Your quota resets at midnight UTC."
                    ),
                )

    # Record this attempt before issuing the LLM call so we count
    # the user's intent even on failure (prevents retry-storms).
    try:
        await db.guardian_usage.insert_one(
            {
                "user_id": current_user["id"],
                "action": data.action or "chat",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as _e:  # noqa: BLE001
        logger.warning(f"guardian_usage record failed: {_e}")

    session_id = data.session_id or f"chat_{current_user['id']}_{str(uuid.uuid4())[:8]}"
    action_result = None

    # Get estate context if estate_id provided
    estate_context = ""
    estate_id = data.estate_id
    needs_content = False

    if not estate_id:
        if current_user.get("role") == "admin":
            estates = await db.estates.find({}, {"_id": 0}).to_list(1)
        else:
            estates = await db.estates.find({"owner_id": current_user["id"]}, {"_id": 0}).to_list(1)
        if estates:
            estate_id = estates[0]["id"]

    if estate_id:
        # Owner-gate (BOLA fix). Two-tier 403 layering:
        #   • require_estate_actor raises a generic 403 if the caller is not a
        #     member of this estate at all.
        #   • the explicit check below returns the friendly message to a genuine
        #     BENEFICIARY (member, but not owner/admin) — Estate Guardian is an
        #     owner-only surface; beneficiaries use the Beneficiary Concierge.
        actor = await require_estate_actor(estate_id, current_user)
        if not (actor.get("is_owner") or actor.get("is_admin")):
            raise HTTPException(
                status_code=403,
                detail="Estate Guardian is available only to the estate owner. Beneficiaries should use Beneficiary Concierge.",
            )
        needs_content = data.action in (
            "analyze_vault",
            "generate_todo",
            "generate_iac",
            "find_inconsistencies",
            "quickstart_gap_check",
        ) or any(
            keyword in data.message.lower()
            for keyword in [
                "analyze",
                "review",
                "read",
                "what does",
                "contents",
                "says",
                "summary",
                "summarize",
                "check my",
            ]
        )
        estate_context = await gather_estate_context(estate_id, include_doc_content=needs_content)

    system_message = ESTATE_GUARDIAN_SYSTEM_PROMPT.format(
        estate_context=estate_context
        if estate_context
        else "No estate context available. Ask the user to select an estate."
    )

    # Handle special actions
    user_message_text = data.message

    if data.action == "generate_todo":
        user_message_text = """Based on my estate documents and current situation, generate a comprehensive, prioritized To-Do List of tasks I should complete to strengthen my estate plan.

Requirements:
- Create specific, actionable tasks for ME (the benefactor) to improve my estate
- Prioritize based on urgency: immediate (day 1-3), first_week, two_weeks, first_month
- Make items specific to MY estate based on the documents in my vault
- Consider my state's specific legal requirements
- Each item should have a clear title and actionable description
- Focus on gaps and weaknesses in my current estate plan
- Include things like missing documents, unsigned forms, outdated provisions, beneficiary gaps

Return your response as helpful advice with the to-do items clearly listed. Format them with numbered sections by priority category (Immediate, First Week, Two Weeks, First Month). Do NOT include any JSON blocks — just a clean, readable to-do list that I can download as a PDF."""

    elif data.action == "generate_iac":
        user_message_text = """Based on the documents in my Secure Document Vault and the beneficiaries I have on file, generate a comprehensive Immediate Action Checklist.

VOICE & ADDRESSING (CRITICAL — read first):
- This checklist is written FROM ME (the benefactor) TO my loved ones, in my voice. Every item must read as if I am personally asking my family — calmly, warmly, and respectfully — to take care of something on my behalf. NEVER write items in cold, generic, third-person bureaucratic prose ("The executor should...", "Beneficiaries must..."). I am asking, not commanding.
- Default assignee is the PRIMARY BENEFICIARY (see the BENEFICIARIES context block — they are marked "← PRIMARY BENEFICIARY"). Address them by FIRST NAME ONLY (e.g., "Emma") in every item where my documents do not already designate a specific person by name.
- Tone: warm, requesting, never bossy. Example phrasings:
  • "Emma, please reach out to..."
  • "I'd like you to..." / "I'd appreciate it if Emma could..."
  • "Would you start by calling..."
  • "Emma — first, take a breath. Then..."
- If a vault document explicitly names a different person for a task (e.g., my will names "Sarah Mitchell" as executor, my trust names "Tom Mitchell" as successor trustee, my POA names "Jonathan Mitchell" as agent), that named person takes precedence over the default primary-beneficiary assignment. Address THAT named person by first name for THAT specific item.
- For items that genuinely involve the whole family (notifying relatives, securing the home), it's fine to address "Emma and the family" or "Emma, with your brother Tom's help" — pull in additional beneficiary first names from the BENEFICIARIES block when appropriate.
- Each "title" field is the short action label (≤ 60 chars). The "description" field is where the personalized, warm benefactor-voice prose lives. Aim for 2-4 sentences per description with the assignee's first name woven in naturally.

CRITICAL STRUCTURE REQUIREMENT — You MUST organize your response into TWO clearly separated sections with distinct headers. Do NOT intermix items from these two sections:

==============================
SECTION 1: "IMMEDIATE ACTION CHECKLIST FOR BENEFICIARIES"
==============================
This section is for my BENEFICIARIES and loved ones to follow AFTER my death. These are instructions they will execute upon my passing.

Requirements for Section 1:
- Extract SPECIFIC, ACTIONABLE information from my vault documents — phone numbers, policy numbers, contact names, institutions, account numbers, beneficiary names, percentages
- For each life insurance policy: include the EXACT carrier name, policy number, primary and contingent beneficiaries with their percentages, and the phone number to call (or note "obtain from policy records" if absent)
- Identify who the SUCCESSOR TRUSTEE is by NAME (extracted from the trust document) and include their contact info if available
- List financial institutions by name with account details where available
- Probate guidance MUST be state-specific: cite the actual statute (e.g., "Florida Statute §735.301 small-estate threshold of $75,000"), name the COUNTY of residence, and provide the county clerk's office contact if you can infer it from the address
- Note any immediate deadlines tied to state law (e.g., FL probate filing under §733.212)
- Prioritize by urgency: immediate (day 1-3), first_week, two_weeks, first_month
- Be EXTREMELY specific — "Emma, please file the life insurance claim with Atlantic National Life Insurance Co., Policy #ANL-45839271 — you're the primary beneficiary (100%). Their claims line is 1-800-555-XXXX." not "Contact life insurance company"

==============================
SECTION 2: "ESTATE STRENGTHENING RECOMMENDATIONS FOR THE BENEFACTOR"
==============================
This section is for ME (the benefactor) — things I should do NOW to tighten up, fix, or improve my estate plan while I'm still alive.

Requirements for Section 2 — actively HUNT FOR INCONSISTENCIES across documents:
- RESIDENCY MISMATCH: Does any document list a different state/address than my current declared residence? Flag the document by name and cite the relevant statute the mismatch exposes me under (e.g., FL §732.502 for wills, FL §709.2101 for POAs).
- BENEFICIARY MISMATCH: Cross-reference beneficiaries across the will, trust, life insurance policy, and retirement accounts. Flag any contradictions or omissions (e.g., a child on life insurance but not the will).
- TRUSTEE/EXECUTOR/AGENT GAPS: Are the named successor trustee, executor, financial POA agent, and healthcare proxy current and reachable? Flag any document with no successor named.
- UNDER-FUNDED TRUSTS: If a trust is funded with a nominal amount (e.g., "$10.00") and no schedule of assets attached, flag it — the user almost certainly intended to retitle real assets into it.
- EXPIRED DOCUMENTS: POAs / living wills / healthcare directives older than 5 years.
- MILESTONE MESSAGE GAPS: Compare my beneficiaries list to recorded milestone messages — if coverage is <50%, surface this as a recommendation.
- STATE-SPECIFIC EXECUTION DEFECTS: Verify each document meets current state's witnessing / notarization rules; cite the statute.
- Prioritize by urgency: immediate (invalidates the document), first_week (could delay probate), two_weeks (cleanup), first_month (nice to have)

For EACH recommendation in Section 2, the `description` field MUST cite the specific issue + the relevant statute + the exact fix. Example: "Your 'Last Will & Testament' lists 1234 Main St, McLean VA — update to your current FL residence at 6450 31st Terrace N, St. Petersburg, FL 33710 to comply with FL Statute §732.502."

BOTH sections should be included in your response with clear, bold section headers so the reader can immediately distinguish between "what my family does after I die" and "what I need to fix now."

IMPORTANT — INCLUDE A BASELINE OF UNIVERSAL ITEMS (ONE ITEM PER LINE — DO NOT CONSOLIDATE):
Regardless of what specific documents I have in my vault, you MUST emit EACH of the following as a SEPARATE checklist item (one JSON object per line below — NEVER merge multiple actions into a single item). Tag every baseline item's "source" field as "ai_general_recommendation".

REMINDER: address the PRIMARY BENEFICIARY by first name in each description (e.g., "Emma, please..."). Vary the phrasing across items so it doesn't read robotically. If the BENEFICIARIES context lists no primary, address items to "my family" warmly.

BASELINE — CRITICAL / IMMEDIATE (category=immediate, priority=critical) — emit ALL of these as separate items:
1. Notify immediate family of the passing
2. Notify the named executor and successor trustee
3. Secure the primary residence (lock doors, set alarm, collect mail/packages, arrange for pets)
4. Secure valuables (jewelry, firearms, cash, important physical documents)
5. Obtain at least 10 certified death certificates from the county vital records office (NAME THE EXACT COUNTY based on my declared address and provide the county clerk's phone number if you can infer it)
6. Preserve perishables and arrange short-term care for pets, plants, livestock
7. Begin funeral / cremation arrangements per any pre-paid plan or written wishes

BASELINE — FIRST WEEK (category=first_week, priority=high) — emit ALL of these as separate items:
8. Notify the Social Security Administration of the death (1-800-772-1213)
9. Notify the decedent's employer / HR department to coordinate final pay, COBRA, retirement plan rollover, and any group life insurance
10. Check for funeral insurance, pre-paid arrangements, or veteran's burial benefits (VA: 1-800-827-1000)
11. Set up USPS mail forwarding or hold to a trusted address to prevent identity theft
12. Notify the deceased's primary care physician and any specialists for medical record closure
13. Locate and inventory all financial accounts, insurance policies, and recurring bills

BASELINE — 2 WEEKS – 1 MONTH (category=two_weeks, priority=medium) — emit ALL of these as separate items:
14. File life insurance claims with each carrier (use the EXACT carrier names + policy numbers from my vault if available)
15. Contact each financial institution to freeze, retitle, or claim the accounts (provide the death certificate + executor letter)
16. Cancel subscriptions, memberships, and recurring auto-payments (streaming, gym, clubs, software)
17. Notify utility companies and either transfer service or close accounts
18. Cancel the decedent's driver's license at the DMV and surrender the physical card
19. Notify credit bureaus (Equifax, Experian, TransUnion) to flag the file as deceased to prevent identity theft

BASELINE — FIRST MONTH+ (category=first_month, priority=low) — emit ALL of these as separate items:
20. File the decedent's final federal income tax return (Form 1040) and any state return
21. File the estate's tax return (Form 1041) if required, and an estate tax return (Form 706) if assets exceed thresholds
22. Transfer or close credit cards, lines of credit, and pay outstanding card balances from the estate
23. Settle estate debts and creditor claims via the probate process per state law
24. Transfer vehicle titles via the DMV (provide certified death certificate + executor letter)
25. Update beneficiary designations on any inherited retirement accounts (rollover vs lump-sum decisions)
26. Consult an estate / probate attorney for state-specific filings; cite my state's small-estate threshold and any non-court transfer options (transfer-on-death deeds, joint tenancy)
27. Update or close email accounts, social media (memorialize Facebook, deactivate Twitter), cloud storage

DOCUMENT-DERIVED ITEMS (in addition to the 27 baseline items above):
For EACH AI-eligible document in my vault, mine it for SPECIFIC, ACTIONABLE items and emit them as additional checklist entries. Tag each with the EXACT document filename in the "source" field. Examples:
- Life insurance policy → 1 item per beneficiary tier with carrier name, policy #, beneficiary name + %, claim phone
- Trust document → 1 item to activate successor trustee (with name + phone), 1 item per trust-funded asset to verify retitling
- Will → 1 item for executor to file with the probate court (with county clerk's address), 1 item per specific bequest
- POA / Healthcare Directive → cancel or note that the document is no longer in force
- Deed → 1 item to retitle property per the named survivorship clause or trust transfer instruction
Aim for at least 2-4 document-derived items per AI-eligible document. NEVER skip a document.

MINIMUM COUNT REQUIREMENT (CRITICAL):
Before you emit the JSON, COUNT your items. You MUST emit AT LEAST 27 baseline beneficiary_action items + at least 2 document-derived items per AI-eligible vault document. If your count is lower, you have over-consolidated — go back and split merged items into separate entries. A correct response will have at least 30-45 items in the JSON array.

PRIORITY MAPPING (CRITICAL — used for UI sorting):
- category=immediate → priority=critical
- category=first_week → priority=high
- category=two_weeks → priority=medium
- category=first_month → priority=low

Return ALL checklist items in this exact JSON format at the END of your response, wrapped in ```checklist_json``` tags. Use the "section" field to distinguish between beneficiary actions (which go into the IAC) and benefactor recommendations (which stay in the chat/PDF). Use the "source" field to attribute the item:
```checklist_json
[{{"title": "Item title", "description": "Detailed description with specific contacts/numbers/statute citations", "category": "immediate|first_week|two_weeks|first_month", "priority": "critical|high|medium|low", "section": "beneficiary_action|benefactor_recommendation", "source": "ai_general_recommendation|<exact document name from vault>", "order": 1}}]
```"""

    elif data.action == "analyze_readiness":
        user_message_text = """Analyze my Estate Readiness Score in detail. For each of the three categories (Documents, Messages, Checklist):
1. Explain what I have and what I'm missing
2. Provide specific, actionable steps to improve each score
3. Reference my state's specific requirements where applicable
4. Prioritize recommendations by impact

Also identify any potential legal issues or gaps in my estate plan based on the documents in my vault."""

    elif data.action == "analyze_vault":
        user_message_text = """Perform a comprehensive analysis of all documents in my Secure Document Vault. For each document:
1. Summarize the key contents and provisions
2. Identify any potential issues, gaps, or inconsistencies
3. Check if the documents work together properly (e.g., will and trust alignment)
4. Note any state-specific compliance issues
5. Recommend additional documents I should consider

Provide a clear, organized analysis with specific findings and recommendations."""

    elif data.action == "state_law_brief":
        user_message_text = """Provide a comprehensive brief on estate planning laws for my declared state of residence. Cover:
1. Probate process — is probate required, how long does it typically take, and what are the thresholds?
2. Estate and inheritance taxes — any state-level estate or inheritance tax, thresholds, and rates?
3. Community vs. common law property rules
4. Homestead exemption — does my state offer one, and what are the limits?
5. Power of Attorney and Healthcare Directive requirements — any state-specific forms or witnesses needed?
6. Trust laws — is my state favorable for revocable/irrevocable trusts? Any unique trust types?
7. Beneficiary designation rules — any state-specific rules for TOD/POD accounts?
8. Recent legislative changes — any new estate planning laws enacted in the last 2 years?

Be specific to MY state. Cite actual statutes or code sections where possible."""

    elif data.action == "find_inconsistencies":
        user_message_text = """Cross-reference every document in my Secure Document Vault against itself, against my profile, and against my declared state of residence. Surface ALL inconsistencies, mismatches, gaps, and stale information. Be specific, name documents by their exact vault filename, and cite state statutes where relevant. Group your findings into the following categories:

1. RESIDENCY / ADDRESS MISMATCHES — Does any document still list a former state of residence (e.g., a will from Virginia while you've now moved to Florida)? This can invalidate a will or POA under the new state's execution requirements (e.g., FL Statute §732.502 for wills, §709.2101 for POAs). Identify each document with a stale address and call out the specific statute the user is exposed under.

2. BENEFICIARY DESIGNATION MISMATCHES — Compare beneficiary lists across the will, trust, life insurance policy, retirement designations, and any TOD/POD accounts. Flag any contradictions (e.g., a child listed on life insurance but not in the will, an ex-spouse still on a retirement account).

3. TRUSTEE / EXECUTOR / AGENT GAPS — Are the named successor trustee, executor, financial POA agent, and healthcare proxy current, contactable, and aligned? Flag any document with no successor named, or where the named person is deceased / unreachable / conflicted.

4. UNDER-FUNDED OR PLACEHOLDER TRUSTS — If a trust document is funded with a nominal amount (e.g., "$10.00") and no schedule of assets has been attached, flag this — the user almost certainly intended to retitle real assets into it.

5. EXPIRED / OUT-OF-DATE DOCUMENTS — Living wills, healthcare directives, and POAs that are >5 years old should be flagged for re-execution.

6. MILESTONE MESSAGE COVERAGE GAPS — Compare the list of beneficiaries against the milestone messages recorded. Identify beneficiaries with zero messages and recommend the most common milestones to record (graduation, marriage, first child, important birthdays, anniversary of passing).

7. STATE-SPECIFIC EXECUTION DEFECTS — For each document, verify it meets the current state's witnessing / notarization rules. Cite the relevant statute (e.g., FL §732.502 requires 2 witnesses for a will; many states require notarization for POAs).

For EACH finding, return:
- The exact document filename it relates to (or "MULTIPLE — see description")
- The specific fix to recommend
- The state statute the user is exposed under, if applicable
- An urgency level: critical (invalidates the document), high (could delay probate), medium (cleanup), low (nice to have)

Be exhaustive. The user is preparing for a B2B pitch where this output is a key demo, so the more specific findings you can surface, the better."""

    elif data.action == "quickstart_gap_check":
        user_message_text = """Compare my personalized QuickStart Estate Plan Guide PDF against every OTHER document in my Secure Document Vault. The QuickStart Guide is the one filed under the "QuickStart Estate Plan Guide" name in the vault \u2014 it contains my professional-prep checklist, my personalized observations, my state-law notes, and my key terms glossary. It is the source-of-truth checklist of what I should have addressed.

Your job is to tell me, item-by-item, which checklist actions have been ADDRESSED by an uploaded document in my vault and which remain as GAPS.

Use this output structure exactly:

1. ADDRESSED \u2014 Checklist items already covered by a vault document.
   For each: cite the checklist item verbatim from the QuickStart Guide, then identify by exact filename the vault document that addresses it, then summarize in one sentence HOW that document satisfies the item. Group these by the professional the item was assigned to in the Guide (Estate Attorney, CPA / Tax Advisor, Financial Advisor, Life Insurance Agent, Business Attorney / CPA, etc.).

2. GAPS \u2014 Checklist items NOT yet covered by any vault document.
   For each: cite the checklist item verbatim, name which document type would satisfy it (e.g. "Florida-executed Durable POA, witnessed and notarized", "Trust funding schedule attached to the revocable trust", "Beneficiary designation form from the insurance carrier"), and rank urgency: critical / high / medium / low. Group by the same professional headings.

3. PERSONALIZED-OBSERVATION COVERAGE \u2014 For each `personalized_observations` item in the Guide, state whether the user has uploaded a document that responds to it. If not, flag the specific document or action the user still needs.

4. RECOMMENDED NEXT THREE ACTIONS \u2014 Pick the three highest-leverage GAPS and write them as imperative sentences the user can act on this week.

Exclude the QuickStart Estate Plan Guide PDF itself from the comparison. Only treat the OTHER documents in the vault as potential coverage.

If no QuickStart Guide is present in the vault, respond with a single short line: "I don't see a QuickStart Estate Plan Guide in your vault yet \u2014 open the QuickStart Wizard from your Dashboard or from Settings \u2192 Appearance to generate one first." Do not invent a checklist from thin air.

Be specific. Name documents by their exact vault filename. Quote checklist items verbatim. Cite state statutes where they're relevant to a gap."""

    try:
        # Build conversation history from DB for multi-turn context
        # pre-push-invariants: allow-system-content-bypass — `system_message` is the safety-wrapped `ESTATE_GUARDIAN_SYSTEM_PROMPT` (line 551) after `.format(estate_context=...)`.
        history_messages = [{"role": "system", "content": system_message}]

        # Cross-chat knowledge: include key points from recent sessions.
        # audit #1798 P1 — estate-scoped: only pull prior context from the SAME
        # estate, and exclude legacy rows that predate estate_id (they can't be
        # proven to belong to this estate).
        if session_id.startswith("chat_") and estate_id:
            recent_sessions = await db.chat_history.aggregate(
                [
                    {
                        "$match": {
                            "user_id": current_user["id"],
                            "estate_id": estate_id,
                            "session_id": {"$ne": session_id},
                        }
                    },
                    {"$sort": {"created_at": -1}},
                    {"$limit": 40},
                    {
                        "$group": {
                            "_id": "$session_id",
                            "messages": {
                                "$push": {
                                    "role": "$role",
                                    "content": "$content",
                                }
                            },
                        }
                    },
                    {"$limit": 5},
                ]
            ).to_list(5)
            if recent_sessions:
                cross_context_parts = []
                for sess in recent_sessions:
                    # Take last 2 exchanges from each session (up to 4 messages)
                    msgs = sess["messages"][-4:]
                    summary = " | ".join(
                        f"{'User' if m['role'] == 'user' else 'Guardian'}: {m['content'][:150]}" for m in msgs
                    )
                    cross_context_parts.append(summary)
                cross_context = "\n---\n".join(cross_context_parts)
                history_messages.append(
                    # pre-push-invariants: allow-system-content-bypass — secondary context message appended AFTER the primary safety-wrapped system at position 0; carries no model directives.
                    {
                        "role": "system",
                        "content": f"PREVIOUS CONVERSATION CONTEXT (the user may reference these):\n{cross_context}",
                    }
                )

        # Load previous messages from this session (estate-scoped — audit #1798 P1)
        prev_messages = (
            await db.chat_history.find(
                {"session_id": session_id, "user_id": current_user["id"], "estate_id": estate_id}, {"_id": 0}
            )
            .sort("created_at", 1)
            .to_list(50)
        )

        for msg in prev_messages:
            history_messages.append({"role": msg["role"], "content": msg["content"]})

        # Add the current user message
        history_messages.append({"role": "user", "content": user_message_text})

        # Call xAI Grok — use Grok-4 for heavy analysis, Grok-3-mini for chat
        use_heavy_model = (
            data.action
            in (
                "analyze_vault",
                "generate_todo",
                "generate_iac",
                "analyze_readiness",
                "state_law_brief",
                "find_inconsistencies",
                "quickstart_gap_check",
            )
            or needs_content
        )
        selected_model = XAI_MODEL if use_heavy_model else XAI_MODEL_LIGHT

        # Track IAC generation task for real-time polling by Dashboard/Checklist
        iac_task_id = None
        if data.action == "generate_iac" and estate_id:
            iac_task_id = f"iac_{uuid.uuid4().hex[:8]}"
            await db.ega_tasks.update_one(
                {"estate_id": estate_id, "type": "generate_iac"},
                {
                    "$set": {
                        "id": iac_task_id,
                        "estate_id": estate_id,
                        "user_id": current_user["id"],
                        "type": "generate_iac",
                        "status": "running",
                        "items_added": 0,
                        "duplicates_skipped": 0,
                        "duplicate_titles": [],
                        "started_at": datetime.now(timezone.utc).isoformat(),
                        "completed_at": None,
                    }
                },
                upsert=True,
            )

        # Auto-retry with escalating backoff + multi-model failover.
        # Both heavy actions (vault analysis, IAC, readiness, to-do,
        # state-law brief) AND light chat now share the same failover
        # ladder: try the preferred model first, then walk DOWN the
        # ladder (lighter/cheaper models) so a single rate-limit /
        # capacity incident on x.ai never takes EGA down. Previously
        # heavy actions only tried `selected_model` and surfaced a 500
        # the moment grok-4 was at capacity, which manifested to the
        # user as "Generate To-Do List fails before I can even open
        # the PDF preview". 55s soft deadline keeps us under ingress
        # hard cut-off.
        completion = None
        last_error = None
        # Full ladder (deduped while preserving order). For heavy
        # actions we lead with the heavy model; for light chat we
        # lead with the light model. Both fall back through the
        # remaining models on the ladder.
        _is_heavy = data.action in (
            "analyze_vault",
            "generate_todo",
            "generate_iac",
            "analyze_readiness",
            "state_law_brief",
            "find_inconsistencies",
            "quickstart_gap_check",
        )

        # Acquire the platform-wide concurrency token for heavy actions
        # so a click-storm can't blast xAI's per-API-key ceiling. Wait
        # up to _HEAVY_AI_WAIT_TIMEOUT_S for a slot; if we time out,
        # return a friendly 503 with a Retry-After hint instead of
        # blocking the request indefinitely. Light chat skips this
        # gate — those calls are sub-second and bounded by the
        # per-user daily quota.
        _sem_acquired = False
        if _is_heavy:
            try:
                await asyncio.wait_for(_HEAVY_AI_SEMAPHORE.acquire(), timeout=_HEAVY_AI_WAIT_TIMEOUT_S)
                _sem_acquired = True
            except asyncio.TimeoutError:
                if iac_task_id:
                    await db.ega_tasks.update_one(
                        {"id": iac_task_id},
                        {
                            "$set": {
                                "status": "queued",
                                "queue_message": "Demand is high — your analysis will start as soon as a slot opens. Refresh in ~30 seconds.",
                            }
                        },
                    )
                raise HTTPException(
                    status_code=503,
                    detail="Estate Guardian AI is at capacity right now — try again in ~30 seconds. Your prior work is saved.",
                    headers={"Retry-After": "30"},
                )
        if _is_heavy:
            # grok-4 is observed to occasionally hang at the xAI edge
            # (even for a 1-token "say hi" prompt), and a hung grok-4
            # burns our entire per-attempt budget before failing over.
            # grok-3 returns sub-second for the same prompts and has
            # been consistently healthy, so we LEAD with grok-3 for
            # heavy analytical actions and keep grok-4 as a quality
            # fallback for the rare case grok-3 itself errors. This
            # turns the previously-common 180s-then-fail pattern into
            # a sub-5s success in the typical case.
            _ladder = ["grok-3", selected_model, XAI_MODEL_LIGHT]
        else:
            _ladder = [XAI_MODEL_LIGHT, "grok-3", XAI_MODEL]
        _seen: set = set()
        _MODEL_ORDER = [m for m in _ladder if m and not (m in _seen or _seen.add(m))]
        # For heavy IAC analysis the failover overhead matters more
        # than retries (a grok-4 timeout means we should move on, not
        # burn another 90s on the same model). Heavy = 1 attempt per
        # model. Chat-style replies keep 2 attempts for robustness.
        _MAX_PER_MODEL = 1 if _is_heavy else 2
        _DELAYS = [0, 1.5]
        # Total wall-clock budget for the full failover ladder.
        # New prompt is comprehensive and routinely runs 90-150s on
        # grok-3 (lead) for a vault-sized prompt; we budget for a full
        # primary run plus one fallback.
        _SOFT_DEADLINE_S = 420 if _is_heavy else 55
        # Per-attempt hard ceiling. The richer IAC + find-inconsistencies
        # prompt asks for statute citations, cross-doc audits, and
        # extracted contact details — that produces longer, slower
        # responses than the original lightweight prompt. 180s gives
        # grok-3 enough room for a full response without bouncing the
        # request to grok-4 mid-generation.
        _PER_CALL_TIMEOUT_S = 180.0 if _is_heavy else 45.0
        _started_at = asyncio.get_event_loop().time()
        for model_name in _MODEL_ORDER:
            if completion is not None:
                break
            for attempt in range(_MAX_PER_MODEL):
                try:
                    if _DELAYS[attempt]:
                        await asyncio.sleep(_DELAYS[attempt])
                    elapsed = asyncio.get_event_loop().time() - _started_at
                    if elapsed > _SOFT_DEADLINE_S - 5:
                        logger.warning(
                            f"xAI deadline guard: skipping {model_name} attempt {attempt + 1} "
                            f"(elapsed {elapsed:.1f}s exceeds soft deadline)"
                        )
                        break
                    # Heavy IAC / find-inconsistencies / state-law-brief
                    # responses need room to emit the full Section 1 prose
                    # + Section 2 prose + a complete checklist_json fence
                    # with 20-25 richly-described items (statute citations,
                    # exact policy #s, beneficiary breakdowns, phone
                    # numbers). 4096 tokens routinely truncates the JSON
                    # mid-array, causing the parser to silently drop the
                    # tail — that's why the user used to see only 4-8
                    # items on the first pass and needed re-runs to
                    # accumulate the rest. 8192 fits the full output in
                    # one shot (~10x the prose budget of a typical chat
                    # reply) while staying well within grok-3's 131K
                    # output ceiling.
                    _max_tokens = 8192 if _is_heavy else 4096
                    completion = await asyncio.wait_for(
                        asyncio.to_thread(
                            xai_client.chat.completions.create,
                            model=model_name,
                            messages=history_messages,
                            temperature=0.7,
                            max_tokens=_max_tokens,
                            timeout=_PER_CALL_TIMEOUT_S,
                        ),
                        timeout=_PER_CALL_TIMEOUT_S + 5,
                    )
                    if model_name != selected_model:
                        logger.info(f"EGA served via failover model: {model_name} (preferred {selected_model})")
                    break
                except asyncio.TimeoutError as e:
                    last_error = e
                    logger.warning(
                        f"xAI timeout: model={model_name} attempt={attempt + 1}/{_MAX_PER_MODEL} "
                        f"(>{_PER_CALL_TIMEOUT_S}s) — failing over"
                    )
                except Exception as e:
                    last_error = e
                    logger.warning(
                        f"xAI fail: model={model_name} attempt={attempt + 1}/{_MAX_PER_MODEL} "
                        f"({type(e).__name__}: {str(e)[:200]})"
                    )

        if completion is None:
            if _sem_acquired:
                _HEAVY_AI_SEMAPHORE.release()
                _sem_acquired = False
            raise last_error

        # Cost ledger — fire-and-forget after the successful xAI completion.
        try:
            import time as _time_lg

            from services.llm_cost_ledger import record_xai_response as _rec_lg

            _elapsed_ms = int((asyncio.get_event_loop().time() - _started_at) * 1000)
            await _rec_lg(
                completion,
                endpoint=f"guardian.chat[{data.action or 'message'}]",
                model=model_name,
                user_id=current_user.get("id"),
                estate_id=estate_id,
                duration_ms=_elapsed_ms,
            )
            _ = _time_lg  # silence linter — kept for symmetry with other call sites
        except Exception:
            pass

        # Heavy-action concurrency token is held only across the xAI
        # call(s) themselves. The rest of the request handler (JSON
        # parsing, DB writes, response shaping) is fast and doesn't
        # need a slot. Release as early as possible so queued requests
        # can advance.
        if _sem_acquired:
            _HEAVY_AI_SEMAPHORE.release()
            _sem_acquired = False

        response = completion.choices[0].message.content

        # ── ANTI-CANNED-OPENER POST-PROCESSOR ──
        # Even with explicit prompt rules, Grok occasionally slips a
        # "Hey there—…" or "So, …" at the start of the second
        # paragraph. Strip those formulaic openers so the response
        # never reads like an AI template. We only touch paragraph
        # starts — the rest of the prose is preserved verbatim.
        if response:
            import re as _re

            _OPENER_RE = _re.compile(
                r"(?im)^(?:hey there|hi there|hey|hello there|so|alright|well|now then|now)[,—:\-\s]+",
            )
            paragraphs = response.split("\n\n")
            cleaned: list[str] = []
            for i, para in enumerate(paragraphs):
                if i == 0 or not para.strip():
                    cleaned.append(para)
                    continue
                stripped = _OPENER_RE.sub("", para, count=1)
                if stripped != para:
                    # Re-capitalize the now-leading char so the new
                    # sentence isn't lowercase.
                    stripped = stripped.lstrip()
                    if stripped:
                        stripped = stripped[0].upper() + stripped[1:]
                cleaned.append(stripped)
            response = "\n\n".join(cleaned)

        # Track xAI token usage for credit monitoring
        try:
            usage = completion.usage
            if usage:
                now_ts = datetime.now(timezone.utc)
                input_t = getattr(usage, "prompt_tokens", 0) or 0
                output_t = getattr(usage, "completion_tokens", 0) or 0
                # Grok-4: $3/1M input, $15/1M output; Grok-3-mini: ~$0.20/$0.50
                if selected_model == XAI_MODEL:
                    cost = (input_t * 3.0 / 1_000_000) + (output_t * 15.0 / 1_000_000)
                else:
                    cost = (input_t * 0.20 / 1_000_000) + (output_t * 0.50 / 1_000_000)
                await db.xai_usage.insert_one(
                    {
                        "date": now_ts.strftime("%Y-%m-%d"),
                        "timestamp": now_ts.isoformat(),
                        "model": selected_model,
                        "input_tokens": input_t,
                        "output_tokens": output_t,
                        "cost_usd": round(cost, 6),
                        "user_id": current_user["id"],
                        "session_id": data.session_id,
                    }
                )
        except Exception as track_err:
            logger.warning(f"Token tracking failed: {track_err}")

        # Append legal disclaimer to every response
        response += LEGAL_DISCLAIMER

        # Handle IAC generation — only generate_iac populates the Immediate Action Checklist
        if data.action == "generate_iac" and "checklist_json" in response:
            try:
                # Robust fence parser. Grok sometimes emits the fence
                # as ```checklist_json…```, sometimes as ```\nchecklist_json…```
                # (newline between the backticks and the language tag),
                # and occasionally as a plain ```json…``` block whose
                # contents happen to be our schema. We accept all three
                # via regex so a benign formatting nit doesn't silently
                # discard 23 perfectly-good checklist items.
                import re as _json_re

                checklist_json_str = None
                # Pattern A — ```checklist_json … ``` (canonical)
                m = _json_re.search(
                    r"```\s*checklist_json\s*\n?(.*?)\n?```",
                    response,
                    flags=_json_re.DOTALL | _json_re.IGNORECASE,
                )
                if m:
                    checklist_json_str = m.group(1).strip()
                else:
                    # Pattern B — any fenced block that contains the
                    # string "checklist_json" near the top (the
                    # newline-after-backticks variant).
                    m = _json_re.search(
                        r"```[a-zA-Z]*\s*\n\s*checklist_json\s*\n(.*?)\n?```",
                        response,
                        flags=_json_re.DOTALL | _json_re.IGNORECASE,
                    )
                    if m:
                        checklist_json_str = m.group(1).strip()

                if not checklist_json_str:
                    raise ValueError("No checklist_json fenced block found in AI response")

                # Tolerate the case where the AI added a leading
                # "checklist_json" label inside the fence on its own line.
                if checklist_json_str.lower().startswith("checklist_json"):
                    checklist_json_str = (
                        checklist_json_str.split("\n", 1)[1].strip() if "\n" in checklist_json_str else ""
                    )

                new_items = json_module.loads(checklist_json_str)

                # Diagnostic logging — captures EXACTLY what Grok returned so
                # we can immediately see if the model is under-emitting,
                # over-flagging items as benefactor_recommendation (which
                # would get filtered into chat-only), or if the title
                # dedup filter is silently discarding novel-but-similar
                # entries. Without this we have to guess whether 5 items
                # in the IAC means Grok produced 5 or 35.
                _bens_in_payload = sum(1 for it in new_items if it.get("section") != "benefactor_recommendation")
                _bens_recs_in_payload = sum(1 for it in new_items if it.get("section") == "benefactor_recommendation")
                logger.info(
                    f"IAC parse OK: total_items={len(new_items)} "
                    f"beneficiary_actions={_bens_in_payload} "
                    f"benefactor_recommendations={_bens_recs_in_payload} "
                    f"response_chars={len(response)} "
                    f"json_chars={len(checklist_json_str)} "
                    f"model={selected_model}"
                )

                # Get existing checklist items to avoid duplicates.
                # CRITICAL: must EXCLUDE soft-deleted items so the AI
                # can re-suggest things the user previously wiped.
                # Without this filter, a user who clears their IAC and
                # re-runs AI Suggest gets a toast saying "X added + Y
                # skipped" while the UI shows fewer items than the
                # toast implies — the "duplicates" are tombstones.
                existing = await db.checklists.find(
                    {"estate_id": estate_id, "deleted_at": None},
                    {"_id": 0, "id": 1, "title": 1},
                ).to_list(200)
                existing_titles = {item["title"].lower() for item in existing}

                items_added = 0
                duplicates_skipped = 0
                duplicate_titles = []
                benefactor_recs = 0
                max_order = len(existing)
                for item in new_items:
                    # Only inject beneficiary actions into the IAC.
                    # Benefactor recommendations stay in the chat/PDF only.
                    if item.get("section") == "benefactor_recommendation":
                        benefactor_recs += 1
                        continue
                    if item["title"].lower() in existing_titles:
                        duplicates_skipped += 1
                        duplicate_titles.append(item["title"])
                        continue
                    # Derive priority from category as a defensive
                    # fallback. The AI sometimes ignores the explicit
                    # priority field and leaves everything as the
                    # default — which used to bucket every AI-added
                    # item under "Medium - First 2 Weeks" in the UI.
                    cat = item.get("category", "first_month")
                    category_to_priority = {
                        "immediate": "critical",
                        "first_week": "high",
                        "two_weeks": "medium",
                        "first_month": "low",
                    }
                    priority = item.get("priority") or category_to_priority.get(cat, "medium")
                    checklist_item = ChecklistItem(
                        estate_id=estate_id,
                        title=item["title"],
                        description=item.get("description", ""),
                        category=cat,
                        priority=priority,
                        order=max_order + items_added + 1,
                    )
                    item_dict = checklist_item.model_dump()
                    item_dict["ai_suggested"] = True
                    item_dict["ai_accepted"] = None  # None=pending, True=accepted, False=rejected
                    item_dict["section"] = "beneficiary_action"
                    # Source attribution — either the exact vault
                    # document name or "ai_general_recommendation" for
                    # universal baseline items. Surfaced in the UI so
                    # the user knows whether an item was derived from
                    # one of their documents or is a generic best-
                    # practice suggestion from EGA.
                    item_dict["source"] = item.get("source") or "ai_general_recommendation"
                    await db.checklists.insert_one(item_dict)
                    items_added += 1

                # Recalculate readiness
                await update_estate_readiness(estate_id)

                action_result = {
                    "action": "iac_generated",
                    "items_added": items_added,
                    "duplicates_skipped": duplicates_skipped,
                    "duplicate_titles": duplicate_titles[:10],
                }

                # Update EGA task record for real-time polling
                if iac_task_id:
                    await db.ega_tasks.update_one(
                        {"id": iac_task_id},
                        {
                            "$set": {
                                "status": "completed",
                                "items_added": items_added,
                                "duplicates_skipped": duplicates_skipped,
                                "duplicate_titles": duplicate_titles[:10],
                                "completed_at": datetime.now(timezone.utc).isoformat(),
                            }
                        },
                    )

                # Clean the JSON block from the response for display
                clean_response = response[: response.index("```checklist_json")].strip()
                if clean_response:
                    summary_parts = []
                    if items_added:
                        summary_parts.append(
                            f"**{items_added} beneficiary action items have been added to your Immediate Action Checklist.**"
                        )
                    if duplicates_skipped:
                        summary_parts.append(
                            f"**{duplicates_skipped} existing item{'s' if duplicates_skipped != 1 else ''}"
                            f" skipped (already in your checklist).**"
                        )
                    if benefactor_recs:
                        summary_parts.append(
                            f"**{benefactor_recs} estate strengthening recommendations are included above for your review"
                            " (these are NOT added to the IAC — they are for you to act on now).**"
                        )
                    response = clean_response + "\n\n" + "\n\n".join(summary_parts) + LEGAL_DISCLAIMER

                # Log activity
                await log_activity(
                    estate_id=estate_id,
                    user_id=current_user["id"],
                    user_name=current_user["name"],
                    action="iac_ai_generated",
                    description=f"Estate Guardian generated {items_added} IAC items from vault documents",
                    metadata={"items_added": items_added},
                )
            except (ValueError, json_module.JSONDecodeError) as e:
                logger.warning(f"Failed to parse checklist JSON from AI response: {e}")
                # Mark task as completed-with-0-items so the frontend
                # banner / poller doesn't hang. The user still sees the
                # narrative response — the JSON parse just produced no
                # new checklist items this round.
                if iac_task_id:
                    try:
                        await db.ega_tasks.update_one(
                            {"id": iac_task_id},
                            {
                                "$set": {
                                    "status": "completed",
                                    "items_added": 0,
                                    "duplicates_skipped": 0,
                                    "duplicate_titles": [],
                                    "error": "Could not parse checklist JSON from AI response.",
                                    "completed_at": datetime.now(timezone.utc).isoformat(),
                                }
                            },
                        )
                    except Exception:
                        pass

        # Catch-all: if generate_iac ran without raising AND we never
        # entered the JSON-parse block (because the model omitted the
        # checklist_json fence), still finalize the task so the
        # polling banner doesn't hang at "running" forever.
        if data.action == "generate_iac" and iac_task_id:
            try:
                await db.ega_tasks.update_one(
                    {"id": iac_task_id, "status": "running"},
                    {
                        "$set": {
                            "status": "completed",
                            "items_added": 0,
                            "duplicates_skipped": 0,
                            "duplicate_titles": [],
                            "error": "AI returned no checklist items this round.",
                            "completed_at": datetime.now(timezone.utc).isoformat(),
                        }
                    },
                )
            except Exception:
                pass

        elif data.action == "generate_todo":
            # To-do list generated — mark for frontend PDF download (no DB writes)
            action_result = {"action": "todo_generated"}

        elif data.action == "analyze_readiness" and estate_id:
            # Recalculate readiness to ensure it's current
            readiness = await calculate_estate_readiness(estate_id)
            await update_estate_readiness(estate_id)
            action_result = {"action": "readiness_analyzed", "readiness": readiness}

        # Store in history (estate-scoped — audit #1798 P1)
        await db.chat_history.insert_one(
            {
                "session_id": session_id,
                "user_id": current_user["id"],
                "estate_id": estate_id,
                "role": "user",
                "content": data.message,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        await db.chat_history.insert_one(
            {
                "session_id": session_id,
                "user_id": current_user["id"],
                "estate_id": estate_id,
                "role": "assistant",
                "content": response,
                "action_result": action_result,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

        return ChatResponse(response=response, session_id=session_id, action_result=action_result)
    except Exception as e:
        # Always release the heavy-AI concurrency token on any error
        # path so an exception mid-flight doesn't starve the semaphore.
        try:
            if locals().get("_sem_acquired"):
                _HEAVY_AI_SEMAPHORE.release()
        except Exception:
            pass
        # Mark EGA task as error if IAC generation was in progress
        if data.action == "generate_iac" and estate_id:
            try:
                await db.ega_tasks.update_one(
                    {"estate_id": estate_id, "type": "generate_iac", "status": "running"},
                    {"$set": {"status": "error", "completed_at": datetime.now(timezone.utc).isoformat()}},
                )
            except Exception:
                pass
        error_msg = str(e)
        logger.error(f"AI chat error: {error_msg}")
        if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            raise HTTPException(
                status_code=504,
                detail="The AI analysis is taking longer than expected. Please try again — shorter queries respond faster.",
            )
        raise HTTPException(
            status_code=500,
            detail="AI service temporarily unavailable. Please try again in a moment.",
        )
