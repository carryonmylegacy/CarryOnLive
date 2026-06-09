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
from guards import require_admin
from services.download_tokens import consume_token, create_token
from services.environment import is_production
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
async def ffmpeg_check(current_user: dict = Depends(require_admin)):
    """Diagnostic: verify FFmpeg is available and has libx264 encoder.

    SOC2 (#7): admin-only, and fully DISABLED (404) in production — a video
    transcode probe must never be reachable on a live deployment.
    """
    if is_production():
        raise HTTPException(status_code=404, detail="Not found")
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
    is_admin = user.get("role") == "admin"
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
    pdf.cell(0, 14, "CarryOn Contingency Protocols", new_x="LMARGIN", new_y="NEXT")

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
    from routes.ccp_depth import compute_ccp_readiness

    estate_id = params.get("estate_id")
    if not estate_id:
        raise HTTPException(status_code=400, detail="estate_id required")

    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate["owner_id"] == user["id"]
    is_admin = user.get("role") == "admin"
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
    # Pull the CCP-specific readiness score from the SAME helper the
    # CCP landing-page ring uses, so the printed number on this PDF
    # and the ring the user just clicked are guaranteed to match.
    # Prior to Feb 2026 this called calculate_estate_readiness and
    # read a field name that didn't exist, flooring the printed
    # score to 0% even when the landing ring showed 40+.
    ccp_readiness = await compute_ccp_readiness(estate_id)
    readiness_score = ccp_readiness.get("score", 0)

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

    if isinstance(ccp_readiness, dict) and ccp_readiness.get("breakdown"):
        # Print the same 8 weighted factors the user sees when they
        # expand the readiness card on the CCP landing page, so the
        # PDF mirrors the on-screen breakdown exactly.
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(60, 60, 60)
        for factor in ccp_readiness["breakdown"]:
            earned = int(factor.get("earned", 0))
            points = int(factor.get("points", 0))
            label = safe(str(factor.get("label", "")))
            mark = "[x]" if earned > 0 else "[ ]"
            pdf.cell(0, 7, f"  {mark} {label}  -  {earned}/{points}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)
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
    """Generate a wallet-sized Emergency Card PDF — single front & back on one sheet.

    Layout: Two card halves printed side-by-side on one page.
    Cut along outer border, fold in half → wallet card with front and back.
    """
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
    is_admin = user.get("role") == "admin"
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

    # Extract plan data
    plan_name = plan.get("name", "Emergency Plan")
    rps = plan.get("rendezvous_points", [])
    comm = (plan.get("communication_plan", "") or "").strip()
    resources = plan.get("resource_locations", [])
    instructions = (plan.get("instructions", "") or "").strip()
    self_defense = (plan.get("self_defense_law_note", "") or "").strip()
    estate_name = estate.get("name", "")

    # Card dimensions — credit card sized (86mm x 54mm)
    CARD_W = 86
    CARD_H = 54
    TOTAL_W = CARD_W * 2  # front + back side by side

    # Center on letter page (216mm x 279mm)
    page_w = 216
    page_h = 279
    start_x = (page_w - TOTAL_W) / 2
    start_y = (page_h - CARD_H) / 2

    pdf = FPDF(orientation="P", unit="mm", format="Letter")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    # ═══════════ FRONT SIDE (left half) ═══════════
    fx = start_x
    fy = start_y

    # Dark background
    pdf.set_fill_color(15, 22, 41)
    pdf.rect(fx, fy, CARD_W, CARD_H, "F")

    # Cut border
    pdf.set_draw_color(180, 180, 180)
    pdf.set_line_width(0.2)
    pdf.rect(fx, fy, CARD_W, CARD_H)

    cur_y = fy + 2.5
    text_x = fx + 3
    text_w = CARD_W - 28  # leave room for QR

    # Gold header bar
    pdf.set_font("Helvetica", "B", 5)
    pdf.set_text_color(212, 175, 55)
    pdf.set_xy(text_x, cur_y)
    pdf.cell(text_w, 2.5, "CARRYON EMERGENCY CARD", new_x="LMARGIN", new_y="NEXT")
    cur_y += 3

    # Plan name
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(241, 243, 248)
    pdf.set_xy(text_x, cur_y)
    pdf.multi_cell(text_w, 3, safe(plan_name)[:60], new_x="LMARGIN", new_y="NEXT")
    cur_y = pdf.get_y() + 1

    # Meeting points (all of them)
    for i, rp in enumerate(rps):
        if cur_y >= fy + CARD_H - 8:
            break
        label = "PRIMARY MEETUP" if i == 0 else f"BACKUP MEETUP {i}" if i == 1 else f"MEETUP {i + 1}"
        pdf.set_font("Helvetica", "B", 4.5)
        pdf.set_text_color(59, 123, 247)
        pdf.set_xy(text_x, cur_y)
        pdf.cell(text_w, 2, label, new_x="LMARGIN", new_y="NEXT")
        cur_y += 2
        pdf.set_font("Helvetica", "", 5)
        pdf.set_text_color(208, 222, 233)
        pdf.set_xy(text_x, cur_y)
        rp_text = safe(rp.get("name", ""))
        if rp.get("address"):
            rp_text += " - " + safe(rp["address"])
        pdf.multi_cell(text_w, 2.2, rp_text[:100], new_x="LMARGIN", new_y="NEXT")
        cur_y = pdf.get_y() + 0.5

    # Communication plan (abbreviated)
    if comm and cur_y < fy + CARD_H - 8:
        pdf.set_font("Helvetica", "B", 4.5)
        pdf.set_text_color(34, 201, 147)
        pdf.set_xy(text_x, cur_y)
        pdf.cell(text_w, 2, "COMMUNICATION", new_x="LMARGIN", new_y="NEXT")
        cur_y += 2
        pdf.set_font("Helvetica", "", 4.5)
        pdf.set_text_color(208, 222, 233)
        pdf.set_xy(text_x, cur_y)
        comm_lines = [line.strip() for line in comm.split("\n") if line.strip()]
        comm_text = safe(" ".join(comm_lines))[:200]
        pdf.multi_cell(text_w, 2, comm_text, new_x="LMARGIN", new_y="NEXT")
        cur_y = pdf.get_y() + 0.3

    # Estate + branding at bottom
    pdf.set_font("Helvetica", "I", 4)
    pdf.set_text_color(82, 92, 114)
    pdf.set_xy(text_x, fy + CARD_H - 5.5)
    pdf.cell(text_w, 2, safe(estate_name), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 4.5)
    pdf.set_text_color(212, 175, 55)
    pdf.set_xy(text_x, fy + CARD_H - 3)
    pdf.cell(text_w, 2, "CarryOn  |  carryon.us", new_x="LMARGIN", new_y="NEXT")

    # QR code (right side of front)
    qr_size = 20
    qr_x = fx + CARD_W - qr_size - 3
    qr_y = fy + 3
    pdf.image(qr_path, qr_x, qr_y, qr_size, qr_size)
    pdf.set_font("Helvetica", "", 4)
    pdf.set_text_color(160, 170, 191)
    pdf.set_xy(qr_x - 1, qr_y + qr_size + 1)
    pdf.cell(qr_size + 2, 2, "Scan for full plan", align="C", new_x="LMARGIN", new_y="NEXT")

    # ═══════════ BACK SIDE (right half) ═══════════
    bx = start_x + CARD_W  # touches the front side's right edge
    by = start_y

    # Dark background
    pdf.set_fill_color(15, 22, 41)
    pdf.rect(bx, by, CARD_W, CARD_H, "F")

    # Cut border
    pdf.set_draw_color(180, 180, 180)
    pdf.set_line_width(0.2)
    pdf.rect(bx, by, CARD_W, CARD_H)

    cur_y = by + 2.5
    text_x = bx + 3
    text_w = CARD_W - 6

    # ─── Adaptive back-side layout ───
    # Self-defense law is MANDATORY when present (user demand) — reserve its space first.
    FOOTER_RESERVE = 3.5
    avail_top = cur_y
    avail_bottom = by + CARD_H - FOOTER_RESERVE
    avail_h = avail_bottom - avail_top

    instr_lines = [line.strip() for line in instructions.split("\n") if line.strip()] if instructions else []

    res_lines = []
    for rl in resources or []:
        rl_text = safe(rl.get("name", "")) + ": " + safe(rl.get("location", ""))
        if rl.get("notes"):
            rl_text += " (" + safe(rl["notes"]) + ")"
        res_lines.append(rl_text)

    def measure_lines(text, font_size, line_h, width):
        if not text:
            return 0
        pdf.set_font("Helvetica", "", font_size)
        try:
            lines = pdf.multi_cell(width, line_h, text, dry_run=True, output="LINES")
            return len(lines) if lines else 0
        except (TypeError, ValueError):
            char_per_line = max(1, int(width / (font_size * 0.18)))
            return max(1, -(-len(text) // char_per_line))

    def section_heights(font_size, include_resources):
        """Return (instr_h, sd_h, res_h) at this font — each block's total height incl. header."""
        line_h = font_size * 0.45 + 0.5
        header_h = 2.2
        gap = 0.8

        instr_h = 0.0
        if instr_lines:
            instr_h = header_h + 0.5
            for ln in instr_lines:
                instr_h += measure_lines(safe(ln), font_size, line_h, text_w) * line_h + 0.2

        sd_h = 0.0
        if self_defense:
            sd_h = gap + header_h + 0.4 + measure_lines(safe(self_defense), font_size, line_h, text_w) * line_h
            # +1 thin line for the audit footnote ("vYYYY-MM · ST · review annually")
            sd_h += font_size * 0.4 + 0.4

        res_h = 0.0
        if include_resources and res_lines:
            res_h = gap + header_h + 0.4
            for ln in res_lines:
                res_h += measure_lines(safe(ln), font_size, line_h, text_w) * line_h + 0.2

        return instr_h, sd_h, res_h

    # Choose largest font such that self-defense + supplies fit; instructions can truncate by whole lines.
    chosen_font = 3.6
    chosen_include_res = False
    # Pass 1: everything fits including supplies
    for fs in (4.6, 4.4, 4.2, 4.0, 3.8, 3.6):
        i_h, s_h, r_h = section_heights(fs, include_resources=True)
        if s_h + r_h <= avail_h and i_h + s_h + r_h <= avail_h:
            chosen_font = fs
            chosen_include_res = True
            break
    else:
        # Pass 2: drop supplies, keep instructions + self-defense
        for fs in (4.6, 4.4, 4.2, 4.0, 3.8, 3.6):
            i_h, s_h, _ = section_heights(fs, include_resources=False)
            if s_h <= avail_h and i_h + s_h <= avail_h:
                chosen_font = fs
                chosen_include_res = False
                break
        else:
            # Pass 3: self-defense MUST fit — let instructions truncate by whole lines
            for fs in (4.4, 4.2, 4.0, 3.8, 3.6):
                _, s_h, _ = section_heights(fs, include_resources=False)
                if s_h <= avail_h - 2.5:  # leave at least one instr header + 1 line
                    chosen_font = fs
                    chosen_include_res = False
                    break

    line_h = chosen_font * 0.45 + 0.5
    header_h = 2.2

    # Compute reservation for self-defense + supplies; whatever is left is for instructions.
    _, sd_reserve, res_reserve = section_heights(chosen_font, chosen_include_res)
    instr_budget_bottom = avail_bottom - sd_reserve - res_reserve

    # ─── Render instructions (capped at reserved bottom) ───
    if instr_lines and cur_y < instr_budget_bottom - line_h:
        pdf.set_font("Helvetica", "B", max(4.5, chosen_font))
        pdf.set_text_color(245, 166, 35)
        pdf.set_xy(text_x, cur_y)
        pdf.cell(text_w, header_h, "STEP-BY-STEP INSTRUCTIONS", new_x="LMARGIN", new_y="NEXT")
        cur_y += header_h + 0.5
        pdf.set_font("Helvetica", "", chosen_font)
        pdf.set_text_color(208, 222, 233)
        for ln in instr_lines:
            n_lines = measure_lines(safe(ln), chosen_font, line_h, text_w)
            needed = n_lines * line_h + 0.2
            if cur_y + needed > instr_budget_bottom:
                # Render as many whole wrapped lines as fit, then ellipsis
                try:
                    wrapped = pdf.multi_cell(text_w, line_h, safe(ln), dry_run=True, output="LINES") or []
                    max_lines = max(0, int((instr_budget_bottom - cur_y) / line_h))
                    if max_lines > 0:
                        partial = " ".join(wrapped[:max_lines]).rstrip() + "..."
                        pdf.set_xy(text_x, cur_y)
                        pdf.multi_cell(text_w, line_h, partial, new_x="LMARGIN", new_y="NEXT")
                        cur_y = pdf.get_y() + 0.2
                except (TypeError, ValueError):
                    pass
                break
            pdf.set_xy(text_x, cur_y)
            pdf.multi_cell(text_w, line_h, safe(ln), new_x="LMARGIN", new_y="NEXT")
            cur_y = pdf.get_y() + 0.2

    # ─── Render self-defense law (MANDATORY when present) ───
    if self_defense:
        cur_y = max(cur_y, avail_bottom - sd_reserve - res_reserve + 0.6)
        pdf.set_font("Helvetica", "B", max(4.5, chosen_font))
        pdf.set_text_color(212, 175, 55)
        pdf.set_xy(text_x, cur_y)
        pdf.cell(text_w, header_h, "STATE SELF-DEFENSE  -  NOT LEGAL ADVICE", new_x="LMARGIN", new_y="NEXT")
        cur_y += header_h + 0.4
        pdf.set_font("Helvetica", "", chosen_font)
        pdf.set_text_color(228, 218, 188)
        sd_text = safe(self_defense)
        sd_bottom = avail_bottom - res_reserve
        max_lines = max(1, int((sd_bottom - cur_y) / line_h))
        try:
            wrapped = pdf.multi_cell(text_w, line_h, sd_text, dry_run=True, output="LINES") or []
            if len(wrapped) > max_lines:
                sd_text = " ".join(wrapped[:max_lines]).rstrip()
                if not sd_text.endswith("."):
                    sd_text = sd_text[: max(0, len(sd_text) - 1)].rstrip() + "..."
        except (TypeError, ValueError):
            pass
        pdf.set_xy(text_x, cur_y)
        pdf.multi_cell(text_w, line_h, sd_text, new_x="LMARGIN", new_y="NEXT")
        cur_y = pdf.get_y()

        # Audit footnote: vYYYY-MM · ST · review annually
        import re as _re
        from datetime import datetime as _ft_dt, timezone as _ft_tz

        _US_STATES = {
            "AL",
            "AK",
            "AZ",
            "AR",
            "CA",
            "CO",
            "CT",
            "DE",
            "FL",
            "GA",
            "HI",
            "ID",
            "IL",
            "IN",
            "IA",
            "KS",
            "KY",
            "LA",
            "ME",
            "MD",
            "MA",
            "MI",
            "MN",
            "MS",
            "MO",
            "MT",
            "NE",
            "NV",
            "NH",
            "NJ",
            "NM",
            "NY",
            "NC",
            "ND",
            "OH",
            "OK",
            "OR",
            "PA",
            "RI",
            "SC",
            "SD",
            "TN",
            "TX",
            "UT",
            "VT",
            "VA",
            "WA",
            "WV",
            "WI",
            "WY",
            "DC",
        }
        _state_code = None
        for _rp in rps or []:
            _m = _re.search(r",\s*([A-Z]{2})(?:\s+\d{5})?\b", (_rp.get("address") or "").upper())
            if _m and _m.group(1) in _US_STATES:
                _state_code = _m.group(1)
                break
        _stamp_parts = [f"v{_ft_dt.now(_ft_tz.utc):%Y-%m}"]
        if _state_code:
            _stamp_parts.append(_state_code)
        _stamp_parts.append("review annually")
        _stamp = "  -  ".join(_stamp_parts)

        # Only render footnote if there's room (one tiny line above the back footer)
        if cur_y + (chosen_font * 0.4 + 0.4) <= avail_bottom:
            pdf.set_font("Helvetica", "I", max(3.5, chosen_font - 0.6))
            pdf.set_text_color(150, 138, 100)  # muted gold
            pdf.set_xy(text_x, cur_y)
            pdf.cell(text_w, chosen_font * 0.4 + 0.4, _stamp, new_x="LMARGIN", new_y="NEXT")
            cur_y = pdf.get_y()

    # ─── Render resources (only if room) ───
    if chosen_include_res and res_lines and cur_y < avail_bottom - line_h:
        cur_y += 0.6
        pdf.set_font("Helvetica", "B", max(4.5, chosen_font))
        pdf.set_text_color(59, 123, 247)
        pdf.set_xy(text_x, cur_y)
        pdf.cell(text_w, header_h, "SUPPLIES & RESOURCES", new_x="LMARGIN", new_y="NEXT")
        cur_y += header_h + 0.4
        pdf.set_font("Helvetica", "", chosen_font)
        pdf.set_text_color(208, 222, 233)
        for ln in res_lines:
            n_lines = measure_lines(safe(ln), chosen_font, line_h, text_w)
            needed = n_lines * line_h + 0.2
            if cur_y + needed > avail_bottom:
                break
            pdf.set_xy(text_x, cur_y)
            pdf.multi_cell(text_w, line_h, safe(ln), new_x="LMARGIN", new_y="NEXT")
            cur_y = pdf.get_y() + 0.2

    # Back footer
    pdf.set_font("Helvetica", "I", 3.5)
    pdf.set_text_color(82, 92, 114)
    pdf.set_xy(text_x, by + CARD_H - 3)
    pdf.cell(text_w, 2, "Keep in wallet. Update at carryon.us when plan changes.", new_x="LMARGIN", new_y="NEXT")

    # ═══════════ FOLD LINE (dashed, between front and back) ═══════════
    fold_x = start_x + CARD_W
    pdf.set_draw_color(120, 120, 140)
    pdf.set_line_width(0.15)
    dash_len = 2
    gap_len = 1.5
    y_pos = start_y - 4
    while y_pos < start_y + CARD_H + 4:
        pdf.line(fold_x, y_pos, fold_x, min(y_pos + dash_len, start_y + CARD_H + 4))
        y_pos += dash_len + gap_len

    # Fold instruction above card
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(120, 120, 140)
    pdf.set_xy(start_x, start_y - 10)
    pdf.cell(TOTAL_W, 4, "Cut along grey border. Fold at dashed center line. Keep in wallet.", align="C")

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
