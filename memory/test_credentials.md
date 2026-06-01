# CarryOn Test Credentials

## 🟢 PRODUCTION ACCOUNTS (Apr 27, 2026 — provided by user for launch sweep)

### Production Benefactor — Pete Mitchell (offline-mode live testing, Jun 1 2026)
- URL: `https://app.carryon.us` (frontend) / API `https://carryon-api-kacr.onrender.com/api`
- Login (username): `petemitchell`
- Password: `Demo1234!!!`
- Email: `info@carryon.us` · Role: benefactor · user_id `6425f12a-7d24-41c0-b1bc-f987e74f727d`
- Used for live offline-profile diagnosis. Direct login (no OTP). NOTE: single-session — logging in here can sign out the user's phone.


### Production Founder/Admin (the real one)
- URL: `https://app.carryon.us`
- Login: `founder@carryon.us`
- Password: `CarryOntheWisdom!`
- Role: admin / founder (full admin scope)
- **PRIMARY admin used for all admin-portal sweeps on production.**

### Production Benefactor — Barnet (real test benefactor)
- URL: `https://app.carryon.us`
- Login (username): `barnetharris`
- Password: `Blh9170873`
- Role: **beneficiary** (verified via `/api/auth/login`. Email: `barnetharris@mac.com`. `id=1adc6380-...`)
- Primary surface: beneficiary portal (`/beneficiary/*`)

