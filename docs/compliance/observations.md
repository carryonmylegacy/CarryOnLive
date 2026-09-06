# Compliance observations — noticed, not fixed

Items recorded here were found during scoped work and deliberately left untouched (spec rule: do not improve adjacent code). Each needs its own decision.

## 2026-09-06 — Admin session can browse any user's benefactor portal

- **What:** `GET /api/estates` returns every estate to `role == "admin"` (`backend/routes/estates.py:27-28`). The benefactor-portal pages resolve the working estate from `localStorage.selected_estate_id` or fall back to `estates[0]` (e.g. `frontend/src/pages/DigitalWalletPage.js:101-106`), so an admin/founder who opens the benefactor portal lands in an arbitrary user's estate and can browse its DAV logins and notes, beneficiary assignments, documents, financial picture, and the rest of the estate-scoped surfaces — every route that grants `is_admin` the owner view (`services/access_control.py:119-121` and the `is_owner or is_admin` branches across `routes/`).
- **Closed today:** the DAV secret fields only (`hotfix/dav-admin-plaintext`: `routes/digital_wallet.py`, `routes/financial_portal/entities_share.py`). Admins still receive account names, login usernames, notes, categories, and assignments.
- **Open decision:** whether admins should have a read path into any estate at all, and if so which fields; whether `GET /api/estates` should return all estates to admins; and whether the admin-owner carve-out (an admin viewing an estate they own) should remain the only owner-level admin path.
- **Found while:** DAV admin-plaintext hotfix discovery (Phase 0 of the DAV Legacy Programs work).

## 2026-09-06 — DAV visibility rule differs between the two beneficiary surfaces

- `routes/digital_wallet.py:27-34` releases an assigned entry to a beneficiary post-transition regardless of `beneficiary_visibility` (including `private`); `routes/financial_portal/entities_share.py:137-145` releases `private` to nobody, ever. Same data, two answers. Left as-is; needs a product decision on which rule is intended.
