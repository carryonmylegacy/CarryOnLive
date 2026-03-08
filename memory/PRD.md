# CarryOn Estate Planning Platform — PRD

## Original Problem Statement
Multi-tenant estate planning platform with four user roles: Benefactor, Beneficiary, Founder (admin), and Operator. Built as a React 19 + FastAPI + MongoDB stack with Capacitor for native iOS deployment.

## Core Requirements
- AES-256 encrypted zero-knowledge document vault
- AI-powered estate planning assistant (xAI Grok)
- Milestone Messages, Immediate Action Checklist, Digital Access Vault
- Transition Verification Team (TVT) for death certificate processing
- Designated Trustee Services (DTS) for post-death task execution
- Multi-role system: Benefactor, Beneficiary, Founder, Operator
- SOC 2-compliant audit trail for privileged actions
- Apple Passkeys (WebAuthn) authentication
- Stripe + Apple IAP subscription management

## Architecture
```
/app
├── housekeeping.sh             # Master script for safe codebase audits
├── backend/
│   ├── services/audit.py       # SOC 2 audit logging
│   ├── routes/
│   │   ├── founder.py          # Operator management & audit trail
│   │   ├── admin.py            # Admin/platform management
│   │   ├── support.py          # Customer support with soft-delete
│   │   ├── dts.py              # DTS tasks with soft-delete
│   │   ├── transition.py       # TVT certificates with soft-delete
│   │   └── subscriptions/verification_and_lifecycle.py  # Tier verifications with soft-delete
│   └── server.py
└── frontend/
    └── src/
        ├── pages/
        │   ├── AdminPage.js        # Founder + Operator portal (operatorMode flag)
        │   ├── OperationsPage.js   # Operator portal wrapper
        │   ├── SettingsPage.js     # Role-aware settings (hides staff-irrelevant sections)
        │   └── SubscriptionPage.js # Dedicated subscription management
        ├── components/
        │   ├── admin/
        │   │   ├── SupportTab.js       # Support with delete/restore buttons
        │   │   ├── DTSTab.js           # DTS with delete/restore buttons
        │   │   ├── TransitionTab.js    # TVT with delete/restore buttons
        │   │   ├── VerificationsTab.js # Verifications with delete/restore buttons
        │   │   ├── OperatorsTab.js     # Founder operator management
        │   │   └── AuditTrailTab.js    # SOC 2 audit trail viewer
        │   ├── common/TransitionGate.js # Gates beneficiary access
        │   └── layout/
        │       ├── Sidebar.js          # Role-aware sidebar navigation
        │       └── MobileNav.js        # Role-aware mobile navigation
        └── contexts/AuthContext.js
```

## Key DB Schema
- **users**: id, email, name, role (benefactor|beneficiary|admin|operator), password, is_operator, contact_email, phone, title, notes
- **audit_log**: event_id, timestamp, actor_id, actor_ip, category, action, severity, details, integrity_hash
- **support_messages**: id, conversation_id, content, sender_role, soft_deleted, deleted_at, deleted_by, deleted_by_role
- **dts_tasks**: id, estate_id, title, task_type, status, soft_deleted, deleted_at, deleted_by, deleted_by_role
- **death_certificates**: id, estate_id, status, file_name, soft_deleted, deleted_at, deleted_by, deleted_by_role
- **tier_verifications**: id, user_id, tier_requested, status, soft_deleted, deleted_at, deleted_by, deleted_by_role

## What's Been Implemented

### Session 1 (Previous)
- Full estate planning platform with all core features
- Multi-role architecture (Founder/Operator portals)
- SOC 2 audit trail
- Apple Passkeys
- TransitionGate security
- Cascade user deletion
- Production crash fixes (yarn.lock dependency drift)
- Housekeeping script

### Session 2 (Current - March 8, 2026)
- **Soft-Delete System**: All Operations Portal delete actions now soft-delete (mark `soft_deleted: true`) instead of hard-deleting. Only the Founder can restore soft-deleted items.
- **Visible Delete Buttons**: Added prominent trash buttons at first-level for all items in TVT, DTS, Support, and Verify tabs
- **Founder-Only Restore**: Restore endpoints return 403 for operators; only admin role can undo deletes
- **Menu Cleanup (All 4 Portals)**:
  - Founder sidebar: Removed "FOUNDER OPS" title, removed Subscription and Security Settings links
  - Operator sidebar: Clean with only Operations-relevant items, no access to Founder Portal
  - Benefactor sidebar: Properly shows Settings, Subscription, Security Settings, Support
  - Beneficiary sidebar: Shows Settings and Support only
- **OTP Toggle**: Only visible for admin role, NOT for operators, NOT when on /ops paths
- **Settings Page**: Hides Notifications (Weekly Digest) and GDPR/Privacy sections for staff (admin/operator)
- **Role-Aware Paths**: "Needs Your Attention" dashboard cards use operator-aware paths when in operatorMode
- **Operator Access**: All Operations Portal endpoints (stats, support, DTS, TVT, verifications) now accept both admin and operator roles

## Prioritized Backlog

### P0 — Re-implement Deferred Features
- Pull-to-refresh
- Native haptic feedback
- Network status banner
- Force update gate
- Error reporter
- Note: Must be done carefully to avoid modifying yarn.lock / causing dependency drift

### P1 — Finalize Share Extension Setup
- Guide through Xcode & App Store Connect manual steps (App Group, Share Extension target)

### P2 — Twilio SMS OTP
- Pending A2P 10DLC approval

## Critical Notes for Future Agents
- **DO NOT MODIFY `yarn.lock`!** Use `yarn add --frozen-lockfile` if adding dependencies
- **Use the Housekeeping Script**: `bash /app/housekeeping.sh` for safe audits
- **Understand the Role System**: 4 roles with distinct permissions enforced on both frontend and backend
- **Soft-Delete Pattern**: All Operations Portal deletes are soft-deletes. Founders see a "Show Deleted" toggle to view and restore.

## Test Credentials
- **Founder Portal**: admin@carryon.com (password unknown), test_admin_t1@example.com / Password.123
- **Benefactor**: fulltest@test.com / Password.123
- **Operator**: test_operator_t1@example.com / Password.123

## 3rd Party Integrations
Stripe, Apple IAP, Resend, xAI Grok, Twilio, AWS S3, MongoDB Atlas, Capgo
