"""Share Cards — Weekly Voices Digest and Social Brief scheduler functions + admin triggers.

These functions are called from two places:
  1. schedulers.py (weekly Monday runs)
  2. Admin trigger endpoints below (manual / test sends)
"""

from __future__ import annotations

import urllib.parse as _urlparse
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, Query

from config import db
from guards import check_founder_role
from services.email import send_email
from utils import get_current_user

from ._helpers import (
    _CACHE_DIR,
    _card_id,
    _moderation_base_url,
    _render_fc_card,
    _render_subscriber_card,
    router,
)


# ── Week key ─────────────────────────────────────────────────────────────────


def _voices_digest_week_key(ref: Optional[datetime] = None) -> str:
    when = ref or datetime.now(timezone.utc)
    iso = when.isocalendar()
    return f"{iso.year:04d}-W{iso.week:02d}"


# ── Weekly Voices Digest ─────────────────────────────────────────────────────


def _voices_digest_html(*, quotes: list, base_url: str) -> str:
    items_html = []
    for q in quotes:
        variant = q.get("variant") or "sub"
        accent = "#d4af37" if variant == "fc" else "#34d399"
        chip_label = "FOUNDING MEMBER" if variant == "fc" else "MEMBER"
        chip_bg = "rgba(212,175,55,0.14)" if variant == "fc" else "rgba(52,211,153,0.14)"
        items_html.append(f"""
            <div style="padding:22px 0; border-bottom:1px solid #e5e7eb;">
              <span style="display:inline-block; padding:3px 10px; border-radius:999px; background:{chip_bg}; color:{accent}; font-weight:700; font-size:10px; letter-spacing:0.16em; text-transform:uppercase;">{chip_label}</span>
              <blockquote style="font-family: Georgia, 'Cormorant Garamond', serif; font-style:italic; font-size:22px; line-height:1.42; color:#0b1221; margin:12px 0 8px; padding:0;">&ldquo;{q.get("quote") or ""}&rdquo;</blockquote>
              <p style="font-size:13px; color:#64748b; margin:0;">&mdash; {q.get("first_name") or "A CarryOn member"}</p>
            </div>""")
    body = (
        "".join(items_html)
        or '<p style="font-size:14px; color:#64748b;">No new voices this week. But the ones already on /voices are quietly doing their work.</p>'
    )
    return f"""
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width:600px; margin:24px auto; padding:32px 28px; border:1px solid #e5e7eb; border-radius:18px; color:#111; background:#ffffff;">
      <p style="font-size:11px; letter-spacing:0.22em; text-transform:uppercase; color:#8b6b1f; margin:0 0 10px; font-weight:800;">CarryOn · Voices</p>
      <h1 style="font-family: Georgia, 'Cormorant Garamond', serif; font-weight:600; font-size:34px; line-height:1.18; margin:0 0 8px; color:#0b1221;">What our members said <em style="color:#d4af37;">this week.</em></h1>
      <p style="font-size:15px; line-height:1.55; color:#475569; margin:0 0 18px;">Real words from real families who chose to share why they prepared. Curated by the CarryOn founder.</p>
      {body}
      <div style="margin:30px 0 6px; text-align:center;">
        <a href="{base_url}/voices" style="display:inline-block; padding:12px 22px; background:#080e1a; color:#d4af37; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px; border:1px solid #d4af37; margin:0 6px 8px;">Read more voices</a>
        <a href="{base_url}/dashboard?share=voice" style="display:inline-block; padding:12px 22px; background:#d4af37; color:#080e1a; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px; margin:0 6px 8px;">Add your own</a>
      </div>
      <p style="font-size:11px; color:#94a3b8; margin:24px 0 0; text-align:center; line-height:1.55;">You're receiving this because you're a CarryOn member. Preferences &rarr; <a href="{base_url}/settings" style="color:#94a3b8;">Settings</a>.</p>
    </div>"""


