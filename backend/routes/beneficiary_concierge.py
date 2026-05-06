"""CarryOn™ — Beneficiary Estate Concierge AI (BEC).

POST-transition AI chat for the BENEFICIARY side. Distinct from the
Estate Guardian AI (EGA), which is a benefactor-side tool that
analyzes the estate plan against US estate law to surface gaps and
seams. The Concierge does the opposite: once the benefactor has
passed, it answers the beneficiary's questions about that specific
benefactor's wishes — grounded ONLY in the documents the benefactor
explicitly designated to that beneficiary.

Typical questions:
    "What did mom want for the house?"
    "Who's the executor?"
    "What did dad say about the cabin?"

Strict gating (every check is a server-side hard requirement):
    1. The caller must be a beneficiary on the named estate.
    2. The estate must be POST-transition (status == "transitioned").
    3. The benefactor's plan tier must have the `bec` feature flag
       enabled in the global feature_gates matrix (admin toggles
       this in Admin → Subs → Feature Gates).
    4. Only documents whose `designated_beneficiaries` includes the
       caller's user_id (or "all") AND whose post-transition
       visibility is open are loaded into the context window.
    5. The model NEVER receives data about other beneficiaries or
       documents the caller wasn't given access to.

The route does NOT give legal advice. It surfaces the benefactor's
own words and intentions as captured in their estate documents.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import XAI_MODEL_LIGHT, db, logger, xai_client
from routes.feature_gates import get_feature_gates
from routes.guardian import extract_document_text
from utils import get_current_user

router = APIRouter()


SYSTEM_PROMPT = """You are the CarryOn™ Beneficiary Estate Concierge.

Your role is to help a grieving beneficiary understand what their loved one (the benefactor) wanted, based ONLY on the documents the benefactor explicitly shared with this beneficiary. The benefactor has passed; this beneficiary is now navigating their estate.

Strict ground rules:
- Answer ONLY from the document context provided below. If the answer isn't in the documents, say so kindly: "That isn't covered in the documents [BENEFACTOR_FIRST_NAME] shared with you. You may want to ask [their attorney / executor / family]."
- Use the benefactor's own language and intent wherever possible. Quote brief lines from the documents when it helps.
- You are NOT a lawyer. Do not give legal advice or speculate about state law. If asked, say: "For a legal answer you'll want to talk to the executor or [BENEFACTOR_FIRST_NAME]'s attorney."
- Tone: warm, calm, brief, dignified. This person is grieving. Avoid jargon. No bullet-list dumps unless asked.
- Never mention other beneficiaries, other documents, or any information that isn't in the context window.
- Always close emotionally heavy answers with a gentle line acknowledging the moment, e.g., "I know this is hard. Take it one step at a time."

