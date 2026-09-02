"""CarryOn™ — Erasure manifest: the single source of truth for what account / estate
erasure does to every collection (GDPR Art. 17, CCPA §1798.105). Sep 2026.

Every collection that carries personal data MUST appear in exactly one of the maps
below. `tests/test_erasure_manifest_drift.py` fails the pre-push gate when a
collection with a user/estate key shows up in the database or in code without a
manifest entry, so an orphan class can never silently reappear.

Actions
- ESTATE_DELETE   rows deleted when the estate is erased          (matched on the listed keys = estate id)
- USER_DELETE     rows deleted when the user is erased            (matched on the listed keys = user id)
- USER_UNLINK     rows kept, the user's link removed              (D2: benefactor's designation is the
                                                                   benefactor's data; D3/ECT membership)
- ANONYMISE       rows kept, listed identifier fields unset       (aggregates stay, no longer personal data)
- RETAIN          rows kept unchanged, with legal basis + period  (published retention policy; D6 = 3 y
                                                                   for user-level logs, audit_trail 7 y)
- NO_PII          platform / staff / aggregate collections outside consumer erasure
"""

ESTATE_KEYS = ("estate_id",)

# ---- estate scope ---------------------------------------------------------------------
ESTATE_DELETE = {
    "documents": ESTATE_KEYS,
    "vault_items": ESTATE_KEYS,
    "document_pins": ESTATE_KEYS,
    "checklists": ESTATE_KEYS,
    "checklist_items": ESTATE_KEYS,
    "messages": ESTATE_KEYS,
    "milestone_deliveries": ESTATE_KEYS,
    "milestone_reports": ESTATE_KEYS,
    "death_certificates": ESTATE_KEYS,
    "dts_tasks": ESTATE_KEYS,
    "digital_wallet": ESTATE_KEYS,
    "digital_credentials": ESTATE_KEYS,
    "financial_accounts": ESTATE_KEYS,
    "bills": ESTATE_KEYS,
    "bill_payments": ESTATE_KEYS,
    "bill_categories": ESTATE_KEYS,
    "debts": ESTATE_KEYS,
    "property_assets": ESTATE_KEYS,
    "cfp_entities": ESTATE_KEYS,
    "cfp_entity_relationships": ESTATE_KEYS,
    "cfp_external_people": ESTATE_KEYS,
    "cfp_beneficiary_blocks": ESTATE_KEYS,
    "cfp_chart_layouts": ESTATE_KEYS,
    "emergency_plans": ESTATE_KEYS,
    "emergency_activations": ESTATE_KEYS,
    "emergency_access": ESTATE_KEYS,
    "ccp_plans": ESTATE_KEYS,
    "ccp_risk_profile": ESTATE_KEYS,
    "ccp_household": ESTATE_KEYS,
    "ccp_go_bag": ESTATE_KEYS,
    "ccp_rendezvous": ESTATE_KEYS,
    "ccp_out_of_area": ESTATE_KEYS,
    "ccp_drill_runs": ESTATE_KEYS,
    "ccp_activations": ESTATE_KEYS,
    "ffn_contacts": ESTATE_KEYS,
    "estate_channels": ESTATE_KEYS,
    "estate_messages": ESTATE_KEYS,
    "estate_reactions": ESTATE_KEYS,
    "ega_tasks": ESTATE_KEYS,
    "chat_history": ESTATE_KEYS,
    "beneficiary_concierge_messages": ESTATE_KEYS,
    "edit_history": ESTATE_KEYS,
    "readiness_history": ESTATE_KEYS,
    "activity_log": ESTATE_KEYS,
    "activity_logs": ESTATE_KEYS,
    "cached_pdfs": ESTATE_KEYS,
    "beneficiaries": ESTATE_KEYS,
    "beneficiary_estates": ESTATE_KEYS,
    "family_connections": ESTATE_KEYS,
    "beneficiary_grace_periods": ESTATE_KEYS,
    "beneficiary_display_overrides": ESTATE_KEYS,
    "access_requests": ESTATE_KEYS,
    "section_permissions": ESTATE_KEYS,
    "binder_shares": ESTATE_KEYS,
    "binder_skipped_sections": ESTATE_KEYS,
    "quickstart_progress": ESTATE_KEYS,
    "grace_periods": ESTATE_KEYS,
}
ESTATE_STORAGE_PREFIXES = ("estates/{estate_id}/", "photos/estates/{estate_id}/", "chat/{estate_id}/")

