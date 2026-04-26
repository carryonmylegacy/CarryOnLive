"""Shared changelog helper used by /api/changelog/since and the weekly digest."""

from typing import List, Optional

from config import db


# Collections we surface and the field used to label the change.
WATCHED_COLLECTIONS = [
    ("bills", "name", "Bill"),
    ("debts", "name", "Debt"),
    ("financial_accounts", "name", "Account"),
    ("property_assets", "name", "Asset"),
    ("documents", "title", "Document"),
    ("checklists", "title", "Checklist"),
    ("messages", "subject", "Message"),
    ("ccp_records", "title", "Care Protocol"),
    ("dts_tasks", "title", "Task"),
]


async def gather_changes_since(
    estate_ids: List[str],
    since: str,
    limit: int = 50,
) -> List[dict]:
    """Return a flat, time-sorted list of change events newer than `since`
    across every collection the user can see. Empty input → empty output."""
    if not estate_ids:
        return []
    events: List[dict] = []
    for coll, label_field, kind in WATCHED_COLLECTIONS:
        rows = (
            await db[coll]
            .find(
                {
                    "estate_id": {"$in": estate_ids},
                    "deleted_at": None,
                    "$or": [
                        {"updated_at": {"$gt": since}},
                        {"created_at": {"$gt": since}},
                    ],
                },
                {"_id": 0, "id": 1, label_field: 1, "estate_id": 1, "updated_at": 1, "created_at": 1},
            )
            .limit(100)
            .to_list(100)
        )
        for r in rows:
            ts = r.get("updated_at") or r.get("created_at")
            if not ts:
                continue
            created = r.get("created_at")
            updated = r.get("updated_at")
            action = "created" if (created and (not updated or updated == created)) else "updated"
            events.append(
                {
                    "id": r.get("id"),
                    "kind": kind,
                    "collection": coll,
                    "label": r.get(label_field) or "(untitled)",
                    "estate_id": r.get("estate_id"),
                    "action": action,
                    "at": ts,
                }
            )
    events.sort(key=lambda e: e["at"], reverse=True)
    return events[:limit]


def build_changes_email_html(events: List[dict]) -> Optional[str]:
    """Build an Outlook-safe HTML block summarizing recent changes.
    Returns None if there are no events (caller should skip rendering)."""
    if not events:
        return None
    rows = ""
    for e in events[:8]:
        rows += f"""
        <tr><td style="padding:6px 0;border-bottom:1px solid #1a2744;">
          <span style="color:#d4af37;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">{e["kind"]}</span>
          <span style="color:#f8fafc;font-size:12px;margin-left:6px;">{e["label"][:60]}</span>
          <span style="color:#64748b;font-size:11px;margin-left:4px;">{e["action"]}</span>
        </td></tr>"""
    return f"""<tr><td style="padding:0 28px 16px 28px;">
  <div style="background:#0c1628;border-radius:12px;border:1px solid #1e293b;padding:14px 16px;">
    <p style="margin:0 0 10px 0;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;">What changed this week ({len(events)})</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table>
  </div>
</td></tr>"""
