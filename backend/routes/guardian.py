"""CarryOn™ Backend — Estate Guardian AI & PDF Export"""

import io
import json as json_module
import uuid
from datetime import datetime, timezone

import pdfplumber
from fastapi import APIRouter, Depends, HTTPException, Response

from config import XAI_MODEL, db, logger, xai_client
from models import ChatRequest, ChatResponse, ChecklistItem
from services.audit import audit_log
from services.encryption import decrypt_aes256, get_estate_salt
from services.readiness import calculate_estate_readiness
from utils import get_current_user, log_activity, update_estate_readiness

router = APIRouter()

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
2. **Generate Checklists**: Create prioritized, state-specific action items. Be specific — "File Form X with Y county" not "consider updating your plan."
3. **Analyze Readiness**: Calculate and explain the Estate Readiness Score with actionable improvement steps.
4. **Answer Estate Law Questions**: For any of the 50 states and U.S. territories. Cite specific statutes when relevant.

**GUIDELINES:**
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
        elif any(
            t in file_type for t in ["text", "plain", "csv", "json", "xml", "html"]
        ):
            text = decrypted_data.decode("utf-8", errors="replace")
            return text[:8000]

        # Images and other binary formats
        else:
            return f"[Binary file: {file_type} - {document['file_size']} bytes]"

    except Exception as e:
        logger.warning(f"Document extraction error for {document['name']}: {e}")
        return "[Document content unavailable - decryption error]"


async def gather_estate_context(
    estate_id: str, include_doc_content: bool = False
) -> str:
    """Gather comprehensive estate context for the AI"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        return ""

    # Fetch all estate data
    documents = await db.documents.find(
        {"estate_id": estate_id},
        {
            "_id": 0,
            "lock_password_hash": 0,
            "backup_code": 0,
            "voice_passphrase_hash": 0,
        },
    ).to_list(100)

    beneficiaries = await db.beneficiaries.find(
        {"estate_id": estate_id}, {"_id": 0}
    ).to_list(100)
    checklist_items = (
        await db.checklists.find({"estate_id": estate_id}, {"_id": 0})
        .sort("order", 1)
        .to_list(200)
    )
    messages = await db.messages.find(
        {"estate_id": estate_id}, {"_id": 0, "video_url": 0}
    ).to_list(100)
    readiness = await calculate_estate_readiness(estate_id)

    # Build context string
    context_parts = []

    # Estate info
    state_info = estate.get("state", "Not specified")
    context_parts.append(f"""
**CURRENT ESTATE INFORMATION:**
- Estate Name: {estate["name"]}
- State: {state_info}
- Status: {estate.get("status", "pre-transition")}
- Overall Readiness Score: {readiness["overall_score"]}%
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
            locked_status = (
                f" [LOCKED - {doc.get('lock_type', 'unknown')}]"
                if doc.get("is_locked")
                else ""
            )
            context_parts.append(
                f"- {doc['name']} (Category: {doc['category']}, Type: {doc.get('file_type', 'unknown')}, Size: {doc.get('file_size', 0)} bytes){locked_status}"
            )

        # Include document content if requested
        if include_doc_content:
            context_parts.append("\n**DOCUMENT CONTENTS (for analysis):**")
            import asyncio

            async def extract_with_timeout(doc):
                try:
                    full_doc = await db.documents.find_one({"id": doc["id"]}, {"_id": 0})
                    if not full_doc:
                        return doc["name"], f"[Document not found]"
                    if full_doc.get("storage_key") or full_doc.get("file_data"):
                        text = await asyncio.wait_for(
                            asyncio.to_thread(lambda: asyncio.run(_extract_sync(full_doc))),
                            timeout=15
                        )
                        return doc["name"], text
                    return doc["name"], f"[No content available]"
                except asyncio.TimeoutError:
                    return doc["name"], f"[Extraction timed out - large file]"
                except Exception as e:
                    return doc["name"], f"[Extraction error: {str(e)[:50]}]"

            async def _extract_sync(full_doc):
                return await extract_document_text(full_doc)

            # Extract documents concurrently with timeout
            tasks = [extract_with_timeout(doc) for doc in documents[:10]]
            results = await asyncio.gather(*tasks)
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
                    dob = datetime.fromisoformat(
                        ben["date_of_birth"].replace("Z", "+00:00")
                    )
                    age = (datetime.now(timezone.utc) - dob).days // 365
                    age_info = f", Age: {age}"
                except Exception:
                    pass
            gender_info = (
                f", Gender: {ben.get('gender', 'not specified')}"
                if ben.get("gender")
                else ""
            )
            context_parts.append(
                f"- {ben['name']} (Relation: {ben['relation']}{age_info}{gender_info}, Email: {ben['email']})"
            )
    else:
        context_parts.append("- No beneficiaries added yet")

    # Checklist summary
    completed = sum(1 for item in checklist_items if item.get("is_completed"))
    context_parts.append(
        f"\n**CHECKLIST STATUS:** {completed}/{len(checklist_items)} items completed"
    )

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
        context_parts.append(
            f"  - {cat}: {counts['completed']}/{counts['total']} completed"
        )

    # Messages summary
    context_parts.append(f"\n**MILESTONE MESSAGES:** {len(messages)} total")
    for msg in messages[:10]:
        trigger_info = msg.get("trigger_type", "immediate")
        if msg.get("trigger_age"):
            trigger_info += f" (age {msg['trigger_age']})"
        context_parts.append(
            f'- "{msg["title"]}" (Type: {msg.get("message_type", "text")}, Trigger: {trigger_info})'
        )

    return "\n".join(context_parts)


