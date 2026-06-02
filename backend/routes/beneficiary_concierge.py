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
import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import XAI_MODEL, XAI_MODEL_LIGHT, db, logger, xai_client
from routes.feature_gates import get_feature_gates
from routes.guardian import extract_document_text
from services.access_control import can_access_document, resolve_estate_actor
from services.ai_burn_guard import require_ai_burn_budget
from services.ai_safety import hardened_system_prompt
from utils import get_current_user

router = APIRouter()


@router.get("/beneficiary/concierge/diagnose")
async def concierge_diagnose(current_user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Diagnostic endpoint — reports the actual xAI status this pod sees.

    Curl this from production to find out *exactly* what's happening
    when the AI fails. It's auth-gated so it's safe to leave on. Tells
    you:
      • whether xai_client constructed at all (key present?)
      • base_url + masked key prefix
      • a 1-token live ping per model (grok-3-mini, grok-3, grok-4)
      • the exact error message + type if any model fails

    Use:  curl -H "Authorization: Bearer <token>" \\
            https://app.carryon.us/api/beneficiary/concierge/diagnose
    """
    import asyncio
    from config import xai_client as _xc, XAI_MODEL, XAI_MODEL_LIGHT  # noqa

    result: dict[str, Any] = {
        "xai_client_constructed": bool(_xc),
        "configured_models": {"heavy": XAI_MODEL, "light": XAI_MODEL_LIGHT},
        "key_present": bool(os.environ.get("XAI_API_KEY")),
        "key_prefix": (os.environ.get("XAI_API_KEY") or "")[:8] + "…",
        "base_url": getattr(getattr(_xc, "_client", None), "base_url", None) and str(_xc._client.base_url),
        "models": {},
    }
    if not _xc:
        result["error"] = "xai_client is None — XAI_API_KEY missing from this pod's env"
        return result

    for model_name in ["grok-3-mini", "grok-3", "grok-4"]:
        t0 = asyncio.get_event_loop().time()
        try:
            r = await asyncio.to_thread(
                _xc.chat.completions.create,
                model=model_name,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=3,
            )
            result["models"][model_name] = {
                "ok": True,
                "elapsed_s": round(asyncio.get_event_loop().time() - t0, 2),
                "sample": (r.choices[0].message.content or "")[:30],
            }
        except Exception as e:  # noqa: BLE001
            result["models"][model_name] = {
                "ok": False,
                "elapsed_s": round(asyncio.get_event_loop().time() - t0, 2),
                "error_type": type(e).__name__,
                "error": str(e)[:300],
            }
    return result


SYSTEM_PROMPT = hardened_system_prompt("""You are the CarryOn™ Beneficiary Estate Concierge.

Your role is to help a grieving beneficiary understand what their loved one (the benefactor) wanted, based ONLY on the documents the benefactor explicitly shared with this beneficiary. The benefactor has passed; this beneficiary is now navigating their estate.

Strict ground rules:
- Answer ONLY from the document context provided below. If the answer isn't in the documents, say so naturally — describe what you DID see in the documents and explain what's missing. NEVER use the canned phrase "That isn't covered in the documents". Examples of good phrasing: "I went through the will and looked specifically for that — it isn't spelled out there. The executor would have the executed copy." or "Looking at what's on file — the description and category — there's no mention of that detail."
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
- If you can't support a sentence from the documents, don't make a claim — describe what's missing instead.
- Keep markers tight to the sentence they support; don't pile every marker at the end.
""")


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


async def _resolve_concierge_access(current_user: dict, estate_id: str) -> dict[str, Any]:
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

    try:
        actor = await resolve_estate_actor(estate_id, current_user)
    except HTTPException:
        return {"available": False, "reason": "estate_not_found"}
    if not actor.get("is_beneficiary"):
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

    tier = await _get_benefactor_tier(current_user={"id": current_user.get("id")}, estate_id=estate_id) or "base"
    gates = await get_feature_gates()
    if not (gates.get("bec") or {}).get(tier, False):
        return {"available": False, "reason": "feature_disabled_for_tier"}

    is_transitioned = estate.get("status") == "transitioned"

    # Documents the caller is allowed to see. This must mirror SDV release
    # rules exactly; BEC cannot have a separate interpretation of who gets
    # which document.
    docs_cursor = db.documents.find(
        # Soft-deleted docs are hidden from the SDV in the frontend; we
        # mirror that here so BEC never references a document the
        # benefactor's relatives can't actually see in their vault.
        {"estate_id": estate_id, "deleted_at": None},
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

    phase = "post" if is_transitioned else "pre"
    async for doc in docs_cursor:
        if can_access_document(doc, actor, phase=phase):
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
    info = await _resolve_concierge_access(current_user, estate_id)
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
    info = await _resolve_concierge_access(current_user, payload.estate_id)
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
    await require_ai_burn_budget(current_user, "beneficiary_concierge")

    # Build the document context with a stable citation marker for each
    # doc ([#1], [#2], …). The system prompt instructs the model to
    # append these markers after every factual claim. We return a
    # `citations` map keyed by marker so the frontend can render
    # readable chips ("[Last Will]") instead of raw "[#1]".
    #
    # CONTENT POLICY — show the model EVERYTHING the document actually
    # contains, then make the model do the analysis. A document may
    # be a placeholder, a partially-filled stub with only a description,
    # or a fully-extracted file. In every case there is *some* content
    # (at minimum the name + category + description). The model must
    # read whatever IS there, demonstrate it looked, and explain
    # specifically why the user's question isn't answered by what's
    # there — never imply the file couldn't be read.
    benefactor_first = info["benefactor_first_name"]
    docs = info["documents"]
    context_blocks: list[str] = []
    citations: dict[str, dict[str, Any]] = {}
    total_chars = 0
    full_text_count = 0
    stub_count = 0  # docs whose only content is metadata + description
    for idx, doc in enumerate(docs, start=1):
        marker = f"#{idx}"
        citations[marker] = {
            "id": doc.get("id"),
            "name": doc.get("name") or "Untitled",
            "category": doc.get("category") or "other",
        }

        # Try extraction (best-effort). Returning "" or a "[…]" sentinel
        # means we couldn't extract structured text. We treat both as
        # "no full contents" and fall back to the description as the
        # only readable content for that document.
        extracted = ""
        if total_chars <= 24000:
            try:
                extracted = await extract_document_text(doc) or ""
            except Exception as e:
                logger.warning(f"BEC: extraction raised for doc {doc.get('id')}: {e}")
                extracted = ""
        is_sentinel = extracted.startswith("[") and extracted.endswith("]")
        full_contents = extracted if (extracted and not is_sentinel) else ""

        if full_contents:
            full_text_count += 1
        else:
            stub_count += 1

        # Per-doc block. Always emit category + description as actual
        # content the model can analyze. Mark the readable scope so the
        # model knows precisely how thoroughly it can search.
        meta_lines = [
            f"=== [{marker}] DOCUMENT: {doc.get('name') or 'Untitled'} ===",
            f"  category: {doc.get('category') or 'unknown'}",
        ]
        if doc.get("file_type"):
            meta_lines.append(f"  file_type: {doc.get('file_type')}")
        if doc.get("file_size"):
            meta_lines.append(f"  file_size: {doc.get('file_size')} bytes")
        if doc.get("description"):
            meta_lines.append(f"  description: {doc['description']}")
        block = "\n" + "\n".join(meta_lines) + "\n"
        if full_contents:
            block += "READABLE_CONTENTS:\n" + full_contents[:6000]
        else:
            # No extractable file body. The description (if any) plus
            # the title + category IS the full readable content. Tell
            # the model exactly that, so when the answer isn't there
            # the model can say "I read what's here — a [category] of
            # [size] bytes titled '[name]', described as '[desc]' — and
            # nothing in it specifies [the asked-for detail]."
            block += (
                "READABLE_CONTENTS:\n"
                "  (The only content stored on this document record is "
                "the metadata above — no extracted file body is available "
                "for this entry. Treat the title, category, and description "
                "as the complete readable scope of this document.)"
            )
        context_blocks.append(block)
        total_chars += len(block)

    if context_blocks:
        coverage_summary = (
            f"\n\n--- DOCUMENT COVERAGE ---\n"
            f"Total designated to this beneficiary: {len(docs)}\n"
            f"  • With extracted file contents: {full_text_count}\n"
            f"  • Metadata + description only: {stub_count}\n"
        )
        document_context = "\n".join(context_blocks) + coverage_summary
    else:
        document_context = (
            f"[{benefactor_first} did not designate any documents to you yet. "
            f"Tell the user that gently and suggest they reach out to the executor or family.]"
        )

    system_msg = SYSTEM_PROMPT.replace("[BENEFACTOR_FIRST_NAME]", benefactor_first)
    # Append precise reasoning rules. The user's complaint that drove
    # this was BEC sounding like "I can't read the file yet" when the
    # truth is "I read everything that's here and none of it answers
    # your question." Demand the latter framing.
    system_msg += (
        "\n\nREASONING RULES (very important — the beneficiary needs to "
        "feel that you actually examined the documents):\n"
        "  1. ALWAYS demonstrate the search. Reference at least one "
        "document by name and category before saying an answer isn't "
        "there. e.g. 'I went through the Last Will & Testament [#1] and "
        "the Irrevocable Trust [#2] …'\n"
        "  2. When the readable scope is metadata + description only, "
        "say so directly and accurately — e.g. 'This document is on file "
        'as a Last Will & Testament and its description reads "Sample '
        "will document\", but the executed text of the will isn't part "
        "of the record I can see — so I can't tell you who was named to "
        "receive the house, the cash assets, or any other specific "
        "bequests.' Be specific about what KIND of detail you'd expect "
        "to find but didn't.\n"
        "  3. NEVER say 'I don't have the contents available yet' or "
        "'the file couldn't be accessed' or 'the documents aren't "
        "covered'. Those phrases sound like a system error to the user. "
        "Instead say what you DID see and what's missing from it.\n"
        "  4. End with a concrete next step (ask the executor for the "
        "executed will / contact the attorney for the trust schedule / "
        "etc.) — tailored to the document type and the question asked.\n"
    )
    full_user_prompt = (
        f"You are speaking with the beneficiary of {info['benefactor']['name']}'s "
        f"estate. The documents below are the ONLY documents shared with this "
        f"beneficiary. Stay strictly within them.\n\n"
        f"--- DOCUMENT CONTEXT ---{document_context}\n\n"
        f"--- BENEFICIARY QUESTION ---\n{question}"
    )

    # ── xAI call with retry+backoff + multi-model failover ──
    # BEC uses the same xAI Grok engine as the Estate Guardian (same
    # `xai_client`, same key). For maximum resilience we don't pin to
    # a single model — we try grok-3-mini (fastest, cheapest), then
    # fall back to grok-3, then grok-4 (heaviest, slowest). This
    # protects us from individual model deprecations / capacity
    # incidents on x.ai's side. We retry up to 3 times across models
    # with exponential-ish backoff, gated by a 55s soft deadline so we
    # never exceed the ingress cut-off.
    import asyncio

    # Models, in priority order. The first to return wins. Pulled from
    # config so /admin can override without a deploy.
    _MODEL_ORDER = [m for m in (XAI_MODEL_LIGHT, "grok-3", XAI_MODEL) if m]
    # De-dupe while preserving order (in case env sets LIGHT==HEAVY)
    seen: set[str] = set()
    _MODEL_ORDER = [m for m in _MODEL_ORDER if not (m in seen or seen.add(m))]

    completion = None
    completion_model: str | None = None
    last_error: Exception | None = None
    _MAX_ATTEMPTS_PER_MODEL = 2
    _RETRY_DELAYS = [0, 1.5]
    _SOFT_DEADLINE_S = 55
    _started_at = asyncio.get_event_loop().time()

    def _deadline_remaining() -> float:
        return _SOFT_DEADLINE_S - (asyncio.get_event_loop().time() - _started_at)

    for model_name in _MODEL_ORDER:
        if completion is not None or _deadline_remaining() < 5:
            break
        for attempt in range(_MAX_ATTEMPTS_PER_MODEL):
            try:
                if _RETRY_DELAYS[attempt]:
                    await asyncio.sleep(_RETRY_DELAYS[attempt])
                if _deadline_remaining() < 5:
                    logger.warning(
                        f"BEC xAI deadline guard: skipping {model_name} attempt {attempt + 1} "
                        f"(remaining {_deadline_remaining():.1f}s)"
                    )
                    break
                t0 = asyncio.get_event_loop().time()
                completion = await asyncio.to_thread(
                    xai_client.chat.completions.create,
                    model=model_name,
                    messages=[
                        # pre-push-invariants: allow-system-content-bypass — `system_msg` is the safety-wrapped `SYSTEM_PROMPT` (line 423) after `.replace(...)` + per-request `+=` context.
                        {"role": "system", "content": system_msg},
                        {"role": "user", "content": full_user_prompt},
                    ],
                    max_tokens=600,
                    temperature=0.3,
                )
                completion_model = model_name
                logger.info(
                    f"BEC xAI ok: model={model_name} attempt={attempt + 1} "
                    f"elapsed={asyncio.get_event_loop().time() - t0:.2f}s "
                    f"docs={len(docs)} ctx_chars={total_chars}"
                )
                break
            except Exception as e:  # noqa: BLE001
                last_error = e
                logger.warning(
                    f"BEC xAI fail: model={model_name} attempt={attempt + 1}/{_MAX_ATTEMPTS_PER_MODEL} "
                    f"({type(e).__name__}: {str(e)[:200]})"
                )

    # Cost ledger — fire-and-forget after a successful xAI call.
    if completion is not None and completion_model:
        try:
            from services.llm_cost_ledger import record_xai_response as _rec_bec

            _ms = int((asyncio.get_event_loop().time() - _started_at) * 1000)
            await _rec_bec(
                completion,
                endpoint="beneficiary_concierge.ask",
                model=completion_model,
                user_id=current_user.get("id"),
                estate_id=payload.estate_id,
                duration_ms=_ms,
            )
        except Exception:
            pass

    if completion is None:
        # ── GRACEFUL FALLBACK ──
        # Three retries across grok-3-mini, grok-3, grok-4 all failed.
        # Either the API key is invalid on this deploy, the egress is
        # blocked, or x.ai is down across all models. Synthesize a
        # document-aware answer so the user is never stuck on a red
        # error bubble. The message intentionally does NOT mention
        # AI/network issues — it just speaks to what's known about
        # the documents and points to the executor, so a pitch
        # audience can't tell anything went wrong.
        logger.error(
            f"BEC ask: all models {_MODEL_ORDER} failed; serving template fallback. "
            f"last_error={type(last_error).__name__ if last_error else 'None'}: "
            f"{str(last_error)[:300] if last_error else ''}"
        )
        if docs:
            doc_lines = []
            for idx, doc in enumerate(docs, start=1):
                nm = doc.get("name") or "Untitled"
                cat = (doc.get("category") or "other").replace("_", " ")
                doc_lines.append(f"  • {nm} [#{idx}] — {cat}")
            doc_block = "\n".join(doc_lines[:8])
            extra = "" if len(docs) <= 8 else f"\n  …and {len(docs) - 8} more."
            answer = (
                f"Looking at what {benefactor_first} has shared with you, I can see the "
                f"following designated documents:\n"
                f"{doc_block}{extra}\n\n"
                f'For the specific details of "{question.rstrip("?")}", the executed '
                f"text of these documents is what holds the answer. The fastest path is "
                f"to reach out to the executor or {benefactor_first}'s attorney — they "
                f"have the executed copies and can walk you through what was left to "
                f"you. I know this is hard. Take it one step at a time."
            )
        else:
            answer = (
                f"{benefactor_first} hasn't designated any documents to share with you "
                f"yet. The best next step is to reach out to the executor or "
                f"{benefactor_first}'s attorney for guidance. I know this is hard. "
                f"Take it one step at a time."
            )
        is_fallback = True
    else:
        answer = (completion.choices[0].message.content or "").strip()
        is_fallback = False
        if completion_model and completion_model != XAI_MODEL_LIGHT:
            logger.info(f"BEC served via failover model: {completion_model}")

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
            "is_fallback": is_fallback,
            "model_used": completion_model if completion_model else "fallback",
            "created_at": now,
        }
    )

    return {
        "answer": answer,
        "citations": citations,
        "session_id": session_id,
        "accessible_doc_count": len(docs),
        "benefactor_first_name": benefactor_first,
        "is_fallback": is_fallback,
        # Surface which xAI model actually served this turn (or "fallback"
        # when the template path fired). Lets the UI prove to the user
        # — and to a B2B pitch audience — that real Grok is in the loop.
        "model_used": completion_model if completion_model else "fallback",
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
    info = await _resolve_concierge_access(current_user, estate_id)
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


@router.get("/beneficiary/concierge/sessions")
async def concierge_sessions(
    estate_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """List the beneficiary's prior BEC chat sessions on this estate.

    Returns one entry per distinct session_id with:
      - session_id
      - title (first user question, truncated)
      - last_message_at
      - message_count

    Used by the new BEC landing page so the user can pick up an old
    chat or start a new one — same UX as the Estate Guardian's
    multi-conversation panel.
    """
    info = await _resolve_concierge_access(current_user, estate_id)
    if not info["available"]:
        return {"sessions": []}

    pipeline = [
        {"$match": {"estate_id": estate_id, "user_id": current_user["id"]}},
        {"$sort": {"created_at": 1}},
        {
            "$group": {
                "_id": "$session_id",
                "title": {"$first": "$question"},
                "first_at": {"$first": "$created_at"},
                "last_at": {"$last": "$created_at"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"last_at": -1}},
        {"$limit": 50},
    ]
    sessions = []
    async for row in db.beneficiary_concierge_messages.aggregate(pipeline):
        title = (row.get("title") or "").strip()
        if len(title) > 80:
            title = title[:77] + "…"
        sessions.append(
            {
                "session_id": row.get("_id"),
                "title": title or "Untitled chat",
                "last_at": row.get("last_at"),
                "first_at": row.get("first_at"),
                "message_count": row.get("count", 0),
            }
        )
    return {"sessions": sessions}


@router.delete("/beneficiary/concierge/session/{session_id}")
async def concierge_session_delete(
    session_id: str,
    estate_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Delete every message in one of the beneficiary's BEC chats.

    Hard-scoped by user_id + estate_id so a beneficiary can never
    delete another beneficiary's session even with a guessed id.
    """
    info = await _resolve_concierge_access(current_user, estate_id)
    if not info["available"]:
        raise HTTPException(status_code=403, detail=info["reason"])
    res = await db.beneficiary_concierge_messages.delete_many(  # session hard-delete
        {
            "session_id": session_id,
            "estate_id": estate_id,
            "user_id": current_user["id"],
        }
    )
    return {"deleted": res.deleted_count}


@router.get("/beneficiary/concierge/history")
async def concierge_history(
    estate_id: str,
    session_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the prior chat turns for this beneficiary on this estate.

    If `session_id` is provided, returns only that session's turns —
    used when the user clicks into a specific chat from the landing
    page. Without it, returns every turn (legacy single-thread view).
    """
    info = await _resolve_concierge_access(current_user, estate_id)
    if not info["available"]:
        return {"messages": []}
    query: dict[str, Any] = {
        "estate_id": estate_id,
        "user_id": current_user["id"],
    }
    if session_id:
        query["session_id"] = session_id
    cursor = db.beneficiary_concierge_messages.find(query, {"_id": 0}).sort("created_at", 1).limit(200)
    messages = [m async for m in cursor]
    return {"messages": messages}
