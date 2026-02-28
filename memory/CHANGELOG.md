# CarryOn — Changelog

## Feb 28, 2026 — Security Hardening Audit + 5 Enhancement Features

### Linting (3 Passes)
- Ran Python (ruff) and JavaScript (ESLint) linting 3 times. All clean.

### Security Fixes (16 total)
1. Account lockout (5 failed attempts / 15 min)
2. Password complexity (8+ chars, upper/lower/digit)
3. OTP 10-minute expiry
4. Content-Security-Policy header
5. HSTS with preload
6. Cache-Control no-store on all API responses
7. Estate ownership verification on all document endpoints
8. Zero-knowledge fix: messages no longer store plaintext
9. Death certificates encrypted with AES-256-GCM
10. Cryptographic OTP/backup code generation (secrets module)
11. CORS restricted to specific origins
12. OTP log sanitization
13. Database security indexes at startup
14. TTL auto-cleanup indexes
15. Config hardening warnings
16. Audit trail for death certificates

### 5 Enhancement Features
1. **Onboarding Wizard** — 5-step guided setup on dashboard, auto-detects progress
2. **Estate Readiness Notifications** — Already existed in weekly digest
3. **Beneficiary Gentle Intro** — Warm two-step invitation acceptance flow
4. **Quick-Start Templates** — 4 scenario templates (Hospice, Military, New Parent, Recently Married)
5. **Emergency Access Protocol** — Beneficiary emergency vault access with admin review

### Testing
- Security audit: 19/19 tests passed (95% rate)
- Enhancement features: 24/24 backend tests passed (100%)
- All frontend components verified working
