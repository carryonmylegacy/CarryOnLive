"""Guides — the founder's launch switch for the public /guides section.

The five articles ship in the frontend registry (frontend/src/copy/siteCopyGuides.js) but stay
hidden (noindex, no footer link) until the founder presses Launch in Admin → Marketing → Guides.

GET /api/public/guides/status          — {launched, launched_at}
PUT /api/admin/guides/launch           — {launched: bool}; marketing scope; audited
GET /api/public/guides/{slug}/card.png — 1200×630 social share card drawn from the guide's current title
"""

import hashlib
import io
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel

from config import db
from guards import require_scope
from services.audit import get_client_ip, log_audit_event

router = APIRouter()

# Built-in titles mirror frontend/src/copy/siteCopyGuides.js; a Site Copy override of guides.<slug>.title wins.
GUIDE_TITLES = {
    "twelve-documents-every-family-should-find-in-ten-minutes": "The 12 documents every family should be able to find in ten minutes",
    "how-to-write-a-milestone-letter-your-child-will-open-in-fifteen-years": "How to write a milestone letter your child will open in fifteen years",
    "choosing-an-executor-and-why-you-also-need-a-digital-one": "Choosing an executor — and why you also need a digital one",
    "the-first-72-hours-after-a-death": "The first 72 hours after a death: what the family actually has to do",
    "a-family-contingency-plan-in-one-evening": "A family contingency plan in one evening: meetup point, go-bag, out-of-area contact",
}
DEFAULT_BYLINE = "Barnet Harris, Founder"
_ASSETS = Path(__file__).resolve().parent.parent / "assets"
_CARD_W, _CARD_H = 1200, 630


class LaunchIn(BaseModel):
    launched: bool


async def guides_status() -> dict:
    projection = {"_id": 0, "guides_launched": 1, "guides_launched_at": 1}  # allow-missing-id: settings singleton
    doc = await db.platform_settings.find_one({"_id": "global"}, projection) or {}
    return {"launched": bool(doc.get("guides_launched")), "launched_at": doc.get("guides_launched_at")}


@router.get("/public/guides/status")
async def get_guides_status():
    return await guides_status()


@router.put("/admin/guides/launch")
async def put_guides_launch(
    payload: LaunchIn, request: Request, current_user: dict = Depends(require_scope("marketing"))
):
    update = {"guides_launched": payload.launched}
    if payload.launched:
        update["guides_launched_at"] = datetime.now(timezone.utc).isoformat()
    await db.platform_settings.update_one({"_id": "global"}, {"$set": update}, upsert=True)
    await log_audit_event(
        actor_id=current_user["id"],
        actor_email=current_user.get("email", ""),
        actor_role=current_user.get("role", "admin"),
        action="guides_launch" if payload.launched else "guides_unpublish",
        category="platform",
        resource_type="guides",
        resource_id="public-site",
        details=update,
        ip_address=get_client_ip(request),
    )
    return await guides_status()


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines, current = [], ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def render_guide_card(title: str, byline: str) -> bytes:
    """Dark navy card, gold rule, 'CarryOn · Guides', wrapped title, byline — 1200×630 PNG."""
    img = Image.new("RGB", (_CARD_W, _CARD_H), "#0E1829")
    draw = ImageDraw.Draw(img)
    # soft gold glow top-left, like the site's hero gradient
    glow = Image.new("RGBA", (_CARD_W, _CARD_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(520, 0, -40):
        a = int(26 * (1 - r / 520))
        gd.ellipse([(80 - r, -r), (80 + r, r)], fill=(212, 175, 55, a))
    img.paste(Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB"))
    draw = ImageDraw.Draw(img)
    draw.rectangle([(0, 0), (_CARD_W, 8)], fill="#d4af37")
    logo = Image.open(_ASSETS / "carryon-logo.png").convert("RGBA")
    logo.thumbnail((72, 72))
    img.paste(logo, (88, 72), logo)
    eyebrow = ImageFont.truetype(str(_ASSETS / "fonts" / "Outfit-Medium.ttf"), 26)
    draw.text((88 + logo.width + 20, 72 + (logo.height - 30) // 2), "CarryOn  ·  Guides", font=eyebrow, fill="#d4af37")
    size = 64
    while size >= 40:
        font = ImageFont.truetype(str(_ASSETS / "fonts" / "Outfit-Bold.ttf"), size)
        lines = _wrap(draw, title, font, _CARD_W - 176)
        if len(lines) <= 4:
            break
        size -= 6
    line_h = int(size * 1.18)
    total = line_h * len(lines)
    y = max(190, (_CARD_H - total) // 2 - 10)
    for line in lines:
        draw.text((88, y), line, font=font, fill="#FFFFFF")
        y += line_h
    draw.rectangle([(88, _CARD_H - 118), (88 + 72, _CARD_H - 114)], fill="#d4af37")
    small = ImageFont.truetype(str(_ASSETS / "fonts" / "Outfit-Medium.ttf"), 26)
    draw.text((88, _CARD_H - 98), byline, font=small, fill="#a0aec0")
    right = "carryon.us/guides"
    draw.text((_CARD_W - 88 - draw.textlength(right, font=small), _CARD_H - 98), right, font=small, fill="#64748b")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@router.get("/public/guides/{slug}/card.png")
async def guide_card(slug: str):
    """Social preview image for one guide — the title comes from Site Copy so edits show up automatically."""
    if slug not in GUIDE_TITLES:
        raise HTTPException(status_code=404, detail="Unknown guide.")
    keys = [f"guides.{slug}.title", "guides.index.byline"]
    overrides = {
        d["_id"]: d.get("value", "") async for d in db.site_copy.find({"_id": {"$in": keys}}, {"_id": 1, "value": 1})
    }
    title = (overrides.get(keys[0]) or GUIDE_TITLES[slug]).replace("\n", " ").strip()
    byline = (overrides.get(keys[1]) or DEFAULT_BYLINE).strip()
    png = render_guide_card(title, byline)
    etag = hashlib.sha1(png).hexdigest()[:16]
    headers = {"Cache-Control": "public, max-age=3600", "ETag": etag, "Cross-Origin-Resource-Policy": "cross-origin"}
    return Response(png, media_type="image/png", headers=headers)
