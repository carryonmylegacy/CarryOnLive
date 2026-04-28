# CarryOn Test Credentials

## 🟢 PRODUCTION ACCOUNTS (Apr 27, 2026 — provided by user for launch sweep)

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

### Note on `info@carryon.us` on production
- On production, this email is bound to a benefactor named "Pete" (`role=benefactor`, `id=6425f12a-...`), NOT to the founder admin. Do NOT use it for admin testing on prod. (On the **preview pod** it IS the admin — see section below.)

---

## 🟡 PREVIEW POD ACCOUNTS (preview-only, not production)

### Preview Admin/Founder
- URL: `https://react-refactor-24.preview.emergentagent.com`
- Email: info@carryon.us
- Password: Demo1234!
- Username: admin_5dfa64
- Role: admin (founder) — `isStaff=true` in the frontend.

---

## Gap: No non-staff benefactor test account seeded
- `dev_switcher_active_role=benefactor` in localStorage does NOT flip `isStaff` to false (driven by user.role on the backend).
- To E2E test non-staff-only UI (incl. ChatAutoscrollCard, MenuOrderCustomizer, ECT channel scroll-restore logic), either:
  (a) register a fresh benefactor via `POST /api/auth/register` inside the test, OR
  (b) use the admin's "My Benefactor Portal" switch in the logo menu (this swaps the token to a real benefactor user via `/api/auth/dev-switch`), OR
  (c) seed a persistent non-staff benefactor here and list creds below.

### ✅ Verified path for testing agents (Apr 2026)
The auth token is stored in `localStorage` under the key **`carryon_token`** (NOT `token`).
Admin/founder accounts CAN navigate directly to `/dashboard`, `/estate-chat`, and `/messages`
after login — they are not redirected away. If the agent sees a redirect, it's likely because
the login response landed on `/admin` (Founder Portal) and the agent didn't perform a fresh
`page.goto('/estate-chat')` after login.

Working sequence for E2E testing of /estate-chat and /messages:
```python
# 1. Login (lands on /admin for the founder account)
await page.goto(f'{URL}/login')
await page.fill('input[type="text"]', 'info@carryon.us')
await page.fill('input[type="password"]', 'Demo1234!')
await page.click('button[type="submit"]')
await page.wait_for_timeout(4000)
# 2. Now navigate directly — ECT/Messages WILL render for the admin
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
