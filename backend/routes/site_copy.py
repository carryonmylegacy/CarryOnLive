"""CarryOn™ Backend — Site Copy overrides (founder-editable public text).

Every public-facing string has a stable key in the frontend registry
(frontend/src/copy/siteCopy.js) with its built-in default. The founder can
override any of them from Admin → Marketing → Site Copy; overrides live here,
keyed by that string key, and the public site falls back to the default when
no override exists. Plain text only (line breaks allowed) — never rendered as HTML.

GET  /api/public/site-copy            — {overrides: {key: text}, updated_at} — EFFECTIVE text (base + active schedules)
GET  /api/admin/site-copy/state       — {overrides: base, effective, schedules}
PUT  /api/admin/site-copy             — {changes: {key: text | null}} (null/"" resets to default); founder or marketing scope
GET  /api/admin/site-copy/history     — who changed which line, when (before → after); ?key= filters one field
GET/POST/DELETE /api/admin/site-copy/schedules — a wording change that goes live at start_at and reverts at end_at
POST /api/admin/site-copy/review      — proof-read fields: spacing/SEO/placeholder checks + AI typo pass
"""

import asyncio
import json
import re
import time
import unicodedata
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from config import XAI_MODEL_LIGHT, db, logger, xai_client
from guards import require_scope
from services.audit import get_client_ip, log_audit_event

router = APIRouter()

KEY_RE = re.compile(r"^[a-z0-9]+(?:\.[a-z0-9_-]+)+$")
PATH_RE = re.compile(r"^/[a-z0-9/_-]*$")
MAX_LEN = 5000
MAX_CHANGES = 400
MAX_DRAFT_CHANGES = 1000
HISTORY_LIMIT = 500
REVIEW_MAX_FIELDS = 200
REVIEW_BATCH = 40
SEO_LIMITS = {"title": 60, "description": 160}
BRAND_WORDS = "CarryOn, Estate Guardian, Milestone Messages, Everplans, Trustworthy, Resolve Legacy, xAI, Grok, Stripe, WCAG, SOC 2, HSTS, PBKDF2, AES-256-GCM, WebAuthn, Vercel, Render, MongoDB"


class SiteCopyChanges(BaseModel):
    changes: dict[str, str | None] = Field(..., description="key → new text, or null/empty to reset to default")


class ScheduleIn(BaseModel):
    key: str
    value: str = Field("", description="text to show during the window; empty = show the built-in default")
    start_at: str = Field(..., description="ISO-8601 UTC")
    end_at: str | None = Field(None, description="ISO-8601 UTC; null = stays live until removed")
    note: str = Field("", max_length=200)
    page_path: str = Field("", max_length=120, description="public path of the page this field is on (for alerts)")
    page_label: str = Field("", max_length=120)
    field_label: str = Field("", max_length=200)
    before_text: str = Field("", description="what visitors see before the change (for the alert e-mail)")


class DraftIn(BaseModel):
    name: str = Field("", max_length=200)
    changes: dict[str, str | None] = Field(default_factory=dict)


class AlertsIn(BaseModel):
    enabled: bool


class ReviewField(BaseModel):
    key: str
    label: str = ""
    text: str = ""
    required_vars: list[str] = Field(default_factory=list)


class ReviewIn(BaseModel):
    fields: list[ReviewField]


def clean_copy_value(value: str) -> str:
    """Plain text only: normalise, strip control chars except newline/tab, collapse CRLF."""
    text = unicodedata.normalize("NFC", value).replace("\r\n", "\n").replace("\r", "\n")
    text = "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch)[0] != "C")
    return text.strip()


def validate_key(key: str) -> str:
    if not isinstance(key, str) or len(key) > 120 or not KEY_RE.match(key):
        raise HTTPException(status_code=400, detail=f"Invalid copy key: {key!r}")
    return key


def parse_iso(value: str, field: str) -> str:
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field}: not a valid date/time.") from None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def schedule_status(s: dict, now: str) -> str:
    if s.get("end_at") and s["end_at"] <= now:
        return "ended"
    return "active" if s["start_at"] <= now else "upcoming"


