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
    }
    if data.action not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid download action: {data.action}")
    token = create_token(current_user, data.action, data.params, data.filename)
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
    data = consume_token(token)
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

    pdf_bytes = pdf.output()
    safe_plan_name = "".join(c for c in plan.get("name", "plan") if c.isalnum() or c in " _-")[:40].strip() or "plan"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="CCP_{safe_plan_name}.pdf"'},
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
