"""CarryOn™ Backend — Estate Guardian AI & PDF Export"""

import io
import json as json_module
import uuid
from datetime import datetime, timezone

import pdfplumber
from fastapi import APIRouter, Depends, HTTPException

from config import XAI_MODEL, db, logger, xai_client
from models import ChatRequest, ChatResponse, ChecklistItem
from services.readiness import calculate_estate_readiness
from utils import decrypt_data, get_current_user, log_activity, update_estate_readiness

router = APIRouter()

# ===================== AI CHAT ROUTES =====================

# Comprehensive estate law system prompt
ESTATE_GUARDIAN_SYSTEM_PROMPT = """You are the Estate Guardian, a highly specialized AI legal assistant for CarryOn™, a secure estate planning platform. You are an expert in estate planning law across all 50 United States, with deep knowledge of:

**STATE-SPECIFIC ESTATE LAW EXPERTISE:**
- **Community Property States** (AZ, CA, ID, LA, NV, NM, TX, WA, WI): Understand joint ownership rules, spousal rights, and how community property affects estate distribution.
- **Common Law / Equitable Distribution States** (all others): Understand elective share statutes, spousal inheritance rights, and intestacy laws.
- **Probate Requirements by State**: Know which states allow simplified/summary probate (e.g., CA small estate affidavit under $184,500), which require full probate, and which have adopted the Uniform Probate Code (UPC).
- **Estate & Inheritance Tax States**: Know which states impose estate taxes (CT, HI, IL, ME, MA, MN, NY, OR, RI, VT, WA, DC), inheritance taxes (IA, KY, MD, NE, NJ, PA), or both (MD).
- **Trust Law Variations**: Understand revocable vs irrevocable trusts, pour-over wills, trust protectors, directed trusts, and state-specific trust situs advantages (SD, NV, DE, AK for asset protection trusts; DE, NH, SD for dynasty trusts).
- **Power of Attorney**: Know statutory forms (e.g., NY GOL §5-1513, CA Probate Code §4401), springing vs. durable POA, financial vs. healthcare POA differences by state.
- **Healthcare Directives**: Understand POLST/MOLST programs, DNR requirements, surrogate decision-making hierarchies, and state-specific advance directive forms.
- **Homestead Exemptions**: Know state-specific protections (FL, TX unlimited; KS up to 160 acres; most states have dollar caps).
- **Digital Assets**: Understand the Revised Uniform Fiduciary Access to Digital Assets Act (RUFADAA) adoption by state.
- **Beneficiary Designation Law**: Know how state law treats POD/TOD accounts, IRA beneficiaries, life insurance, and conflicts between beneficiary designations and wills.

**YOUR CAPABILITIES:**
1. **Analyze Documents**: You can read and analyze the contents of the user's Secure Document Vault. When the user asks about their documents, reference them specifically by name and content.
2. **Generate Checklists**: You can create prioritized, state-specific checklist items based on the documents in the vault and the user's estate situation.
3. **Analyze Readiness**: You can calculate and explain the Estate Readiness Score, identifying exactly what's missing and providing actionable steps to improve it.

**GUIDELINES:**
- Always reference the user's actual documents and estate data when available.
- When discussing state law, cite the specific state if known, or ask which state the estate is in.
- Provide specific, actionable advice — not generic platitudes.
- When analyzing documents, identify gaps, inconsistencies, or missing provisions.
- Always recommend consulting a licensed attorney for final legal decisions, but provide substantive analysis to help users prepare.
- Format responses clearly with bullet points, headers, and numbered lists for readability.
- Be warm but authoritative — you're a trusted advisor, not just a chatbot.

{estate_context}
"""


async def extract_document_text(document: dict) -> str:
    """Extract text content from a document for AI analysis"""
    if not document.get("file_data"):
        return ""

    try:
        decrypted_data = decrypt_data(document["file_data"])
        file_type = document.get("file_type", "").lower()

        # PDF extraction
        if "pdf" in file_type:
            try:
                pdf = pdfplumber.open(io.BytesIO(decrypted_data))
                text_parts = []
                for page in pdf.pages[:20]:  # Limit to first 20 pages
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                pdf.close()
                text = "\n".join(text_parts)
                return text[:8000]  # Limit to ~8000 chars per document
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
            for doc in documents:
                # Fetch full document with file_data for extraction
                full_doc = await db.documents.find_one({"id": doc["id"]}, {"_id": 0})
                if full_doc and full_doc.get("file_data"):
                    text = await extract_document_text(full_doc)
                    if text and not text.startswith("["):
                        context_parts.append(
                            f"\n--- {doc['name']} ---\n{text}\n--- End of {doc['name']} ---"
                        )
                    else:
                        context_parts.append(f"\n--- {doc['name']} ---\n{text}\n---")
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
                "messages": {
                    "$push": {"role": "$role", "content": "$content"}
                },
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
