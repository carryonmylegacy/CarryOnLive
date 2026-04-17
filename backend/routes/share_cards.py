"""
Share Cards — personalized PNG images for social sharing.

Two variants:
  • Founders Circle (opulent): gold/navy, serif "Founding Member" badge
  • Standard subscriber (celebratory, less opulent): clean gold accent + sans

Both are generated with Pillow, cached on disk under /tmp/carryon_share_cards,
and served by id. Generation is idempotent (same inputs → same id).

The file lives for 7 days; a lightweight janitor cleans expired files on
each request.
"""

from __future__ import annotations

import csv
import hashlib
import io
import os
import random
import textwrap
import time
import urllib.parse as _urlparse
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import HTMLResponse
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from config import JWT_SECRET, db
from guards import check_founder_role
from services.email import send_email
from utils import get_current_user

# Signed-token moderation (email one-click approve/reject)
_VOICE_TOKEN_ALG = "HS256"
_VOICE_TOKEN_PURPOSE = "voice_moderation_v1"
_VOICE_TOKEN_TTL_DAYS = 7


def _make_voice_action_token(submission_id: str, action: str) -> str:
    """Sign a short-lived JWT that authorizes a single moderation action
    against a single submission. No login required to redeem."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": submission_id,
        "act": action,  # "approve_feature" | "approve" | "reject"
        "purpose": _VOICE_TOKEN_PURPOSE,
        "iat": now,
        "exp": now + timedelta(days=_VOICE_TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=_VOICE_TOKEN_ALG)


def _decode_voice_action_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[_VOICE_TOKEN_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=410, detail="This moderation link has expired. Open /admin/voices instead.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid moderation link.")
    if payload.get("purpose") != _VOICE_TOKEN_PURPOSE:
        raise HTTPException(status_code=401, detail="Invalid moderation link.")
    if payload.get("act") not in {"approve_feature", "approve", "reject"}:
        raise HTTPException(status_code=401, detail="Invalid moderation link.")
    sub = payload.get("sub") or ""
    if not sub or len(sub) > 64:
        raise HTTPException(status_code=401, detail="Invalid moderation link.")
    return payload


def _moderation_base_url() -> str:
    """Where email links point. Backend endpoints live under the same ingress
    as the frontend, so FRONTEND_URL + /api works in every env."""
    return (os.environ.get("FRONTEND_URL") or "https://app.carryon.us").rstrip("/")


router = APIRouter(prefix="/share-cards", tags=["share-cards"])

# ── Paths & fonts ────────────────────────────────────────────
_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_CACHE_DIR = Path("/tmp/carryon_share_cards")
_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_TTL_SECONDS = 7 * 24 * 3600  # 7 days
_SIZE = 1080  # 1080×1080 — works great on Instagram / X / iMessage previews

_SERIF_BOLD = str(_FONT_DIR / "CormorantGaramond-Bold.ttf")
_SERIF_SEMIBOLD = str(_FONT_DIR / "CormorantGaramond-SemiBold.ttf")
_SERIF_ITALIC = str(_FONT_DIR / "CormorantGaramond-SemiBoldItalic.ttf")
# Sans — fall back to Liberation Sans which is pre-installed on the container
_SANS_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
_SANS_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"


# ── Fallback quote pools ────────────────────────────────────
# When a user skips the "why" input, one of these is chosen at random so
# every share card feels personal AND plugs CarryOn. Keep each under ~80
# chars so it wraps cleanly to at most 2 lines on the 1080px card.

_FC_QUOTES = [
    "I want my family to feel carried, not lost.",
    "The greatest gift is being remembered — and prepared for.",
    "Legacy isn't what we leave behind. It's what we leave ready.",
    "Love is the plan. CarryOn is how I deliver it.",
    "I believe every family deserves a soft place to land.",
    "My why is simple: my people, protected. Always.",
    "Tomorrow is promised to no one. Preparedness is.",
    "I carried my family once. Now CarryOn carries us forward.",
    "Because love should outlast me.",
    "I'd rather plan the moment than miss it.",
    "What matters most deserves more than a sticky note.",
    "I refuse to leave questions where answers should be.",
]

_SUB_QUOTES = [
    "Because my family deserves a plan, not a panic.",
    "One less thing for them to figure out.",
    "Peace of mind doesn't happen by accident.",
    "If something happens, they'll know exactly what to do.",
    "I'd rather be ready than sorry.",
    "Organized today. Protected tomorrow.",
    "Love, filed in one place.",
    "My family shouldn't have to guess.",
    "The best time to prepare was yesterday. The next-best time is now.",
    "I owe my people more than hope and a prayer.",
    "Because I know what happens when nobody's ready.",
    "Small act today. Big relief someday.",
]


def _pick_quote(variant: str, name_seed: str) -> str:
    """Deterministic per-user pick — same name yields the same random quote
    within a given day so the cached card is stable."""
    pool = _FC_QUOTES if variant == "fc" else _SUB_QUOTES
    seed = hashlib.sha256(f"{variant}|{name_seed}|{datetime.now(timezone.utc).date().isoformat()}".encode()).hexdigest()
    rng = random.Random(seed)
    return rng.choice(pool)


def _normalize_quote(raw: str, max_len: int = 110) -> str:
    """Trim / sanitize user input. Keep Latin-1-safe for Pillow rendering."""
    if not raw:
        return ""
    s = raw.strip().replace("\n", " ").replace("\r", " ")
    # Collapse whitespace
    s = " ".join(s.split())
    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "…"
    # Replace characters the Cormorant TTF may not ship glyphs for.
    # ™ is known-missing; everything else in basic Latin-1 renders fine.
    s = s.replace("™", "")
    return s


def _clean_expired() -> None:
    """Remove share cards older than TTL. Safe to call often."""
    try:
        cutoff = time.time() - _TTL_SECONDS
        for p in _CACHE_DIR.glob("*.png"):
            if p.stat().st_mtime < cutoff:
                p.unlink(missing_ok=True)
    except Exception:
        pass  # janitor must never break a request


def _font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def _card_id(variant: str, name: str, detail: str, quote: str = "") -> str:
    """Deterministic id — same inputs produce the same file."""
    raw = f"{variant}|{name}|{detail}|{quote}|{datetime.now(timezone.utc).date().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _draw_quote(
    draw: ImageDraw.ImageDraw,
    quote: str,
    *,
    y_start: int,
    color: tuple,
    font_size: int = 34,
    max_chars_per_line: int = 44,
) -> int:
    """Render a short italic-serif quote centered, wrapped to up to 2 lines.
    Returns the y coordinate after the last line (for layout chaining)."""
    if not quote:
        return y_start
    wrapped = textwrap.wrap(f"\u201c{quote}\u201d", width=max_chars_per_line)
    wrapped = wrapped[:2]  # hard-cap at 2 lines
    fnt = _font(_SERIF_ITALIC, font_size)
    line_h = int(font_size * 1.2)
    y = y_start
    for line in wrapped:
        _centered(draw, line, fnt, y, color)
        y += line_h
    return y


def _centered(draw: ImageDraw.ImageDraw, text: str, font, y: int, fill, *, max_width: int | None = None):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    if max_width and w > max_width:
        # simple shrink — rare for names
        return
    x = (_SIZE - w) // 2 - bbox[0]
    draw.text((x, y), text, font=font, fill=fill)


def _navy_background() -> Image.Image:
    """Radial navy gradient with soft gold glow — reused by both variants."""
    img = Image.new("RGB", (_SIZE, _SIZE), (11, 18, 33))
    px = img.load()
    cx, cy = _SIZE // 2, int(_SIZE * 0.32)
    max_d = ((_SIZE**2 + _SIZE**2) ** 0.5) / 2
    for y in range(_SIZE):
        for x in range(_SIZE):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            t = min(d / max_d, 1.0)
            # gold glow at top, deep navy at bottom
            r = int(22 * (1 - t) + 11 * t + 18 * max(0, 0.6 - t))
            g = int(34 * (1 - t) + 18 * t + 14 * max(0, 0.6 - t))
            b = int(64 * (1 - t) + 33 * t)
            px[x, y] = (r, g, b)
    return img


def _draw_crown(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, color: tuple):
    """Minimalist crown silhouette."""
    pts = [
        (cx - r, cy + r // 2),
        (cx - r + r // 4, cy - r // 2),
        (cx - r // 2, cy + r // 4),
        (cx, cy - r),
        (cx + r // 2, cy + r // 4),
        (cx + r - r // 4, cy - r // 2),
        (cx + r, cy + r // 2),
    ]
    draw.polygon(pts, fill=color)
    draw.rectangle((cx - r, cy + r // 2, cx + r, cy + r // 2 + r // 4), fill=color)


def _draw_checkmark(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, color: tuple):
    """Clean check inside a circle."""
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=6)
    draw.line(
        [(cx - r // 2, cy + r // 12), (cx - r // 12, cy + r // 2), (cx + r // 2, cy - r // 3)],
        fill=color,
        width=10,
    )


def _gold_border(img: Image.Image, width: int = 8, color=(212, 175, 55, 210)) -> None:
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    # inset border with rounded corners
    inset = 40
    od.rounded_rectangle(
        (inset, inset, _SIZE - inset, _SIZE - inset),
        radius=56,
        outline=color,
        width=width,
    )
    img.paste(overlay, (0, 0), overlay)


def _render_fc_card(first_name: str, tier_name: str, quote: str) -> Image.Image:
    """Founders Circle — opulent, serif, gold-on-navy."""
    img = _navy_background().convert("RGBA")
    draw = ImageDraw.Draw(img)

    # Crown seal
    _draw_crown(draw, _SIZE // 2, 200, 58, (212, 175, 55, 255))

    # FOUNDING MEMBER chip
    chip_text = "FOUNDING MEMBER"
    f_chip = _font(_SANS_BOLD, 26)
    bbox = draw.textbbox((0, 0), chip_text, font=f_chip)
    pad_x, pad_y = 26, 11
    cw = bbox[2] - bbox[0] + pad_x * 2
    ch = bbox[3] - bbox[1] + pad_y * 2
    cx = (_SIZE - cw) // 2
    cy = 294
    draw.rounded_rectangle(
        (cx, cy, cx + cw, cy + ch),
        radius=ch // 2,
        fill=(212, 175, 55, 38),
        outline=(212, 175, 55, 200),
        width=2,
    )
    draw.text((cx + pad_x - bbox[0], cy + pad_y - bbox[1]), chip_text, font=f_chip, fill=(255, 235, 170))

    # Serif main line
    _centered(draw, "Welcome to the", _font(_SERIF_BOLD, 66), 388, (255, 255, 255, 255))
    _centered(draw, "Founders Circle.", _font(_SERIF_BOLD, 84), 460, (255, 255, 255, 255))

    # Italic gold name
    name_disp = f"— {first_name}"
    _centered(draw, name_disp, _font(_SERIF_ITALIC, 80), 584, (212, 175, 55, 255))

    # Tier + tagline
    if tier_name:
        _centered(
            draw,
            f"{tier_name} · Lifetime access",
            _font(_SANS_REG, 30),
            702,
            (255, 255, 255, 180),
        )

    # Quote (always present — user input or randomized)
    _draw_quote(
        draw,
        quote,
        y_start=768,
        color=(236, 220, 170, 230),
        font_size=36,
    )

    # Brand footer (no ™ — Cormorant lacks that glyph)
    _centered(draw, "CarryOn", _font(_SERIF_BOLD, 44), 910, (212, 175, 55, 230))
    _centered(draw, "carryon.us", _font(_SANS_REG, 24), 970, (255, 255, 255, 140))

    _gold_border(img, width=6, color=(212, 175, 55, 220))
    return img.convert("RGB")


def _render_subscriber_card(first_name: str, tier_name: str, quote: str) -> Image.Image:
    """Regular subscriber — celebratory but understated. Less opulent."""
    img = _navy_background().convert("RGBA")
    draw = ImageDraw.Draw(img)

    # Check seal (teal, not gold — calmer)
    _draw_checkmark(draw, _SIZE // 2, 210, 66, (52, 211, 153, 255))

    # I'M READY chip
    chip_text = "I'M READY"
    f_chip = _font(_SANS_BOLD, 26)
    bbox = draw.textbbox((0, 0), chip_text, font=f_chip)
    pad_x, pad_y = 26, 11
    cw = bbox[2] - bbox[0] + pad_x * 2
    ch = bbox[3] - bbox[1] + pad_y * 2
    cx = (_SIZE - cw) // 2
    cy = 310
    draw.rounded_rectangle(
        (cx, cy, cx + cw, cy + ch),
        radius=ch // 2,
        fill=(52, 211, 153, 40),
        outline=(52, 211, 153, 200),
        width=2,
    )
    draw.text((cx + pad_x - bbox[0], cy + pad_y - bbox[1]), chip_text, font=f_chip, fill=(220, 252, 231))

    # Sans heading — less opulent
    _centered(draw, "My family is now", _font(_SANS_REG, 48), 408, (255, 255, 255, 220))
    _centered(draw, "prepared with CarryOn.", _font(_SANS_BOLD, 58), 472, (255, 255, 255, 255))

    # Serif accent — short & sweet
    _centered(draw, f"— {first_name}", _font(_SERIF_ITALIC, 66), 584, (212, 175, 55, 255))

    if tier_name:
        _centered(draw, f"{tier_name} subscriber", _font(_SANS_REG, 28), 680, (255, 255, 255, 170))

    # Quote (always present — user input or randomized)
    _draw_quote(
        draw,
        quote,
        y_start=750,
        color=(203, 250, 229, 230),
        font_size=34,
    )

    # Brand footer (no ™ — Cormorant lacks that glyph)
    _centered(draw, "CarryOn", _font(_SERIF_BOLD, 40), 910, (212, 175, 55, 220))
    _centered(draw, "carryon.us", _font(_SANS_REG, 22), 966, (255, 255, 255, 130))

    # Teal border (not gold) to distinguish from FC card
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle(
        (40, 40, _SIZE - 40, _SIZE - 40),
        radius=56,
        outline=(52, 211, 153, 190),
        width=5,
    )
    img.paste(overlay, (0, 0), overlay)

    return img.convert("RGB")


# ── API models ────────────────────────────────────────────


class CardRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=60)
    tier_name: str = Field("", max_length=60)
    quote: str = Field("", max_length=110, description="Optional user quote. Blank = random.")
    consent_public: bool = Field(
        False,
        description="User has opted in to let CarryOn use this quote publicly "
        "(website, marketing, social). Only relevant when `quote` is non-empty.",
    )


class CardResponse(BaseModel):
    id: str
    image_url: str
    share_text: str
    quote: str  # The actual quote rendered on the card (user or random)
    quote_source: str  # "user" | "random"
    submission_id: Optional[str] = None  # Present only when we persisted the quote


async def _notify_founder_of_pending(submission_id: str, first_name: str, quote: str, variant: str) -> None:
    """Best-effort Resend email to the founder that a new quote awaits review.
    Never blocks the submission flow — exceptions swallowed.

    Includes three signed one-click action links (approve & feature, approve
    only, reject) that work without requiring the founder to log in. Tokens
    are HS256-signed, bound to this submission id, and expire in 7 days.
    """
    try:
        founder = await db.users.find_one(
            {"role": "admin", "admin_scope": "founder"},
            {"_id": 0, "id": 1, "email": 1},
        )
        if not founder or not founder.get("email"):
            return
        label = "Founding Member" if variant == "fc" else "CarryOn member"
        base = _moderation_base_url()
        approve_feature_url = (
            f"{base}/api/share-cards/voices/moderate?token={_make_voice_action_token(submission_id, 'approve_feature')}"
        )
        approve_url = (
            f"{base}/api/share-cards/voices/moderate?token={_make_voice_action_token(submission_id, 'approve')}"
        )
        reject_url = f"{base}/api/share-cards/voices/moderate?token={_make_voice_action_token(submission_id, 'reject')}"
        html = f"""
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width:560px; margin:24px auto; padding:24px; border:1px solid #e5e7eb; border-radius:16px; color:#111;">
          <p style="font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#8b6b1f; margin:0 0 12px;">New voice awaiting review</p>
          <blockquote style="font-family: Georgia, serif; font-size:22px; font-style:italic; line-height:1.4; color:#0b1221; border-left:3px solid #d4af37; margin:0 0 14px; padding:4px 0 4px 14px;">
            &ldquo;{quote}&rdquo;
          </blockquote>
          <p style="font-size:14px; color:#475569; margin:0 0 20px;">— {first_name}, {label}</p>

          <p style="font-size:13px; color:#475569; margin:0 0 10px; font-weight:600;">
            One-tap moderation (no login required):
          </p>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px;">
            <tr>
              <td style="padding:0 8px 8px 0;">
                <a href="{approve_feature_url}" style="display:inline-block; padding:11px 18px; background:#d4af37; color:#080e1a; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Approve &amp; Feature</a>
              </td>
              <td style="padding:0 8px 8px 0;">
                <a href="{approve_url}" style="display:inline-block; padding:11px 18px; background:#10b981; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Approve only</a>
              </td>
              <td style="padding:0 0 8px 0;">
                <a href="{reject_url}" style="display:inline-block; padding:11px 18px; background:#ef4444; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Reject</a>
              </td>
            </tr>
          </table>

          <p style="font-size:13px; color:#475569; margin:0 0 6px;">
            Or open the full Voices admin in your portal:
          </p>
          <p style="margin:0;">
            <a href="{base}/admin/voices" style="display:inline-block; padding:10px 16px; background:#080e1a; color:#d4af37; text-decoration:none; border-radius:10px; font-weight:700; font-size:13px; border:1px solid #d4af37;">Open Voices Admin</a>
          </p>
          <p style="font-size:11px; color:#94a3b8; margin:18px 0 0;">
            Nothing appears on /voices until you approve it. Links expire in 7 days and can only be used against this one submission.
          </p>
        </div>
        """
        await send_email(
            founder["email"],
            "New CarryOn voice awaiting your review",
            html,
        )
    except Exception:
        pass  # notification must never break the submission path


async def _persist_submission(
    *,
    user: dict,
    variant: str,
    first_name: str,
    quote: str,
    consent_public: bool,
) -> Optional[str]:
    """Store a user-submitted quote (only when consent_public is True).

    New submissions land as `approval_status="pending"`. They remain invisible
    on the public /voices page until the founder approves them.
    Dedup: we hash (user_id|variant|quote) so repeated submissions don't
    create duplicate rows.
    """
    if not quote or not consent_public:
        return None
    user_id = str(user.get("id") or user.get("_id") or "")
    dedup = hashlib.sha256(f"{user_id}|{variant}|{quote}".encode()).hexdigest()[:32]
    existing = await db.share_quote_submissions.find_one({"dedup_hash": dedup}, {"_id": 0, "id": 1})
    if existing:
        return existing.get("id")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "variant": variant,  # "fc" | "sub"
        "first_name": first_name[:60],
        "quote": quote,
        "consent_public": True,
        "dedup_hash": dedup,
        "approval_status": "pending",  # "pending" | "approved" | "rejected"
        "featured": False,
        "is_seed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.share_quote_submissions.insert_one(doc)
    await _notify_founder_of_pending(doc["id"], first_name, quote, variant)
    return doc["id"]


async def _notify_member_approved(submission_id: str, featured: bool = False) -> None:
    """Best-effort celebratory email to a member whose quote was just approved.

    Idempotent (flips `member_notified_at` on first fire). Skips:
      • seed quotes
      • submissions from internal/test users (`__seed__`, `__test__`, empty user_id)
      • submissions already notified
      • users whose email we can't look up

    Regenerates the member's personalized share card so they can one-tap share
    their newly public voice. Never raises — notification is not part of the
    approval contract.
    """
    try:
        doc = await db.share_quote_submissions.find_one(
            {"id": submission_id},
            {
                "_id": 0,
                "id": 1,
                "user_id": 1,
                "first_name": 1,
                "variant": 1,
                "quote": 1,
                "is_seed": 1,
                "member_notified_at": 1,
            },
        )
        if not doc:
            return
        if doc.get("is_seed"):
            return
        user_id = (doc.get("user_id") or "").strip()
        if not user_id or user_id in {"__seed__", "__test__"}:
            return
        if doc.get("member_notified_at"):
            return
        user = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "id": 1, "email": 1, "first_name": 1},
        )
        if not user or not user.get("email"):
            return

        variant = doc.get("variant") or "sub"
        first_name = (doc.get("first_name") or user.get("first_name") or "Friend").strip() or "Friend"
        quote = doc.get("quote") or ""

        # Render (or reuse) the sharecard using the approved quote.
        cid = _card_id(variant, first_name, "", quote)
        path = _CACHE_DIR / f"{cid}.png"
        if not path.exists():
            try:
                if variant == "fc":
                    img = _render_fc_card(first_name, "", quote)
                else:
                    img = _render_subscriber_card(first_name, "", quote)
                img.save(path, format="PNG", optimize=True)
            except Exception:
                pass  # email can still go without the image

        base = _moderation_base_url()
        card_url = f"{base}/api/share-cards/image/{cid}"
        voices_url = f"{base}/voices"
        share_url = f"{base}/dashboard?share=voice"
        accent = "#d4af37" if variant == "fc" else "#10b981"
        chip_label = "FOUNDING MEMBER" if variant == "fc" else "CARRYON MEMBER"
        featured_line = (
            '<p style="font-size:13px; color:#8b6b1f; margin:0 0 6px; letter-spacing:0.12em; text-transform:uppercase; font-weight:700;">Featured on CarryOn</p>'
            if featured
            else ""
        )

        html = f"""
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width:560px; margin:24px auto; padding:28px 24px; border:1px solid #e5e7eb; border-radius:18px; color:#111; background:#ffffff;">
          {featured_line}
          <p style="font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#8b6b1f; margin:0 0 14px; font-weight:700;">Your voice is live</p>

          <h1 style="font-family: Georgia, 'Cormorant Garamond', serif; font-weight:600; font-size:30px; line-height:1.2; margin:0 0 12px; color:#0b1221;">
            Thank you, <em style="color:{accent};">{first_name}</em>.
          </h1>

          <p style="font-size:15px; line-height:1.55; color:#475569; margin:0 0 18px;">
            Your quote is now public on CarryOn — alongside other members who chose to share why they prepared.
          </p>

          <blockquote style="font-family: Georgia, serif; font-size:22px; font-style:italic; line-height:1.4; color:#0b1221; border-left:3px solid {accent}; margin:0 0 22px; padding:6px 0 6px 16px;">
            &ldquo;{quote}&rdquo;
          </blockquote>

          <div style="margin:0 0 22px; text-align:center;">
            <img src="{card_url}" alt="Your CarryOn share card" style="display:inline-block; max-width:100%; width:340px; height:auto; border-radius:14px; border:1px solid #e5e7eb;"/>
          </div>

          <p style="font-size:14px; line-height:1.5; color:#475569; margin:0 0 14px;">
            We built you a personalized share card with your quote on it. Tell your people — it takes one tap.
          </p>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
            <tr>
              <td style="padding:0 8px 8px 0;">
                <a href="{share_url}" style="display:inline-block; padding:12px 22px; background:{accent}; color:{"#080e1a" if variant == "fc" else "#ffffff"}; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Share your voice</a>
              </td>
              <td style="padding:0 0 8px 0;">
                <a href="{voices_url}" style="display:inline-block; padding:12px 20px; background:#f3f4f6; color:#0b1221; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px; border:1px solid #e5e7eb;">See it on /voices</a>
              </td>
            </tr>
          </table>

          <p style="font-size:11px; color:#94a3b8; margin:22px 0 0;">
            <span style="display:inline-block; padding:3px 9px; border-radius:999px; background:{"rgba(212,175,55,0.12)" if variant == "fc" else "rgba(16,185,129,0.12)"}; color:{accent}; font-weight:700; letter-spacing:0.14em; font-size:10px;">{chip_label}</span>
            &nbsp;&nbsp;We will never share your quote elsewhere without your permission.
          </p>
        </div>
        """
        await send_email(
            user["email"],
            "Your voice is now public on CarryOn",
            html,
        )
        await db.share_quote_submissions.update_one(
            {"id": submission_id, "member_notified_at": {"$exists": False}},
            {"$currentDate": {"member_notified_at": True}},
        )
    except Exception:
        pass  # approval must never fail because of notification


# ── Endpoints ────────────────────────────────────────────


@router.post("/founders-circle", response_model=CardResponse)
async def create_fc_card(req: CardRequest, current_user: dict = Depends(get_current_user)):
    """Generate (or reuse) a Founders Circle share card for the current user."""
    _clean_expired()
    fname = req.first_name.strip() or "Founding Member"
    user_quote = _normalize_quote(req.quote)
    if user_quote:
        quote, source = user_quote, "user"
    else:
        quote, source = _pick_quote("fc", fname), "random"
    cid = _card_id("fc", fname, req.tier_name, quote)
    path = _CACHE_DIR / f"{cid}.png"
    if not path.exists():
        try:
            img = _render_fc_card(fname, req.tier_name.strip(), quote)
            img.save(path, format="PNG", optimize=True)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Card render failed: {e}")

    share_text = (
        f"\u201c{quote}\u201d\n\n"
        "I just joined the CarryOn Founders Circle — lifetime access to the "
        "family preparedness platform that protects the people I love. "
        "https://carryon.us"
    )
    return CardResponse(
        id=cid,
        image_url=f"/api/share-cards/image/{cid}",
        share_text=share_text,
        quote=quote,
        quote_source=source,
        submission_id=await _persist_submission(
            user=current_user,
            variant="fc",
            first_name=fname,
            quote=quote if source == "user" else "",
            consent_public=req.consent_public,
        ),
    )


@router.post("/subscriber", response_model=CardResponse)
async def create_subscriber_card(req: CardRequest, current_user: dict = Depends(get_current_user)):
    """Generate (or reuse) a regular-subscriber share card for the current user."""
    _clean_expired()
    fname = req.first_name.strip() or "A CarryOn Member"
    user_quote = _normalize_quote(req.quote)
    if user_quote:
        quote, source = user_quote, "user"
    else:
        quote, source = _pick_quote("sub", fname), "random"
    cid = _card_id("sub", fname, req.tier_name, quote)
    path = _CACHE_DIR / f"{cid}.png"
    if not path.exists():
        try:
            img = _render_subscriber_card(fname, req.tier_name.strip(), quote)
            img.save(path, format="PNG", optimize=True)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Card render failed: {e}")

    share_text = (
        f"\u201c{quote}\u201d\n\n"
        "I just signed up for CarryOn — the family preparedness platform "
        "that organizes everything my loved ones would ever need. "
        "https://carryon.us"
    )
    return CardResponse(
        id=cid,
        image_url=f"/api/share-cards/image/{cid}",
        share_text=share_text,
        quote=quote,
        quote_source=source,
        submission_id=await _persist_submission(
            user=current_user,
            variant="sub",
            first_name=fname,
            quote=quote if source == "user" else "",
            consent_public=req.consent_public,
        ),
    )


@router.get("/image/{card_id}")
async def get_card_image(card_id: str):
    """Public endpoint — serves the generated PNG. No auth (share links must work
    unauthenticated when pasted into social platforms)."""
    # Guard against path traversal: card_id is 24-char hex; enforce that.
    if not card_id.isalnum() or len(card_id) != 24:
        raise HTTPException(status_code=400, detail="Invalid card id")
    path = _CACHE_DIR / f"{card_id}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Card not found or expired")
    data = path.read_bytes()
    return Response(
        content=data,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=604800",  # 7 days
            "Content-Disposition": 'inline; filename="carryon-share.png"',
        },
    )


# ── Admin "Voices" endpoints ──────────────────────────────────
#
# Surfaces user-submitted quotes (consented only) to founder admins so they
# can pull them into marketing, investor decks, etc.


class VoiceEntry(BaseModel):
    id: str
    first_name: str
    quote: str
    variant: str
    created_at: str
    featured: bool = False
    approval_status: str = "approved"  # "pending" | "approved" | "rejected"
    is_seed: bool = False


class VoicesResponse(BaseModel):
    total: int
    items: list[VoiceEntry]


@router.get("/admin/voices", response_model=VoicesResponse)
async def list_voices(
    current_user: dict = Depends(get_current_user),
    q: str = Query("", max_length=80, description="Optional substring search."),
    variant: str = Query("", pattern="^(fc|sub|)$"),
    status: str = Query("", pattern="^(pending|approved|rejected|)$"),
    featured_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Founder-only: list user-submitted, publicly-consented quotes."""
    check_founder_role(current_user)

    mongo_q: dict = {"consent_public": True}
    if variant in ("fc", "sub"):
        mongo_q["variant"] = variant
    if q.strip():
        mongo_q["quote"] = {"$regex": q.strip(), "$options": "i"}
    if featured_only:
        mongo_q["featured"] = True
    if status:
        mongo_q["approval_status"] = status

    total = await db.share_quote_submissions.count_documents(mongo_q)
    cursor = (
        db.share_quote_submissions.find(
            mongo_q,
            {
                "_id": 0,
                "id": 1,
                "first_name": 1,
                "quote": 1,
                "variant": 1,
                "created_at": 1,
                "featured": 1,
                "approval_status": 1,
                "is_seed": 1,
            },
        )
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
    )
    # Apply safe defaults for legacy rows without the new fields
    items = [
        VoiceEntry(
            **{
                "featured": False,
                "approval_status": "approved",
                "is_seed": False,
                **doc,
            }
        )
        async for doc in cursor
    ]
    return VoicesResponse(total=total, items=items)


