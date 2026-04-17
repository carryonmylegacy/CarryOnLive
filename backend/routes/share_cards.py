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


async def _persist_submission(
    *,
    user: dict,
    variant: str,
    first_name: str,
    quote: str,
    consent_public: bool,
) -> Optional[str]:
    """Store a user-submitted quote (only when consent_public is True).

    Dedup: we hash (user_id|variant|quote) so repeatedly submitting the same
    quote doesn't create duplicate rows. Each doc is append-only.
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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.share_quote_submissions.insert_one(doc)
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


class VoicesResponse(BaseModel):
    total: int
    items: list[VoiceEntry]


@router.get("/admin/voices", response_model=VoicesResponse)
async def list_voices(
    current_user: dict = Depends(get_current_user),
    q: str = Query("", max_length=80, description="Optional substring search."),
    variant: str = Query("", pattern="^(fc|sub|)$"),
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

    total = await db.share_quote_submissions.count_documents(mongo_q)
    cursor = (
        db.share_quote_submissions.find(
            mongo_q,
            {"_id": 0, "id": 1, "first_name": 1, "quote": 1, "variant": 1, "created_at": 1},
        )
        .sort("created_at", -1)
        .skip(offset)
        .limit(limit)
    )
    items = [VoiceEntry(**doc) async for doc in cursor]
    return VoicesResponse(total=total, items=items)


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
