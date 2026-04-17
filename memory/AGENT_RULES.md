# CarryOn™ — Agent Rules (Persistent Across Forks)

> **This file exists to survive agent forks.** When a new agent picks up a job,
> these rules apply without having to be re-stated by the user. Read this
> BEFORE starting any task.

---

## 🔴 RULE 1 — Every summary includes a full housekeeping + ruff report

**No exceptions.** Before calling the `finish` tool, the agent MUST run:

```bash
bash /app/scripts/check.sh          # if scripts/check.sh exists
# OR fall back to:
cd /app/backend && ruff check . && ruff format --check .
bash /app/housekeeping.sh
```

And the summary MUST include a section formatted like this:

```
## Housekeeping + Ruff Report

| Check | Result |
|---|---|
| ruff check (<N> files) | ✅/❌ |
| ruff format --check (<N> files) | ✅/❌ |
| Housekeeping (65 checks) | ✅/❌ summary |
| scripts/check.sh pre-push gate | ✅/❌ ALL CLEAR / N BLOCKING |
```

If any check is failing at summary time, the agent MUST say so honestly, not
hide it. Fix-before-finish is preferred.

**Why**: the user has been burned by CI failures from unformatted code. They
don't want to remember to ask — they want it reported automatically.

---

## 🔴 RULE 2 — Preserve ALL functionality on EVERY change

**No exceptions.** The user has repeatedly emphasized: "MAKE SURE THAT NO
FUNCTIONALITY IS LOST WHATSOEVER!"

- Never refactor unrelated code
- Never delete components, routes, or endpoints without explicit approval
- Always use `search_replace` over `create_file` when editing existing files
- When in doubt, ADD rather than REPLACE

---

## 🔴 RULE 3 — Respond to the user in English

The handoff summary may specify other preferences but the user's baseline
preference is English.

---

## 🟡 RULE 4 — User has zero coding experience

- When giving user-facing instructions, write like they've never opened a terminal
- "Click this button, paste this exact text, wait for X"
- Don't assume knowledge of git, CI/CD, env vars, etc.
- Point to `/app/memory/LAUNCH_DAY_OPERATOR_GUIDE.md` for any operational task

---

## 🟡 RULE 5 — Certain architectural decisions are LOCKED

These have been debated, fixed, and should not be revisited without explicit
user approval:

1. **iOS chat keyboard** uses `position: fixed; inset: 0; overflow: hidden` with
   ZERO `visualViewport` manipulation. See prior handoff notes. Recurrence
   count: 20+. DO NOT REWRITE.

2. **Per-estate AES-256-GCM + 600k PBKDF2** is locked. Don't weaken for perf.

3. **JWT + MongoDB-backed rate limiter + distributed scheduler lock** is the
   current infrastructure baseline. Don't replace with Redis without the user
   explicitly asking for Redis.

4. **emergentintegrations** is installed from
   `https://d33sy5i8bnduwe.cloudfront.net/simple/` via `--extra-index-url` in
   `backend/requirements.txt`. Don't try to find it on public PyPI.

5. **Subscription schema** has `founders_circle`, `user_subscriptions`,
   `subscription_overrides`, `payment_transactions` collections. Don't
   consolidate them.

---

## 🟢 RULE 6 — Update test_credentials.md whenever auth changes

From the system prompt. Surfaced here because it gets forgotten.

---

## 🟢 RULE 7 — Hard commitments from the user, logged

- Launch: **nationwide social media campaign ~1 week from 2026-04-16**
- Blocked 3rd parties: **Apple Paid Applications Agreement, Twilio A2P 10DLC**
- Dollar sunk cost: **~$60K** (context for scope decisions)
- Technical experience: **zero coding background** — explanations must be plain

---

## How to extend this file

Add new rules numbered and prefixed with severity:
- 🔴 HARD RULE (no exceptions)
- 🟡 STRONG PREFERENCE (deviate only with explicit approval)
- 🟢 REMINDER (good practice)

Keep existing rules intact — they represent accumulated trust.
