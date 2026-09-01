"""Partner Weekly Digest — emails each partner manager (with an email on
file) a Monday recap of client signups, claims, subscriptions, and
beneficiary link progress for their roster."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from config import db, logger
from routes.admin.partners import _ensure_founder
from routes.pro_clients import _frontend_base
from services.email import send_email_ex
from utils import get_current_user

router = APIRouter()


async def gather_partner_week(partner: dict) -> dict:
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    members = await db.users.find(
        {"partner_id": partner["id"]},
        {"_id": 0, "id": 1, "created_at": 1, "claimed_at": 1},
    ).to_list(4000)
    member_ids = [m["id"] for m in members]

    subs_total = subs_new = 0
    estate_ids: list = []
    if member_ids:
        subs = await db.user_subscriptions.find(
            {"user_id": {"$in": member_ids}, "status": "active"},
            {"_id": 0, "activated_at": 1},  # pre-push-invariants: allow-missing-id
        ).to_list(4000)
        subs_total = len(subs)
        subs_new = sum(1 for s in subs if (s.get("activated_at") or "") >= week_ago)
        estates = await db.estates.find({"owner_id": {"$in": member_ids}}, {"_id": 0, "id": 1}).to_list(4000)
        estate_ids = [e["id"] for e in estates]

    bens_total = bens_linked = invites_sent_week = linked_week = 0
    if estate_ids:
        bens = await db.beneficiaries.find(
            {"estate_id": {"$in": estate_ids}, "deleted_at": None},
            {
                "_id": 0,
                "user_id": 1,
                "invitation_status": 1,
                "invitation_sent_at": 1,
                "invitation_accepted_at": 1,
            },  # pre-push-invariants: allow-missing-id
        ).to_list(8000)
        bens_total = len(bens)
        for b in bens:
            linked = bool(b.get("user_id")) or b.get("invitation_status") == "accepted"
            if linked:
                bens_linked += 1
                if (b.get("invitation_accepted_at") or "") >= week_ago:
                    linked_week += 1
            if (b.get("invitation_sent_at") or "") >= week_ago:
                invites_sent_week += 1

    return {
        "week_start": (now - timedelta(days=7)).strftime("%b %d"),
        "week_end": now.strftime("%b %d, %Y"),
        "clients_total": len(members),
        "clients_new": sum(1 for m in members if (m.get("created_at") or "") >= week_ago),
        "claims_new": sum(1 for m in members if (m.get("claimed_at") or "") >= week_ago),
        "subs_total": subs_total,
        "subs_new": subs_new,
        "bens_total": bens_total,
        "bens_linked": bens_linked,
        "invites_sent_week": invites_sent_week,
        "linked_week": linked_week,
    }


def _stat_row(label: str, value, *, accent: str = "#333") -> str:
    return f"""
        <tr>
            <td style="padding: 8px 12px; color: #555; font-size: 14px; border-bottom: 1px solid #f0f0f0;">{label}</td>
            <td style="padding: 8px 12px; color: {accent}; font-size: 16px; font-weight: bold; text-align: right; border-bottom: 1px solid #f0f0f0;">{value}</td>
        </tr>"""


def build_partner_digest_html(partner: dict, manager_name: str, stats: dict) -> str:
    first = (manager_name or "there").split(" ")[0]
    portal_url = f"{_frontend_base()}/partner"
    company = partner.get("company_name", "CarryOn")
    linked_ratio = "{} / {}".format(stats["bens_linked"], stats["bens_total"])
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #d4af37; margin: 0;">CarryOn&trade;</h1>
            <p style="color: #666; margin: 4px 0 0;">{company} &mdash; Weekly Partner Digest</p>
            <p style="color: #999; font-size: 13px; margin: 2px 0 0;">{stats["week_start"]} &ndash; {stats["week_end"]}</p>
        </div>

        <p style="color: #555; line-height: 1.6;">Hi {first}, here's what happened on your roster this week.</p>

        <h2 style="color: #333; font-size: 15px; margin: 20px 0 6px;">This week</h2>
        <table style="width: 100%; border-collapse: collapse; background-color: #fafafa; border: 1px solid #eee; border-radius: 8px;">
            {_stat_row("New clients added", stats["clients_new"], accent="#b8962e" if stats["clients_new"] else "#333")}
            {_stat_row("Portals claimed", stats["claims_new"])}
            {_stat_row("New subscriptions", stats["subs_new"], accent="#2d6a4f" if stats["subs_new"] else "#333")}
            {_stat_row("Beneficiary invites sent", stats["invites_sent_week"])}
            {_stat_row("Beneficiary accounts linked", stats["linked_week"], accent="#2d6a4f" if stats["linked_week"] else "#333")}
        </table>

        <h2 style="color: #333; font-size: 15px; margin: 20px 0 6px;">Roster at a glance</h2>
        <table style="width: 100%; border-collapse: collapse; background-color: #fafafa; border: 1px solid #eee; border-radius: 8px;">
            {_stat_row("Total clients", stats["clients_total"])}
            {_stat_row("Active subscriptions", stats["subs_total"])}
            {_stat_row("Beneficiaries linked / total", linked_ratio)}
        </table>

        <div style="text-align: center; margin: 28px 0;">
            <a href="{portal_url}"
               style="background-color: #d4af37;
                      color: #0B1221;
                      padding: 14px 32px;
                      text-decoration: none;
                      border-radius: 8px;
                      border: 1px solid #b8962e;
                      font-weight: bold;
                      display: inline-block;">
                Open Your Partner Portal
            </a>
        </div>

        <p style="color: #888; font-size: 12px; text-align: center; line-height: 1.6; word-break: break-all;">
            Button not working? Copy and paste this link into your browser:<br>
            <a href="{portal_url}" style="color: #b8962e;">{portal_url}</a>
        </p>
    </div>
    """


