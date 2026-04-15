"""CarryOn™ — Universal Download Proxy

Provides iOS-compatible file downloads across all platform features.
Two endpoints:
  POST /downloads/prepare — Creates a short-lived download token (requires JWT auth)
  GET  /downloads/{token} — Serves the file with Content-Disposition: attachment (no auth)

This enables window.location.href = url on iOS PWA to trigger the native download tile.
"""

import subprocess
import tempfile

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from config import db, logger
from services.download_tokens import consume_token, create_token
from utils import get_current_user

router = APIRouter()


class PrepareRequest(BaseModel):
    action: str
    params: dict = {}
    filename: str = "download"


@router.post("/downloads/prepare")
async def prepare_download(data: PrepareRequest, current_user: dict = Depends(get_current_user)):
    """Create a short-lived download token for iOS-native file downloads."""
    valid_actions = {
        "message_pdf",
        "message_video",
        "message_voice",
        "document",
        "ega_checklist",
        "ega_todo",
        "ega_iac_report",
        "ega_transcript",
        "ega_plan",
        "beneficiary_iac",
        "ect_file",
        "ccp_plan",
        "family_readiness_report",
        "emergency_card",
    }
    if data.action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid download action: {data.action}")
    token = await create_token(current_user, data.action, data.params, data.filename)
    return {"token": token}


@router.get("/downloads/ffmpeg-check")
async def ffmpeg_check():
    """Diagnostic: verify FFmpeg is available and has libx264 encoder."""
    import os
    import shutil

    results = {}
    sys_ffmpeg = shutil.which("ffmpeg")
    results["system_ffmpeg"] = sys_ffmpeg or "NOT FOUND"
    try:
        import imageio_ffmpeg

        bundled = imageio_ffmpeg.get_ffmpeg_exe()
        results["bundled_ffmpeg"] = bundled
    except ImportError:
        results["bundled_ffmpeg"] = "imageio_ffmpeg NOT INSTALLED"

    ffmpeg_exe = results.get("bundled_ffmpeg") if "NOT" not in str(results.get("bundled_ffmpeg", "NOT")) else sys_ffmpeg
    if ffmpeg_exe:
        try:
            inp = tempfile.mktemp(suffix=".webm")
            out = tempfile.mktemp(suffix=".mp4")
            subprocess.run(
                [ffmpeg_exe, "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.5", "-c:v", "libvpx", inp],
                capture_output=True,
                timeout=15,
            )
            proc = subprocess.run(
                [ffmpeg_exe, "-y", "-i", inp, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", out],
                capture_output=True,
                timeout=15,
            )
            results["conversion_test"] = "PASS" if proc.returncode == 0 else f"FAIL: {proc.stderr.decode()[:300]}"
            if proc.returncode == 0:
                results["output_size"] = os.path.getsize(out)
            for p in (inp, out):
                try:
                    os.unlink(p)
                except OSError:
                    pass
        except Exception as e:
            results["conversion_test"] = f"ERROR: {e}"
    else:
        results["conversion_test"] = "SKIPPED (no ffmpeg)"
    return results


@router.get("/downloads/{token}")
async def execute_download(token: str):
    """Serve a file download using a one-time token. No JWT required."""
    data = await consume_token(token)
    if not data:
        raise HTTPException(status_code=401, detail="Invalid or expired download link")

    user = data["user"]
    action = data["action"]
    params = data["params"]
    filename = data["filename"]

    try:
        if action == "message_pdf":
            return await _handle_message_pdf(user, params, filename)
        elif action == "message_video":
            return await _handle_message_video(user, params, filename)
        elif action == "message_voice":
            return await _handle_message_voice(user, params, filename)
        elif action == "document":
            return await _handle_document(user, params, filename)
        elif action == "ega_checklist":
            return await _handle_ega_checklist(user, filename)
        elif action == "ega_todo":
            return await _handle_ega_todo(user, params, filename)
        elif action == "ega_iac_report":
            return await _handle_ega_iac_report(user, params, filename)
        elif action == "ega_transcript":
            return await _handle_ega_transcript(user, params, filename)
        elif action == "ega_plan":
            return await _handle_ega_plan(user, params, filename)
        elif action == "beneficiary_iac":
            return await _handle_beneficiary_iac(user, filename)
        elif action == "ect_file":
            return await _handle_ect_file(user, params, filename)
        elif action == "ccp_plan":
            return await _handle_ccp_plan(user, params, filename)
        elif action == "family_readiness_report":
            return await _handle_family_readiness_report(user, params, filename)
        elif action == "emergency_card":
            return await _handle_emergency_card(user, params, filename)
        else:
            raise HTTPException(status_code=400, detail="Unknown action")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download proxy error ({action}): {e}")
        raise HTTPException(status_code=500, detail="Download failed")


# ─── Handlers ─────────────────────────────────────────────


async def _handle_message_pdf(user: dict, params: dict, filename: str) -> Response:
    from routes.messages import download_message

    return await download_message(params["message_id"], user)


async def _handle_message_video(user: dict, params: dict, filename: str) -> Response:
    from routes.messages import get_message_video

    logger.info(f"Download proxy: video request video_id={params.get('video_id')}, user={user.get('id')}")
    response = await get_message_video(params["video_id"], user)

    content = response.body
    media_type = response.media_type or "video/webm"
    logger.info(f"Download proxy: video fetched, media_type={media_type}, size={len(content)} bytes")

    # Convert WebM → MP4 for iOS compatibility
    if "webm" in media_type:
        try:
            logger.info("Download proxy: starting WebM→MP4 conversion via ffmpeg")
            content, media_type = _convert_webm_to_mp4(content)
            filename = filename.rsplit(".", 1)[0] + ".mp4"
            logger.info(f"Download proxy: conversion OK, new size={len(content)} bytes")
        except Exception as e:
            logger.error(f"Download proxy: WebM→MP4 conversion FAILED: {e}")
    else:
        logger.info("Download proxy: video is already MP4, no conversion needed")

    safe_filename = _sanitize_filename(filename)
    ext = "mp4" if "mp4" in media_type else "webm"
    if not safe_filename.endswith(f".{ext}"):
        safe_filename = (
            safe_filename.rsplit(".", 1)[0] + f".{ext}" if "." in safe_filename else f"{safe_filename}.{ext}"
        )

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"',
            "Cache-Control": "no-store",
        },
    )


