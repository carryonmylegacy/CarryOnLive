# CarryOn — Load Tests

Runs from your laptop (or CI) against the live preview or production URL.
Designed to stress the **highest-risk pre-launch endpoints**: signup burst,
dashboard first-paint, and logout.

## Prerequisites

```bash
brew install k6              # macOS
# or: https://k6.io/docs/get-started/installation/
```

## Running

```bash
# Against preview (default script settings: ramp 0→100 VUs over 5 min)
BASE_URL=https://your-preview.emergentagent.com \
  k6 run load_tests/signup_and_dashboard.js

# Save timeline JSON for inspection
BASE_URL=https://app.carryon.us \
  k6 run --out json=results.json load_tests/signup_and_dashboard.js
```

## What to watch

| Metric | Healthy | Alarm |
|---|---|---|
| `http_req_duration p(95)` | `< 1.5s` | `> 3s` |
| `http_req_duration{name:dashboard} p(95)` | `< 1s` | `> 2s` |
| `http_req_failed` rate | `< 1%` | `> 2%` |
| Mongo connections (Atlas dashboard) | `< 80%` of limit | `> 90%` |
| Backend CPU | `< 70%` | `> 90%` |
| Rate-limited 429s | `0` during legit test | non-zero = tune limits |

## Before a nationwide marketing launch

1. Clone a prod-like env (staging) with same Mongo tier + pod count.
2. Run `k6 run --vus 100 --duration 10m ...`.
3. Watch Atlas + Sentry live. Fix anything showing.
4. Only then go live.

## Cleanup

Test users are left in the DB after the run. Purge them with:

```bash
# From a Mongo shell
db.users.deleteMany({ email: { $regex: /@loadtest\.carryon\.local$/ } })
db.estates.deleteMany({ owner_email: { $regex: /@loadtest\.carryon\.local$/ } })
```

Or schedule a cleanup script if you'll be running regularly.