async def send_partner_weekly_digest() -> dict:
    partners = await db.b2b_partners.find(
        {"active": {"$ne": False}}, {"_id": 0, "id": 1, "company_name": 1, "slug": 1}
    ).to_list(500)
    managers_by_partner: dict = {}
    if partners:
        all_managers = await db.partner_managers.find(
            {
                "partner_id": {"$in": [p["id"] for p in partners]},
                "active": True,
                "email": {"$type": "string", "$ne": ""},
                "digest_opt_out": {"$ne": True},
            },
            {"_id": 0, "partner_id": 1, "name": 1, "email": 1},  # pre-push-invariants: allow-missing-id
        ).to_list(2000)
        for m in all_managers:
            managers_by_partner.setdefault(m["partner_id"], []).append(m)
    sent = skipped = 0
    for partner in partners:
        managers = managers_by_partner.get(partner["id"], [])
        if not managers:
            skipped += 1
            continue
        stats = await gather_partner_week(partner)
        if stats["clients_total"] == 0:
            skipped += 1
            continue
        subject = f"{partner.get('company_name', 'CarryOn')} weekly recap — {stats['week_end']}"
        for mgr in managers:
            result = await send_email_ex(
                mgr["email"], subject, build_partner_digest_html(partner, mgr.get("name", ""), stats)
            )
            if result["ok"]:
                sent += 1
                logger.info(f"Partner digest sent to {mgr['email']} ({partner.get('slug')})")
            else:
                logger.error(f"Partner digest failed for {mgr['email']}: {result['error']}")
    return {"sent": sent, "skipped": skipped}


def _signup_alert_html(company: str, manager_name: str, client_name: str, client_email: str, portal_url: str) -> str:
    first = (manager_name or "there").split(" ")[0]
    who = client_name or client_email or "A new client"
    email_part = f" ({client_email})" if client_email else ""
    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #d4af37; margin: 0;">CarryOn&trade;</h1>
            <p style="color: #666; margin: 4px 0 0;">{company} &mdash; New Client Alert</p>
        </div>
        <p style="color: #555; line-height: 1.6;">Hi {first},</p>
        <p style="color: #555; line-height: 1.6;">
            <strong>{who}</strong>{email_part} just joined your roster through your landing page.
            Their portal is live and you can start preparing their account right away.
        </p>
        <div style="text-align: center; margin: 28px 0;">
            <a href="{portal_url}"
               style="background-color: #d4af37;
                      color: #0B1221;
                      padding: 14px 32px;
                      text-decoration: none;
                      border-radius: 8px;
                      border: 1px solid #b8962e;
                      font-weight: bold;
                      display: inline-block;">
                Open Your Partner Portal
            </a>
        </div>
        <p style="color: #888; font-size: 12px; text-align: center; line-height: 1.6; word-break: break-all;">
            Button not working? Copy and paste this link into your browser:<br>
            <a href="{portal_url}" style="color: #b8962e;">{portal_url}</a>
        </p>
    </div>
    """


async def send_client_signup_alert(partner: dict, user: dict) -> None:
    """Instant email to partner managers when a new client self-attributes
    via the partner landing page (codeless or code redemption)."""
    managers = await db.partner_managers.find(
        {
            "partner_id": partner["id"],
            "active": True,
            "email": {"$type": "string", "$ne": ""},
            "alerts_opt_out": {"$ne": True},
        },
        {"_id": 0, "name": 1, "email": 1},  # pre-push-invariants: allow-missing-id
    ).to_list(50)
    if not managers:
        return
    portal_url = f"{_frontend_base()}/partner"
    company = partner.get("company_name", "CarryOn")
    subject = f"New client on your roster — {user.get('name') or user.get('email', '')}"
    for mgr in managers:
        html = _signup_alert_html(company, mgr.get("name", ""), user.get("name", ""), user.get("email", ""), portal_url)
        result = await send_email_ex(mgr["email"], subject, html)
        if not result["ok"]:
            logger.warning(f"Signup alert failed for {mgr['email']}: {result['error']}")


@router.post("/admin/partners/digest/send")
async def trigger_partner_digest(current_user: dict = Depends(get_current_user)):
    """Manually trigger the weekly partner digest (founder only)."""
    _ensure_founder(current_user)
    return await send_partner_weekly_digest()


@router.get("/admin/partners/digest/preview")
async def preview_partner_digest(partner_id: str, current_user: dict = Depends(get_current_user)):
    """Preview a partner's digest HTML + stats without sending (founder only)."""
    _ensure_founder(current_user)
    partner = await db.b2b_partners.find_one({"id": partner_id}, {"_id": 0, "id": 1, "company_name": 1, "slug": 1})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found.")
    stats = await gather_partner_week(partner)
    return {"stats": stats, "html": build_partner_digest_html(partner, "Preview", stats)}
