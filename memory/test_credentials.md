# CarryOn Test Credentials

## Admin/Founder Account
- Email: info@carryon.us
- Password: Demo1234!
- Username: admin_62bc79
- Role: benefactor (founder)
- Note: Login works with either email or username

## Auth System Notes
- Username is the primary login identifier (unique, not an email)
- Email is a communication channel (non-unique, shared families supported)
- Beneficiaries join via invitation link only — no self-signup
- OTPs are keyed by user_id (not email)
- Forgot Password uses username, not email
- Forgot Username sends username list to email

## Production Demo Account (carryon.us — used for marketing screenshots)
- Username: petemitchell
- Password: Demo1234!!!
- Role: benefactor (also beneficiary), direct login (no OTP)
- Note: LIVE production account on https://www.carryon.us (API: carryon-api-kacr.onrender.com). Not present in the preview DB.

## Email testing rule (Resend is LIVE)
- Quiz result emails (`POST /api/quiz/results/{id}/email`) and any other outbound email tests: send ONLY to info@carryon.us, once per flow.
- Test domains (@test.com, @example.com, …) are blocked by `services/email.py` and return 400 — useful for negative tests.

## Testimonials (trust pipeline) — test hygiene
- POST /api/testimonials creates PENDING items only; approving via PATCH /api/admin/testimonials/{id} makes them PUBLIC on carryon.us.
- Any testimonial created during testing MUST be deleted (DELETE /api/admin/testimonials/{id}) before finishing. Never leave test quotes approved.
- Restore `show_live_stats` to "auto" (PUT /api/admin/platform-settings) if changed during tests.
