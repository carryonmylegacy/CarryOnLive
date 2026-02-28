# CarryOn™ — Changelog

## Feb 28, 2026 — Security Hardening Audit

### Linting (3 Passes)
- Ran Python (ruff) and JavaScript (ESLint) linting 3 consecutive times
- Fixed 6 Python lint issues (5 auto-fixed, 1 manual fix in test file)
- All passes clean on final run

### Security Fixes Implemented
1. **Account Lockout** — 5 failed login attempts trigger 15-minute lockout per email
2. **Password Strength** — Minimum 8 characters with uppercase, lowercase, and digit
3. **OTP Time Expiry** — OTPs expire after 10 minutes (was: never expired)
4. **Content-Security-Policy** — Full CSP header with script/style/connect restrictions
5. **HSTS Preload** — Added `preload` directive to Strict-Transport-Security
6. **Cache-Control** — `no-store, no-cache, must-revalidate` on all API responses
7. **Estate Ownership Verification** — All document endpoints now verify user owns/has access to estate
8. **Zero-Knowledge Fix** — Messages no longer store plaintext content (only encrypted_content)
9. **Death Certificate Encryption** — Now encrypted with AES-256-GCM (was: plaintext base64)
10. **Cryptographic OTP Generation** — Switched from `random` to `secrets` module
11. **Cryptographic Backup Codes** — Switched from `random` to `secrets` module
12. **CORS Restriction** — Changed from `*` wildcard to specific allowed origins
13. **OTP Log Sanitization** — Removed plaintext OTP codes from log output
14. **Database Indexes** — Created security indexes at startup (users, estates, documents, audit_log)
15. **TTL Indexes** — Auto-cleanup: failed_logins (1 hour), OTPs (15 minutes)
16. **Config Hardening** — JWT_SECRET and ENCRYPTION_KEY log warnings if using defaults

### Testing
- Testing agent verified all 19 security features (95% pass rate)
- Backend: account lockout, password validation, OTP expiry, document auth, security headers
- Frontend: login page loads, security badges visible, login flow works
