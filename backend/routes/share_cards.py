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

import hashlib
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

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


def _card_id(variant: str, name: str, detail: str) -> str:
    """Deterministic id — same inputs produce the same file."""
    raw = f"{variant}|{name}|{detail}|{datetime.now(timezone.utc).date().isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


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


def _render_fc_card(first_name: str, tier_name: str) -> Image.Image:
    """Founders Circle — opulent, serif, gold-on-navy."""
    img = _navy_background().convert("RGBA")
    draw = ImageDraw.Draw(img)

    # Crown seal
    _draw_crown(draw, _SIZE // 2, 210, 62, (212, 175, 55, 255))

    # FOUNDING MEMBER chip
    chip_text = "FOUNDING MEMBER"
    f_chip = _font(_SANS_BOLD, 28)
    bbox = draw.textbbox((0, 0), chip_text, font=f_chip)
    pad_x, pad_y = 28, 12
    cw = bbox[2] - bbox[0] + pad_x * 2
    ch = bbox[3] - bbox[1] + pad_y * 2
    cx = (_SIZE - cw) // 2
    cy = 316
    draw.rounded_rectangle(
        (cx, cy, cx + cw, cy + ch),
        radius=ch // 2,
        fill=(212, 175, 55, 38),
        outline=(212, 175, 55, 200),
        width=2,
    )
    draw.text((cx + pad_x - bbox[0], cy + pad_y - bbox[1]), chip_text, font=f_chip, fill=(255, 235, 170))

    # Serif main line
    _centered(draw, "Welcome to the", _font(_SERIF_BOLD, 72), 420, (255, 255, 255, 255))
    _centered(draw, "Founders Circle.", _font(_SERIF_BOLD, 90), 498, (255, 255, 255, 255))

    # Italic gold name
    name_disp = f"— {first_name}"
    _centered(draw, name_disp, _font(_SERIF_ITALIC, 88), 630, (212, 175, 55, 255))

    # Tier + tagline
    if tier_name:
        _centered(
            draw,
            f"{tier_name} · Lifetime access",
            _font(_SANS_REG, 32),
            780,
            (255, 255, 255, 180),
        )

    # Brand footer (no ™ — Cormorant lacks that glyph)
    _centered(draw, "CarryOn", _font(_SERIF_BOLD, 46), 900, (212, 175, 55, 230))
    _centered(draw, "carryon.us", _font(_SANS_REG, 26), 964, (255, 255, 255, 140))

    _gold_border(img, width=6, color=(212, 175, 55, 220))
    return img.convert("RGB")


def _render_subscriber_card(first_name: str, tier_name: str) -> Image.Image:
    """Regular subscriber — celebratory but understated. Less opulent."""
    img = _navy_background().convert("RGBA")
    draw = ImageDraw.Draw(img)

    # Check seal (teal, not gold — calmer)
    _draw_checkmark(draw, _SIZE // 2, 220, 70, (52, 211, 153, 255))

    # I'M READY chip
    chip_text = "I'M READY"
    f_chip = _font(_SANS_BOLD, 28)
    bbox = draw.textbbox((0, 0), chip_text, font=f_chip)
    pad_x, pad_y = 28, 12
    cw = bbox[2] - bbox[0] + pad_x * 2
    ch = bbox[3] - bbox[1] + pad_y * 2
    cx = (_SIZE - cw) // 2
    cy = 326
    draw.rounded_rectangle(
        (cx, cy, cx + cw, cy + ch),
        radius=ch // 2,
        fill=(52, 211, 153, 40),
        outline=(52, 211, 153, 200),
        width=2,
    )
    draw.text((cx + pad_x - bbox[0], cy + pad_y - bbox[1]), chip_text, font=f_chip, fill=(220, 252, 231))

    # Sans heading — less opulent
    _centered(draw, "My family is now", _font(_SANS_REG, 52), 430, (255, 255, 255, 220))
    _centered(draw, "prepared with CarryOn.", _font(_SANS_BOLD, 62), 500, (255, 255, 255, 255))

    # Serif accent — short & sweet
    _centered(draw, f"— {first_name}", _font(_SERIF_ITALIC, 72), 620, (212, 175, 55, 255))

    if tier_name:
        _centered(draw, f"{tier_name} subscriber", _font(_SANS_REG, 30), 730, (255, 255, 255, 170))

    # Supporting message
    _centered(
        draw,
        "Documents secured. Messages saved. Plans ready.",
        _font(_SANS_REG, 26),
        790,
        (203, 213, 225, 180),
    )

    # Brand footer (no ™ — Cormorant lacks that glyph)
    _centered(draw, "CarryOn", _font(_SERIF_BOLD, 42), 900, (212, 175, 55, 220))
    _centered(draw, "carryon.us", _font(_SANS_REG, 24), 958, (255, 255, 255, 130))

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


class CardResponse(BaseModel):
    id: str
    image_url: str
    share_text: str


# ── Endpoints ────────────────────────────────────────────


@router.post("/founders-circle", response_model=CardResponse)
async def create_fc_card(req: CardRequest, current_user: dict = Depends(get_current_user)):
    """Generate (or reuse) a Founders Circle share card for the current user."""
    _clean_expired()
    fname = req.first_name.strip() or "Founding Member"
    cid = _card_id("fc", fname, req.tier_name)
    path = _CACHE_DIR / f"{cid}.png"
    if not path.exists():
        try:
            img = _render_fc_card(fname, req.tier_name.strip())
            img.save(path, format="PNG", optimize=True)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Card render failed: {e}")

    share_text = (
        "I just joined the CarryOn Founders Circle — lifetime access to the "
        "family preparedness platform that protects the people I love. "
        "https://carryon.us"
    )
    return CardResponse(id=cid, image_url=f"/api/share-cards/image/{cid}", share_text=share_text)


@router.post("/subscriber", response_model=CardResponse)
async def create_subscriber_card(req: CardRequest, current_user: dict = Depends(get_current_user)):
    """Generate (or reuse) a regular-subscriber share card for the current user."""
    _clean_expired()
    fname = req.first_name.strip() or "A CarryOn Member"
    cid = _card_id("sub", fname, req.tier_name)
    path = _CACHE_DIR / f"{cid}.png"
    if not path.exists():
        try:
            img = _render_subscriber_card(fname, req.tier_name.strip())
            img.save(path, format="PNG", optimize=True)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Card render failed: {e}")

    share_text = (
        "I just signed up for CarryOn™ — the family preparedness platform "
        "that organizes everything my loved ones would ever need. One less thing "
        "to worry about. https://carryon.us"
    )
    return CardResponse(id=cid, image_url=f"/api/share-cards/image/{cid}", share_text=share_text)


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
