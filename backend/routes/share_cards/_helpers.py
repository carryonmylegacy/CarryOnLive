"""Share Cards — shared router, constants, rendering helpers, and notification utilities.
No route handlers live here — all @router.xxx decorators are in sub-modules.
"""

from __future__ import annotations

import hashlib
import os
import random
import textwrap
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from config import JWT_SECRET, db
from services.email import send_email

# ── Router ──────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/share-cards", tags=["share-cards"])

# ── Signed-token moderation ──────────────────────────────────────────────────

_VOICE_TOKEN_ALG = "HS256"
_VOICE_TOKEN_PURPOSE = "voice_moderation_v1"
_VOICE_TOKEN_TTL_DAYS = 7


def _make_voice_action_token(submission_id: str, action: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": submission_id,
        "act": action,
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
    return (os.environ.get("FRONTEND_URL") or "https://app.carryon.us").rstrip("/")


# ── Paths & fonts ────────────────────────────────────────────────────────────

_FONT_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "fonts"
_CACHE_DIR = Path("/tmp/carryon_share_cards")
_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_TTL_SECONDS = 7 * 24 * 3600
_SIZE = 1080

_SERIF_BOLD = str(_FONT_DIR / "CormorantGaramond-Bold.ttf")
_SERIF_SEMIBOLD = str(_FONT_DIR / "CormorantGaramond-SemiBold.ttf")
_SERIF_ITALIC = str(_FONT_DIR / "CormorantGaramond-SemiBoldItalic.ttf")
_SANS_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
_SANS_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

# ── Quote pools ───────────────────────────────────────────────────────────────

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


def _pick_quote(variant: str, name_seed: str, nonce: str = "") -> str:
    """Pick a quote from the pool.

    Deterministic per day per user by default (stable cache).
    When `nonce` is supplied (e.g. from "Surprise me"), it's mixed into the
    seed so each call with a different nonce returns a different quote.
    """
    pool = _FC_QUOTES if variant == "fc" else _SUB_QUOTES
    seed_data = f"{variant}|{name_seed}|{datetime.now(timezone.utc).date().isoformat()}|{nonce}"
    seed = hashlib.sha256(seed_data.encode()).hexdigest()
    rng = random.Random(seed)
    return rng.choice(pool)


def _normalize_quote(raw: str, max_len: int = 110) -> str:
    if not raw:
        return ""
    s = raw.strip().replace("\n", " ").replace("\r", " ")
    s = " ".join(s.split())
    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "…"
    s = s.replace("™", "")
    return s


# ── Cache management ─────────────────────────────────────────────────────────


def _clean_expired() -> None:
    try:
        cutoff = time.time() - _TTL_SECONDS
        for p in _CACHE_DIR.glob("*.png"):
            if p.stat().st_mtime < cutoff:
                p.unlink(missing_ok=True)
    except Exception:
        pass


def _font(path: str, size: int) -> ImageFont.FreeTypeFont:
    """Load a font by path.  Falls back to the shipped Cormorant Garamond if the
    system font is missing (e.g. Railway containers without fonts-liberation)."""
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        # System font not installed — use the serif font we ship with the app.
        try:
            return ImageFont.truetype(str(_FONT_DIR / "CormorantGaramond-Bold.ttf"), size)
        except OSError:
            return ImageFont.load_default()


def _card_id(variant: str, name: str, detail: str, quote: str = "") -> str:
    raw = f"{variant}|{name}|{detail}|{quote}|{datetime.now(timezone.utc).date().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


# ── Pillow rendering helpers ─────────────────────────────────────────────────


def _draw_quote(draw, quote, *, y_start, color, font_size=34, max_chars_per_line=44):
    if not quote:
        return y_start
    wrapped = textwrap.wrap(f"\u201c{quote}\u201d", width=max_chars_per_line)
    wrapped = wrapped[:2]
    fnt = _font(_SERIF_ITALIC, font_size)
    line_h = int(font_size * 1.2)
    y = y_start
    for line in wrapped:
        _centered(draw, line, fnt, y, color)
        y += line_h
    return y


def _centered(draw, text, font, y, fill, *, max_width=None):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    if max_width and w > max_width:
        return
    x = (_SIZE - w) // 2 - bbox[0]
    draw.text((x, y), text, font=font, fill=fill)


def _navy_background():
    img = Image.new("RGB", (_SIZE, _SIZE), (11, 18, 33))
    px = img.load()
    cx, cy = _SIZE // 2, int(_SIZE * 0.32)
    max_d = ((_SIZE**2 + _SIZE**2) ** 0.5) / 2
    for y in range(_SIZE):
        for x in range(_SIZE):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            t = min(d / max_d, 1.0)
            r = int(22 * (1 - t) + 11 * t + 18 * max(0, 0.6 - t))
            g = int(34 * (1 - t) + 18 * t + 14 * max(0, 0.6 - t))
            b = int(64 * (1 - t) + 33 * t)
            px[x, y] = (r, g, b)
    return img


def _draw_crown(draw, cx, cy, r, color):
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


def _draw_checkmark(draw, cx, cy, r, color):
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=6)
    draw.line(
        [(cx - r // 2, cy + r // 12), (cx - r // 12, cy + r // 2), (cx + r // 2, cy - r // 3)],
        fill=color,
        width=10,
    )


def _gold_border(img, width=8, color=(212, 175, 55, 210)):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    inset = 40
    od.rounded_rectangle(
        (inset, inset, _SIZE - inset, _SIZE - inset),
        radius=56,
        outline=color,
        width=width,
    )
    img.paste(overlay, (0, 0), overlay)


def _render_fc_card(first_name: str, tier_name: str, quote: str) -> Image.Image:
    img = _navy_background().convert("RGBA")
    draw = ImageDraw.Draw(img)
    _draw_crown(draw, _SIZE // 2, 200, 58, (212, 175, 55, 255))
    chip_text = "FOUNDING MEMBER"
    f_chip = _font(_SANS_BOLD, 26)
    bbox = draw.textbbox((0, 0), chip_text, font=f_chip)
    pad_x, pad_y = 26, 11
    cw = bbox[2] - bbox[0] + pad_x * 2
    ch = bbox[3] - bbox[1] + pad_y * 2
    cx = (_SIZE - cw) // 2
    cy = 294
    draw.rounded_rectangle(
        (cx, cy, cx + cw, cy + ch), radius=ch // 2, fill=(212, 175, 55, 38), outline=(212, 175, 55, 200), width=2
    )
    draw.text((cx + pad_x - bbox[0], cy + pad_y - bbox[1]), chip_text, font=f_chip, fill=(255, 235, 170))
    _centered(draw, "Welcome to the", _font(_SERIF_BOLD, 66), 388, (255, 255, 255, 255))
    _centered(draw, "Founders Circle.", _font(_SERIF_BOLD, 84), 460, (255, 255, 255, 255))
    _centered(draw, f"— {first_name}", _font(_SERIF_ITALIC, 80), 584, (212, 175, 55, 255))
    if tier_name:
        _centered(draw, f"{tier_name} · Lifetime access", _font(_SANS_REG, 30), 702, (255, 255, 255, 180))
    _draw_quote(draw, quote, y_start=768, color=(236, 220, 170, 230), font_size=36)
    _centered(draw, "CarryOn", _font(_SERIF_BOLD, 44), 910, (212, 175, 55, 230))
    _centered(draw, "carryon.us", _font(_SANS_REG, 24), 970, (255, 255, 255, 140))
    _gold_border(img, width=6, color=(212, 175, 55, 220))
    return img.convert("RGB")


def _render_subscriber_card(first_name: str, tier_name: str, quote: str) -> Image.Image:
    img = _navy_background().convert("RGBA")
    draw = ImageDraw.Draw(img)
    _draw_checkmark(draw, _SIZE // 2, 210, 66, (52, 211, 153, 255))
    chip_text = "I'M READY"
    f_chip = _font(_SANS_BOLD, 26)
    bbox = draw.textbbox((0, 0), chip_text, font=f_chip)
    pad_x, pad_y = 26, 11
    cw = bbox[2] - bbox[0] + pad_x * 2
    ch = bbox[3] - bbox[1] + pad_y * 2
    cx = (_SIZE - cw) // 2
    cy = 310
    draw.rounded_rectangle(
        (cx, cy, cx + cw, cy + ch), radius=ch // 2, fill=(52, 211, 153, 40), outline=(52, 211, 153, 200), width=2
    )
    draw.text((cx + pad_x - bbox[0], cy + pad_y - bbox[1]), chip_text, font=f_chip, fill=(220, 252, 231))
    _centered(draw, "My family is now", _font(_SANS_REG, 48), 408, (255, 255, 255, 220))
    _centered(draw, "prepared with CarryOn.", _font(_SANS_BOLD, 58), 472, (255, 255, 255, 255))
    _centered(draw, f"— {first_name}", _font(_SERIF_ITALIC, 66), 584, (212, 175, 55, 255))
    if tier_name:
        _centered(draw, f"{tier_name} subscriber", _font(_SANS_REG, 28), 680, (255, 255, 255, 170))
    _draw_quote(draw, quote, y_start=750, color=(203, 250, 229, 230), font_size=34)
    _centered(draw, "CarryOn", _font(_SERIF_BOLD, 40), 910, (212, 175, 55, 220))
    _centered(draw, "carryon.us", _font(_SANS_REG, 22), 966, (255, 255, 255, 130))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle((40, 40, _SIZE - 40, _SIZE - 40), radius=56, outline=(52, 211, 153, 190), width=5)
    img.paste(overlay, (0, 0), overlay)
    return img.convert("RGB")


# ── Notification helpers ─────────────────────────────────────────────────────


async def _notify_founder_of_pending(submission_id: str, first_name: str, quote: str, variant: str) -> None:
    try:
        founder = await db.users.find_one({"role": "admin", "admin_scope": "founder"}, {"_id": 0, "id": 1, "email": 1})
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
          <blockquote style="font-family: Georgia, serif; font-size:22px; font-style:italic; line-height:1.4; color:#0b1221; border-left:3px solid #d4af37; margin:0 0 14px; padding:4px 0 4px 14px;">&ldquo;{quote}&rdquo;</blockquote>
          <p style="font-size:14px; color:#475569; margin:0 0 20px;">— {first_name}, {label}</p>
          <p style="font-size:13px; color:#475569; margin:0 0 10px; font-weight:600;">One-tap moderation (no login required):</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px;">
            <tr>
              <td style="padding:0 8px 8px 0;"><a href="{approve_feature_url}" style="display:inline-block; padding:11px 18px; background:#d4af37; color:#080e1a; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Approve &amp; Feature</a></td>
              <td style="padding:0 8px 8px 0;"><a href="{approve_url}" style="display:inline-block; padding:11px 18px; background:#10b981; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Approve only</a></td>
              <td style="padding:0 0 8px 0;"><a href="{reject_url}" style="display:inline-block; padding:11px 18px; background:#ef4444; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Reject</a></td>
            </tr>
          </table>
          <p style="font-size:13px; color:#475569; margin:0 0 6px;">Or open the full Voices admin in your portal:</p>
          <p style="margin:0;"><a href="{base}/admin/voices" style="display:inline-block; padding:10px 16px; background:#080e1a; color:#d4af37; text-decoration:none; border-radius:10px; font-weight:700; font-size:13px; border:1px solid #d4af37;">Open Voices Admin</a></p>
          <p style="font-size:11px; color:#94a3b8; margin:18px 0 0;">Nothing appears on /voices until you approve it. Links expire in 7 days.</p>
        </div>"""
        await send_email(founder["email"], "New CarryOn voice awaiting your review", html)
    except Exception:
        pass


async def _persist_submission(
    *, user: dict, variant: str, first_name: str, quote: str, consent_public: bool
) -> Optional[str]:
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
        "variant": variant,
        "first_name": first_name[:60],
        "quote": quote,
        "consent_public": True,
        "dedup_hash": dedup,
        "approval_status": "pending",
        "featured": False,
        "is_seed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.share_quote_submissions.insert_one(doc)
    await _notify_founder_of_pending(doc["id"], first_name, quote, variant)
    return doc["id"]


async def _notify_member_approved(submission_id: str, featured: bool = False) -> None:
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
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "email": 1, "first_name": 1})
        if not user or not user.get("email"):
            return

        variant = doc.get("variant") or "sub"
        first_name = (doc.get("first_name") or user.get("first_name") or "Friend").strip() or "Friend"
        quote = doc.get("quote") or ""

        cid = _card_id(variant, first_name, "", quote)
        path = _CACHE_DIR / f"{cid}.png"
        if not path.exists():
            try:
                img = (
                    _render_fc_card(first_name, "", quote)
                    if variant == "fc"
                    else _render_subscriber_card(first_name, "", quote)
                )
                img.save(path, format="PNG", optimize=True)
            except Exception:
                pass

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
          <h1 style="font-family: Georgia, 'Cormorant Garamond', serif; font-weight:600; font-size:30px; line-height:1.2; margin:0 0 12px; color:#0b1221;">Thank you, <em style="color:{accent};">{first_name}</em>.</h1>
          <p style="font-size:15px; line-height:1.55; color:#475569; margin:0 0 18px;">Your quote is now public on CarryOn — alongside other members who chose to share why they prepared.</p>
          <blockquote style="font-family: Georgia, serif; font-size:22px; font-style:italic; line-height:1.4; color:#0b1221; border-left:3px solid {accent}; margin:0 0 22px; padding:6px 0 6px 16px;">&ldquo;{quote}&rdquo;</blockquote>
          <div style="margin:0 0 22px; text-align:center;"><img src="{card_url}" alt="Your CarryOn share card" style="display:inline-block; max-width:100%; width:340px; height:auto; border-radius:14px; border:1px solid #e5e7eb;"/></div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
            <tr>
              <td style="padding:0 8px 8px 0;"><a href="{share_url}" style="display:inline-block; padding:12px 22px; background:{accent}; color:{"#080e1a" if variant == "fc" else "#ffffff"}; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Share your voice</a></td>
              <td style="padding:0 0 8px 0;"><a href="{voices_url}" style="display:inline-block; padding:12px 20px; background:#f3f4f6; color:#0b1221; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px; border:1px solid #e5e7eb;">See it on /voices</a></td>
            </tr>
          </table>
          <p style="font-size:11px; color:#94a3b8; margin:22px 0 0;"><span style="display:inline-block; padding:3px 9px; border-radius:999px; background:{"rgba(212,175,55,0.12)" if variant == "fc" else "rgba(16,185,129,0.12)"}; color:{accent}; font-weight:700; letter-spacing:0.14em; font-size:10px;">{chip_label}</span>&nbsp;&nbsp;We will never share your quote elsewhere without your permission.</p>
        </div>"""
        await send_email(user["email"], "Your voice is now public on CarryOn", html)
        await db.share_quote_submissions.update_one(
            {"id": submission_id, "member_notified_at": {"$exists": False}},
            {"$currentDate": {"member_notified_at": True}},
        )
    except Exception:
        pass


# ── API models ────────────────────────────────────────────────────────────────


class CardRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=60)
    tier_name: str = Field("", max_length=60)
    quote: str = Field("", max_length=110)
    consent_public: bool = Field(False)
    nonce: str = Field(
        "",
        max_length=32,
        description="Optional random value from client. When set, breaks the deterministic "
        "daily-seed so 'Surprise me' returns a different quote each click.",
    )


class CardResponse(BaseModel):
    id: str
    image_url: str
    share_text: str
    quote: str
    quote_source: str
    submission_id: Optional[str] = None
