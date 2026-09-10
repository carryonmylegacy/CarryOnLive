# CarryOn — Launch-Day Runbook (Reddit campaign)

One page. Print it. Everything below is what to look at, what "normal" is,
what "red" is, and the one thing to do when it goes red.

Live hosts: API `https://carryon-api-kacr.onrender.com` · App `https://app.carryon.us`
(`api.carryon.us` does **not** exist in DNS — do not use it in monitors.)

---

## 0. The night before (10 minutes)

| Check | Where | Must be |
|---|---|---|
| Render autoscale | Render → carryon-api-kacr → Scaling | min 1 / **max 2** (already set) |
| Render plan | Render → Settings | Standard (1 CPU / 2 GB) — see §3 for when to bump |
| Health | `GET /api/health` | `schedulers.errored: 0`, `database: connected` |
| Readiness | `GET /api/health/ready` | `200 {"status":"ready"}` |
| Resend rate limit | Resend → Settings → Usage | default is **10 emails/sec per team**. If you expect > 3 signups/sec, email support@resend.com *before* launch and ask for 50/sec (free, "trusted sender") |
| Emergent key | Emergent → Universal Key | balance ≥ 50 credits, auto-recharge ON |
| Sentry uptime monitor | Sentry → Monitors | `/api/health/ready` monitor exists and is green |
| Stripe webhook | Stripe → Developers → Webhooks | endpoint `…/api/subscriptions/webhook/stripe` **Enabled**, 0 failing |
| Signup OTP gate | app.carryon.us, logged in as founder → left sidebar tile **"Signup OTP"** | must read **Enabled** (green). Also Render → Environment: `LAUNCH_MODE=true` present (forces the gate on even if the tile is flipped by mistake) |
| Signup alert volume | Admin → **Notifications** → *New Signup Alerts* → "Ping me" dropdown | your choice: *Every signup* (jackpot mode) at launch; meter down to *Every 25th* / *Hourly summary* / *Off* whenever the pings get old. Counters keep running regardless |

---

## 1. What to watch (one browser window, five tabs)

| Tab | Metric | Green | Yellow | **Red → act (§2)** |
|---|---|---|---|---|
| **Render → Metrics** | CPU % | < 60 % | 60–85 % sustained 5 min | > 85 % for 10 min |
| | Memory | < 1.2 GB | 1.2–1.7 GB | > 1.7 GB (2 GB limit → OOM restart) |
| | Instances | 1 | 2 (autoscaled — fine) | 2 **and** CPU still > 85 % |
| | p90 response | < 500 ms | 0.5–2 s | > 2 s for 5 min |
| **Atlas → Metrics** (M20) | Connections | < 500 | 500–1,500 | > 1,500 (M20 hard cap ≈ 3,000) |
| | CPU / IOPS | < 50 % | 50–80 % | > 80 % |
| **Resend → Emails** | Delivered % | > 97 % | 90–97 % | < 90 %, or **429 "rate limit exceeded"** in Logs |
| **Sentry → Issues** | New issues / hr | 0–2 | 3–10 | > 10, or any `500` on `/auth/register` or `/auth/login` |
| **Stripe → Webhooks** | Failing deliveries | 0 | 1–2 (retries) | > 5 or endpoint auto-disabled |

Sanity probe you can run from your phone any time:
`https://carryon-api-kacr.onrender.com/api/health/ready` → must say `"ready"`.

---

## 2. When something goes red

| Symptom | Cause (most likely) | Do this |
|---|---|---|
| Render CPU pinned > 85 %, p90 climbing | Signup burst — bcrypt is CPU-bound (≈ 4 signups/sec per CPU at cost 12) | Render → Scaling → raise **max instances 2 → 3** (takes ~60 s). Still red after 10 min → Settings → **Instance type → Pro** (2 CPU / 4 GB); rolling, no downtime |
| Memory > 1.7 GB | Playwright PDF exports + AI calls piling up | Same as above: Pro instance. If a single pod OOM-restarts, Render replaces it automatically — check Sentry for `MemoryError` |
| Users say "didn't get my code" | Resend 429 (10/sec cap) or delivery lag | Resend → Logs, filter status 429. If present: email support@resend.com "please raise rate limit", and post in your Reddit thread: *"Codes may take a minute — use Resend Code if needed."* Users can self-serve via **Resend Code** on the OTP screen |
| `/api/health/ready` → 503 | MongoDB unreachable | Atlas → cluster → check **Alerts** + **Connections**. If connections at cap: Render → **Manual Deploy → Clear build cache & deploy** (recycles pools). If Atlas itself is down: status.mongodb.com — nothing to do but wait; the app shows its own outage banner |
| Sentry: `SyntaxError: Unexpected token '<'` (react) | Stale JS chunk after a Vercel deploy | Harmless; users refresh. **Do not deploy the frontend during the campaign window** |
| Sentry: `DuplicateKeyError E11000` (python) | Two identical writes racing (usually telemetry) | Note the collection name in the stack trace; it's non-blocking unless it's on `users` |
| Stripe webhook endpoint disabled | > 3 days of failures | Stripe → Webhooks → endpoint → **Enable**. Then Admin → Finance → Subs → confirm recent purchases show as active |
| Everything is slow but CPU is low | Downstream (Resend / xAI / Stripe) is slow | Check status pages: resend.com/status · status.x.ai · status.stripe.com. Nothing to change on our side; timeouts are already bounded |

---

## 3. Capacity numbers (measured Sep 9 2026, preview pinned to 1 CPU)

| Load | Before fix | After fix (shipping now) |
|---|---|---|
| 50 simultaneous signups | site frozen **9.5 s** for everyone else | everyone else p95 **8 ms** |
| 100 simultaneous signups | frozen **21 s** | p95 **8 ms** |
| 200 simultaneous signups | frozen **> 30 s** (health probe timed out) | p95 **10 ms** |
| Signup throughput | 4.3 / sec / CPU | 4.1 / sec / CPU (bcrypt cost 12 is the ceiling) |

Interpretation: the site no longer locks up during a burst. Signups queue at
~4/sec/CPU (≈ 250/min on one instance, ≈ 500/min with autoscale to 2). A
Reddit front-page post typically converts well under 1 signup/sec; a burst of
200 in one second would still clear in ~50 s with nobody else affected.

Levers if you want more headroom (founder decision, not pre-applied):
- **Render Pro** (2 CPU) for the campaign window → ~8/sec/instance.
- **bcrypt cost 12 → 11** → ~8/sec/CPU (halves hashing time; OWASP floor is 10).
- **Autoscale max 3.**

---

## 4. Who to call

| Service | Support | Status page |
|---|---|---|
| Render | dashboard → Help (chat), support@render.com | status.render.com |
| MongoDB Atlas | Atlas → Support (chat) | status.mongodb.com |
| Resend | support@resend.com | resend.com/status |
| Stripe | dashboard → Help | status.stripe.com |
| Sentry | sentry.io → Help | status.sentry.io |
| Emergent key (xAI) | Emergent → Help | — |

Post-campaign: run `python scripts/readonly_ben_tier_billing_audit.py --quick`
in the Render shell, export Resend delivery CSV, and review Sentry → Issues
sorted by *Events* for anything > 10 occurrences.