CITATION RULES (very important):
- Each document is labeled at the top of its block with a marker like [#1], [#2], [#3], …
- After every factual claim in your answer, append the marker(s) of the document(s) that support it. Examples:
    "She wanted the cabin to go to her brother. [#2]"
    "The executor is named in two places. [#1][#3]"
- Use ONLY the markers that exist in the context — never invent a marker.
- If you can't support a sentence from the documents, don't make a claim — say it isn't covered.
- Keep markers tight to the sentence they support; don't pile every marker at the end.
"""


# ── Models ────────────────────────────────────────────────────────────


class AskRequest(BaseModel):
    estate_id: str
    question: str
    session_id: Optional[str] = None


class StatusResponse(BaseModel):
    available: bool
    reason: Optional[str] = None
    accessible_doc_count: int = 0
    benefactor_first_name: Optional[str] = None
    # True once the estate has been verified as transitioned. False
    # while pre-transition; the page uses this to switch between the
    # "your benefactor passed — here's what they shared" frame and
    # the "your benefactor is alive — here's what they're sharing
    # with you so far" frame.
    is_transitioned: bool = False
    # Lightweight metadata for the "What I shared" panel on the
    # beneficiary's Concierge page. Just id / name / category — never
    # raw document text. Empty list when BEC is unavailable.
    documents: list[dict[str, Any]] = []


# ── Gating helper ─────────────────────────────────────────────────────


async def _resolve_concierge_access(user_id: str, estate_id: str) -> dict[str, Any]:
    """Return a dict describing whether BEC is available for this caller
    on this estate, plus the resolved benefactor name and accessible
    document set if so. Never raises — callers branch on `available`.

    Pre-transition behavior (added May 5, 2026 at user's explicit
    request): BEC is now ALSO active before transition, but only for
    the documents the benefactor has explicitly designated as
    pre-transition-visible to the caller — mirroring the rule used by
    GET /api/documents/{estate_id}/pre-transition. The pages
    rendered around this still gate the "available" UX on tier-level
    BEC enablement (admin-controlled). When BEC is on but the
    benefactor hasn't shared anything yet, we return available=True
    with an empty document list and is_transitioned=False so the page
    can render the "your benefactor hasn't shared documents yet"
    empty state rather than a hard block.
    """
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        return {"available": False, "reason": "estate_not_found"}

    # Caller must be a beneficiary on the estate
    beneficiary_link = await db.beneficiaries.find_one(
        {"estate_id": estate_id, "user_id": user_id},
        {"_id": 0},
    )
    if not beneficiary_link:
        return {"available": False, "reason": "not_a_beneficiary"}

    # Benefactor's plan must have BEC enabled (founder/admin-controlled
    # in Admin → Subs → Feature Gates). Use the canonical tier resolver
    # which honours: estate.verified_tier (admin override) → live
    # benefactor user_subscription → benefactor user.verified_tier
    # (legacy). Reading just `users.subscription_tier` missed every
    # admin-assigned override, which is exactly the bug the founder hit.
    benefactor = await db.users.find_one({"id": estate.get("owner_id")}, {"_id": 0})
    if not benefactor:
        return {"available": False, "reason": "benefactor_missing"}
    from .feature_gates import _get_benefactor_tier  # local import — avoids circular

    tier = await _get_benefactor_tier(current_user={"id": user_id}, estate_id=estate_id) or "base"
    gates = await get_feature_gates()
    if not (gates.get("bec") or {}).get(tier, False):
        return {"available": False, "reason": "feature_disabled_for_tier"}

    is_transitioned = estate.get("status") == "transitioned"

    # Documents the caller is allowed to see. Post-transition uses the
    # legacy designation-by-user_id rule already in production. Pre-
    # transition mirrors GET /api/documents/{estate_id}/pre-transition
    # exactly: designation by ben_record_id, plus the essential-offline
    # categories (living will, healthcare directive, general POA,
    # financial POA, legacy `poa`) OR explicit visibility_timing
    # opt-in for that beneficiary.
    docs_cursor = db.documents.find(
        {"estate_id": estate_id},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "category": 1,
            "description": 1,
            "designated_beneficiaries": 1,
            "storage_key": 1,
            "file_data": 1,
            "file_type": 1,
            "file_size": 1,
            "visibility_timing": 1,
        },
    )
    accessible: list[dict[str, Any]] = []

    if is_transitioned:
        async for doc in docs_cursor:
            designation = doc.get("designated_beneficiaries") or ["all"]
            if "all" in designation or user_id in designation:
                accessible.append(doc)
    else:
        ben_record_id = beneficiary_link.get("id")
        ESSENTIAL_OFFLINE = {
            "living_will",
            "healthcare_directive",
            "general_poa",
            "financial_poa",
            "poa",
        }
        async for doc in docs_cursor:
            designation = doc.get("designated_beneficiaries") or ["all"]
            is_designated = "all" in designation or (ben_record_id and ben_record_id in designation)
            if not is_designated:
                continue
            cat = doc.get("category") or ""
            if cat in ESSENTIAL_OFFLINE:
                accessible.append(doc)
                continue
            timing = doc.get("visibility_timing") or {}
            if ben_record_id and ben_record_id in timing and timing[ben_record_id].get("pre", False):
                accessible.append(doc)

    benefactor_first = (benefactor.get("name") or estate.get("name") or "your loved one").split()[0]

    return {
        "available": True,
        "is_transitioned": is_transitioned,
        "estate": estate,
        "benefactor": benefactor,
        "benefactor_first_name": benefactor_first,
        "documents": accessible,
    }


# ── Endpoints ─────────────────────────────────────────────────────────


@router.get("/beneficiary/concierge/status")
async def concierge_status(
    estate_id: str,
    current_user: dict = Depends(get_current_user),
) -> StatusResponse:
    """Lightweight gate check for the frontend (no LLM call)."""
    info = await _resolve_concierge_access(current_user["id"], estate_id)
    if not info["available"]:
        return StatusResponse(available=False, reason=info["reason"])
    docs = info["documents"]
    doc_summaries = [
        {
            "id": d.get("id"),
            "name": d.get("name") or "Untitled",
            "category": d.get("category") or "other",
        }
        for d in docs
    ]
    return StatusResponse(
        available=True,
        accessible_doc_count=len(docs),
        benefactor_first_name=info["benefactor_first_name"],
        is_transitioned=bool(info.get("is_transitioned")),
        documents=doc_summaries,
    )


@router.post("/beneficiary/concierge/ask")
async def concierge_ask(
    payload: AskRequest,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Beneficiary asks a question; we ground the answer in the docs
    they have access to and call xAI Grok. All gating runs server-side."""
    info = await _resolve_concierge_access(current_user["id"], payload.estate_id)
    if not info["available"]:
        # Map gating reasons to clear HTTP errors so the frontend can
        # render a precise "this is why you can't use it yet" panel.
        reason = info["reason"]
        status_code = {
            "estate_not_found": 404,
            "not_a_beneficiary": 403,
            "pre_transition": 403,
            "feature_disabled_for_tier": 403,
            "benefactor_missing": 404,
        }.get(reason, 403)
        raise HTTPException(status_code=status_code, detail=reason)

    if not xai_client:
        raise HTTPException(status_code=503, detail="ai_unavailable")

    question = (payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question_required")
    if len(question) > 1000:
        raise HTTPException(status_code=400, detail="question_too_long")

    # Build the document context with a stable citation marker for each
    # doc ([#1], [#2], …). The system prompt instructs the model to
    # append these markers after every factual claim. We return a
    # `citations` map keyed by marker so the frontend can render
    # readable chips ("[Last Will]") instead of raw "[#1]".
    benefactor_first = info["benefactor_first_name"]
    docs = info["documents"]
    context_blocks: list[str] = []
    citations: dict[str, dict[str, Any]] = {}
    total_chars = 0
    for idx, doc in enumerate(docs, start=1):
        marker = f"#{idx}"
        # Always register the citation entry, even if we end up
        # truncating the doc's text — the LLM still has the header.
        citations[marker] = {
            "id": doc.get("id"),
            "name": doc.get("name") or "Untitled",
            "category": doc.get("category") or "other",
        }
        if total_chars > 24000:
            continue
        try:
            text = await extract_document_text(doc)
        except Exception as e:  # pragma: no cover — extraction is best-effort
            logger.warning(f"BEC: extraction failed for doc {doc.get('id')}: {e}")
            text = ""
        header = (
            f"\n=== [{marker}] DOCUMENT: {doc.get('name') or 'Untitled'} "
            f"(category: {doc.get('category') or 'unknown'}) ===\n"
        )
        snippet = (text or "")[:6000]
        if not snippet and doc.get("description"):
            snippet = f"[No extracted text. Description: {doc['description']}]"
        block = header + (snippet or "[No readable text in this document.]")
        context_blocks.append(block)
        total_chars += len(block)

    document_context = (
        "\n".join(context_blocks)
        if context_blocks
        else f"[{benefactor_first} did not designate any documents to you yet. Tell the user that gently and suggest they reach out to the executor or family.]"
    )

    system_msg = SYSTEM_PROMPT.replace("[BENEFACTOR_FIRST_NAME]", benefactor_first)
    full_user_prompt = (
        f"You are speaking with the beneficiary of {info['benefactor']['name']}'s "
        f"estate. The documents below are the ONLY documents shared with this "
        f"beneficiary. Stay strictly within them.\n\n"
        f"--- DOCUMENT CONTEXT ---{document_context}\n\n"
        f"--- BENEFICIARY QUESTION ---\n{question}"
    )

    try:
        import asyncio

        resp = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: xai_client.chat.completions.create(
                model=XAI_MODEL_LIGHT,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": full_user_prompt},
                ],
                max_tokens=600,
                temperature=0.3,
            ),
        )
        answer = resp.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"BEC ask failed: {e}")
        raise HTTPException(status_code=502, detail="ai_call_failed") from e

    # Strip any hallucinated citation markers the model may have
    # invented (e.g. [#7] when only [#1]–[#3] were provided). Only
    # markers we actually registered survive into the final answer.
    import re

    valid_markers = set(citations.keys())

    def _scrub(match: "re.Match[str]") -> str:
        marker = match.group(1)
        return match.group(0) if marker in valid_markers else ""

    answer = re.sub(r"\[(#\d+)\]", _scrub, answer)
    # Compact runs of whitespace introduced by scrubbing.
    answer = re.sub(r" {2,}", " ", answer).strip()

    # Persist conversation turn so the beneficiary has a transcript later.
    now = datetime.now(timezone.utc).isoformat()
    session_id = payload.session_id or f"sess_{current_user['id']}_{payload.estate_id}"
    await db.beneficiary_concierge_messages.insert_one(
        {
            "session_id": session_id,
            "estate_id": payload.estate_id,
            "user_id": current_user["id"],
            "question": question,
            "answer": answer,
            "citations": citations,
            "doc_count": len(docs),
            "created_at": now,
        }
    )

    return {
        "answer": answer,
        "citations": citations,
        "session_id": session_id,
        "accessible_doc_count": len(docs),
        "benefactor_first_name": benefactor_first,
    }