@router.get("/admin/voices/pending-count")
async def pending_count(current_user: dict = Depends(get_current_user)):
    """Founder-only: count of new voices awaiting review (for the tab badge)."""
    check_founder_role(current_user)
    n = await db.share_quote_submissions.count_documents({"consent_public": True, "approval_status": "pending"})
    return {"pending": n}


@router.get("/voices/public", response_model=VoicesResponse)
async def list_public_voices(limit: int = Query(60, ge=1, le=200)):
    """Public (no auth) — only quotes the founder has approved.
    Featured=true gets priority ordering so curated picks surface first."""
    mongo_q = {"consent_public": True, "approval_status": "approved"}
    cursor = (
        db.share_quote_submissions.find(
            mongo_q,
            {
                "_id": 0,
                "id": 1,
                "first_name": 1,
                "quote": 1,
                "variant": 1,
                "created_at": 1,
                "featured": 1,
                "is_seed": 1,
            },
        )
        .sort([("featured", -1), ("created_at", -1)])
        .limit(limit)
    )
    items = [
        VoiceEntry(
            **{
                "approval_status": "approved",
                "featured": False,
                "is_seed": False,
                **doc,
            }
        )
        async for doc in cursor
    ]
    return VoicesResponse(total=len(items), items=items)


@router.patch("/admin/voices/{submission_id}/feature")
async def toggle_feature(
    submission_id: str,
    featured: bool = Query(..., description="True to feature publicly; False to unfeature."),
    current_user: dict = Depends(get_current_user),
):
    """Founder-only: toggle a quote's `featured` flag. Featured quotes
    appear first on /voices and on the home rotation strip."""
    check_founder_role(current_user)
    if not submission_id or len(submission_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid submission id")
    res = await db.share_quote_submissions.update_one(
        {"id": submission_id},
        {"$set": {"featured": bool(featured)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Submission not found")
    return {"id": submission_id, "featured": bool(featured)}


@router.patch("/admin/voices/{submission_id}/approve")
async def approve_voice(
    submission_id: str,
    feature: bool = Query(False, description="Also feature this quote immediately."),
    current_user: dict = Depends(get_current_user),
):
    """Founder-only: approve a pending submission. Optionally feature it
    immediately so it starts showing on the home rotation strip."""
    check_founder_role(current_user)
    if not submission_id or len(submission_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid submission id")
    update = {"approval_status": "approved"}
    if feature:
        update["featured"] = True
    res = await db.share_quote_submissions.update_one(
        {"id": submission_id},
        {
            "$set": update,
            "$currentDate": {"approved_at": True},
        },
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Submission not found")
    await _notify_member_approved(submission_id, featured=bool(feature))
    return {"id": submission_id, "approval_status": "approved", "featured": feature}


@router.patch("/admin/voices/{submission_id}/reject")
async def reject_voice(
    submission_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Founder-only: reject a pending submission. Keeps the row for audit
    but marks it permanently hidden."""
    check_founder_role(current_user)
    if not submission_id or len(submission_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid submission id")
    res = await db.share_quote_submissions.update_one(
        {"id": submission_id},
        {
            "$set": {"approval_status": "rejected", "featured": False},
            "$currentDate": {"rejected_at": True},
        },
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Submission not found")
    return {"id": submission_id, "approval_status": "rejected"}


# ── One-click email moderation (public, signed-token auth) ──────────────


def _moderation_result_page(
    *,
    success: bool,
    headline: str,
    sub: str,
    portal_url: str,
    accent: str = "#d4af37",
) -> str:
    """Branded HTML confirmation page served after a one-click moderation
    action. Styled to match CarryOn (navy + gold, Cormorant serif)."""
    icon = "✓" if success else "⚠"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>CarryOn — Voices moderation</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,600&family=Inter:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>
    body {{ margin:0; min-height:100vh; background:#080e1a; color:#e8ecf4;
           font-family: 'Inter', system-ui, sans-serif; display:flex;
           align-items:center; justify-content:center; padding:24px; }}
    .card {{ max-width:520px; width:100%; background:#0b1221; border:1px solid #1c2740;
            border-radius:20px; padding:36px 28px; text-align:center;
            box-shadow: 0 12px 48px rgba(0,0,0,0.35); }}
    .badge {{ display:inline-flex; align-items:center; justify-content:center;
             width:56px; height:56px; border-radius:50%; background:{accent};
             color:#080e1a; font-size:28px; font-weight:800; margin-bottom:18px; }}
    h1 {{ font-family: 'Cormorant Garamond', Georgia, serif; font-weight:600;
         font-size:34px; line-height:1.15; margin:0 0 10px;
         color:{"#f5f1e6" if success else "#fff"}; }}
    h1 em {{ font-style:italic; color:{accent}; }}
    p {{ font-size:15px; line-height:1.55; color:#9aa5b9; margin:0 0 22px; }}
    a.btn {{ display:inline-block; padding:11px 22px; background:{accent};
            color:#080e1a; text-decoration:none; border-radius:10px;
            font-weight:700; font-size:14px; letter-spacing:0.02em; }}
    .hint {{ font-size:11px; letter-spacing:0.16em; text-transform:uppercase;
            color:#8b6b1f; margin:20px 0 0; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">{icon}</div>
    <h1>{headline}</h1>
    <p>{sub}</p>
    <a class="btn" href="{portal_url}/admin/voices">Open Voices Admin</a>
    <div class="hint">CarryOn Founder Portal</div>
  </div>
</body>
</html>"""


@router.get("/voices/moderate", response_class=HTMLResponse)
async def moderate_voice_via_email(token: str = Query(..., min_length=20, max_length=2048)):
    """Public endpoint — validates a signed one-click token and applies the
    moderation action. Returns a branded HTML confirmation page.

    Accepts three actions, encoded in the token:
      • approve_feature — mark approved + featured (shows on /voices immediately)
      • approve         — mark approved only (available for Feature toggle later)
      • reject          — mark rejected (hidden forever, kept for audit)
    """
    portal_url = _moderation_base_url()
    try:
        payload = _decode_voice_action_token(token)
    except HTTPException as e:
        return HTMLResponse(
            status_code=e.status_code,
            content=_moderation_result_page(
                success=False,
                headline="Link no longer valid",
                sub=str(e.detail),
                portal_url=portal_url,
                accent="#ef4444",
            ),
        )

    submission_id = payload["sub"]
    action = payload["act"]

    doc = await db.share_quote_submissions.find_one(
        {"id": submission_id},
        {"_id": 0, "id": 1, "first_name": 1, "approval_status": 1, "variant": 1},
    )
    if not doc:
        return HTMLResponse(
            status_code=404,
            content=_moderation_result_page(
                success=False,
                headline="Submission not found",
                sub="This quote may have been redacted.",
                portal_url=portal_url,
                accent="#ef4444",
            ),
        )

    first_name = doc.get("first_name") or "this member"
    current_status = doc.get("approval_status") or "pending"

    # Idempotency: if already in the target state, show a soft confirmation
    # rather than error.
    if action in ("approve_feature", "approve") and current_status == "approved":
        return HTMLResponse(
            _moderation_result_page(
                success=True,
                headline=f"Already approved — <em>{first_name}</em>",
                sub="This quote was approved previously. No change was made.",
                portal_url=portal_url,
            )
        )
    if action == "reject" and current_status == "rejected":
        return HTMLResponse(
            _moderation_result_page(
                success=True,
                headline="Already rejected",
                sub="This quote is already hidden. No change was made.",
                portal_url=portal_url,
                accent="#ef4444",
            )
        )

    if action == "approve_feature":
        await db.share_quote_submissions.update_one(
            {"id": submission_id},
            {"$set": {"approval_status": "approved", "featured": True}, "$currentDate": {"approved_at": True}},
        )
        await _notify_member_approved(submission_id, featured=True)
        return HTMLResponse(
            _moderation_result_page(
                success=True,
                headline=f"Approved &amp; featured — <em>{first_name}</em>",
                sub="This quote is now live on /voices and will appear in the home rotation strip.",
                portal_url=portal_url,
            )
        )
    if action == "approve":
        await db.share_quote_submissions.update_one(
            {"id": submission_id},
            {"$set": {"approval_status": "approved"}, "$currentDate": {"approved_at": True}},
        )
        await _notify_member_approved(submission_id, featured=False)
        return HTMLResponse(
            _moderation_result_page(
                success=True,
                headline=f"Approved — <em>{first_name}</em>",
                sub="This quote is approved. Open the portal to toggle Feature when you're ready.",
                portal_url=portal_url,
            )
        )
    # reject
    await db.share_quote_submissions.update_one(
        {"id": submission_id},
        {"$set": {"approval_status": "rejected", "featured": False}, "$currentDate": {"rejected_at": True}},
    )
    return HTMLResponse(
        _moderation_result_page(
            success=True,
            headline="Rejected",
            sub=f"{first_name}'s quote has been hidden permanently. The record is kept for audit.",
            portal_url=portal_url,
            accent="#ef4444",
        )
    )


# ── Seed library (AI-written starter quotes, first-launch "tip jar" effect) ──
_SEED_VOICES = [
    # Founders Circle — legacy / leadership tone
    ("fc", "Marcus", "My dad left us with a shoebox of papers and three weeks of chaos. My kids will never have that."),
    (
        "fc",
        "Elena",
        "I'm the organized one in this family. I finally made it count for something beyond birthday parties.",
    ),
    ("fc", "David", "My wife kept saying we should. CarryOn is the first thing I've actually done."),
    ("fc", "Priya", "I don't want my funeral to be the first time my brother sees my handwriting."),
    ("fc", "Hannah", "I'm fifty-two. My mom's seventy-nine. It's time I led."),
    ("fc", "Ray", "My whole career was contingency planning. It's embarrassing it took me this long to do it at home."),
    ("fc", "Trisha", "I'm the family CFO whether I wanted the job or not. This just gave me the office."),
    # Regular subscribers — practical / ready tone
    ("sub", "Jason", "Before CarryOn: four passwords on sticky notes. After: one place my wife can find them."),
    ("sub", "Sarah", "My doctor asked if my family knew my wishes. I didn't have a good answer. Now I do."),
    ("sub", "Omar", "I did this on a Saturday morning in under two hours. Easiest adult thing I've ever done."),
    ("sub", "Nadia", "I travel a lot. My girls have peace of mind now. So do I."),
    ("sub", "Kevin", "I'm not ready for the worst. But my family is."),
    ("sub", "Luis", "Setting this up was the first thing my wife and I agreed on in a month."),
    ("sub", "Mariana", "I stopped carrying the anxiety alone."),
]


@router.post("/admin/voices/seed")
async def seed_voices(
    current_user: dict = Depends(get_current_user),
    feature_all: bool = Query(True, description="Mark every seed quote as featured."),
):
    """Founder-only: one-shot loader for the starter voice library.

    Safe to re-run — each seed has a stable id and is upserted, not duplicated.
    Seeds land as `approval_status="approved"` and `is_seed=True` so you can
    always distinguish them from real member submissions in your admin view.
    """
    check_founder_role(current_user)
    inserted = 0
    updated = 0
    for variant, name, quote in _SEED_VOICES:
        seed_id = "seed-" + hashlib.sha256(f"{variant}|{name}|{quote}".encode()).hexdigest()[:18]
        doc = {
            "id": seed_id,
            "user_id": "__seed__",
            "variant": variant,
            "first_name": name,
            "quote": quote,
            "consent_public": True,
            "dedup_hash": seed_id,
            "approval_status": "approved",
            "featured": bool(feature_all),
            "is_seed": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = await db.share_quote_submissions.update_one(
            {"id": seed_id},
            {"$set": doc},
            upsert=True,
        )
        if res.upserted_id:
            inserted += 1
        elif res.modified_count:
            updated += 1
    return {"inserted": inserted, "updated": updated, "total": len(_SEED_VOICES)}


@router.get("/admin/voices/export")
async def export_voices_csv(current_user: dict = Depends(get_current_user)):
    """Founder-only: CSV export of every consented quote (no auth on the
    response itself — the caller just needs founder scope)."""
    check_founder_role(current_user)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "first_name", "variant", "quote", "created_at"])
    cursor = db.share_quote_submissions.find(
        {"consent_public": True},
        {"_id": 0, "id": 1, "first_name": 1, "variant": 1, "quote": 1, "created_at": 1},
    ).sort("created_at", -1)
    async for doc in cursor:
        w.writerow([doc["id"], doc["first_name"], doc["variant"], doc["quote"], doc["created_at"]])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="carryon-voices.csv"',
            "Cache-Control": "no-store",
        },
    )


@router.delete("/admin/voices/{submission_id}")
async def delete_voice(submission_id: str, current_user: dict = Depends(get_current_user)):
    """Founder-only: redact a submission (e.g. offensive content).
    Removes the document outright — this is a destructive operation."""
    check_founder_role(current_user)
    if not submission_id or len(submission_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid submission id")
    res = await db.share_quote_submissions.delete_one({"id": submission_id})
    return {"deleted": res.deleted_count}


# ── Weekly Voices Digest ─────────────────────────────────
#
# Sends an editorial-style weekly email to all opted-in members showing 3–5
# newly-approved quotes from the past 7 days. Turns /voices into a recurring
# engagement surface instead of a one-time post-purchase moment.
#
# Wired into the existing `weekly_digest_scheduler` (Monday 8 AM EST / 13:00
# UTC) in schedulers.py, which is already wrapped with the distributed
# MongoDB scheduler lock — so only one pod fires per week across the fleet.
#
# Idempotent per ISO-week via `voices_digest_sends` collection (unique
# `week_key`). Replay / multi-pod can't produce duplicate sends.


def _voices_digest_week_key(ref: Optional[datetime] = None) -> str:
    """ISO-week key (e.g. '2026-W17'). Used as the idempotency key."""
    when = ref or datetime.now(timezone.utc)
    iso = when.isocalendar()
    return f"{iso.year:04d}-W{iso.week:02d}"


def _voices_digest_html(*, quotes: list, base_url: str) -> str:
    """Editorial-style HTML body. Quotes arrive shape-checked already."""
    items_html = []
    for q in quotes:
        variant = q.get("variant") or "sub"
        accent = "#d4af37" if variant == "fc" else "#34d399"
        chip_label = "FOUNDING MEMBER" if variant == "fc" else "MEMBER"
        chip_bg = "rgba(212,175,55,0.14)" if variant == "fc" else "rgba(52,211,153,0.14)"
        items_html.append(
            f"""
            <div style="padding:22px 0; border-bottom:1px solid #e5e7eb;">
              <span style="display:inline-block; padding:3px 10px; border-radius:999px; background:{chip_bg}; color:{accent}; font-weight:700; font-size:10px; letter-spacing:0.16em; text-transform:uppercase;">{chip_label}</span>
              <blockquote style="font-family: Georgia, 'Cormorant Garamond', serif; font-style:italic; font-size:22px; line-height:1.42; color:#0b1221; margin:12px 0 8px; padding:0;">
                &ldquo;{q.get("quote") or ""}&rdquo;
              </blockquote>
              <p style="font-size:13px; color:#64748b; margin:0;">&mdash; {q.get("first_name") or "A CarryOn member"}</p>
            </div>
            """
        )
    body = "".join(items_html) or (
        '<p style="font-size:14px; color:#64748b;">No new voices this week. But the ones already on /voices are quietly doing their work.</p>'
    )
    return f"""
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width:600px; margin:24px auto; padding:32px 28px; border:1px solid #e5e7eb; border-radius:18px; color:#111; background:#ffffff;">
      <p style="font-size:11px; letter-spacing:0.22em; text-transform:uppercase; color:#8b6b1f; margin:0 0 10px; font-weight:800;">CarryOn · Voices</p>
      <h1 style="font-family: Georgia, 'Cormorant Garamond', serif; font-weight:600; font-size:34px; line-height:1.18; margin:0 0 8px; color:#0b1221;">
        What our members said <em style="color:#d4af37;">this week.</em>
      </h1>
      <p style="font-size:15px; line-height:1.55; color:#475569; margin:0 0 18px;">
        Real words from real families who chose to share why they prepared. Curated by the CarryOn founder.
      </p>
      {body}
      <div style="margin:30px 0 6px; text-align:center;">
        <a href="{base_url}/voices" style="display:inline-block; padding:12px 22px; background:#080e1a; color:#d4af37; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px; border:1px solid #d4af37; margin:0 6px 8px;">Read more voices</a>
        <a href="{base_url}/dashboard?share=voice" style="display:inline-block; padding:12px 22px; background:#d4af37; color:#080e1a; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px; margin:0 6px 8px;">Add your own</a>
      </div>
      <p style="font-size:11px; color:#94a3b8; margin:24px 0 0; text-align:center; line-height:1.55;">
        You're receiving this because you're a CarryOn member. Preferences &rarr; <a href="{base_url}/settings" style="color:#94a3b8;">Settings</a>.
      </p>
    </div>
    """


async def send_voices_digest(
    *,
    max_quotes: int = 5,
    min_quotes_to_send: int = 3,
    window_days: int = 7,
    force: bool = False,
    dry_run: bool = False,
) -> dict:
    """Send the weekly Voices Digest to every opted-in member.

    Skips the entire send cycle if fewer than `min_quotes_to_send` new
    quotes landed in the past `window_days` — empty weeks just don't go out.

    Idempotent per ISO-week: a second call within the same week is a no-op
    unless `force=True`.

    When `dry_run=True`, returns the planned sends/quotes without sending
    any emails or writing the idempotency marker. Useful for ops preview.
    """
    week_key = _voices_digest_week_key()
    base = _moderation_base_url()

    if not force and not dry_run:
        existing = await db.voices_digest_sends.find_one(
            {"week_key": week_key},
            {"_id": 0, "id": 1, "week_key": 1},
        )
        if existing:
            return {"skipped": True, "reason": f"already sent for {week_key}"}

    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    quotes_cursor = (
        db.share_quote_submissions.find(
            {
                "approval_status": "approved",
                "featured": True,
                "is_seed": False,
                "approved_at": {"$gte": since},
            },
            {"_id": 0, "id": 1, "variant": 1, "first_name": 1, "quote": 1},
        )
        .sort("approved_at", -1)
        .limit(max_quotes)
    )
    quotes = await quotes_cursor.to_list(length=max_quotes)

    if len(quotes) < min_quotes_to_send:
        return {
            "skipped": True,
            "reason": f"only {len(quotes)} new quotes this week (need {min_quotes_to_send}).",
            "week_key": week_key,
        }

    html = _voices_digest_html(quotes=quotes, base_url=base)

    # Fetch members. We mirror the weekly digest pattern: benefactors only,
    # respecting user_preferences.weekly_digest opt-out.
    users = await db.users.find(
        {"role": "benefactor"},
        {"_id": 0, "id": 1, "email": 1, "first_name": 1},
    ).to_list(length=5000)

    if dry_run:
        eligible = 0
        for u in users:
            if not (u.get("email") or "").strip():
                continue
            prefs = await db.user_preferences.find_one(
                {"user_id": u["id"]},
                {"_id": 0, "id": 1, "weekly_digest": 1},
            )
            if prefs and prefs.get("weekly_digest") is False:
                continue
            eligible += 1
        return {
            "dry_run": True,
            "week_key": week_key,
            "quotes_included": len(quotes),
            "would_send_to": eligible,
            "html_preview_chars": len(html),
        }

    import asyncio as _asyncio

    sent = 0
    skipped = 0
    for u in users:
        email = (u.get("email") or "").strip()
        if not email:
            skipped += 1
            continue
        prefs = await db.user_preferences.find_one(
            {"user_id": u["id"]},
            {"_id": 0, "id": 1, "weekly_digest": 1},
        )
        if prefs and prefs.get("weekly_digest") is False:
            skipped += 1
            continue
        try:
            if sent > 0:
                await _asyncio.sleep(0.6)  # Resend: 2 req/s
            await send_email(email, "This week on CarryOn · Voices", html)
            sent += 1
        except Exception:
            skipped += 1

    # Mark the week as sent (unique on week_key — dup-safe)
    try:
        await db.voices_digest_sends.update_one(
            {"week_key": week_key},
            {
                "$setOnInsert": {
                    "week_key": week_key,
                    "sent_count": sent,
                    "skipped_count": skipped,
                    "quotes_included": len(quotes),
                    "sent_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
    except Exception:
        pass  # idempotency marker is best-effort

    return {
        "week_key": week_key,
        "sent": sent,
        "skipped": skipped,
        "quotes_included": len(quotes),
    }


@router.post("/admin/voices/digest/send-now")
async def admin_send_voices_digest(
    force: bool = Query(False, description="Ignore the once-per-week guard."),
    dry_run: bool = Query(False, description="Preview plan without sending emails."),
    current_user: dict = Depends(get_current_user),
):
    """Founder-only: manual trigger for the weekly Voices Digest.
    Useful for ad-hoc sends and launch-week testing."""
    check_founder_role(current_user)
    return await send_voices_digest(force=force, dry_run=dry_run)


# ── Voices Social Brief (Option B — Copy & Post email) ──────────────
#
# Every Monday, the founder receives a single email with the week's highest-
# priority approved quote pre-packaged as a ready-to-post X/Twitter post,
# a ready-to-post LinkedIn post, and the matching sharecard PNG.
#
# Deep links open the native compose boxes with text pre-filled — the
# founder just pastes + posts. Zero API credentials, zero OAuth, zero rate
# limit risk. When the user is ready to upgrade to true auto-posting (see
# PRD "Voices Social Auto-Post (Future / Option A)"), this helper becomes
# the content source and we add a separate publisher module.
#
# Idempotent per ISO-week via `voices_social_brief_sends`.


def _x_compose_url(text: str) -> str:
    """twitter.com/intent/tweet pre-fills the compose box on desktop + mobile."""
    return "https://twitter.com/intent/tweet?text=" + _urlparse.quote(text, safe="")


def _linkedin_compose_url(text: str) -> str:
    """linkedin.com share box pre-filled. Works on desktop; mobile deep-links into the LinkedIn app."""
    return "https://www.linkedin.com/feed/?shareActive=true&text=" + _urlparse.quote(text, safe="")


def _build_social_brief_posts(quote: str, first_name: str, variant: str) -> dict:
    """Compose the platform-specific post bodies. Keeps X under 280 chars."""
    chip = "Founding Member" if variant == "fc" else "CarryOn member"
    site = "https://carryon.us/voices"

    # X / Twitter — under 280 chars INCLUDING the URL (23 chars after t.co shortening).
    # We target ~240 chars to stay safe with hashtag permutations.
    hashtags_x = "#FamilyReadiness #CarryOn"
    x_core = f'"{quote}"\n— {first_name}, {chip}\n\n{site}\n{hashtags_x}'
    if len(x_core) > 275:
        # If the quote itself pushes us over, trim the quote with an ellipsis.
        over = len(x_core) - 275
        trimmed = quote[: max(0, len(quote) - over - 1)].rstrip() + "…"
        x_core = f'"{trimmed}"\n— {first_name}, {chip}\n\n{site}\n{hashtags_x}'

    # LinkedIn — long-form, no character limit concern, professional tone.
    li_core = (
        f'"{quote}"\n'
        f"— {first_name}, {chip}\n\n"
        "One of our members, in their own words.\n\n"
        "CarryOn is the family preparedness platform for every American family. "
        "Estate planning, secure document vault, milestone messages, connected "
        "care protocols — the things your family would otherwise have to piece "
        "together alone.\n\n"
        f"More voices: {site}\n\n"
        "#FamilyReadiness #EstatePlanning #FinancialWellness #CarryOn"
    )

    return {"x": x_core, "linkedin": li_core}


def _voices_social_brief_html(
    *,
    quote: dict,
    posts: dict,
    card_url: Optional[str],
    base_url: str,
) -> str:
    """Editorial "Monday Social Brief" HTML. Contains copy-paste blocks and
    one-tap compose links."""
    variant = quote.get("variant") or "sub"
    first_name = quote.get("first_name") or "A CarryOn member"
    quote_text = quote.get("quote") or ""
    accent = "#d4af37" if variant == "fc" else "#34d399"
    x_url = _x_compose_url(posts["x"])
    li_url = _linkedin_compose_url(posts["linkedin"])

    card_block = (
        f"""
          <div style="margin:0 0 22px; text-align:center;">
            <img src="{card_url}" alt="Weekly share card" style="display:inline-block; max-width:100%; width:360px; height:auto; border-radius:14px; border:1px solid #e5e7eb;"/>
          </div>
        """
        if card_url
        else ""
    )

    return f"""
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width:640px; margin:24px auto; padding:32px 28px; border:1px solid #e5e7eb; border-radius:18px; color:#111; background:#ffffff;">
      <p style="font-size:11px; letter-spacing:0.22em; text-transform:uppercase; color:#8b6b1f; margin:0 0 10px; font-weight:800;">CarryOn · Monday Social Brief</p>
      <h1 style="font-family: Georgia, 'Cormorant Garamond', serif; font-weight:600; font-size:30px; line-height:1.2; margin:0 0 10px; color:#0b1221;">
        This week's post is <em style="color:{accent};">ready.</em>
      </h1>
      <p style="font-size:14px; line-height:1.55; color:#475569; margin:0 0 20px;">
        Tap the button on each platform, paste the pre-written text, and post. The share card below is attached for upload when X/LinkedIn asks.
      </p>

      <blockquote style="font-family: Georgia, 'Cormorant Garamond', serif; font-style:italic; font-size:24px; line-height:1.42; color:#0b1221; border-left:3px solid {accent}; margin:0 0 12px; padding:6px 0 6px 18px;">
        &ldquo;{quote_text}&rdquo;
      </blockquote>
      <p style="font-size:13px; color:#64748b; margin:0 0 22px;">&mdash; {first_name}, {"Founding Member" if variant == "fc" else "CarryOn member"}</p>

      {card_block}

      <!-- X / Twitter block -->
      <div style="margin:0 0 22px; padding:18px; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
        <p style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:#0b1221; font-weight:800; margin:0 0 8px;">X / Twitter · {len(posts["x"])} chars</p>
        <pre style="white-space:pre-wrap; font-family:system-ui,-apple-system,sans-serif; font-size:14px; line-height:1.5; color:#0b1221; margin:0 0 12px; padding:12px; background:#ffffff; border:1px solid #e5e7eb; border-radius:10px;">{posts["x"]}</pre>
        <a href="{x_url}" style="display:inline-block; padding:11px 20px; background:#0b1221; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Open X pre-filled</a>
      </div>

      <!-- LinkedIn block -->
      <div style="margin:0 0 22px; padding:18px; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
        <p style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:#0b1221; font-weight:800; margin:0 0 8px;">LinkedIn · {len(posts["linkedin"])} chars</p>
        <pre style="white-space:pre-wrap; font-family:system-ui,-apple-system,sans-serif; font-size:14px; line-height:1.5; color:#0b1221; margin:0 0 12px; padding:12px; background:#ffffff; border:1px solid #e5e7eb; border-radius:10px;">{posts["linkedin"]}</pre>
        <a href="{li_url}" style="display:inline-block; padding:11px 20px; background:#0a66c2; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Open LinkedIn pre-filled</a>
      </div>

      <p style="font-size:12px; color:#94a3b8; margin:24px 0 0; line-height:1.55;">
        Tip: upload the attached share-card PNG when the platform offers "Add photo". Your Monday post takes ~30 seconds start to finish.
      </p>
      <p style="font-size:11px; color:#94a3b8; margin:14px 0 0;">
        Only sent to the founder email on file. Preferences → <a href="{base_url}/admin/voices" style="color:#94a3b8;">Admin · Voices</a>.
      </p>
    </div>
    """


async def send_voices_social_brief(
    *,
    window_days: int = 7,
    force: bool = False,
    dry_run: bool = False,
) -> dict:
    """Email the founder a Monday Social Brief containing this week's top
    approved quote packaged for X and LinkedIn.

    Picks the most recently-approved featured non-seed quote in the window.
    Skips if no eligible quote exists.
    Idempotent per ISO-week via `voices_social_brief_sends`.
    """
    week_key = _voices_digest_week_key()
    base = _moderation_base_url()

    if not force and not dry_run:
        existing = await db.voices_social_brief_sends.find_one(
            {"week_key": week_key},
            {"_id": 0, "id": 1, "week_key": 1},
        )
        if existing:
            return {"skipped": True, "reason": f"already sent for {week_key}"}

    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    quote = await db.share_quote_submissions.find_one(
        {
            "approval_status": "approved",
            "featured": True,
            "is_seed": False,
            "approved_at": {"$gte": since},
        },
        {"_id": 0, "id": 1, "variant": 1, "first_name": 1, "quote": 1},
        sort=[("approved_at", -1)],
    )
    if not quote:
        return {
            "skipped": True,
            "reason": "no eligible quote this week",
            "week_key": week_key,
        }

    posts = _build_social_brief_posts(
        quote=quote.get("quote") or "",
        first_name=quote.get("first_name") or "A CarryOn member",
        variant=quote.get("variant") or "sub",
    )

    # Render / reuse the sharecard so the email shows the exact image the
    # founder will upload to X/LinkedIn.
    variant = quote.get("variant") or "sub"
    first_name = quote.get("first_name") or "A CarryOn member"
    q_text = quote.get("quote") or ""
    cid = _card_id(variant, first_name, "", q_text)
    card_path = _CACHE_DIR / f"{cid}.png"
    if not card_path.exists():
        try:
            img = (
                _render_fc_card(first_name, "", q_text)
                if variant == "fc"
                else _render_subscriber_card(first_name, "", q_text)
            )
            img.save(card_path, format="PNG", optimize=True)
        except Exception:
            pass
    card_url = f"{base}/api/share-cards/image/{cid}" if card_path.exists() else None

    html = _voices_social_brief_html(quote=quote, posts=posts, card_url=card_url, base_url=base)

    if dry_run:
        return {
            "dry_run": True,
            "week_key": week_key,
            "quote_id": quote.get("id"),
            "x_chars": len(posts["x"]),
            "linkedin_chars": len(posts["linkedin"]),
            "card_url": card_url,
        }

    founder = await db.users.find_one(
        {"role": "admin", "admin_scope": "founder"},
        {"_id": 0, "id": 1, "email": 1},
    )
    if not founder or not founder.get("email"):
        return {
            "skipped": True,
            "reason": "no founder email on file",
            "week_key": week_key,
        }

    try:
        await send_email(founder["email"], "CarryOn · Monday Social Brief", html)
        sent = 1
    except Exception:
        return {"skipped": True, "reason": "send_email failed", "week_key": week_key}

    try:
        await db.voices_social_brief_sends.update_one(
            {"week_key": week_key},
            {
                "$setOnInsert": {
                    "week_key": week_key,
                    "quote_id": quote.get("id"),
                    "sent_at": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
    except Exception:
        pass

    return {"week_key": week_key, "sent": sent, "quote_id": quote.get("id")}


@router.post("/admin/voices/social-brief/send-now")
async def admin_send_voices_social_brief(
    force: bool = Query(False, description="Ignore the once-per-week guard."),
    dry_run: bool = Query(False, description="Preview plan without sending."),
    current_user: dict = Depends(get_current_user),
):
    """Founder-only: manual trigger for the Monday Social Brief email."""
    check_founder_role(current_user)
    return await send_voices_social_brief(force=force, dry_run=dry_run)
