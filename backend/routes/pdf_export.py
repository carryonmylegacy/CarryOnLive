"""CarryOn™ Backend — PDF Estate Plan Export"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status, Response, Form
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from config import db, logger
from utils import get_current_user, encrypt_data, decrypt_data, hash_password, verify_password, create_token, generate_otp, generate_backup_code, send_otp_email, send_otp_sms, log_activity, send_push_notification, send_push_to_all_admins
import uuid
import os
import asyncio
import base64
import json as json_module
import random

router = APIRouter()

from fpdf import FPDF

# Unicode → ASCII mapping for FPDF (Helvetica doesn't support Unicode)
_UNICODE_MAP = {
    "\u2014": "-",   # em dash —
    "\u2013": "-",   # en dash –
    "\u2018": "'",   # left single quote '
    "\u2019": "'",   # right single quote '
    "\u201c": '"',   # left double quote "
    "\u201d": '"',   # right double quote "
    "\u2026": "...", # ellipsis …
    "\u2122": "(TM)",# trademark ™
    "\u00a9": "(c)", # copyright ©
    "\u00ae": "(R)", # registered ®
    "\u2022": "-",   # bullet •
    "\u2713": "[x]", # check mark ✓
    "\u2717": "[ ]", # cross ✗
    "\u2192": "->",  # right arrow →
}

def _safe(text: str) -> str:
    """Replace Unicode characters with ASCII equivalents for FPDF Helvetica."""
    for uchar, replacement in _UNICODE_MAP.items():
        text = text.replace(uchar, replacement)
    # Strip any remaining non-latin1 characters
    return text.encode("latin-1", errors="replace").decode("latin-1")

# ===================== PDF ESTATE PLAN EXPORT =====================


@router.get("/estate/{estate_id}/export-pdf")
async def export_estate_pdf(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a comprehensive estate plan PDF — action items first, then status"""
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    if estate.get("owner_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Gather all estate data
    documents = await db.documents.find({"estate_id": estate_id}, {"_id": 0, "file_data": 0}).to_list(100)
    beneficiaries = await db.beneficiaries.find({"estate_id": estate_id}, {"_id": 0}).to_list(50)
    checklist = await db.checklists.find({"estate_id": estate_id}, {"_id": 0}).to_list(200)
    messages = await db.messages.find({"estate_id": estate_id}, {"_id": 0}).to_list(100)
    dts_tasks = await db.dts_tasks.find({"estate_id": estate_id}, {"_id": 0, "payment_method": 0}).to_list(50)
    readiness = estate.get("readiness_score", 0)
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "password_hash": 0})

    # Build PDF
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Header
    pdf.set_font("Helvetica", "B", 24)
    pdf.cell(0, 15, _safe("CarryOn Estate Plan Summary"), new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, _safe(f"Generated: {datetime.now(timezone.utc).strftime('%B %d, %Y at %I:%M %p UTC')}"), new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.cell(0, 6, _safe(f"Estate Owner: {user.get('first_name', '')} {user.get('last_name', '')}"), new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(5)

    # Readiness Score
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, f"Estate Readiness Score: {readiness}%", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # ===== SECTION 1: ACTION ITEMS (what benefactor needs to DO) =====
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_fill_color(212, 175, 55)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 10, _safe("  ACTION ITEMS - What You Need To Do"), new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(3)

    # Missing documents
    essential_docs = ["Last Will & Testament", "Living Trust", "Power of Attorney", "Healthcare Directive", "Life Insurance Policy", "Beneficiary Designations"]
    doc_names = [d.get("name", "").lower() for d in documents]
    missing_docs = [d for d in essential_docs if not any(d.lower() in n for n in doc_names)]

    if missing_docs:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Missing Essential Documents:", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        for doc in missing_docs:
            pdf.cell(5)
            pdf.cell(0, 6, f"[ ] Upload: {doc}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # Incomplete checklist items
    pending_items = [c for c in checklist if not c.get("completed", False)]
    if pending_items:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, f"Pending Checklist Items ({len(pending_items)}):", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        categories = {"immediate": [], "first_week": [], "two_weeks": [], "first_month": []}
        for item in pending_items:
            cat = item.get("category", "first_month")
            if cat in categories:
                categories[cat].append(item)
        for cat_name, label in [("immediate", "URGENT"), ("first_week", "This Week"), ("two_weeks", "Within 2 Weeks"), ("first_month", "This Month")]:
            items = categories.get(cat_name, [])
            if items:
                pdf.set_font("Helvetica", "BI", 10)
                pdf.cell(5)
                pdf.cell(0, 6, f"{label}:", new_x="LMARGIN", new_y="NEXT")
                pdf.set_font("Helvetica", "", 9)
                for item in items[:10]:
                    pdf.cell(10)
                    title = item.get("title", "")[:70]
                    pdf.cell(0, 5, f"[ ] {title}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # Beneficiaries without contact info
    incomplete_bens = [b for b in beneficiaries if not b.get("email") or not b.get("phone")]
    if incomplete_bens:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Beneficiaries Missing Contact Info:", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        for b in incomplete_bens:
            name = f"{b.get('first_name', '')} {b.get('last_name', '')}".strip()
            missing = []
            if not b.get("email"):
                missing.append("email")
            if not b.get("phone"):
                missing.append("phone")
            pdf.cell(5)
            pdf.cell(0, 6, _safe(f"[ ] {name} - add {', '.join(missing)}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # DTS tasks needing attention
    pending_dts = [t for t in dts_tasks if t.get("status") in ("submitted", "quoted")]
    if pending_dts:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Trustee Tasks Needing Attention:", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        for t in pending_dts:
            pdf.cell(5)
            pdf.cell(0, 6, _safe(f"[ ] {t.get('title', '')} - Status: {t.get('status', '')}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # General recommendations
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "General Recommendations:", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    recs = []
    if len(documents) == 0:
        recs.append("Upload at least your Will and Power of Attorney to the Secure Document Vault")
    if len(beneficiaries) == 0:
        recs.append("Add at least one beneficiary to your estate")
    if len(messages) == 0:
        recs.append("Create milestone messages for your loved ones")
    if not any(b.get("status") == "accepted" for b in beneficiaries):
        recs.append("Invite your beneficiaries to create their CarryOn accounts")
    if readiness < 50:
        recs.append("Your readiness score is below 50% - focus on uploading key documents and completing checklist items")
    if not recs:
        recs.append("Your estate plan is in good shape! Review periodically for life changes.")
    for r in recs:
        pdf.cell(5)
        pdf.cell(0, 6, f"  {r}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    # ===== SECTION 2: ESTATE STATUS (backup info) =====
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_fill_color(15, 22, 41)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 10, _safe("  ESTATE STATUS - Current Snapshot"), new_x="LMARGIN", new_y="NEXT", fill=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(3)

    # Documents
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, f"Secure Document Vault ({len(documents)} documents):", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    if documents:
        for doc in documents:
            name = doc.get("name", "Unnamed")[:50]
            cat = doc.get("category", "uncategorized")
            locked = " [LOCKED]" if doc.get("is_locked") else ""
            pdf.cell(5)
            pdf.cell(0, 5, f"  {name} ({cat}){locked}", new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.cell(5)
        pdf.cell(0, 6, "  No documents uploaded yet", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Beneficiaries
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, f"Beneficiaries ({len(beneficiaries)}):", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for b in beneficiaries:
        name = f"{b.get('first_name', '')} {b.get('last_name', '')}".strip()
        rel = b.get("relationship", "")
        ben_status = b.get("status", "pending")
        pdf.cell(5)
        pdf.cell(0, 5, _safe(f"  {name} - {rel} (Status: {ben_status})"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Checklist summary
    completed = len([c for c in checklist if c.get("completed")])
    total = len(checklist)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, f"Immediate Action Checklist ({completed}/{total} completed):", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # Messages summary
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, f"Milestone Messages ({len(messages)}):", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    for m in messages[:10]:
        title = m.get("title", "Untitled")[:50]
        trigger = m.get("trigger", "on_transition")
        pdf.cell(5)
        pdf.cell(0, 5, f"  {title} (trigger: {trigger})", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # DTS summary
    if dts_tasks:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, f"Designated Trustee Services ({len(dts_tasks)} tasks):", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        for t in dts_tasks:
            pdf.cell(5)
            pdf.cell(0, 5, f"  {t.get('title', '')} — {t.get('status', '')}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 5, "This document is for informational purposes only and does not constitute legal advice.", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.cell(0, 5, "Consult with a qualified attorney for personalized estate planning guidance.", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.cell(0, 5, "CarryOn - Every American Family. Ready. - carryon.us", new_x="LMARGIN", new_y="NEXT", align="C")

    # Return PDF
    pdf_bytes = pdf.output()
    owner_name = f"{user.get('first_name', 'Estate')}_{user.get('last_name', 'Plan')}"
    filename = f"CarryOn_Estate_Plan_{owner_name}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"

    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


