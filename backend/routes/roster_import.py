"""CarryOn™ — Roster import endpoints (Partner Portal + founder Admin).

Three-step flow, identical for both surfaces:
  analyze  — upload .csv/.xlsx → parse → mapping (remembered / detected /
             AI-suggested) → reconciliation plan. Nothing is written except
             a 24-hour scratch copy of the parsed sheet (`roster_uploads`).
  remap    — partner corrects the column mapping → fresh plan.
  commit   — provision the "add" rows through the SAME core as the
             one-at-a-time flow (seats, trustee grant, audit), rename
             unclaimed "update_name" rows, optionally send claim invitations,
             remember the layout, write an import-history entry (counts only).
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from config import db, logger
from routes.admin.partners import _ensure_founder
from routes.partner_managers import get_current_manager
from routes.pro_clients import _claim_email_html, _claim_url, provision_client_portal, refresh_claim_token
from services import roster_import as ri
from services.audit import get_client_ip, log_audit_event
from services.email import send_email_ex
from utils import get_current_user

router = APIRouter()

UPLOAD_TTL_HOURS = 24
INVITE_PACING_SECONDS = 0.6


class RemapRequest(BaseModel):
    upload_id: str
    mapping: dict


class CommitRequest(BaseModel):
    upload_id: str
    send_invites: bool = False
    mapping: dict | None = Field(default=None)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _actor_from_manager(manager: dict) -> dict:
    return {
        "type": "manager",
        "id": manager["id"],
        "label": manager.get("name") or manager.get("username", "Partner"),
        "email": manager.get("username", ""),
        "partner": manager["_partner"],
    }


async def _actor_from_admin(partner_id: str, current_user: dict) -> dict:
    _ensure_founder(current_user)
    partner = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found.")
    return {
        "type": "admin",
        "id": current_user["id"],
        "label": current_user.get("name") or "CarryOn",
        "email": current_user.get("email", ""),
        "partner": partner,
    }


async def _fresh_partner(partner_id: str) -> dict:
    partner = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found.")
    return partner


async def _load_upload(upload_id: str, actor: dict) -> dict:
    up = await db.roster_uploads.find_one({"id": upload_id, "partner_id": actor["partner"]["id"]}, {"_id": 0})
    if not up:
        raise HTTPException(status_code=404, detail="This upload has expired — please choose the file again.")
    return up


def _plan_payload(up: dict, mapping: dict, source: str, plan: dict, ai_available: bool) -> dict:
    return {
        "upload_id": up["id"],
        "filename": up.get("filename", ""),
        "sheet_name": up.get("sheet_name") or "",
        "headers": up["headers"],
        "sample_rows": up["rows"][:3],
        "row_count": len(up["rows"]),
        "mapping": {f: mapping.get(f) for f in ri.FIELDS},
        "mapping_source": source,
        "mapping_complete": ri.mapping_complete(mapping),
        "ai_available": ai_available,
        **plan,
    }


async def _analyze(actor: dict, file: UploadFile) -> dict:
    content = await file.read()
    try:
        headers, rows, sheet_name = ri.parse_spreadsheet(file.filename or "", content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    partner = await _fresh_partner(actor["partner"]["id"])
    source = "remembered"
    mapping = await ri.remembered_mapping(partner, headers)
    if not mapping:
        source, mapping = "detected", ri.detect_mapping(headers, rows)
    if not ri.mapping_complete(mapping):
        suggested = await ri.ai_suggest_mapping(headers, rows, actor_id=actor["id"])
        if suggested:
            source, mapping = "ai", suggested
        elif not mapping.get("email"):
            source = "manual"

    up = {
        "id": str(uuid.uuid4()),
        "partner_id": partner["id"],
        "actor_type": actor["type"],
        "actor_ref": actor["id"],
        "filename": (file.filename or "roster")[:120],
        "headers": headers,
        "rows": rows,
        "mapping": mapping,
        "mapping_source": source,
        "sheet_name": sheet_name,
        "status": "ready",
        "created_at": _now().isoformat(),
        "expires_at": _now() + timedelta(hours=UPLOAD_TTL_HOURS),
    }
    await db.roster_uploads.insert_one(up)
    plan = (
        await ri.reconcile(partner, ri.apply_mapping(headers, rows, mapping))
        if ri.mapping_complete(mapping)
        else {"rows": [], "summary": None, "not_in_upload": []}
    )
    return _plan_payload(up, mapping, source, plan, ri.xai_client is not None)


async def _remap(actor: dict, data: RemapRequest) -> dict:
    up = await _load_upload(data.upload_id, actor)
    mapping = {f: (data.mapping.get(f) if data.mapping.get(f) in up["headers"] else None) for f in ri.FIELDS}
    if not ri.mapping_complete(mapping):
        raise HTTPException(
            status_code=400, detail="Pick the Email column plus either First + Last name or a Full name column."
        )
    await db.roster_uploads.update_one({"id": up["id"]}, {"$set": {"mapping": mapping, "mapping_source": "manual"}})
    partner = await _fresh_partner(up["partner_id"])
    plan = await ri.reconcile(partner, ri.apply_mapping(up["headers"], up["rows"], mapping))
    return _plan_payload(up, mapping, "manual", plan, ri.xai_client is not None)


async def _send_invites_paced(import_id: str, items: list[dict]) -> None:
    sent = 0
    for it in items:
        try:
            await send_email_ex(it["email"], it["subject"], it["html"])
            sent += 1
        except Exception as e:  # noqa: BLE001
            logger.warning("Roster invite failed for client %s: %s", it["client_id"], e)
        await db.roster_imports.update_one(
            {"id": import_id}, {"$set": {"progress.invites_sent": sent, "updated_at": _now().isoformat()}}
        )
        await asyncio.sleep(INVITE_PACING_SECONDS)
    await db.roster_imports.update_one(
        {"id": import_id}, {"$set": {"invites_status": "done", "updated_at": _now().isoformat()}}
    )


async def _progress(import_id: str, **fields) -> None:
    await db.roster_imports.update_one(
        {"id": import_id},
        {"$set": {**{f"progress.{k}": v for k, v in fields.items()}, "updated_at": _now().isoformat()}},
    )


async def _run_import(
    import_id: str, actor: dict, partner: dict, up: dict, mapping: dict, send_invites: bool, ip: str
) -> None:
    """Background job: provision / rename row by row, reporting progress for the UI poller."""
    try:
        plan = await ri.reconcile(partner, ri.apply_mapping(up["headers"], up["rows"], mapping))
        sender_name = actor["label"] if actor["type"] == "manager" else partner["company_name"]
        trustee_display = (
            f"{actor['label']} ({partner['company_name']})"
            if actor["type"] == "manager"
            else f"{partner['company_name']} (set up by CarryOn)"
        )
        live_partner = dict(partner)
        results: list[dict] = []
        invites: list[dict] = []
        added = renamed = failed = 0
        total = len(plan["rows"])
        await _progress(import_id, total=total, done=0, added=0, renamed=0, failed=0)

        for i, row in enumerate(plan["rows"], start=1):
            out = {k: row[k] for k in ("row", "first_name", "last_name", "email", "action", "reason", "detail")}
            if row["action"] == "add":
                try:
                    client, _estate_id = await provision_client_portal(
                        live_partner,
                        row["first_name"],
                        row["last_name"],
                        row["email"],
                        trustee_display_name=trustee_display,
                        trustee_email="",
                        manager_id=actor["id"] if actor["type"] == "manager" else None,
                    )
                    live_partner["times_used"] = int(live_partner.get("times_used", 0) or 0) + 1
                    extra = {"roster_import_id": import_id}
                    if actor["type"] == "admin":
                        extra["created_by_admin_id"] = actor["id"]
                    await db.users.update_one({"id": client["id"]}, {"$set": extra})
                    added += 1
                    out["client_id"], out["result"] = client["id"], "added"
                    if send_invites:
                        token, _exp = await refresh_claim_token(client)
                        invites.append(
                            {
                                "client_id": client["id"],
                                "email": client["email"],
                                "subject": f"{partner['company_name']} has prepared your CarryOn portal",
                                "html": _claim_email_html(
                                    client_name=client.get("first_name") or client.get("name", ""),
                                    rep_name=sender_name,
                                    company=partner["company_name"],
                                    claim_url=_claim_url(token),
                                ),
                            }
                        )
                except HTTPException as e:
                    failed += 1
                    out["result"], out["detail"] = "failed", e.detail
            elif row["action"] == "update_name":
                r = await db.users.update_one(
                    {"id": row["client_id"], "account_status": "pending_claim"},
                    {
                        "$set": {
                            "first_name": row["first_name"],
                            "last_name": row["last_name"],
                            "name": f"{row['first_name']} {row['last_name']}".strip(),
                        }
                    },
                )
                renamed += int(r.modified_count > 0)
                out["result"] = "renamed" if r.modified_count else "skipped"
            else:
                out["result"] = "skipped"
            results.append(out)
            if i % 5 == 0 or i == total:
                await _progress(import_id, done=i, added=added, renamed=renamed, failed=failed)

        if invites:
            await db.users.update_many(
                {"id": {"$in": [i["client_id"] for i in invites]}},
                {"$set": {"invite_sent_at": _now().isoformat()}, "$inc": {"invite_count": 1}},
            )
        await ri.remember_mapping(partner["id"], up["headers"], mapping)
        summary = {
            **plan["summary"],
            "added": added,
            "renamed": renamed,
            "failed": failed,
            "invites_sent": len(invites),
        }
        await db.roster_imports.update_one(
            {"id": import_id},
            {
                "$set": {
                    "status": "done",
                    "summary": summary,
                    "invites_status": "sending" if invites else "none",
                    "progress.invites_total": len(invites),
                    "progress.invites_sent": 0,
                    # Only failures are kept (row number + reason, never an email) — the plan
                    # the partner reviewed before committing already showed every row.
                    "failed_rows": [
                        {"row": r["row"], "detail": r["detail"]} for r in results if r["result"] == "failed"
                    ],
                    "updated_at": _now().isoformat(),
                }
            },
        )
        await db.roster_uploads.delete_one({"id": up["id"]})
        await log_audit_event(
            actor_id=actor["id"],
            actor_email=actor["email"],
            actor_role="partner_manager" if actor["type"] == "manager" else "admin",
            action="roster_import_commit",
            category="partner",
            resource_type="b2b_partner",
            resource_id=partner["id"],
            details={
                "import_id": import_id,
                "added": added,
                "renamed": renamed,
                "invites": len(invites),
                "rows": total,
            },
            ip_address=ip,
            severity="info",
        )
        if invites:
            await _send_invites_paced(import_id, invites)
    except Exception as e:  # noqa: BLE001
        logger.exception("Roster import %s failed", import_id)
        await db.roster_imports.update_one(
            {"id": import_id},
            {"$set": {"status": "failed", "error": str(e)[:300], "updated_at": _now().isoformat()}},
        )
        await db.roster_uploads.update_one({"id": up["id"]}, {"$set": {"status": "ready"}})


async def _commit(actor: dict, data: CommitRequest, background_tasks: BackgroundTasks, request: Request) -> dict:
    up = await _load_upload(data.upload_id, actor)
    mapping = up["mapping"]
    if data.mapping:
        mapping = {f: (data.mapping.get(f) if data.mapping.get(f) in up["headers"] else None) for f in ri.FIELDS}
    if not ri.mapping_complete(mapping):
        raise HTTPException(status_code=400, detail="Column mapping is incomplete.")

    # Consume the upload atomically — a double-click cannot import twice.
    claimed = await db.roster_uploads.find_one_and_update(
        {"id": up["id"], "status": {"$ne": "committed"}},
        {"$set": {"status": "committed"}},
        projection={"_id": 0, "id": 1},
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="This file is already being imported.")

    partner = await _fresh_partner(up["partner_id"])
    import_id = str(uuid.uuid4())
    await db.roster_imports.insert_one(
        {
            "id": import_id,
            "partner_id": partner["id"],
            "actor_type": actor["type"],
            "actor_label": actor["label"],
            "filename": up.get("filename", ""),
            "send_invites": bool(data.send_invites),
            "status": "running",
            "progress": {"total": len(up["rows"]), "done": 0, "added": 0, "renamed": 0, "failed": 0},
            "summary": None,
            "created_at": _now().isoformat(),
            "updated_at": _now().isoformat(),
        }
    )
    background_tasks.add_task(
        _run_import, import_id, actor, partner, up, mapping, bool(data.send_invites), get_client_ip(request)
    )
    return {"import_id": import_id, "status": "running", "total": len(up["rows"])}


async def _job(partner_id: str, import_id: str) -> dict:
    job = await db.roster_imports.find_one({"id": import_id, "partner_id": partner_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Import not found.")
    return job


async def _history(partner_id: str) -> dict:
    items = await db.roster_imports.find({"partner_id": partner_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"imports": items}


# ─── Partner Portal (manager token) ──────────────────────────────────────


@router.post("/manager/roster/analyze")
async def manager_roster_analyze(file: UploadFile = File(...), manager: dict = Depends(get_current_manager)):
    return await _analyze(_actor_from_manager(manager), file)


@router.post("/manager/roster/remap")
async def manager_roster_remap(data: RemapRequest, manager: dict = Depends(get_current_manager)):
    return await _remap(_actor_from_manager(manager), data)


@router.post("/manager/roster/commit")
async def manager_roster_commit(
    data: CommitRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    manager: dict = Depends(get_current_manager),
):
    return await _commit(_actor_from_manager(manager), data, background_tasks, request)


@router.get("/manager/roster/imports")
async def manager_roster_imports(manager: dict = Depends(get_current_manager)):
    return await _history(manager["_partner"]["id"])


@router.get("/manager/roster/imports/{import_id}")
async def manager_roster_job(import_id: str, manager: dict = Depends(get_current_manager)):
    return await _job(manager["_partner"]["id"], import_id)


# ─── Founder Admin (per partner) ─────────────────────────────────────────


@router.post("/admin/partners/{partner_id}/roster/analyze")
async def admin_roster_analyze(
    partner_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)
):
    return await _analyze(await _actor_from_admin(partner_id, current_user), file)


@router.post("/admin/partners/{partner_id}/roster/remap")
async def admin_roster_remap(partner_id: str, data: RemapRequest, current_user: dict = Depends(get_current_user)):
    return await _remap(await _actor_from_admin(partner_id, current_user), data)


@router.post("/admin/partners/{partner_id}/roster/commit")
async def admin_roster_commit(
    partner_id: str,
    data: CommitRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    return await _commit(await _actor_from_admin(partner_id, current_user), data, background_tasks, request)


@router.get("/admin/partners/{partner_id}/roster/imports")
async def admin_roster_imports(partner_id: str, current_user: dict = Depends(get_current_user)):
    await _actor_from_admin(partner_id, current_user)
    return await _history(partner_id)


@router.get("/admin/partners/{partner_id}/roster/imports/{import_id}")
async def admin_roster_job(partner_id: str, import_id: str, current_user: dict = Depends(get_current_user)):
    await _actor_from_admin(partner_id, current_user)
    return await _job(partner_id, import_id)
