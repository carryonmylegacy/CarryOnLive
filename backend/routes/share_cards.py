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
import random
import textwrap
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from config import db
from guards import check_founder_role
from services.email import send_email
from utils import get_current_user

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


async def _notify_founder_of_pending(first_name: str, quote: str, variant: str) -> None:
    """Best-effort Resend email to the founder that a new quote awaits review.
    Never blocks the submission flow — exceptions swallowed."""
    try:
        founder = await db.users.find_one(
            {"role": "admin", "admin_scope": "founder"},
            {"_id": 0, "email": 1},
        )
        if not founder or not founder.get("email"):
            return
        label = "Founding Member" if variant == "fc" else "CarryOn member"
        html = f"""
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width:560px; margin:24px auto; padding:24px; border:1px solid #e5e7eb; border-radius:16px; color:#111;">
          <p style="font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#8b6b1f; margin:0 0 12px;">New voice awaiting review</p>
          <blockquote style="font-family: Georgia, serif; font-size:22px; font-style:italic; line-height:1.4; color:#0b1221; border-left:3px solid #d4af37; margin:0 0 14px; padding:4px 0 4px 14px;">
            &ldquo;{quote}&rdquo;
          </blockquote>
          <p style="font-size:14px; color:#475569; margin:0 0 20px;">— {first_name}, {label}</p>
          <p style="font-size:13px; color:#475569; margin:0 0 6px;">
            Review, approve, or reject this submission in the Founder portal:
          </p>
          <p style="margin:0;">
            <a href="https://carryon.us/admin/voices" style="display:inline-block; padding:10px 16px; background:#d4af37; color:#080e1a; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Open Voices Admin</a>
          </p>
          <p style="font-size:11px; color:#94a3b8; margin:18px 0 0;">
            Nothing appears on /voices until you approve it.
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
    await _notify_founder_of_pending(first_name, quote, variant)
    return doc["id"]


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