def apply_schedules(base: dict, schedules: list[dict], now: str) -> dict:
    """Overlay active scheduled values on the saved overrides (latest start wins per key)."""
    effective = dict(base)
    for s in sorted(schedules, key=lambda x: x["start_at"]):
        if schedule_status(s, now) != "active":
            continue
        if s.get("value"):
            effective[s["key"]] = s["value"]
        else:
            effective.pop(s["key"], None)
    return effective


async def load_base() -> tuple[dict, str]:
    overrides, latest = {}, ""
    async for doc in db.site_copy.find({}, {"_id": 1, "value": 1, "updated_at": 1}):
        overrides[doc["_id"]] = doc.get("value", "")
        latest = max(latest, doc.get("updated_at", "") or "")
    return overrides, latest


async def load_schedules() -> list[dict]:
    items = []
    async for doc in db.site_copy_schedules.find({}).sort("start_at", 1):
        items.append(
            {
                "id": doc["_id"],
                "key": doc["key"],
                "value": doc.get("value", ""),
                "start_at": doc["start_at"],
                "end_at": doc.get("end_at"),
                "note": doc.get("note", ""),
                "page_path": doc.get("page_path", ""),
                "page_label": doc.get("page_label", ""),
                "field_label": doc.get("field_label", ""),
                "live_alert_at": doc.get("live_alert_at"),
                "revert_alert_at": doc.get("revert_alert_at"),
                "created_by": doc.get("created_by", ""),
                "created_at": doc.get("created_at", ""),
            }
        )
    return items


async def load_overrides() -> dict:
    """Effective public text right now: saved overrides + whichever schedules are live."""
    now = datetime.now(timezone.utc).isoformat()
    base, latest = await load_base()
    schedules = await load_schedules()
    for s in schedules:
        for boundary in (s["start_at"], s.get("end_at") or ""):
            if boundary <= now:
                latest = max(latest, boundary)
    return {"overrides": apply_schedules(base, schedules, now), "updated_at": latest}


@router.get("/public/site-copy")
async def get_public_site_copy():
    """Public — founder overrides for the marketing site's text (+ launch flags the site reads)."""
    from routes.guides import guides_status

    result = await load_overrides()
    guides = await guides_status()
    result["flags"] = {"guides_launched": guides["launched"], "guides_launched_at": guides["launched_at"]}
    return result


@router.get("/admin/site-copy/state")
async def get_site_copy_state(current_user: dict = Depends(require_scope("marketing"))):
    from services.site_copy_alerts import alerts_enabled

    now = datetime.now(timezone.utc).isoformat()
    base, _ = await load_base()
    schedules = await load_schedules()
    for s in schedules:
        s["status"] = schedule_status(s, now)
    return {
        "overrides": base,
        "effective": apply_schedules(base, schedules, now),
        "schedules": schedules,
        "drafts": await load_drafts(),
        "alerts_enabled": await alerts_enabled(),
        "now": now,
    }


def clean_changes(changes: dict, limit: int = MAX_CHANGES) -> dict[str, str]:
    if len(changes) > limit:
        raise HTTPException(status_code=400, detail=f"Too many changes in one save (max {limit}).")
    cleaned: dict[str, str] = {}
    for raw_key, raw_value in changes.items():
        key = validate_key(raw_key)
        value = clean_copy_value(raw_value) if isinstance(raw_value, str) else ""
        if len(value) > MAX_LEN:
            raise HTTPException(status_code=400, detail=f"{key}: text is too long (max {MAX_LEN} characters).")
        cleaned[key] = value
    return cleaned


@router.put("/admin/site-copy")
async def put_site_copy(
    payload: SiteCopyChanges, request: Request, current_user: dict = Depends(require_scope("marketing"))
):
    return await apply_changes(clean_changes(payload.changes), current_user, request)


