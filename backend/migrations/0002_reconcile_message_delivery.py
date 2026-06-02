"""0002_reconcile_message_delivery — backfill per-recipient delivery state.

Legacy milestone deliveries set a single global ``is_delivered=True`` on the
message even when it had multiple recipients, which let a co-recipient read a
message before THEIR milestone arrived. The hardened model
(services.access_control.build_message_delivery_update) keeps delivery as a
per-(message, recipient) fact, but historical rows predate it.

This migration reconstructs per-recipient truth from the milestone_deliveries
audit trail:

  * Immediate / non-milestone messages were delivered to every named recipient
    at once — backfill ``delivered_recipient_ids = recipients`` and keep
    ``is_delivered``.
  * Milestone messages — collect the recipients that actually had an approved
    delivery. If every intended recipient is covered, keep ``is_delivered``; if
    not, DROP the global flag so the per-recipient gate
    (message_delivered_to_actor) governs and the uncovered recipients are hidden
    until their own milestone is approved.

Idempotent: only touches messages that lack the new ``delivery_state`` field,
so re-running is a no-op.
"""

from __future__ import annotations

MILESTONE_TRIGGERS = {"event", "age_milestone", "specific_date"}


def _ids(values) -> set[str]:
    out: set[str] = set()
    for value in values or []:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            out.add(text)
    return out


async def up(db) -> None:
    cursor = db.messages.find(
        {"is_delivered": True, "delivery_state": {"$exists": False}},
        {"_id": 0, "id": 1, "recipients": 1, "trigger_type": 1},
    )
    async for msg in cursor:
        message_id = msg.get("id")
        if not message_id:
            continue
        recipients = _ids(msg.get("recipients"))
        trigger_type = (msg.get("trigger_type") or "").strip()

        if trigger_type not in MILESTONE_TRIGGERS:
            # Immediate / non-milestone messages were delivered to all named
            # recipients simultaneously at creation time.
            delivered = set(recipients)
        else:
            delivered = set()
            deliveries = await db.milestone_deliveries.find(
                {
                    "message_id": message_id,
                    "status": {"$in": ["approved", "delivered", "auto_approved"]},
                },
                {"_id": 0, "beneficiary_id": 1, "beneficiary_record_ids": 1},
            ).to_list(200)
            for delivery in deliveries:
                delivered |= _ids([delivery.get("beneficiary_id")])
                delivered |= _ids(delivery.get("beneficiary_record_ids"))
                # Resolve the beneficiary's other identifiers so the delivered
                # set lines up with however recipients were stored on the message
                # (record-id vs user-id vs email).
                ben_id = delivery.get("beneficiary_id")
                if ben_id:
                    records = await db.beneficiaries.find(
                        {"$or": [{"id": ben_id}, {"user_id": ben_id}]},
                        {"_id": 0, "id": 1, "user_id": 1, "email": 1},
                    ).to_list(20)
                    for record in records:
                        email = (record.get("email") or "").strip().lower() or None
                        delivered |= _ids([record.get("id"), record.get("user_id"), email])

        all_covered = bool(recipients) and recipients.issubset(delivered)
        update: dict = {
            "delivered_recipient_ids": sorted(delivered),
            "delivery_state": "delivered" if all_covered else "partial",
        }
        if not all_covered:
            # Cannot prove every named recipient was delivered — drop the global
            # flag so the per-recipient gate hides the uncovered recipients.
            update["is_delivered"] = False
        await db.messages.update_one({"id": message_id}, {"$set": update})
