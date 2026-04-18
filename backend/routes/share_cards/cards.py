"""Share Cards — card generation routes (Founders Circle + Subscriber + image serve).

Image files are cached in /tmp/carryon_share_cards/ (ephemeral).
Card parameters are stored in MongoDB (persistent) so images can be
regenerated on demand after a Railway restart or container swap.
"""

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Response

from config import db
from utils import get_current_user

from ._helpers import (
    CardRequest,
    CardResponse,
    _CACHE_DIR,
    _card_id,
    _clean_expired,
    _normalize_quote,
    _persist_submission,
    _pick_quote,
    _render_fc_card,
    _render_subscriber_card,
    router,
)


async def _save_card_params(cid: str, variant: str, fname: str, tier_name: str, quote: str) -> None:
    """Persist card parameters to MongoDB so the image can be regenerated after a restart."""
    await db.share_card_cache.update_one(
        {"cid": cid},
        {
            "$set": {
                "cid": cid,
                "variant": variant,
                "first_name": fname,
                "tier_name": tier_name,
                "quote": quote,
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )


def _render_card(variant: str, fname: str, tier_name: str, quote: str):
    if variant == "fc":
        return _render_fc_card(fname, tier_name, quote)
    return _render_subscriber_card(fname, tier_name, quote)


@router.post("/founders-circle", response_model=CardResponse)
async def create_fc_card(req: CardRequest, current_user: dict = Depends(get_current_user)):
    """Generate (or reuse) a Founders Circle share card for the current user."""
    _clean_expired()
    fname = req.first_name.strip() or "Founding Member"
    user_quote = _normalize_quote(req.quote)
    if user_quote:
        quote, source = user_quote, "user"
    else:
        quote, source = _pick_quote("fc", fname, nonce=req.nonce), "random"
    cid = _card_id("fc", fname, req.tier_name, quote)
    path = _CACHE_DIR / f"{cid}.png"
    if not path.exists():
        try:
            img = _render_card("fc", fname, req.tier_name.strip(), quote)
            img.save(path, format="PNG", optimize=True)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Card render failed: {e}")

    # Persist params so the image survives Railway restarts
    await _save_card_params(cid, "fc", fname, req.tier_name.strip(), quote)

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
        quote, source = _pick_quote("sub", fname, nonce=req.nonce), "random"
    cid = _card_id("sub", fname, req.tier_name, quote)
    path = _CACHE_DIR / f"{cid}.png"
    if not path.exists():
        try:
            img = _render_card("sub", fname, req.tier_name.strip(), quote)
            img.save(path, format="PNG", optimize=True)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Card render failed: {e}")

    # Persist params so the image survives Railway restarts
    await _save_card_params(cid, "sub", fname, req.tier_name.strip(), quote)

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
    """Public endpoint — serves the generated PNG.
    If the file is missing (e.g. Railway restart wiped /tmp/),
    regenerates it from MongoDB-stored parameters.
    """
    if not card_id.isalnum() or len(card_id) != 24:
        raise HTTPException(status_code=400, detail="Invalid card id")

    path = _CACHE_DIR / f"{card_id}.png"

    if not path.exists():
        # Attempt to regenerate from MongoDB cache
        params = await db.share_card_cache.find_one({"cid": card_id}, {"_id": 0})
        if not params:
            raise HTTPException(status_code=404, detail="Card not found or expired")
        try:
            img = _render_card(
                params.get("variant", "sub"),
                params.get("first_name", ""),
                params.get("tier_name", ""),
                params.get("quote", ""),
            )
            img.save(path, format="PNG", optimize=True)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Card regeneration failed: {e}")

    data = path.read_bytes()
    return Response(
        content=data,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=604800",
            "Content-Disposition": 'inline; filename="carryon-share.png"',
        },
    )
