"""CarryOn™ — Onboarding Email Drip

Multi-touch nurture sequence for new benefactor signups. Runs daily,
finds users at days {0, 2, 7, 14, 28} since registration, and fires
templated emails via the existing Resend wrapper. Each step is recorded
on the user document so we never double-send a step.

Schedule
--------
- Day 0: "Welcome — three things to do tonight" (sent ~30 minutes after signup
         so the welcome from /auth/register doesn't double up)
- Day 2: "The IAC checklist — start here"
- Day 7: "Why your first Milestone Message matters"
- Day 14: "Are your beneficiaries ready?"
- Day 28: "Your trial ends soon — here's what you get"

Opt-out
-------
Respects user_preferences.onboarding_emails=false. Defaults to ON.
The footer of every email has a one-tap unsubscribe link routed
through /api/user-preferences/onboarding-emails (see same module).

Idempotency
-----------
A `onboarding_drip_state` field on the user document records the latest
step delivered. Each scheduler tick only sends the NEXT step that's due,
never re-sends a previous one.
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional

from config import db, logger
from services.email import send_email

# (day_offset, step_key, subject, html_template_factory)
DRIP_STEPS = [
    (0, "welcome", "Welcome to CarryOn — three things to do tonight"),
    (2, "iac_checklist", "Start with the Important Account Checklist"),
    (7, "milestone_message", "Your first Milestone Message — why it matters"),
    (14, "beneficiaries_ready", "Are your beneficiaries actually ready?"),
    (28, "trial_ending", "Your trial ends in 2 days — here's what you keep"),
]

STEP_KEYS_BY_INDEX = [s[1] for s in DRIP_STEPS]
STEP_KEY_TO_INDEX = {s[1]: i for i, s in enumerate(DRIP_STEPS)}


def _greet(user: dict) -> str:
    return (user.get("first_name") or user.get("name") or "friend").strip() or "friend"


def _wrap(body: str, *, subject: str, unsub_url: str) -> str:
    """Brand wrapper. Cormorant headline, Inter body, gold accent."""
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#0b1120;font-family:Inter,Arial,sans-serif;color:#e8e9ea;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:24px;">
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;color:#d4af37;font-weight:600;letter-spacing:0.02em;">CarryOn</div>
  </div>
  <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;line-height:1.2;color:#fff;font-weight:600;margin:0 0 18px 0;">{subject}</h1>
  <div style="font-size:15px;line-height:1.65;color:#cbd0d6;">{body}</div>
  <hr style="border:none;border-top:1px solid #1d2638;margin:32px 0 16px 0;" />
  <div style="font-size:12px;color:#6b7280;line-height:1.5;">
    You're getting this because you started a CarryOn account.
    <a href="{unsub_url}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from onboarding emails</a>.
  </div>
</div></body></html>"""


async def _render_step(step_key: str, user: dict, *, base_url: str) -> Optional[tuple[str, str]]:
    """Return (subject, html). None if step is not renderable."""
    name = _greet(user)
    dashboard = f"{base_url}/dashboard"
    iac = f"{base_url}/checklist"
    messages = f"{base_url}/messages"
    bens = f"{base_url}/beneficiaries"
    sub = f"{base_url}/subscription"
    unsub = f"{base_url}/settings#email-prefs"
    cta = lambda label, url: (  # noqa: E731
        f'<a href="{url}" style="display:inline-block;background:#d4af37;color:#0b1120;'
        f"padding:12px 22px;border-radius:8px;font-weight:600;text-decoration:none;"
        f'font-size:14px;letter-spacing:0.02em;">{label}</a>'
    )

    if step_key == "welcome":
        subj = f"Welcome to CarryOn, {name}"
        body = f"""
            <p>You took the first step. That alone puts you ahead of most American families.</p>
            <p>Three things to do tonight, in this order:</p>
            <ol style="padding-left:18px;line-height:1.8;">
              <li>Add your spouse or trustee as your first beneficiary.</li>
              <li>Open the <em>Important Account Checklist</em> and add three accounts.</li>
              <li>Record one short voice message to your kids — even 30 seconds.</li>
            </ol>
            <p>That's the whole job tonight. Twenty minutes. Then sleep on it.</p>
            <p style="margin:28px 0;">{cta("Open my dashboard", dashboard)}</p>
            <p style="font-style:italic;color:#9ca3af;">Tomorrow's a new day. We'll be here.</p>
        """
    elif step_key == "iac_checklist":
        subj = "Start with the Important Account Checklist"
        body = f"""
            <p>{name} — quick check. The single thing your family will thank you for is a clear list of every account you have. Bank, brokerage, employer, streaming, the dental insurance from the job you left in 2019.</p>
            <p>The IAC is built for exactly this. It walks you through the categories most families forget — and it's the one feature beneficiaries say they wish they'd had.</p>
            <p style="margin:28px 0;">{cta("Open the checklist", iac)}</p>
            <p>Goal for today: 5 accounts. Twelve minutes.</p>
        """
    elif step_key == "milestone_message":
        subj = "Your first Milestone Message"
        body = f"""
            <p>You don't have to record the perfect message. You have to record one.</p>
            <p>Pick a date your family will need to hear from you — a wedding, a 30th birthday, a quiet Tuesday morning years from now. Hit record. Say what you'd say.</p>
            <p>This is the feature CarryOn members come back to most. Not because it's clever. Because it's honest.</p>
            <p style="margin:28px 0;">{cta("Record a message", messages)}</p>
            <p style="font-style:italic;color:#9ca3af;">"Hi sweetheart. I knew this day was coming. I wanted to tell you something."</p>
        """
    elif step_key == "beneficiaries_ready":
        subj = "Are your beneficiaries actually ready?"
        body = f"""
            <p>Two weeks in. Time for the question most plans skip:</p>
            <p><strong>Do the people who'll need this know it exists?</strong></p>
            <p>If your beneficiary tab still says "draft" or "pending invitation", they don't. That's the next twenty minutes of your evening — invite them, walk them through one document, watch their shoulders drop.</p>
            <p style="margin:28px 0;">{cta("Review beneficiaries", bens)}</p>
        """
    elif step_key == "trial_ending":
        from routes.admin.trial_policy import get_trial_days

        trial_days = await get_trial_days()
        subj = "Your trial ends in 2 days"
        body = f"""
            <p>Your {trial_days}-day Premium trial wraps up shortly, {name}. Two paths:</p>
            <ul style="padding-left:18px;line-height:1.8;">
              <li><strong>Continue on Premium</strong> — everything you've built stays, including CarryOn Contingency Protocols, Estate Chat, and your full vault.</li>
              <li><strong>Drop to Base (free)</strong> — your data stays. You keep your beneficiary, your IAC, and document vault. Premium-only features pause until you upgrade.</li>
            </ul>
            <p>No surprise charges. We'll never auto-charge a card you haven't entered.</p>
            <p style="margin:28px 0;">{cta("See plans", sub)}</p>
        """
    else:
        return None

    return subj, _wrap(body, subject=subj, unsub_url=unsub)