async def _handle_message_voice(user: dict, params: dict, filename: str) -> Response:
    from routes.messages import get_message_voice

    response = await get_message_voice(params["voice_id"], user)
    safe_filename = _sanitize_filename(filename)
    if not safe_filename.endswith(".webm"):
        safe_filename = safe_filename.rsplit(".", 1)[0] + ".webm" if "." in safe_filename else f"{safe_filename}.webm"
    return Response(
        content=response.body,
        media_type=response.media_type or "audio/webm",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename}"',
            "Cache-Control": "no-store",
        },
    )


async def _handle_document(user: dict, params: dict, filename: str) -> Response:
    from routes.documents import download_document

    return await download_document(
        params["document_id"],
        params.get("password"),
        params.get("backup_code"),
        user,
    )


async def _handle_ega_checklist(user: dict, filename: str) -> Response:
    from routes.guardian import export_checklist_pdf

    return await export_checklist_pdf(user)


async def _handle_ega_todo(user: dict, params: dict, filename: str) -> Response:
    from routes.guardian import export_todo_pdf, TodoExportRequest

    data = TodoExportRequest(content=params.get("content", ""))
    return await export_todo_pdf(data, user)


async def _handle_ega_iac_report(user: dict, params: dict, filename: str) -> Response:
    from routes.guardian import export_iac_report_pdf, IacReportRequest

    data = IacReportRequest(content=params.get("content", ""))
    return await export_iac_report_pdf(data, user)


async def _handle_ega_transcript(user: dict, params: dict, filename: str) -> Response:
    from routes.guardian import export_conversation_pdf

    return await export_conversation_pdf({"session_id": params.get("session_id", "")}, user)


async def _handle_ega_plan(user: dict, params: dict, filename: str) -> Response:
    from routes.guardian import export_plan_of_action_pdf

    return await export_plan_of_action_pdf({"session_id": params.get("session_id", "")}, user)


async def _handle_beneficiary_iac(user: dict, filename: str) -> Response:
    from routes.guardian import beneficiary_export_checklist_pdf

    return await beneficiary_export_checklist_pdf(user)


