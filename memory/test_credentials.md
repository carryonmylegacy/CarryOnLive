# CarryOn Test Credentials

Login endpoint: `POST /api/auth/login` with JSON `{"email": "...", "password": "..."}` (email-based; username is NOT accepted by the merged Job L auth).
Token is returned as `access_token`; frontend stores it in `localStorage.carryon_token`.

## Founder / Admin (preview + prod)
- Email: founder@carryon.us
- Password: CarryOntheWisdom!
- Username: foundercarryon
- Role: admin (founder — sees all six Admin Portal sections at /admin)

## Benefactor (preview) — Pete Mitchell equivalent, NOT admin
- Email: info@carryon.us
- Password: Demo1234!
- Username: admin_62bc79
- Role: benefactor (owns estate "Admin Test Estate", subscription: standard / cancelled → paywall visible)
- Note: if this account ever shows role=admin again, that is stale data — set role back to benefactor.

## Production demo account (carryon.us — marketing screenshots only)
- Username: petemitchell · Password: Demo1234!!! · benefactor · LIVE prod only (not in preview DB)

## Environment facts (preview)
- Preview DB mirrors LIVE config via `python backend/scripts/mirror_live_config.py` (beta_mode=false, family discounts 30%/50%, live prices + feature gates). Run with `--check` for a drift report.
- OTP: check `platform_settings.otp_disabled`; when OTP is on, codes are logged to `/var/log/supervisor/backend.out.log`.

## Email testing rule (Resend is LIVE)
- Outbound email tests: send ONLY to info@carryon.us, once per flow.
- Test/throwaway domains (@test.com, @example.com, …) are rejected by `services/email.py::is_valid_email` (400) — useful for negative tests.

## Testimonials — test hygiene
- POST /api/testimonials creates PENDING items only; approving via PATCH /api/admin/testimonials/{id} makes them PUBLIC.
- Delete any test testimonial (DELETE /api/admin/testimonials/{id}) before finishing. Restore `show_live_stats` to "auto" if changed.