async def apply_changes(cleaned: dict[str, str], current_user: dict, request: Request, via: str = "") -> dict:
    """Write overrides ("" = reset to default), record history (+ `via` draft name) and audit."""
    now = datetime.now(timezone.utc).isoformat()
    actor = current_user.get("email", "")
    existing: dict[str, str] = {}
    async for doc in db.site_copy.find({"_id": {"$in": list(cleaned)}}, {"_id": 1, "value": 1}):
        existing[doc["_id"]] = doc.get("value", "")
    set_keys, reset_keys, history = [], [], []
    for key, value in cleaned.items():
        previous = existing.get(key, "")
        if not value:
            res = await db.site_copy.delete_one({"_id": key})
            if res.deleted_count:
                reset_keys.append(key)
        else:
            await db.site_copy.replace_one(
                {"_id": key},
                {"_id": key, "value": value, "updated_at": now, "updated_by": actor},
                upsert=True,
            )
            set_keys.append(key)
        if value != previous:
            history.append(
                {
                    "_id": str(uuid.uuid4()),
                    "key": key,
                    "previous": previous,
                    "next": value,
                    "actor_id": current_user["id"],
                    "actor_email": actor,
                    "at": now,
                    "via": via,
                }
            )
    if history:
        await db.site_copy_history.insert_many(history)
    if set_keys or reset_keys:
        logger.info(f"Site copy updated by {actor}: {len(set_keys)} set, {len(reset_keys)} reset")
        await log_audit_event(
            actor_id=current_user["id"],
            actor_email=actor,
            actor_role=current_user.get("role", "admin"),
            action="site_copy_update",
            category="platform",
            resource_type="site_copy",
            resource_id="public-site",
            details={"set": set_keys, "reset": reset_keys, "via": via},
            ip_address=get_client_ip(request),
        )
    base, _ = await load_base()
    effective = await load_overrides()
    return {"overrides": base, "effective": effective["overrides"], "updated_at": effective["updated_at"]}


@router.get("/admin/site-copy/history")
async def get_site_copy_history(
    key: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=HISTORY_LIMIT),
    current_user: dict = Depends(require_scope("marketing")),
):
    """Change log for the public-site text: who changed which line, when, before → after."""
    query = {"key": validate_key(key)} if key else {}
    items = []
    async for doc in db.site_copy_history.find(query).sort("at", -1).limit(limit):
        items.append(
            {
                "id": doc["_id"],
                "key": doc["key"],
                "previous": doc.get("previous", ""),
                "next": doc.get("next", ""),
                "actor_email": doc.get("actor_email", ""),
                "at": doc.get("at", ""),
                "via": doc.get("via", ""),
            }
        )
    return {"items": items}


# ── Scheduled copy ──────────────────────────────────────────────────────────────


@router.get("/admin/site-copy/schedules")
async def list_schedules(current_user: dict = Depends(require_scope("marketing"))):
    now = datetime.now(timezone.utc).isoformat()
    items = await load_schedules()
    for s in items:
        s["status"] = schedule_status(s, now)
    return {"items": items, "now": now}


@router.post("/admin/site-copy/schedules")
async def create_schedule(
    payload: ScheduleIn, request: Request, current_user: dict = Depends(require_scope("marketing"))
):
    key = validate_key(payload.key)
    value = clean_copy_value(payload.value or "")
    if len(value) > MAX_LEN:
        raise HTTPException(status_code=400, detail=f"{key}: text is too long (max {MAX_LEN} characters).")
    start_at = parse_iso(payload.start_at, "start_at")
    end_at = parse_iso(payload.end_at, "end_at") if payload.end_at else None
    if end_at and end_at <= start_at:
        raise HTTPException(status_code=400, detail="end_at must be after start_at.")
    now = datetime.now(timezone.utc).isoformat()
    if end_at and end_at <= now:
        raise HTTPException(status_code=400, detail="That window has already ended.")
    doc = {
        "_id": str(uuid.uuid4()),
        "key": key,
        "value": value,
        "start_at": start_at,
        "end_at": end_at,
        "note": clean_copy_value(payload.note or "")[:200],
        "page_path": payload.page_path if PATH_RE.match(payload.page_path or "") else "",
        "page_label": clean_copy_value(payload.page_label or "")[:120],
        "field_label": clean_copy_value(payload.field_label or "")[:200],
        "before_text": clean_copy_value(payload.before_text or "")[:MAX_LEN],
        "created_by": current_user.get("email", ""),
        "created_at": now,
    }
    await db.site_copy_schedules.insert_one(doc)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", "admin"),
        action="site_copy_schedule_create",
        category="platform",
        resource_type="site_copy_schedule",
        resource_id=doc["_id"],
        details={"key": key, "start_at": start_at, "end_at": end_at},
        ip_address=get_client_ip(request),
    )
    return await list_schedules(current_user)