# ---- user scope -----------------------------------------------------------------------
USER_DELETE = {
    "estate_channel_reads": ("user_id",),
    "estate_channel_dismissals": ("user_id",),
    "estate_typing": ("user_id",),
    "estate_messages": ("sender_id",),  # D3: sender-side content goes with the sender
    "chat_history": ("user_id",),
    "beneficiary_concierge_messages": ("user_id",),
    "edit_history": ("user_id",),
    "readiness_history": ("user_id",),
    "activity_log": ("user_id", "actor_id"),
    "latest_pdfs": ("user_id",),
    "pdf_verification_snapshots": ("user_id",),
    "beneficiary_estates": ("user_id",),
    "family_connections": ("benefactor_id", "beneficiary_id"),
    "family_plan_requests": ("benefactor_id", "beneficiary_id"),
    "family_plans": ("user_id", "fpo_user_id"),
    "member_checkins": ("owner_id", "user_id"),
    "dts_tasks": ("owner_id", "user_id"),
    "trustee_grants": ("benefactor_id",),
    "partner_client_notes": ("client_id",),
    "binder_shares": ("user_id",),
    "share_quote_submissions": ("user_id",),
    "section_security": ("user_id",),
    "section_unlock_sessions": ("user_id",),
    "quickstart_progress": ("user_id",),
    "onboarding_progress": ("user_id",),
    "grace_periods": ("user_id",),
    "user_subscriptions": ("user_id",),
    "subscription_overrides": ("user_id",),
    "subscription_intents": ("user_id",),
    "tier_verifications": ("user_id",),
    "lifecycle_events": ("user_id",),
    "referral_codes": ("user_id",),
    "notifications": ("user_id",),
    "notification_preferences": ("user_id",),
    "digest_preferences": ("user_id",),
    "user_preferences": ("user_id",),
    "push_subscriptions": ("user_id",),
    "webauthn_credentials": ("user_id",),
    "webauthn_challenges": ("user_id",),
    "otps": ("user_id",),
    "otp_codes": ("user_id",),
    "otp_trust": ("user_id",),
    "sms_otp_verifications": ("user_id",),
    "export_stepup": ("user_id",),
    "download_tokens": ("user_id",),
    "message_download_tokens": ("user_id",),
    "download_events": ("user_id",),
    "chunked_uploads": ("user_id",),
    "support_conversations": ("user_id",),
    "support_chats": ("user_id",),
    "beta_tickets": ("user_id",),
    "ai_feedback": ("user_id",),
    "guardian_usage": ("user_id",),
    "funnel_events": ("user_id",),
    "user_consent": ("user_id",),
    "client_errors": ("user_id",),
}
# child collections reached through a parent row rather than a user key
USER_DELETE_VIA_PARENT = {
    "support_messages": ("support_conversations", "conversation_id", "id"),
    "support_threads": ("support_conversations", "conversation_id", "id"),
    "share_card_cache": ("share_quote_submissions", "cid", "card_id"),
}
USER_STORAGE_PREFIXES = ("photos/users/{user_id}/", "latest-pdfs/{user_id}/")
CHUNKED_TMP_PREFIX = "chunked-tmp/{upload_id}/"
BLOB_KEY_FIELDS = ("storage_key", "s3_key", "file_key", "thumb_key", "photo_key")

# D2 / membership: keep the row, drop the erased user's link
USER_UNLINK = {
    "beneficiaries": {
        "match": "user_id",
        "set": {"user_id": None, "status": "account_deleted", "invitation_token": None},
    },
    "estates": {"pull": "beneficiaries"},
    "estate_channels": {"pull": "members"},
    "family_plans": {"pull_members": "members"},
    "failed_logins": {"match_email": "email"},
}

# ---- anonymise in place ---------------------------------------------------------------
ANONYMISE = {
    "xai_usage": {"match": ("user_id",), "unset": ("user_id", "session_id")},
    "llm_cost_ledger": {"match": ("user_id", "estate_id"), "unset": ("user_id", "estate_id")},
    "ai_fallback_events": {"match": ("user_id", "estate_id"), "unset": ("user_id", "estate_id")},
    "funnel_sessions": {
        "match": ("converted_user_id",),
        "unset": ("converted_user_id", "ip_address", "demographics", "referral_email"),
    },
    "referral_attributions": {
        "match": ("referrer_user_id", "referred_user_id"),
        "unset": ("referrer_user_id", "referred_user_id"),
    },
    "b2b_codes": {"match": ("user_id",), "unset": ("user_id", "user_email")},
    "founders_circle": {"match": ("user_id", "estate_id"), "unset": ("user_id", "estate_id", "estate_name")},
    "payment_transactions": {"match": ("user_id",), "unset": ("user_id",), "set": {"subject": "erased"}},
    "apple_transactions": {"match": ("user_id",), "unset": ("user_id",), "set": {"subject": "erased"}},
    "purge_records": {"match": ("user_id",), "unset": ("user_id", "original_filename")},
    "deletion_requests": {"match": ("user_id",), "unset": ("user_id", "email", "name"), "set": {"status": "executed"}},
    "consent_audit_log": {"match": ("user_id",), "hash": "user_id"},
    "escalations": {"match": ("created_by",), "unset": ("created_by", "created_by_name")},
}

