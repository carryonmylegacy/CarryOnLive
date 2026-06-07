"""CarryOn™ — Database Indexes & Migrations

Extracted from server.py for maintainability.
All MongoDB index definitions and one-time data migrations live here.
"""

import random


async def run_migrations(db, logger):
    """Run one-time data migrations (idempotent — tracked in db.migrations)."""
    try:
        migration_done = await db.migrations.find_one({"_id": "username_migration_v1"})
        if not migration_done:
            import re as _re

            users_to_migrate = await db.users.find(
                {"$or": [{"username": {"$regex": "@"}}, {"username": {"$exists": False}}, {"username": None}]},
                {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1, "username": 1},
            ).to_list(10000)
            migrated_count = 0
            for u in users_to_migrate:
                first = u.get("first_name", "")
                last = u.get("last_name", "")
                clean_first = _re.sub(r"[^a-zA-Z0-9]", "", first).lower()
                clean_last = _re.sub(r"[^a-zA-Z0-9]", "", last).lower()
                base = clean_first + clean_last
                if len(base) < 3:
                    base = "user" + str(random.randint(1000, 9999))
                candidate = base
                suffix = 2
                while True:
                    exists = await db.users.find_one(
                        {"username_lower": candidate, "id": {"$ne": u["id"]}},
                        {"_id": 0, "id": 1},
                    )
                    if not exists:
                        break
                    candidate = f"{base}{suffix}"
                    suffix += 1
                await db.users.update_one(
                    {"id": u["id"]},
                    {"$set": {"username": candidate, "username_lower": candidate, "needs_username_review": True}},
                )
                migrated_count += 1
            await db.migrations.insert_one({"_id": "username_migration_v1", "migrated": migrated_count})
            logger.info(f"Username migration complete: {migrated_count} users migrated")
    except Exception as e:
        logger.warning(f"Username migration warning: {e}")

    # ── CFP fail-closed designation migration (Jun 5, 2026) ──────────────────
    # Financial items historically defaulted to designated_beneficiaries=["all"]
    # (a silent model default, NOT an explicit benefactor decree). Product rule
    # is now: financial items are shared ONLY with beneficiaries the benefactor
    # explicitly designates (now or posthumously). Convert legacy blanket
    # ["all"] rows to [] (private until decreed). Owner/admin always retain full
    # visibility; this only changes what BENEFICIARIES can see. Idempotent.
    try:
        migration_done = await db.migrations.find_one({"_id": "cfp_failclosed_designation_v1"})
        if not migration_done:
            total = 0
            for coll in ("bills", "debts", "financial_accounts", "property_assets"):
                res = await db[coll].update_many(
                    {"designated_beneficiaries": ["all"]},
                    {"$set": {"designated_beneficiaries": []}},
                )
                total += res.modified_count
            await db.migrations.insert_one({"_id": "cfp_failclosed_designation_v1", "rows_made_private": total})
            logger.info(
                f"CFP fail-closed migration complete: {total} financial items reset to "
                "private (benefactor must re-designate to share)."
            )
    except Exception as e:
        logger.warning(f"CFP fail-closed migration warning: {e}")

    # ── DAV legacy plaintext additional_access sweep (audit #1798 P2) ─────────
    # Older DAV rows stored 2FA/PIN/backup-code context in PLAINTEXT
    # `additional_access`. New writes encrypt into `encrypted_additional` and
    # null the plaintext field. Sweep legacy rows: encrypt where the estate salt
    # is available (preserving the data), else clear, so no plaintext secret
    # lingers at rest. Idempotent (tracked in db.migrations).
    try:
        migration_done = await db.migrations.find_one({"_id": "dav_plaintext_additional_sweep_v1"})
        if not migration_done:
            from services.encryption import encrypt_field, get_estate_salt

            legacy = await db.digital_wallet.find(
                {"additional_access": {"$nin": [None, ""]}},
                {"_id": 0, "id": 1, "estate_id": 1, "additional_access": 1, "encrypted_additional": 1},
            ).to_list(10000)
            encrypted_n = 0
            cleared_n = 0
            _salt_cache = {}
            for row in legacy:
                eid = row.get("estate_id")
                set_doc = {"additional_access": None}
                if eid and not row.get("encrypted_additional"):
                    try:
                        if eid not in _salt_cache:
                            _salt_cache[eid] = await get_estate_salt(eid)
                        set_doc["encrypted_additional"] = encrypt_field(row["additional_access"], _salt_cache[eid])
                        encrypted_n += 1
                    except Exception:
                        cleared_n += 1  # salt unavailable — clear rather than retain plaintext
                else:
                    cleared_n += 1
                await db.digital_wallet.update_one({"id": row["id"]}, {"$set": set_doc})
            await db.migrations.insert_one(
                {"_id": "dav_plaintext_additional_sweep_v1", "encrypted": encrypted_n, "cleared": cleared_n}
            )
            logger.info(f"DAV plaintext additional_access sweep: encrypted={encrypted_n} cleared={cleared_n}")
    except Exception as e:
        logger.warning(f"DAV plaintext additional_access sweep warning: {e}")


