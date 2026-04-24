# CarryOn Test Credentials

## Admin/Founder Account
- Email: info@carryon.us
- Password: Demo1234!
- Username: admin_5dfa64
- Role: admin (founder) — `isStaff=true` in the frontend. Hides non-staff-only UI (MenuOrderCustomizer, ChatAutoscrollCard, etc.) and the Founder Portal sidebar does not surface the ECT.
- Note: Login works with either email or username.

## Gap: No non-staff benefactor test account seeded
- `dev_switcher_active_role=benefactor` in localStorage does NOT flip `isStaff` to false (driven by user.role on the backend).
- To E2E test non-staff-only UI (incl. ChatAutoscrollCard, MenuOrderCustomizer, ECT channel scroll-restore logic), either:
  (a) register a fresh benefactor via `POST /api/auth/register` inside the test, OR
  (b) use the admin's "My Benefactor Portal" switch in the logo menu (this swaps the token to a real benefactor user via `/api/auth/dev-switch`), OR
  (c) seed a persistent non-staff benefactor here and list creds below.

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
