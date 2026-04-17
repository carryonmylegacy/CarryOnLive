# CarryOn™ — Incident Response Runbook

**When something goes wrong, read this first.** Don't panic. Don't tweet.
Don't post on Reddit. Come here.

This document assumes zero coding knowledge. Every step is either "click
this link" or "copy-paste this and tell me the output."

---

## When to use this

- Users reporting the site is down
- Users reporting they can't log in
- Users reporting they paid but don't have access
- You see red alerts in the War Room (`/admin/war-room`)
- Sentry is blowing up with errors
- Your phone got 3+ support emails in 5 minutes

---

## The 30-Second Triage

Before doing anything else, check these 3 URLs. It takes 30 seconds total:

1. **https://app.carryon.us/api/status** → Should say `"status":"operational"`
2. **https://carryon.betteruptime.com** → Should be all green
3. **https://sentry.io** → Is there a spike in the last hour?

Based on what you see:

| Status endpoint | Better Stack | Sentry | Likely Issue | Jump to |
|---|---|---|---|---|
| 🟢 operational | 🟢 up | 🟢 quiet | Isolated user issue | [Section A](#a-isolated-user-issue) |
| 🟡 degraded | 🟢 up | 🟡 errors | Database slow | [Section B](#b-database-slow-or-down) |
| 🔴 down / no response | 🔴 down | 🔴 errors | Backend crashed | [Section C](#c-backend-is-down) |
| 🟢 operational | 🟢 up | 🔴 errors | Bug in new code | [Section D](#d-bug-in-new-code) |
| 🟢 operational | 🟢 up | 🟢 quiet | Payment issue | [Section E](#e-payment-issue) |

---

## A. Isolated user issue

A specific user reports a problem but nobody else is affected.

### Steps:

1. **Get their email** from the support message.

2. **Go to War Room**: `https://app.carryon.us/admin/war-room`
   - If error rate is 0%, it's definitely isolated.

3. **Look up the user**: press `⌘K` (or `Ctrl+K`), type their email, press Enter.

4. **Check their account state**:
   - Is their subscription `active`?
   - Do they have an estate?
   - Have they verified their email (OTP)?

5. **Common causes**:
   - Forgot password → send reset link from admin
   - Subscription lapsed → check Grace Periods tab
   - Browser cache → ask them to try incognito mode
   - Account locked → check Audit Trail for "account lockout"

6. **Reply to their support email** with what you found. If you can't figure
   it out, tell them "We're looking into this — expect a response within 4 hours"
   and escalate to me.

---

## B. Database Slow or Down

Site is loading but slowly, or showing errors on some pages.

### Steps:

1. **Go to MongoDB Atlas**: https://cloud.mongodb.com → your cluster

2. **Click "Metrics" tab**. Look for:
   - **Connections**: is it near the limit? (e.g., 95/100)
   - **Operation Execution Time**: has it spiked in the last hour?
   - **IOPS**: is it maxed out?

3. **If connections are maxed**:
   - Probably a "connection leak" — a bug where the app opens DB connections but doesn't close them
   - **Fix**: in Railway → backend service → click **"Redeploy"**. This restarts the backend and clears all connections.
   - Wait 2 minutes, then check the status endpoint again.

4. **If operation time has spiked**:
   - Your DB is under too much load.
   - **Fix**: In Atlas → cluster → click **"Modify cluster"** → temporarily upgrade to a bigger tier (M20 → M30). This takes ~10 min but adds CPU/RAM. You can downgrade later.

5. **If you don't know what's happening**:
   - Tell me: send me the timestamp of when it started + a screenshot of the Atlas metrics page.

---

## C. Backend is Down

The status endpoint returns nothing, or an error. The site is completely inaccessible.

### Steps:

1. **Go to Railway**: https://railway.app → your project

2. **Click the backend service**. Look at the **"Deployments"** tab.
   - Is there a "Crashed" status? If yes, the most recent deploy is broken.

3. **Click the crashed deployment → "View Logs"**. Read the last ~50 lines.
   Look for:
   - `ModuleNotFoundError` = missing Python package
   - `ConnectionRefusedError` = can't reach MongoDB
   - `ImportError` = bad code was deployed

4. **Rollback the deploy** (this is the fastest way to recovery):
   - In Railway → Deployments → find the previous GREEN deployment
   - Click the "..." next to it → **"Redeploy"**
   - Wait 3 minutes
   - Check status endpoint

5. **Once the site is back up**, tell me what the logs said and I'll fix
   the actual bug before you redeploy.

**If Railway itself is down** (rare): check https://status.railway.app

---

## D. Bug in new code

Site works for most users, but specific features are broken.

### Steps:

1. **Go to Sentry**: https://sentry.io → carryon-backend

2. **Look at the top of "Issues"**. The loudest error (most events) is
   usually the one to fix.

3. **Click the top issue**. You'll see:
   - A stack trace (code location)
   - How many users are affected
   - When it started

4. **Copy the entire issue page URL**. Send it to me.

5. **Temporarily**: can you identify which feature is broken? If it's
   non-essential (e.g., the Emergency Card PDF), leave it broken for now.
   If it's core (e.g., login), go to Section C and rollback.

---

## E. Payment Issue

User paid but doesn't have access. Or vice versa.

### Steps:

1. **Get their email + Stripe receipt** from the support message.

2. **Look up the session in Stripe**:
   - https://dashboard.stripe.com → **Payments** → search by email
   - Did the payment succeed? (should say "Succeeded" in green)

3. **If payment succeeded but access is not granted**:
   - The webhook might have failed.
   - Go to Stripe → **Developers → Events** → find the
     `checkout.session.completed` event for their session
   - Click it → scroll to "Webhook attempts"
   - If any attempts failed (red), click **"Resend"** on them
   - Wait 1 minute, then check War Room for signups_last_5m

4. **If the webhook succeeded but they still don't have access**:
   - There's a bug in the subscription activation code
   - **Manual fix**: in the admin portal → Users → find them → grant their
     tier manually via the "Override" button
   - Tell me the session ID so I can fix the code

5. **If they were charged twice**:
   - Go to Stripe → Payments → find the duplicate charge
   - Click "Refund" → full amount → reason "duplicate"
   - Apologize to the user — this shouldn't happen with our idempotent checkout

---

## The "I Don't Know What To Do" Protocol

When something is happening and you can't tell what, follow this in order:

1. **Breathe.** 99% of incidents aren't actually catastrophic.
2. **Check the status endpoint.** That tells you if the platform is up.
3. **Check Better Stack.** That confirms from an outside perspective.
4. **Check Sentry.** That tells you what's erroring.
5. **Check the War Room.** That shows live traffic + scheduler health.
6. **Decide**: is this isolated (1 user) or widespread (many users)?
7. **Widespread + critical**: rollback (Section C).
8. **Anything else**: message me with screenshots from steps 2-5.

---

## Golden Rules

1. **Don't panic-post to social media** about incidents before they're resolved.
2. **Don't make code changes in production during an incident** — rollback first, fix later.
3. **Don't promise users specific fixes** until you've confirmed them.
4. **Don't delete anything** from the database during an incident — you can always fix data later.
5. **Always write down what you did** so we can learn for next time.

---

## Incident Journal

Keep a running log of every real incident. At minimum record:
- Date/time it started
- What happened (user-facing symptom)
- What caused it (once diagnosed)
- How it was fixed
- How long it lasted
- What you'll change to prevent recurrence

Template:
```
## YYYY-MM-DD HH:MM UTC — <short name>
**Symptom**:
**Cause**:
**Fix**:
**Duration**:
**Prevention**:
```

Keep this file in `/app/memory/INCIDENT_LOG.md` (create it on first incident).