async def _send_step_for_user(user: dict, step_idx: int, *, base_url: str) -> bool:
    step_offset, step_key, _label = DRIP_STEPS[step_idx]
    rendered = await _render_step(step_key, user, base_url=base_url)
    if not rendered:
        return False
    subject, html = rendered

    # Atomic guard — only the first writer wins, prevents double-send across pods
    res = await db.users.update_one(
        {
            "id": user["id"],
            "$or": [
                {"onboarding_drip_state": {"$exists": False}},
                {"onboarding_drip_state.last_step_idx": {"$lt": step_idx}},
            ],
        },
        {
            "$set": {
                "onboarding_drip_state.last_step_idx": step_idx,
                "onboarding_drip_state.last_step_key": step_key,
                "onboarding_drip_state.last_sent_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    if res.modified_count == 0:
        return False

    sent = await send_email(user["email"], subject, html)
    if not sent:
        # Roll back so we retry on the next tick
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"onboarding_drip_state.last_step_idx": step_idx - 1}},
        )
        return False
    logger.info(f"onboarding_drip: sent step={step_key} idx={step_idx} → {user['email']}")
    return True


async def _is_opted_out(user_id: str) -> bool:
    pref = await db.user_preferences.find_one({"user_id": user_id}, {"_id": 0, "onboarding_emails": 1})
    if not pref:
        return False
    return pref.get("onboarding_emails") is False


async def run_drip_pass(*, base_url: Optional[str] = None) -> dict:
    """Single pass through the eligible cohort. Returns send counts."""
    import os as _os

    base_url = base_url or _os.environ.get("FRONTEND_URL", "https://app.carryon.us").rstrip("/")
    sent_counts = {step[1]: 0 for step in DRIP_STEPS}
    skipped = 0
    now = datetime.now(timezone.utc)

    cursor = db.users.find(
        {
            "role": "benefactor",
            "email": {"$exists": True, "$ne": ""},
            "created_at": {"$exists": True},
            "subscription_status": {"$ne": "cancelled"},
        },
        {
            "_id": 0,
            "id": 1,
            "email": 1,
            "first_name": 1,
            "name": 1,
            "created_at": 1,
            "onboarding_drip_state": 1,
            "subscription_status": 1,
        },
    )
    async for user in cursor:
        try:
            created_iso = user.get("created_at")
            if not created_iso or not user.get("email"):
                continue
            try:
                created = datetime.fromisoformat(str(created_iso).replace("Z", "+00:00"))
            except ValueError:
                continue
            age_days = (now - created.astimezone(timezone.utc)).total_seconds() / 86400.0

            # Decide which step is due (if any)
            last_idx = (user.get("onboarding_drip_state") or {}).get("last_step_idx", -1)
            target_idx = -1
            for idx, (offset, _key, _subj) in enumerate(DRIP_STEPS):
                if age_days >= offset:
                    target_idx = idx
            if target_idx <= last_idx:
                continue

            # Day 0 step: wait at least 30 minutes after signup so the registration
            # OTP/welcome doesn't double up.
            if target_idx == 0 and age_days < (30 / 1440.0):
                continue

            if await _is_opted_out(user["id"]):
                skipped += 1
                continue

            if await _send_step_for_user(user, target_idx, base_url=base_url):
                sent_counts[STEP_KEYS_BY_INDEX[target_idx]] += 1
            # Light rate-limit: Resend free is 2 req/s
            await asyncio.sleep(0.55)
        except Exception as e:
            logger.warning(f"onboarding_drip: user={user.get('id')} step error: {e}")

    return {"sent": sent_counts, "skipped_opt_out": skipped}


async def onboarding_drip_scheduler():
    """Daily scheduler entrypoint, wrapped with distributed lock in server.py."""
    while True:
        try:
            result = await run_drip_pass()
            logger.info(f"onboarding_drip: cycle complete {result}")
        except Exception as e:
            logger.error(f"onboarding_drip: cycle crashed: {e}")
        # Run once every 6 hours; the per-user idempotency guard prevents repeats.
        await asyncio.sleep(6 * 3600)
