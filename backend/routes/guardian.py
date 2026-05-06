"""CarryOn™ Backend — Estate Guardian AI & PDF Export"""

import asyncio
import io
import json as json_module
import uuid
from datetime import datetime, timezone

import pdfplumber
from fastapi import APIRouter, Depends, HTTPException

from config import XAI_MODEL, XAI_MODEL_LIGHT, db, logger, xai_client
from models import ChatRequest, ChatResponse, ChecklistItem
from services.encryption import decrypt_aes256, get_estate_salt
from services.readiness import calculate_estate_readiness
from utils import get_current_user, log_activity, update_estate_readiness

router = APIRouter()


async def _get_user_estate(current_user: dict, projection: dict | None = None):
    """Get the first estate for a user, with admin fallback (all estates)."""
    proj = projection or {"_id": 0}
    if current_user.get("role") == "admin":
        return await db.estates.find({}, proj).to_list(1)
    return await db.estates.find({"owner_id": current_user["id"]}, proj).to_list(1)


# ── xAI Connection Warmup (On-Demand) ──────────────────────────
# Instead of pinging xAI every 5 minutes 24/7 (~288 calls/day),
# we warm up the connection when a user actually visits the
# Guardian page. By the time they type and send, the connection
# is already hot.


async def _xai_ping():
    """Send a minimal request to xAI to warm the connection pool."""
    try:
        await asyncio.to_thread(
            xai_client.chat.completions.create,
            model=XAI_MODEL_LIGHT,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
        )
        return True
    except Exception as e:
        logger.warning(f"xAI warmup ping failed: {e}")
        return False


async def warmup_xai():
    """One-time warmup at server startup (no background loop)."""
    if not xai_client:
        return
    ok = await _xai_ping()
    if ok:
        logger.info("xAI connection warmed up successfully at startup")


@router.post("/warmup")
async def warmup_endpoint(current_user: dict = Depends(get_current_user)):
    """Warm up the xAI connection when a user opens the Guardian page."""
    if not xai_client:
        return {"status": "no_client"}
    ok = await _xai_ping()
    return {"status": "warm" if ok else "failed"}


# ===================== AI CHAT ROUTES =====================