async def send_voices_digest(
    *,
    max_quotes: int = 5,
    min_quotes_to_send: int = 3,
    window_days: int = 7,
    force: bool = False,
    dry_run: bool = False,
) -> dict:
    """Send the weekly Voices Digest to every opted-in member. Idempotent per ISO-week."""
    week_key = _voices_digest_week_key()
    base = _moderation_base_url()

    if not force and not dry_run:
        existing = await db.voices_digest_sends.find_one({"week_key": week_key}, {"_id": 0, "id": 1, "week_key": 1})
        if existing:
            return {"skipped": True, "reason": f"already sent for {week_key}"}

    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    quotes_cursor = (
        db.share_quote_submissions.find(
            {"approval_status": "approved", "featured": True, "is_seed": False, "approved_at": {"$gte": since}},
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
    users = await db.users.find({"role": "benefactor"}, {"_id": 0, "id": 1, "email": 1, "first_name": 1}).to_list(
        length=5000
    )

    if dry_run:
        eligible = 0
        for u in users:
            if not (u.get("email") or "").strip():
                continue
            prefs = await db.user_preferences.find_one({"user_id": u["id"]}, {"_id": 0, "id": 1, "weekly_digest": 1})
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
        prefs = await db.user_preferences.find_one({"user_id": u["id"]}, {"_id": 0, "id": 1, "weekly_digest": 1})
        if prefs and prefs.get("weekly_digest") is False:
            skipped += 1
            continue
        try:
            if sent > 0:
                await _asyncio.sleep(0.6)
            await send_email(email, "This week on CarryOn · Voices", html)
            sent += 1
        except Exception:
            skipped += 1

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
        pass

    return {"week_key": week_key, "sent": sent, "skipped": skipped, "quotes_included": len(quotes)}


@router.post("/admin/voices/digest/send-now")
async def admin_send_voices_digest(
    force: bool = Query(False),
    dry_run: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    """Founder-only: manual trigger for the weekly Voices Digest."""
    check_founder_role(current_user)
    return await send_voices_digest(force=force, dry_run=dry_run)


# ── Monday Social Brief ───────────────────────────────────────────────────────


def _x_compose_url(text: str) -> str:
    return "https://twitter.com/intent/tweet?text=" + _urlparse.quote(text, safe="")


def _linkedin_compose_url(text: str) -> str:
    return "https://www.linkedin.com/feed/?shareActive=true&text=" + _urlparse.quote(text, safe="")


def _build_social_brief_posts(quote: str, first_name: str, variant: str) -> dict:
    chip = "Founding Member" if variant == "fc" else "CarryOn member"
    site = "https://carryon.us/voices"
    hashtags_x = "#FamilyReadiness #CarryOn"
    x_core = f'"{quote}"\n— {first_name}, {chip}\n\n{site}\n{hashtags_x}'
    if len(x_core) > 275:
        over = len(x_core) - 275
        trimmed = quote[: max(0, len(quote) - over - 1)].rstrip() + "…"
        x_core = f'"{trimmed}"\n— {first_name}, {chip}\n\n{site}\n{hashtags_x}'
    li_core = (
        f'"{quote}"\n— {first_name}, {chip}\n\nOne of our members, in their own words.\n\n'
        "CarryOn is the family preparedness platform for every American family. "
        "Estate planning, secure document vault, milestone messages, connected care protocols — "
        "the things your family would otherwise have to piece together alone.\n\n"
        f"More voices: {site}\n\n#FamilyReadiness #EstatePlanning #FinancialWellness #CarryOn"
    )
    return {"x": x_core, "linkedin": li_core}


def _voices_social_brief_html(*, quote: dict, posts: dict, card_url: Optional[str], base_url: str) -> str:
    variant = quote.get("variant") or "sub"
    first_name = quote.get("first_name") or "A CarryOn member"
    quote_text = quote.get("quote") or ""
    accent = "#d4af37" if variant == "fc" else "#34d399"
    x_url = _x_compose_url(posts["x"])
    li_url = _linkedin_compose_url(posts["linkedin"])
    card_block = (
        f'<div style="margin:0 0 22px; text-align:center;"><img src="{card_url}" alt="Weekly share card" style="display:inline-block; max-width:100%; width:360px; height:auto; border-radius:14px; border:1px solid #e5e7eb;"/></div>'
        if card_url
        else ""
    )
    return f"""
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width:640px; margin:24px auto; padding:32px 28px; border:1px solid #e5e7eb; border-radius:18px; color:#111; background:#ffffff;">
      <p style="font-size:11px; letter-spacing:0.22em; text-transform:uppercase; color:#8b6b1f; margin:0 0 10px; font-weight:800;">CarryOn · Monday Social Brief</p>
      <h1 style="font-family: Georgia, 'Cormorant Garamond', serif; font-weight:600; font-size:30px; line-height:1.2; margin:0 0 10px; color:#0b1221;">This week's post is <em style="color:{accent};">ready.</em></h1>
      <p style="font-size:14px; line-height:1.55; color:#475569; margin:0 0 20px;">Tap the button on each platform, paste the pre-written text, and post.</p>
      <blockquote style="font-family: Georgia, 'Cormorant Garamond', serif; font-style:italic; font-size:24px; line-height:1.42; color:#0b1221; border-left:3px solid {accent}; margin:0 0 12px; padding:6px 0 6px 18px;">&ldquo;{quote_text}&rdquo;</blockquote>
      <p style="font-size:13px; color:#64748b; margin:0 0 22px;">&mdash; {first_name}, {"Founding Member" if variant == "fc" else "CarryOn member"}</p>
      {card_block}
      <div style="margin:0 0 22px; padding:18px; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
        <p style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:#0b1221; font-weight:800; margin:0 0 8px;">X / Twitter · {len(posts["x"])} chars</p>
        <pre style="white-space:pre-wrap; font-family:system-ui,-apple-system,sans-serif; font-size:14px; line-height:1.5; color:#0b1221; margin:0 0 12px; padding:12px; background:#ffffff; border:1px solid #e5e7eb; border-radius:10px;">{posts["x"]}</pre>
        <a href="{x_url}" style="display:inline-block; padding:11px 20px; background:#0b1221; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Open X pre-filled</a>
      </div>
      <div style="margin:0 0 22px; padding:18px; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc;">
        <p style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:#0b1221; font-weight:800; margin:0 0 8px;">LinkedIn · {len(posts["linkedin"])} chars</p>
        <pre style="white-space:pre-wrap; font-family:system-ui,-apple-system,sans-serif; font-size:14px; line-height:1.5; color:#0b1221; margin:0 0 12px; padding:12px; background:#ffffff; border:1px solid #e5e7eb; border-radius:10px;">{posts["linkedin"]}</pre>
        <a href="{li_url}" style="display:inline-block; padding:11px 20px; background:#0a66c2; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:700; font-size:14px;">Open LinkedIn pre-filled</a>
      </div>
      <p style="font-size:11px; color:#94a3b8; margin:14px 0 0;">Only sent to the founder email on file. Preferences → <a href="{base_url}/admin/voices" style="color:#94a3b8;">Admin · Voices</a>.</p>
    </div>"""


async def send_voices_social_brief(*, window_days: int = 7, force: bool = False, dry_run: bool = False) -> dict:
    """Email the founder a Monday Social Brief. Idempotent per ISO-week."""
    week_key = _voices_digest_week_key()
    base = _moderation_base_url()

    if not force and not dry_run:
        existing = await db.voices_social_brief_sends.find_one(
            {"week_key": week_key}, {"_id": 0, "id": 1, "week_key": 1}
        )
        if existing:
            return {"skipped": True, "reason": f"already sent for {week_key}"}

    since = datetime.now(timezone.utc) - timedelta(days=window_days)
    quote = await db.share_quote_submissions.find_one(
        {"approval_status": "approved", "featured": True, "is_seed": False, "approved_at": {"$gte": since}},
        {"_id": 0, "id": 1, "variant": 1, "first_name": 1, "quote": 1},
        sort=[("approved_at", -1)],
    )
    if not quote:
        return {"skipped": True, "reason": "no eligible quote this week", "week_key": week_key}

    posts = _build_social_brief_posts(
        quote=quote.get("quote") or "",
        first_name=quote.get("first_name") or "A CarryOn member",
        variant=quote.get("variant") or "sub",
    )

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

    founder = await db.users.find_one({"role": "admin", "admin_scope": "founder"}, {"_id": 0, "id": 1, "email": 1})
    if not founder or not founder.get("email"):
        return {"skipped": True, "reason": "no founder email on file", "week_key": week_key}

    try:
        await send_email(founder["email"], "CarryOn · Monday Social Brief", html)
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

    return {"week_key": week_key, "sent": 1, "quote_id": quote.get("id")}


@router.post("/admin/voices/social-brief/send-now")
async def admin_send_voices_social_brief(
    force: bool = Query(False),
    dry_run: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    """Founder-only: manual trigger for the Monday Social Brief email."""
    check_founder_role(current_user)
    return await send_voices_social_brief(force=force, dry_run=dry_run)
