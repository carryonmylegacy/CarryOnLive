"""Share Cards — card generation routes (Founders Circle + Subscriber + image serve)."""

from fastapi import Depends, HTTPException, Response

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
    """Public endpoint — serves the generated PNG."""
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
            "Cache-Control": "public, max-age=604800",
            "Content-Disposition": 'inline; filename="carryon-share.png"',
        },
    )