# Comprehensive estate law system prompt — Grok-like persona
ESTATE_GUARDIAN_SYSTEM_PROMPT = """You are the Estate Guardian — the AI Elf that lives inside the CarryOn™ Secure Vault. Think of yourself as a panel of 50+ Harvard-trained estate attorneys, one for each U.S. state and territory, distilled into a single brilliant, straight-talking advisor who lives inside a bank vault alongside the user's most precious documents, digital passwords, and milestone messages. You've read everything in the vault. You know it cold.

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
- Always reference the user's actual documents and data when available. Don't guess — look at what's in the vault.
- When discussing state law, cite the specific state. If the state is unknown, ask.
- You will NEVER draft legal documents, fill in forms, or make changes. You advise — the user acts. That's the line.
- Format responses with clear headers, bullet points, and numbered lists. Make it scannable.
- Keep responses focused and practical. Quality over quantity.

{estate_context}"""

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
            {"estate_id": estate_id},
            {
                "_id": 0,
                "lock_password_hash": 0,
                "backup_code": 0,
                "voice_passphrase_hash": 0,
            },
        ).to_list(100),
        db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(100),
        db.checklists.find({"estate_id": estate_id}, {"_id": 0}).sort("order", 1).to_list(200),
        db.messages.find({"estate_id": estate_id}, {"_id": 0, "video_url": 0}).to_list(100),
        calculate_estate_readiness(estate_id),
    )

    # Build context string
    context_parts = []

    # Estate info with benefactor's CURRENT residence (from Settings page) for state-specific legal advice
    context_parts.append(f"""
**CURRENT ESTATE INFORMATION:**
- Estate Name: {estate["name"]}
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
        for doc in documents:
            locked_status = f" [LOCKED - {doc.get('lock_type', 'unknown')}]" if doc.get("is_locked") else ""
            context_parts.append(
                f"- {doc['name']} (Category: {doc['category']}, Type: {doc.get('file_type', 'unknown')}, Size: {doc.get('file_size', 0)} bytes){locked_status}"
            )

        # Include document content if requested
        if include_doc_content:
            context_parts.append("\n**DOCUMENT CONTENTS (for analysis):**")

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

            results = await asyncio.gather(*[extract_one(doc) for doc in documents[:10]])
            for name, text in results:
                if text and not text.startswith("["):
                    context_parts.append(f"\n--- {name} ---\n{text[:4000]}\n--- End of {name} ---")
                else:
                    context_parts.append(f"\n--- {name} ---\n{text}\n---")
    else:
        context_parts.append("- No documents uploaded yet")

    # Beneficiaries
    context_parts.append("\n**BENEFICIARIES:**")
    if beneficiaries:
        for ben in beneficiaries:
            age_info = ""
            if ben.get("date_of_birth"):
                try:
                    dob = datetime.fromisoformat(ben["date_of_birth"].replace("Z", "+00:00"))
                    age = (datetime.now(timezone.utc) - dob).days // 365
                    age_info = f", Age: {age}"
                except Exception:
                    pass
            gender_info = f", Gender: {ben.get('gender', 'not specified')}" if ben.get("gender") else ""
            context_parts.append(
                f"- {ben['name']} (Relation: {ben['relation']}{age_info}{gender_info}, Email: {ben['email']})"
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
    for msg in messages[:10]:
        trigger_info = msg.get("trigger_type", "immediate")
        if msg.get("trigger_age"):
            trigger_info += f" (age {msg['trigger_age']})"
        context_parts.append(f'- "{msg["title"]}" (Type: {msg.get("message_type", "text")}, Trigger: {trigger_info})')

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
        needs_content = data.action in (
            "analyze_vault",
            "generate_todo",
            "generate_iac",
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
        user_message_text = """Based on the documents in my Secure Document Vault, generate a comprehensive Immediate Action Checklist.

CRITICAL STRUCTURE REQUIREMENT — You MUST organize your response into TWO clearly separated sections with distinct headers. Do NOT intermix items from these two sections:

==============================
SECTION 1: "IMMEDIATE ACTION CHECKLIST FOR BENEFICIARIES"
==============================
This section is for my BENEFICIARIES and loved ones to follow AFTER my death. These are instructions they will execute upon my passing.

Requirements for Section 1:
- Extract SPECIFIC, ACTIONABLE information from my vault documents — phone numbers, policy numbers, contact names, institutions
- For each life insurance policy: include the carrier name, policy number, and the phone number to call to file a claim
- Identify who the trustee of my trust is (if a trust document exists) and include their contact info
- List financial institutions that need to be contacted with account details where available
- Include steps for filing probate if required in my state
- Note any immediate deadlines (e.g., life insurance claim windows, Social Security notification)
- Prioritize by urgency: immediate (day 1-3), first_week, two_weeks, first_month
- Be extremely specific — "Call MetLife at 1-800-XXX-XXXX, Policy #YYYY, to file death claim" not "Contact life insurance company"
- Items like: call executor, request death certificates, freeze accounts, file insurance claims, notify SSA, contact trustee, initiate probate, distribute assets

==============================
SECTION 2: "ESTATE STRENGTHENING RECOMMENDATIONS FOR THE BENEFACTOR"
==============================
This section is for ME (the benefactor) — things I should do NOW to tighten up, fix, or improve my estate plan while I'm still alive.

Requirements for Section 2:
- Identify gaps, missing documents, expired provisions, state non-compliance, beneficiary mismatches, etc.
- Items like: update will to current state, revise POA, correct beneficiary designations, add missing documents, fund trust, add pour-over provision
- Prioritize by urgency: immediate, first_week, two_weeks, first_month

BOTH sections should be included in your response with clear, bold section headers so the reader can immediately distinguish between "what my family does after I die" and "what I need to fix now."

Return the checklist items from BOTH sections in this exact JSON format at the END of your response, wrapped in ```checklist_json``` tags. Use the "section" field to distinguish between the two types:
```checklist_json
[{{"title": "Item title", "description": "Detailed description with specific contacts/numbers", "category": "immediate|first_week|two_weeks|first_month", "section": "beneficiary_action|benefactor_recommendation", "order": 1}}]
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

    try:
        # Build conversation history from DB for multi-turn context
        history_messages = [{"role": "system", "content": system_message}]

        # Cross-chat knowledge: include key points from recent sessions
        if session_id.startswith("chat_"):
            recent_sessions = await db.chat_history.aggregate(
                [
                    {
                        "$match": {
                            "user_id": current_user["id"],
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
                    {
                        "role": "system",
                        "content": f"PREVIOUS CONVERSATION CONTEXT (the user may reference these):\n{cross_context}",
                    }
                )

        # Load previous messages from this session
        prev_messages = (
            await db.chat_history.find({"session_id": session_id, "user_id": current_user["id"]}, {"_id": 0})
            .sort("created_at", 1)
            .to_list(50)
        )

        for msg in prev_messages:
            history_messages.append({"role": msg["role"], "content": msg["content"]})

        # Add the current user message
        history_messages.append({"role": "user", "content": user_message_text})

        # Call xAI Grok — use Grok-4 for heavy analysis, Grok-3-mini for chat
        use_heavy_model = (
            data.action in ("analyze_vault", "generate_todo", "generate_iac", "analyze_readiness", "state_law_brief")
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
        # Heavy actions (vault analysis, IAC, readiness) try the chosen
        # model and at most ONE retry on the same model. Light chat
        # tries grok-3-mini → grok-3 → grok-4 in order so a single
        # model deprecation / capacity incident on x.ai's side never
        # takes the chat down. 55s soft deadline keeps us under the
        # ingress hard cut-off.
        completion = None
        last_error = None
        _IS_HEAVY = data.action in (
            "analyze_vault",
            "generate_todo",
            "generate_iac",
            "analyze_readiness",
            "state_law_brief",
        )
        if _IS_HEAVY:
            _MODEL_ORDER = [selected_model]
            _MAX_PER_MODEL = 2
            _DELAYS = [0, 1.5]
        else:
            # Failover ladder. De-dup while preserving order.
            ladder = [m for m in (XAI_MODEL_LIGHT, "grok-3", XAI_MODEL) if m]
            _seen: set = set()
            _MODEL_ORDER = [m for m in ladder if not (m in _seen or _seen.add(m))]
            _MAX_PER_MODEL = 2
            _DELAYS = [0, 1.5]
        _SOFT_DEADLINE_S = 55
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
                    completion = await asyncio.to_thread(
                        xai_client.chat.completions.create,
                        model=model_name,
                        messages=history_messages,
                        temperature=0.7,
                        max_tokens=4096,
                    )
                    if model_name != selected_model:
                        logger.info(f"EGA served via failover model: {model_name} (preferred {selected_model})")
                    break
                except Exception as e:
                    last_error = e
                    logger.warning(
                        f"xAI fail: model={model_name} attempt={attempt + 1}/{_MAX_PER_MODEL} "
                        f"({type(e).__name__}: {str(e)[:200]})"
                    )

        if completion is None:
            raise last_error

        response = completion.choices[0].message.content

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
                json_start = response.index("```checklist_json") + len("```checklist_json")
                json_end = response.index("```", json_start)
                checklist_json_str = response[json_start:json_end].strip()
                new_items = json_module.loads(checklist_json_str)

                # Get existing checklist items to avoid duplicates
                existing = await db.checklists.find({"estate_id": estate_id}, {"_id": 0, "id": 1, "title": 1}).to_list(
                    200
                )
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
                    checklist_item = ChecklistItem(
                        estate_id=estate_id,
                        title=item["title"],
                        description=item.get("description", ""),
                        category=item.get("category", "first_month"),
                        priority=item.get("priority", "medium"),
                        order=max_order + items_added + 1,
                    )
                    item_dict = checklist_item.model_dump()
                    item_dict["ai_suggested"] = True
                    item_dict["ai_accepted"] = None  # None=pending, True=accepted, False=rejected
                    item_dict["section"] = "beneficiary_action"
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

        elif data.action == "generate_todo":
            # To-do list generated — mark for frontend PDF download (no DB writes)
            action_result = {"action": "todo_generated"}

        elif data.action == "analyze_readiness" and estate_id:
            # Recalculate readiness to ensure it's current
            readiness = await calculate_estate_readiness(estate_id)
            await update_estate_readiness(estate_id)
            action_result = {"action": "readiness_analyzed", "readiness": readiness}

        # Store in history
        await db.chat_history.insert_one(
            {
                "session_id": session_id,
                "user_id": current_user["id"],
                "role": "user",
                "content": data.message,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        await db.chat_history.insert_one(
            {
                "session_id": session_id,
                "user_id": current_user["id"],
                "role": "assistant",
                "content": response,
                "action_result": action_result,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

        return ChatResponse(response=response, session_id=session_id, action_result=action_result)
    except Exception as e:
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


@router.get("/chat/history/{session_id}")
async def get_chat_history(session_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve chat history with the Estate Guardian."""
    history = (
        await db.chat_history.find({"session_id": session_id, "user_id": current_user["id"]}, {"_id": 0})
        .sort("created_at", 1)
        .to_list(100)
    )
    return history


@router.get("/chat/sessions")
async def get_chat_sessions(current_user: dict = Depends(get_current_user)):
    """Get all chat sessions for the current user, most recent first."""
    pipeline = [
        {"$match": {"user_id": current_user["id"]}},
        {"$sort": {"created_at": 1}},
        {
            "$group": {
                "_id": "$session_id",
                "first_message": {"$first": "$content"},
                "first_role": {"$first": "$role"},
                "last_message_at": {"$last": "$created_at"},
                "message_count": {"$sum": 1},
                "messages": {"$push": {"role": "$role", "content": "$content"}},
            }
        },
        {"$sort": {"last_message_at": -1}},
        {"$limit": 20},
    ]
    sessions_raw = await db.chat_history.aggregate(pipeline).to_list(20)

    sessions = []
    for s in sessions_raw:
        # Find the first user message for the title
        user_msgs = [m for m in s["messages"] if m["role"] == "user"]
        title = user_msgs[0]["content"][:80] if user_msgs else "New conversation"
        # Truncate with ellipsis
        if len(title) > 60:
            title = title[:60].rsplit(" ", 1)[0] + "..."

        sessions.append(
            {
                "session_id": str(s["_id"]),
                "title": title,
                "last_message_at": s["last_message_at"],
                "message_count": s["message_count"],
            }
        )

    return sessions


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a chat session."""
    result = await db.chat_history.delete_many({"session_id": session_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "deleted": result.deleted_count}


@router.get("/guardian/iac-task-status")
async def get_iac_task_status(current_user: dict = Depends(get_current_user)):
    """Get the latest IAC generation task status for the user's estate.

    Used by Dashboard and Checklist pages to poll for real-time updates
    while EGA is generating IAC items in the background.
    """
    estates = await _get_user_estate(current_user, {"_id": 0, "id": 1})
    if not estates:
        return {"status": "none"}
    estate_id = estates[0]["id"]

    task = await db.ega_tasks.find_one(
        {"estate_id": estate_id, "type": "generate_iac"},
        {"_id": 0},
    )
    if not task:
        return {"status": "none"}
    return task
