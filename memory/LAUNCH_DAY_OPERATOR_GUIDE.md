# CarryOn™ — Launch-Day Operator's Guide

**This document assumes zero coding knowledge.** Each task is written as if
you've never opened a terminal. If a step doesn't work exactly as described,
stop and ask for help — don't guess.

> **Estimated total time to complete everything here: 90 minutes.**

---

## Table of Contents

1. [Turn on Error Monitoring (Sentry)](#1-turn-on-error-monitoring-sentry) — 15 min
2. [Set up a Public Status Page](#2-set-up-a-public-status-page) — 20 min
3. [Verify Your MongoDB Backups](#3-verify-your-mongodb-backups) — 10 min
4. [Verify the Stripe Webhook Secret](#4-verify-the-stripe-webhook-secret) — 15 min
5. [Run Your First Load Test](#5-run-your-first-load-test) — 20 min
6. [Activate the Pre-Commit Safety Net](#6-activate-the-pre-commit-safety-net) — 5 min
7. [Snapshot Your Database Schema](#7-snapshot-your-database-schema) — 5 min

When you're done with all 7, you are an **8/10**, not a 7.

---

# 1. Turn on Error Monitoring (Sentry)

**What this does:** When a user hits a bug, you'll get an email and see it
on a dashboard — instead of finding out from a support ticket 3 days later.

**Cost:** FREE for up to 5,000 errors per month. You won't hit that in the
first several months.

## Step 1.1 — Create your Sentry account

1. Open your web browser and go to **https://sentry.io/signup/**
2. Click **"Sign up with Google"** (use your CarryOn Google account if you have one)
3. When it asks for an organization name, type **`carryon`**
4. When it asks which platform, click **"Skip for now"** or **"I'll set up later"**

You're now in Sentry. You'll see an empty dashboard.

## Step 1.2 — Create a project for the backend

1. In the left sidebar, click **"Projects"**
2. Click the big **"Create Project"** button in the top right
3. Under "Choose your platform", search for and click **"FastAPI"** (has a Python logo)
4. Under "Set your alert frequency", choose **"Alert me on every new issue"**
5. Project name: type **`carryon-backend`**
6. Team: leave as default
7. Click **"Create Project"**

Sentry will now show you a page with a big block of code. **Do NOT copy that code.** Instead, look for the line that starts with:

```
dsn="https://...@...ingest.sentry.io/..."
```

Copy the ENTIRE thing inside the quotes (the `https://...ingest.sentry.io/...` URL). This is your **backend DSN**. Paste it into a text file on your computer temporarily and label it "BACKEND SENTRY DSN".

## Step 1.3 — Create a project for the frontend

1. In Sentry, in the left sidebar, click **"Projects"** again
2. Click **"Create Project"** again
3. Search for and click **"React"**
4. Alert frequency: **"Alert me on every new issue"**
5. Project name: **`carryon-frontend`**
6. Click **"Create Project"**

Same as before — find the `dsn="https://..."` line, copy the URL. Label it "FRONTEND SENTRY DSN".

You now have **two DSNs** saved in a text file.

## Step 1.4 — Add the DSNs to your production environment

This step depends on where CarryOn is deployed. **Most likely: Railway.**

### If deployed on Railway:

1. Go to **https://railway.app** and log in
2. Click on your **CarryOn project**
3. You'll see a list of services (backend, frontend). Click the **backend** service.
4. Click the **"Variables"** tab at the top
5. Click **"+ New Variable"**
6. Name: `SENTRY_DSN`
7. Value: paste the **BACKEND** DSN you saved
8. Click **"Add"**
9. Click **"+ New Variable"** again
10. Name: `SENTRY_ENVIRONMENT`
11. Value: `production`
12. Click **"Add"**
13. Now click on the **frontend** service
14. Click **"Variables"**
15. Click **"+ New Variable"**
16. Name: `REACT_APP_SENTRY_DSN`
17. Value: paste the **FRONTEND** DSN you saved
18. Click **"Add"**
19. Click **"+ New Variable"** again
20. Name: `REACT_APP_SENTRY_ENV`
21. Value: `production`
22. Click **"Add"**
23. Railway will automatically redeploy both services. Wait ~3 minutes.

### If deployed on Render, Vercel, or another provider:

The concept is identical — find the "Environment Variables" section and add the same 4 variables. The variable names must be EXACT:
- Backend service: `SENTRY_DSN` and `SENTRY_ENVIRONMENT`
- Frontend service: `REACT_APP_SENTRY_DSN` and `REACT_APP_SENTRY_ENV`

## Step 1.5 — Verify Sentry is working

1. Go back to **https://sentry.io**, click **Projects**, click **carryon-backend**
2. You'll see a message like "Waiting for events..."
3. In a new tab, visit your app: **https://app.carryon.us** (or whatever your live URL is)
4. Click around in the app for 30 seconds
5. If anything errors out, it will show up in Sentry within 1 minute
6. If nothing errors: go to https://app.carryon.us/api/errors/test (this intentionally errors)
7. Check Sentry again — you should see "Test error" appear

Done. Sentry is live.

---

# 2. Set up a Public Status Page

**What this does:** Gives you (and your users) a public URL that shows
whether CarryOn is up or down. Looks professional. Builds trust.

**Cost:** FREE tier is fine to start. Paid is $29/mo if you want SMS alerts
during incidents.

**Recommended provider:** **Better Stack** (formerly Better Uptime) — easier
than Atlassian's Statuspage. If you prefer Statuspage.io, the steps are similar.

## Step 2.1 — Create a Better Stack account

1. Go to **https://betterstack.com/**
2. Click **"Start for free"** (top right)
3. Sign up with your Google account
4. When asked "What would you like to monitor?", choose **"Website"**

## Step 2.2 — Set up the uptime monitor

1. You'll land on the Uptime dashboard
2. Click **"+ Create monitor"** (or similar, might be called "Add monitor")
3. URL to monitor: **`https://app.carryon.us/api/status`**
   *(If your domain is different, use your actual domain + `/api/status`)*
4. Monitor name: **"CarryOn Platform"**
5. Request method: **GET**
6. Expected status code: **200**
7. Check frequency: **3 minutes** (free tier)
8. Click **"Create monitor"**

Better Stack will check your site every 3 minutes. If it goes down, you get
an email + push notification within 1 minute.

## Step 2.3 — Create the public status page

1. In the left sidebar, click **"Status pages"**
2. Click **"Create status page"**
3. Page name: **"CarryOn Status"**
4. Subdomain: **`carryon`** (so the URL is `carryon.betteruptime.com` — free)
5. On the next screen, add your monitor: pick **"CarryOn Platform"**
6. Click **"Create status page"**
7. Your status page is now live at **https://carryon.betteruptime.com**
8. You can add a link to this page in your website footer and in your
   in-app Settings page. (Optional, but adds trust.)

## Step 2.4 — Set up alert notifications

1. Back in the dashboard, click **"Profile"** (top right)
2. Click **"Notification preferences"**
3. Add your phone number and opt in to **SMS alerts for incidents**
   (SMS is a paid feature but the first 5 SMS/month are free)
4. Save

Done. You now have a public status page + automatic down-detection.

---

# 3. Verify Your MongoDB Backups

**What this does:** Ensures that if Mongo dies, you can restore from backup.
**Most solo founders forget this. Don't.**

**Cost:** Usually already included in your Mongo Atlas plan.

## Step 3.1 — Log into MongoDB Atlas

1. Go to **https://cloud.mongodb.com**
2. Log in with the account that owns your CarryOn database
3. You'll see a list of "Projects". Click on your CarryOn project.

## Step 3.2 — Confirm backups are ON

1. In the left sidebar, click **"Database"** (under "DEPLOYMENT")
2. You'll see your cluster (probably named something like `carryon-cluster`)
3. Click the **"..."** menu next to your cluster name
4. Click **"Edit Configuration"**
5. Scroll down to **"Backup"** section
6. Verify **"Cloud Backup"** is **ON** (should be on by default for M10+ tiers)
7. If it's OFF, toggle it ON
8. Click **"Review Changes"** then **"Apply Changes"**

## Step 3.3 — Check your backup schedule

1. Click back to your cluster
2. Click the **"Backup"** tab at the top
3. You should see a schedule like:
   - Hourly snapshots kept for 2 days
   - Daily snapshots kept for 7 days
   - Weekly snapshots kept for 4 weeks
   - Monthly snapshots kept for 12 months
4. If you don't see this, click **"Edit Snapshot Schedule"** and enable the defaults

## Step 3.4 — Do a test restore (CRITICAL)

This is the step most people skip and regret later.

1. Still on the **Backup** tab
2. Find the most recent snapshot (should be from the last hour or so)
3. Click **"Restore"** next to it
4. Choose **"Restore to a new cluster"** (not your live one!)
5. Name the new cluster: **`carryon-restore-test`**
6. Choose the smallest tier (M10 or even M2/M5)
7. Click **"Restore"**
8. Wait ~15 minutes for the restore to complete

Once it finishes:

9. You'll see the new cluster appear in your list with a green status
10. Click on it → **Collections** → confirm you see users, estates, documents, etc.
11. **You now have proof you can restore from backup.**
12. Delete the test cluster to save money:
    - Click **"..."** next to `carryon-restore-test`
    - Click **"Terminate"**
    - Confirm

**Repeat this drill once every 3 months.** Put it in your calendar.

---

# 4. Verify the Stripe Webhook Secret

**What this does:** Prevents attackers from forging fake "payment succeeded"
events and getting free subscriptions. CarryOn's code is now prepared for
this — you just need to provide the secret.

**Cost:** FREE (already in your Stripe account)

## Step 4.1 — Find your Stripe webhook secret

1. Go to **https://dashboard.stripe.com**
2. Make sure you're in **LIVE mode** (top-left toggle — the word should say "Live")
3. In the left sidebar, click **"Developers"**
4. Click **"Webhooks"**
5. You should see a webhook endpoint like `https://app.carryon.us/api/webhook/stripe`
   *(If you don't see one, that's a bigger problem — tell me.)*
6. Click on that webhook
7. Look for **"Signing secret"** — it will say "Click to reveal"
8. Click to reveal. It will look like: `wh`+`sec_` followed by a long random string
9. Copy that entire value (starts with the `wh`+`sec_` prefix)

## Step 4.2 — Add it to your production environment

1. Go to **Railway** (or wherever CarryOn is deployed)
2. Click your project → **backend** service → **Variables**
3. Click **"+ New Variable"**
4. Name: `STRIPE_WEBHOOK_SECRET`
5. Value: paste the signing secret value (starts with `wh`+`sec_`)
6. Click **"Add"**
7. Wait for the automatic redeploy (~2 minutes)

## Step 4.3 — Test it works

After the redeploy completes, visit:
**`https://app.carryon.us/api/status`**

It should return something like:
```
{"status":"operational","version":"...","timestamp":"..."}
```

If yes, your backend started correctly with the new secret. Done.

If the site is down (returns an error), something went wrong — tell me
and I'll help you revert.

---

# 5. Run Your First Load Test

**What this does:** Simulates 100 people signing up at the same time, so
you know your platform can survive going viral.

**Cost:** FREE (the tool is open source)

**Time:** 20 minutes.

## Step 5.1 — Install k6 on your Mac

1. Open the **Terminal** app (press `Cmd + Space`, type "terminal", press Enter)
2. Copy and paste this command, then press Enter:
   ```
   brew install k6
   ```
3. If it asks for your Mac password, type it and press Enter (no dots will appear — that's normal)
4. Wait ~2 minutes for installation

**If you get "brew: command not found":**
First install Homebrew by pasting this and pressing Enter:
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Then repeat step 2.

## Step 5.2 — Get the load test script

I already wrote this for you. It's at `/app/load_tests/signup_and_dashboard.js`.

In Terminal, copy-paste these commands one at a time:

```
mkdir -p ~/carryon-load-test
cd ~/carryon-load-test
```

Then, download the script from your codebase (if you have the repo cloned locally) OR copy the contents from `load_tests/signup_and_dashboard.js` in your GitHub repo into a new file called `loadtest.js` in that folder.

## Step 5.3 — Run a SMALL test first

Start small so you don't accidentally DDoS yourself.

In Terminal, paste:
```
BASE_URL=https://app.carryon.us k6 run --vus 10 --duration 30s loadtest.js
```

- `--vus 10` = 10 simulated users
- `--duration 30s` = run for 30 seconds

Wait 30 seconds. You'll see a report like:

```
http_req_duration.....p(95)=850ms
http_req_failed........ 0.00%
iterations...............120
```

**What to look for:**
- ✅ `http_req_failed` should be 0% or near 0%
- ✅ `http_req_duration p(95)` should be under 1500ms
- ✅ No error messages in red

If that passes, step up to a real test:

```
BASE_URL=https://app.carryon.us k6 run --vus 100 --duration 3m loadtest.js
```

This simulates 100 concurrent users for 3 minutes. Watch Sentry, your Mongo
Atlas dashboard, and your Railway dashboard during the test for any red flags.

## Step 5.4 — Interpret the results

**If everything stays green**: your platform can handle ~100 concurrent
users easily. That's roughly equivalent to a viral TikTok bringing ~10,000
visitors in one day.

**If you see errors or >2s latency**: tell me the numbers, and I'll help
you figure out which endpoint is the bottleneck.

## Step 5.5 — Clean up test users

The load test creates fake users in your database. Clean them up:

1. Go to MongoDB Atlas → your cluster → **Collections**
2. Click the `users` collection
3. Click **"Filter"** and paste:
   ```
   {"email": {"$regex": "@loadtest.carryon.local$"}}
   ```
4. You'll see all the fake users. Count them (should match your k6 iterations).
5. Click **"Delete all documents matching this filter"**
6. Confirm

Repeat for the `estates` collection with the same filter.

---

# 6. Activate the Pre-Commit Safety Net

**What this does:** Automatically formats your code before every commit so
CI never fails again for a silly formatting issue.

**Cost:** FREE.

**Time:** 5 minutes.

You only need to do this on the computer you use to edit code (your Mac, probably).

## Step 6.1 — Open Terminal, navigate to your project

```
cd /path/to/your/CarryOnLive   # whatever folder your git repo is in
```

If you don't know where it is, in Terminal run:
```
mdfind -name CarryOnLive | head -1
```
And use that path.

## Step 6.2 — Run the setup script

```
bash scripts/setup-dev.sh
```

You should see:
```
✓ Pre-commit hook wired (scripts/git-hooks/pre-commit)
✓ Setup complete. Before every push, run: bash scripts/check.sh
```

Done. From now on, every `git commit` will auto-format your Python and check
your JavaScript. You literally cannot commit broken formatting again.

## Step 6.3 — Before every push, run the check

```
bash scripts/check.sh
```

If it says **"ALL CLEAR — SAFE TO PUSH"** in green, you're good. Push.

If it says **"N BLOCKING ISSUE(S)"** in red, read what it says and either fix
the issue or ask me.

---

# 7. Snapshot Your Database Schema

**What this does:** Records the current shape of your database so you'll know
if something accidentally changes.

**Cost:** FREE.

**Time:** 5 minutes.

## Step 7.1 — Get your MongoDB connection string

1. Go to **https://cloud.mongodb.com** → your project → your cluster
2. Click **"Connect"** button
3. Choose **"Drivers"** (Python/etc)
4. Copy the connection string. It looks like:
   ```
   mongodb<PLUS>srv://USERNAME:PASSWORD@cluster.xxxxx.mongodb.net/
   ```
   *(Scheme will be `mongodb` + `+srv://…`. Replace the capitalized placeholders with your real username and password.)*
5. **Replace `<password>` with your actual database password**
   *(If you don't remember it: create a new user in "Database Access" tab)*

## Step 7.2 — Run the snapshot script

In Terminal, in your project folder:

```
MONGO_URL="<paste your connection string>" DB_NAME="carryon" python3 scripts/schema_snapshot.py --save
```

You should see:
```
Schema snapshot saved to /path/to/.schema_snapshot.json
```

## Step 7.3 — Commit the snapshot

```
git add scripts/.schema_snapshot.json
git commit -m "Baseline database schema snapshot"
git push
```

Done. Going forward, if anyone (including me) accidentally changes a
database index or structure, the CI will flag it.

---

# When you're done

You will have moved from **7/10** to **8/10**.

You should feel confident about launching.

Remember:
- Sentry dashboard: **https://sentry.io** → your org → carryon-backend
- Status page: **https://carryon.betteruptime.com**
- MongoDB: **https://cloud.mongodb.com** → your project
- Stripe: **https://dashboard.stripe.com** → Developers → Webhooks

Bookmark all four.

---

# If something breaks during launch week

See `/app/memory/INCIDENT_RUNBOOK.md` — I wrote you a separate doc for that.