### Production Benefactor — Megumi
- URL: `https://app.carryon.us`
- Login (email): `megumiharris@gmail.com`
- Password: `Question2711`
- Role: benefactor (also has beneficiary side per user's instruction — must test both)

### Note on `info@carryon.us`
- On production AND on the preview pod, this email is bound to a benefactor named **"Pete Mitchell"** (`role=benefactor`). **This is a LIVE BENEFACTOR ACCOUNT — NOT an admin.** Use it for any user-facing / benefactor-side testing.
- The ONLY admin/founder account is `founder@carryon.us`.

---

## 🟡 PREVIEW POD ACCOUNTS (preview-only, not production)

### Preview Benefactor — Pete Mitchell (use this for ALL user-facing testing)
- URL: `https://beneficiary-hub-16.preview.emergentagent.com`
- Email: info@carryon.us
- Password: Demo1234!
- Role: **benefactor** (Pete Mitchell) — same role as on production. NOT an admin.

### Preview Benefactor — Seeded Test Account (testing-agent created May 22 2026)
- URL: `https://beneficiary-hub-16.preview.emergentagent.com`
- Email: `testben1779455414@example.com`
- Password: `TestPass1234!`
- Role: benefactor (default tier, no estate data seeded)
- Created via `/api/auth/register` + OTP verify during section-rollup regression tests. Use this when Pete Mitchell's account is locked by an active live session.


### Preview Admin/Founder (ONLY for admin-portal testing)
- URL: `https://beneficiary-hub-16.preview.emergentagent.com`
- Email: founder@carryon.us
- Password: CarryOntheWisdom!
- Role: admin (founder) — `isStaff=true` in the frontend.

---

### Preview Trustee — `trustee_screenshot` (legacy TMA grant from v1 flow)
- URL: `https://beneficiary-hub-16.preview.emergentagent.com`
- Login (username): `trustee_screenshot`
- Password: `TPass1234!`
- Type: **TMA grant** (NOT a CarryOn user). Resolves at login to act on behalf of `info@carryon.us` (Pete Mitchell).
- Visible flag on success: persistent amber "TRUSTEE MODE — Screenshot Trustee acting on behalf of …" banner across every page.
- Notes:
  - This grant pre-dates the May 21 invite/claim hardening — kept around for backward-compat regression testing only.
  - **New trustee grants are NO LONGER created with a benefactor-set password.** Use the invite flow on the Settings page: enter the trustee's email → they receive a claim link → they pick their own username/password → they verify a 6-digit email OTP → they're activated.
  - Founder must enable the `tma` feature gate in Admin → Subs for at least one tier OR for the partner override before trustee logins work (login returns 403 otherwise).
  - To remove: `DELETE /api/trustee/grants/{id}` as the benefactor, or revoke via the Trustee Access card in Settings.




## Gap: No non-staff benefactor test account seeded
- This gap is now CLOSED — `info@carryon.us` is a real benefactor on preview (matches production).

### ✅ Verified path for testing agents (Apr 2026)
The auth token is stored in `localStorage` under the key **`carryon_token`** (NOT `token`).
Admin/founder accounts CAN navigate directly to `/dashboard`, `/estate-chat`, and `/messages`
after login — they are not redirected away. If the agent sees a redirect, it's likely because
the login response landed on `/admin` (Founder Portal) and the agent didn't perform a fresh
`page.goto('/estate-chat')` after login.

Working sequence for E2E testing of /estate-chat and /messages (using a real BENEFACTOR account — info@carryon.us is the benefactor "Pete Mitchell"):
```python
# 1. Login as benefactor
await page.goto(f'{URL}/login')
await page.fill('input[type="text"]', 'info@carryon.us')
await page.fill('input[type="password"]', 'Demo1234!')
await page.click('button[type="submit"]')
await page.wait_for_timeout(4000)
# 2. Now navigate directly — ECT/Messages will render for the benefactor
await page.goto(f'{URL}/estate-chat')
await page.wait_for_timeout(4000)
# data-testid='ect-back-to-dashboard' will be present
```
Confirmed working via local Playwright run on iter 86.

## Auth System Notes
- Username is the primary login identifier (unique, not an email)
- Email is a communication channel (non-unique, shared families supported)
- Beneficiaries join via invitation link only — no self-signup
- OTPs are keyed by user_id (not email)
- Forgot Password uses username, not email
- Forgot Username sends username list to email

---

## 🔐 PRODUCTION JWT_SECRET ROTATION (Generated Apr 19, 2026)

**Current dev/legacy value:** `<legacy-short-jwt-secret>` (34 chars, predictable — MUST NOT ship to production)

**New 64-char cryptographically-random secret to paste into Railway production env:**

```
JWT_SECRET=<GENERATE_NEW_64_CHAR_SECRET_AND_PASTE_INTO_RAILWAY>
```

> Run `python3 -c "import secrets; print(secrets.token_urlsafe(48))"` locally to mint a fresh one. NEVER commit the literal value — paste it directly into Railway env and use a password manager for your own record.


### Rotation procedure (DO DURING MAINTENANCE WINDOW, NOT DURING TRAFFIC)
1. In Railway → production service → Variables, replace `JWT_SECRET` with the value above.
2. Restart the production service (`railway up` or redeploy).
3. **All existing user sessions will be invalidated** — every logged-in user must log in again. Expected; JWTs are signed with the old secret.
4. Verify: log in as admin, confirm dashboard loads. Check `/api/admin/security-scan` — JWT secret length should report `64`.
5. Delete this notice from `test_credentials.md` after successful rotation (keep the new value only in Railway).

### Why
- Old secret is 34 chars, static, dated string — predictable and too short for a production HMAC-SHA256 secret.
- Rotation is cheap insurance before nationwide launch traffic.

---

## 🔐 STRIPE KEY HYGIENE (backend/.env currently holds sk_live_...)

This preview pod should **not** hold the production Stripe live key. Two safe paths:

- **Path A (safer):** rotate `sk_live_...` in the Stripe dashboard → paste the new value into Railway prod env ONLY → delete the value from `/app/backend/.env` here (features will no-op in preview).
- **Path B (easier):** replace `STRIPE_API_KEY` in `/app/backend/.env` with your `sk_test_...` key from Stripe so checkout flows remain testable locally without touching live money. Production Railway keeps its own `sk_live_...`.