async def ensure_indexes(db, logger):
    """Create all security-critical and performance database indexes."""
    try:
        # Email is no longer unique — multiple users can share an email
        # Drop the old unique email index if it exists, replace with non-unique
        try:
            await db.users.drop_index("email_1")
        except Exception:
            pass
        await db.users.create_index("email")
        await db.users.create_index("id", unique=True)
        # Username is the unique login identifier
        await db.users.create_index("username_lower", unique=True, sparse=True)
        await db.estates.create_index("owner_id")
        await db.documents.create_index("estate_id")
        await db.messages.create_index("estate_id")
        # Apr 29, 2026 — compound index for the per-estate chronological scan
        # used by GET /api/messages/{estate_id}. Health-check showed this
        # endpoint at 511ms avg (slowest in the fleet); compound covers the
        # filter + sort in a single index lookup.
        await db.messages.create_index([("estate_id", 1), ("created_at", -1)])
        await db.documents.create_index([("estate_id", 1), ("created_at", -1)])
        await db.beneficiaries.create_index("estate_id")
        await db.beneficiaries.create_index("user_id")
        await db.beneficiary_display_overrides.create_index([("user_id", 1), ("estate_id", 1)])
        await db.estates.create_index("beneficiaries")
        await db.checklists.create_index("estate_id")
        await db.chat_history.create_index([("user_id", 1), ("session_id", 1)])
        # audit #1798 P1 — estate-scoped Guardian history retrieval. Cross-session
        # context + same-session load now filter by user_id + estate_id + session,
        # sorted by created_at; this compound index covers all three.
        await db.chat_history.create_index([("user_id", 1), ("estate_id", 1), ("session_id", 1), ("created_at", 1)])
        await db.token_blacklist.create_index("expires_at", expireAfterSeconds=0)
        await db.token_blacklist.create_index("jti")
        # Universal download tokens — TTL auto-expire 5 min after creation.
        # `expires_at` is a real BSON datetime; TTL_SECONDS lives in the service.
        await db.download_tokens.create_index("token", unique=True)
        await db.download_tokens.create_index("expires_at", expireAfterSeconds=300)
        # Message direct-download tokens (iOS Safari) — Mongo-backed, TTL 5 min.
        await db.message_download_tokens.create_index("token", unique=True)
        await db.message_download_tokens.create_index("expires_at", expireAfterSeconds=300)
        # Per-user offline document pins (audit P2.1) — one pin row per user+doc.
        await db.document_pins.create_index([("user_id", 1), ("document_id", 1)], unique=True)
        await db.document_pins.create_index("estate_id")
        await db.otps.create_index("user_id")
        await db.failed_logins.create_index("email")
        # Drop conflicting old indexes if they exist, then recreate with unique=True
        try:
            await db.otp_trust.drop_index("user_id_1_ip_address_1")
        except Exception:
            pass
        try:
            await db.otp_trust.drop_index("otp_trust_user_ip_unique")
        except Exception:
            pass
        await db.otp_trust.create_index([("user_id", 1), ("ip_address", 1)], unique=True)
        await db.security_audit_log.create_index("user_id")
        await db.security_audit_log.create_index("created_at")
        await db.sensitive_access_log.create_index("user_id")
        await db.sensitive_access_log.create_index("timestamp")
        await db.consent_audit_log.create_index("user_id")
        await db.deletion_requests.create_index("user_id")
        await db.security_incidents.create_index("created_at")
        await db.user_consent.create_index("user_id", unique=True)
        await db.section_unlock_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.section_unlock_sessions.create_index([("user_id", 1), ("section_id", 1)])
        await db.apple_transactions.create_index("transaction_id", unique=True)
        await db.apple_webhook_log.create_index("received_at")
        await db.client_errors.create_index("created_at")
        await db.audit_trail.create_index([("timestamp", -1)])
        await db.audit_trail.create_index("actor_id")
        await db.audit_trail.create_index("category")
        # Non-unique lookup index for chain verification / head re-sync. Cross-pod
        # append serialization is handled by a compare-and-swap on the single
        # `audit_chain_state` head document (see services/audit.py), which works
        # regardless of any historical fork — so NO unique index on prev_hash is
        # required and the prior fatal "index MISSING" startup alarm is removed
        # (audit 512bd5c follow-up — production audit_trail held a historical fork).
        await db.audit_trail.create_index("prev_hash")
        # The head pointer is a singleton; a unique key guarantees exactly one head
        # and makes concurrent first-time initialization across pods safe.
        await db.audit_chain_state.create_index("key", unique=True, name="chain_head_key")
        # audit 512bd5c F-18-06 — index the repair queue so reconciliation /
        # admin evidence queries are fast and ordered.
        await db.audit_repair_queue.create_index([("queued_at", 1)])
        await db.audit_repair_queue.create_index("reason")
        await db.audit_repair_queue.create_index("action")
        await db.audit_repair_queue.create_index("resource_id")
        # Performance indexes for frequently-queried collections
        await db.user_subscriptions.create_index("user_id")
        await db.user_subscriptions.create_index("status")
        await db.user_subscriptions.create_index([("status", 1), ("grace_period_end", 1)])
        await db.dts_tasks.create_index("estate_id")
        await db.dts_tasks.create_index("assigned_to")
        await db.death_certificates.create_index("estate_id")
        await db.death_certificates.create_index("beneficiary_id")
        await db.death_certificates.create_index("status")
        await db.tier_verifications.create_index("user_id")
        await db.family_plans.create_index("owner_id")
        await db.emergency_access.create_index("estate_id")
        await db.emergency_access.create_index("beneficiary_id")
        await db.emergency_access.create_index(
            [("estate_id", 1), ("requester_id", 1), ("status", 1), ("access_expires_at", 1)]
        )
        await db.section_security.create_index("estate_id")
        await db.digital_wallet.create_index("estate_id")
        await db.activity_log.create_index("user_id")
        await db.notifications.create_index("user_id")
        await db.notifications.create_index([("user_id", 1), ("read", 1)])
        # SOC 2: audit-log retention. The compliance policy + admin security
        # scan advertise a 7-YEAR retention window; the TTL must match the
        # claim (a shorter TTL would silently delete compliance evidence and
        # make the documented policy false). Drop-and-recreate so a changed
        # expireAfterSeconds takes effect even when an older 1-year index
        # ("stored_at_1") already exists in the database.
        AUDIT_TTL_SECONDS = 7 * 365 * 24 * 3600  # 7 years
        try:
            await db.audit_trail.create_index("stored_at", expireAfterSeconds=AUDIT_TTL_SECONDS, name="stored_at_ttl")
        except Exception:
            for stale in ("stored_at_1", "stored_at_ttl"):
                try:
                    await db.audit_trail.drop_index(stale)
                except Exception:
                    pass
            await db.audit_trail.create_index("stored_at", expireAfterSeconds=AUDIT_TTL_SECONDS, name="stored_at_ttl")
        await db.audit_trail.create_index("timestamp")
        await db.audit_trail.create_index("actor_id")
        await db.audit_trail.create_index("category")
        # Team chat indexes
        await db.team_messages.create_index([("channel_id", 1), ("created_at", -1)])
        await db.team_messages.create_index("sender_id")
        await db.team_channels.create_index("members")
        await db.team_channel_reads.create_index([("channel_id", 1), ("user_id", 1)], unique=True)
        # Shift scheduling indexes
        await db.shift_schedules.create_index([("operator_id", 1), ("date", 1)])
        await db.shift_schedules.create_index("date")
        await db.shift_swap_requests.create_index("status")
        await db.shift_swap_requests.create_index("requester_id")
        await db.shift_swap_requests.create_index("target_operator_id")
        # Training tracker indexes
        await db.training_completions.create_index([("user_id", 1), ("module_id", 1)], unique=True)
        await db.training_modules.create_index("order")
        # Estate Chat (ECT) indexes
        await db.estate_channels.create_index("estate_id")
        await db.estate_channels.create_index("members")
        await db.estate_messages.create_index([("channel_id", 1), ("created_at", -1)])
        await db.estate_channel_reads.create_index([("channel_id", 1), ("user_id", 1)], unique=True)
        await db.estate_typing.create_index([("channel_id", 1), ("user_id", 1)], unique=True)
        await db.estate_reactions.create_index("message_id")
        await db.estate_channel_dismissals.create_index([("user_id", 1), ("channel_id", 1)], unique=True)
        # CCP (Connected Protocol) indexes
        await db.emergency_plans.create_index("estate_id")
        await db.emergency_plans.create_index("share_token", sparse=True)
        await db.emergency_activations.create_index([("estate_id", 1), ("status", 1)])
        await db.emergency_activations.create_index([("estate_id", 1), ("is_drill", 1), ("status", 1)])
        await db.member_checkins.create_index([("activation_id", 1), ("user_id", 1)])
        # Notification preferences indexes
        await db.notification_preferences.create_index("user_id", unique=True)
        await db.notification_categories.create_index("order")
        # Download token indexes
        await db.download_tokens.create_index("token", unique=True)
        await db.download_tokens.create_index("created_at")
        # Push subscription indexes (queried on every push send)
        await db.push_subscriptions.create_index([("user_id", 1), ("active", 1)])
        await db.push_subscriptions.create_index("endpoint", unique=True)
        # Support messages indexes
        await db.support_messages.create_index("conversation_id")
        await db.support_messages.create_index([("sender_role", 1), ("read", 1)])
        # Milestone delivery indexes
        await db.milestone_deliveries.create_index("status")
        await db.milestone_deliveries.create_index("estate_id")
        # Subscription overrides index (queried on every checkout/plan check)
        await db.subscription_overrides.create_index("user_id")
        # Onboarding progress index
        await db.onboarding_progress.create_index("user_id")
        # FFN contacts index
        await db.ffn_contacts.create_index([("estate_id", 1), ("deleted_at", 1)])
        # Funnel session indexes
        await db.funnel_sessions.create_index("session_id", unique=True)
        # Beneficiary grace periods index
        await db.beneficiary_grace_periods.create_index("beneficiary_id")
        # Subscription settings index
        await db.subscription_settings.create_index("key", unique=True)
        await db.ai_burn_guard_usage.create_index([("user_id", 1), ("feature", 1), ("date", 1)])
        # One-time idempotent grandfather for the email_verified authorization
        # gate (resolve_estate_actor). Existing accounts predate the flag but
        # were all created through the signup-email-OTP flow, so they are
        # effectively verified — stamp the flag so the new gate does not lock
        # them out. New rows are created without it and only become True on a
        # genuine OTP success (verify_otp).
        await db.users.update_many(
            {"email_verified": {"$exists": False}},
            {"$set": {"email_verified": True}},
        )
        # Financial Portal (CFP) indexes
        await db.bills.create_index([("estate_id", 1), ("deleted_at", 1)])
        await db.bills.create_index("status")
        await db.debts.create_index([("estate_id", 1), ("deleted_at", 1)])
        await db.financial_accounts.create_index([("estate_id", 1), ("deleted_at", 1)])
        await db.bill_categories.create_index([("estate_id", 1), ("module", 1)])
        await db.bill_payments.create_index([("bill_id", 1), ("deleted_at", 1)])
        # Property Assets indexes
        await db.property_assets.create_index([("estate_id", 1), ("deleted_at", 1)])
        await db.property_assets.create_index("status")
        # Compound indexes for frequently-used multi-field queries
        await db.user_subscriptions.create_index([("user_id", 1), ("status", 1)])
        await db.section_permissions.create_index([("beneficiary_id", 1), ("estate_id", 1)])
        await db.beneficiaries.create_index([("estate_id", 1), ("user_id", 1)])
        await db.family_plans.create_index([("fpo_user_id", 1), ("status", 1)])
        await db.lifecycle_events.create_index([("user_id", 1), ("event", 1)])
        await db.emergency_plans.create_index([("estate_id", 1), ("deleted_at", 1)])
        await db.messages.create_index([("estate_id", 1), ("deleted_at", 1)])
        logger.info("Database indexes created/verified")
    except Exception as e:
        logger.warning(f"Index creation warning (may already exist): {e}")