# ---- retain (published retention policy; D6) -----------------------------------------
RETAIN = {
    "audit_trail": {
        "period_days": 7 * 365,
        "basis": "GDPR Art. 17(3)(e)/6(1)(f); CCPA §1798.105(d)(2); SOC 2 CC7.2 — hash-chained, immutable",
    },
    "security_audit_log": {"period_days": 3 * 365, "basis": "GDPR Art. 17(3)(e)/6(1)(f); CCPA §1798.105(d)(2),(3)"},
    "sensitive_access_log": {"period_days": 3 * 365, "basis": "GDPR Art. 17(3)(e)/6(1)(f); CCPA §1798.105(d)(2),(3)"},
    "phi_access_log": {"period_days": 3 * 365, "basis": "GDPR Art. 17(3)(e)/6(1)(f); CCPA §1798.105(d)(2),(3)"},
    "trustee_audit_events": {"period_days": 3 * 365, "basis": "GDPR Art. 17(3)(e)/6(1)(f); CCPA §1798.105(d)(2)"},
    "admin_audit_log": {"period_days": 3 * 365, "basis": "GDPR Art. 17(3)(e)/6(1)(f); staff accountability"},
    "security_incidents": {"period_days": 7 * 365, "basis": "GDPR Art. 33(5) breach documentation; 17(3)(e)"},
    "consent_audit_log": {
        "period_days": 3 * 365,
        "basis": "GDPR Art. 7(1); 17(3)(e); CCPA Regs §7101(a) — user_id pseudonymised on erasure",
    },
    "deletion_requests": {
        "period_days": 730,
        "basis": "CCPA Regs §7101(a) records of requests; GDPR Art. 5(2) — pseudonymised on erasure",
    },
    "erasure_receipts": {"period_days": 730, "basis": "CCPA Regs §7101(a); GDPR Art. 5(2) — contains hashes only"},
    "payment_transactions": {
        "period_days": 7 * 365,
        "basis": "GDPR Art. 17(3)(b) (26 U.S.C. §6001); CCPA §1798.105(d)(1),(8) — user link anonymised",
    },
    "apple_transactions": {
        "period_days": 7 * 365,
        "basis": "GDPR Art. 17(3)(b); CCPA §1798.105(d)(1),(8) — user link anonymised",
    },
    "apple_webhook_log": {"period_days": 7 * 365, "basis": "GDPR Art. 17(3)(b) — provider transaction ids only"},
    "token_blacklist": {
        "period_days": 1,
        "basis": "GDPR Art. 32 — revoked sessions stay dead until token expiry (TTL)",
    },
    "token_revocations": {"period_days": 1, "basis": "GDPR Art. 32 — revoked sessions stay dead until token expiry"},
    "purge_records": {"period_days": 730, "basis": "GDPR Art. 5(2) proof of destruction — anonymised"},
    "escalations": {"period_days": 3 * 365, "basis": "GDPR Art. 6(1)(f) service quality — user references redacted"},
}

# ---- no personal data / outside consumer erasure --------------------------------------
NO_PII = {
    "admin_settings",
    "app_settings",
    "platform_settings",
    "platform_rules",
    "platform_cache",
    "dev_config",
    "feature_gates",
    "subscription_settings",
    "session_policies",
    "emergency_access_policy",
    "integration_health",
    "integration_overrides",
    "alert_state",
    "scheduler_locks",
    "scheduler_heartbeats",
    "migrations",
    "schema_migrations",
    "audit_chain_state",
    "audit_repair_queue",
    "ai_burn_guard_usage",
    "notification_categories",
    "notification_metrics",
    "queue_alerts",
    "site_assets",
    "partner_brief_content",
    "idempotency_keys",
    "rate_limits",
    "referral_visits",
    "announcements",
    "canned_responses",
    "knowledge_base",
    "training_modules",
    "voices_digest_sends",
    "voices_social_brief_sends",
    "founder_email_prefs",
    "shift_schedules",
    "shift_swap_requests",
    "shift_notes",
    "team_channels",
    "team_channel_reads",
    "team_messages",
    "training_completions",
    "ip_whitelist",
    "partner_managers",
    "b2b_partners",
    "partner_brief_leads",
    "partner_brief_try_attempts",
    "founder_access_requests",
    "founder_invites",
    "users",
    "estates",
}

# keys whose presence marks a collection as personal-data bearing (drift guard)
PERSONAL_KEYS = (
    "user_id",
    "estate_id",
    "email",
    "owner_id",
    "benefactor_id",
    "beneficiary_id",
    "actor_id",
    "sender_id",
    "client_id",
)


def covered_collections() -> set:
    return (
        set(ESTATE_DELETE)
        | set(USER_DELETE)
        | set(USER_DELETE_VIA_PARENT)
        | set(USER_UNLINK)
        | set(ANONYMISE)
        | set(RETAIN)
        | NO_PII
    )
