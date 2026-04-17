# CarryOn™ — Launch-Day Cheat Sheet

**Print this. Tape it next to your desk.** Every link + command you'll need
on launch day.

---

## The 4 Bookmarks You Live In

1. **Admin War Room** → https://app.carryon.us/admin/war-room
   *Real-time signup rate, latency, revenue, alerts*

2. **Sentry** → https://sentry.io → carryon-backend
   *Every error from every user*

3. **Stripe** → https://dashboard.stripe.com → Payments
   *Every transaction*

4. **MongoDB Atlas** → https://cloud.mongodb.com → your cluster → Metrics
   *Database health*

---

## Status Check in 10 seconds

Visit: **https://app.carryon.us/api/status**

| Response | Meaning |
|---|---|
| `"status":"operational"` | Everything is fine |
| `"status":"degraded"` | DB issue — go to [Runbook Section B](INCIDENT_RUNBOOK.md#b-database-slow-or-down) |
| No response / timeout | Backend is down — go to [Runbook Section C](INCIDENT_RUNBOOK.md#c-backend-is-down) |

---

## The 3 Commands You'll Actually Use

```bash
# 1. Before pushing code: run this
bash scripts/check.sh

# 2. If something breaks and you're in a panic: view the backend logs
# (Only if you're comfortable in a terminal. Otherwise use Railway's UI.)
tail -n 100 /var/log/supervisor/backend.err.log

# 3. To take a new database schema snapshot (after intentional changes)
MONGO_URL="..." DB_NAME="carryon" python3 scripts/schema_snapshot.py --save
```

---

## The 3 Numbers You Care About

**War Room** will show you:
- **Signups last 5 min** → spike = viral moment (celebrate!)
- **p95 latency** → should be under 1500ms. Over 3000ms = trouble.
- **Error rate** → should be under 1%. Over 5% = rollback now.

---

## "I See a Red Alert in the War Room"

| Alert Text | What To Do |
|---|---|
| "API p95 is Xms" | If X > 3000 and rising → rollback. If X is stable → monitor. |
| "5xx error rate X%" | If X > 5 → rollback. Check Sentry for the cause. |
| "MongoDB unreachable" | [Runbook Section B](INCIDENT_RUNBOOK.md#b-database-slow-or-down) |

---

## How to Rollback (The Nuclear Button)

**When to use**: error rate > 5%, or site is down, and you recently deployed.

1. Go to **Railway** → backend service → **Deployments** tab
2. Find the last GREEN deployment (before the bad one)
3. Click **"..."** next to it → **"Redeploy"**
4. Wait 3 minutes
5. Check https://app.carryon.us/api/status
6. Tell me you rolled back so I can fix the actual bug

**It's OK to rollback.** It's the right move when in doubt.
The worst thing is leaving a broken production running while you debug.

---

## Customer Emails That Will Come In

Stock responses you can copy-paste:

### "I can't log in"
> Hi [name], sorry for the trouble. Please try these in order:
> 1. Make sure you're using the email you signed up with
> 2. Try resetting your password at https://app.carryon.us/forgot-password
> 3. If that doesn't work, try in an incognito/private browser window
>
> If none of that works, reply here with the exact error message and I'll
> look up your account.

### "I paid but don't have access"
> Hi [name], apologies for the confusion. Please send me the email address
> on your account and the last 4 digits of the card you used. I'll verify
> the payment and activate your account manually within 1 business hour.

### "The app is really slow"
> Hi [name], thank you for flagging this. Could you tell me:
> 1. What page specifically?
> 2. Approximately what time did this happen?
> 3. Are you on WiFi or mobile data?
>
> I'll investigate our logs and get back to you.

### "I want a refund"
> Hi [name], absolutely. I'll process that now. You'll see the refund in
> 3-5 business days depending on your bank. I'd love to know what didn't
> work for you — any feedback helps us improve.

---

## If You're Genuinely Stuck

Message me with:
- Screenshot of https://app.carryon.us/api/status
- Screenshot of https://carryon.betteruptime.com
- Screenshot of Sentry Issues page (last 1 hour)
- Screenshot of War Room

I can usually diagnose in 5 minutes with those 4 screenshots.

---

## Launch Week Self-Care

1. **Set a 7 AM and 11 PM check-in**. Don't check in between unless you get
   an alert. You'll burn out otherwise.
2. **Sleep**. You will make worse decisions tired. A rolled-back broken
   feature at 11 PM is better than a creatively-engineered fix at 3 AM.
3. **Celebrate the first 10 signups, the first 100, the first 1000.**
   These milestones matter more than the launch itself.
4. **Log everything that breaks.** Use it as your pitch to investors later.
   "We had a Reddit-front-page moment on day 2 and our platform held" is a
   much better story than "it launched."

You built this. It's working. Go.
