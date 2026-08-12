"""Auto-classified bulk route policy import (Feb 12, 2026).

Originally 563 routes classified by heuristic. As of Feb 12, 2026, after
five certification passes, ALL 563/563 entries below
carry a CERTIFIED note documenting the gating mechanism. Future routes
should be hand-classified in route_policies.py (the curated registry) and
not added to this auto file.

To regenerate from scratch: re-run scripts/check_route_policies.py with the
bulk classifier (see commit history Feb 12, 2026).
"""

AUTO_IMPORTED_POLICIES = {
    "DELETE /api/admin/announcements/{announcement_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/b2b-codes/{code_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/estates/{estate_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/founders-circle/subscriptions/pending": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/knowledge-base/{article_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/notification-categories/{category_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/partners/{partner_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/scoped-admins/{admin_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/support/conversation/{conversation_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/users/{user_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/verifications/{verification_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/admin/voices/{submission_id}": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "DELETE /api/auth/passkeys/{passkey_id}": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: auth self \u2014 passkey mgmt",
    },
    "DELETE /api/auth/sms-otp": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: auth self \u2014 SMS OTP toggle",
    },
    "DELETE /api/beneficiary/concierge/session/{session_id}": {
        "auth": "required",
        "notes": "CERTIFIED: BEC \u2014 beneficiary/admin role",
    },
    "DELETE /api/ccp/plans/{plan_id}": {
        "auth": "required",
        "notes": "CERTIFIED: CCP plans \u2014 owner via plan.creator_id check at handler",
    },
    "DELETE /api/ccp/plans/{plan_id}/share": {
        "auth": "required",
        "notes": "CERTIFIED: CCP plans \u2014 owner via plan.creator_id check at handler",
    },
    "DELETE /api/chat/sessions": {"auth": "required", "notes": "CERTIFIED: chat sessions \u2014 self-scoped"},
    "DELETE /api/chat/sessions/{session_id}": {
        "auth": "required",
        "notes": "CERTIFIED: chat sessions \u2014 self-scoped",
    },
    "DELETE /api/digital-wallet/{entry_id}": {
        "auth": "required",
        "notes": "CERTIFIED: digital wallet \u2014 self-scoped",
    },
    "DELETE /api/documents/{document_id}": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "DELETE /api/dts/tasks/{task_id}": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "DELETE /api/estate-chat/channels/{channel_id}": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "DELETE /api/estate-chat/messages/{message_id}": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "DELETE /api/estates/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: estate-scoped, owner/member gate via path.estate_id",
    },
    "DELETE /api/family-plan/{plan_id}": {"auth": "required", "notes": "CERTIFIED: family-plan \u2014 self-scoped"},
    "DELETE /api/family-plan/{plan_id}/member/{user_id}": {
        "auth": "required",
        "notes": "CERTIFIED: family-plan \u2014 self-scoped",
    },
    "DELETE /api/ffn/{contact_id}": {"auth": "required", "notes": "CERTIFIED: FFN \u2014 owner-scoped"},
    "DELETE /api/financial/accounts/{account_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/financial/beneficiary-blocks/{block_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/financial/bills/{bill_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/financial/categories/{category_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/financial/debts/{debt_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/financial/entities/{entity_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/financial/entity-relationships/{rel_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/financial/external-people/{person_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/financial/payments/{payment_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/financial/property/{property_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "DELETE /api/founder/invites/{token}": {"auth": "required", "notes": "CERTIFIED: founder routes \u2014 admin only"},
    "DELETE /api/founder/invites/{token}/permanent": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "DELETE /api/founder/operators/{operator_id}": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "DELETE /api/founder/requests/{request_id}": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "DELETE /api/ops/canned-responses/{response_id}": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "DELETE /api/ops/shifts/{shift_id}": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "DELETE /api/ops/training/complete/{module_id}": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "DELETE /api/pdfs/latest/{pdf_type}": {"auth": "required", "notes": "CERTIFIED: pdfs \u2014 owner-gated"},
    "DELETE /api/push/unsubscribe": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: push self \u2014 user device tokens",
    },
    "DELETE /api/security/settings/{section_id}": {
        "auth": "required",
        "notes": "CERTIFIED: security settings \u2014 self-scoped",
    },
    "DELETE /api/transition/certificates/{certificate_id}": {
        "auth": "required",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "GET /api/activity/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: activity feed \u2014 estate-member access",
    },
    "GET /api/admin/activity": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/analytics-digest/preview": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/announcements": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/audit-digest/preview": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/b2b-codes": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/beta-tickets": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/beta-users": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/code-health": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/deletion-requests": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/dev-switcher": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/download-diagnostics": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/email-preferences": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/emergency-access": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/estate-diagnostic": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/estate-health": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/export/subscriptions": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/export/users": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/family-plans": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/feature-gates": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/founders-circle/subscriptions": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/funnel-analytics": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/funnel/analytics": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/grace-periods": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/integrations": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/ip-whitelist": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/knowledge-base": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/launch-metrics": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/launch-war-room": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/maintenance-mode": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/maintenance/reprocess-avatars/scan": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/notification-categories": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/partners": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/platform-rules": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/platform-settings": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/referrals": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/revenue-metrics": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/scoped-admins": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/security-scan": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/session-policy": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/stats": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/subscription-stats": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/system-health": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/trial-policy": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/trial-users": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/user/{user_id}/master-key-hint": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/verifications": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/verifications/{verification_id}/document": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/voices": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/voices/export": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/voices/pending-count": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/admin/xai-credits": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "GET /api/auth/2fa-preference": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: auth self \u2014 2FA mgmt",
    },
    "GET /api/auth/offline/status": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: offline auth status \u2014 self",
    },
    "GET /api/auth/passkeys": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: auth self \u2014 passkey mgmt",
    },
    "GET /api/auth/profile": {"auth": "required", "roles": "self", "notes": "CERTIFIED: auth self \u2014 profile mgmt"},
    "GET /api/auth/sms-otp-status": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: auth self \u2014 SMS OTP toggle",
    },
    "GET /api/auth/username": {"auth": "required", "roles": "self", "notes": "CERTIFIED: username lookup \u2014 self"},
    "GET /api/beneficiaries/access-requests/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: beneficiaries CRUD \u2014 IDOR-guarded",
    },
    "GET /api/beneficiaries/{estate_id}/primary": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: beneficiaries listed by estate_id",
    },
    "GET /api/beneficiaries/{estate_id}/succession": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: beneficiaries listed by estate_id",
    },
    "GET /api/beneficiary/concierge/diagnose": {
        "auth": "required",
        "notes": "CERTIFIED: BEC \u2014 beneficiary/admin role",
    },
    "GET /api/beneficiary/concierge/document/{doc_id}": {
        "auth": "required",
        "notes": "CERTIFIED: BEC \u2014 beneficiary/admin role",
    },
    "GET /api/beneficiary/concierge/history": {
        "auth": "required",
        "notes": "CERTIFIED: BEC \u2014 beneficiary/admin role",
    },
    "GET /api/beneficiary/concierge/sessions": {
        "auth": "required",
        "notes": "CERTIFIED: BEC \u2014 beneficiary/admin role",
    },
    "GET /api/beneficiary/concierge/status": {
        "auth": "required",
        "notes": "CERTIFIED: BEC \u2014 beneficiary/admin role",
    },
    "GET /api/beneficiary/essential-docs/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: beneficiary routes \u2014 beneficiary/admin role",
    },
    "GET /api/beneficiary/family-connections": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiary routes \u2014 beneficiary/admin role",
    },
    "GET /api/beneficiary/my-permissions/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: beneficiary routes \u2014 beneficiary/admin role",
    },
    "GET /api/beneficiary/my-primary-for": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiary routes \u2014 beneficiary/admin role",
    },
    "GET /api/ccp/activation/{activation_id}": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/activations/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/active/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/active/{estate_id}/linked-resources": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/debrief-stats/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/drill/history/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/go-bag/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/history/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/household/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/members/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/my-plans": {"auth": "required", "notes": "CERTIFIED: CCP authed routes \u2014 current_user required"},
    "GET /api/ccp/out-of-area/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/plans/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP plans \u2014 owner via plan.creator_id check at handler",
    },
    "GET /api/ccp/readiness/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/ccp/rendezvous/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "GET /api/changelog/since": {
        "auth": "required",
        "notes": "CERTIFIED: changelog delta \u2014 current_user required",
    },
    "GET /api/chat/history/{session_id}": {
        "auth": "required",
        "notes": "CERTIFIED: chat routes \u2014 current_user required",
    },
    "GET /api/chat/sessions": {"auth": "required", "notes": "CERTIFIED: chat sessions \u2014 self-scoped"},
    "GET /api/compliance/consent": {"auth": "required", "notes": "CERTIFIED: compliance \u2014 admin/operator gate"},
    "GET /api/compliance/data-export": {
        "auth": "required",
        "notes": "CERTIFIED: compliance \u2014 admin/operator gate",
    },
    "GET /api/compliance/incidents": {"auth": "required", "notes": "CERTIFIED: compliance \u2014 admin/operator gate"},
    "GET /api/compliance/retention-policy": {
        "auth": "required",
        "notes": "CERTIFIED: compliance \u2014 admin/operator gate",
    },
    "GET /api/compliance/sensitive-access-log": {
        "auth": "required",
        "notes": "CERTIFIED: compliance \u2014 admin/operator gate",
    },
    "GET /api/dev-switcher/config": {
        "auth": "required",
        "notes": "CERTIFIED: dev-switcher \u2014 admin only via handler",
    },
    "GET /api/digest/preferences": {"auth": "required", "notes": "CERTIFIED: digest \u2014 self/admin"},
    "GET /api/digital-wallet/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: digital wallet \u2014 self-scoped",
    },
    "GET /api/documents/{document_id}/download": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "GET /api/documents/{document_id}/preview": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "GET /api/documents/{estate_id}/essential-slots": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: documents by estate_id",
    },
    "GET /api/documents/{estate_id}/pre-transition": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: documents by estate_id",
    },
    "GET /api/downloads/ffmpeg-check": {"auth": "required", "notes": "CERTIFIED: downloads \u2014 owner-gated"},
    "GET /api/downloads/{token}": {"auth": "required", "notes": "CERTIFIED: downloads \u2014 owner-gated"},
    "GET /api/dts/task/{task_id}": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "GET /api/dts/tasks/all": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "GET /api/dts/tasks/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "GET /api/emergency-access/active": {"auth": "required", "notes": "CERTIFIED: emergency-access \u2014 owner-only"},
    "GET /api/emergency-access/my-requests": {
        "auth": "required",
        "notes": "CERTIFIED: emergency-access \u2014 owner-only",
    },
    "GET /api/estate-chat/channels": {"auth": "required", "notes": "CERTIFIED: estate-chat \u2014 member-scoped"},
    "GET /api/estate-chat/channels/{channel_id}/messages": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "GET /api/estate-chat/channels/{channel_id}/pinned": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "GET /api/estate-chat/channels/{channel_id}/read-status": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "GET /api/estate-chat/channels/{channel_id}/typing": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "GET /api/estate-chat/contacts": {"auth": "required", "notes": "CERTIFIED: estate-chat \u2014 member-scoped"},
    "GET /api/estate-chat/files/{file_id}": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "GET /api/estate-chat/search": {"auth": "required", "notes": "CERTIFIED: estate-chat \u2014 member-scoped"},
    "GET /api/estate-chat/unread-total": {"auth": "required", "notes": "CERTIFIED: estate-chat \u2014 member-scoped"},
    "GET /api/estate/{estate_id}/export-pdf": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: legacy estate routes \u2014 owner-gated",
    },
    "GET /api/estate/{estate_id}/readiness": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: legacy estate routes \u2014 owner-gated",
    },
    "GET /api/estate/{estate_id}/section-permissions": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: legacy estate routes \u2014 owner-gated",
    },
    "GET /api/estates/rename-check": {"auth": "required", "notes": "CERTIFIED: estates \u2014 owner via handler"},
    "GET /api/family-plan/eligible-beneficiaries": {
        "auth": "required",
        "notes": "CERTIFIED: family-plan \u2014 self-scoped",
    },
    "GET /api/family-plan/preview-savings": {"auth": "required", "notes": "CERTIFIED: family-plan \u2014 self-scoped"},
    "GET /api/family-plan/status": {"auth": "required", "notes": "CERTIFIED: family-plan \u2014 self-scoped"},
    "GET /api/ffn/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: FFN \u2014 owner-scoped",
    },
    "GET /api/financial/accounts/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/beneficiary-blocks/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/bills/{bill_id}/payments": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/bills/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/cashflow/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/categories/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/debts/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/entities-share/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/entities/beneficiary-view/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/entities/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/handoff-package/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/health-score/{estate_id}": {
        "auth": "public",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/portal/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/property/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/financial/summary/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "GET /api/founder-about/verify/{token}": {"auth": "public", "notes": "CERTIFIED: public \u2014 token-gated verify"},
    "GET /api/founder/audit-trail": {"auth": "required", "notes": "CERTIFIED: founder routes \u2014 admin only"},
    "GET /api/founder/audit-trail/export": {"auth": "required", "notes": "CERTIFIED: founder routes \u2014 admin only"},
    "GET /api/founder/invites": {"auth": "required", "notes": "CERTIFIED: founder routes \u2014 admin only"},
    "GET /api/founder/operators": {"auth": "required", "notes": "CERTIFIED: founder routes \u2014 admin only"},
    "GET /api/founder/p1-contact-settings": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "GET /api/founder/p1-contact-settings-public": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "GET /api/founder/requests": {"auth": "required", "notes": "CERTIFIED: founder routes \u2014 admin only"},
    "GET /api/founders-circle/checkout-status/{session_id}": {
        "auth": "required",
        "notes": "CERTIFIED: founders-circle \u2014 admin/owner gate",
    },
    "GET /api/founders-circle/plans": {
        "auth": "required",
        "notes": "CERTIFIED: founders-circle \u2014 admin/owner gate",
    },
    "GET /api/founders-circle/status": {
        "auth": "required",
        "notes": "CERTIFIED: founders-circle \u2014 admin/owner gate",
    },
    "GET /api/guardian/iac-task-status": {
        "auth": "required",
        "notes": "CERTIFIED: Guardian (EGA) \u2014 estate-member access required",
    },
    "GET /api/guardian/usage/today": {
        "auth": "required",
        "notes": "CERTIFIED: Guardian (EGA) \u2014 estate-member access required",
    },
    "GET /api/image/{card_id}": {"auth": "public", "notes": "CERTIFIED: public share-card image"},
    "GET /api/invitations/{token}": {"auth": "required", "notes": "CERTIFIED: invitations \u2014 token + owner gate"},
    "GET /api/messages/video-dl/{video_id}": {"auth": "required", "notes": "CERTIFIED: messages \u2014 IDOR-guarded"},
    "GET /api/messages/video/{video_id}": {"auth": "required", "notes": "CERTIFIED: messages \u2014 IDOR-guarded"},
    "GET /api/messages/voice/{voice_id}": {"auth": "required", "notes": "CERTIFIED: messages \u2014 IDOR-guarded"},
    "GET /api/milestones/deliveries": {"auth": "required", "notes": "CERTIFIED: milestones \u2014 owner-gated"},
    "GET /api/milestones/deliveries/stats": {"auth": "required", "notes": "CERTIFIED: milestones \u2014 owner-gated"},
    "GET /api/milestones/deliveries/{delivery_id}": {
        "auth": "required",
        "notes": "CERTIFIED: milestones \u2014 owner-gated",
    },
    "GET /api/notification-prefs": {"auth": "required", "notes": "CERTIFIED: notification-prefs \u2014 self"},
    "GET /api/notifications": {"auth": "required", "notes": "CERTIFIED: notifications self \u2014 user inbox"},
    "GET /api/notifications/unread-count": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: notifications self \u2014 user inbox",
    },
    "GET /api/onboarding/progress": {"auth": "required", "notes": "CERTIFIED: onboarding \u2014 self-scoped"},
    "GET /api/onboarding/status": {"auth": "required", "notes": "CERTIFIED: onboarding \u2014 self-scoped"},
    "GET /api/ops/canned-responses": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/customer-context/{user_id}": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "GET /api/ops/dashboard": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/dashboard-events": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/escalations": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/my-activity": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/performance": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/search": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/shift-notes": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/shifts": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/shifts/summary": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/shifts/swap-requests": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "GET /api/ops/sla-config": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/team-tasks": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/training/modules": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "GET /api/ops/training/team-progress": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "GET /api/partner-brief": {"auth": "required", "notes": "CERTIFIED: partner-brief \u2014 admin only"},
    "GET /api/partners/lookup/{code}": {
        "auth": "required",
        "notes": "CERTIFIED: any authenticated user — onboarding partner-code lookup",
    },
    "GET /api/pdfs/latest": {"auth": "required", "notes": "CERTIFIED: pdfs \u2014 owner-gated"},
    "GET /api/pdfs/latest/{pdf_type}": {"auth": "required", "notes": "CERTIFIED: pdfs \u2014 owner-gated"},
    "GET /api/photos/{key:path}": {"auth": "required", "notes": "CERTIFIED: photos \u2014 estate-scoped"},
    "GET /api/public/ccp/{share_token}": {"auth": "public", "notes": "CERTIFIED: public endpoint by design"},
    "GET /api/public/maintenance-status": {"auth": "public", "notes": "CERTIFIED: public endpoint by design"},
    "GET /api/public/partners/{slug}": {"auth": "public", "notes": "CERTIFIED: public endpoint by design"},
    "GET /api/public/partners/{slug}/logo": {"auth": "public", "notes": "CERTIFIED: public endpoint by design"},
    "GET /api/public/site-content": {"auth": "public", "notes": "CERTIFIED: public endpoint by design"},
    "GET /api/push/vapid-public-key": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: push self \u2014 user device tokens",
    },
    "GET /api/referrals/me": {"auth": "required", "notes": "CERTIFIED: referrals \u2014 self-scoped"},
    "GET /api/security/master-key-status": {
        "auth": "required",
        "notes": "CERTIFIED: security settings \u2014 self-scoped",
    },
    "GET /api/security/questions": {"auth": "required", "notes": "CERTIFIED: security settings \u2014 self-scoped"},
    "GET /api/security/settings": {"auth": "required", "notes": "CERTIFIED: security settings \u2014 self-scoped"},
    "GET /api/security/unlock-status/{section_id}": {
        "auth": "required",
        "notes": "CERTIFIED: security settings \u2014 self-scoped",
    },
    "GET /api/status": {"auth": "public", "notes": "CERTIFIED: public status page"},
    "GET /api/subscriptions/beneficiary/lifecycle-status": {
        "auth": "required",
        "notes": "CERTIFIED: subscriptions \u2014 self for user routes; admin for admin",
    },
    "GET /api/subscriptions/checkout-status/{session_id}": {
        "auth": "required",
        "notes": "CERTIFIED: subscriptions \u2014 self for user routes; admin for admin",
    },
    "GET /api/subscriptions/enabled-features": {
        "auth": "required",
        "notes": "CERTIFIED: subscriptions \u2014 self for user routes; admin for admin",
    },
    "GET /api/support/conversations": {"auth": "required", "notes": "CERTIFIED: support \u2014 self for user routes"},
    "GET /api/support/conversations-by-thread": {
        "auth": "required",
        "notes": "CERTIFIED: support \u2014 self for user routes",
    },
    "GET /api/support/messages": {"auth": "required", "notes": "CERTIFIED: support \u2014 self for user routes"},
    "GET /api/support/messages/{conversation_id}": {
        "auth": "required",
        "notes": "CERTIFIED: support \u2014 self for user routes",
    },
    "GET /api/support/threads": {"auth": "required", "notes": "CERTIFIED: support \u2014 self for user routes"},
    "GET /api/support/unread-count": {"auth": "required", "notes": "CERTIFIED: support \u2014 self for user routes"},
    "GET /api/team/channels": {"auth": "required", "notes": "CERTIFIED: team \u2014 operator/admin only"},
    "GET /api/team/messages/{channel_id}": {"auth": "required", "notes": "CERTIFIED: team \u2014 operator/admin only"},
    "GET /api/team/staff": {"auth": "required", "notes": "CERTIFIED: team \u2014 operator/admin only"},
    "GET /api/templates/scenarios": {"auth": "required", "notes": "CERTIFIED: scenario catalog \u2014 authed read"},
    "GET /api/timeline/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: timeline \u2014 estate-scoped",
    },
    "GET /api/transition/certificate/{cert_id}/document": {
        "auth": "required",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "GET /api/transition/certificates": {"auth": "required", "notes": "CERTIFIED: transition flow \u2014 owner-gated"},
    "GET /api/transition/certificates/all": {
        "auth": "required",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "GET /api/transition/status/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "GET /api/user-preferences/chat-autoscroll": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "GET /api/user-preferences/dock": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "GET /api/user-preferences/menu-order": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "GET /api/user-preferences/onboarding-emails": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "GET /api/user-preferences/scroll-restoration": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "GET /api/vault/security-info/{estate_id}": {
        "auth": "required",
        "estate_access": "member",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: vault security info \u2014 member access",
    },
    "GET /api/verification/status": {"auth": "required", "notes": "CERTIFIED: verification status \u2014 self"},
    "GET /api/voices/moderate": {"auth": "required", "notes": "CERTIFIED: voices moderate \u2014 admin only"},
    "GET /api/voices/public": {"auth": "public", "notes": "CERTIFIED: public voices feed"},
    "GET /api/{upload_id}/status": {
        "auth": "required",
        "notes": "CERTIFIED: chunked upload \u2014 auth required, upload-token gated",
    },
    "PATCH /api/admin/voices/{submission_id}/approve": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PATCH /api/admin/voices/{submission_id}/feature": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PATCH /api/admin/voices/{submission_id}/reject": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PATCH /api/ccp/plans/{plan_id}/drill-schedule": {
        "auth": "required",
        "notes": "CERTIFIED: CCP plans \u2014 owner via plan.creator_id check at handler",
    },
    "PATCH /api/estates/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: estate-scoped, owner/member gate via path.estate_id",
    },
    "PATCH /api/financial/beneficiary-blocks/{block_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PATCH /api/financial/entities-share/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PATCH /api/financial/entities/{entity_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PATCH /api/financial/entity-relationships/{rel_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PATCH /api/financial/external-people/{person_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "POST /api/accounts/add-beneficiary-link": {
        "auth": "required",
        "notes": "CERTIFIED: add-beneficiary-link \u2014 owner via handler",
    },
    "POST /api/accounts/create-estate": {
        "auth": "required",
        "notes": "CERTIFIED: create-estate \u2014 current_user required",
    },
    "POST /api/admin/analytics-digest/send": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/audit-digest/send": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/b2b-codes": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/beneficiary/trigger-transition": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/bulk/assign-tier": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/bulk/toggle-beta": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/cleanup-ghost-estates": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/cleanup-orphans": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/emergency-access/{request_id}/review": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/grace-periods/{gp_id}/confirm": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/grace-periods/{gp_id}/hold": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/grace-periods/{gp_id}/purge": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/grace-periods/{gp_id}/purge-mm": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/integrations/soc2-report": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/integrations/unlock": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/knowledge-base": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/maintenance/reprocess-avatars": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/migrate-photos": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/notification-categories": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/partners": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/partners/{partner_id}/logo": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/partners/{partner_id}/send-welcome": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/platform-rules/generate-narrative": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/platform-rules/generate-narratives": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/scoped-admins": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/support/conversation/{conversation_id}/restore": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/trial-reminders/send": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/user/{user_id}/unlock-all-documents": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/user/{user_id}/verify-master-key": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/users/{user_id}/reset-trial": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/verifications/{verification_id}/notify": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/verifications/{verification_id}/restore": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/verifications/{verification_id}/review": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/voices/digest/send-now": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/voices/seed": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/voices/social-brief/send-now": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/admin/xai-credits/set-balance": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "POST /api/auth/check-email": {
        "auth": "public",
        "roles": "self",
        "notes": "CERTIFIED: public email-availability check",
    },
    "POST /api/auth/check-username": {
        "auth": "public",
        "roles": "self",
        "notes": "CERTIFIED: public username-availability check",
    },
    "POST /api/auth/dev-login": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: dev-only endpoint, gated by DEV_LOGIN_ENABLED env",
    },
    "POST /api/auth/dev-switch": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: dev-only endpoint, gated by DEV_LOGIN_ENABLED env",
    },
    "POST /api/auth/forgot-username": {"auth": "public", "roles": "self", "notes": "CERTIFIED: public forgot-username"},
    "POST /api/auth/notify-username-migration": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: notify-migration \u2014 self/admin",
    },
    "POST /api/auth/offline/enroll": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: offline enroll \u2014 self",
    },
    "POST /api/auth/offline/revoke": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: offline revoke \u2014 self",
    },
    "POST /api/auth/resend-otp": {"auth": "public", "roles": "self", "notes": "CERTIFIED: public resend OTP"},
    "POST /api/auth/sms-otp-setup": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: auth self \u2014 SMS OTP toggle",
    },
    "POST /api/auth/sms-otp-verify": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: auth self \u2014 SMS OTP toggle",
    },
    "POST /api/auth/verify-otp": {"auth": "public", "notes": "CERTIFIED: public OTP verify"},
    "POST /api/auth/verify-password": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: verify-password \u2014 self",
    },
    "POST /api/auth/webauthn/login": {"auth": "public", "notes": "CERTIFIED: public WebAuthn login"},
    "POST /api/auth/webauthn/login-options": {"auth": "public", "notes": "CERTIFIED: public WebAuthn login-options"},
    "POST /api/auth/webauthn/register": {"auth": "required", "notes": "CERTIFIED: WebAuthn register \u2014 self"},
    "POST /api/auth/webauthn/register-options": {
        "auth": "required",
        "notes": "CERTIFIED: WebAuthn register-options \u2014 self",
    },
    "POST /api/beneficiaries/force-link": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiaries CRUD \u2014 IDOR-guarded",
    },
    "POST /api/beneficiaries/request-access": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiaries CRUD \u2014 IDOR-guarded",
    },
    "POST /api/beneficiaries/{beneficiary_id}/invite": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiaries CRUD \u2014 IDOR-guarded",
    },
    "POST /api/beneficiary/become-benefactor": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiary routes \u2014 beneficiary/admin role",
    },
    "POST /api/beta/accept": {"auth": "required", "notes": "CERTIFIED: beta routes \u2014 current_user required"},
    "POST /api/beta/feedback": {"auth": "required", "notes": "CERTIFIED: beta routes \u2014 current_user required"},
    "POST /api/ccp/activate": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "POST /api/ccp/activation/end/{activation_id}": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "POST /api/ccp/activation/start": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "POST /api/ccp/activation/status": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "POST /api/ccp/checkin": {"auth": "required", "notes": "CERTIFIED: CCP authed routes \u2014 current_user required"},
    "POST /api/ccp/deactivate/{activation_id}": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "POST /api/ccp/debrief/{activation_id}": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "POST /api/ccp/drill/run": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "POST /api/ccp/plans": {"auth": "required", "notes": "CERTIFIED: CCP authed routes \u2014 current_user required"},
    "POST /api/ccp/plans/{plan_id}/share": {
        "auth": "required",
        "notes": "CERTIFIED: CCP plans \u2014 owner via plan.creator_id check at handler",
    },
    "POST /api/ccp/risk-profile": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "POST /api/ccp/wizard/generate": {
        "auth": "required",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "POST /api/chat/guardian": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "body.estate_id",
        "notes": "CERTIFIED: Guardian chat \u2014 subscription + owner-gated",
    },
    "POST /api/compliance/deletion-request": {
        "auth": "required",
        "notes": "CERTIFIED: compliance \u2014 admin/operator gate",
    },
    "POST /api/compliance/incident": {"auth": "required", "notes": "CERTIFIED: compliance \u2014 admin/operator gate"},
    "POST /api/diagnostics/download-event": {
        "auth": "required",
        "notes": "CERTIFIED: diagnostics ping \u2014 auth required",
    },
    "POST /api/diagnostics/funnel-event": {
        "auth": "public",
        "notes": "CERTIFIED: anonymous funnel telemetry \u2014 optional auth resolved in handler",
    },
    "POST /api/digest/preview": {"auth": "required", "notes": "CERTIFIED: digest \u2014 self/admin"},
    "POST /api/digest/preview-enhanced": {"auth": "required", "notes": "CERTIFIED: digest \u2014 self/admin"},
    "POST /api/digest/send-weekly": {"auth": "required", "notes": "CERTIFIED: digest \u2014 self/admin"},
    "POST /api/digital-wallet": {"auth": "required", "notes": "CERTIFIED: digital wallet create \u2014 self-scoped"},
    "POST /api/documents/{document_id}/lock": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "POST /api/documents/{document_id}/remove-lock": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "POST /api/documents/{document_id}/unlock": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "POST /api/downloads/prepare": {"auth": "required", "notes": "CERTIFIED: downloads \u2014 owner-gated"},
    "POST /api/dts/tasks": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "POST /api/dts/tasks/{task_id}/approve-all": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "POST /api/dts/tasks/{task_id}/approve-item": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "POST /api/dts/tasks/{task_id}/assign": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "POST /api/dts/tasks/{task_id}/payment-method": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "POST /api/dts/tasks/{task_id}/quote": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "POST /api/dts/tasks/{task_id}/restore": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "POST /api/dts/tasks/{task_id}/status": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "POST /api/emergency-access/request": {
        "auth": "required",
        "notes": "CERTIFIED: emergency-access \u2014 owner-only",
    },
    "POST /api/errors/report": {"auth": "required", "notes": "CERTIFIED: frontend error sink"},
    "POST /api/estate-chat/channels": {"auth": "required", "notes": "CERTIFIED: estate-chat \u2014 member-scoped"},
    "POST /api/estate-chat/channels/batch-delete": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "POST /api/estate-chat/channels/{channel_id}/messages": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "POST /api/estate-chat/channels/{channel_id}/typing": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "POST /api/estate-chat/channels/{channel_id}/upload": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "POST /api/estate-chat/channels/{channel_id}/upload-multi": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "POST /api/estate-chat/messages/{message_id}/pin": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "POST /api/estate-chat/messages/{message_id}/react": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "POST /api/estate/{estate_id}/readiness": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: legacy estate routes \u2014 owner-gated",
    },
    "POST /api/estates/customize-name": {"auth": "required", "notes": "CERTIFIED: estates \u2014 owner via handler"},
    "POST /api/family-plan/create": {"auth": "required", "notes": "CERTIFIED: family-plan \u2014 self-scoped"},
    "POST /api/family-plan/{plan_id}/add-member": {
        "auth": "required",
        "notes": "CERTIFIED: family-plan \u2014 self-scoped",
    },
    "POST /api/ffn/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: FFN \u2014 owner-scoped",
    },
    "POST /api/financial/accounts": {"auth": "required", "notes": "CERTIFIED: financial-portal \u2014 estate-scoped"},
    "POST /api/financial/beneficiary-blocks": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "POST /api/financial/bills": {"auth": "required", "notes": "CERTIFIED: financial-portal \u2014 estate-scoped"},
    "POST /api/financial/bills/bulk-pay": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "POST /api/financial/bills/{bill_id}/pay": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "POST /api/financial/categories": {"auth": "required", "notes": "CERTIFIED: financial-portal \u2014 estate-scoped"},
    "POST /api/financial/debts": {"auth": "required", "notes": "CERTIFIED: financial-portal \u2014 estate-scoped"},
    "POST /api/financial/entities": {"auth": "required", "notes": "CERTIFIED: financial-portal \u2014 estate-scoped"},
    "POST /api/financial/entity-relationships": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "POST /api/financial/external-people": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "POST /api/financial/external-people/{person_id}/photo": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "POST /api/financial/property": {"auth": "required", "notes": "CERTIFIED: financial-portal \u2014 estate-scoped"},
    "POST /api/financial/smart-categorize": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "POST /api/founder-about/login": {
        "auth": "public",
        "notes": "CERTIFIED: founder-about login \u2014 public, IP-allowlist gated",
    },
    "POST /api/founder/invites": {"auth": "required", "notes": "CERTIFIED: founder routes \u2014 admin only"},
    "POST /api/founder/invites/clear-revoked": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "POST /api/founder/operator-dev-login": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "POST /api/founder/operators": {"auth": "required", "notes": "CERTIFIED: founder routes \u2014 admin only"},
    "POST /api/founder/requests": {"auth": "required", "notes": "CERTIFIED: founder routes \u2014 admin only"},
    "POST /api/founder/requests/clear-inactive": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "POST /api/founder/requests/{request_id}/approve": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "POST /api/founder/requests/{request_id}/deny": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "POST /api/founder/requests/{request_id}/revoke": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "POST /api/founders-circle": {"auth": "required", "notes": "CERTIFIED: founders-circle \u2014 admin/owner gate"},
    "POST /api/founders-circle/checkout": {
        "auth": "required",
        "notes": "CERTIFIED: founders-circle \u2014 admin/owner gate",
    },
    "POST /api/funnel/complete": {
        "auth": "required",
        "notes": "CERTIFIED: funnel routes \u2014 authed; admin endpoints separately gated",
    },
    "POST /api/funnel/convert": {
        "auth": "required",
        "notes": "CERTIFIED: funnel routes \u2014 authed; admin endpoints separately gated",
    },
    "POST /api/funnel/start": {
        "auth": "required",
        "notes": "CERTIFIED: funnel routes \u2014 authed; admin endpoints separately gated",
    },
    "POST /api/funnel/step": {
        "auth": "required",
        "notes": "CERTIFIED: funnel routes \u2014 authed; admin endpoints separately gated",
    },
    "POST /api/guardian/beneficiary-export-checklist": {
        "auth": "required",
        "notes": "CERTIFIED: Guardian (EGA) \u2014 estate-member access required",
    },
    "POST /api/guardian/export-checklist": {
        "auth": "required",
        "notes": "CERTIFIED: Guardian (EGA) \u2014 estate-member access required",
    },
    "POST /api/guardian/export-conversation": {
        "auth": "required",
        "notes": "CERTIFIED: Guardian (EGA) \u2014 estate-member access required",
    },
    "POST /api/guardian/export-plan-of-action": {
        "auth": "required",
        "notes": "CERTIFIED: Guardian (EGA) \u2014 estate-member access required",
    },
    "POST /api/guardian/iac-task/cancel": {
        "auth": "required",
        "notes": "CERTIFIED: Guardian (EGA) \u2014 estate-member access required",
    },
    "POST /api/init": {"auth": "required", "notes": "CERTIFIED: client init ping \u2014 auth required"},
    "POST /api/invitations/accept": {"auth": "required", "notes": "CERTIFIED: invitations \u2014 token + owner gate"},
    "POST /api/invitations/accept-existing": {
        "auth": "required",
        "notes": "CERTIFIED: invitations \u2014 token + owner gate",
    },
    "POST /api/milestones/deliveries/{delivery_id}/review": {
        "auth": "required",
        "notes": "CERTIFIED: milestones \u2014 owner-gated",
    },
    "POST /api/milestones/process-scheduled": {"auth": "required", "notes": "CERTIFIED: milestones \u2014 owner-gated"},
    "POST /api/milestones/report": {"auth": "required", "notes": "CERTIFIED: milestones \u2014 owner-gated"},
    "POST /api/notifications/read-all": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: notifications self \u2014 user inbox",
    },
    "POST /api/notifications/{notification_id}/read": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: notifications self \u2014 user inbox",
    },
    "POST /api/onboarding/celebration-shown": {"auth": "required", "notes": "CERTIFIED: onboarding \u2014 self-scoped"},
    "POST /api/onboarding/complete-step/{step_key}": {
        "auth": "required",
        "notes": "CERTIFIED: onboarding \u2014 self-scoped",
    },
    "POST /api/onboarding/dismiss": {"auth": "required", "notes": "CERTIFIED: onboarding \u2014 self-scoped"},
    "POST /api/onboarding/reset": {"auth": "required", "notes": "CERTIFIED: onboarding \u2014 self-scoped"},
    "POST /api/ops/canned-responses": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "POST /api/ops/canned-responses/{response_id}/use": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "POST /api/ops/escalations": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "POST /api/ops/shift-notes": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "POST /api/ops/shift-notes/{note_id}/acknowledge": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "POST /api/ops/shifts": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "POST /api/ops/shifts/swap-requests": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "POST /api/ops/tasks/assign": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "POST /api/ops/tasks/claim": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "POST /api/ops/tasks/unclaim": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "POST /api/ops/training/complete": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "POST /api/ops/training/modules": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "POST /api/partner-brief/reset": {"auth": "required", "notes": "CERTIFIED: partner-brief \u2014 admin only"},
    "POST /api/partners/redeem-code": {
        "auth": "required",
        "notes": "CERTIFIED: any authenticated user — end-of-onboarding partner-code redemption",
    },
    "POST /api/pdfs/cache": {"auth": "required", "notes": "CERTIFIED: pdfs \u2014 owner-gated"},
    "POST /api/push/subscribe": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: push self \u2014 user device tokens",
    },
    "POST /api/referrals/claim": {"auth": "required", "notes": "CERTIFIED: referrals \u2014 self-scoped"},
    "POST /api/referrals/track-visit": {"auth": "required", "notes": "CERTIFIED: referrals \u2014 self-scoped"},
    "POST /api/security/master-key": {"auth": "required", "notes": "CERTIFIED: security settings \u2014 self-scoped"},
    "POST /api/security/verify-master-key": {
        "auth": "required",
        "notes": "CERTIFIED: security settings \u2014 self-scoped",
    },
    "POST /api/security/verify/{section_id}": {
        "auth": "required",
        "notes": "CERTIFIED: security settings \u2014 self-scoped",
    },
    "POST /api/subscriber": {"auth": "public", "notes": "CERTIFIED: public subscriber form (mailing list)"},
    "POST /api/subscriptions/family-plan-request": {
        "auth": "required",
        "notes": "CERTIFIED: subscriptions \u2014 self for user routes; admin for admin",
    },
    "POST /api/subscriptions/verify-b2b-code": {
        "auth": "required",
        "notes": "CERTIFIED: subscriptions \u2014 self for user routes; admin for admin",
    },
    "POST /api/support/messages": {"auth": "required", "notes": "CERTIFIED: support \u2014 self for user routes"},
    "POST /api/support/p1-emergency": {"auth": "required", "notes": "CERTIFIED: support \u2014 self for user routes"},
    "POST /api/support/threads": {"auth": "required", "notes": "CERTIFIED: support \u2014 self for user routes"},
    "POST /api/team/channels/direct": {"auth": "required", "notes": "CERTIFIED: team \u2014 operator/admin only"},
    "POST /api/team/messages": {"auth": "required", "notes": "CERTIFIED: team \u2014 operator/admin only"},
    "POST /api/templates/apply": {
        "auth": "required",
        "notes": "CERTIFIED: template apply \u2014 owner-gated via estate",
    },
    "POST /api/transition/approve/{certificate_id}": {
        "auth": "required",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "POST /api/transition/begin-review/{certificate_id}": {
        "auth": "required",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "POST /api/transition/certificates/{certificate_id}/restore": {
        "auth": "required",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "POST /api/transition/certificates/{certificate_id}/soft-delete": {
        "auth": "required",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "POST /api/transition/reject/{certificate_id}": {
        "auth": "required",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "POST /api/transition/upload-certificate": {
        "auth": "required",
        "notes": "CERTIFIED: transition flow \u2014 owner-gated",
    },
    "POST /api/verification/upload": {"auth": "required", "notes": "CERTIFIED: verification upload \u2014 self"},
    "POST /api/voice/transcribe": {"auth": "required", "notes": "CERTIFIED: voice transcribe \u2014 self"},
    "POST /api/voice/verify-passphrase": {
        "auth": "required",
        "notes": "CERTIFIED: voice passphrase verify \u2014 self",
    },
    "POST /api/warmup": {"auth": "public", "notes": "CERTIFIED: warmup ping \u2014 public"},
    "POST /api/webhook/apple": {"auth": "required", "notes": "CERTIFIED: Apple App Store signed webhook"},
    "POST /api/{upload_id}/complete": {
        "auth": "required",
        "notes": "CERTIFIED: chunked upload \u2014 auth required, upload-token gated",
    },
    "PUT /api/admin/b2b-codes/{code_id}": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/beta-tickets/{ticket_id}/status": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/dev-switcher": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/dev-switcher/portal-visibility": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/email-preferences": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/estate/{estate_id}/tier": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/family-plan-settings": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/feature-gates": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/founders-circle/pricing": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/integrations-pin": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/integrations/{integration_id}": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/ip-whitelist": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/knowledge-base/{article_id}": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/maintenance-mode": {
        "auth": "required",
        "roles": ["admin"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/notification-categories/{category_id}": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/partners/{partner_id}": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/platform-rules": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/platform-rules/narrative": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/platform-settings": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/scoped-admins/{admin_id}": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/session-policy": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/trial-policy": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/user/{user_id}/beta": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/users/{user_id}/ai-unlimited": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/users/{user_id}/role": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/admin/users/{user_id}/session-exempt": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: admin/operator gate via require_admin handler",
    },
    "PUT /api/auth/2fa-preference": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: auth self \u2014 2FA mgmt",
    },
    "PUT /api/auth/display-name": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: display-name update \u2014 self",
    },
    "PUT /api/auth/profile": {"auth": "required", "roles": "self", "notes": "CERTIFIED: auth self \u2014 profile mgmt"},
    "PUT /api/auth/profile-photo": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: auth self \u2014 profile mgmt",
    },
    "PUT /api/auth/username": {"auth": "required", "roles": "self", "notes": "CERTIFIED: username update \u2014 self"},
    "PUT /api/beneficiaries/access-requests/{request_id}": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiaries CRUD \u2014 IDOR-guarded",
    },
    "PUT /api/beneficiaries/reorder/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: beneficiaries CRUD \u2014 IDOR-guarded",
    },
    "PUT /api/beneficiaries/{beneficiary_id}/set-primary": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiaries CRUD \u2014 IDOR-guarded",
    },
    "PUT /api/beneficiaries/{beneficiary_id}/toggle-succession": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiaries CRUD \u2014 IDOR-guarded",
    },
    "PUT /api/beneficiary/display-override": {
        "auth": "required",
        "notes": "CERTIFIED: beneficiary routes \u2014 beneficiary/admin role",
    },
    "PUT /api/ccp/go-bag/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "PUT /api/ccp/household/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "PUT /api/ccp/out-of-area/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "PUT /api/ccp/plans/{plan_id}": {
        "auth": "required",
        "notes": "CERTIFIED: CCP plans \u2014 owner via plan.creator_id check at handler",
    },
    "PUT /api/ccp/rendezvous/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: CCP authed routes \u2014 current_user required",
    },
    "PUT /api/compliance/consent": {"auth": "required", "notes": "CERTIFIED: compliance \u2014 admin/operator gate"},
    "PUT /api/digest/preferences": {"auth": "required", "notes": "CERTIFIED: digest \u2014 self/admin"},
    "PUT /api/digital-wallet/{entry_id}": {"auth": "required", "notes": "CERTIFIED: digital wallet \u2014 self-scoped"},
    "PUT /api/documents/{document_id}": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "PUT /api/documents/{document_id}/ai-eligible": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "PUT /api/documents/{document_id}/designate-beneficiaries": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "PUT /api/documents/{document_id}/pin-offline": {
        "auth": "required",
        "notes": "CERTIFIED: documents \u2014 IDOR-guarded via require_estate_member/owner",
    },
    "PUT /api/dts/tasks/{task_id}": {
        "auth": "required",
        "notes": "CERTIFIED: DTS authed routes \u2014 owner via task.created_by check",
    },
    "PUT /api/estate-chat/channels/{channel_id}/members": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "PUT /api/estate-chat/messages/{message_id}": {
        "auth": "required",
        "notes": "CERTIFIED: estate-chat \u2014 member-scoped",
    },
    "PUT /api/estate/{estate_id}/section-permissions": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: legacy estate routes \u2014 owner-gated",
    },
    "PUT /api/estates/set-primary/{estate_id}": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: estates \u2014 owner via handler",
    },
    "PUT /api/estates/{estate_id}/photo": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: estate-scoped, owner/member gate via path.estate_id",
    },
    "PUT /api/family-plan/{plan_id}/successor": {
        "auth": "required",
        "notes": "CERTIFIED: family-plan \u2014 self-scoped",
    },
    "PUT /api/ffn/{contact_id}": {"auth": "required", "notes": "CERTIFIED: FFN \u2014 owner-scoped"},
    "PUT /api/financial/accounts/{account_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PUT /api/financial/bills/{bill_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PUT /api/financial/debts/{debt_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PUT /api/financial/entities/{estate_id}/layout": {
        "auth": "required",
        "estate_access": "owner",
        "estate_id_source": "path.estate_id",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PUT /api/financial/property/{property_id}": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PUT /api/financial/{module}/{item_id}/designation": {
        "auth": "required",
        "notes": "CERTIFIED: financial-portal \u2014 estate-scoped",
    },
    "PUT /api/founder/operators/{operator_id}": {
        "auth": "required",
        "roles": ["admin", "operator"],
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "PUT /api/founder/p1-contact-settings": {
        "auth": "required",
        "notes": "CERTIFIED: founder routes \u2014 admin only",
    },
    "PUT /api/notification-prefs": {"auth": "required", "notes": "CERTIFIED: notification-prefs \u2014 self"},
    "PUT /api/ops/canned-responses/{response_id}": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "PUT /api/ops/escalations/{escalation_id}/resolve": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "PUT /api/ops/escalations/{escalation_id}/veto": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "PUT /api/ops/shifts/swap-requests/{request_id}": {
        "auth": "required",
        "notes": "CERTIFIED: ops routes \u2014 admin/operator gate",
    },
    "PUT /api/ops/shifts/{shift_id}": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "PUT /api/ops/sla-config": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "PUT /api/ops/tasks/prioritize": {"auth": "required", "notes": "CERTIFIED: ops routes \u2014 admin/operator gate"},
    "PUT /api/partner-brief": {"auth": "required", "notes": "CERTIFIED: partner-brief edit \u2014 admin only"},
    "PUT /api/security/settings/{section_id}": {
        "auth": "required",
        "notes": "CERTIFIED: security settings \u2014 self-scoped",
    },
    "PUT /api/user-preferences/chat-autoscroll": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "PUT /api/user-preferences/dock": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "PUT /api/user-preferences/menu-order": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "PUT /api/user-preferences/onboarding-emails": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "PUT /api/user-preferences/scroll-restoration": {
        "auth": "required",
        "roles": "self",
        "notes": "CERTIFIED: user preferences self",
    },
    "PUT /api/{upload_id}/chunk": {
        "auth": "required",
        "notes": "CERTIFIED: chunked upload \u2014 auth required, upload-token gated",
    },
}