@router.delete("/admin/site-copy/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, request: Request, current_user: dict = Depends(require_scope("marketing"))):
    doc = await db.site_copy_schedules.find_one_and_delete({"_id": schedule_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Schedule not found.")
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", "admin"),
        action="site_copy_schedule_delete",
        category="platform",
        resource_type="site_copy_schedule",
        resource_id=schedule_id,
        details={"key": doc.get("key"), "start_at": doc.get("start_at"), "end_at": doc.get("end_at")},
        ip_address=get_client_ip(request),
    )
    return await list_schedules(current_user)


# ── Drafts (a named set of wording changes, published together) ─────────────────


def draft_out(doc: dict) -> dict:
    changes = doc.get("changes") or {}
    return {
        "id": doc["_id"],
        "name": doc.get("name", ""),
        "changes": changes,
        "count": len(changes),
        "created_by": doc.get("created_by", ""),
        "created_at": doc.get("created_at", ""),
        "updated_by": doc.get("updated_by", ""),
        "updated_at": doc.get("updated_at", ""),
    }


async def load_drafts() -> list[dict]:
    return [draft_out(doc) async for doc in db.site_copy_drafts.find({}).sort("updated_at", -1)]


def clean_draft_name(name: str) -> str:
    cleaned = clean_copy_value(name)[:80]
    if not cleaned:
        raise HTTPException(status_code=400, detail="Give the draft a name.")
    return cleaned


async def audit_draft(action: str, doc: dict, request: Request, current_user: dict, extra: dict | None = None):
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", "admin"),
        action=action,
        category="platform",
        resource_type="site_copy_draft",
        resource_id=doc["_id"],
        details={"name": doc.get("name"), "count": len(doc.get("changes") or {}), **(extra or {})},
        ip_address=get_client_ip(request),
    )


@router.get("/admin/site-copy/drafts")
async def list_drafts(current_user: dict = Depends(require_scope("marketing"))):
    return {"items": await load_drafts()}


@router.post("/admin/site-copy/drafts")
async def create_draft(payload: DraftIn, request: Request, current_user: dict = Depends(require_scope("marketing"))):
    changes = clean_changes(payload.changes, MAX_DRAFT_CHANGES)
    if not changes:
        raise HTTPException(status_code=400, detail="Nothing to save — make an edit first.")
    now = datetime.now(timezone.utc).isoformat()
    actor = current_user.get("email", "")
    doc = {
        "_id": str(uuid.uuid4()),
        "name": clean_draft_name(payload.name),
        "changes": changes,
        "created_by": actor,
        "created_at": now,
        "updated_by": actor,
        "updated_at": now,
    }
    await db.site_copy_drafts.insert_one(doc)
    await audit_draft("site_copy_draft_create", doc, request, current_user)
    return {"items": await load_drafts(), "id": doc["_id"]}


@router.put("/admin/site-copy/drafts/{draft_id}")
async def update_draft(
    draft_id: str, payload: DraftIn, request: Request, current_user: dict = Depends(require_scope("marketing"))
):
    changes = clean_changes(payload.changes, MAX_DRAFT_CHANGES)
    if not changes:
        raise HTTPException(status_code=400, detail="A draft needs at least one change — delete it instead.")
    update = {
        "name": clean_draft_name(payload.name),
        "changes": changes,
        "updated_by": current_user.get("email", ""),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.site_copy_drafts.update_one({"_id": draft_id}, {"$set": update})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Draft not found.")
    await audit_draft("site_copy_draft_update", {"_id": draft_id, **update}, request, current_user)
    return {"items": await load_drafts(), "id": draft_id}


@router.post("/admin/site-copy/drafts/{draft_id}/publish")
async def publish_draft(draft_id: str, request: Request, current_user: dict = Depends(require_scope("marketing"))):
    """Apply every change in the draft in one go (history rows carry the draft name), then remove the draft."""
    doc = await db.site_copy_drafts.find_one({"_id": draft_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft not found.")
    result = await apply_changes(doc.get("changes") or {}, current_user, request, via=doc.get("name", ""))
    await db.site_copy_drafts.delete_one({"_id": draft_id})
    await audit_draft("site_copy_draft_publish", doc, request, current_user)
    return {**result, "items": await load_drafts()}


@router.delete("/admin/site-copy/drafts/{draft_id}")
async def delete_draft(draft_id: str, request: Request, current_user: dict = Depends(require_scope("marketing"))):
    doc = await db.site_copy_drafts.find_one_and_delete({"_id": draft_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Draft not found.")
    await audit_draft("site_copy_draft_delete", doc, request, current_user)
    return {"items": await load_drafts()}


# ── Copy alerts (e-mail when a schedule goes live / reverts) ───────────────────


@router.get("/admin/site-copy/alerts")
async def get_alerts(current_user: dict = Depends(require_scope("marketing"))):
    from services.site_copy_alerts import alerts_enabled

    return {"enabled": await alerts_enabled()}


@router.put("/admin/site-copy/alerts")
async def put_alerts(payload: AlertsIn, request: Request, current_user: dict = Depends(require_scope("marketing"))):
    await db.platform_settings.update_one(
        {"_id": "global"}, {"$set": {"copy_alerts_enabled": payload.enabled}}, upsert=True
    )
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", "admin"),
        action="site_copy_alerts_toggle",
        category="platform",
        resource_type="site_copy",
        resource_id="alerts",
        details={"enabled": payload.enabled},
        ip_address=get_client_ip(request),
    )
    return {"enabled": payload.enabled}


# ── Review (proof-read) ─────────────────────────────────────────────────────────


def deterministic_issues(f: ReviewField) -> list[dict]:
    text = f.text or ""
    issues = []
    if not text.strip():
        issues.append(
            {"key": f.key, "type": "empty", "message": "Empty text — the built-in default will show instead."}
        )
        return issues
    if "  " in text or re.search(r"[ \t]+\n|\n[ \t]+", text):
        fixed = re.sub(r"[ \t]{2,}", " ", text)
        fixed = re.sub(r"[ \t]+\n", "\n", fixed)
        fixed = re.sub(r"\n[ \t]+", "\n", fixed)
        issues.append(
            {
                "key": f.key,
                "type": "spacing",
                "message": "Double spaces or stray spaces around a line break.",
                "fix": fixed,
            }
        )
    if text != text.strip():
        issues.append(
            {"key": f.key, "type": "spacing", "message": "Leading or trailing whitespace.", "fix": text.strip()}
        )
    if text.count("**") % 2:
        issues.append({"key": f.key, "type": "markup", "message": "Unbalanced ** — bold marks must come in pairs."})
    if re.search(r"<[a-zA-Z/][^>]*>", text):
        issues.append(
            {"key": f.key, "type": "markup", "message": "Looks like HTML — tags are shown as plain text on the site."}
        )
    if re.search(r" ,| \.(?!\.)|\.\.(?!\.)", text):
        issues.append(
            {"key": f.key, "type": "punctuation", "message": "Space before a comma/period, or a stray double period."}
        )
    for var in f.required_vars:
        if f"{{{var}}}" not in text:
            issues.append(
                {
                    "key": f.key,
                    "type": "placeholder",
                    "message": f"Missing {{{var}}} — this spot is filled in automatically and the text no longer has it.",
                }
            )
    if ".seo." in f.key:
        kind = "title" if f.key.endswith(".title") else "description"
        limit = SEO_LIMITS[kind]
        if len(text) > limit:
            issues.append(
                {
                    "key": f.key,
                    "type": "seo",
                    "message": f"Search {kind} is {len(text)} characters — Google shows about {limit}.",
                }
            )
    return issues


def _parse_llm_json(text: str):
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        text = text[4:] if text.startswith("json") else text
    start, end = text.find("["), text.rfind("]")
    return json.loads(text[start : end + 1]) if start != -1 and end != -1 else []


async def llm_typo_issues(fields: list[ReviewField], actor_id: str) -> list[dict]:
    if xai_client is None or not fields:
        return []
    numbered = "\n".join(f"{i + 1}. {f.text}" for i, f in enumerate(fields))
    prompt = (
        "You proof-read short marketing texts for a US-English website. For each numbered text, report only real "
        "spelling mistakes, wrong or missing words, doubled words, and clear grammar errors. Do not comment on style, "
        "tone, capitalisation of headings, sentence fragments, Oxford commas, or curly quotes. Ignore these names: "
        f"{BRAND_WORDS}. Words in {{curly}} braces and **double stars** are markup — leave them alone.\n"
        'Reply with ONLY a JSON array like [{"n": 3, "wrong": "recieve", "right": "receive", "why": "spelling"}]. '
        "Reply [] if everything is correct.\n\n" + numbered
    )
    t0 = time.time()
    try:
        resp = await asyncio.to_thread(
            xai_client.chat.completions.create,
            model=XAI_MODEL_LIGHT,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=1500,
        )
        try:
            from services.llm_cost_ledger import record_xai_response

            await record_xai_response(
                resp, endpoint="site_copy.review", model=XAI_MODEL_LIGHT, user_id=actor_id, started_at=t0
            )
        except Exception:  # noqa: BLE001
            pass
        parsed = _parse_llm_json(resp.choices[0].message.content)
    except Exception as e:  # noqa: BLE001
        logger.warning("Site copy AI review failed: %s", e)
        return [
            {"key": "", "type": "llm", "message": "The AI typo pass was unavailable — only the automatic checks ran."}
        ]
    issues = []
    for item in parsed if isinstance(parsed, list) else []:
        try:
            f = fields[int(item.get("n", 0)) - 1]
        except (ValueError, TypeError, IndexError):
            continue
        wrong, right = str(item.get("wrong", "")).strip(), str(item.get("right", "")).strip()
        if not wrong or wrong not in f.text:
            continue
        issue = {
            "key": f.key,
            "type": "typo",
            "message": f"“{wrong}” → “{right}”" + (f" ({item.get('why')})" if item.get("why") else ""),
        }
        if right:
            issue["fix"] = f.text.replace(wrong, right, 1)
        issues.append(issue)
    return issues


@router.post("/admin/site-copy/review")
async def review_site_copy(payload: ReviewIn, current_user: dict = Depends(require_scope("marketing"))):
    if len(payload.fields) > REVIEW_MAX_FIELDS:
        raise HTTPException(status_code=400, detail=f"Review at most {REVIEW_MAX_FIELDS} fields at a time.")
    for f in payload.fields:
        validate_key(f.key)
    issues = [i for f in payload.fields for i in deterministic_issues(f)]
    with_text = [f for f in payload.fields if f.text.strip()]
    llm_used = xai_client is not None and bool(with_text)
    known_fixes = {(i["key"], i["fix"]) for i in issues if "fix" in i}
    for i in range(0, len(with_text), REVIEW_BATCH):
        for issue in await llm_typo_issues(with_text[i : i + REVIEW_BATCH], current_user["id"]):
            if (issue["key"], issue.get("fix")) not in known_fixes:
                issues.append(issue)
    return {"issues": issues, "reviewed": len(payload.fields), "llm_used": llm_used}