async def _handle_ect_file(user: dict, params: dict, filename: str) -> Response:
    from routes.estate_chat import serve_chat_file

    response = await serve_chat_file(params["file_id"], user)
    safe_filename = _sanitize_filename(filename)
    # Ensure attachment disposition
    headers = dict(response.headers) if hasattr(response, "headers") else {}
    headers["Content-Disposition"] = f'attachment; filename="{safe_filename}"'
    headers["Cache-Control"] = "no-store"
    return Response(
        content=response.body,
        media_type=response.media_type,
        headers=headers,
    )


async def _handle_ccp_plan(user: dict, params: dict, filename: str) -> Response:
    """Generate a printable PDF of a CCP emergency plan."""
    from fpdf import FPDF

    plan_id = params.get("plan_id")
    if not plan_id:
        raise HTTPException(status_code=400, detail="plan_id required")

    plan = await db.emergency_plans.find_one({"id": plan_id, "deleted_at": None}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Verify estate membership
    estate = await db.estates.find_one({"id": plan["estate_id"]}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate["owner_id"] == user["id"]
    is_ben = user["id"] in estate.get("beneficiaries", [])
    is_admin = user.get("role") in ("admin", "operator")
    if not (is_owner or is_ben or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    PLAN_TYPE_LABELS = {
        "natural_disaster": "Natural Disaster",
        "national_emergency": "National Emergency",
        "medical_emergency": "Medical Emergency",
        "infrastructure_failure": "Infrastructure Failure",
        "custom": "Custom Plan",
    }

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    def safe(text):
        if not text:
            return ""
        return text.encode("latin-1", errors="replace").decode("latin-1")

    # Header
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(212, 175, 55)
    pdf.cell(0, 14, "CarryOn Contingency Protocol", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 7, f"Estate: {safe(estate.get('name', 'My Estate'))}", new_x="LMARGIN", new_y="NEXT")

    from datetime import datetime as dt_cls

    now_str = dt_cls.now().strftime("%B %d, %Y")
    pdf.cell(0, 7, f"Generated: {now_str}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Plan title and type
    pdf.set_draw_color(212, 175, 55)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 12, safe(plan.get("name", "Emergency Plan")), new_x="LMARGIN", new_y="NEXT")

    plan_type_label = PLAN_TYPE_LABELS.get(plan.get("plan_type", "custom"), plan.get("plan_type", "Custom"))
    pdf.set_font("Helvetica", "I", 11)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 7, f"Type: {plan_type_label}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Rendezvous Points
    rps = plan.get("rendezvous_points", [])
    if rps:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(59, 123, 247)
        pdf.cell(0, 10, "RENDEZVOUS POINTS", new_x="LMARGIN", new_y="NEXT")
        for i, rp in enumerate(rps, 1):
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(0, 7, f"  {i}. {safe(rp.get('name', 'Point'))}", new_x="LMARGIN", new_y="NEXT")
            if rp.get("address"):
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(80, 80, 80)
                pdf.cell(0, 6, f"     Address: {safe(rp['address'])}", new_x="LMARGIN", new_y="NEXT")
            if rp.get("notes"):
                pdf.set_font("Helvetica", "I", 10)
                pdf.set_text_color(120, 120, 120)
                pdf.cell(0, 6, f"     Note: {safe(rp['notes'])}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    # Communication Plan
    comm = plan.get("communication_plan", "").strip()
    if comm:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(34, 201, 147)
        pdf.cell(0, 10, "COMMUNICATION PLAN", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(40, 40, 40)
        pdf.multi_cell(0, 6, safe(comm))
        pdf.ln(4)

    # Resource Locations
    rls = plan.get("resource_locations", [])
    if rls:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(245, 166, 35)
        pdf.cell(0, 10, "RESOURCE LOCATIONS", new_x="LMARGIN", new_y="NEXT")
        for i, rl in enumerate(rls, 1):
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(0, 7, f"  {i}. {safe(rl.get('name', 'Resource'))}", new_x="LMARGIN", new_y="NEXT")
            if rl.get("location"):
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(80, 80, 80)
                pdf.cell(0, 6, f"     Location: {safe(rl['location'])}", new_x="LMARGIN", new_y="NEXT")
            if rl.get("notes"):
                pdf.set_font("Helvetica", "I", 10)
                pdf.set_text_color(120, 120, 120)
                pdf.cell(0, 6, f"     Note: {safe(rl['notes'])}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    # Instructions
    instr = plan.get("instructions", "").strip()
    if instr:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(183, 148, 246)
        pdf.cell(0, 10, "INSTRUCTIONS", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(40, 40, 40)
        pdf.multi_cell(0, 6, safe(instr))
        pdf.ln(4)

    # Drill Schedule
    ds = plan.get("drill_schedule")
    if ds and ds.get("enabled"):
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(59, 123, 247)
        pdf.cell(0, 10, "DRILL SCHEDULE", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(40, 40, 40)
        freq = ds.get("frequency", "").replace("_", " ").title()
        label = ds.get("label", "")
        pdf.cell(0, 7, f"  Frequency: {freq} - {safe(label)}", new_x="LMARGIN", new_y="NEXT")
        if ds.get("next_drill_date"):
            try:
                from datetime import datetime as dt_cls2

                nd = dt_cls2.fromisoformat(ds["next_drill_date"].replace("Z", "+00:00"))
                pdf.cell(0, 7, f"  Next drill: {nd.strftime('%B %Y')}", new_x="LMARGIN", new_y="NEXT")
            except (ValueError, AttributeError):
                pass
        pdf.ln(4)

    # Footer disclaimer
    pdf.ln(8)
    pdf.set_draw_color(200, 200, 200)
    pdf.set_line_width(0.3)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(150, 150, 150)
    pdf.multi_cell(
        0,
        5,
        "This document was generated by CarryOn. Keep printed copies in accessible locations "
        "known to all family members. Review and update this plan regularly.",
    )

    pdf_bytes = bytes(pdf.output())
    safe_plan_name = "".join(c for c in plan.get("name", "plan") if c.isalnum() or c in " _-")[:40].strip() or "plan"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="CCP_{safe_plan_name}.pdf"'},
    )


async def _handle_family_readiness_report(user: dict, params: dict, filename: str) -> Response:
    """Generate a comprehensive Family Readiness Report PDF."""
    from fpdf import FPDF
    from datetime import datetime as dt_cls
    from services.readiness import calculate_estate_readiness

    estate_id = params.get("estate_id")
    if not estate_id:
        raise HTTPException(status_code=400, detail="estate_id required")

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate["owner_id"] == user["id"]
    is_admin = user.get("role") in ("admin", "operator")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only the estate owner can generate this report")

    owner = await db.users.find_one({"id": estate["owner_id"]}, {"_id": 0, "id": 1, "name": 1, "email": 1})

    def safe(text):
        if not text:
            return ""
        return text.encode("latin-1", errors="replace").decode("latin-1")

    # Gather data
    plans = await db.emergency_plans.find({"estate_id": estate_id, "deleted_at": None}, {"_id": 0}).to_list(50)
    activations = (
        await db.emergency_activations.find(
            {"estate_id": estate_id, "is_drill": True, "status": "resolved"},
            {"_id": 0},
        )
        .sort("activated_at", -1)
        .to_list(50)
    )
    readiness_data = await calculate_estate_readiness(estate_id)
    readiness_score = readiness_data.get("overall", 0) if isinstance(readiness_data, dict) else readiness_data

    PLAN_TYPE_LABELS = {
        "natural_disaster": "Natural Disaster",
        "national_emergency": "National Emergency",
        "medical_emergency": "Medical Emergency",
        "infrastructure_failure": "Infrastructure Failure",
        "custom": "Custom Plan",
    }

    # Debrief stats
    debriefed = [a for a in activations if a.get("debrief")]
    avg_rating = round(sum(a["debrief"]["rating"] for a in debriefed) / len(debriefed), 1) if debriefed else 0

    now_str = dt_cls.now().strftime("%B %d, %Y")

    # Build PDF
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # ── HEADER ──
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(212, 175, 55)
    pdf.cell(0, 14, "CarryOn Family Readiness Report", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(
        0,
        6,
        safe(f"Estate: {estate.get('name', 'My Estate')}  |  Owner: {owner.get('name', '') if owner else ''}"),
        new_x="LMARGIN",
        new_y="NEXT",
        align="C",
    )
    pdf.cell(0, 6, f"Generated: {now_str}", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(6)

    pdf.set_draw_color(212, 175, 55)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(6)

    # ── ESTATE READINESS SCORE ──
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 10, "ESTATE READINESS", new_x="LMARGIN", new_y="NEXT")

    score_val = readiness_score if isinstance(readiness_score, (int, float)) else 0
    if score_val >= 75:
        r, g, b = 34, 201, 147
    elif score_val >= 50:
        r, g, b = 212, 175, 55
    else:
        r, g, b = 240, 82, 82

    pdf.set_font("Helvetica", "B", 36)
    pdf.set_text_color(r, g, b)
    pdf.cell(40, 20, f"{int(score_val)}%")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 20, "overall readiness score", new_x="LMARGIN", new_y="NEXT")

    if isinstance(readiness_data, dict):
        pillars = []
        for key, label in [
            ("documents", "Documents"),
            ("messages", "Messages"),
            ("checklists", "Checklists"),
            ("financials", "Financials"),
        ]:
            val = readiness_data.get(key, 0)
            if isinstance(val, dict):
                val = val.get("score", 0)
            pillars.append((label, int(val)))
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(60, 60, 60)
        for lbl, pct in pillars:
            pdf.cell(47, 7, f"  {lbl}: {pct}%")
        pdf.ln(10)
    pdf.ln(4)

    # ── EMERGENCY PLAN COVERAGE ──
    pdf.set_draw_color(212, 175, 55)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 10, "EMERGENCY PLAN COVERAGE", new_x="LMARGIN", new_y="NEXT")

    if not plans:
        pdf.set_font("Helvetica", "I", 11)
        pdf.set_text_color(150, 150, 150)
        pdf.cell(0, 8, "No emergency plans created yet.", new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(60, 60, 60)
        pdf.cell(0, 8, f"{len(plans)} plan(s) created", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        for p in plans:
            ptype = PLAN_TYPE_LABELS.get(p.get("plan_type", ""), p.get("plan_type", ""))
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(0, 7, safe(f"  {p.get('name', 'Unnamed Plan')}"), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(80, 80, 80)
            pdf.cell(0, 6, f"    Type: {ptype}", new_x="LMARGIN", new_y="NEXT")

            rps = p.get("rendezvous_points", [])
            rls = p.get("resource_locations", [])
            has_comm = bool(p.get("communication_plan", "").strip())
            has_instr = bool(p.get("instructions", "").strip())
            summary_parts = []
            if rps:
                summary_parts.append(f"{len(rps)} meeting point(s)")
            if has_comm:
                summary_parts.append("comm plan")
            if rls:
                summary_parts.append(f"{len(rls)} resource loc(s)")
            if has_instr:
                summary_parts.append("instructions")
            if summary_parts:
                pdf.cell(0, 6, f"    Includes: {', '.join(summary_parts)}", new_x="LMARGIN", new_y="NEXT")

            ds = p.get("drill_schedule")
            if ds:
                status = "Active" if ds.get("enabled") else "Disabled"
                pdf.set_font("Helvetica", "I", 10)
                pdf.set_text_color(59, 123, 247)
                pdf.cell(
                    0, 6, f"    Drill reminders: {status} ({safe(ds.get('label', ''))})", new_x="LMARGIN", new_y="NEXT"
                )
            pdf.ln(2)

    pdf.ln(4)

    # ── DRILL PERFORMANCE HISTORY ──
    pdf.set_draw_color(212, 175, 55)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 10, "DRILL PERFORMANCE", new_x="LMARGIN", new_y="NEXT")

    if not activations:
        pdf.set_font("Helvetica", "I", 11)
        pdf.set_text_color(150, 150, 150)
        pdf.cell(0, 8, "No drills have been conducted yet.", new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(60, 60, 60)
        pdf.cell(
            0, 8, f"{len(activations)} drill(s) completed  |  {len(debriefed)} reviewed", new_x="LMARGIN", new_y="NEXT"
        )
        if debriefed:
            stars = "*" * int(round(avg_rating))
            pdf.set_font("Helvetica", "B", 12)
            pdf.set_text_color(212, 175, 55)
            pdf.cell(0, 8, f"Average Rating: {avg_rating}/5  {stars}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        # List recent drills
        for a in activations[:10]:
            debrief = a.get("debrief")
            date_str = ""
            try:
                dt = dt_cls.fromisoformat(a.get("activated_at", "").replace("Z", "+00:00"))
                date_str = dt.strftime("%b %d, %Y")
            except (ValueError, AttributeError):
                date_str = "Unknown date"

            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(15, 23, 42)
            rating_str = f" ({debrief['rating']}/5)" if debrief else ""
            pdf.cell(
                0, 7, safe(f"  {date_str} - {a.get('plan_name', 'Drill')}{rating_str}"), new_x="LMARGIN", new_y="NEXT"
            )

            if debrief:
                if debrief.get("went_well"):
                    pdf.set_font("Helvetica", "", 9)
                    pdf.set_text_color(34, 201, 147)
                    pdf.cell(0, 5, safe(f"    + {debrief['went_well'][:80]}"), new_x="LMARGIN", new_y="NEXT")
                if debrief.get("to_improve"):
                    pdf.set_font("Helvetica", "", 9)
                    pdf.set_text_color(245, 166, 35)
                    pdf.cell(0, 5, safe(f"    > {debrief['to_improve'][:80]}"), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)

    # ── FOOTER ──
    pdf.ln(8)
    pdf.set_draw_color(200, 200, 200)
    pdf.set_line_width(0.3)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(212, 175, 55)
    pdf.cell(0, 6, "Keep this report in your go-bag.", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(150, 150, 150)
    pdf.multi_cell(
        0,
        5,
        "Generated by CarryOn. Review plans regularly and run practice drills to keep your family prepared. "
        "Every American Family. Ready.",
        align="C",
    )

    pdf_bytes = bytes(pdf.output())
    estate_name = "".join(c for c in estate.get("name", "Family") if c.isalnum() or c in " _-")[:30].strip() or "Family"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="CarryOn_Readiness_{estate_name}.pdf"'},
    )


async def _handle_emergency_card(user: dict, params: dict, filename: str) -> Response:
    """Generate a wallet-sized Emergency Contact Card PDF with QR code."""
    import tempfile

    import qrcode
    from fpdf import FPDF

    plan_id = params.get("plan_id")
    if not plan_id:
        raise HTTPException(status_code=400, detail="plan_id required")

    plan = await db.emergency_plans.find_one({"id": plan_id, "deleted_at": None}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    estate = await db.estates.find_one({"id": plan["estate_id"]}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate["owner_id"] == user["id"]
    is_ben = user["id"] in estate.get("beneficiaries", [])
    is_admin = user.get("role") in ("admin", "operator")
    if not (is_owner or is_ben or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    def safe(text):
        if not text:
            return ""
        return text.encode("latin-1", errors="replace").decode("latin-1")

    # Build the share URL for the QR code
    share_token = plan.get("share_token")
    app_url = "https://app.carryon.us"
    if share_token:
        qr_url = f"{app_url}/shared/plan/{share_token}"
    else:
        # Auto-generate share token if none exists
        from uuid import uuid4 as _uuid4

        share_token = str(_uuid4())[:12]
        from datetime import datetime as _dt, timezone as _tz

        await db.emergency_plans.update_one(
            {"id": plan_id},
            {"$set": {"share_token": share_token, "shared_at": _dt.now(_tz.utc).isoformat()}},
        )
        qr_url = f"{app_url}/shared/plan/{share_token}"

    # Generate QR code image
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=1)
    qr.add_data(qr_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white")
    qr_path = tempfile.mktemp(suffix=".png")
    qr_img.save(qr_path)

    # Extract key info
    plan_name = plan.get("name", "Emergency Plan")
    scenario = plan.get("scenario", "")
    rps = plan.get("rendezvous_points", [])
    primary_rp = rps[0] if rps else None
    secondary_rp = rps[1] if len(rps) > 1 else None
    comm = (plan.get("communication_plan", "") or "").strip()
    steps = plan.get("steps", [])
    household = plan.get("household_considerations", [])
    estate_name = estate.get("name", "")

    # Build card PDF — 2 cards per page (3.5" x 2" each = 89mm x 51mm)
    # Using landscape A4 and placing two cards with cut lines
    CARD_W = 89  # mm
    CARD_H = 56  # mm (slightly taller for more content)

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    # Draw 4 cards on a page (2 columns x 2 rows)
    positions = [
        (15, 15),
        (15 + CARD_W + 10, 15),
        (15, 15 + CARD_H + 8),
        (15 + CARD_W + 10, 15 + CARD_H + 8),
    ]

    for ox, oy in positions:
        # Card border
        pdf.set_draw_color(180, 180, 180)
        pdf.set_line_width(0.3)
        pdf.rect(ox, oy, CARD_W, CARD_H)

        # Dark background
        pdf.set_fill_color(15, 22, 41)
        pdf.rect(ox + 0.5, oy + 0.5, CARD_W - 1, CARD_H - 1, "F")

        # Left side — text content
        text_x = ox + 3
        text_w = CARD_W - 28  # leave room for QR on right
        cur_y = oy + 2.5

        # Title + scenario
        pdf.set_font("Helvetica", "B", 6)
        pdf.set_text_color(212, 175, 55)
        pdf.set_xy(text_x, cur_y)
        title_label = "EMERGENCY PLAN"
        if scenario:
            title_label += f" - {safe(scenario).upper()}"
        pdf.cell(text_w, 3, title_label[:40], new_x="LMARGIN", new_y="NEXT")
        cur_y += 3.5

        # Plan name (wrapping)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(241, 243, 248)
        pdf.set_xy(text_x, cur_y)
        pdf.multi_cell(text_w, 3, safe(plan_name)[:60], new_x="LMARGIN", new_y="NEXT")
        cur_y = pdf.get_y() + 0.5

        # Primary meeting point
        if primary_rp and cur_y < oy + CARD_H - 16:
            pdf.set_font("Helvetica", "B", 5)
            pdf.set_text_color(59, 123, 247)
            pdf.set_xy(text_x, cur_y)
            pdf.cell(text_w, 2.5, "PRIMARY MEETING POINT", new_x="LMARGIN", new_y="NEXT")
            cur_y += 2.5
            pdf.set_font("Helvetica", "", 5.5)
            pdf.set_text_color(208, 222, 233)
            pdf.set_xy(text_x, cur_y)
            rp_text = safe(primary_rp.get("name", ""))
            if primary_rp.get("address"):
                rp_text += " - " + safe(primary_rp["address"])
            pdf.multi_cell(text_w, 2.5, rp_text[:80], new_x="LMARGIN", new_y="NEXT")
            cur_y = pdf.get_y() + 0.5

        # Secondary meeting point
        if secondary_rp and cur_y < oy + CARD_H - 14:
            pdf.set_font("Helvetica", "B", 5)
            pdf.set_text_color(59, 123, 247)
            pdf.set_xy(text_x, cur_y)
            pdf.cell(text_w, 2.5, "BACKUP MEETING POINT", new_x="LMARGIN", new_y="NEXT")
            cur_y += 2.5
            pdf.set_font("Helvetica", "", 5.5)
            pdf.set_text_color(208, 222, 233)
            pdf.set_xy(text_x, cur_y)
            rp2_text = safe(secondary_rp.get("name", ""))
            if secondary_rp.get("address"):
                rp2_text += " - " + safe(secondary_rp["address"])
            pdf.multi_cell(text_w, 2.5, rp2_text[:80], new_x="LMARGIN", new_y="NEXT")
            cur_y = pdf.get_y() + 0.5

        # Communication plan (wrapped)
        if comm and cur_y < oy + CARD_H - 12:
            pdf.set_font("Helvetica", "B", 5)
            pdf.set_text_color(34, 201, 147)
            pdf.set_xy(text_x, cur_y)
            pdf.cell(text_w, 2.5, "COMMUNICATION PLAN", new_x="LMARGIN", new_y="NEXT")
            cur_y += 2.5
            pdf.set_font("Helvetica", "", 5)
            pdf.set_text_color(208, 222, 233)
            pdf.set_xy(text_x, cur_y)
            comm_text = safe(" ".join(comm.split("\n")[:3]))[:120]
            pdf.multi_cell(text_w, 2.3, comm_text, new_x="LMARGIN", new_y="NEXT")
            cur_y = pdf.get_y() + 0.5

        # First 2 key steps
        if steps and cur_y < oy + CARD_H - 10:
            pdf.set_font("Helvetica", "B", 5)
            pdf.set_text_color(245, 158, 11)
            pdf.set_xy(text_x, cur_y)
            pdf.cell(text_w, 2.5, "KEY STEPS", new_x="LMARGIN", new_y="NEXT")
            cur_y += 2.5
            pdf.set_font("Helvetica", "", 5)
            pdf.set_text_color(208, 222, 233)
            for step in steps[:2]:
                if cur_y >= oy + CARD_H - 8:
                    break
                step_text = safe(step if isinstance(step, str) else step.get("description", step.get("title", "")))
                pdf.set_xy(text_x, cur_y)
                pdf.multi_cell(text_w, 2.3, ("- " + step_text)[:70], new_x="LMARGIN", new_y="NEXT")
                cur_y = pdf.get_y()

        # Estate name + CarryOn branding at bottom
        pdf.set_font("Helvetica", "I", 4.5)
        pdf.set_text_color(82, 92, 114)
        pdf.set_xy(text_x, oy + CARD_H - 6.5)
        pdf.cell(text_w, 2.5, safe(estate_name), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 5)
        pdf.set_text_color(212, 175, 55)
        pdf.set_xy(text_x, oy + CARD_H - 3.5)
        pdf.cell(text_w, 2.5, "CarryOn", new_x="LMARGIN", new_y="NEXT")

        # Right side — QR code
        qr_size = 22
        qr_x = ox + CARD_W - qr_size - 3
        qr_y = oy + 3
        pdf.image(qr_path, qr_x, qr_y, qr_size, qr_size)

        # "Scan for full plan" under QR
        pdf.set_font("Helvetica", "", 4.5)
        pdf.set_text_color(160, 170, 191)
        pdf.set_xy(qr_x - 2, qr_y + qr_size + 1)
        pdf.cell(qr_size + 4, 2.5, "Scan for full plan", align="C", new_x="LMARGIN", new_y="NEXT")

        # Household icons under QR if space
        if household and qr_y + qr_size + 6 < oy + CARD_H - 8:
            pdf.set_font("Helvetica", "", 4)
            pdf.set_text_color(160, 170, 191)
            hh_items = [safe(h) if isinstance(h, str) else safe(h.get("type", "")) for h in household[:3]]
            if hh_items:
                pdf.set_xy(qr_x - 2, qr_y + qr_size + 5)
                pdf.cell(qr_size + 4, 2.5, ", ".join(hh_items)[:25], align="C", new_x="LMARGIN", new_y="NEXT")

    # Cut line instructions
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.set_xy(15, 15 + (CARD_H + 8) * 2 + 5)
    pdf.cell(0, 5, "Cut along the grey lines. Keep in wallets, backpacks, or tape to the fridge.")

    # Cleanup
    import os

    try:
        os.unlink(qr_path)
    except OSError:
        pass

    pdf_bytes = bytes(pdf.output())
    safe_name = "".join(c for c in plan_name if c.isalnum() or c in " _-")[:30].strip() or "plan"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="EmergencyCard_{safe_name}.pdf"'},
    )


# ─── Utilities ────────────────────────────────────────────


def _convert_webm_to_mp4(webm_bytes: bytes) -> tuple[bytes, str]:
    """Convert WebM video to MP4 (H.264) using bundled ffmpeg for iOS compatibility."""
    import os

    # Use imageio-ffmpeg's bundled binary (guaranteed to include libx264)
    try:
        import imageio_ffmpeg

        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        ffmpeg_exe = "ffmpeg"

    inp_path = tempfile.mktemp(suffix=".webm")
    out_path = tempfile.mktemp(suffix=".mp4")
    try:
        with open(inp_path, "wb") as f:
            f.write(webm_bytes)

        result = subprocess.run(
            [
                ffmpeg_exe,
                "-y",
                "-i",
                inp_path,
                "-c:v",
                "libx264",
                "-preset",
                "fast",
                "-crf",
                "23",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-movflags",
                "+faststart",
                out_path,
            ],
            capture_output=True,
            timeout=120,
        )
        if result.returncode != 0:
            logger.error(f"FFmpeg stderr: {result.stderr.decode()[:500]}")
            raise RuntimeError(f"ffmpeg exit {result.returncode}")

        with open(out_path, "rb") as f:
            mp4_data = f.read()
        if len(mp4_data) < 100:
            raise RuntimeError("FFmpeg produced empty output")
        logger.info(f"WebM->MP4 OK: {len(webm_bytes)}->{len(mp4_data)} bytes")
        return mp4_data, "video/mp4"
    finally:
        for p in (inp_path, out_path):
            try:
                os.unlink(p)
            except OSError:
                pass


def _sanitize_filename(name: str) -> str:
    """Remove unsafe characters from a filename."""
    safe = "".join(c for c in name if c.isalnum() or c in " _-.")
    return safe.strip() or "download"