@router.get("/beneficiary/concierge/document/{doc_id}")
async def concierge_document_snippet(
    doc_id: str,
    estate_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return a short preview snippet for a document the beneficiary
    has access to via BEC. Used by the citation-chip click modal so a
    beneficiary can see what the AI's claim is grounded in. Reuses the
    same gating as the ask endpoint — caller must be a beneficiary on a
    transitioned estate, the benefactor's tier must include `bec`, and
    the document must be in the caller's designated set."""
    info = await _resolve_concierge_access(current_user["id"], estate_id)
    if not info["available"]:
        reason = info["reason"]
        status_code = {
            "estate_not_found": 404,
            "not_a_beneficiary": 403,
            "pre_transition": 403,
            "feature_disabled_for_tier": 403,
            "benefactor_missing": 404,
        }.get(reason, 403)
        raise HTTPException(status_code=status_code, detail=reason)

    doc = next((d for d in info["documents"] if d.get("id") == doc_id), None)
    if not doc:
        # Either it doesn't exist or it isn't designated to this caller.
        # Return 404 either way to avoid leaking which it is.
        raise HTTPException(status_code=404, detail="document_not_accessible")

    try:
        text = await extract_document_text(doc)
    except Exception as e:  # pragma: no cover — extraction is best-effort
        logger.warning(f"BEC snippet: extraction failed for doc {doc_id}: {e}")
        text = ""

    snippet = (text or "").strip()
    truncated = False
    if len(snippet) > 1800:
        snippet = snippet[:1800].rstrip() + "…"
        truncated = True
    if not snippet:
        snippet = doc.get("description") or "[No readable text could be extracted from this document.]"

    return {
        "id": doc.get("id"),
        "name": doc.get("name") or "Untitled",
        "category": doc.get("category") or "other",
        "description": doc.get("description") or "",
        "snippet": snippet,
        "truncated": truncated,
    }


@router.get("/beneficiary/concierge/history")
async def concierge_history(
    estate_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the prior chat turns for this beneficiary on this estate."""
    info = await _resolve_concierge_access(current_user["id"], estate_id)
    if not info["available"]:
        return {"messages": []}
    cursor = (
        db.beneficiary_concierge_messages.find(
            {"estate_id": estate_id, "user_id": current_user["id"]},
            {"_id": 0},
        )
        .sort("created_at", 1)
        .limit(100)
    )
    messages = [m async for m in cursor]
    return {"messages": messages}