@router.post("/chat/guardian", response_model=ChatResponse)
async def chat_with_guardian(
    data: ChatRequest, current_user: dict = Depends(get_current_user)
):
    """Send a message to the Estate Guardian AI."""
    if not xai_client:
        raise HTTPException(status_code=500, detail="AI service not configured")

    session_id = data.session_id or f"chat_{current_user['id']}_{str(uuid.uuid4())[:8]}"
    action_result = None

    # Get estate context if estate_id provided
    estate_context = ""
    estate_id = data.estate_id

    if not estate_id:
        estates = await db.estates.find(
            {"owner_id": current_user["id"]}, {"_id": 0}
        ).to_list(1)
        if estates:
            estate_id = estates[0]["id"]

    if estate_id:
        needs_content = data.action in ("analyze_vault", "generate_checklist") or any(
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
        estate_context = await gather_estate_context(
            estate_id, include_doc_content=needs_content
        )

    system_message = ESTATE_GUARDIAN_SYSTEM_PROMPT.format(
        estate_context=estate_context
        if estate_context
        else "No estate context available. Ask the user to select an estate."
    )

    # Handle special actions
    user_message_text = data.message

    if data.action == "generate_checklist":
        user_message_text = """Based on my estate documents and current situation, generate a comprehensive, prioritized Immediate Action Checklist.

Requirements:
- Create at least 25 items if I don't already have enough
- Prioritize based on urgency: immediate (day 1-3), first_week, two_weeks, first_month
- Make items specific to MY estate based on the documents in my vault
- Consider my state's specific legal requirements
- Each item should have a clear title and actionable description
- Focus on items I'm MISSING — don't duplicate existing checklist items

Return your response as helpful advice, and also return the checklist items in this exact JSON format at the END of your response, wrapped in ```checklist_json``` tags:
```checklist_json
[{"title": "Item title", "description": "Detailed description", "category": "immediate|first_week|two_weeks|first_month", "order": 1}]
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
                        f"{'User' if m['role'] == 'user' else 'Guardian'}: {m['content'][:150]}"
                        for m in msgs
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
            await db.chat_history.find(
                {"session_id": session_id, "user_id": current_user["id"]}, {"_id": 0}
            )
            .sort("created_at", 1)
            .to_list(50)
        )

        for msg in prev_messages:
            history_messages.append({"role": msg["role"], "content": msg["content"]})

        # Add the current user message
        history_messages.append({"role": "user", "content": user_message_text})

        # Call xAI Grok
        completion = xai_client.chat.completions.create(
            model=XAI_MODEL, messages=history_messages, temperature=0.7, max_tokens=4096
        )
        response = completion.choices[0].message.content

        # Append legal disclaimer to every response
        response += LEGAL_DISCLAIMER

        # Handle checklist generation action
        if data.action == "generate_checklist" and "checklist_json" in response:
            try:
                json_start = response.index("```checklist_json") + len(
                    "```checklist_json"
                )
                json_end = response.index("```", json_start)
                checklist_json_str = response[json_start:json_end].strip()
                new_items = json_module.loads(checklist_json_str)

                # Get existing checklist items to avoid duplicates
                existing = await db.checklists.find(
                    {"estate_id": estate_id}, {"_id": 0, "title": 1}
                ).to_list(200)
                existing_titles = {item["title"].lower() for item in existing}

                items_added = 0
                max_order = len(existing)
                for item in new_items:
                    if item["title"].lower() not in existing_titles:
                        checklist_item = ChecklistItem(
                            estate_id=estate_id,
                            title=item["title"],
                            description=item.get("description", ""),
                            category=item.get("category", "first_month"),
                            order=max_order + items_added + 1,
                        )
                        await db.checklists.insert_one(checklist_item.model_dump())
                        items_added += 1

                # Recalculate readiness
                await update_estate_readiness(estate_id)

                action_result = {
                    "action": "checklist_generated",
                    "items_added": items_added,
                }

                # Clean the JSON block from the response for display
                clean_response = response[: response.index("```checklist_json")].strip()
                if clean_response:
                    response = (
                        clean_response
                        + f"\n\n**{items_added} new checklist items have been added to your Immediate Action Checklist.**"
                        + LEGAL_DISCLAIMER
                    )

                # Log activity
                await log_activity(
                    estate_id=estate_id,
                    user_id=current_user["id"],
                    user_name=current_user["name"],
                    action="checklist_ai_generated",
                    description=f"Estate Guardian generated {items_added} checklist items",
                    metadata={"items_added": items_added},
                )
            except (ValueError, json_module.JSONDecodeError) as e:
                logger.warning(f"Failed to parse checklist JSON from AI response: {e}")

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
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

        return ChatResponse(
            response=response, session_id=session_id, action_result=action_result
        )
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(
            status_code=500, detail="AI service temporarily unavailable"
        )


@router.get("/chat/history/{session_id}")
async def get_chat_history(
    session_id: str, current_user: dict = Depends(get_current_user)
):
    """Retrieve chat history with the Estate Guardian."""
    history = (
        await db.chat_history.find(
            {"session_id": session_id, "user_id": current_user["id"]}, {"_id": 0}
        )
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
                "session_id": s["_id"],
                "title": title,
                "last_message_at": s["last_message_at"],
                "message_count": s["message_count"],
            }
        )

    return sessions


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: str, current_user: dict = Depends(get_current_user)
):
    """Delete a chat session."""
    result = await db.chat_history.delete_many(
        {"session_id": session_id, "user_id": current_user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "deleted": result.deleted_count}


def sanitize_for_pdf(text: str) -> str:
    """Sanitize text for PDF by replacing Unicode characters with ASCII equivalents."""
    if not text:
        return ""
    # Common Unicode replacements
    replacements = {
        "\u2014": "-",  # em-dash
        "\u2013": "-",  # en-dash
        "\u2018": "'",  # left single quote
        "\u2019": "'",  # right single quote
        "\u201c": '"',  # left double quote
        "\u201d": '"',  # right double quote
        "\u2026": "...",  # ellipsis
        "\u2022": "*",  # bullet
        "\u00a0": " ",  # non-breaking space
        "\u200b": "",  # zero-width space
    }
    for unicode_char, ascii_char in replacements.items():
        text = text.replace(unicode_char, ascii_char)
    # Remove any remaining non-ASCII characters
    return text.encode("ascii", "replace").decode("ascii")


@router.post("/guardian/export-checklist")
async def export_checklist_pdf(
    current_user: dict = Depends(get_current_user),
):
    """Generate a printable PDF checklist from the user's estate checklist items."""
    from fpdf import FPDF

    # Get user's estate
    estates = await db.estates.find(
        {"owner_id": current_user["id"]}, {"_id": 0}
    ).to_list(1)
    if not estates:
        raise HTTPException(status_code=404, detail="No estate found")

    estate = estates[0]
    estate_id = estate["id"]

    # Get checklist items
    items = (
        await db.checklists.find({"estate_id": estate_id}, {"_id": 0})
        .sort("order", 1)
        .to_list(200)
    )

    if not items:
        raise HTTPException(status_code=404, detail="No checklist items found")

    # Get readiness data
    from services.readiness import calculate_estate_readiness

    readiness = await calculate_estate_readiness(estate_id)

    # Build PDF
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Header
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(212, 175, 55)
    pdf.cell(0, 12, "CarryOn Estate Guardian", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, "Immediate Action Checklist", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(
        0,
        5,
        sanitize_for_pdf(
            f"Estate: {estate['name']}  |  State: {estate.get('state', 'Not specified')}  |  Readiness: {readiness['overall_score']}%"
        ),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.cell(
        0,
        5,
        f"Generated: {datetime.now(timezone.utc).strftime('%B %d, %Y at %I:%M %p UTC')}",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(4)

    # Legal disclaimer box
    pdf.set_fill_color(255, 248, 220)
    pdf.set_draw_color(212, 175, 55)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(80, 80, 80)
    disclaimer = (
        "IMPORTANT: This checklist is generated by an AI assistant for informational purposes only and does not constitute legal advice. "
        "CarryOn Estate Guardian is not a licensed attorney. For legally binding decisions, always consult a bar-certified "
        "attorney licensed in your jurisdiction. No attorney-client relationship is created by using this service."
    )
    pdf.multi_cell(0, 3.5, disclaimer, border=1, fill=True)
    pdf.ln(6)

    # Categorize items
    categories = {}
    for item in items:
        cat = item.get("category", item.get("due_timeframe", "general"))
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(item)

    category_labels = {
        "immediate": "Immediate (Days 1-3)",
        "first_week": "First Week",
        "two_weeks": "Within Two Weeks",
        "first_month": "First Month",
        "legal": "Legal",
        "financial": "Financial",
        "insurance": "Insurance",
        "property": "Property",
        "medical": "Medical",
        "personal": "Personal",
        "government": "Government",
        "general": "General",
    }

    for cat, cat_items in categories.items():
        # Category header
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(30, 40, 70)
        pdf.cell(
            0,
            8,
            category_labels.get(cat, cat.replace("_", " ").title()),
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.set_draw_color(212, 175, 55)
        pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + 170, pdf.get_y())
        pdf.ln(3)

        for item in cat_items:
            # Checkbox + title
            check = "[x]" if item.get("is_completed") else "[ ]"
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(40, 40, 40)
            pdf.cell(8, 5, check)
            pdf.cell(
                0,
                5,
                sanitize_for_pdf(item["title"][:80]),
                new_x="LMARGIN",
                new_y="NEXT",
            )

            # Description
            if item.get("description"):
                pdf.set_x(pdf.get_x() + 8)
                pdf.set_font("Helvetica", "", 8)
                pdf.set_text_color(100, 100, 100)
                pdf.multi_cell(162, 4, sanitize_for_pdf(item["description"][:200]))

            # Contact info
            if item.get("contact_name") or item.get("contact_phone"):
                pdf.set_x(pdf.get_x() + 8)
                pdf.set_font("Helvetica", "I", 7)
                pdf.set_text_color(120, 120, 120)
                contact = f"Contact: {item.get('contact_name', '')}"
                if item.get("contact_phone"):
                    contact += f" | {item['contact_phone']}"
                pdf.cell(0, 4, sanitize_for_pdf(contact), new_x="LMARGIN", new_y="NEXT")

            pdf.ln(2)

    # Summary footer
    completed = sum(1 for i in items if i.get("is_completed"))
    pdf.ln(6)
    pdf.set_draw_color(200, 200, 200)
    pdf.line(pdf.get_x(), pdf.get_y(), pdf.get_x() + 170, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(30, 40, 70)
    pdf.cell(
        0,
        6,
        f"Progress: {completed}/{len(items)} items completed ({int(completed / len(items) * 100) if items else 0}%)",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(
        0,
        5,
        "AES-256-GCM Encrypted  |  Zero-Knowledge Architecture  |  2FA Protected",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.cell(
        0,
        5,
        f"CarryOn Technologies  |  carryon.us  |  {datetime.now(timezone.utc).year}",
        new_x="LMARGIN",
        new_y="NEXT",
    )

    # Return PDF
    pdf_bytes = pdf.output()
    await audit_log(
        action="guardian.checklist_export",
        user_id=current_user["id"],
        resource_type="checklist_pdf",
        estate_id=estate_id,
        details={"items": len(items), "completed": completed},
    )

    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="CarryOn_Checklist_{datetime.now(timezone.utc).strftime("%Y%m%d")}.pdf"'
        },
    )
